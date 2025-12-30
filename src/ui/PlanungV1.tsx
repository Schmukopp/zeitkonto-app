import React, { useMemo, useState } from "react";
import type { State, Planung } from "../core/timeStore";
import {
  formatHours,
  getPlanungenForProjektWeek,
  minutesToHours,
  upsertPlanung,
  deletePlanung,
} from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";
import { clampKW, clampYear, getIsoWeekYear } from "../core/planUtils";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;

  mitarbeiterState: MitarbeiterState;
};

function hoursToMinutes(h: number): number {
  const n = Number(h);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 60));
}

export default function PlanungV1(p: Props) {
  const projects = p.state.projects ?? [];
  const mitarbeiter = p.mitarbeiterState.mitarbeiter ?? [];

  const now = useMemo(() => getIsoWeekYear(new Date()), []);
  const [jahr, setJahr] = useState<number>(now.jahr);
  const [kw, setKw] = useState<number>(now.kw);

  // Eingabe pro Projekt (lokal, UX freundlich)
  const [selectedMitarbeiterByProjekt, setSelectedMitarbeiterByProjekt] = useState<Record<string, string>>({});
  const [hoursByProjekt, setHoursByProjekt] = useState<Record<string, string>>({});

  const y = clampYear(jahr);
  const w = clampKW(kw);

  const activeProjects = projects.filter((x) => x.active !== false);
  const inactiveProjects = projects.filter((x) => x.active === false);

  function getSelectedMId(projektId: string): string {
    const local = selectedMitarbeiterByProjekt[projektId];
    if (local && mitarbeiter.some((m) => m.id === local)) return local;
    return mitarbeiter[0]?.id ?? "";
  }

  function getHoursInput(projektId: string): string {
    const v = hoursByProjekt[projektId];
    return typeof v === "string" ? v : "";
  }

  function setHoursInput(projektId: string, v: string) {
    setHoursByProjekt((prev) => ({ ...prev, [projektId]: v }));
  }

  function onSetPlan(projektId: string) {
    const mid = getSelectedMId(projektId);
    if (!mid) return;

    const raw = getHoursInput(projektId);
    const h = Number(raw);
    const mins = hoursToMinutes(h);

    p.setState((s) =>
      upsertPlanung(s, {
        projektId,
        mitarbeiterId: mid,
        jahr: y,
        kw: w,
        minuten: mins,
      })
    );
  }

  const Card = ({ proj }: { proj: { id: string; name: string; active?: boolean; kalkStunden?: number } }) => {
    const list: Planung[] = getPlanungenForProjektWeek(p.state, proj.id, y, w);
    const sumMin = list.reduce((a, x) => a + (Number(x.minuten) || 0), 0);
    const sumH = minutesToHours(sumMin);

    const mid = getSelectedMId(proj.id);
    const hoursText = getHoursInput(proj.id);

    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-neutral-100">{proj.name || "Ohne Name"}</div>
            <div className="text-xs text-neutral-500">{proj.id}</div>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-400">Kalk (h)</div>
            <div className="text-sm tabular-nums text-neutral-100">{formatHours(Number(proj.kalkStunden) || 0)}</div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <div className="text-xs text-neutral-400 mb-1">Mitarbeiter</div>
              <select
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                value={mid}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedMitarbeiterByProjekt((prev) => ({ ...prev, [proj.id]: v }));
                }}
              >
                {mitarbeiter.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[160px]">
              <div className="text-xs text-neutral-400 mb-1">Geplante Stunden (diese KW)</div>
              <input
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                inputMode="decimal"
                placeholder="z.B. 8"
                value={hoursText}
                onChange={(e) => setHoursInput(proj.id, e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>

            <button
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm hover:border-orange-500"
              onClick={() => onSetPlan(proj.id)}
              disabled={!mid}
              title="Setzt/überschreibt die Planung für (Projekt, Mitarbeiter, Jahr, KW). 0 löscht."
            >
              Setzen
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-neutral-400">Summe geplant (Projekt, KW)</div>
            <div className="text-sm tabular-nums text-neutral-100">{formatHours(sumH)}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs text-neutral-400 mb-2">Diese KW geplant</div>

          <div className="flex flex-col gap-2">
            {list.map((pl) => {
              const m = mitarbeiter.find((x) => x.id === pl.mitarbeiterId);
              const h = minutesToHours(Number(pl.minuten) || 0);

              return (
                <div key={pl.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-100 truncate">
                      {m?.name ?? "Unbekannt"} <span className="text-neutral-500">·</span>{" "}
                      <span className="text-neutral-400">{pl.mitarbeiterId}</span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      KW {pl.kw}/{pl.jahr}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-sm tabular-nums text-neutral-100">{formatHours(h)}</div>
                    <button
                      className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm hover:border-orange-500"
                      onClick={() => p.setState((s) => deletePlanung(s, pl.id))}
                      title="Planung löschen"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              );
            })}

            {list.length === 0 && <div className="text-sm text-neutral-400">Noch keine Planung für diese KW.</div>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">Planung v1</div>
            <div className="text-sm text-neutral-400">
              Wochenbasierte Soll-Planung in Minuten. Präzise genug für spätere Zeitstrahlen.
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="text-xs text-neutral-400 mb-1">Jahr</div>
              <input
                className="w-28 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                type="number"
                min={2000}
                max={2100}
                value={jahr}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setJahr(clampYear(Number(e.target.value) || now.jahr))}
              />
            </div>

            <div>
              <div className="text-xs text-neutral-400 mb-1">KW</div>
              <input
                className="w-24 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                type="number"
                min={1}
                max={53}
                value={kw}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setKw(clampKW(Number(e.target.value) || now.kw))}
              />
            </div>

            <div className="text-sm text-neutral-400 pb-2">
              aktiv: <span className="text-neutral-100">{activeProjects.length}</span> · inaktiv:{" "}
              <span className="text-neutral-100">{inactiveProjects.length}</span>
            </div>
          </div>
        </div>
      </div>

      {activeProjects.map((proj) => (
        <Card key={proj.id} proj={proj as any} />
      ))}

      {inactiveProjects.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-lg font-semibold">Inaktive Projekte</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            {inactiveProjects.map((proj) => (
              <Card key={proj.id} proj={proj as any} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
