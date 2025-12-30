// src/core/planUtils.ts
// Kleine ISO-Kalenderwochen-Helfer (ohne libs, robust genug für Planung v1)

export function getIsoWeekYear(date = new Date()): { jahr: number; kw: number } {
  // ISO week date weeks start on Monday, so correct the day number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)

  // Set to nearest Thursday: current date + 4 - current day number
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  // year of the Thursday in question
  const jahr = d.getUTCFullYear();

  // first day of year
  const yearStart = new Date(Date.UTC(jahr, 0, 1));
  // calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return { jahr, kw: weekNo };
}

export function clampKW(kw: number): number {
  const n = Number(kw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(53, Math.round(n)));
}

export function clampYear(jahr: number): number {
  const n = Number(jahr);
  if (!Number.isFinite(n)) return new Date().getFullYear();
  return Math.max(2000, Math.min(2100, Math.round(n)));
}
