import { useEffect, useMemo, useState } from "react";
import { ui } from "./ui/ui";

import { zeitkontoProMitarbeiter, zusammenfassung } from "@core/services/timeAccount";
import type { Mitarbeiter, WochenEintrag, AbwesenheitEintrag } from "@core/models/types";

import mitarbeiterData from "./data/mitarbeiter.json";
import eintraegeData from "./data/eintraege.json";
import abwesenheitenData from "./data/abwesenheiten.json";

// ===== Storage Keys =====
const KEY_M = "zeitkonto.mitarbeiter";
const KEY_E = "zeitkonto.eintraege";
const KEY_A = "zeitkonto.abwesenheiten";

// ===== Helpers =====
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeIsoWeek(input: string): string | null {
  const m = /^(\d{4})-W(\d{1,2})$/i.exec(input.trim());
  if (!m) return null;

  const year = m[1];
  const weekNum = Number(m[2]);
  if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 53) return null;

  const week = String(weekNum).padStart(2, "0");
  return `${year}-W${week}`;
}

function compareIsoWeek(a: string, b: string): number {
  return a.localeCompare(b);
}

function eqId(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ===== UI-local Types (für die Form) =====
type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];
type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

export default function App() {
  // ===== Initialdaten aus JSON =====
  const initialMitarbeiter = mitarbeiterData as Mitarbeiter[];
  const initialEintraege = eintraegeData as WochenEintrag[];
  const initialAbwesenheiten = abwesenheitenData as AbwesenheitEintrag[];

  // ===== State (persistiert in localStorage) =====
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>(
    () => loadFromStorage(KEY_M, initialMitarbeiter)
  );
  const [eintraege, setEintraege] = useState<WochenEintrag[]>(
    () => loadFromStorage(KEY_E, initialEintraege)
  );
  const [abwesenheiten, setAbwesenheiten] = useState<AbwesenheitEintrag[]>(
    () => loadFromStorage(KEY_A, initialAbwesenheiten)
  );

  useEffect(() => saveToStorage(KEY_M, mitarbeiterListe), [mitarbeiterListe]);
  useEffect(() => saveToStorage(KEY_E, eintraege), [eintraege]);
  useEffect(() => saveToStorage(KEY_A, abwesenheiten), [abwesenheiten]);

  // ===== Auswahl / Filter =====
  const [mitarbeiterId, setMitarbeiterId] = useState<string>(mitarbeiterListe[0]?.id ?? "");
  const [fromWoche, setFromWoche] = useState<string>("2025-W01");
  const [toWoche, setToWoche] = useState<string>("2025-W53");

  // ===== Mitarbeiter anlegen =====
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmpName, setNewEmpName] = useState("");

  // ===== Wochen-Eintrag Form =====
  const [newWoche, setNewWoche] = useState("2025-W50");
  const [newIst, setNewIst] = useState<number>(40);

  // ===== Abwesenheit Form =====
  const [newAbwWoche, setNewAbwWoche] = useState("2025-W50");
  const [newAbwTag, setNewAbwTag] = useState<WochenTag>("mo");
  const [newAbwArt, setNewAbwArt] = useState<AbwesenheitsArt>("urlaub");
  const [newAbwStunden, setNewAbwStunden] = useState<number>(8);

  // ===== Form Feedback =====
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  // ===== Derived =====
  const mitarbeiter = useMemo(
    () => mitarbeiterListe.find((m) => eqId(m.id, mitarbeiterId)),
    [mitarbeiterListe, mitarbeiterId]
  );

  const normalizedFrom = useMemo(() => normalizeIsoWeek(fromWoche) ?? fromWoche, [fromWoche]);
  const normalizedTo = useMemo(() => normalizeIsoWeek(toWoche) ?? toWoche, [toWoche]);

  const inRange = (w: string) => w >= normalizedFrom && w <= normalizedTo;

  const eintraegeM = useMemo(
    () =>
      eintraege
        .filter((e) => eqId(e.mitarbeiterId, mitarbeiterId) && inRange(e.woche))
        .slice()
        .sort((a, b) => compareIsoWeek(a.woche, b.woche)),
    [eintraege, mitarbeiterId, normalizedFrom, normalizedTo]
  );

  const abwesenheitenM = useMemo(
    () =>
      abwesenheiten
        .filter((a) => eqId(a.mitarbeiterId, mitarbeiterId) && inRange(a.woche))
        .slice()
        .sort((a, b) => compareIsoWeek(a.woche, b.woche)),
    [abwesenheiten, mitarbeiterId, normalizedFrom, normalizedTo]
  );

  // ===== Auswertung (safe) =====
  let errorMsg: string | null = null;
  let rows: ReturnType<typeof zeitkontoProMitarbeiter> = [];
  let summary: ReturnType<typeof zusammenfassung> | null = null;

  if (!mitarbeiter) {
    errorMsg = "Kein Mitarbeiter gefunden (ID-Auswahl).";
  } else {
    try {
      rows = zeitkontoProMitarbeiter(mitarbeiter, eintraegeM, abwesenheitenM);
      summary = zusammenfassung(rows);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
    }
  }

  // ===== Aktionen =====
  function resetToDemoData() {
    setMitarbeiterListe(initialMitarbeiter);
    setEintraege(initialEintraege);
    setAbwesenheiten(initialAbwesenheiten);
    setMitarbeiterId(initialMitarbeiter[0]?.id ?? "");
    setFormError(null);
    setFormInfo("Demo-Daten geladen.");
  }

  function addEmployee() {
    setFormError(null);
    setFormInfo(null);

    const id = newEmpId.trim();
    const name = newEmpName.trim();

    if (!id || !name) {
      setFormError("Bitte neue ID und Name ausfüllen.");
      return;
    }
    if (mitarbeiterListe.some((m) => eqId(m.id, id))) {
      setFormError("Diese ID existiert bereits.");
      return;
    }

    // Default: 8h Mo-Do, 0h Fr (typisch 4-Tage Modell)
    const newM: Mitarbeiter = {
      id,
      name,
      modell: {
        typ: "wochentage",
        tage: {
          mo: { sollStunden: 8, urlaubswert: 1.0 },
          di: { sollStunden: 8, urlaubswert: 1.0 },
          mi: { sollStunden: 8, urlaubswert: 1.0 },
          do: { sollStunden: 8, urlaubswert: 1.0 },
          fr: { sollStunden: 0, urlaubswert: 0.0 },
        },
      },
    };

    setMitarbeiterListe((prev) => [...prev, newM]);
    setMitarbeiterId(id);
    setNewEmpId("");
    setNewEmpName("");
    setFormInfo("Mitarbeiter angelegt.");
  }

  function deleteEmployee() {
    setFormError(null);
    setFormInfo(null);

    if (!mitarbeiter) return;

    const id = mitarbeiter.id;

    setMitarbeiterListe((prev) => prev.filter((m) => !eqId(m.id, id)));
    setEintraege((prev) => prev.filter((e) => !eqId(e.mitarbeiterId, id)));
    setAbwesenheiten((prev) => prev.filter((a) => !eqId(a.mitarbeiterId, id)));

    const remaining = mitarbeiterListe.filter((m) => !eqId(m.id, id));
    setMitarbeiterId(remaining[0]?.id ?? "");
    setFormInfo("Mitarbeiter gelöscht (inkl. Einträge/Abwesenheiten).");
  }

  function updateDay(tag: WochenTag, field: "sollStunden" | "urlaubswert", value: number) {
    if (!mitarbeiter) return;

    setMitarbeiterListe((prev) =>
      prev.map((m) => {
        if (!eqId(m.id, mitarbeiter.id)) return m;
        if (m.modell.typ !== "wochentage") return m;

        const next = structuredClone(m);
        // @ts-expect-error - structuredClone preserves shape
        next.modell.tage[tag][field] = value;
        return next;
      })
    );
  }

  const normalizedNewWoche = useMemo(() => normalizeIsoWeek(newWoche), [newWoche]);
  const willOverwrite = useMemo(() => {
    if (!normalizedNewWoche) return false;
    return eintraege.some((e) => eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === normalizedNewWoche);
  }, [eintraege, mitarbeiterId, normalizedNewWoche]);

  function addWochenEintrag() {
    setFormError(null);
    setFormInfo(null);

    if (!mitarbeiter) return;

    const w = normalizeIsoWeek(newWoche);
    if (!w) {
      setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
      return;
    }
    if (!Number.isFinite(newIst) || newIst < 0) {
      setFormError("IST-Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    const entry: WochenEintrag = { mitarbeiterId: mitarbeiter.id, woche: w, istStunden: newIst };

    setEintraege((prev) => {
      const rest = prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === w));
      return [...rest, entry].sort((a, b) => compareIsoWeek(a.woche, b.woche));
    });

    setNewWoche(w);
    setFormInfo(willOverwrite ? "Eintrag überschrieben." : "Eintrag hinzugefügt.");
  }

  function addAbwesenheit() {
    setFormError(null);
    setFormInfo(null);

    if (!mitarbeiter) return;

    const w = normalizeIsoWeek(newAbwWoche);
    if (!w) {
      setFormError("Abwesenheit: Woche ungültig (Format YYYY-WNN).");
      return;
    }
    if (!Number.isFinite(newAbwStunden) || newAbwStunden < 0) {
      setFormError("Abwesenheit-Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    const item: AbwesenheitEintrag = {
      mitarbeiterId: mitarbeiter.id,
      woche: w,
      tag: newAbwTag,
      art: newAbwArt,
      stunden: newAbwStunden,
    };

    setAbwesenheiten((prev) => [...prev, item].sort((a, b) => compareIsoWeek(a.woche, b.woche)));
    setNewAbwWoche(w);
    setFormInfo("Abwesenheit hinzugefügt.");
  }

  function removeWochenEintrag(woche: string) {
    if (!mitarbeiter) return;
    setEintraege((prev) => prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === woche)));
    setFormInfo("Wochen-Eintrag gelöscht.");
  }

  function removeAbwesenheit(indexInFiltered: number) {
    if (!mitarbeiter) return;

    // wir löschen anhand der gefilterten Liste "abwesenheitenM"
    const target = abwesenheitenM[indexInFiltered];
    if (!target) return;

    setAbwesenheiten((prev) =>
      prev.filter(
        (a) =>
          !(
            eqId(a.mitarbeiterId, target.mitarbeiterId) &&
            a.woche === target.woche &&
            a.tag === target.tag &&
            a.art === target.art &&
            a.stunden === target.stunden
          )
      )
    );
    setFormInfo("Abwesenheit gelöscht.");
  }

  // ===== Render =====
  return (
    <div className={ui.page}>
      {/* Header */}
      <div className={ui.headerRow}>
        <div className={ui.section}>
          <div className={ui.title}>Zeitkonto</div>
          <div className={ui.subtitle}>Schwarz/Orange Theme – Runde 1</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className={ui.btnSecondary} type="button" onClick={resetToDemoData}>
            Reset (Demo-Daten)
          </button>
        </div>
      </div>

      {/* Global Error/Info */}
      {errorMsg && <div className={ui.alertError}>Fehler: {errorMsg}</div>}
      {formError && <div className={ui.alertError}>Eingabe: {formError}</div>}
      {formInfo && <div className={ui.alertInfo}>{formInfo}</div>}

      {/* Auswahl */}
      <div className={ui.card}>
        <div className={ui.cardBody}>
          <div className="flex flex-wrap items-end gap-4">
            <div className={ui.field}>
              <label className={ui.label}>Mitarbeiter</label>
              <select className={`${ui.select} ${ui.w48}`} value={mitarbeiterId} onChange={(e) => setMitarbeiterId(e.target.value)}>
                {mitarbeiterListe.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </div>

            <div className={ui.field}>
              <label className={ui.label}>Von</label>
              <input className={`${ui.input} ${ui.w36}`} value={fromWoche} onChange={(e) => setFromWoche(e.target.value)} placeholder="2025-W01" />
            </div>

            <div className={ui.field}>
              <label className={ui.label}>Bis</label>
              <input className={`${ui.input} ${ui.w36}`} value={toWoche} onChange={(e) => setToWoche(e.target.value)} placeholder="2025-W53" />
            </div>

            <div className={ui.hint}>Format: YYYY-WNN (z.B. 2025-W05)</div>
          </div>

          {mitarbeiter && <div className={ui.subtitle}>Aktiv: {mitarbeiter.name}</div>}
        </div>
      </div>

      {/* Layout: links Forms, rechts Ergebnisse */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: Verwaltung + Forms */}
        <div className="space-y-6">
          {/* Mitarbeiter verwalten */}
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className="font-semibold">Mitarbeiter verwalten</div>

              <div className={ui.controlRow}>
                <div className={ui.field}>
                  <label className={ui.label}>Neue ID</label>
                  <input className={`${ui.input} ${ui.w40}`} value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} placeholder="z.B. peter" />
                </div>

                <div className={ui.field}>
                  <label className={ui.label}>Name</label>
                  <input className={`${ui.input} ${ui.w48}`} value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="z.B. Peter Häusler" />
                </div>

                <button className={ui.btnPrimary} type="button" onClick={addEmployee}>
                  Anlegen
                </button>

                <button className={ui.btnDanger} type="button" onClick={deleteEmployee} disabled={!mitarbeiter}>
                  Mitarbeiter löschen
                </button>
              </div>

              <div className={ui.hint}>
                Tipp: IDs werden beim Filtern <span className={ui.mono}>nicht</span> nach Groß/Klein unterschieden.
              </div>
            </div>
          </div>

          {/* Arbeitszeitmodell */}
          {mitarbeiter && mitarbeiter.modell.typ === "wochentage" && (
            <div className={ui.card}>
              <div className={ui.cardBody}>
                <div className="font-semibold">Arbeitszeitmodell (Wochentage)</div>
                <div className={ui.subtitle}>Sollstunden & Urlaubswert pro Tag für: <span className="font-medium text-zinc-200">{mitarbeiter.name}</span></div>

                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <thead className={ui.thead}>
                      <tr className="text-left">
                        <th className={ui.th}>Tag</th>
                        <th className={ui.th}>SOLL (h)</th>
                        <th className={ui.th}>Urlaubswert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WOCHENTAGE.map((t) => {
                        const rule = mitarbeiter.modell.tage[t];
                        return (
                          <tr key={t} className={ui.tr}>
                            <td className={ui.tdStrong}>{t.toUpperCase()}</td>
                            <td className={ui.td}>
                              <input
                                className={`${ui.numberInput} ${ui.w28}`}
                                type="number"
                                step="0.5"
                                min={0}
                                value={rule.sollStunden}
                                onChange={(e) => updateDay(t, "sollStunden", Number(e.target.value))}
                              />
                            </td>
                            <td className={ui.td}>
                              <input
                                className={`${ui.numberInput} ${ui.w28}`}
                                type="number"
                                step="0.25"
                                min={0}
                                value={rule.urlaubswert}
                                onChange={(e) => updateDay(t, "urlaubswert", Number(e.target.value))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className={ui.hint}>
                  Wenn ein Tag SOLL = 0 ist, solltest du normalerweise auch keine Abwesenheit auf diesen Tag buchen (sonst kann der Core Fehler melden).
                </div>
              </div>
            </div>
          )}

          {/* Wochen-Eintrag hinzufügen */}
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className="font-semibold">Wochen-Eintrag hinzufügen</div>

              <form
                className={ui.controlRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  addWochenEintrag();
                }}
              >
                <div className={ui.field}>
                  <label className={ui.label}>Woche (ISO)</label>
                  <input
                    className={
                      `${ui.input} ${ui.w36} ` +
                      (newWoche.trim().length > 0 && !normalizedNewWoche ? "border-red-500/60" : "")
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

                <div className={ui.field}>
                  <label className={ui.label}>IST-Stunden</label>
                  <input
                    className={`${ui.numberInput} ${ui.w28}`}
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
                      <span className="text-orange-200">Achtung: Woche existiert – wird überschrieben.</span>
                    ) : (
                      <span className="text-emerald-200">Neuer Eintrag – wird hinzugefügt.</span>
                    )
                  ) : (
                    <span>Format: YYYY-WNN (z.B. 2025-W05)</span>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Abwesenheit hinzufügen */}
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className="font-semibold">Abwesenheit hinzufügen</div>

              <form
                className={ui.controlRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  addAbwesenheit();
                }}
              >
                <div className={ui.field}>
                  <label className={ui.label}>Woche (ISO)</label>
                  <input
                    className={`${ui.input} ${ui.w36}`}
                    value={newAbwWoche}
                    onChange={(e) => setNewAbwWoche(e.target.value)}
                    onBlur={() => {
                      const n = normalizeIsoWeek(newAbwWoche);
                      if (n) setNewAbwWoche(n);
                    }}
                    placeholder="2025-W50"
                  />
                </div>

                <div className={ui.field}>
                  <label className={ui.label}>Tag</label>
                  <select className={`${ui.select} ${ui.w28}`} value={newAbwTag} onChange={(e) => setNewAbwTag(e.target.value as WochenTag)}>
                    {WOCHENTAGE.map((t) => (
                      <option key={t} value={t}>
                        {t.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={ui.field}>
                  <label className={ui.label}>Art</label>
                  <select className={`${ui.select} ${ui.w40}`} value={newAbwArt} onChange={(e) => setNewAbwArt(e.target.value as AbwesenheitsArt)}>
                    <option value="urlaub">urlaub</option>
                    <option value="krank">krank</option>
                    <option value="feiertag">feiertag</option>
                    <option value="unbezahlt">unbezahlt</option>
                  </select>
                </div>

                <div className={ui.field}>
                  <label className={ui.label}>Stunden</label>
                  <input
                    className={`${ui.numberInput} ${ui.w28}`}
                    type="number"
                    step="0.5"
                    min={0}
                    value={Number.isFinite(newAbwStunden) ? newAbwStunden : 0}
                    onChange={(e) => setNewAbwStunden(Number(e.target.value))}
                  />
                </div>

                <button className={ui.btnPrimary} type="submit">
                  Hinzufügen
                </button>
              </form>

              <div className={ui.hint}>Hinweis: Wenn ein Tag SOLL=0 hat, kann Abwesenheit dort einen Fehler auslösen (Core-Schutz).</div>
            </div>
          </div>
        </div>

        {/* RIGHT: Tabelle + Zusammenfassung + Listen */}
        <div className="space-y-6">
          {/* Tabelle */}
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead className={ui.thead}>
                <tr className="text-left">
                  <th className={ui.th}>Woche</th>
                  <th className={ui.th}>IST</th>
                  <th className={ui.th}>SOLL</th>
                  <th className={ui.th}>Abw</th>
                  <th className={ui.th}>eSOLL</th>
                  <th className={ui.th}>Δ</th>
                  <th className={ui.th}>Saldo</th>
                  <th className={ui.th}>Urlaub (T)</th>
                  <th className={ui.th}></th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.woche} className={ui.tr}>
                    <td className={ui.tdStrong}>{r.woche}</td>
                    <td className={ui.td}>{r.istStunden}</td>
                    <td className={ui.td}>{r.sollStunden}</td>
                    <td className={ui.td}>{r.abwesenheitStunden}</td>
                    <td className={ui.td}>{r.effektivesSoll}</td>
                    <td className={ui.td}>{r.delta}</td>
                    <td className={ui.td}>{r.saldo}</td>
                    <td className={ui.td}>{r.urlaubstage.toFixed(2)}</td>
                    <td className={ui.td}>
                      <button className={ui.btnGhost} type="button" onClick={() => removeWochenEintrag(r.woche)}>
                        löschen
                      </button>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr className={ui.tr}>
                    <td className={`${ui.td} text-zinc-400`} colSpan={9}>
                      Keine Einträge im gewählten Zeitraum.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Zusammenfassung */}
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className="font-semibold">Zusammenfassung</div>
              {!summary ? (
                <div className={ui.subtitle}>Keine Auswertung verfügbar (siehe Fehler oben).</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div>IST gesamt: <span className="font-medium">{summary.sumIst}</span></div>
                  <div>SOLL gesamt: <span className="font-medium">{summary.sumSoll}</span></div>
                  <div>eSOLL gesamt: <span className="font-medium">{summary.sumEffSoll}</span></div>
                  <div>Abwesenheit (h): <span className="font-medium">{summary.sumAbw}</span></div>
                  <div>Δ gesamt: <span className="font-medium">{summary.sumDelta}</span></div>
                  <div>Urlaub (Tage): <span className="font-medium">{summary.sumUrlaubTage.toFixed(2)}</span></div>
                  <div>End-Saldo: <span className="font-medium">{summary.endSaldo}</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Listen: gefilterte Rohdaten */}
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className="font-semibold">Wochen-Einträge (aktuell gefiltert)</div>
              <div className={ui.hint}>Menge: {eintraegeM.length}</div>

              <div className="space-y-2">
                {eintraegeM.map((e) => (
                  <div key={`${e.mitarbeiterId}-${e.woche}`} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{e.woche}</span> – IST {e.istStunden}h
                    </div>
                    <button className={ui.btnGhost} type="button" onClick={() => removeWochenEintrag(e.woche)}>
                      löschen
                    </button>
                  </div>
                ))}
                {eintraegeM.length === 0 && <div className={ui.subtitle}>Keine Einträge.</div>}
              </div>
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className="font-semibold">Abwesenheit (aktuell gefiltert)</div>
              <div className={ui.hint}>Menge: {abwesenheitenM.length}</div>

              <div className="space-y-2">
                {abwesenheitenM.map((a, idx) => (
                  <div
                    key={`${a.mitarbeiterId}-${a.woche}-${a.tag}-${a.art}-${a.stunden}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{a.woche}</span> {a.tag.toUpperCase()} – {a.art} – {a.stunden}h
                    </div>
                    <button className={ui.btnGhost} type="button" onClick={() => removeAbwesenheit(idx)}>
                      löschen
                    </button>
                  </div>
                ))}
                {abwesenheitenM.length === 0 && <div className={ui.subtitle}>Keine Abwesenheiten.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Hint */}
      <div className={ui.hint}>
        Theme Runde 1: konsistente Kisten, Buttons, Tabellen. Nächster Schritt: „Polish Runde 2“ (Spacing/Typografie/Icons) + „Überstunden/Summary“ fachlich.
      </div>
    </div>
  );
}
