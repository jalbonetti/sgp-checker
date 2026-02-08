// main.js - Same Team Prop Checker
// UPDATED:
// - Title: "Same Team Prop Checker"
// - Condition dropdown filtered by lineup status
// - Team grid: 15 per row on desktop
// - Uses fetchTeamGameLogs (single fetch per check)

import { injectStyles } from './styles/styles.js';
import { CONFIG, ALL_CONDITIONS, FILTER_CONDITIONS, NUMERIC_PROP_CONDITIONS, BINARY_PROP_CONDITIONS, TEAM_FULL_NAMES } from './config.js';
import { fetchTodaysGames, fetchTeamRoster } from './services/dataService.js';
import { loadAliasTable, buildReverseAliasMap } from './utils/nameResolver.js';
import { runParlayCheck } from './services/parlayEngine.js';

const state = {
    games: [], selectedTeam: null, roster: [], conditions: [],
    aliasMap: null, reverseAliasMap: null, results: null,
};
const SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async function () {
    injectStyles();
    const root = document.getElementById('stc-root');
    if (!root) return;

    root.innerHTML = `
        <div class="stc-header">
            <h1 class="stc-title">Same Team <span class="stc-title-accent">Prop Checker</span></h1>
            <p class="stc-subtitle">Check historical co-occurrence of player stats on the same team</p>
        </div>
        <div class="stc-loading"><div class="stc-spinner"></div>
            <div style="margin-top:10px;">Loading today's games...</div></div>`;

    try {
        const [aliasMap, games] = await Promise.all([loadAliasTable(), fetchTodaysGames()]);
        state.aliasMap = aliasMap;
        state.reverseAliasMap = buildReverseAliasMap(aliasMap);
        state.games = games;
        renderApp(root);
    } catch (error) {
        console.error('Init error:', error);
        root.innerHTML = `<div class="stc-header"><h1 class="stc-title">Same Team <span class="stc-title-accent">Prop Checker</span></h1></div>
            <div class="stc-error">Failed to load data. Please refresh.</div>`;
    }
});

function renderApp(root) {
    root.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'stc-header';
    header.innerHTML = `<h1 class="stc-title">Same Team <span class="stc-title-accent">Prop Checker</span></h1>
        <p class="stc-subtitle">Check historical co-occurrence of player stats on the same team</p>`;
    root.appendChild(header);

    const teamSection = document.createElement('div');
    teamSection.id = 'stc-team-section';
    root.appendChild(teamSection);
    renderTeamSelector(teamSection);

    const cs = document.createElement('div'); cs.id = 'stc-conditions-section'; root.appendChild(cs);
    const rs = document.createElement('div'); rs.id = 'stc-results-section'; root.appendChild(rs);
}

// ============================================================
// TEAM SELECTOR — 15 per row on desktop
// ============================================================
function renderTeamSelector(container) {
    container.innerHTML = '';
    const teamsPlaying = extractTeamsPlaying(state.games);

    const label = document.createElement('div');
    label.className = 'stc-section-label';
    label.textContent = 'Select a Team';
    container.appendChild(label);

    if (teamsPlaying.length === 0) {
        container.innerHTML += '<div class="stc-no-games">No games scheduled for today.</div>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'stc-team-grid';

    Object.keys(TEAM_FULL_NAMES).sort().forEach(abbrev => {
        const btn = document.createElement('button');
        btn.className = 'stc-team-btn';
        btn.textContent = abbrev;
        btn.title = TEAM_FULL_NAMES[abbrev];
        if (!teamsPlaying.includes(abbrev)) {
            btn.classList.add('disabled');
        } else {
            if (state.selectedTeam === abbrev) btn.classList.add('active');
            btn.addEventListener('click', () => onTeamSelected(abbrev));
        }
        grid.appendChild(btn);
    });
    container.appendChild(grid);
}

function extractTeamsPlaying(games) {
    const teams = new Set();
    games.forEach(game => {
        ['Home Team', 'Away Team'].forEach(f => {
            const v = (game[f] || '').trim();
            if (TEAM_FULL_NAMES[v]) teams.add(v);
        });
        const m = game['Matchup'] || '';
        Object.entries(TEAM_FULL_NAMES).forEach(([a, full]) => { if (m.includes(full)) teams.add(a); });
    });
    return [...teams].sort();
}

// ============================================================
// TEAM SELECTED
// ============================================================
async function onTeamSelected(teamAbbrev) {
    state.selectedTeam = teamAbbrev;
    state.conditions = [];
    state.results = null;
    renderTeamSelector(document.getElementById('stc-team-section'));

    const cs = document.getElementById('stc-conditions-section');
    cs.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div>
        <div style="margin-top:10px;">Loading ${TEAM_FULL_NAMES[teamAbbrev]} roster...</div></div>`;
    document.getElementById('stc-results-section').innerHTML = '';

    try {
        state.roster = processRoster(await fetchTeamRoster(teamAbbrev), teamAbbrev);
        addCondition();
        renderConditionsPanel(cs);
    } catch (e) {
        console.error('Roster error:', e);
        cs.innerHTML = '<div class="stc-error">Failed to load roster. Please try again.</div>';
    }
}

// ============================================================
// ROSTER PROCESSING
// ============================================================
function processRoster(rosterData, teamAbbrev) {
    const playerMap = new Map();
    rosterData.forEach(row => {
        const displayName = (row['Player'] || '').trim();
        if (!displayName || playerMap.has(displayName)) return;
        const lineup = (row['Lineup'] || '').trim();
        let gameLogName = '';
        if (state.reverseAliasMap && state.reverseAliasMap.has(displayName)) {
            gameLogName = state.reverseAliasMap.get(displayName);
        }
        if (!gameLogName) gameLogName = constructGameLogName(displayName);

        playerMap.set(displayName, {
            displayName, gameLogName, team: teamAbbrev, lineup,
            isInjured: lineup === 'Injury',
            isStarter: lineup.includes('Starter'),
            isBench: lineup.includes('Bench'),
        });
    });

    return [...playerMap.values()].sort((a, b) => {
        const aO = a.isStarter ? 0 : a.isInjured ? 2 : 1;
        const bO = b.isStarter ? 0 : b.isInjured ? 2 : 1;
        if (aO !== bO) return aO - bO;
        return a.displayName.localeCompare(b.displayName);
    });
}

function constructGameLogName(displayName) {
    if (!displayName) return '';
    const tokens = displayName.trim().split(/\s+/);
    if (tokens.length < 2) return displayName;
    const last = tokens[tokens.length - 1];
    const isSuffix = SUFFIXES.some(s => last === s || last === s.replace('.', ''));
    if (isSuffix && tokens.length >= 3) {
        const suffix = tokens.pop(); const lastName = tokens.pop();
        return `${lastName}, ${tokens.join(' ')} ${suffix}`;
    }
    const lastName = tokens.pop();
    return `${lastName}, ${tokens.join(' ')}`;
}

// ============================================================
// CONDITIONS
// ============================================================
function addCondition() {
    if (state.conditions.length >= CONFIG.MAX_CONDITIONS) return;
    state.conditions.push({
        id: Date.now() + Math.random(),
        player: null, conditionId: null, conditionDef: null, direction: null, value: null,
    });
}

function removeCondition(id) {
    state.conditions = state.conditions.filter(c => c.id !== id);
    renderConditionsPanel(document.getElementById('stc-conditions-section'));
}

function findConditionDef(id) {
    return [...FILTER_CONDITIONS, ...NUMERIC_PROP_CONDITIONS, ...BINARY_PROP_CONDITIONS].find(c => c.id === id) || null;
}

/**
 * Get the allowed conditions for a player based on their lineup status.
 * - Starters: can't select "Off Bench"
 * - Bench: can't select "Starts"
 * - Injured/Out: can ONLY select "Does Not Play"
 */
function getAllowedConditions(player) {
    if (!player) return ALL_CONDITIONS;

    if (player.isInjured) {
        // Injured players can only have "Does Not Play"
        return [{ id: 'does_not_play', label: 'Does Not Play', type: 'filter' }];
    }

    return ALL_CONDITIONS.filter(c => {
        if (c.type === 'separator') return true;
        // Starters can't pick "Off Bench"
        if (player.isStarter && c.id === 'off_bench') return false;
        // Bench can't pick "Starts"
        if (player.isBench && c.id === 'starts') return false;
        // Bench/Starters shouldn't pick "Does Not Play" (they're active)
        if ((player.isStarter || player.isBench) && c.id === 'does_not_play') return false;
        return true;
    });
}

function updateCondition(condId, field, value) {
    const c = state.conditions.find(x => x.id === condId);
    if (!c) return;

    if (field === 'player') {
        c.player = state.roster.find(p => p.displayName === value) || null;
        // Reset condition if the new player's lineup doesn't allow current condition
        if (c.conditionDef && c.player) {
            const allowed = getAllowedConditions(c.player);
            const stillValid = allowed.some(a => a.id === c.conditionId);
            if (!stillValid) {
                c.conditionId = null; c.conditionDef = null; c.direction = null; c.value = null;
            }
        }
        renderConditionsPanel(document.getElementById('stc-conditions-section'));
        return;
    }

    if (field === 'conditionId') {
        c.conditionId = value;
        const def = findConditionDef(value);
        c.conditionDef = def;
        if (def) {
            if (def.type === 'filter') { c.direction = null; c.value = null; }
            else if (def.type === 'numeric') { c.direction = 'gte'; c.value = null; }
            else if (def.type === 'binary') { c.direction = 'yes'; c.value = null; }
        } else { c.direction = null; c.value = null; }
        renderConditionsPanel(document.getElementById('stc-conditions-section'));
        return;
    }
    c[field] = value;
}

function validateConditions() {
    if (state.conditions.length === 0) return false;
    return state.conditions.every(c => {
        if (!c.player || !c.conditionDef) return false;
        if (c.conditionDef.type === 'numeric') {
            if (c.value === null || c.value === undefined || c.value === '') return false;
            if (c.direction !== 'gte' && c.direction !== 'lt') return false;
        }
        if (c.conditionDef.type === 'binary') {
            if (c.direction !== 'yes' && c.direction !== 'no') return false;
        }
        return true;
    });
}

// ============================================================
// RENDER CONDITIONS
// ============================================================
function renderConditionsPanel(container) {
    container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'stc-conditions-panel';

    const hdr = document.createElement('div');
    hdr.className = 'stc-conditions-header';
    hdr.innerHTML = `<div class="stc-conditions-title">${TEAM_FULL_NAMES[state.selectedTeam]} — Conditions</div>
        <div class="stc-conditions-count">${state.conditions.length} / ${CONFIG.MAX_CONDITIONS}</div>`;
    panel.appendChild(hdr);

    state.conditions.forEach((c, i) => panel.appendChild(renderConditionRow(c, i)));

    if (state.conditions.length < CONFIG.MAX_CONDITIONS) {
        const addBtn = document.createElement('button');
        addBtn.className = 'stc-btn stc-btn-add';
        addBtn.textContent = '+ Add Condition';
        addBtn.addEventListener('click', () => { addCondition(); renderConditionsPanel(container); });
        panel.appendChild(addBtn);
    }

    const actions = document.createElement('div');
    actions.className = 'stc-actions';
    const checkBtn = document.createElement('button');
    checkBtn.className = 'stc-btn stc-btn-primary';
    checkBtn.textContent = 'Check';
    checkBtn.id = 'stc-check-btn';
    checkBtn.disabled = !validateConditions();
    checkBtn.addEventListener('click', onCheckClicked);
    actions.appendChild(checkBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'stc-btn stc-btn-secondary';
    resetBtn.textContent = 'Reset All';
    resetBtn.addEventListener('click', () => {
        state.conditions = []; state.results = null;
        addCondition(); renderConditionsPanel(container);
        document.getElementById('stc-results-section').innerHTML = '';
    });
    actions.appendChild(resetBtn);
    panel.appendChild(actions);
    container.appendChild(panel);
}

function renderConditionRow(condition, index) {
    const row = document.createElement('div');
    row.className = 'stc-condition-row';

    const num = document.createElement('span');
    num.className = 'stc-row-number'; num.textContent = `${index + 1}`;
    row.appendChild(num);

    // Player dropdown
    const playerSel = document.createElement('select');
    playerSel.className = 'stc-select stc-select-player';
    playerSel.innerHTML = '<option value="">Select Player</option>';
    const groups = { 'Starters': [], 'Bench': [], 'Injured / Out': [] };
    state.roster.forEach(p => {
        const g = p.isStarter ? 'Starters' : p.isInjured ? 'Injured / Out' : 'Bench';
        groups[g].push(p);
    });
    Object.entries(groups).forEach(([name, players]) => {
        if (!players.length) return;
        const og = document.createElement('optgroup'); og.label = name;
        players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.displayName; opt.textContent = p.displayName;
            if (condition.player && condition.player.displayName === p.displayName) opt.selected = true;
            og.appendChild(opt);
        });
        playerSel.appendChild(og);
    });
    playerSel.addEventListener('change', e => updateCondition(condition.id, 'player', e.target.value));
    row.appendChild(playerSel);

    // Condition dropdown — filtered by player's lineup status
    const allowedConditions = getAllowedConditions(condition.player);
    const condSel = document.createElement('select');
    condSel.className = 'stc-select stc-select-condition';
    condSel.innerHTML = '<option value="">Select Condition</option>';
    allowedConditions.forEach(c => {
        const opt = document.createElement('option');
        if (c.type === 'separator') { opt.disabled = true; opt.textContent = c.label; }
        else { opt.value = c.id; opt.textContent = c.label; if (condition.conditionId === c.id) opt.selected = true; }
        condSel.appendChild(opt);
    });
    condSel.addEventListener('change', e => updateCondition(condition.id, 'conditionId', e.target.value));
    row.appendChild(condSel);

    // Direction + value
    if (condition.conditionDef) {
        if (condition.conditionDef.type === 'numeric') {
            const dirSel = document.createElement('select');
            dirSel.className = 'stc-select stc-select-direction';
            dirSel.innerHTML = `<option value="gte" ${condition.direction === 'gte' ? 'selected' : ''}>≥</option>
                <option value="lt" ${condition.direction === 'lt' ? 'selected' : ''}>&lt;</option>`;
            dirSel.addEventListener('change', e => { condition.direction = e.target.value; });
            row.appendChild(dirSel);

            const valInput = document.createElement('input');
            valInput.type = 'number'; valInput.className = 'stc-input stc-input-value';
            valInput.min = 0; valInput.max = CONFIG.MAX_STAT_VALUE; valInput.placeholder = '0';
            if (condition.value !== null && condition.value !== undefined) valInput.value = condition.value;
            valInput.addEventListener('input', e => {
                let v = parseInt(e.target.value);
                if (isNaN(v) || v < 0) v = 0;
                if (v > CONFIG.MAX_STAT_VALUE) v = CONFIG.MAX_STAT_VALUE;
                condition.value = v; e.target.value = v || '';
            });
            valInput.addEventListener('change', () => {
                const b = document.getElementById('stc-check-btn');
                if (b) b.disabled = !validateConditions();
            });
            row.appendChild(valInput);
        } else if (condition.conditionDef.type === 'binary') {
            const dirSel = document.createElement('select');
            dirSel.className = 'stc-select stc-select-direction';
            dirSel.innerHTML = `<option value="yes" ${condition.direction === 'yes' ? 'selected' : ''}>Yes</option>
                <option value="no" ${condition.direction === 'no' ? 'selected' : ''}>No</option>`;
            dirSel.addEventListener('change', e => { condition.direction = e.target.value; });
            row.appendChild(dirSel);
        }
    }

    const rmBtn = document.createElement('button');
    rmBtn.className = 'stc-btn-remove'; rmBtn.innerHTML = '&#x2715;'; rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', () => removeCondition(condition.id));
    row.appendChild(rmBtn);
    return row;
}

// ============================================================
// CHECK
// ============================================================
async function onCheckClicked() {
    if (!validateConditions()) return;
    const rs = document.getElementById('stc-results-section');
    const btn = document.getElementById('stc-check-btn');
    btn.disabled = true; btn.textContent = 'Checking...';
    rs.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div>
        <div style="margin-top:10px;">Analyzing game logs...</div></div>`;

    try {
        const results = await runParlayCheck(state.conditions, state.selectedTeam);
        state.results = results;
        if (results.error) rs.innerHTML = `<div class="stc-error">${results.error}</div>`;
        else renderResults(rs, results);
    } catch (e) {
        console.error('Check error:', e);
        rs.innerHTML = '<div class="stc-error">An error occurred. Please try again.</div>';
    } finally { btn.disabled = false; btn.textContent = 'Check'; }
}

// ============================================================
// RESULTS
// ============================================================
function renderResults(container, results) {
    container.innerHTML = '';
    const w = document.createElement('div'); w.className = 'stc-results';

    const combined = document.createElement('div');
    combined.className = 'stc-results-combined';
    combined.innerHTML = `
        <div class="stc-results-combined-title">Combined Result &mdash; All ${results.conditionCount} Condition${results.conditionCount > 1 ? 's' : ''} Met</div>
        <div class="stc-result-stats">
            <div class="stc-result-stat">
                <div class="stc-result-stat-label">Full Season</div>
                <div class="stc-result-stat-value">${results.combined.rate}%</div>
                <div class="stc-result-stat-detail">${results.combined.hits} of ${results.combined.eligible} games</div>
            </div>
            <div class="stc-result-stat">
                <div class="stc-result-stat-label">Last 30 Days</div>
                <div class="stc-result-stat-value">${results.combined.last30Rate}%</div>
                <div class="stc-result-stat-detail">${results.combined.last30Hits} of ${results.combined.last30Eligible} games</div>
            </div>
        </div>`;

    if (results.combined.dates && results.combined.dates.length > 0) {
        const toggle = document.createElement('div'); toggle.className = 'stc-dates-toggle';
        toggle.innerHTML = `<span class="stc-chevron">&#9654;</span> Show ${results.combined.dates.length} qualifying game date${results.combined.dates.length !== 1 ? 's' : ''}`;
        const datesList = document.createElement('div'); datesList.className = 'stc-dates-list';
        datesList.innerHTML = results.combined.dates.map(d => `<span>${d}</span>`).join('');
        toggle.addEventListener('click', () => {
            const open = datesList.classList.toggle('open');
            toggle.querySelector('.stc-chevron').classList.toggle('open', open);
        });
        combined.appendChild(toggle); combined.appendChild(datesList);
    }
    w.appendChild(combined);

    if (results.individual && results.individual.length > 1) {
        const indiv = document.createElement('div'); indiv.className = 'stc-results-individual';
        const title = document.createElement('div'); title.className = 'stc-results-individual-title';
        title.innerHTML = '<span class="stc-chevron open">&#9654;</span> Individual Condition Breakdowns';
        const body = document.createElement('div'); body.id = 'stc-individual-body';

        const hdrRow = document.createElement('div');
        hdrRow.className = 'stc-individual-row';
        hdrRow.style.borderBottom = '2px solid var(--stc-border)';
        hdrRow.innerHTML = `<div class="stc-individual-label" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">CONDITION</div>
            <div class="stc-individual-values">
                <div class="stc-individual-season" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">SEASON</div>
                <div class="stc-individual-last30" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">LAST 30 DAYS</div></div>`;
        body.appendChild(hdrRow);

        results.individual.forEach(r => {
            const row = document.createElement('div'); row.className = 'stc-individual-row';
            row.innerHTML = `<div class="stc-individual-label"><strong>${r.playerName}</strong> &mdash; ${r.description}</div>
                <div class="stc-individual-values">
                    <div class="stc-individual-season"><div class="stc-rate">${r.seasonRate}%</div><div class="stc-detail">${r.seasonHits} / ${r.seasonEligible}</div></div>
                    <div class="stc-individual-last30"><div class="stc-rate">${r.last30Rate}%</div><div class="stc-detail">${r.last30Hits} / ${r.last30Eligible}</div></div>
                </div>`;
            body.appendChild(row);
        });

        title.addEventListener('click', () => {
            const vis = body.style.display !== 'none';
            body.style.display = vis ? 'none' : 'block';
            title.querySelector('.stc-chevron').classList.toggle('open', !vis);
        });
        indiv.appendChild(title); indiv.appendChild(body); w.appendChild(indiv);
    }
    container.appendChild(w);
}

window.stcDebug = { getState: () => state, getRoster: () => state.roster, getConditions: () => state.conditions, getResults: () => state.results };
