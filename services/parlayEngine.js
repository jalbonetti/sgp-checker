// services/parlayEngine.js - Condition Evaluation & Intersection Engine
// The core logic: evaluates each condition against game logs,
// intersects qualifying dates, and computes hit rates

import { STARTER_POSITIONS, BENCH_POSITION } from '../config.js';
import { fetchPlayerGameLogs, fetchTeamGameDates } from './dataService.js';
import { nbaToGameLog } from '../utils/teamMapper.js';

/**
 * Evaluate a single condition and return the set of qualifying dates
 * 
 * @param {Object} condition - A condition object:
 *   { player: { displayName, gameLogName, team }, conditionType, direction, value }
 *   conditionType: one of the condition IDs from config (e.g., 'pts', 'starts', 'plays')
 *   direction: '≥' or '<' for numeric, 'yes' or 'no' for binary, null for filters
 *   value: number for numeric props, null for filters/binary
 * @param {Object} conditionDef - The condition definition from config (has .type, .column, etc.)
 * @param {Array} playerGameLogs - Pre-fetched game logs for this player
 * @param {Array} teamGameDates - Pre-fetched list of all dates this team played
 * @returns {Object} { qualifyingDates: Set, totalEligibleDates: number, description: string }
 */
export function evaluateCondition(condition, conditionDef, playerGameLogs, teamGameDates) {
    const { direction, value } = condition;
    const type = conditionDef.type;
    
    // Build a map of date → game log row for this player
    const logsByDate = new Map();
    playerGameLogs.forEach(log => {
        logsByDate.set(log.Date, log);
    });

    // Set of all team game dates for reference
    const allTeamDates = new Set(teamGameDates);
    
    // Set of dates the player actually played
    const playerPlayedDates = new Set(logsByDate.keys());

    let qualifyingDates = new Set();
    let totalEligibleDates = 0;
    let description = '';

    switch (type) {
        case 'filter': {
            switch (conditionDef.id) {
                case 'starts': {
                    // Dates where player's Position is a starter position
                    logsByDate.forEach((log, date) => {
                        const pos = (log.Position || '').trim();
                        if (STARTER_POSITIONS.includes(pos)) {
                            qualifyingDates.add(date);
                        }
                    });
                    totalEligibleDates = playerPlayedDates.size;
                    description = 'Starts';
                    break;
                }
                case 'off_bench': {
                    // Dates where player's Position is (SUB)
                    logsByDate.forEach((log, date) => {
                        const pos = (log.Position || '').trim();
                        if (pos === BENCH_POSITION) {
                            qualifyingDates.add(date);
                        }
                    });
                    totalEligibleDates = playerPlayedDates.size;
                    description = 'Off Bench';
                    break;
                }
                case 'plays': {
                    // Dates where the player has any game log entry
                    qualifyingDates = new Set(playerPlayedDates);
                    totalEligibleDates = allTeamDates.size;
                    description = 'Plays';
                    break;
                }
                case 'does_not_play': {
                    // Dates where the team played but this player did NOT
                    allTeamDates.forEach(date => {
                        if (!playerPlayedDates.has(date)) {
                            qualifyingDates.add(date);
                        }
                    });
                    totalEligibleDates = allTeamDates.size;
                    description = 'Does Not Play';
                    break;
                }
            }
            break;
        }
        
        case 'numeric': {
            // Check stat column against threshold
            const column = conditionDef.column;
            const threshold = parseFloat(value);
            
            logsByDate.forEach((log, date) => {
                const statValue = parseFloat(log[column]);
                if (isNaN(statValue)) return;
                
                if (direction === 'gte') {
                    // ≥ threshold
                    if (statValue >= threshold) {
                        qualifyingDates.add(date);
                    }
                } else if (direction === 'lt') {
                    // < threshold
                    if (statValue < threshold) {
                        qualifyingDates.add(date);
                    }
                }
            });
            
            totalEligibleDates = playerPlayedDates.size;
            const dirLabel = direction === 'gte' ? '≥' : '<';
            description = `${conditionDef.label} ${dirLabel} ${value}`;
            break;
        }
        
        case 'binary': {
            // Check DD or TD column for 1 (yes) or 0 (no)
            const column = conditionDef.column;
            
            logsByDate.forEach((log, date) => {
                const binaryValue = parseInt(log[column]);
                
                if (direction === 'yes' && binaryValue === 1) {
                    qualifyingDates.add(date);
                } else if (direction === 'no' && (binaryValue === 0 || isNaN(binaryValue))) {
                    qualifyingDates.add(date);
                }
            });
            
            totalEligibleDates = playerPlayedDates.size;
            description = `${conditionDef.label}: ${direction === 'yes' ? 'Yes' : 'No'}`;
            break;
        }
    }

    return {
        qualifyingDates,
        totalEligibleDates,
        description,
    };
}

/**
 * Filter a set of dates to only those within the last N days
 * 
 * @param {Set} dates - Set of date strings (format: "MM/DD/YYYY" or "YYYY-MM-DD")
 * @param {number} days - Number of days to look back
 * @returns {Set} Filtered set of dates within the window
 */
export function filterToLastNDays(dates, days = 30) {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    
    const filtered = new Set();
    dates.forEach(dateStr => {
        const date = parseGameLogDate(dateStr);
        if (date && date >= cutoff) {
            filtered.add(dateStr);
        }
    });
    
    return filtered;
}

/**
 * Parse a game log date string into a Date object
 * Game logs appear to use "MM/DD/YYYY" or "YYYY-MM-DD" format
 */
function parseGameLogDate(dateStr) {
    if (!dateStr) return null;
    
    // Try direct parse first
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    
    // Try MM/DD/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[0] - 1, parts[1]);
    }
    
    return null;
}

/**
 * Run the full parlay check across all conditions
 * This is the main entry point called when the user clicks "Check"
 * 
 * @param {Array} conditions - Array of condition objects from the UI:
 *   [{ player: { displayName, gameLogName, team }, conditionId, conditionDef, direction, value }]
 * @param {string} teamAbbrev - NBA standard team abbreviation for the selected team
 * @returns {Object} Results object with combined and individual hit rates
 */
export async function runParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) {
        return { error: 'No conditions to check' };
    }

    console.log(`Running parlay check with ${conditions.length} conditions for ${teamAbbrev}...`);

    // Step 1: Fetch team game dates (needed for Does Not Play and as the universe)
    const teamGameDates = await fetchTeamGameDates(teamAbbrev);
    
    if (teamGameDates.length === 0) {
        return { error: 'No game data found for this team' };
    }

    // Step 2: Fetch game logs for each unique player
    // (same player may appear in multiple conditions, only fetch once)
    const playerLogCache = new Map(); // gameLogName → Array of logs
    
    const uniquePlayers = new Map(); // gameLogName → player info
    conditions.forEach(c => {
        if (!uniquePlayers.has(c.player.gameLogName)) {
            uniquePlayers.set(c.player.gameLogName, c.player);
        }
    });

    // Fetch all player logs in parallel
    const fetchPromises = [];
    uniquePlayers.forEach((playerInfo, gameLogName) => {
        const promise = fetchPlayerGameLogs(gameLogName, teamAbbrev)
            .then(logs => {
                playerLogCache.set(gameLogName, logs);
            });
        fetchPromises.push(promise);
    });
    
    await Promise.all(fetchPromises);

    // Step 3: Evaluate each condition individually
    const individualResults = [];
    
    for (const condition of conditions) {
        const playerLogs = playerLogCache.get(condition.player.gameLogName) || [];
        
        const result = evaluateCondition(
            condition,
            condition.conditionDef,
            playerLogs,
            teamGameDates
        );

        // Also compute last 30 days
        const last30Qualifying = filterToLastNDays(result.qualifyingDates, 30);
        const last30TeamDates = filterToLastNDays(new Set(teamGameDates), 30);
        
        // For individual eligible dates in last 30 days, 
        // depends on condition type
        let last30Eligible;
        if (condition.conditionDef.id === 'does_not_play' || condition.conditionDef.id === 'plays') {
            last30Eligible = last30TeamDates.size;
        } else {
            // For stat/start/bench conditions, eligible = games the player played in last 30
            const playerLast30Played = filterToLastNDays(
                new Set(playerLogs.map(l => l.Date)),
                30
            );
            last30Eligible = playerLast30Played.size;
        }

        individualResults.push({
            playerName: condition.player.displayName,
            description: result.description,
            seasonHits: result.qualifyingDates.size,
            seasonEligible: result.totalEligibleDates,
            seasonRate: result.totalEligibleDates > 0 
                ? (result.qualifyingDates.size / result.totalEligibleDates * 100).toFixed(1) 
                : '0.0',
            last30Hits: last30Qualifying.size,
            last30Eligible: last30Eligible,
            last30Rate: last30Eligible > 0
                ? (last30Qualifying.size / last30Eligible * 100).toFixed(1)
                : '0.0',
            qualifyingDates: result.qualifyingDates,
        });
    }

    // Step 4: Intersect all qualifying dates to find combined hits
    // Start with the first condition's qualifying dates, then intersect with each subsequent
    let combinedDates = new Set(individualResults[0].qualifyingDates);
    
    for (let i = 1; i < individualResults.length; i++) {
        const nextDates = individualResults[i].qualifyingDates;
        const intersection = new Set();
        combinedDates.forEach(date => {
            if (nextDates.has(date)) {
                intersection.add(date);
            }
        });
        combinedDates = intersection;
    }

    // Step 5: Determine the eligible universe for the combined check
    // The eligible universe is the set of dates where all "positive" conditions 
    // COULD have been evaluated. For simplicity, use team game dates as the universe.
    const combinedEligible = teamGameDates.length;
    
    // Last 30 days combined
    const combinedLast30 = filterToLastNDays(combinedDates, 30);
    const last30TeamDates = filterToLastNDays(new Set(teamGameDates), 30);
    const combinedLast30Eligible = last30TeamDates.size;

    // Step 6: Sort combined qualifying dates for the game list
    const sortedCombinedDates = [...combinedDates].sort((a, b) => {
        const dateA = parseGameLogDate(a);
        const dateB = parseGameLogDate(b);
        return dateB - dateA; // Most recent first
    });

    return {
        combined: {
            hits: combinedDates.size,
            eligible: combinedEligible,
            rate: combinedEligible > 0 
                ? (combinedDates.size / combinedEligible * 100).toFixed(1) 
                : '0.0',
            last30Hits: combinedLast30.size,
            last30Eligible: combinedLast30Eligible,
            last30Rate: combinedLast30Eligible > 0
                ? (combinedLast30.size / combinedLast30Eligible * 100).toFixed(1)
                : '0.0',
            dates: sortedCombinedDates,
        },
        individual: individualResults.map(r => ({
            playerName: r.playerName,
            description: r.description,
            seasonHits: r.seasonHits,
            seasonEligible: r.seasonEligible,
            seasonRate: r.seasonRate,
            last30Hits: r.last30Hits,
            last30Eligible: r.last30Eligible,
            last30Rate: r.last30Rate,
        })),
        conditionCount: conditions.length,
    };
}
