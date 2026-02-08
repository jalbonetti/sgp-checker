// main.js - Same Team Checker Entry Point
// Builds the complete UI, wires up events, manages state

import { injectStyles } from './styles/styles.js';
import { CONFIG, ALL_CONDITIONS, FILTER_CONDITIONS, NUMERIC_PROP_CONDITIONS, BINARY_PROP_CONDITIONS, TEAM_FULL_NAMES, isMobile } from './config.js';
import { fetchTodaysGames, fetchTeamRoster } from './services/dataService.js';
import { loadAliasTable, buildReverseAliasMap } from './utils/nameResolver.js';
import { runParlayCheck } from './services/parlayEngine.js';

// ============================================================
// APP STATE
// ============================================================
const state = {
    games: [],
    selectedTeam: null,
    roster: [],
    conditions: [],
    aliasMap: null,
    reverseAliasMap: null,
    isLoading: false,
    results: null,
};

const SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log('DOM loaded - initializing Same Team Checker');
    injectStyles();

    const root = document.getElementById('stc-root');
    if (!root) { console.error('No #stc-root element found'); return; }

    root.innerHTML = `
        <div class="stc-header">
            <h1 class="stc-title">Same Team <span class="stc-title-accent">Checker</span></h1>
            <p class="stc-subtitle">Check historical co-occurrence of player stats on the same team</p>
        </div>
        <div class="stc-loading"><div class="stc-spinner"></div>
            <div style="margin-top:10px;">Loading today's games...</div>
        </div>`;

    try {
        const [aliasMap, games] = await Promise.all([loadAliasTable(), fetchTodaysGames()]);
        state.aliasMap = aliasMap;
        state.reverseAliasMap = buildReverseAliasMap(aliasMap);
        state.games = games;
        renderApp(root);
    } catch (error) {
        console.error('Initialization error:', error);
        root.innerHTML = `
            <div class="stc-header"><h1 class="stc-title">Same Team <span class="stc-title-accent">Checker</span></h1></div>
            <div class="stc-error">Failed to load data. Please refresh the page.</div>`;
    }
});

// ============================================================
// RENDER: FULL APP SHELL
// ============================================================
function renderApp(root) {
    root.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'stc-header';
    header.innerHTML = `
        <h1 class="stc-title">Same Team <span class="stc-title-accent">Checker</span></h1>
        <p class="stc-subtitle">Check historical co-occurrence of player stats on the same team</p>`;
    root.appendChild(header);

    const teamSection = document.createElement('div');
    teamSection.id = 'stc-team-section';
    root.appendChild(teamSection);
    renderTeamSelector(teamSection);

    const conditionsSection = document.createElement('div');
    conditionsSection.id = 'stc-conditions-section';
    root.appendChild(conditionsSection);

    const resultsSection = document.createElement('div');
    resultsSection.id = 'stc-results-section';
    root.appendChild(resultsSection);
}

// ============================================================
// RENDER: TEAM SELECTOR
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

    const allTeams = Object.keys(TEAM_FULL_NAMES).sort();
    allTeams.forEach(abbrev => {
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
        // Try direct fields
        ['Home Team', 'Away Team'].forEach(field => {
            const val = (game[field] || '').trim();
            if (TEAM_FULL_NAMES[val]) teams.add(val);
        });
        // Parse from Matchup string
        const matchup = game['Matchup'] || '';
        Object.entries(TEAM_FULL_NAMES).forEach(([abbrev, fullName]) => {
            if (matchup.includes(fullName)) teams.add(abbrev);
        });
    });
    return [...teams].sort();
}

// ============================================================
// EVENT: TEAM SELECTED
// ============================================================
async function onTeamSelected(teamAbbrev) {
    state.selectedTeam = teamAbbrev;
    state.conditions = [];
    state.results = null;

    renderTeamSelector(document.getElementById('stc-team-section'));

    const conditionsSection = document.getElementById('stc-conditions-section');
    conditionsSection.innerHTML = `
        <div class="stc-loading"><div class="stc-spinner"></div>
            <div style="margin-top:10px;">Loading ${TEAM_FULL_NAMES[teamAbbrev]} roster...</div>
        </div>`;
    document.getElementById('stc-results-section').innerHTML = '';

    try {
        const rosterData = await fetchTeamRoster(teamAbbrev);
        state.roster = processRoster(rosterData, teamAbbrev);
        addCondition();
        renderConditionsPanel(conditionsSection);
    } catch (error) {
        console.error('Error loading roster:', error);
        conditionsSection.innerHTML = `<div class="stc-error">Failed to load roster. Please try again.</div>`;
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
        if (!gameLogName) {
            gameLogName = constructGameLogName(displayName);
        }

        playerMap.set(displayName, {
            displayName, gameLogName, team: teamAbbrev, lineup,
            isInjured: lineup === 'Injury',
        });
    });

    return [...playerMap.values()].sort((a, b) => {
        const aOrd = a.lineup.includes('Starter') ? 0 : a.isInjured ? 2 : 1;
        const bOrd = b.lineup.includes('Starter') ? 0 : b.isInjured ? 2 : 1;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return a.displayName.localeCompare(b.displayName);
    });
}

function constructGameLogName(displayName) {
    if (!displayName) return '';
    const tokens = displayName.trim().split(/\s+/);
    if (tokens.length < 2) return displayName;

    const lastToken = tokens[tokens.length - 1];
    const isSuffix = SUFFIXES.some(s => lastToken === s || lastToken === s.replace('.', ''));

    if (isSuffix && tokens.length >= 3) {
        const suffix = tokens.pop();
        const lastName = tokens.pop();
        return `${lastName}, ${tokens.join(' ')} ${suffix}`;
    } else {
        const lastName = tokens.pop();
        return `${lastName}, ${tokens.join(' ')}`;
    }
}

// ============================================================
// CONDITION STATE MANAGEMENT
// ============================================================
function addCondition() {
    if (state.conditions.length >= CONFIG.MAX_CONDITIONS) return;
    state.conditions.push({
        id: Date.now() + Math.random(),
        player: null, conditionId: null, conditionDef: null,
        direction: null, value: null,
    });
}

function removeCondition(conditionId) {
    state.conditions = state.conditions.filter(c => c.id !== conditionId);
    renderConditionsPanel(document.getElementById('stc-conditions-section'));
}

function findConditionDef(conditionId) {
    return [...FILTER_CONDITIONS, ...NUMERIC_PROP_CONDITIONS, ...BINARY_PROP_CONDITIONS]
        .find(c => c.id === conditionId) || null;
}

function updateCondition(conditionId, field, value) {
    const condition = state.conditions.find(c => c.id === conditionId);
    if (!condition) return;

    if (field === 'player') {
        condition.player = state.roster.find(p => p.displayName === value) || null;
        return;
    }

    if (field === 'conditionId') {
        condition.conditionId = value;
        const def = findConditionDef(value);
        condition.conditionDef = def;
        if (def) {
            if (def.type === 'filter') { condition.direction = null; condition.value = null; }
            else if (def.type === 'numeric') { condition.direction = 'gte'; condition.value = null; }
            else if (def.type === 'binary') { condition.direction = 'yes'; condition.value = null; }
        } else { condition.direction = null; condition.value = null; }
        // Re-render to show/hide direction and value columns
        renderConditionsPanel(document.getElementById('stc-conditions-section'));
        return;
    }

    condition[field] = value;
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
// RENDER: CONDITIONS PANEL
// ============================================================
function renderConditionsPanel(container) {
    container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'stc-conditions-panel';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'stc-conditions-header';
    hdr.innerHTML = `
        <div class="stc-conditions-title">${TEAM_FULL_NAMES[state.selectedTeam]} — Conditions</div>
        <div class="stc-conditions-count">${state.conditions.length} / ${CONFIG.MAX_CONDITIONS}</div>`;
    panel.appendChild(hdr);

    // Rows
    state.conditions.forEach((cond, idx) => panel.appendChild(renderConditionRow(cond, idx)));

    // Add button
    if (state.conditions.length < CONFIG.MAX_CONDITIONS) {
        const addBtn = document.createElement('button');
        addBtn.className = 'stc-btn stc-btn-add';
        addBtn.textContent = '+ Add Condition';
        addBtn.addEventListener('click', () => { addCondition(); renderConditionsPanel(container); });
        panel.appendChild(addBtn);
    }

    // Action buttons
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
        state.conditions = [];
        state.results = null;
        addCondition();
        renderConditionsPanel(container);
        document.getElementById('stc-results-section').innerHTML = '';
    });
    actions.appendChild(resetBtn);

    panel.appendChild(actions);
    container.appendChild(panel);
}

function renderConditionRow(condition, index) {
    const row = document.createElement('div');
    row.className = 'stc-condition-row';

    // Row number
    const num = document.createElement('span');
    num.className = 'stc-row-number';
    num.textContent = `${index + 1}`;
    row.appendChild(num);

    // Player dropdown
    const playerSel = document.createElement('select');
    playerSel.className = 'stc-select stc-select-player';
    playerSel.innerHTML = '<option value="">Select Player</option>';
    const groups = { 'Starters': [], 'Bench': [], 'Injured / Out': [] };
    state.roster.forEach(p => {
        const g = p.lineup.includes('Starter') ? 'Starters' : p.isInjured ? 'Injured / Out' : 'Bench';
        groups[g].push(p);
    });
    Object.entries(groups).forEach(([name, players]) => {
        if (players.length === 0) return;
        const og = document.createElement('optgroup');
        og.label = name;
        players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.displayName;
            opt.textContent = p.displayName;
            if (condition.player && condition.player.displayName === p.displayName) opt.selected = true;
            og.appendChild(opt);
        });
        playerSel.appendChild(og);
    });
    playerSel.addEventListener('change', e => updateCondition(condition.id, 'player', e.target.value));
    row.appendChild(playerSel);

    // Condition type dropdown
    const condSel = document.createElement('select');
    condSel.className = 'stc-select stc-select-condition';
    condSel.innerHTML = '<option value="">Select Condition</option>';
    ALL_CONDITIONS.forEach(c => {
        const opt = document.createElement('option');
        if (c.type === 'separator') { opt.disabled = true; opt.textContent = c.label; }
        else { opt.value = c.id; opt.textContent = c.label; if (condition.conditionId === c.id) opt.selected = true; }
        condSel.appendChild(opt);
    });
    condSel.addEventListener('change', e => updateCondition(condition.id, 'conditionId', e.target.value));
    row.appendChild(condSel);

    // Direction + value (conditional on type)
    if (condition.conditionDef) {
        if (condition.conditionDef.type === 'numeric') {
            const dirSel = document.createElement('select');
            dirSel.className = 'stc-select stc-select-direction';
            dirSel.innerHTML = `
                <option value="gte" ${condition.direction === 'gte' ? 'selected' : ''}>≥</option>
                <option value="lt" ${condition.direction === 'lt' ? 'selected' : ''}>&lt;</option>`;
            dirSel.addEventListener('change', e => { condition.direction = e.target.value; });
            row.appendChild(dirSel);

            const valInput = document.createElement('input');
            valInput.type = 'number';
            valInput.className = 'stc-input stc-input-value';
            valInput.min = 0;
            valInput.max = CONFIG.MAX_STAT_VALUE;
            valInput.placeholder = '0';
            if (condition.value !== null && condition.value !== undefined) valInput.value = condition.value;
            valInput.addEventListener('input', e => {
                let v = parseInt(e.target.value);
                if (isNaN(v) || v < 0) v = 0;
                if (v > CONFIG.MAX_STAT_VALUE) v = CONFIG.MAX_STAT_VALUE;
                condition.value = v;
                e.target.value = v || '';
            });
            valInput.addEventListener('change', () => {
                const btn = document.getElementById('stc-check-btn');
                if (btn) btn.disabled = !validateConditions();
            });
            row.appendChild(valInput);

        } else if (condition.conditionDef.type === 'binary') {
            const dirSel = document.createElement('select');
            dirSel.className = 'stc-select stc-select-direction';
            dirSel.innerHTML = `
                <option value="yes" ${condition.direction === 'yes' ? 'selected' : ''}>Yes</option>
                <option value="no" ${condition.direction === 'no' ? 'selected' : ''}>No</option>`;
            dirSel.addEventListener('change', e => { condition.direction = e.target.value; });
            row.appendChild(dirSel);
        }
    }

    // Remove button
    const rmBtn = document.createElement('button');
    rmBtn.className = 'stc-btn-remove';
    rmBtn.innerHTML = '&#x2715;';
    rmBtn.title = 'Remove condition';
    rmBtn.addEventListener('click', () => removeCondition(condition.id));
    row.appendChild(rmBtn);

    return row;
}

// ============================================================
// EVENT: CHECK CLICKED
// ============================================================
async function onCheckClicked() {
    if (!validateConditions()) return;

    const resultsSection = document.getElementById('stc-results-section');
    const checkBtn = document.getElementById('stc-check-btn');

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    resultsSection.innerHTML = `
        <div class="stc-loading"><div class="stc-spinner"></div>
            <div style="margin-top:10px;">Analyzing game logs...</div>
        </div>`;

    try {
        const results = await runParlayCheck(state.conditions, state.selectedTeam);
        state.results = results;
        if (results.error) {
            resultsSection.innerHTML = `<div class="stc-error">${results.error}</div>`;
        } else {
            renderResults(resultsSection, results);
        }
    } catch (error) {
        console.error('Check error:', error);
        resultsSection.innerHTML = '<div class="stc-error">An error occurred. Please try again.</div>';
    } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check';
    }
}

// ============================================================
// RENDER: RESULTS
// ============================================================
function renderResults(container, results) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'stc-results';

    // Combined result card
    const combined = document.createElement('div');
    combined.className = 'stc-results-combined';
    combined.innerHTML = `
        <div class="stc-results-combined-title">
            Combined Result &mdash; All ${results.conditionCount} Condition${results.conditionCount > 1 ? 's' : ''} Met
        </div>
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

    // Qualifying dates toggle
    if (results.combined.dates && results.combined.dates.length > 0) {
        const toggle = document.createElement('div');
        toggle.className = 'stc-dates-toggle';
        toggle.innerHTML = `<span class="stc-chevron">&#9654;</span> Show ${results.combined.dates.length} qualifying game date${results.combined.dates.length !== 1 ? 's' : ''}`;

        const datesList = document.createElement('div');
        datesList.className = 'stc-dates-list';
        datesList.innerHTML = results.combined.dates.map(d => `<span>${d}</span>`).join('');

        toggle.addEventListener('click', () => {
            const open = datesList.classList.toggle('open');
            toggle.querySelector('.stc-chevron').classList.toggle('open', open);
        });

        combined.appendChild(toggle);
        combined.appendChild(datesList);
    }

    wrapper.appendChild(combined);

    // Individual breakdowns (only if >1 condition)
    if (results.individual && results.individual.length > 1) {
        const indiv = document.createElement('div');
        indiv.className = 'stc-results-individual';

        const title = document.createElement('div');
        title.className = 'stc-results-individual-title';
        title.innerHTML = '<span class="stc-chevron open">&#9654;</span> Individual Condition Breakdowns';

        const body = document.createElement('div');
        body.id = 'stc-individual-body';

        // Header row
        const hdrRow = document.createElement('div');
        hdrRow.className = 'stc-individual-row';
        hdrRow.style.borderBottom = '2px solid var(--stc-border)';
        hdrRow.innerHTML = `
            <div class="stc-individual-label" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">CONDITION</div>
            <div class="stc-individual-values">
                <div class="stc-individual-season" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">SEASON</div>
                <div class="stc-individual-last30" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">LAST 30 DAYS</div>
            </div>`;
        body.appendChild(hdrRow);

        results.individual.forEach(r => {
            const row = document.createElement('div');
            row.className = 'stc-individual-row';
            row.innerHTML = `
                <div class="stc-individual-label"><strong>${r.playerName}</strong> &mdash; ${r.description}</div>
                <div class="stc-individual-values">
                    <div class="stc-individual-season">
                        <div class="stc-rate">${r.seasonRate}%</div>
                        <div class="stc-detail">${r.seasonHits} / ${r.seasonEligible}</div>
                    </div>
                    <div class="stc-individual-last30">
                        <div class="stc-rate">${r.last30Rate}%</div>
                        <div class="stc-detail">${r.last30Hits} / ${r.last30Eligible}</div>
                    </div>
                </div>`;
            body.appendChild(row);
        });

        title.addEventListener('click', () => {
            const vis = body.style.display !== 'none';
            body.style.display = vis ? 'none' : 'block';
            title.querySelector('.stc-chevron').classList.toggle('open', !vis);
        });

        indiv.appendChild(title);
        indiv.appendChild(body);
        wrapper.appendChild(indiv);
    }

    container.appendChild(wrapper);
}

// Debug exports
window.stcDebug = {
    getState: () => state,
    getRoster: () => state.roster,
    getConditions: () => state.conditions,
    getResults: () => state.results,
};
