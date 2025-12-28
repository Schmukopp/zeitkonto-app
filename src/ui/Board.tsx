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
const LANES = 3;

const CELL_W = 80;
const NAME_COL_W = 240;
const LANE_H = 32;

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
  const [y, m, d] = iso.split("-").map((x) => Number(x));
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
  const diff = (day === 0 ? -6 : 1) - day; // Montag
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

// ===== Kalenderjahr-KW (erste KW = Woche ab erstem Montag im Jahr) =====
function firstMondayOfYearUTC(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const dow = jan1.getUTCDay(); // 0=So..6=Sa
  const offset = (dow === 0 ? 1 : 8 - dow) % 7; // bis Montag
  return new Date(Date.UTC(year, 0, 1 + offset, 0, 0, 0, 0));
}

function kalenderjahrKW(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const year = d.getUTCFullYear();
  const firstMon = firstMondayOfYearUTC(year);

  const diffDays = Math.floor((d.getTime() - firstMon.getTime()) / 86400000);

  // Tage vor erstem Montag: wir geben KW 1 aus (praktisch, keine KW0)
  if (diffDays < 0) return 1;

  return Math.floor(diffDays / 7) + 1;
}

// Anzeige-Ende einer KW im Kalenderjahr: Mo–Sa, aber niemals über 31.12 hinaus
function weekEndDisplayMoSaCapped(weekStartMonday: Date): Date {
  const year = weekStartMonday.getUTCFullYear();
  const end = addDays(weekStartMonday, 5); // Mo–Sa
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

// ===== Meister-/Operativ-Felder aus Projekt ziehen (robust gegen Feldnamen) =====
function pickPlannerMeisterId(p: any): string | null {
  const cands = [p?.meisterId, p?.hauptverantwortlicherId, p?.verantwortlicherId, p?.ownerId];
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

// ===== Aus Buchungen: Projekt totals + first booking + Bereiche =====
function extractProjectTotals(state: any) {
  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];
  const totalMin = new Map<string, number>();
  const firstIso = new Map<string, string>();
  const areaMin = new Map<string, Record<Bereich, number>>();

  const emptyAreas = (): Record<Bereich, number> => ({ maschine: 0, bank: 0, lack: 0, montage: 0 });

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if ((e as any).art !== "arbeit") continue;

    const projektId = String((e as any).projektId ?? "");
    const datum = String((e as any).datum ?? "");
    if (!projektId || !datum) continue;

    const min = safeNumber((e as any).minuten) || safeNumber((e as any).stunden) * 60 || 0;
    const minutes = Math.max(0, Math.round(min));
    if (minutes <= 0) continue;

    totalMin.set(projektId, (totalMin.get(projektId) ?? 0) + minutes);

    const curFirst = firstIso.get(projektId);
    if (!curFirst || datum < curFirst) firstIso.set(projektId, datum);

    const bRaw = (e as any).bereich;
    const bereich: Bereich | null = isBereich(bRaw) ? bRaw : null;
    if (bereich) {
      if (!areaMin.has(projektId)) areaMin.set(projektId, emptyAreas());
      areaMin.get(projektId)![bereich] += minutes;
    }
  }

  return { totalMin, firstIso, areaMin };
}

// ===== Tages-Spuren je Mitarbeiter (alle Projekte) =====
function extractEmployeeDayProjectMinutes(
  state: any
): Map<string, Array<{ projektId: string; minuten: number }>> {
  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];
  const tmp = new Map<string, Map<string, number>>();

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if ((e as any).art !== "arbeit") continue;

    const mitarbeiterId = String((e as any).mitarbeiterId ?? "");
    const projektId = String((e as any).projektId ?? "");
    const datum = String((e as any).datum ?? "");
    if (!mitarbeiterId || !projektId || !datum) continue;

    const min = safeNumber((e as any).minuten) || safeNumber((e as any).stunden) * 60 || 0;
    const minutes = Math.max(0, Math.round(min));
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
  plannedStartColTop: number;
  spanCols: number;
  meisterId: string | null;
  planMinuten: number;
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
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function findNextFreeStartCol(
  desiredCol: number,
  spanCols: number,
  existingTopParts: Array<{ startCol: number; span: number }>,
  cols: number
) {
  const want = clamp(desiredCol, 0, cols - 1);

  for (let c = want; c < cols; c++) {
    const topSpan = Math.min(spanCols, cols - c);
    const aStart = c;
    const aEnd = c + topSpan;

    let ok = true;
    for (const p of existingTopParts) {
      const bStart = p.startCol;
      const bEnd = p.startCol + p.span;
      if (overlaps(aStart, aEnd, bStart, bEnd)) {
        ok = false;
        break;
      }
    }

    if (ok) return c;
  }

  return cols - 1;
}

function assignLanes(parts: Array<{ key: string; startCol: number; span: number }>, lanes: number) {
  const sorted = parts.slice().sort((a, b) => (a.startCol - b.startCol) || (a.span - b.span));

  const laneEnd: number[] = Array.from({ length: lanes }, () => -1);
  const laneByKey = new Map<string, number>();

  for (const p of sorted) {
    const start = p.startCol;
    const end = p.startCol + p.span;

    let placed = false;
    for (let lane = 0; lane < lanes; lane++) {
      if (start >= laneEnd[lane]) {
        laneByKey.set(p.key, lane);
        laneEnd[lane] = end;
        placed = true;
        break;
      }
    }

    if (!placed) laneByKey.set(p.key, lanes - 1);
  }

  return laneByKey;
}

export default function Board({ state, setState, ms }: Props) {
  const mitarbeiter = (ms as any)?.mitarbeiter ?? [];
  const projects = (state as any)?.projects ?? [];
  const running = (state as any)?.running ?? null;

  // 8 Wochen: oben 4, unten 4. Aktuelle Woche oben 2. von links
  const { topWeeks, bottomWeeks } = useMemo(() => {
    const now = new Date();
    const cw = startOfWeekMondayUTC(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)));
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

  function meisterColorForProject(projektId: string): string {
    const p = projectById.get(String(projektId));
    const meisterId = pickPlannerMeisterId(p);
    return meisterColorClass(meisterId);
  }

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

  const blocks: Block[] = useMemo(() => {
    if (mitarbeiter.length === 0) return [];

    return activeProjects.map((p: any) => {
      const pid = String(p.id);

      const meisterId = pickPlannerMeisterId(p);
      const pos = layout[pid] ?? autoFallback[pid];

      const plannedStartColTop = clamp(pos?.startCol ?? 0, 0, COLS - 1);
      const rowId = String(pos?.rowId ?? pickOperativDefaultId(p) ?? mitarbeiter[0]?.id ?? "m1");

      const planMinuten = Math.max(0, Math.round((safeNumber(p.kalkStunden) || 0) * 60));
      const hours = safeNumber(p.kalkStunden);
      const days = Math.max(1, Math.ceil(hours / 8));
      const spanCols = clamp(days, 1, COLS * 2); // max 2 Reihen

      return {
        id: pid,
        name: String(p.name ?? "Projekt"),
        rowId,
        plannedStartColTop,
        spanCols,
        meisterId,
        planMinuten,
      };
    });
  }, [activeProjects, layout, autoFallback, mitarbeiter]);

  function splitBlock(b: Block): BlockPart[] {
    const parts: BlockPart[] = [];

    const topStart = b.plannedStartColTop;
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

  const plannedStartIsoByProject = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) {
      const d = dateForCol(0, clamp(b.plannedStartColTop, 0, COLS - 1));
      m.set(String(b.id), isoDate(d));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // Drag & Drop
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function saveLayout(projectId: string, nextPos: LayoutPos) {
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

  function onDropOnLane(e: React.DragEvent, target: { rowId: string; weekRow: 0 | 1; col: number }) {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;

    // Planung oben verankert
    if (target.weekRow !== 0) return;

    const b = blocks.find((x) => String(x.id) === String(projectId));
    const spanCols = b ? b.spanCols : 1;

    const existingTopParts = blockParts
      .filter(
        (p) =>
          p.weekRow === 0 &&
          String(p.rowId) === String(target.rowId) &&
          String(p.projectId) !== String(projectId)
      )
      .map((p) => ({ startCol: p.startCol, span: p.span }));

    // Fortlaufend: nächste freie Stelle ab Drop-Spalte
    const snappedCol = findNextFreeStartCol(target.col, spanCols, existingTopParts, COLS);

    saveLayout(projectId, { rowId: String(target.rowId), startCol: snappedCol });
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

  // ===== DEBUG (auto) =====
  const debug = useMemo(() => {
    const all = Array.isArray((state as any)?.buchungen) ? ((state as any).buchungen as any[]) : [];
    const arbeits = all.filter((b) => b && typeof b === "object" && b.art === "arbeit");

    const sorted = arbeits
      .slice()
      .sort(
        (a, b) =>
          (safeNumber(b.endeTs) - safeNumber(a.endeTs)) || (safeNumber(b.startTs) - safeNumber(a.startTs))
      );

    const last = sorted[0] ?? null;
    const lastDatum = last ? String(last.datum ?? "") : "";
    const lastMitarbeiterId = last ? String(last.mitarbeiterId ?? "") : "";
    const lastProjektId = last ? String(last.projektId ?? "") : "";
    const lastMinuten = last ? (safeNumber(last.minuten) || safeNumber(last.stunden) * 60 || 0) : 0;

    const key = lastDatum && lastMitarbeiterId ? `${lastMitarbeiterId}__${lastDatum}` : "";
    const hits = key ? (empDayProjIdx.get(key) ?? []).length : 0;

    const last12 = sorted.slice(0, 12).map((x) => ({
      datum: String(x?.datum ?? ""),
      mitarbeiterId: String(x?.mitarbeiterId ?? ""),
      projektId: String(x?.projektId ?? ""),
      minuten: Math.max(0, Math.round(safeNumber(x?.minuten) || safeNumber(x?.stunden) * 60 || 0)),
    }));

    return {
      totalAll: all.length,
      totalArbeits: arbeits.length,
      last,
      lastDatum,
      lastMitarbeiterId,
      lastProjektId,
      lastMinuten,
      key,
      hits,
      colTop: lastDatum ? colForIso(0, lastDatum) : null,
      colBottom: lastDatum ? colForIso(1, lastDatum) : null,
      last12,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, empDayProjIdx]);
  // ===== DEBUG END =====

  function renderSection(weekRow: 0 | 1, weeks4: Date[], scrollRef: React.RefObject<HTMLDivElement>) {
    const parts = blockParts.filter((p) => p.weekRow === weekRow);
    const activeCol = running?.datum ? colForIso(weekRow, running.datum) : null;

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

              const laneByKey = assignLanes(
                rowParts.map((p) => ({ key: p.key, startCol: p.startCol, span: p.span })),
                LANES
              );

              return (
                <div key={rowId} className="flex border-b border-neutral-800 last:border-b-0">
                  <div
                    className="shrink-0 border-r border-neutral-800 px-2 flex items-center text-sm text-neutral-100"
                    style={{ width: NAME_COL_W, height: LANES * LANE_H }}
                  >
                    <div className="truncate">{m.name}</div>
                  </div>

                  <div className="relative" style={{ width: COLS * CELL_W, height: LANES * LANE_H }}>
                    {/* Raster + Drop + Tages-Spuren */}
                    <div className="absolute inset-0">
                      {Array.from({ length: LANES }).map((_, lane) => (
                        <div key={lane} className="flex" style={{ height: LANE_H }}>
                          {Array.from({ length: COLS }).map((_, col) => {
                            const isWeekBoundary = col % 6 === 0;
                            const isActive = activeCol === col;

                            const iso = isoDate(dateForCol(weekRow, col));
                            const dayKey = `${rowId}__${iso}`;
                            const entries = empDayProjIdx.get(dayKey) ?? [];

                            const soll = sollMinutenFor(m, iso);
                            const denom = Math.max(1, soll > 0 ? soll : 480);

                            const shown = entries.slice(0, 4);
                            const rest = entries.length - shown.length;

                            return (
                              <div
                                key={col}
                                className={`relative border-r border-neutral-800 ${
                                  isWeekBoundary ? "bg-neutral-900/35" : "bg-neutral-950"
                                } ${isActive ? "bg-blue-500/5" : ""}`}
                                style={{ width: CELL_W, height: LANE_H }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropOnLane(e, { rowId, weekRow, col })}
                              >
                                {/* Tages-Spuren: nur in Lane 0 */}
                                {lane === 0 && entries.length > 0 ? (
                                  <div className="absolute left-1 right-1 bottom-1 flex flex-col gap-1 pointer-events-none">
                                    {shown.map((e, i) => {
                                      const pct = clamp((e.minuten / denom) * 100, 2, 100);
                                      const colorClass = meisterColorForProject(e.projektId);
                                      const pname = String(projectById.get(String(e.projektId))?.name ?? e.projektId);

                                      return (
                                        <div
                                          key={`${e.projektId}_${i}`}
                                          className="h-1.5 rounded bg-neutral-800 overflow-hidden"
                                          title={`${pname} · ${minutesToHM(e.minuten)}`}
                                        >
                                          <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
                                        </div>
                                      );
                                    })}
                                    {rest > 0 ? <div className="text-[9px] text-neutral-400">+{rest}</div> : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Projektblöcke */}
                    {rowParts.map((p) => {
                      const meisterBadge = meisterColorClass(p.meisterId);
                      const isDragging = draggingId === p.projectId;
                      const isRunningProject = String(running?.projektId ?? "") === String(p.projectId);

                      const lane = laneByKey.get(p.key) ?? 0;

                      const blockLeft = p.startCol * CELL_W + 2;
                      const blockTop = lane * LANE_H + 2;
                      const blockW = p.span * CELL_W - 4;
                      const blockH = LANE_H - 4;

                      const totalMin = projTotals.totalMin.get(p.projectId) ?? 0;
                      const planMin = Math.max(0, p.planMinuten);
                      const first = projTotals.firstIso.get(p.projectId) ?? null;

                      const plannedStartIso =
                        plannedStartIsoByProject.get(String(p.projectId)) ?? isoDate(dateForCol(0, 0));
                      const startOffsetDays = first ? diffDaysIso(plannedStartIso, first) : 0;

                      const totalSpanCols =
                        projectTotalSpanCols.get(String(p.projectId)) ?? Math.max(1, p.relStart + p.span);

                      const progressStartCol = clamp(startOffsetDays, 0, totalSpanCols);

                      const filledCols =
                        planMin > 0 ? Math.round((Math.min(totalMin, planMin) / planMin) * totalSpanCols) : 0;

                      const overCols =
                        planMin > 0 ? Math.round((Math.max(0, totalMin - planMin) / planMin) * totalSpanCols) : 0;

                      const partStart = p.relStart;
                      const partEnd = p.relStart + p.span;

                      const plannedStart = progressStartCol;
                      const plannedEnd = progressStartCol + filledCols;

                      const partPlannedStart = Math.max(partStart, plannedStart);
                      const partPlannedEnd = Math.min(partEnd, plannedEnd);
                      const partPlannedLen = Math.max(0, partPlannedEnd - partPlannedStart);

                      const overStart = plannedEnd;
                      const overEnd = plannedEnd + overCols;

                      const partOverStart = Math.max(partStart, overStart);
                      const partOverEnd = Math.min(partEnd, overEnd);
                      const partOverLen = Math.max(0, partOverEnd - partOverStart);

                      const plannedLeftPx = (partPlannedStart - partStart) * CELL_W;
                      const plannedWidthPx = partPlannedLen * CELL_W;

                      const overLeftPx = (partOverStart - partStart) * CELL_W;
                      const overWidthPx = partOverLen * CELL_W;

                      const showAnyProgress =
                        totalMin > 0 && first != null && (partPlannedLen > 0 || partOverLen > 0);

                      const area =
                        projTotals.areaMin.get(p.projectId) ?? { maschine: 0, bank: 0, lack: 0, montage: 0 };
                      const areaTotal = Math.max(1, area.maschine + area.bank + area.lack + area.montage);
                      const areaShares: Array<{ b: Bereich; share: number }> = [
                        { b: "maschine", share: area.maschine / areaTotal },
                        { b: "bank", share: area.bank / areaTotal },
                        { b: "lack", share: area.lack / areaTotal },
                        { b: "montage", share: area.montage / areaTotal },
                      ].filter((x) => x.share > 0.0001);

                      return (
                        <div
                          key={p.key}
                          draggable
                          onDragStart={(e) => onDragStart(e, p.projectId)}
                          onDragEnd={onDragEnd}
                          className={`absolute rounded-lg border overflow-hidden select-none ${
                            isDragging
                              ? "border-orange-500 bg-neutral-800 text-neutral-100 opacity-70"
                              : isRunningProject
                              ? "border-blue-500 bg-neutral-900 text-neutral-100"
                              : "border-orange-500/80 bg-neutral-900 text-neutral-100"
                          }`}
                          style={{ top: blockTop, left: blockLeft, width: blockW, height: blockH }}
                          title={`${p.name}\nGesamt: ${minutesToHM(totalMin)} / Kalk: ${minutesToHM(planMin)}`}
                        >
                          {/* Raster im Block */}
                          <div className="absolute inset-0 flex">
                            {Array.from({ length: p.span }).map((_, i) => (
                              <div
                                key={i}
                                className="h-full border-r border-neutral-800/60 bg-neutral-950"
                                style={{ width: CELL_W }}
                              />
                            ))}
                          </div>

                          {/* Fortschritt */}
                          {showAnyProgress ? (
                            <>
                              <div className="absolute top-0 bottom-0" style={{ left: plannedLeftPx, width: plannedWidthPx }}>
                                <div className="h-full w-full flex">
                                  {areaShares.length > 0 ? (
                                    areaShares.map((x, idx) => (
                                      <div
                                        key={`${x.b}_${idx}`}
                                        className={`h-full ${bereichColorClass(x.b)}`}
                                        style={{ width: `${x.share * 100}%` }}
                                      />
                                    ))
                                  ) : (
                                    <div className="h-full w-full bg-blue-600" />
                                  )}
                                </div>
                                <div className="absolute inset-0 bg-blue-900/15" />
                              </div>

                              {partOverLen > 0 ? (
                                <div
                                  className="absolute top-0 bottom-0 bg-red-600"
                                  style={{ left: overLeftPx, width: overWidthPx }}
                                  title={`Überschritten: ${minutesToHM(Math.max(0, totalMin - planMin))}`}
                                />
                              ) : null}
                            </>
                          ) : null}

                          {/* Label am Anfang */}
                          {p.relStart === 0 ? (
                            <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                              <div className="flex items-center gap-2">
                                <div className={`h-3.5 w-3.5 rounded-sm ${meisterBadge}`} />
                                <div className="truncate text-[12px] font-semibold text-neutral-100">{p.name}</div>
                                {totalMin > 0 ? (
                                  <div className="ml-2 text-[10px] text-neutral-300">
                                    {minutesToHM(totalMin)} / {minutesToHM(planMin)}
                                  </div>
                                ) : (
                                  <div className="ml-2 text-[10px] text-neutral-500">noch keine Buchung</div>
                                )}
                                {isRunningProject ? (
                                  <div className="ml-2 text-[10px] font-semibold text-blue-300">● läuft</div>
                                ) : null}
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
      {/* DEBUG PANEL – AUTO */}
      <div className="fixed top-4 left-4 z-[9999] bg-white text-black text-xs rounded-lg border shadow-lg p-3 w-[380px] max-h-[80vh] overflow-auto">
        <div className="font-bold mb-2">Board Debug (AUTO)</div>

        <div>
          <b>Board Range:</b> {isoDate(topWeeks[0])} … {isoDate(addDays(bottomWeeks[3], 5))}
        </div>

        <div className="mt-2">
          <b>buchungen total:</b> {debug.totalAll}
        </div>
        <div>
          <b>arbeits-buchungen:</b> {debug.totalArbeits}
        </div>

        <div className="mt-2">
          <b>Last Arbeit:</b>{" "}
          {debug.last
            ? `${debug.lastDatum} | m=${debug.lastMitarbeiterId} | p=${debug.lastProjektId} | ${minutesToHM(debug.lastMinuten)}`
            : "—"}
        </div>

        <div className="mt-2">
          <b>Auto Key:</b> {debug.key || "—"}
        </div>
        <div>
          <b>Auto Hits:</b> {debug.hits}
        </div>
        <div>
          <b>colForIso(top/bottom):</b> {String(debug.colTop)} / {String(debug.colBottom)}
        </div>

        <div className="mt-3 font-semibold">Letzte 12 Arbeitsbuchungen</div>
        <div className="mt-1 space-y-1">
          {debug.last12.length === 0 ? (
            <div className="text-neutral-600">Keine Arbeitsbuchungen in state.buchungen.</div>
          ) : (
            debug.last12.map((x, i) => (
              <div key={i} className="border rounded px-2 py-1">
                <div>
                  <b>{x.datum}</b> | m={x.mitarbeiterId} | p={x.projektId}
                </div>
                <div className="text-neutral-700">{minutesToHM(x.minuten)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {renderSection(0, topWeeks, scrollTopRef)}
      {renderSection(1, bottomWeeks, scrollBottomRef)}
      <div className="text-xs text-neutral-500">
        Drag&Drop plant fortlaufend (nächste freie Stelle) und darf operative Zeile ändern. Tages-Spuren zeigen Buchungen je Mitarbeiter.
      </div>
    </div>
  );
}
