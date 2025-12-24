import React, { useMemo, useState } from "react";
import type { ArbeitsBuchung, Bereich } from "../core/timeTypes";
import { minutesToHoursString, calcDaySummary } from "../core/timeRules";
import type { State } from "../core/timeStore";
import { startTimer, stopTimer, upsertStatus, clearStatus, updateArbeitsBuchung, deleteBuchung } from "../core/timeStore";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  mitarbeiterId: string;
  mitarbeiterName: string;
  getTagesSollMinuten: (isoDate: string) => number;
  isoDate: string;
};

const CD = {
  page: "min-h-screen bg-neutral-950 text-neutral-100 p-4",
  card: "rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm p-4",
  h2: "text-lg font-semibold text-neutral-50",
  sub: "text-xs text-neutral-400",
  label: "text-xs font-medium text-neutral-300",
  input:
    "w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500",
  select:
    "w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500",
  btnPrimary:
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-orange-400 hover:border-orange-400",
  btnGhost:
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300",
  pill:
    "inline-flex items-center rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300",
  danger:
    "rounded-xl border border-orange-500 bg-neutral-950 px-3 py-2 text-sm text-orange-300 hover:bg-orange-500 hover:text-neutral-950",
};

const BEREICHE: { key: Bereich; label: string }[] = [
  { key: "maschinenraum", label: "Maschinenraum" },
  { key: "bankraum", label: "Bankraum" },
  { key: "lackraum", label: "Lackraum" },
];

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Heute(props: Props) {
  const { state, setState, mitarbeiterId, mitarbeiterName, getTagesSollMinuten } = props;
  const isoDate = props.isoDate || todayIso();

  const projects = useMemo(() => state.projects.filter((p) => p.active), [state.projects]);

  const [projektId, setProjektId] = useState(projects[0]?.id ?? "p1");
  const [bereich, setBereich] = useState<Bereich>("maschinenraum");
  const [note, setNote] = useState("");

  const sollMin = getTagesSollMinuten(isoDate);
  const daySummary = calcDaySummary({
    datum: isoDate,
    mitarbeiterId,
    sollMinuten: sollMin,
    buchungen: state.buchungen,
  });

  const laufend = state.running?.mitarbeiterId === mitarbeiterId ? state.running : null;

 const arbeitsBuchungenHeute = state.buchungen.filter(
  (b): b is ArbeitsBuchung =>
    b.mitarbeiterId === mitarbeiterId && b.datum === isoDate && b.art === "arbeit"
);


  return (
    <div className={CD.page}>
      <div className="mb-4">
        <div className={CD.h2}>Heute</div>
        <div className={CD.sub}>
          Mitarbeiter: <span className="text-neutral-100 font-medium">{mitarbeiterName}</span> · Datum:{" "}
          <span className="text-neutral-100 font-medium">{isoDate}</span>
        </div>
      </div>

      <div className={CD.card}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className={CD.label}>Projekt</div>
            <select className={CD.select} value={projektId} onChange={(e) => setProjektId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className={CD.label}>Bereich</div>
            <div className="grid grid-cols-3 gap-2">
              {BEREICHE.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={bereich === b.key ? CD.btnPrimary : CD.btnGhost}
                  onClick={() => setBereich(b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={CD.label}>Notiz (optional)</div>
            <input className={CD.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Fronten zugeschnitten" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!laufend ? (
            <button
              className={CD.btnPrimary}
              type="button"
              onClick={() =>
                setState((s) => {
                  const next = { ...s };
                  startTimer(next, { mitarbeiterId, projektId, bereich, note: note.trim() || undefined });
                  return next;
                })
              }
            >
              Start
            </button>
          ) : (
            <button
              className={CD.btnPrimary}
              type="button"
              onClick={() =>
                setState((s) => {
                  const next = { ...s };
                  stopTimer(next, isoDate);
                  return next;
                })
              }
            >
              Stop
            </button>
          )}

          {laufend && (
            <span className={CD.pill}>
              Läuft: Projekt {laufend.projektId} · {laufend.bereich} · seit {new Date(laufend.startTs).toLocaleTimeString()}
            </span>
          )}

          <span className={CD.pill}>SOLL {minutesToHoursString(daySummary.sollMinuten)}</span>
          <span className={CD.pill}>Arbeit {minutesToHoursString(daySummary.arbeitMinuten)}</span>
          <span className={CD.pill}>Δ {minutesToHoursString(daySummary.deltaUeberstundenMinuten)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Abwesenheit */}
        <div className={CD.card}>
          <div className={CD.h2}>Abwesenheit</div>
          <div className={CD.sub}>Urlaub / Krank / Überstundenabbau (Abbau max. bis SOLL-Rest)</div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                className={CD.btnGhost}
                type="button"
                onClick={() =>
                  setState((s) => {
                    const next = { ...s };
                    upsertStatus(next, { mitarbeiterId, datum: isoDate, art: "urlaub", minuten: null });
                    return next;
                  })
                }
              >
                Urlaub
              </button>

              <button
                className={CD.btnGhost}
                type="button"
                onClick={() =>
                  setState((s) => {
                    const next = { ...s };
                    upsertStatus(next, { mitarbeiterId, datum: isoDate, art: "krank", minuten: null });
                    return next;
                  })
                }
              >
                Krank
              </button>

              <button
                className={CD.btnGhost}
                type="button"
                onClick={() =>
                  setState((s) => {
                    const next = { ...s };
                    upsertStatus(next, { mitarbeiterId, datum: isoDate, art: "ueberstundenabbau", minuten: null });
                    return next;
                  })
                }
              >
                Überstundenabbau
              </button>
            </div>

            <div className={CD.sub}>
              Max. Abbau heute: <span className="text-orange-300 font-medium">{minutesToHoursString(daySummary.maxAbbauMinuten)}</span>
            </div>

            <button
              className={CD.danger}
              type="button"
              onClick={() =>
                setState((s) => {
                  const next = { ...s };
                  clearStatus(next, { mitarbeiterId, datum: isoDate });
                  return next;
                })
              }
            >
              Status entfernen
            </button>
          </div>
        </div>

        {/* Heute Liste */}
        <div className={CD.card}>
          <div className={CD.h2}>Heute gebucht</div>
          <div className={CD.sub}>Mehrere Projekte pro Tag möglich. Minuten können korrigiert werden.</div>

          {arbeitsBuchungenHeute.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-400">Noch keine Einträge.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {arbeitsBuchungenHeute.map((b) => (
                <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-neutral-100">
                      Projekt {b.projektId} · {b.bereich}
                    </div>
                    <span className={CD.pill}>{minutesToHoursString(b.minuten)}</span>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <div className={CD.label}>Minuten</div>
                      <input
                        className={CD.input}
                        type="number"
                        value={b.minuten}
                        onChange={(e) =>
                          setState((s) => {
                            const next = { ...s };
                            updateArbeitsBuchung(next, b.id, { minuten: Number(e.target.value) || 0 });
                            return next;
                          })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <div className={CD.label}>Notiz</div>
                      <input
                        className={CD.input}
                        value={b.note ?? ""}
                        onChange={(e) =>
                          setState((s) => {
                            const next = { ...s };
                            updateArbeitsBuchung(next, b.id, { note: e.target.value });
                            return next;
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button
                      className={CD.danger}
                      type="button"
                      onClick={() =>
                        setState((s) => {
                          const next = { ...s };
                          deleteBuchung(next, b.id);
                          return next;
                        })
                      }
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
