// src/ui/Forms.tsx
import React from "react";
import type { Mitarbeiter } from "@core/models/types";

type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

type Ui = Record<string, string>;

type Props = {
  ui: Ui;

  // Auswahl (nur für Text im UI)
  mitarbeiter: Mitarbeiter | null;

  // Wochen-Eintrag Form (controlled)
  newWoche: string;
  setNewWoche: (v: string) => void;
  normalizedNewWoche: string | null;
  willOverwrite: boolean;

  newIst: number;
  setNewIst: (v: number) => void;
  istInvalid: boolean;

  addWochenEintrag: () => void;

  // Abwesenheit Form (controlled)
  abwWoche: string;
  setAbwWoche: (v: string) => void;

  abwTag: WochenTag;
  setAbwTag: (v: WochenTag) => void;

  abwArt: AbwesenheitsArt;
  setAbwArt: (v: AbwesenheitsArt) => void;

  abwStunden: number;
  setAbwStunden: (v: number) => void;

  addAbwesenheit: () => void;

  // Feedback
  formError: string | null;
  formInfo: string | null;

  // helpers
  normalizeIsoWeek: (s: string) => string | null;
};

const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];
const ABW_ARTEN: AbwesenheitsArt[] = ["urlaub", "krank", "feiertag", "unbezahlt"];

export function EntryAndAbsenceForms(props: Props) {
  const {
    ui,
    mitarbeiter,

    newWoche,
    setNewWoche,
    normalizedNewWoche,
    willOverwrite,

    newIst,
    setNewIst,
    istInvalid,

    addWochenEintrag,

    abwWoche,
    setAbwWoche,
    abwTag,
    setAbwTag,
    abwArt,
    setAbwArt,
    abwStunden,
    setAbwStunden,

    addAbwesenheit,

    formError,
    formInfo,

    normalizeIsoWeek
  } = props;

  const safeNewWoche = newWoche ?? "";
  const safeAbwWoche = abwWoche ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Wochen-Eintrag hinzufügen */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="space-y-1">
          <div className="font-semibold">Wochen-Eintrag hinzufügen</div>
          <div className={ui.subtitle}>
            Für: <span className="font-medium">{mitarbeiter ? mitarbeiter.name : "—"}</span>
          </div>
        </div>

        <form
          className="pt-2 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addWochenEintrag();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Woche (ISO)</label>
            <input
              className={
                ui.input +
                " w-40 " +
                (safeNewWoche.trim().length > 0 && !normalizedNewWoche ? "border-red-500" : "")
              }
              value={safeNewWoche}
              onChange={(e) => setNewWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(safeNewWoche);
                if (n) setNewWoche(n);
              }}
              placeholder="2025-W05"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>IST-Stunden</label>
            <input
              className={ui.numberInput + " w-32 " + (istInvalid ? "border-red-500" : "")}
              type="number"
              step="0.5"
              min={0}
              value={Number.isFinite(newIst) ? newIst : 0}
              onChange={(e) => setNewIst(Number(e.target.value))}
            />
          </div>

          <button className={ui.btnPrimary} type="submit">
            Hinzufügen
          </button>

          <div className={ui.hint}>
            {normalizedNewWoche ? (
              willOverwrite ? (
                <span className="text-amber-300">Achtung: existiert – wird überschrieben.</span>
              ) : (
                <span className="text-emerald-300">Neuer Eintrag – wird hinzugefügt.</span>
              )
            ) : (
              <span>Format: YYYY-WNN (z.B. 2025-W05)</span>
            )}
          </div>

          {/* Feedback */}
          <div className="w-full pt-2 space-y-1">
            {formError ? <div className="text-sm text-red-300">Fehler: {formError}</div> : null}
            {formInfo ? <div className="text-sm text-emerald-300">{formInfo}</div> : null}
          </div>
        </form>
      </div>

      {/* Abwesenheit hinzufügen */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="space-y-1">
          <div className="font-semibold">Abwesenheit hinzufügen</div>
          <div className={ui.subtitle}>
            Für: <span className="font-medium">{mitarbeiter ? mitarbeiter.name : "—"}</span>
          </div>
        </div>

        <form
          className="pt-2 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addAbwesenheit();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Woche</label>
            <input
              className={ui.input + " w-40"}
              value={safeAbwWoche}
              onChange={(e) => setAbwWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(safeAbwWoche);
                if (n) setAbwWoche(n);
              }}
              placeholder="2025-W05"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Tag</label>
            <select className={ui.select + " w-28"} value={abwTag} onChange={(e) => setAbwTag(e.target.value as WochenTag)}>
              {WOCHENTAGE.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Art</label>
            <select className={ui.select + " w-36"} value={abwArt} onChange={(e) => setAbwArt(e.target.value as AbwesenheitsArt)}>
              {ABW_ARTEN.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Stunden</label>
            <input
              className={ui.numberInput + " w-32"}
              type="number"
              step="0.5"
              min={0}
              value={Number.isFinite(abwStunden) ? abwStunden : 0}
              onChange={(e) => setAbwStunden(Number(e.target.value))}
            />
          </div>

          <button className={ui.btnPrimary} type="submit">
            Hinzufügen
          </button>

          <div className={ui.hint}>Tipp: Woche wird beim Verlassen automatisch normalisiert.</div>
        </form>
      </div>
    </div>
  );
}
