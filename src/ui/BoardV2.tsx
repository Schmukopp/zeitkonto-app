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
 * Board V2 – nur Layout-Engine sichtbar machen (ohne Buchungen, ohne Projektlogik)
 * Ziel: Du siehst sofort, ob 8 Wochen Vollbild passen und alle Mitarbeiter in 2 Sektionen sichtbar sind.
 */

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

const POOL_W = 300;
const NAME_COL_W = 180;

export default function BoardV2(p: Props) {
  const { ms } = p;

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

  // 8-Wochen-Fenster (2×4 Wochen)
  const baseMonday = useMemo(() => startOfISOWeekLocal(new Date()), []);
  const sectionStart0 = useMemo(() => addDays(baseMonday, -7), [baseMonday]); // eine Woche zurück starten
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

  function renderHeader(sectionIdx: number, sectionStart: Date) {
    return (
      <div className="flex border-b border-neutral-800" style={{ height: layout.headerH }}>
        <div className="px-3 flex items-center text-sm text-neutral-300" style={{ width: NAME_COL_W }}>
          {sectionIdx === 0 ? "Board V2 (Layout)" : ""}
        </div>

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
                  <div className="h-full flex items-center justify-center text-xs text-neutral-400">{kw}</div>
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

  function renderRows(sectionIdx: number, sectionStart: Date) {
    return (
      <>
        {mitarbeiter.map((m: any) => {
          const empName = String(m?.name ?? "Unbekannt");
          const empId = String(m?.id ?? "");

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
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="w-full overflow-hidden" style={{ height: "100vh" }}>
      <div className="flex w-full h-full overflow-hidden gap-3">
        {/* LEFT (Board) */}
        <div ref={leftRef} className="flex-1 min-w-0 overflow-hidden" style={{ height: "100vh" }}>
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              {renderHeader(0, sectionStart0)}
              {renderRows(0, sectionStart0)}
            </div>

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
            Hier kommt später der Pool + Drag&Drop rein. Heute: nur Layout prüfen.
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
          </div>
        </div>
      </div>
    </div>
  );
}
