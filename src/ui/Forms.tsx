import { ui } from "./ui";
import { Section } from "./Section";

import { TwoCol } from "./TwoCol";

type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];
type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

export function EntryAndAbsenceForms(props: {
  // Wochen-Eintrag
  newWoche: string;
  setNewWoche: (v: string) => void;
  normalizedNewWoche: string | null;
  willOverwrite: boolean;
  newIst: number;
  setNewIst: (v: number) => void;
  istInvalid: boolean;
  normalizeIsoWeek: (v: string) => string | null;
  addWochenEintrag: () => void;

  // Abwesenheit
  abwWoche: string;
  setAbwWoche: (v: string) => void;
  abwTag: WochenTag;
  setAbwTag: (v: WochenTag) => void;
  abwArt: AbwesenheitsArt;
  setAbwArt: (v: AbwesenheitsArt) => void;
  abwStunden: number;
  setAbwStunden: (v: number) => void;
  addAbwesenheit: () => void;
  abwError: string | null;
}) {
  const p = props;

  return (
    <TwoCol>
      <Section title="Wochen-Eintrag hinzufügen">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            p.addWochenEintrag();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Woche (ISO)</label>
            <input
              className={
                ui.input +
                " w-36 " +
                (p.newWoche.trim().length > 0 && !p.normalizedNewWoche ? "border-red-500" : "")
              }
              value={p.newWoche}
              onChange={(e) => p.setNewWoche(e.target.value)}
              onBlur={() => {
                const n = p.normalizeIsoWeek(p.newWoche);
                if (n) p.setNewWoche(n);
              }}
              placeholder="2025-W50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>IST-Stunden</label>
            <input
              className={ui.numberInput + " w-28 " + (p.istInvalid ? "border-red-500" : "")}
              type="number"
              step="0.5"
              min={0}
              value={Number.isFinite(p.newIst) ? p.newIst : 0}
              onChange={(e) => p.setNewIst(Number(e.target.value))}
            />
            {p.istInvalid ? <div className="text-xs text-red-300">Bitte Zahl ≥ 0.</div> : null}
          </div>

          <button className={ui.btnPrimary} type="submit" disabled={!p.normalizedNewWoche || p.istInvalid}>
            Hinzufügen
          </button>
        </form>

        <div className={ui.hint}>
          {p.normalizedNewWoche ? (
            p.willOverwrite ? (
              <span className="text-amber-300">Achtung: Eintrag existiert – wird überschrieben.</span>
            ) : (
              <span className="text-emerald-300">Neuer Eintrag – wird hinzugefügt.</span>
            )
          ) : (
            <span>Format: YYYY-WNN (z.B. 2025-W05)</span>
          )}
        </div>
      </Section>

      <Section title="Abwesenheit hinzufügen">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Woche</label>
            <input
              className={ui.input + " w-36"}
              value={p.abwWoche}
              onChange={(e) => p.setAbwWoche(e.target.value)}
              onBlur={() => {
                const n = p.normalizeIsoWeek(p.abwWoche);
                if (n) p.setAbwWoche(n);
              }}
              placeholder="2025-W50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Tag</label>
            <select className={ui.select} value={p.abwTag} onChange={(e) => p.setAbwTag(e.target.value as WochenTag)}>
              {WOCHENTAGE.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Art</label>
            <select
              className={ui.select}
              value={p.abwArt}
              onChange={(e) => p.setAbwArt(e.target.value as AbwesenheitsArt)}
            >
              <option value="urlaub">urlaub</option>
              <option value="krank">krank</option>
              <option value="feiertag">feiertag</option>
              <option value="unbezahlt">unbezahlt</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Stunden</label>
            <input
              className={ui.numberInput + " w-28"}
              type="number"
              min={0}
              step="0.5"
              value={p.abwStunden}
              onChange={(e) => p.setAbwStunden(Number(e.target.value))}
            />
          </div>

          <button className={ui.btnPrimary} type="button" onClick={p.addAbwesenheit}>
            Hinzufügen
          </button>
        </div>

        {p.abwError ? <div className="mt-2 text-sm text-red-300">{p.abwError}</div> : null}
      </Section>
    </TwoCol>
  );
}
