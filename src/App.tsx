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

import { recomputeMitarbeiterKonten } from "./core/timeRules";


function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Tab = "heute" | "woche" | "board" | "zeitstrahl" | "abschluss" | "admin";

const LS_ACTIVE_BOOKING = "orgaboard.activeBookingProjektId.v1";

export default function App() {
  const [state, setStateRaw] = useState<State>(() => loadState());
  const [ms, setMsRaw] = useState<MitarbeiterState>(() => loadMitarbeiterState());
  const [settings, setSettingsRaw] = useState<Settings>(() => loadSettings());

  const [tab, setTab] = useState<Tab>("heute");
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // ✅ Aktives Buchungsziel (vom Board gesetzt)
  const [activeBookingProjektId, setActiveBookingProjektId] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_ACTIVE_BOOKING) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_BOOKING, activeBookingProjektId || "");
    } catch {}
  }, [activeBookingProjektId]);

  const setState = (updater: (s: State) => State) => {
    setStateRaw((prev) => updater(structuredClone(prev)));
  };

  const setMs = (updater: (s: MitarbeiterState) => MitarbeiterState) => {
    setMsRaw((prev) => updater(structuredClone(prev)));
  };

  const setSettings = (updater: (s: Settings) => Settings) => {
    setSettingsRaw((prev) => updater(structuredClone(prev)));
  };

        // ✅ Konten automatisch aus Buchungen neu berechnen (Urlaub/Ü-Stunden driftfrei)
  useEffect(() => {
    setMsRaw((prev) => {
      const nextMitarbeiter = recomputeMitarbeiterKonten({
        mitarbeiter: prev.mitarbeiter,
        buchungen: state.buchungen ?? [],
      });

      // Nur updaten, wenn sich wirklich etwas ändert (verhindert unnötige Renders)
      if (nextMitarbeiter.length !== prev.mitarbeiter.length) {
        return { ...prev, mitarbeiter: nextMitarbeiter };
      }

      // Reihenfolge prüfen (falls sich die Liste aus irgendeinem Grund umsortiert)
      for (let i = 0; i < nextMitarbeiter.length; i++) {
        const a = nextMitarbeiter[i];
        const b = prev.mitarbeiter[i];
        if (!a || !b || a.id !== b.id) {
          return { ...prev, mitarbeiter: nextMitarbeiter };
        }
      }

      // Inhalt prüfen (id-basiert, robust gegen spätere Sortierungen/Filter)
      const prevById = new Map(prev.mitarbeiter.map((m) => [m.id, m]));
      for (const a of nextMitarbeiter) {
        const b = prevById.get(a.id);
        if (!b) return { ...prev, mitarbeiter: nextMitarbeiter };

        if (
          a.urlaubstageVerbraucht !== b.urlaubstageVerbraucht ||
          a.ueberstundenSaldo !== b.ueberstundenSaldo
        ) {
          return { ...prev, mitarbeiter: nextMitarbeiter };
        }
      }

      return prev;
    });
  }, [state.buchungen]);



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

  // Mitarbeiterliste für Heute-Dropdown
  const mitarbeiterOptions = useMemo(() => {
    const list = (ms as any)?.mitarbeiter ?? [];
    return Array.isArray(list)
      ? list
          .filter((m) => m && typeof m.id === "string")
          .map((m) => ({ id: String(m.id), name: String(m.name ?? "Mitarbeiter") }))
      : [];
  }, [ms]);

  // selected Mitarbeiter (bestehende Logik – für Woche/Abschluss bleibt es so)
  const selected = useMemo(() => getSelected(ms), [ms]);
  const mitarbeiterId = selected?.id ?? "m1";
  const mitarbeiterName = selected?.name ?? "Mitarbeiter";
  const modell = selected?.modell ?? DEFAULT_WOCHENMODELL;

  function getTagesSollMinuten(isoDate: string) {
    return sollMinutenForIsoDate(modell, isoDate);
  }

  // ✅ Heute: eigener Mitarbeiter-Tester (wie bei dir gewünscht)
  const [heuteMitarbeiterId, setHeuteMitarbeiterId] = useState<string>(() => {
    return selected?.id ?? mitarbeiterOptions[0]?.id ?? "m1";
  });

  useEffect(() => {
    const preferred = selected?.id ?? mitarbeiterOptions[0]?.id ?? "m1";
    const exists = mitarbeiterOptions.some((m) => m.id === heuteMitarbeiterId);
    if (!exists) setHeuteMitarbeiterId(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, mitarbeiterOptions.map((m) => m.id).join("|")]);

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
              <button className={tab === "board" ? btnActive : btn} onClick={() => setTab("board")}>
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

      <div className={tab === "board" ? "mx-auto max-w-none px-2 pt-20 pb-6" : "mx-auto max-w-6xl px-4 pt-20 pb-6"}>

        {tab === "admin" ? (
          <div className="flex flex-col gap-3">
            <AdminMitarbeiter ms={ms} setMs={setMs} />
            <AdminProjekte state={state} setState={setState} ms={ms} />
          </div>
        ) : tab === "board" ? (
          <Board
            state={state}
            setState={setState}
            ms={ms}
            activeBookingProjektId={activeBookingProjektId}
            setActiveBookingProjektId={(pid) => {
              setActiveBookingProjektId(pid);
              // Optional: nach Klick im Board direkt in "Heute" wechseln
              setTab("heute");
            }}
          />
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
            mitarbeiterId={heuteMitarbeiterId}
            mitarbeiterName={mitarbeiterOptions.find((m) => m.id === heuteMitarbeiterId)?.name ?? "Mitarbeiter"}
            mitarbeiterOptions={mitarbeiterOptions}
            onChangeMitarbeiterId={setHeuteMitarbeiterId}
            getTagesSollMinuten={getTagesSollMinuten}
            isoDate={todayIso()}
            activeBookingProjektId={activeBookingProjektId}
            clearActiveBooking={() => setActiveBookingProjektId("")}
          />
        )}
      </div>
    </div>
  );
}
