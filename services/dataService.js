// services/dataService.js - Supabase Data Fetching Service
// UPDATED: Fetch entire team game logs at once instead of per-player queries

import { CONFIG } from '../config.js';
import { nbaToGameLog } from '../utils/teamMapper.js';

async function supabaseFetch(endpoint, queryParams = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
    console.log(`📡 Fetching: ${endpoint}${queryParams.substring(0, 120)}...`);
    
    const response = await fetch(url, {
        method: 'GET',
        headers: { ...CONFIG.API_HEADERS, 'Prefer': 'return=representation', 'Accept': 'application/json' },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`❌ Supabase ${response.status} for ${endpoint}: ${errorText}`);
        throw new Error(`Supabase error: ${response.status} for ${endpoint}`);
    }
    const data = await response.json();
    console.log(`✅ ${data.length} rows from ${endpoint}`);
    return data;
}

async function supabaseFetchAll(endpoint, queryParams = '') {
    const pageSize = 1000;
    let allRecords = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
        const sep = queryParams.includes('?') ? '&' : '?';
        const data = await supabaseFetch(endpoint, `${queryParams}${sep}limit=${pageSize}&offset=${offset}`);
        if (data && data.length > 0) {
            allRecords = allRecords.concat(data);
            offset += pageSize;
            hasMore = data.length === pageSize;
        } else { hasMore = false; }
    }
    return allRecords;
}

/** Fetch today's games from BasketMatchupsGame */
export async function fetchTodaysGames() {
    try {
        const data = await supabaseFetch('BasketMatchupsGame', '?select=*');
        return data || [];
    } catch (error) {
        console.error('Error fetching games:', error);
        return [];
    }
}

/** Fetch roster for a team from BasketMatchupsPlayers */
export async function fetchTeamRoster(teamAbbrev) {
    try {
        return await supabaseFetch('BasketMatchupsPlayers', `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=*`);
    } catch (error) {
        console.error(`Error fetching roster for ${teamAbbrev}:`, error);
        return [];
    }
}

/**
 * Fetch ALL game logs for an entire team for the season.
 * This is the primary data source — fetched once per team selection.
 * From this we derive: team schedule dates, per-player logs, everything.
 * 
 * Selects only the columns we need to minimize transfer.
 */
export async function fetchTeamGameLogs(teamNBAabbrev) {
    try {
        const gameLogTeam = nbaToGameLog(teamNBAabbrev);
        console.log(`🔍 Fetching ALL game logs for team "${gameLogTeam}" (NBA: ${teamNBAabbrev})`);
        
        const columns = 'Date,Player,Position,PTS,TRB,AST,3P,STL,BLK,TO,PA,PR,PRA,RA,SB,DD,TD';
        const data = await supabaseFetchAll(
            'BasketGameLogs',
            `?Team=eq.${encodeURIComponent(gameLogTeam)}&select=${columns}&order=Date.desc`
        );
        console.log(`✅ Fetched ${data.length} total game log rows for ${gameLogTeam}`);
        return data;
    } catch (error) {
        console.error(`Error fetching team game logs for ${teamNBAabbrev}:`, error);
        return [];
    }
}

/** Fetch alias table */
export async function fetchPlayerAliases() {
    try {
        return await supabaseFetch('BasketPlayerAliases', '?select=GameLogs,Display');
    } catch (error) {
        console.error('Error fetching aliases:', error);
        return [];
    }
}
