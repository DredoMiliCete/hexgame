// Hex geometry. Tiles use (x,y) like maps.csv. Directions follow rules.csv:
// UP(0,-1) UP_RIGHT(+1,0) UP_LEFT(-1,-1) DOWN(0,+1) DOWN_RIGHT(+1,+1) DOWN_LEFT(-1,0)
export const DIRS = {
  UP: [0, -1], UP_RIGHT: [1, 0], DOWN_RIGHT: [1, 1],
  DOWN: [0, 1], DOWN_LEFT: [-1, 0], UP_LEFT: [-1, -1],
};
export const DIR_LIST = Object.keys(DIRS);
export const DIR_LABEL = {
  UP: '↑ Up', UP_RIGHT: '↗ Up-right', DOWN_RIGHT: '↘ Down-right',
  DOWN: '↓ Down', DOWN_LEFT: '↙ Down-left', UP_LEFT: '↖ Up-left',
};
export const OPP = { UP: 'DOWN', DOWN: 'UP', UP_RIGHT: 'DOWN_LEFT', DOWN_LEFT: 'UP_RIGHT', DOWN_RIGHT: 'UP_LEFT', UP_LEFT: 'DOWN_RIGHT' };
export const key = (x, y) => x + ',' + y;
export const step = (x, y, d, n = 1) => [x + DIRS[d][0] * n, y + DIRS[d][1] * n];
export function hexDist(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dy > 0 ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx) + Math.abs(dy);
}
// Direction (name) from a to b if they are on a straight line, else null.
export function dirBetween(a, b) {
  for (const d of DIR_LIST) {
    for (let i = 1; i <= 14; i++) {
      const [x, y] = step(a.x, a.y, d, i);
      if (x === b.x && y === b.y) return d;
    }
  }
  return null;
}
// flat-top hexes: x is the column, screen-y = y - x/2
export function toPixel(x, y, s) {
  return [s * 1.5 * x, Math.sqrt(3) * s * (y - x / 2)];
}
