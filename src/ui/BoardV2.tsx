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
 * Board V2
 * - 2×4 Wochen, Vollbild
 * - Projekte (Planblöcke) + Buchungen (Lanes)
 * - Drag&Drop + Pool rechts
 *
 * Regeln:
 * 1) Block-Start/Ende (wenn Buchungen existieren): Start = erste Buchung, Ende = letzte Buchung (projektweit)
 * 2) Verantwortlicher (Row) bleibt der aktuelle Verantwortliche (zugeordnetAnId / Layout), unabhängig davon wer bucht
 * 3) Fortschritt: Füllung (Meisterfarbe) NUR innerhalb Plan (keine Overrun-Streifen)
 * 4) Überzug: nur rotes !!! hinter dem Projektnamen (Tooltip zeigt Zahlen)
 * 5) Keine IDs in Tooltips/Labels
 */

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

const POOL_W = 300;
const NAME_COL_W = 180;

// Plan-Spur (oben)
const PROJECT_BAND_H = 32;
const MAX_PROJECT_LANES = 2;
const PROJECT_LANE_H = PROJECT_BAND_H / MAX_PROJECT_LANES;

// Buchungen-Lanes (unten)
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
function parseIsoLocal(iso: string): Date | null {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}
function daysBetweenLocal(a: Date, b: Date): number {
  const da = new Date(a);
  const db = new Date(b);
  da.setHours(0, 0, 0, 0);
  db.setHours(0, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// ===== Meisterfarben =====
function hexToRgba(hex: string, alpha01: number) {
  const a = clamp(alpha01, 0, 1);
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(0,0,0,${a})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function pickPlannerMeisterId(p: any): string | null {
  const cands = [
    p?.meisterId,
    p?.hauptverantwortlicherId,
    p?.verantwortlicherId,
    p?.ownerId,
    p?.hauptdarstellerId,
  ];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}
const FALLBACK_ORANGE_HEX = "#f97316";

// ===== Plan-Minuten aus Arbeitsarten (Fallback: kalkStunden) =====
function planMinutenForProjekt(proj: any): number {
  const aa = proj?.arbeitsarten;
  if (aa && typeof aa === "object") {
    const keys: Array<"maschine" | "bank" | "lack" | "montage"> = ["maschine", "bank", "lack", "montage"];
    let sum = 0;
    for (const k of keys) {
      const v = Number(aa?.[k]?.kalkMinuten) || 0;
      if (v > 0) sum += v;
    }
    if (sum > 0) return Math.max(0, Math.round(sum));
  }
  const hrs = Number(proj?.kalkStunden) || 0;
  return Math.max(0, Math.round(hrs * 60));
}

type LayoutPos = { rowId: string; startCol: number; lane?: number };
type LayoutMap = Record<string, LayoutPos>;

type Block = {
  projectId: string;
  name: string;
  rowId: string;
  lane: number; // 0..1

  // ✅ Neu: absolut über 2 Sektionen (0..47)
  startAbsCol: number; // 0..47
  spanCols: number; // max bis Fensterende

  planMinuten: number;
  startIso: string;

  // (bleibt ggf. für später, wird aktuell nicht zwingend gebraucht)
  planSpanCols: number;
  fillInCols: number;
};


type BlockPart = {
  key: string;
  projectId: string;
  name: string;
  rowId: string;
  lane: number;
  sectionIdx: 0 | 1;
  startCol: number;
  span: number;

  planMinuten: number;
  startIso: string;
  relStart: number; // Offset Tage ab startIso
};

type PackedSeg = {
  key: string;
  col: number;
  lane: number;
  left: number;
  width: number;
  label: string;
  tooltip: string;
  colorHex: string;
  dim?: boolean;
};

export default function BoardV2(p: Props) {
  const { state, setState, ms } = p;

  // ===== Mitarbeiter =====
  const mitarbeiterAll = ms.mitarbeiter ?? [];
  const mitarbeiter = useMemo(() => {
    const arr = Array.isArray(mitarbeiterAll) ? mitarbeiterAll.slice() : [];
    arr.sort((a: any, b: any) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "de"));
    return arr;
  }, [mitarbeiterAll]);

  const mitarbeiterNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of mitarbeiterAll as any[]) {
      const id = String((x as any)?.id ?? "").trim();
      if (!id) continue;
      const nm = String((x as any)?.name ?? "").trim();
      if (nm) m.set(id, nm);
    }
    return m;
  }, [mitarbeiterAll]);

  // ===== Meisterfarben je MeisterId =====
  const meisterFarbeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mitarbeiterAll as any[]) {
      if (String((m as any)?.rolle ?? "") !== "meister") continue;
      const id = String((m as any)?.id ?? "").trim();
      if (!id) continue;
      const f = String((m as any)?.farbe ?? "").trim();
      if (f) map.set(id, f);
    }
    return map;
  }, [mitarbeiterAll]);

  function getMeisterFarbe(meisterId: string | null | undefined): string | null {
    if (!meisterId) return null;
    const f = meisterFarbeById.get(String(meisterId));
    return f ? f : null;
  }
  function colorForProject(proj: any): string {
    const mid = pickPlannerMeisterId(proj);
    return getMeisterFarbe(mid) ?? FALLBACK_ORANGE_HEX;
  }

  // ====== Board Höhe ======
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

  // ===== Left viewport messen =====
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

  // 8-Wochen-Fenster: 1 Woche zurück
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

  // ====== Index: Projekt/Tag Minuten (projektweit) ======
  const projectDayMin = useMemo(() => {
    const m = new Map<string, number>();
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

  // ====== Erste/Letzte Buchung pro Projekt (ISO) ======
  const projectFirstLastIso = useMemo(() => {
    const first = new Map<string, string>();
    const last = new Map<string, string>();

    const arr: any[] = Array.isArray((state as any)?.buchungen) ? ((state as any).buchungen as any[]) : [];
    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      if (String(b?.art ?? "") !== "arbeit") continue;

      const pid = String(b?.projektId ?? "").trim();
      if (!pid) continue;

      const iso = String(b?.datum ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

      const f = first.get(pid);
      const l = last.get(pid);
      if (!f || iso < f) first.set(pid, iso);
      if (!l || iso > l) last.set(pid, iso);
    }

    return { first, last };
  }, [state]);

  // ====== Index: Buchungen pro Mitarbeiter/Tag/Projekt ======
  const employeeDayProjIdx = useMemo(() => {
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

  // ====== Projekte ======
  const activeProjects = useMemo(() => {
    const arr: any[] = Array.isArray((state as any)?.projects) ? ((state as any).projects as any[]) : [];
    return arr.filter((p) => p && p?.status !== "archiv" && p?.active !== false);
  }, [state]);

  const projectById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of (state as any)?.projects ?? []) m.set(String((p as any)?.id ?? ""), p);
    return m;
  }, [state]);

  // ====== Layout aus State ziehen (tolerant) ======
  const layoutMapRaw: LayoutMap = (((state as any)?.boardLayout ?? {}) as any) || {};

  // Fallback: wenn boardLayout leer ist, aus zugeordnetAnId rekonstruieren
  const fallbackLayoutMap: LayoutMap = useMemo(() => {
    const out: LayoutMap = {};
    const active = (activeProjects as any[]).filter((pp) => String(pp?.zugeordnetAnId ?? "").trim());

    const laneToggle = new Map<string, number>();

    for (const pp of active) {
      const pid = String(pp?.id ?? "").trim();
      if (!pid) continue;

      const rowId = String(pp?.zugeordnetAnId ?? "").trim();
      if (!rowId) continue;

      // StartCol: erste Buchung falls vorhanden, sonst 0
      const firstIso = projectFirstLastIso.first.get(pid) ?? null;
      let col = 0;
      if (firstIso) {
        const dFirst = parseIsoLocal(firstIso);
        if (dFirst) {
          const diff = daysBetweenLocal(sectionStart0, dFirst);
          col = clamp(diff, 0, layout.cols - 1);
        }
      }

      const last = laneToggle.get(rowId) ?? 0;
      const lane = last === 0 ? 1 : 0;
      laneToggle.set(rowId, lane);

      out[pid] = { rowId, startCol: col, lane };
    }

    return out;
  }, [activeProjects, projectFirstLastIso, sectionStart0, layout.cols]);

  const layoutMapEffective: LayoutMap = useMemo(() => {
    const keys = Object.keys(layoutMapRaw ?? {});
    return keys.length > 0 ? layoutMapRaw : fallbackLayoutMap;
  }, [layoutMapRaw, fallbackLayoutMap]);

  const poolProjects = useMemo(() => {
    return (activeProjects as any[]).filter((p: any) => !layoutMapEffective[String(p?.id ?? "")]);
  }, [activeProjects, layoutMapEffective]);

  const boardProjects = useMemo(() => {
    return (activeProjects as any[]).filter((p: any) => !!layoutMapEffective[String(p?.id ?? "")]);
  }, [activeProjects, layoutMapEffective]);

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
      next.boardLayout[String(projectId)] = { rowId: nextPos.rowId, startCol: nextPos.startCol, lane: nextPos.lane } as any;

      // Verantwortlicher im Projekt speichern (bleibt stabil)
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
      // Verantwortlichen NICHT löschen
      saveState(next as any);
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, projectId: string) {
    setDraggingId(projectId);
    clearDnDHovers();

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(projectId));

    const pos = layoutMapEffective[String(projectId)];
    const lane = clamp(Number(pos?.lane ?? 0), 0, 1);
    e.dataTransfer.setData("application/x-orgaboard-lane", String(lane));
  }

  function onDragEnd() {
    setDraggingId(null);
    clearDnDHovers();
  }

  // ====== Wrap-Parts (wird in onDrop benötigt) ======
  const [blockParts, setBlockParts] = useState<BlockPart[]>([]);

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

    // Kollisionen Sektion 0 vermeiden
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

  // ====== Fallback-Span wenn keine Buchungen ======
  function calcSpanColsFromStart(projectId: string, startDate: Date, minutesTarget: number): number {
    if (minutesTarget <= 0) return 1;
    let remain = minutesTarget;
    let span = 0;

    const MAX = 24 * 2;
    for (let i = 0; i < MAX; i++) {
      const d = addDays(startDate, i);
      const iso = isoFromLocalDate(d);
      const bookedThisProject = (projectDayMin.get(`${projectId}__${iso}`) ?? 0) > 0;

      const isFriSat = isFriOrSatLocal(d);
      if (isFriSat && !bookedThisProject) {
        span++;
        continue;
      }

      const take = Math.min(remain, BASE_CAP_MIN);
      remain -= take;

      span++;
      if (remain <= 0) break;
    }

    return Math.max(1, span);
  }

  // ====== Blocks bauen ======
    const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];

    const WINDOW_COLS = layout.cols * 2; // 48

    for (const p of boardProjects as any[]) {
      const pid = String(p?.id ?? "");
      if (!pid) continue;

      // ✅ Wichtig: layoutMapEffective (nicht layoutMap / layoutMapRaw)
      const pos = layoutMapEffective[pid];
      if (!pos) continue;

      const rowId = String(pos.rowId ?? "");
      if (!rowId) continue;

      const lane = clamp(Number(pos.lane ?? 0), 0, MAX_PROJECT_LANES - 1);

      const planMin = planMinutenForProjekt(p);

      const firstIso = projectFirstLastIso.first.get(pid) ?? null;
      const lastIso = projectFirstLastIso.last.get(pid) ?? null;

      let startIso: string;
      let startAbsCol: number;
      let spanCols: number;

      if (firstIso && lastIso) {
        const dFirst = parseIsoLocal(firstIso);
        const dLast = parseIsoLocal(lastIso);

        if (dFirst && dLast) {
          const diffStart = daysBetweenLocal(sectionStart0, dFirst);
          startAbsCol = clamp(diffStart, 0, WINDOW_COLS - 1);

          const rawSpan = daysBetweenLocal(dFirst, dLast) + 1;

          // ✅ nur so lang wie im Fenster noch Platz ist
          const maxSpan = Math.max(1, WINDOW_COLS - startAbsCol);
          spanCols = clamp(rawSpan, 1, maxSpan);

          startIso = firstIso;
        } else {
          // Fallback
          const s0 = clamp(Number(pos.startCol ?? 0), 0, layout.cols - 1);
          startAbsCol = s0;

          const startDate = dateForCol(sectionStart0, s0);
          startIso = isoFromLocalDate(startDate);

          const bookedMin = projectTotalMin.get(pid) ?? 0;
          const minutesTarget = Math.max(planMin, bookedMin, 60);
          const raw = calcSpanColsFromStart(pid, startDate, minutesTarget);

          const maxSpan = Math.max(1, WINDOW_COLS - startAbsCol);
          spanCols = clamp(raw, 1, maxSpan);
        }
      } else {
        // Keine Buchung: manuelles Layout aus Sektion 0
        const s0 = clamp(Number(pos.startCol ?? 0), 0, layout.cols - 1);
        startAbsCol = s0;

        const startDate = dateForCol(sectionStart0, s0);
        startIso = isoFromLocalDate(startDate);

        const bookedMin = projectTotalMin.get(pid) ?? 0;
        const minutesTarget = Math.max(planMin, bookedMin, 60);
        const raw = calcSpanColsFromStart(pid, startDate, minutesTarget);

        const maxSpan = Math.max(1, WINDOW_COLS - startAbsCol);
        spanCols = clamp(raw, 1, maxSpan);
      }

      out.push({
        projectId: pid,
        name: String(p?.name ?? "Projekt"),
        rowId,
        lane,
        startAbsCol,
        spanCols,
        planMinuten: planMin,
        startIso,

        // aktuell nicht benutzt (setzen wir neutral, damit TS ruhig ist)
        planSpanCols: 0,
        fillInCols: 0,
      });
    }

    return out;
  }, [
    boardProjects,
    layoutMapEffective,
    projectTotalMin,
    sectionStart0,
    projectDayMin,
    layout.cols,
    projectFirstLastIso,
  ]);


  // ====== Wrap auf 2 Sektionen ======
   function splitBlock(b: Block): BlockPart[] {
    const parts: BlockPart[] = [];

    const WINDOW_COLS = layout.cols * 2; // 48
    const startAbs = clamp(b.startAbsCol, 0, WINDOW_COLS - 1);

    // Start in Sektion 0
    if (startAbs < layout.cols) {
      const start0 = startAbs;
      const avail0 = Math.max(0, layout.cols - start0);
      const span0 = Math.min(b.spanCols, avail0);

      if (span0 > 0) {
        parts.push({
          key: `${b.projectId}__s0`,
          projectId: b.projectId,
          name: b.name,
          rowId: b.rowId,
          lane: b.lane,
          sectionIdx: 0,
          startCol: start0,
          span: span0,

          planMinuten: b.planMinuten,
          startIso: b.startIso,
          relStart: 0,

          planSpanCols: b.planSpanCols,
          fillInCols: b.fillInCols,
        });
      }

      const rest = b.spanCols - span0;
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

          planMinuten: b.planMinuten,
          startIso: b.startIso,
          relStart: span0,

          planSpanCols: b.planSpanCols,
          fillInCols: b.fillInCols,
        });
      }

      return parts;
    }

    // ✅ Start in Sektion 1 (AbsCol 24..47)
    const start1 = startAbs - layout.cols;
    const avail1 = Math.max(0, layout.cols - start1);
    const span1 = Math.min(b.spanCols, avail1);

    if (span1 > 0) {
      parts.push({
        key: `${b.projectId}__s1`,
        projectId: b.projectId,
        name: b.name,
        rowId: b.rowId,
        lane: b.lane,
        sectionIdx: 1,
        startCol: start1,
        span: span1,

        planMinuten: b.planMinuten,
        startIso: b.startIso,
        relStart: 0,

        planSpanCols: b.planSpanCols,
        fillInCols: b.fillInCols,
      });
    }

    return parts;
  }


  const computedParts: BlockPart[] = useMemo(() => blocks.flatMap(splitBlock), [blocks]);
  useLayoutEffect(() => {
    // damit onDrop Kollisionen prüfen kann
    setBlockParts(computedParts);
  }, [computedParts]);

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

  // ===== Fortschritt: Füllung NUR innerhalb Plan (aus Tagesbuchungen) =====
    // ===== Fortschritt: Prozent-Füllung innerhalb Plan (kein Overrun-Tail) =====
  function renderProjectProgressOverlay(segPart: BlockPart, meisterHex: string) {
    const totalMin = projectTotalMin.get(segPart.projectId) ?? 0;
    const planMin = Math.max(0, segPart.planMinuten);

    if (totalMin <= 0 || planMin <= 0) return null;

    // ✅ Fortschritt nur innerhalb Plan (0..1)
    const frac = clamp(Math.min(totalMin, planMin) / planMin, 0, 1);
    if (frac <= 0) return null;

    // Gesamtbreite dieses Segment-Parts in Pixeln
    let totalPx = 0;
    for (let i = 0; i < segPart.span; i++) totalPx += colW(segPart.startCol + i);
    totalPx = Math.max(1, totalPx);

    const fillPx = Math.max(1, Math.round(totalPx * frac));

    return (
      <div
        className="absolute top-0 bottom-0"
        style={{
          left: 0,
          width: fillPx,
          background: hexToRgba(meisterHex, 0.42),
        }}
      />
    );
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

    const allB = ((((state as any)?.buchungen ?? []) as any[]) || []) as any[];

    for (let col = 0; col < layout.cols; col++) {
      const d = dateForCol(sectionStart, col);
      const iso = isoFromLocalDate(d);
      const dayKey = `${empId}__${iso}`;

      const status = getStatus(allB as any, iso, empId);
      const dimBookings = (status as any)?.art === "urlaub" || (status as any)?.art === "krank";

      const entries = employeeDayProjIdx.get(dayKey) ?? [];
      if (entries.length === 0) continue;

      const dayW = colW(col);
      const denom = BASE_CAP_MIN;

      const usedPxByLane: number[] = Array.from({ length: MIN_BOOKING_LANES }, () => 0);

      for (const e of entries) {
        const pid = String(e.projektId);
        const proj = projectById.get(pid);
        const pname = String((proj as any)?.name ?? "Projekt");

        const colorHex = colorForProject(proj);

        const widthPxRaw = (Math.max(0, e.minuten) / denom) * dayW;
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
          colorHex,
          dim: dimBookings,
        });

        if (lane + 1 > maxLaneUsed) maxLaneUsed = lane + 1;
      }
    }

    const lanes = Math.min(MAX_BOOKING_LANES, Math.max(MIN_BOOKING_LANES, maxLaneUsed));
    return { segs, lanes };
  }

  function fmtH(min: number) {
    const h = Math.round((min / 60) * 10) / 10;
    return `${h}h`;
  }

  function renderHeader(sectionIdx: number, sectionStart: Date) {
    return (
      <div className="flex border-b border-neutral-800" style={{ height: layout.headerH }}>
        <div
          className="px-3 flex items-center text-lg font-bold text-neutral-100 tracking-tight border-r border-neutral-800"
          style={{ width: NAME_COL_W, background: "rgba(9, 9, 11, 0.18)" }}
        >
          {sectionIdx === 0 ? "Board V2" : ""}
        </div>

        <div className="relative" style={{ width: layout.totalGridW, height: layout.headerH }}>
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
                    isCurrentKw ? "bg-orange-400/90 border-orange-500" : "bg-neutral-950/40 border-neutral-800"
                  }`}
                  style={{ left, width, height: layout.kwRowH }}
                >
                  <div
                    className={`h-full flex items-center justify-center text-xs font-bold ${
                      isCurrentKw ? "text-neutral-900" : "text-neutral-300"
                    }`}
                  >
                    KW {kw}
                  </div>
                </div>
              );
            })}
          </div>

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

          const rowParts = computedParts.filter((bp) => bp.sectionIdx === sectionIdx && String(bp.rowId) === empId);
          const rowRing = draggingId && hoverRowId === empId ? "ring-2 ring-orange-500/70" : "";

          const pack = packDaySegments(empId, sectionStart);
          const bookingLanes = pack.lanes;

          const bookingAreaH = bookingLanes * BOOKING_LANE_H;
          const bookingsTop = PROJECT_BAND_H + 6;

          return (
            <div
              key={`r-${sectionIdx}-${empId}`}
              className={`flex border-b border-neutral-800 ${rowRing}`}
              style={{ height: layout.rowH }}
            >
              {(() => {
                const rolle = String((m as any)?.rolle ?? "");
                const isMeister = rolle === "meister";
                const meisterHex = isMeister ? getMeisterFarbe(String((m as any)?.id ?? "")) ?? FALLBACK_ORANGE_HEX : null;

                return (
                  <div
                    className="px-3 flex items-center text-sm truncate border-r border-neutral-800"
                    style={{
                      width: NAME_COL_W,
                      background: isMeister ? hexToRgba(meisterHex as string, 0.14) : "rgba(9, 9, 11, 0.18)",
                    }}
                    title={empName}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isMeister ? <div className="h-3 w-3 rounded-sm" style={{ background: meisterHex as string }} /> : null}
                      <div className="min-w-0 truncate text-neutral-100 font-semibold">{empName}</div>
                    </div>
                  </div>
                );
              })()}

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

                {/* ===== Buchungen ===== */}
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
                        className={`absolute rounded-md overflow-hidden shadow-sm ${seg.dim ? "opacity-40" : ""}`}
                        style={{
                          left: absLeft,
                          top: topPx,
                          width: seg.width,
                          height: BOOKING_LANE_H - 4,
                          border: `1px solid ${hexToRgba(seg.colorHex, 0.85)}`,
                        }}
                        title={seg.tooltip}
                      >
                        <div className="absolute inset-0" style={{ background: hexToRgba(seg.colorHex, 0.88) }} />
                        <div className="absolute inset-0 bg-neutral-950/25" />

                        <div className="relative h-full flex items-center px-1 text-[10px] font-semibold text-neutral-100">
                          <span className="block w-full truncate">{seg.label}</span>
                        </div>

                        {seg.width < 26 ? (
                          <div className="absolute inset-0 flex items-center px-1 pointer-events-none">
                            <span className="rounded bg-neutral-950/60 px-1 text-[10px] font-semibold text-neutral-100">
                              {seg.label}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* ===== Projekte ===== */}
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
                        const meisterId = pickPlannerMeisterId(proj);
                        const meisterHex = getMeisterFarbe(meisterId) ?? FALLBACK_ORANGE_HEX;

                        const segPart: BlockPart = {
                          ...part,
                          key: `${part.key}__seg__${idx}`,
                          startCol: part.startCol + s.start,
                          span: s.span,
                          relStart: part.relStart + s.start,
                        };

                        const verantwortlicherId = String((proj as any)?.zugeordnetAnId ?? part.rowId ?? "");
                        const verantwortlicherName = verantwortlicherId ? mitarbeiterNameById.get(verantwortlicherId) ?? "" : "";

                        const planMin = Math.max(0, part.planMinuten);
                        const istMin = projectTotalMin.get(part.projectId) ?? 0;
                        const ueberMin = Math.max(0, istMin - planMin);

                        const titleLines = [
                          String((proj as any)?.name ?? part.name),
                          verantwortlicherName ? `Verantwortlich: ${verantwortlicherName}` : null,
                          `Kalk: ${fmtH(planMin)}`,
                          `Ist: ${fmtH(istMin)}`,
                          `Überzug: ${fmtH(ueberMin)}`,
                        ].filter(Boolean);

                        const title = titleLines.join("\n");
                        const showLabel = w >= 140;

                        return (
                          <div
                            key={`${part.key}__seg_${idx}`}
                            draggable
                            onDragStart={(e) => onDragStart(e, part.projectId)}
                            onDragEnd={onDragEnd}
                            className={`absolute z-20 rounded-lg border overflow-hidden select-none cursor-grab active:cursor-grabbing ${
                              isDraggingThis ? "opacity-70" : ""
                            }`}
                            style={{
                              top: topPx,
                              left: leftPx,
                              width: w,
                              height: h,
                              borderColor: hexToRgba(meisterHex, 0.95),
                            }}
                            title={title}
                          >
                            {/* Basis: sehr leicht */}
                            <div className="absolute inset-0" style={{ background: hexToRgba(meisterHex, 0.07) }} />
                            <div className="absolute inset-0 bg-neutral-950/22" />

                            {/* Fortschritt-Füllung */}
                            <div className="absolute inset-0 pointer-events-none">
                              {renderProjectProgressOverlay(segPart, meisterHex)}
                            </div>

                            {showLabel ? (
                              <div className="absolute inset-y-0 left-0 z-10 flex items-center pointer-events-none">
                                <div className="ml-2 flex items-center gap-2 min-w-0 px-2 py-1 rounded bg-neutral-950/55 border border-neutral-200/10">
                                  <div className="h-3 w-3 rounded-sm" style={{ background: meisterHex }} />
                                  <div className="truncate text-[11px] font-semibold text-neutral-50">
                                    {String((proj as any)?.name ?? part.name)}
                                    {ueberMin > 0 ? (
                                      <span className="ml-2 text-red-500 font-extrabold tracking-tight">!!!</span>
                                    ) : null}
                                  </div>
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
    <div ref={outerRef} className="w-full overflow-hidden bg-neutral-950/30 text-neutral-100" style={{ height: outerH }}>
      <div className="flex w-full h-full overflow-hidden gap-3">
        {/* LEFT */}
        <div ref={leftRef} className="flex-1 min-w-0 overflow-hidden h-full">
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/18 overflow-hidden">
              {renderHeader(0, sectionStart0)}
              {renderRows(0, sectionStart0)}
            </div>

            <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/40 overflow-hidden">
              {renderHeader(1, sectionStart1)}
              {renderRows(1, sectionStart1)}
            </div>
          </div>
        </div>

        {/* RIGHT (Pool) */}
        <div
          className={`shrink-0 border-l border-neutral-800 bg-neutral-950/60 p-3 overflow-y-auto ${
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
          <div className="text-xs text-neutral-200">Projekt-Pool</div>
          <div className="text-[11px] text-neutral-400 mt-1">Drop hierhin, um ein Projekt aus dem Board zu entfernen.</div>

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
              <span className="text-neutral-300">{computedParts.length}</span>
            </div>
            <div className="mt-1">Tipp: Shift beim Drop toggelt Lane.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
