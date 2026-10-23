// nba/dataService.js - NBA Supabase Data Fetching Service (2026-27 card-format tables)
//
//   BasketMatchupsPlayers - today's slate AND the rosters, in one table.
//                           "Matchup ID" is "AWAY@HOME|7:30 PM ET 10/21/2026" (a DATED
//                           stamp, so a stale prior-day board drops out entirely).
//   BasketGameLogs        - one row per player per game (stats.nba.com layout).
//   BasketPlayerAliases   - OPTIONAL hand-kept spellings table (every column is a
//                           spelling of one player); used only if the roster name
//                           and the log name differ. Fails open if absent.
//
// Team codes are identical across the tables (BKN, GSW, NOP, ...).

import { CONFIG } from '../config.js';

async function supabaseFetch(endpoint, queryParams = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
    console.log(`🏀 NBA fetching: ${endpoint}${queryParams.substring(0, 120)}...`);
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
export async function fetchNBAMatchupPlayers() {
    try {
        return await supabaseFetchAll('BasketMatchupsPlayers', `?select=${pgSelect(MATCHUP_COLUMNS)}`);
    } catch (error) {
        console.warn('NBA: narrow select failed, retrying with select=* —', error.message);
        try {
            return await supabaseFetchAll('BasketMatchupsPlayers', '?select=*');
        } catch (error2) {
            console.error('Error fetching NBA matchup players:', error2);
            return [];
        }
    }
}

/**
 * Optional alias table: every non-empty cell on a row is a spelling of the same player.
 * Returns Map<normalizedSpelling, Set<normalizedSpelling>> (all spellings of that player),
 * or an empty Map when the table is missing / empty / unreadable.
 */
export async function fetchNBAAliasGroups() {
    try {
        const rows = await supabaseFetchAll('BasketPlayerAliases', '?select=*');
        const groups = new Map();
        for (const row of rows) {
            const spellings = Object.entries(row)
                .filter(([k, v]) => k !== 'id' && v != null && String(v).trim())
                .map(([, v]) => normalizeName(String(v)))
                .filter(Boolean);
            const set = new Set(spellings);
            for (const sp of set) groups.set(sp, set);
        }
        return groups;
    } catch (e) {
        console.warn('NBA: alias table unavailable (continuing without it):', e.message);
        return new Map();
    }
}

/** Shared name normalization: accents off, suffixes off, punctuation off, "Last, First" flipped. */
export function normalizeName(name) {
    let s = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (s.includes(',')) { const p = s.split(',').map(x => x.trim()); if (p.length === 2) s = `${p[1]} ${p[0]}`; }
    return s.toLowerCase()
        .replace(/\s*\([^)]*\)\s*$/, '')          // trailing "(Q)" / "(OUT)" tags
        .replace(/['\u2019\u02bc]/g, '')
        .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim().replace(/\s+/g, ' ');
}

/**
 * Fetch ALL game logs for one team for the season, newest first.
 *
 * select=* is deliberate. The combo columns are named "P+R", "P+A", "R+A",
 * "P+R+A" and "B+S", and a literal "+" inside a query string decodes to a
 * space — so an explicit select list would silently ask for columns named
 * "P R" and come back empty. Same reasoning as the hockey/MLB adapters.
 */
export async function fetchNBAGameLogs(teamAbbrev) {
    try {
        console.log(`🔍 Fetching ALL NBA game logs for team "${teamAbbrev}"`);
        const data = await supabaseFetchAll(
            'BasketGameLogs',
            `?Team=eq.${encodeURIComponent(teamAbbrev)}&select=*&order=Date.desc`
        );
        console.log(`✅ Fetched ${data.length} total NBA game log rows for ${teamAbbrev}`);
        return data;
    } catch (error) {
        console.error(`Error fetching NBA game logs for ${teamAbbrev}:`, error);
        return [];
    }
}
