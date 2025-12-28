import React, { useMemo, useRef, useEffect, useState } from "react";
import type { State } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";
import { sollMinutenForIsoDate, DEFAULT_WOCHENMODELL } from "../core/workModel";
import { loadBoardIds, saveBoardIds } from "../core/boardStore";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
type Bereich = "maschine" | "bank" | "lack" | "montage";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
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
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
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

/**
 * Regel:
 * - Hauptstrahl (Zeile) = operativ verantwortlich (zugeordnetAnId)
 * - Farbe = planender Meister (hauptdarstellerId)
 */
function pickPlannerMeisterId(p: any): string | null {
  const cands = [p?.meisterId, p?.hauptdarstellerId, p?.hauptverantwortlicherId, p?.verantwortlicherId, p?.ownerId];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}
function pickOperativId(p: any): string | null {
  const cands = [p?.zugeordnetAnId, p?.assignedToId];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

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

// ✅ Minuten-Index pro Mitarbeiter + Projekt + Datum (Core-Aggregation bleibt!)
function extractProjectDayMinutesIndex(state: any): Map<string, number> {
  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];
  const m = new Map<string, number>();

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if ((e as any).art !== "arbeit") continue;

    const mitarbeiterId = String((e as any).mitarbeiterId ?? "");
    const projektId = String((e as any).projektId ?? "");
    const datum = String((e as any).datum ?? "");
    if (!mitarbeiterId || !projektId || !datum) continue;

    const minutes = safeNumber((e as any).minuten) || 0;
    const key = `${mitarbeiterId}__${projektId}__${datum}`;
    m.set(key, (m.get(key) ?? 0) + Math.max(0, minutes));
  }

  return m;
}

// ✅ Projekt: Gesamtminuten + erste Buchung (Start) + Bereiche-Summen
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

    const minutes = Math.max(0, safeNumber((e as any).minuten) || 0);
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

// ✅ Spuren: pro Mitarbeiter + Datum -> Liste (ProjektId, Minuten) aggregiert
function extractEmployeeDayProjectMinutes(state: any): Map<string, Array<{ projektId: string; minuten: number }>> {
  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];
  const tmp = new Map<string, Map<string, number>>();

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if ((e as any).art !== "arbeit") continue;

    const mitarbeiterId = String((e as any).mitarbeiterId ?? "");
    const projektId = String((e as any).projektId ?? "");
    const datum = String((e as any).datum ?? "");
    if (!mitarbeiterId || !projektId || !datum) continue;

    const minutes = safeNumber((e as any).minuten) || 0;
    if (minutes <= 0) continue;

    const key = `${mitarbeiterId}__${datum}`;
    if (!tmp.has(key)) tmp.set(key, new Map());
    const inner = tmp.get(key)!;
    inner.set(projektId, (inner.get(projektId) ?? 0) + Math.max(0, minutes));
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

// ✅ Projekte mit Buchungen im sichtbaren Zeitraum (nur zur “Sichtbarkeits”-Hilfe, nicht für Offset)
function extractBookedProjectIdsInRange(state: any, isoFrom: string, isoTo: string): Set<string> {
  const fromTs = parseIso(isoFrom).getTime();
  const toTs = parseIso(isoTo).getTime();
  const out = new Set<string>();

  const arr = Array.isArray(state?.buchungen) ? state.buchungen : [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if ((e as any).art !== "arbeit") continue;
    const datum = String((e as any).datum ?? "");
    const projektId = String((e as any).projektId ?? "");
    if (!datum || !projektId) continue;

    const ts = parseIso(datum).getTime();
    if (ts >= fromTs && ts <= toTs) out.add(projektId);
  }

  return out;
}

type LayoutPos = { rowId: string; startCol: number };
type Block = {
  id: string;
  name: string;
  rowId: string;
  startCol: number; // 0..23 (oben)
  spanCols: number; // 1..48
  meisterId: string | null;
  operativId: string | null;
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
  operativId: string | null;
  planMinuten: number;
  relStart: number;
};

export default function Board({ state, setState, ms }: Props) {
  const mitarbeiter = (ms as any)?.mitarbeiter ?? [];
  const projects = (state as any)?.projects ?? [];
  const running = (state as any)?.running ?? null;

  const { topWeeks, bottomWeeks, rangeFromIso, rangeToIso } = useMemo(() => {
    const now = new Date();
    const cw = startOfIsoWeek(now);
    const top = [addDays(cw, -7), cw, addDays(cw, 7), addDays(cw, 14)];
    const bot = [addDays(cw, 21), addDays(cw, 28), addDays(cw, 35), addDays(cw, 42)];

    const fromIso = isoDate(top[0]);
    const toIso = isoDate(addDays(bot[3], 5));
    return { topWeeks: top, bottomWeeks: bot, rangeFromIso: fromIso, rangeToIso: toIso };
  }, []);

  const COLS = 24;
  const CELL_W = 80;
  const NAME_COL_W = 240;
  const LANES = 3;
  const LANE_H = 32;

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
      const d = dateForCol(weekRow, col).getTime();
      if (d === target) return col;
    }
    return null;
  }

  function sollMinutenFor(m: any, iso: string) {
    const modell = m?.modell ?? DEFAULT_WOCHENMODELL;
    return sollMinutenForIsoDate(modell, iso);
  }

  const minutesIdx = useMemo(() => extractProjectDayMinutesIndex(state as any), [state]);
  const empDayProjIdx = useMemo(() => extractEmployeeDayProjectMinutes(state as any), [state]);
  const projTotals = useMemo(() => extractProjectTotals(state as any), [state]);

  function bookedMinutesForEmployeeProjectDay(mitarbeiterId: string, projektId: string, iso: string) {
    return minutesIdx.get(`${mitarbeiterId}__${projektId}__${iso}`) ?? 0;
  }

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

  // Sichtbarkeit: BoardIds + laufendes Projekt + Buchungen (aber activeProjects sind alle)
  const boardIds = useMemo(() => loadBoardIds(), []);
  const bookedIds = useMemo(
    () => extractBookedProjectIdsInRange(state as any, rangeFromIso, rangeToIso),
    [state, rangeFromIso, rangeToIso]
  );

  const visibleProjectIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of boardIds) s.add(String(id));
    if (running?.projektId) s.add(String(running.projektId));
    for (const id of bookedIds) s.add(String(id));
    return s;
  }, [boardIds, running?.projektId, bookedIds]);

  const activeProjectsAll = useMemo(() => (projects ?? []).filter((p: any) => !!p?.active), [projects]);
  const activeProjects = activeProjectsAll;

  useEffect(() => {
    if (boardIds.length > 0) return;
    if (activeProjectsAll.length === 0) return;
    const ids = activeProjectsAll.map((p: any) => String(p.id));
    saveBoardIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layout: Record<string, LayoutPos> = (state as any)?.boardLayout ?? {};

  const autoFallback: Record<string, LayoutPos> = useMemo(() => {
    if (mitarbeiter.length === 0) return {};
    const out: Record<string, LayoutPos> = {};
    let rr = 0;
    let cursor = 0;

    for (const p of activeProjects) {
      const pid = String(p.id);
      if (layout[pid]) continue;

      const rowId = String(mitarbeiter[rr % mitarbeiter.length]?.id ?? "m1");
      rr++;

      out[pid] = { rowId, startCol: clamp(cursor, 0, COLS - 1) };
      cursor = clamp(cursor + 3, 0, COLS - 1);
    }

    return out;
  }, [mitarbeiter, activeProjects, layout]);

  const blocks: Block[] = useMemo(() => {
    if (mitarbeiter.length === 0) return [];

    return activeProjects.map((p: any) => {
      const pid = String(p.id);
      const pos = layout[pid] ?? autoFallback[pid];

      const meisterId = pickPlannerMeisterId(p);
      const operativId = pickOperativId(p);

      const planMinuten = Math.max(0, Math.round((safeNumber(p.kalkStunden) || 0) * 60));

      const hours = safeNumber(p.kalkStunden);
      const days = Math.max(1, Math.ceil(hours / 8));
      const spanCols = clamp(days, 1, COLS * 2);

      const anchoredRowId =
        pos?.rowId
          ? String(pos.rowId)
          : operativId
            ? String(operativId)
            : String(mitarbeiter[0]?.id ?? "m1");

      return {
        id: pid,
        name: String(p.name ?? "Projekt"),
        rowId: anchoredRowId,
        startCol: clamp(pos?.startCol ?? 0, 0, COLS - 1),
        spanCols,
        meisterId,
        operativId: operativId ? String(operativId) : null,
        planMinuten,
      };
    });
  }, [activeProjects, layout, autoFallback, mitarbeiter]);

  function splitBlock(b: Block): BlockPart[] {
    const parts: BlockPart[] = [];
    const topAvail = Math.max(0, COLS - b.startCol);
    const topSpan = Math.min(b.spanCols, topAvail);

    if (topSpan > 0) {
      parts.push({
        key: `${b.id}__top`,
        projectId: b.id,
        name: b.name,
        rowId: b.rowId,
        weekRow: 0,
        startCol: b.startCol,
        span: topSpan,
        meisterId: b.meisterId,
        operativId: b.operativId,
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
        operativId: b.operativId,
        planMinuten: b.planMinuten,
        relStart: topSpan,
      });
    }

    return parts;
  }

  const blockParts: BlockPart[] = useMemo(() => blocks.flatMap(splitBlock), [blocks]);

  // ✅ Gesamtspan pro Projekt
  const projectTotalSpanCols = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of blockParts) {
      const end = p.relStart + p.span;
      const cur = m.get(String(p.projectId)) ?? 0;
      if (end > cur) m.set(String(p.projectId), end);
    }
    return m;
  }, [blockParts]);

  // ✅ Geplanter Start als ISO pro Projekt (aus Layout: top row startCol -> Datum)
  const plannedStartIsoByProject = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) {
      // Planung ist immer in der oberen Reihe verankert (startCol)
      const d = dateForCol(0, clamp(b.startCol, 0, COLS - 1));
      m.set(String(b.id), isoDate(d));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, topWeeks.join?.(",")]);

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

  function onDropOnLane(
    e: React.DragEvent,
    target: { rowId: string; weekRow: 0 | 1; lane: number; col: number }
  ) {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;

    saveLayout(projectId, {
      rowId: target.rowId,
      startCol: target.weekRow === 0 ? clamp(target.col, 0, COLS - 1) : 0,
    });

    setDraggingId(null);
  }

  // Fokus: auf laufendes Projekt (geplante Position), NICHT auf Tag
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.projektId, blockParts]);

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

  function renderSection(weekRow: 0 | 1, weeks4: Date[], scrollRef: React.RefObject<HTMLDivElement>) {
    const parts = blockParts.filter((p) => p.weekRow === weekRow);
    const activeCol = running?.datum ? colForIso(weekRow, running.datum) : null;

    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div ref={scrollRef} className="overflow-x-auto">
          <div className="min-w-max">
            <div className="flex">
              <div className="shrink-0 border-r border-neutral-800" style={{ width: NAME_COL_W, height: 32 }} />
              {weeks4.map((wStart, idx) => {
                const isCurrent = weekRow === 0 && idx === 1;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-center text-xs font-semibold border-r border-neutral-800 ${
                      isCurrent ? "bg-orange-500 text-neutral-950" : "bg-neutral-900 text-neutral-300"
                    }`}
                    style={{ width: 6 * CELL_W, height: 32 }}
                  >
                    KW {isoWeekNumber(wStart)}
                  </div>
                );
              })}
            </div>

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

            {mitarbeiter.map((m: any) => {
              const rowParts = parts.filter((p) => p.rowId === String(m.id));

              return (
                <div key={m.id} className="flex border-b border-neutral-800 last:border-b-0">
                  <div
                    className="shrink-0 border-r border-neutral-800 px-2 flex items-center text-sm text-neutral-100"
                    style={{ width: NAME_COL_W, height: LANES * LANE_H }}
                  >
                    <div className="truncate">{m.name}</div>
                  </div>

                  <div className="relative" style={{ width: COLS * CELL_W, height: LANES * LANE_H }}>
                    <div className="absolute inset-0">
                      {Array.from({ length: LANES }).map((_, lane) => (
                        <div key={lane} className="flex" style={{ height: LANE_H }}>
                          {Array.from({ length: COLS }).map((_, col) => {
                            const isWeekBoundary = col % 6 === 0;
                            const isActive = activeCol === col;

                            return (
                              <div
                                key={col}
                                className={`relative border-r border-neutral-800 ${
                                  isWeekBoundary ? "bg-neutral-900/35" : "bg-neutral-950"
                                } ${isActive ? "bg-blue-500/5" : ""}`}
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
                              >
                                {lane === 0 ? (() => {
                                  const iso = isoDate(dateForCol(weekRow, col));
                                  const key = `${String(m.id)}__${iso}`;
                                  const entries = empDayProjIdx.get(key) ?? [];
                                  if (entries.length === 0) return null;

                                  const filtered = entries.filter((e) => {
                                    const proj = projectById.get(String(e.projektId));
                                    const operativId = pickOperativId(proj);
                                    return String(operativId ?? "") !== String(m.id);
                                  });
                                  if (filtered.length === 0) return null;

                                  const soll = sollMinutenFor(m, iso);
                                  const denom = Math.max(1, soll > 0 ? soll : 480);

                                  const shown = filtered.slice(0, 3);
                                  const rest = filtered.length - shown.length;

                                  return (
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
                                  );
                                })() : null}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {rowParts.map((p, partIdx) => {
                      const meisterBadge = meisterColorClass(p.meisterId);
                      const isDragging = draggingId === p.projectId;
                      const isRunningProject = String(running?.projektId ?? "") === String(p.projectId);

                      const blockLeft = p.startCol * CELL_W + 2;
                      const blockTop = (partIdx % LANES) * LANE_H + 2;
                      const blockW = p.span * CELL_W - 4;
                      const blockH = LANE_H - 4;

                      const totalMin = projTotals.totalMin.get(p.projectId) ?? 0;
                      const planMin = Math.max(0, p.planMinuten);
                      const first = projTotals.firstIso.get(p.projectId) ?? null;

                      const totalSpanCols = projectTotalSpanCols.get(String(p.projectId)) ?? Math.max(1, p.relStart + p.span);

                      // ✅ HIER ist der Fix: Startposition NICHT aus Sichtfenster ableiten,
                      // sondern aus Datum-Differenz: (Ist-Start) - (geplanter Start)
                      const plannedStartIso = plannedStartIsoByProject.get(String(p.projectId)) ?? isoDate(dateForCol(0, 0));
                      const startOffsetDays = first ? diffDaysIso(plannedStartIso, first) : 0;
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

                      const area = projTotals.areaMin.get(p.projectId) ?? { maschine: 0, bank: 0, lack: 0, montage: 0 };
                      const areaTotal = Math.max(1, area.maschine + area.bank + area.lack + area.montage);
                      const areaShares: Array<{ b: Bereich; share: number }> = [
                        { b: "maschine", share: area.maschine / areaTotal },
                        { b: "bank", share: area.bank / areaTotal },
                        { b: "lack", share: area.lack / areaTotal },
                        { b: "montage", share: area.montage / areaTotal },
                      ].filter((x) => x.share > 0.0001);

                      const plannedLeftPx = (partPlannedStart - partStart) * CELL_W;
                      const plannedWidthPx = partPlannedLen * CELL_W;

                      const overLeftPx = (partOverStart - partStart) * CELL_W;
                      const overWidthPx = partOverLen * CELL_W;

                      const showAnyProgress = totalMin > 0 && first != null && (partPlannedLen > 0 || partOverLen > 0);

                      const tooltip = () => {
                        const pname = String(projectById.get(String(p.projectId))?.name ?? p.name ?? p.projectId);
                        const aTxt = `M:${minutesToHM(area.maschine)} · B:${minutesToHM(area.bank)} · L:${minutesToHM(
                          area.lack
                        )} · Mo:${minutesToHM(area.montage)}`;
                        return `${pname}\nGeplant: ${plannedStartIso}\nIst-Start: ${first ?? "—"}\nGesamt: ${minutesToHM(
                          totalMin
                        )} / Kalk: ${minutesToHM(planMin)}\nBereiche: ${aTxt}`;
                      };

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
                        >
                          <div className="absolute inset-0 flex">
                            {Array.from({ length: p.span }).map((_, i) => (
                              <div
                                key={i}
                                className="h-full border-r border-neutral-800/60 bg-neutral-950"
                                style={{ width: CELL_W }}
                              />
                            ))}
                          </div>

                          {showAnyProgress ? (
                            <>
                              <div
                                className="absolute top-0 bottom-0"
                                style={{ left: plannedLeftPx, width: plannedWidthPx }}
                                title={tooltip()}
                              >
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

                          {p.key.endsWith("__top") ? (
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
    <div className="flex flex-col gap-3">
      {renderSection(0, topWeeks, scrollTopRef)}
      {renderSection(1, bottomWeeks, scrollBottomRef)}
      <div className="text-xs text-neutral-500">
        Fix: Fortschrittsstart wird aus (Ist-Start – geplanter Start) berechnet, nicht aus Sichtfenster-Cols. Dadurch funktioniert
        es für alle Projekte – auch wenn der Ist-Start außerhalb der 8 Wochen liegt.
      </div>
    </div>
  );
}
