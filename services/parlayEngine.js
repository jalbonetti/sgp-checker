// services/parlayEngine.js - Condition Evaluation & Intersection Engine
// UPDATED:
// - Works with pre-fetched team game logs (all logs fetched once per check)
// - Last 30 days = yesterday minus 30 days (matches rest of site)
// - Better handling of Does Not Play inverse logic

import { STARTER_POSITIONS, BENCH_POSITION } from '../config.js';
import { fetchTeamGameLogs } from './dataService.js';

/**
 * Evaluate a single condition against a player's game logs
 */
export function evaluateCondition(condition, conditionDef, playerGameLogs, allTeamDates) {
    const { direction, value } = condition;
    const type = conditionDef.type;

    const logsByDate = new Map();
    playerGameLogs.forEach(log => { logsByDate.set(log.Date, log); });

    const allTeamDateSet = new Set(allTeamDates);
    const playerPlayedDates = new Set(logsByDate.keys());

    let qualifyingDates = new Set();
    let totalEligibleDates = 0;
    let description = '';

    switch (type) {
        case 'filter': {
            switch (conditionDef.id) {
                case 'starts': {
                    logsByDate.forEach((log, date) => {
                        const pos = (log.Position || '').trim();
                        if (STARTER_POSITIONS.includes(pos)) qualifyingDates.add(date);
                    });
                    totalEligibleDates = playerPlayedDates.size;
                    description = 'Starts';
                    break;
                }
                case 'off_bench': {
                    logsByDate.forEach((log, date) => {
                        const pos = (log.Position || '').trim();
                        if (pos === BENCH_POSITION) qualifyingDates.add(date);
                    });
                    totalEligibleDates = playerPlayedDates.size;
                    description = 'Off Bench';
                    break;
                }
                case 'plays': {
                    qualifyingDates = new Set(playerPlayedDates);
                    totalEligibleDates = allTeamDateSet.size;
                    description = 'Plays';
                    break;
                }
                case 'does_not_play': {
                    allTeamDateSet.forEach(date => {
                        if (!playerPlayedDates.has(date)) qualifyingDates.add(date);
                    });
                    totalEligibleDates = allTeamDateSet.size;
                    description = 'Does Not Play';
                    break;
                }
            }
            break;
        }
        case 'numeric': {
            const column = conditionDef.column;
            const threshold = parseFloat(value);
            logsByDate.forEach((log, date) => {
                const statValue = parseFloat(log[column]);
                if (isNaN(statValue)) return;
                if (direction === 'gte' && statValue >= threshold) qualifyingDates.add(date);
                if (direction === 'lt' && statValue < threshold) qualifyingDates.add(date);
            });
            totalEligibleDates = playerPlayedDates.size;
            const dirLabel = direction === 'gte' ? '≥' : '<';
            description = `${conditionDef.label} ${dirLabel} ${value}`;
            break;
        }
        case 'binary': {
            const column = conditionDef.column;
            logsByDate.forEach((log, date) => {
                const binaryValue = parseInt(log[column]);
                if (direction === 'yes' && binaryValue === 1) qualifyingDates.add(date);
                if (direction === 'no' && (binaryValue === 0 || isNaN(binaryValue))) qualifyingDates.add(date);
            });
            totalEligibleDates = playerPlayedDates.size;
            description = `${conditionDef.label}: ${direction === 'yes' ? 'Yes' : 'No'}`;
            break;
        }
    }

    return { qualifyingDates, totalEligibleDates, description };
}

/**
 * Filter dates to last 30 days window.
 * "Last 30 days" = yesterday going back 30 days.
 * We use today - 31 days as the cutoff (so yesterday minus 30 is included).
 * This matches how the rest of the site calculates it.
 */
export function filterToLast30Days(dates) {
    const now = new Date();
    // Set to start of today, then subtract 31 days
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
    // End = start of today (exclude today since games haven't been played yet)
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const filtered = new Set();
    dates.forEach(dateStr => {
        const d = parseGameLogDate(dateStr);
        if (d && d >= cutoff && d < endDate) filtered.add(dateStr);
    });
    return filtered;
}

function parseGameLogDate(dateStr) {
    if (!dateStr) return null;
    // Game logs use "MM/DD/YYYY" format based on sample data (e.g., "10/21/2025")
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
    // Fallback to native parse
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Main entry point: run the full check across all conditions
 * 
 * NEW APPROACH: Fetch ALL team game logs once, then slice per-player in JS.
 * This is much more efficient than per-player API calls.
 */
export async function runParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) {
        return { error: 'No conditions to check' };
    }

    console.log(`🏀 Running check with ${conditions.length} conditions for ${teamAbbrev}...`);

    // Step 1: Fetch ALL game logs for this team at once
    const allTeamLogs = await fetchTeamGameLogs(teamAbbrev);

    if (!allTeamLogs || allTeamLogs.length === 0) {
        return { error: `No game log data found for ${teamAbbrev}. The team's game logs may not be available yet.` };
    }

    // Step 2: Derive the team's schedule (unique game dates)
    const allTeamDates = [...new Set(allTeamLogs.map(row => row.Date))];
    console.log(`📅 Team has ${allTeamDates.length} game dates this season`);

    // Step 3: Build per-player lookup from the team logs
    // Key = game log player name (e.g., "Edwards, Anthony")
    const playerLogsMap = new Map();
    allTeamLogs.forEach(log => {
        const playerName = log.Player;
        if (!playerLogsMap.has(playerName)) {
            playerLogsMap.set(playerName, []);
        }
        playerLogsMap.get(playerName).push(log);
    });

    console.log(`👥 Found ${playerLogsMap.size} unique players in game logs`);
    console.log('   Players:', [...playerLogsMap.keys()].join(', '));

    // Step 4: Evaluate each condition
    const individualResults = [];

    for (const condition of conditions) {
        const gameLogName = condition.player.gameLogName;
        let playerLogs = playerLogsMap.get(gameLogName) || [];

        // If no logs found with exact name, try fuzzy matching
        if (playerLogs.length === 0) {
            console.warn(`⚠️ No exact match for "${gameLogName}", trying fuzzy match...`);
            const fuzzyMatch = findFuzzyPlayerMatch(gameLogName, playerLogsMap);
            if (fuzzyMatch) {
                console.log(`   ✅ Fuzzy matched to "${fuzzyMatch}"`);
                playerLogs = playerLogsMap.get(fuzzyMatch) || [];
            } else {
                console.warn(`   ❌ No fuzzy match found for "${gameLogName}"`);
            }
        }

        const result = evaluateCondition(condition, condition.conditionDef, playerLogs, allTeamDates);

        // Last 30 days calculations
        const last30Qualifying = filterToLast30Days(result.qualifyingDates);
        const last30TeamDates = filterToLast30Days(new Set(allTeamDates));

        let last30Eligible;
        if (condition.conditionDef.id === 'does_not_play' || condition.conditionDef.id === 'plays') {
            last30Eligible = last30TeamDates.size;
        } else {
            const playerLast30Played = filterToLast30Days(new Set(playerLogs.map(l => l.Date)));
            last30Eligible = playerLast30Played.size;
        }

        individualResults.push({
            playerName: condition.player.displayName,
            description: result.description,
            seasonHits: result.qualifyingDates.size,
            seasonEligible: result.totalEligibleDates,
            seasonRate: result.totalEligibleDates > 0
                ? (result.qualifyingDates.size / result.totalEligibleDates * 100).toFixed(1) : '0.0',
            last30Hits: last30Qualifying.size,
            last30Eligible,
            last30Rate: last30Eligible > 0
                ? (last30Qualifying.size / last30Eligible * 100).toFixed(1) : '0.0',
            qualifyingDates: result.qualifyingDates,
        });
    }

    // Step 5: Intersect all qualifying dates
    let combinedDates = new Set(individualResults[0].qualifyingDates);
    for (let i = 1; i < individualResults.length; i++) {
        const next = individualResults[i].qualifyingDates;
        const intersection = new Set();
        combinedDates.forEach(d => { if (next.has(d)) intersection.add(d); });
        combinedDates = intersection;
    }

    const combinedEligible = allTeamDates.length;
    const combinedLast30 = filterToLast30Days(combinedDates);
    const last30TeamDates = filterToLast30Days(new Set(allTeamDates));

    const sortedDates = [...combinedDates].sort((a, b) => {
        const da = parseGameLogDate(a);
        const db = parseGameLogDate(b);
        return db - da;
    });

    return {
        combined: {
            hits: combinedDates.size,
            eligible: combinedEligible,
            rate: combinedEligible > 0 ? (combinedDates.size / combinedEligible * 100).toFixed(1) : '0.0',
            last30Hits: combinedLast30.size,
            last30Eligible: last30TeamDates.size,
            last30Rate: last30TeamDates.size > 0
                ? (combinedLast30.size / last30TeamDates.size * 100).toFixed(1) : '0.0',
            dates: sortedDates,
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

/**
 * Try to fuzzy match a game log name against available player names
 * Handles cases where alias table didn't cover a player
 */
function findFuzzyPlayerMatch(targetName, playerLogsMap) {
    const targetLower = targetName.toLowerCase().replace(/[.,\s]+/g, '');
    
    for (const [name] of playerLogsMap) {
        const nameLower = name.toLowerCase().replace(/[.,\s]+/g, '');
        // Check if they match after removing punctuation/spaces
        if (targetLower === nameLower) return name;
        // Check if one contains the other's last name
        const targetParts = targetName.split(',').map(s => s.trim().toLowerCase());
        const nameParts = name.split(',').map(s => s.trim().toLowerCase());
        if (targetParts[0] && nameParts[0] && targetParts[0] === nameParts[0]) return name;
    }
    return null;
}
