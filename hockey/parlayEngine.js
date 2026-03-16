// hockey/parlayEngine.js
// Simplified vs basketball: no position scoping (starts/bench)
// Just "plays" (has a game log entry) vs "does not play" (no entry on a team game date)

import { fetchHockeyGameLogs } from './dataService.js';

function parseDate(dateStr) {
    if (!dateStr) return null;
    // Hockey dates may be YYYY-MM-DD format
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function normalizeDateKey(dateStr) {
    // Normalize to consistent string key for set operations
    return (dateStr || '').trim();
}

function filterToLast30Days(dates) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const filtered = new Set();
    dates.forEach(dateStr => {
        const d = parseDate(dateStr);
        if (d && d >= cutoff && d < endDate) filtered.add(dateStr);
    });
    return filtered;
}

/** Helper: find actual column name from possible variants */
function findColumn(sampleRow, candidates) {
    if (!sampleRow) return candidates[0];
    for (const c of candidates) {
        if (c in sampleRow) return c;
    }
    // Try case-insensitive match against all keys
    const keys = Object.keys(sampleRow);
    for (const c of candidates) {
        const lower = c.toLowerCase().replace(/[\s_]+/g, '');
        const match = keys.find(k => k.toLowerCase().replace(/[\s_]+/g, '') === lower);
        if (match) return match;
    }
    return candidates[0]; // fallback to first candidate
}

function evaluateProp(propDef, direction, value, logsByDate, scopedDates, columnMap) {
    const qualifyingDates = new Set();

    // "None" = all scoped dates qualify (no stat check)
    if (!propDef || propDef.type === 'none') {
        scopedDates.forEach(d => qualifyingDates.add(d));
        return { qualifyingDates, description: 'Any Game' };
    }

    // Resolve actual column name via the map
    const actualColumn = (columnMap && columnMap[propDef.column]) || propDef.column;

    // All hockey props are numeric
    scopedDates.forEach(date => {
        const log = logsByDate.get(date);
        if (!log) return;
        const sv = parseFloat(log[actualColumn]);
        if (isNaN(sv)) return;
        const th = parseFloat(value);
        if (direction === 'gte' && sv >= th) qualifyingDates.add(date);
        if (direction === 'lt' && sv < th) qualifyingDates.add(date);
    });

    const description = `${propDef.label} ${direction === 'gte' ? '≥' : '<'} ${value}`;
    return { qualifyingDates, description };
}

export async function runHockeyParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) return { error: 'No conditions to check' };

    const allTeamLogs = await fetchHockeyGameLogs(teamAbbrev);
    if (!allTeamLogs || allTeamLogs.length === 0) return { error: `No game log data found for ${teamAbbrev}.` };

    // Debug: log the actual column keys from the first row
    if (allTeamLogs.length > 0) {
        console.log('🏒 Game log sample keys:', Object.keys(allTeamLogs[0]));
        console.log('🏒 Game log sample row:', JSON.stringify(allTeamLogs[0]).substring(0, 300));
    }

    // Auto-detect column names (handle potential variations)
    const sampleRow = allTeamLogs[0];
    const COL_DATE = findColumn(sampleRow, ['Date', 'date']);
    const COL_PLAYER_NAME = findColumn(sampleRow, ['Player Name', 'Player_Name', 'player_name', 'PlayerName']);
    const COL_PLAYER_ID = findColumn(sampleRow, ['Player ID', 'Player_ID', 'player_id', 'PlayerID']);
    const COL_POINTS = findColumn(sampleRow, ['Points', 'points']);
    const COL_GOALS = findColumn(sampleRow, ['Goals', 'goals']);
    const COL_ASSISTS = findColumn(sampleRow, ['Assists', 'assists']);
    const COL_PPG = findColumn(sampleRow, ['Power Play Goals', 'Power_Play_Goals', 'power_play_goals', 'PowerPlayGoals']);
    const COL_BS = findColumn(sampleRow, ['Blocked Shots', 'Blocked_Shots', 'blocked_shots', 'BlockedShots']);
    const COL_SOG = findColumn(sampleRow, ['Shots on Goal', 'Shots_on_Goal', 'shots_on_goal', 'ShotsOnGoal']);

    console.log('🏒 Detected columns:', { COL_DATE, COL_PLAYER_NAME, COL_PLAYER_ID, COL_POINTS, COL_GOALS, COL_ASSISTS, COL_PPG, COL_BS, COL_SOG });

    // Build a column resolver for prop evaluation
    const columnMap = {
        'Points': COL_POINTS,
        'Goals': COL_GOALS,
        'Assists': COL_ASSISTS,
        'Power Play Goals': COL_PPG,
        'Blocked Shots': COL_BS,
        'Shots on Goal': COL_SOG,
    };

    const allTeamDates = [...new Set(allTeamLogs.map(r => normalizeDateKey(r[COL_DATE])))];

    // Group logs by Player ID (as string) for reliable matching
    const playerLogsByPID = new Map();
    // Also group by Player Name as fallback
    const playerLogsByName = new Map();
    allTeamLogs.forEach(log => {
        const pid = log[COL_PLAYER_ID];
        const name = log[COL_PLAYER_NAME];
        if (pid != null) {
            const pidStr = String(pid);
            if (!playerLogsByPID.has(pidStr)) playerLogsByPID.set(pidStr, []);
            playerLogsByPID.get(pidStr).push(log);
        }
        if (name) {
            if (!playerLogsByName.has(name)) playerLogsByName.set(name, []);
            playerLogsByName.get(name).push(log);
        }
    });

    console.log(`🏒 Indexed ${playerLogsByPID.size} players by ID, ${playerLogsByName.size} by name`);

    // ---- Phase 1: Compute per-row scoped dates and qualifying dates ----
    const rowData = [];

    for (const cond of conditions) {
        // Find player's logs by Player ID first (as string), then by gameLogName
        let playerLogs = [];
        if (cond.player.playerId != null) {
            const pidStr = String(cond.player.playerId);
            playerLogs = playerLogsByPID.get(pidStr) || [];
            console.log(`🏒 Matching "${cond.player.displayName}" by PID ${pidStr}: ${playerLogs.length} logs`);
        }
        if (playerLogs.length === 0 && cond.player.gameLogName) {
            playerLogs = playerLogsByName.get(cond.player.gameLogName) || [];
            console.log(`🏒 Matching "${cond.player.displayName}" by name "${cond.player.gameLogName}": ${playerLogs.length} logs`);
            // Try fuzzy match on name
            if (playerLogs.length === 0) {
                const fuzzy = findFuzzyMatch(cond.player.gameLogName, playerLogsByName);
                if (fuzzy) {
                    playerLogs = playerLogsByName.get(fuzzy) || [];
                    console.log(`🏒 Fuzzy matched "${cond.player.gameLogName}" → "${fuzzy}": ${playerLogs.length} logs`);
                }
            }
        }

        const logsByDate = new Map();
        playerLogs.forEach(log => logsByDate.set(normalizeDateKey(log[COL_DATE]), log));
        const allTeamDateSet = new Set(allTeamDates);

        // DNP: team dates where player has no log entry
        if (cond.scope === 'dnp' || cond.propId === 'does_not_play') {
            const qualifyingDates = new Set();
            allTeamDateSet.forEach(d => { if (!logsByDate.has(d)) qualifyingDates.add(d); });
            rowData.push({
                playerName: cond.player.displayName,
                description: 'Does Not Play',
                qualifyingDates,
                scopedDates: new Set(allTeamDates),
            });
            continue;
        }

        // "All Games" scope = all dates where player has a log entry
        const scopedDates = new Set();
        logsByDate.forEach((_, date) => scopedDates.add(date));

        const propResult = evaluateProp(cond.propDef, cond.direction, cond.value, logsByDate, scopedDates, columnMap);

        let description;
        if (cond.propId === 'none') {
            description = 'Plays';
        } else {
            description = propResult.description;
        }

        rowData.push({
            playerName: cond.player.displayName,
            description,
            qualifyingDates: propResult.qualifyingDates,
            scopedDates,
        });
    }

    // ---- Phase 2: Intersect all scoped dates → combined eligible pool ----
    let combinedEligible = new Set(rowData[0].scopedDates);
    for (let i = 1; i < rowData.length; i++) {
        const next = rowData[i].scopedDates;
        const inter = new Set();
        combinedEligible.forEach(d => { if (next.has(d)) inter.add(d); });
        combinedEligible = inter;
    }

    // ---- Phase 3: Intersect all qualifying dates → combined hits ----
    let combinedQualifying = new Set(rowData[0].qualifyingDates);
    for (let i = 1; i < rowData.length; i++) {
        const next = rowData[i].qualifyingDates;
        const inter = new Set();
        combinedQualifying.forEach(d => { if (next.has(d)) inter.add(d); });
        combinedQualifying = inter;
    }

    // ---- Phase 4: Build individual results using combined eligible as denominator ----
    const combinedElig30 = filterToLast30Days(combinedEligible);
    const combinedQual30 = filterToLast30Days(combinedQualifying);
    const teamDates30 = filterToLast30Days(new Set(allTeamDates));

    const individual = rowData.map(r => {
        const hitsInPool = new Set();
        r.qualifyingDates.forEach(d => { if (combinedEligible.has(d)) hitsInPool.add(d); });
        const hits30 = filterToLast30Days(hitsInPool);

        return {
            playerName: r.playerName, description: r.description,
            seasonHits: hitsInPool.size,
            seasonEligible: combinedEligible.size,
            seasonRate: combinedEligible.size > 0 ? (hitsInPool.size / combinedEligible.size * 100).toFixed(1) : '0.0',
            last30Hits: hits30.size,
            last30Eligible: combinedElig30.size,
            last30Rate: combinedElig30.size > 0 ? (hits30.size / combinedElig30.size * 100).toFixed(1) : '0.0',
        };
    });

    const sortedDates = [...combinedQualifying].sort((a, b) => parseDate(b) - parseDate(a));

    return {
        combined: {
            hits: combinedQualifying.size, eligible: combinedEligible.size,
            rate: combinedEligible.size > 0 ? (combinedQualifying.size / combinedEligible.size * 100).toFixed(1) : '0.0',
            last30Hits: combinedQual30.size, last30Eligible: combinedElig30.size,
            last30Rate: combinedElig30.size > 0 ? (combinedQual30.size / combinedElig30.size * 100).toFixed(1) : '0.0',
            dates: sortedDates,
        },
        teamGames: { season: allTeamDates.length, last30: teamDates30.size },
        individual,
        conditionCount: conditions.length,
    };
}

function findFuzzyMatch(targetName, playerLogsMap) {
    const tLow = targetName.toLowerCase().replace(/[.,\s]+/g, '');
    for (const [name] of playerLogsMap) {
        if (name.toLowerCase().replace(/[.,\s]+/g, '') === tLow) return name;
    }
    return null;
}
