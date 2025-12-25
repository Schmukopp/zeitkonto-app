import React from "react";
import { WOCHENTAGE, type WochenTag } from "../core/workModel";
import {
  calcUrlaubUebrig,
  createMitarbeiter,
  deleteMitarbeiter,
  getSelected,
  selectMitarbeiter,
  upsertMitarbeiter,
  type MitarbeiterState,
} from "../core/mitarbeiterStore";

type Props = {
  ms: MitarbeiterState;
  setMs: (updater: (s: MitarbeiterState) => MitarbeiterState) => void;
};

const L: Record<WochenTag, string> = { mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr" };

// Robust: beim ersten Klick verhindern wir, dass der Browser den Cursor setzt,
// und markieren stattdessen den kompletten Inhalt. Ergebnis: "0" wird zu "5" statt "05".
function selectAllOnFirstClick(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  if (document.activeElement !== el) {
    e.preventDefault();
    el.focus();
    el.select();
  }
}

// Tastatur-Fokus (Tab) ebenfalls markieren
function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export default function AdminMitarbeiter(p: Props) {
  const sel = getSelected(p.ms);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Admin · Mitarbeiter</div>
          <div className="text-sm text-neutral-400">Stammdaten, Arbeitszeitmodell, Urlaub, Überstunden</div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-orange-500"
            onClick={() => p.setMs((s) => createMitarbeiter(s))}
          >
            + Neu
          </button>
          {sel && (
            <button
              className="rounded-xl border border-orange-500 bg-neutral-950 px-3 py-2 text-sm text-orange-300 hover:bg-orange-500 hover:text-neutral-950"
              onClick={() => p.setMs((s) => deleteMitarbeiter(s, sel.id))}
            >
              Löschen
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <div className="mb-2 text-xs text-neutral-400">Mitarbeiter</div>
          <div className="flex flex-col gap-2">
            {p.ms.mitarbeiter.map((m) => (
              <button
                key={m.id}
                className={
                  "rounded-xl border px-3 py-2 text-left text-sm " +
                  (p.ms.selectedId === m.id
                    ? "border-orange-500 bg-orange-500/10 text-orange-200"
                    : "border-neutral-700 bg-neutral-950 hover:border-orange-500")
                }
                onClick={() => p.setMs((s) => selectMitarbeiter(s, m.id))}
              >
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-neutral-400">{m.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 md:col-span-2">
          {!sel ? (
            <div className="text-sm text-neutral-400">Kein Mitarbeiter ausgewählt.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Name</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    value={sel.name}
                    onChange={(e) => p.setMs((s) => upsertMitarbeiter(s, { ...sel, name: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">Geburtsdatum</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    value={sel.geburtsdatum}
                    onChange={(e) => p.setMs((s) => upsertMitarbeiter(s, { ...sel, geburtsdatum: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">Urlaubstage gesamt</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    max={999}
                    value={sel.urlaubstageGesamt}
                    onMouseDown={selectAllOnFirstClick}
                    onFocus={selectAllOnFocus}
                    onChange={(e) =>
                      p.setMs((s) =>
                        upsertMitarbeiter(s, { ...sel, urlaubstageGesamt: Number(e.target.value) || 0 })
                      )
                    }
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">Urlaubstage verbraucht</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    max={999}
                    value={sel.urlaubstageVerbraucht}
                    onMouseDown={selectAllOnFirstClick}
                    onFocus={selectAllOnFocus}
                    onChange={(e) =>
                      p.setMs((s) =>
                        upsertMitarbeiter(s, { ...sel, urlaubstageVerbraucht: Number(e.target.value) || 0 })
                      )
                    }
                  />
                  <div className="mt-1 text-xs text-orange-300">Übrig: {calcUrlaubUebrig(sel)}</div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">Überstundenkonto (h)</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    type="number"
                    min={-9999}
                    max={9999}
                    step="0.25"
                    value={sel.ueberstundenSaldo}
                    onMouseDown={selectAllOnFirstClick}
                    onFocus={selectAllOnFocus}
                    onChange={(e) =>
                      p.setMs((s) =>
                        upsertMitarbeiter(s, { ...sel, ueberstundenSaldo: Number(e.target.value) || 0 })
                      )
                    }
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-sm font-semibold">Arbeitszeitmodell (Mo–Fr)</div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
                  {WOCHENTAGE.map((t) => (
                    <div key={t} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
                      <div className="text-sm font-medium">{L[t]}</div>

                      <div className="mt-2 text-xs text-neutral-400">SOLL (Stunden)</div>
                      <input
  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
  type="number"
  min={0}
  max={12}
  step="0.25"
  value={Number((sel.modell.tage[t].sollMinuten / 60).toFixed(2))}
  onMouseDown={selectAllOnFirstClick}
  onFocus={selectAllOnFocus}
  onChange={(e) => {
    const hours = Number(e.target.value) || 0;
    const minutes = Math.round(hours * 60);

    p.setMs((s) =>
      upsertMitarbeiter(s, {
        ...sel,
        modell: {
          tage: {
            ...sel.modell.tage,
            [t]: { ...sel.modell.tage[t], sollMinuten: minutes },
          },
        },
      })
    );
  }}
/>
<div className="mt-1 text-xs text-neutral-500">
  = {sel.modell.tage[t].sollMinuten} min
</div>


                      <div className="mt-2 text-xs text-neutral-400">Urlaubswert (0..1)</div>
                      <input
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        max={1}
                        step="0.1"
                        value={sel.modell.tage[t].urlaubswert}
                        onMouseDown={selectAllOnFirstClick}
                        onFocus={selectAllOnFocus}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          p.setMs((s) =>
                            upsertMitarbeiter(s, {
                              ...sel,
                              modell: { tage: { ...sel.modell.tage, [t]: { ...sel.modell.tage[t], urlaubswert: v } } },
                            })
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
