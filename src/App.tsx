import React, { useEffect, useMemo, useState } from "react";
import Heute from "./ui/Heute";
import Woche from "./ui/Woche";
import AdminMitarbeiter from "./ui/AdminMitarbeiter";
import AdminProjekte from "./ui/AdminProjekte";
import Zeitstrahlen from "./ui/Zeitstrahlen";
import ProjektAbschluss from "./ui/ProjektAbschluss";
import SettingsDrawer from "./ui/SettingsDrawer";
import Board from "./ui/Board";


import { loadState } from "./core/timeStore";
import type { State } from "./core/timeStore";

import { sollMinutenForIsoDate, DEFAULT_WOCHENMODELL } from "./core/workModel";

import {
  loadMitarbeiterState,
  saveMitarbeiterState,
  getSelected,
  type MitarbeiterState,
} from "./core/mitarbeiterStore";

import { loadSettings, saveSettings, type Settings } from "./core/settingsStore";

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
  const [settings, setSettingsRaw] = useState<Settings>(() => loadSettings());

  const [tab, setTab] = useState<"heute" | "woche" | "zeitstrahl" | "abschluss" | "admin">("heute");
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const setState = (updater: (s: State) => State) => {
    setStateRaw((prev) => updater(structuredClone(prev)));
  };

  const setMs = (updater: (s: MitarbeiterState) => MitarbeiterState) => {
    setMsRaw((prev) => updater(structuredClone(prev)));
  };

  const setSettings = (updater: (s: Settings) => Settings) => {
    setSettingsRaw((prev) => updater(structuredClone(prev)));
  };

  // Mitarbeiter-Stammdaten persistieren (robust + leicht gedrosselt)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        saveMitarbeiterState(ms);
      } catch (err) {
        console.warn("saveMitarbeiterState failed", err);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [ms]);

  // Settings persistieren (leicht gedrosselt)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        saveSettings(settings);
      } catch (err) {
        console.warn("saveSettings failed", err);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [settings]);

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

  const iconBtn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-neutral-300">
              Orgaboard · <span className="text-neutral-100 font-medium">{mitarbeiterName}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={tab === "heute" ? btnActive : btn} onClick={() => setTab("heute")}>
                Heute
              </button>
              <button className={tab === "woche" ? btnActive : btn} onClick={() => setTab("woche")}>
                Woche
              </button>
              <button
  onClick={() => setTab("board")}
  className={tab === "board" ? "rounded-lg px-3 py-2 text-sm font-medium bg-slate-900 text-white" : "rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"}
>
  Board
</button>

              <button className={tab === "zeitstrahl" ? btnActive : btn} onClick={() => setTab("zeitstrahl")}>
                Zeitstrahl
              </button>
              <button className={tab === "abschluss" ? btnActive : btn} onClick={() => setTab("abschluss")}>
                Abschluss
              </button>
              <button className={tab === "admin" ? btnActive : btn} onClick={() => setTab("admin")}>
                Admin
              </button>


              <button className={iconBtn} onClick={() => setSettingsOpen(true)} title="Einstellungen">
                ⚙
              </button>
            </div>
          </div>
        </div>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        setSettings={setSettings}
      />

            <div className="mx-auto max-w-6xl px-4 pt-20 pb-6">
        {tab === "admin" ? (
          <div className="flex flex-col gap-3">
            <AdminMitarbeiter ms={ms} setMs={setMs} />
            <AdminProjekte state={state} setState={setState} ms={ms} />
          </div>
        ) : tab === "board" ? (
  <Board state={state} setState={setState} ms={ms} />
) : tab === "zeitstrahl" ? (




          <Zeitstrahlen state={state} setState={setState} ms={ms} settings={settings} />
        ) : tab === "abschluss" ? (
          <ProjektAbschluss
            state={state}
            setState={setState}
            ms={ms}
            mitarbeiterId={mitarbeiterId}
            mitarbeiterName={mitarbeiterName}
            wertZielEurH={settings.wertschoepfungZielEurProStd ?? 105}
          />
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
