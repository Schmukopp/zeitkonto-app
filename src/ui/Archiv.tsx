// src/ui/Archiv.tsx
import React, { useMemo } from "react";
import type { State } from "../core/timeStore";
import type { MitarbeiterState } from "../core/mitarbeiterStore";

function fmtName(v: unknown): string {
  const s = String(v ?? "").trim();
  return s || "Ohne Name";
}

function fmtDate(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE");
}

function minutesToHours(min?: number): string {
  const m = Number(min) || 0;
  const h = m / 60;
  return Number.isFinite(h) ? h.toFixed(1) : "0.0";
}

function fmtMoney(n?: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

type Props = {
  state: State;
  ms: MitarbeiterState;
};

type BereichKey = "maschine" | "bank" | "lack" | "montage";
type IstByMitarbeiter = Record<string, Record<BereichKey, number>>;

function isBereichKey(v: any): v is BereichKey {
  return v === "maschine" || v === "bank" || v === "lack" || v === "montage";
}

function calcIstMinByProjekt(state: State, projektId: string): IstByMitarbeiter {
  const out: IstByMitarbeiter = {};

  const arr: any[] = Array.isArray((state as any)?.buchungen) ? ((state as any).buchungen as any[]) : [];
  for (const b of arr) {
    if (!b || b.art !== "arbeit") continue;

    const pid = String(b.projektId ?? "");
    if (!pid || pid !== String(projektId)) continue;

    const mid = String(b.mitarbeiterId ?? "");
    if (!mid) continue;

    const bereichRaw = b.bereich;
    if (!isBereichKey(bereichRaw)) continue;

    const mins = Number(b.minuten) || 0;
    if (mins <= 0) continue;

    if (!out[mid]) out[mid] = { maschine: 0, bank: 0, lack: 0, montage: 0 };
    out[mid][bereichRaw] += mins;
  }

  return out;
}

function sumBereiche(mins: Record<BereichKey, number>): number {
  return (mins.maschine || 0) + (mins.bank || 0) + (mins.lack || 0) + (mins.montage || 0);
}

export default function Archiv(p: Props) {
  const mitarbeiterNameById = useMemo(() => {
    const m = new Map<string, string>();

    // 1) Primär: Namen aus Buchungen (historisch korrekt)
    const arr: any[] = Array.isArray((p.state as any)?.buchungen) ? ((p.state as any).buchungen as any[]) : [];
    for (const b of arr) {
      if (!b || b.art !== "arbeit") continue;
      const id = String(b.mitarbeiterId ?? "");
      const name = String(b.mitarbeiterName ?? "");
      if (id && name.trim()) m.set(id, name.trim());
    }

    // 2) Fallback: aktueller Mitarbeiterstamm
    const list: any[] = Array.isArray((p.ms as any)?.mitarbeiter) ? ((p.ms as any).mitarbeiter as any[]) : [];
    for (const x of list) {
      const id = String(x?.id ?? "");
      const name = String(x?.name ?? "");
      if (id && name.trim() && !m.has(id)) m.set(id, name.trim());
    }

    return m;
  }, [p.state, p.ms]);

  const archived = useMemo(() => {
    const list = (p.state.projects ?? []).filter((pr: any) => pr?.status === "archiv");
    const groups = new Map<number, any[]>();

    for (const pr of list) {
      const year =
        Number(pr?.archivJahr) ||
        new Date(Number(pr?.archiviertAt) || Number(pr?.abschluss?.abgeschlossenAt) || Date.now()).getFullYear();

      const y = Number.isFinite(year) ? year : new Date().getFullYear();
      groups.set(y, [...(groups.get(y) ?? []), pr]);
    }

    const years = Array.from(groups.keys()).sort((a, b) => b - a);
    return years.map((y) => {
      const items = (groups.get(y) ?? []).slice().sort((a: any, b: any) => {
        const ta = Number(a?.abschluss?.abgeschlossenAt) || Number(a?.archiviertAt) || 0;
        const tb = Number(b?.abschluss?.abgeschlossenAt) || Number(b?.archiviertAt) || 0;
        return tb - ta;
      });
      return { year: y, items };
    });
  }, [p.state.projects]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-2xl font-semibold">Archiv</div>
        <div className="text-sm text-neutral-400">
          Archivierte Projekte (nach Jahr gruppiert). Buchungen bleiben erhalten; Grundlage für Statistik.
        </div>
      </div>

      {archived.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
          Noch keine Projekte im Archiv.
        </div>
      ) : (
        archived.map((g) => (
          <div key={String(g.year)} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-lg font-semibold">Archiv {g.year}</div>
              <div className="text-sm text-neutral-400">
                Projekte: <span className="text-neutral-100">{g.items.length}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              {g.items.map((proj: any) => {
                const ab = proj?.abschluss;
                const abgeschlossenAt = Number(ab?.abgeschlossenAt) || undefined;

                const istMin = Number(ab?.istMinuten) || 0;
                const ueberzugMin = Number(ab?.ueberzugMinuten) || 0;

                const vkIst = Number(ab?.nettoVkIstEur ?? proj?.istNettoVkEur) || 0;
                const matIst = Number(ab?.materialIstEur ?? proj?.istMaterialEur) || 0;

                const wph = Number(ab?.wertschoepfungEurProStd) || 0;

                return (
                  <div key={String(proj.id)} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-neutral-100 truncate">
                          {fmtName(proj.name)} <span className="text-neutral-500">·</span>{" "}
                          <span className="text-neutral-400">{String(proj.id)}</span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Abgeschlossen: <span className="text-neutral-300">{fmtDate(abgeschlossenAt)}</span>
                          <span className="text-neutral-600"> · </span>
                          Archiviert:{" "}
                          <span className="text-neutral-300">{fmtDate(Number(proj?.archiviertAt) || undefined)}</span>
                        </div>
                      </div>

                      <div className="text-sm tabular-nums text-neutral-300">
                        <div>
                          Ist-Zeit: <span className="text-neutral-100">{minutesToHours(istMin)} h</span>
                        </div>
                        <div>
                          Überzug: <span className="text-neutral-100">{minutesToHours(ueberzugMin)} h</span>{" "}
                          <span className="text-xs text-neutral-500">({ueberzugMin} min)</span>
                        </div>
                        <div>
                          Wert/Std:{" "}
                          <span className={wph > 0 ? "text-neutral-100" : "text-neutral-500"}>
                            {wph > 0 ? `${fmtMoney(wph)} €/h` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm tabular-nums">
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                        <div className="text-xs text-neutral-500">Ist Netto-VK</div>
                        <div className="text-neutral-100">{fmtMoney(vkIst)} €</div>
                      </div>
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                        <div className="text-xs text-neutral-500">Ist Material</div>
                        <div className="text-neutral-100">{fmtMoney(matIst)} €</div>
                      </div>
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                        <div className="text-xs text-neutral-500">Wertschöpfung</div>
                        <div className="text-neutral-100">{fmtMoney(Math.max(0, vkIst) - Math.max(0, matIst))} €</div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-neutral-500">
                      Zugeordnet (operativ):{" "}
                      <span className="text-neutral-300">{fmtName(proj?.zugeordnetAnId ?? "—")}</span>
                    </div>

                    {(() => {
                      const byMitarbeiter = calcIstMinByProjekt(p.state, String(proj.id));
                      const entries = Object.entries(byMitarbeiter).map(([mid, mins]) => ({
                        mid,
                        mins,
                        sumMin: sumBereiche(mins),
                      }));

                      entries.sort((a, b) => b.sumMin - a.sumMin);

                      if (entries.length === 0) {
                        return (
                          <div className="mt-2 text-xs text-neutral-600">
                            Keine Arbeitsbuchungen für dieses Projekt gefunden.
                          </div>
                        );
                      }

                      return (
                        <details className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                          <summary className="cursor-pointer select-none text-sm text-neutral-200">
                            Details: IST-Zeit je Mitarbeiter & Bereich
                            <span className="text-neutral-500"> (aufklappen)</span>
                          </summary>

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <div className="hidden md:grid md:grid-cols-6 gap-2 px-1 text-xs text-neutral-500">
                              <div>Mitarbeiter</div>
                              <div>Maschine</div>
                              <div>Bank</div>
                              <div>Lack</div>
                              <div>Montage</div>
                              <div>Summe</div>
                            </div>
                            {(() => {
  const sum = entries.reduce(
    (acc, e) => {
      acc.maschine += e.mins.maschine || 0;
      acc.bank += e.mins.bank || 0;
      acc.lack += e.mins.lack || 0;
      acc.montage += e.mins.montage || 0;
      acc.total += e.sumMin || 0;
      return acc;
    },
    { maschine: 0, bank: 0, lack: 0, montage: 0, total: 0 }
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm font-semibold tabular-nums">
      <div>Summe</div>
      <div>{minutesToHours(sum.maschine)} h</div>
      <div>{minutesToHours(sum.bank)} h</div>
      <div>{minutesToHours(sum.lack)} h</div>
      <div>{minutesToHours(sum.montage)} h</div>
      <div>{minutesToHours(sum.total)} h</div>
    </div>
  );
})()}

                            {entries.map((e) => (
                              <div
                                key={e.mid}
                                className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm tabular-nums"
                              >
                                <div className="truncate">{mitarbeiterNameById.get(e.mid) ?? e.mid}</div>
                                <div>{minutesToHours(e.mins.maschine)} h</div>
                                <div>{minutesToHours(e.mins.bank)} h</div>
                                <div>{minutesToHours(e.mins.lack)} h</div>
                                <div>{minutesToHours(e.mins.montage)} h</div>
                                <div>{minutesToHours(e.sumMin)} h</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
