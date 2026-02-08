// styles/styles.js - Same Team Checker Styles
// Teal accent (#06b6d4) on dark purple website background
// Injected into DOM on load, same pattern as basketball-props tableStyles.js

export function injectStyles() {
    if (document.getElementById('stc-styles')) return;

    const style = document.createElement('style');
    style.id = 'stc-styles';
    style.textContent = `
        /* ============================================================
           CSS VARIABLES
           ============================================================ */
        #stc-root {
            --stc-accent: #06b6d4;
            --stc-accent-hover: #0891b2;
            --stc-accent-light: rgba(6, 182, 212, 0.12);
            --stc-accent-glow: rgba(6, 182, 212, 0.25);
            --stc-bg-primary: #1a1028;
            --stc-bg-card: #231536;
            --stc-bg-input: #2d1b45;
            --stc-bg-input-focus: #351f52;
            --stc-bg-row: #2a1740;
            --stc-bg-row-hover: #33204d;
            --stc-border: rgba(255, 255, 255, 0.08);
            --stc-border-focus: rgba(6, 182, 212, 0.5);
            --stc-text-primary: #e8e0f0;
            --stc-text-secondary: #a89bbe;
            --stc-text-muted: #7a6b8f;
            --stc-text-accent: #06b6d4;
            --stc-success: #34d399;
            --stc-success-bg: rgba(52, 211, 153, 0.1);
            --stc-warning: #fbbf24;
            --stc-danger: #f87171;
            --stc-danger-bg: rgba(248, 113, 113, 0.1);
            --stc-radius: 8px;
            --stc-radius-lg: 12px;
            --stc-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            --stc-shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.4);
            --stc-transition: 150ms ease;
        }

        /* ============================================================
           BASE CONTAINER
           ============================================================ */
        #stc-root {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: var(--stc-text-primary);
            max-width: 900px;
            margin: 0 auto;
            padding: 0 16px;
        }

        #stc-root *, #stc-root *::before, #stc-root *::after {
            box-sizing: border-box;
        }

        /* ============================================================
           HEADER / TITLE AREA
           ============================================================ */
        .stc-header {
            text-align: center;
            margin-bottom: 24px;
        }

        .stc-title {
            font-size: 22px;
            font-weight: 700;
            color: var(--stc-text-primary);
            margin: 0 0 4px 0;
            letter-spacing: -0.3px;
        }

        .stc-title-accent {
            color: var(--stc-accent);
        }

        .stc-subtitle {
            font-size: 13px;
            color: var(--stc-text-muted);
            margin: 0;
        }

        /* ============================================================
           TEAM SELECTOR
           ============================================================ */
        .stc-team-selector {
            margin-bottom: 20px;
        }

        .stc-section-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--stc-text-muted);
            margin-bottom: 8px;
        }

        .stc-team-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: center;
        }

        .stc-team-btn {
            padding: 6px 12px;
            border: 1px solid var(--stc-border);
            border-radius: var(--stc-radius);
            background: var(--stc-bg-card);
            color: var(--stc-text-secondary);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--stc-transition);
            white-space: nowrap;
        }

        .stc-team-btn:hover {
            border-color: var(--stc-border-focus);
            background: var(--stc-bg-row-hover);
            color: var(--stc-text-primary);
        }

        .stc-team-btn.active {
            border-color: var(--stc-accent);
            background: var(--stc-accent-light);
            color: var(--stc-accent);
            box-shadow: 0 0 8px var(--stc-accent-glow);
        }

        .stc-team-btn.disabled {
            opacity: 0.35;
            cursor: not-allowed;
            pointer-events: none;
        }

        /* No games message */
        .stc-no-games {
            text-align: center;
            padding: 24px;
            color: var(--stc-text-muted);
            font-size: 14px;
        }

        /* ============================================================
           CONDITION BUILDER
           ============================================================ */
        .stc-conditions-panel {
            background: var(--stc-bg-card);
            border: 1px solid var(--stc-border);
            border-radius: var(--stc-radius-lg);
            padding: 16px;
            margin-bottom: 20px;
        }

        .stc-conditions-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .stc-conditions-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--stc-text-primary);
        }

        .stc-conditions-count {
            font-size: 12px;
            color: var(--stc-text-muted);
        }

        /* Individual condition row */
        .stc-condition-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
            border-bottom: 1px solid var(--stc-border);
            flex-wrap: wrap;
        }

        .stc-condition-row:last-of-type {
            border-bottom: none;
        }

        .stc-row-number {
            font-size: 11px;
            font-weight: 700;
            color: var(--stc-text-muted);
            min-width: 20px;
            text-align: center;
            flex-shrink: 0;
        }

        /* Shared input/select styles */
        .stc-select, .stc-input {
            padding: 7px 10px;
            border: 1px solid var(--stc-border);
            border-radius: 6px;
            background: var(--stc-bg-input);
            color: var(--stc-text-primary);
            font-size: 13px;
            font-family: inherit;
            transition: border-color var(--stc-transition), background var(--stc-transition);
            outline: none;
        }

        .stc-select:focus, .stc-input:focus {
            border-color: var(--stc-border-focus);
            background: var(--stc-bg-input-focus);
        }

        .stc-select {
            cursor: pointer;
            -webkit-appearance: none;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a89bbe' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
            padding-right: 26px;
        }

        .stc-select option {
            background: #2d1b45;
            color: #e8e0f0;
        }

        .stc-select option:disabled {
            color: #7a6b8f;
        }

        /* Player dropdown - wider */
        .stc-select-player {
            flex: 1;
            min-width: 140px;
            max-width: 220px;
        }

        /* Condition type dropdown */
        .stc-select-condition {
            min-width: 130px;
        }

        /* Direction dropdown (≥ / <, Yes/No) */
        .stc-select-direction {
            min-width: 60px;
            max-width: 70px;
        }

        /* Number input */
        .stc-input-value {
            width: 62px;
            text-align: center;
        }

        /* Remove the browser number input spinners */
        .stc-input-value::-webkit-inner-spin-button,
        .stc-input-value::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        .stc-input-value {
            -moz-appearance: textfield;
        }

        /* Remove button */
        .stc-btn-remove {
            width: 28px;
            height: 28px;
            border: 1px solid transparent;
            border-radius: 6px;
            background: transparent;
            color: var(--stc-text-muted);
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--stc-transition);
            flex-shrink: 0;
            padding: 0;
            line-height: 1;
        }

        .stc-btn-remove:hover {
            background: var(--stc-danger-bg);
            border-color: rgba(248, 113, 113, 0.3);
            color: var(--stc-danger);
        }

        /* ============================================================
           ACTION BUTTONS
           ============================================================ */
        .stc-actions {
            display: flex;
            gap: 10px;
            margin-top: 12px;
            flex-wrap: wrap;
        }

        .stc-btn {
            padding: 9px 18px;
            border: none;
            border-radius: var(--stc-radius);
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: all var(--stc-transition);
        }

        .stc-btn-primary {
            background: var(--stc-accent);
            color: #fff;
        }

        .stc-btn-primary:hover {
            background: var(--stc-accent-hover);
            box-shadow: 0 0 12px var(--stc-accent-glow);
        }

        .stc-btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            box-shadow: none;
        }

        .stc-btn-secondary {
            background: transparent;
            border: 1px solid var(--stc-border);
            color: var(--stc-text-secondary);
        }

        .stc-btn-secondary:hover {
            border-color: var(--stc-text-muted);
            color: var(--stc-text-primary);
        }

        .stc-btn-add {
            background: transparent;
            border: 1px dashed var(--stc-border);
            color: var(--stc-text-muted);
            width: 100%;
            padding: 10px;
        }

        .stc-btn-add:hover {
            border-color: var(--stc-accent);
            color: var(--stc-accent);
            background: var(--stc-accent-light);
        }

        /* ============================================================
           LOADING STATE
           ============================================================ */
        .stc-loading {
            text-align: center;
            padding: 32px;
            color: var(--stc-text-muted);
        }

        .stc-spinner {
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 3px solid var(--stc-border);
            border-top-color: var(--stc-accent);
            border-radius: 50%;
            animation: stc-spin 0.8s linear infinite;
        }

        @keyframes stc-spin {
            to { transform: rotate(360deg); }
        }

        /* ============================================================
           RESULTS
           ============================================================ */
        .stc-results {
            margin-top: 20px;
        }

        .stc-results-combined {
            background: var(--stc-bg-card);
            border: 1px solid var(--stc-accent);
            border-radius: var(--stc-radius-lg);
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 0 16px var(--stc-accent-glow);
        }

        .stc-results-combined-title {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: var(--stc-accent);
            margin-bottom: 10px;
        }

        .stc-result-stats {
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
        }

        .stc-result-stat {
            flex: 1;
            min-width: 160px;
        }

        .stc-result-stat-label {
            font-size: 11px;
            color: var(--stc-text-muted);
            margin-bottom: 4px;
        }

        .stc-result-stat-value {
            font-size: 26px;
            font-weight: 700;
            color: var(--stc-text-primary);
            line-height: 1.1;
        }

        .stc-result-stat-detail {
            font-size: 12px;
            color: var(--stc-text-secondary);
            margin-top: 2px;
        }

        /* Individual breakdowns */
        .stc-results-individual {
            background: var(--stc-bg-card);
            border: 1px solid var(--stc-border);
            border-radius: var(--stc-radius-lg);
            padding: 16px;
            margin-bottom: 16px;
        }

        .stc-results-individual-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--stc-text-primary);
            margin-bottom: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .stc-results-individual-title .stc-chevron {
            transition: transform var(--stc-transition);
            font-size: 10px;
        }

        .stc-results-individual-title .stc-chevron.open {
            transform: rotate(90deg);
        }

        .stc-individual-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--stc-border);
            font-size: 13px;
            gap: 12px;
        }

        .stc-individual-row:last-child {
            border-bottom: none;
        }

        .stc-individual-label {
            color: var(--stc-text-secondary);
            flex: 1;
        }

        .stc-individual-label strong {
            color: var(--stc-text-primary);
        }

        .stc-individual-values {
            display: flex;
            gap: 16px;
            flex-shrink: 0;
            text-align: right;
        }

        .stc-individual-season, .stc-individual-last30 {
            min-width: 100px;
        }

        .stc-individual-season .stc-rate, .stc-individual-last30 .stc-rate {
            font-weight: 700;
            color: var(--stc-text-primary);
        }

        .stc-individual-season .stc-detail, .stc-individual-last30 .stc-detail {
            font-size: 11px;
            color: var(--stc-text-muted);
        }

        /* Game dates list */
        .stc-dates-toggle {
            font-size: 12px;
            color: var(--stc-accent);
            cursor: pointer;
            margin-top: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .stc-dates-toggle:hover {
            text-decoration: underline;
        }

        .stc-dates-list {
            display: none;
            margin-top: 8px;
            padding: 10px;
            background: var(--stc-bg-input);
            border-radius: 6px;
            font-size: 12px;
            color: var(--stc-text-secondary);
            columns: 3;
            column-gap: 16px;
            max-height: 200px;
            overflow-y: auto;
        }

        .stc-dates-list.open {
            display: block;
        }

        .stc-dates-list span {
            display: block;
            padding: 2px 0;
        }

        /* Error message */
        .stc-error {
            background: var(--stc-danger-bg);
            border: 1px solid rgba(248, 113, 113, 0.3);
            border-radius: var(--stc-radius);
            padding: 12px 16px;
            color: var(--stc-danger);
            font-size: 13px;
            margin-top: 12px;
        }

        /* ============================================================
           RESPONSIVE
           ============================================================ */
        @media (max-width: 768px) {
            #stc-root {
                padding: 0 12px;
            }

            .stc-title {
                font-size: 18px;
            }

            .stc-condition-row {
                gap: 6px;
            }

            .stc-select-player {
                min-width: 120px;
                max-width: 100%;
                flex: 1 1 100%;
            }

            .stc-select-condition {
                min-width: 110px;
                flex: 1;
            }

            .stc-select-direction {
                min-width: 55px;
            }

            .stc-input-value {
                width: 55px;
            }

            .stc-result-stat-value {
                font-size: 22px;
            }

            .stc-individual-values {
                flex-direction: column;
                gap: 4px;
            }

            .stc-dates-list {
                columns: 2;
            }
        }

        @media (max-width: 480px) {
            .stc-team-btn {
                padding: 5px 8px;
                font-size: 11px;
            }

            .stc-dates-list {
                columns: 1;
            }
        }
    `;

    document.head.appendChild(style);
    console.log('✅ STC styles injected');
}
