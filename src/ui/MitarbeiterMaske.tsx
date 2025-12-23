// zeitkonto-app/src/ui/MitarbeiterMaske.tsx
import React, { useMemo, useState } from "react";

export type TagesBuchungArt = "arbeit" | "urlaub" | "krank" | "unbezahlt" | "ueberstundenabbau";

export type TagesBuchung = {
  id: string;
  mitarbeiterId: string;
  datum: string; // ISO YYYY-MM-DD
  art: TagesBuchungArt;
  stunden: number;
  note?: string;
};

type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

type Ui = Record<string, string>;
type StatusChoice = "none" | "urlaub" | "krank" | "unbezahlt" | "ueberstunden";

type Props = {
  ui: Ui;
  mitarbeiterId: string;
  mitarbeiterName: string;

  getTagesSoll: (isoDate: string) => number;

  tagesBuchungen: TagesBuchung[];

  addWorkLine: (isoDate: string) => void;
  updateBooking: (id: string, patch: Partial<TagesBuchung>) => void;
  deleteBooking: (id: string) => void;

  setStatus: (isoDate: string, choice: StatusChoice, stundenOrNull: number | null) => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}
function addDays(base: Date, delta: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}
// Montag der Woche (lokal)
function mondayOfWeek(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const jsDay = dt.getDay(); // 0 So, 1 Mo, ...
  const diffToMon = (jsDay + 6) % 7; // Mo => 0 ... So => 6
  return addDays(dt, -diffToMon);
}

export function MitarbeiterMaske(props: Props) {
  const {
    ui: uiText,
    mitarbeiterId,
    mitarbeiterName,
    getTagesSoll,
    tagesBuchungen,
    addWorkLine,
    updateBooking,
    deleteBooking,
    setStatus,
  } = props;

  const ui = {
  // Container
  card: "rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm",
  head: "flex items-center justify-between gap-3",

  // Typografie
  h2: "text-lg font-semibold text-neutral-50",
  sub: "text-xs text-neutral-400",
  label: "text-xs font-medium text-neutral-300",

  // Buttons (Orange als Primary)
  btn: "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-orange-400 hover:border-orange-400",
  btnGhost:
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300",

  btnDanger:
    "rounded-xl border border-orange-500 bg-neutral-950 px-3 py-2 text-sm text-orange-300 hover:bg-orange-500 hover:text-neutral-950",

  // Inputs
  input:
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500",
  select:
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500",

  // Layout
  grid: "grid grid-cols-1 gap-3 md:grid-cols-5",
  day: "rounded-2xl border border-neutral-800 bg-neutral-900 p-3",
  row: "grid grid-cols-12 gap-2 items-center",

  // Linien / Pills
  hr: "my-2 border-neutral-800",
  pill:
    "inline-flex items-center rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300",

  // Summenbereich (falls vorhanden)
  sumRow: "mt-3 grid grid-cols-2 gap-2 md:grid-cols-6",
  sumBox: "rounded-2xl border border-neutral-800 bg-neutral-900 p-3",
  sumTitle: "text-xs text-neutral-400",
  sumValue: "text-base font-semibold text-neutral-50",
};



  const label = (key: string, fallback: string) => uiText[key] ?? fallback;

  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = useMemo(() => {
    const mon = mondayOfWeek(new Date());
    const base = addDays(mon, weekOffset * 7);
    return WOCHENTAGE.map((_, i) => toIsoDate(addDays(base, i)));
  }, [weekOffset]);

  const bookingsOfDay = (isoDate: string) =>
    tagesBuchungen.filter((b) => b.mitarbeiterId === mitarbeiterId && b.datum === isoDate);

  const workLinesOfDay = (isoDate: string) => bookingsOfDay(isoDate).filter((b) => b.art === "arbeit");

  const statusLineOfDay = (isoDate: string) =>
    bookingsOfDay(isoDate).find((b) => b.art !== "arbeit");

  // pro Tag UI-State für Statusauswahl + Stunden-Eingabe
  const [statusChoice, setStatusChoice] = useState<Record<string, StatusChoice>>({});
  const [statusHours, setStatusHours] = useState<Record<string, string>>({});

  return (
    
  <div className="min-h-screen bg-neutral-950 p-4 text-neutral-100">

      <div className={`${ui.card} p-4`}>
        <div className={ui.head}>
          <div>
            <div className={ui.h2}>{label("tagesmaske.title", "Tagesbuchungen")}</div>
            <div className={ui.sub}>
              {label("tagesmaske.mitarbeiter", "Mitarbeiter")}:{" "}
              <span className="font-medium text-neutral-800">{mitarbeiterName}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={ui.btn} onClick={() => setWeekOffset((v) => v - 1)} type="button">
              {label("week.prev", "◀ Vorherige Woche")}
            </button>
            <button className={ui.btn} onClick={() => setWeekOffset(0)} type="button">
              {label("week.today", "Diese Woche")}
            </button>
            <button className={ui.btn} onClick={() => setWeekOffset((v) => v + 1)} type="button">
              {label("week.next", "Nächste Woche ▶")}
            </button>
          </div>
        </div>

        <div className={`${ui.grid} mt-4`}>
          {weekDates.map((isoDate, idx) => {
            const soll = getTagesSoll(isoDate);
            const work = workLinesOfDay(isoDate);
            const status = statusLineOfDay(isoDate);

            const choice = statusChoice[isoDate] ?? "none";
            const hoursStr = statusHours[isoDate] ?? "";

            const dayLabel = ["Mo", "Di", "Mi", "Do", "Fr"][idx] ?? isoDate;

            return (
              <div key={isoDate} className={ui.day}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{dayLabel}</div>
                  <span className={ui.pill}>SOLL {soll}h</span>
                </div>

                <div className="mt-2 text-xs text-neutral-500">{isoDate}</div>

                <div className="mt-3">
                  <div className={ui.label}>{label("work.title", "Arbeitseinträge")}</div>

                  {work.length === 0 ? (
                    <div className="mt-1 text-sm text-neutral-500">{label("work.none", "Keine Arbeitseinträge")}</div>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      {work.map((b) => (
                        <div key={b.id} className={ui.row}>
                          <div className="col-span-4">
                            <div className={ui.label}>{label("work.hours", "Stunden")}</div>
                            <input
                              className={ui.input}
                              type="number"
                              step="0.25"
                              value={Number.isFinite(b.stunden) ? b.stunden : 0}
                              onChange={(e) => updateBooking(b.id, { stunden: Number(e.target.value) })}
                            />
                          </div>

                          <div className="col-span-7">
                            <div className={ui.label}>{label("work.note", "Notiz")}</div>
                            <input
                              className={ui.input}
                              value={b.note ?? ""}
                              onChange={(e) => updateBooking(b.id, { note: e.target.value })}
                            />
                          </div>

                          <div className="col-span-1 flex justify-end pt-5">
                            <button className={ui.btnDanger} type="button" onClick={() => deleteBooking(b.id)}>
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button className={`${ui.btn} mt-2 w-full`} type="button" onClick={() => addWorkLine(isoDate)}>
                    + {label("work.add", "Arbeitseintrag")}
                  </button>
                </div>

                <hr className={ui.hr} />

                <div>
                  <div className={ui.label}>{label("status.title", "Status")}</div>

                  <div className="mt-2">
                    {status ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                        <span className={ui.pill}>
                          {label("status.current", "Aktuell")}:{" "}
                          <span className="font-medium text-neutral-800">
                            {status.art} ({Number(status.stunden) || 0}h)
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500">{label("status.none", "Kein Status gesetzt")}</div>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <div className={ui.label}>{label("status.choice", "Art")}</div>
                      <select
                        className={ui.select}
                        value={choice}
                        onChange={(e) =>
                          setStatusChoice((prev) => ({ ...prev, [isoDate]: e.target.value as StatusChoice }))
                        }
                      >
                        <option value="none">{label("status.noneOption", "Keiner")}</option>
                        <option value="urlaub">{label("status.urlaub", "Urlaub")}</option>
                        <option value="krank">{label("status.krank", "Krank")}</option>
                        <option value="unbezahlt">{label("status.unbezahlt", "Unbezahlt")}</option>
                        <option value="ueberstunden">{label("status.ueberstunden", "Überstundenabbau")}</option>
                      </select>
                    </div>

                    <div className="col-span-6">
                      <div className={ui.label}>{label("status.hoursOptional", "Std. (optional)")}</div>
                      <input
                        className={ui.input}
                        placeholder={label("status.hoursOptionalPh", "leer = Rest")}
                        value={hoursStr}
                        onChange={(e) => setStatusHours((prev) => ({ ...prev, [isoDate]: e.target.value }))}
                      />
                    </div>

                    <div className="col-span-6">
                      <button
                        className={`${ui.btn} w-full`}
                        type="button"
                        onClick={() => {
                          const raw = (hoursStr ?? "").trim();
                          const n = raw === "" ? null : Number(raw);
                          setStatus(isoDate, choice, Number.isFinite(n as number) ? (n as number) : null);
                        }}
                      >
                        {label("apply", "Anwenden")}
                      </button>
                    </div>

                    <div className="col-span-6">
                      <button
                        className={`${ui.btn} w-full`}
                        type="button"
                        onClick={() => {
                          setStatusChoice((prev) => ({ ...prev, [isoDate]: "none" }));
                          setStatusHours((prev) => ({ ...prev, [isoDate]: "" }));
                          setStatus(isoDate, "none", null);
                        }}
                      >
                        {label("clear", "Zurücksetzen")}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className={ui.softBox}>
                      {label("hint", "Hinweis")}: {label("hint2", "Wenn keine Stunden eingetragen sind, wird der Rest bis SOLL verwendet.")}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MitarbeiterMaske;
