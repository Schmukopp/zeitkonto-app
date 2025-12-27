// src/ui/SettingsDrawer.tsx
import React from "react";
import type { Settings } from "../core/settingsStore";
import { upsertSettings } from "../core/settingsStore";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;
};

function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export default function SettingsDrawer(p: Props) {
  if (!p.open) return null;

  const s = p.settings;

  const row = "flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2";
  const label = "text-sm text-neutral-200";
  const hint = "text-xs text-neutral-500";

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onMouseDown={p.onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed right-0 top-0 h-full w-full max-w-md border-l border-neutral-800 bg-neutral-950 p-4"
        onMouseDown={stop}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Einstellungen</div>
            <div className="text-sm text-neutral-400">Betriebsparameter & Anzeigeoptionen</div>
          </div>
          <button
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-orange-500"
            onClick={p.onClose}
            type="button"
          >
            Schließen
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
            <div className="text-sm font-medium text-neutral-100">Betrieb</div>

            <div className="mt-3">
              <div className="text-xs text-neutral-400 mb-1">Wertschöpfungsziel (€/h)</div>
              <input
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                type="number"
                min={0}
                max={9999}
                step="1"
                value={s.wertschoepfungZielEurProStd ?? 105}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  p.setSettings((prev) => upsertSettings(prev, { wertschoepfungZielEurProStd: v }));
                }}
              />
              <div className={hint + " mt-2"}>
                Schwankt mit produktiven Jahresstunden. Wird in Nachkalkulation als Zielvergleich verwendet.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
            <div className="text-sm font-medium text-neutral-100">Anzeige</div>

            <div className="mt-3 flex flex-col gap-2">
              <div className={row}>
                <div>
                  <div className={label}>Arbeitsarten-Signal (Maschine/Bank/Lack/Montage)</div>
                  <div className={hint}>4 Segmente als Fortschrittsanzeige.</div>
                </div>
                <input
                  type="checkbox"
                  className="accent-orange-500"
                  checked={!!s.showArbeitsartIndicator}
                  onChange={(e) =>
                    p.setSettings((prev) => upsertSettings(prev, { showArbeitsartIndicator: e.target.checked }))
                  }
                />
              </div>

              <div className={row}>
                <div>
                  <div className={label}>Zahlen anzeigen</div>
                  <div className={hint}>Soll/Ist/Delta in Board/Pool (mehr Info, aber unruhiger).</div>
                </div>
                <input
                  type="checkbox"
                  className="accent-orange-500"
                  checked={!!s.showNumbersOnBoard}
                  onChange={(e) =>
                    p.setSettings((prev) => upsertSettings(prev, { showNumbersOnBoard: e.target.checked }))
                  }
                />
              </div>

              <div className={row}>
                <div>
                  <div className={label}>Pool-Details anzeigen</div>
                  <div className={hint}>Zusatzinfos im Pool (z. B. Zuordnung + Fortschritt).</div>
                </div>
                <input
                  type="checkbox"
                  className="accent-orange-500"
                  checked={!!s.showDetailsInPool}
                  onChange={(e) =>
                    p.setSettings((prev) => upsertSettings(prev, { showDetailsInPool: e.target.checked }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="text-xs text-neutral-500">
            Hinweis: Einstellungen sind absichtlich „Baukasten“, damit ihr euch noch nicht festlegen müsst.
          </div>
        </div>
      </div>
    </div>
  );
}
