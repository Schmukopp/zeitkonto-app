import React, { useMemo } from "react";
import type { BuchungsArt, TagesBuchung } from "./MitarbeiterMaske";

type Ui = Record<string, string>;
type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const TAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

type StatusChoice = "none" | "urlaub" | "krank" | "unbezahlt" | "ueberstunden";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoWeek(isoWeek: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec((isoWeek ?? "").trim());
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (day - 1) + (week - 1) * 7);
  return monday;
}

function isoWeekOfDate(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
  return `${year}-W${pad2(week)}`;
}

export function defaultWeekToday(): string {
  return isoWeekOfDate(new Date());
}

type Props = {
  ui: Ui;
  mitarbeiterId: string;

  week: string;
  setWeek: (w: string) => void;

  getTagesSoll: (isoDate: string) => number;

  tagesBuchungen: TagesBuchung[];

  addWorkLine: (isoDate: string) => void;
  updateBooking: (id: string, patch: Partial<Pick<TagesBuchung, "note" | "stunden">>) => void;
  deleteBooking: (id: string) => void;

  setStatus: (isoDate: string, choice: StatusChoice, stunden: number | null) => void;
};

export function Wochenblatt(p: Props) {
  const weekParsed = parseIsoWeek(p.week);
  const monday = weekParsed ? mondayOfIsoWeek(weekParsed.year, weekParsed.week) : mondayOfIsoWeek(2025, 1);

  const days = useMemo(
    () =>
      TAGE.map((t, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return { tag: t, iso: fmtIsoDate(d) };
      }),
    [monday.getTime()]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, TagesBuchung[]>();
    for (const d of days) map.set(d.iso, []);
    for (const b of p.tagesBuchungen) {
      if (b.mitarbeiterId !== p.mitarbeiterId) continue;
      if (!map.has(b.datum)) continue;
      map.get(b.datum)!.push(b);
    }
    return map;
  }, [p.tagesBuchungen, p.mitarbeiterId, days]);

  const cell = "rounded-xl border border-zinc-800 p-2";

  return (
    <div className={`${p.ui.card} ${p.ui.cardBody}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-semibold">Wochenblatt</div>
          <div className={p.ui.subtitle}>Arbeit, Abwesenheit & Überstunden abfeiern</div>
        </div>

        <div className="flex items-end gap-2">
          <input className={p.ui.input} value={p.week} onChange={(e) => p.setWeek(e.target.value)} />
          <button className={p.ui.btnSecondary} onClick={() => p.setWeek(defaultWeekToday())}>
            Heute
          </button>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="text-zinc-300">
          <tr>
            <th className="p-2 text-left">Tag</th>
            <th className="p-2 text-left">Tätigkeiten</th>
            <th className="p-2 text-right">Stunden</th>
            <th className="p-2 text-left">Status</th>
          </tr>
        </thead>

        <tbody>
          {days.map((d) => {
            const list = byDay.get(d.iso) ?? [];
            const work = list.filter((x) => x.art === "arbeit");
            const status = list.find((x) => x.art !== "arbeit");

            return (
              <tr key={d.iso} className="border-t border-zinc-800 align-top">
                <td className="p-2 font-medium">
                  {d.tag.toUpperCase()}
                  <div className="text-xs text-zinc-400">{d.iso}</div>
                </td>

                <td className="p-2">
                  <div className={cell}>
                    {work.map((w) => (
                      <input
                        key={w.id}
                        className={p.ui.input + " mb-2 w-full"}
                        value={w.note ?? ""}
                        onChange={(e) => p.updateBooking(w.id, { note: e.target.value })}
                        placeholder="Tätigkeit / Projekt"
                      />
                    ))}
                    <button className={p.ui.btnSecondary} onClick={() => p.addWorkLine(d.iso)}>
                      + Tätigkeit
                    </button>
                  </div>
                </td>

                <td className="p-2 text-right">
                  <div className={cell}>
                    {work.map((w) => (
                      <input
                        key={w.id}
                        className={p.ui.numberInput + " mb-2 w-24 text-right"}
                        type="number"
                        step="0.25"
                        value={w.stunden}
                        onChange={(e) => p.updateBooking(w.id, { stunden: Number(e.target.value) })}
                      />
                    ))}
                  </div>
                </td>

                <td className="p-2">
                  <div className={cell}>
                    <select
                      className={p.ui.select}
                      value={status?.art ?? "none"}
                      onChange={(e) => p.setStatus(d.iso, e.target.value as StatusChoice, null)}
                    >
                      <option value="none">—</option>
                      <option value="urlaub">Urlaub</option>
                      <option value="krank">Krank</option>
                      <option value="unbezahlt">Unbezahlt</option>
                      <option value="ueberstunden">Überstunden (abfeiern)</option>
                    </select>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
