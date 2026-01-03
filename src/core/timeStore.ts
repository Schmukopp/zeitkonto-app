// src/core/timeStore.ts
import type { Buchung, Projekt, Bereich } from "./timeTypes";

const LS_KEY = "orgaboard_time_v1";
const LS_BAK = `${LS_KEY}.bak`;

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

export type ProjektStatus = "aktiv" | "archiv";

export type ProjektAbschluss = {
  abgeschlossenAt: number;
  nettoVkIstEur?: number;
  materialIstEur?: number;
  istMinuten?: number;
  wertschoepfungEurProStd?: number;
  ueberzugMinuten?: number;
};

export type State = {
  projects: (Projekt & {
    // ✅ Lifecycle (neu)
    status?: ProjektStatus;
    archivJahr?: number;
    archiviertAt?: number;
    abschluss?: ProjektAbschluss;

    // ⚠️ Alt-Feld bleibt toleriert
    active?: boolean;
  })[];
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

// ✅ UTC-kalenderfestes "YYYY-MM-DD"
function isoFromDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ✅ UTC-"heute"
function todayIso(): string {
  return isoFromDateUTC(new Date());
}

/**
 * Normalisiert "datum" zuverlässig auf "YYYY-MM-DD".
 * Unterstützt:
 * - "YYYY-MM-DD"
 * - ISO-DateTime "YYYY-MM-DDTHH:mm..."
 * - number (Timestamp)
 * - Date
 * - Objektvarianten aus Altständen (z.B. {iso}, {date}, {y,m,d}, {year,month,day})
 */
function normalizeIsoDatum(v: unknown): string {
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "";
    if (s.length >= 10) return s.slice(0, 10);
    return s;
  }

  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const d = new Date(v);
    if (Number.isFinite(d.getTime())) return isoFromDateUTC(d);
    return "";
  }

  if (v instanceof Date) {
    if (Number.isFinite(v.getTime())) return isoFromDateUTC(v);
    return "";
  }

  if (v && typeof v === "object") {
    const o: any = v;

    const cands = [o.iso, o.datum, o.date, o.value];
    for (const c of cands) {
      const s = normalizeIsoDatum(c);
      if (s) return s;
    }

    const y = num(o.y ?? o.year);
    const m = num(o.m ?? o.month);
    const d = num(o.d ?? o.day);
    if (y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${String(Math.trunc(y))}-${mm}-${dd}`;
    }
  }

  return "";
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

function normalizeBuchung(b: any): Buchung | null {
  if (!b || typeof b !== "object") return null;

  const art = str(b.art);
  const id = str(b.id, uid());
  const mitarbeiterId = str(b.mitarbeiterId);
  const projektId = b.projektId != null ? str(b.projektId) : undefined;

  const datum = normalizeIsoDatum(b.datum);
  const fixedDatum = datum || todayIso();

  const fixed: any = {
    ...b,
    id,
    mitarbeiterId,
    datum: fixedDatum,
    art,
  };

  if (art === "arbeit") {
    fixed.projektId = str(projektId, "");
    fixed.bereich = b.bereich as Bereich;
    fixed.startTs = num(b.startTs) || fixed.startTs;
    fixed.endeTs = num(b.endeTs) || fixed.endeTs;

    const min = num(b.minuten) || num(b.stunden) * 60 || 0;
    fixed.minuten = Math.max(0, Math.round(min));
  } else {
    if (b.minuten === null) fixed.minuten = null;
    else fixed.minuten = b.minuten != null ? Math.max(0, num(b.minuten) || 0) : fixed.minuten;
  }

  return fixed as Buchung;
}

export function loadTimeState(): State {
  const fallback = (): State => ({
    projects: [
      { id: "p1", name: "Allgemein", active: true, kalkStunden: 0, status: "aktiv" } as any,
      { id: "p2", name: "Projekt A", active: true, kalkStunden: 10, status: "aktiv" } as any,
      { id: "p3", name: "Projekt B", active: true, kalkStunden: 20, status: "aktiv" } as any,
    ],
    buchungen: [],
    running: null,
  });

  const raw = localStorage.getItem(LS_KEY);
  const rawBak = localStorage.getItem(LS_BAK);

  const normalizeProject = (p: any): any => {
    const active = p?.active !== false;

    // ✅ Migration-Regel:
    // - Wenn status fehlt: status = (active ? "aktiv" : "archiv"?) -> wir setzen konservativ "aktiv"
    //   (Archiv wird nur über "archiveProject" gesetzt, niemals über "active")
    const status: ProjektStatus =
      p?.status === "archiv" ? "archiv" : "aktiv";

    const fixed: any = {
      ...p,
      id: str(p?.id, uid()),
      name: str(p?.name, "Projekt"),
      active,

      // ✅ Lifecycle
      status,
      archivJahr: p?.archivJahr,
      archiviertAt: p?.archiviertAt,
      abschluss: p?.abschluss,

      kalkStunden: clamp(num(p?.kalkStunden) || 0, 0, 99999),
      arbeitsarten: normalizeArbeitsarten(p) ?? p?.arbeitsarten,

      kunde: p?.kunde != null ? str(p.kunde) : undefined,
      notiz: p?.notiz != null ? str(p.notiz) : undefined,

      hauptdarstellerId: p?.hauptdarstellerId != null ? str(p.hauptdarstellerId) : undefined,
      zugeordnetAnId: p?.zugeordnetAnId != null ? str(p.zugeordnetAnId) : undefined,

      planNettoVkEur: p?.planNettoVkEur,
      planMaterialEur: p?.planMaterialEur,
      istNettoVkEur: p?.istNettoVkEur,
      istMaterialEur: p?.istMaterialEur,
    };

    return fixed;
  };

  const parseAndNormalize = (parsed: any): State => {
    const projectsRaw: any[] = Array.isArray(parsed?.projects) ? parsed.projects : [];
    const projects: any[] = projectsRaw.map(normalizeProject).filter((p: any) => !!p?.id);

    const buchungenRaw: any[] = Array.isArray(parsed?.buchungen) ? (parsed.buchungen as any[]) : [];
    const buchungen: Buchung[] = buchungenRaw.map(normalizeBuchung).filter((x): x is Buchung => !!x);

    let running: RunningTimer | null = (parsed?.running as any) ?? null;
    if (running) {
      const fixed: RunningTimer = {
        mitarbeiterId: str((running as any).mitarbeiterId),
        projektId: str((running as any).projektId),
        bereich: (running as any).bereich as Bereich,
        startTs: num((running as any).startTs) || Date.now(),
        datum: str(normalizeIsoDatum((running as any).datum) || todayIso(), todayIso()),
        note: (running as any).note != null ? str((running as any).note) : undefined,
      };

      if (!fixed.mitarbeiterId || !fixed.projektId || !fixed.bereich) running = null;
      else running = fixed;
    }

    return {
      projects:
        projects.length > 0 ? (projects as any) : ([{ id: "p1", name: "Allgemein", active: true, kalkStunden: 0, status: "aktiv" }] as any),
      buchungen,
      running,
      boardLayout: (parsed as any)?.boardLayout ?? undefined,
    };
  };

  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      const out = parseAndNormalize(parsed);
      saveState(out);
      return out;
    } catch (err) {
      console.warn("loadTimeState failed", err);
    }
  }

  if (rawBak && rawBak.trim()) {
    try {
      const parsedBak = JSON.parse(rawBak);
      const out = parseAndNormalize(parsedBak);

      localStorage.setItem(LS_KEY, rawBak);
      saveState(out);

      return out;
    } catch (err) {
      console.warn("loadTimeState backup failed", err);
    }
  }

  return fallback();
}

// Backward-Compat: App.tsx (und evtl. andere Stellen) importiert noch loadState
export function loadState(): State {
  return loadTimeState();
}

export function saveState(s: State) {
  localStorage.setItem(LS_BAK, localStorage.getItem(LS_KEY) || "");
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// Backward-Compat: falls irgendwo noch saveTimeState genutzt wird
export function saveTimeState(s: State) {
  saveState(s);
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
  const fixedDatum = normalizeIsoDatum(args.datum) || todayIso();

  s.running = {
    mitarbeiterId: str(args.mitarbeiterId),
    projektId: str(args.projektId),
    bereich: args.bereich,
    datum: fixedDatum,
    startTs: Date.now(),
    note: args.note != null ? str(args.note) : undefined,
  };
  saveState(s);
}

export function stopTimer(s: State, datumOverride?: string) {
  if (!s.running) return;

  const endTs = Date.now();
  const rawMinutes = Math.round((endTs - s.running.startTs) / 60000);
  const minutes = Math.max(1, rawMinutes);

  const datum = normalizeIsoDatum(datumOverride) || todayIso();

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
  const fixedDatum = normalizeIsoDatum(args.datum) || todayIso();

  s.buchungen = ensureOneStatusPerDay(s.buchungen, str(args.mitarbeiterId), fixedDatum);
  s.buchungen.push({
    id: uid(),
    mitarbeiterId: str(args.mitarbeiterId),
    datum: fixedDatum,
    art: args.art,
    minuten: args.minuten == null ? null : Math.max(0, num(args.minuten) || 0),
    note: args.note != null ? str(args.note) : undefined,
  } as any);
  saveState(s);
}

export function clearStatus(s: State, args: { mitarbeiterId: string; datum: string }) {
  const fixedDatum = normalizeIsoDatum(args.datum) || todayIso();
  s.buchungen = ensureOneStatusPerDay(s.buchungen, str(args.mitarbeiterId), fixedDatum);
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

/**
 * ✅ Nur aktive Projekte für Board/Heute:
 * - bevorzugt status === "aktiv"
 * - fallback: active !== false (Altstand)
 */
export function getActiveProjects(s: State): Projekt[] {
  return (s.projects ?? []).filter((p: any) => {
    const st = p?.status;
    if (st === "archiv") return false;
    if (st === "aktiv") return true;
    return p?.active !== false;
  }) as any;
}

export function createProject(s: State, name = "Neues Projekt"): State {
  const p: any = {
    id: uid(),
    name: str(name, "Neues Projekt"),

    // ✅ Lifecycle Default
    status: "aktiv",

    // Alt
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

  s.projects = [p, ...(s.projects ?? [])];
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

    // ✅ Lifecycle Default (wenn fehlt)
    status: p?.status === "archiv" ? "archiv" : "aktiv",
    archivJahr: p?.archivJahr,
    archiviertAt: p?.archiviertAt,
    abschluss: p?.abschluss,

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

      // ✅ wenn man deaktiviert, wird NICHT archiviert (separates Konzept)
      status: p?.status === "archiv" ? "archiv" : (p?.status ?? "aktiv"),

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

/**
 * ✅ Archivieren (statt Löschen)
 * - setzt status="archiv"
 * - setzt archivJahr / archiviertAt
 * - löscht keine Buchungen
 */
export function archiveProject(s: State, projektId: string, jahr: number): State {
  const targetId = str(projektId);
  const y = Math.trunc(num(jahr));

  s.projects = (s.projects ?? []).map((p: any) => {
    if (String(p?.id) !== targetId) return p;

    return {
      ...p,
      status: "archiv",
      archivJahr: y,
      archiviertAt: Date.now(),
      // optional: active false, damit Alt-Views auch sofort reagieren
      active: false,
    };
  }) as any;

  saveState(s);
  return s;
}
