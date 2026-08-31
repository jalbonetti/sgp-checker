// football/config.js — NFL + CFB adapter config for the Same-Team Prop Checker
//
// One config serves both football sports; the differences are table names,
// column names, and how a "game date" is keyed (NFL logs have season/week,
// CFB logs have a real game_date). QB / RB / WR props only.
//
// Rules carried from the site's other football surfaces:
//   - availability comes from the Matchups tables (teams whose game hasn't
//     started; the last games of a slate stay "available" until the next
//     build — intended, same as every other sport)
//   - no starter/bench concept: players are "Playing" or "Does Not Play",
//     grouped by POSITION bucket instead of role
//   - clearance history is ONLY the player's CURRENT team and CURRENT season

export const FOOTBALL_CURRENT_SEASON = 2026;   // bump annually at season start

export const FOOTBALL_SPORTS = {
  nfl: {
    id: 'nfl',
    label: 'NFL',
    tables: { game: 'FootballMatchupsGame', players: 'FootballMatchupsPlayers', logs: 'FootballGameLogs' },
    logCols: {
      player: 'player_display_name', team: 'team', opponent: 'opponent_team',
      season: 'season', week: 'week', seasonType: 'season_type', gameDate: null,
      completions: 'completions', attempts: 'attempts', passYds: 'passing_yards', passTds: 'passing_tds',
      ints: 'passing_interceptions', carries: 'carries', rushYds: 'rushing_yards', rushTds: 'rushing_tds',
      receptions: 'receptions', targets: 'targets', recYds: 'receiving_yards', recTds: 'receiving_tds',
    },
    // Matchups tables carry NFL teams as abbreviations; full names live in the
    // game row's "Matchup" column ("Away Full @ Home Full") and are resolved
    // at load so the selector shows full names (site-wide convention).
    teamsAreAbbrev: true,
    hasTargets: true,
  },
  ncaaf: {
    id: 'ncaaf',
    label: 'NCAAF',
    tables: { game: 'CFBallMatchupsGame', players: 'CFBallMatchupsPlayers', logs: 'CFBallGameLogs' },
    logCols: {
      player: 'player', team: 'team', opponent: 'opponent',
      season: 'season', week: 'week', seasonType: 'season_type', gameDate: 'game_date',
      completions: 'completions', attempts: 'attempts', passYds: 'passing_yards', passTds: 'passing_tds',
      ints: 'passing_interceptions', carries: 'carries', rushYds: 'rushing_yards', rushTds: 'rushing_tds',
      receptions: 'receptions', targets: null, recYds: 'receiving_yards', recTds: 'receiving_tds',
    },
    teamsAreAbbrev: false,   // full Odds-API names everywhere in the matchups tables
    hasTargets: false,
  },
};

// Positions the checker rosters (TE/K/DST are out of scope by decision).
export const FOOTBALL_POSITIONS = ['QB', 'RB', 'WR'];
export const FOOTBALL_POSITION_LABELS = { QB: 'Quarterbacks', RB: 'Running Backs', WR: 'Wide Receivers' };

// Tags that lock a player to Does Not Play; anything else (Q/D/P) is shown
// next to the name but leaves the full prop menu available.
export const FOOTBALL_DNP_TAGS = ['OUT', 'O', 'IR', 'PUP', 'NFI', 'SUSP', 'OFS'];
export const FOOTBALL_STATUS_NOT_PLAYING = 'Not Playing';

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// Props are defined against logical column keys (resolved per sport through
// logCols) so one list serves both leagues. `compute` props derive from
// several columns.
export function footballNumericProps(sportId) {
  const c = FOOTBALL_SPORTS[sportId].logCols;
  const props = [
    { id: 'pass_yds',  label: 'Passing Yards',        column: c.passYds },
    { id: 'pass_tds',  label: 'Passing TDs',          column: c.passTds },
    { id: 'comp',      label: 'Completions',          column: c.completions },
    { id: 'pass_att',  label: 'Pass Attempts',        column: c.attempts },
    { id: 'ints',      label: 'Interceptions',        column: c.ints },
    { id: 'rush_yds',  label: 'Rushing Yards',        column: c.rushYds },
    { id: 'carries',   label: 'Rushing Attempts',     column: c.carries },
    { id: 'rush_tds',  label: 'Rushing TDs',          column: c.rushTds },
    { id: 'rec',       label: 'Receptions',           column: c.receptions },
    { id: 'rec_yds',   label: 'Receiving Yards',      column: c.recYds },
    { id: 'rec_tds',   label: 'Receiving TDs',        column: c.recTds },
    { id: 'any_td',    label: 'Rush + Rec TDs',       compute: (l) => num(l[c.rushTds]) + num(l[c.recTds]) },
    { id: 'pr_yds',    label: 'Pass + Rush Yards',    compute: (l) => num(l[c.passYds]) + num(l[c.rushYds]) },
    { id: 'rr_yds',    label: 'Rush + Rec Yards',     compute: (l) => num(l[c.rushYds]) + num(l[c.recYds]) },
  ];
  if (c.targets) props.splice(9, 0, { id: 'targets', label: 'Targets', column: c.targets });
  return props;
}

export const FOOTBALL_NONE_PROP = { id: 'none', label: 'None', column: null, type: 'none' };
export const FOOTBALL_INJURED_PROP = { id: 'does_not_play', label: 'Does Not Play', column: null, type: 'injured_filter' };

export function footballAllProps(sportId) {
  return [FOOTBALL_NONE_PROP, { id: '_sep0', label: '───────────', type: 'separator' }, ...footballNumericProps(sportId)];
}

// Scopes: no starts/bench in football.
export const FOOTBALL_SCOPE_OPTIONS = [
  { id: 'all', label: 'All Games' },
  { id: 'dnp', label: 'Does Not Play' },
];

export const FOOTBALL_MAX_STAT_VALUE = 500;   // passing yards can run high
export const FOOTBALL_RECENT_GAMES = 5;       // "recent" window = last 5 team games (site L5 convention)
