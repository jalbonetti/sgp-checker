// utils/teamMapper.js - Team Abbreviation Mapping
// Converts between game log abbreviations and NBA standard abbreviations

import { GAME_LOG_TO_NBA_ABBREV, NBA_ABBREV_TO_GAME_LOG } from '../config.js';

/**
 * Convert a game log team abbreviation to NBA standard
 * e.g., "GS" → "GSW", "BRK" → "BKN", "NO" → "NOP"
 * 
 * @param {string} gameLogAbbrev - Team abbreviation from BasketGameLogs
 * @returns {string} NBA standard abbreviation
 */
export function gameLogToNBA(gameLogAbbrev) {
    if (!gameLogAbbrev) return '';
    const trimmed = gameLogAbbrev.trim();
    return GAME_LOG_TO_NBA_ABBREV[trimmed] || trimmed;
}

/**
 * Convert an NBA standard abbreviation to game log format
 * e.g., "GSW" → "GS", "BKN" → "BRK", "NOP" → "NO"
 * Used when querying BasketGameLogs with a team from BasketMatchupsPlayers
 * 
 * @param {string} nbaAbbrev - NBA standard team abbreviation
 * @returns {string} Game log abbreviation
 */
export function nbaToGameLog(nbaAbbrev) {
    if (!nbaAbbrev) return '';
    const trimmed = nbaAbbrev.trim();
    return NBA_ABBREV_TO_GAME_LOG[trimmed] || trimmed;
}
