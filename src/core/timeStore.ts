import type { Buchung, Projekt, Bereich } from "./timeTypes";

const LS_KEY = "orgaboard_time_v1";

export type RunningTimer = {
  mitarbeiterId: string;
  projektId: string;
  bereich: Bereich;
  startTs: number;
  note?: string;
};

export type State = {
  projects: Projekt[];
  buchungen: Buchung[];
  running: RunningTimer | null;
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

export function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;

      // Projekte normalisieren (für alte localStorage-Stände)
      parsed.projects = (parsed.projects ?? []).map((p) => ({
        ...p,
        active: p.active !== false,

        // Alt-Feld (Gesamtstunden)
        kalkStunden: num((p as any).kalkStunden) || 0,

        // PLAN
        planNettoVkEur: clamp(num((p as any).planNettoVkEur) || 0, 0, 99999999),
        planMaterialEur: clamp(num((p as any).planMaterialEur) || 0, 0, 99999999),

        // IST
        istNettoVkEur: clamp(num((p as any).istNettoVkEur) || 0, 0, 99999999),
        istMaterialEur: clamp(num((p as any).istMaterialEur) || 0, 0, 99999999),
      }));

      parsed.buchungen = parsed.buchungen ?? [];
      parsed.running = parsed.running ?? null;

      return parsed;
    }
  } catch {}
  return {
    projects: [
      { id: "p1", name: "Allgemein", active: true, kalkStunden: 0 },
      { id: "p2", name: "Projekt A", active: true, kalkStunden: 10 },
      { id: "p3", name: "Projekt B", active: true, kalkStunden: 20 },
    ],
    buchungen: [],
    running: null,
  };
}

export function saveState(s: State) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export function ensureOneStatusPerDay(b: Buchung[], mitarbeiterId: string, datum: string) {
  return b.filter(
    (x) =>
      !(
        x.mitarbeiterId === mitarbeiterId &&
        x.datum === datum &&
        (x.art === "urlaub" || x.art === "krank" || x.art === "ueberstundenabbau")
      )
  );
}

export function startTimer(
  s: State,
  args: { mitarbeiterId: string; projektId: string; bereich: Bereich; note?: string }
) {
  s.running = { ...args, startTs: Date.now() };
  saveState(s);
}

export function stopTimer(s: State, datum: string) {
  if (!s.running) return;
  const endTs = Date.now();
  const minutes = Math.max(0, Math.round((endTs - s.running.startTs) / 60000));

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
  });

  s.running = null;
  saveState(s);
}

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
  s.buchungen = ensureOneStatusPerDay(s.buchungen, args.mitarbeiterId, args.datum);
  s.buchungen.push({
    id: uid(),
    mitarbeiterId: args.mitarbeiterId,
    datum: args.datum,
    art: args.art,
    minuten: args.minuten,
    note: args.note,
  });
  saveState(s);
}

export function clearStatus(s: State, args: { mitarbeiterId: string; datum: string }) {
  s.buchungen = ensureOneStatusPerDay(s.buchungen, args.mitarbeiterId, args.datum);
  saveState(s);
}

export function updateArbeitsBuchung(
  s: State,
  id: string,
  patch: Partial<{ minuten: number; note: string; projektId: string; bereich: Bereich }>
) {
  s.buchungen = s.buchungen.map((b) => {
    if (b.id !== id) return b;
    if (b.art !== "arbeit") return b;
    return { ...b, ...patch, minuten: patch.minuten != null ? Number(patch.minuten) || 0 : b.minuten };
  });
  saveState(s);
}

export function deleteBuchung(s: State, id: string) {
  s.buchungen = s.buchungen.filter((b) => b.id !== id);
  saveState(s);
}

// --- Projekte v2 ------------------------------------------------------------

export function getActiveProjects(s: State): Projekt[] {
  return (s.projects ?? []).filter((p) => p.active !== false);
}

export function createProject(s: State, name = "Neues Projekt"): State {
  const p: Projekt = {
    id: uid(),
    name: (name || "").trim() || "Neues Projekt",
    active: true,
    kalkStunden: 0,

    // Plan/Ist default
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
  const fixed: Projekt = {
    ...patch,
    name: String(patch?.name ?? ""),

    active: patch?.active !== false,

    // Alt: kalkulierte Stunden (dezimal)
    kalkStunden: clamp(num((patch as any)?.kalkStunden) || 0, 0, 99999),

    // optional
    kunde: (patch as any)?.kunde ? String((patch as any).kunde) : undefined,
    notiz: (patch as any)?.notiz ? String((patch as any).notiz) : undefined,

    hauptdarstellerId: (patch as any)?.hauptdarstellerId ? String((patch as any).hauptdarstellerId) : undefined,
    zugeordnetAnId: (patch as any)?.zugeordnetAnId ? String((patch as any).zugeordnetAnId) : undefined,

    arbeitsarten: (patch as any)?.arbeitsarten,

    // PLAN
    planNettoVkEur: clamp(num((patch as any)?.planNettoVkEur) || 0, 0, 99999999),
    planMaterialEur: clamp(num((patch as any)?.planMaterialEur) || 0, 0, 99999999),

    // IST
    istNettoVkEur: clamp(num((patch as any)?.istNettoVkEur) || 0, 0, 99999999),
    istMaterialEur: clamp(num((patch as any)?.istMaterialEur) || 0, 0, 99999999),
  };

  const list = s.projects ?? [];
  const idx = list.findIndex((p) => p.id === fixed.id);
  s.projects = idx >= 0 ? list.map((p) => (p.id === fixed.id ? fixed : p)) : [...list, fixed];

  saveState(s);
  return s;
}

export function setProjectActive(s: State, id: string, active: boolean): State {
  s.projects = (s.projects ?? []).map((p) =>
    p.id === id
      ? {
          ...p,
          active,
          kalkStunden: clamp(num((p as any)?.kalkStunden) || 0, 0, 99999),

          planNettoVkEur: clamp(num((p as any)?.planNettoVkEur) || 0, 0, 99999999),
          planMaterialEur: clamp(num((p as any)?.planMaterialEur) || 0, 0, 99999999),
          istNettoVkEur: clamp(num((p as any)?.istNettoVkEur) || 0, 0, 99999999),
          istMaterialEur: clamp(num((p as any)?.istMaterialEur) || 0, 0, 99999999),
        }
      : p
  );

  saveState(s);
  return s;
}
