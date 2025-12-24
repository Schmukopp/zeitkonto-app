import React, { useEffect, useState } from "react";
import Heute from "./ui/Heute";
import Woche from "./ui/Woche";
import { loadState } from "./core/timeStore";
import type { State } from "./core/timeStore";
import { DEFAULT_WOCHENMODELL, sollMinutenForIsoDate } from "./core/workModel";


// Minimal: später kommt das aus deinem Mitarbeiter-Modell
const MITARBEITER_ID = "m1";
const MITARBEITER_NAME = "Mitarbeiter";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Minimal: später kommt das aus Arbeitszeitmodell (Mo-Fr)
function getTagesSollMinuten(isoDate: string) {
  return sollMinutenForIsoDate(DEFAULT_WOCHENMODELL, isoDate);
}


export default function App() {
  const [state, setStateRaw] = useState<State>(() => loadState());
  const [tab, setTab] = useState<"heute" | "woche">("heute");

  // helper: mutation-safe update
  const setState = (updater: (s: State) => State) => {
    setStateRaw((prev) => updater(structuredClone(prev)));
  };

  useEffect(() => {
    // falls du später mehrere Tabs offen hast: optional sync
    const onStorage = () => setStateRaw(loadState());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const topBar =
    "sticky top-0 z-10 mb-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3 backdrop-blur";

  const btn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";
  const btnActive =
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-orange-400 hover:border-orange-400";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="p-4">
        <div className={topBar}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-neutral-300">
              Orgaboard · <span className="text-neutral-100 font-medium">{MITARBEITER_NAME}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" className={tab === "heute" ? btnActive : btn} onClick={() => setTab("heute")}>
                Heute
              </button>
              <button type="button" className={tab === "woche" ? btnActive : btn} onClick={() => setTab("woche")}>
                Woche
              </button>
            </div>
          </div>
        </div>

        {tab === "heute" ? (
          <Heute
            state={state}
            setState={setState}
            mitarbeiterId={MITARBEITER_ID}
            mitarbeiterName={MITARBEITER_NAME}
            getTagesSollMinuten={getTagesSollMinuten}
            isoDate={todayIso()}
          />
        ) : (
          <Woche
            state={state}
            mitarbeiterId={MITARBEITER_ID}
            mitarbeiterName={MITARBEITER_NAME}
            getTagesSollMinuten={getTagesSollMinuten}
          />
        )}
      </div>
    </div>
  );
}
