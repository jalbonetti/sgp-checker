# Same Team Checker

Interactive tool for checking historical co-occurrence of player props on the same team. Supports **NBA**, **WNBA**, **NHL** and **MLB**. Built for embedding in Webflow via GitHub + jsDelivr CDN.

## What It Does

Users select a sport tab, pick a team playing today, then build up to 10 conditions like:

**NBA / WNBA examples:**
- "Paige Bueckers — Points ≥ 20"
- "Jessica Shepard — Starts · Rebounds ≥ 8"
- "Alanna Smith — Does Not Play"

**NHL examples:**
- "Connor McDavid — Points ≥ 2"
- "Evan Bouchard — Shots on Goal ≥ 4"

The tool queries game logs from Supabase and reports how often ALL conditions were met together, both for the full season and last 30 days.

## Sport Visibility

In `config.js`, toggle sports on/off via the `SPORT_VISIBILITY` object:

```javascript
export const SPORT_VISIBILITY = {
    nba:  false,
    wnba: true,
    nhl:  false,
    mlb:  true,
};
```

Tab order comes from `SPORT_ORDER` and labels from `SPORT_LABELS`, both in `config.js`. When only one sport is visible, tabs are hidden and it loads directly. Useful for hiding a sport during its off-season.

## Supabase Tables Used

### NBA
| Table | Purpose |
|-------|---------|
| `BasketMatchupsGame` | Today's games / available teams |
| `BasketMatchupsPlayers` | Team rosters with lineup status |
| `BasketGameLogs` | Raw per-game stat lines |
| `BasketPlayerAliases` | Name resolution (GameLogs ↔ Display) |

### WNBA
| Table | Purpose |
|-------|---------|
| `WBasketMatchupsPlayers` | Today's games **and** rosters, in one table |
| `WNBAGameLogs` | Raw per-game stat lines |

Only two tables. There is no separate game table and no alias table:

- **Slate** — the `Matchup ID` column holds `DAL@POR|10:00 PM ET`, and the `Team`
  column gives the teams playing, so the slate is derived from the roster rows.
  The whole table is fetched once per load and `fetchRoster` just slices the cache.
- **Names** — `WBasketMatchupsPlayers.Player` and `WNBAGameLogs."Player Name"`
  use identical spellings ("Paige Bueckers" in both), so no comma-flip or alias
  lookup is needed. A normalized fallback match is in place as a safety net.
- **Team codes** — identical across both tables (`DAL`, `POR`, `GSV`…), so
  there is no abbreviation mapper like the NBA's `GS` ↔ `GSW`.
- The `Stats JSON` column is a multi-kilobyte blob per row that this tool never
  reads, so it is excluded from the select.

### MLB
| Table | Purpose |
|-------|---------|
| `BaseballMatchupsGame` | Today's slate + game times (doubleheaders tagged "(Game N)") |
| `BaseballLineups` | Posted lineups (confirmed / projected) |
| `BaseballRosters` | Full rosters |
| `BaseballGameLogs` | Raw per-game stat lines |

### NHL
| Table | Purpose |
|-------|---------|
| `HockeyMatchupsGame` | Today's games / available teams |
| `HockeyMatchupsSkater` | Team rosters with injury status inline |
| `HockeyGameLogsSkater` | Raw per-game stat lines |
| `HockeyNormalNames` | Name resolution (CanonicalName ↔ GameLogName) |

## Available Condition Types

### NBA / WNBA

**Scopes:** All Games, Starts, Off Bench, Does Not Play

**Numeric Props** (≥ or <):
Points, Rebounds, Assists, 3-Pointers, Steals, Blocks, Turnovers,
Pts + Asts, Pts + Rebs, Pts + Rebs + Asts, Rebs + Asts, Blks + Stls

**Binary Props** (Yes / No):
Double-Double, Triple-Double

The two leagues use different game-log column names for the same props:

| Prop | NBA column | WNBA column |
|------|-----------|-------------|
| Rebounds | `TRB` | `REB` |
| 3-Pointers | `3P` | `FG3M` |
| Turnovers | `TO` | `TOV` |
| Pts + Rebs | `PR` | `P+R` |
| Pts + Asts | `PA` | `P+A` |
| Rebs + Asts | `RA` | `R+A` |
| Pts + Rebs + Asts | `PRA` | `P+R+A` |
| Blks + Stls | `SB` | `B+S` |

**WNBA roster / injury handling:**
- `Role` is `Starter`, `Bench` or `Not Playing`
- `Not Playing` (or an `OUT` / `OFS` tag) puts the player in the "Injured / Out"
  group and locks her to Does Not Play — same behaviour as an NBA `Injury` lineup value
- The `Tag` value is appended to her name in the dropdown, e.g. `Alanna Smith (OUT)`
- Any other tag still gets the full prop menu, with the tag shown next to her name

### NHL

**Scopes:** All Games, Does Not Play

**Numeric Props** (≥ or <):
Points, Goals, Assists, Power Play Goals, Blocked Shots, Shots on Goal

### MLB

**Scopes:** Plays, Does Not Play

**Numeric Props** (≥ or <):
Hits, Total Bases, Home Runs, RBIs, Runs, Stolen Bases, Walks, Strikeouts,
Singles, Doubles, Triples, Hits + Runs + RBIs

## Implementation Notes

**Never build an explicit `select=` list against the WNBA game logs.** The combo
columns are named `P+R`, `P+A`, `R+A`, `P+R+A` and `B+S`, and a literal `+` in a
query string decodes to a space — `select=P+R` asks the server for a column named
`P R` and comes back empty. `fetchWNBAGameLogs` uses `select=*` for this reason,
same as the hockey and MLB adapters. Columns with spaces (`Matchup ID`,
`Player Name`, `Starter/Bench`) need double-quoting instead; see `pgSelect()` in
`wnba/dataService.js`.

**WNBA dates are `YYYY-MM-DD`.** They are parsed as *local* dates, because
`new Date("2026-05-08")` parses as UTC midnight and slides back a day in US
timezones — which would shift games in and out of the last-30-day window.
Set keys stay as `YYYY-MM-DD`; the qualifying-dates list is formatted to
`M/D/YYYY` on output to match the NBA display.

**Denominators.** All sports share the same four-phase engine: each condition's
scoped dates are intersected into one combined eligible pool, which is then used
as the denominator for both the combined rate and every individual rate. This is
why an individual condition can show a smaller sample than that player's own game
count — she is only measured over games where *every* leg was possible.

## Webflow Setup

### 1. HTML Embed

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
├── wnba/
│   ├── config.js                # WNBA teams, props, scope options
│   ├── dataService.js           # WNBA Supabase API calls
│   └── parlayEngine.js          # WNBA condition evaluation + intersection
├── hockey/
│   ├── config.js                # NHL teams, props, scope options
│   ├── dataService.js           # NHL Supabase API calls
│   ├── parlayEngine.js          # NHL condition evaluation + intersection
│   └── nameResolver.js          # NHL player name resolution
├── mlb/
│   ├── config.js                # MLB teams, batter props, scope options
│   ├── dataService.js           # MLB Supabase API calls
│   └── parlayEngine.js          # MLB condition evaluation + intersection
├── utils/
│   ├── nameResolver.js          # NBA player name alias + comma-flip logic
│   └── teamMapper.js            # NBA 2-letter ↔ 3-letter abbreviations
├── styles/
│   └── styles.js                # Injected CSS (teal accent on dark purple)
└── README.md
```

Note: the WNBA adapter has no `nameResolver.js` — names match the game logs exactly.

## Debugging

Access via browser console:

```javascript
window.stcDebug.getState()           // Full app state
window.stcDebug.getRoster()          // Current team's roster
window.stcDebug.getConditions()      // Current condition rows
window.stcDebug.getResults()         // Last check results
window.stcDebug.getActiveSport()     // 'nba' | 'wnba' | 'nhl' | 'mlb'
window.stcDebug.getSportVisibility() // { nba, wnba, nhl, mlb }
```

## Design

- **Accent color**: Teal (#06b6d4) — sport-neutral for a cross-sport tool
- **Background**: Designed for dark purple website background
- **Sport tabs**: Pill-style toggle at top, only shown when multiple sports are visible
- **Responsive**: Mobile-friendly with stacked layouts on small screens
- WNBA reuses the NBA styling and the shared results renderer verbatim — no new CSS
