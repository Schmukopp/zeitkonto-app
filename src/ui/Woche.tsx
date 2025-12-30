import React, { useMemo, useState } from "react";
import type { State } from "../core/timeStore";
import { calcDaySummary, minutesToHoursString } from "../core/timeRules";

type Props = {
  state: State;
  mitarbeiterId: string;
  mitarbeiterName: string;
  getTagesSollMinuten: (isoDate: string) => number;
};

const CD = {
  page: "min-h-screen bg-neutral-950 text-neutral-100 p-4",
  card: "rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm p-4",
  day: "rounded-2xl border border-neutral-800 bg-neutral-900 p-3",
  h2: "text-lg font-semibold text-neutral-50",
  sub: "text-xs text-neutral-400",
  pill:
    "inline-flex items-center rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300",
  btnGhost:
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300",
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(base: Date, delta: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}
function mondayOfWeek(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const jsDay = dt.getDay(); // 0=So
  const diffToMon = (jsDay + 6) % 7;
  return addDays(dt, -diffToMon);
}

export default function Woche(props: Props) {
  const { state, mitarbeiterId, mitarbeiterName, getTagesSollMinuten } = props;
  const [weekOffset, setWeekOffset] = useState(0);

  const days = useMemo(() => {
    const mon = mondayOfWeek(new Date());
    const base = addDays(mon, weekOffset * 7);
    return [0, 1, 2, 3, 4].map((i) => toIsoDate(addDays(base, i)));
  }, [weekOffset]);

  const labels = ["Mo", "Di", "Mi", "Do", "Fr"];

  const summaries = days.map((isoDate) =>
    calcDaySummary({
      datum: isoDate,
      mitarbeiterId,
      sollMinuten: getTagesSollMinuten(isoDate),
      buchungen: state.buchungen,
    })
  );

  const weekSoll = summaries.reduce((a, x) => a + x.sollMinuten, 0);
  const weekArbeit = summaries.reduce((a, x) => a + x.arbeitMinuten, 0);
  const weekDelta = summaries.reduce((a, x) => a + x.deltaUeberstundenMinuten, 0);
  const weekAbbau = summaries.reduce((a, x) => a + x.abbauMinuten, 0);

  return (
    <div className={CD.page}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={CD.h2}>Woche</div>
          <div className={CD.sub}>
            Mitarbeiter: <span className="text-neutral-100 font-medium">{mitarbeiterName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className={CD.btnGhost} onClick={() => setWeekOffset((v) => v - 1)} type="button">
            ◀ Vorherige
          </button>
          <button className={CD.btnGhost} onClick={() => setWeekOffset(0)} type="button">
            Diese Woche
          </button>
          <button className={CD.btnGhost} onClick={() => setWeekOffset((v) => v + 1)} type="button">
            Nächste ▶
          </button>
        </div>
      </div>

      <div className={`${CD.card} mb-3`}>
        <div className="flex flex-wrap gap-2">
          <span className={CD.pill}>SOLL {minutesToHoursString(weekSoll)}</span>
          <span className={CD.pill}>Arbeit {minutesToHoursString(weekArbeit)}</span>
          <span className={CD.pill}>Δ {minutesToHoursString(weekDelta)}</span>
          <span className={CD.pill}>Abbau {minutesToHoursString(weekAbbau)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {summaries.map((d, idx) => (
          <div key={d.datum} className={CD.day}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-neutral-50">{labels[idx]}</div>
              {d.statusArt ? <span className={CD.pill}>{d.statusArt}</span> : <span className="text-xs text-neutral-500">—</span>}
            </div>
            <div className="mt-1 text-xs text-neutral-500">{d.datum}</div>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">SOLL</span>
                <span className="text-neutral-100 font-medium">{minutesToHoursString(d.sollMinuten)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Arbeit</span>
                <span className="text-neutral-100 font-medium">{minutesToHoursString(d.arbeitMinuten)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Δ</span>
                <span className="text-neutral-100 font-medium">{minutesToHoursString(d.deltaUeberstundenMinuten)}</span>
              </div>
              {d.statusArt === "ueberstundenabbau" && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Abbau</span>
                  <span className="text-orange-300 font-medium">{minutesToHoursString(d.statusMinuten)}</span>
                </div>
              )}
            </div>

            {d.statusArt === "ueberstundenabbau" && (
              <div className="mt-2 text-xs text-neutral-400">
                Max. Abbau: <span className="text-orange-300">{minutesToHoursString(d.maxAbbauMinuten)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
