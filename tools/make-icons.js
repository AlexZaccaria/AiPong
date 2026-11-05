// Draws the app icons from the logo's geometry (the same shapes as web/favicon.svg) and writes them
// as PNG into web/icons/. No dependencies: shapes are sampled 4×4 per pixel and the PNG is encoded
// with node:zlib. `npm run icons` regenerates them byte for byte.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const out = fileURLToPath(new URL('../web/icons/', import.meta.url));

const INK = [11, 11, 11];
const PAGE = [252, 252, 251];
const BALL = [235, 104, 52];

// The logo on its 32-unit grid: two paddles and the ball.
const MARKS = [
  { kind: 'rect', x: 6.5, y: 7.5, w: 3, h: 11, r: 1.5, color: PAGE },
  { kind: 'rect', x: 22.5, y: 13.5, w: 3, h: 11, r: 1.5, color: PAGE },
  { kind: 'circle', cx: 16, cy: 13, r: 2.75, color: BALL },
];

function insideRoundRect(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return dx * dx + dy * dy <= r * r;
}

const inside = (px, py, shape) =>
  shape.kind === 'circle' ? (px - shape.cx) ** 2 + (py - shape.cy) ** 2 <= shape.r ** 2 : insideRoundRect(px, py, shape);

/**
 * One icon, `size` pixels square. `tile` is the dark rounded square behind the marks: with
 * `fullBleed` it fills the whole image (maskable and Apple icons, cut by the system), otherwise it
 * has rounded corners on a transparent background. `scale` shrinks the marks around the centre.
 */
function draw(size, { fullBleed, scale }) {
  const tile = { kind: 'rect', x: 0, y: 0, w: 32, h: 32, r: fullBleed ? 0 : 8, color: INK };
  const marks = MARKS.map((m) =>
    m.kind === 'circle'
      ? { ...m, cx: 16 + (m.cx - 16) * scale, cy: 16 + (m.cy - 16) * scale, r: m.r * scale }
      : { ...m, x: 16 + (m.x - 16) * scale, y: 16 + (m.y - 16) * scale, w: m.w * scale, h: m.h * scale, r: m.r * scale },
  );
  const rgba = Buffer.alloc(size * size * 4);
  const step = 32 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const x = (px + (sx + 0.5) / 4) * step;
          const y = (py + (sy + 0.5) / 4) * step;
          if (!inside(x, y, tile)) continue;
          const color = marks.find((m) => inside(x, y, m))?.color ?? INK;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / 16) * 255);
    }
  }
  return png(size, rgba);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(6, 9); // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Maskable icons are cropped to a circle of 80% of their width: the marks are scaled to stay in it.
const ICONS = [
  ['icon-192.png', 192, { fullBleed: false, scale: 1 }],
  ['icon-512.png', 512, { fullBleed: false, scale: 1 }],
  ['icon-maskable-512.png', 512, { fullBleed: true, scale: 0.8 }],
  ['apple-touch-icon.png', 180, { fullBleed: true, scale: 0.9 }],
];

mkdirSync(out, { recursive: true });
for (const [name, size, options] of ICONS) {
  writeFileSync(join(out, name), draw(size, options));
  console.log(`web/icons/${name} (${size}×${size})`);
}
