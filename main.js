// main.js - Same Team Prop Checker
// - "None" prop = conditionless pull, locks player from being added again
// - Scope syncs across all rows for same player
// - Name qualifiers stripped for game log lookup
// - Individual denominators use combined eligible pool

import { injectStyles } from './styles/styles.js';
import { CONFIG, ALL_PROPS, NUMERIC_PROPS, BINARY_PROPS, NONE_PROP, INJURED_PROP, SCOPE_OPTIONS, TEAM_FULL_NAMES } from './config.js';
import { fetchTodaysGames, fetchTeamRoster } from './services/dataService.js';
import { loadAliasTable, buildReverseAliasMap } from './utils/nameResolver.js';
import { runParlayCheck } from './services/parlayEngine.js';

const state = { games: [], selectedTeam: null, roster: [], conditions: [], aliasMap: null, reverseAliasMap: null, results: null };
const SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];
const QUALIFIER_REGEX = /\s*\((Q|P|D|Out|OFS)\)\s*$/;
function stripQualifier(name) { return (name || '').replace(QUALIFIER_REGEX, '').trim(); }

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async function () {
    injectStyles();
    const root = document.getElementById('stc-root'); if (!root) return;
    root.innerHTML = `<div class="stc-header"><h1 class="stc-title">Same Team <span class="stc-title-accent">Prop Checker</span></h1>
        <p class="stc-subtitle">Check historical co-occurrence of player props on the same team</p></div>
        <div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Loading today's games...</div></div>`;
    try {
        const [aliasMap, games] = await Promise.all([loadAliasTable(), fetchTodaysGames()]);
        state.aliasMap = aliasMap; state.reverseAliasMap = buildReverseAliasMap(aliasMap); state.games = games;
        renderApp(root);
    } catch (e) {
        root.innerHTML = `<div class="stc-header"><h1 class="stc-title">Same Team <span class="stc-title-accent">Prop Checker</span></h1></div><div class="stc-error">Failed to load. Please refresh.</div>`;
    }
});

function renderApp(root) {
    root.innerHTML = '';
    const h = document.createElement('div'); h.className = 'stc-header';
    h.innerHTML = `<h1 class="stc-title">Same Team <span class="stc-title-accent">Prop Checker</span></h1><p class="stc-subtitle">Check historical co-occurrence of player props on the same team</p>`;
    root.appendChild(h);
    const ts = document.createElement('div'); ts.id = 'stc-team-section'; root.appendChild(ts); renderTeamSelector(ts);
    root.appendChild(Object.assign(document.createElement('div'), { id: 'stc-conditions-section' }));
    root.appendChild(Object.assign(document.createElement('div'), { id: 'stc-results-section' }));
}

// ============================================================
// TEAM SELECTOR
// ============================================================
function renderTeamSelector(c) {
    c.innerHTML = '';
    const tp = extractTeamsPlaying(state.games);
    const lbl = document.createElement('div'); lbl.className = 'stc-section-label'; lbl.textContent = 'Select a Team'; c.appendChild(lbl);
    if (!tp.length) { c.innerHTML += '<div class="stc-no-games">No games scheduled for today.</div>'; return; }
    const grid = document.createElement('div'); grid.className = 'stc-team-grid';
    Object.keys(TEAM_FULL_NAMES).sort().forEach(a => {
        const btn = document.createElement('button'); btn.className = 'stc-team-btn'; btn.textContent = a; btn.title = TEAM_FULL_NAMES[a];
        if (!tp.includes(a)) btn.classList.add('disabled');
        else { if (state.selectedTeam === a) btn.classList.add('active'); btn.addEventListener('click', () => onTeamSelected(a)); }
        grid.appendChild(btn);
    });
    c.appendChild(grid);
}

function extractTeamsPlaying(games) {
    const t = new Set();
    games.forEach(g => {
        ['Home Team', 'Away Team'].forEach(f => { const v = (g[f] || '').trim(); if (TEAM_FULL_NAMES[v]) t.add(v); });
        const m = g['Matchup'] || '';
        Object.entries(TEAM_FULL_NAMES).forEach(([a, fn]) => { if (m.includes(fn)) t.add(a); });
    });
    return [...t].sort();
}

// ============================================================
// TEAM SELECTED
// ============================================================
async function onTeamSelected(team) {
    state.selectedTeam = team; state.conditions = []; state.results = null;
    renderTeamSelector(document.getElementById('stc-team-section'));
    const cs = document.getElementById('stc-conditions-section');
    cs.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Loading ${TEAM_FULL_NAMES[team]} roster...</div></div>`;
    document.getElementById('stc-results-section').innerHTML = '';
    try {
        state.roster = processRoster(await fetchTeamRoster(team), team);
        addCondition(); renderConditionsPanel(cs);
    } catch (e) { cs.innerHTML = '<div class="stc-error">Failed to load roster.</div>'; }
}

function processRoster(data, team) {
    const map = new Map();
    data.forEach(row => {
        const displayName = (row['Player'] || '').trim();
        if (!displayName || map.has(displayName)) return;
        const lineup = (row['Lineup'] || '').trim();
        const cleanName = stripQualifier(displayName);
        let gl = state.reverseAliasMap?.get(cleanName) || state.reverseAliasMap?.get(displayName) || '';
        if (!gl) gl = constructGameLogName(cleanName);
        map.set(displayName, { displayName, cleanName, gameLogName: gl, team, lineup,
            isInjured: lineup === 'Injury', isStarter: lineup.includes('Starter'), isBench: lineup.includes('Bench') });
    });
    return [...map.values()].sort((a, b) => {
        const ao = a.isStarter ? 0 : a.isInjured ? 2 : 1;
        const bo = b.isStarter ? 0 : b.isInjured ? 2 : 1;
        return ao !== bo ? ao - bo : a.displayName.localeCompare(b.displayName);
    });
}

function constructGameLogName(name) {
    if (!name) return '';
    const t = name.trim().split(/\s+/); if (t.length < 2) return name;
    const last = t[t.length - 1];
    if (SUFFIXES.some(s => last === s || last === s.replace('.', '')) && t.length >= 3) { const suf = t.pop(); const ln = t.pop(); return `${ln}, ${t.join(' ')} ${suf}`; }
    const ln = t.pop(); return `${ln}, ${t.join(' ')}`;
}

// ============================================================
// CONDITION STATE
// ============================================================
function addCondition() {
    if (state.conditions.length >= CONFIG.MAX_CONDITIONS) return;
    state.conditions.push({ id: Date.now() + Math.random(), player: null, scope: 'all', propId: null, propDef: null, direction: null, value: null });
}
function removeCondition(id) { state.conditions = state.conditions.filter(c => c.id !== id); renderConditionsPanel(document.getElementById('stc-conditions-section')); }

function findPropDef(propId) {
    if (propId === 'does_not_play') return INJURED_PROP;
    if (propId === 'none') return NONE_PROP;
    return [...NUMERIC_PROPS, ...BINARY_PROPS].find(p => p.id === propId) || null;
}

function getScopeOptionsForPlayer(p) {
    if (!p || p.isInjured) return [];
    if (p.isStarter) return SCOPE_OPTIONS.filter(s => s.id !== 'off_bench');
    if (p.isBench) return SCOPE_OPTIONS.filter(s => s.id !== 'starts');
    return SCOPE_OPTIONS;
}

function getExistingScopeForPlayer(displayName, excludeId) {
    for (const c of state.conditions) { if (c.id !== excludeId && c.player?.displayName === displayName && !c.player.isInjured) return c.scope; }
    return null;
}

function syncScopeForPlayer(displayName, newScope) {
    state.conditions.forEach(c => { if (c.player?.displayName === displayName && !c.player.isInjured) c.scope = newScope; });
}

/** Check if a player has "None" selected in any row (locks them out from new rows) */
function playerHasNone(displayName) {
    return state.conditions.some(c => c.player?.displayName === displayName && c.propId === 'none');
}

/** Check if a prop is already used by this player in another row */
function isPropUsed(excludeId, playerName, propId) {
    return state.conditions.some(c => c.id !== excludeId && c.player?.displayName === playerName && c.propId === propId);
}

/** Check if a player should be disabled in the player dropdown of a new row */
function isPlayerLocked(displayName, excludeId) {
    // Locked if this player has "None" or "Does Not Play" in any other row
    return state.conditions.some(c => c.id !== excludeId && c.player?.displayName === displayName && (c.propId === 'none' || c.propId === 'does_not_play'));
    // Also locked if injured player already has a DNP row
}

/** Check if injured player already has a row */
function injuredPlayerUsed(displayName, excludeId) {
    return state.conditions.some(c => c.id !== excludeId && c.player?.displayName === displayName && c.propId === 'does_not_play');
}

function validateConditions() {
    if (!state.conditions.length) return false;
    return state.conditions.every(c => {
        if (!c.player) return false;
        if (c.propId === 'does_not_play') return true;
        if (c.propId === 'none') return true;
        if (!c.propDef) return false;
        const isBin = c.propDef.column === 'DD' || c.propDef.column === 'TD';
        if (isBin) return c.direction === 'yes' || c.direction === 'no';
        return (c.value !== null && c.value !== undefined && c.value !== '') && (c.direction === 'gte' || c.direction === 'lt');
    });
}

// ============================================================
// RENDER CONDITIONS
// ============================================================
function renderConditionsPanel(container) {
    container.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'stc-conditions-panel';
    const hdr = document.createElement('div'); hdr.className = 'stc-conditions-header';
    hdr.innerHTML = `<div class="stc-conditions-title">${TEAM_FULL_NAMES[state.selectedTeam]} — Conditions</div><div class="stc-conditions-count">${state.conditions.length} / ${CONFIG.MAX_CONDITIONS}</div>`;
    panel.appendChild(hdr);
    state.conditions.forEach((c, i) => panel.appendChild(renderConditionRow(c, i)));
    if (state.conditions.length < CONFIG.MAX_CONDITIONS) {
        const addBtn = document.createElement('button'); addBtn.className = 'stc-btn stc-btn-add'; addBtn.textContent = '+ Add Condition';
        addBtn.addEventListener('click', () => { addCondition(); renderConditionsPanel(container); });
        panel.appendChild(addBtn);
    }
    const actions = document.createElement('div'); actions.className = 'stc-actions';
    const checkBtn = document.createElement('button'); checkBtn.className = 'stc-btn stc-btn-primary'; checkBtn.textContent = 'Check'; checkBtn.id = 'stc-check-btn';
    checkBtn.disabled = !validateConditions(); checkBtn.addEventListener('click', onCheckClicked); actions.appendChild(checkBtn);
    const resetBtn = document.createElement('button'); resetBtn.className = 'stc-btn stc-btn-secondary'; resetBtn.textContent = 'Reset All';
    resetBtn.addEventListener('click', () => { state.conditions = []; state.results = null; addCondition(); renderConditionsPanel(container); document.getElementById('stc-results-section').innerHTML = ''; });
    actions.appendChild(resetBtn); panel.appendChild(actions); container.appendChild(panel);
}

function renderConditionRow(cond, index) {
    const row = document.createElement('div'); row.className = 'stc-condition-row';
    const isInj = cond.player?.isInjured;

    // Row number
    row.appendChild(Object.assign(document.createElement('span'), { className: 'stc-row-number', textContent: `${index + 1}` }));

    // Player dropdown
    const playerSel = document.createElement('select'); playerSel.className = 'stc-select stc-select-player';
    playerSel.innerHTML = '<option value="">Player</option>';
    const groups = { 'Starters': [], 'Bench': [], 'Injured / Out': [] };
    state.roster.forEach(p => { groups[p.isStarter ? 'Starters' : p.isInjured ? 'Injured / Out' : 'Bench'].push(p); });
    Object.entries(groups).forEach(([gName, players]) => {
        if (!players.length) return;
        const og = document.createElement('optgroup'); og.label = gName;
        players.forEach(p => {
            const opt = document.createElement('option'); opt.value = p.displayName;
            // Lock player if they have "None" in another row, or injured player already has DNP row
            const locked = isPlayerLocked(p.displayName, cond.id) || (p.isInjured && injuredPlayerUsed(p.displayName, cond.id));
            if (locked) { opt.disabled = true; opt.textContent = `${p.displayName} (locked)`; }
            else { opt.textContent = p.displayName; }
            if (cond.player?.displayName === p.displayName) opt.selected = true;
            og.appendChild(opt);
        });
        playerSel.appendChild(og);
    });
    playerSel.addEventListener('change', e => {
        const p = state.roster.find(r => r.displayName === e.target.value);
        cond.player = p || null;
        if (p?.isInjured) { cond.scope = 'all'; cond.propId = 'does_not_play'; cond.propDef = INJURED_PROP; cond.direction = null; cond.value = null; }
        else {
            if (cond.propId === 'does_not_play') { cond.propId = null; cond.propDef = null; cond.direction = null; cond.value = null; }
            if (p) {
                const es = getExistingScopeForPlayer(p.displayName, cond.id);
                if (es) cond.scope = es;
                else { const allowed = getScopeOptionsForPlayer(p); if (!allowed.some(s => s.id === cond.scope)) cond.scope = allowed[0]?.id || 'all'; }
            }
        }
        renderConditionsPanel(document.getElementById('stc-conditions-section'));
    });
    row.appendChild(playerSel);

    if (isInj) {
        // Injured: Does Not Play only
        const dnp = document.createElement('select'); dnp.className = 'stc-select stc-select-condition';
        dnp.innerHTML = '<option value="does_not_play" selected>Does Not Play</option>'; row.appendChild(dnp);
    } else if (cond.player) {
        // If active player selected "Does Not Play", show it simply like injured
        if (cond.propId === 'does_not_play') {
            const propSel = document.createElement('select'); propSel.className = 'stc-select stc-select-condition';
            propSel.innerHTML = '<option value="">Prop</option>';
            ALL_PROPS.forEach(p => {
                const opt = document.createElement('option');
                if (p.type === 'separator') { opt.disabled = true; opt.textContent = p.label; }
                else {
                    opt.value = p.id; opt.textContent = p.label;
                    if (cond.propId === p.id) opt.selected = true;
                    if (isPropUsed(cond.id, cond.player?.displayName, p.id)) { opt.disabled = true; opt.textContent = `${p.label} (used)`; }
                }
                propSel.appendChild(opt);
            });
            propSel.addEventListener('change', e => {
                cond.propId = e.target.value; cond.propDef = findPropDef(e.target.value);
                if (cond.propId === 'none' || cond.propId === 'does_not_play') { cond.direction = null; cond.value = null; }
                else if (cond.propDef) {
                    const isBin = cond.propDef.column === 'DD' || cond.propDef.column === 'TD';
                    if (isBin) { cond.direction = 'yes'; cond.value = null; } else { cond.direction = 'gte'; cond.value = null; }
                } else { cond.direction = null; cond.value = null; }
                renderConditionsPanel(document.getElementById('stc-conditions-section'));
            });
            row.appendChild(propSel);
            // No scope, direction, or value for DNP
        } else {
        // Scope dropdown
        const scopeOpts = getScopeOptionsForPlayer(cond.player);
        if (scopeOpts.length > 0) {
            const scopeSel = document.createElement('select'); scopeSel.className = 'stc-select stc-select-scope';
            scopeOpts.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.label; if (cond.scope === s.id) o.selected = true; scopeSel.appendChild(o); });
            scopeSel.addEventListener('change', e => { syncScopeForPlayer(cond.player.displayName, e.target.value); renderConditionsPanel(document.getElementById('stc-conditions-section')); });
            row.appendChild(scopeSel);
        }

        // Prop dropdown
        const propSel = document.createElement('select'); propSel.className = 'stc-select stc-select-condition';
        propSel.innerHTML = '<option value="">Prop</option>';
        ALL_PROPS.forEach(p => {
            const opt = document.createElement('option');
            if (p.type === 'separator') { opt.disabled = true; opt.textContent = p.label; }
            else {
                opt.value = p.id; opt.textContent = p.label;
                if (cond.propId === p.id) opt.selected = true;
                if (isPropUsed(cond.id, cond.player?.displayName, p.id)) { opt.disabled = true; opt.textContent = `${p.label} (used)`; }
            }
            propSel.appendChild(opt);
        });
        propSel.addEventListener('change', e => {
            cond.propId = e.target.value; cond.propDef = findPropDef(e.target.value);
            if (cond.propId === 'none' || cond.propId === 'does_not_play') { cond.direction = null; cond.value = null; }
            else if (cond.propDef) {
                const isBin = cond.propDef.column === 'DD' || cond.propDef.column === 'TD';
                if (isBin) { cond.direction = 'yes'; cond.value = null; } else { cond.direction = 'gte'; cond.value = null; }
            } else { cond.direction = null; cond.value = null; }
            renderConditionsPanel(document.getElementById('stc-conditions-section'));
        });
        row.appendChild(propSel);

        // Direction + value (not for None or DNP)
        if (cond.propDef && cond.propId !== 'does_not_play' && cond.propId !== 'none') {
            const isBin = cond.propDef.column === 'DD' || cond.propDef.column === 'TD';
            if (!isBin) {
                const dirSel = document.createElement('select'); dirSel.className = 'stc-select stc-select-direction';
                dirSel.innerHTML = `<option value="gte" ${cond.direction === 'gte' ? 'selected' : ''}>≥</option><option value="lt" ${cond.direction === 'lt' ? 'selected' : ''}>&lt;</option>`;
                dirSel.addEventListener('change', e => { cond.direction = e.target.value; }); row.appendChild(dirSel);
                const valIn = document.createElement('input'); valIn.type = 'number'; valIn.className = 'stc-input stc-input-value';
                valIn.min = 0; valIn.max = CONFIG.MAX_STAT_VALUE; valIn.placeholder = '0';
                if (cond.value !== null && cond.value !== undefined) valIn.value = cond.value;
                valIn.addEventListener('input', e => { let v = parseInt(e.target.value); if (isNaN(v) || v < 0) v = 0; if (v > CONFIG.MAX_STAT_VALUE) v = CONFIG.MAX_STAT_VALUE; cond.value = v; e.target.value = v || ''; });
                valIn.addEventListener('change', () => { const b = document.getElementById('stc-check-btn'); if (b) b.disabled = !validateConditions(); });
                row.appendChild(valIn);
            } else {
                const dirSel = document.createElement('select'); dirSel.className = 'stc-select stc-select-direction';
                dirSel.innerHTML = `<option value="yes" ${cond.direction === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${cond.direction === 'no' ? 'selected' : ''}>No</option>`;
                dirSel.addEventListener('change', e => { cond.direction = e.target.value; }); row.appendChild(dirSel);
            }
        }
        } // close else (non-DNP active player)
    }

    const rmBtn = document.createElement('button'); rmBtn.className = 'stc-btn-remove'; rmBtn.innerHTML = '&#x2715;'; rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', () => removeCondition(cond.id)); row.appendChild(rmBtn);
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
    rs.innerHTML = `<div class="stc-loading"><div class="stc-spinner"></div><div style="margin-top:10px;">Analyzing game logs...</div></div>`;
    try {
        const results = await runParlayCheck(state.conditions, state.selectedTeam);
        state.results = results;
        if (results.error) rs.innerHTML = `<div class="stc-error">${results.error}</div>`;
        else renderResults(rs, results);
    } catch (e) { console.error('Check error:', e); rs.innerHTML = '<div class="stc-error">An error occurred. Please try again.</div>'; }
    finally { btn.disabled = false; btn.textContent = 'Check'; }
}

// ============================================================
// RESULTS
// ============================================================
function renderResults(container, results) {
    container.innerHTML = '';
    const w = document.createElement('div'); w.className = 'stc-results';
    const combined = document.createElement('div'); combined.className = 'stc-results-combined';
    combined.innerHTML = `
        <div class="stc-results-combined-title">Combined Result &mdash; All ${results.conditionCount} Condition${results.conditionCount > 1 ? 's' : ''} Met</div>
        <div class="stc-result-stats">
            <div class="stc-result-stat"><div class="stc-result-stat-label">Eligible Games</div><div class="stc-result-stat-value">${results.combined.rate}%</div><div class="stc-result-stat-detail">${results.combined.hits} of ${results.combined.eligible} games</div></div>
            <div class="stc-result-stat"><div class="stc-result-stat-label">Last 30 Days</div><div class="stc-result-stat-value">${results.combined.last30Rate}%</div><div class="stc-result-stat-detail">${results.combined.last30Hits} of ${results.combined.last30Eligible} games</div></div>
            <div class="stc-result-stat stc-result-stat-muted"><div class="stc-result-stat-label">Team Games</div><div class="stc-result-stat-value">${results.teamGames.season}</div><div class="stc-result-stat-detail">${results.teamGames.last30} in last 30 days</div></div>
        </div>`;
    if (results.combined.dates?.length > 0) {
        const toggle = document.createElement('div'); toggle.className = 'stc-dates-toggle';
        toggle.innerHTML = `<span class="stc-chevron">&#9654;</span> Show ${results.combined.dates.length} qualifying game date${results.combined.dates.length !== 1 ? 's' : ''}`;
        const dl = document.createElement('div'); dl.className = 'stc-dates-list';
        dl.innerHTML = results.combined.dates.map(d => `<span>${d}</span>`).join('');
        toggle.addEventListener('click', () => { const o = dl.classList.toggle('open'); toggle.querySelector('.stc-chevron').classList.toggle('open', o); });
        combined.appendChild(toggle); combined.appendChild(dl);
    }
    w.appendChild(combined);

    if (results.individual?.length > 1) {
        const indiv = document.createElement('div'); indiv.className = 'stc-results-individual';
        const title = document.createElement('div'); title.className = 'stc-results-individual-title';
        title.innerHTML = '<span class="stc-chevron open">&#9654;</span> Individual Condition Breakdowns';
        const body = document.createElement('div'); body.id = 'stc-individual-body';
        const hRow = document.createElement('div'); hRow.className = 'stc-individual-row'; hRow.style.borderBottom = '2px solid var(--stc-border)';
        hRow.innerHTML = `<div class="stc-individual-label" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">CONDITION</div>
            <div class="stc-individual-values"><div class="stc-individual-season" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">SEASON</div>
            <div class="stc-individual-last30" style="font-weight:600;color:var(--stc-text-muted);font-size:11px;">LAST 30 DAYS</div></div>`;
        body.appendChild(hRow);
        results.individual.forEach(r => {
            const row = document.createElement('div'); row.className = 'stc-individual-row';
            row.innerHTML = `<div class="stc-individual-label"><strong>${r.playerName}</strong> &mdash; ${r.description}</div>
                <div class="stc-individual-values">
                    <div class="stc-individual-season"><div class="stc-rate">${r.seasonRate}%</div><div class="stc-detail">${r.seasonHits} / ${r.seasonEligible}</div></div>
                    <div class="stc-individual-last30"><div class="stc-rate">${r.last30Rate}%</div><div class="stc-detail">${r.last30Hits} / ${r.last30Eligible}</div></div></div>`;
            body.appendChild(row);
        });
        title.addEventListener('click', () => { const v = body.style.display !== 'none'; body.style.display = v ? 'none' : 'block'; title.querySelector('.stc-chevron').classList.toggle('open', !v); });
        indiv.appendChild(title); indiv.appendChild(body); w.appendChild(indiv);
    }
    container.appendChild(w);
}

window.stcDebug = { getState: () => state, getRoster: () => state.roster, getConditions: () => state.conditions, getResults: () => state.results };
