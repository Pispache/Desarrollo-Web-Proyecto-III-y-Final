/**
 * Utilidades seguras para acceso a localStorage evitando lanzar excepciones.
 */

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readLocalNumber(key: string): number | null {
  const raw = readLocal(key);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function readLocalBool(key: string): boolean | null {
  const raw = readLocal(key);
  if (raw == null) return null;
  return raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : null;
}
