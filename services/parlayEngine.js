// services/parlayEngine.js
// - Individual denominators use combined eligible pool (intersected scoped dates)
// - "None" prop = all scoped dates qualify (no stat filter)
// - "Does Not Play" = team dates minus player dates

import { STARTER_POSITIONS, BENCH_POSITION } from '../config.js';
import { fetchTeamGameLogs } from './dataService.js';

function parseGameLogDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

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

function getScopedDates(scopeId, logsByDate) {
    const s = new Set();
    switch (scopeId) {
        case 'starts':
            logsByDate.forEach((log, date) => { if (STARTER_POSITIONS.includes((log.Position || '').trim())) s.add(date); }); break;
        case 'off_bench':
            logsByDate.forEach((log, date) => { if ((log.Position || '').trim() === BENCH_POSITION) s.add(date); }); break;
        default:
            logsByDate.forEach((_, date) => s.add(date)); break;
    }
    return s;
}

function getScopeLabel(scopeId) {
    switch (scopeId) { case 'starts': return 'Starts'; case 'off_bench': return 'Off Bench'; default: return null; }
}

function evaluateProp(propDef, direction, value, logsByDate, scopedDates) {
    const qualifyingDates = new Set();

    // "None" = all scoped dates qualify (no stat check)
    if (!propDef || propDef.type === 'none') {
        scopedDates.forEach(d => qualifyingDates.add(d));
        return { qualifyingDates, description: 'Any Game' };
    }

    const isBinary = propDef.column === 'DD' || propDef.column === 'TD';
    scopedDates.forEach(date => {
        const log = logsByDate.get(date);
        if (!log) return;
        if (isBinary) {
            const bv = parseInt(log[propDef.column]);
            if (direction === 'yes' && bv === 1) qualifyingDates.add(date);
            if (direction === 'no' && (bv === 0 || isNaN(bv))) qualifyingDates.add(date);
        } else {
            const sv = parseFloat(log[propDef.column]);
            if (isNaN(sv)) return;
            const th = parseFloat(value);
            if (direction === 'gte' && sv >= th) qualifyingDates.add(date);
            if (direction === 'lt' && sv < th) qualifyingDates.add(date);
        }
    });

    let description;
    if (isBinary) description = `${propDef.label}: ${direction === 'yes' ? 'Yes' : 'No'}`;
    else description = `${propDef.label} ${direction === 'gte' ? '≥' : '<'} ${value}`;
    return { qualifyingDates, description };
}

export async function runParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) return { error: 'No conditions to check' };

    const allTeamLogs = await fetchTeamGameLogs(teamAbbrev);
    if (!allTeamLogs || allTeamLogs.length === 0) return { error: `No game log data found for ${teamAbbrev}.` };

    const allTeamDates = [...new Set(allTeamLogs.map(r => r.Date))];

    const playerLogsMap = new Map();
    allTeamLogs.forEach(log => {
        if (!playerLogsMap.has(log.Player)) playerLogsMap.set(log.Player, []);
        playerLogsMap.get(log.Player).push(log);
    });

    // ---- Phase 1: Compute per-row scoped dates and qualifying dates ----
    const rowData = []; // { qualifyingDates, scopedDates, playerName, description }

    for (const cond of conditions) {
        const gameLogName = cond.player.gameLogName;
        let playerLogs = playerLogsMap.get(gameLogName) || [];
        if (playerLogs.length === 0) {
            const fuzzy = findFuzzyPlayerMatch(gameLogName, playerLogsMap);
            if (fuzzy) { playerLogs = playerLogsMap.get(fuzzy) || []; }
        }

        const logsByDate = new Map();
        playerLogs.forEach(log => logsByDate.set(log.Date, log));
        const allTeamDateSet = new Set(allTeamDates);

        if (cond.scope === 'dnp' || cond.propId === 'does_not_play') {
            const qualifyingDates = new Set();
            allTeamDateSet.forEach(d => { if (!logsByDate.has(d)) qualifyingDates.add(d); });
            rowData.push({
                playerName: cond.player.displayName,
                description: 'Does Not Play',
                qualifyingDates,
                scopedDates: new Set(allTeamDates), // DNP scope = all team dates
            });
            continue;
        }

        const scopedDates = getScopedDates(cond.scope, logsByDate);
        const scopeLabel = getScopeLabel(cond.scope);
        const propResult = evaluateProp(cond.propDef, cond.direction, cond.value, logsByDate, scopedDates);

        let description;
        if (cond.propId === 'none') {
            description = scopeLabel ? scopeLabel : 'Any Game';
        } else {
            description = scopeLabel ? `${scopeLabel} · ${propResult.description}` : propResult.description;
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
        // Hits within the combined eligible pool
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

    const sortedDates = [...combinedQualifying].sort((a, b) => parseGameLogDate(b) - parseGameLogDate(a));

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

function findFuzzyPlayerMatch(targetName, playerLogsMap) {
    const tLow = targetName.toLowerCase().replace(/[.,\s]+/g, '');
    for (const [name] of playerLogsMap) {
        if (name.toLowerCase().replace(/[.,\s]+/g, '') === tLow) return name;
        const tParts = targetName.split(',').map(s => s.trim().toLowerCase());
        const nParts = name.split(',').map(s => s.trim().toLowerCase());
        if (tParts[0] && nParts[0] && tParts[0] === nParts[0]) return name;
    }
    return null;
}
