// mlb/config.js — MLB (Baseball) adapter config for the Same-Team Prop Checker
// Batter props only. Everything joins on the FanGraphs Player ID across
// BaseballMatchupsGame, BaseballLineups, BaseballRosters, and BaseballGameLogs.

// Team code -> full name. Codes match the Matchups / game-log abbreviations;
// full names match BaseballRosters / BaseballLineups.
export const MLB_TEAM_FULL_NAMES = {
  ARI: 'Arizona Diamondbacks',
  ATL: 'Atlanta Braves',
  BAL: 'Baltimore Orioles',
  BOS: 'Boston Red Sox',
  CHC: 'Chicago Cubs',
  CHW: 'Chicago White Sox',
  CIN: 'Cincinnati Reds',
  CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies',
  DET: 'Detroit Tigers',
  ATH: 'Athletics',
  HOU: 'Houston Astros',
  KCR: 'Kansas City Royals',
  LAA: 'Los Angeles Angels',
  LAD: 'Los Angeles Dodgers',
  MIA: 'Miami Marlins',
  MIL: 'Milwaukee Brewers',
  MIN: 'Minnesota Twins',
  NYM: 'New York Mets',
  NYY: 'New York Yankees',
  PHI: 'Philadelphia Phillies',
  PIT: 'Pittsburgh Pirates',
  SDP: 'San Diego Padres',
  SFG: 'San Francisco Giants',
  SEA: 'Seattle Mariners',
  STL: 'St. Louis Cardinals',
  TBR: 'Tampa Bay Rays',
  TEX: 'Texas Rangers',
  TOR: 'Toronto Blue Jays',
  WSN: 'Washington Nationals',
};

// Reverse map (full name -> code), for resolving Matchups/lineup/roster team strings.
export const MLB_NAME_TO_CODE = Object.fromEntries(
  Object.entries(MLB_TEAM_FULL_NAMES).map(([code, name]) => [name, code])
);

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// Batter props. `column` reads a single game-log column; `compute` derives a value
// from several columns (Total Bases, Hits+Runs+RBIs). All numeric, evaluated >= / <.
export const MLB_NUMERIC_PROPS = [
  { id: 'hits',    label: 'Hits',              column: 'H' },
  { id: 'tb',      label: 'Total Bases',       compute: (l) => num(l['1B']) + 2 * num(l['2B']) + 3 * num(l['3B']) + 4 * num(l['HR']) },
  { id: 'hr',      label: 'Home Runs',         column: 'HR' },
  { id: 'rbi',     label: 'RBIs',              column: 'RBI' },
  { id: 'runs',    label: 'Runs',              column: 'R' },
  { id: 'sb',      label: 'Stolen Bases',      column: 'SB' },
  { id: 'bb',      label: 'Walks',             column: 'BB' },
  { id: 'so',      label: 'Strikeouts',        column: 'SO' },
  { id: 'singles', label: 'Singles',           column: '1B' },
  { id: 'doubles', label: 'Doubles',           column: '2B' },
  { id: 'triples', label: 'Triples',           column: '3B' },
  { id: 'hrr',     label: 'Hits + Runs + RBIs', compute: (l) => num(l['H']) + num(l['R']) + num(l['RBI']) },
];

// No binary props for MLB batters (all thresholds are numeric >=).
export const MLB_BINARY_PROPS = [];
export const MLB_ALL_PROPS = [...MLB_NUMERIC_PROPS];

// Placeholder prop for an unset condition row.
export const MLB_NONE_PROP = { id: 'none', label: '— Select a prop —', column: null };

// "Does Not Play" pseudo-prop (used when the DNP scope is chosen; no threshold).
export const MLB_INJURED_PROP = { id: 'dnp', label: 'Does Not Play', column: null };

// Scopes:
//  - all   : denominator = every team game (a game the batter sat counts as a miss)
//  - plays : denominator = only games the batter actually appeared in
//  - dnp   : games the team played but the batter did not appear
export const MLB_SCOPE_OPTIONS = [
  { id: 'all',   label: 'All Games' },
  { id: 'plays', label: 'Plays' },
  { id: 'dnp',   label: 'Does Not Play' },
];

export const MLB_MAX_STAT_VALUE = 10; // sane upper bound for the threshold stepper
