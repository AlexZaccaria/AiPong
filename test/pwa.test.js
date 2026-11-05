import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const read = (path) => readFileSync(join(web, path), 'utf-8');

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [relative(web, path).split(sep).join('/')];
  });
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path) {
  const bytes = readFileSync(join(web, path));
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${path} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('offline play', () => {
  it('caches every file of the site', () => {
    const sw = read('sw.js');
    const list = sw.slice(sw.indexOf('const FILES = ['), sw.indexOf('];', sw.indexOf('const FILES = [')));
    const cached = [...list.matchAll(/'([^']+)'/g)].map((m) => (m[1] === './' ? 'index.html' : m[1]));
    // The worker itself and the font licence are not part of the game.
    const site = filesIn(web).filter((path) => path !== 'sw.js' && path !== 'fonts/OFL.txt');
    assert.deepEqual([...cached].sort(), [...site].sort(), 'FILES in web/sw.js must list every file of web/');
  });

  it('registers the worker from the page', () => {
    assert.match(read('js/pwa.js'), /serviceWorker\.register\('sw\.js'\)/);
  });
});

describe('installation', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));

  it('has a manifest that works under any path', () => {
    for (const field of ['name', 'short_name', 'display', 'background_color', 'theme_color']) assert.ok(manifest[field], field);
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.match(read('index.html'), /<link rel="manifest" href="manifest\.webmanifest"/);
  });

  it('has icons of the sizes it declares, a maskable one included', () => {
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.deepEqual(pngSize(icon.src), [w, h], icon.src);
    }
    const sizes = manifest.icons.filter((i) => i.purpose === 'any').map((i) => i.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  });

  it('has an icon for the iPhone Home Screen', () => {
    assert.match(read('index.html'), /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
    assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
  });
});
