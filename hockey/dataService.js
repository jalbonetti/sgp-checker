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

/** Fetch today's hockey games from HockeyMatchupsGame (one row per team-card:
 *  Matchup ID "AWAY@HOME|7:00 PM ET 10/12/2026", Team, Opponent, Home/Away, Game Time, ...) */
export async function fetchHockeyGames() {
    try {
        const data = await supabaseFetch('HockeyMatchupsGame', '?select=*');
        return data || [];
    } catch (error) {
        console.error('Error fetching hockey games:', error);
        return [];
    }
}

/**
 * Fetch a team's roster from HockeyMatchupsPlayers (card-format table, 2026-27):
 *   Matchup ID, Team, Player, Player ID, Position (C/W/D/G), Role (Skater | Starter |
 *   Backup | Not Playing), Injury, Status, Tag, Stats JSON.
 * The Stats JSON blob is several KB per row and never read here, so it is excluded.
 */
export async function fetchHockeyRoster(teamAbbrev) {
    try {
        const cols = ['Matchup ID', 'Team', 'Player', 'Player ID', 'Position', 'Role', 'Injury', 'Status', 'Tag']
            .map(c => (c.includes(' ') ? `"${c}"` : c)).join(',');
        return await supabaseFetch('HockeyMatchupsPlayers', `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=${encodeURIComponent(cols)}`);
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
