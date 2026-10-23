// nba/config.js - NBA Configuration (2026-27)
// The NBA tables now share the WNBA layout exactly (stats.nba.com game logs in
// BasketGameLogs, card-format rosters in BasketMatchupsPlayers), so this is the
// WNBA adapter config with NBA teams: REB / FG3M / TOV / P+R / P+A / R+A /
// P+R+A / B+S columns, Starter/Bench scoping from the "Starter/Bench" column.

export const NBA_TEAM_FULL_NAMES = {
    'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets', 'CHA': 'Charlotte Hornets',
    'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers', 'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets',
    'DET': 'Detroit Pistons', 'GSW': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
    'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers', 'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat',
    'MIL': 'Milwaukee Bucks', 'MIN': 'Minnesota Timberwolves', 'NOP': 'New Orleans Pelicans', 'NYK': 'New York Knicks',
    'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic', 'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings', 'SAS': 'San Antonio Spurs', 'TOR': 'Toronto Raptors',
    'UTA': 'Utah Jazz', 'WAS': 'Washington Wizards',
};
// Codes other feeds may still emit -> the stats.nba.com codes used in every Basket* table.
export const NBA_CODE_ALIAS = { BRK: 'BKN', GS: 'GSW', NY: 'NYK', NO: 'NOP', PHO: 'PHX', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', CHO: 'CHA' };
export const nbaCode = v => { const c = String(v || '').trim().toUpperCase(); return NBA_CODE_ALIAS[c] || c; };

export const NBA_SCOPE_OPTIONS = [
    { id: 'all', label: 'All Games' },
    { id: 'starts', label: 'Starts' },
    { id: 'off_bench', label: 'Off Bench' },
    { id: 'dnp', label: 'Does Not Play' },
];

export const NBA_NUMERIC_PROPS = [
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

export const NBA_BINARY_PROPS = [
    { id: 'dd', label: 'Double-Double', column: 'DD' },
    { id: 'td', label: 'Triple-Double', column: 'TD' },
];

export const NBA_NONE_PROP = { id: 'none', label: 'None', column: null, type: 'none' };
export const NBA_INJURED_PROP = { id: 'does_not_play', label: 'Does Not Play', column: null, type: 'injured_filter' };

export const NBA_ALL_PROPS = [
    NBA_NONE_PROP,
    { id: '_sep0', label: '───────────', type: 'separator' },
    ...NBA_NUMERIC_PROPS,
    { id: '_sep1', label: '───────────', type: 'separator' },
    ...NBA_BINARY_PROPS,
];

// Values of the game logs' "Starter/Bench" column.
export const NBA_STARTER_VALUE = 'Starter';
export const NBA_BENCH_VALUE = 'Bench';

// Values of the matchups table's "Role" column.
export const NBA_ROLE_STARTER = 'Starter';
export const NBA_ROLE_BENCH = 'Bench';
export const NBA_ROLE_NOT_PLAYING = 'Not Playing';

// Tags in the matchups table that lock a player to "Does Not Play".
// Anything else (e.g. a GTD/questionable tag) still gets the full prop menu,
// with the tag shown next to his name.
export const NBA_DNP_TAGS = ['OUT', 'OFS', 'DNP'];

// Highest threshold the stepper allows (NBA P+R+A can clear 80).
export const NBA_MAX_STAT_VALUE = 100;
