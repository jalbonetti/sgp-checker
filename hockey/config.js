// hockey/config.js - NHL Configuration

export const HOCKEY_TEAM_FULL_NAMES = {
    'ANA':'Anaheim Ducks','BOS':'Boston Bruins','BUF':'Buffalo Sabres',
    'CAR':'Carolina Hurricanes','CBJ':'Columbus Blue Jackets','CGY':'Calgary Flames',
    'CHI':'Chicago Blackhawks','COL':'Colorado Avalanche','DAL':'Dallas Stars',
    'DET':'Detroit Red Wings','EDM':'Edmonton Oilers','FLA':'Florida Panthers',
    'LAK':'Los Angeles Kings','MIN':'Minnesota Wild','MTL':'Montréal Canadiens',
    'NJD':'New Jersey Devils','NSH':'Nashville Predators','NYI':'New York Islanders',
    'NYR':'New York Rangers','OTT':'Ottawa Senators','PHI':'Philadelphia Flyers',
    'PIT':'Pittsburgh Penguins','SEA':'Seattle Kraken','SJS':'San Jose Sharks',
    'STL':'St. Louis Blues','TBL':'Tampa Bay Lightning','TOR':'Toronto Maple Leafs',
    'UTA':'Utah Mammoth','VAN':'Vancouver Canucks','VGK':'Vegas Golden Knights',
    'WPG':'Winnipeg Jets','WSH':'Washington Capitals',
};

export const HOCKEY_NUMERIC_PROPS = [
    { id: 'points', label: 'Points', column: 'Points' },
    { id: 'goals', label: 'Goals', column: 'Goals' },
    { id: 'assists', label: 'Assists', column: 'Assists' },
    { id: 'ppp', label: 'Power Play Points', column: 'Power Play Points' },
    { id: 'ppg', label: 'Power Play Goals', column: 'Power Play Goals' },
    { id: 'bs', label: 'Blocked Shots', column: 'Blocked Shots' },
    { id: 'sog', label: 'Shots on Goal', column: 'Shots on Goal' },
    { id: 'hits', label: 'Hits', column: 'Hits' },
];

export const HOCKEY_NONE_PROP = { id: 'none', label: 'None', column: null, type: 'none' };
export const HOCKEY_INJURED_PROP = { id: 'does_not_play', label: 'Does Not Play', column: null, type: 'injured_filter' };

export const HOCKEY_ALL_PROPS = [
    HOCKEY_NONE_PROP,
    { id: '_sep0', label: '───────────', type: 'separator' },
    ...HOCKEY_NUMERIC_PROPS,
];

export const HOCKEY_SCOPE_OPTIONS = [
    { id: 'all', label: 'All Games' },
    { id: 'dnp', label: 'Does Not Play' },
];

// Tags (HockeyMatchupsPlayers.Tag) that allow regular props — shown in the main group with the tag
export const HOCKEY_MINOR_INJURIES = ['DTD', 'GTD', 'Q', 'D', 'P'];
// Tags that force Does Not Play (the row's Role is also 'Not Playing')
export const HOCKEY_DNP_INJURIES = ['OUT', 'IR', 'LTIR', 'SUSP', 'NR', 'OFS'];
export const HOCKEY_ROLE_NOT_PLAYING = 'Not Playing';

export const HOCKEY_MAX_STAT_VALUE = 50;
