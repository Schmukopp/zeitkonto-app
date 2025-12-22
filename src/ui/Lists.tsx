import { ui } from "./ui";
import { Section } from "./Section";
import { TwoCol } from "./TwoCol";

type WochenEintrag = {
  mitarbeiterId: string;
  woche: string;
  istStunden: number;
};

type AbwesenheitEintrag = {
  mitarbeiterId: string;
  woche: string;
  tag: "mo" | "di" | "mi" | "do" | "fr";
  art: "urlaub" | "krank" | "feiertag" | "unbezahlt";
  stunden: number;
};

export function Lists(props: {
  wochenEintraegeView: WochenEintrag[];
  abwesenheitenView: AbwesenheitEintrag[];

  deleteWochenEintrag: (woche: string) => void;
  deleteAbwesenheit: (indexInView: number) => void;
}) {
  const p = props;

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

                <button className={ui.btnDanger} type="button" onClick={() => p.deleteWochenEintrag(e.woche)}>
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

                <button className={ui.btnDanger} type="button" onClick={() => p.deleteAbwesenheit(idx)}>
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
