// src/ui/BoardV2.tsx
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { saveState, type State } from "../core/timeStore";
import { getStatus } from "../core/timeRules";


import type { MitarbeiterState } from "../core/mitarbeiterStore";
import {
  buildBoardV2Layout,
  dateForCol,
  isoDateLocal,
  isoWeekNumberLocal,
  isFriOrSatLocal,
  startOfISOWeekLocal,
  addDays,
} from "./BoardV2Layout";

/**
 * Board V2 – Schritt 2/3:
 * - Layout-Engine Vollbild (2×4 Wochen)
 * - Planblöcke anzeigen + Fr/Sa-Lücken ohne Buchung
 * - ✅ Drag&Drop + Pool rechts
 * - ✅ Buchungen sichtbar (pro Projekt, pro Tag, in Lanes)
 */

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

const POOL_W = 300;
const NAME_COL_W = 180;

// Plan-Spur (oben in jeder Mitarbeiterzeile)
const PROJECT_BAND_H = 32;
const MAX_PROJECT_LANES = 2;
const PROJECT_LANE_H = PROJECT_BAND_H / MAX_PROJECT_LANES;

// Buchungen-Lanes (unter der Projektspur)
const MIN_BOOKING_LANES = 2;
const MAX_BOOKING_LANES = 4;
const BOOKING_LANE_H = 18;

// Basis-Kapazität pro Tag (10h)
const BASE_CAP_MIN = 600;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type LayoutPos = { rowId: string; startCol: number; lane?: number };
type LayoutMap = Record<string, LayoutPos>;

type Block = {
  projectId: string;
  name: string;
  rowId: string;
  lane: number; // 0..1
  startColTop: number; // 0..23
  spanCols: number; // kann > 24 sein => wraps
};

type BlockPart = {
  key: string;
  projectId: string;
  name: string;
  rowId: string;
  lane: number;
  sectionIdx: 0 | 1;
  startCol: number; // 0..23
  span: number; // <= 24
};

// ===== Buchungs-Packing =====
type PackedSeg = {
  key: string;
  col: number;
  lane: number;
  left: number;
  width: number;
  label: string;
  tooltip: string;

  // ✅ Buchungen an Urlaub/Krank-Tagen abdunkeln
  dim?: boolean;
};


export default function BoardV2(p: Props) {
  const { state, setState, ms } = p;

  const mitarbeiterAll = ms.mitarbeiter ?? [];
  const mitarbeiter = useMemo(() => {
    const arr = Array.isArray(mitarbeiterAll) ? mitarbeiterAll.slice() : [];
    arr.sort((a: any, b: any) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "de"));
    return arr;
  }, [mitarbeiterAll]);

  // ====== Board soll exakt die Resthöhe unter der Topbar nutzen ======
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [outerH, setOuterH] = useState<number>(600);

  useLayoutEffect(() => {
    const recalc = () => {
      const el = outerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top || 0;
      const h = Math.max(300, Math.floor(window.innerHeight - top));
      setOuterH(h);
    };

    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  // Left viewport messen (ohne Pool)
  const leftRef = useRef<HTMLDivElement | null>(null);
  const [vw, setVw] = useState<number>(1200);
  const [vh, setVh] = useState<number>(700);

  useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el) return;

    const recalc = () => {
      const rect = el.getBoundingClientRect();
      setVw(Math.max(600, Math.floor(rect.width || el.clientWidth || 0)));
      setVh(Math.max(300, Math.floor(rect.height || el.clientHeight || 0)));
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    window.addEventListener("resize", recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, []);

  // 8-Wochen-Fenster: 1 Woche zurück starten
  const baseMonday = useMemo(() => startOfISOWeekLocal(new Date()), []);
  const sectionStart0 = useMemo(() => addDays(baseMonday, -7), [baseMonday]);
  const sectionStart1 = useMemo(() => addDays(sectionStart0, 4 * 7), [sectionStart0]);

  const layout = useMemo(
    () =>
      buildBoardV2Layout({
        viewportW: vw,
        viewportH: vh,
        employeeCount: mitarbeiter.length,
      }),
    [vw, vh, mitarbeiter.length]
  );

  function colLeft(col: number) {
    return layout.colLefts[col] ?? 0;
  }
  function colW(col: number) {
    return layout.colWidths[col] ?? 10;
  }

  // ====== Index: Buchungen pro Projekt/Tag (Minuten) ======
  const projectDayMin = useMemo(() => {
    const m = new Map<string, number>(); // key: `${pid}__${iso}`
    const arr: any[] = Array.isArray((state as any)?.buchungen) ? ((state as any).buchungen as any[]) : [];

    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      if (String(b?.art ?? "") !== "arbeit") continue;

      const pid = String(b?.projektId ?? "").trim();
      if (!pid) continue;

      const iso = String(b?.datum ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

      const min = Math.max(0, Math.round(safeNumber(b?.minuten) || 0));
      if (min <= 0) continue;

      const key = `${pid}__${iso}`;
      m.set(key, (m.get(key) ?? 0) + min);
    }

    return m;
  }, [state]);

  const projectTotalMin = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of projectDayMin.entries()) {
      const pid = k.split("__")[0] ?? "";
      if (!pid) continue;
      m.set(pid, (m.get(pid) ?? 0) + (v ?? 0));
    }
    return m;
  }, [projectDayMin]);

  // ====== Index: Buchungen pro Mitarbeiter/Tag/Projekt (Minuten) ======
  const employeeDayProjIdx = useMemo(() => {
    // key: `${mid}__${iso}` => Map(pid->min)
    const tmp = new Map<string, Map<string, number>>();
    const arr: any[] = Array.isArray((state as any)?.buchungen) ? ((state as any).buchungen as any[]) : [];

    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      if (String(b?.art ?? "") !== "arbeit") continue;

      const mid = String(b?.mitarbeiterId ?? "").trim();
      if (!mid) continue;

      const pid = String(b?.projektId ?? "").trim();
      if (!pid) continue;

      const iso = String(b?.datum ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

      const min = Math.max(0, Math.round(safeNumber(b?.minuten) || 0));
      if (min <= 0) continue;

      const key = `${mid}__${iso}`;
      if (!tmp.has(key)) tmp.set(key, new Map());
      const inner = tmp.get(key)!;
      inner.set(pid, (inner.get(pid) ?? 0) + min);
    }

    // final: key => sorted list
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
  }, [state]);

  // ====== Layout aus State ziehen ======
  const layoutMap: LayoutMap = (((state as any)?.boardLayout ?? {}) as any) || {};

  const activeProjects = useMemo(() => {
    const arr: any[] = Array.isArray((state as any)?.projects) ? ((state as any).projects as any[]) : [];
    return arr.filter((p) => p && p?.status !== "archiv" && p?.active !== false);
  }, [state]);

  const poolProjects = useMemo(() => {
    return (activeProjects as any[]).filter((p: any) => !layoutMap[String(p?.id ?? "")]);
  }, [activeProjects, layoutMap]);

  const boardProjects = useMemo(() => {
    return (activeProjects as any[]).filter((p: any) => !!layoutMap[String(p?.id ?? "")]);
  }, [activeProjects, layoutMap]);

  const projectById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of (state as any)?.projects ?? []) m.set(String((p as any)?.id ?? ""), p);
    return m;
  }, [state]);

  // ====== Drag&Drop State ======
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [hoverPool, setHoverPool] = useState<boolean>(false);

  function clearDnDHovers() {
    setHoverRowId(null);
    setHoverPool(false);
  }

  function saveLayout(projectId: string, nextPos: { rowId: string; startCol: number; lane: number }) {
    setState((s) => {
      const next = structuredClone(s) as any;

      if (!next.boardLayout) next.boardLayout = {};
      next.boardLayout[String(projectId)] = nextPos;

      const pid = String(projectId);
      const rowId = String(nextPos.rowId);

      if (Array.isArray(next.projects)) {
        const idx = next.projects.findIndex((pp: any) => String(pp?.id) === pid);
        if (idx >= 0) {
          const proj = next.projects[idx];
          next.projects[idx] = { ...proj, zugeordnetAnId: rowId };
        }
      }

      saveState(next as any);
      return next;
    });
  }

  function removeFromLayout(projectId: string) {
    setState((s) => {
      const next = structuredClone(s) as any;

      if (next.boardLayout) delete next.boardLayout[String(projectId)];

      const pid = String(projectId);
      if (Array.isArray(next.projects)) {
        const idx = next.projects.findIndex((pp: any) => String(pp?.id) === pid);
        if (idx >= 0) {
          const proj = next.projects[idx];
          next.projects[idx] = { ...proj, zugeordnetAnId: undefined };
        }
      }
      saveState(next as any);
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, projectId: string) {
    setDraggingId(projectId);
    clearDnDHovers();

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(projectId));

    const pos = layoutMap[String(projectId)];
    const lane = clamp(Number(pos?.lane ?? 0), 0, 1);
    e.dataTransfer.setData("application/x-orgaboard-lane", String(lane));
  }

  function onDragEnd() {
    setDraggingId(null);
    clearDnDHovers();
  }

  function onDropOnCell(e: React.DragEvent, target: { rowId: string; sectionIdx: 0 | 1; col: number }) {
    e.preventDefault();

    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;

    if (target.sectionIdx !== 0) return;

    const rowId = String(target.rowId);
    const col = clamp(target.col, 0, layout.cols - 1);

    const draggedLaneRaw = e.dataTransfer.getData("application/x-orgaboard-lane");
    let lane = clamp(Number(draggedLaneRaw || 0), 0, 1);

    if ((e as any).shiftKey) lane = lane === 0 ? 1 : 0;

    const partsTop = blockParts.filter((bp) => bp.sectionIdx === 0);

    const laneOccupied = (testLane: number) =>
      partsTop.some(
        (bp) =>
          String(bp.rowId) === rowId &&
          clamp(Number(bp.lane ?? 0), 0, 1) === testLane &&
          col >= bp.startCol &&
          col < bp.startCol + bp.span
      );

    if (laneOccupied(lane) && !laneOccupied(lane === 0 ? 1 : 0)) lane = lane === 0 ? 1 : 0;

    saveLayout(projectId, { rowId, startCol: col, lane });

    setDraggingId(null);
    clearDnDHovers();
  }

  // ====== Block-Spans (einfach & stabil) ======
  function calcSpanColsFromStart(projectId: string, startDate: Date, minutesTarget: number): number {
    if (minutesTarget <= 0) return 1;

    let remain = minutesTarget;
    let span = 0;

    const MAX = 24 * 2; // max 2 Sektionen
    for (let i = 0; i < MAX; i++) {
      const d = addDays(startDate, i);
      const iso = isoFromLocalDate(d);
      const bookedThisProject = (projectDayMin.get(`${projectId}__${iso}`) ?? 0) > 0;

      const isFriSat = isFriOrSatLocal(d);
      if (isFriSat && !bookedThisProject) {
        span++;
        continue;
      }

      const cap = 600;
      const take = Math.min(remain, cap);
      remain -= take;

      span++;
      if (remain <= 0) break;
    }

    return Math.max(1, span);
  }

  // ====== Blocks bauen (nur Projekte, die im Layout stehen) ======
  const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];

    for (const p of boardProjects as any[]) {
      const pid = String(p?.id ?? "");
      if (!pid) continue;

      const pos = layoutMap[pid];
      if (!pos) continue;

      const rowId = String(pos.rowId ?? "");
      if (!rowId) continue;

      const startColTop = clamp(Number(pos.startCol ?? 0), 0, layout.cols - 1);
      const lane = clamp(Number(pos.lane ?? 0), 0, MAX_PROJECT_LANES - 1);

      const planMin = Math.max(0, Math.round((safeNumber(p?.kalkStunden) || 0) * 60));
      const bookedMin = projectTotalMin.get(pid) ?? 0;
      const minutesTarget = Math.max(planMin, bookedMin, 60);

      const startDate = dateForCol(sectionStart0, startColTop);
      const spanCols = calcSpanColsFromStart(pid, startDate, minutesTarget);

      out.push({
        projectId: pid,
        name: String(p?.name ?? "Projekt"),
        rowId,
        lane,
        startColTop,
        spanCols,
      });
    }

    return out;
  }, [boardProjects, layoutMap, projectTotalMin, sectionStart0, projectDayMin, layout.cols]);

  // ====== Wrap auf 2 Sektionen ======
  function splitBlock(b: Block): BlockPart[] {
    const parts: BlockPart[] = [];

    const topStart = b.startColTop;
    const topAvail = Math.max(0, layout.cols - topStart);
    const topSpan = Math.min(b.spanCols, topAvail);

    if (topSpan > 0) {
      parts.push({
        key: `${b.projectId}__s0`,
        projectId: b.projectId,
        name: b.name,
        rowId: b.rowId,
        lane: b.lane,
        sectionIdx: 0,
        startCol: topStart,
        span: topSpan,
      });
    }

    const rest = b.spanCols - topSpan;
    if (rest > 0) {
      parts.push({
        key: `${b.projectId}__s1`,
        projectId: b.projectId,
        name: b.name,
        rowId: b.rowId,
        lane: b.lane,
        sectionIdx: 1,
        startCol: 0,
        span: Math.min(rest, layout.cols),
      });
    }

    return parts;
  }

  const blockParts: BlockPart[] = useMemo(() => blocks.flatMap(splitBlock), [blocks]);

  // ====== Plan-Outline: Segmente mit Lücken (Fr/Sa ohne Buchung => Lücke) ======
  function buildPlanOutlineSegments(part: BlockPart, sectionStart: Date): Array<{ start: number; span: number }> {
    const segs: Array<{ start: number; span: number }> = [];

    let curStart: number | null = null;
    let curLen = 0;

    for (let i = 0; i < part.span; i++) {
      const col = part.startCol + i;
      const d = dateForCol(sectionStart, col);
      const iso = isoFromLocalDate(d);

      const bookedThisProject = (projectDayMin.get(`${part.projectId}__${iso}`) ?? 0) > 0;

      const isFriSat = isFriOrSatLocal(d);
      const gapBecauseWeekend = isFriSat && !bookedThisProject;

      const visible = !gapBecauseWeekend;

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
  // ===== Status (Urlaub/Krank/Ü-Abbau) =====
  function renderStatusOverlay(sectionIdx: 0 | 1, sectionStart: Date, empId: string) {
    const buchungen = (((state as any)?.buchungen ?? []) as any[]) || [];

    return Array.from({ length: layout.cols }).map((_, col) => {
      const d = dateForCol(sectionStart, col);
      const iso = isoFromLocalDate(d);

      const status = getStatus(buchungen as any, iso, empId);
      if (!status) return null;

      let label = "";
      let cls = "";

      if ((status as any).art === "urlaub") {
        label = "Urlaub";
        cls = "bg-emerald-600/85 text-neutral-950";
      } else if ((status as any).art === "krank") {
        label = "Krank";
        cls = "bg-rose-600/85 text-neutral-950";
      } else if ((status as any).art === "ueberstundenabbau") {
        label = "Ü-Abbau";
        cls = "bg-indigo-600/85 text-neutral-50";
      } else {
        return null;
      }

      return (
        <div
          key={`status-${sectionIdx}-${empId}-${col}`}
          className={`absolute z-30 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow ${cls}`}
          style={{
  left: colLeft(col) + 6,
  // ✅ immer innerhalb der Zeile bleiben (sonst "wandert" es optisch in die nächste Mitarbeiter-Zeile)
  top: clamp(layout.rowH - 18, PROJECT_BAND_H + 2, layout.rowH - 14),
}}

          title={`${label} · ${iso}`}
        >
          {label}
        </div>
      );
    });
  }

  // ===== Buchungen packen (pro Tag) =====
  function packDaySegments(empId: string, sectionStart: Date): { segs: PackedSeg[]; lanes: number } {
    const segs: PackedSeg[] = [];
    let maxLaneUsed = 0;

    for (let col = 0; col < layout.cols; col++) {
      const d = dateForCol(sectionStart, col);
      const iso = isoFromLocalDate(d);
      const dayKey = `${empId}__${iso}`;
      // ✅ Status prüfen (Urlaub/Krank => Buchungen abdunkeln)
      const status = getStatus((((state as any)?.buchungen ?? []) as any[]) || [], iso, empId);
      const dimBookings = (status as any)?.art === "urlaub" || (status as any)?.art === "krank";

      const entries = employeeDayProjIdx.get(dayKey) ?? [];
      if (entries.length === 0) continue;

      const dayW = colW(col);
      const denom = BASE_CAP_MIN;

      const usedPxByLane: number[] = Array.from({ length: MIN_BOOKING_LANES }, () => 0);

      for (const e of entries) {
        const pid = String(e.projektId);
        const proj = projectById.get(pid);
        const pname = String((proj as any)?.name ?? pid);

        const widthPxRaw = (Math.max(0, e.minuten) / denom) * dayW;

// ✅ Sichtbarkeit: kleine Buchungen (z.B. 2h) dürfen nicht "wegoptisch" werden.
// 16px ist die kleinste Breite, bei der Border + Layer + Text noch sinnvoll erkennbar sind.
const widthPx = clamp(Math.round(widthPxRaw), 16, Math.max(16, dayW - 6));


        let lane = 0;
        while (true) {
          if (lane >= usedPxByLane.length) {
            if (usedPxByLane.length < MAX_BOOKING_LANES) usedPxByLane.push(0);
            else break;
          }

          const used = usedPxByLane[lane];
          if (used + widthPx + 2 <= dayW - 2) break;

          if (lane >= MAX_BOOKING_LANES - 1) break;
          lane++;
        }

        const left = clamp(usedPxByLane[lane] + 2, 2, Math.max(2, dayW - 2));
        const maxW = Math.max(6, dayW - 2 - left);
        const w = Math.min(widthPx, maxW);

        usedPxByLane[lane] = left + w;

        const label = `${Math.round((e.minuten / 60) * 10) / 10}h`;
        const tooltip = `${pname}\n${iso}\nIst: ${e.minuten} min`;
        segs.push({
          key: `${empId}__${iso}__${pid}__${lane}__${left}`,
          col,
          lane,
          left,
          width: w,
          label,
          tooltip,
          dim: dimBookings,
        });


        if (lane + 1 > maxLaneUsed) maxLaneUsed = lane + 1;
      }
    }

    const lanes = Math.min(MAX_BOOKING_LANES, Math.max(MIN_BOOKING_LANES, maxLaneUsed));
    return { segs, lanes };
  }

  function renderHeader(sectionIdx: number, sectionStart: Date) {
    return (
      <div className="flex border-b border-neutral-800" style={{ height: layout.headerH }}>
        {/* Name-Spalte */}
        <div className="px-3 flex items-center text-lg font-bold text-neutral-900 tracking-tight" style={{ width: NAME_COL_W }}>
          {sectionIdx === 0 ? "Board V2" : ""}
        </div>

        {/* Grid */}
        <div className="relative" style={{ width: layout.totalGridW, height: layout.headerH }}>
          {/* KW Row */}
          <div className="absolute left-0 right-0 top-0" style={{ height: layout.kwRowH }}>
            {Array.from({ length: layout.weeksPerSection }).map((_, wi) => {
              const isCurrentKw = sectionIdx === 0 && wi === 1;

              const weekStart = addDays(sectionStart, wi * 7);
              const kw = isoWeekNumberLocal(weekStart);

              const colStart = wi * layout.daysPerWeek;
              const left = colLeft(colStart);

              let width = 0;
              for (let i = 0; i < layout.daysPerWeek; i++) width += colW(colStart + i);

              return (
                <div
                  key={`kw-${sectionIdx}-${wi}`}
                  className={`absolute border-r border-neutral-700 ${
                    isCurrentKw ? "bg-orange-400 border-orange-500" : "bg-neutral-950"
                  }`}
                  style={{ left, width, height: layout.kwRowH }}
                >
                  <div
                    className={`h-full flex items-center justify-center text-xs font-bold ${
                      isCurrentKw ? "text-neutral-900" : "text-neutral-400"
                    }`}
                  >
                    KW {kw}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day Row */}
          <div className="absolute left-0 right-0" style={{ top: layout.kwRowH, height: layout.dayRowH }}>
            {Array.from({ length: layout.cols }).map((_, col) => {
              const d = dateForCol(sectionStart, col);
              const weekend = isFriOrSatLocal(d);
              const left = colLeft(col);
              const width = colW(col);

              return (
                <div
                  key={`d-${sectionIdx}-${col}`}
                  className={`absolute top-0 bottom-0 border-r border-neutral-700/60 text-center ${
                    weekend ? "bg-neutral-900/70" : "bg-neutral-950"
                  }`}
                  style={{ left, width }}
                  title={isoDateLocal(d)}
                >
                  <div className="text-[11px] text-neutral-300 leading-5">{["Mo", "Di", "Mi", "Do", "Fr", "Sa"][col % 6]}</div>
                  <div className="text-[10px] text-neutral-500 leading-4">
                    {String(d.getDate()).padStart(2, "0")}.{String(d.getMonth() + 1).padStart(2, "0")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderRows(sectionIdx: 0 | 1, sectionStart: Date) {
    return (
      <>
        {mitarbeiter.map((m: any) => {
          const empName = String(m?.name ?? "Unbekannt");
          const empId = String(m?.id ?? "");

          const rowParts = blockParts.filter((bp) => bp.sectionIdx === sectionIdx && String(bp.rowId) === empId);
          const rowRing = draggingId && hoverRowId === empId ? "ring-2 ring-orange-500/70" : "";

          // Buchungen packen (nur für diese Sektion)
          const pack = packDaySegments(empId, sectionStart);
          const bookingLanes = pack.lanes;

          // Buchungsbereich-Höhe (unter Projektspur)
          const bookingAreaH = bookingLanes * BOOKING_LANE_H;
          const bookingsTop = PROJECT_BAND_H + 6;

          return (
            <div key={`r-${sectionIdx}-${empId}`} className={`flex border-b border-neutral-800 ${rowRing}`} style={{ height: layout.rowH }}>
              <div
                className="px-3 flex items-center text-sm truncate bg-neutral-400/70 border-r border-neutral-300"
                style={{ width: NAME_COL_W }}
                title={empName}
              >
                <div className="min-w-0 truncate text-neutral-900 font-bold">{empName}</div>
              </div>

              <div className="relative overflow-hidden" style={{ width: layout.totalGridW, height: layout.rowH }}>

                                {renderStatusOverlay(sectionIdx, sectionStart, empId)}

                {/* Hintergrundraster */}
                {Array.from({ length: layout.cols }).map((_, col) => {
                  const d = dateForCol(sectionStart, col);
                  const weekend = isFriOrSatLocal(d);
                  const isToday = isoFromLocalDate(d) === isoFromLocalDate(new Date());

                  return (
                    <div
                      key={`bg-${sectionIdx}-${empId}-${col}`}
                      className={`absolute top-0 bottom-0 ${weekend ? "bg-neutral-900/70" : "bg-neutral-950"} ${
                        isToday ? "bg-neutral-950/90" : ""
                      }`}
                      style={{ left: colLeft(col), width: colW(col) }}
                    >
                      <div className="absolute right-0 top-0 bottom-0 w-px bg-neutral-600/80" />
                      {isToday ? <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500/60" /> : null}
                    </div>
                  );
                })}

                <div className="absolute left-0 right-0 bottom-0 h-px bg-neutral-600/80 pointer-events-none" />

                {/* Drop-Zonen (nur Sektion 0) */}
                {sectionIdx === 0
                  ? Array.from({ length: layout.cols }).map((_, col) => (
                      <div
                        key={`drop-${empId}-${col}`}
                        className="absolute top-0"
                        style={{ left: colLeft(col), width: colW(col), height: PROJECT_BAND_H }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHoverPool(false);
                          setHoverRowId(empId);
                        }}
                        onDragEnter={() => {
                          setHoverRowId(empId);
                          setHoverPool(false);
                        }}
                        onDrop={(e) => onDropOnCell(e, { rowId: empId, sectionIdx: 0, col })}
                        title="Hierhin ziehen = Projekt einplanen (Shift = Lane wechseln)"
                      />
                    ))
                  : null}

                {/* ===== Buchungen (pro Projekt): Segmente in Lanes ===== */}
                <div
                  className="absolute z-10 pointer-events-none"
                  style={{
                    left: 0,
                    right: 0,
                    top: bookingsTop,
                    height: Math.min(bookingAreaH, Math.max(0, layout.rowH - bookingsTop - 6)),
                  }}
                >
                  {pack.segs.map((seg) => {
                    const absLeft = colLeft(seg.col) + seg.left;
                    const topPx = seg.lane * BOOKING_LANE_H + 2;

                    return (
                      <div
                        key={`bk-${sectionIdx}-${seg.key}`}
                            className={`absolute rounded-md border border-neutral-800 overflow-hidden ${seg.dim ? "opacity-40" : ""}`}


                        style={{
                          left: absLeft,
                          top: topPx,
                          width: seg.width,
                          height: BOOKING_LANE_H - 4,
                        }}
                        title={seg.tooltip}
                      >
                        <div className="absolute inset-0 bg-orange-500/35" />
<div className="absolute inset-0 bg-neutral-950/60" />

{/* ✅ Text bleibt IMMER sichtbar:
    - nicht mehr "center", weil Center bei kleinen Breiten optisch verschwindet
    - linksbündig + padding + truncate => "2h" bleibt sichtbar
*/}
<div className="relative h-full flex items-center px-1 text-[10px] font-semibold text-neutral-100">
  <span className="block w-full truncate">{seg.label}</span>
</div>

{/* ✅ Extra-Boost für sehr schmale Segmente:
    - macht "2h" lesbar, ohne es auszublenden
*/}
{seg.width < 26 ? (
  <div className="absolute inset-0 flex items-center px-1 pointer-events-none">
    <span className="rounded bg-neutral-950/70 px-1 text-[10px] font-semibold text-neutral-100">
      {seg.label}
    </span>
  </div>
) : null}

                      </div>
                    );
                  })}
                </div>

                {/* Projektspur: Plan-Outline */}
                {rowParts.map((part) => {
                  const segs = buildPlanOutlineSegments(part, sectionStart);
                  if (segs.length === 0) return null;

                  const isDraggingThis = draggingId === part.projectId;

                  return (
                    <React.Fragment key={part.key}>
                      {segs.map((s, idx) => {
                        const absCol = part.startCol + s.start;
                        const leftPx = colLeft(absCol) + 2;

                        let w = 0;
                        for (let i = 0; i < s.span; i++) w += colW(absCol + i);
                        w = Math.max(6, w - 4);

                        const lane = clamp(part.lane, 0, MAX_PROJECT_LANES - 1);
                        const topPx = 2 + lane * PROJECT_LANE_H;
                        const h = PROJECT_LANE_H - 4;

                        const proj = projectById.get(String(part.projectId));
                        const title = `${part.name}\nProjektId: ${part.projectId}\nZuordnung: ${String((proj as any)?.zugeordnetAnId ?? "-")}`;

                        const showLabel = w >= 140;

                        return (
                          <div
                            key={`${part.key}__seg_${idx}`}
                            draggable
                            onDragStart={(e) => onDragStart(e, part.projectId)}
                            onDragEnd={onDragEnd}
                            className={`absolute z-20 rounded-lg border overflow-hidden select-none cursor-grab active:cursor-grabbing ${
                              isDraggingThis ? "border-orange-500 bg-neutral-900 opacity-70" : "border-orange-500/80"
                            }`}
                            style={{ top: topPx, left: leftPx, width: w, height: h }}
                            title={title}
                          >
                            <div className="absolute inset-0 bg-orange-500/15" />
                            <div className="absolute inset-0 bg-neutral-950/35" />

                            {showLabel ? (
                              <div className="absolute inset-y-0 left-0 z-10 flex items-center pointer-events-none">
                                <div className="ml-2 flex items-center gap-2 min-w-0 px-2 py-1 rounded bg-neutral-950/55 border border-neutral-200/10">
                                  <div className="h-3 w-3 rounded-sm bg-orange-500" />
                                  <div className="truncate text-[11px] font-semibold text-neutral-50">{part.name}</div>
                                </div>
                              </div>
                            ) : null}
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
      </>
    );
  }
                

  return (
    <div ref={outerRef} className="w-full overflow-hidden bg-neutral-200/40" style={{ height: outerH }}>
      <div className="flex w-full h-full overflow-hidden gap-3">
        {/* LEFT (Board) */}
        <div ref={leftRef} className="flex-1 min-w-0 overflow-hidden h-full">
          <div className="flex flex-col gap-3">
            {/* Section 1 */}
            <div className="rounded-2xl border border-neutral-300 bg-neutral-100/70 overflow-hidden">
              {renderHeader(0, sectionStart0)}
              {renderRows(0, sectionStart0)}
            </div>

            {/* Section 2 */}
            <div className="rounded-2xl border border-neutral-300 bg-neutral-100/70 overflow-hidden">
              {renderHeader(1, sectionStart1)}
              {renderRows(1, sectionStart1)}
            </div>
          </div>
        </div>

        {/* RIGHT (Pool) */}
        <div
          className={`shrink-0 border-l border-neutral-800 bg-neutral-950/95 p-3 overflow-y-auto ${
            draggingId && hoverPool ? "ring-2 ring-orange-500/70 ring-inset" : ""
          }`}
          style={{ width: POOL_W, height: "100%" }}
          title="Hierhin ziehen = Projekt aus dem Board entfernen"
          onDragOver={(e) => {
            e.preventDefault();
            setHoverPool(true);
            setHoverRowId(null);
          }}
          onDragLeave={() => setHoverPool(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();

            const pid = e.dataTransfer.getData("text/plain");
            if (!pid) return;

            removeFromLayout(pid);

            setDraggingId(null);
            setHoverPool(false);
            clearDnDHovers();
          }}
        >
          <div className="text-xs text-neutral-400">Projekt-Pool</div>
          <div className="text-[11px] text-neutral-600 mt-1">Drop hierhin, um ein Projekt aus dem Board zu entfernen.</div>

          <div className="mt-3 space-y-2">
            {poolProjects.length === 0 ? (
              <div className="text-xs text-neutral-500 p-2">Alle aktiven Projekte sind eingeplant.</div>
            ) : (
              poolProjects.map((pp: any) => (
                <div
                  key={String(pp?.id ?? "")}
                  draggable
                  onDragStart={(e) => onDragStart(e, String(pp.id))}
                  onDragEnd={onDragEnd}
                  className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2 cursor-grab active:cursor-grabbing"
                  title="Ins Board ziehen: auf einen Mitarbeiter droppen"
                >
                  <div className="text-xs font-medium text-neutral-100 truncate">{String(pp?.name ?? "Ohne Name")}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">ID: {String(pp?.id ?? "")}</div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 text-[11px] text-neutral-600">
            Debug:
            <div className="mt-1">
              viewport: {vw}×{vh}
            </div>
            <div>
              rowH: {layout.rowH}px · gridW: {layout.totalGridW}px · cols: {layout.cols}
            </div>
            <div className="mt-2">
              blocks: <span className="text-neutral-300">{blocks.length}</span> · parts:{" "}
              <span className="text-neutral-300">{blockParts.length}</span>
            </div>
            <div className="mt-1">Tipp: Shift beim Drop toggelt Lane.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
