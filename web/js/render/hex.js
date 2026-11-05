// The hexagonal floor of the arena, in field units: the cached layer draws it, the effects light
// its cells up. Rows are `ROW` apart and every odd row is shifted by half a cell.

export const HEX = Object.freeze({ size: 5, width: 5 * Math.sqrt(3), row: 7.5 });

export function hexCenter(row, col) {
  return { x: col * HEX.width + (row & 1 ? HEX.width / 2 : 0), y: row * HEX.row };
}

/** The cell whose centre is nearest to (x, y): its key and centre. */
export function hexAt(x, y) {
  const middle = Math.round(y / HEX.row);
  let best = null;
  for (let row = middle - 1; row <= middle + 1; row++) {
    const col = Math.round((x - (row & 1 ? HEX.width / 2 : 0)) / HEX.width);
    const c = hexCenter(row, col);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (!best || d < best.d) best = { key: `${row},${col}`, x: c.x, y: c.y, d };
  }
  return best;
}

/** Adds a pointy-top hexagon around (x, y) to the current path. */
export function hexPath(ctx, x, y, size) {
  ctx.moveTo(x + size * Math.cos(Math.PI / 6), y + size * Math.sin(Math.PI / 6));
  for (let i = 1; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a));
  }
  ctx.closePath();
}
