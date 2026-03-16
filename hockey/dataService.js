// hockey/dataService.js - Hockey Supabase Data Fetching Service

import { CONFIG } from '../config.js';

async function supabaseFetch(endpoint, queryParams = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
    console.log(`🏒 Fetching: ${endpoint}${queryParams.substring(0, 120)}...`);
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

/** Fetch today's hockey games from HockeyMatchupsGame */
export async function fetchHockeyGames() {
    try {
        const data = await supabaseFetch('HockeyMatchupsGame', '?select=*');
        return data || [];
    } catch (error) {
        console.error('Error fetching hockey games:', error);
        return [];
    }
}

/** Fetch skater roster for a team from HockeyMatchupsSkater */
export async function fetchHockeyRoster(teamAbbrev) {
    try {
        return await supabaseFetch('HockeyMatchupsSkater', `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=*`);
    } catch (error) {
        console.error(`Error fetching hockey roster for ${teamAbbrev}:`, error);
        return [];
    }
}

/**
 * Fetch ALL game logs for an entire hockey team for the season.
 * Uses select=* to avoid column name quoting issues (columns have spaces).
 */
export async function fetchHockeyGameLogs(teamAbbrev) {
    try {
        console.log(`🔍 Fetching ALL hockey game logs for team "${teamAbbrev}"`);
        const data = await supabaseFetchAll(
            'HockeyGameLogsSkater',
            `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=*&order=Date.desc`
        );
        console.log(`✅ Fetched ${data.length} total hockey game log rows for ${teamAbbrev}`);
        return data;
    } catch (error) {
        console.error(`Error fetching hockey game logs for ${teamAbbrev}:`, error);
        return [];
    }
}

/** Fetch HockeyNormalNames alias table */
export async function fetchHockeyNormalNames() {
    try {
        return await supabaseFetch('HockeyNormalNames', '?select=CanonicalName,GameLogName,PlayerID');
    } catch (error) {
        console.error('Error fetching hockey normal names:', error);
        return [];
    }
}
