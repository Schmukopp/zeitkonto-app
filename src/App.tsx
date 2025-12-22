import { useEffect, useMemo, useState } from "react";
import { ui } from "./ui/ui";

import { zeitkontoProMitarbeiter, zusammenfassung } from "@core/services/timeAccount";
import type { Mitarbeiter, WochenEintrag, AbwesenheitEintrag, WochenAuswertung } from "@core/models/types";

import mitarbeiterData from "./data/mitarbeiter.json";
import eintraegeData from "./data/eintraege.json";
import abwesenheitenData from "./data/abwesenheiten.json";

import { EntryAndAbsenceForms } from "./ui/Forms";
import { Lists } from "./ui/Lists";
import { MitarbeiterMaske, type TagesBuchung } from "./ui/MitarbeiterMaske";

// ===== Storage Keys =====
const KEY_M = "zeitkonto.mitarbeiter";
const KEY_E = "zeitkonto.eintraege";
const KEY_A = "zeitkonto.abwesenheiten";
const KEY_SNAPSHOT = "zeitkonto.snapshot.v1";

// NEU (parallel)
const KEY_TB = "zeitkonto.tagesbuchungen.v1";

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
  const m = /^(\d{4})-W(\d{1,2})$/i.exec((input ?? "").trim());
  if (!m) return null;
  const year = m[1];
  const weekNum = Number(m[2]);
  if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 53) return null;
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function compareIsoWeek(a: string, b: string) {
  return a.localeCompare(b);
}

function eqId(a: string, b: string) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];
function isoDateToWochenTag(iso: string): WochenTag | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const wd = dt.getDay(); // 0=So ... 6=Sa
  if (wd === 1) return "mo";
  if (wd === 2) return "di";
  if (wd === 3) return "mi";
  if (wd === 4) return "do";
  if (wd === 5) return "fr";
  return null; // Sa/So
}


type Snapshot = {
  mitarbeiter: Mitarbeiter[];
  eintraege: WochenEintrag[];
  abwesenheiten: AbwesenheitEintrag[];
  savedAt: string;
};

export default function App() {
  // ===== Initialdaten =====
  const initialMitarbeiter = mitarbeiterData as Mitarbeiter[];
  const initialEintraege = eintraegeData as WochenEintrag[];
  const initialAbwesenheiten = abwesenheitenData as AbwesenheitEintrag[];

  // ===== Persistierte States =====
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>(() => loadFromStorage(KEY_M, initialMitarbeiter));
  const [eintraege, setEintraege] = useState<WochenEintrag[]>(() => loadFromStorage(KEY_E, initialEintraege));
  const [abwesenheiten, setAbwesenheiten] = useState<AbwesenheitEintrag[]>(() => loadFromStorage(KEY_A, initialAbwesenheiten));

  // NEU: Tagesbuchungen parallel
  const [tagesBuchungen, setTagesBuchungen] = useState<TagesBuchung[]>(() => loadFromStorage(KEY_TB, []));

  useEffect(() => saveToStorage(KEY_M, mitarbeiterListe), [mitarbeiterListe]);
  useEffect(() => saveToStorage(KEY_E, eintraege), [eintraege]);
  useEffect(() => saveToStorage(KEY_A, abwesenheiten), [abwesenheiten]);
  useEffect(() => saveToStorage(KEY_TB, tagesBuchungen), [tagesBuchungen]);

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
        savedAt: new Date().toISOString()
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
      if (!raw) return setFormError("Kein Snapshot vorhanden.");
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
    if (mitarbeiterListe.length === 0) return;
    const exists = mitarbeiterListe.some((m) => m.id === mitarbeiterId);
    if (!exists) setMitarbeiterId(mitarbeiterListe[0]!.id);
  }, [mitarbeiterListe, mitarbeiterId]);

  const mitarbeiter = mitarbeiterListe.find((m) => m.id === mitarbeiterId) ?? null;

  const fromN = normalizeIsoWeek(fromWoche);
  const toN = normalizeIsoWeek(toWoche);
  const rangeOk = !!fromN && !!toN && compareIsoWeek(fromN, toN) <= 0;

  const inRange = (w: string) => {
    if (!rangeOk) return true;
    const wn = normalizeIsoWeek(w) ?? w;
    return compareIsoWeek(wn, fromN!) >= 0 && compareIsoWeek(wn, toN!) <= 0;
  };

  // ===== Gefilterte Views =====
  const eintraegeM = useMemo(() => {
    if (!mitarbeiter) return [];
    return eintraege
      .filter((e) => eqId(e.mitarbeiterId, mitarbeiter.id) && inRange(e.woche))
      .slice()
      .sort((a, b) => compareIsoWeek(a.woche, b.woche));
  }, [eintraege, mitarbeiter, fromWoche, toWoche]);

  const abwesenheitenM = useMemo(() => {
    if (!mitarbeiter) return [];
    const order: Record<WochenTag, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5 };
    return abwesenheiten
      .filter((a) => eqId(a.mitarbeiterId, mitarbeiter.id) && inRange(a.woche))
      .slice()
      .sort((a, b) => {
        const w = compareIsoWeek(a.woche, b.woche);
        if (w !== 0) return w;
        return (order[a.tag as WochenTag] ?? 99) - (order[b.tag as WochenTag] ?? 99);
      });
  }, [abwesenheiten, mitarbeiter, fromWoche, toWoche]);

  // ===== Forms State (controlled) =====
  const [newWoche, setNewWoche] = useState("");
  const normalizedNewWoche = normalizeIsoWeek(newWoche);

  const [newIst, setNewIst] = useState<number>(0);

  const willOverwrite = useMemo(() => {
    if (!mitarbeiter || !normalizedNewWoche) return false;
    return eintraege.some((e) => eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === normalizedNewWoche);
  }, [eintraege, mitarbeiter, normalizedNewWoche]);

  const istInvalid = !Number.isFinite(newIst) || newIst < 0;

  const [abwWoche, setAbwWoche] = useState("");
  const [abwTag, setAbwTag] = useState<WochenTag>("mo");
  const [abwArt, setAbwArt] = useState<"urlaub" | "krank" | "feiertag" | "unbezahlt">("urlaub");
  const [abwStunden, setAbwStunden] = useState<number>(0);

  function addWochenEintrag() {
    if (!mitarbeiter) return;

    setFormError(null);
    setFormInfo(null);

    if (!normalizedNewWoche) return setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
    if (istInvalid) return setFormError("IST-Stunden müssen eine Zahl >= 0 sein.");

    saveSnapshot("vor Wochen-Eintrag");

    const entry: WochenEintrag = {
      mitarbeiterId: mitarbeiter.id,
      woche: normalizedNewWoche,
      istStunden: newIst
    };

    setEintraege((prev) => {
      const next = prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === normalizedNewWoche));
      next.push(entry);
      next.sort((a, b) => {
        const idCmp = a.mitarbeiterId.localeCompare(b.mitarbeiterId);
        return idCmp !== 0 ? idCmp : compareIsoWeek(a.woche, b.woche);
      });
      return next;
    });

    setFormInfo(willOverwrite ? "Eintrag überschrieben." : "Eintrag gespeichert.");
    setNewWoche("");
    setNewIst(0);
  }

  function addAbwesenheit() {
    if (!mitarbeiter) return;

    setFormError(null);
    setFormInfo(null);

    const w = normalizeIsoWeek(abwWoche);
    if (!w) return setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
    if (!Number.isFinite(abwStunden) || abwStunden < 0) return setFormError("Stunden müssen eine Zahl >= 0 sein.");

    const tagesSoll = mitarbeiter.modell.tage[abwTag]?.sollStunden ?? 0;
    if (tagesSoll <= 0) return setFormError(`Am ${abwTag.toUpperCase()} ist bei ${mitarbeiter.name} kein Arbeitstag (SOLL=0).`);
    if (abwStunden > tagesSoll)
      return setFormError(
        `Abwesenheit (${abwStunden}h) darf Tages-SOLL (${tagesSoll}h) am ${abwTag.toUpperCase()} nicht überschreiten.`
      );

    saveSnapshot("vor Abwesenheit");

    const item: AbwesenheitEintrag = {
      mitarbeiterId: mitarbeiter.id,
      woche: w,
      tag: abwTag,
      art: abwArt,
      stunden: abwStunden
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

    setFormInfo("Abwesenheit hinzugefügt.");
    setAbwWoche("");
    setAbwStunden(0);
    setAbwArt("urlaub");
    setAbwTag("mo");
  }

  function deleteWochenEintrag(woche: string) {
    if (!mitarbeiter) return;
    saveSnapshot("vor Wochen-Eintrag löschen");
    setEintraege((prev) => prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === woche)));
    setFormInfo("Wochen-Eintrag gelöscht.");
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

  // ===== Mitarbeiter anlegen/löschen + Modell bearbeiten =====
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmpName, setNewEmpName] = useState("");

  function addMitarbeiter() {
    setFormError(null);
    setFormInfo(null);

    const id = newEmpId.trim();
    const name = newEmpName.trim();
    if (!id) return setFormError("Neue ID fehlt.");
    if (!name) return setFormError("Neuer Name fehlt.");

    const exists = mitarbeiterListe.some((m) => eqId(m.id, id));
    if (exists) return setFormError("Diese ID existiert bereits.");

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
          fr: { sollStunden: 8, urlaubswert: 1.0 }
        }
      }
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
    // parallel: Tagesbuchungen mit löschen
    setTagesBuchungen((prev) => prev.filter((b) => !eqId(b.mitarbeiterId, id)));
    setFormInfo("Mitarbeiter gelöscht.");
  }

  function updateTagesRegel(tag: WochenTag, patch: Partial<{ sollStunden: number; urlaubswert: number }>) {
    if (!mitarbeiter) return;
    saveSnapshot("vor Arbeitszeitmodell ändern");

    setMitarbeiterListe((prev) =>
      prev.map((m) => {
        if (!eqId(m.id, mitarbeiter.id)) return m;
        const oldRule = m.modell.tage[tag];
        const nextRule = { ...oldRule, ...patch };
        return { ...m, modell: { ...m.modell, tage: { ...m.modell.tage, [tag]: nextRule } } };
      })
    );

    setFormInfo("Arbeitszeitmodell gespeichert.");
  }

  // ===== Tagesbuchungen: add/delete (parallel) =====
  function addTagesBuchung(b: Omit<TagesBuchung, "id">) {
    // kein Snapshot: bewusst getrennt vom Wochen-Workflow
    setTagesBuchungen((prev) => {
      const next: TagesBuchung[] = prev.slice();
      next.push({ ...b, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` });
      // sort: Mitarbeiter, Datum, id
      next.sort((x, y) => {
        const idCmp = x.mitarbeiterId.localeCompare(y.mitarbeiterId);
        if (idCmp !== 0) return idCmp;
        const dCmp = x.datum.localeCompare(y.datum);
        if (dCmp !== 0) return dCmp;
        return x.id.localeCompare(y.id);
      });
      return next;
    });
  }

  function deleteTagesBuchung(id: string) {
    setTagesBuchungen((prev) => prev.filter((b) => b.id !== id));
  }

  // ===== Auswertung (safe) =====
  let rows: WochenAuswertung[] = [];
  let s: ReturnType<typeof zusammenfassung> | null = null;
  let errorMsg: string | null = null;

  if (mitarbeiter) {
    try {
      rows = zeitkontoProMitarbeiter(mitarbeiter, eintraegeM, abwesenheitenM);
      s = zusammenfassung(rows);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
    }
  }

  // ===== UI =====
  if (!mitarbeiter) return <div className={ui.page}>Kein Mitarbeiter gefunden.</div>;

  return (
    <div className={ui.page}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className={ui.title}>Zeitkonto</div>
          <div className={ui.subtitle}>{mitarbeiter.name}</div>
        </div>

        <div className="flex items-center gap-2">
          <button className={ui.btnSecondary} type="button" onClick={() => saveSnapshot("manuell")}>
            Snapshot speichern
          </button>
          <button className={ui.btnSecondary} type="button" onClick={restoreSnapshot} disabled={!hasSnapshot}>
            Snapshot laden
          </button>
          <button className={ui.btnSecondary} type="button" onClick={clearSnapshot} disabled={!hasSnapshot}>
            Snapshot löschen
          </button>
          <button className={ui.btnSecondary} type="button" onClick={resetToDemoData}>
            Reset (Demo-Daten)
          </button>
        </div>
      </div>

      {snapshotAt ? <div className={ui.hint}>Snapshot: {snapshotAt}</div> : null}

      {/* Steuerung */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Steuerung</div>

        <div className="flex flex-wrap gap-6">
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
            <div className={ui.hint}>Format: 2025-W05</div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Bis Woche</label>
            <input className={ui.input} value={toWoche} onChange={(e) => setToWoche(e.target.value)} placeholder="2025-W53" />
          </div>
        </div>

        {!rangeOk ? <div className="mt-3 text-sm text-amber-300">Hinweis: Zeitraum ist ungültig – Filter ist aktuell aus.</div> : null}
        {errorMsg ? <div className="mt-3 text-sm text-red-300">Fehler: {errorMsg}</div> : null}
      </div>

      {/* NEU: Mitarbeiter-Maske (Tagesbuchungen parallel) */}
      <MitarbeiterMaske
  ui={ui}
  mitarbeiterId={mitarbeiter.id}
  mitarbeiterName={mitarbeiter.name}
  getTagesSoll={(isoDate) => {
    const t = isoDateToWochenTag(isoDate);
    if (!t) return 0; // Wochenende
    return mitarbeiter.modell.tage[t]?.sollStunden ?? 0;
  }}
  tagesBuchungen={tagesBuchungen}
  addTagesBuchung={addTagesBuchung}
  deleteTagesBuchung={deleteTagesBuchung}
/>


      {/* Eingaben (Wochen + Abwesenheit; bleibt wie es ist) */}
      <EntryAndAbsenceForms
        ui={ui}
        mitarbeiter={mitarbeiter}
        newWoche={newWoche}
        setNewWoche={setNewWoche}
        normalizedNewWoche={normalizedNewWoche}
        willOverwrite={willOverwrite}
        newIst={newIst}
        setNewIst={setNewIst}
        istInvalid={istInvalid}
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
        formError={formError}
        formInfo={formInfo}
        normalizeIsoWeek={normalizeIsoWeek}
      />

      {/* Listen */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Aktuelle Listen (gefiltert)</div>
        <Lists
          wochenEintraegeView={eintraegeM}
          abwesenheitenView={abwesenheitenM}
          deleteWochenEintrag={deleteWochenEintrag}
          deleteAbwesenheit={deleteAbwesenheitByIndex}
        />
      </div>

      {/* Mitarbeiter verwalten */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Mitarbeiter verwalten</div>
        <div className={ui.subtitle}>Neuen Mitarbeiter anlegen oder löschen.</div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Neue ID</label>
            <input className={ui.input} value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} placeholder="z.B. peter" />
          </div>

          <div className="flex flex-col gap-1">
            <label className={ui.label}>Name</label>
            <input className={ui.input} value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="Peter Müller" />
          </div>

          <button type="button" className={ui.btnPrimary} onClick={addMitarbeiter}>
            Anlegen
          </button>
        </div>

        <div className="pt-4 space-y-2">
          {mitarbeiterListe.map((m) => (
            <div key={m.id} className="flex items-center justify-between border-t border-zinc-800 pt-2">
              <div className="text-sm">
                <span className="font-medium">{m.name}</span> <span className="text-zinc-500">({m.id})</span>
              </div>

              <button type="button" className={ui.btnDanger} onClick={() => deleteMitarbeiter(m.id)}>
                Löschen
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Arbeitszeitmodell */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Arbeitszeitmodell (Wochentage)</div>
        <div className={ui.subtitle}>Sollstunden und Urlaubswert pro Tag für: {mitarbeiter.name}</div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-zinc-300">
              <tr>
                <th className="p-2 text-left">Tag</th>
                <th className="p-2 text-right">SOLL (h)</th>
                <th className="p-2 text-right">Urlaubswert</th>
              </tr>
            </thead>
            <tbody>
              {WOCHENTAGE.map((t) => {
                const rule = mitarbeiter.modell.tage[t];
                return (
                  <tr key={t} className="border-t border-zinc-800">
                    <td className="p-2 font-medium">{t.toUpperCase()}</td>
                    <td className="p-2 text-right">
                      <input
                        className={`${ui.numberInput} w-24 text-right`}
                        type="number"
                        step="0.5"
                        min={0}
                        value={rule?.sollStunden ?? 0}
                        onChange={(e) => updateTagesRegel(t, { sollStunden: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <input
                        className={`${ui.numberInput} w-24 text-right`}
                        type="number"
                        step="0.25"
                        min={0}
                        value={rule?.urlaubswert ?? 0}
                        onChange={(e) => updateTagesRegel(t, { urlaubswert: Number(e.target.value) })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={ui.hint}>
          Tipp: Wenn ein Tag SOLL=0 ist, ist das ein Nicht-Arbeitstag. Dann darf dort keine Abwesenheit erfasst werden.
        </div>
      </div>

      {/* Wochenübersicht (kompakt) */}
<div className={`${ui.card} ${ui.cardBody}`}>
  <div className="flex items-end justify-between gap-4">
    <div>
      <div className="font-semibold">Wochenübersicht</div>
      <div className={ui.subtitle}>Kompakt: Ü-Stunden und Überstundenkonto</div>
    </div>

    {s ? (
      <div className="text-sm text-zinc-400">
        Überstundenkonto aktuell:{" "}
        <span className={"tabular-nums font-semibold " + (s.endSaldo < 0 ? "text-red-300" : "text-emerald-300")}>
          {s.endSaldo}
        </span>{" "}
        h
      </div>
    ) : null}
  </div>

  <div className="mt-3 overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="text-zinc-300">
        <tr>
          <th className="p-2 text-left">Woche</th>
          <th className="p-2 text-right">Ü-Stunden</th>
          <th className="p-2 text-right">Überstundenkonto</th>
          <th className="p-2 text-right">Urlaub (Tage)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.woche} className="border-t border-zinc-800">
            <td className="p-2 font-medium">{r.woche}</td>

            <td className={"p-2 text-right tabular-nums " + (r.delta < 0 ? "text-red-300" : "text-emerald-300")}>
              {r.delta}
            </td>

            <td className="p-2 text-right tabular-nums">{r.saldo}</td>

            <td className="p-2 text-right tabular-nums">{r.urlaubstage.toFixed(2)}</td>
          </tr>
        ))}

        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="p-6 text-center text-zinc-500">
              Keine Daten im gewählten Zeitraum
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>

  <div className={ui.hint + " mt-3"}>
    Ü-Stunden = Wochen-Differenz (Arbeit vs effektivem SOLL). Überstundenkonto = laufender Stand.
  </div>
</div>


      {/* Zusammenfassung */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Zusammenfassung</div>

        {s ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>IST gesamt</div>
            <div className="text-right tabular-nums">{s.sumIst}</div>

            <div>SOLL gesamt</div>
            <div className="text-right tabular-nums">{s.sumSoll}</div>

            <div>eSOLL gesamt</div>
            <div className="text-right tabular-nums">{s.sumEffSoll}</div>

            <div>Abwesenheit</div>
            <div className="text-right tabular-nums">{s.sumAbw}</div>

            <div>Δ gesamt</div>
            <div className="text-right tabular-nums">{s.sumDelta}</div>

            <div>Urlaub (Tage)</div>
            <div className="text-right tabular-nums">{s.sumUrlaubTage.toFixed(2)}</div>

            <div className="font-semibold">End-Saldo</div>
            <div className="text-right tabular-nums font-semibold">{s.endSaldo}</div>
          </div>
        ) : (
          <div className="text-sm text-zinc-400">Keine Auswertung verfügbar.</div>
        )}
      </div>
    </div>
  );
}
