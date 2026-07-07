// mlb/dataService.js — MLB Supabase data fetching for the Same-Team Prop Checker

import { CONFIG } from '../config.js';

async function supabaseFetch(endpoint, queryParams = '') {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}${queryParams}`;
  console.log(`⚾ Fetching: ${endpoint}${queryParams.substring(0, 120)}...`);
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
  let all = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const sep = queryParams.includes('?') ? '&' : '?';
    const data = await supabaseFetch(endpoint, `${queryParams}${sep}limit=${pageSize}&offset=${offset}`);
    if (data && data.length > 0) {
      all = all.concat(data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else { hasMore = false; }
  }
  return all;
}

/** Today's slate + game times (one row per game; doubleheaders are separate rows tagged "(Game N)"). */
export async function fetchMLBGames() {
  try {
    return await supabaseFetch('BaseballMatchupsGame', '?select=*');
  } catch (error) {
    console.error('Error fetching MLB games:', error);
    return [];
  }
}

/** All posted lineups. Team column carries "(Game N)" for doubleheader legs. */
export async function fetchMLBLineups() {
  try {
    return await supabaseFetchAll('BaseballLineups', '?select=*');
  } catch (error) {
    console.error('Error fetching MLB lineups:', error);
    return [];
  }
}

/** Full roster for a team (by full team name). Position column: B / SP / RP. */
export async function fetchMLBRoster(teamFullName) {
  try {
    return await supabaseFetchAll('BaseballRosters', `?Team=eq.${encodeURIComponent(teamFullName)}&select=*`);
  } catch (error) {
    console.error(`Error fetching MLB roster for ${teamFullName}:`, error);
    return [];
  }
}

/**
 * All season game logs for a team (by team-code abbreviation), newest first.
 * select=* avoids quoting issues on columns like "1B"/"2B"/"3B".
 */
export async function fetchMLBGameLogs(teamCode) {
  try {
    console.log(`🔍 Fetching all MLB game logs for team "${teamCode}"`);
    const data = await supabaseFetchAll(
      'BaseballGameLogs',
      `?TeamNameAbb=eq.${encodeURIComponent(teamCode)}&select=*&order=Date.desc`
    );
    console.log(`✅ Fetched ${data.length} MLB game-log rows for ${teamCode}`);
    return data;
  } catch (error) {
    console.error(`Error fetching MLB game logs for ${teamCode}:`, error);
    return [];
  }
}
