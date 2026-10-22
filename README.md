# Hex board game - playtest table

Two-player, one-screen (hot-seat) simulator for your board game. Plain HTML/JS, no build step, no dependencies.

## Run it
Browsers block ES modules from `file://`, so serve the folder:
- Windows: double-click `run.bat`  - Mac/Linux: `./run.sh`  (needs Python 3), then open http://localhost:8000
- or any static server, e.g. `npx serve`

## Menu
Draft mode (1-2-2-2-2-2-2-1 picks, starting player picks first) - Constructed mode (7 heroes each, repeats allowed across teams)
- Compbuilder (save team compositions; "Interrail Comp" is built in and read-only - duplicate it to edit)
- Hero abilities panel (tokens created by a hero are linked from its page) - Map creator (coming soon).
Compositions are stored in the browser (localStorage), so they belong to the address you use (keep using http://localhost:8000).

## Images
Drop PNGs into `assets/heroes`, `assets/tokens`, `assets/tiles` - see `assets/README.txt` for the exact file names.

## Changing data
`data/*.csv` are your files. After editing them run `python tools/build_data.py` to regenerate `js/data.js`.
Hero colour identities are placeholders in `js/colors.js`. Constants (respawn time, win conditions, AP per turn, ...) are in `js/config.js`.

## Code map
- `js/engine.js` rules (no DOM). All player decisions go through an `io` object (`pickTile`, `choose`, `roll`, `pickHeroes`, `command`, `hotseat`) -
  this is the seam for the future two-window / two-PC mode: run the engine in one place and forward `io` calls to the right client.
- `js/abilities.js` the 16 implemented heroes (+ tokens)  - `js/ui.js` board, HUD, io implementation  - `js/main.js` menus/draft
- `tests/sim.js` random bot games, `tests/rules.js` rule checks (`node tests/...`), `tests/ui-smoke.mjs` jsdom UI run (dev only)

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
- HG/HT tiles have basic support in the engine, but no map uses them yet.
- Not implemented: JoniClan, Manucss, Pombo, Sonecas (shown locked), the map creator, and online play.
