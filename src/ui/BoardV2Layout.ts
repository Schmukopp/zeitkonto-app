// src/ui/BoardV2Layout.ts
// Board V2 – Layout-Engine (ohne Buchungen, ohne Rendering-Logik)

export type BoardV2LayoutInput = {
  viewportW: number; // verfügbare Breite des linken Boardbereichs (ohne Pool)
  viewportH: number; // verfügbare Höhe des linken Boardbereichs
  employeeCount: number; // Anzahl Mitarbeiterzeilen
};

export type BoardV2Layout = {
  sections: 2;
  weeksPerSection: 4;
  daysPerWeek: 6; // Mo–Sa
  cols: 24;

  nameColW: number;
  headerH: number;
  kwRowH: number;
  dayRowH: number;

  rowH: number;

  gridW: number; // NUR die Grid-Breite (ohne Name-Spalte)
  colWidths: number[];
  colLefts: number[];
  totalGridW: number;

  sectionGap: number;
  sectionBoxH: number;
  totalBoardH: number;
};

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function buildBoardV2Layout(inp: BoardV2LayoutInput): BoardV2Layout {
  const sections = 2 as const;
  const weeksPerSection = 4 as const;
  const daysPerWeek = 6 as const;
  const cols = weeksPerSection * daysPerWeek; // 24

  const nameColW = 180;

  const kwRowH = 22;
  const dayRowH = 34;
  const headerH = kwRowH + dayRowH;

  const sectionGap = 12;

  const employeeCount = Math.max(1, Math.floor(inp.employeeCount || 1));

  // Ziel: Keine vertikale Scrollbar im LEFT Board-Bereich.
  // Wir rechnen NUR mit dem verfügbaren viewportH (das muss korrekt gemessen werden).
  const paddingSafety = 18;

  const availableRowsH = Math.max(
    260,
    Math.floor(inp.viewportH) - headerH * sections - sectionGap - paddingSafety
  );

  const computedRowH = Math.floor(availableRowsH / (employeeCount * sections));
  const rowH = clamp(computedRowH, 22, 84);

  const sectionBoxH = headerH + employeeCount * rowH;
  const totalBoardH = sectionBoxH * sections + sectionGap;

  // ✅ KRITISCH: Grid-Breite ist viewportW MINUS Name-Spalte.
  // Sonst wird rechts (Fr/Sa) abgeschnitten, weil Name+Grid breiter als viewport ist.
  const gridW = Math.max(520, Math.floor((inp.viewportW || 0) - nameColW));

  const { colWidths, colLefts, totalW } = buildCols(gridW, cols);

  return {
    sections,
    weeksPerSection,
    daysPerWeek,
    cols,

    nameColW,
    headerH,
    kwRowH,
    dayRowH,

    rowH,

    gridW,
    colWidths,
    colLefts,
    totalGridW: totalW,

    sectionGap,
    sectionBoxH,
    totalBoardH,
  };
}

function weekdayFactor(col: number): number {
  // 0..5 => Mo..Sa, Fr/Sa schmaler (wie in deinem Wunschbild optisch kompakter)
  const day = col % 6;
  return day === 4 || day === 5 ? 0.55 : 1.0;
}

function buildCols(
  availableW: number,
  cols: number
): { colWidths: number[]; colLefts: number[]; totalW: number } {
  const factors = Array.from({ length: cols }).map((_, col) => weekdayFactor(col));
  const sum = factors.reduce((a, x) => a + x, 0);
  const unit = availableW / sum;

  const colWidths = factors.map((f) => Math.max(10, Math.floor(unit * f)));

  // Rundungsdiff verteilen
  let diff = Math.round(availableW - colWidths.reduce((a, x) => a + x, 0));
  let i = 0;
  while (diff !== 0 && i < colWidths.length * 4) {
    const idx = i % colWidths.length;
    if (diff > 0) {
      colWidths[idx] += 1;
      diff -= 1;
    } else if (diff < 0 && colWidths[idx] > 10) {
      colWidths[idx] -= 1;
      diff += 1;
    }
    i++;
  }

  const colLefts: number[] = [];
  let x = 0;
  for (const w of colWidths) {
    colLefts.push(x);
    x += w;
  }

  return { colWidths, colLefts, totalW: x };
}

// ===== Datum / ISO-Woche (lokal, ohne UTC-Shift in der Anzeige) =====

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfISOWeekLocal(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=So..6=Sa
  const diff = day === 0 ? -6 : 1 - day; // Montag
  return addDays(d, diff);
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function isoWeekNumberLocal(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  // ISO: Woche nach Donnerstag bestimmen
  const day = d.getDay() || 7; // So=7
  d.setDate(d.getDate() + 4 - day);

  const yearStart = new Date(d.getFullYear(), 0, 1);
  const diffDays = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
}

export function dateForCol(sectionStartMonday: Date, col: number): Date {
  const week = Math.floor(col / 6);
  const dayInWeek = col % 6; // 0..5 Mo..Sa
  return addDays(sectionStartMonday, week * 7 + dayInWeek);
}

export function isFriOrSatLocal(d: Date): boolean {
  const dow = d.getDay();
  return dow === 5 || dow === 6;
}
