// wnba/parlayEngine.js
// Same four-phase logic as the NBA engine:
//   1. per-condition scoped dates + qualifying dates
//   2. intersect scoped dates -> combined eligible pool (the shared denominator)
//   3. intersect qualifying dates -> combined hits
//   4. per-condition rates, both measured against the combined eligible pool
//
// WNBA differences:
//   - starter/bench scope reads the "Starter/Bench" column, not a Position string
//   - dates arrive as YYYY-MM-DD and are parsed as LOCAL dates (new Date("2026-05-08")
//     would parse as UTC midnight and slide back a day in US timezones)
//   - players join to their logs by "Player Name"; no alias table is needed
//     because the matchups table and the game logs use identical spellings

import { WNBA_STARTER_VALUE, WNBA_BENCH_VALUE } from './config.js';
import { fetchWNBAGameLogs } from './dataService.js';

/** Normalize any date value to a stable YYYY-MM-DD key. */
function normalizeDateKey(dateStr) {
    if (!dateStr) return '';
    const t = String(dateStr).trim();
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
    return t;
}

/** Parse a normalized key into a local Date (no UTC shift). */
function parseDateKey(key) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    const d = new Date(key);
    return isNaN(d.getTime()) ? null : d;
}

/** Render a key as M/D/YYYY so the dates list matches the NBA version. */
function formatDateKey(key) {
    const d = parseDateKey(key);
    return d ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : String(key);
}

function filterToLast30Days(dates) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const filtered = new Set();
    dates.forEach(key => {
        const d = parseDateKey(key);
        if (d && d >= cutoff && d < endDate) filtered.add(key);
    });
    return filtered;
}

/** Resolve a column name against the real row keys, tolerating spacing variants. */
function findColumn(sampleRow, candidates) {
    if (!sampleRow) return candidates[0];
    for (const c of candidates) if (c in sampleRow) return c;
    const keys = Object.keys(sampleRow);
    const norm = s => s.toLowerCase().replace(/[\s_/+]+/g, '');
    for (const c of candidates) {
        const match = keys.find(k => norm(k) === norm(c));
        if (match) return match;
    }
    return candidates[0];
}

function getScopedDates(scopeId, logsByDate, colStarterBench) {
    const s = new Set();
    switch (scopeId) {
        case 'starts':
            logsByDate.forEach((log, date) => {
                if ((log[colStarterBench] || '').trim() === WNBA_STARTER_VALUE) s.add(date);
            });
            break;
        case 'off_bench':
            logsByDate.forEach((log, date) => {
                if ((log[colStarterBench] || '').trim() === WNBA_BENCH_VALUE) s.add(date);
            });
            break;
        default:
            logsByDate.forEach((_, date) => s.add(date));
            break;
    }
    return s;
}

function getScopeLabel(scopeId) {
    switch (scopeId) {
        case 'starts': return 'Starts';
        case 'off_bench': return 'Off Bench';
        default: return null;
    }
}

function evaluateProp(propDef, direction, value, logsByDate, scopedDates, resolveCol) {
    const qualifyingDates = new Set();

    // "None" = every scoped date qualifies (no stat check).
    if (!propDef || propDef.type === 'none' || !propDef.column) {
        scopedDates.forEach(d => qualifyingDates.add(d));
        return { qualifyingDates, description: 'Any Game' };
    }

    const isBinary = propDef.column === 'DD' || propDef.column === 'TD';
    const col = resolveCol(propDef.column);

    scopedDates.forEach(date => {
        const log = logsByDate.get(date);
        if (!log) return;
        if (isBinary) {
            const bv = parseInt(log[col]);
            if (direction === 'yes' && bv === 1) qualifyingDates.add(date);
            if (direction === 'no' && (bv === 0 || isNaN(bv))) qualifyingDates.add(date);
        } else {
            const sv = parseFloat(log[col]);
            if (isNaN(sv)) return;
            const th = parseFloat(value);
            if (direction === 'gte' && sv >= th) qualifyingDates.add(date);
            if (direction === 'lt' && sv < th) qualifyingDates.add(date);
        }
    });

    const description = isBinary
        ? `${propDef.label}: ${direction === 'yes' ? 'Yes' : 'No'}`
        : `${propDef.label} ${direction === 'gte' ? '≥' : '<'} ${value}`;
    return { qualifyingDates, description };
}

export async function runWNBAParlayCheck(conditions, teamAbbrev) {
    if (!conditions || conditions.length === 0) return { error: 'No conditions to check' };

    const allTeamLogs = await fetchWNBAGameLogs(teamAbbrev);
    if (!allTeamLogs || allTeamLogs.length === 0) return { error: `No game log data found for ${teamAbbrev}.` };

    const sample = allTeamLogs[0];
    const COL_DATE = findColumn(sample, ['Date', 'date']);
    const COL_NAME = findColumn(sample, ['Player Name', 'PlayerName', 'Player_Name', 'Player']);
    const COL_SB = findColumn(sample, ['Starter/Bench', 'StarterBench', 'Starter_Bench']);
    console.log('🏀 WNBA detected columns:', { COL_DATE, COL_NAME, COL_SB });

    // Cache stat-column resolution so a renamed/re-spaced column still resolves.
    const colCache = new Map();
    const resolveCol = wanted => {
        if (!colCache.has(wanted)) colCache.set(wanted, findColumn(sample, [wanted]));
        return colCache.get(wanted);
    };

    // Every distinct date this team appears on = a team game.
    const allTeamDates = [...new Set(allTeamLogs.map(r => normalizeDateKey(r[COL_DATE])).filter(Boolean))];
    const allTeamDateSet = new Set(allTeamDates);

    const playerLogsMap = new Map();
    allTeamLogs.forEach(log => {
        const name = (log[COL_NAME] || '').trim();
        if (!name) return;
        if (!playerLogsMap.has(name)) playerLogsMap.set(name, []);
        playerLogsMap.get(name).push(log);
    });
    console.log(`🏀 Indexed ${playerLogsMap.size} players for ${teamAbbrev}`);

    // ---- Phase 1: per-condition scoped + qualifying dates ----
    const rowData = [];

    for (const cond of conditions) {
        const lookupName = (cond.player?.gameLogName || cond.player?.cleanName || '').trim();
        let playerLogs = playerLogsMap.get(lookupName) || [];
        if (playerLogs.length === 0) {
            const fuzzy = findFuzzyPlayerMatch(lookupName, playerLogsMap);
            if (fuzzy) {
                playerLogs = playerLogsMap.get(fuzzy) || [];
                console.log(`🏀 Fuzzy matched "${lookupName}" → "${fuzzy}": ${playerLogs.length} logs`);
            }
        }

        const logsByDate = new Map();
        playerLogs.forEach(log => logsByDate.set(normalizeDateKey(log[COL_DATE]), log));

        // DNP: team dates on which she has no log row at all.
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

        const scopedDates = getScopedDates(cond.scope, logsByDate, COL_SB);
        const scopeLabel = getScopeLabel(cond.scope);
        const propResult = evaluateProp(cond.propDef, cond.direction, cond.value, logsByDate, scopedDates, resolveCol);

        let description;
        if (cond.propId === 'none' || !cond.propId) {
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

    // ---- Phase 2: intersect scoped dates -> combined eligible pool ----
    let combinedEligible = new Set(rowData[0].scopedDates);
    for (let i = 1; i < rowData.length; i++) {
        const next = rowData[i].scopedDates;
        const inter = new Set();
        combinedEligible.forEach(d => { if (next.has(d)) inter.add(d); });
        combinedEligible = inter;
    }

    // ---- Phase 3: intersect qualifying dates -> combined hits ----
    let combinedQualifying = new Set(rowData[0].qualifyingDates);
    for (let i = 1; i < rowData.length; i++) {
        const next = rowData[i].qualifyingDates;
        const inter = new Set();
        combinedQualifying.forEach(d => { if (next.has(d)) inter.add(d); });
        combinedQualifying = inter;
    }

    // ---- Phase 4: rates ----
    const combinedElig30 = filterToLast30Days(combinedEligible);
    const combinedQual30 = filterToLast30Days(combinedQualifying);
    const teamDates30 = filterToLast30Days(allTeamDateSet);

    const individual = rowData.map(r => {
        const hitsInPool = new Set();
        r.qualifyingDates.forEach(d => { if (combinedEligible.has(d)) hitsInPool.add(d); });
        const hits30 = filterToLast30Days(hitsInPool);

        return {
            playerName: r.playerName,
            description: r.description,
            seasonHits: hitsInPool.size,
            seasonEligible: combinedEligible.size,
            seasonRate: combinedEligible.size > 0 ? (hitsInPool.size / combinedEligible.size * 100).toFixed(1) : '0.0',
            last30Hits: hits30.size,
            last30Eligible: combinedElig30.size,
            last30Rate: combinedElig30.size > 0 ? (hits30.size / combinedElig30.size * 100).toFixed(1) : '0.0',
        };
    });

    const sortedDates = [...combinedQualifying]
        .sort((a, b) => parseDateKey(b) - parseDateKey(a))
        .map(formatDateKey);

    return {
        combined: {
            hits: combinedQualifying.size,
            eligible: combinedEligible.size,
            rate: combinedEligible.size > 0 ? (combinedQualifying.size / combinedEligible.size * 100).toFixed(1) : '0.0',
            last30Hits: combinedQual30.size,
            last30Eligible: combinedElig30.size,
            last30Rate: combinedElig30.size > 0 ? (combinedQual30.size / combinedElig30.size * 100).toFixed(1) : '0.0',
            dates: sortedDates,
        },
        teamGames: { season: allTeamDates.length, last30: teamDates30.size },
        individual,
        conditionCount: conditions.length,
    };
}

function findFuzzyPlayerMatch(targetName, playerLogsMap) {
    if (!targetName) return null;
    const norm = s => s.toLowerCase().replace(/[.,'\-\s]+/g, '');
    const tLow = norm(targetName);
    for (const [name] of playerLogsMap) {
        if (norm(name) === tLow) return name;
    }
    return null;
}
