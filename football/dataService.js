// football/dataService.js — NFL + CFB Supabase fetching for the checker
//
// Three tables per sport:
//   {Sport}MatchupsGame    — one row per upcoming game (Matchup ID, Matchup
//                            "Away Full @ Home Full", Gametime, ...)
//   {Sport}MatchupsPlayers — per player × period × split rows; the checker
//                            reads the roster columns and dedupes by name
//   {Sport}GameLogs        — one row per player per game (nflverse / CFBD)
//
// Logs are ALWAYS fetched for the player's current team AND the current
// season only (site-wide display rule).

import { CONFIG } from '../config.js';
import { FOOTBALL_SPORTS, FOOTBALL_CURRENT_SEASON } from './config.js';

async function supabaseFetch(endpoint, queryParams = '') {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...CONFIG.API_HEADERS, 'Prefer': 'return=representation', 'Accept': 'application/json' },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`❌ Supabase ${response.status} for ${endpoint}: ${errorText}`);
    throw new Error(`Supabase error: ${response.status} for ${endpoint}`);
  }
  return response.json();
}

async function supabaseFetchAll(endpoint, queryParams = '') {
  const pageSize = 1000;
  let all = [], offset = 0, more = true;
  while (more) {
    const sep = queryParams.includes('?') ? '&' : '?';
    const data = await supabaseFetch(endpoint, `${queryParams}${sep}limit=${pageSize}&offset=${offset}`);
    if (data && data.length) { all = all.concat(data); offset += pageSize; more = data.length === pageSize; }
    else more = false;
  }
  return all;
}

function pgSelect(columns) {
  return columns.map(c => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : encodeURIComponent(`"${c}"`))).join(',');
}

const GAME_COLUMNS = ['Matchup ID', 'Matchup', 'Gametime', 'Stadium', 'Neutral'];
const PLAYER_COLUMNS = ['Matchup ID', 'Player', 'Team', 'Opponent', 'Position', 'Status', 'Tag', 'Injury', 'Primary'];

/** Upcoming games (one row per game). */
export async function fetchFootballGames(sportId) {
  const t = FOOTBALL_SPORTS[sportId].tables.game;
  try { return await supabaseFetchAll(t, `?select=${pgSelect(GAME_COLUMNS)}`); }
  catch (e) { console.warn(`${sportId}: narrow game select failed, retrying select=*`, e.message); return supabaseFetchAll(t, '?select=*').catch(() => []); }
}

/** Every matchups-player row (the checker dedupes per team). */
export async function fetchFootballMatchupPlayers(sportId) {
  const t = FOOTBALL_SPORTS[sportId].tables.players;
  try { return await supabaseFetchAll(t, `?select=${pgSelect(PLAYER_COLUMNS)}`); }
  catch (e) { console.warn(`${sportId}: narrow player select failed, retrying select=*`, e.message); return supabaseFetchAll(t, '?select=*').catch(() => []); }
}

/**
 * Current-season logs for ONE team (= the player's current team by
 * construction — the selected team is the team he's rostered on today).
 *
 * NFL: the logs' team column is the same abbreviation space as the matchups
 * tables — direct query.
 * CFB: logs carry CFBD school names ("Ohio State") while matchups carry
 * Odds-API full names ("Ohio State Buckeyes"). Try the full name, then
 * progressively drop trailing words (nickname) until a query returns rows
 * ("Miami (OH) RedHawks" -> "Miami (OH)"). Falls back to a player-name IN
 * query built from the roster when no team spelling matches (accents etc.).
 */
export async function fetchFootballTeamLogs(sportId, teamValue, rosterNames) {
  const sp = FOOTBALL_SPORTS[sportId];
  const c = sp.logCols;
  const cols = [c.player, c.team, c.opponent, c.season, c.week, c.seasonType, c.gameDate,
    c.completions, c.attempts, c.passYds, c.passTds, c.ints, c.carries, c.rushYds, c.rushTds,
    c.receptions, c.targets, c.recYds, c.recTds].filter(Boolean);
  const base = `select=${pgSelect(cols)}&${c.season}=eq.${FOOTBALL_CURRENT_SEASON}&${c.seasonType}=eq.REG`;
  const q = (extra) => supabaseFetchAll(sp.tables.logs, `?${base}&${extra}`);

  const candidates = [];
  if (sp.teamsAreAbbrev) candidates.push(teamValue);
  else {
    const words = String(teamValue).trim().split(/\s+/);
    for (let n = words.length; n >= 1; n--) candidates.push(words.slice(0, n).join(' '));
  }
  for (const cand of candidates) {
    try {
      const rows = await q(`${c.team}=eq.${encodeURIComponent(cand)}`);
      if (rows.length) { console.log(`🏈 ${sportId} logs via team "${cand}": ${rows.length} rows`); return rows; }
    } catch (e) { console.warn(`${sportId}: team query failed for "${cand}"`, e.message); }
  }
  if (rosterNames && rosterNames.length) {
    const list = rosterNames.slice(0, 80).map(n => `"${String(n).replace(/"/g, '')}"`).join(',');
    try {
      const rows = await q(`${c.player}=in.(${encodeURIComponent(list)})`);
      console.log(`🏈 ${sportId} logs via roster names: ${rows.length} rows`);
      return rows;
    } catch (e) { console.warn(`${sportId}: roster-name query failed`, e.message); }
  }
  return [];
}
