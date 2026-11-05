import assert from 'node:assert/strict';
import { it } from 'node:test';
import { en } from '../web/js/i18n/en.js';
import { it as italian } from '../web/js/i18n/it.js';

/** Every key with the kind of its value: a missing translation shows up as a difference. */
function shape(value, path = '') {
  if (Array.isArray(value)) return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  return [`${path}:${typeof value}`];
}

it('has the same texts in Italian and English', () => {
  assert.deepEqual(shape(en), shape(italian));
});

it('uses only icons the icon set has', async () => {
  const { ICONS } = await import('../web/js/ui/icon-paths.js');
  for (const dict of [italian, en]) {
    const icons = [...dict.about.what, ...dict.about.stack, ...dict.about.choices].map((x) => x.icon);
    for (const name of icons) assert.ok(name in ICONS, `missing icon ${name}`);
  }
});
