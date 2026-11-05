// localStorage that never throws: blocked storage (private windows, strict settings) just means
// nothing is remembered between visits.

export function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved; the game works the same.
  }
}

export function readJson(key) {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const writeJson = (key, value) => write(key, JSON.stringify(value));
