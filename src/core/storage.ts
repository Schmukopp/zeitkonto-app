// src/core/storage.ts

export type IsoDate = string; // "YYYY-MM-DD"

export type Mitarbeiter = {
  id: string;
  name: string;
  geburtsdatum?: IsoDate;
  arbeitszeitmodell?: string;
  urlaub_gesamt?: number;
  urlaub_verbraucht?: number;
  ueberstundenkonto?: number;
};

export type Projekt = {
  id: string;
  name: string;
  verantwortlicherMitarbeiterId: string;
  geplantesStartDatum?: IsoDate;
  kalkulierteStunden: number;
  farbe?: string;
};

export type Buchung = {
  id: string;
  mitarbeiterId: string;
  projektId: string;
  datum: IsoDate;
  stunden: number;
  bereich?: "maschine" | "bank" | "lack" | "montage";
};

const KEYS = {
  mitarbeiter: "mitarbeiter",
  projekte: "projekte",
  buchungen: "buchungen",
} as const;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function loadMitarbeiter(): Mitarbeiter[] {
  return safeArray<Mitarbeiter>(safeParse<any>(localStorage.getItem(KEYS.mitarbeiter)));
}

export function saveMitarbeiter(list: Mitarbeiter[]) {
  localStorage.setItem(KEYS.mitarbeiter, JSON.stringify(list));
}

export function loadProjekte(): Projekt[] {
  return safeArray<Projekt>(safeParse<any>(localStorage.getItem(KEYS.projekte)));
}

export function saveProjekte(list: Projekt[]) {
  localStorage.setItem(KEYS.projekte, JSON.stringify(list));
}

export function loadBuchungen(): Buchung[] {
  return safeArray<Buchung>(safeParse<any>(localStorage.getItem(KEYS.buchungen)));
}

export function saveBuchungen(list: Buchung[]) {
  localStorage.setItem(KEYS.buchungen, JSON.stringify(list));
}

// Kleine Hilfen (reproduzierbar, ohne Libs)
export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function todayIso(): IsoDate {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
