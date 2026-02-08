# Same Team Checker

Interactive tool for checking historical co-occurrence of NBA player stats on the same team. Built for embedding in Webflow via GitHub + jsDelivr CDN.

## What It Does

Users select a team playing today, then build up to 10 conditions like:
- "Luka Doncic — Points ≥ 30"
- "LeBron James — Rebounds ≥ 10"
- "Austin Reaves — Starts"

The tool queries game logs from Supabase and reports how often ALL conditions were met together, both for the full season and last 30 days.

## Supabase Tables Used

| Table | Purpose |
|-------|---------|
| `BasketMatchupsGame` | Today's games / available teams |
| `BasketMatchupsPlayers` | Team rosters with lineup status |
| `BasketGameLogs` | Raw per-game stat lines |
| `BasketPlayerAliases` | Name resolution (GameLogs ↔ Display) |

## Available Condition Types

**Filters** (no value needed):
- Starts, Off Bench, Plays, Does Not Play

**Numeric Props** (≥ or < a value):
- Points, Rebounds, Assists, 3-Pointers, Steals, Blocks, Turnovers
- Pts + Asts, Pts + Rebs, Pts + Rebs + Asts, Rebs + Asts, Blks + Stls

**Binary Props** (Yes / No):
- Double-Double, Triple-Double

## Webflow Setup

### 1. HTML Embed

Add to your Webflow page:

```html
<div id="stc-root"></div>
```

### 2. Script Include

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/sgp-checker@main/main.js"></script>
```

### 3. That's It

No additional CSS files or libraries needed. All styles are injected by the script.

## Directory Structure

```
sgp-checker/
├── main.js                      # Entry point - UI, events, state
├── config.js                    # Supabase config, team maps, prop definitions
├── services/
│   ├── dataService.js           # Supabase API calls
│   └── parlayEngine.js          # Condition evaluation + intersection logic
├── utils/
│   ├── nameResolver.js          # Player name alias + comma-flip logic
│   └── teamMapper.js            # 2-letter ↔ 3-letter team abbreviations
├── styles/
│   └── styles.js                # Injected CSS (teal accent on dark purple)
└── README.md
```

## Debugging

Access via browser console:

```javascript
window.stcDebug.getState()       // Full app state
window.stcDebug.getRoster()      // Current team's roster
window.stcDebug.getConditions()  // Current condition rows
window.stcDebug.getResults()     // Last check results
```

## Design

- **Accent color**: Teal (#06b6d4) — sport-neutral for a cross-sport tool
- **Background**: Designed for dark purple website background
- **Responsive**: Mobile-friendly with stacked layouts on small screens
