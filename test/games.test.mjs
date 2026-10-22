import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGames, gameStatus, playedGames } from '../lib/games.mjs';
test('casual e hardcore contam um jogo, sem somar conquistas duplicadas', () => {
  const games = normalizeGames([{ GameID: 1, Title: 'Jogo', MaxPossible: 20, NumAwarded: 15, NumAwardedHardcore: 10, HighestAwardKind: 'beaten-hardcore' }], [{ GameID: 1, Title: 'Jogo', LastPlayed: '2026-10-14 12:00:00' }]);
  assert.equal(games.length, 1); assert.equal(games[0].unlocked, 15); assert.equal(gameStatus(games[0]).beaten, true);
});
test('história zerada difere de 100%, e mastery continua em evidência', () => {
  assert.deepEqual([gameStatus({ award: 'beaten-softcore' }).beaten, gameStatus({ award: 'beaten-softcore' }).complete], [true, false]);
  assert.equal(gameStatus({ award: 'completed' }).complete, true);
  assert.equal(gameStatus({ award: 'completed' }).mastered, false);
  assert.equal(gameStatus({ award: 'mastered' }).mastered, true);
  assert.equal(gameStatus({ total: 10, unlocked: 10 }).complete, true);
  assert.equal(gameStatus({ total: 0, unlocked: 0 }).complete, false);
});
test('exclui jogos sem conquistas e unifica selos dos jogos com conquistas', () => {
  const games = normalizeGames([], [{ GameID: 1, Title: 'Sem conquistas', NumAchieved: 0 }, { GameID: 2, Title: 'Com conquistas', NumAchieved: 5 }], [{ AwardData: 2, AwardType: 'Game Beaten', AwardDataExtra: 0 }, { AwardData: 2, AwardType: 'Mastery/Completion', AwardDataExtra: 1 }]);
  assert.equal(games.length, 1); assert.equal(games[0].id, 2); assert.equal(games[0].unlocked, 5); assert.equal(games[0].award, 'mastered');
});
test('filtra também o cache existente, mantendo conquistas de qualquer modo', () => {
  assert.deepEqual(playedGames([{ id: 1, unlocked: 0 }, { id: 2, unlocked: 1 }, { id: 3, unlocked: 12 }]).map(g => g.id), [2, 3]);
  assert.equal(normalizeGames([{ GameID: 4, NumAwarded: 0, NumAwardedHardcore: 1 }], []).length, 1);
});
test('personalizações preservam a conclusão e são reversíveis', () => {
  const game = { award: 'completed', genre: 'RPG' };
  const result = gameStatus(game, { genre: 'Aventura', beaten: false });
  assert.equal(result.genre, 'Aventura'); assert.equal(result.beaten, false); assert.equal(result.complete, true); assert.equal(result.manual, true);
  assert.equal(gameStatus(game).beaten, true); assert.equal(gameStatus(game).genre, 'RPG');
});
