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

function cloneWochenModell(m: WochenModell): WochenModell {
  // defensive deep clone (klein und explizit)
  return {
    tage: {
      mo: { sollMinuten: m.tage.mo.sollMinuten, urlaubswert: m.tage.mo.urlaubswert },
      di: { sollMinuten: m.tage.di.sollMinuten, urlaubswert: m.tage.di.urlaubswert },
      mi: { sollMinuten: m.tage.mi.sollMinuten, urlaubswert: m.tage.mi.urlaubswert },
      do: { sollMinuten: m.tage.do.sollMinuten, urlaubswert: m.tage.do.urlaubswert },
      fr: { sollMinuten: m.tage.fr.sollMinuten, urlaubswert: m.tage.fr.urlaubswert },
    },
  };
}

function normalizeGeburtsdatum(v: unknown): string {
  const s = (typeof v === "string" ? v : "").trim();
  // Minimal: leer -> default. (Kein Hard-Blocking, nur Stabilität.)
  return s || "1990-01-01";
}

function normalizeMitarbeiter(raw: any): Mitarbeiter {
  const id = (typeof raw?.id === "string" && raw.id.trim()) ? raw.id.trim() : `m${Date.now().toString(16)}`;
  const name = (typeof raw?.name === "string" ? raw.name : "").trim() || "Ohne Name";

  const urlaubGesamt = clamp(Number(raw?.urlaubstageGesamt) || 0, 0, 999);
  const urlaubVerb = clamp(Number(raw?.urlaubstageVerbraucht) || 0, 0, urlaubGesamt); // <= gesamt

  const ueber = Number(raw?.ueberstundenSaldo);
  const ueberFix = Number.isFinite(ueber) ? clamp(ueber, -9999, 9999) : 0;

  const srcModell = raw?.modell?.tage ? raw.modell : DEFAULT_WOCHENMODELL;

  // modell defensiv lesen + clamp
  const modell: WochenModell = {
    tage: {
      mo: {
        sollMinuten: clamp(Number(srcModell?.tage?.mo?.sollMinuten) || 0, 0, 12 * 60),
        urlaubswert: clamp(Number(srcModell?.tage?.mo?.urlaubswert) || 0, 0, 1),
      },
      di: {
        sollMinuten: clamp(Number(srcModell?.tage?.di?.sollMinuten) || 0, 0, 12 * 60),
        urlaubswert: clamp(Number(srcModell?.tage?.di?.urlaubswert) || 0, 0, 1),
      },
      mi: {
        sollMinuten: clamp(Number(srcModell?.tage?.mi?.sollMinuten) || 0, 0, 12 * 60),
        urlaubswert: clamp(Number(srcModell?.tage?.mi?.urlaubswert) || 0, 0, 1),
      },
      do: {
        sollMinuten: clamp(Number(srcModell?.tage?.do?.sollMinuten) || 0, 0, 12 * 60),
        urlaubswert: clamp(Number(srcModell?.tage?.do?.urlaubswert) || 0, 0, 1),
      },
      fr: {
        sollMinuten: clamp(Number(srcModell?.tage?.fr?.sollMinuten) || 0, 0, 12 * 60),
        urlaubswert: clamp(Number(srcModell?.tage?.fr?.urlaubswert) || 0, 0, 1),
      },
    },
  };

  return {
    id,
    name,
    geburtsdatum: normalizeGeburtsdatum(raw?.geburtsdatum),
    modell,
    urlaubstageGesamt: urlaubGesamt,
    urlaubstageVerbraucht: urlaubVerb,
    ueberstundenSaldo: ueberFix,
  };
}

function normalizeState(raw: any): MitarbeiterState {
  const listRaw = Array.isArray(raw?.mitarbeiter) ? raw.mitarbeiter : [];
  const list = listRaw.map(normalizeMitarbeiter);

  // selectedId nur akzeptieren, wenn vorhanden
  const selRaw = typeof raw?.selectedId === "string" ? raw.selectedId : null;
  const selOk = selRaw && list.some((m) => m.id === selRaw) ? selRaw : (list[0]?.id ?? null);

  // Wenn komplett leer: seed erzeugen
  if (list.length === 0) {
    const seed = defaultMitarbeiter("m1", "Mitarbeiter");
    return { selectedId: seed.id, mitarbeiter: [seed] };
  }

  return { selectedId: selOk, mitarbeiter: list };
}

export function defaultMitarbeiter(id = "m1", name = "Mitarbeiter"): Mitarbeiter {
  return {
    id,
    name,
    geburtsdatum: "1990-01-01",
    modell: cloneWochenModell(DEFAULT_WOCHENMODELL),
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
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
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
  const ok = id && s.mitarbeiter.some((m) => m.id === id) ? id : (s.mitarbeiter[0]?.id ?? null);
  return { ...s, selectedId: ok };
}

export function calcUrlaubUebrig(m: Mitarbeiter): number {
  const u = clamp(m.urlaubstageGesamt, 0, 999) - clamp(m.urlaubstageVerbraucht, 0, m.urlaubstageGesamt);
  return Math.max(0, Math.round(u * 100) / 100);
}

export function upsertMitarbeiter(s: MitarbeiterState, patch: Mitarbeiter): MitarbeiterState {
  const fixed = normalizeMitarbeiter(patch);

  const idx = s.mitarbeiter.findIndex((m) => m.id === fixed.id);
  const nextList = idx >= 0 ? s.mitarbeiter.map((m) => (m.id === fixed.id ? fixed : m)) : [...s.mitarbeiter, fixed];

  const nextSelected = s.selectedId ?? fixed.id;
  const selectedOk = nextList.some((m) => m.id === nextSelected) ? nextSelected : (nextList[0]?.id ?? null);

  return { selectedId: selectedOk, mitarbeiter: nextList };
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
