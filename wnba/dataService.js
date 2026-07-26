// wnba/dataService.js - WNBA Supabase Data Fetching Service
//
// Two tables, and only two:
//   WBasketMatchupsPlayers - today's slate AND the rosters, in one table.
//                            "Matchup ID" looks like "DAL@POR|10:00 PM ET",
//                            so the teams playing are derivable from here and
//                            there is no separate Game table to fetch.
//   WNBAGameLogs           - one row per player per game.
//
// Team codes are identical across both tables (DAL, POR, GSV, ...), so unlike
// the NBA adapter there is no abbreviation mapping step.

import { CONFIG } from '../config.js';

async function supabaseFetch(endpoint, queryParams = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
    console.log(`🏀 Fetching: ${endpoint}${queryParams.substring(0, 120)}...`);
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

/**
 * Build a PostgREST select list, double-quoting any column whose name isn't a
 * plain identifier ("Matchup ID" -> %22Matchup%20ID%22).
 */
function pgSelect(columns) {
    return columns
        .map(c => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : encodeURIComponent(`"${c}"`)))
        .join(',');
}

// Everything except "Stats JSON", which is a multi-kilobyte blob per row that
// this tool never reads. Skipping it keeps a full slate's payload tiny.
const MATCHUP_COLUMNS = ['id', 'Matchup ID', 'Team', 'Player', 'Position', 'Role', 'Injury', 'Status', 'Tag'];

/**
 * Fetch every row of today's matchups/rosters in a single request.
 * Falls back to select=* if the quoted-column select is ever rejected.
 */
export async function fetchWNBAMatchupPlayers() {
    try {
        return await supabaseFetchAll('WBasketMatchupsPlayers', `?select=${pgSelect(MATCHUP_COLUMNS)}`);
    } catch (error) {
        console.warn('WNBA: narrow select failed, retrying with select=* —', error.message);
        try {
            return await supabaseFetchAll('WBasketMatchupsPlayers', '?select=*');
        } catch (error2) {
            console.error('Error fetching WNBA matchup players:', error2);
            return [];
        }
    }
}

/**
 * Fetch ALL game logs for one team for the season, newest first.
 *
 * select=* is deliberate. The combo columns are named "P+R", "P+A", "R+A",
 * "P+R+A" and "B+S", and a literal "+" inside a query string decodes to a
 * space — so an explicit select list would silently ask for columns named
 * "P R" and come back empty. Same reasoning as the hockey/MLB adapters.
 */
export async function fetchWNBAGameLogs(teamAbbrev) {
    try {
        console.log(`🔍 Fetching ALL WNBA game logs for team "${teamAbbrev}"`);
        const data = await supabaseFetchAll(
            'WNBAGameLogs',
            `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=*&order=Date.desc`
        );
        console.log(`✅ Fetched ${data.length} total WNBA game log rows for ${teamAbbrev}`);
        return data;
    } catch (error) {
        console.error(`Error fetching WNBA game logs for ${teamAbbrev}:`, error);
        return [];
    }
}
