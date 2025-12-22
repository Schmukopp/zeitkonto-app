import React, { useMemo } from "react";
import type { BuchungsArt, TagesBuchung } from "./MitarbeiterMaske";

type Ui = Record<string, string>;
type WochenTag = "mo" | "di" | "mi" | "do" | "fr";

const TAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoWeek(isoWeek: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec((isoWeek ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
  return { year, week };
}

// ISO week -> Montag (lokal) (nach ISO 8601)
function mondayOfIsoWeek(year: number, week: number): Date {
  // 4. Jan ist immer in ISO-Woche 1
  const jan4 = new Date(year, 0, 4, 0, 0, 0, 0);
  const day = jan4.getDay(); // 0=So..6=Sa
  const isoDow = day === 0 ? 7 : day; // 1..7
  const mondayW1 = new Date(jan4);
  mondayW1.setDate(jan4.getDate() - (isoDow - 1));
  const mon = new Date(mondayW1);
  mon.setDate(mondayW1.getDate() + (week - 1) * 7);
  return mon;
}

function isoWeekOfDate(date: Date): string {
  // ISO week/year (lokal)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  // Donnerstag bestimmt ISO-Jahr
  const day = d.getDay(); // 0=So..6=Sa
  const isoDow = day === 0 ? 7 : day; // 1..7
  d.setDate(d.getDate() + (4 - isoDow));
  const isoYear = d.getFullYear();

  const jan4 = new Date(isoYear, 0, 4, 0, 0, 0, 0);
  const jan4Dow = jan4.getDay();
  const jan4IsoDow = jan4Dow === 0 ? 7 : jan4Dow;

  const mondayW1 = new Date(jan4);
  mondayW1.setDate(jan4.getDate() - (jan4IsoDow - 1));

  const diffDays = Math.round((d.getTime() - mondayW1.getTime()) / (24 * 3600 * 1000));
  const week = 1 + Math.floor(diffDays / 7);

  return `${isoYear}-W${pad2(week)}`;
}

function fmtTagLabel(tag: WochenTag) {
  return tag.toUpperCase();
}

function fmtArtHeader(art: BuchungsArt) {
  switch (art) {
    case "arbeit":
      return "Arbeit";
    case "urlaub":
      return "Urlaub";
    case "krank":
      return "Krank";
    case "unbezahlt":
      return "Unbezahlt";
    case "ueberstundenabbau":
      return "Ü-Abbau";
  }
}

type Props = {
  ui: Ui;
  mitarbeiterId: string;

  week: string; // YYYY-WNN
  setWeek: (w: string) => void;

  // intern: SOLL je Tag (nicht anzeigen)
  getTagesSoll: (isoDate: string) => number;

  tagesBuchungen: TagesBuchung[];

  // “Excel-Edit”: setze Stunden pro (Datum, Art) – ersetzt bestehende Einträge dieser Art/Tag
  setDayArtHours: (isoDate: string, art: BuchungsArt, stunden: number) => void;
};

export function defaultWeekToday(): string {
  return isoWeekOfDate(new Date());
}

export function Wochenblatt(p: Props) {
  const weekParsed = parseIsoWeek(p.week);
  const monday = weekParsed ? mondayOfIsoWeek(weekParsed.year, weekParsed.week) : mondayOfIsoWeek(new Date().getFullYear(), 1);

  const days = useMemo(() => {
    const out: Array<{ tag: WochenTag; date: Date; iso: string }> = [];
    for (let i = 0; i < 5; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      out.push({ tag: TAGE[i]!, date: dt, iso: fmtIsoDate(dt) });
    }
    return out;
  }, [monday.getTime()]);

  const byDay = useMemo(() => {
    const map = new Map<string, Record<BuchungsArt, number>>();
    for (const d of days) {
      map.set(d.iso, { arbeit: 0, urlaub: 0, krank: 0, unbezahlt: 0, ueberstundenabbau: 0 });
    }
    for (const b of p.tagesBuchungen) {
      if (b.mitarbeiterId !== p.mitarbeiterId) continue;
      if (!map.has(b.datum)) continue;
      const row = map.get(b.datum)!;
      row[b.art] += Number(b.stunden) || 0;
    }
    return map;
  }, [p.tagesBuchungen, p.mitarbeiterId, days]);

  const rows = useMemo(() => {
    return days.map((d) => {
      const v = byDay.get(d.iso) ?? { arbeit: 0, urlaub: 0, krank: 0, unbezahlt: 0, ueberstundenabbau: 0 };
      const frei = v.urlaub + v.krank + v.unbezahlt;

      const tagesSoll = Number(p.getTagesSoll(d.iso)) || 0;
      const effSoll = Math.max(0, tagesSoll - frei);

      const ueHeute = v.arbeit - effSoll;
      const kontoAenderung = ueHeute - v.ueberstundenabbau;

      return {
        ...d,
        v,
        ueHeute,
        kontoAenderung
      };
    });
  }, [days, byDay, p]);

  const weekTotals = useMemo(() => {
    const sum: Record<BuchungsArt, number> = { arbeit: 0, urlaub: 0, krank: 0, unbezahlt: 0, ueberstundenabbau: 0 };
    let ueSum = 0;
    let kontoSum = 0;
    for (const r of rows) {
      sum.arbeit += r.v.arbeit;
      sum.urlaub += r.v.urlaub;
      sum.krank += r.v.krank;
      sum.unbezahlt += r.v.unbezahlt;
      sum.ueberstundenabbau += r.v.ueberstundenabbau;
      ueSum += r.ueHeute;
      kontoSum += r.kontoAenderung;
    }
    return { sum, ueSum, kontoSum };
  }, [rows]);

  function navWeek(delta: number) {
    const wp = parseIsoWeek(p.week) ?? parseIsoWeek(defaultWeekToday());
    if (!wp) return;
    const baseMon = mondayOfIsoWeek(wp.year, wp.week);
    baseMon.setDate(baseMon.getDate() + delta * 7);
    p.setWeek(isoWeekOfDate(baseMon));
  }

  function renderNumberCell(isoDate: string, art: BuchungsArt, value: number) {
    return (
      <input
        className={`${p.ui.numberInput} w-20 text-right`}
        type="number"
        min={0}
        step="0.25"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => p.setDayArtHours(isoDate, art, Number(e.target.value))}
      />
    );
  }

  return (
    <div className={`${p.ui.card} ${p.ui.cardBody}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-semibold">Wochenblatt</div>
          <div className={p.ui.subtitle}>Schnelleingabe wie Stundenzettel (Mo–Fr)</div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className={p.ui.label}>Woche</label>
            <input className={p.ui.input} value={p.week} onChange={(e) => p.setWeek(e.target.value)} placeholder="2025-W05" />
          </div>

          <button type="button" className={p.ui.btnSecondary} onClick={() => navWeek(-1)}>
            ←
          </button>
          <button type="button" className={p.ui.btnSecondary} onClick={() => navWeek(1)}>
            →
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-zinc-300">
            <tr>
              <th className="p-2 text-left">Tag</th>
              <th className="p-2 text-left">Datum</th>
              <th className="p-2 text-right">{fmtArtHeader("arbeit")}</th>
              <th className="p-2 text-right">{fmtArtHeader("urlaub")}</th>
              <th className="p-2 text-right">{fmtArtHeader("krank")}</th>
              <th className="p-2 text-right">{fmtArtHeader("unbezahlt")}</th>
              <th className="p-2 text-right">{fmtArtHeader("ueberstundenabbau")}</th>
              <th className="p-2 text-right">Ü-Stunden</th>
              <th className="p-2 text-right">Konto ±</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.iso} className="border-t border-zinc-800">
                <td className="p-2 font-medium">{fmtTagLabel(r.tag)}</td>
                <td className="p-2 text-zinc-400 tabular-nums">{r.iso}</td>

                <td className="p-2 text-right">{renderNumberCell(r.iso, "arbeit", r.v.arbeit)}</td>
                <td className="p-2 text-right">{renderNumberCell(r.iso, "urlaub", r.v.urlaub)}</td>
                <td className="p-2 text-right">{renderNumberCell(r.iso, "krank", r.v.krank)}</td>
                <td className="p-2 text-right">{renderNumberCell(r.iso, "unbezahlt", r.v.unbezahlt)}</td>
                <td className="p-2 text-right">{renderNumberCell(r.iso, "ueberstundenabbau", r.v.ueberstundenabbau)}</td>

                <td className={"p-2 text-right tabular-nums " + (r.ueHeute < 0 ? "text-red-300" : "text-emerald-300")}>
                  {r.ueHeute}
                </td>
                <td
                  className={
                    "p-2 text-right tabular-nums " + (r.kontoAenderung < 0 ? "text-red-300" : "text-emerald-300")
                  }
                >
                  {r.kontoAenderung}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-zinc-800">
              <td className="p-2 font-semibold" colSpan={2}>
                Woche gesamt
              </td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sum.arbeit}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sum.urlaub}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sum.krank}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sum.unbezahlt}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sum.ueberstundenabbau}</td>
              <td className={"p-2 text-right tabular-nums font-semibold " + (weekTotals.ueSum < 0 ? "text-red-300" : "text-emerald-300")}>
                {weekTotals.ueSum}
              </td>
              <td
                className={
                  "p-2 text-right tabular-nums font-semibold " +
                  (weekTotals.kontoSum < 0 ? "text-red-300" : "text-emerald-300")
                }
              >
                {weekTotals.kontoSum}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={p.ui.hint + " mt-3"}>
        Bedienung: Werte pro Tag direkt überschreiben. 0 setzt den jeweiligen Eintrag zurück.
      </div>
    </div>
  );
}
