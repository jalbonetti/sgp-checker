// services/parlayEngine.js - Condition Evaluation & Intersection Engine
// Supports:
// - Active players: scope (All/Starts/Bench) + prop
// - Injured players: "Does Not Play" (team dates minus player dates)
// - Combined denominator = intersection of all scoped date pools
// - Last 30 days = today-31 through yesterday

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
    const scopedDates = new Set();
    switch (scopeId) {
        case 'starts':
            logsByDate.forEach((log, date) => {
                if (STARTER_POSITIONS.includes((log.Position || '').trim())) scopedDates.add(date);
            });
            break;
        case 'off_bench':
            logsByDate.forEach((log, date) => {
                if ((log.Position || '').trim() === BENCH_POSITION) scopedDates.add(date);
            });
            break;
        case 'all': default:
            logsByDate.forEach((_, date) => scopedDates.add(date));
            break;
    }
    return scopedDates;
}

function getScopeLabel(scopeId) {
    switch (scopeId) {
        case 'starts': return 'Starts';
        case 'off_bench': return 'Off Bench';
        default: return null;
    }
}

function evaluateProp(propDef, direction, value, logsByDate, scopedDates) {
    const qualifyingDates = new Set();
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

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function runParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) return { error: 'No conditions to check' };

    console.log(`🏀 Running check: ${conditions.length} conditions for ${teamAbbrev}`);

    const allTeamLogs = await fetchTeamGameLogs(teamAbbrev);
    if (!allTeamLogs || allTeamLogs.length === 0) return { error: `No game log data found for ${teamAbbrev}.` };

    const allTeamDates = [...new Set(allTeamLogs.map(r => r.Date))];
    console.log(`📅 ${allTeamDates.length} team game dates`);

    const playerLogsMap = new Map();
    allTeamLogs.forEach(log => {
        if (!playerLogsMap.has(log.Player)) playerLogsMap.set(log.Player, []);
        playerLogsMap.get(log.Player).push(log);
    });

    // Evaluate each condition row
    const rowResults = [];

    for (const cond of conditions) {
        const gameLogName = cond.player.gameLogName;
        let playerLogs = playerLogsMap.get(gameLogName) || [];
        if (playerLogs.length === 0) {
            const fuzzy = findFuzzyPlayerMatch(gameLogName, playerLogsMap);
            if (fuzzy) { playerLogs = playerLogsMap.get(fuzzy) || []; console.log(`🔄 Fuzzy: "${gameLogName}" → "${fuzzy}"`); }
        }

        const logsByDate = new Map();
        playerLogs.forEach(log => logsByDate.set(log.Date, log));
        const playerPlayedDates = new Set(logsByDate.keys());
        const allTeamDateSet = new Set(allTeamDates);

        // Handle "Does Not Play" for injured players
        if (cond.propId === 'does_not_play') {
            // Qualifying dates = team dates where this player did NOT play
            const qualifyingDates = new Set();
            allTeamDateSet.forEach(d => { if (!playerPlayedDates.has(d)) qualifyingDates.add(d); });
            // Scoped dates = all team dates (the universe for this condition)
            const scopedDates = new Set(allTeamDates);

            console.log(`   ${cond.player.displayName} [DNP]: ${qualifyingDates.size}/${scopedDates.size}`);

            rowResults.push({
                playerName: cond.player.displayName,
                description: 'Does Not Play',
                qualifyingDates,
                scopedDates,
            });
            continue;
        }

        // Active player: scope + prop
        const scopedDates = getScopedDates(cond.scope, logsByDate);
        const scopeLabel = getScopeLabel(cond.scope);
        const propResult = evaluateProp(cond.propDef, cond.direction, cond.value, logsByDate, scopedDates);
        const description = scopeLabel ? `${scopeLabel} · ${propResult.description}` : propResult.description;

        console.log(`   ${cond.player.displayName} [${cond.scope}]: ${propResult.qualifyingDates.size}/${scopedDates.size} — ${description}`);

        rowResults.push({
            playerName: cond.player.displayName,
            description,
            qualifyingDates: propResult.qualifyingDates,
            scopedDates,
        });
    }

    // Intersect qualifying dates
    let combinedQualifying = new Set(rowResults[0].qualifyingDates);
    for (let i = 1; i < rowResults.length; i++) {
        const next = rowResults[i].qualifyingDates;
        const inter = new Set();
        combinedQualifying.forEach(d => { if (next.has(d)) inter.add(d); });
        combinedQualifying = inter;
    }

    // Intersect scoped dates for combined eligible denominator
    let combinedEligible = new Set(rowResults[0].scopedDates);
    for (let i = 1; i < rowResults.length; i++) {
        const next = rowResults[i].scopedDates;
        const inter = new Set();
        combinedEligible.forEach(d => { if (next.has(d)) inter.add(d); });
        combinedEligible = inter;
    }

    const combinedQual30 = filterToLast30Days(combinedQualifying);
    const combinedElig30 = filterToLast30Days(combinedEligible);
    const teamDates30 = filterToLast30Days(new Set(allTeamDates));

    const sortedDates = [...combinedQualifying].sort((a, b) => parseGameLogDate(b) - parseGameLogDate(a));

    const individual = rowResults.map(r => {
        const q30 = filterToLast30Days(r.qualifyingDates);
        const e30 = filterToLast30Days(r.scopedDates);
        return {
            playerName: r.playerName, description: r.description,
            seasonHits: r.qualifyingDates.size, seasonEligible: r.scopedDates.size,
            seasonRate: r.scopedDates.size > 0 ? (r.qualifyingDates.size / r.scopedDates.size * 100).toFixed(1) : '0.0',
            last30Hits: q30.size, last30Eligible: e30.size,
            last30Rate: e30.size > 0 ? (q30.size / e30.size * 100).toFixed(1) : '0.0',
        };
    });

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
