// config.js - Same Team Prop Checker Configuration
// Supabase connection, team mappings, prop definitions, and constants

export const CONFIG = {
    SUPABASE_URL: 'https://hcwolbvmffkmjcxsumwn.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhjd29sYnZtZmZrbWpjeHN1bXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNDQzMTIsImV4cCI6MjA1NTkyMDMxMn0.tM4RwXZpZM6ZHuFFMhWcKYLT3E4NA6Ig90CHw7QtJf0',
    API_HEADERS: {
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhjd29sYnZtZmZrbWpjeHN1bXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNDQzMTIsImV4cCI6MjA1NTkyMDMxMn0.tM4RwXZpZM6ZHuFFMhWcKYLT3E4NA6Ig90CHw7QtJf0",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhjd29sYnZtZmZrbWpjeHN1bXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNDQzMTIsImV4cCI6MjA1NTkyMDMxMn0.tM4RwXZpZM6ZHuFFMhWcKYLT3E4NA6Ig90CHw7QtJf0",
        "Content-Type": "application/json"
    },
    MAX_CONDITIONS: 10,
    MAX_STAT_VALUE: 100,
    ALIAS_CACHE_TTL: 30 * 60 * 1000,
};

// Game Log → NBA standard team abbreviations
export const GAME_LOG_TO_NBA_ABBREV = {
    'ATL':'ATL','BOS':'BOS','BRK':'BKN','CHA':'CHA','CHI':'CHI','CLE':'CLE',
    'DAL':'DAL','DEN':'DEN','DET':'DET','GS':'GSW','HOU':'HOU','IND':'IND',
    'LAC':'LAC','LAL':'LAL','MEM':'MEM','MIA':'MIA','MIL':'MIL','MIN':'MIN',
    'NO':'NOP','NY':'NYK','OKC':'OKC','ORL':'ORL','PHI':'PHI','PHO':'PHX',
    'POR':'POR','SAC':'SAC','SA':'SAS','TOR':'TOR','UTA':'UTA','WAS':'WAS',
};
export const NBA_ABBREV_TO_GAME_LOG = {};
Object.entries(GAME_LOG_TO_NBA_ABBREV).forEach(([gl, nba]) => {
    if (!NBA_ABBREV_TO_GAME_LOG[nba]) NBA_ABBREV_TO_GAME_LOG[nba] = gl;
});

export const TEAM_FULL_NAMES = {
    'ATL':'Atlanta Hawks','BOS':'Boston Celtics','BKN':'Brooklyn Nets','CHA':'Charlotte Hornets',
    'CHI':'Chicago Bulls','CLE':'Cleveland Cavaliers','DAL':'Dallas Mavericks','DEN':'Denver Nuggets',
    'DET':'Detroit Pistons','GSW':'Golden State Warriors','HOU':'Houston Rockets','IND':'Indiana Pacers',
    'LAC':'Los Angeles Clippers','LAL':'Los Angeles Lakers','MEM':'Memphis Grizzlies','MIA':'Miami Heat',
    'MIL':'Milwaukee Bucks','MIN':'Minnesota Timberwolves','NOP':'New Orleans Pelicans','NYK':'New York Knicks',
    'OKC':'Oklahoma City Thunder','ORL':'Orlando Magic','PHI':'Philadelphia 76ers','PHX':'Phoenix Suns',
    'POR':'Portland Trail Blazers','SAC':'Sacramento Kings','SAS':'San Antonio Spurs','TOR':'Toronto Raptors',
    'UTA':'Utah Jazz','WAS':'Washington Wizards',
};

// Filter conditions
export const FILTER_CONDITIONS = [
    { id: 'starts', label: 'Starts', type: 'filter' },
    { id: 'off_bench', label: 'Off Bench', type: 'filter' },
    { id: 'plays', label: 'Plays', type: 'filter' },
    { id: 'does_not_play', label: 'Does Not Play', type: 'filter' },
];

// Numeric props
export const NUMERIC_PROP_CONDITIONS = [
    { id: 'pts', label: 'Points', type: 'numeric', column: 'PTS' },
    { id: 'trb', label: 'Rebounds', type: 'numeric', column: 'TRB' },
    { id: 'ast', label: 'Assists', type: 'numeric', column: 'AST' },
    { id: '3p', label: '3-Pointers', type: 'numeric', column: '3P' },
    { id: 'stl', label: 'Steals', type: 'numeric', column: 'STL' },
    { id: 'blk', label: 'Blocks', type: 'numeric', column: 'BLK' },
    { id: 'to', label: 'Turnovers', type: 'numeric', column: 'TO' },
    { id: 'pa', label: 'Pts + Asts', type: 'numeric', column: 'PA' },
    { id: 'pr', label: 'Pts + Rebs', type: 'numeric', column: 'PR' },
    { id: 'pra', label: 'Pts + Rebs + Asts', type: 'numeric', column: 'PRA' },
    { id: 'ra', label: 'Rebs + Asts', type: 'numeric', column: 'RA' },
    { id: 'sb', label: 'Blks + Stls', type: 'numeric', column: 'SB' },
];

// Binary props
export const BINARY_PROP_CONDITIONS = [
    { id: 'dd', label: 'Double-Double', type: 'binary', column: 'DD' },
    { id: 'td', label: 'Triple-Double', type: 'binary', column: 'TD' },
];

export const ALL_CONDITIONS = [
    ...FILTER_CONDITIONS,
    { id: '_sep1', label: '───────────', type: 'separator' },
    ...NUMERIC_PROP_CONDITIONS,
    { id: '_sep2', label: '───────────', type: 'separator' },
    ...BINARY_PROP_CONDITIONS,
];

export const STARTER_POSITIONS = ['(G  )', '(F  )', '(C  )'];
export const BENCH_POSITION = '(SUB)';

export function isMobile() { return window.innerWidth <= 768; }
export function isTablet() { return window.innerWidth > 768 && window.innerWidth <= 1024; }
