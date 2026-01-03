import React, { useMemo, useState } from "react";
import type { State } from "../core/timeStore";
import { setProjectActive, upsertProject } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
  mitarbeiterId: string;
  mitarbeiterName: string;
  wertZielEurH: number; // aus Settings
};

type AbschlussArt = "fertigung" | "montage" | "abgeholt";

function fmtName(v: unknown): string {
  const s = String(v ?? "").trim();
  return s || "Ohne Name";
}

function minutesToHours(min: number): number {
  return (Number(min) || 0) / 60;
}

function fmt1(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.0";
  return x.toFixed(1);
}

function fmtMoney(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

type IstMinMap = Record<string, number>;
function calcIstMinTotalByProjekt(state: State): IstMinMap {
  const out: IstMinMap = {};
  for (const b of state.buchungen ?? []) {
    if (!b || (b as any).art !== "arbeit") continue;
    const pid = (b as any).projektId as string | undefined;
    if (!pid) continue;
    const mins = Number((b as any).minuten) || 0;
    if (mins <= 0) continue;
    out[pid] = (out[pid] ?? 0) + mins;
  }
  return out;
}

function calcSollMinTotal(proj: any): number {
  const a = proj?.arbeitsarten;
  if (a && typeof a === "object") {
    const sum =
      (Number(a?.maschine?.kalkMinuten) || 0) +
      (Number(a?.bank?.kalkMinuten) || 0) +
      (Number(a?.lack?.kalkMinuten) || 0) +
      (Number(a?.montage?.kalkMinuten) || 0);
    if (sum > 0) return sum;
  }
  const h = Number(proj?.kalkStunden) || 0;
  return Math.max(0, Math.round(h * 60));
}

export default function ProjektAbschluss(p: Props) {
  const [abschlussArt, setAbschlussArt] = useState<AbschlussArt>("fertigung");
  const [note, setNote] = useState<string>("");

  const projects = p.state.projects ?? [];
  const byId = useMemo(() => new Map(projects.map((x: any) => [String(x.id), x])), [projects]);

  const istTotal = useMemo(() => calcIstMinTotalByProjekt(p.state), [p.state]);

  // ✅ Single Source of Truth: Listen direkt aus timeStore ableiten
  const boardProjects = useMemo(() => {
    return projects.filter((pr: any) => pr?.status !== "archiv" && pr?.active !== false);
  }, [projects]);

  const nachkalkProjects = useMemo(() => {
    // "fertig, aber noch nicht archiviert"
    return projects.filter((pr: any) => pr?.status !== "archiv" && pr?.active === false);
  }, [projects]);

  const boardMine = useMemo(() => {
    const mine = boardProjects.filter((x: any) => x?.zugeordnetAnId === p.mitarbeiterId);
    const other = boardProjects.filter((x: any) => x?.zugeordnetAnId !== p.mitarbeiterId);
    return { mine, other };
  }, [boardProjects, p.mitarbeiterId]);

  const [selectedId, setSelectedId] = useState<string>(() => {
    return String(boardMine.mine[0]?.id ?? boardMine.other[0]?.id ?? "");
  });

  const selected = selectedId ? byId.get(String(selectedId)) : undefined;

  const ziel = Number(p.wertZielEurH) || 0;

  const selectedSollMin = selected ? calcSollMinTotal(selected) : 0;
  const selectedIstMin = selectedId ? (istTotal[String(selectedId)] ?? 0) : 0;
  const selectedDeltaMin = selectedSollMin - selectedIstMin;

  function finishSelected() {
    if (!selectedId) return;
    const proj = byId.get(String(selectedId)) as any;
    if (!proj) return;

    const now = Date.now();

    // Istwerte aus Projekt (werden im Nachkalk-Bereich eingetragen)
    const istVk = Number(proj.istNettoVkEur) || 0;
    const istMat = Number(proj.istMaterialEur) || 0;

    const istMinuten = Number(selectedIstMin) || 0;
    const istH = minutesToHours(istMinuten);

    const wertGesamt = Math.max(0, istVk) - Math.max(0, istMat);
    const wertProStd = istH > 0 ? wertGesamt / istH : 0;

    const sollMinuten = Number(selectedSollMin) || 0;
    const ueberzugMinuten = Math.max(0, istMinuten - sollMinuten);

    // ✅ Abschlussdaten dauerhaft speichern (Basis Archiv + Statistik)
    p.setState((s) =>
      upsertProject(s, {
        ...proj,
        abschluss: {
          abgeschlossenAt: now,
          nettoVkIstEur: istVk,
          materialIstEur: istMat,
          istMinuten: istMinuten,
          wertschoepfungEurProStd: istH > 0 ? wertProStd : 0,
          ueberzugMinuten: ueberzugMinuten > 0 ? ueberzugMinuten : 0,
          // note & art optional später in Datenvertrag aufnehmen
        },
      } as any)
    );

    // ✅ "fertig" = active false (aber noch NICHT archiviert)
    p.setState((s) => setProjectActive(s, String(selectedId), false));

    setNote("");

    // ✅ neues Projekt wählen (aus den aktuellen boardProjects)
    const next =
      boardProjects.find((x: any) => x?.zugeordnetAnId === p.mitarbeiterId)?.id ??
      boardProjects[0]?.id ??
      "";
    setSelectedId(String(next));
  }

  function updateIst(pid: string, patch: Partial<{ istNettoVkEur: number; istMaterialEur: number }>) {
    const proj = byId.get(String(pid)) as any;
    if (!proj) return;
    p.setState((s) =>
      upsertProject(s, {
        ...proj,
        istNettoVkEur: patch.istNettoVkEur ?? proj.istNettoVkEur ?? 0,
        istMaterialEur: patch.istMaterialEur ?? proj.istMaterialEur ?? 0,
      })
    );
  }

  const btn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";
  const btnActive =
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950";
  const btnDanger =
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">Projektabschluss</div>
            <div className="text-sm text-neutral-400">
              Abschluss entscheidet der Mitarbeiter. Nachkalkulation erfordert Ist-Umsatz & Ist-Material.
            </div>
          </div>
          <div className="text-sm text-neutral-300">
            Mitarbeiter: <span className="text-neutral-100 font-medium">{p.mitarbeiterName}</span>
          </div>
        </div>
        <div className="mt-2 text-sm text-neutral-400">
          Wertschöpfungsziel: <span className="text-neutral-100">{Number(ziel).toFixed(0)} €/h</span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-lg font-semibold">Projekt wählen (aktiv, nicht archiviert)</div>
        <div className="text-sm text-neutral-400">
          Aktiv: <span className="text-neutral-100">{boardProjects.length}</span> · Nachkalkulation:{" "}
          <span className="text-neutral-100">{nachkalkProjects.length}</span>
        </div>

        {boardProjects.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-400">Es sind keine aktiven Projekte vorhanden.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
              <div className="text-sm font-medium text-neutral-100 mb-2">Deine Projekte (zugeordnet)</div>

              {boardMine.mine.length === 0 ? (
                <div className="text-sm text-neutral-400">Keine aktiven Projekte sind dir operativ zugeordnet.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {boardMine.mine.map((proj: any) => (
                    <label
                      key={String(proj.id)}
                      className={
                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 cursor-pointer " +
                        (String(selectedId) === String(proj.id)
                          ? "border-orange-500 bg-neutral-950"
                          : "border-neutral-800 bg-neutral-900 hover:border-neutral-700")
                      }
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-neutral-100 truncate">
                          {fmtName(proj.name)} <span className="text-neutral-500">·</span>{" "}
                          <span className="text-neutral-400">{String(proj.id)}</span>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="proj"
                        checked={String(selectedId) === String(proj.id)}
                        onChange={() => setSelectedId(String(proj.id))}
                        className="accent-orange-500"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
              <div className="text-sm font-medium text-neutral-100 mb-2">Weitere aktive Projekte</div>

              {boardMine.other.length === 0 ? (
                <div className="text-sm text-neutral-400">Keine weiteren aktiven Projekte vorhanden.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {boardMine.other.map((proj: any) => (
                    <label
                      key={String(proj.id)}
                      className={
                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 cursor-pointer " +
                        (String(selectedId) === String(proj.id)
                          ? "border-orange-500 bg-neutral-950"
                          : "border-neutral-800 bg-neutral-900 hover:border-neutral-700")
                      }
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-neutral-100 truncate">
                          {fmtName(proj.name)} <span className="text-neutral-500">·</span>{" "}
                          <span className="text-neutral-400">{String(proj.id)}</span>
                        </div>
                        <div className="text-xs text-neutral-500">
                          Zugeordnet: <span className="text-neutral-300">{fmtName(proj.zugeordnetAnId ?? "—")}</span>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="proj"
                        checked={String(selectedId) === String(proj.id)}
                        onChange={() => setSelectedId(String(proj.id))}
                        className="accent-orange-500"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-lg font-semibold">Abschluss</div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
          <button type="button" className={abschlussArt === "fertigung" ? btnActive : btn} onClick={() => setAbschlussArt("fertigung")} disabled={!selectedId}>
            Fertigung fertig
          </button>
          <button type="button" className={abschlussArt === "montage" ? btnActive : btn} onClick={() => setAbschlussArt("montage")} disabled={!selectedId}>
            Montage fertig
          </button>
          <button type="button" className={abschlussArt === "abgeholt" ? btnActive : btn} onClick={() => setAbschlussArt("abgeholt")} disabled={!selectedId}>
            Abgeholt / geliefert
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-sm font-medium text-neutral-100">Soll / Ist / Delta (Zeit)</div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm tabular-nums">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-xs text-neutral-500">Soll</div>
              <div className="text-lg text-neutral-100">{fmt1(minutesToHours(selectedSollMin))}h</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-xs text-neutral-500">Ist</div>
              <div className="text-lg text-neutral-100">{fmt1(minutesToHours(selectedIstMin))}h</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-xs text-neutral-500">Delta (Soll − Ist)</div>
              <div className={"text-lg " + (selectedDeltaMin < 0 ? "text-orange-300" : "text-neutral-100")}>
                {fmt1(minutesToHours(selectedDeltaMin))}h
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Negatives Delta bedeutet Überzug. Das ist erlaubt und wichtig für die Nachkalkulation.
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs text-neutral-400 mb-1">Notiz (optional)</div>
          <input
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            placeholder="z. B. ‚Abgeholt durch Kunde‘ / ‚Montage extern‘ …"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!selectedId}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-neutral-400">
            Ausgewählt:{" "}
            <span className="text-neutral-100">
              {selected ? `${fmtName((selected as any).name)} (${String((selected as any).id)})` : "—"}
            </span>
          </div>

          <button className={btnDanger} onClick={finishSelected} disabled={!selectedId}>
            Fertig / Abgeholt abschließen
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-lg font-semibold">Nachkalkulation</div>
        <div className="text-sm text-neutral-400">
          Für Ergebnis: Ist Netto-VK und Ist Material eintragen. Planwerte (falls gepflegt) werden zum Vergleich angezeigt.
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {nachkalkProjects.length === 0 ? (
            <div className="text-sm text-neutral-400">Noch keine Projekte in Nachkalkulation.</div>
          ) : (
            nachkalkProjects.map((proj: any) => {
              const pid = String(proj.id);

              const istMin = istTotal[pid] ?? 0;
              const istH = minutesToHours(istMin);

              const istVk = Number(proj.istNettoVkEur) || 0;
              const istMat = Number(proj.istMaterialEur) || 0;

              const planVk = Number(proj.planNettoVkEur) || 0;
              const planMat = Number(proj.planMaterialEur) || 0;

              const hatIst = istVk > 0 || istMat > 0;
              const wertGesamt = Math.max(0, istVk) - Math.max(0, istMat);
              const wertProStd = istH > 0 ? wertGesamt / istH : 0;

              const ok = hatIst && istH > 0 && wertProStd >= ziel;

              return (
                <div key={pid} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-neutral-100 truncate">
                        {fmtName(proj.name)} <span className="text-neutral-500">·</span>{" "}
                        <span className="text-neutral-400">{pid}</span>{" "}
                        {!hatIst ? <span className="text-xs text-orange-300">· Nachkalk offen</span> : <span className="text-xs text-neutral-500">· erfasst</span>}
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-neutral-400 mb-1">Ist Netto-VK €</div>
                          <input
                            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                            type="number"
                            min={0}
                            step="1"
                            value={istVk}
                            onChange={(e) => updateIst(pid, { istNettoVkEur: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-400 mb-1">Ist Material €</div>
                          <input
                            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                            type="number"
                            min={0}
                            step="1"
                            value={istMat}
                            onChange={(e) => updateIst(pid, { istMaterialEur: Number(e.target.value) || 0 })}
                          />
                        </div>
                      </div>

                      {(planVk > 0 || planMat > 0) && (
                        <div className="mt-2 text-xs text-neutral-500">
                          Plan: VK {fmtMoney(planVk)} € · Material {fmtMoney(planMat)} € · Abweichung Material{" "}
                          <span className={(istMat - planMat) > 0 ? "text-orange-300" : "text-neutral-300"}>
                            {fmtMoney(istMat - planMat)} €
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="text-sm tabular-nums text-neutral-300">
                      <div>
                        Wertschöpfung: <span className="text-neutral-100">{fmtMoney(wertGesamt)} €</span>
                      </div>
                      <div>
                        Ist-Zeit: <span className="text-neutral-100">{fmt1(istH)} h</span>
                      </div>
                      <div>
                        Wert/Std:{" "}
                        <span className={hatIst && istH > 0 ? (ok ? "text-neutral-100" : "text-orange-300") : "text-neutral-500"}>
                          {hatIst && istH > 0 ? `${fmtMoney(wertProStd)} €/h` : "—"}
                        </span>{" "}
                        <span className="text-xs text-neutral-500">· Ziel {Number(ziel).toFixed(0)} €/h</span>
                      </div>
                    </div>
                  </div>

                  {!hatIst && (
                    <div className="mt-2 text-xs text-orange-300">
                      Bitte Ist-Netto-VK und Ist-Material eintragen, dann ergibt die Nachkalkulation einen sinnvollen Wert.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
