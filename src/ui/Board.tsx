// src/ui/Board.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { State } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";
import { DEFAULT_WOCHENMODELL, sollMinutenForIsoDate } from "../core/workModel";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

type Bereich = "maschine" | "bank" | "lack" | "montage";

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

const COLS = 24; // 4 Wochen * 6 Tage
const CELL_W = 80;
const NAME_COL_W = 240;

// Band 1 (oben): Projektspur
const PROJECT_BAND_H = 32;

// Band 2 (unten): Buchungen (Auto-Pack)
const BOOKING_LANES = 2;
const BOOKING_LANE_H = 24;

const ROW_H = PROJECT_BAND_H + BOOKING_LANES * BOOKING_LANE_H;

// Basis-Kapazität pro Worker und Tag (10h = 600min)
const BASE_CAP_MIN = 600;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ===== Kalenderfest (UTC) =====
function isoDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = String(iso ?? "")
    .slice(0, 10)
    .split("-")
    .map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}

function addDays(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function startOfWeekMondayUTC(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const day = x.getUTCDay(); // 0=So..6=Sa
  const diff = (day === 0 ? -6 : 1) - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

// ===== Kalenderjahr-KW (erste KW = Woche ab erstem Montag im Jahr) =====
function firstMondayOfYearUTC(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const dow = jan1.getUTCDay();
  const offset = (dow === 0 ? 1 : 8 - dow) % 7;
  return new Date(Date.UTC(year, 0, 1 + offset, 0, 0, 0, 0));
}

function kalenderjahrKW(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const year = d.getUTCFullYear();
  const firstMon = firstMondayOfYearUTC(year);
  const diffDays = Math.floor((d.getTime() - firstMon.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return Math.floor(diffDays / 7) + 1;
}

// Anzeige-Ende einer KW: Mo–Sa, aber niemals über 31.12 hinaus
function weekEndDisplayMoSaCapped(weekStartMonday: Date): Date {
  const year = weekStartMonday.getUTCFullYear();
  const end = addDays(weekStartMonday, 5);
  const dec31 = new Date(Date.UTC(year, 11, 31, 0, 0, 0, 0));
  return end.getTime() > dec31.getTime() ? dec31 : end;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function minutesToHM(min: number) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm} h`;
}

function isBereich(x: unknown): x is Bereich {
  return x === "maschine" || x === "bank" || x === "lack" || x === "montage";
}

function diffDaysIso(fromIso: string, toIso: string) {
  const a = parseIso(fromIso).getTime();
  const b = parseIso(toIso).getTime();
  return Math.round((b - a) / 86400000);
}

// ===== Robuste Feldzugriffe =====
function pickIso(e: any): string {
  const cands = [e?.datum, e?.date, e?.iso, e?.day];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 10);
  }
  return "";
}

function pickProjektId(e: any): string {
  const cands = [e?.projektId, e?.projectId, e?.projektID, e?.projectID, e?.pid];
  for (const c of cands) {
    if (c == null) continue;
    const s = String(c);
    if (s.trim()) return s;
  }
  return "";
}

function pickMitarbeiterId(e: any): string {
  const cands = [e?.mitarbeiterId, e?.employeeId, e?.mitarbeiterID, e?.mid];
  for (const c of cands) {
    if (c == null) continue;
    const s = String(c);
    if (s.trim()) return s;
  }
  return "";
}

function pickMinutes(e: any): number {
  const min = safeNumber(e?.minuten) || safeNumber(e?.minutes);
  if (min > 0) return Math.max(0, Math.round(min));
  const hrs = safeNumber(e?.stunden) || safeNumber(e?.hours);
  if (hrs > 0) return Math.max(0, Math.round(hrs * 60));
  return 0;
}

// ===== Meister-/Operativ-Felder aus Projekt ziehen =====
function pickPlannerMeisterId(p: any): string | null {
  const cands = [p?.meisterId, p?.hauptverantwortlicherId, p?.verantwortlicherId, p?.ownerId, p?.hauptdarstellerId];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

function pickOperativDefaultId(p: any): string | null {
  const cands = [p?.zugeordnetAnId, p?.assignedToId];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

// ===== stabile Meisterfarbe =====
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function meisterColorClass(meisterId: string | null) {
  if (!meisterId) return "bg-orange-500";
  const palette = [
    "bg-orange-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-fuchsia-500",
    "bg-amber-400",
    "bg-cyan-500",
    "bg-lime-500",
    "bg-violet-500",
  ];
  const idx = hashStr(meisterId) % palette.length;
  return palette[idx];
}

function bereichColorClass(b: Bereich) {
  switch (b) {
    case "maschine":
      return "bg-cyan-500";
    case "bank":
      return "bg-blue-500";
    case "lack":
      return "bg-fuchsia-500";
    case "montage":
      return "bg-emerald-500";
    default:
      return "bg-blue-500";
  }
}

// ===== Projekt-Totals inkl. dayMin + dayWorkers =====
function extractProjectTotals(state: any) {
  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];

  const totalMin = new Map<string, number>();
  const firstIso = new Map<string, string>();
  const areaMin = new Map<string, Record<Bereich, number>>();
  const dayMin = new Map<string, number>(); // `${projektId}__${iso}`
  const dayWorkers = new Map<string, Set<string>>(); // `${projektId}__${iso}` => Set(mid)

  const emptyAreas = (): Record<Bereich, number> => ({ maschine: 0, bank: 0, lack: 0, montage: 0 });

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if (String(e?.art ?? "") !== "arbeit") continue;

    const projektId = pickProjektId(e);
    const datum = pickIso(e);
    if (!projektId || !datum) continue;

    const minutes = pickMinutes(e);
    if (minutes <= 0) continue;

    totalMin.set(projektId, (totalMin.get(projektId) ?? 0) + minutes);

    const curFirst = firstIso.get(projektId);
    if (!curFirst || datum < curFirst) firstIso.set(projektId, datum);

    const key = `${projektId}__${datum}`;
    dayMin.set(key, (dayMin.get(key) ?? 0) + minutes);

    const mid = pickMitarbeiterId(e);
    if (mid) {
      if (!dayWorkers.has(key)) dayWorkers.set(key, new Set());
      dayWorkers.get(key)!.add(String(mid));
    }

    const bRaw = e?.bereich;
    const bereich: Bereich | null = isBereich(bRaw) ? bRaw : null;
    if (bereich) {
      if (!areaMin.has(projektId)) areaMin.set(projektId, emptyAreas());
      areaMin.get(projektId)![bereich] += minutes;
    }
  }

  return { totalMin, firstIso, areaMin, dayMin, dayWorkers };
}

// ===== Tagesindex je Mitarbeiter: Projekte pro Tag =====
function extractEmployeeDayProjectMinutes(state: any): Map<string, Array<{ projektId: string; minuten: number }>> {
  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];
  const tmp = new Map<string, Map<string, number>>();

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if (String(e?.art ?? "") !== "arbeit") continue;

    const mitarbeiterId = pickMitarbeiterId(e);
    const projektId = pickProjektId(e);
    const datum = pickIso(e);
    if (!mitarbeiterId || !projektId || !datum) continue;

    const minutes = pickMinutes(e);
    if (minutes <= 0) continue;

    const key = `${mitarbeiterId}__${datum}`;
    if (!tmp.has(key)) tmp.set(key, new Map());
    const inner = tmp.get(key)!;
    inner.set(projektId, (inner.get(projektId) ?? 0) + minutes);
  }

  const out = new Map<string, Array<{ projektId: string; minuten: number }>>();
  for (const [key, inner] of tmp.entries()) {
    out.set(
      key,
      Array.from(inner.entries())
        .map(([projektId, minuten]) => ({ projektId, minuten }))
        .sort((a, b) => b.minuten - a.minuten)
    );
  }
  return out;
}

// ===== Planung (Layout) =====
type LayoutPos = { rowId: string; startCol: number };
type LayoutMap = Record<string, LayoutPos>;

type Block = {
  id: string;
  name: string;
  rowId: string;
  startColTop: number; // Block-Start (verschoben auf erste Buchung)
  spanCols: number; // dynamisch: verkürzt/verlängert
  meisterId: string | null;
  planMinuten: number;
  firstIso: string | null;
};

type BlockPart = {
  key: string;
  projectId: string;
  name: string;
  rowId: string;
  weekRow: 0 | 1;
  startCol: number;
  span: number;
  meisterId: string | null;
  planMinuten: number;
  relStart: number;
  firstIso: string | null;
};

// ===== Buchungs-Packing =====
type PackedSeg = {
  key: string;
  col: number;
  lane: number;
  leftPx: number;
  widthPx: number;
  label: string;
  tooltip: string;
  colorClass: string;
};

function pickColorForProject(_projectId: string, meisterId: string | null) {
  return meisterColorClass(meisterId);
}

export default function Board({ state, setState, ms }: Props) {
  const mitarbeiter = (ms as any)?.mitarbeiter ?? [];
  const projects = (state as any)?.projects ?? [];
  const running = (state as any)?.running ?? null;

  const { topWeeks, bottomWeeks } = useMemo(() => {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    const cw = startOfWeekMondayUTC(todayUTC);
    const top = [addDays(cw, -7), cw, addDays(cw, 7), addDays(cw, 14)];
    const bot = [addDays(cw, 21), addDays(cw, 28), addDays(cw, 35), addDays(cw, 42)];
    return { topWeeks: top, bottomWeeks: bot };
  }, []);

  const scrollTopRef = useRef<HTMLDivElement | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  function dateForCol(weekRow: 0 | 1, col: number) {
    const weekIdx = Math.floor(col / 6);
    const dayIdx = col % 6;
    const base = weekRow === 0 ? topWeeks[weekIdx] : bottomWeeks[weekIdx];
    return addDays(base, dayIdx);
  }

  function colForIso(weekRow: 0 | 1, iso: string): number | null {
    const target = parseIso(iso).getTime();
    for (let col = 0; col < COLS; col++) {
      if (dateForCol(weekRow, col).getTime() === target) return col;
    }
    return null;
  }

  function sollMinutenFor(m: any, iso: string) {
    const modell = m?.modell ?? DEFAULT_WOCHENMODELL;
    return sollMinutenForIsoDate(modell, iso);
  }

  const activeProjects = useMemo(() => (projects ?? []).filter((p: any) => !!p?.active), [projects]);

  const projectById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of projects ?? []) m.set(String(p.id), p);
    return m;
  }, [projects]);

  const projTotals = useMemo(() => extractProjectTotals(state as any), [state]);
  const empDayProjIdx = useMemo(() => extractEmployeeDayProjectMinutes(state as any), [state]);

  const layout: LayoutMap = ((state as any)?.boardLayout ?? {}) as LayoutMap;

  const autoFallback: LayoutMap = useMemo(() => {
    const out: LayoutMap = {};
    let cursor = 0;
    let rr = 0;

    for (const p of activeProjects) {
      const pid = String(p.id);
      if (layout[pid]) continue;

      const defaultOperativ = pickOperativDefaultId(p);
      const fallbackRowId = String(
        defaultOperativ ?? mitarbeiter[rr % Math.max(1, mitarbeiter.length)]?.id ?? "m1"
      );
      rr++;

      out[pid] = { rowId: fallbackRowId, startCol: clamp(cursor, 0, COLS - 1) };
      cursor = clamp(cursor + 3, 0, COLS - 1);
    }

    return out;
  }, [activeProjects, layout, mitarbeiter]);

  /**
   * Dynamische Dauer in Cols (Mo–Sa Raster):
   * - minutesTarget = max(kalkMinuten, gebuchteMinuten) => verlängert bei Überschreitung
   * - Tage mit Buchung: Kapazität = BASE_CAP_MIN * workerCountThatDay
   * - Tage ohne Buchung: workerCount = 1 (Default)
   * - Freitag+Samstag: wenn KEINE Buchung => Pause (Spalte bleibt, aber verbraucht keine Minuten)
   */
  function calcNeededColsFromStart(projectId: string, startIso: string, minutesTarget: number): number {
    if (minutesTarget <= 0) return 1;

    let remain = minutesTarget;
    let cols = 0;

    const MAX_COLS = COLS * 2; // über 2 Reihen hinaus wird visuell eh abgeschnitten
    for (let i = 0; i < MAX_COLS; i++) {
      const dayIso = isoDate(addDays(parseIso(startIso), i));
      const key = `${projectId}__${dayIso}`;

      const bookedThatDay = projTotals.dayMin.get(key) ?? 0;

      const dow = parseIso(dayIso).getUTCDay(); // 0=So..6=Sa
      const isFriOrSat = dow === 5 || dow === 6;

      if (isFriOrSat && bookedThatDay <= 0) {
        cols++;
        continue;
      }

      const workers = projTotals.dayWorkers.get(key);
      const workersCount = workers && workers.size > 0 ? Math.max(1, workers.size) : 1;

      const dayCap = BASE_CAP_MIN * workersCount;
      const take = Math.min(remain, dayCap);
      remain -= take;

      cols++;
      if (remain <= 0) break;
    }

    return Math.max(1, cols);
  }

  // Blocks: echter Start + dynamische Länge
  const rawBlocks: Block[] = useMemo(() => {
    if (mitarbeiter.length === 0) return [];

    return activeProjects.map((p: any) => {
      const pid = String(p.id);
      const meisterId = pickPlannerMeisterId(p);

      const pos = layout[pid] ?? autoFallback[pid];
      const plannedStartColTop = clamp(pos?.startCol ?? 0, 0, COLS - 1);
      const rowId = String(pos?.rowId ?? pickOperativDefaultId(p) ?? mitarbeiter[0]?.id ?? "m1");

      const planMinuten = Math.max(0, Math.round((safeNumber(p.kalkStunden) || 0) * 60));
      const bookedMinuten = projTotals.totalMin.get(pid) ?? 0;

      // Ziel-Minuten: verlängert wenn über Kalk
      const minutesTarget = Math.max(planMinuten, bookedMinuten);

      // Planung -> ISO (aus Board-Grid)
      const plannedStartIso = isoDate(dateForCol(0, plannedStartColTop));

      // Echter Start (erste Buchung) verschiebt das ganze Projekt
      const firstIso = projTotals.firstIso.get(pid) ?? null;
      const offset = firstIso ? diffDaysIso(plannedStartIso, firstIso) : 0;
      const startColTop = clamp(plannedStartColTop + offset, 0, COLS - 1);

      // StartIso des Blocks (für Dauerberechnung)
      const startIso = firstIso ?? plannedStartIso;

      // Dynamische Dauer in Cols
      const spanCols = clamp(calcNeededColsFromStart(pid, startIso, minutesTarget), 1, COLS * 2);

      return {
        id: pid,
        name: String(p.name ?? "Projekt"),
        rowId,
        startColTop,
        spanCols,
        meisterId,
        planMinuten,
        firstIso,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjects, layout, autoFallback, mitarbeiter, projTotals, topWeeks, bottomWeeks]);

  /**
   * Ketten-Layout:
   * - Projekte pro row nach startColTop sortieren
   * - erstes Projekt bleibt, alle folgenden werden direkt dahinter gesetzt
   */
  const blocks: Block[] = useMemo(() => {
    const byRow = new Map<string, Block[]>();
    for (const b of rawBlocks) {
      if (!byRow.has(b.rowId)) byRow.set(b.rowId, []);
      byRow.get(b.rowId)!.push({ ...b });
    }

    const out: Block[] = [];
    for (const [rowId, arr] of byRow.entries()) {
      const sorted = arr.slice().sort((a, b) => a.startColTop - b.startColTop);

      let cursor = 0;
      for (let i = 0; i < sorted.length; i++) {
        const b = sorted[i];

        if (i === 0) {
          cursor = clamp(b.startColTop, 0, COLS - 1) + b.spanCols;
          out.push(b);
          continue;
        }

        const newStart = clamp(cursor, 0, COLS - 1);
        b.startColTop = newStart;
        cursor = newStart + b.spanCols;

        out.push(b);
      }
    }

    return out;
  }, [rawBlocks]);

  function splitBlock(b: Block): BlockPart[] {
    const parts: BlockPart[] = [];

    const topStart = b.startColTop;
    const topAvail = Math.max(0, COLS - topStart);
    const topSpan = Math.min(b.spanCols, topAvail);

    if (topSpan > 0) {
      parts.push({
        key: `${b.id}__top`,
        projectId: b.id,
        name: b.name,
        rowId: b.rowId,
        weekRow: 0,
        startCol: topStart,
        span: topSpan,
        meisterId: b.meisterId,
        planMinuten: b.planMinuten,
        relStart: 0,
        firstIso: b.firstIso,
      });
    }

    const rest = b.spanCols - topSpan;
    if (rest > 0) {
      parts.push({
        key: `${b.id}__bottom`,
        projectId: b.id,
        name: b.name,
        rowId: b.rowId,
        weekRow: 1,
        startCol: 0,
        span: Math.min(rest, COLS),
        meisterId: b.meisterId,
        planMinuten: b.planMinuten,
        relStart: topSpan,
        firstIso: b.firstIso,
      });
    }

    return parts;
  }

  const blockParts: BlockPart[] = useMemo(() => blocks.flatMap(splitBlock), [blocks]);

  const projectTotalSpanCols = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of blockParts) {
      const end = p.relStart + p.span;
      const cur = m.get(String(p.projectId)) ?? 0;
      if (end > cur) m.set(String(p.projectId), end);
    }
    return m;
  }, [blockParts]);

  // Drag & Drop: speichert weiterhin "Planung". Kettenlayout wird darüber gelegt.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function saveLayout(projectId: string, nextPos: { rowId: string; startCol: number }) {
    setState((s) => {
      const next = structuredClone(s) as any;
      if (!next.boardLayout) next.boardLayout = {};
      next.boardLayout[String(projectId)] = nextPos;
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, projectId: string) {
    setDraggingId(projectId);
    e.dataTransfer.setData("text/plain", projectId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId(null);
  }

  function onDropOnRow(e: React.DragEvent, target: { rowId: string; weekRow: 0 | 1; col: number }) {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;
    if (target.weekRow !== 0) return;

    saveLayout(projectId, { rowId: String(target.rowId), startCol: clamp(target.col, 0, COLS - 1) });
    setDraggingId(null);
  }

  // Fokus auf laufendes Projekt
  useEffect(() => {
    const pid = running?.projektId ? String(running.projektId) : null;
    if (!pid) return;

    const topPart = blockParts.find((p) => p.projectId === pid && p.weekRow === 0 && p.relStart === 0);
    const part = topPart ?? blockParts.find((p) => p.projectId === pid);
    if (!part) return;

    const sc = part.weekRow === 0 ? scrollTopRef.current : scrollBottomRef.current;
    if (!sc) return;

    const x = NAME_COL_W + part.startCol * CELL_W - sc.clientWidth * 0.35;
    sc.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
  }, [running?.projektId, blockParts]);

  // --------- Buchungen packen ----------
  function packDaySegments(rowId: string, weekRow: 0 | 1): PackedSeg[] {
    const out: PackedSeg[] = [];

    for (let col = 0; col < COLS; col++) {
      const iso = isoDate(dateForCol(weekRow, col));
      const dayKey = `${rowId}__${iso}`;

      const entries = empDayProjIdx.get(dayKey) ?? [];
      if (entries.length === 0) continue;

      const m = mitarbeiter.find((x: any) => String(x.id) === String(rowId));
      const soll = sollMinutenFor(m, iso);
      const denom = Math.max(1, soll > 0 ? soll : BASE_CAP_MIN);

      const usedPxByLane = Array.from({ length: BOOKING_LANES }, () => 0);
      const sorted = entries.slice().sort((a, b) => b.minuten - a.minuten);

      for (const e of sorted) {
        const proj = projectById.get(String(e.projektId));
        const meisterId = pickPlannerMeisterId(proj);

        const widthPxRaw = (Math.max(0, e.minuten) / denom) * CELL_W;
        const widthPx = clamp(Math.round(widthPxRaw), 10, CELL_W - 4);

        let lane = 0;
        while (lane < BOOKING_LANES) {
          const used = usedPxByLane[lane];
          if (used + widthPx + 2 <= CELL_W - 2) break;
          lane++;
        }
        if (lane >= BOOKING_LANES) lane = BOOKING_LANES - 1;

        const leftPx = clamp(usedPxByLane[lane] + 2, 2, CELL_W - 2);
        const maxW = Math.max(6, CELL_W - 2 - leftPx);
        const w = Math.min(widthPx, maxW);

        usedPxByLane[lane] = leftPx + w;

        const pname = String(proj?.name ?? e.projektId);
        const label = `${Math.round(e.minuten / 30) / 2}h`;
        const tooltip = `${pname}\n${iso}\nIst: ${minutesToHM(e.minuten)}`;
        const colorClass = pickColorForProject(String(e.projektId), meisterId);

        out.push({
          key: `${dayKey}__${e.projektId}__${lane}__${leftPx}`,
          col,
          lane,
          leftPx,
          widthPx: w,
          label,
          tooltip,
          colorClass,
        });
      }
    }

    return out;
  }

  // ===== Projekt-Fortschritt-Overlay (parallel = mehr Tageskapazität => echte Kalender-Kompression) =====
  function renderProjectProgressOverlay(p: BlockPart) {
    const totalMin = projTotals.totalMin.get(p.projectId) ?? 0;
    const planMin = Math.max(0, p.planMinuten);
    const first = p.firstIso;

    if (totalMin <= 0 || !first) return null;

    // Hinweis: Wir rendern nur die sichtbaren Tage dieses BlockParts (p.span),
    // aber global ist die Reihenfolge weiterhin ab firstIso + (relStart + localDay).
    let remainIn = planMin > 0 ? Math.min(totalMin, planMin) : 0;
    let remainOver = planMin > 0 ? Math.max(0, totalMin - planMin) : totalMin;

    const partsStartPx = p.relStart * CELL_W;
    const partsEndPx = (p.relStart + p.span) * CELL_W;

    const segs: Array<{ left: number; width: number; kind: "in" | "over"; colorNode: React.ReactNode | null }> = [];

    const area =
      projTotals.areaMin.get(p.projectId) ?? ({ maschine: 0, bank: 0, lack: 0, montage: 0 } as any);
    const areaTotal = Math.max(1, area.maschine + area.bank + area.lack + area.montage);
    const areaShares: Array<{ b: Bereich; share: number }> = [
      { b: "maschine", share: area.maschine / areaTotal },
      { b: "bank", share: area.bank / areaTotal },
      { b: "lack", share: area.lack / areaTotal },
      { b: "montage", share: area.montage / areaTotal },
    ].filter((x) => x.share > 0.0001);

    function renderInColor() {
      if (areaShares.length === 0) return <div className="h-full w-full bg-blue-500" />;
      return (
        <div className="h-full w-full flex">
          {areaShares.map((x, idx) => (
            <div
              key={`${x.b}_${idx}`}
              className={`h-full ${bereichColorClass(x.b)}`}
              style={{ width: `${x.share * 100}%` }}
            />
          ))}
        </div>
      );
    }

    for (let localDay = 0; localDay < p.span; localDay++) {
      if (remainIn <= 0 && remainOver <= 0) break;

      const globalDay = p.relStart + localDay;

      const dayStartPx = globalDay * CELL_W;
      const dayEndPx = dayStartPx + CELL_W;

      const partVisibleStart = Math.max(partsStartPx, dayStartPx);
      const partVisibleEnd = Math.min(partsEndPx, dayEndPx);
      if (partVisibleEnd - partVisibleStart <= 0) continue;

      const dayIso = isoDate(addDays(parseIso(first), globalDay));
      const key = `${p.projectId}__${dayIso}`;
      const bookedThatDay = projTotals.dayMin.get(key) ?? 0;

      // Freitag+Samstag: wenn nicht gebucht => Pause (kein Fortschritt)
      const dow = parseIso(dayIso).getUTCDay();
      const isFriOrSat = dow === 5 || dow === 6;
      if (isFriOrSat && bookedThatDay <= 0) continue;

      let workersCount = 1;
      const workers = projTotals.dayWorkers.get(key);
      if (workers && workers.size > 0) workersCount = Math.max(1, workers.size);

      const dayCapMin = BASE_CAP_MIN * workersCount;

      const takeIn = remainIn > 0 ? Math.min(remainIn, dayCapMin) : 0;
      const takeOver = takeIn === 0 && remainOver > 0 ? Math.min(remainOver, dayCapMin) : 0;

      const used = takeIn > 0 ? takeIn : takeOver;
      if (used <= 0) continue;

      // Breite innerhalb des Tages relativ zur Tageskapazität (Parallelität = Kompression sichtbar)
      const wPx = clamp(Math.round((used / dayCapMin) * CELL_W), 2, CELL_W);

      const segLeft = Math.max(partVisibleStart, dayStartPx);
      const segRight = Math.min(partVisibleEnd, dayStartPx + wPx);
      const segW = segRight - segLeft;

      if (segW > 0) {
        segs.push({
          left: segLeft - partsStartPx,
          width: segW,
          kind: takeIn > 0 ? "in" : "over",
          colorNode: takeIn > 0 ? renderInColor() : null,
        });
      }

      if (takeIn > 0) remainIn -= takeIn;
      else remainOver -= takeOver;
    }

    if (segs.length === 0) return null;

    return (
      <>
        {segs.map((s, idx) => {
          if (s.kind === "in") {
            return (
              <div key={idx} className="absolute top-0 bottom-0" style={{ left: s.left, width: s.width }}>
                {s.colorNode}
                <div className="absolute inset-0 bg-blue-900/15" />
              </div>
            );
          }
          return (
            <div key={idx} className="absolute top-0 bottom-0 bg-red-600" style={{ left: s.left, width: s.width }} />
          );
        })}
      </>
    );
  }

  function renderSection(weekRow: 0 | 1, weeks4: Date[], scrollRef: React.RefObject<HTMLDivElement>) {
    const parts = blockParts.filter((p) => p.weekRow === weekRow);
    const activeCol = running?.datum ? colForIso(weekRow, String(running.datum).slice(0, 10)) : null;

    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div ref={scrollRef} className="overflow-x-auto">
          <div className="min-w-max">
            {/* KW Header */}
            <div className="flex">
              <div className="shrink-0 border-r border-neutral-800" style={{ width: NAME_COL_W, height: 40 }} />
              {weeks4.map((wStart, idx) => {
                const isCurrent = weekRow === 0 && idx === 1;
                const kw = kalenderjahrKW(wStart);
                const from = isoDate(wStart);
                const to = isoDate(weekEndDisplayMoSaCapped(wStart));

                return (
                  <div
                    key={idx}
                    className={`flex flex-col items-center justify-center text-xs font-semibold border-r border-neutral-800 ${
                      isCurrent ? "bg-orange-500 text-neutral-950" : "bg-neutral-900 text-neutral-300"
                    }`}
                    style={{ width: 6 * CELL_W, height: 40 }}
                  >
                    <div>KW {kw}</div>
                    <div className={`${isCurrent ? "text-neutral-900" : "text-neutral-500"} text-[10px] font-medium`}>
                      {from} – {to}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tage */}
            <div className="flex border-b border-neutral-800">
              <div
                className="shrink-0 border-r border-neutral-800 px-2 py-2 text-xs text-neutral-400"
                style={{ width: NAME_COL_W }}
              >
                Mitarbeiter
              </div>

              {Array.from({ length: COLS }).map((_, i) => {
                const label = DAY_LABELS[i % 6];
                const isWeekBoundary = i % 6 === 0;
                const isActive = activeCol === i;

                return (
                  <div
                    key={i}
                    className={`text-[11px] text-center border-r border-neutral-800 py-2 ${
                      isWeekBoundary ? "bg-neutral-900/50" : "bg-neutral-950"
                    } ${isActive ? "ring-2 ring-blue-500/70 bg-blue-500/10" : ""} text-neutral-300`}
                    style={{ width: CELL_W }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Mitarbeiterzeilen */}
            {mitarbeiter.map((m: any) => {
              const rowId = String(m.id);
              const rowParts = parts.filter((p) => String(p.rowId) === rowId);
              const packed = packDaySegments(rowId, weekRow);

              return (
                <div key={rowId} className="flex border-b border-neutral-800 last:border-b-0">
                  <div
                    className="shrink-0 border-r border-neutral-800 px-2 flex items-center text-sm text-neutral-100"
                    style={{ width: NAME_COL_W, height: ROW_H }}
                  >
                    <div className="truncate">{m.name}</div>
                  </div>

                  <div className="relative" style={{ width: COLS * CELL_W, height: ROW_H }}>
                    {/* Raster + Drop-Zellen */}
                    <div className="absolute inset-0">
                      {Array.from({ length: COLS }).map((_, col) => {
                        const isWeekBoundary = col % 6 === 0;
                        const isActive = activeCol === col;

                        return (
                          <div
                            key={col}
                            className={`absolute top-0 bottom-0 border-r border-neutral-800 ${
                              isWeekBoundary ? "bg-neutral-900/35" : "bg-neutral-950"
                            } ${isActive ? "bg-blue-500/5" : ""}`}
                            style={{ left: col * CELL_W, width: CELL_W }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => onDropOnRow(e, { rowId, weekRow, col })}
                          >
                            <div
                              className="absolute left-0 right-0 border-t border-neutral-800/70"
                              style={{ top: PROJECT_BAND_H }}
                            />
                            {Array.from({ length: BOOKING_LANES - 1 }).map((__, i) => (
                              <div
                                key={i}
                                className="absolute left-0 right-0 border-t border-neutral-800/40"
                                style={{ top: PROJECT_BAND_H + (i + 1) * BOOKING_LANE_H }}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>

                    {/* Buchungs-Segmente */}
                    {packed.map((seg) => {
                      const topPx = PROJECT_BAND_H + seg.lane * BOOKING_LANE_H + 4;
                      const leftPx = seg.col * CELL_W + seg.leftPx;

                      return (
                        <div
                          key={seg.key}
                          className="absolute z-10 rounded-md border border-neutral-800 overflow-hidden"
                          style={{
                            top: topPx,
                            left: leftPx,
                            width: seg.widthPx,
                            height: BOOKING_LANE_H - 8,
                          }}
                          title={seg.tooltip}
                        >
                          <div className={`absolute inset-0 ${seg.colorClass}`} />
                          <div className="absolute inset-0 bg-neutral-950/55" />
                          <div className="relative h-full flex items-center justify-center text-[10px] font-semibold text-neutral-100 tabular-nums">
                            {seg.label}
                          </div>
                        </div>
                      );
                    })}

                    {/* Projektblöcke */}
                    {rowParts.map((p) => {
                      const meisterBadge = meisterColorClass(p.meisterId);
                      const isDragging = draggingId === p.projectId;
                      const isRunningProject = String(running?.projektId ?? "") === String(p.projectId);

                      const blockLeft = p.startCol * CELL_W + 2;
                      const blockTop = 2;
                      const blockW = p.span * CELL_W - 4;
                      const blockH = PROJECT_BAND_H - 4;

                      const totalMin = projTotals.totalMin.get(p.projectId) ?? 0;
                      const planMin = Math.max(0, p.planMinuten);

                      return (
                        <div
                          key={p.key}
                          draggable
                          onDragStart={(e) => onDragStart(e, p.projectId)}
                          onDragEnd={onDragEnd}
                          className={`absolute z-20 rounded-lg border overflow-hidden select-none ${
                            isDragging
                              ? "border-orange-500 bg-neutral-800 text-neutral-100 opacity-70"
                              : isRunningProject
                              ? "border-blue-500 bg-neutral-900 text-neutral-100"
                              : "border-orange-500/80 bg-neutral-900 text-neutral-100"
                          }`}
                          style={{ top: blockTop, left: blockLeft, width: blockW, height: blockH }}
                          title={`${p.name}\nGesamt: ${minutesToHM(totalMin)} / Kalk: ${minutesToHM(planMin)}\nStart: ${
                            p.firstIso ?? "—"
                          }`}
                        >
                          {/* Raster im Block + Freitag/Samstag-Cut */}
                          <div className="absolute inset-0 flex">
                            {Array.from({ length: p.span }).map((_, i) => {
                              const cellDate = dateForCol(p.weekRow, p.startCol + i);
                              const dow = cellDate.getUTCDay();
                              const isFriOrSat = dow === 5 || dow === 6;

                              return (
                                <div
                                  key={i}
                                  className={`relative h-full border-r border-neutral-800/60 ${
                                    isFriOrSat ? "bg-neutral-900" : "bg-neutral-950"
                                  }`}
                                  style={{ width: CELL_W }}
                                >
                                  {isFriOrSat ? (
                                    <>
                                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-neutral-950" />
                                      <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-neutral-950" />
                                      <div
                                        className="absolute inset-0 opacity-40"
                                        style={{
                                          backgroundImage:
                                            "repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 4px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 10px)",
                                        }}
                                      />
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>

                          {/* Fortschritt */}
                          <div className="absolute inset-0">{renderProjectProgressOverlay(p)}</div>

                          {/* Label nur am Startteil */}
                          {p.relStart === 0 ? (
                            <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`h-3.5 w-3.5 rounded-sm ${meisterBadge}`} />
                                <div className="truncate text-[12px] font-semibold text-neutral-100">{p.name}</div>
                                <div className="ml-2 text-[10px] text-neutral-300 whitespace-nowrap">
                                  {minutesToHM(totalMin)} / {minutesToHM(planMin)}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 relative">
      {renderSection(0, topWeeks, scrollTopRef)}
      {renderSection(1, bottomWeeks, scrollBottomRef)}
      <div className="text-xs text-neutral-500">
        Projektblock-Länge ist dynamisch (Parallelität verkürzt, Überschreitung verlängert). Freitag+Samstag gelten als
        Pause, wenn dort nicht gebucht wurde.
      </div>
    </div>
  );
}
