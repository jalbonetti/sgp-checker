// utils/nameResolver.js - Player Name Resolution
// Handles the "Last, First Suffix" → "First Last Suffix" conversion
// and alias table lookups between GameLogs names and Display names

import { CONFIG } from '../config.js';

// Module-level cache for the alias table
let aliasCache = null;
let aliasCacheTimestamp = 0;

/**
 * Flip a "Last, First Suffix" name to "First Last Suffix"
 * Handles edge cases:
 *   "Doncic, Luka"                → "Luka Doncic"
 *   "Smith, Jabari Jr."           → "Jabari Smith Jr."
 *   "Gilgeous-Alexander, Shai"    → "Shai Gilgeous-Alexander"
 *   "Tillman, Xavier Sr."         → "Xavier Tillman Sr."
 *   "Alexander-Walker, Nickei"    → "Nickei Alexander-Walker"
 *   "Trent, Gary Jr."             → "Gary Trent Jr."
 *   "Yang, Hansen"                → "Hansen Yang"
 * 
 * The key insight: everything after the comma is "First [possible middle] [possible suffix]"
 * Suffixes are: Jr., Sr., II, III, IV, V
 */
const SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];

export function flipName(gameLogName) {
    if (!gameLogName || !gameLogName.includes(',')) {
        return gameLogName || '';
    }

    const commaIndex = gameLogName.indexOf(',');
    const lastName = gameLogName.substring(0, commaIndex).trim();
    const afterComma = gameLogName.substring(commaIndex + 1).trim();

    // Split the after-comma part into tokens
    const tokens = afterComma.split(/\s+/).filter(t => t.length > 0);
    
    if (tokens.length === 0) {
        return lastName;
    }

    // Check if the last token is a suffix
    const lastToken = tokens[tokens.length - 1];
    const isSuffix = SUFFIXES.some(s => 
        lastToken === s || lastToken === s.replace('.', '')
    );

    if (isSuffix && tokens.length > 1) {
        // Everything except the last token is the first/middle name(s)
        const firstNames = tokens.slice(0, -1).join(' ');
        const suffix = lastToken;
        return `${firstNames} ${lastName} ${suffix}`;
    } else {
        // No suffix — everything after comma is the first name(s)
        const firstNames = tokens.join(' ');
        return `${firstNames} ${lastName}`;
    }
}

/**
 * Fetch the alias table from Supabase and build a lookup map
 * Maps: GameLogs name (as stored in DB) → Display name
 * We only need the "GameLogs" and "Display" columns from BasketPlayerAliases
 */
export async function loadAliasTable() {
    // Return cached version if still valid
    if (aliasCache && (Date.now() - aliasCacheTimestamp < CONFIG.ALIAS_CACHE_TTL)) {
        return aliasCache;
    }

    const url = `${CONFIG.SUPABASE_URL}/rest/v1/BasketPlayerAliases?select=GameLogs,Display`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: CONFIG.API_HEADERS,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch aliases: ${response.status}`);
        }

        const data = await response.json();
        
        // Build lookup map: GameLogs value → Display value
        // GameLogs column has the "Last, First" format name
        // Display column has the clean display name
        const map = new Map();
        
        data.forEach(row => {
            const gameLogsName = (row.GameLogs || '').trim();
            const displayName = (row.Display || '').trim();
            
            if (gameLogsName && displayName) {
                map.set(gameLogsName, displayName);
            }
        });

        aliasCache = map;
        aliasCacheTimestamp = Date.now();
        
        console.log(`✅ Loaded ${map.size} player aliases`);
        return map;

    } catch (error) {
        console.error('Error loading alias table:', error);
        // Return empty map as fallback — comma-flip will still work
        return new Map();
    }
}

/**
 * Resolve a game log player name to its display name
 * 1. Check alias table first (handles special cases like Nic Claxton, Alex Sarr)
 * 2. Fall back to comma-flip if no alias found
 * 
 * @param {string} gameLogName - Name as it appears in BasketGameLogs (e.g., "Claxton, Nicolas")
 * @param {Map} aliasMap - The alias lookup map from loadAliasTable()
 * @returns {string} Display name (e.g., "Nic Claxton")
 */
export function resolveDisplayName(gameLogName, aliasMap) {
    if (!gameLogName) return '';

    const trimmed = gameLogName.trim();

    // Check alias table first
    if (aliasMap && aliasMap.has(trimmed)) {
        return aliasMap.get(trimmed);
    }

    // Fall back to comma-flip
    return flipName(trimmed);
}

/**
 * Build a reverse lookup: Display name → GameLogs name
 * Used when we have a display name from BasketMatchupsPlayers
 * and need to query BasketGameLogs
 * 
 * @param {Map} aliasMap - The alias lookup map from loadAliasTable()
 * @returns {Map} Reverse map: Display name → GameLogs name
 */
export function buildReverseAliasMap(aliasMap) {
    const reverseMap = new Map();
    
    if (aliasMap) {
        aliasMap.forEach((displayName, gameLogsName) => {
            reverseMap.set(displayName, gameLogsName);
        });
    }

    return reverseMap;
}
