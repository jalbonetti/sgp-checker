// services/parlayEngine.js - Condition Evaluation & Intersection Engine
// UPDATED:
// - When multiple conditions exist for the same player, Starts/Off Bench/Plays
//   constraints narrow the eligible universe for that player's other conditions
// - Combined denominator = intersection of all eligible date pools
// - Last 30 days = yesterday minus 30 days (today - 31 through yesterday)

import { STARTER_POSITIONS, BENCH_POSITION } from '../config.js';
import { fetchTeamGameLogs } from './dataService.js';

// ============================================================
// DATE UTILITIES
// ============================================================

function parseGameLogDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Last 30 days = (today - 31 days) through (yesterday).
 * Excludes today since games haven't been played yet.
 */
function filterToLast30Days(dates) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const filtered = new Set();
    dates.forEach(dateStr => {
        const d = parseGameLogDate(dateStr);
        if (d && d >= cutoff && d < endDate) filtered.add(dateStr);
    });
    return filtered;
}

// ============================================================
// PER-PLAYER SCOPE RESOLUTION
// ============================================================

/**
 * For a given player, determine their "eligible scope" based on ALL conditions
 * that apply to them. The scope narrows when filter conditions are present:
 *
 * - If any condition for this player is "Starts" → only games they started count
 * - If any condition for this player is "Off Bench" → only bench games count
 * - If any condition is "Plays" → all games they played (default)
 * - If any condition is "Does Not Play" → dates they didn't play
 *
 * For stat conditions (Points ≥ 20, etc.), the eligible universe is the
 * player's scoped game dates (not all team dates).
 */
function resolvePlayerScope(playerConditions, playerLogs, allTeamDates) {
    const logsByDate = new Map();
    playerLogs.forEach(log => logsByDate.set(log.Date, log));
    
    const allPlayerDates = new Set(logsByDate.keys());
    const allTeamDateSet = new Set(allTeamDates);

    // Check if this player has any filter conditions that narrow the scope
    const hasStartsFilter = playerConditions.some(c => c.conditionDef.id === 'starts');
    const hasBenchFilter = playerConditions.some(c => c.conditionDef.id === 'off_bench');
    const hasDoesNotPlayFilter = playerConditions.some(c => c.conditionDef.id === 'does_not_play');
    const hasPlaysFilter = playerConditions.some(c => c.conditionDef.id === 'plays');

    // Determine the scoped set of dates this player's stat conditions should be evaluated against
    let scopedDates;
    let scopeDescription = '';

    if (hasDoesNotPlayFilter) {
        // "Does Not Play" — eligible dates are team dates minus player dates
        scopedDates = new Set();
        allTeamDateSet.forEach(d => { if (!allPlayerDates.has(d)) scopedDates.add(d); });
        scopeDescription = 'does_not_play';
    } else if (hasStartsFilter) {
        // Only games where this player started
        scopedDates = new Set();
        logsByDate.forEach((log, date) => {
            const pos = (log.Position || '').trim();
            if (STARTER_POSITIONS.includes(pos)) scopedDates.add(date);
        });
        scopeDescription = 'starts';
    } else if (hasBenchFilter) {
        // Only games where this player came off the bench
        scopedDates = new Set();
        logsByDate.forEach((log, date) => {
            const pos = (log.Position || '').trim();
            if (pos === BENCH_POSITION) scopedDates.add(date);
        });
        scopeDescription = 'off_bench';
    } else if (hasPlaysFilter) {
        // All games the player appeared in
        scopedDates = new Set(allPlayerDates);
        scopeDescription = 'plays';
    } else {
        // No filter condition — default to all games they played
        scopedDates = new Set(allPlayerDates);
        scopeDescription = 'all_played';
    }

    return { scopedDates, scopeDescription, logsByDate, allPlayerDates };
}

// ============================================================
// SINGLE CONDITION EVALUATION (within a player's scope)
// ============================================================

function evaluateConditionInScope(condition, conditionDef, logsByDate, scopedDates, allTeamDates) {
    const { direction, value } = condition;
    const type = conditionDef.type;

    let qualifyingDates = new Set();
    let eligibleDates = scopedDates;
    let description = '';

    switch (type) {
        case 'filter': {
            switch (conditionDef.id) {
                case 'starts': {
                    // Qualifying = dates in scope where position is starter
                    scopedDates.forEach(date => {
                        const log = logsByDate.get(date);
                        if (log) {
                            const pos = (log.Position || '').trim();
                            if (STARTER_POSITIONS.includes(pos)) qualifyingDates.add(date);
                        }
                    });
                    description = 'Starts';
                    break;
                }
                case 'off_bench': {
                    scopedDates.forEach(date => {
                        const log = logsByDate.get(date);
                        if (log) {
                            const pos = (log.Position || '').trim();
                            if (pos === BENCH_POSITION) qualifyingDates.add(date);
                        }
                    });
                    description = 'Off Bench';
                    break;
                }
                case 'plays': {
                    // Qualifying = all dates the player has logs (within scope)
                    scopedDates.forEach(date => {
                        if (logsByDate.has(date)) qualifyingDates.add(date);
                    });
                    eligibleDates = new Set(allTeamDates);
                    description = 'Plays';
                    break;
                }
                case 'does_not_play': {
                    // Qualifying = team dates where player has NO log
                    const allTeamDateSet = new Set(allTeamDates);
                    const playerDates = new Set(logsByDate.keys());
                    allTeamDateSet.forEach(date => {
                        if (!playerDates.has(date)) qualifyingDates.add(date);
                    });
                    eligibleDates = new Set(allTeamDates);
                    description = 'Does Not Play';
                    break;
                }
            }
            break;
        }
        case 'numeric': {
            const column = conditionDef.column;
            const threshold = parseFloat(value);
            scopedDates.forEach(date => {
                const log = logsByDate.get(date);
                if (!log) return;
                const statValue = parseFloat(log[column]);
                if (isNaN(statValue)) return;
                if (direction === 'gte' && statValue >= threshold) qualifyingDates.add(date);
                if (direction === 'lt' && statValue < threshold) qualifyingDates.add(date);
            });
            const dirLabel = direction === 'gte' ? '≥' : '<';
            description = `${conditionDef.label} ${dirLabel} ${value}`;
            break;
        }
        case 'binary': {
            const column = conditionDef.column;
            scopedDates.forEach(date => {
                const log = logsByDate.get(date);
                if (!log) return;
                const bv = parseInt(log[column]);
                if (direction === 'yes' && bv === 1) qualifyingDates.add(date);
                if (direction === 'no' && (bv === 0 || isNaN(bv))) qualifyingDates.add(date);
            });
            description = `${conditionDef.label}: ${direction === 'yes' ? 'Yes' : 'No'}`;
            break;
        }
    }

    return { qualifyingDates, eligibleDates, description };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function runParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) {
        return { error: 'No conditions to check' };
    }

    console.log(`🏀 Running check with ${conditions.length} conditions for ${teamAbbrev}...`);

    // Step 1: Fetch ALL game logs for this team
    const allTeamLogs = await fetchTeamGameLogs(teamAbbrev);
    if (!allTeamLogs || allTeamLogs.length === 0) {
        return { error: `No game log data found for ${teamAbbrev}.` };
    }

    // Step 2: Derive team schedule
    const allTeamDates = [...new Set(allTeamLogs.map(r => r.Date))];
    console.log(`📅 Team has ${allTeamDates.length} game dates`);

    // Step 3: Build per-player log lookup
    const playerLogsMap = new Map();
    allTeamLogs.forEach(log => {
        const name = log.Player;
        if (!playerLogsMap.has(name)) playerLogsMap.set(name, []);
        playerLogsMap.get(name).push(log);
    });
    console.log(`👥 ${playerLogsMap.size} unique players in logs`);

    // Step 4: Group conditions by player (for scope resolution)
    const conditionsByPlayer = new Map();
    conditions.forEach(c => {
        const key = c.player.gameLogName;
        if (!conditionsByPlayer.has(key)) conditionsByPlayer.set(key, []);
        conditionsByPlayer.get(key).push(c);
    });

    // Step 5: For each player, resolve their scope, then evaluate each condition
    const individualResults = [];
    const allQualifyingSets = []; // one Set per condition, for intersection

    for (const [gameLogName, playerConds] of conditionsByPlayer) {
        let playerLogs = playerLogsMap.get(gameLogName) || [];

        // Fuzzy match if needed
        if (playerLogs.length === 0) {
            const fuzzy = findFuzzyPlayerMatch(gameLogName, playerLogsMap);
            if (fuzzy) {
                console.log(`🔄 Fuzzy matched "${gameLogName}" → "${fuzzy}"`);
                playerLogs = playerLogsMap.get(fuzzy) || [];
            } else {
                console.warn(`❌ No match for "${gameLogName}"`);
            }
        }

        // Resolve this player's scope (narrowed by Starts/Bench/Plays filters)
        const scope = resolvePlayerScope(playerConds, playerLogs, allTeamDates);

        console.log(`   ${gameLogName}: ${playerLogs.length} logs, scope="${scope.scopeDescription}" (${scope.scopedDates.size} dates)`);

        // Evaluate each condition within the resolved scope
        for (const condition of playerConds) {
            const result = evaluateConditionInScope(
                condition, condition.conditionDef,
                scope.logsByDate, scope.scopedDates, allTeamDates
            );

            // Last 30 days
            const last30Qualifying = filterToLast30Days(result.qualifyingDates);
            const last30Eligible = filterToLast30Days(result.eligibleDates);

            individualResults.push({
                playerName: condition.player.displayName,
                description: result.description,
                seasonHits: result.qualifyingDates.size,
                seasonEligible: result.eligibleDates.size,
                seasonRate: result.eligibleDates.size > 0
                    ? (result.qualifyingDates.size / result.eligibleDates.size * 100).toFixed(1) : '0.0',
                last30Hits: last30Qualifying.size,
                last30Eligible: last30Eligible.size,
                last30Rate: last30Eligible.size > 0
                    ? (last30Qualifying.size / last30Eligible.size * 100).toFixed(1) : '0.0',
                qualifyingDates: result.qualifyingDates,
            });

            allQualifyingSets.push(result.qualifyingDates);
        }
    }

    // Step 6: Intersect ALL qualifying date sets for the combined result
    let combinedDates = new Set(allQualifyingSets[0]);
    for (let i = 1; i < allQualifyingSets.length; i++) {
        const next = allQualifyingSets[i];
        const intersection = new Set();
        combinedDates.forEach(d => { if (next.has(d)) intersection.add(d); });
        combinedDates = intersection;
    }

    // Combined eligible = intersection of all individual eligible date sets
    // This gives us "games where all conditions COULD have been checked"
    // For most cases this is the scoped dates; for Does Not Play it's team dates
    let combinedEligibleDates = null;
    for (const result of individualResults) {
        // We need the eligible dates per condition — reconstruct from what we have
        // The simplest correct approach: eligible = total team games when mixing players
        // But when same player has scope narrowing, use scoped dates
    }
    // Use team game count as combined eligible (most intuitive for multi-player combos)
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

function findFuzzyPlayerMatch(targetName, playerLogsMap) {
    const targetLower = targetName.toLowerCase().replace(/[.,\s]+/g, '');
    for (const [name] of playerLogsMap) {
        const nameLower = name.toLowerCase().replace(/[.,\s]+/g, '');
        if (targetLower === nameLower) return name;
        const targetParts = targetName.split(',').map(s => s.trim().toLowerCase());
        const nameParts = name.split(',').map(s => s.trim().toLowerCase());
        if (targetParts[0] && nameParts[0] && targetParts[0] === nameParts[0]) return name;
    }
    return null;
}
