// config.js - Same Team Prop Checker Configuration

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

export const SCOPE_OPTIONS = [
    { id: 'all', label: 'All Games' },
    { id: 'starts', label: 'Starts' },
    { id: 'off_bench', label: 'Off Bench' },
];

export const NUMERIC_PROPS = [
    { id: 'pts', label: 'Points', column: 'PTS' },
    { id: 'trb', label: 'Rebounds', column: 'TRB' },
    { id: 'ast', label: 'Assists', column: 'AST' },
    { id: '3p', label: '3-Pointers', column: '3P' },
    { id: 'stl', label: 'Steals', column: 'STL' },
    { id: 'blk', label: 'Blocks', column: 'BLK' },
    { id: 'to', label: 'Turnovers', column: 'TO' },
    { id: 'pa', label: 'Pts + Asts', column: 'PA' },
    { id: 'pr', label: 'Pts + Rebs', column: 'PR' },
    { id: 'pra', label: 'Pts + Rebs + Asts', column: 'PRA' },
    { id: 'ra', label: 'Rebs + Asts', column: 'RA' },
    { id: 'sb', label: 'Blks + Stls', column: 'SB' },
];

export const BINARY_PROPS = [
    { id: 'dd', label: 'Double-Double', column: 'DD' },
    { id: 'td', label: 'Triple-Double', column: 'TD' },
];

// "None" = no stat condition, just presence in scope. All scoped dates qualify.
export const NONE_PROP = { id: 'none', label: 'None', column: null, type: 'none' };

// "Does Not Play" for injured/out players
export const INJURED_PROP = { id: 'does_not_play', label: 'Does Not Play', column: null, type: 'injured_filter' };

export const ALL_PROPS = [
    NONE_PROP,
    { id: '_sep0', label: '───────────', type: 'separator' },
    ...NUMERIC_PROPS,
    { id: '_sep1', label: '───────────', type: 'separator' },
    ...BINARY_PROPS,
    { id: '_sep2', label: '───────────', type: 'separator' },
    INJURED_PROP,
];

export const STARTER_POSITIONS = ['(G  )', '(F  )', '(C  )'];
export const BENCH_POSITION = '(SUB)';

export function isMobile() { return window.innerWidth <= 768; }
