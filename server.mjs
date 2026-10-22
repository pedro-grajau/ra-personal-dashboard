import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeGames, gameStatus, playedGames } from './lib/games.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = root + '.data/';
await mkdir(dataDir, { recursive: true });
async function readJSON(file, fallback) { try { return JSON.parse(await readFile(dataDir + file, 'utf8')); } catch { return fallback; } }
let settings = await readJSON('settings.json', { username: process.env.RETRO_ACHIEVEMENTS_USERNAME || 'MaiorDeTodasAsBocas', overrides: {} });
let metadata = await readJSON('metadata.json', {});
let dashboard = await readJSON('dashboard.json', null);
let sync = { running: false, phase: '', current: 0, total: 0, error: null };
const key = process.env.RETRO_ACHIEVEMENTS_KEY;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ra(endpoint, params) {
  if (!key) throw new Error('Configure RETRO_ACHIEVEMENTS_KEY no .env e reinicie o servidor.');
  const url = new URL(`https://retroachievements.org/API/API_${endpoint}.php`);
  url.search = new URLSearchParams({ y: key, ...params });
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error('Não foi possível conectar ao RetroAchievements. Verifique a conexão e tente novamente.'); }
  if (!response.ok) throw new Error(response.status === 429 ? 'Limite da API atingido. Aguarde alguns minutos antes de sincronizar.' : `RetroAchievements respondeu com erro ${response.status}. Confira o token e o perfil.`);
  let result;
  try { result = await response.json(); } catch { throw new Error('A API retornou uma resposta inválida. Tente novamente mais tarde.'); }
  if (result?.Success === false || result?.Error) throw new Error('A API não conseguiu consultar este perfil. Confira o nome e o token.');
  return result;
}
async function paginate(endpoint, username, size, select) {
  const result = [];
  for (let offset = 0; ; offset += size) {
    const page = await ra(endpoint, { u: username, c: size, o: offset });
    const rows = select(page);
    if (!Array.isArray(rows)) throw new Error('Formato inesperado na lista de jogos.');
    result.push(...rows);
    if (rows.length < size || (page.Total !== undefined && result.length >= page.Total)) break;
    await pause(400);
  }
  return result;
}
async function synchronize() {
  if (sync.running) return;
  sync = { running: true, phase: 'Buscando seu perfil', current: 0, total: 0, error: null };
  try {
    const username = settings.username;
    const profile = await ra('GetUserProfile', { u: username });
    if (!profile.User) throw new Error('Perfil não encontrado. Confira seu nome de usuário.');
    sync.phase = 'Reunindo sua biblioteca';
    const progress = await paginate('GetUserCompletionProgress', username, 500, page => page.Results);
    const recent = await paginate('GetUserRecentlyPlayedGames', username, 50, page => page);
    const awards = await ra('GetUserAwards', { u: username });
    const games = normalizeGames(progress, recent, awards.VisibleUserAwards);
    dashboard = { username, profile: { name: profile.User, avatar: profile.UserPic, motto: profile.Motto, memberSince: profile.MemberSince }, games, updatedAt: new Date().toISOString() };
    await writeFile(dataDir + 'dashboard.json', JSON.stringify(dashboard));
    sync.phase = 'Carregando capas e categorias';
    sync.total = games.length;
    for (const game of games) {
      const cached = metadata[game.id];
      if (!cached || Date.now() - cached.cachedAt > 30 * 86400000) {
        await pause(500);
        const detail = await ra('GetGame', { i: game.id });
        metadata[game.id] = { genre: detail.Genre || '', boxArt: detail.ImageBoxArt, developer: detail.Developer, released: detail.Released, cachedAt: Date.now() };
        if (sync.current % 10 === 0) await writeFile(dataDir + 'metadata.json', JSON.stringify(metadata));
      }
      sync.current++;
    }
    await writeFile(dataDir + 'metadata.json', JSON.stringify(metadata));
    sync.phase = 'Tudo atualizado';
  } catch (error) { sync.error = error.message; sync.phase = 'Sincronização interrompida'; }
  finally {
    try { await writeFile(dataDir + 'metadata.json', JSON.stringify(metadata)); }
    catch { sync.error = 'Não foi possível salvar o cache de detalhes no computador.'; }
    sync.running = false;
  }
}
function payload() {
  const matching = dashboard?.username.toLowerCase() === settings.username.toLowerCase();
  return { configured: Boolean(key), username: settings.username, sync, ...(matching ? { ...dashboard, games: playedGames(dashboard.games).map(g => gameStatus({ ...g, ...metadata[g.id] }, settings.overrides?.[settings.username.toLowerCase()]?.[g.id])) } : { games: [] }) };
}
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function body(request) {
  let value = '';
  for await (const chunk of request) { value += chunk; if (value.length > 10000) throw new Error('Requisição muito grande.'); }
  return JSON.parse(value || '{}');
}
const publicFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
const server = http.createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/api/dashboard') return json(response, 200, payload());
    if (request.method === 'POST') {
      // Only our local page can mutate settings. Reject cross-origin browser requests.
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return json(response, 403, { error: 'Origem não permitida.' });
      if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: 'Use JSON.' });
      if (path === '/api/sync') {
        if (sync.running) return json(response, 202, { running: true });
        if (dashboard?.username === settings.username && Date.now() - Date.parse(dashboard.updatedAt) < 60000) return json(response, 200, { running: false });
        void synchronize(); return json(response, 202, { running: true });
      }
      if (path === '/api/settings') {
        if (sync.running) return json(response, 409, { error: 'Aguarde a sincronização terminar para trocar o perfil.' });
        const { username } = await body(request);
        if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(username)) return json(response, 400, { error: 'Informe um nome de usuário válido.' });
        settings.username = username;
        await writeFile(dataDir + 'settings.json', JSON.stringify(settings));
        void synchronize(); return json(response, 200, { ok: true });
      }
      if (path === '/api/game') {
        const { id, genre, beaten } = await body(request);
        if (!dashboard?.games.some(g => g.id === Number(id)) || dashboard.username !== settings.username) return json(response, 400, { error: 'Jogo não encontrado.' });
        if ((genre !== undefined && (typeof genre !== 'string' || genre.length > 100)) || (beaten !== undefined && beaten !== null && typeof beaten !== 'boolean')) return json(response, 400, { error: 'Dados inválidos.' });
        settings.overrides ??= {};
        const overrides = settings.overrides[settings.username.toLowerCase()] ??= {};
        const entry = overrides[id] ??= {};
        if (genre !== undefined) { if (genre.trim()) entry.genre = genre.trim(); else delete entry.genre; }
        if (beaten === null) delete entry.beaten;
        else if (beaten !== undefined) entry.beaten = beaten;
        await writeFile(dataDir + 'settings.json', JSON.stringify(settings));
        return json(response, 200, { ok: true });
      }
    }
    const file = publicFiles[path];
    if (request.method === 'GET' && file) { response.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); response.end(await readFile(root + 'public/' + file[0])); return; }
    json(response, 404, { error: 'Não encontrado.' });
  } catch { json(response, 500, { error: 'Não foi possível salvar ou carregar os dados.' }); }
});
const port = Number(process.env.PORT) || 3000;
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso.\nSe o RetroVault já estiver aberto, acesse http://localhost:${port}.\nPara reiniciar, encerre o servidor anterior com Ctrl+C e execute npm start novamente.\nPara usar outra porta, execute: PORT=3001 npm start`);
  } else if (['EACCES', 'EPERM'].includes(error.code)) {
    console.error(`Sem permissão para iniciar o servidor local na porta ${port}. Verifique as permissões do ambiente ou tente: PORT=3001 npm start`);
  } else {
    console.error(`Não foi possível iniciar o RetroVault (${error.code || 'erro desconhecido'}).`);
  }
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`RetroVault disponível em http://localhost:${server.address().port}`));
