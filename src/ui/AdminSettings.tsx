// src/ui/AdminSettings.tsx
import React from "react";
import type { Settings } from "../core/settingsStore";
import { upsertSettings } from "../core/settingsStore";

type Props = {
  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;
};

function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export default function AdminSettings(p: Props) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Admin · Einstellungen</div>
          <div className="text-sm text-neutral-400">Betriebsweite Ziele und Defaults</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-sm font-medium text-neutral-100">Wertschöpfungsziel</div>
          <div className="text-sm text-neutral-400">
            Zielwert in €/h. Dieser Wert schwankt (produktive Jahresstunden) und soll daher anpassbar sein.
          </div>

          <div className="mt-3">
            <div className="text-xs text-neutral-400 mb-1">Ziel €/h</div>
            <input
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              type="number"
              min={0}
              max={9999}
              step="1"
              value={p.settings.wertschoepfungZielEurProStd ?? 105}
              onFocus={selectAllOnFocus}
              onMouseDown={(e) => {
                const el = e.currentTarget;
                if (document.activeElement !== el) {
                  e.preventDefault();
                  el.focus();
                  el.select();
                }
              }}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                p.setSettings((s) => upsertSettings(s, { wertschoepfungZielEurProStd: v }));
              }}
            />
            <div className="mt-2 text-xs text-neutral-500">
              Aktuell: <span className="text-neutral-200">{Number(p.settings.wertschoepfungZielEurProStd ?? 105).toFixed(0)} €/h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
