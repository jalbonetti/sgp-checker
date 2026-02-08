// services/dataService.js - Supabase Data Fetching Service
// Handles all API calls to Supabase for games, rosters, game logs, and aliases

import { CONFIG } from '../config.js';
import { nbaToGameLog, gameLogToNBA } from '../utils/teamMapper.js';

/**
 * Generic fetch wrapper for Supabase REST API
 * Handles pagination for large result sets
 */
async function supabaseFetch(endpoint, queryParams = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            ...CONFIG.API_HEADERS,
            'Prefer': 'return=representation',
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Supabase fetch error: ${response.status} for ${endpoint}`);
    }

    return response.json();
}

/**
 * Fetch with pagination for large tables (1000 row limit per request)
 */
async function supabaseFetchAll(endpoint, queryParams = '') {
    const pageSize = 1000;
    let allRecords = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const separator = queryParams.includes('?') ? '&' : '?';
        const paginatedParams = `${queryParams}${separator}limit=${pageSize}&offset=${offset}`;
        
        const data = await supabaseFetch(endpoint, paginatedParams);
        
        if (data && data.length > 0) {
            allRecords = allRecords.concat(data);
            offset += pageSize;
            hasMore = data.length === pageSize;
        } else {
            hasMore = false;
        }
    }

    return allRecords;
}

// ============================================================
// TODAY'S GAMES
// ============================================================

/**
 * Fetch today's games from BasketMatchupsGame
 * Returns matchup data including team abbreviations and matchup IDs
 */
export async function fetchTodaysGames() {
    try {
        const data = await supabaseFetch('BasketMatchupsGame', '?select=*');
        
        if (!data || data.length === 0) {
            console.warn('No games found in BasketMatchupsGame');
            return [];
        }

        console.log(`✅ Fetched ${data.length} games for today`);
        return data;

    } catch (error) {
        console.error('Error fetching today\'s games:', error);
        return [];
    }
}

// ============================================================
// TEAM ROSTER (from Matchups Players table)
// ============================================================

/**
 * Fetch the roster for a specific team from BasketMatchupsPlayers
 * Filtered by team abbreviation (NBA standard)
 * Returns players with lineup status, stats, etc.
 * 
 * @param {string} teamAbbrev - NBA standard team abbreviation (e.g., "LAL")
 */
export async function fetchTeamRoster(teamAbbrev) {
    try {
        // BasketMatchupsPlayers uses NBA standard abbreviations
        const data = await supabaseFetch(
            'BasketMatchupsPlayers',
            `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=*`
        );

        if (!data || data.length === 0) {
            console.warn(`No roster data found for ${teamAbbrev}`);
            return [];
        }

        console.log(`✅ Fetched ${data.length} player rows for ${teamAbbrev}`);
        return data;

    } catch (error) {
        console.error(`Error fetching roster for ${teamAbbrev}:`, error);
        return [];
    }
}

// ============================================================
// GAME LOGS
// ============================================================

/**
 * Fetch all game logs for a specific player on a specific team
 * Used to evaluate stat conditions
 * 
 * @param {string} playerGameLogName - Player name in game log format (e.g., "Doncic, Luka")
 * @param {string} teamNBAabbrev - NBA standard team abbreviation (e.g., "LAL")
 * @returns {Array} Array of game log rows for this player on this team
 */
export async function fetchPlayerGameLogs(playerGameLogName, teamNBAabbrev) {
    try {
        // Convert NBA abbreviation to game log format for querying
        const gameLogTeam = nbaToGameLog(teamNBAabbrev);
        
        const data = await supabaseFetchAll(
            'BasketGameLogs',
            `?Player=eq.${encodeURIComponent(playerGameLogName)}&Team=eq.${encodeURIComponent(gameLogTeam)}&select=*&order=Date.desc`
        );

        console.log(`✅ Fetched ${data.length} game logs for ${playerGameLogName} (${gameLogTeam})`);
        return data;

    } catch (error) {
        console.error(`Error fetching game logs for ${playerGameLogName}:`, error);
        return [];
    }
}

/**
 * Fetch all game logs for a team (used to determine team schedule)
 * Needed for "Does Not Play" conditions — we need to know which dates the team played
 * 
 * @param {string} teamNBAabbrev - NBA standard team abbreviation
 * @returns {Array} Array of unique game dates for this team
 */
export async function fetchTeamGameDates(teamNBAabbrev) {
    try {
        const gameLogTeam = nbaToGameLog(teamNBAabbrev);
        
        // Fetch minimal data — just Date column, with one row per game
        // We select Date and Player to get unique dates (any player = team played that day)
        const data = await supabaseFetchAll(
            'BasketGameLogs',
            `?Team=eq.${encodeURIComponent(gameLogTeam)}&select=Date&order=Date.desc`
        );

        // Extract unique dates
        const uniqueDates = [...new Set(data.map(row => row.Date))].sort().reverse();
        
        console.log(`✅ Found ${uniqueDates.length} game dates for ${teamNBAabbrev} (${gameLogTeam})`);
        return uniqueDates;

    } catch (error) {
        console.error(`Error fetching team game dates for ${teamNBAabbrev}:`, error);
        return [];
    }
}

// ============================================================
// PLAYER ALIASES
// ============================================================

/**
 * Fetch the complete alias table
 * Returns raw rows with GameLogs and Display columns
 */
export async function fetchPlayerAliases() {
    try {
        const data = await supabaseFetch(
            'BasketPlayerAliases',
            '?select=GameLogs,Display'
        );

        console.log(`✅ Fetched ${data.length} player aliases`);
        return data;

    } catch (error) {
        console.error('Error fetching player aliases:', error);
        return [];
    }
}
