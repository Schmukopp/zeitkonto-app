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

export function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {}
  return {
    projects: [
      { id: "p1", name: "Allgemein", active: true },
      { id: "p2", name: "Projekt A", active: true },
      { id: "p3", name: "Projekt B", active: true },
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

export function startTimer(s: State, args: { mitarbeiterId: string; projektId: string; bereich: Bereich; note?: string }) {
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
  args: { mitarbeiterId: string; datum: string; art: "urlaub" | "krank" | "ueberstundenabbau"; minuten: number | null; note?: string }
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

export function updateArbeitsBuchung(s: State, id: string, patch: Partial<{ minuten: number; note: string; projektId: string; bereich: Bereich }>) {
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
