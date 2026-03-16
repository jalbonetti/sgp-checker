# Same Team Checker

Interactive tool for checking historical co-occurrence of player props on the same team. Supports **NBA** and **NHL**. Built for embedding in Webflow via GitHub + jsDelivr CDN.

## What It Does

Users select a sport tab (NBA or NHL), pick a team playing today, then build up to 10 conditions like:

**NBA examples:**
- "Luka Doncic — Points ≥ 30"
- "LeBron James — Rebounds ≥ 10"
- "Austin Reaves — Starts"

**NHL examples:**
- "Connor McDavid — Points ≥ 2"
- "Leon Draisaitl — Goals ≥ 1"
- "Evan Bouchard — Shots on Goal ≥ 4"

The tool queries game logs from Supabase and reports how often ALL conditions were met together, both for the full season and last 30 days.

## Sport Visibility

In `config.js`, toggle sports on/off via the `SPORT_VISIBILITY` object:

```javascript
export const SPORT_VISIBILITY = {
    nba: true,   // Set to false to hide NBA tab
    nhl: true,   // Set to false to hide NHL tab
};
```

When only one sport is visible, tabs are hidden and it loads directly. Useful for hiding a sport during its off-season.

## Supabase Tables Used

### NBA
| Table | Purpose |
|-------|---------|
| `BasketMatchupsGame` | Today's games / available teams |
| `BasketMatchupsPlayers` | Team rosters with lineup status |
| `BasketGameLogs` | Raw per-game stat lines |
| `BasketPlayerAliases` | Name resolution (GameLogs ↔ Display) |

### NHL
| Table | Purpose |
|-------|---------|
| `HockeyMatchupsGame` | Today's games / available teams |
| `HockeyMatchupsSkater` | Team rosters with injury status inline |
| `HockeyGameLogs` | Raw per-game stat lines |
| `HockeyNormalNames` | Name resolution (CanonicalName ↔ GameLogName) |

## Available Condition Types

### NBA

**Scopes:** All Games, Starts, Off Bench, Does Not Play

**Numeric Props** (≥ or <):
Points, Rebounds, Assists, 3-Pointers, Steals, Blocks, Turnovers,
Pts + Asts, Pts + Rebs, Pts + Rebs + Asts, Rebs + Asts, Blks + Stls

**Binary Props** (Yes / No):
Double-Double, Triple-Double

### NHL

**Scopes:** All Games, Does Not Play

**Numeric Props** (≥ or <):
Points, Goals, Assists, Power Play Goals, Blocked Shots, Shots on Goal

**Injury Handling:**
- Healthy and DTD players appear in main roster group, can use any prop or DNP
- Out, IR, and LTIR players appear in a separate "Injured / Out" group, locked to DNP only

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
├── main.js                      # Entry point - sport tabs, state, UI rendering
├── config.js                    # Shared config, sport visibility, NBA settings
├── services/
│   ├── dataService.js           # NBA Supabase API calls
│   └── parlayEngine.js          # NBA condition evaluation + intersection
├── hockey/
│   ├── config.js                # NHL teams, props, scope options
│   ├── dataService.js           # NHL Supabase API calls
│   ├── parlayEngine.js          # NHL condition evaluation + intersection
│   └── nameResolver.js          # NHL player name resolution
├── utils/
│   ├── nameResolver.js          # NBA player name alias + comma-flip logic
│   └── teamMapper.js            # NBA 2-letter ↔ 3-letter abbreviations
├── styles/
│   └── styles.js                # Injected CSS (teal accent on dark purple)
└── README.md
```

## Debugging

Access via browser console:

```javascript
window.stcDebug.getState()           // Full app state
window.stcDebug.getRoster()          // Current team's roster
window.stcDebug.getConditions()      // Current condition rows
window.stcDebug.getResults()         // Last check results
window.stcDebug.getActiveSport()     // 'nba' or 'nhl'
window.stcDebug.getSportVisibility() // { nba: true, nhl: true }
```

## Design

- **Accent color**: Teal (#06b6d4) — sport-neutral for a cross-sport tool
- **Background**: Designed for dark purple website background
- **Sport tabs**: Pill-style toggle at top, only shown when multiple sports are visible
- **Responsive**: Mobile-friendly with stacked layouts on small screens
