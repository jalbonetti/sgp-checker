// mlb/parlayEngine.js — MLB co-occurrence engine for the Same-Team Prop Checker.
// Players join to their game logs by FanGraphs Player ID. Scopes:
//   all   → denominator is every team game (a sit counts as a miss)
//   plays → denominator is only games the batter appeared in
//   dnp   → games the team played but the batter did not appear (no prop)

import { fetchMLBGameLogs } from './dataService.js';
import { MLB_ALL_PROPS, MLB_NONE_PROP, MLB_INJURED_PROP } from './config.js';

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}
function normalizeDateKey(dateStr) { return (dateStr || '').toString().trim(); }

function filterToLast30Days(dates) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = new Set();
  dates.forEach(dk => { const d = parseDate(dk); if (d && d >= cutoff && d < endDate) out.add(dk); });
  return out;
}

function findColumn(sampleRow, candidates) {
  if (!sampleRow) return candidates[0];
  for (const c of candidates) if (c in sampleRow) return c;
  const keys = Object.keys(sampleRow);
  for (const c of candidates) {
    const lower = c.toLowerCase().replace(/[\s_]+/g, '');
    const match = keys.find(k => k.toLowerCase().replace(/[\s_]+/g, '') === lower);
    if (match) return match;
  }
  return candidates[0];
}

function resolvePropDef(cond) {
  if (cond.prop) return cond.prop;                 // pre-resolved def
  const id = cond.propId;
  if (!id || id === 'none') return MLB_NONE_PROP;
  if (id === 'dnp') return MLB_INJURED_PROP;
  return MLB_ALL_PROPS.find(p => p.id === id) || MLB_NONE_PROP;
}

/** Dates in scope for a condition, given the player's played dates + all team dates. */
function scopedDatesFor(scope, playerDates, allTeamDates) {
  if (scope === 'dnp') {
    const s = new Set();
    allTeamDates.forEach(d => { if (!playerDates.has(d)) s.add(d); });
    return s;
  }
  return new Set(playerDates); // 'plays' (default) — a prop is only meaningful over games he played
}

/** Dates that satisfy the condition, within its scoped dates. */
function qualifyingDatesFor(cond, propDef, logsByDate, scopedDates) {
  const q = new Set();
  const scope = cond.scope || 'plays';
  // DNP scope, or an unset / does-not-play prop → the scoped dates themselves qualify.
  if (scope === 'dnp' || !propDef || propDef.id === 'none' || propDef.id === 'dnp') {
    scopedDates.forEach(d => q.add(d));
    return q;
  }
  const th = parseFloat(cond.value);
  scopedDates.forEach(date => {
    const log = logsByDate.get(date);
    if (!log) return;                              // no line that day (e.g. a sit under 'all') → miss
    const sv = propDef.compute ? propDef.compute(log) : parseFloat(log[propDef.column]);
    if (isNaN(sv)) return;
    if (cond.direction === 'lt') { if (sv < th) q.add(date); }
    else if (sv >= th) q.add(date);               // default gte
  });
  return q;
}

function describe(cond, propDef) {
  const scope = cond.scope || 'plays';
  if (scope === 'dnp' || (propDef && propDef.id === 'dnp')) return 'Does Not Play';
  if (!propDef || propDef.id === 'none') return 'Any Game';
  const arrow = cond.direction === 'lt' ? '<' : '≥';
  return `${propDef.label} ${arrow} ${cond.value}`;
}

export async function runMLBParlayCheck(conditions, teamCode) {
  if (!conditions || conditions.length === 0) return { error: 'No conditions to check' };

  const allTeamLogs = await fetchMLBGameLogs(teamCode);
  if (!allTeamLogs || allTeamLogs.length === 0) return { error: `No game log data found for ${teamCode}.` };

  const sample = allTeamLogs[0];
  const COL_DATE = findColumn(sample, ['Date', 'date']);
  const COL_PID = findColumn(sample, ['playerId', 'Player ID', 'PlayerID', 'player_id']);
  const COL_NAME = findColumn(sample, ['playerName', 'Player Name', 'PlayerName', 'player_name']);
  console.log('⚾ Detected columns:', { COL_DATE, COL_PID, COL_NAME });

  // Every distinct date the team appears in the logs = the team's games.
  const allTeamDates = new Set(allTeamLogs.map(r => normalizeDateKey(r[COL_DATE])).filter(Boolean));

  // Index logs by Player ID (string).
  const logsByPID = new Map();
  allTeamLogs.forEach(log => {
    const pid = log[COL_PID];
    if (pid == null || pid === '') return;
    const k = String(pid);
    if (!logsByPID.has(k)) logsByPID.set(k, []);
    logsByPID.get(k).push(log);
  });

  // ---- Phase 1: per condition, scoped + qualifying dates ----
  const rowData = [];
  for (const cond of conditions) {
    const propDef = resolvePropDef(cond);
    const pidStr = cond.player && cond.player.playerId != null ? String(cond.player.playerId) : '';
    const playerLogs = pidStr ? (logsByPID.get(pidStr) || []) : [];

    const logsByDate = new Map();
    const playerDates = new Set();
    playerLogs.forEach(l => { const dk = normalizeDateKey(l[COL_DATE]); if (dk) { playerDates.add(dk); logsByDate.set(dk, l); } });

    const scopedDates = scopedDatesFor(cond.scope || 'plays', playerDates, allTeamDates);
    const qualifyingDates = qualifyingDatesFor(cond, propDef, logsByDate, scopedDates);

    rowData.push({ playerName: cond.player ? cond.player.displayName : '', description: describe(cond, propDef), scopedDates, qualifyingDates });
  }

  // ---- Phase 2: combined eligible (intersect scoped) ----
  let combinedEligible = new Set(rowData[0].scopedDates);
  for (let i = 1; i < rowData.length; i++) {
    const next = rowData[i].scopedDates, inter = new Set();
    combinedEligible.forEach(d => { if (next.has(d)) inter.add(d); });
    combinedEligible = inter;
  }

  // ---- Phase 3: combined hits (intersect qualifying) ----
  let combinedQualifying = new Set(rowData[0].qualifyingDates);
  for (let i = 1; i < rowData.length; i++) {
    const next = rowData[i].qualifyingDates, inter = new Set();
    combinedQualifying.forEach(d => { if (next.has(d)) inter.add(d); });
    combinedQualifying = inter;
  }

  // ---- Phase 4: totals + last 30 + per-condition ----
  const combinedElig30 = filterToLast30Days(combinedEligible);
  const combinedQual30 = filterToLast30Days(combinedQualifying);
  const teamDates30 = filterToLast30Days(allTeamDates);

  const individual = rowData.map(r => {
    const hits = new Set();
    r.qualifyingDates.forEach(d => { if (combinedEligible.has(d)) hits.add(d); });
    const hits30 = filterToLast30Days(hits);
    return {
      playerName: r.playerName, description: r.description,
      seasonHits: hits.size, seasonEligible: combinedEligible.size,
      seasonRate: combinedEligible.size > 0 ? (hits.size / combinedEligible.size * 100).toFixed(1) : '0.0',
      last30Hits: hits30.size, last30Eligible: combinedElig30.size,
      last30Rate: combinedElig30.size > 0 ? (hits30.size / combinedElig30.size * 100).toFixed(1) : '0.0',
    };
  });

  const sortedDates = [...combinedQualifying].sort((a, b) => parseDate(b) - parseDate(a));

  return {
    conditionCount: conditions.length,
    combined: {
      hits: combinedQualifying.size, eligible: combinedEligible.size,
      rate: combinedEligible.size > 0 ? (combinedQualifying.size / combinedEligible.size * 100).toFixed(1) : '0.0',
      last30Hits: combinedQual30.size, last30Eligible: combinedElig30.size,
      last30Rate: combinedElig30.size > 0 ? (combinedQual30.size / combinedElig30.size * 100).toFixed(1) : '0.0',
      dates: sortedDates,
    },
    individual,
    teamGames: { season: allTeamDates.size, last30: teamDates30.size },
  };
}
