import { useEffect, useMemo, useState } from "react";
import { ui } from "./ui/ui";

import { zeitkontoProMitarbeiter, zusammenfassung } from "@core/services/timeAccount";
import type { Mitarbeiter, WochenEintrag, AbwesenheitEintrag, WochenAuswertung } from "@core/models/types";

import mitarbeiterData from "./data/mitarbeiter.json";
import eintraegeData from "./data/eintraege.json";
import abwesenheitenData from "./data/abwesenheiten.json";
import { EntryAndAbsenceForms } from "./ui/Forms";
import { Lists } from "./ui/Lists";


// ===== Storage Keys =====
const KEY_M = "zeitkonto.mitarbeiter";
const KEY_E = "zeitkonto.eintraege";
const KEY_A = "zeitkonto.abwesenheiten";
const KEY_SNAPSHOT = "zeitkonto.snapshot.v1";

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
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}
function compareIsoWeek(a: string, b: string): number {
  return a.localeCompare(b);
}
function eqId(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ===== UI-local Types (für Formulare) =====
type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];
type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

type Snapshot = {
  mitarbeiter: Mitarbeiter[];
  eintraege: WochenEintrag[];
  abwesenheiten: AbwesenheitEintrag[];
  savedAt: string;
};

export default function App() {
  // ===== Initialdaten aus JSON =====
  const initialMitarbeiter = mitarbeiterData as Mitarbeiter[];
  const initialEintraege = eintraegeData as WochenEintrag[];
  const initialAbwesenheiten = abwesenheitenData as AbwesenheitEintrag[];

  // ===== State (persistiert) =====
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>(() => loadFromStorage(KEY_M, initialMitarbeiter));
  const [eintraege, setEintraege] = useState<WochenEintrag[]>(() => loadFromStorage(KEY_E, initialEintraege));
  const [abwesenheiten, setAbwesenheiten] = useState<AbwesenheitEintrag[]>(() => loadFromStorage(KEY_A, initialAbwesenheiten));

  useEffect(() => saveToStorage(KEY_M, mitarbeiterListe), [mitarbeiterListe]);
  useEffect(() => saveToStorage(KEY_E, eintraege), [eintraege]);
  useEffect(() => saveToStorage(KEY_A, abwesenheiten), [abwesenheiten]);

  // ===== Meldungen =====
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!formError && !formInfo) return;
    const t = window.setTimeout(() => {
      setFormError(null);
      setFormInfo(null);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [formError, formInfo]);

  // ===== Snapshot =====
  const [hasSnapshot, setHasSnapshot] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(KEY_SNAPSHOT);
    } catch {
      return false;
    }
  });
  const [snapshotAt, setSnapshotAt] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(KEY_SNAPSHOT);
      if (!raw) return "";
      const snap = JSON.parse(raw) as { savedAt?: string };
      return snap.savedAt ?? "";
    } catch {
      return "";
    }
  });

  function saveSnapshot(reason: string) {
    try {
      const snap: Snapshot = {
        mitarbeiter: mitarbeiterListe,
        eintraege,
        abwesenheiten,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(KEY_SNAPSHOT, JSON.stringify(snap));
      setHasSnapshot(true);
      setSnapshotAt(snap.savedAt);
      setFormInfo(`Snapshot gespeichert (${reason}).`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Snapshot konnte nicht gespeichert werden.");
    }
  }

  function restoreSnapshot() {
    try {
      const raw = localStorage.getItem(KEY_SNAPSHOT);
      if (!raw) {
        setFormError("Kein Snapshot vorhanden.");
        return;
      }
      const snap = JSON.parse(raw) as Snapshot;
      setMitarbeiterListe(snap.mitarbeiter);
      setEintraege(snap.eintraege);
      setAbwesenheiten(snap.abwesenheiten);
      setHasSnapshot(true);
      setSnapshotAt(snap.savedAt);
      setFormInfo(`Snapshot wiederhergestellt (${snap.savedAt}).`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Snapshot konnte nicht wiederhergestellt werden.");
    }
  }

  function clearSnapshot() {
    try {
      localStorage.removeItem(KEY_SNAPSHOT);
      setHasSnapshot(false);
      setSnapshotAt("");
      setFormInfo("Snapshot gelöscht.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Snapshot konnte nicht gelöscht werden.");
    }
  }

  function resetToDemoData() {
    saveSnapshot("vor Reset");
    setMitarbeiterListe(initialMitarbeiter);
    setEintraege(initialEintraege);
    setAbwesenheiten(initialAbwesenheiten);
    setFormInfo("Demo-Daten geladen.");
  }

  // ===== Auswahl / Filter =====
  const [mitarbeiterId, setMitarbeiterId] = useState(mitarbeiterListe[0]?.id ?? "");
  const [fromWoche, setFromWoche] = useState("2025-W01");
  const [toWoche, setToWoche] = useState("2025-W53");

  useEffect(() => {
    if (mitarbeiterListe.length === 0) {
      setMitarbeiterId("");
      return;
    }
    const exists = mitarbeiterListe.some((m) => m.id === mitarbeiterId);
    if (!exists) setMitarbeiterId(mitarbeiterListe[0]!.id);
  }, [mitarbeiterListe, mitarbeiterId]);

  const mitarbeiter = mitarbeiterListe.find((m) => m.id === mitarbeiterId);

  const fromN = normalizeIsoWeek(fromWoche);
  const toN = normalizeIsoWeek(toWoche);
  const rangeOk = !!fromN && !!toN && compareIsoWeek(fromN, toN) <= 0;

  const inRange = (w: string) => {
    if (!rangeOk) return true;
    const wn = normalizeIsoWeek(w) ?? w;
    return compareIsoWeek(wn, fromN!) >= 0 && compareIsoWeek(wn, toN!) <= 0;
  };

  if (mitarbeiterListe.length === 0) return <div className={ui.page}>Keine Mitarbeiter vorhanden.</div>;
  if (!mitarbeiter) return <div className={ui.page}>Kein Mitarbeiter gefunden.</div>;

  // ===== Gefilterte Daten =====
  const eintraegeM = useMemo(() => {
    return eintraege
      .filter((e) => eqId(e.mitarbeiterId, mitarbeiter.id) && inRange(e.woche))
      .slice()
      .sort((a, b) => compareIsoWeek(a.woche, b.woche));
  }, [eintraege, mitarbeiter.id, fromWoche, toWoche]);

  const abwesenheitenM = useMemo(() => {
    const order: Record<WochenTag, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5 };
    return abwesenheiten
      .filter((a) => eqId(a.mitarbeiterId, mitarbeiter.id) && inRange(a.woche))
      .slice()
      .sort((a, b) => {
        const w = compareIsoWeek(a.woche, b.woche);
        if (w !== 0) return w;
        return (order[a.tag as WochenTag] ?? 99) - (order[b.tag as WochenTag] ?? 99);
      });
  }, [abwesenheiten, mitarbeiter.id, fromWoche, toWoche]);

  // ===== A8: Wochen-Eintrag Form =====
  const [newWoche, setNewWoche] = useState("2025-W50");
  const [newIst, setNewIst] = useState<number>(40);

  const normalizedNewWoche = normalizeIsoWeek(newWoche);
  const willOverwrite =
    !!normalizedNewWoche && eintraege.some((e) => eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === normalizedNewWoche);

  const istInvalid = !Number.isFinite(newIst) || newIst < 0;

  function addWochenEintrag() {
    setFormError(null);
    setFormInfo(null);

    const w = normalizeIsoWeek(newWoche);
    if (!w) {
      setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
      return;
    }
    if (istInvalid) {
      setFormError("IST-Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    saveSnapshot("vor Wochen-Eintrag");

    const entry: WochenEintrag = { mitarbeiterId: mitarbeiter.id, woche: w, istStunden: newIst };

    setEintraege((prev) => {
      const next = prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === w));
      next.push(entry);
      next.sort((a, b) => {
        const idCmp = a.mitarbeiterId.localeCompare(b.mitarbeiterId);
        return idCmp !== 0 ? idCmp : compareIsoWeek(a.woche, b.woche);
      });
      return next;
    });

    setNewWoche(w);
    setFormInfo(willOverwrite ? "Eintrag überschrieben." : "Eintrag gespeichert.");
  }

  function deleteWochenEintrag(woche: string) {
    saveSnapshot("vor Wochen-Eintrag löschen");
    setEintraege((prev) => prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === woche)));
    setFormInfo("Wochen-Eintrag gelöscht.");
  }

  // ===== A9: Abwesenheit Form =====
  const [abwWoche, setAbwWoche] = useState("2025-W50");
  const [abwTag, setAbwTag] = useState<WochenTag>("mi");
  const [abwArt, setAbwArt] = useState<AbwesenheitsArt>("urlaub");
  const [abwStunden, setAbwStunden] = useState<number>(5);
  const [abwError, setAbwError] = useState<string | null>(null);

  function addAbwesenheit() {
    setAbwError(null);
    setFormError(null);
    setFormInfo(null);

    const w = normalizeIsoWeek(abwWoche);
    if (!w) {
      setAbwError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
      return;
    }
    if (!Number.isFinite(abwStunden) || abwStunden < 0) {
      setAbwError("Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    const tagesSoll = mitarbeiter.modell.tage[abwTag]?.sollStunden ?? 0;
    if (tagesSoll <= 0) {
      setAbwError(`Am ${abwTag.toUpperCase()} ist bei ${mitarbeiter.name} kein Arbeitstag (SOLL=0).`);
      return;
    }
    if (abwStunden > tagesSoll) {
      setAbwError(`Abwesenheit (${abwStunden}h) darf Tages-SOLL (${tagesSoll}h) am ${abwTag.toUpperCase()} nicht überschreiten.`);
      return;
    }

    saveSnapshot("vor Abwesenheit");

    const item: AbwesenheitEintrag = {
      mitarbeiterId: mitarbeiter.id,
      woche: w,
      tag: abwTag,
      art: abwArt,
      stunden: abwStunden,
    };

    setAbwesenheiten((prev) => {
      const next = prev.slice();
      next.push(item);
      next.sort((a, b) => {
        const idCmp = a.mitarbeiterId.localeCompare(b.mitarbeiterId);
        return idCmp !== 0 ? idCmp : compareIsoWeek(a.woche, b.woche);
      });
      return next;
    });

    setAbwWoche(w);
    setFormInfo("Abwesenheit hinzugefügt.");
  }

  function deleteAbwesenheitByIndex(indexInFiltered: number) {
    const target = abwesenheitenM[indexInFiltered];
    if (!target) return;

    saveSnapshot("vor Abwesenheit löschen");

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

  // ===== A10: Mitarbeiter verwalten =====
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmpName, setNewEmpName] = useState("");

  function addMitarbeiter() {
    setFormError(null);
    setFormInfo(null);

    const id = newEmpId.trim();
    const name = newEmpName.trim();

    if (!id) {
      setFormError("Neue ID fehlt.");
      return;
    }
    if (!name) {
      setFormError("Neuer Name fehlt.");
      return;
    }
    const exists = mitarbeiterListe.some((m) => eqId(m.id, id));
    if (exists) {
      setFormError("Diese ID existiert bereits.");
      return;
    }

    saveSnapshot("vor Mitarbeiter anlegen");

    const base: Mitarbeiter = {
      id,
      name,
      modell: {
        typ: "wochentage",
        tage: {
          mo: { sollStunden: 8, urlaubswert: 1.0 },
          di: { sollStunden: 8, urlaubswert: 1.0 },
          mi: { sollStunden: 8, urlaubswert: 1.0 },
          do: { sollStunden: 8, urlaubswert: 1.0 },
          fr: { sollStunden: 8, urlaubswert: 1.0 },
        },
      },
    };

    setMitarbeiterListe((prev) => [...prev, base]);
    setMitarbeiterId(id);
    setNewEmpId("");
    setNewEmpName("");
    setFormInfo("Mitarbeiter angelegt.");
  }

  function deleteMitarbeiter(id: string) {
    saveSnapshot("vor Mitarbeiter löschen");

    setMitarbeiterListe((prev) => prev.filter((m) => !eqId(m.id, id)));
    setEintraege((prev) => prev.filter((e) => !eqId(e.mitarbeiterId, id)));
    setAbwesenheiten((prev) => prev.filter((a) => !eqId(a.mitarbeiterId, id)));

    setFormInfo("Mitarbeiter gelöscht.");
  }

  // ===== A10.3 Arbeitszeitmodell bearbeiten =====
  function updateTagesRegel(tag: WochenTag, patch: Partial<{ sollStunden: number; urlaubswert: number }>) {
    saveSnapshot("vor Arbeitszeitmodell ändern");

    setMitarbeiterListe((prev) =>
      prev.map((m) => {
        if (!eqId(m.id, mitarbeiter.id)) return m;
        const oldRule = m.modell.tage[tag];
        const nextRule = {
          ...oldRule,
          ...patch,
        };
        return {
          ...m,
          modell: {
            ...m.modell,
            tage: {
              ...m.modell.tage,
              [tag]: nextRule,
            },
          },
        };
      })
    );

    setFormInfo("Arbeitszeitmodell gespeichert.");
  }

  // ===== Auswertung (sicher: kein Weißbildschirm) =====
  let rows: WochenAuswertung[] = [];
  let s: ReturnType<typeof zusammenfassung> | null = null;
  let errorMsg: string | null = null;

  try {
    rows = zeitkontoProMitarbeiter(mitarbeiter, eintraegeM, abwesenheitenM);
    s = zusammenfassung(rows);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
  }
  // ===== A8 Listen-Views (für Anzeige / Löschen) =====
  const wochenEintraegeView = eintraegeM;
  const abwesenheitenView = abwesenheitenM;

  // ===== UI =====
  return (
  <div className={ui.page}>
    {/* Header */}
   <div className={ui.headerRow}>
  <div>
    <div className={ui.title}>Zeitkonto</div>
    <div className={ui.subtitle}>{mitarbeiter ? mitarbeiter.name : "—"}</div>
  </div>

    <EntryAndAbsenceForms
  newWoche={newWoche}
  setNewWoche={setNewWoche}
  normalizedNewWoche={normalizedNewWoche}
  willOverwrite={willOverwrite}
  newIst={newIst}
  setNewIst={setNewIst}
  istInvalid={istInvalid}
  normalizeIsoWeek={normalizeIsoWeek}
  addWochenEintrag={addWochenEintrag}
  abwWoche={abwWoche}
  setAbwWoche={setAbwWoche}
  abwTag={abwTag}
  setAbwTag={setAbwTag}
  abwArt={abwArt}
  setAbwArt={setAbwArt}
  abwStunden={abwStunden}
  setAbwStunden={setAbwStunden}
  addAbwesenheit={addAbwesenheit}
  abwError={abwError}
/>

      <div className="flex flex-wrap items-center gap-2">
        <button className={ui.btnSecondary} type="button" onClick={resetToDemoData}>
    Reset (Demo-Daten)
  </button>

        {/* Optional: falls du Export/Import/Snapshot Buttons schon hast */}
        {typeof saveSnapshot === "function" && (
          <button className={ui.btnSecondary} type="button" onClick={() => saveSnapshot("manuell")}>
            Snapshot speichern
          </button>
        )}

        {typeof restoreSnapshot === "function" && (
          <button className={ui.btnSecondary} type="button" onClick={restoreSnapshot}>
            Snapshot wiederherstellen
          </button>
        )}

        {typeof exportAll === "function" && (
          <button className={ui.btnSecondary} type="button" onClick={exportAll}>
            Export JSON
          </button>
        )}

        {typeof importAll === "function" && (
          <button className={ui.btnSecondary} type="button" onClick={importAll}>
            Import JSON
          </button>
        )}
      </div>
    </div>

    {/* Fehler-/Info-Boxen */}
    {errorMsg && (
      <div className={`${ui.card} ${ui.cardBody} border-red-700/40`}>
        <div className="text-red-200 text-sm">Fehler: {errorMsg}</div>
      </div>
    )}

    {(formError || formInfo) && (
      <div className={`${ui.card} ${ui.cardBody}`}>
        {formError && <div className="text-sm text-red-300">Fehler: {formError}</div>}
        {formInfo && <div className="text-sm text-emerald-300">{formInfo}</div>}
      </div>
    )}

    {/* Filter / Steuerung */}
    <div className={`${ui.card} ${ui.cardBody}`}>
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Mitarbeiter</label>
          <select className={ui.select} value={mitarbeiterId} onChange={(e) => setMitarbeiterId(e.target.value)}>
            {mitarbeiterListe.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={ui.label}>Von Woche</label>
          <input className={ui.input} value={fromWoche} onChange={(e) => setFromWoche(e.target.value)} placeholder="2025-W01" />
        </div>

        <div className="flex flex-col gap-1">
          <label className={ui.label}>Bis Woche</label>
          <input className={ui.input} value={toWoche} onChange={(e) => setToWoche(e.target.value)} placeholder="2025-W53" />
        </div>

        <div className={ui.hint}>Format: YYYY-WNN (z.B. 2025-W05)</div>
      </div>
    </div>

    {/* Tabelle Auswertung */}
    <div className={ui.tableWrap}>
      <table className={ui.table}>
        <thead className={ui.thead}>
          <tr>
            <th className={ui.th}>Woche</th>
            <th className={ui.th}>IST</th>
            <th className={ui.th}>SOLL</th>
            <th className={ui.th}>Abw</th>
            <th className={ui.th}>eSOLL</th>
            <th className={ui.th}>Δ</th>
            <th className={ui.th}>Saldo</th>
            <th className={ui.th}>Urlaub</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.mitarbeiterId}-${r.woche}`} className={ui.tr}>
              <td className={ui.tdStrong}>{r.woche}</td>
              <td className={ui.td}>{r.istStunden}</td>
              <td className={ui.td}>{r.sollStunden}</td>
              <td className={ui.td}>{r.abwesenheitStunden}</td>
              <td className={ui.td}>{r.effektivesSoll}</td>
              <td className={ui.td + " " + (r.delta < 0 ? "text-red-400" : "text-emerald-400")}>{r.delta}</td>
              <td className={ui.td}>{r.saldo}</td>
              <td className={ui.td}>{r.urlaubstage.toFixed(2)}</td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-zinc-500">
                Keine Daten im gewählten Zeitraum
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {/* Zusammenfassung */}
<div className={`${ui.card} ${ui.cardBody}`}>
  <div className="font-semibold">Zusammenfassung</div>

  {errorMsg ? (
    <div className={ui.alertError}>Fehler: {errorMsg}</div>
  ) : s ? (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div>IST gesamt</div>
      <div className="text-right">{s.sumIst}</div>

      <div>SOLL gesamt</div>
      <div className="text-right">{s.sumSoll}</div>

      <div>eSOLL gesamt</div>
      <div className="text-right">{s.sumEffSoll}</div>

      <div>Abwesenheit</div>
      <div className="text-right">{s.sumAbw}</div>

      <div>Δ gesamt</div>
      <div className="text-right">{s.sumDelta}</div>

      <div>Urlaub (Tage)</div>
      <div className="text-right">{s.sumUrlaubTage.toFixed(2)}</div>

      <div className="font-semibold">End-Saldo</div>
      <div className="text-right font-semibold">{s.endSaldo}</div>
    </div>
  ) : (
    <div className={ui.alertInfo}>Keine Auswertung verfügbar.</div>
  )}
</div>

    {/* ===== A10.2 Mitarbeiter verwalten ===== */}
    <div className={`${ui.card} ${ui.cardBody}`}>
      <div className="font-semibold">Mitarbeiter verwalten</div>

      {/* Neue Mitarbeiter Maske (falls du A10.1/A10.2 State/Handler hast) */}
      {typeof addMitarbeiter === "function" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Neue ID</label>
            <input className={ui.input + " w-40"} value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} placeholder="z.B. peter" />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Name</label>
            <input className={ui.input + " w-64"} value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="z.B. Peter Häusler" />
          </div>

          <button className={ui.btnPrimary} type="button" onClick={addMitarbeiter}>
            Mitarbeiter hinzufügen
          </button>
        </div>
      )}

      <div className="space-y-2">
        {mitarbeiterListe.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-xl border border-zinc-800 p-3">
            <div className="text-sm">
              <div className="font-medium">{m.name}</div>
              <div className="text-zinc-400">ID: {m.id}</div>
            </div>

            {typeof deleteMitarbeiter === "function" ? (
              <button className={ui.btnDanger} type="button" onClick={() => deleteMitarbeiter(m.id)}>
                Löschen
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>

    {/* ===== A10.3 Arbeitszeitmodell bearbeiten ===== */}
    <div className={`${ui.card} ${ui.cardBody}`}>
      <div className="font-semibold">Arbeitszeitmodell (Wochentage)</div>
      <div className={ui.subtitle}>
        Bearbeite Sollstunden und Urlaubswert pro Tag für: <span className="font-medium text-zinc-200">{mitarbeiter.name}</span>
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead className={ui.thead}>
            <tr>
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
                      className={ui.numberInput + " w-28"}
                      type="number"
                      min={0}
                      step={0.5}
                      value={rule.sollStunden}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateTagesRegel(t, { sollStunden: Number.isFinite(v) && v >= 0 ? v : 0 });
                      }}
                    />
                  </td>

                  <td className={ui.td}>
                    <select
                      className={ui.select}
                      value={rule.urlaubswert}
                      onChange={(e) => updateTagesRegel(t, { urlaubswert: Number(e.target.value) as any })}
                    >
                      <option value={0}>0</option>
                      <option value={0.5}>0.5</option>
                      <option value={1}>1.0</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

        <Lists
      wochenEintraegeView={wochenEintraegeView}
      abwesenheitenView={abwesenheitenView}
      deleteWochenEintrag={deleteWochenEintrag}
      deleteAbwesenheit={deleteAbwesenheitByIndex}
    />
  </div>
);
}
