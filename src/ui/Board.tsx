// src/ui/Board.tsx
import React, { useMemo, useState } from "react";
import type { State } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";

type Props = {
  state: State; // Projekte + Buchungen
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState; // Mitarbeiter (Admin)
};

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfIsoWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=So..6=Sa
  const diff = (day === 0 ? -6 : 1) - day; // Montag
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function isoWeekNumber(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Donnerstag
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

function safeNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Versucht Verantwortlichen aus Projekt zu lesen (robust, ohne Modellzwang)
function pickOwnerId(p: any): string | null {
  const cands = [
    p?.meisterId,
    p?.hauptverantwortlicherId,
    p?.verantwortlicherId,
    p?.ownerId,
    p?.assignedToId,
    p?.mitarbeiterId,
  ];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

// --- ARBEITSMAP (für blaue Zellen) ---
function extractWorkMinutesIndex(state: any): Map<string, number> {
  const arr =
    (Array.isArray(state?.buchungen) && state.buchungen) ||
    (Array.isArray(state?.zeiten) && state.zeiten) ||
    (Array.isArray(state?.entries) && state.entries) ||
    (Array.isArray(state?.log) && state.log) ||
    [];

  const m = new Map<string, number>();

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;

    const mitarbeiterId = String(e.mitarbeiterId ?? e.userId ?? e.personId ?? "");
    const datum = String(e.datum ?? e.isoDate ?? e.date ?? "");
    if (!mitarbeiterId || !datum) continue;

    const art = e.art ?? e.type ?? e.kind ?? null;

    const minutes =
      safeNumber(e.minuten) ||
      safeNumber(e.minutes) ||
      (safeNumber(e.stunden) ? Math.round(safeNumber(e.stunden) * 60) : 0) ||
      (safeNumber(e.hours) ? Math.round(safeNumber(e.hours) * 60) : 0);

    const isWork = art === "arbeit" || art === "work" || (!art && minutes > 0);
    if (!isWork) continue;

    const key = `${mitarbeiterId}__${datum}`;
    m.set(key, (m.get(key) ?? 0) + (minutes > 0 ? minutes : 1));
  }

  return m;
}

// --- BOARD LAYOUT (persistiert im state) ---
// Minimal: Position je Projekt
type LayoutPos = {
  rowId: string; // Mitarbeiter-ID
  weekRow: 0 | 1;
  startCol: number; // 0..23
  lane: number; // 0..2
};

// Farbmarker pro Meister (deterministisch aus ID -> eine von N Farben)
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function meisterColorClass(meisterId: string | null) {
  if (!meisterId) return "bg-orange-500"; // fallback
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

type Block = {
  id: string;
  name: string;
  rowId: string;
  lane: number;
  weekRow: 0 | 1;
  startCol: number;
  span: number;
  meisterId: string | null;
};

export default function Board({ state, setState, ms }: Props) {
  const mitarbeiter = (ms as any)?.mitarbeiter ?? [];
  const projects = (state as any)?.projects ?? [];
  const activeProjects = useMemo(() => projects.filter((p: any) => !!p.active), [projects]);

  // Arbeitsindex (für blau)
  const workIdx = useMemo(() => extractWorkMinutesIndex(state as any), [state]);

  // Fenster 8 Wochen: -2 .. +5
  const { weeks, currentWeekIndex } = useMemo(() => {
    const now = new Date();
    const cw = startOfIsoWeek(now);
    const ws = addDays(cw, -14);
    const list: Date[] = [];
    for (let i = 0; i < 8; i++) list.push(addDays(ws, i * 7));
    return { weeks: list, currentWeekIndex: 2 };
  }, []);

  const topWeeks = weeks.slice(0, 4);
  const bottomWeeks = weeks.slice(4, 8);

  // 4 Wochen x 6 Tage = 24 Spalten je Reihe
  const COLS = 24;

  // Layout: Wochen dürfen breiter werden (hier einstellen)
  const NAME_COL_W = 190;
  const CELL_W = 56; // <-- breiter (vorher ~42)
  const LANES = 3;
  const LANE_H = 24;

  // Datum pro Spalte
  function dateForCol(weekRow: 0 | 1, col: number) {
    const weekIdx = Math.floor(col / 6); // 0..3
    const dayIdx = col % 6; // 0..5
    const base = weekRow === 0 ? topWeeks[weekIdx] : bottomWeeks[weekIdx];
    return addDays(base, dayIdx);
  }

  function hasWork(mitarbeiterId: string, d: Date) {
    const key = `${mitarbeiterId}__${isoDate(d)}`;
    return (workIdx.get(key) ?? 0) > 0;
  }

  // --- Persistiertes Layout lesen ---
  const layout: Record<string, LayoutPos> = (state as any)?.boardLayout ?? {};

  // --- Auto-Layout nur als Fallback, wenn Projekt noch keine gespeicherte Position hat ---
  const autoFallback: Record<string, LayoutPos> = useMemo(() => {
    if (mitarbeiter.length === 0) return {};
    if (activeProjects.length === 0) return {};

    const startBase = (currentWeekIndex % 4) * 6; // 12
    const cursor: Record<string, { top: number; bottom: number; laneTop: number; laneBottom: number }> = {};
    for (const m of mitarbeiter) cursor[m.id] = { top: startBase, bottom: 0, laneTop: 0, laneBottom: 0 };

    let rr = 0;
    const pickRowForProject = (p: any) => {
      const owner = pickOwnerId(p);
      if (owner && mitarbeiter.some((m: any) => m.id === owner)) return owner;
      const rowId = mitarbeiter[rr % mitarbeiter.length].id;
      rr++;
      return rowId;
    };

    const out: Record<string, LayoutPos> = {};
    for (const p of activeProjects) {
      const pid = String(p.id);
      if (layout[pid]) continue;

      const rowId = pickRowForProject(p);
      const meisterId = pickOwnerId(p);

      const hours = safeNumber(p.kalkStunden);
      const days = Math.max(1, Math.ceil(hours / 8));
      const span = clamp(days, 1, COLS);

      const c = cursor[rowId];
      const startTop = clamp(c.top, 0, COLS - 1);
      const endTop = startTop + span;

      if (endTop <= COLS) {
        out[pid] = { rowId, weekRow: 0, startCol: startTop, lane: c.laneTop };
        c.top = clamp(endTop + 1, 0, COLS);
        c.laneTop = (c.laneTop + 1) % LANES;
      } else {
        const startBottom = clamp(c.bottom, 0, COLS - 1);
        out[pid] = { rowId, weekRow: 1, startCol: startBottom, lane: c.laneBottom };
        c.bottom = clamp(startBottom + span + 1, 0, COLS);
        c.laneBottom = (c.laneBottom + 1) % LANES;
      }
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mitarbeiter, activeProjects, currentWeekIndex, COLS, LANES]);

  // Blöcke (Layout aus state + fallback)
  const blocks: Block[] = useMemo(() => {
    if (mitarbeiter.length === 0) return [];
    return activeProjects.map((p: any) => {
      const pid = String(p.id);
      const pos = layout[pid] ?? autoFallback[pid];
      const meisterId = pickOwnerId(p);

      const hours = safeNumber(p.kalkStunden);
      const days = Math.max(1, Math.ceil(hours / 8));
      const span = clamp(days, 1, COLS);

      // Wenn gar keine Position: auf ersten Mitarbeiter oben links
      const rowId = pos?.rowId ?? mitarbeiter[0]?.id ?? "m1";
      const weekRow = (pos?.weekRow ?? 0) as 0 | 1;
      const startCol = clamp(pos?.startCol ?? (currentWeekIndex % 4) * 6, 0, COLS - 1);
      const lane = clamp(pos?.lane ?? 0, 0, LANES - 1);

      return {
        id: pid,
        name: String(p.name ?? "Projekt"),
        rowId: String(rowId),
        weekRow,
        startCol,
        lane,
        span,
        meisterId,
      };
    });
  }, [activeProjects, layout, autoFallback, mitarbeiter, currentWeekIndex, COLS, LANES]);

  // --- Drag State (nur UI) ---
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function saveLayout(projectId: string, nextPos: LayoutPos) {
    setState((s) => {
      const next = structuredClone(s) as any;
      if (!next.boardLayout) next.boardLayout = {};
      next.boardLayout[projectId] = nextPos;
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

  function onDropOnLane(e: React.DragEvent, target: { rowId: string; weekRow: 0 | 1; lane: number; col: number }) {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;

    saveLayout(projectId, {
      rowId: target.rowId,
      weekRow: target.weekRow,
      lane: clamp(target.lane, 0, LANES - 1),
      startCol: clamp(target.col, 0, COLS - 1),
    });
    setDraggingId(null);
  }

  function renderRowSection(weekRow: 0 | 1, weeks4: Date[]) {
    const sectionBlocks = blocks.filter((b) => b.weekRow === weekRow);

    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        {/* KW-Header */}
        <div className="flex">
          <div className="shrink-0 border-r border-neutral-800" style={{ width: NAME_COL_W, height: 30 }} />
          {weeks4.map((wStart, idx) => {
            const globalWeekIdx = weekRow === 0 ? idx : idx + 4;
            const isCurrent = globalWeekIdx === currentWeekIndex;

            return (
              <div
                key={idx}
                className={`flex items-center justify-center text-xs font-medium border-r border-neutral-800 ${
                  isCurrent ? "bg-orange-500 text-neutral-950" : "bg-neutral-900 text-neutral-300"
                }`}
                style={{ width: 6 * CELL_W, height: 30 }}
                title={isCurrent ? "Aktuelle Woche (fix)" : ""}
              >
                KW {isoWeekNumber(wStart)}
              </div>
            );
          })}
        </div>

        {/* Tage-Header */}
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
            const isSaturday = i % 6 === 5;

            return (
              <div
                key={i}
                className={`text-[11px] text-center border-r border-neutral-800 py-2 ${
                  isWeekBoundary ? "bg-neutral-900/50" : "bg-neutral-950"
                } ${isSaturday ? "text-neutral-500" : "text-neutral-400"}`}
                style={{ width: CELL_W }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* Mitarbeiter-Liste */}
        {mitarbeiter.length === 0 ? (
          <div className="p-4 text-sm text-neutral-400">Keine Mitarbeiter vorhanden (Admin v1).</div>
        ) : (
          mitarbeiter.map((m: any) => {
            const rowBlocks = sectionBlocks.filter((b) => b.rowId === String(m.id));

            return (
              <div key={m.id} className="flex border-b border-neutral-800 last:border-b-0">
                {/* Name */}
                <div
                  className="shrink-0 border-r border-neutral-800 px-2 flex items-center text-sm text-neutral-100"
                  style={{ width: NAME_COL_W, height: LANES * LANE_H }}
                >
                  <div className="truncate">{m.name}</div>
                </div>

                {/* Raster + Drop-Zonen */}
                <div className="relative" style={{ width: COLS * CELL_W, height: LANES * LANE_H }}>
                  {/* Raster (mit Blau wenn Arbeit) */}
                  <div className="absolute inset-0">
                    {Array.from({ length: LANES }).map((_, lane) => (
                      <div key={lane} className="flex" style={{ height: LANE_H }}>
                        {Array.from({ length: COLS }).map((_, col) => {
                          const isWeekBoundary = col % 6 === 0;
                          const isSaturday = col % 6 === 5;

                          const d = dateForCol(weekRow, col);
                          const worked = hasWork(String(m.id), d);

                          const bg = worked
                            ? "bg-blue-600/35"
                            : isWeekBoundary
                              ? "bg-neutral-900/40"
                              : "bg-neutral-950";

                          return (
                            <div
                              key={col}
                              className={`border-r border-neutral-800 ${bg} ${isSaturday ? "bg-neutral-950/60" : ""}`}
                              style={{ width: CELL_W, height: LANE_H }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) =>
                                onDropOnLane(e, {
                                  rowId: String(m.id),
                                  weekRow,
                                  lane,
                                  col,
                                })
                              }
                              title={worked ? "Arbeit gebucht" : "Drop: Projekt hierhin"}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Projektblöcke */}
                  {rowBlocks.map((b) => {
                    const meisterBadge = meisterColorClass(b.meisterId);
                    const isDragging = draggingId === b.id;

                    return (
                      <div
                        key={b.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, b.id)}
                        onDragEnd={onDragEnd}
                        className={`absolute rounded-lg border px-2 flex items-center select-none cursor-move ${
                          isDragging
                            ? "border-orange-500 bg-neutral-800 text-neutral-100 opacity-70"
                            : "border-orange-500/80 bg-neutral-900 text-neutral-100"
                        }`}
                        style={{
                          top: b.lane * LANE_H + 2,
                          height: LANE_H - 4,
                          left: b.startCol * CELL_W + 2,
                          width: b.span * CELL_W - 4,
                        }}
                        title="Drag & Drop: Projekt verschieben"
                      >
                        {/* Meister-Farbmarker */}
                        <div className={`h-3 w-3 rounded-sm mr-2 ${meisterBadge}`} title="Meister/Ansprechpartner" />
                        <div className="truncate text-xs font-medium">{b.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {renderRowSection(0, topWeeks)}
      {renderRowSection(1, bottomWeeks)}

      <div className="text-xs text-neutral-500">
        Blau = Arbeit gebucht · Drag&Drop = Projekt neu planen · Farbpunkt = Meister/Ansprechpartner (deterministisch).
      </div>
    </div>
  );
}
