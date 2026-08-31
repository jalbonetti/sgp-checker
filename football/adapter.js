// football/adapter.js — the NFL and NCAAF adapter objects for main.js
//
// Both sports share this factory; main.js imports NFL_ADAPTER / NCAAF_ADAPTER
// and maps them in getAdapter(). Requires two small shared changes in main.js
// (documented in INTEGRATION.md): grouped team entries in renderTeamSelector,
// and an adapter-provided label for the "recent" results column.

import {
  FOOTBALL_SPORTS, FOOTBALL_POSITIONS, FOOTBALL_POSITION_LABELS, FOOTBALL_DNP_TAGS,
  FOOTBALL_STATUS_NOT_PLAYING, FOOTBALL_SCOPE_OPTIONS, FOOTBALL_MAX_STAT_VALUE,
  FOOTBALL_NONE_PROP, FOOTBALL_INJURED_PROP, FOOTBALL_RECENT_GAMES,
  footballNumericProps, footballAllProps,
} from './config.js';
import { fetchFootballGames, fetchFootballMatchupPlayers } from './dataService.js';
import { runFootballParlayCheck } from './parlayEngine.js';

// ---- ET-aware kickoff parsing ("3:00 PM ET 8/29/2026") ----
function parseStampEt(stamp) {
  const m = String(stamp || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*E[DS]?T\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12; if (m[3].toUpperCase() === 'PM') h += 12;
  const y = +m[6], mo = +m[4] - 1, d = +m[5];
  const mar = new Date(Date.UTC(y, 2, 1)), nov = new Date(Date.UTC(y, 10, 1));
  const dstStart = 1 + ((7 - mar.getUTCDay()) % 7) + 7, dstEnd = 1 + ((7 - nov.getUTCDay()) % 7);
  const off = ((mo > 2) || (mo === 2 && d >= dstStart)) && ((mo < 10) || (mo === 10 && d < dstEnd)) ? 4 : 5;
  return new Date(Date.UTC(y, mo, d, h + off, +m[2]));
}
function dayLabelOf(stamp) {
  const m = String(stamp || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 'Upcoming';
  const d = new Date(+m[3], +m[1] - 1, +m[2]);
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${+m[1]}/${+m[2]}`;
}
function timeOf(stamp) { const m = String(stamp || '').match(/^(\d{1,2}:\d{2}\s*[AP]M)/i); return m ? m[1] : ''; }

// ---- Roster processing: position buckets, Playing / Does Not Play ----
function processFootballRoster(rows, teamValue) {
  const map = new Map();
  (rows || []).forEach(row => {
    const name = String(row['Player'] || '').trim();
    if (!name || map.has(name)) return;
    const position = String(row['Position'] || '').trim().toUpperCase();
    if (!FOOTBALL_POSITIONS.includes(position)) return;           // QB/RB/WR only
    const status = String(row['Status'] || '').trim();
    const tag = String(row['Tag'] || '').trim();
    const injury = String(row['Injury'] || '').trim();
    const isInjured = status === FOOTBALL_STATUS_NOT_PLAYING || (!!tag && FOOTBALL_DNP_TAGS.includes(tag.toUpperCase()));
    map.set(name, {
      displayName: tag ? `${name} (${tag})` : name,
      cleanName: name, gameLogName: name,
      team: teamValue, position, injury, status, tag,
      isInjured, isStarter: false, isBench: false,
      isMinorTag: !isInjured && !!tag,
    });
  });
  const posOrder = p => FOOTBALL_POSITIONS.indexOf(p.position);
  return [...map.values()].sort((a, b) => {
    if (a.isInjured !== b.isInjured) return a.isInjured ? 1 : -1;
    const po = posOrder(a) - posOrder(b);
    return po !== 0 ? po : a.displayName.localeCompare(b.displayName);
  });
}

export function makeFootballAdapter(sportId, state) {
  const sp = FOOTBALL_SPORTS[sportId];
  const numericProps = footballNumericProps(sportId);

  return {
    id: sportId,
    label: sp.label,
    teamNames: {},                 // filled at load: teamValue -> full name
    allProps: footballAllProps(sportId),
    numericProps,
    binaryProps: [],
    noneProp: FOOTBALL_NONE_PROP,
    injuredProp: FOOTBALL_INJURED_PROP,
    scopeOptions: FOOTBALL_SCOPE_OPTIONS,
    maxStatValue: FOOTBALL_MAX_STAT_VALUE,
    hasBinaryProps: false,
    usesGameEntries: true,         // grouped-by-date team buttons (see INTEGRATION.md)
    recentLabel: `Last ${FOOTBALL_RECENT_GAMES} Games`,   // results column label

    async loadInitialData() {
      const [games, players] = await Promise.all([fetchFootballGames(sportId), fetchFootballMatchupPlayers(sportId)]);
      state.games = games;
      state.footballPlayers = players;
      state.nameMap = null; state.reverseNameMap = null;
      // teamValue -> full name. NFL: abbreviations from the Matchup ID, full
      // names from the game row's "Matchup" column. CFB: identity.
      const names = {};
      games.forEach(g => {
        const id = String(g['Matchup ID'] || '');
        const fulls = String(g['Matchup'] || '').split('@').map(x => x.trim());
        const codes = id.split('|')[0].split('@').map(x => x.trim());
        if (codes.length === 2 && fulls.length === 2) { names[codes[0]] = fulls[0]; names[codes[1]] = fulls[1]; }
      });
      this.teamNames = names;
    },

    // Team-game entries for teams whose game has NOT started, grouped by
    // game date. Games already kicked off drop out (last games of a slate
    // persist until the next build — intended). Each: { key, code, label,
    // group, sortKey }.
    gameEntries(games) {
      const now = Date.now();
      const entries = [];
      (games || []).forEach(g => {
        const stamp = String(g['Gametime'] || '');
        const kick = parseStampEt(stamp);
        if (kick && kick.getTime() <= now) return;
        const id = String(g['Matchup ID'] || '');
        const codes = id.split('|')[0].split('@').map(x => x.trim());
        if (codes.length !== 2) return;
        const group = dayLabelOf(stamp);
        codes.forEach((code, i) => entries.push({
          key: code, code,
          label: this.teamNames[code] || code,
          group, sortKey: kick ? kick.getTime() : Infinity,
          title: `${this.teamNames[codes[0]] || codes[0]} @ ${this.teamNames[codes[1]] || codes[1]}${timeOf(stamp) ? ' · ' + timeOf(stamp) + ' ET' : ''}`,
        }));
      });
      const seen = new Set();
      return entries
        .sort((a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label))
        .filter(e => (seen.has(e.key) ? false : (seen.add(e.key), true)));
    },

    extractTeamsPlaying(games) { return [...new Set(this.gameEntries(games).map(e => e.code))].sort(); },

    matchupLabel(code) { const e = this.gameEntries(state.games).find(x => x.code === code); return e ? e.title : (this.teamNames[code] || code); },
    displayLabel(key) { return this.teamNames[key] || key; },

    async fetchRoster(key) {
      const rows = (state.footballPlayers || []).filter(r => String(r['Team'] || '').trim() === key);
      return processFootballRoster(rows, key);
    },

    getRosterGroups(roster) {
      const groups = {};
      FOOTBALL_POSITIONS.forEach(p => { groups[FOOTBALL_POSITION_LABELS[p]] = []; });
      groups['Injured / Out'] = [];
      roster.forEach(p => { (p.isInjured ? groups['Injured / Out'] : groups[FOOTBALL_POSITION_LABELS[p.position]]).push(p); });
      Object.keys(groups).forEach(k => { if (!groups[k].length) delete groups[k]; });
      return groups;
    },

    getScopeOptionsForPlayer(p) {
      if (!p) return [];
      if (p.isInjured) return FOOTBALL_SCOPE_OPTIONS.filter(s => s.id === 'dnp');
      return FOOTBALL_SCOPE_OPTIONS;
    },

    findPropDef(propId) {
      if (propId === 'none') return FOOTBALL_NONE_PROP;
      if (propId === 'does_not_play') return FOOTBALL_INJURED_PROP;
      return numericProps.find(p => p.id === propId) || null;
    },

    isBinaryProp() { return false; },
    getDefaultDirection() { return 'gte'; },

    async runCheck(conditions, key) {
      const rosterNames = (state.roster || []).map(p => p.cleanName);
      return runFootballParlayCheck(sportId, conditions, key, rosterNames);
    },
  };
}
