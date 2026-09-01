// main.js - Same Game Parlay Builder (Multi-Sport)
// Supports NBA, WNBA, NHL, MLB, NFL and NCAAF with sport tab switching and visibility controls.
// Each sport has its own adapter (config, data, engine, name resolution).

import { injectStyles } from './styles/styles.js';
import { CONFIG, SPORT_VISIBILITY, SPORT_ORDER, SPORT_LABELS, ALL_PROPS, NUMERIC_PROPS, BINARY_PROPS, NONE_PROP, INJURED_PROP, SCOPE_OPTIONS, TEAM_FULL_NAMES } from './config.js';
import { fetchTodaysGames, fetchTeamRoster } from './services/dataService.js';
import { loadAliasTable, buildReverseAliasMap } from './utils/nameResolver.js';
import { runParlayCheck } from './services/parlayEngine.js';

import { WNBA_TEAM_FULL_NAMES, WNBA_ALL_PROPS, WNBA_NUMERIC_PROPS, WNBA_BINARY_PROPS, WNBA_NONE_PROP, WNBA_INJURED_PROP, WNBA_SCOPE_OPTIONS, WNBA_MAX_STAT_VALUE, WNBA_ROLE_STARTER, WNBA_ROLE_BENCH, WNBA_ROLE_NOT_PLAYING, WNBA_DNP_TAGS } from './wnba/config.js';
import { fetchWNBAMatchupPlayers } from './wnba/dataService.js';
import { runWNBAParlayCheck } from './wnba/parlayEngine.js';

import { HOCKEY_TEAM_FULL_NAMES, HOCKEY_ALL_PROPS, HOCKEY_NUMERIC_PROPS, HOCKEY_NONE_PROP, HOCKEY_INJURED_PROP, HOCKEY_SCOPE_OPTIONS, HOCKEY_DNP_INJURIES, HOCKEY_MINOR_INJURIES, HOCKEY_MAX_STAT_VALUE } from './hockey/config.js';
import { fetchHockeyGames, fetchHockeyRoster, fetchHockeyGameLogs } from './hockey/dataService.js';
import { loadHockeyNameTable, buildHockeyReverseNameMap } from './hockey/nameResolver.js';
import { runHockeyParlayCheck } from './hockey/parlayEngine.js';

import { MLB_TEAM_FULL_NAMES, MLB_NAME_TO_CODE, MLB_ALL_PROPS, MLB_NUMERIC_PROPS, MLB_NONE_PROP, MLB_INJURED_PROP, MLB_SCOPE_OPTIONS, MLB_MAX_STAT_VALUE } from './mlb/config.js';
import { fetchMLBGames, fetchMLBLineups, fetchMLBRoster, fetchMLBGameLogs } from './mlb/dataService.js';
import { runMLBParlayCheck } from './mlb/parlayEngine.js';

// [FOOTBALL EDIT 1/6] one factory serves NFL + NCAAF
import { makeFootballAdapter } from './football/adapter.js';

// ============================================================
// STATE
// ============================================================
const state = {
    activeSport: null, // 'nba' | 'wnba' | 'nhl' | 'mlb' | 'nfl' | 'ncaaf'
    games: [],
    selectedTeam: null,
    roster: [],
    conditions: [],
    nameMap: null,       // alias/name map (sport-specific)
    reverseNameMap: null, // reverse lookup
    results: null,
    mlbLineups: [],      // MLB: cached lineups (sliced per team + game leg in fetchRoster)
    wnbaMatchupPlayers: [], // WNBA: slate + rosters in one table, cached once per load
    footballPlayers: [], // NFL/NCAAF: matchups-player rows, cached once per load  [FOOTBALL EDIT 2/6]
    openGroups: null,    // [COLLAPSIBLE DATES] Set of expanded date-section labels (null = default: first open)
};

const NBA_SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];
const QUALIFIER_REGEX = /\s*\((Q|P|D|Out|OFS)\)\s*$/;
const HOCKEY_INJURY_REGEX = /\s*\((DTD|Out|IR|LTIR)\)\s*$/;

function stripQualifier(name) { return (name || '').replace(QUALIFIER_REGEX, '').trim(); }
function stripHockeyInjury(name) { return (name || '').replace(HOCKEY_INJURY_REGEX, '').trim(); }
function parseHockeyInjury(name) {
    const match = (name || '').match(HOCKEY_INJURY_REGEX);
    return match ? match[1] : null;
}

function getVisibleSports() {
    return SPORT_ORDER.filter(id => SPORT_VISIBILITY[id]);
}

// ============================================================
// [STARTED-GAME HIDING] shared ET clock helpers
// ============================================================
// Client-side started-game filter, shared convention across MLB / WNBA /
// NFL / NCAAF: a team whose game has started drops out of the selector, so the
// board empties after the last game of the day rather than showing a stale
// last matchup. WNBA reads the "|..." half of Matchup ID ("DAL@POR|10:00 PM
// ET"); MLB reads BaseballMatchupsGame."Gametime"; football parses full
// ET stamps in its own adapter. NBA/NHL get the same treatment when ported.
// Unreadable/missing times fail OPEN (team stays listed).
function etNowMinutes() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const mar = new Date(Date.UTC(y, 2, 1)), nov = new Date(Date.UTC(y, 10, 1));
    const dstStart = Date.UTC(y, 2, 1 + ((7 - mar.getUTCDay()) % 7) + 7, 7);
    const dstEnd = Date.UTC(y, 10, 1 + ((7 - nov.getUTCDay()) % 7), 6);
    const off = now.getTime() >= dstStart && now.getTime() < dstEnd ? 4 : 5;
    const et = new Date(now.getTime() - off * 3600 * 1000);
    return et.getUTCHours() * 60 + et.getUTCMinutes();
}
function clockToMinutes(str) {
    const m = String(str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10) % 12; if (m[3].toUpperCase() === 'PM') h += 12;
    return h * 60 + parseInt(m[2], 10);
}
function hasStarted(clockStr) {
    const mins = clockToMinutes(clockStr);
    return mins != null && mins <= etNowMinutes();
}


// ============================================================
// SPORT ADAPTERS
// ============================================================
// [FOOTBALL EDIT 3/6] football adapters are built from the shared factory
// (they need `state`, so they're constructed here rather than imported ready-made)
const NFL_ADAPTER = makeFootballAdapter('nfl', state);
const NCAAF_ADAPTER = makeFootballAdapter('ncaaf', state);

function getAdapter() {
    return state.activeSport === 'nhl' ? NHL_ADAPTER
         : state.activeSport === 'mlb' ? MLB_ADAPTER
         : state.activeSport === 'wnba' ? WNBA_ADAPTER
         : state.activeSport === 'nfl' ? NFL_ADAPTER
         : state.activeSport === 'ncaaf' ? NCAAF_ADAPTER
         : NBA_ADAPTER;
}

const NBA_ADAPTER = {
    id: 'nba',
    label: 'NBA',
    teamNames: TEAM_FULL_NAMES,
    allProps: ALL_PROPS,
    numericProps: NUMERIC_PROPS,
    binaryProps: BINARY_PROPS,
    noneProp: NONE_PROP,
    injuredProp: INJURED_PROP,
    scopeOptions: SCOPE_OPTIONS,
    maxStatValue: CONFIG.MAX_STAT_VALUE,
    hasBinaryProps: true,

    async loadInitialData() {
        const [nameMap, games] = await Promise.all([loadAliasTable(), fetchTodaysGames()]);
        state.nameMap = nameMap;
        state.reverseNameMap = buildReverseAliasMap(nameMap);
        state.games = games;
    },

    extractTeamsPlaying(games) {
        const t = new Set();
        games.forEach(g => {
            ['Home Team', 'Away Team'].forEach(f => { const v = (g[f] || '').trim(); if (TEAM_FULL_NAMES[v]) t.add(v); });
            const m = g['Matchup'] || '';
            Object.entries(TEAM_FULL_NAMES).forEach(([a, fn]) => { if (m.includes(fn)) t.add(a); });
        });
        return [...t].sort();
    },

    async fetchRoster(team) {
        return processNBARoster(await fetchTeamRoster(team), team);
    },

    getRosterGroups(roster) {
        const groups = { 'Starters': [], 'Bench': [], 'Injured / Out': [] };
        roster.forEach(p => { groups[p.isStarter ? 'Starters' : p.isInjured ? 'Injured / Out' : 'Bench'].push(p); });
        return groups;
    },

    getScopeOptionsForPlayer(p) {
        if (!p) return [];
        if (p.isInjured) return SCOPE_OPTIONS.filter(s => s.id === 'dnp');
        if (p.isStarter) return SCOPE_OPTIONS.filter(s => s.id !== 'off_bench');
        if (p.isBench) return SCOPE_OPTIONS.filter(s => s.id !== 'starts');
        return SCOPE_OPTIONS;
    },

    findPropDef(propId) {
        if (propId === 'none') return NONE_PROP;
        return [...NUMERIC_PROPS, ...BINARY_PROPS].find(p => p.id === propId) || null;
    },

    isBinaryProp(propDef) {
        return propDef && (propDef.column === 'DD' || propDef.column === 'TD');
    },

    getDefaultDirection(propDef) {
        if (this.isBinaryProp(propDef)) return 'yes';
        return 'gte';
    },

    async runCheck(conditions, team) {
        return runParlayCheck(conditions, team);
    },
};

// ============================================================
// WNBA ADAPTER
// ============================================================
// The slate and the rosters live in one table (WBasketMatchupsPlayers), so
// loadInitialData fetches it once and fetchRoster just slices the cache —
// no per-team roster request at all.
const WNBA_ADAPTER = {
    id: 'wnba',
    label: 'WNBA',
    teamNames: WNBA_TEAM_FULL_NAMES,
    allProps: WNBA_ALL_PROPS,
    numericProps: WNBA_NUMERIC_PROPS,
    binaryProps: WNBA_BINARY_PROPS,
    noneProp: WNBA_NONE_PROP,
    injuredProp: WNBA_INJURED_PROP,
    scopeOptions: WNBA_SCOPE_OPTIONS,
    maxStatValue: WNBA_MAX_STAT_VALUE,
    hasBinaryProps: true,
    hidesNonPlaying: true,   // [STARTED-GAME HIDING] selector shows only not-yet-started teams

    async loadInitialData() {
        const rows = await fetchWNBAMatchupPlayers();
        state.wnbaMatchupPlayers = rows;
        state.games = rows;          // the slate is derived from these same rows
        state.nameMap = null;        // names match the game logs exactly
        state.reverseNameMap = null;
    },

    extractTeamsPlaying(games) {
        const t = new Set();
        (games || []).forEach(r => {
            const team = (r['Team'] || '').trim();
            if (!WNBA_TEAM_FULL_NAMES[team]) return;
            const time = String(r['Matchup ID'] || '').split('|')[1] || '';
            if (hasStarted(time)) return;   // [STARTED-GAME HIDING]
            t.add(team);
        });
        return [...t].sort();
    },

    // "DAL@POR|10:00 PM ET" -> "DAL @ POR · 10:00 PM ET", for the button tooltip.
    matchupLabel(team) {
        const row = (state.wnbaMatchupPlayers || []).find(r => (r['Team'] || '').trim() === team);
        const raw = row ? String(row['Matchup ID'] || '').trim() : '';
        if (!raw) return WNBA_TEAM_FULL_NAMES[team] || team;
        const [teams, time] = raw.split('|');
        const pretty = (teams || '').replace('@', ' @ ');
        return `${WNBA_TEAM_FULL_NAMES[team] || team} — ${pretty}${time ? ` · ${time.trim()}` : ''}`;
    },

    async fetchRoster(team) {
        const rows = (state.wnbaMatchupPlayers || []).filter(r => (r['Team'] || '').trim() === team);
        return processWNBARoster(rows, team);
    },

    getRosterGroups(roster) {
        const groups = { 'Starters': [], 'Bench': [], 'Injured / Out': [] };
        roster.forEach(p => { groups[p.isStarter ? 'Starters' : p.isInjured ? 'Injured / Out' : 'Bench'].push(p); });
        return groups;
    },

    getScopeOptionsForPlayer(p) {
        if (!p) return [];
        if (p.isInjured) return WNBA_SCOPE_OPTIONS.filter(s => s.id === 'dnp');
        if (p.isStarter) return WNBA_SCOPE_OPTIONS.filter(s => s.id !== 'off_bench');
        if (p.isBench) return WNBA_SCOPE_OPTIONS.filter(s => s.id !== 'starts');
        return WNBA_SCOPE_OPTIONS;
    },

    findPropDef(propId) {
        if (propId === 'none') return WNBA_NONE_PROP;
        return [...WNBA_NUMERIC_PROPS, ...WNBA_BINARY_PROPS].find(p => p.id === propId) || null;
    },

    isBinaryProp(propDef) {
        return propDef && (propDef.column === 'DD' || propDef.column === 'TD');
    },

    getDefaultDirection(propDef) {
        return this.isBinaryProp(propDef) ? 'yes' : 'gte';
    },

    async runCheck(conditions, team) {
        return runWNBAParlayCheck(conditions, team);
    },
};

const NHL_ADAPTER = {
    id: 'nhl',
    label: 'NHL',
    teamNames: HOCKEY_TEAM_FULL_NAMES,
    allProps: HOCKEY_ALL_PROPS,
    numericProps: HOCKEY_NUMERIC_PROPS,
    binaryProps: [],
    noneProp: HOCKEY_NONE_PROP,
    injuredProp: HOCKEY_INJURED_PROP,
    scopeOptions: HOCKEY_SCOPE_OPTIONS,
    maxStatValue: HOCKEY_MAX_STAT_VALUE,
    hasBinaryProps: false,

    async loadInitialData() {
        const [nameMap, games] = await Promise.all([loadHockeyNameTable(), fetchHockeyGames()]);
        state.nameMap = nameMap;
        state.reverseNameMap = buildHockeyReverseNameMap(nameMap);
        state.games = games;
    },

    extractTeamsPlaying(games) {
        const t = new Set();
        games.forEach(g => {
            const matchup = g['Matchup'] || '';
            // Parse full team names from matchup string (e.g. "Florida Panthers vs Chicago Blackhawks")
            Object.entries(HOCKEY_TEAM_FULL_NAMES).forEach(([abbrev, fullName]) => {
                if (matchup.includes(fullName)) t.add(abbrev);
            });
        });
        return [...t].sort();
    },

    async fetchRoster(team) {
        return processHockeyRoster(await fetchHockeyRoster(team), team);
    },

    getRosterGroups(roster) {
        const groups = { 'Skaters': [], 'Injured / Out': [] };
        roster.forEach(p => { groups[p.isInjured ? 'Injured / Out' : 'Skaters'].push(p); });
        return groups;
    },

    getScopeOptionsForPlayer(p) {
        if (!p) return [];
        if (p.isInjured) return HOCKEY_SCOPE_OPTIONS.filter(s => s.id === 'dnp');
        return HOCKEY_SCOPE_OPTIONS;
    },

    findPropDef(propId) {
        if (propId === 'none') return HOCKEY_NONE_PROP;
        return HOCKEY_NUMERIC_PROPS.find(p => p.id === propId) || null;
    },

    isBinaryProp() { return false; },

    getDefaultDirection() { return 'gte'; },

    async runCheck(conditions, team) {
        return runHockeyParlayCheck(conditions, team);
    },
};

// ============================================================
// MLB ADAPTER
// ============================================================
// Strip a trailing "(Game N)" tag from a team/lineup string.
function mlbStripGameTag(s) { return String(s || '').replace(/\s*\(Game\s*\d+\)\s*$/i, '').trim(); }
function mlbGameNumOf(s) { const m = String(s || '').match(/\(Game\s*(\d+)\)/i); return m ? parseInt(m[1]) : null; }

// A selection key encodes team + optional game leg: "MIL" or "MIL|2".
function mlbKey(code, gameNum) { return gameNum ? `${code}|${gameNum}` : code; }
function mlbParseKey(key) { const [code, gn] = String(key).split('|'); return { code, gameNum: gn ? parseInt(gn) : null }; }

const MLB_ADAPTER = {
  id: 'mlb',
  label: 'MLB',
  teamNames: MLB_TEAM_FULL_NAMES,
  allProps: MLB_ALL_PROPS,
  numericProps: MLB_NUMERIC_PROPS,
  binaryProps: [],
  noneProp: MLB_NONE_PROP,
  injuredProp: MLB_INJURED_PROP,
  scopeOptions: MLB_SCOPE_OPTIONS,
  maxStatValue: MLB_MAX_STAT_VALUE,
  hasBinaryProps: false,
  usesGameEntries: true,   // tells renderTeamSelector to render team-game buttons (doubleheaders twice)

  async loadInitialData() {
    const [games, lineups] = await Promise.all([fetchMLBGames(), fetchMLBLineups()]);
    state.games = games;
    state.mlbLineups = lineups;   // cached; fetchRoster slices by team + game leg
    state.nameMap = null;
    state.reverseNameMap = null;
  },

  // Returns team-game entries from the slate: a doubleheader team appears twice.
  // Each: { key, code, gameNum, label }.
  gameEntries(games) {
    const seen = new Map();  // code -> Set(gameNum)
    (games || []).forEach(g => {
      if (hasStarted(g['Gametime'])) return;   // [STARTED-GAME HIDING] same convention as WNBA/football
      const matchup = g['Matchup'] || '';
      const gameNum = mlbGameNumOf(matchup);
      Object.entries(MLB_TEAM_FULL_NAMES).forEach(([code, full]) => {
        if (matchup.includes(full)) {
          if (!seen.has(code)) seen.set(code, new Set());
          seen.get(code).add(gameNum || 1);
        }
      });
    });
    const entries = [];
    // [FULL NAMES] labels are full team names, sorted by name
    [...seen.keys()].sort((a, b) => (MLB_TEAM_FULL_NAMES[a] || a).localeCompare(MLB_TEAM_FULL_NAMES[b] || b)).forEach(code => {
      const nums = [...seen.get(code)].sort((a, b) => a - b);
      const isDh = nums.length > 1;
      const full = MLB_TEAM_FULL_NAMES[code] || code;
      nums.forEach(n => entries.push({
        key: mlbKey(code, isDh ? n : null),
        code, gameNum: isDh ? n : null,
        label: isDh ? `${full} (Game ${n})` : full,
      }));
    });
    return entries;
  },

  // Kept for compatibility with the shared disable-logic path (unused when usesGameEntries).
  extractTeamsPlaying(games) {
    return [...new Set(this.gameEntries(games).map(e => e.code))].sort();
  },

  async fetchRoster(key) {
    const { code, gameNum } = mlbParseKey(key);
    const fullName = MLB_TEAM_FULL_NAMES[code] || code;
    const rosterRows = await fetchMLBRoster(fullName);
    return processMLBRoster(state.mlbLineups || [], rosterRows, fullName, gameNum);
  },

  getRosterGroups(roster) {
    const inLineup = roster.filter(p => p.inLineup);
    const others = roster.filter(p => !p.inLineup);
    const lineupLabel = roster.status === 'Confirmed' ? 'Confirmed Lineup' : 'Projected Lineup';
    // Other batters are always shown. On a Confirmed lineup they're flagged isInjured
    // (see processMLBRoster), which forces them to Does Not Play and locks the scope.
    return { [lineupLabel]: inLineup, 'Other Batters': others };
  },

  getScopeOptionsForPlayer(p) {
    if (!p) return [];
    if (p.isInjured) return MLB_SCOPE_OPTIONS.filter(s => s.id === 'dnp');   // Confirmed-lineup bench: DNP only, locked
    return MLB_SCOPE_OPTIONS;
  },

  findPropDef(propId) {
    if (propId === 'none') return MLB_NONE_PROP;
    if (propId === 'dnp') return MLB_INJURED_PROP;
    return MLB_NUMERIC_PROPS.find(p => p.id === propId) || null;
  },

  isBinaryProp() { return false; },
  getDefaultDirection() { return 'gte'; },

  // Friendly label for a selection key (e.g. "MIL|2" -> "Milwaukee Brewers (Game 2)").
  displayLabel(key) { const { code, gameNum } = mlbParseKey(key); return (MLB_TEAM_FULL_NAMES[code] || code) + (gameNum ? ` (Game ${gameNum})` : ''); },

  async runCheck(conditions, key) {
    return runMLBParlayCheck(conditions, mlbParseKey(key).code);
  },
};

// ============================================================
// WNBA ROSTER PROCESSING
// ============================================================
// Role is 'Starter' | 'Bench' | 'Not Playing'. A 'Not Playing' role (or an
// OUT/OFS tag) locks the player to Does Not Play, exactly like an NBA
// 'Injury' lineup value. Any other tag (e.g. a game-time-decision flag) is
// shown next to her name but still allows the full prop menu.
// Names need no alias table: WBasketMatchupsPlayers.Player and
// WNBAGameLogs."Player Name" use identical spellings.
function processWNBARoster(rows, team) {
    const map = new Map();

    (rows || []).forEach(row => {
        const name = String(row['Player'] || '').trim();
        if (!name || map.has(name)) return;

        const role = String(row['Role'] || '').trim();
        const tag = String(row['Tag'] || '').trim();
        const status = String(row['Status'] || '').trim();
        const injury = String(row['Injury'] || '').trim();
        const position = String(row['Position'] || '').trim();

        const isNotPlaying = role === WNBA_ROLE_NOT_PLAYING;
        const isDnpTag = !!tag && WNBA_DNP_TAGS.includes(tag.toUpperCase());
        const isInjured = isNotPlaying || isDnpTag;

        map.set(name, {
            displayName: tag ? `${name} (${tag})` : name,
            cleanName: name,
            gameLogName: name,
            team,
            position,
            role,
            injury,
            status,
            tag,
            isInjured,
            isStarter: !isInjured && role === WNBA_ROLE_STARTER,
            isBench: !isInjured && role === WNBA_ROLE_BENCH,
            isMinorTag: !isInjured && !!tag,
        });
    });

    return [...map.values()].sort((a, b) => {
        const order = p => (p.isStarter ? 0 : p.isInjured ? 2 : 1);
        const ao = order(a), bo = order(b);
        return ao !== bo ? ao - bo : a.displayName.localeCompare(b.displayName);
    });
}

// ============================================================
// MLB ROSTER PROCESSING
// ============================================================
// Builds the player list for a team's game leg: the posted lineup (in batting order),
// then all other roster batters (Position 'B'). Joined entirely by FanGraphs Player ID.
// Returns an array (with a .status property: 'Confirmed' | 'Projected' | '').
function processMLBRoster(allLineups, rosterRows, fullName, gameNum) {
  // Lineup rows for this exact leg: Team is "Full Name" (single) or "Full Name (Game N)".
  const legRows = (allLineups || []).filter(r => {
    const t = String(r['Team'] || '').trim();
    if (mlbStripGameTag(t) !== fullName) return false;
    const rn = mlbGameNumOf(t);
    return gameNum ? rn === gameNum : true;
  });

  let status = '';
  const players = [];
  const inLineupIds = new Set();

  legRows
    .slice()
    .sort((a, b) => (parseInt(a['Order']) || 99) - (parseInt(b['Order']) || 99))
    .forEach(r => {
      const pid = String(r['Player ID'] || '').trim();
      const name = String(r['Player'] || '').trim();
      if (!pid || !name) return;
      if (!status) status = String(r['Lineup Status'] || '').trim();
      inLineupIds.add(pid);
      players.push({
        displayName: name, playerId: pid,
        bats: String(r['Bats'] || '').trim(),
        battingOrder: parseInt(r['Order']) || null,
        inLineup: true, isInjured: false, team: fullName,
      });
    });

  (rosterRows || []).forEach(r => {
    if (String(r['Position'] || '').trim().toUpperCase() !== 'B') return;   // batters only
    const pid = String(r['Player ID'] || '').trim();
    const name = String(r['Player'] || '').trim();
    if (!pid || !name || inLineupIds.has(pid)) return;
    players.push({
      displayName: name, playerId: pid,
      bats: String(r['Batting Hand'] || '').trim(),
      battingOrder: null, inLineup: false,
      isInjured: status === 'Confirmed',   // confirmed lineup => bench can only be "Does Not Play"
      team: fullName,
    });
  });

  // Other batters sorted alphabetically; lineup batters keep batting order (already sorted).
  const lineup = players.filter(p => p.inLineup);
  const others = players.filter(p => !p.inLineup).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const result = [...lineup, ...others];
  result.status = status;
  return result;
}

// ============================================================
// ROSTER PROCESSING
// ============================================================
function processNBARoster(data, team) {
    const map = new Map();
    data.forEach(row => {
        const displayName = (row['Player'] || '').trim();
        if (!displayName || map.has(displayName)) return;
        const lineup = (row['Lineup'] || '').trim();
        const cleanName = stripQualifier(displayName);
        let gl = state.reverseNameMap?.get(cleanName) || state.reverseNameMap?.get(displayName) || '';
        if (!gl) gl = constructNBAGameLogName(cleanName);
        map.set(displayName, { displayName, cleanName, gameLogName: gl, team, lineup,
            isInjured: lineup === 'Injury', isStarter: lineup.includes('Starter'), isBench: lineup.includes('Bench') });
    });
    return [...map.values()].sort((a, b) => {
        const ao = a.isStarter ? 0 : a.isInjured ? 2 : 1;
        const bo = b.isStarter ? 0 : b.isInjured ? 2 : 1;
        return ao !== bo ? ao - bo : a.displayName.localeCompare(b.displayName);
    });
}

function constructNBAGameLogName(name) {
    if (!name) return '';
    const t = name.trim().split(/\s+/); if (t.length < 2) return name;
    const last = t[t.length - 1];
    if (NBA_SUFFIXES.some(s => last === s || last === s.replace('.', '')) && t.length >= 3) { const suf = t.pop(); const ln = t.pop(); return `${ln}, ${t.join(' ')} ${suf}`; }
    const ln = t.pop(); return `${ln}, ${t.join(' ')}`;
}

function processHockeyRoster(data, team) {
    const map = new Map();

    // Debug: log first row keys and sample
    if (data.length > 0) {
        console.log('🏒 Roster sample keys:', Object.keys(data[0]));
        console.log('🏒 Roster sample row:', JSON.stringify(data[0]).substring(0, 300));
        console.log('🏒 Name map size:', state.nameMap?.size || 0);
    }

    data.forEach(row => {
        const rawName = (row['Skater Name'] || '').trim();
        if (!rawName) return;

        const injuryStatus = parseHockeyInjury(rawName);
        const cleanName = stripHockeyInjury(rawName);
        if (map.has(cleanName)) return;

        // Determine if this is a DNP-only injury
        const isDNPInjury = injuryStatus && HOCKEY_DNP_INJURIES.includes(injuryStatus);
        const isMinorInjury = injuryStatus && HOCKEY_MINOR_INJURIES.includes(injuryStatus);

        // Look up game log name and player ID from NormalNames
        let gameLogName = cleanName;
        let playerId = null;
        const nameInfo = state.nameMap?.get(cleanName);
        if (nameInfo) {
            gameLogName = nameInfo.gameLogName || cleanName;
            playerId = nameInfo.playerId || null;
        } else {
            console.warn(`🏒 No NormalNames entry for "${cleanName}"`);
        }

        // Display name: show injury status if present
        const displayName = injuryStatus ? `${cleanName} (${injuryStatus})` : cleanName;

        map.set(cleanName, {
            displayName,
            cleanName,
            gameLogName,
            playerId,
            team,
            injuryStatus,
            isInjured: isDNPInjury,       // Out/IR/LTIR → forced DNP
            isMinorInjury,                 // DTD → main group but flagged
            isStarter: false,
            isBench: false,
        });
    });

    // Debug: log a few resolved players
    const sample = [...map.values()].slice(0, 3);
    sample.forEach(p => console.log(`🏒 Roster: "${p.cleanName}" → gameLog="${p.gameLogName}", PID=${p.playerId}`));

    return [...map.values()].sort((a, b) => {
        // Healthy first, then DTD, then injured
        const ao = a.isInjured ? 2 : a.isMinorInjury ? 1 : 0;
        const bo = b.isInjured ? 2 : b.isMinorInjury ? 1 : 0;
        return ao !== bo ? ao - bo : a.cleanName.localeCompare(b.cleanName);
    });
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async function () {
    injectStyles();
    const root = document.getElementById('stc-root'); if (!root) return;

    const visibleSports = getVisibleSports();

    if (visibleSports.length === 0) {
        root.innerHTML = '<div class="stc-error">No sports are currently enabled.</div>';
        return;
    }

    // Default to first visible sport
    state.activeSport = visibleSports[0];

    root.innerHTML = `<div class="stc-header"><h1 class="stc-title">Same Game Parlay <span class="stc-title-accent">Builder</span></h1>
        <p class="stc-subtitle">Backtest your SGP legs against real game logs and see how often they actually hit together</p></div>
        <div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Loading...</div></div>`;

    try {
        await getAdapter().loadInitialData();
        renderApp(root);
    } catch (e) {
        console.error('Init error:', e);
        root.innerHTML = `<div class="stc-header"><h1 class="stc-title">Same Game Parlay <span class="stc-title-accent">Builder</span></h1></div><div class="stc-error">Failed to load. Please refresh.</div>`;
    }
});

function renderApp(root) {
    root.innerHTML = '';

    // Header
    const h = document.createElement('div'); h.className = 'stc-header';
    h.innerHTML = `<h1 class="stc-title">Same Game Parlay <span class="stc-title-accent">Builder</span></h1><p class="stc-subtitle">Backtest your SGP legs against real game logs and see how often they actually hit together</p>`;
    root.appendChild(h);

    // Sport tabs (only if multiple sports visible)
    const visibleSports = getVisibleSports().map(id => ({ id, label: SPORT_LABELS[id] || id.toUpperCase() }));

    if (visibleSports.length > 1) {
        const tabContainer = document.createElement('div'); tabContainer.className = 'stc-sport-tabs'; tabContainer.id = 'stc-sport-tabs';
        visibleSports.forEach(sport => {
            const tab = document.createElement('button');
            tab.className = `stc-sport-tab${state.activeSport === sport.id ? ' active' : ''}`;
            tab.textContent = sport.label;
            tab.dataset.sport = sport.id;
            tab.addEventListener('click', () => onSportTabClicked(sport.id));
            tabContainer.appendChild(tab);
        });
        root.appendChild(tabContainer);
    }

    // Content sections
    const ts = document.createElement('div'); ts.id = 'stc-team-section'; root.appendChild(ts); renderTeamSelector(ts);
    root.appendChild(Object.assign(document.createElement('div'), { id: 'stc-conditions-section' }));
    root.appendChild(Object.assign(document.createElement('div'), { id: 'stc-results-section' }));
}

// ============================================================
// SPORT TAB SWITCHING
// ============================================================
async function onSportTabClicked(sportId) {
    if (state.activeSport === sportId) return;

    state.activeSport = sportId;
    state.selectedTeam = null;
    state.conditions = [];
    state.results = null;
    state.roster = [];
    state.games = [];
    state.nameMap = null;
    state.reverseNameMap = null;
    state.mlbLineups = [];
    state.wnbaMatchupPlayers = [];
    state.footballPlayers = [];   // [FOOTBALL EDIT 4/6]
    state.openGroups = null;      // [COLLAPSIBLE DATES]

    const root = document.getElementById('stc-root');

    // Update tab active states
    const tabs = root.querySelectorAll('.stc-sport-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.sport === sportId));

    // Show loading in content area
    const ts = document.getElementById('stc-team-section');
    const cs = document.getElementById('stc-conditions-section');
    const rs = document.getElementById('stc-results-section');
    cs.innerHTML = ''; rs.innerHTML = '';
    ts.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Loading ${getAdapter().label}...</div></div>`;

    try {
        await getAdapter().loadInitialData();
        renderTeamSelector(ts);
    } catch (e) {
        console.error('Sport switch error:', e);
        ts.innerHTML = '<div class="stc-error">Failed to load. Please try again.</div>';
    }
}

// ============================================================
// TEAM SELECTOR
// ============================================================
function renderTeamSelector(c) {
    c.innerHTML = '';
    const adapter = getAdapter();
    const lbl = document.createElement('div'); lbl.className = 'stc-section-label'; lbl.textContent = 'Select a Team'; c.appendChild(lbl);

    // MLB-style: one button per team-game entry (a doubleheader team appears twice, G1 / G2).
    // [FOOTBALL EDIT 5/6] Entries may carry an optional `group` (football: game
    // date) — grouped entries render under a date header; ungrouped entries
    // (MLB) render exactly as before in a single grid. Entries may also carry
    // their own `title` (football: "Away @ Home · time ET" tooltip).
    if (adapter.usesGameEntries) {
        const entries = adapter.gameEntries(state.games);
        if (!entries.length) { c.innerHTML += '<div class="stc-no-games">No games scheduled for today.</div>'; return; }
        const groups = new Map();
        entries.forEach(e => { const g = e.group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); });
        // [COLLAPSIBLE DATES] date sections are expandables: the earliest is open by
        // default, the rest collapsed; selecting a team collapses everything so the
        // conditions panel lands right under the headers (see onTeamSelected).
        const hasGroups = [...groups.keys()].some(g => g);
        if (hasGroups && state.openGroups === null) state.openGroups = new Set([[...groups.keys()].find(g => g)]);
        groups.forEach((list, g) => {
            const open = !g || (state.openGroups && state.openGroups.has(g));
            if (g) {
                const hd = document.createElement('div'); hd.className = 'stc-section-label stc-day-label stc-day-toggle';
                const sel = list.find(e => e.key === state.selectedTeam);
                hd.innerHTML = `<span class="stc-chevron${open ? ' open' : ''}">&#9654;</span> ${g} <span class="stc-day-count">${list.length} teams${sel ? ' · ' + sel.label + ' selected' : ''}</span>`;
                hd.addEventListener('click', () => {
                    if (!state.openGroups) state.openGroups = new Set();
                    if (state.openGroups.has(g)) state.openGroups.delete(g); else state.openGroups.add(g);
                    renderTeamSelector(c);
                });
                c.appendChild(hd);
            }
            if (!open) return;
            const dhGrid = document.createElement('div'); dhGrid.className = 'stc-team-grid';
            list.forEach(e => {
                const b = document.createElement('button'); b.className = 'stc-team-btn';
                b.textContent = e.label;
                b.title = e.title || (adapter.teamNames[e.code] + (e.gameNum ? ` (Game ${e.gameNum})` : ''));
                if (state.selectedTeam === e.key) b.classList.add('active');
                b.addEventListener('click', () => onTeamSelected(e.key));
                dhGrid.appendChild(b);
            });
            c.appendChild(dhGrid);
        });
        return;
    }

    const tp = adapter.extractTeamsPlaying(state.games);
    if (!tp.length) { c.innerHTML += '<div class="stc-no-games">No games scheduled for today.</div>'; return; }
    // [FULL NAMES] labels are full team names (keys stay abbreviations), sorted by name.
    // [STARTED-GAME HIDING] adapters with hidesNonPlaying render ONLY teams playing
    // today whose game hasn't started (WNBA, like MLB/football); the others keep
    // the full list with non-playing teams greyed out until they're ported.
    const grid = document.createElement('div'); grid.className = 'stc-team-grid';
    const codes = adapter.hidesNonPlaying ? tp.slice() : Object.keys(adapter.teamNames);
    codes.sort((x, y) => String(adapter.teamNames[x] || x).localeCompare(String(adapter.teamNames[y] || y))).forEach(a => {
        const btn = document.createElement('button'); btn.className = 'stc-team-btn'; btn.textContent = adapter.teamNames[a] || a;
        btn.title = adapter.matchupLabel ? adapter.matchupLabel(a) : adapter.teamNames[a];
        if (!tp.includes(a)) btn.classList.add('disabled');
        else { if (state.selectedTeam === a) btn.classList.add('active'); btn.addEventListener('click', () => onTeamSelected(a)); }
        grid.appendChild(btn);
    });
    c.appendChild(grid);
}

// ============================================================
// TEAM SELECTED
// ============================================================
async function onTeamSelected(team) {
    const adapter = getAdapter();
    state.selectedTeam = team; state.conditions = []; state.results = null;
    if (state.openGroups) state.openGroups = new Set();   // [COLLAPSIBLE DATES] collapse all on select
    renderTeamSelector(document.getElementById('stc-team-section'));
    const cs = document.getElementById('stc-conditions-section');
    if (adapter.usesGameEntries && cs.scrollIntoView) cs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const teamLabel = adapter.displayLabel ? adapter.displayLabel(team) : adapter.teamNames[team];
    cs.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Loading ${teamLabel} roster...</div></div>`;
    document.getElementById('stc-results-section').innerHTML = '';
    try {
        state.roster = await adapter.fetchRoster(team);
        addCondition(); renderConditionsPanel(cs);
    } catch (e) { cs.innerHTML = '<div class="stc-error">Failed to load roster.</div>'; }
}

// ============================================================
// CONDITION STATE
// ============================================================
function addCondition() {
    if (state.conditions.length >= CONFIG.MAX_CONDITIONS) return;
    state.conditions.push({ id: Date.now() + Math.random(), player: null, scope: 'all', propId: null, propDef: null, direction: null, value: null });
}
function removeCondition(id) { state.conditions = state.conditions.filter(c => c.id !== id); renderConditionsPanel(document.getElementById('stc-conditions-section')); }

function getExistingScopeForPlayer(displayName, excludeId) {
    for (const c of state.conditions) {
        if (c.id !== excludeId && c.player?.displayName === displayName) return c.scope;
    }
    return null;
}

function syncScopeForPlayer(displayName, newScope) {
    const adapter = getAdapter();
    state.conditions.forEach(c => {
        if (c.player?.displayName === displayName) {
            c.scope = newScope;
            if (newScope === 'dnp') {
                c.propId = 'does_not_play'; c.propDef = adapter.injuredProp;
                c.direction = null; c.value = null;
            }
            if (newScope !== 'dnp' && c.propId === 'does_not_play') {
                c.propId = null; c.propDef = null; c.direction = null; c.value = null;
            }
        }
    });
}

function isPropUsed(excludeId, playerName, propId) {
    return state.conditions.some(c => c.id !== excludeId && c.player?.displayName === playerName && c.propId === propId);
}

function isPlayerLocked(displayName, excludeId) {
    return state.conditions.some(c => c.id !== excludeId && c.player?.displayName === displayName &&
        (c.propId === 'none' || c.scope === 'dnp'));
}

function validateConditions() {
    const adapter = getAdapter();
    if (!state.conditions.length) return false;
    return state.conditions.every(c => {
        if (!c.player) return false;
        if (c.scope === 'dnp') return true;
        if (c.propId === 'none') return true;
        if (!c.propDef) return false;
        if (adapter.isBinaryProp(c.propDef)) return c.direction === 'yes' || c.direction === 'no';
        return (c.value !== null && c.value !== undefined && c.value !== '') && (c.direction === 'gte' || c.direction === 'lt');
    });
}

// ============================================================
// RENDER CONDITIONS
// ============================================================
function renderConditionsPanel(container) {
    const adapter = getAdapter();
    container.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'stc-conditions-panel';
    const hdr = document.createElement('div'); hdr.className = 'stc-conditions-header';
    const selLabel = adapter.displayLabel ? adapter.displayLabel(state.selectedTeam) : adapter.teamNames[state.selectedTeam];
    hdr.innerHTML = `<div class="stc-conditions-title">${selLabel} — Conditions</div><div class="stc-conditions-count">${state.conditions.length} / ${CONFIG.MAX_CONDITIONS}</div>`;
    panel.appendChild(hdr);
    state.conditions.forEach((c, i) => panel.appendChild(renderConditionRow(c, i)));
    if (state.conditions.length < CONFIG.MAX_CONDITIONS) {
        const addBtn = document.createElement('button'); addBtn.className = 'stc-btn stc-btn-add'; addBtn.textContent = '+ Add Condition';
        addBtn.addEventListener('click', () => { addCondition(); renderConditionsPanel(container); });
        panel.appendChild(addBtn);
    }
    const actions = document.createElement('div'); actions.className = 'stc-actions';
    const checkBtn = document.createElement('button'); checkBtn.className = 'stc-btn stc-btn-primary'; checkBtn.textContent = 'Check'; checkBtn.id = 'stc-check-btn';
    checkBtn.disabled = !validateConditions(); checkBtn.addEventListener('click', onCheckClicked); actions.appendChild(checkBtn);
    const resetBtn = document.createElement('button'); resetBtn.className = 'stc-btn stc-btn-secondary'; resetBtn.textContent = 'Reset All';
    resetBtn.addEventListener('click', () => { state.conditions = []; state.results = null; addCondition(); renderConditionsPanel(container); document.getElementById('stc-results-section').innerHTML = ''; });
    actions.appendChild(resetBtn); panel.appendChild(actions); container.appendChild(panel);
}

function renderConditionRow(cond, index) {
    const adapter = getAdapter();
    const row = document.createElement('div'); row.className = 'stc-condition-row';
    const isDNP = cond.scope === 'dnp';

    // Row number
    row.appendChild(Object.assign(document.createElement('span'), { className: 'stc-row-number', textContent: `${index + 1}` }));

    // Player dropdown
    const playerSel = document.createElement('select'); playerSel.className = 'stc-select stc-select-player';
    playerSel.innerHTML = '<option value="">Player</option>';
    const groups = adapter.getRosterGroups(state.roster);
    Object.entries(groups).forEach(([gName, players]) => {
        if (!players.length) return;
        const og = document.createElement('optgroup'); og.label = gName;
        players.forEach(p => {
            const opt = document.createElement('option'); opt.value = p.displayName;
            const locked = isPlayerLocked(p.displayName, cond.id);
            if (locked) { opt.disabled = true; opt.textContent = `${p.displayName} (locked)`; }
            else { opt.textContent = p.displayName; }
            if (cond.player?.displayName === p.displayName) opt.selected = true;
            og.appendChild(opt);
        });
        playerSel.appendChild(og);
    });
    playerSel.addEventListener('change', e => {
        const p = state.roster.find(r => r.displayName === e.target.value);
        cond.player = p || null;
        if (p?.isInjured) {
            cond.scope = 'dnp'; cond.propId = 'does_not_play'; cond.propDef = adapter.injuredProp; cond.direction = null; cond.value = null;
        } else if (p) {
            if (cond.scope === 'dnp') { cond.scope = 'all'; cond.propId = null; cond.propDef = null; cond.direction = null; cond.value = null; }
            const es = getExistingScopeForPlayer(p.displayName, cond.id);
            if (es) {
                cond.scope = es;
                if (es === 'dnp') { cond.propId = 'does_not_play'; cond.propDef = adapter.injuredProp; cond.direction = null; cond.value = null; }
            } else {
                const allowed = adapter.getScopeOptionsForPlayer(p);
                if (!allowed.some(s => s.id === cond.scope)) cond.scope = allowed[0]?.id || 'all';
            }
        }
        renderConditionsPanel(document.getElementById('stc-conditions-section'));
    });
    row.appendChild(playerSel);

    if (cond.player) {
        // Scope dropdown
        const scopeOpts = adapter.getScopeOptionsForPlayer(cond.player);
        if (scopeOpts.length > 0) {
            const scopeSel = document.createElement('select'); scopeSel.className = 'stc-select stc-select-scope';
            scopeOpts.forEach(s => {
                const o = document.createElement('option'); o.value = s.id; o.textContent = s.label;
                if (cond.scope === s.id) o.selected = true;
                scopeSel.appendChild(o);
            });
            scopeSel.addEventListener('change', e => {
                syncScopeForPlayer(cond.player.displayName, e.target.value);
                renderConditionsPanel(document.getElementById('stc-conditions-section'));
            });
            row.appendChild(scopeSel);
        }

        // If NOT DNP scope, show prop/direction/value
        if (!isDNP) {
            // Prop dropdown
            const propSel = document.createElement('select'); propSel.className = 'stc-select stc-select-condition';
            propSel.innerHTML = '<option value="">Prop</option>';
            adapter.allProps.forEach(p => {
                const opt = document.createElement('option');
                if (p.type === 'separator') { opt.disabled = true; opt.textContent = p.label; }
                else {
                    opt.value = p.id; opt.textContent = p.label;
                    if (cond.propId === p.id) opt.selected = true;
                    if (isPropUsed(cond.id, cond.player?.displayName, p.id)) { opt.disabled = true; opt.textContent = `${p.label} (used)`; }
                }
                propSel.appendChild(opt);
            });
            propSel.addEventListener('change', e => {
                cond.propId = e.target.value; cond.propDef = adapter.findPropDef(e.target.value);
                if (cond.propId === 'none') { cond.direction = null; cond.value = null; }
                else if (cond.propDef) {
                    cond.direction = adapter.getDefaultDirection(cond.propDef);
                    cond.value = null;
                } else { cond.direction = null; cond.value = null; }
                renderConditionsPanel(document.getElementById('stc-conditions-section'));
            });
            row.appendChild(propSel);

            // Direction + value (not for None)
            if (cond.propDef && cond.propId !== 'none') {
                const isBin = adapter.isBinaryProp(cond.propDef);
                if (!isBin) {
                    // Numeric: ≥ / < direction + value input
                    const dirSel = document.createElement('select'); dirSel.className = 'stc-select stc-select-direction';
                    dirSel.innerHTML = `<option value="gte" ${cond.direction === 'gte' ? 'selected' : ''}>≥</option><option value="lt" ${cond.direction === 'lt' ? 'selected' : ''}>&lt;</option>`;
                    dirSel.addEventListener('change', e => { cond.direction = e.target.value; }); row.appendChild(dirSel);

                    const valIn = document.createElement('input'); valIn.type = 'number'; valIn.className = 'stc-input stc-input-value';
                    valIn.min = 0; valIn.max = adapter.maxStatValue; valIn.placeholder = '0';
                    if (cond.value !== null && cond.value !== undefined) valIn.value = cond.value;
                    valIn.addEventListener('input', e => {
                        let v = parseInt(e.target.value);
                        if (isNaN(v) || v < 0) v = 0;
                        if (v > adapter.maxStatValue) v = adapter.maxStatValue;
                        cond.value = v; e.target.value = v || '';
                    });
                    valIn.addEventListener('change', () => { const b = document.getElementById('stc-check-btn'); if (b) b.disabled = !validateConditions(); });
                    row.appendChild(valIn);
                } else {
                    // Binary: Yes / No
                    const dirSel = document.createElement('select'); dirSel.className = 'stc-select stc-select-direction';
                    dirSel.innerHTML = `<option value="yes" ${cond.direction === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${cond.direction === 'no' ? 'selected' : ''}>No</option>`;
                    dirSel.addEventListener('change', e => { cond.direction = e.target.value; }); row.appendChild(dirSel);
                }
            }
        }
    }

    const rmBtn = document.createElement('button'); rmBtn.className = 'stc-btn-remove'; rmBtn.innerHTML = '&#x2715;'; rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', () => removeCondition(cond.id)); row.appendChild(rmBtn);
    return row;
}

// ============================================================
// CHECK
// ============================================================
async function onCheckClicked() {
    if (!validateConditions()) return;
    const adapter = getAdapter();
    const rs = document.getElementById('stc-results-section');
    const btn = document.getElementById('stc-check-btn');
    btn.disabled = true; btn.textContent = 'Checking...';
    rs.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Analyzing game logs...</div></div>`;
    try {
        const results = await adapter.runCheck(state.conditions, state.selectedTeam);
        state.results = results;
        if (results.error) rs.innerHTML = `<div class="stc-error">${results.error}</div>`;
        else renderResults(rs, results);
    } catch (e) { console.error('Check error:', e); rs.innerHTML = '<div class="stc-error">An error occurred. Please try again.</div>'; }
    finally { btn.disabled = false; btn.textContent = 'Check'; }
}

// ============================================================
// RESULTS (shared rendering for all sports)
// ============================================================
function renderResults(container, results) {
    container.innerHTML = '';
    // [FOOTBALL EDIT 6/6] the "recent" window label comes from the adapter
    // (football = "Last 5 Games"); every other sport keeps "Last 30 Days".
    const recentLabel = getAdapter().recentLabel || 'Last 30 Days';
    const w = document.createElement('div'); w.className = 'stc-results';
    const combined = document.createElement('div'); combined.className = 'stc-results-combined';
    combined.innerHTML = `
        <div class="stc-results-combined-title">Combined Result &mdash; All ${results.conditionCount} Condition${results.conditionCount > 1 ? 's' : ''} Met</div>
        <div class="stc-result-stats">
            <div class="stc-result-stat"><div class="stc-result-stat-label">Eligible Games</div><div class="stc-result-stat-value">${results.combined.rate}%</div><div class="stc-result-stat-detail">${results.combined.hits} of ${results.combined.eligible} games</div></div>
            <div class="stc-result-stat"><div class="stc-result-stat-label">${recentLabel}</div><div class="stc-result-stat-value">${results.combined.last30Rate}%</div><div class="stc-result-stat-detail">${results.combined.last30Hits} of ${results.combined.last30Eligible} games</div></div>
            <div class="stc-result-stat stc-result-stat-muted"><div class="stc-result-stat-label">Team Games</div><div class="stc-result-stat-value">${results.teamGames.season}</div><div class="stc-result-stat-detail">${results.teamGames.last30} in ${recentLabel.toLowerCase()}</div></div>
        </div>`;
    if (results.combined.dates?.length > 0) {
        const toggle = document.createElement('div'); toggle.className = 'stc-dates-toggle';
        toggle.innerHTML = `<span class="stc-chevron">&#9654;</span> Show ${results.combined.dates.length} qualifying game date${results.combined.dates.length !== 1 ? 's' : ''}`;
        const dl = document.createElement('div'); dl.className = 'stc-dates-list';
        dl.innerHTML = results.combined.dates.map(d => `<span>${d}</span>`).join('');
        toggle.addEventListener('click', () => { const o = dl.classList.toggle('open'); toggle.querySelector('.stc-chevron').classList.toggle('open', o); });
        combined.appendChild(toggle); combined.appendChild(dl);
    }
    w.appendChild(combined);

    if (results.individual?.length > 1) {
        const indiv = document.createElement('div'); indiv.className = 'stc-results-individual';
        const title = document.createElement('div'); title.className = 'stc-results-individual-title';
        title.innerHTML = '<span class="stc-chevron open">&#9654;</span> Individual Condition Breakdowns';
        const body = document.createElement('div'); body.id = 'stc-individual-body';
        const hRow = document.createElement('div'); hRow.className = 'stc-individual-row'; hRow.style.borderBottom = '2px solid var(--stc-border)';
        hRow.innerHTML = `<div class="stc-individual-label" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">CONDITION</div>
            <div class="stc-individual-values"><div class="stc-individual-season" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">SEASON</div>
            <div class="stc-individual-last30" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">${recentLabel.toUpperCase()}</div></div>`;
        body.appendChild(hRow);
        results.individual.forEach(r => {
            const row = document.createElement('div'); row.className = 'stc-individual-row';
            row.innerHTML = `<div class="stc-individual-label"><strong>${r.playerName}</strong> &mdash; ${r.description}</div>
                <div class="stc-individual-values">
                    <div class="stc-individual-season"><div class="stc-rate">${r.seasonRate}%</div><div class="stc-detail">${r.seasonHits} / ${r.seasonEligible}</div></div>
                    <div class="stc-individual-last30"><div class="stc-rate">${r.last30Rate}%</div><div class="stc-detail">${r.last30Hits} / ${r.last30Eligible}</div></div></div>`;
            body.appendChild(row);
        });
        title.addEventListener('click', () => { const v = body.style.display !== 'none'; body.style.display = v ? 'none' : 'block'; title.querySelector('.stc-chevron').classList.toggle('open', !v); });
        indiv.appendChild(title); indiv.appendChild(body); w.appendChild(indiv);
    }
    container.appendChild(w);
}

// ============================================================
// DEBUG
// ============================================================
window.stcDebug = {
    getState: () => state,
    getRoster: () => state.roster,
    getConditions: () => state.conditions,
    getResults: () => state.results,
    getActiveSport: () => state.activeSport,
    getSportVisibility: () => SPORT_VISIBILITY,
};
