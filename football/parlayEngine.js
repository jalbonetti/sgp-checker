// football/parlayEngine.js — NFL + CFB condition evaluation + intersection
//
// Same four-phase engine as every other sport:
//   1. per-condition scoped dates + qualifying dates
//   2. intersect scoped dates -> combined eligible pool (shared denominator)
//   3. intersect qualifying dates -> combined hits
//   4. per-condition rates against the combined pool
//
// Football differences:
//   - "date" keys: CFB logs carry game_date (YYYY-MM-DD); NFL logs carry
//     season/week, keyed as "YYYY-Wnn" (sortable) and displayed as "Wk n"
//   - the "recent" window is the LAST 5 TEAM GAMES (site L5 convention), not
//     30 calendar days — result fields keep their last30* names so the shared
//     results renderer needs only a label change
//   - no starts/bench scopes; DNP = team game dates with no log row
//   - logs are current-team + current-season only (dataService enforces)

import { FOOTBALL_SPORTS, FOOTBALL_RECENT_GAMES } from './config.js';
import { fetchFootballTeamLogs } from './dataService.js';

function dateKeyOf(sportId, row) {
  const c = FOOTBALL_SPORTS[sportId].logCols;
  if (c.gameDate) {
    const t = String(row[c.gameDate] || '').trim();
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  }
  const s = parseInt(row[c.season], 10), w = parseInt(row[c.week], 10);
  if (isNaN(s) || isNaN(w)) return '';
  return `${s}-W${String(w).padStart(2, '0')}`;
}

/** Sort key: real dates by time; week keys by (season, week). */
function sortVal(key) {
  const wk = String(key).match(/^(\d{4})-W(\d{2})$/);
  if (wk) return parseInt(wk[1], 10) * 100 + parseInt(wk[2], 10);
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime();
  return 0;
}

function formatDateKey(key) {
  const wk = String(key).match(/^(\d{4})-W(\d{2})$/);
  if (wk) return `Wk ${parseInt(wk[2], 10)}`;
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
  return String(key);
}

/** The team's most recent N game keys (the "recent" window). */
function recentTeamKeys(allTeamDates) {
  return new Set([...allTeamDates].sort((a, b) => sortVal(b) - sortVal(a)).slice(0, FOOTBALL_RECENT_GAMES));
}
function filterToRecent(dates, recentSet) {
  const out = new Set();
  dates.forEach(d => { if (recentSet.has(d)) out.add(d); });
  return out;
}

function evaluateProp(propDef, direction, value, logsByDate, scopedDates) {
  const qualifyingDates = new Set();
  if (!propDef || propDef.type === 'none' || (!propDef.column && !propDef.compute)) {
    scopedDates.forEach(d => qualifyingDates.add(d));
    return { qualifyingDates, description: 'Any Game' };
  }
  const th = parseFloat(value);
  scopedDates.forEach(date => {
    const log = logsByDate.get(date);
    if (!log) return;
    const sv = propDef.compute ? propDef.compute(log) : parseFloat(log[propDef.column]);
    if (isNaN(sv)) return;
    if (direction === 'gte' && sv >= th) qualifyingDates.add(date);
    if (direction === 'lt' && sv < th) qualifyingDates.add(date);
  });
  return { qualifyingDates, description: `${propDef.label} ${direction === 'gte' ? '≥' : '<'} ${value}` };
}

function findFuzzyPlayerMatch(targetName, playerLogsMap) {
  if (!targetName) return null;
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,'\-\s]+/g, '');
  const t = norm(targetName);
  for (const [name] of playerLogsMap) if (norm(name) === t) return name;
  return null;
}

/**
 * @param sportId 'nfl' | 'ncaaf'
 * @param teamValue the team as stored in the matchups tables (abbr for NFL,
 *                  full name for CFB) — the player's CURRENT team
 * @param rosterNames names on today's roster (CFB name-based fallback query)
 */
export async function runFootballParlayCheck(sportId, conditions, teamValue, rosterNames) {
  if (!conditions || conditions.length === 0) return { error: 'No conditions to check' };
  const c = FOOTBALL_SPORTS[sportId].logCols;

  const allTeamLogs = await fetchFootballTeamLogs(sportId, teamValue, rosterNames);
  if (!allTeamLogs || allTeamLogs.length === 0) {
    return { error: `No current-season game log data yet for ${teamValue}.` };
  }

  const allTeamDates = [...new Set(allTeamLogs.map(r => dateKeyOf(sportId, r)).filter(Boolean))];
  const allTeamDateSet = new Set(allTeamDates);
  const recent = recentTeamKeys(allTeamDates);

  const playerLogsMap = new Map();
  allTeamLogs.forEach(log => {
    const name = String(log[c.player] || '').trim();
    if (!name) return;
    if (!playerLogsMap.has(name)) playerLogsMap.set(name, []);
    playerLogsMap.get(name).push(log);
  });

  // ---- Phase 1 ----
  const rowData = [];
  for (const cond of conditions) {
    const lookupName = (cond.player?.gameLogName || cond.player?.cleanName || '').trim();
    let playerLogs = playerLogsMap.get(lookupName) || [];
    if (!playerLogs.length) {
      const fuzzy = findFuzzyPlayerMatch(lookupName, playerLogsMap);
      if (fuzzy) playerLogs = playerLogsMap.get(fuzzy) || [];
    }
    const logsByDate = new Map();
    playerLogs.forEach(log => { const k = dateKeyOf(sportId, log); if (k) logsByDate.set(k, log); });

    if (cond.scope === 'dnp' || cond.propId === 'does_not_play') {
      const qualifyingDates = new Set();
      allTeamDateSet.forEach(d => { if (!logsByDate.has(d)) qualifyingDates.add(d); });
      rowData.push({ playerName: cond.player.displayName, description: 'Does Not Play', qualifyingDates, scopedDates: new Set(allTeamDates) });
      continue;
    }

    const scopedDates = new Set(logsByDate.keys());   // 'all' = every game he appeared in
    const propResult = evaluateProp(cond.propDef, cond.direction, cond.value, logsByDate, scopedDates);
    rowData.push({
      playerName: cond.player.displayName,
      description: (cond.propId === 'none' || !cond.propId) ? 'Any Game' : propResult.description,
      qualifyingDates: propResult.qualifyingDates,
      scopedDates,
    });
  }

  // ---- Phase 2 / 3 ----
  const intersect = (sets) => { let acc = new Set(sets[0]); for (let i = 1; i < sets.length; i++) { const n = new Set(); acc.forEach(d => { if (sets[i].has(d)) n.add(d); }); acc = n; } return acc; };
  const combinedEligible = intersect(rowData.map(r => r.scopedDates));
  const combinedQualifying = intersect(rowData.map(r => r.qualifyingDates));

  // ---- Phase 4 ----
  const combinedEligRecent = filterToRecent(combinedEligible, recent);
  const combinedQualRecent = filterToRecent(combinedQualifying, recent);
  const teamRecent = filterToRecent(allTeamDateSet, recent);
  const pct = (h, e) => e > 0 ? (h / e * 100).toFixed(1) : '0.0';

  const individual = rowData.map(r => {
    const hitsInPool = new Set();
    r.qualifyingDates.forEach(d => { if (combinedEligible.has(d)) hitsInPool.add(d); });
    const hitsRecent = filterToRecent(hitsInPool, recent);
    return {
      playerName: r.playerName, description: r.description,
      seasonHits: hitsInPool.size, seasonEligible: combinedEligible.size, seasonRate: pct(hitsInPool.size, combinedEligible.size),
      last30Hits: hitsRecent.size, last30Eligible: combinedEligRecent.size, last30Rate: pct(hitsRecent.size, combinedEligRecent.size),
    };
  });

  const sortedDates = [...combinedQualifying].sort((a, b) => sortVal(b) - sortVal(a)).map(formatDateKey);

  return {
    combined: {
      hits: combinedQualifying.size, eligible: combinedEligible.size, rate: pct(combinedQualifying.size, combinedEligible.size),
      last30Hits: combinedQualRecent.size, last30Eligible: combinedEligRecent.size, last30Rate: pct(combinedQualRecent.size, combinedEligRecent.size),
      dates: sortedDates,
    },
    teamGames: { season: allTeamDates.length, last30: teamRecent.size },
    individual,
    conditionCount: conditions.length,
  };
}
