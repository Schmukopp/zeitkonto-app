import React from "react";
import type { State } from "../core/timeStore";
import { createProject, setProjectActive, upsertProject } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";

function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

export default function AdminProjekte(p: Props) {
  const projects = p.state.projects ?? [];
  const mitarbeiter = (p.ms as any)?.mitarbeiter ?? [];

  const mitarbeiterOptions = Array.isArray(mitarbeiter)
    ? mitarbeiter
        .filter((m: any) => m && typeof m.id === "string")
        .map((m: any) => ({ id: String(m.id), name: String(m.name ?? m.id) }))
    : [];

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Admin · Projekte</div>
          <div className="text-sm text-neutral-400">
            Stammdaten + Verantwortlicher Meister (Hauptstrahl) + Planwerte
          </div>
        </div>

        <button
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-orange-500"
          onClick={() => p.setState((s) => createProject(s))}
          type="button"
        >
          + Neues Projekt
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {projects.map((proj: any) => (
          <div key={proj.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {proj.active !== false ? (
                  <span className="text-neutral-100">Aktiv</span>
                ) : (
                  <span className="text-neutral-400">Inaktiv</span>
                )}
                <span className="text-neutral-500"> · </span>
                <span className="text-neutral-100">{proj.id}</span>
              </div>

              <button
                className={
                  "rounded-xl border px-3 py-2 text-sm " +
                  (proj.active !== false
                    ? "border-neutral-700 bg-neutral-950 hover:border-orange-500"
                    : "border-orange-500 bg-neutral-950 text-orange-300 hover:bg-orange-500 hover:text-neutral-950")
                }
                onClick={() => p.setState((s) => setProjectActive(s, proj.id, !(proj.active !== false)))}
                type="button"
              >
                {proj.active !== false ? "Deaktivieren" : "Aktivieren"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-neutral-400 mb-1">Projektname</div>
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  value={proj.name}
                  onFocus={selectAllOnFocus}
                  onChange={(e) =>
                    p.setState((s) =>
                      upsertProject(s, {
                        ...proj,
                        name: e.target.value,
                      })
                    )
                  }
                  onBlur={() =>
                    p.setState((s) =>
                      upsertProject(s, {
                        ...proj,
                        name: String(proj.name ?? "").trim() || "Ohne Name",
                      })
                    )
                  }
                />
              </div>

              <div>
                <div className="text-xs text-neutral-400 mb-1">Kalkulierte Stunden (Fallback)</div>
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  type="number"
                  min={0}
                  max={99999}
                  step="0.25"
                  value={proj.kalkStunden ?? 0}
                  onMouseDown={(e) => {
                    const el = e.currentTarget;
                    if (document.activeElement !== el) {
                      e.preventDefault();
                      el.focus();
                      el.select();
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    p.setState((s) =>
                      upsertProject(s, {
                        ...proj,
                        kalkStunden: v,
                      })
                    );
                  }}
                />
                <div className="mt-1 text-xs text-neutral-500">
                  Hinweis: Langfristig arbeiten wir mit Arbeitsarten-Minuten (Maschine/Bank/Lack/Montage). Dieses Feld ist nur Fallback.
                </div>
              </div>
            </div>

            {/* Verantwortlichkeiten */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-sm font-medium text-neutral-100">Verantwortung (für Board-Hauptstrahl)</div>
              <div className="text-sm text-neutral-400">
                Der Projektblock bleibt im Board beim verantwortlichen Meister. Buchungen anderer Mitarbeiter färben den Block trotzdem (Ist-Zeit im Block).
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Verantwortlicher Meister (Hauptstrahl)</div>
                  <select
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    value={String(proj.hauptdarstellerId ?? "")}
                    onChange={(e) => {
                      const v = e.target.value || undefined;
                      p.setState((s) => upsertProject(s, { ...proj, hauptdarstellerId: v }));
                    }}
                  >
                    <option value="">(nicht gesetzt)</option>
                    {mitarbeiterOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs text-neutral-400 mb-1">Operativ zugeordnet (optional)</div>
                  <select
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    value={String(proj.zugeordnetAnId ?? "")}
                    onChange={(e) => {
                      const v = e.target.value || undefined;
                      p.setState((s) => upsertProject(s, { ...proj, zugeordnetAnId: v }));
                    }}
                  >
                    <option value="">(nicht gesetzt)</option>
                    {mitarbeiterOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 text-xs text-neutral-500">
                Meisterfarbe: kommt automatisch aus der Meister-ID (hashbasiert). Optional können wir später ein fixes Farb-Override pro Projekt ergänzen.
              </div>
            </div>

            {/* Planwerte */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-sm font-medium text-neutral-100">Planwerte (optional)</div>
              <div className="text-sm text-neutral-400">
                Diese Werte helfen, Abweichungen früh zu erkennen. Istwerte kommen erst in der Nachkalkulation.
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Plan Netto-VK €</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    step="1"
                    value={proj.planNettoVkEur ?? 0}
                    onFocus={selectAllOnFocus}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      p.setState((s) => upsertProject(s, { ...proj, planNettoVkEur: v }));
                    }}
                  />
                </div>

                <div>
                  <div className="text-xs text-neutral-400 mb-1">Plan Material €</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    step="1"
                    value={proj.planMaterialEur ?? 0}
                    onFocus={selectAllOnFocus}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      p.setState((s) => upsertProject(s, { ...proj, planMaterialEur: v }));
                    }}
                  />
                </div>
              </div>

              <div className="mt-2 text-xs text-neutral-500">
                Tipp: Wenn ihr mehr Material braucht (Fehler/Nacharbeit), sieht man später in der Nachkalkulation die Differenz Plan ↔ Ist.
              </div>
            </div>
          </div>
        ))}

        {projects.length === 0 && <div className="text-sm text-neutral-400">Noch keine Projekte angelegt.</div>}
      </div>
    </div>
  );
}
