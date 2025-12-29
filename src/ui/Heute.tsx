// src/ui/Heute.tsx
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
  state: any;
  setState: (updater: (s: any) => any) => void;

  mitarbeiterId: string;
  mitarbeiterName: string;

  mitarbeiterOptions: { id: string; name: string }[];
  onChangeMitarbeiterId: (id: string) => void;

  getTagesSollMinuten: (isoDate: string) => number;
  isoDate: string;

  activeBookingProjektId: string;
  clearActiveBooking: () => void;
};


type DayChoice = { label: string; iso: string };

// ===== UTC-kalenderfeste Date-Helpers (DST + Schaltjahr sicher) =====
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}
function toIsoDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function startOfWeekMondayUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const day = x.getUTCDay(); // 0=So..6=Sa
  const diff = (day === 0 ? -6 : 1) - day; // Montag
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

// ===== Kalenderjahr-KW (erste KW = Woche ab erstem Montag im Jahr) =====
function firstMondayOfYearUTC(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const dow = jan1.getUTCDay(); // 0=So..6=Sa
  const offset = (dow === 0 ? 1 : 8 - dow) % 7; // bis Montag
  return new Date(Date.UTC(year, 0, 1 + offset, 0, 0, 0, 0));
}
function kalenderjahrKW(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const year = d.getUTCFullYear();
  const firstMon = firstMondayOfYearUTC(year);
  const diffDays = Math.floor((d.getTime() - firstMon.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return Math.floor(diffDays / 7) + 1;
}

// Anzeige-Ende: Mo–Sa, aber niemals über 31.12 hinaus
function weekEndDisplayMoSaCapped(weekStartMonday: Date): Date {
  const year = weekStartMonday.getUTCFullYear();
  const end = addDays(weekStartMonday, 5);
  const dec31 = new Date(Date.UTC(year, 11, 31, 0, 0, 0, 0));
  return end.getTime() > dec31.getTime() ? dec31 : end;
}

function clampMinuten(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
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

  // Woche-Navigation
  const [weekOffset, setWeekOffset] = useState<number>(0);

  useEffect(() => {
    setWeekOffset(0);
  }, [isoDate]);

  const baseWeekStart = useMemo(() => {
    const base = startOfWeekMondayUTC(parseIso(isoDate));
    return addDays(base, weekOffset * 7);
  }, [isoDate, weekOffset]);

  const weekLabel = useMemo(() => {
    const kw = kalenderjahrKW(baseWeekStart);
    const from = toIsoDate(baseWeekStart);
    const to = toIsoDate(weekEndDisplayMoSaCapped(baseWeekStart));
    return { kw, from, to };
  }, [baseWeekStart]);

  const dayChoices: DayChoice[] = useMemo(() => {
    const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    return labels.map((label, i) => ({ label, iso: toIsoDate(addDays(baseWeekStart, i)) }));
  }, [baseWeekStart]);

  const [selectedIso, setSelectedIso] = useState<string>(isoDate);

  useEffect(() => {
    // Wenn System-Heute in aktueller Woche liegt und weekOffset==0 → springe auf echtes Heute
    if (weekOffset === 0 && dayChoices.some((d) => d.iso === isoDate)) {
      setSelectedIso(isoDate);
      return;
    }
    // sonst: Montag dieser Woche
    setSelectedIso(toIsoDate(baseWeekStart));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseWeekStart, isoDate, weekOffset]);

  const [selectedProjektId, setSelectedProjektId] = useState<string>(() => {
    const first = (state.projects ?? []).find((p: any) => p?.active);
    return first ? String(first.id) : "";
  });

  const [selectedBereich, setSelectedBereich] = useState<Bereich>("bank");

  const laufendeProjektId = state.running?.projektId ? String(state.running.projektId) : "";

  const isRunningForUser = useMemo(() => {
    return !!state.running && String(state.running.mitarbeiterId) === String(mitarbeiterId);
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
      (b: any) => String(b?.mitarbeiterId) === String(mitarbeiterId) && String(b?.datum) === String(selectedIso)
    );
    return list.slice().sort((a: any, b: any) => (a.art === b.art ? 0 : a.art === "arbeit" ? -1 : 1));
  }, [state.buchungen, mitarbeiterId, selectedIso]);

  const daySummary = useMemo(
    () => calcDaySummary(state as any, mitarbeiterId, selectedIso),
    [state, mitarbeiterId, selectedIso]
  );

  function handleStart() {
    if (!selectedProjektId) return;

    setState((s) => {
      startTimer(s, {
        mitarbeiterId: String(mitarbeiterId),
        projektId: String(selectedProjektId),
        bereich: selectedBereich,
        datum: String(selectedIso),
      });
      return s;
    });
  }

  function handleStop() {
    setState((s) => {
      stopTimer(s, String(selectedIso));
      return s;
    });
  }

  function setStatus(art: "urlaub" | "krank" | "ueberstundenabbau") {
    setState((s) => {
      upsertStatus(s as any, {
        mitarbeiterId: String(mitarbeiterId),
        datum: String(selectedIso),
        art,
        minuten: null,
      });
      return s;
    });
  }

  function clearDayStatus() {
    setState((s) => {
      clearStatus(s as any, { mitarbeiterId: String(mitarbeiterId), datum: String(selectedIso) });
      return s;
    });
  }

  function updateMinutes(buchungId: string, minutes: number) {
    const m = clampMinuten(minutes);
    setState((s) => {
      updateArbeitsBuchung(s as any, String(buchungId), { minuten: m });
      return s;
    });
  }

  function removeBuchung(buchungId: string) {
    setState((s) => {
      deleteBuchung(s as any, String(buchungId));
      return s;
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
                  value={String(mitarbeiterId)}
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

        {/* Woche */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => setWeekOffset((w) => w - 1)}>
            ◀ Woche
          </button>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
            <span className="font-semibold">KW {weekLabel.kw}</span>{" "}
            <span className="text-neutral-400 text-xs">
              ({weekLabel.from} – {weekLabel.to})
            </span>
          </div>

          <button className={btn} onClick={() => setWeekOffset((w) => w + 1)}>
            Woche ▶
          </button>

          <button className={btn} onClick={() => setWeekOffset(0)}>
            Heute
          </button>

          <div className="text-xs text-neutral-500 ml-2">Ausgewählt: {selectedIso}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Tag (Mo–Sa) */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-400">Tag (in KW {weekLabel.kw})</div>
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
              Soll: {minutesToHoursString(daySollMin)} · Ist: {minutesToHoursString(daySummary.arbeitMinuten)}
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

      {/* Buchungen des Tages */}
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
                        <span className="font-semibold text-neutral-300">Status: {String(b.art)}</span>
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
