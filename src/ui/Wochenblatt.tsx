import React, { useEffect, useMemo, useState } from "react";
import type { WochenTag } from "../core/workModel";
import { WOCHENTAGE } from "../core/workModel";

const tage: WochenTag[] = WOCHENTAGE;

type AbwesenheitsArt = "urlaub" | "krank" | "unbezahlt" | null;

export type Projekt = {
  id: string;
  name: string;
  farbe?: string;
};

export type Arbeitszeitmodell = {
  soll: Record<WochenTag, number>;
};

export type ArbeitEintrag = {
  id: string;
  projektId: string | null;
  titel: string;
  stunden: number;
};

export type Abwesenheit = {
  art: AbwesenheitsArt;
  stunden: number; // 0 = ganzer Tag
};

export type TagesBuchung = {
  arbeit: ArbeitEintrag[];
  abw: Abwesenheit;
  ueAbbauStunden: number;
};

export type WochenDaten = Record<WochenTag, TagesBuchung>;

export type WochenblattProps = {
  projekte: Projekt[];
  modell: Arbeitszeitmodell;
  initial?: WochenDaten;
  onChange?: (daten: WochenDaten) => void;
  className?: string;
};

const tage: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

const tagLabel: Record<WochenTag, string> = {
  mo: "Mo",
  di: "Di",
  mi: "Mi",
  do: "Do",
  fr: "Fr",
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clampNumber(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function defaultDay(): TagesBuchung {
  return {
    arbeit: [],
    abw: { art: null, stunden: 0 },
    ueAbbauStunden: 0,
  };
}

function defaultWeek(): WochenDaten {
  return {
    mo: defaultDay(),
    di: defaultDay(),
    mi: defaultDay(),
    do: defaultDay(),
    fr: defaultDay(),
  };
}

function sumArbeitStunden(arbeit: ArbeitEintrag[]) {
  return round2(arbeit.reduce((acc, a) => acc + (Number(a.stunden) || 0), 0));
}

function calcAbwReduktion(soll: number, abw: Abwesenheit) {
  if (!abw.art) return 0;
  if (abw.stunden <= 0) return soll;
  return clampNumber(abw.stunden, 0, soll);
}

function sumUrlaubstage(modellSoll: number, abw: Abwesenheit) {
  if (abw.art !== "urlaub") return 0;
  if (abw.stunden <= 0) return 1;
  if (modellSoll <= 0) return 0;
  return round2(clampNumber(abw.stunden / modellSoll, 0, 1));
}

export function Wochenblatt(props: WochenblattProps) {
  const { projekte, modell, initial, onChange, className } = props;

  const [daten, setDaten] = useState<WochenDaten>(initial ?? defaultWeek());

  useEffect(() => {
    onChange?.(daten);
  }, [daten, onChange]);

  function addArbeit(tag: WochenTag) {
    setDaten((prev) => {
      const next = structuredClone(prev) as WochenDaten;
      next[tag].arbeit.push({
        id: uid("arb"),
        projektId: projekte[0]?.id ?? null,
        titel: "",
        stunden: 0,
      });
      return next;
    });
  }

  function removeArbeit(tag: WochenTag, eintragId: string) {
    setDaten((prev) => {
      const next = structuredClone(prev) as WochenDaten;
      next[tag].arbeit = next[tag].arbeit.filter((x) => x.id !== eintragId);
      return next;
    });
  }

  function updateArbeit(tag: WochenTag, eintragId: string, patch: Partial<ArbeitEintrag>) {
    setDaten((prev) => {
      const next = structuredClone(prev) as WochenDaten;
      const idx = next[tag].arbeit.findIndex((x) => x.id === eintragId);
      if (idx >= 0) next[tag].arbeit[idx] = { ...next[tag].arbeit[idx], ...patch };
      return next;
    });
  }

  function updateAbwesenheit(tag: WochenTag, patch: Partial<Abwesenheit>) {
    setDaten((prev) => {
      const next = structuredClone(prev) as WochenDaten;
      next[tag].abw = { ...next[tag].abw, ...patch };
      if (!next[tag].abw.art) next[tag].abw.stunden = 0;
      return next;
    });
  }

  function updateUeAbbau(tag: WochenTag, stunden: number) {
    setDaten((prev) => {
      const next = structuredClone(prev) as WochenDaten;
      next[tag].ueAbbauStunden = clampNumber(Number(stunden) || 0, 0, 24);
      return next;
    });
  }

  const calc = useMemo(() => {
    const proTag = {} as Record<
      WochenTag,
      {
        soll: number;
        abwReduktion: number;
        effektivesSoll: number;
        arbeit: number;
        ueTag: number;
        kontoDelta: number;
        urlaubstage: number;
        ueAbbau: number;
      }
    >;

    let wArbeit = 0;
    let wSoll = 0;
    let wEffSoll = 0;
    let wUe = 0;
    let wKonto = 0;
    let wUrlaub = 0;
    let wUeAbbau = 0;

    for (const t of tage) {
      const soll = Number(modell.soll[t]) || 0;
      const arbeit = sumArbeitStunden(daten[t].arbeit);
      const abwReduktion = calcAbwReduktion(soll, daten[t].abw);
      const effektivesSoll = round2(Math.max(0, soll - abwReduktion));
      const ueTag = round2(arbeit - effektivesSoll);

      const ueAbbau = clampNumber(Number(daten[t].ueAbbauStunden) || 0, 0, 24);
      const kontoDelta = round2(ueTag - ueAbbau);

      const urlaubstage = sumUrlaubstage(soll, daten[t].abw);

      proTag[t] = {
        soll: round2(soll),
        abwReduktion: round2(abwReduktion),
        effektivesSoll,
        arbeit,
        ueTag,
        kontoDelta,
        urlaubstage,
        ueAbbau: round2(ueAbbau),
      };

      wArbeit += arbeit;
      wSoll += soll;
      wEffSoll += effektivesSoll;
      wUe += ueTag;
      wKonto += kontoDelta;
      wUrlaub += urlaubstage;
      wUeAbbau += ueAbbau;
    }

    return {
      proTag,
      sum: {
        arbeit: round2(wArbeit),
        soll: round2(wSoll),
        effSoll: round2(wEffSoll),
        ue: round2(wUe),
        konto: round2(wKonto),
        urlaub: round2(wUrlaub),
        ueAbbau: round2(wUeAbbau),
      },
    };
  }, [daten, modell]);

  const ui = {
    card: "rounded-2xl border border-neutral-200 bg-white shadow-sm",
    head: "flex items-center justify-between gap-3",
    h2: "text-lg font-semibold",
    btn: "rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50",
    btnDanger: "rounded-xl border border-red-300 bg-white px-3 py-2 text-sm hover:bg-red-50",
    input: "rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400",
    select: "rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400",
    label: "text-xs font-medium text-neutral-600",
    grid: "grid grid-cols-1 gap-3 md:grid-cols-5",
    day: "rounded-2xl border border-neutral-200 p-3",
    row: "grid grid-cols-12 gap-2 items-center",
    sub: "text-xs text-neutral-500",
    hr: "my-2 border-neutral-200",
    pill: "inline-flex items-center rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600",
    sumRow: "mt-3 grid grid-cols-2 gap-2 md:grid-cols-6",
    sumBox: "rounded-2xl border border-neutral-200 p-3",
    sumTitle: "text-xs text-neutral-500",
    sumValue: "text-base font-semibold",
  };

  return (
    <div className={className}>
      <div className={`${ui.card} p-4`}>
        <div className={ui.head}>
          <div>
            <div className={ui.h2}>Wochenblatt</div>
            <div className={ui.sub}>Mo–Fr, mehrere Einträge pro Tag, Abwesenheit & Überstunden</div>
          </div>

          <button className={ui.btn} onClick={() => setDaten(initial ?? defaultWeek())} type="button">
            Reset Woche
          </button>
        </div>

        <div className={`${ui.grid} mt-4`}>
          {tage.map((t) => {
            const day = daten[t];
            const c = calc.proTag[t];
            const soll = c.soll;

            return (
              <div key={t} className={ui.day}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{tagLabel[t]}</div>
                  <span className={ui.pill}>SOLL {soll}h</span>
                </div>

                <div className="mt-3">
                  <div className={ui.label}>Arbeitseinträge</div>

                  {day.arbeit.length === 0 ? (
                    <div className="text-sm text-neutral-500 mt-1">Keine Arbeitseinträge</div>
                  ) : (
                    <div className="flex flex-col gap-2 mt-2">
                      {day.arbeit.map((a) => (
                        <div key={a.id} className={ui.row}>
                          <div className="col-span-5">
                            <select
                              className={ui.select}
                              value={a.projektId ?? ""}
                              onChange={(e) => updateArbeit(t, a.id, { projektId: e.target.value || null })}
                            >
                              {projekte.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                              <option value="">(kein Projekt)</option>
                            </select>
                          </div>

                          <div className="col-span-4">
                            <input
                              className={ui.input}
                              value={a.titel}
                              onChange={(e) => updateArbeit(t, a.id, { titel: e.target.value })}
                              placeholder="Tätigkeit (frei)"
                            />
                          </div>

                          <div className="col-span-2">
                            <input
                              className={ui.input}
                              type="number"
                              step="0.25"
                              min={0}
                              max={24}
                              value={a.stunden}
                              onChange={(e) =>
                                updateArbeit(t, a.id, {
                                  stunden: clampNumber(Number(e.target.value) || 0, 0, 24),
                                })
                              }
                              placeholder="h"
                            />
                          </div>

                          <div className="col-span-1 flex justify-end">
                            <button className={ui.btnDanger} type="button" onClick={() => removeArbeit(t, a.id)}>
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button className={`${ui.btn} mt-2 w-full`} type="button" onClick={() => addArbeit(t)}>
                    + Arbeitseintrag
                  </button>
                </div>

                <hr className={ui.hr} />

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <div className={ui.label}>Abwesenheit</div>
                    <select
                      className={ui.select}
                      value={day.abw.art ?? ""}
                      onChange={(e) => updateAbwesenheit(t, { art: (e.target.value || null) as any })}
                    >
                      <option value="">Keine</option>
                      <option value="urlaub">Urlaub</option>
                      <option value="krank">Krank</option>
                      <option value="unbezahlt">Unbezahlt</option>
                    </select>
                  </div>

                  <div className="col-span-6">
                    <div className={ui.label}>Abwesenheitsstunden (0 = ganzer Tag)</div>
                    <input
                      className={ui.input}
                      type="number"
                      step="0.25"
                      min={0}
                      max={24}
                      value={day.abw.stunden}
                      onChange={(e) =>
                        updateAbwesenheit(t, { stunden: clampNumber(Number(e.target.value) || 0, 0, 24) })
                      }
                      disabled={!day.abw.art}
                      placeholder="0"
                    />
                  </div>

                  <div className="col-span-12">
                    <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
                      <span className={ui.pill}>eff. SOLL {c.effektivesSoll}h</span>
                      {day.abw.art === "urlaub" ? <span className={ui.pill}>Urlaub {c.urlaubstage} Tage</span> : null}
                      {c.abwReduktion > 0 ? <span className={ui.pill}>SOLL-Reduktion {c.abwReduktion}h</span> : null}
                    </div>
                  </div>
                </div>

                <hr className={ui.hr} />

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <div className={ui.label}>Überstundenabbau (h)</div>
                    <input
                      className={ui.input}
                      type="number"
                      step="0.25"
                      min={0}
                      max={24}
                      value={day.ueAbbauStunden}
                      onChange={(e) => updateUeAbbau(t, Number(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>

                  <div className="col-span-6">
                    <div className={ui.label}>Tagessumme Arbeit (h)</div>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                      {c.arbeit}h
                    </div>
                  </div>

                  <div className="col-span-12">
                    <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
                      <span className={ui.pill}>Ü(Tag) {c.ueTag}h</span>
                      <span className={ui.pill}>Konto ± {c.kontoDelta}h</span>
                      {c.ueAbbau > 0 ? <span className={ui.pill}>Ü-Abbau {c.ueAbbau}h</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={ui.sumRow}>
          <div className={ui.sumBox}>
            <div className={ui.sumTitle}>Woche Arbeit</div>
            <div className={ui.sumValue}>{calc.sum.arbeit}h</div>
          </div>
          <div className={ui.sumBox}>
            <div className={ui.sumTitle}>Woche eff. SOLL</div>
            <div className={ui.sumValue}>{calc.sum.effSoll}h</div>
          </div>
          <div className={ui.sumBox}>
            <div className={ui.sumTitle}>Woche Ü-Stunden</div>
            <div className={ui.sumValue}>{calc.sum.ue}h</div>
          </div>
          <div className={ui.sumBox}>
            <div className={ui.sumTitle}>Woche Ü-Abbau</div>
            <div className={ui.sumValue}>{calc.sum.ueAbbau}h</div>
          </div>
          <div className={ui.sumBox}>
            <div className={ui.sumTitle}>Woche Konto ±</div>
            <div className={ui.sumValue}>{calc.sum.konto}h</div>
          </div>
          <div className={ui.sumBox}>
            <div className={ui.sumTitle}>Woche Urlaub</div>
            <div className={ui.sumValue}>{calc.sum.urlaub} Tage</div>
          </div>
        </div>
      </div>
    </div>
  );
}
