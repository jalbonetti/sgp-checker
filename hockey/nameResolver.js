// hockey/nameResolver.js - Hockey Player Name Resolution
// Maps CanonicalName (from HockeyMatchupsSkater) → GameLogName (in HockeyGameLogs)
// Also stores PlayerID for reliable matching

import { CONFIG } from '../config.js';

let nameCache = null;
let nameCacheTimestamp = 0;

/**
 * Load the HockeyNormalNames table and build lookup maps.
 * Returns a Map: CanonicalName → { gameLogName, playerId }
 */
export async function loadHockeyNameTable() {
    if (nameCache && (Date.now() - nameCacheTimestamp < CONFIG.ALIAS_CACHE_TTL)) {
        return nameCache;
    }

    const url = `${CONFIG.SUPABASE_URL}/rest/v1/HockeyNormalNames?select=CanonicalName,GameLogName,PlayerID`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: CONFIG.API_HEADERS,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch hockey names: ${response.status}`);
        }

        const data = await response.json();
        const map = new Map();

        data.forEach(row => {
            const canonical = (row.CanonicalName || '').trim();
            const gameLogName = (row.GameLogName || '').trim();
            const playerId = row.PlayerID;

            if (canonical) {
                map.set(canonical, {
                    gameLogName: gameLogName || canonical,
                    playerId: playerId || null,
                });
            }
        });

        nameCache = map;
        nameCacheTimestamp = Date.now();
        console.log(`✅ Loaded ${map.size} hockey player names`);
        return map;

    } catch (error) {
        console.error('Error loading hockey name table:', error);
        return new Map();
    }
}

/**
 * Build a reverse lookup: GameLogName → CanonicalName
 */
export function buildHockeyReverseNameMap(nameMap) {
    const reverseMap = new Map();
    if (nameMap) {
        nameMap.forEach((info, canonical) => {
            if (info.gameLogName) {
                reverseMap.set(info.gameLogName, canonical);
            }
        });
    }
    return reverseMap;
}
