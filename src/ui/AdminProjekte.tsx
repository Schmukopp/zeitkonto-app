import React from "react";
import type { State } from "../core/timeStore";
import { createProject, setProjectActive, upsertProject, archiveProject, deleteProject } from "../core/timeStore";

import type { MitarbeiterState } from "../core/mitarbeiterStore";

function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
};

type Bereich = "maschine" | "bank" | "lack" | "montage";

function clampNum(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function getKalkMinuten(proj: any, b: Bereich): number {
  const v = proj?.arbeitsarten?.[b]?.kalkMinuten;
  return Math.max(0, Math.round(Number(v) || 0));
}

function setKalkMinuten(proj: any, b: Bereich, kalkMinuten: number) {
  const aa = proj?.arbeitsarten && typeof proj.arbeitsarten === "object" ? proj.arbeitsarten : {};
  const prev = aa?.[b] && typeof aa[b] === "object" ? aa[b] : {};
  return {
    ...proj,
    arbeitsarten: {
      ...aa,
      [b]: {
        ...prev,
        kalkMinuten: Math.max(0, Math.round(kalkMinuten || 0)),
      },
    },
  };
}

function sumKalkMinuten(proj: any): number {
  return (
    getKalkMinuten(proj, "maschine") +
    getKalkMinuten(proj, "bank") +
    getKalkMinuten(proj, "lack") +
    getKalkMinuten(proj, "montage")
  );
}

function minutesToHours(min: number): number {
  return Math.round((Math.max(0, min) / 60) * 100) / 100; // 2 Dezimalstellen
}

export default function AdminProjekte(p: Props) {
  const projects = p.state.projects ?? [];
  const mitarbeiter = (p.ms as any)?.mitarbeiter ?? [];

  const mitarbeiterOptions = Array.isArray(mitarbeiter)
    ? mitarbeiter
        .filter((m: any) => m && typeof m.id === "string")
        .map((m: any) => ({ id: String(m.id), name: String(m.name ?? m.id) }))
    : [];
  // ✅ Rolle des aktuell ausgewählten Mitarbeiters (für Produkt-Rechte)
  const selectedMitarbeiter = (p.ms as any)?.mitarbeiter?.find(
    (m: any) => String(m.id) === String((p.ms as any)?.selectedId)
  );

  const rolle = String(selectedMitarbeiter?.rolle ?? "");
  const canDelete = rolle === "meister" || rolle === "admin";

  function archiveProjekt(proj: any) {
    if (!proj?.abschluss) {
      window.alert("Archivieren ist erst nach dem Abschluss möglich.");
      return;
    }

    const defaultYear = String(
      proj?.archivJahr ??
        new Date(proj?.abschluss?.abgeschlossenAt ?? Date.now()).getFullYear()
    );

    const yearStr = window.prompt("In welches Archiv-Jahr soll das Projekt verschoben werden?", defaultYear);
    if (yearStr == null) return;

    const year = Number(String(yearStr).trim());
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      window.alert("Ungültiges Jahr. Bitte z. B. 2026 eingeben.");
      return;
    }

    const ok = window.confirm(
      `Projekt wirklich ins Archiv ${year} verschieben?\n\n` +
        "Hinweis:\n" +
        "• Projekt verschwindet aus Board & Heute\n" +
        "• Buchungen bleiben erhalten (Historie/Woche/Abschluss)\n\n" +
        "Fortfahren?"
    );
    if (!ok) return;

    p.setState((s) => archiveProject(s, String(proj.id), year));
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Admin · Projekte</div>
          <div className="text-sm text-neutral-400">
            Stammdaten + Verantwortlicher Meister (Hauptstrahl) + Kalkulation je Bereich
          </div>
        </div>

        <button
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-orange-500"
          onClick={() => {
            p.setState((s) => createProject(s));
          }}
          type="button"
        >
          + Neues Projekt
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {projects.map((proj: any) => {
          const kMinMas = getKalkMinuten(proj, "maschine");
          const kMinBank = getKalkMinuten(proj, "bank");
          const kMinLack = getKalkMinuten(proj, "lack");
          const kMinMont = getKalkMinuten(proj, "montage");

          const kMinTotal = sumKalkMinuten(proj);
          const kHrsTotal = minutesToHours(kMinTotal);

          const fallbackHrs = clampNum(proj.kalkStunden ?? 0);
          const fallbackMin = Math.round(fallbackHrs * 60);

          const hasAreaCalc = kMinTotal > 0;
          const effectiveMin = hasAreaCalc ? kMinTotal : fallbackMin;

          const isArchiv = proj?.status === "archiv";

          return (
            <div
              key={proj.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {isArchiv ? (
                    <span className="text-neutral-400">Archiv {proj.archivJahr ?? ""}</span>
                  ) : proj.active !== false ? (
                    <span className="text-neutral-100">Aktiv</span>
                  ) : (
                    <span className="text-neutral-400">Inaktiv</span>
                  )}
                  <span className="text-neutral-500"> · </span>
                  <span className="text-neutral-100">{proj.id}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className={
                      "rounded-xl border px-3 py-2 text-sm " +
                      (proj.active !== false
                        ? "border-neutral-700 bg-neutral-950 hover:border-orange-500"
                        : "border-orange-500 bg-neutral-950 text-orange-300 hover:bg-orange-500 hover:text-neutral-950")
                    }
                    onClick={() =>
                      p.setState((s) => setProjectActive(s, proj.id, !(proj.active !== false)))
                    }
                    type="button"
                  >
                    {proj.active !== false ? "Deaktivieren" : "Aktivieren"}
                  </button>

                  {/* ✅ statt Löschen: Archivieren (nur nach Abschluss) */}
                  <button
                    className={
                      "rounded-xl border px-3 py-2 text-sm " +
                      (proj?.abschluss
                        ? "border-orange-500 bg-neutral-950 text-orange-300 hover:bg-orange-500 hover:text-neutral-950"
                        : "border-neutral-700 bg-neutral-950 text-neutral-500 cursor-not-allowed")
                    }
                    onClick={() => archiveProjekt(proj)}
                    type="button"
                    disabled={!proj?.abschluss}
                    title={proj?.abschluss ? "Projekt ins Archiv verschieben" : "Abschluss erforderlich"}
                  >
                    Ins Archiv
                  </button>
                  {canDelete ? (
  <button
    className="rounded-xl border border-red-700 bg-neutral-950 px-3 py-2 text-sm text-red-300 hover:bg-red-600 hover:text-neutral-950"
    onClick={() => {
      const ok = window.confirm(
        "Projekt wirklich LÖSCHEN?\n\n" +
          "⚠️ Das Projekt wird entfernt.\n" +
          "• Board-Zuordnung wird gelöscht\n" +
          "• Buchungen bleiben bestehen (Zeit-Historie)\n\n" +
          "Nur für Admin/Meister – Fehlerkorrekturen!"
      );
      if (!ok) return;

      p.setState((s) => deleteProject(s, String(proj.id)));
    }}
    type="button"
  >
    Löschen (Admin)
  </button>
) : null}


                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Projektname</div>
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                    value={proj.name}
                    onFocus={selectAllOnFocus}
                    onChange={(e) => {
                      const v = e.target.value;
                      p.setState((s) =>
                        upsertProject(s, {
                          ...proj,
                          name: v,
                        })
                      );
                    }}
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
                  <div className="text-xs text-neutral-400 mb-1">
                    Kalkulierte Stunden (Fallback)
                    <span className="text-neutral-500"> · wird genutzt wenn Bereich-Kalk = 0</span>
                  </div>
                  <input
  className={`w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm ${
    hasAreaCalc ? "opacity-60 cursor-not-allowed" : ""
  }`}
  type="number"
  min={0}
  max={99999}
  step="0.25"
  disabled={hasAreaCalc}
  title={
    hasAreaCalc
      ? "Wird automatisch aus der Summe der Bereiche berechnet."
      : "Fallback: manuell pflegbar, wenn keine Bereichskalkulation gesetzt ist."
  }
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
                    Effektiv (für Planung):{" "}
                    <span className="text-neutral-100 font-medium">{minutesToHours(effectiveMin)} h</span>
                    {hasAreaCalc ? (
                      <span className="text-neutral-500"> (aus Bereichen)</span>
                    ) : (
                      <span className="text-neutral-500"> (Fallback)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Kalkulation je Bereich */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-sm font-medium text-neutral-100">Kalkulation nach Bereich</div>
                <div className="text-xs text-neutral-500">
                  Du kannst Lack/Montage auch 0 lassen. Gesamt ergibt sich aus der Summe der Bereiche.
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                  {(
                    [
                      { key: "maschine", label: "Maschine" },
                      { key: "bank", label: "Bank" },
                      { key: "lack", label: "Lack" },
                      { key: "montage", label: "Montage" },
                    ] as Array<{ key: Bereich; label: string }>
                  ).map((x) => {
                    const curMin = getKalkMinuten(proj, x.key);
                    const curH = minutesToHours(curMin);

                    return (
                      <div key={x.key} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                        <div className="text-xs text-neutral-400 mb-1">{x.label} (h)</div>
                        <input
                          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                          type="number"
                          min={0}
                          step="0.25"
                          value={curH}
                          onFocus={selectAllOnFocus}
                          onChange={(e) => {
  const h = Number(e.target.value) || 0;

  // 1) Minuten im Bereich setzen
  let next = setKalkMinuten(proj, x.key, Math.round(h * 60));

  // 2) Summe der Bereiche → kalkStunden (Fallback)
  const totalMin = sumKalkMinuten(next);
  if (totalMin > 0) {
    next = {
      ...next,
      kalkStunden: minutesToHours(totalMin),
    };
  }

  p.setState((s) => upsertProject(s, next));
}}

                        />
                        <div className="mt-1 text-[11px] text-neutral-500">{curMin} min</div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-neutral-300">
                    Summe Bereiche:{" "}
                    <span className="text-neutral-100 font-semibold tabular-nums">{kHrsTotal} h</span>{" "}
                    <span className="text-neutral-500 tabular-nums">({kMinTotal} min)</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    Tipp: Unterschiedliche Sätze später möglich (Maschine/Bank/Lack/Montage).
                  </div>
                </div>
              </div>

              {/* Verantwortlichkeiten */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-sm font-medium text-neutral-100">Verantwortung (für Board-Hauptstrahl)</div>
                <div className="text-sm text-neutral-400">
                  Der Projektblock bleibt im Board beim verantwortlichen Meister. Buchungen anderer Mitarbeiter färben den
                  Block trotzdem (Ist-Zeit im Block).
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
                  Meisterfarbe: kommt automatisch aus der Meister-ID (hashbasiert). Optional können wir später ein fixes
                  Farb-Override pro Projekt ergänzen.
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
                  Tipp: Wenn ihr mehr Material braucht (Fehler/Nacharbeit), sieht man später in der Nachkalkulation die
                  Differenz Plan ↔ Ist.
                </div>
              </div>
            </div>
          );
        })}

        {projects.length === 0 && <div className="text-sm text-neutral-400">Noch keine Projekte angelegt.</div>}
      </div>
    </div>
  );
}
