# Hex board game - playtest table

Two-player, one-screen (hot-seat) simulator for your board game. Plain HTML/JS, no build step, no dependencies.

## Run it
Browsers block ES modules from `file://`, so serve the folder:
- Windows: double-click `run.bat`  - Mac/Linux: `./run.sh`  (needs Python 3), then open http://localhost:8000
- or any static server, e.g. `npx serve`

## Menu
Draft mode (1-2-2-2-2-2-2-1 picks, starting player picks first) - Constructed mode (7 heroes each, repeats allowed across teams)
- Compbuilder (save team compositions; "Interrail Comp" is built in and read-only - duplicate it to edit)
- Hero abilities panel (tokens created by a hero are linked from its page)
- Map maker (create, edit and delete maps - see below)
- Options: maximum map size, **Editable Heroes** (off by default), and **Reset game cache**.
Compositions are stored in the browser (localStorage), so they belong to the address you use (keep using http://localhost:8000).

## Map maker
Menu -> Map maker. The list shows every map (the 5 built-in ones and yours) with a preview: **New map**, **Edit**, and **Delete** (custom maps only).
- Pick a tile in the palette and click the board; for plain tiles you can also click-and-drag to paint. **Void (erase)** removes a tile. Undo (button or Ctrl+Z) steps back one action (a drag is one action).
- **Teleports (Blu/Red):** after clicking the board you must connect the teleport to another teleport/anchor *of its own colour*: click one of the highlighted existing tiles, or create a new Teleport/Anchor (a new teleport links back to the first one). Cancelling places nothing.
- **High Ground:** you must pick its direction (the arrow is drawn on the tile, in the editor and in the game).
- **Saving** needs a name and at least 7 Blu Spawn and 7 Red Spawn tiles (counters + the reason are shown next to the Save button). Saved maps show up in Draft/Constructed mode as "(custom)".
- Built-in maps are read-only: opening one gives you a copy ("<name> copy") that you save under a new name. Changing the name of one of your own maps and saving creates a copy; the original stays.
- Erasing/replacing a tile that teleports point at also removes the teleports that would be left dangling (it asks first; Undo brings them back).
- **Size:** the board is 13x13 by default (coordinates 0,0 to 12,12). Options -> maximum map size raises it (up to 30). A map bigger than the limit keeps its own size when edited.
- Wood Box (WB) and Steel Box (SB) tiles are in the Terrain group.
- Custom maps and the option are stored in the browser (localStorage), so - like compositions - they belong to the address you use (keep using http://localhost:8000).

## Options
- **Maximum map size** for the map maker (default 13).
- **Editable Heroes** (off by default): in *Hero abilities*, each hero gets HP / Move / Attack / Reach / AP inputs (**Save stats**, **Reset to CSV**). Edits are used by draft, constructed mode and the game while the option is on; turning it off goes back to roster.csv (the edits are kept).
- **Reset game cache**: removes all custom compositions, custom maps, edited hero stats and the loaded-image cache (images are fetched again from `assets/`). The options themselves are kept.

## Tiles and territory
`data/tiles.csv` has a *territory of* column: BLU, RED, NONE or ADJACENT (Money Point, High Ground, Heal Tile). An ADJACENT tile takes the territory that most of its 6 neighbours have (fellow ADJACENT tiles count as none, a tie = none). `ADJ_NONE_COMPETES` in `js/config.js` chooses whether neutral neighbours (walls, middle tiles) also compete in that count (default: no).
Wood Box / Steel Box: act as walls, are not barriers, can be attacked (1 / 3 HP) and become a normal tile (Blu Normal, Red Normal or Middle by the neighbours' territory) when destroyed. Sailor's random attacks never target boxes (they only pick entities).

## Images
Drop PNGs into `assets/heroes`, `assets/tokens`, `assets/tiles` - see `assets/README.txt` for the exact file names.

## Changing data
`data/*.csv` are your files. After editing them run `python tools/build_data.py` to regenerate `js/data.js`.
Hero colour identities are placeholders in `js/colors.js`. Constants (respawn time, win conditions, AP per turn, ...) are in `js/config.js`.

## Code map
- `js/engine.js` rules (no DOM). All player decisions go through an `io` object (`pickTile`, `choose`, `roll`, `pickHeroes`, `command`, `hotseat`) -
  this is the seam for the future two-window / two-PC mode: run the engine in one place and forward `io` calls to the right client.
- `js/abilities.js` the 16 implemented heroes (+ tokens)  - `js/ui.js` board, HUD, io implementation  - `js/main.js` menus/draft
- `js/maps.js` map registry (built-in + custom), save rules (`validateMap`)  - `js/mapedit.js` editing model (teleport rules, undo)  - `js/mapmaker.js` map maker screens  - `js/options.js` options
- `tests/sim.js` random bot games, `tests/rules.js` rule checks, `tests/maps.js` map maker checks (`node tests/...`, or `npm test`), `tests/ui-smoke.mjs`, `tests/ui-maps.mjs` and `tests/ui-options.mjs` jsdom UI runs (dev only, need `npm i jsdom`; point `JSDOM_FROM` at the folder that has it)

## Interpretations worth double-checking
- Respawn time is not in rules.csv: `RESPAWN_BASE = 2` rounds (VIP: 1). A hero dying in round N returns at the end of round N+1.
- Gathering is a simple list: pick up to 3 untapped heroes; heroes gathered last round are skipped (and untapped). Driver is forced after 2 rounds.
- "Pass round": the player who presses it forgoes all their remaining turns and AP this round; the other player keeps taking turns until their AP run out.
- An entity cannot use the same action twice in one turn (it can again in a later turn of the round). Pregame movement treats Control Points as walls.
- Acorn Rattle triggers only when an entity performs a move (normal Move, Income's free move, Cat's free move) - not on Tentacle Grab, Mix and Match, etc. Diamonds are Unbreakable is optional.
- Free actions (0 AP) do not count toward the 2 AP per turn; the first turn of the round's first player ends after ANY single action.
- "Within reach" for non-attack abilities uses the attack line rules (straight line, walls and enemy entities block, smoke does not).
- Placement has an "Autoplace remaining heroes" button (VIP choice stays manual).
- Hidden information: heroes are placed face down behind a "look away" screen; Squeak's Ratio switch also uses it. "Show Rat identities" reveals the real Rat.
- Cat appears (Paw Pal) when heroes are revealed, not while they are still face down.
- Teleport tiles are one-way adjacent to their target coordinate; forced moves never trigger "performs a move" effects (Acorn Rattle).
- HG/HT tiles have basic support in the engine; no built-in map uses them, but the Map maker can place them.
- Sailor: *Cheers* lasts until the end of the round if unused; Metal Leg picks a random adjacent enemy entity (all his attacks are random).
- Cigar: *Lung Resist* protects against stuns (and other effects that tap him) but not against being gathered; the 1 damage at the end of every round has no killer.
- Monkey: *Kick Punch Special* lifts the "same action once per turn" rule for his attacks only.
- Clark's *I Found a Place* uses barrier tiles (Wall and Void); boxes are not barriers.
- Not implemented: JoniClan, Manucss, Pombo, Sonecas (shown locked), and online play.
