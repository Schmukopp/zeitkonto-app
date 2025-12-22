import React, { useMemo, useState } from "react";
import type { AbwesenheitEintrag, Mitarbeiter, WochenEintrag } from "@core/models/types";

/**
 * EntryAndAbsenceForms
 * - robust gegen fehlende Props (keine whitescreens)
 * - nutzt addWochenEintrag / addAbwesenheit aus App
 */

type UI = {
  card: string;
  cardBody: string;
  label: string;
  hint: string;
  input: string;
  select: string;
  numberInput: string;
  btnPrimary: string;
  btnSecondary: string;
  alertError: string;
  alertInfo: string;
};

type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

type Props = {
  ui: UI;

  mitarbeiter: Mitarbeiter;
  mitarbeiterId: string;

  // aktuelle Daten (State aus App)
  eintraege: WochenEintrag[];
  abwesenheiten: AbwesenheitEintrag[];

  // Aktionen (aus App)
  addWochenEintrag: (wocheIso: string, istStunden: number) => void;
  addAbwesenheit: (wocheIso: string, tag: WochenTag, art: AbwesenheitsArt, stunden: number) => void;

  // Messages (aus App)
  formError?: string | null;
  formInfo?: string | null;

  // Helfer (aus App)
  normalizeIsoWeek: (input: string) => string | null;
  eqId: (a: string, b: string) => boolean;
};

export function EntryAndAbsenceForms(props: Props) {
  const {
    ui,
    mitarbeiter,
    mitarbeiterId,
    eintraege,
    abwesenheiten,
    addWochenEintrag,
    addAbwesenheit,
    formError,
    formInfo,
    normalizeIsoWeek,
  } = props;

  // ===== Lokale Form-States =====
  const [newWoche, setNewWoche] = useState<string>("");
  const [newIst, setNewIst] = useState<number>(0);

  const [abwWoche, setAbwWoche] = useState<string>("");
  const [abwTag, setAbwTag] = useState<WochenTag>("mo");
  const [abwArt, setAbwArt] = useState<AbwesenheitsArt>("urlaub");
  const [abwStunden, setAbwStunden] = useState<number>(0);

  // ===== Abgeleitet: ISO-Woche normalisieren + overwrite check =====
  const normalizedNewWoche = useMemo(() => normalizeIsoWeek(newWoche) ?? null, [newWoche, normalizeIsoWeek]);

  const willOverwrite = useMemo(() => {
    if (!normalizedNewWoche) return false;
    return (eintraege ?? []).some((e) => e.mitarbeiterId === mitarbeiterId && e.woche === normalizedNewWoche);
  }, [eintraege, mitarbeiterId, normalizedNewWoche]);

  // ===== Submit handler =====
  function onAddWeek() {
    const n = normalizeIsoWeek(newWoche);
    if (!n) return; // App zeigt i.d.R. eigene Meldung, wir crashen nicht
    addWochenEintrag(n, Number(newIst));
    setNewWoche(n);
  }

  function onAddAbsence() {
    const n = normalizeIsoWeek(abwWoche);
    if (!n) return;
    addAbwesenheit(n, abwTag, abwArt, Number(abwStunden));
    setAbwWoche(n);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Wochen-Eintrag hinzufügen */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Wochen-Eintrag hinzufügen</div>
        <div className={ui.hint}>
          Für: <span className="text-zinc-200">{mitarbeiter?.name ?? "—"}</span>
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onAddWeek();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Woche (ISO)</label>
            <input
              className={
                ui.input +
                " w-40 " +
                ((newWoche ?? "").trim().length > 0 && !normalizedNewWoche ? "border-red-400" : "")
              }
              value={newWoche}
              onChange={(e) => setNewWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(newWoche);
                if (n) setNewWoche(n);
              }}
              placeholder="2025-W50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>IST-Stunden</label>
            <input
              className={ui.numberInput + " w-28"}
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

          <div className="w-full">
            <div className={ui.hint}>
              {normalizedNewWoche ? (
                willOverwrite ? (
                  <span className="text-amber-300">
                    Achtung: Für diese Woche existiert bereits ein Eintrag – er wird überschrieben.
                  </span>
                ) : (
                  <span className="text-emerald-300">Neuer Eintrag – wird hinzugefügt.</span>
                )
              ) : (
                <span>Format: YYYY-WNN (z.B. 2025-W05)</span>
              )}
            </div>

            {formError ? <div className={ui.alertError}>Fehler: {formError}</div> : null}
            {formInfo ? <div className={ui.alertInfo}>{formInfo}</div> : null}
          </div>
        </form>
      </div>

      {/* Abwesenheit hinzufügen */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Abwesenheit hinzufügen</div>
        <div className={ui.hint}>
          Für: <span className="text-zinc-200">{mitarbeiter?.name ?? "—"}</span>
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onAddAbsence();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Woche (ISO)</label>
            <input
              className={ui.input + " w-40"}
              value={abwWoche}
              onChange={(e) => setAbwWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(abwWoche);
                if (n) setAbwWoche(n);
              }}
              placeholder="2025-W50"
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
            <select
              className={ui.select + " w-36"}
              value={abwArt}
              onChange={(e) => setAbwArt(e.target.value as AbwesenheitsArt)}
            >
              <option value="urlaub">Urlaub</option>
              <option value="krank">Krank</option>
              <option value="feiertag">Feiertag</option>
              <option value="unbezahlt">Unbezahlt</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Stunden</label>
            <input
              className={ui.numberInput + " w-28"}
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
        </form>

        <div className={ui.hint}>
          Aktuell geladen: {(abwesenheiten ?? []).filter((a) => a.mitarbeiterId === mitarbeiterId).length} Abwesenheiten
        </div>
      </div>
    </div>
  );
}
