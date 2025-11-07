const store = new Map();

const MAX_ATTEMPTS = parseInt(process.env.AUTH_MAX_ATTEMPTS || '5', 10);
const WINDOW_MS = parseInt(process.env.AUTH_WINDOW_MS || String(3 * 60 * 1000), 10); 
const LOCKOUT_MS = parseInt(process.env.AUTH_LOCKOUT_MS || String(3 * 60 * 1000), 10); 


function now() { return Date.now(); }

function canAttempt(key) {
  const rec = store.get(key);
  if (!rec) return true;
  if (rec.lockedUntil && rec.lockedUntil > now()) return false;
  if (rec.firstAttemptAt + WINDOW_MS < now()) {
    store.delete(key);
    return true;
  }
  return true;
}

function recordFailure(key) {
  const t = now();
  const rec = store.get(key);
  if (!rec) {
    store.set(key, { count: 1, firstAttemptAt: t, lockedUntil: 0 });
    return;
  }
  if (rec.firstAttemptAt + WINDOW_MS < t) {
    store.set(key, { count: 1, firstAttemptAt: t, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = t + LOCKOUT_MS;
  }
  store.set(key, rec);
}

function recordSuccess(key) {
  store.delete(key);
}

function remainingLockMs(key) {
  const rec = store.get(key);
  if (!rec || !rec.lockedUntil) return 0;
  const rem = rec.lockedUntil - now();
  return rem > 0 ? rem : 0;
}

module.exports = { canAttempt, recordFailure, recordSuccess, remainingLockMs };
