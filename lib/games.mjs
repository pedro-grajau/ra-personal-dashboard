export function normalizeGames(progress, recent, awards = []) {
  const games = new Map();
  for (const g of progress) {
    games.set(Number(g.GameID), {
      id: Number(g.GameID), title: g.Title, console: g.ConsoleName, consoleId: g.ConsoleID,
      icon: g.ImageIcon, total: Number(g.MaxPossible) || 0,
      unlocked: Math.max(Number(g.NumAwarded) || 0, Number(g.NumAwardedHardcore) || 0),
      award: g.HighestAwardKind || null, awardDate: g.HighestAwardDate,
      lastPlayed: g.MostRecentAwardedDate, genre: '',
    });
  }
  for (const g of recent) {
    const id = Number(g.GameID);
    const existing = games.get(id);
    games.set(id, {
      id, title: g.Title, console: g.ConsoleName, consoleId: g.ConsoleID,
      icon: g.ImageIcon, total: Number(g.NumPossibleAchievements ?? g.AchievementsTotal) || 0,
      unlocked: Math.max(Number(g.NumAchieved) || 0, Number(g.NumAchievedHardcore) || 0),
      award: null, genre: '', ...existing,
      lastPlayed: g.LastPlayed ? g.LastPlayed.replace(' ', 'T') + (g.LastPlayed.includes('T') ? '' : 'Z') : existing?.lastPlayed,
      boxArt: g.ImageBoxArt,
    });
  }
  for (const a of awards) {
    if (!['Game Beaten', 'Mastery/Completion'].includes(a.AwardType)) continue;
    const id = Number(a.AwardData);
    const g = games.get(id) || { id, title: a.Title, console: a.ConsoleName, consoleId: a.ConsoleID, icon: a.ImageIcon, total: 0, unlocked: 0, genre: '' };
    const rank = { 'beaten-softcore': 1, 'beaten-hardcore': 2, completed: 3, mastered: 4 };
    const award = a.AwardType === 'Mastery/Completion' ? (Number(a.AwardDataExtra) ? 'mastered' : 'completed') : (Number(a.AwardDataExtra) ? 'beaten-hardcore' : 'beaten-softcore');
    if ((rank[award] || 0) > (rank[g.award] || 0)) { g.award = award; g.awardDate = a.AwardedAt; }
    games.set(id, g);
  }
  return playedGames([...games.values()]);
}

export function playedGames(games) {
  return games.filter(game => Number(game.unlocked) > 0);
}

export function gameStatus(game, override = {}) {
  const complete = ['mastered', 'completed'].includes(game.award) || (game.total > 0 && game.unlocked >= game.total);
  const beaten = override.beaten ?? (complete || ['beaten-hardcore', 'beaten-softcore'].includes(game.award));
  return { ...game, genre: override.genre ?? game.genre, beaten, complete, mastered: game.award === 'mastered', manual: override.beaten !== undefined };
}
