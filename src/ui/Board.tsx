// src/ui/Board.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { State } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";
import { DEFAULT_WOCHENMODELL, sollMinutenForIsoDate } from "../core/workModel";
import { getStatus } from "../core/timeRules";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;

  activeBookingProjektId: string;
  setActiveBookingProjektId: (pid: string) => void;
};

type Bereich = "maschine" | "bank" | "lack" | "montage";

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

const COLS = 24; // 4 Wochen * 6 Tage
const CELL_W = 80;
const NAME_COL_W = 150;

// ===== Darstellung: variable Tagesbreite (Mo–Do breiter | Fr/Sa schmal) =====
function dayWidthFactor(col: number) {
  const dayIdx = col % 6; // 0=Mo ... 4=Fr 5=Sa
  if (dayIdx <= 3) return 1.25; // Mo–Do
  return 0.7; // Fr & Sa
}
function dayWidthPx(col: number) {
  return Math.round(CELL_W * dayWidthFactor(col));
}
function colLeftPx(col: number) {
  let x = 0;
  for (let i = 0; i < col; i++) x += dayWidthPx(i);
  return x;
}
function totalGridWidthPx() {
  let w = 0;
  for (let i = 0; i < COLS; i++) w += dayWidthPx(i);
  return w;
}

// Band 1 (oben): Projektspur
const PROJECT_BAND_H = 32;

// Projekte parallel in 2 Lanes in der Projektspur
const MAX_PROJECT_LANES = 2;
const PROJECT_LANE_H = PROJECT_BAND_H / MAX_PROJECT_LANES;

// Buchungen-Lanes
const MIN_BOOKING_LANES = 2;
const MAX_BOOKING_LANES = 4;
const BOOKING_LANE_H = 24;

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
function weekEndDisplayMoSaCapped(weekStartMonday: Date): Date {
  const year = weekStartMonday.getUTCFullYear();
  const end = addDays(weekStartMonday, 5);
  const dec31 = new Date(Date.UTC(year, 11, 31, 0, 0, 0, 0));
  return end.getTime() > dec31.getTime() ? dec31 : end;
}
function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
function ddmm(d: Date) {
  const day = pad2(d.getUTCDate());
  const mon = pad2(d.getUTCMonth() + 1);
  return `${day}.${mon}`;
}
function isBereich(x: unknown): x is Bereich {
  return x === "maschine" || x === "bank" || x === "lack" || x === "montage";
}

// ===== Robuste Feldzugriffe =====
function pickIso(e: any): string {
  const cands = [e?.datum, e?.date, e?.iso, e?.day];
  for (const c of cands) {
    if (typeof c !== "string") continue;
    const s = c.trim();
    if (!s) continue;
    const head = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
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
function meisterSoftBgClass(meisterId: string | null) {
  if (!meisterId) return "bg-orange-500/15";
  const palette = [
    "bg-orange-500/15",
    "bg-blue-500/15",
    "bg-emerald-500/15",
    "bg-fuchsia-500/15",
    "bg-amber-400/15",
    "bg-cyan-500/15",
    "bg-lime-500/15",
    "bg-violet-500/15",
  ];
  const idx = hashStr(meisterId) % palette.length;
  return palette[idx];
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
type LayoutPos = { rowId: string; startCol: number; lane?: number };
type LayoutMap = Record<string, LayoutPos>;

type Block = {
  id: string;
  name: string;
  rowId: string;
  lane: number;
  startColTop: number;
  spanCols: number;
  meisterId: string | null;
  planMinuten: number;
  startIso: string;
  firstIso: string | null;
};

type BlockPart = {
  key: string;
  projectId: string;
  name: string;
  rowId: string;
  lane: number;
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
type PackResult = {
  segs: PackedSeg[];
  lanes: number;
};

function pickColorForProject(_projectId: string, meisterId: string | null) {
  return meisterColorClass(meisterId);
}

export default function Board({
  state,
  setState,
  ms,
  activeBookingProjektId: _activeBookingProjektId,
  setActiveBookingProjektId: _setActiveBookingProjektId,
}: Props) {
  const mitarbeiter = (ms as any)?.mitarbeiter ?? [];
  const meisterFarbeById = useMemo(() => {
  const map = new Map<string, string>();
  for (const m of (mitarbeiter as any[])) {
    if (String((m as any).rolle) === "meister") {
      const f = String((m as any).farbe ?? "").trim();
      if (f) map.set(String(m.id), f);
    }
  }
  return map;
}, [mitarbeiter]);

function getMeisterFarbe(meisterId: string): string | null {
  const f = meisterFarbeById.get(String(meisterId));
  return f ? f : null;
}

  const selectedMitarbeiter = (mitarbeiter as any[]).find((m) => String(m.id) === String((ms as any)?.selectedId));
const selectedRolle = String((selectedMitarbeiter as any)?.rolle ?? "geselle");
const canPlan = selectedRolle === "meister";
const plannerMeisterId = canPlan ? String((selectedMitarbeiter as any)?.id) : "";

  const projects = (state as any)?.projects ?? [];
  const running = (state as any)?.running ?? null;
    // ===== Viewport-Fit: Board automatisch skalieren (8 Wochen komplett sichtbar, inkl. Vollbild) =====
const boardViewportRef = useRef<HTMLDivElement | null>(null);
const boardContentRef = useRef<HTMLDivElement | null>(null);
const [boardScale, setBoardScale] = useState<number>(1);

useLayoutEffect(() => {
  function recomputeScale() {
    const vp = boardViewportRef.current;
    const ct = boardContentRef.current;
    if (!vp || !ct) return;

    // verfügbare Fläche links (ohne Pool rechts)
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;

    // tatsächliche Inhaltsgröße (unskaliert)
    const cw = ct.scrollWidth;
    const ch = ct.scrollHeight;

    if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return;

    // ✅ sowohl Breite als auch Höhe berücksichtigen
    let s = Math.min(vw / cw, vh / ch);

    // ✅ auch hochskalieren (damit Vollbild wirklich "größer" wirkt), aber begrenzen
    const MAX = 1.35;
    s = Math.max(0.5, Math.min(MAX, s));

    setBoardScale(Math.round(s * 1000) / 1000);
  }

  recomputeScale();
  window.addEventListener("resize", recomputeScale);

  const ro = new ResizeObserver(() => recomputeScale());
  if (boardViewportRef.current) ro.observe(boardViewportRef.current);
  if (boardContentRef.current) ro.observe(boardContentRef.current);

  return () => {
    window.removeEventListener("resize", recomputeScale);
    ro.disconnect();
  };
}, []);



  const meister = useMemo(() => {
  return (mitarbeiter ?? []).filter((m: any) => String((m as any)?.rolle ?? "geselle") === "meister");
}, [mitarbeiter]);

const isMeisterRow = (rowId: string) => meister.some((m: any) => String(m.id) === String(rowId));


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

  const bookingLanePrefsRef = useRef<Map<string, Map<string, number>>>(new Map());

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

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p: any) => p?.active !== false && p?.status !== "archiv"),
    [projects]
  );

  const layout: LayoutMap = ((state as any)?.boardLayout ?? {}) as LayoutMap;

  const poolProjects = useMemo(() => activeProjects.filter((p: any) => !layout[String(p.id)]), [activeProjects, layout]);

  const boardProjects = useMemo(() => activeProjects.filter((p: any) => !!layout[String(p.id)]), [activeProjects, layout]);

  const projectById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of projects ?? []) m.set(String(p.id), p);
    return m;
  }, [projects]);

  const projTotals = useMemo(() => extractProjectTotals(state as any), [state]);
  const empDayProjIdx = useMemo(() => extractEmployeeDayProjectMinutes(state as any), [state]);

  function calcNeededColsFromStart(projectId: string, startIso: string, minutesTarget: number): number {
    if (minutesTarget <= 0) return 1;

    let remain = minutesTarget;
    let cols = 0;

    const MAX_COLS = COLS * 2;
    const start = parseIso(startIso);

    for (let i = 0; i < MAX_COLS; i++) {
      const dayIso = isoDate(addDays(start, i));
      const key = `${projectId}__${dayIso}`;

      const bookedThatDay = projTotals.dayMin.get(key) ?? 0;

      const dow = parseIso(dayIso).getUTCDay();
      const isFriOrSat = dow === 5 || dow === 6;

      if (isFriOrSat && bookedThatDay <= 0) {
        cols++;
        continue;
      }

      const workerCount = Math.max(1, projTotals.dayWorkers.get(key)?.size ?? 1);
      const dayCap = BASE_CAP_MIN * workerCount;

      const take = Math.min(remain, dayCap);
      remain -= take;

      cols++;
      if (remain <= 0) break;
    }

    return Math.max(1, cols);
  }

  // Blocks: NUR Projekte, die wirklich im Layout stehen
  const rawBlocks: Block[] = useMemo(() => {
    if (mitarbeiter.length === 0) return [];

    return boardProjects
      .map((p: any) => {
        const pid = String(p.id);
        const meisterId = pickPlannerMeisterId(p);

        const pos = layout[pid];
        if (!pos) return null;

        const plannedStartColTop = clamp(pos.startCol ?? 0, 0, COLS - 1);
        const rowId = String(pos.rowId);
        const lane = clamp(Number(pos.lane ?? 0), 0, 1);

        const planMinuten = Math.max(0, Math.round((safeNumber(p.kalkStunden) || 0) * 60));
        const bookedMinuten = projTotals.totalMin.get(pid) ?? 0;
        const minutesTarget = Math.max(planMinuten, bookedMinuten);

        const plannedStartIso = isoDate(dateForCol(0, plannedStartColTop));

        const firstIso = projTotals.firstIso.get(pid) ?? null;
        const firstColTop = firstIso ? colForIso(0, firstIso) : null;
        const startColTop = clamp(firstColTop ?? plannedStartColTop, 0, COLS - 1);

        const startIso = firstIso ?? plannedStartIso;
        const spanCols = clamp(calcNeededColsFromStart(pid, startIso, minutesTarget), 1, COLS * 2);

        return {
          id: pid,
          name: String(p.name ?? "Projekt"),
          rowId,
          lane,
          startColTop,
          spanCols,
          meisterId,
          planMinuten,
          startIso,
          firstIso,
        };
      })
      .filter(Boolean) as Block[];
  }, [boardProjects, layout, mitarbeiter.length, projTotals, topWeeks, bottomWeeks]);

  // Ketten-Layout pro Lane (keine Overlaps innerhalb einer Lane)
  const blocks: Block[] = useMemo(() => {
    const byRowLane = new Map<string, Block[]>();
    for (const b of rawBlocks) {
      const k = `${b.rowId}__${clamp(Number(b.lane ?? 0), 0, 1)}`;
      if (!byRowLane.has(k)) byRowLane.set(k, []);
      byRowLane.get(k)!.push({ ...b });
    }

    const out: Block[] = [];

    const visibleSpanColsFor = (blk: Block) => {
      let lastVisible = -1;
      const start = parseIso(String(blk.startIso));
      for (let off = 0; off < blk.spanCols; off++) {
        const dayIso = isoDate(addDays(start, off));
        const dow = parseIso(dayIso).getUTCDay();
        const isFriOrSat = dow === 5 || dow === 6;
        const key = `${blk.id}__${dayIso}`;
        const booked = projTotals.dayMin.get(key) ?? 0;
        const visible = !(isFriOrSat && booked <= 0);
        if (visible) lastVisible = off;
      }
      return Math.max(1, lastVisible + 1);
    };

    for (const [, arr] of byRowLane.entries()) {
      const sorted = arr.slice().sort((a, b) => a.startColTop - b.startColTop);
      let cursor = 0;

      for (let i = 0; i < sorted.length; i++) {
        const b = sorted[i];
        if (i === 0) {
          const vis = visibleSpanColsFor(b);
          cursor = clamp(b.startColTop, 0, COLS - 1) + vis;
          out.push(b);
          continue;
        }

        const desiredStart = clamp(b.startColTop, 0, COLS - 1);
        const newStart = clamp(Math.max(desiredStart, cursor), 0, COLS - 1);
        b.startColTop = newStart;

        const vis = visibleSpanColsFor(b);
        cursor = newStart + vis;
        out.push(b);
      }
    }

    return out;
  }, [rawBlocks, projTotals.dayMin]);

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
        lane: b.lane,
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
        lane: b.lane,
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

  // ===== Drag & Drop UX =====
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [hoverPool, setHoverPool] = useState(false);

  function clearDnDHovers() {
    setHoverRowId(null);
    setHoverPool(false);
  }

  function saveLayout(projectId: string, nextPos: { rowId: string; startCol: number; lane: number }) {
    setState((s) => {
      const next = structuredClone(s) as any;
      if (!next.boardLayout) next.boardLayout = {};
      next.boardLayout[String(projectId)] = nextPos;

      // Zuordnung ins Projekt schreiben (Nachvollziehbarkeit / Statistik)
      const pid = String(projectId);
      const rowId = String(nextPos.rowId);

      if (Array.isArray(next.projects)) {
        const idx = next.projects.findIndex((p: any) => String(p?.id) === pid);
        if (idx >= 0) {
          const proj = next.projects[idx];
          next.projects[idx] = { ...proj, zugeordnetAnId: rowId };
        }
      }

      return next;
    });
  }

  function removeFromLayout(projectId: string) {
    setState((s) => {
      const next = structuredClone(s) as any;
      if (!next.boardLayout) return next;
      delete next.boardLayout[String(projectId)];
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, projectId: string) {
    setDraggingId(projectId);
    clearDnDHovers();

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(projectId));

    const pos = (layout as any)?.[String(projectId)];
    const lane = clamp(Number(pos?.lane ?? 0), 0, 1);
    e.dataTransfer.setData("application/x-orgaboard-lane", String(lane));
  }

  function onDragEnd() {
    setDraggingId(null);
    clearDnDHovers();
  }

  function onDropOnRow(e: React.DragEvent, target: { rowId: string; weekRow: 0 | 1; col: number }) {
    e.preventDefault();

    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;

    // Nur oben einplanen
    if (target.weekRow !== 0) return;

    const rowId = String(target.rowId);
    const col = clamp(target.col, 0, COLS - 1);

    const draggedLaneRaw = e.dataTransfer.getData("application/x-orgaboard-lane");
    let lane = clamp(Number(draggedLaneRaw || 0), 0, 1);

    if ((e as any).shiftKey) lane = lane === 0 ? 1 : 0;

    const laneOccupied = (testLane: number) =>
      blockParts.some(
        (p) =>
          p.weekRow === 0 &&
          String(p.rowId) === rowId &&
          clamp(Number(p.lane ?? 0), 0, 1) === testLane &&
          col >= p.startCol &&
          col < p.startCol + p.span
      );

    if (laneOccupied(lane) && !laneOccupied(lane === 0 ? 1 : 0)) lane = lane === 0 ? 1 : 0;

    saveLayout(projectId, { rowId, startCol: col, lane });

    setDraggingId(null);
    clearDnDHovers();
  }

  // Fokus auf laufendes Projekt
  useEffect(() => {
    const pid = running?.projektId ? String(running.projektId) : null;
    if (!pid) return;

    const part = blockParts.find((p) => p.projectId === pid && p.weekRow === 0) ?? blockParts.find((p) => p.projectId === pid);
    if (!part) return;

    const sc = part.weekRow === 0 ? scrollTopRef.current : scrollBottomRef.current;
    if (!sc) return;

    const x = NAME_COL_W + colLeftPx(part.startCol) - sc.clientWidth * 0.35;
    sc.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
  }, [running?.projektId, blockParts]);

  // --------- Buchungen packen ----------
  function packDaySegments(rowId: string, weekRow: 0 | 1): PackResult {
    const segs: PackedSeg[] = [];
    let maxLaneUsed = 0;

    const stableKey = `${rowId}__${weekRow}`;
    const prefStore = bookingLanePrefsRef.current;
    if (!prefStore.has(stableKey)) prefStore.set(stableKey, new Map<string, number>());
    const lanePref = prefStore.get(stableKey)!;

    for (let col = 0; col < COLS; col++) {
      const iso = isoDate(dateForCol(weekRow, col));
      const dayKey = `${rowId}__${iso}`;

      const entries = empDayProjIdx.get(dayKey) ?? [];
      if (entries.length === 0) continue;

      const m = mitarbeiter.find((x: any) => String(x.id) === String(rowId));
      const soll = sollMinutenFor(m, iso);
      const denom = Math.max(1, soll > 0 ? soll : BASE_CAP_MIN);

      const usedPxByLane: number[] = Array.from({ length: MIN_BOOKING_LANES }, () => 0);

      const sorted = entries.slice().sort((a, b) => b.minuten - a.minuten);

      for (const e of sorted) {
        const projId = String(e.projektId);
        const proj = projectById.get(projId);
        const meisterId = pickPlannerMeisterId(proj);

        const dayW = dayWidthPx(col);

        const widthPxRaw = (Math.max(0, e.minuten) / denom) * dayW;
        const widthPx = clamp(Math.round(widthPxRaw), 10, dayW - 4);

        let lane = lanePref.has(projId) ? (lanePref.get(projId) as number) : 0;
        lane = clamp(lane, 0, MAX_BOOKING_LANES - 1);

        while (true) {
          if (lane >= usedPxByLane.length) {
            if (usedPxByLane.length < MAX_BOOKING_LANES) usedPxByLane.push(0);
            else break;
          }

          const safeLane = Math.min(lane, usedPxByLane.length - 1);
          const used = usedPxByLane[safeLane];

          if (used + widthPx + 2 <= dayW - 2) {
            lane = safeLane;
            break;
          }

          if (lane >= MAX_BOOKING_LANES - 1) {
            lane = MAX_BOOKING_LANES - 1;
            break;
          }
          lane++;
        }

        const leftPx = clamp(usedPxByLane[lane] + 2, 2, dayW - 2);
        const maxW = Math.max(6, dayW - 2 - leftPx);
        const w = Math.min(widthPx, maxW);

        usedPxByLane[lane] = leftPx + w;

        const pname = String(proj?.name ?? projId);
        const label = `${Math.round(e.minuten / 30) / 2}h`;
        const tooltip = `${pname}\n${iso}\nIst: ${minutesToHM(e.minuten)}`;
        const colorClass = pickColorForProject(projId, meisterId);

        segs.push({
          key: `${dayKey}__${projId}__${lane}__${leftPx}`,
          col,
          lane,
          leftPx,
          widthPx: w,
          label,
          tooltip,
          colorClass,
        });

        lanePref.set(projId, lane);

        if (lane + 1 > maxLaneUsed) maxLaneUsed = lane + 1;
      }
    }

    return { segs, lanes: Math.min(MAX_BOOKING_LANES, Math.max(MIN_BOOKING_LANES, maxLaneUsed)) };
  }
function hasOtherProjectBooking(rowId: string, iso: string, projectId: string): boolean {
  // ✅ nutzt den vorhandenen Index empDayProjIdx (kein "buchungen" nötig)
  const entries = empDayProjIdx.get(`${rowId}__${iso}`) ?? [];
  return entries.some((e) => String(e.projektId) !== String(projectId) && (e.minuten ?? 0) > 0);
}

  // ===== Plan-Linie mit Lücken =====
  function buildPlanOutlineSegments(p: BlockPart, rowId: string): Array<{ start: number; span: number }> {
  const segs: Array<{ start: number; span: number }> = [];

  let curStart: number | null = null;
  let curLen = 0;

  for (let i = 0; i < p.span; i++) {
    const iso = isoDate(dateForCol(p.weekRow, p.startCol + i));
    const bookedThisProject = (projTotals.dayMin.get(`${p.projectId}__${iso}`) ?? 0) > 0;

    // ✅ Fr/Sa sollen nur zählen, wenn es für dieses Projekt an dem Tag wirklich Buchungen gibt
    const dow = parseIso(iso).getUTCDay(); // 0=So..6=Sa
    const isFriOrSat = dow === 5 || dow === 6;
    const gapBecauseWeekend = isFriOrSat && !bookedThisProject;

    // ✅ alte Regel bleibt: wenn ein anderes Projekt an dem Tag Buchungen hat,
    // und dieses Projekt nicht → Lücke im Plan
    const gapBecauseOther = !bookedThisProject && hasOtherProjectBooking(rowId, iso, p.projectId);

    const gap = gapBecauseWeekend || gapBecauseOther;
    const visible = !gap;

    if (visible) {
      if (curStart === null) curStart = i;
      curLen++;
    } else {
      if (curStart !== null) {
        segs.push({ start: curStart, span: curLen });
        curStart = null;
        curLen = 0;
      }
    }
  }

  if (curStart !== null) segs.push({ start: curStart, span: curLen });
  return segs;
}


  // ===== Status-Overlay =====
  function renderStatusOverlay(rowId: string, weekRow: 0 | 1, lanes: number) {
    const out: React.ReactNode[] = [];
    for (let col = 0; col < COLS; col++) {
      const iso = isoDate(dateForCol(weekRow, col));
      const status = getStatus((state as any)?.buchungen ?? [], iso, rowId);
      if (!status) continue;

      let label = "";
      let color = "";

      if (status.art === "urlaub") {
        label = "Urlaub";
        color = "bg-emerald-600/80";
      } else if (status.art === "ueberstundenabbau") {
        label = "Ü-Abbau";
        color = "bg-indigo-600/80";
      } else if (status.art === "krank") {
        label = "Krank";
        color = "bg-rose-600/80";
      } else {
        continue;
      }

      out.push(
        <div
          key={`${rowId}__${iso}__status`}
          className="absolute z-[5] rounded-md text-[10px] font-semibold text-neutral-950 px-1.5 py-0.5 shadow"
          style={{
            left: colLeftPx(col) + 6,
            top: PROJECT_BAND_H + Math.max(MIN_BOOKING_LANES, lanes) * BOOKING_LANE_H - 18,
          }}
          title={`${label} · ${iso}`}
        >
          <div className={`rounded ${color} px-1.5 py-0.5`}>{label}</div>
        </div>
      );
    }
    return out;
  }

  // ===== Projekt-Fortschritt-Overlay =====
  function renderProjectProgressOverlay(p: BlockPart) {
    const totalMin = projTotals.totalMin.get(p.projectId) ?? 0;
    const planMin = Math.max(0, p.planMinuten);
    const first = p.firstIso;

    if (totalMin <= 0 || !first) return null;

    let remainIn = planMin > 0 ? Math.min(totalMin, planMin) : 0;
    let remainOver = planMin > 0 ? Math.max(0, totalMin - planMin) : totalMin;

    const segs: Array<{ left: number; width: number; kind: "in" | "over" }> = [];

    for (let localDay = 0; localDay < p.span; localDay++) {
      if (remainIn <= 0 && remainOver <= 0) break;

      const col = p.startCol + localDay;
      const dayW = dayWidthPx(col);

      let dayOffset = 0;
      for (let i = 0; i < localDay; i++) dayOffset += dayWidthPx(p.startCol + i);

      const globalDay = p.relStart + localDay;
      const dayIso = isoDate(addDays(parseIso(first), globalDay));
      const key = `${p.projectId}__${dayIso}`;
      const bookedThatDay = projTotals.dayMin.get(key) ?? 0;

      const dayCapMin = bookedThatDay;
      if (dayCapMin <= 0) continue;

      const takeIn = remainIn > 0 ? Math.min(remainIn, dayCapMin) : 0;
      const takeOver = takeIn === 0 && remainOver > 0 ? Math.min(remainOver, dayCapMin) : 0;

      const used = takeIn > 0 ? takeIn : takeOver;
      if (used <= 0) continue;

      const wPx = clamp(Math.round((used / dayCapMin) * dayW), 2, dayW);

      segs.push({ left: dayOffset, width: wPx, kind: takeIn > 0 ? "in" : "over" });

      if (takeIn > 0) remainIn -= takeIn;
      else remainOver -= takeOver;
    }

    if (segs.length === 0) return null;

    return (
      <>
        {segs.map((s, idx) =>
          s.kind === "in" ? (
            <div key={idx} className="absolute top-0 bottom-0 bg-blue-500/45" style={{ left: s.left, width: s.width }}>
              <div className="absolute inset-0 bg-blue-900/10" />
            </div>
          ) : (
            <div key={idx} className="absolute top-0 bottom-0 bg-red-600" style={{ left: s.left, width: s.width }} />
          )
        )}
      </>
    );
  }

  function renderSection(weekRow: 0 | 1, weeks4: Date[], scrollRef: React.RefObject<HTMLDivElement>) {
    const parts = blockParts.filter((p) => p.weekRow === weekRow);
    const activeCol = running?.datum ? colForIso(weekRow, String(running.datum).slice(0, 10)) : null;

    const KW_H = 40;
    const DAY_H = 44;

    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden h-full">
        <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden h-full">
          <div className="min-w-max">
            {/* KW Header */}
            <div className="flex">
              <div className="shrink-0 border-r border-neutral-800" style={{ width: NAME_COL_W, height: KW_H }} />
              {weeks4.map((wStart, idx) => {
                const isCurrent = weekRow === 0 && idx === 1;
                const kw = kalenderjahrKW(wStart);
                const from = isoDate(wStart);
                const to = isoDate(weekEndDisplayMoSaCapped(wStart));

                const weekW = Array.from({ length: 6 })
                  .map((_, i) => dayWidthPx(idx * 6 + i))
                  .reduce((a, b) => a + b, 0);

                return (
                  <div
                    key={idx}
                    className={`flex flex-col items-center justify-center text-xs font-semibold border-r border-neutral-800 ${
                      isCurrent ? "bg-orange-500 text-neutral-950 ring-2 ring-orange-300/70" : "bg-neutral-900 text-neutral-300"
                    }`}
                    style={{ width: weekW, height: KW_H }}
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
            <div className="flex border-b border-neutral-800" style={{ height: DAY_H }}>
              <div
                className="shrink-0 border-r border-neutral-800 px-2 py-1 text-[11px] text-neutral-400 flex items-center"
                style={{ width: NAME_COL_W, height: DAY_H }}
              >
                Mitarbeiter
              </div>

              {Array.from({ length: COLS }).map((_, i) => {
                const label = DAY_LABELS[i % 6];
                const isWeekBoundary = i % 6 === 0;
                const isActive = activeCol === i;
                const d = dateForCol(weekRow, i);
                const dateLabel = ddmm(d);

                return (
                  <div
                    key={i}
                    className={`text-[11px] text-center border-r border-neutral-800 py-1 ${
                      isWeekBoundary ? "bg-neutral-900/50" : "bg-neutral-950"
                    } ${isActive ? "ring-2 ring-blue-500/70 bg-blue-500/10" : ""} text-neutral-300`}
                    style={{ width: dayWidthPx(i), height: DAY_H }}
                  >
                    <div className="leading-4">{label}</div>
                    <div className="text-[10px] text-neutral-500 leading-4">{dateLabel}</div>
                  </div>
                );
              })}
            </div>

            {/* Mitarbeiterzeilen */}
            {mitarbeiter.map((m: any) => {
              const rowId = String(m.id);
              const rowParts = parts.filter((p) => String(p.rowId) === rowId);

              const pack = packDaySegments(rowId, weekRow);
              const lanes = pack.lanes;

              const capped = Math.min(MAX_BOOKING_LANES, Math.max(MIN_BOOKING_LANES, lanes));
              const rowH = PROJECT_BAND_H + capped * BOOKING_LANE_H;

              return (
                <div key={rowId} className="flex border-b border-neutral-800 last:border-b-0">
                  <div
  className="shrink-0 border-r border-neutral-800 px-2 flex items-center text-[13px] text-neutral-200"
  style={{
    width: NAME_COL_W,
    height: rowH,
    background:
      String((m as any).rolle) === "meister" && getMeisterFarbe(String(m.id))
        ? hexToRgba(getMeisterFarbe(String(m.id)) as string, 0.18)
        : "rgba(23,23,23,0.6)",
  }}
>

  <div className="flex items-center gap-2 min-w-0">
    <div className="flex items-center gap-2 min-w-0">
  {String((m as any).rolle) === "meister" && getMeisterFarbe(String(m.id)) ? (
    <div className="h-3 w-3 rounded-sm" style={{ background: getMeisterFarbe(String(m.id)) as string }} />
  ) : null}
  <div className="truncate font-medium">{m.name}</div>
</div>


    {String((m as any).rolle) === "azubi" ? (
      <span className="rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-300">
        Azubi
      </span>
    ) : null}
  </div>
</div>


                  <div
  className={`${draggingId && hoverRowId === String(rowId) ? "ring-2 ring-orange-500/70" : ""}`}
  style={{ width: totalGridWidthPx(), height: rowH, position: "relative" }}
>



                   {/* Raster */}
<div className="absolute inset-0">
  {/* Hintergrund (Fr/Sa dunkler) */}
  {Array.from({ length: COLS }).map((_, col) => {
    const d = dateForCol(weekRow, col);
    const dow = d.getDay(); // lokal, UI-konsistent
    const isFriOrSat = dow === 5 || dow === 6;

    return (
      <div
        key={`bg-${weekRow}-${col}`}
        className={`absolute top-0 bottom-0 border-r border-neutral-800 ${
          isFriOrSat ? "bg-neutral-900/70" : "bg-neutral-950"
        }`}
        style={{ left: colLeftPx(col), width: dayWidthPx(col) }}
      />
    );
  })}

  {/* Drop-Zonen (müssen über dem Hintergrund liegen!) */}
  {Array.from({ length: COLS }).map((_, col) => (
    <div
      key={`drop-${rowId}-${weekRow}-${col}`}
      className="absolute top-0 bottom-0"
      style={{ left: colLeftPx(col), width: dayWidthPx(col) }}
      onDragOver={(e) => {
        e.preventDefault();
        setHoverRowId(String(rowId));
        setHoverPool(false);
      }}
      onDragEnter={() => {
        setHoverRowId(String(rowId));
        setHoverPool(false);
      }}
      onDrop={(e) => onDropOnRow(e, { rowId, weekRow, col })}
    >
      {/* horizontale Linien */}
      <div
        className="absolute left-0 right-0 border-t border-neutral-800/70"
        style={{ top: PROJECT_BAND_H }}
      />
      {Array.from({ length: Math.max(0, capped - 1) }).map((__, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 border-t border-neutral-800/40"
          style={{ top: PROJECT_BAND_H + (i + 1) * BOOKING_LANE_H }}
        />
      ))}
    </div>
  ))}
</div>
                    {/* Buchungen */}
                    {pack.segs.map((seg) => {
                      const topPx = PROJECT_BAND_H + seg.lane * BOOKING_LANE_H + 4;
                      const leftPx = colLeftPx(seg.col) + seg.leftPx;

                      return (
                        <div
                          key={seg.key}
                          className={`absolute z-10 rounded-md overflow-hidden border ${
  String((m as any).rolle) === "azubi"
    ? "border-dashed border-neutral-400"
    : "border-neutral-800"
}`}

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
                          <div className="relative h-full flex items-center justify-center text-[10px] font-semibold text-neutral-100">
                            {seg.label}
                          </div>
                        </div>
                      );
                    })}

                    {renderStatusOverlay(rowId, weekRow, lanes)}

                    {/* Projektblöcke */}
                    {rowParts.map((p) => {
                      const isDragging = draggingId === p.projectId;
                      const isRunningProject = String(running?.projektId ?? "") === String(p.projectId);

                      const totalMin = projTotals.totalMin.get(p.projectId) ?? 0;
                      const planMin = Math.max(0, p.planMinuten);

                      const title = `${p.name}\nGesamt: ${minutesToHM(totalMin)} / Kalk: ${minutesToHM(planMin)}\nStart: ${p.firstIso ?? "—"}`;

                      const segs = buildPlanOutlineSegments(p, rowId);
                      if (segs.length === 0) return null;

                      return (
                        <React.Fragment key={p.key}>
                          {segs.map((s, idx) => {
                            const softBg = meisterSoftBgClass(p.meisterId);

                            const absCol = p.startCol + s.start;
                            const segLeft = colLeftPx(absCol) + 2;

                            const lane = clamp(Number(p.lane ?? 0), 0, 1);
                            const segTop = 2 + lane * PROJECT_LANE_H;
                            const segH = PROJECT_LANE_H - 4;

                            let segW = 0;
                            for (let i = 0; i < s.span; i++) segW += dayWidthPx(absCol + i);
                            segW -= 4;

                            const segPart: BlockPart = {
                              ...p,
                              key: `${p.key}__seg__${idx}`,
                              startCol: p.startCol + s.start,
                              span: s.span,
                              relStart: p.relStart + s.start,
                            };

                            const showLabel = segW >= 140;

                            return (
                              <div
                                key={segPart.key}
                                draggable
                                onDragStart={(e) => onDragStart(e, p.projectId)}
                                onDragEnd={onDragEnd}
                                className={`absolute z-20 rounded-lg border overflow-hidden select-none ${
                                  isDragging
                                    ? "border-orange-500 bg-neutral-800 text-neutral-100 opacity-70"
                                    : isRunningProject
                                    ? "border-blue-500 bg-neutral-900 text-neutral-100"
                                    : `border-orange-500/80 ${softBg} text-neutral-100`
                                }`}
                                style={{
                                  top: segTop,
                                  left: segLeft,
                                  width: segW,
                                  height: segH,
                                }}
                                title={title}
                              >
                                {!isDragging && !isRunningProject ? <div className="absolute inset-0 bg-neutral-950/35" /> : null}

                                {showLabel ? (
                                  <div className="absolute inset-y-0 left-0 z-10 flex items-center pointer-events-none">
                                    <div className="ml-2 flex items-center gap-2 min-w-0 px-2 py-1 rounded bg-neutral-950/55 border border-neutral-200/10">
                                      <div className={`h-3 w-3 rounded-sm ${meisterColorClass(p.meisterId)}`} />
                                      <div className="truncate text-[11px] font-semibold text-neutral-50">{p.name}</div>
                                    </div>
                                  </div>
                                ) : null}

                                <div className="absolute inset-0">{renderProjectProgressOverlay(segPart)}</div>
                              </div>
                            );
                          })}
                        </React.Fragment>
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

  // ===============================
  // ✅ FINALER RETURN (Board + Pool)
  // ===============================
  return (
    <div className="flex w-full h-full overflow-hidden gap-3">
      {/* ===== Board links (AUTO-FIT SCALE) ===== */}
<div className="flex-1 min-w-0 overflow-hidden">
  <div
    style={{
      transform: `scale(${boardScale})`,
      transformOrigin: "top left",
      width: "fit-content",
      height: "fit-content",
    }}
  >
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden">
        {renderSection(0, topWeeks, scrollTopRef)}
      </div>
      <div className="overflow-hidden">
        {renderSection(1, bottomWeeks, scrollBottomRef)}
      </div>
    </div>
  </div>
</div>


      {/* ===== Pool rechts ===== */}
      <div className="w-72 shrink-0 border border-neutral-800 rounded-2xl bg-neutral-950 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-neutral-800">
          <div className="text-sm font-semibold text-neutral-100">Projekt-Pool</div>
          <div className="text-xs text-neutral-400">Aktive Projekte, noch nicht im Board</div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Im Pool: <span className="text-neutral-200 font-medium">{poolProjects.length}</span>
          </div>
        </div>

        <div
          className={`flex-1 p-2 overflow-y-auto space-y-2 ${draggingId && hoverPool ? "ring-2 ring-orange-500/70 ring-inset" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHoverPool(true);
            setHoverRowId(null);
          }}
          onDragLeave={() => setHoverPool(false)}
          onDrop={(e) => {
            e.preventDefault();
            const pid = e.dataTransfer.getData("text/plain");
            if (!pid) return;
            removeFromLayout(pid);
            setDraggingId(null);
            clearDnDHovers();
          }}
          title="Hierhin ziehen = Projekt aus dem Board entfernen"
        >
          {poolProjects.length === 0 ? (
            <div className="text-xs text-neutral-500 p-2">Alle aktiven Projekte sind eingeplant.</div>
          ) : (
            poolProjects.map((p: any) => (
              <div
                key={String(p.id)}
                draggable
                onDragStart={(e) => onDragStart(e, String(p.id))}
                onDragEnd={onDragEnd}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 cursor-grab active:cursor-grabbing"
                title="Ins Board ziehen: auf einen Mitarbeiter droppen"
              >
                <div className="text-xs font-medium text-neutral-100 truncate">{String(p.name ?? "Ohne Name")}</div>
                <div className="text-[10px] text-neutral-500">ID: {String(p.id)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
