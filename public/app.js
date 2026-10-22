const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const image = path => /^\/(Images|UserPic)\/[a-zA-Z0-9_.-]+$/.test(path || '') ? `https://media.retroachievements.org${path}` : '';
const number = value => new Intl.NumberFormat('pt-BR').format(value);
const date = value => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const categories = game => [...new Set((game.genre || '').split(/[,;]/).map(s => s.trim()).filter(Boolean))];
let data = { games: [], sync: {} }, view = 'overview', status = 'all', page = 1, list = false, pending = false;
let dialogId = null;
const titles = { overview: ['Minha jornada', 'As aventuras que você viveu. As conquistas que ficaram.'], library: ['Minha biblioteca', 'Cada jogo tem seu lugar na sua história.'], beaten: ['Jogos zerados', 'Fim da campanha. Começo de uma boa memória.'], complete: ['Coleção 100%', 'Completos e masterizados: nenhuma conquista ficou para trás.'], consoles: ['Seus consoles', 'Uma viagem pelas plataformas da sua coleção.'], genres: ['Suas categorias', 'Descubra os estilos que mais fazem parte da sua jornada.'] };
const labels = { overview: 'Visão geral', library: 'Minha biblioteca', beaten: 'Jogos zerados', complete: 'Coleção 100%', consoles: 'Consoles', genres: 'Categorias' };
try { document.body.dataset.accent = localStorage.getItem('retrovault-accent') || 'purple'; } catch {}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível completar a ação.');
  return result;
}
function notify(message, error = false) { $('#sync-status').hidden = false; $('#sync-status').classList.toggle('error', error); $('#sync-status').textContent = message; }
async function load() {
  try { data = await api('/api/dashboard'); render(); }
  catch (error) { notify(error.message, true); }
}
async function synchronize() {
  pending = true; $('#sync-button').disabled = true;
  try { await api('/api/sync', {}); await load(); }
  catch (error) { notify(error.message, true); }
  finally { pending = false; $('#sync-button').disabled = Boolean(data.sync.running); }
}
function group(field) {
  const result = new Map();
  for (const g of data.games) {
    const keys = field === 'genre' ? (categories(g).length ? categories(g) : ['Sem categoria']) : [g[field]];
    for (const key of keys) result.set(key, (result.get(key) || 0) + 1);
  }
  return [...result].sort((a, b) => b[1] - a[1]);
}
function renderChart(field, element, expanded = false) {
  const groups = group(field), max = Math.max(...groups.map(g => g[1]), 1);
  $(element).innerHTML = groups.length ? groups.slice(0, expanded ? groups.length : 5).map(([name, count]) => `<div class="chart-row"><button data-group="${field}" data-value="${escape(name)}" title="Ver jogos de ${escape(name)}">${escape(name)}</button><div class="chart-track"><i style="width:${count / max * 100}%"></i></div><span>${count}</span></div>`).join('') : '<p class="muted">Suas estatísticas aparecerão após a sincronização.</p>';
}
function options(selector, values, placeholder) {
  const current = $(selector).value;
  $(selector).innerHTML = `<option value="">${placeholder}</option>` + values.sort((a,b) => a.localeCompare(b, 'pt-BR')).map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('');
  if (values.includes(current)) $(selector).value = current;
}
function stat(label, value, icon, note, color = '') { return `<article class="stat ${color}"><div class="stat-icon">${icon}</div><div class="stat-label">${label}</div><div class="stat-value">${number(value)}</div><div class="stat-note">${note}</div></article>`; }
function render() {
  const games = data.games, beaten = games.filter(g => g.beaten).length, complete = games.filter(g => g.complete).length, mastered = games.filter(g => g.mastered).length;
  $('#stats').innerHTML = stat('Jogos jogados', games.length, '▦', 'Com conquistas · todos os modos') + stat('Jogos zerados', beaten, '⚑', `<b>${games.length ? Math.round(beaten / games.length * 100) : 0}%</b> da sua biblioteca`, 'green') + stat('Completos / masterizados', complete, '✦', `<b>${mastered}</b> masterizados · ${complete - mastered} completos`, 'gold') + stat('Consoles explorados', new Set(games.map(g => g.consoleId)).size, '▣', 'Diferentes mundos para descobrir');
  $('#nav-count').textContent = games.length;
  $('#username').textContent = data.profile?.name || data.username || '';
  $('#profile-caption').textContent = data.profile?.memberSince ? `Colecionando histórias desde ${date(data.profile.memberSince.replace(' ', 'T') + 'Z')}` : 'Sua coleção de memórias, em um só lugar.';
  for (const selector of ['#avatar', '#avatar-small']) {
    const src = image(data.profile?.avatar);
    $(selector).innerHTML = src ? `<img src="${src}" alt="Avatar de ${escape(data.profile.name)}">` : escape((data.username || 'M')[0]);
  }
  $('#updated').textContent = data.updatedAt ? `Última sincronização · ${date(data.updatedAt)} ${new Date(data.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Sua biblioteca está esperando por você.';
  $('#sync-button').disabled = Boolean(data.sync.running || pending);
  $('.connection').innerHTML = `<i style="background:${data.configured ? 'var(--green)' : '#e9c472'}"></i> ${data.configured ? 'API configurada · servidor local' : 'Configure seu token no .env'}`;
  if (data.sync.running) notify(`${data.sync.phase}${data.sync.total ? ` · ${data.sync.current}/${data.sync.total} jogos` : '…'} Você pode explorar a biblioteca enquanto carregamos os detalhes.`);
  else if (data.sync.error) notify(data.sync.error, true);
  else $('#sync-status').hidden = true;
  options('#console-filter', [...new Set(games.map(g => g.console))], 'Todos os consoles');
  options('#genre-filter', [...new Set(games.flatMap(g => categories(g).length ? categories(g) : ['Sem categoria']))], 'Todas as categorias');
  renderChart('console', '#console-chart', view === 'consoles');
  renderChart('genre', '#genre-chart', view === 'genres');
  const missing = games.filter(g => !g.genre).length;
  $('#genre-note').textContent = (missing ? `${missing} de ${games.length} jogos sem categoria. ` : '') + 'Um jogo pode aparecer em mais de um gênero. Edite categorias no detalhe do jogo.';
  $('#tab-all').textContent = games.length; $('#tab-beaten').textContent = beaten; $('#tab-complete').textContent = complete; $('#tab-mastered').textContent = mastered; $('#tab-progress').textContent = games.filter(g => !g.beaten && !g.complete).length;
  renderGames();
}
function badge(g) { return g.mastered ? '<span class="badge mastered">✦ MASTERIZADO</span>' : g.complete ? '<span class="badge complete">✧ COMPLETO · 100%</span>' : g.beaten ? '<span class="badge">✓ ZERADO</span>' : ''; }
function filteredGames() {
  const query = $('#search').value.toLocaleLowerCase('pt-BR');
  const filtered = data.games.filter(g => g.title.toLocaleLowerCase('pt-BR').includes(query) && (!$('#console-filter').value || g.console === $('#console-filter').value) && (!$('#genre-filter').value || categories(g).includes($('#genre-filter').value) || (!categories(g).length && $('#genre-filter').value === 'Sem categoria')) && (status === 'all' || (status === 'beaten' && g.beaten) || (status === 'complete' && g.complete) || (status === 'mastered' && g.mastered) || (status === 'progress' && !g.beaten && !g.complete)));
  return filtered.sort((a,b) => $('#sort').value === 'title' ? a.title.localeCompare(b.title, 'pt-BR') : $('#sort').value === 'progress' ? (b.total ? b.unlocked/b.total : 0) - (a.total ? a.unlocked/a.total : 0) : (Date.parse($('#sort').value === 'award' ? b.awardDate : b.lastPlayed) || 0) - (Date.parse($('#sort').value === 'award' ? a.awardDate : a.lastPlayed) || 0));
}
function renderGames() {
  const filtered = filteredGames(), pages = Math.ceil(filtered.length / 24);
  page = Math.max(1, Math.min(page, pages || 1));
  $('#library-count').textContent = filtered.length;
  $('#games').classList.toggle('list', list);
  if (!filtered.length) {
    const emptyLibrary = data.games.length === 0;
    $('#games').innerHTML = `<div class="empty"><span class="empty-icon">${emptyLibrary ? '▧' : '⌕'}</span><h3>${emptyLibrary ? 'Sua próxima viagem começa aqui' : 'Nenhum jogo por aqui'}</h3><p>${emptyLibrary ? (data.sync.running ? 'Estamos buscando seus jogos no RetroAchievements. Sua biblioteca aparecerá aqui em instantes.' : 'Sincronize seu perfil para reunir suas aventuras, seus consoles e suas conquistas.') : 'Experimente outro nome, console ou categoria para encontrar o que procura.'}</p>${!data.sync.running ? `<button class="primary" id="empty-action">${emptyLibrary ? 'Sincronizar minha biblioteca' : 'Limpar filtros'}</button>` : ''}</div>`;
  } else $('#games').innerHTML = filtered.slice((page - 1) * 24, page * 24).map(g => {
    const progress = g.total ? Math.min(100, Math.round(g.unlocked / g.total * 100)) : 0, src = image(g.boxArt) || image(g.icon);
    return `<button class="game-card ${g.complete ? 'is-complete' : ''}" data-game="${g.id}" aria-label="Ver detalhes de ${escape(g.title)}"><div class="cover">${src ? `<img src="${src}" loading="lazy" alt="Capa de ${escape(g.title)}">` : `<span class="placeholder">▧</span>`}${badge(g)}</div><div class="game-info"><span class="game-console">${escape(g.console)}</span><h3 title="${escape(g.title)}">${escape(g.title)}</h3><span class="game-genre">${escape(g.genre || 'Sem categoria')}</span><div class="progress-label"><span>${g.unlocked} / ${g.total} conquistas</span><strong>${g.total ? progress + '%' : '—'}</strong></div><div class="progress-bar"><i style="width:${progress}%"></i></div></div></button>`;
  }).join('');
  $('#pagination').innerHTML = pages > 1 ? `<button data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>← Anterior</button><span>${page} de ${pages}</span><button data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Próxima →</button>` : '';
  $('.tabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.status === status));
}
function changeView(next) {
  view = next; status = next === 'beaten' ? 'beaten' : next === 'complete' ? 'complete' : 'all'; page = 1;
  $('#page-title').innerHTML = `${titles[next][0]}<span>.</span>`; $('#page-subtitle').textContent = titles[next][1]; $('#breadcrumb').textContent = labels[next];
  $('#hero').hidden = next !== 'overview'; $('#stats').hidden = !['overview','consoles','genres'].includes(next); $('#charts').hidden = !['overview','consoles','genres'].includes(next);
  $('#library-title').innerHTML = `${next === 'beaten' ? 'Suas aventuras concluídas' : next === 'complete' ? 'Sua coleção de conquistas' : 'Sua biblioteca'} <span id="library-count">0</span>`;
  document.querySelectorAll('.nav[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === next));
  render();
}
function openSettings() { $('#profile-input').value = data.username; $('#accent').value = document.body.dataset.accent; $('#settings-error').textContent = ''; $('#settings').showModal(); }
function openGame(id) {
  const g = data.games.find(g => g.id === id); if (!g) return;
  dialogId = id;
  const src = image(g.boxArt) || image(g.icon);
  $('#game-detail').innerHTML = `<div class="dialog-heading"><span class="detail-console">${escape(g.console)}</span><button class="close" data-close="game-dialog" aria-label="Fechar">×</button></div>${src ? `<img class="detail-cover" src="${src}" alt="Capa de ${escape(g.title)}">` : ''}<h2>${escape(g.title)}</h2>${badge(g)}<p class="muted">${g.unlocked} de ${g.total} conquistas · Progresso unificado<br>${g.developer ? 'Desenvolvido por ' + escape(g.developer) + '<br>' : ''}${g.awardDate ? 'Selo de conclusão em ' + date(g.awardDate) + '<br>' : ''}${g.manual ? 'Status de campanha personalizado por você.' : 'Status de campanha informado pelo RetroAchievements.'}</p><form id="game-form"><label>Categoria<input name="genre" value="${escape(g.genre)}" placeholder="Ex.: RPG, Plataforma, Aventura" maxlength="100"><span class="muted">Deixe vazio para usar a categoria da API.</span></label><label>História / campanha<select name="beaten"><option value="auto" ${!g.manual ? 'selected' : ''}>Usar status do RetroAchievements</option><option value="yes" ${g.manual && g.beaten ? 'selected' : ''}>Eu já zerei este jogo</option><option value="no" ${g.manual && !g.beaten ? 'selected' : ''}>Ainda não zerei</option></select></label><div id="game-error" class="error" role="alert"></div><div class="detail-actions"><button type="submit" class="primary">Salvar jogo</button><a class="secondary" href="https://retroachievements.org/game/${g.id}" target="_blank" rel="noopener noreferrer">Abrir no RetroAchievements ↗</a></div></form>`;
  $('#game-dialog').showModal();
}
document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) changeView(target.dataset.view);
  if (target.dataset.status) { status = target.dataset.status; page = 1; renderGames(); }
  if (target.dataset.close) $('#' + target.dataset.close).close();
  if (target.dataset.game) openGame(Number(target.dataset.game));
  if (target.dataset.page) { page = Number(target.dataset.page); renderGames(); $('#library').scrollIntoView({ behavior: 'smooth' }); }
  if (target.dataset.group) { changeView('library'); $(target.dataset.group === 'console' ? '#console-filter' : '#genre-filter').value = target.dataset.value; renderGames(); }
  if (target.id === 'sync-button') await synchronize();
  if (['settings-button', 'profile-button'].includes(target.id)) openSettings();
  if (target.id === 'empty-action') { if (!data.games.length) await synchronize(); else { $('#search').value = ''; $('#console-filter').value = ''; $('#genre-filter').value = ''; status = 'all'; renderGames(); } }
  if (['grid-view','list-view'].includes(target.id)) { list = target.id === 'list-view'; $('#grid-view').classList.toggle('selected', !list); $('#list-view').classList.toggle('selected', list); renderGames(); }
});
for (const selector of ['#search','#console-filter','#genre-filter','#sort']) $(selector).addEventListener(selector === '#search' ? 'input' : 'change', () => { page = 1; renderGames(); });
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const username = $('#profile-input').value.trim();
    if (username !== data.username) await api('/api/settings', { username });
    document.body.dataset.accent = $('#accent').value;
    try { localStorage.setItem('retrovault-accent', $('#accent').value); } catch {}
    $('#settings').close(); await load();
  } catch (error) { $('#settings-error').textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'game-form') return;
  event.preventDefault(); event.submitter.disabled = true;
  try { const form = new FormData(event.target); await api('/api/game', { id: dialogId, genre: form.get('genre'), beaten: form.get('beaten') === 'auto' ? null : form.get('beaten') === 'yes' }); $('#game-dialog').close(); await load(); }
  catch (error) { $('#game-error').textContent = error.message; event.submitter.disabled = false; }
});
document.addEventListener('error', event => { if (event.target.tagName === 'IMG') { event.target.style.display = 'none'; } }, true);
await load();
if (data.configured && !data.updatedAt && !data.sync.running) await synchronize();
setInterval(() => { if (data.sync.running) void load(); }, 2500);
