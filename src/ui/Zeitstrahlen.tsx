import React, { useEffect, useMemo, useState } from "react";
import type { State, Arbeitsart } from "../core/timeStore";
import { setProjectActive } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";
import type { Bereich } from "../core/timeTypes";
import type { Settings } from "../core/settingsStore";
import {
  loadBoardIds,
  saveBoardIds,
  loadNachkalkIds,
  saveNachkalkIds,
  addProjectToBoard,
  removeProjectFromBoard,
  removeProjectFromNachkalk,
} from "../core/boardStore";

type Props = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  ms: MitarbeiterState;
  settings: Settings;
};

function minutesToHours(min: number): number {
  return (Number(min) || 0) / 60;
}
function fmt1(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.0";
  return x.toFixed(1);
}
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function bereichToArbeitsart(b: Bereich): Arbeitsart | null {
  const v = String(b);
  if (v === "maschine") return "maschine";
  if (v === "bank") return "bank";
  if (v === "lack") return "lack";
  if (v === "montage") return "montage";
  return null;
}

type IstMap = Record<string, Record<Arbeitsart, number>>;

function calcIstMinByProjektArbeitsart(state: State): IstMap {
  const out: IstMap = {};
  for (const b of state.buchungen ?? []) {
    if (!b || b.art !== "arbeit") continue;

    const pid = (b as any).projektId as string | undefined;
    if (!pid) continue;

    const aa = bereichToArbeitsart((b as any).bereich as Bereich);
    if (!aa) continue;

    const mins = Number((b as any).minuten) || 0;
    if (mins <= 0) continue;

    if (!out[pid]) out[pid] = { maschine: 0, bank: 0, lack: 0, montage: 0 };
    out[pid][aa] = (out[pid][aa] ?? 0) + mins;
  }
  return out;
}

function getSollMinFor(proj: any, aa: Arbeitsart): number {
  return Number(proj?.arbeitsarten?.[aa]?.kalkMinuten) || 0;
}

function Segment(p: { label: string; sollMin: number; istMin: number }) {
  const { sollMin, istMin } = p;

  // Kein Soll => neutral
  if ((Number(sollMin) || 0) <= 0) {
    return (
      <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1">
        <div className="text-[10px] text-neutral-500">{p.label}</div>
        <div className="mt-1 h-2 rounded bg-neutral-800" />
      </div>
    );
  }

  const ratio = clamp01((Number(istMin) || 0) / (Number(sollMin) || 1));
  const over = (Number(istMin) || 0) > (Number(sollMin) || 0);

  return (
    <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1">
      <div className="text-[10px] text-neutral-500">{p.label}</div>
      <div className="mt-1 h-2 w-full rounded bg-neutral-800 overflow-hidden">
        <div
          className={over ? "h-full bg-orange-500" : "h-full bg-neutral-200"}
          style={{ width: `${Math.max(3, Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function Zeitstrahlen(p: Props) {
  const allProjects = p.state.projects ?? [];
  const mitarbeiter = p.ms.mitarbeiter ?? [];

  // zentral persistiert
  const [boardIds, setBoardIds] = useState<string[]>(() => loadBoardIds());
  const [nachkalkIds, setNachkalkIds] = useState<string[]>(() => loadNachkalkIds());

  useEffect(() => saveBoardIds(boardIds), [boardIds]);
  useEffect(() => saveNachkalkIds(nachkalkIds), [nachkalkIds]);

  const [showPool, setShowPool] = useState<boolean>(true);
  const [poolQuery, setPoolQuery] = useState<string>("");
  const [poolShowNachkalk, setPoolShowNachkalk] = useState<boolean>(false);

  const istMap = useMemo(() => calcIstMinByProjektArbeitsart(p.state), [p.state]);

  function getMName(mid?: string): string {
    if (!mid) return "—";
    return mitarbeiter.find((m) => m.id === mid)?.name ?? mid;
  }

  const byId = useMemo(() => new Map(allProjects.map((x) => [x.id, x])), [allProjects]);

  const boardProjects = useMemo(() => {
    return boardIds.map((id) => byId.get(id)).filter(Boolean) as any[];
  }, [boardIds, byId]);

  const poolList = useMemo(() => {
    const q = poolQuery.trim().toLowerCase();

    const base = allProjects.filter((proj) => {
      if (boardIds.includes(proj.id)) return false;

      // Pool zeigt nur inaktive
      if (proj.active === true) return false;

      // Nachkalk optional ausblenden
      const isNachkalk = nachkalkIds.includes(proj.id);
      if (isNachkalk && !poolShowNachkalk) return false;

      return true;
    });

    const filtered = base.filter((proj) => {
      if (!q) return true;
      const hay = `${proj.name ?? ""} ${proj.id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    filtered.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    return filtered;
  }, [allProjects, boardIds, nachkalkIds, poolQuery, poolShowNachkalk]);

  function addToBoard(pid: string) {
    // Aufs Board: aktivieren + aus Nachkalk entfernen
    p.setState((s) => setProjectActive(s, pid, true));
    removeProjectFromNachkalk(pid);
    setNachkalkIds(loadNachkalkIds());

    addProjectToBoard(pid);
    setBoardIds(loadBoardIds());
  }

  function removeFromBoard(pid: string) {
    // Runternehmen: zurück in Pool (inaktiv). Fertig kommt aus Mitarbeiter-App.
    p.setState((s) => setProjectActive(s, pid, false));
    removeProjectFromBoard(pid);
    setBoardIds(loadBoardIds());

    // bleibt NICHT automatisch in Nachkalk
    removeProjectFromNachkalk(pid);
    setNachkalkIds(loadNachkalkIds());
  }

  const btn =
    "rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:text-orange-300";
  const btnActive =
    "rounded-xl border border-orange-500 bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">Zeitstrahl / Board-Zwischenstand</div>
            <div className="text-sm text-neutral-400">
              Board ist der Arbeitsfluss. Details steuerst du über ⚙ (Zahlen/Segmente).
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={showPool ? btnActive : btn} onClick={() => setShowPool((v) => !v)}>
              {showPool ? "Pool: An" : "Pool: Aus"}
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-neutral-400">
          Board: <span className="text-neutral-100">{boardProjects.length}</span> · Pool (inaktiv):{" "}
          <span className="text-neutral-100">{poolList.length}</span> · Nachkalk:{" "}
          <span className="text-neutral-100">{nachkalkIds.length}</span>
        </div>
      </div>

      {/* Pool */}
      {showPool && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Projekt-Pool (inaktiv)</div>
              <div className="text-sm text-neutral-400">„Aufs Board“ macht das Projekt aktiv.</div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs text-neutral-400 mb-1">Suche</div>
                <input
                  className="w-64 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Name oder ID…"
                  value={poolQuery}
                  onChange={(e) => setPoolQuery(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-300 pb-2">
                <input
                  type="checkbox"
                  className="accent-orange-500"
                  checked={poolShowNachkalk}
                  onChange={(e) => setPoolShowNachkalk(e.target.checked)}
                />
                Nachkalk anzeigen
              </label>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            {poolList.length === 0 && <div className="text-sm text-neutral-400">Keine Projekte im Pool.</div>}

            {poolList.map((proj: any) => {
              const isNachkalk = nachkalkIds.includes(proj.id);
              const ist = istMap[proj.id] ?? { maschine: 0, bank: 0, lack: 0, montage: 0 };

              const sollM = getSollMinFor(proj, "maschine");
              const sollB = getSollMinFor(proj, "bank");
              const sollL = getSollMinFor(proj, "lack");
              const sollMo = getSollMinFor(proj, "montage");

              const sumSoll = sollM + sollB + sollL + sollMo;
              const sumIst = (ist.maschine ?? 0) + (ist.bank ?? 0) + (ist.lack ?? 0) + (ist.montage ?? 0);
              const delta = sumSoll - sumIst;

              return (
                <div
                  key={proj.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-neutral-100 truncate">
                        {proj.name || "Ohne Name"} <span className="text-neutral-500">·</span>{" "}
                        <span className="text-neutral-400">{proj.id}</span>{" "}
                        {isNachkalk ? (
                          <span className="text-xs text-orange-300">· Nachkalk</span>
                        ) : (
                          <span className="text-xs text-neutral-500">· inaktiv</span>
                        )}
                      </div>

                      {p.settings.showDetailsInPool && (
                        <div className="text-xs text-neutral-500">
                          Führung: <span className="text-neutral-300">{getMName(proj.hauptdarstellerId)}</span> ·
                          Operativ: <span className="text-neutral-300">{getMName(proj.zugeordnetAnId)}</span>
                        </div>
                      )}
                    </div>

                    <button className={btn} onClick={() => addToBoard(proj.id)}>
                      Aufs Board
                    </button>
                  </div>

                  {p.settings.showArbeitsartIndicator && (
                    <div className="flex gap-2">
                      <Segment label="M" sollMin={sollM} istMin={ist.maschine ?? 0} />
                      <Segment label="B" sollMin={sollB} istMin={ist.bank ?? 0} />
                      <Segment label="L" sollMin={sollL} istMin={ist.lack ?? 0} />
                      <Segment label="Mo" sollMin={sollMo} istMin={ist.montage ?? 0} />
                    </div>
                  )}

                  {p.settings.showNumbersOnBoard && (
                    <div className="text-xs text-neutral-400 tabular-nums">
                      Summe: Soll {fmt1(minutesToHours(sumSoll))}h · Ist {fmt1(minutesToHours(sumIst))}h · Delta{" "}
                      <span className={delta < 0 ? "text-orange-300" : "text-neutral-200"}>
                        {fmt1(minutesToHours(delta))}h
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Board */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-lg font-semibold">Board (aktive Projekte)</div>
        <div className="text-sm text-neutral-400">„Runternehmen“ = zurück in Pool (inaktiv).</div>

        {boardProjects.length === 0 && <div className="mt-3 text-sm text-neutral-400">Board ist leer.</div>}

        {boardProjects.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2">
            {boardProjects.map((proj: any) => {
              const ist = istMap[proj.id] ?? { maschine: 0, bank: 0, lack: 0, montage: 0 };

              const sollM = getSollMinFor(proj, "maschine");
              const sollB = getSollMinFor(proj, "bank");
              const sollL = getSollMinFor(proj, "lack");
              const sollMo = getSollMinFor(proj, "montage");

              const sumSoll = sollM + sollB + sollL + sollMo;
              const sumIst = (ist.maschine ?? 0) + (ist.bank ?? 0) + (ist.lack ?? 0) + (ist.montage ?? 0);
              const delta = sumSoll - sumIst;

              return (
                <div
                  key={proj.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-neutral-100 truncate">
                        {proj.name || "Ohne Name"} <span className="text-neutral-500">·</span>{" "}
                        <span className="text-neutral-400">{proj.id}</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        Führung: <span className="text-neutral-300">{getMName(proj.hauptdarstellerId)}</span> ·
                        Operativ: <span className="text-neutral-300">{getMName(proj.zugeordnetAnId)}</span>
                      </div>
                    </div>

                    <button className={btn} onClick={() => removeFromBoard(proj.id)}>
                      Runternehmen
                    </button>
                  </div>

                  {p.settings.showArbeitsartIndicator && (
                    <div className="flex gap-2">
                      <Segment label="M" sollMin={sollM} istMin={ist.maschine ?? 0} />
                      <Segment label="B" sollMin={sollB} istMin={ist.bank ?? 0} />
                      <Segment label="L" sollMin={sollL} istMin={ist.lack ?? 0} />
                      <Segment label="Mo" sollMin={sollMo} istMin={ist.montage ?? 0} />
                    </div>
                  )}

                  {p.settings.showNumbersOnBoard && (
                    <div className="text-xs text-neutral-400 tabular-nums">
                      Summe: Soll {fmt1(minutesToHours(sumSoll))}h · Ist {fmt1(minutesToHours(sumIst))}h · Delta{" "}
                      <span className={delta < 0 ? "text-orange-300" : "text-neutral-200"}>
                        {fmt1(minutesToHours(delta))}h
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
