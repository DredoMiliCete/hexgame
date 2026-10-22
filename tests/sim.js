// Headless random-bot simulation: node tests/sim.js [games]
import { Game } from '../js/engine.js';
import { HEROES, MAPS } from '../js/data.js';
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const impl = HEROES.filter((h) => h.implemented).map((h) => h.id);
const stats = { actions: {}, wins: {} };

function makeIO(getG) {
  let cmds = 0, lastRound = 0;
  return {
    log() {}, refresh() {}, gameOver() {},
    async hotseat() {},
    async pickTile(team, tiles, prompt, o = {}) { if (!tiles.length) throw new Error('empty pickTile: ' + prompt); return o.cancel && Math.random() < 0.1 ? null : rand(tiles); },
    async choose(team, prompt, opts, o = {}) { if (!opts.length) throw new Error('empty choose: ' + prompt); return o.cancel !== false && Math.random() < 0.1 ? null : rand(opts).value; },
    async roll() { return 1 + Math.floor(Math.random() * 6); },
    async pickHeroes(team, cand, max, forced) {
      const rest = shuffle(cand.filter((h) => !forced.includes(h.id))).slice(0, Math.max(0, Math.min(max, 1 + Math.floor(Math.random() * max)) - forced.length));
      return [...forced, ...rest.map((h) => h.id)];
    },
    async command(g) {
      if (g.round !== lastRound) { lastRound = g.round; cmds = 0; }
      if (g.round >= 14 || ++cmds > 120) { if (g.round >= 14) g.over = { team: 0, type: 'cap' }; return { type: 'pass' }; }
      const mine = g.ents.filter((e) => g.team(e) === g.turn.team && !e.dead && (e.x != null || e.holds != null));
      const opts = [];
      for (const e of mine) for (const d of g.actionDefs(e)) if (d.ok) opts.push({ e, d });
      if (!opts.length || Math.random() < 0.03) return { type: 'pass' };
      const c = rand(opts); stats.actions[c.d.key] = (stats.actions[c.d.key] || 0) + 1;
      return { type: 'do', entId: c.e.id, key: c.d.key };
    },
  };
}

const N = Number(process.argv[2] || 20);
for (let i = 0; i < N; i++) {
  const map = rand(Object.keys(MAPS));
  const teams = [shuffle(impl).slice(0, 7), shuffle(impl).slice(0, 7)];
  let g; const io = makeIO(() => g);
  g = new Game(map, teams, io, Math.floor(Math.random() * 2));
  try { await g.run(); stats.wins[g.over?.type] = (stats.wins[g.over?.type] || 0) + 1; }
  catch (err) { console.error(`GAME ${i} FAILED on ${map} round ${g.round}:`, err.stack); console.error(teams.map((t) => t.join(',')).join(' | ')); process.exit(1); }
}
console.log('OK', N, 'games', JSON.stringify(stats.wins));
console.log('actions exercised:', Object.keys(stats.actions).sort().join(' '));
