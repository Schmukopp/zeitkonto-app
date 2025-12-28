import React, { useEffect, useMemo, useState } from "react";
import type { Bereich } from "../core/timeTypes";
import type { State } from "../core/timeStore";
import { minutesToHoursString, calcDaySummary } from "../core/timeRules";

import {
  startTimer,
  stopTimer,
  upsertStatus,
  clearStatus,
  updateArbeitsBuchung,
  deleteBuchung,
} from "../core/timeStore";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;

  mitarbeiterId: string;
  mitarbeiterName: string;

  getTagesSollMinuten: (isoDate: string) => number;

  // kommt aus App.tsx (heute)
  isoDate: string;
};

type DayChoice = { label: string; iso: string };

function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function toIsoDate(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export default function Heute({
  state,
  setState,
  mitarbeiterId,
  mitarbeiterName,
  getTagesSollMinuten,
  isoDate: todayIsoFromApp,
}: Props) {
  // Mo–Sa der aktuellen Woche (wie Board)
  const dayChoices: DayChoice[] = useMemo(() => {
    const base = startOfIsoWeek(new Date());
    const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return labels.map((label, i) => ({
      label,
      iso: toIsoDate(addDays(base, i)),
    }));
  }, []);

  // Default: wenn heute Sonntag => Montag (damit du sofort testen kannst)
  const initialIso = useMemo(() => {
    const d = parseIso(todayIsoFromApp);
    if (d.getDay() === 0) return toIsoDate(startOfIsoWeek(d));
    return todayIsoFromApp;
  }, [todayIsoFromApp]);

  const [selectedIso, setSelectedIso] = useState<string>(initialIso);

  // Projekte (aktiv)
  const activeProjects = useMemo(
    () => (state.projects ?? []).filter((p: any) => p?.active !== false),
    [state.projects]
  );

  // Projekt/Bereich – schnell
  const [projektId, setProjektId] = useState<string>(() => String(activeProjects[0]?.id ?? "p1"));
  const [bereich, setBereich] = useState<Bereich>("bank");
  const [note, setNote] = useState<string>("");

  // Wenn Projekte sich ändern (Admin), Auswahl gültig halten
  useEffect(() => {
    if (activeProjects.length === 0) return;
    const exists = activeProjects.some((p: any) => String(p.id) === String(projektId));
    if (!exists) setProjektId(String(activeProjects[0].id));
  }, [activeProjects, projektId]);

  const sollMinuten = getTagesSollMinuten(selectedIso);

  const summary = useMemo(() => {
    return calcDaySummary({
      datum: selectedIso,
      mitarbeiterId,
      sollMinuten,
      buchungen: state.buchungen ?? [],
    });
  }, [selectedIso, mitarbeiterId, sollMinuten, state.buchungen]);

  const dayBuchungen = useMemo(() => {
    const list = (state.buchungen ?? []).filter(
      (b: any) => b?.mitarbeiterId === mitarbeiterId && b?.datum === selectedIso
    );
    // Arbeit zuerst
    return list.slice().sort((a: any, b: any) => (a.art === b.art ? 0 : a.art === "arbeit" ? -1 : 1));
  }, [state.buchungen, mitarbeiterId, selectedIso]);

  const isRunningForUser = useMemo(() => {
    return !!state.running && state.running.mitarbeiterId === mitarbeiterId;
  }, [state.running, mitarbeiterId]);

  const runningInfo = useMemo(() => {
    if (!state.running) return null;
    const p = (state.projects ?? []).find((x: any) => String(x.id) === String(state.running?.projektId));
    const pname = p ? String(p.name) : String(state.running.projektId);
    return `Läuft: ${pname} · ${String(state.running.bereich)} · ${String(state.running.datum)}`;
  }, [state.running, state.projects]);

  // ✅ Start/Stop: datum = selectedIso
  function handleStart() {
    setState((s) => {
      startTimer(s, {
        mitarbeiterId,
        projektId,
        bereich,
        datum: selectedIso,
        note: note.trim() ? note.trim() : undefined,
      });
      return s;
    });
  }

  function handleStop() {
    setState((s) => {
      stopTimer(s, selectedIso);
      return s;
    });
  }

  function setStatus(art: "urlaub" | "krank" | "ueberstundenabbau") {
    setState((s) => {
      upsertStatus(s, { mitarbeiterId, datum: selectedIso, art, minuten: null });
      return s;
    });
  }

  function clearDayStatus() {
    setState((s) => {
      clearStatus(s, { mitarbeiterId, datum: selectedIso });
      return s;
    });
  }

  function updateWork(
    id: string,
    patch: Partial<{ minuten: number; note: string; projektId: string; bereich: Bereich }>
  ) {
    setState((s) => {
      updateArbeitsBuchung(s, id, patch as any);
      return s;
    });
  }

  function removeBuchung(id: string) {
    setState((s) => {
      deleteBuchung(s, id);
      return s;
    });
  }

  const box = "rounded-2xl border border-neutral-800 bg-neutral-950 p-4";
  const label = "text-xs text-neutral-400";
  const input =
    "rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-orange-500";
  const btn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";
  const btnDanger = "rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-red-500";
  const btnStart = "flex-1 rounded-xl bg-green-600 py-3 text-neutral-950 font-semibold hover:bg-green-500";
  const btnStop = "flex-1 rounded-xl bg-red-600 py-3 text-neutral-950 font-semibold hover:bg-red-500";

  return (
    <div className="flex flex-col gap-3">
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-neutral-300">
            Heute · <span className="text-neutral-100 font-semibold">{mitarbeiterName}</span>
          </div>
          {runningInfo && <div className="text-xs text-neutral-400">{runningInfo}</div>}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Tag (Mo–Sa) */}
          <div className="flex flex-col gap-1">
            <div className={label}>Tag (Mo–Sa)</div>
            <div className="grid grid-cols-6 gap-2">
              {dayChoices.map((d) => (
                <button
                  key={d.iso}
                  className={
                    d.iso === selectedIso
                      ? "rounded-xl bg-orange-500 text-neutral-950 py-2 text-sm font-semibold"
                      : "rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 py-2 text-sm hover:border-orange-500 hover:text-orange-300"
                  }
                  onClick={() => setSelectedIso(d.iso)}
                  title={d.iso}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500 mt-1">Ausgewählt: {selectedIso}</div>
          </div>

          {/* Projekt */}
          <div className="flex flex-col gap-1">
            <div className={label}>Projekt</div>
            <select className={input} value={projektId} onChange={(e) => setProjektId(e.target.value)}>
              {activeProjects.map((p: any) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Bereich */}
          <div className="flex flex-col gap-1">
            <div className={label}>Bereich</div>
            <select className={input} value={bereich} onChange={(e) => setBereich(e.target.value as Bereich)}>
              <option value="maschine">Maschine</option>
              <option value="bank">Bank</option>
              <option value="lack">Lack</option>
              <option value="montage">Montage</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2 flex flex-col gap-1">
            <div className={label}>Notiz (optional)</div>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Beschläge..." />
          </div>

          <div className="flex gap-2 items-end">
            {!isRunningForUser ? (
              <button className={btnStart} onClick={handleStart}>
                ▶ Start
              </button>
            ) : (
              <button className={btnStop} onClick={handleStop}>
                ■ Stop
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button className={btn} onClick={() => setStatus("urlaub")}>
            Urlaub (Tag)
          </button>
          <button className={btn} onClick={() => setStatus("krank")}>
            Krank (Tag)
          </button>
          <button className={btn} onClick={() => setStatus("ueberstundenabbau")}>
            Ü-Std Abbau (Tag)
          </button>
          <button className={btn} onClick={clearDayStatus}>
            Status löschen
          </button>

          <div className="ml-auto text-xs text-neutral-400">
            Soll: <span className="text-neutral-100 font-semibold">{minutesToHoursString(summary.sollMinuten)}</span> · Ist:{" "}
            <span className="text-neutral-100 font-semibold">{minutesToHoursString(summary.arbeitMinuten)}</span> · ΔÜ:{" "}
            <span className="text-neutral-100 font-semibold">{minutesToHoursString(summary.deltaUeberstundenMinuten)}</span>
          </div>
        </div>
      </div>

      {/* Buchungenliste (Kontrolle) */}
      <div className={box}>
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-200 font-semibold">Buchungen ({selectedIso})</div>
          <div className="text-xs text-neutral-500">Nach Stop muss hier sofort ein Eintrag stehen.</div>
        </div>

        {dayBuchungen.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-400">Keine Buchungen für diesen Tag.</div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {dayBuchungen.map((b: any) => {
              if (b.art !== "arbeit") {
                return (
                  <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <div className="text-sm text-neutral-200">
                      Status: <span className="font-semibold">{String(b.art)}</span>{" "}
                      {b.minuten == null ? "(ganzer Tag)" : `(${minutesToHoursString(Number(b.minuten) || 0)})`}
                    </div>
                  </div>
                );
              }

              const p = activeProjects.find((x: any) => String(x.id) === String(b.projektId));
              const pname = p ? String(p.name) : String(b.projektId);

              return (
                <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm text-neutral-100 font-semibold">{pname}</div>
                    <div className="text-xs text-neutral-400">Bereich: {String(b.bereich)}</div>
                    <div className="ml-auto text-xs text-neutral-300">
                      Minuten: <span className="font-semibold text-neutral-100">{String(b.minuten ?? 0)}</span> (
                      {minutesToHoursString(Number(b.minuten) || 0)})
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <div className={label}>Projekt</div>
                      <select
                        className={input}
                        value={String(b.projektId)}
                        onChange={(e) => updateWork(String(b.id), { projektId: e.target.value })}
                      >
                        {activeProjects.map((pp: any) => (
                          <option key={String(pp.id)} value={String(pp.id)}>
                            {String(pp.name)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className={label}>Bereich</div>
                      <select
                        className={input}
                        value={String(b.bereich)}
                        onChange={(e) => updateWork(String(b.id), { bereich: e.target.value as Bereich })}
                      >
                        <option value="maschine">Maschine</option>
                        <option value="bank">Bank</option>
                        <option value="lack">Lack</option>
                        <option value="montage">Montage</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className={label}>Minuten</div>
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step={5}
                        value={Number(b.minuten) || 0}
                        onChange={(e) => updateWork(String(b.id), { minuten: Number(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <button className={btnDanger} onClick={() => removeBuchung(String(b.id))}>
                        Löschen
                      </button>
                    </div>
                  </div>

                  {b.note ? <div className="mt-2 text-xs text-neutral-400">Notiz: {String(b.note)}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
