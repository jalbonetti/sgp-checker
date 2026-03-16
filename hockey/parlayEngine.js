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

function evaluateProp(propDef, direction, value, logsByDate, scopedDates) {
    const qualifyingDates = new Set();

    // "None" = all scoped dates qualify (no stat check)
    if (!propDef || propDef.type === 'none') {
        scopedDates.forEach(d => qualifyingDates.add(d));
        return { qualifyingDates, description: 'Any Game' };
    }

    // All hockey props are numeric
    scopedDates.forEach(date => {
        const log = logsByDate.get(date);
        if (!log) return;
        const sv = parseFloat(log[propDef.column]);
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

    const allTeamDates = [...new Set(allTeamLogs.map(r => normalizeDateKey(r.Date)))];

    // Group logs by Player ID for reliable matching
    const playerLogsByPID = new Map();
    // Also group by Player Name as fallback
    const playerLogsByName = new Map();
    allTeamLogs.forEach(log => {
        const pid = log['Player ID'];
        const name = log['Player Name'];
        if (pid) {
            if (!playerLogsByPID.has(pid)) playerLogsByPID.set(pid, []);
            playerLogsByPID.get(pid).push(log);
        }
        if (name) {
            if (!playerLogsByName.has(name)) playerLogsByName.set(name, []);
            playerLogsByName.get(name).push(log);
        }
    });

    // ---- Phase 1: Compute per-row scoped dates and qualifying dates ----
    const rowData = [];

    for (const cond of conditions) {
        // Find player's logs by Player ID first, then by gameLogName
        let playerLogs = [];
        if (cond.player.playerId) {
            playerLogs = playerLogsByPID.get(cond.player.playerId) || [];
        }
        if (playerLogs.length === 0 && cond.player.gameLogName) {
            playerLogs = playerLogsByName.get(cond.player.gameLogName) || [];
            // Try fuzzy match on name
            if (playerLogs.length === 0) {
                const fuzzy = findFuzzyMatch(cond.player.gameLogName, playerLogsByName);
                if (fuzzy) playerLogs = playerLogsByName.get(fuzzy) || [];
            }
        }

        const logsByDate = new Map();
        playerLogs.forEach(log => logsByDate.set(normalizeDateKey(log.Date), log));
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

        const propResult = evaluateProp(cond.propDef, cond.direction, cond.value, logsByDate, scopedDates);

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
