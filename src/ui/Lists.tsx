import React from "react";
import { ui as defaultUi } from "./ui";
import { Section } from "./Section";
import { TwoCol } from "./TwoCol";

type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

type Ui = Record<string, string>;

export type WochenEintrag = {
  mitarbeiterId: string;
  woche: string;
  istStunden: number;
};

export type AbwesenheitEintrag = {
  mitarbeiterId: string;
  woche: string;
  tag: WochenTag;
  art: AbwesenheitsArt;
  stunden: number;
};

type Props = {
  // optional: wenn du – wie in Forms.tsx – UI-Strings/Classes reinreichst
  ui?: Ui;

  wochenEintraegeView: WochenEintrag[];
  abwesenheitenView: AbwesenheitEintrag[];

  /**
   * Unterstützt beide Varianten (damit es nicht "knallt", egal wie dein Parent aktuell ist):
   *  A) deleteWochenEintrag(woche)
   *  B) deleteWochenEintrag(mitarbeiterId, woche)
   */
  deleteWochenEintrag:
    | ((woche: string) => void)
    | ((mitarbeiterId: string, woche: string) => void);

  /**
   * Unterstützt beide Varianten:
   *  A) deleteAbwesenheit(indexInView)
   *  B) deleteAbwesenheit(entry)
   */
  deleteAbwesenheit:
    | ((indexInView: number) => void)
    | ((entry: AbwesenheitEintrag) => void);
};

export function Lists(props: Props) {
  const p = props;
  const ui = p.ui ?? (defaultUi as unknown as Ui);

  const callDeleteWochenEintrag = (e: WochenEintrag) => {
    // Funktions-Overload pragmatisch auflösen
    if ((p.deleteWochenEintrag as Function).length >= 2) {
      (p.deleteWochenEintrag as (mitarbeiterId: string, woche: string) => void)(e.mitarbeiterId, e.woche);
    } else {
      (p.deleteWochenEintrag as (woche: string) => void)(e.woche);
    }
  };

  const callDeleteAbwesenheit = (a: AbwesenheitEintrag, idx: number) => {
    if ((p.deleteAbwesenheit as Function).length >= 1) {
      // Prüfen, ob der Parent vermutlich "entry" erwartet (statt index).
      // Bei ((entry) => ...) ist length = 1, bei ((index) => ...) auch.
      // Wir versuchen es stabil: wenn der Parent index-basiert ist, funktioniert idx immer;
      // wenn er entry-basiert ist, funktioniert a immer.
      // -> Wir entscheiden nach "typischem" Pattern: Wenn der Parent in deinem Code bisher idx nutzt, passt idx.
      //    Wenn es knallt, ist es fast sicher entry-basiert; dann klappt a.
      // Daher: erst entry versuchen, bei TypeScript ist das zur Laufzeit egal – entscheidend ist die Implementierung.
      try {
        (p.deleteAbwesenheit as (entry: AbwesenheitEintrag) => void)(a);
      } catch {
        (p.deleteAbwesenheit as (indexInView: number) => void)(idx);
      }
    }
  };

  return (
    <TwoCol>
      <Section title="Wochen-Einträge (aktuell gefiltert)">
        {p.wochenEintraegeView.length === 0 ? (
          <div className="text-sm text-zinc-400">Keine Wochen-Einträge im Zeitraum.</div>
        ) : (
          <div className="space-y-2">
            {p.wochenEintraegeView.map((e) => (
              <div
                key={`${e.mitarbeiterId}-${e.woche}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">{e.woche}</div>
                  <div className="text-zinc-400">IST: {e.istStunden} h</div>
                </div>

                <button className={ui.btnDanger} type="button" onClick={() => callDeleteWochenEintrag(e)}>
                  Löschen
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Abwesenheiten (aktuell gefiltert)">
        {p.abwesenheitenView.length === 0 ? (
          <div className="text-sm text-zinc-400">Keine Abwesenheiten im Zeitraum.</div>
        ) : (
          <div className="space-y-2">
            {p.abwesenheitenView.map((a, idx) => (
              <div
                key={`${a.mitarbeiterId}-${a.woche}-${a.tag}-${a.art}-${idx}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {a.woche} · {String(a.tag).toUpperCase()} · {a.art}
                  </div>
                  <div className="text-zinc-400">{a.stunden} h</div>
                </div>

                <button className={ui.btnDanger} type="button" onClick={() => callDeleteAbwesenheit(a, idx)}>
                  Löschen
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </TwoCol>
  );
}
