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

  // optional: Mitarbeiter im Heute-Tab umschalten (Test/Handy)
  mitarbeiterOptions?: Array<{ id: string; name: string }>;
  onChangeMitarbeiterId?: (id: string) => void;

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
  mitarbeiterOptions,
  onChangeMitarbeiterId,
  getTagesSollMinuten,
  isoDate,
}: Props) {
  const btn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";
  const btnActive =
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950";
  const btnDanger =
    "rounded-xl border border-red-700 bg-neutral-900 px-3 py-2 text-sm text-red-200 hover:border-red-500 hover:text-red-100";

  const box = "rounded-2xl border border-neutral-800 bg-neutral-950 p-4";

  // Tagwahl Mo–Sa
  const dayChoices: DayChoice[] = useMemo(() => {
    const base = startOfIsoWeek(parseIso(isoDate));
    const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return labels.map((label, i) => ({ label, iso: toIsoDate(addDays(base, i)) }));
  }, [isoDate]);

  const [selectedIso, setSelectedIso] = useState<string>(isoDate);

  useEffect(() => {
    // wenn App den Tag wechselt (isoDate), übernehmen
    setSelectedIso(isoDate);
  }, [isoDate]);

  const [selectedProjektId, setSelectedProjektId] = useState<string>(() => {
    const first = (state.projects ?? []).find((p: any) => p?.active);
    return first ? String(first.id) : "";
  });

  const [selectedBereich, setSelectedBereich] = useState<Bereich>("bank");

  const laufendeProjektId = state.running?.projektId ? String(state.running.projektId) : "";

  const isRunningForUser = useMemo(() => {
    return !!state.running && state.running.mitarbeiterId === mitarbeiterId;
  }, [state.running, mitarbeiterId]);

  const runningInfo = useMemo(() => {
    if (!state.running) return null;
    const p = (state.projects ?? []).find((x: any) => String(x.id) === String(state.running?.projektId));
    const pname = p ? String(p.name) : String(state.running.projektId);
    return `Läuft: ${pname} · ${String(state.running.bereich)} · ${String(state.running.datum ?? "—")}`;
  }, [state.running, state.projects]);

  const daySollMin = useMemo(() => getTagesSollMinuten(selectedIso), [getTagesSollMinuten, selectedIso]);

  const dayBuchungen = useMemo(() => {
    const list = (state.buchungen ?? []).filter(
      (b: any) => b?.mitarbeiterId === mitarbeiterId && b?.datum === selectedIso
    );
    // Arbeit zuerst
    return list.slice().sort((a: any, b: any) => (a.art === b.art ? 0 : a.art === "arbeit" ? -1 : 1));
  }, [state.buchungen, mitarbeiterId, selectedIso]);

  const daySummary = useMemo(() => calcDaySummary(state as any, mitarbeiterId, selectedIso), [state, mitarbeiterId, selectedIso]);

  function handleStart() {
  if (!selectedProjektId) return;

  setState((s) => {
    try {
      const fn: any = startTimer as any;

      // Adaptiv: je nach Signatur aufrufen
      let next: any;
      if (typeof fn === "function") {
        if (fn.length >= 2) {
          // unsere "objekt"-Variante
          next = fn(s, {
            mitarbeiterId,
            projektId: selectedProjektId,
            bereich: selectedBereich,
            datum: selectedIso,
          });
        } else {
          // alte Varianten: (s) => ...
          next = fn(s);
        }
      }

      // Fallback: wenn nichts zurückkommt oder sich nichts ändert -> running minimal setzen
      const out = next ?? s;
      const hasRunning = !!(out as any).running;

      if (!hasRunning) {
        const cloned: any = structuredClone(out);
        cloned.running = {
          mitarbeiterId,
          projektId: selectedProjektId,
          bereich: selectedBereich,
          datum: selectedIso,
          startedAt: Date.now(),
        };
        return cloned;
      }

      return out;
    } catch (err) {
      console.error("handleStart failed:", err);
      return s;
    }
  });
}


function handleStop() {
  setState((s) => {
    try {
      const before: any = s as any;
      const beforeRunning = before?.running;

      const fn: any = stopTimer as any;

      // Versuch 1: stopTimer normal (adaptiv)
      let next: any;
      if (typeof fn === "function") {
        if (fn.length >= 2) {
          next = fn(s, { mitarbeiterId, datum: selectedIso });
        } else if (fn.length === 1) {
          next = fn(s);
        } else {
          next = fn(s);
        }
      }

      const out = next ?? s;

      // Prüfen, ob stopTimer wirklich eine Buchung erzeugt hat
      const beforeLen = Array.isArray(before?.buchungen) ? before.buchungen.length : 0;
      const afterLen = Array.isArray((out as any)?.buchungen) ? (out as any).buchungen.length : 0;

      if (afterLen > beforeLen) return out;

      // Fallback: Wenn stopTimer NICHT gebucht hat, dann buchen wir hier sauber nach.
      if (beforeRunning && String(beforeRunning.mitarbeiterId) === String(mitarbeiterId)) {
        const startedAt = Number(beforeRunning.startedAt ?? beforeRunning.startMs ?? beforeRunning.start ?? Date.now());
        const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));

        const datum = String(beforeRunning.datum ?? selectedIso);
        const projektId = String(beforeRunning.projektId ?? selectedProjektId);
        const bereich = String(beforeRunning.bereich ?? selectedBereich);

        const cloned: any = structuredClone(out);
        if (!Array.isArray(cloned.buchungen)) cloned.buchungen = [];

        cloned.buchungen.push({
          id: String(Date.now()),
          art: "arbeit",
          mitarbeiterId,
          projektId,
          bereich,
          datum,
          minuten: minutes,
        });

        // running beenden
        cloned.running = null;

        return cloned;
      }

      return out;
    } catch (err) {
      console.error("handleStop failed:", err);
      return s;
    }
  });
}


function setStatus(status: any) {
  setState((s) => {
    try {
      const next = upsertStatus(s as any, {
        mitarbeiterId,
        datum: selectedIso,
        status,
      });
      return next ?? s;
    } catch (err) {
      console.error("upsertStatus crashed:", err);
      return s;
    }
  });
}

function clearDayStatus() {
  setState((s) => {
    try {
      const next = clearStatus(s as any, {
        mitarbeiterId,
        datum: selectedIso,
      });
      return next ?? s;
    } catch (err) {
      console.error("clearStatus crashed:", err);
      return s;
    }
  });
}

function updateMinutes(buchungId: string, minutes: number) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));

  setState((s) => {
    try {
      // Versuch 1: timeStore-Funktion (falls sie passt)
      const fn: any = updateArbeitsBuchung as any;
      let next: any = undefined;

      if (typeof fn === "function") {
        // Variante A: (state, payload)
        if (fn.length >= 2) next = fn(s, { id: buchungId, minuten: m });
        // Variante B: (state) => ...
        else if (fn.length === 1) next = fn(s);
      }

      const out = next ?? s;

      // Prüfen, ob es wirklich geändert wurde
      const arr = Array.isArray((out as any)?.buchungen) ? (out as any).buchungen : [];
      const found = arr.find((b: any) => String(b?.id) === String(buchungId));
      if (found && Number(found.minuten) === m) return out;

      // Fallback: direkt im State anpassen
      const cloned: any = structuredClone(out);
      if (!Array.isArray(cloned.buchungen)) cloned.buchungen = [];

      const idx = cloned.buchungen.findIndex((b: any) => String(b?.id) === String(buchungId));
      if (idx >= 0) {
        cloned.buchungen[idx] = { ...cloned.buchungen[idx], minuten: m };
      }
      return cloned;
    } catch (err) {
      console.error("updateMinutes failed:", err);

      // Harte Fallback-Variante: direkt im bestehenden State ändern
      const cloned: any = structuredClone(s);
      if (!Array.isArray(cloned.buchungen)) cloned.buchungen = [];
      const idx = cloned.buchungen.findIndex((b: any) => String(b?.id) === String(buchungId));
      if (idx >= 0) cloned.buchungen[idx] = { ...cloned.buchungen[idx], minuten: m };
      return cloned;
    }
  });
}


function removeBuchung(buchungId: string) {
  setState((s) => {
    try {
      const next = deleteBuchung(s as any, { id: buchungId });
      return next ?? s;
    } catch (err) {
      console.error("deleteBuchung crashed:", err);
      return s;
    }
  });
}


  const projects = (state.projects ?? []).filter((p: any) => p?.active);

  return (
    <div className="flex flex-col gap-3">
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-neutral-300">
            Heute · <span className="text-neutral-100 font-semibold">{mitarbeiterName}</span>
            {mitarbeiterOptions && onChangeMitarbeiterId ? (
              <span className="ml-3 inline-flex items-center gap-2">
                <span className="text-neutral-500 text-xs">Mitarbeiter:</span>
                <select
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100"
                  value={mitarbeiterId}
                  onChange={(e) => onChangeMitarbeiterId(e.target.value)}
                >
                  {mitarbeiterOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </span>
            ) : null}
          </div>
          {runningInfo && <div className="text-xs text-neutral-400">{runningInfo}</div>}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Tag (Mo–Sa) */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-400">Tag</div>
            <div className="flex flex-wrap gap-2">
              {dayChoices.map((d) => (
                <button
                  key={d.iso}
                  className={selectedIso === d.iso ? btnActive : btn}
                  onClick={() => setSelectedIso(d.iso)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500">
              Soll: {minutesToHoursString(daySollMin)} · Ist: {minutesToHoursString(daySummary.arbeitsMinuten)}
            </div>
          </div>

          {/* Projekt */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-400">Projekt</div>
            <select
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
              value={selectedProjektId}
              onChange={(e) => setSelectedProjektId(e.target.value)}
            >
              {projects.length === 0 ? <option value="">(Keine aktiven Projekte)</option> : null}
              {projects.map((p: any) => (
                <option key={p.id} value={String(p.id)}>
                  {String(p.name)}
                </option>
              ))}
            </select>

            <div className="text-xs text-neutral-400">Bereich</div>
            <div className="flex flex-wrap gap-2">
              {(["maschine", "bank", "lack", "montage"] as Bereich[]).map((b) => (
                <button
                  key={b}
                  className={selectedBereich === b ? btnActive : btn}
                  onClick={() => setSelectedBereich(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Start/Stop */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-400">Timer</div>
            <div className="flex flex-wrap gap-2">
              <button className={btnActive} onClick={handleStart}>
                Start
              </button>
              <button className={isRunningForUser ? btnDanger : btn} onClick={handleStop} disabled={!isRunningForUser}>
                Stop
              </button>
            </div>

            <div className="text-xs text-neutral-500">
              Laufend: {isRunningForUser ? `${laufendeProjektId || "Projekt"} (${String(state.running?.bereich)})` : "—"}
            </div>
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
        </div>
      </div>

      {/* Debug / Transparenz: Buchungen des Tages */}
      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-neutral-100">Buchungen des Tages</div>
          <div className="text-xs text-neutral-500">{selectedIso}</div>
        </div>

        {dayBuchungen.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-500">Keine Buchungen für diesen Tag.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2">
            {dayBuchungen.map((b: any) => {
              const isArbeit = b.art === "arbeit";
              const p = isArbeit ? (state.projects ?? []).find((x: any) => String(x.id) === String(b.projektId)) : null;
              const pname = p ? String(p.name) : String(b.projektId ?? "");
              return (
                <div key={String(b.id)} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-neutral-100">
                      {isArbeit ? (
                        <>
                          <span className="font-semibold">{pname}</span>{" "}
                          <span className="text-neutral-400">· {String(b.bereich)}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-neutral-300">Status: {String(b.status)}</span>
                      )}
                    </div>

                    {isArbeit ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          className="w-24 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100"
                          value={Number(b.minuten ?? 0)}
                          onChange={(e) => updateMinutes(String(b.id), e.target.valueAsNumber)}

                          min={0}
                          step={15}
                        />
                        <button className={btnDanger} onClick={() => removeBuchung(String(b.id))}>
                          Löschen
                        </button>
                      </div>
                    ) : null}
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
