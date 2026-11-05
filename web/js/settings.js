import { DEFAULT_SETTINGS, DIFFICULTY_IDS, TARGETS } from './game/config.js';

/** Stored match settings, falling back to the defaults for anything unknown. */
export function parseSettings(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    difficulty: DIFFICULTY_IDS.includes(v.difficulty) ? v.difficulty : DEFAULT_SETTINGS.difficulty,
    target: TARGETS.includes(v.target) ? v.target : DEFAULT_SETTINGS.target,
  };
}
