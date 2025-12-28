// src/core/timeStore.ts
import type { Buchung, Projekt, Bereich } from "./timeTypes";

const LS_KEY = "orgaboard_time_v1";

/**
 * Arbeitsart ist dein Projekt-SOLL-Splitting.
 * Zeitstrahlen.tsx importiert Arbeitsart aus timeStore -> export hier.
 */
export type Arbeitsart = "maschine" | "bank" | "lack" | "montage";

export type RunningTimer = {
  mitarbeiterId: string;
  projektId: string;
  bereich: Bereich;
  startTs: number;
  datum: string; // ✅ wichtig: Board-Fokus + Nachtragen
  note?: string;
};

export type BoardLayoutPos = { rowId: string; startCol: number };

export type State = {
  projects: Projekt[];
  buchungen: Buchung[];
  running: RunningTimer | null;
  boardLayout?: Record<string, BoardLayoutPos>;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function str(v: unknown, fallback = ""): string {
  const s = String(v ?? "");
  return s.trim() ? s : fallback;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeArbeitsarten(p: any): any {
  const aa = p?.arbeitsarten;
  if (!aa || typeof aa !== "object") return undefined;

  const out: Record<Arbeitsart, { kalkMinuten: number }> = {
    maschine: { kalkMinuten: 0 },
    bank: { kalkMinuten: 0 },
    lack: { kalkMinuten: 0 },
    montage: { kalkMinuten: 0 },
  };

  (["maschine", "bank", "lack", "montage"] as Arbeitsart[]).forEach((k) => {
    const v = aa?.[k]?.kalkMinuten;
    out[k] = { kalkMinuten: clamp(num(v) || 0, 0, 999999) };
  });

  return out;
}

export function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;

      const projects: Projekt[] = (parsed.projects ?? []).map((p: any) => {
        const fixed: any = {
          ...p,
          id: str(p?.id, uid()),
          name: str(p?.name, "Projekt"),
          active: p?.active !== false,

          kalkStunden: clamp(num(p?.kalkStunden) || 0, 0, 99999),

          kunde: p?.kunde != null ? str(p.kunde) : undefined,
          notiz: p?.notiz != null ? str(p.notiz) : undefined,

          hauptdarstellerId: p?.hauptdarstellerId != null ? str(p.hauptdarstellerId) : undefined,
          zugeordnetAnId: p?.zugeordnetAnId != null ? str(p.zugeordnetAnId) : undefined,

          arbeitsarten: normalizeArbeitsarten(p),

          planNettoVkEur: clamp(num(p?.planNettoVkEur) || 0, 0, 99999999),
          planMaterialEur: clamp(num(p?.planMaterialEur) || 0, 0, 99999999),

          istNettoVkEur: clamp(num(p?.istNettoVkEur) || 0, 0, 99999999),
          istMaterialEur: clamp(num(p?.istMaterialEur) || 0, 0, 99999999),
        };

        return fixed as Projekt;
      });

      const buchungen: Buchung[] = Array.isArray(parsed.buchungen) ? (parsed.buchungen as any) : [];

      let running: RunningTimer | null = (parsed.running as any) ?? null;
      if (running) {
        const fixed: RunningTimer = {
          mitarbeiterId: str((running as any).mitarbeiterId),
          projektId: str((running as any).projektId),
          bereich: (running as any).bereich as Bereich,
          startTs: num((running as any).startTs) || Date.now(),
          datum: str((running as any).datum, todayIso()),
          note: (running as any).note != null ? str((running as any).note) : undefined,
        };

        if (!fixed.mitarbeiterId || !fixed.projektId || !fixed.bereich) running = null;
        else running = fixed;
      }

      return {
        projects:
          projects.length > 0
            ? projects
            : ([
                { id: "p1", name: "Allgemein", active: true, kalkStunden: 0 },
                { id: "p2", name: "Projekt A", active: true, kalkStunden: 10 },
                { id: "p3", name: "Projekt B", active: true, kalkStunden: 20 },
              ] as any),
        buchungen,
        running,
        boardLayout: (parsed as any).boardLayout ?? undefined,
      };
    }
  } catch (err) {
    console.warn("loadState failed", err);
  }

  return {
    projects: [
      { id: "p1", name: "Allgemein", active: true, kalkStunden: 0 } as any,
      { id: "p2", name: "Projekt A", active: true, kalkStunden: 10 } as any,
      { id: "p3", name: "Projekt B", active: true, kalkStunden: 20 } as any,
    ],
    buchungen: [],
    running: null,
  };
}

export function saveState(s: State) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (err) {
    console.warn("saveState failed", err);
  }
}

export function ensureOneStatusPerDay(b: Buchung[], mitarbeiterId: string, datum: string) {
  return (b ?? []).filter(
    (x: any) =>
      !(
        x?.mitarbeiterId === mitarbeiterId &&
        x?.datum === datum &&
        (x?.art === "urlaub" || x?.art === "krank" || x?.art === "ueberstundenabbau")
      )
  ) as any;
}

// --- Timer ------------------------------------------------------------------

export function startTimer(
  s: State,
  args: { mitarbeiterId: string; projektId: string; bereich: Bereich; datum: string; note?: string }
) {
  s.running = {
    mitarbeiterId: str(args.mitarbeiterId),
    projektId: str(args.projektId),
    bereich: args.bereich,
    datum: str(args.datum, todayIso()),
    startTs: Date.now(),
    note: args.note != null ? str(args.note) : undefined,
  };
  saveState(s);
}

export function stopTimer(s: State, datumOverride?: string) {
  if (!s.running) return;

  const endTs = Date.now();
  const minutes = Math.max(0, Math.round((endTs - s.running.startTs) / 60000));
  const datum = str(datumOverride ?? s.running.datum, todayIso());

  s.buchungen.push({
    id: uid(),
    mitarbeiterId: s.running.mitarbeiterId,
    datum,
    art: "arbeit",
    projektId: s.running.projektId,
    bereich: s.running.bereich,
    startTs: s.running.startTs,
    endeTs: endTs,
    minuten: minutes,
    note: s.running.note,
  } as any);

  s.running = null;
  saveState(s);
}

// --- Status -----------------------------------------------------------------

export function upsertStatus(
  s: State,
  args: {
    mitarbeiterId: string;
    datum: string;
    art: "urlaub" | "krank" | "ueberstundenabbau";
    minuten: number | null;
    note?: string;
  }
) {
  s.buchungen = ensureOneStatusPerDay(s.buchungen, str(args.mitarbeiterId), str(args.datum));
  s.buchungen.push({
    id: uid(),
    mitarbeiterId: str(args.mitarbeiterId),
    datum: str(args.datum),
    art: args.art,
    minuten: args.minuten == null ? null : Math.max(0, num(args.minuten) || 0),
    note: args.note != null ? str(args.note) : undefined,
  } as any);
  saveState(s);
}

export function clearStatus(s: State, args: { mitarbeiterId: string; datum: string }) {
  s.buchungen = ensureOneStatusPerDay(s.buchungen, str(args.mitarbeiterId), str(args.datum));
  saveState(s);
}

// --- Buchungen bearbeiten ----------------------------------------------------

export function updateArbeitsBuchung(
  s: State,
  id: string,
  patch: Partial<{ minuten: number; note: string; projektId: string; bereich: Bereich }>
) {
  s.buchungen = (s.buchungen ?? []).map((b: any) => {
    if (!b || b.id !== id) return b;
    if (b.art !== "arbeit") return b;

    return {
      ...b,
      projektId: patch.projektId != null ? str(patch.projektId) : b.projektId,
      bereich: patch.bereich != null ? patch.bereich : b.bereich,
      note: patch.note != null ? str(patch.note) : b.note,
      minuten: patch.minuten != null ? Math.max(0, num(patch.minuten) || 0) : b.minuten,
    };
  }) as any;

  saveState(s);
}

export function deleteBuchung(s: State, id: string) {
  s.buchungen = (s.buchungen ?? []).filter((b: any) => b?.id !== id) as any;
  saveState(s);
}

// --- Projekte ----------------------------------------------------------------

export function getActiveProjects(s: State): Projekt[] {
  return (s.projects ?? []).filter((p: any) => p?.active !== false) as any;
}

export function createProject(s: State, name = "Neues Projekt"): State {
  const p: any = {
    id: uid(),
    name: str(name, "Neues Projekt"),
    active: true,

    kalkStunden: 0,

    arbeitsarten: {
      maschine: { kalkMinuten: 0 },
      bank: { kalkMinuten: 0 },
      lack: { kalkMinuten: 0 },
      montage: { kalkMinuten: 0 },
    },

    planNettoVkEur: 0,
    planMaterialEur: 0,
    istNettoVkEur: 0,
    istMaterialEur: 0,
  };

  s.projects = [...(s.projects ?? []), p];
  saveState(s);
  return s;
}

export function upsertProject(s: State, patch: Projekt): State {
  const p: any = patch as any;

  const fixed: any = {
    ...p,
    id: str(p?.id, uid()),
    name: str(p?.name, "Projekt"),
    active: p?.active !== false,

    kalkStunden: clamp(num(p?.kalkStunden) || 0, 0, 99999),

    kunde: p?.kunde != null ? str(p.kunde) : undefined,
    notiz: p?.notiz != null ? str(p.notiz) : undefined,

    hauptdarstellerId: p?.hauptdarstellerId != null ? str(p.hauptdarstellerId) : undefined,
    zugeordnetAnId: p?.zugeordnetAnId != null ? str(p.zugeordnetAnId) : undefined,

    arbeitsarten: normalizeArbeitsarten(p) ?? p?.arbeitsarten,

    planNettoVkEur: clamp(num(p?.planNettoVkEur) || 0, 0, 99999999),
    planMaterialEur: clamp(num(p?.planMaterialEur) || 0, 0, 99999999),
    istNettoVkEur: clamp(num(p?.istNettoVkEur) || 0, 0, 99999999),
    istMaterialEur: clamp(num(p?.istMaterialEur) || 0, 0, 99999999),
  };

  const list: any[] = s.projects ?? [];
  const idx = list.findIndex((x) => String(x?.id) === fixed.id);
  s.projects = idx >= 0 ? list.map((x) => (String(x?.id) === fixed.id ? fixed : x)) : [...list, fixed];

  saveState(s);
  return s;
}

export function setProjectActive(s: State, id: string, active: boolean): State {
  const targetId = str(id);

  s.projects = (s.projects ?? []).map((p: any) => {
    if (String(p?.id) !== targetId) return p;

    return {
      ...p,
      active,
      kalkStunden: clamp(num(p?.kalkStunden) || 0, 0, 99999),
      arbeitsarten: normalizeArbeitsarten(p) ?? p?.arbeitsarten,
      planNettoVkEur: clamp(num(p?.planNettoVkEur) || 0, 0, 99999999),
      planMaterialEur: clamp(num(p?.planMaterialEur) || 0, 0, 99999999),
      istNettoVkEur: clamp(num(p?.istNettoVkEur) || 0, 0, 99999999),
      istMaterialEur: clamp(num(p?.istMaterialEur) || 0, 0, 99999999),
    };
  }) as any;

  saveState(s);
  return s;
}
