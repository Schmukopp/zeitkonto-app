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

// ISO week -> Montag (lokal)
function mondayOfIsoWeek(year: number, week: number): Date {
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
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  const isoDow = day === 0 ? 7 : day;
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

export function defaultWeekToday(): string {
  return isoWeekOfDate(new Date());
}

function tagLabel(t: WochenTag) {
  return t.toUpperCase();
}

type AbsenceArt = "urlaub" | "krank" | "unbezahlt";

type Props = {
  ui: Ui;
  mitarbeiterId: string;

  week: string; // YYYY-WNN
  setWeek: (w: string) => void;

  // intern: SOLL je Tag (nicht anzeigen)
  getTagesSoll: (isoDate: string) => number;

  tagesBuchungen: TagesBuchung[];

  // CRUD
  addWorkLine: (isoDate: string) => void;
  updateBooking: (id: string, patch: Partial<Pick<TagesBuchung, "note" | "stunden">>) => void;
  deleteBooking: (id: string) => void;

  // Abwesenheit (voller Tag ohne Stunden möglich)
  setAbsence: (isoDate: string, art: AbsenceArt | "none", stundenOrNull: number | null) => void;

  // Überstundenabbau
  setUeAbbau: (isoDate: string, stunden: number) => void;
};

export function Wochenblatt(p: Props) {
  const weekParsed = parseIsoWeek(p.week);
  const monday = weekParsed
    ? mondayOfIsoWeek(weekParsed.year, weekParsed.week)
    : mondayOfIsoWeek(new Date().getFullYear(), 1);

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
    const map = new Map<string, TagesBuchung[]>();
    for (const d of days) map.set(d.iso, []);
    for (const b of p.tagesBuchungen) {
      if (b.mitarbeiterId !== p.mitarbeiterId) continue;
      if (!map.has(b.datum)) continue;
      map.get(b.datum)!.push(b);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.id.localeCompare(b.id));
      map.set(k, arr);
    }
    return map;
  }, [p.tagesBuchungen, p.mitarbeiterId, days]);

  const calcDay = (isoDate: string, list: TagesBuchung[]) => {
    const soll = Number(p.getTagesSoll(isoDate)) || 0;

    const work = list.filter((x) => x.art === "arbeit");
    const abs = list.filter((x) => x.art === "urlaub" || x.art === "krank" || x.art === "unbezahlt");
    const abbau = list.filter((x) => x.art === "ueberstundenabbau");

    const sumWork = work.reduce((a, x) => a + (Number(x.stunden) || 0), 0);
    const sumAbs = abs.reduce((a, x) => a + (Number(x.stunden) || 0), 0);
    const sumAbbau = abbau.reduce((a, x) => a + (Number(x.stunden) || 0), 0);

    const effSoll = Math.max(0, soll - sumAbs);
    const ueHeute = sumWork - effSoll;
    const kontoAenderung = ueHeute - sumAbbau;

    // Urlaubstage-Logik (für später):
    // - voller Urlaubstag = urlaubStunden == soll
    // - halber Tag: urlaubStunden / soll
    const urlaubStunden = abs.filter((x) => x.art === "urlaub").reduce((a, x) => a + (Number(x.stunden) || 0), 0);
    const urlaubTage = soll > 0 ? Math.min(1, urlaubStunden / soll) : 0;

    // Welche Abwesenheit ist „gesetzt“? Wir nehmen die erste (pro Tag erlauben wir effektiv genau eine Art)
    const absArt = abs[0]?.art ?? "none";
    const absHours = abs[0]?.stunden ?? 0;

    const abbauHours = abbau[0]?.stunden ?? 0;

    return {
      soll,
      work,
      sumWork,
      absArt: absArt as AbsenceArt | "none",
      absHours,
      sumAbs,
      abbauHours,
      sumAbbau,
      ueHeute,
      kontoAenderung,
      urlaubTage
    };
  };

  const rows = useMemo(() => {
    return days.map((d) => {
      const list = byDay.get(d.iso) ?? [];
      return { ...d, list, m: calcDay(d.iso, list) };
    });
  }, [days, byDay]);

  const weekTotals = useMemo(() => {
    const sumWork = rows.reduce((a, r) => a + r.m.sumWork, 0);
    const sumAbs = rows.reduce((a, r) => a + r.m.sumAbs, 0);
    const sumAbbau = rows.reduce((a, r) => a + r.m.sumAbbau, 0);
    const ueSum = rows.reduce((a, r) => a + r.m.ueHeute, 0);
    const kontoSum = rows.reduce((a, r) => a + r.m.kontoAenderung, 0);
    const urlaubTage = rows.reduce((a, r) => a + r.m.urlaubTage, 0);
    return { sumWork, sumAbs, sumAbbau, ueSum, kontoSum, urlaubTage };
  }, [rows]);

  function navWeek(delta: number) {
    const wp = parseIsoWeek(p.week) ?? parseIsoWeek(defaultWeekToday());
    if (!wp) return;
    const baseMon = mondayOfIsoWeek(wp.year, wp.week);
    baseMon.setDate(baseMon.getDate() + delta * 7);
    p.setWeek(isoWeekOfDate(baseMon));
  }

  const cellBox = "rounded-xl border border-zinc-800 p-2";

  return (
    <div className={`${p.ui.card} ${p.ui.cardBody}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-semibold">Wochenblatt</div>
          <div className={p.ui.subtitle}>Pro Tag mehrere Tätigkeiten/Projekte + automatische Ü-Stunden</div>
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
              <th className="p-2 text-left">Tätigkeiten / Notizen</th>
              <th className="p-2 text-right">Stunden</th>
              <th className="p-2 text-left">Abwesenheit</th>
              <th className="p-2 text-right">Ü-Abbau</th>
              <th className="p-2 text-right">Tag gesamt</th>
              <th className="p-2 text-right">Ü-Stunden</th>
              <th className="p-2 text-right">Konto ±</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.iso} className="border-t border-zinc-800 align-top">
                <td className="p-2">
                  <div className="font-medium">{tagLabel(r.tag)}</div>
                  <div className="text-zinc-400 tabular-nums">{r.iso}</div>
                </td>

                {/* Tätigkeiten / Notizen */}
                <td className="p-2">
                  <div className={cellBox}>
                    {r.m.work.length === 0 ? (
                      <div className="text-zinc-500 text-xs">Keine Arbeitseinträge</div>
                    ) : (
                      <div className="space-y-2">
                        {r.m.work.map((w) => (
                          <div key={w.id} className="flex items-center gap-2">
                            <input
                              className={p.ui.input + " w-full"}
                              value={w.note ?? ""}
                              onChange={(e) => p.updateBooking(w.id, { note: e.target.value })}
                              placeholder="z.B. Küche Montage, Projekt Müller, Lackieren…"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" className={p.ui.btnSecondary} onClick={() => p.addWorkLine(r.iso)}>
                        + Tätigkeit
                      </button>
                      <div className="text-xs text-zinc-500">Mehrere Projekte am Tag möglich.</div>
                    </div>
                  </div>
                </td>

                {/* Stunden (zu den Tätigkeiten) */}
                <td className="p-2 text-right">
                  <div className={cellBox}>
                    {r.m.work.length === 0 ? (
                      <div className="text-zinc-500 text-xs text-right">—</div>
                    ) : (
                      <div className="space-y-2">
                        {r.m.work.map((w) => (
                          <div key={w.id} className="flex items-center justify-end gap-2">
                            <input
                              className={`${p.ui.numberInput} w-24 text-right`}
                              type="number"
                              min={0}
                              step="0.25"
                              value={Number.isFinite(w.stunden) ? w.stunden : 0}
                              onChange={(e) => p.updateBooking(w.id, { stunden: Number(e.target.value) })}
                            />
                            <button type="button" className={p.ui.btnDanger} onClick={() => p.deleteBooking(w.id)} title="Eintrag löschen">
                              Löschen
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-zinc-500 text-right">
                      Tagessumme Arbeit: <span className="tabular-nums font-medium">{r.m.sumWork}</span> h
                    </div>
                  </div>
                </td>

                {/* Abwesenheit */}
                <td className="p-2">
                  <div className={cellBox}>
                    <div className="flex items-center gap-2">
                      <select
                        className={p.ui.select}
                        value={r.m.absArt}
                        onChange={(e) => p.setAbsence(r.iso, e.target.value as any, null)}
                      >
                        <option value="none">—</option>
                        <option value="urlaub">Urlaub</option>
                        <option value="krank">Krank</option>
                        <option value="unbezahlt">Unbezahlt</option>
                      </select>

                      {/* Stunden optional: leer = voller Tag (automatisch) */}
                      <input
                        className={`${p.ui.numberInput} w-24 text-right`}
                        type="number"
                        min={0}
                        step="0.25"
                        value={r.m.absArt === "none" ? 0 : Number(r.m.absHours) || 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (r.m.absArt === "none") return;
                          // hier ist "0" erlaubt, wird im Setter als "voller Tag" interpretiert
                          p.setAbsence(r.iso, r.m.absArt as any, Number.isFinite(v) ? v : 0);
                        }}
                      />
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                      Tipp: Stunden = 0 bedeutet „voller Tag“ (automatisch). Teil-Urlaub z.B. 5h bei SOLL 10h.
                    </div>
                  </div>
                </td>

                {/* Ü-Abbau */}
                <td className="p-2 text-right">
                  <div className={cellBox}>
                    <input
                      className={`${p.ui.numberInput} w-24 text-right`}
                      type="number"
                      min={0}
                      step="0.25"
                      value={Number.isFinite(r.m.abbauHours) ? r.m.abbauHours : 0}
                      onChange={(e) => p.setUeAbbau(r.iso, Number(e.target.value))}
                    />
                    <div className="mt-1 text-xs text-zinc-500 text-right">Vom Konto abziehen</div>
                  </div>
                </td>

                {/* Tag gesamt */}
                <td className="p-2 text-right tabular-nums">
                  <div className={cellBox}>
                    <div className="font-medium">{r.m.sumWork + r.m.sumAbs + r.m.sumAbbau}</div>
                    <div className="text-xs text-zinc-500">inkl. Frei/Abbau</div>
                  </div>
                </td>

                {/* Ü-Stunden */}
                <td className={"p-2 text-right tabular-nums " + (r.m.ueHeute < 0 ? "text-red-300" : "text-emerald-300")}>
                  <div className={cellBox}>
                    <div className="font-medium">{r.m.ueHeute}</div>
                    <div className="text-xs text-zinc-500">heute</div>
                  </div>
                </td>

                {/* Konto ± */}
                <td className={"p-2 text-right tabular-nums " + (r.m.kontoAenderung < 0 ? "text-red-300" : "text-emerald-300")}>
                  <div className={cellBox}>
                    <div className="font-medium">{r.m.kontoAenderung}</div>
                    <div className="text-xs text-zinc-500">heute</div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-zinc-800">
              <td className="p-2 font-semibold" colSpan={2}>
                Woche gesamt
              </td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sumWork}</td>
              <td className="p-2 text-left text-zinc-400">
                Urlaub: <span className="tabular-nums font-semibold">{weekTotals.urlaubTage.toFixed(2)}</span> Tage
              </td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sumAbbau}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{weekTotals.sumWork + weekTotals.sumAbs + weekTotals.sumAbbau}</td>
              <td className={"p-2 text-right tabular-nums font-semibold " + (weekTotals.ueSum < 0 ? "text-red-300" : "text-emerald-300")}>
                {weekTotals.ueSum}
              </td>
              <td className={"p-2 text-right tabular-nums font-semibold " + (weekTotals.kontoSum < 0 ? "text-red-300" : "text-emerald-300")}>
                {weekTotals.kontoSum}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={p.ui.hint + " mt-3"}>
        Abwesenheit: Wenn Stunden=0 → voller Tag (automatisch nach SOLL). Teil-Urlaub: Stunden eintragen (z.B. 5 bei SOLL 10).
      </div>
    </div>
  );
}
