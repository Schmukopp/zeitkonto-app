// src/ui/BoardV2.tsx
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { State } from "../core/timeStore";
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
 * Board V2 – Schritt 1:
 * - Layout-Engine Vollbild (2×4 Wochen)
 * - Minimal: Projekt-Planblöcke anzeigen
 * - Fr/Sa werden im Plan unterbrochen, wenn an diesem Tag für DAS Projekt keine Buchungen existieren
 * - KEIN Drag&Drop, KEINE Buchungs-Segmente (nur Plan-Outline)
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// YYYY-MM-DD aus lokalem Date (stabil für UI + Keys)
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

export default function BoardV2(p: Props) {
  const { state, ms } = p;

  const mitarbeiterAll = ms.mitarbeiter ?? [];
  const mitarbeiter = useMemo(() => {
    const arr = Array.isArray(mitarbeiterAll) ? mitarbeiterAll.slice() : [];
    arr.sort((a: any, b: any) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "de"));
    return arr;
  }, [mitarbeiterAll]);

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

  // 8-Wochen-Fenster (2×4 Wochen) – wie bisher: 1 Woche zurück starten
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

  // ====== Layout aus State ziehen (V1-Layout weiterverwenden) ======
  const layoutMap: LayoutMap = (((state as any)?.boardLayout ?? {}) as any) || {};

  const activeProjects = useMemo(() => {
    const arr: any[] = Array.isArray((state as any)?.projects) ? ((state as any).projects as any[]) : [];
    return arr.filter((p) => p && p?.status !== "archiv" && p?.active !== false);
  }, [state]);

  // ====== Block-Spans (einfach & stabil) ======
  function calcSpanColsFromStart(projectId: string, startDate: Date, minutesTarget: number): number {
    // Ziel: grobe Planlänge über Tage schätzen.
    // Wir wollen hier NICHT die komplette V1-Logik replizieren.
    // Rule:
    // - pro Werktag (Mo–Do) 600min Kapazität
    // - Fr/Sa zählen nur, wenn Buchungen existieren (sonst "Lücke" / keine Kapazität)
    if (minutesTarget <= 0) return 1;

    let remain = minutesTarget;
    let span = 0;

    const MAX = 24 * 2; // maximal über 2 Sektionen
    for (let i = 0; i < MAX; i++) {
      const d = addDays(startDate, i);
      const iso = isoFromLocalDate(d);
      const bookedThisProject = (projectDayMin.get(`${projectId}__${iso}`) ?? 0) > 0;

      const isFriSat = isFriOrSatLocal(d);
      if (isFriSat && !bookedThisProject) {
        // zählt als "Zeit vergeht", aber keine Kapazität (Plan wird unterbrochen)
        span++;
        continue;
      }

      // einfache Kapazität
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

    for (const p of activeProjects as any[]) {
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
      const minutesTarget = Math.max(planMin, bookedMin, 60); // min 1 Tag

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
  }, [activeProjects, layoutMap, projectTotalMin, sectionStart0, projectDayMin, layout.cols]);

  // ====== Wrap auf 2 Sektionen (oben/unten) ======
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
  function buildPlanOutlineSegments(
    part: BlockPart,
    sectionStart: Date
  ): Array<{ start: number; span: number }> {
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

  function renderHeader(sectionIdx: number, sectionStart: Date) {
    return (
      <div className="flex border-b border-neutral-800" style={{ height: layout.headerH }}>
        {/* Name-Spalte */}
        <div className="px-3 flex items-center text-sm text-neutral-300" style={{ width: NAME_COL_W }}>
          {sectionIdx === 0 ? "Board V2" : ""}
        </div>

        {/* Grid */}
        <div className="relative" style={{ width: layout.totalGridW, height: layout.headerH }}>
          {/* KW Row */}
          <div className="absolute left-0 right-0 top-0" style={{ height: layout.kwRowH }}>
            {Array.from({ length: layout.weeksPerSection }).map((_, wi) => {
              const weekStart = addDays(sectionStart, wi * 7);
              const kw = isoWeekNumberLocal(weekStart);

              const colStart = wi * layout.daysPerWeek;
              const left = colLeft(colStart);

              let width = 0;
              for (let i = 0; i < layout.daysPerWeek; i++) width += colW(colStart + i);

              return (
                <div
                  key={`kw-${sectionIdx}-${wi}`}
                  className="absolute border-r border-neutral-800 bg-neutral-950"
                  style={{ left, width, height: layout.kwRowH }}
                >
                  <div className="h-full flex items-center justify-center text-xs text-neutral-400">
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
                  className={`absolute top-0 bottom-0 border-r border-neutral-800 text-center ${
                    weekend ? "bg-neutral-900/70" : "bg-neutral-950"
                  }`}
                  style={{ left, width }}
                  title={isoDateLocal(d)}
                >
                  <div className="text-[11px] text-neutral-300 leading-5">
                    {["Mo", "Di", "Mi", "Do", "Fr", "Sa"][col % 6]}
                  </div>
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

          return (
            <div
              key={`r-${sectionIdx}-${empId}`}
              className="flex border-b border-neutral-800"
              style={{ height: layout.rowH }}
            >
              <div className="px-3 flex items-center text-sm truncate" style={{ width: NAME_COL_W }} title={empName}>
                <div className="min-w-0 truncate text-neutral-200">{empName}</div>
              </div>

              <div className="relative" style={{ width: layout.totalGridW, height: layout.rowH }}>
                {/* Hintergrundraster */}
                {Array.from({ length: layout.cols }).map((_, col) => {
                  const d = dateForCol(sectionStart, col);
                  const weekend = isFriOrSatLocal(d);
                  return (
                    <div
                      key={`bg-${sectionIdx}-${empId}-${col}`}
                      className={`absolute top-0 bottom-0 border-r border-neutral-800 ${
                        weekend ? "bg-neutral-900/70" : "bg-neutral-950"
                      }`}
                      style={{ left: colLeft(col), width: colW(col) }}
                    />
                  );
                })}

                {/* Projektspur: Plan-Outline (mit Lücken Fr/Sa ohne Buchung) */}
                {rowParts.map((part) => {
                  const segs = buildPlanOutlineSegments(part, sectionStart);
                  if (segs.length === 0) return null;

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

                        const title = `${part.name}\nProjektId: ${part.projectId}`;

                        const showLabel = w >= 140;

                        return (
                          <div
                            key={`${part.key}__seg_${idx}`}
                            className="absolute z-20 rounded-lg border border-orange-500/80 overflow-hidden select-none"
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
    // Vollbildhöhe erzwingen (nur V2)
    <div className="w-full overflow-hidden" style={{ height: "100vh" }}>
      <div className="flex w-full h-full overflow-hidden gap-3">
        {/* LEFT (Board) */}
        <div ref={leftRef} className="flex-1 min-w-0 overflow-hidden" style={{ height: "100vh" }}>
          <div className="flex flex-col gap-3">
            {/* Section 1 */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              {renderHeader(0, sectionStart0)}
              {renderRows(0, sectionStart0)}
            </div>

            {/* Section 2 */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              {renderHeader(1, sectionStart1)}
              {renderRows(1, sectionStart1)}
            </div>
          </div>
        </div>

        {/* RIGHT (Pool placeholder) */}
        <div
          className="shrink-0 border-l border-neutral-800 bg-neutral-950 p-3 overflow-y-auto"
          style={{ width: POOL_W, height: "100vh" }}
        >
          <div className="text-xs text-neutral-400">Projekt-Pool (V2 Platzhalter)</div>
          <div className="text-[11px] text-neutral-600 mt-2">
            Später: Pool + Drag&Drop. Jetzt: Layout + Plan-Lücken validieren.
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-400">
            Drop-Zone (später)
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
          </div>
        </div>
      </div>
    </div>
  );
}
