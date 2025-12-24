// src/core/workModel.ts
// Kanonische Definitionen für Wochenmodell (Mo–Fr)

export type WochenTag = "mo" | "di" | "mi" | "do" | "fr";

export const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

export type ModellTag = {
  // Soll-Arbeitszeit in Minuten (>= 0)
  sollMinuten: number;
  // Urlaubswert (0..1) pro Tag
  urlaubswert: number;
};

export type WochenModell = {
  tage: Record<WochenTag, ModellTag>;
};

export const DEFAULT_WOCHENMODELL: WochenModell = {
  tage: {
    mo: { sollMinuten: 8 * 60, urlaubswert: 1 },
    di: { sollMinuten: 8 * 60, urlaubswert: 1 },
    mi: { sollMinuten: 8 * 60, urlaubswert: 1 },
    do: { sollMinuten: 8 * 60, urlaubswert: 1 },
    fr: { sollMinuten: 6 * 60, urlaubswert: 1 },
  },
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ISO (YYYY-MM-DD) -> WochenTag (Mo–Fr) oder null (Sa/So)
export function isoDateToWochenTag(isoDate: string): WochenTag | null {
  const d = new Date(isoDate + "T00:00:00");
  const js = d.getDay(); // 0=So, 1=Mo, ... 6=Sa
  const map: Record<number, WochenTag> = { 1: "mo", 2: "di", 3: "mi", 4: "do", 5: "fr" };
  return map[js] ?? null;
}

// WochenTag -> ISO (YYYY-MM-DD) für eine gegebene Wochen-Montag-ISO
export function wochenTagToIsoDate(weekMondayIso: string, tag: WochenTag): string {
  const base = new Date(weekMondayIso + "T00:00:00");
  const idx = WOCHENTAGE.indexOf(tag);
  const d = new Date(base);
  d.setDate(d.getDate() + Math.max(0, idx));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function sollMinutenForIsoDate(modell: WochenModell, isoDate: string): number {
  const t = isoDateToWochenTag(isoDate);
  if (!t) return 0;
  return modell.tage[t]?.sollMinuten ?? 0;
}

export function urlaubswertForIsoDate(modell: WochenModell, isoDate: string): number {
  const t = isoDateToWochenTag(isoDate);
  if (!t) return 0;
  return modell.tage[t]?.urlaubswert ?? 0;
}
