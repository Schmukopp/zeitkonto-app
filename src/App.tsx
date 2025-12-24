import React, { useEffect, useMemo, useState } from "react";
import Heute from "./ui/Heute";
import Woche from "./ui/Woche";
import AdminMitarbeiter from "./ui/AdminMitarbeiter";

import { loadState } from "./core/timeStore";
import type { State } from "./core/timeStore";

import { sollMinutenForIsoDate, DEFAULT_WOCHENMODELL } from "./core/workModel";

import {
  loadMitarbeiterState,
  saveMitarbeiterState,
  getSelected,
  type MitarbeiterState,
} from "./core/mitarbeiterStore";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function App() {
  const [state, setStateRaw] = useState<State>(() => loadState());
  const [ms, setMsRaw] = useState<MitarbeiterState>(() => loadMitarbeiterState());
  const [tab, setTab] = useState<"heute" | "woche" | "admin">("heute");

  const setState = (updater: (s: State) => State) => {
    setStateRaw((prev) => updater(structuredClone(prev)));
  };

  const setMs = (updater: (s: MitarbeiterState) => MitarbeiterState) => {
    setMsRaw((prev) => updater(structuredClone(prev)));
  };

  // Mitarbeiter-Stammdaten persistieren
  useEffect(() => {
    saveMitarbeiterState(ms);
  }, [ms]);

  const selected = useMemo(() => getSelected(ms), [ms]);
  const mitarbeiterId = selected?.id ?? "m1";
  const mitarbeiterName = selected?.name ?? "Mitarbeiter";
  const modell = selected?.modell ?? DEFAULT_WOCHENMODELL;

  function getTagesSollMinuten(isoDate: string) {
    return sollMinutenForIsoDate(modell, isoDate);
  }

  const btn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";
  const btnActive =
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Navigation fixiert (damit nichts sie überdeckt) */}
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-neutral-300">
              Orgaboard · <span className="text-neutral-100 font-medium">{mitarbeiterName}</span>
            </div>

            <div className="flex gap-2">
              <button className={tab === "heute" ? btnActive : btn} onClick={() => setTab("heute")}>
                Heute
              </button>
              <button className={tab === "woche" ? btnActive : btn} onClick={() => setTab("woche")}>
                Woche
              </button>
              <button className={tab === "admin" ? btnActive : btn} onClick={() => setTab("admin")}>
                Admin
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Inhalt bekommt Platz unter der Nav */}
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-6">
        {tab === "admin" ? (
          <AdminMitarbeiter ms={ms} setMs={setMs} />
        ) : tab === "woche" ? (
          <Woche
            state={state}
            mitarbeiterId={mitarbeiterId}
            mitarbeiterName={mitarbeiterName}
            getTagesSollMinuten={getTagesSollMinuten}
          />
        ) : (
          <Heute
            state={state}
            setState={setState}
            mitarbeiterId={mitarbeiterId}
            mitarbeiterName={mitarbeiterName}
            getTagesSollMinuten={getTagesSollMinuten}
            isoDate={todayIso()}
          />
        )}
      </div>
    </div>
  );
}
