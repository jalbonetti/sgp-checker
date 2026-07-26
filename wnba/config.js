// wnba/config.js - WNBA Configuration
// Mirrors the NBA adapter exactly, but points at WNBA column names:
//   Rebounds  -> REB   (NBA uses TRB)
//   3-Pointers-> FG3M  (NBA uses 3P)
//   Turnovers -> TOV   (NBA uses TO)
//   Combos    -> P+R, P+A, R+A, P+R+A, B+S  (NBA uses PR, PA, RA, PRA, SB)
// Starter/bench scoping comes from the "Starter/Bench" column rather than
// the NBA game logs' "(G  )" / "(SUB)" Position strings.

export const WNBA_TEAM_FULL_NAMES = {
    'ATL': 'Atlanta Dream',
    'CHI': 'Chicago Sky',
    'CON': 'Connecticut Sun',
    'DAL': 'Dallas Wings',
    'GSV': 'Golden State Valkyries',
    'IND': 'Indiana Fever',
    'LAS': 'Los Angeles Sparks',
    'LVA': 'Las Vegas Aces',
    'MIN': 'Minnesota Lynx',
    'NYL': 'New York Liberty',
    'PHX': 'Phoenix Mercury',
    'POR': 'Portland Fire',
    'SEA': 'Seattle Storm',
    'TOR': 'Toronto Tempo',
    'WSH': 'Washington Mystics',
};

export const WNBA_SCOPE_OPTIONS = [
    { id: 'all', label: 'All Games' },
    { id: 'starts', label: 'Starts' },
    { id: 'off_bench', label: 'Off Bench' },
    { id: 'dnp', label: 'Does Not Play' },
];

export const WNBA_NUMERIC_PROPS = [
    { id: 'pts',  label: 'Points',            column: 'PTS' },
    { id: 'reb',  label: 'Rebounds',          column: 'REB' },
    { id: 'ast',  label: 'Assists',           column: 'AST' },
    { id: 'fg3m', label: '3-Pointers',        column: 'FG3M' },
    { id: 'stl',  label: 'Steals',            column: 'STL' },
    { id: 'blk',  label: 'Blocks',            column: 'BLK' },
    { id: 'tov',  label: 'Turnovers',         column: 'TOV' },
    { id: 'pa',   label: 'Pts + Asts',        column: 'P+A' },
    { id: 'pr',   label: 'Pts + Rebs',        column: 'P+R' },
    { id: 'pra',  label: 'Pts + Rebs + Asts', column: 'P+R+A' },
    { id: 'ra',   label: 'Rebs + Asts',       column: 'R+A' },
    { id: 'bs',   label: 'Blks + Stls',       column: 'B+S' },
];

export const WNBA_BINARY_PROPS = [
    { id: 'dd', label: 'Double-Double', column: 'DD' },
    { id: 'td', label: 'Triple-Double', column: 'TD' },
];

export const WNBA_NONE_PROP = { id: 'none', label: 'None', column: null, type: 'none' };
export const WNBA_INJURED_PROP = { id: 'does_not_play', label: 'Does Not Play', column: null, type: 'injured_filter' };

export const WNBA_ALL_PROPS = [
    WNBA_NONE_PROP,
    { id: '_sep0', label: '───────────', type: 'separator' },
    ...WNBA_NUMERIC_PROPS,
    { id: '_sep1', label: '───────────', type: 'separator' },
    ...WNBA_BINARY_PROPS,
];

// Values of the game logs' "Starter/Bench" column.
export const WNBA_STARTER_VALUE = 'Starter';
export const WNBA_BENCH_VALUE = 'Bench';

// Values of the matchups table's "Role" column.
export const WNBA_ROLE_STARTER = 'Starter';
export const WNBA_ROLE_BENCH = 'Bench';
export const WNBA_ROLE_NOT_PLAYING = 'Not Playing';

// Tags in the matchups table that lock a player to "Does Not Play".
// Anything else (e.g. a GTD/questionable tag) still gets the full prop menu,
// with the tag shown next to her name.
export const WNBA_DNP_TAGS = ['OUT', 'OFS', 'DNP'];

// Highest threshold the stepper allows. WNBA single-game ceilings sit well
// under this (P+R+A tops out in the low 60s).
export const WNBA_MAX_STAT_VALUE = 60;
