// src/core/mitarbeiterStore.ts
import type { WochenModell } from "./workModel";
import { DEFAULT_WOCHENMODELL } from "./workModel";

export type Mitarbeiter = {
  id: string;
  name: string;
  geburtsdatum: string; // YYYY-MM-DD
  modell: WochenModell;

  urlaubstageGesamt: number;
  urlaubstageVerbraucht: number;

  // Überstundenkonto (Stunden)
  ueberstundenSaldo: number;
};

export type MitarbeiterState = {
  selectedId: string | null;
  mitarbeiter: Mitarbeiter[];
};

const LS_KEY = "zeitkonto.mitarbeiter.v1";

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function defaultMitarbeiter(id = "m1", name = "Mitarbeiter"): Mitarbeiter {
  return {
    id,
    name,
    geburtsdatum: "1990-01-01",
    modell: DEFAULT_WOCHENMODELL,
    urlaubstageGesamt: 30,
    urlaubstageVerbraucht: 0,
    ueberstundenSaldo: 0,
  };
}

export function loadMitarbeiterState(): MitarbeiterState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const seed = defaultMitarbeiter("m1", "Mitarbeiter");
      return { selectedId: seed.id, mitarbeiter: [seed] };
    }
    const parsed = JSON.parse(raw) as MitarbeiterState;
    if (!parsed || !Array.isArray(parsed.mitarbeiter)) throw new Error("invalid");
    return parsed;
  } catch {
    const seed = defaultMitarbeiter("m1", "Mitarbeiter");
    return { selectedId: seed.id, mitarbeiter: [seed] };
  }
}

export function saveMitarbeiterState(s: MitarbeiterState) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export function getSelected(s: MitarbeiterState): Mitarbeiter | null {
  if (!s.selectedId) return null;
  return s.mitarbeiter.find((m) => m.id === s.selectedId) ?? null;
}

export function selectMitarbeiter(s: MitarbeiterState, id: string | null): MitarbeiterState {
  return { ...s, selectedId: id };
}

export function calcUrlaubUebrig(m: Mitarbeiter): number {
  const u = clamp(m.urlaubstageGesamt, 0, 999) - clamp(m.urlaubstageVerbraucht, 0, 999);
  return Math.max(0, Math.round(u * 100) / 100);
}

export function upsertMitarbeiter(s: MitarbeiterState, patch: Mitarbeiter): MitarbeiterState {
  const fixed: Mitarbeiter = {
    ...patch,
    name: (patch.name ?? "").trim() || "Ohne Name",
    geburtsdatum: patch.geburtsdatum || "1990-01-01",
    urlaubstageGesamt: clamp(patch.urlaubstageGesamt, 0, 999),
    urlaubstageVerbraucht: clamp(patch.urlaubstageVerbraucht, 0, 999),
    ueberstundenSaldo: Number.isFinite(patch.ueberstundenSaldo) ? patch.ueberstundenSaldo : 0,
    modell: {
      tage: {
        mo: { sollMinuten: clamp(patch.modell.tage.mo.sollMinuten, 0, 12 * 60), urlaubswert: clamp(patch.modell.tage.mo.urlaubswert, 0, 1) },
        di: { sollMinuten: clamp(patch.modell.tage.di.sollMinuten, 0, 12 * 60), urlaubswert: clamp(patch.modell.tage.di.urlaubswert, 0, 1) },
        mi: { sollMinuten: clamp(patch.modell.tage.mi.sollMinuten, 0, 12 * 60), urlaubswert: clamp(patch.modell.tage.mi.urlaubswert, 0, 1) },
        do: { sollMinuten: clamp(patch.modell.tage.do.sollMinuten, 0, 12 * 60), urlaubswert: clamp(patch.modell.tage.do.urlaubswert, 0, 1) },
        fr: { sollMinuten: clamp(patch.modell.tage.fr.sollMinuten, 0, 12 * 60), urlaubswert: clamp(patch.modell.tage.fr.urlaubswert, 0, 1) },
      },
    },
  };

  const idx = s.mitarbeiter.findIndex((m) => m.id === fixed.id);
  const nextList = idx >= 0 ? s.mitarbeiter.map((m) => (m.id === fixed.id ? fixed : m)) : [...s.mitarbeiter, fixed];
  const nextSelected = s.selectedId ?? fixed.id;
  return { selectedId: nextSelected, mitarbeiter: nextList };
}

export function createMitarbeiter(s: MitarbeiterState): MitarbeiterState {
  const id = `m${Date.now().toString(16)}`;
  const neu = defaultMitarbeiter(id, "Neuer Mitarbeiter");
  return { selectedId: neu.id, mitarbeiter: [...s.mitarbeiter, neu] };
}

export function deleteMitarbeiter(s: MitarbeiterState, id: string): MitarbeiterState {
  const next = s.mitarbeiter.filter((m) => m.id !== id);
  const nextSelected = s.selectedId === id ? (next[0]?.id ?? null) : s.selectedId;
  return { selectedId: nextSelected, mitarbeiter: next };
}
