import { useEffect, useMemo, useState } from "react";

import { zeitkontoProMitarbeiter, zusammenfassung } from "@core/services/timeAccount";
import type { Mitarbeiter, WochenEintrag, AbwesenheitEintrag, WochenAuswertung } from "@core/models/types";

import mitarbeiterData from "./data/mitarbeiter.json";
import eintraegeData from "./data/eintraege.json";
import abwesenheitenData from "./data/abwesenheiten.json";

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
  const KEY_M = "zeitkonto.mitarbeiter";
const KEY_E = "zeitkonto.eintraege";
const KEY_A = "zeitkonto.abwesenheiten";

const KEY_SNAPSHOT = "zeitkonto.snapshot.v1";

}

function normalizeIsoWeek(input: string): string | null {
  // akzeptiert: 2025-W5, 2025-W05, 2025-w5, 2025-w05
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

// ===== UI Types =====
type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

type AbwesenheitsArt = "urlaub" | "krank" | "feiertag" | "unbezahlt";

export default function App() {
  // ===== Initialdaten =====
  const initialMitarbeiter = mitarbeiterData as Mitarbeiter[];
  const initialEintraege = eintraegeData as WochenEintrag[];
  const initialAbwesenheiten = abwesenheitenData as AbwesenheitEintrag[];

  // ===== State: Mitarbeiter / Einträge / Abwesenheiten (A10.1) =====
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>(
    () => loadFromStorage("zeitkonto.mitarbeiter", initialMitarbeiter)
  );
  const [eintraege, setEintraege] = useState<WochenEintrag[]>(
    () => loadFromStorage("zeitkonto.eintraege", initialEintraege)
  );
  const [abwesenheiten, setAbwesenheiten] = useState<AbwesenheitEintrag[]>(
    () => loadFromStorage("zeitkonto.abwesenheiten", initialAbwesenheiten)
  );
type Snapshot = {
  mitarbeiter: Mitarbeiter[];
  eintraege: WochenEintrag[];
  abwesenheiten: AbwesenheitEintrag[];
  savedAt: string; // ISO timestamp
};

const [hasSnapshot, setHasSnapshot] = useState<boolean>(() => {
  try {
    return !!localStorage.getItem("zeitkonto.snapshot.v1");
  } catch {
    return false;
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
    localStorage.setItem("zeitkonto.snapshot.v1", JSON.stringify(snap));
    setHasSnapshot(true);
    setFormInfo(`Snapshot gespeichert (${reason}).`);
  } catch (err) {
    setFormError(err instanceof Error ? err.message : "Snapshot konnte nicht gespeichert werden.");
  }
}

function restoreSnapshot() {
  try {
    const raw = localStorage.getItem("zeitkonto.snapshot.v1");
    if (!raw) {
      setFormError("Kein Snapshot vorhanden.");
      return;
    }
    const snap = JSON.parse(raw) as Snapshot;
    setMitarbeiterListe(snap.mitarbeiter);
    setEintraege(snap.eintraege);
    setAbwesenheiten(snap.abwesenheiten);
    setHasSnapshot(true);
    setFormInfo(`Snapshot wiederhergestellt (${snap.savedAt}).`);
  } catch (err) {
    setFormError(err instanceof Error ? err.message : "Snapshot konnte nicht wiederhergestellt werden.");
  }
}

function clearSnapshot() {
  try {
    localStorage.removeItem("zeitkonto.snapshot.v1");
    setHasSnapshot(false);
    setFormInfo("Snapshot gelöscht.");
  } catch (err) {
    setFormError(err instanceof Error ? err.message : "Snapshot konnte nicht gelöscht werden.");
  }
}


  // Persistenz
  useEffect(() => saveToStorage("zeitkonto.mitarbeiter", mitarbeiterListe), [mitarbeiterListe]);
  useEffect(() => saveToStorage("zeitkonto.eintraege", eintraege), [eintraege]);
  useEffect(() => saveToStorage("zeitkonto.abwesenheiten", abwesenheiten), [abwesenheiten]);

  
  // ===== Auswahl / Filter =====
  const [mitarbeiterId, setMitarbeiterId] = useState(mitarbeiterListe[0]?.id ?? "");
  const [fromWoche, setFromWoche] = useState("2025-W01");
  const [toWoche, setToWoche] = useState("2025-W53");

  // Sicherstellen, dass eine gültige Auswahl existiert (Rules of Hooks: immer vor returns)
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

  // Falls keine Mitarbeiter vorhanden
  if (mitarbeiterListe.length === 0) {
    return <div className="p-6">Keine Mitarbeiter vorhanden.</div>;
  }
  if (!mitarbeiter) {
    return <div className="p-6">Kein Mitarbeiter gefunden.</div>;
  }

  // ===== A8 Form-States =====
  const [newWoche, setNewWoche] = useState("2025-W50");
  const [newIst, setNewIst] = useState<number>(40);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
useEffect(() => {
  if (!formError && !formInfo) return;

  const t = window.setTimeout(() => {
    setFormError(null);
    setFormInfo(null);
  }, 5000);

  return () => window.clearTimeout(t);
}, [formError, formInfo])

  const [abwWoche, setAbwWoche] = useState("2025-W50");
  const [abwTag, setAbwTag] = useState<WochenTag>("mi");
  const [abwArt, setAbwArt] = useState<AbwesenheitsArt>("urlaub");
  const [abwStunden, setAbwStunden] = useState<number>(5);
  const [abwError, setAbwError] = useState<string | null>(null);

  // ===== A10.3 Mitarbeiter verwalten States =====
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmpName, setNewEmpName] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [deleteWithData, setDeleteWithData] = useState(true);

  // ===== Gefilterte Daten (Memo) =====
  const eintraegeM = useMemo(
    () => eintraege.filter((e) => eqId(e.mitarbeiterId, mitarbeiter.id) && inRange(e.woche)),
    [eintraege, mitarbeiter.id, fromWoche, toWoche]
  );
const normalizedNewWoche = normalizeIsoWeek(newWoche);

const willOverwrite =
  !!normalizedNewWoche &&
  eintraege.some(
    (e) => eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === normalizedNewWoche
  );

const istInvalid = !Number.isFinite(newIst) || newIst < 0;


  const abwesenheitenM = useMemo(
    () => abwesenheiten.filter((a) => eqId(a.mitarbeiterId, mitarbeiter.id) && inRange(a.woche)),
    [abwesenheiten, mitarbeiter.id, fromWoche, toWoche]
  );

  // ===== A11.9 Handler =====
  function addWochenEintrag() {
    saveSnapshot("vor Wochen-Eintrag");

  // niemals setState im Render-Pfad, nur hier im Handler
  setFormError(null);
  setFormInfo(null);
  saveSnapshot("vor Wochen-Eintrag");


  if (!mitarbeiterId) {
    setFormError("Kein Mitarbeiter ausgewählt.");
    return;
  }

  const norm = normalizeIsoWeek(newWoche);
  if (!norm) {
    setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
    return;
  }

  if (!Number.isFinite(newIst) || newIst < 0) {
    setFormError("IST-Stunden müssen eine Zahl >= 0 sein.");
    return;
  }

  // Hinweis, ob überschrieben wird (case-insensitive Id)
  const overwrote = eintraege.some(
    (e) => eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === norm
  );

  const newEntry: WochenEintrag = {
    mitarbeiterId,
    woche: norm,
    istStunden: newIst
  };
saveSnapshot("vor Wochen-Eintrag");
saveSnapshot("automatisch vor Wochen-Eintrag");
  setEintraege((prev) => {
    const next = prev.filter(
      (e) => !(eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === norm)
    );
    next.push(newEntry);
    next.sort((a, b) => {
      const idCmp = a.mitarbeiterId.localeCompare(b.mitarbeiterId);
      return idCmp !== 0 ? idCmp : compareIsoWeek(a.woche, b.woche);
    });
    return next;
  });

  setFormInfo(overwrote ? "Eintrag überschrieben." : "Eintrag gespeichert.");
  setNewIst(0);
}




  function deleteWochenEintrag(mitarbeiterIdDel: string, woche: string) {
    setEintraege((prev) => prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiterIdDel) && e.woche === woche)));
  }

  // ===== A8.2 Handler =====
  function addAbwesenheit() {
    
    saveSnapshot("vor Wochen-Eintrag");

    setAbwError(null);

    const aw = normalizeIsoWeek(abwWoche);
    if (!aw) {
      setAbwError("Woche muss im Format YYYY-WNN sein (z.B. 2025-W50).");
      return;
    }
    if (!Number.isFinite(abwStunden) || abwStunden < 0) {
      setAbwError("Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    setAbwWoche(aw);

    // Tages-SOLL aus Modell
    const tagesSoll = mitarbeiter.modell.tage[abwTag].sollStunden;

    // Keine Abwesenheit an freien Tagen
    if (tagesSoll <= 0) {
      setAbwError(`Am ${abwTag.toUpperCase()} ist bei ${mitarbeiter.name} kein Arbeitstag (SOLL=0).`);
      return;
    }

    // Abwesenheit darf Tages-SOLL nicht überschreiten
    if (abwStunden > tagesSoll) {
      setAbwError(`Abwesenheit (${abwStunden}h) darf Tages-SOLL (${tagesSoll}h) am ${abwTag.toUpperCase()} nicht überschreiten.`);
      return;
    }

    const entry: AbwesenheitEintrag = {
      mitarbeiterId: mitarbeiter.id,
      woche: aw,
      tag: abwTag,
      art: abwArt,
      stunden: abwStunden
    };

    // Upsert: gleiche Kombination überschreiben (Mitarbeiter+Woche+Tag+Art)
    saveSnapshot("automatisch vor Abwesenheit");
    setAbwesenheiten((prev) => {
      const next = prev.filter(
        (a) =>
          !(
            eqId(a.mitarbeiterId, entry.mitarbeiterId) &&
            a.woche === entry.woche &&
            a.tag === entry.tag &&
            a.art === entry.art
          )
      );
      next.push(entry);
      next.sort((a, b) => a.woche.localeCompare(b.woche));
      return next;
    });
  }

  function deleteAbwesenheitByIndex(indexInFiltered: number) {
    const target = abwesenheitenView[indexInFiltered];
    if (!target) return;

    setAbwesenheiten((prev) => {
      const idx = prev.findIndex(
        (a) =>
          eqId(a.mitarbeiterId, target.mitarbeiterId) &&
          a.woche === target.woche &&
          a.tag === target.tag &&
          a.art === target.art &&
          a.stunden === target.stunden
      );
      if (idx < 0) return prev;
      const copy = prev.slice();
      copy.splice(idx, 1);
      return copy;
    });
  }

  // Views
  const wochenEintraegeView = useMemo(
    () => eintraegeM.slice().sort((a, b) => b.woche.localeCompare(a.woche)),
    [eintraegeM]
  );

  const abwesenheitenView = useMemo(() => {
    const order: Record<WochenTag, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5 };
    return abwesenheitenM
      .slice()
      .sort((a, b) => {
        const w = b.woche.localeCompare(a.woche);
        if (w !== 0) return w;
        return (order[a.tag as WochenTag] ?? 99) - (order[b.tag as WochenTag] ?? 99);
      });
  }, [abwesenheitenM]);

  // ===== A10.3 Mitarbeiter anlegen/löschen =====
  function addMitarbeiter() {
    setEmpError(null);

    const id = newEmpId.trim();
    const name = newEmpName.trim();

    if (!id) {
      setEmpError("Bitte eine Mitarbeiter-ID eingeben (z.B. 'peter').");
      return;
    }
    if (!/^[a-z0-9_-]+$/i.test(id)) {
      setEmpError("ID darf nur Buchstaben, Zahlen, _ und - enthalten.");
      return;
    }
    if (!name) {
      setEmpError("Bitte einen Namen eingeben.");
      return;
    }
    if (mitarbeiterListe.some((m) => m.id.toLowerCase() === id.toLowerCase())) {
      setEmpError("Diese ID existiert bereits.");
      return;
    }

    const defaultModell: Mitarbeiter["modell"] = {
      typ: "wochentage",
      tage: {
        mo: { sollStunden: 8, urlaubswert: 1.0 },
        di: { sollStunden: 8, urlaubswert: 1.0 },
        mi: { sollStunden: 8, urlaubswert: 1.0 },
        do: { sollStunden: 8, urlaubswert: 1.0 },
        fr: { sollStunden: 0, urlaubswert: 0.0 }
      }
    };

    const neu: Mitarbeiter = { id, name, modell: defaultModell };
    setMitarbeiterListe((prev) => [...prev, neu]);
    setMitarbeiterId(id);
    setNewEmpId("");
    setNewEmpName("");
  }

  function deleteMitarbeiter(id: string) {
    const ok = window.confirm(
      deleteWithData
        ? `Mitarbeiter '${id}' löschen UND alle zugehörigen Einträge/Abwesenheiten ebenfalls löschen?`
        : `Mitarbeiter '${id}' löschen? (Einträge/Abwesenheiten bleiben bestehen)`
    );
    if (!ok) return;

    setMitarbeiterListe((prev) => prev.filter((m) => !eqId(m.id, id)));

    if (deleteWithData) {
      setEintraege((prev) => prev.filter((e) => !eqId(e.mitarbeiterId, id)));
      setAbwesenheiten((prev) => prev.filter((a) => !eqId(a.mitarbeiterId, id)));
    }
  }

  // ===== A10.3 Modell bearbeiten =====
  function updateTagesRegel(tag: WochenTag, patch: Partial<Mitarbeiter["modell"]["tage"][WochenTag]>) {
    setMitarbeiterListe((prev) =>
      prev.map((m) => {
        if (!eqId(m.id, mitarbeiter.id)) return m;
        return {
          ...m,
          modell: {
            ...m.modell,
            tage: {
              ...m.modell.tage,
              [tag]: {
                ...m.modell.tage[tag],
                ...patch
              }
            }
          }
        };
      })
    );
  }

  // ===== A10.2 Reset =====
  function resetToDemoData() {
    const ok = window.confirm("Alles auf Demo-/Startdaten zurücksetzen? (localStorage wird überschrieben)");
    if (!ok) return;

    setMitarbeiterListe(initialMitarbeiter);
    setEintraege(initialEintraege);
    setAbwesenheiten(initialAbwesenheiten);

    setMitarbeiterId(initialMitarbeiter[0]?.id ?? "");
    setFromWoche("2025-W01");
    setToWoche("2025-W53");
  }

  // ===== Auswertung (UI soll nicht weiß werden) =====
  let rows: WochenAuswertung[] = [];
  let s: ReturnType<typeof zusammenfassung> | null = null;
  let errorMsg: string | null = null;

  try {
    rows = zeitkontoProMitarbeiter(mitarbeiter, eintraegeM, abwesenheitenM);
    s = zusammenfassung(rows);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
  }

  // ===== UI =====
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-bold">Zeitkonto</div>
          <div className="text-sm text-gray-600">{mitarbeiter.name}</div>
        </div>
<div className="rounded-xl border p-4 space-y-2">
  <div className="font-semibold">Sicherung (Snapshot)</div>

  <div className="flex flex-wrap items-center gap-2">
    <button
      type="button"
      className="border rounded-lg px-3 py-2 text-sm"
      onClick={() => saveSnapshot("manuell")}
    >
      Snapshot speichern
    </button>

    <button
      type="button"
      className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
      onClick={restoreSnapshot}
      disabled={!hasSnapshot}
    >
      Snapshot zurückholen
    </button>

    <button
      type="button"
      className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
      onClick={clearSnapshot}
      disabled={!hasSnapshot}
    >
      Snapshot löschen
    </button>
  </div>

  <div className="text-sm text-gray-600">
    Status: {hasSnapshot ? "Snapshot vorhanden" : "Kein Snapshot vorhanden"}
  </div>
</div>

        <button className="border rounded-lg px-4 py-2 text-sm" type="button" onClick={resetToDemoData}>
          Reset (Demo-Daten)
        </button>
      </div>

      {/* Core-Fehler */}
      {errorMsg && (
        <div className="border border-red-300 bg-red-50 p-3 rounded-lg text-red-800 text-sm">
          Fehler in den Daten: {errorMsg}
        </div>
      )}

      {/* Filter / Auswahl */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Mitarbeiter</label>
            <select className="border rounded-lg p-2" value={mitarbeiterId} onChange={(e) => setMitarbeiterId(e.target.value)}>
              {mitarbeiterListe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Von</label>
            <input
              className="border rounded-lg p-2 w-32"
              value={fromWoche}
              onChange={(e) => setFromWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(fromWoche);
                if (n) setFromWoche(n);
              }}
              placeholder="2025-W01"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Bis</label>
            <input
              className="border rounded-lg p-2 w-32"
              value={toWoche}
              onChange={(e) => setToWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(toWoche);
                if (n) setToWoche(n);
              }}
              placeholder="2025-W53"
            />
          </div>
        </div>

        {!rangeOk && (
          <div className="text-sm text-amber-700">
            Hinweis: Zeitraum ungültig oder unvollständig – es werden aktuell alle Wochen angezeigt.
          </div>
        )}

        <div className="text-xs text-gray-500">Format: YYYY-WNN (z.B. 2025-W50)</div>
      </div>

      {/* A10.3 Mitarbeiter verwalten */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Mitarbeiter verwalten</div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Neue ID</label>
            <input className="border rounded-lg p-2 w-40" value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} placeholder="z.B. peter" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Name</label>
            <input className="border rounded-lg p-2 w-64" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="z.B. Peter Häusler" />
          </div>

          <button className="border rounded-lg px-4 py-2" type="button" onClick={addMitarbeiter}>
            Hinzufügen
          </button>
        </div>

        {empError && <div className="text-sm text-red-700">{empError}</div>}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={deleteWithData} onChange={(e) => setDeleteWithData(e.target.checked)} />
          Beim Löschen auch Einträge & Abwesenheiten entfernen
        </label>

        <div className="space-y-2">
          {mitarbeiterListe.map((m) => (
            <div key={m.id} className="flex items-center justify-between border rounded-lg p-3">
              <div className="text-sm">
                <div className="font-medium">{m.name}</div>
                <div className="text-gray-600">ID: {m.id}</div>
              </div>

              <button className="border rounded-lg px-3 py-1 text-sm" type="button" onClick={() => deleteMitarbeiter(m.id)}>
                Löschen
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* A10.3 Arbeitszeitmodell bearbeiten */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Arbeitszeitmodell (Wochentage)</div>
        <div className="text-sm text-gray-600">
          Bearbeite Sollstunden und Urlaubswert pro Tag für: <span className="font-medium">{mitarbeiter.name}</span>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-3">Tag</th>
                <th className="p-3">SOLL (h)</th>
                <th className="p-3">Urlaubswert</th>
              </tr>
            </thead>
            <tbody>
              {WOCHENTAGE.map((t) => {
                const rule = mitarbeiter.modell.tage[t];
                return (
                  <tr key={t} className="border-t">
                    <td className="p-3 font-medium">{t.toUpperCase()}</td>

                    <td className="p-3">
                      <input
                        className="border rounded-lg p-2 w-28"
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

                    <td className="p-3">
                      <select className="border rounded-lg p-2" value={rule.urlaubswert} onChange={(e) => updateTagesRegel(t, { urlaubswert: Number(e.target.value) as any })}>
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

      {/* A8.1 Wochen-Eintrag hinzufügen */}
<div className="rounded-xl border p-4 space-y-3">
  <div className="font-semibold">Wochen-Eintrag hinzufügen</div>

 <form
  className="flex flex-wrap items-end gap-3"
  onSubmit={(e) => {
    e.preventDefault();
    addWochenEintrag();
  }}
>
  <div className="flex flex-col gap-1">
    <label className="text-sm text-gray-600">Woche (ISO)</label>
    <input
      className={
        "border rounded-lg p-2 w-36 " +
        (newWoche.trim().length > 0 && !normalizedNewWoche ? "border-red-400" : "")
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
  <label className="text-sm text-gray-600">IST-Stunden</label>
  <input
    className={"border rounded-lg p-2 w-28 " + (istInvalid ? "border-red-400" : "")}
    type="number"
    step="0.5"
    min={0}
    value={Number.isFinite(newIst) ? newIst : 0}
    onChange={(e) => setNewIst(Number(e.target.value))}
  />
  {istInvalid && (
    <div className="text-xs text-red-700">Bitte eine Zahl ≥ 0 eingeben.</div>
  )}
</div>


  <button
    className="border rounded-lg px-4 py-2 disabled:opacity-50"
    type="submit"
    disabled={!normalizedNewWoche || istInvalid}

  >
    Hinzufügen
  </button>
</form>

  <div className="text-xs text-gray-500">
    {normalizedNewWoche ? (
      willOverwrite ? (
        <span className="text-amber-700">
          Achtung: Für diese Woche existiert bereits ein Eintrag – er wird überschrieben.
        </span>
      ) : (
        <span className="text-green-700">Neuer Eintrag – wird hinzugefügt.</span>
      )
    ) : (
      <span>Format: YYYY-WNN (z.B. 2025-W05)</span>
    )}
  </div>

  {formError && <div className="text-sm text-red-700">{formError}</div>}
  {formInfo && <div className="text-sm text-green-700">{formInfo}</div>}
</div>



      {/* A8.2 Abwesenheit hinzufügen */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Abwesenheit hinzufügen</div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Woche</label>
            <input
              className="border rounded-lg p-2 w-32"
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
            <label className="text-sm text-gray-600">Tag</label>
            <select className="border rounded-lg p-2" value={abwTag} onChange={(e) => setAbwTag(e.target.value as WochenTag)}>
              <option value="mo">MO</option>
              <option value="di">DI</option>
              <option value="mi">MI</option>
              <option value="do">DO</option>
              <option value="fr">FR</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Art</label>
            <select className="border rounded-lg p-2" value={abwArt} onChange={(e) => setAbwArt(e.target.value as AbwesenheitsArt)}>
              <option value="urlaub">urlaub</option>
              <option value="krank">krank</option>
              <option value="feiertag">feiertag</option>
              <option value="unbezahlt">unbezahlt</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Stunden</label>
            <input className="border rounded-lg p-2 w-28" type="number" min={0} step={0.5} value={abwStunden} onChange={(e) => setAbwStunden(Number(e.target.value))} />
          </div>

          <button className="border rounded-lg px-4 py-2" type="button" onClick={addAbwesenheit}>
            Hinzufügen
          </button>
        </div>

        {abwError && <div className="text-sm text-red-700">{abwError}</div>}
      </div>

      {/* A8.3 Listen */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Wochen-Einträge (aktuell gefiltert)</div>

        {wochenEintraegeView.length === 0 ? (
          <div className="text-sm text-gray-500">Keine Wochen-Einträge im Zeitraum.</div>
        ) : (
          <div className="space-y-2">
            {wochenEintraegeView.map((e) => (
              <div key={`${e.mitarbeiterId}-${e.woche}`} className="flex items-center justify-between border rounded-lg p-3">
                <div className="text-sm">
                  <div className="font-medium">{e.woche}</div>
                  <div className="text-gray-600">IST: {e.istStunden} h</div>
                </div>

                <button className="border rounded-lg px-3 py-1 text-sm" type="button" onClick={() => deleteWochenEintrag(e.mitarbeiterId, e.woche)}>
                  Löschen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Abwesenheiten (aktuell gefiltert)</div>

        {abwesenheitenView.length === 0 ? (
          <div className="text-sm text-gray-500">Keine Abwesenheiten im Zeitraum.</div>
        ) : (
          <div className="space-y-2">
            {abwesenheitenView.map((a, idx) => (
              <div key={`${a.mitarbeiterId}-${a.woche}-${a.tag}-${a.art}-${a.stunden}-${idx}`} className="flex items-center justify-between border rounded-lg p-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {a.woche} – {String(a.tag).toUpperCase()}
                  </div>
                  <div className="text-gray-600">
                    {a.art}: {a.stunden} h
                  </div>
                </div>

                <button className="border rounded-lg px-3 py-1 text-sm" type="button" onClick={() => deleteAbwesenheitByIndex(idx)}>
                  Löschen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabelle Auswertung */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">Woche</th>
              <th className="p-3">IST</th>
              <th className="p-3">SOLL</th>
              <th className="p-3">Abw</th>
              <th className="p-3">eSOLL</th>
              <th className="p-3">Δ</th>
              <th className="p-3">Saldo</th>
              <th className="p-3">Urlaub (T)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.mitarbeiterId}-${r.woche}`} className="border-t">
                <td className="p-3 font-medium">{r.woche}</td>
                <td className="p-3">{r.istStunden}</td>
                <td className="p-3">{r.sollStunden}</td>
                <td className="p-3">{r.abwesenheitStunden}</td>
                <td className="p-3">{r.effektivesSoll}</td>
                <td className="p-3">{r.delta}</td>
                <td className="p-3">{r.saldo}</td>
                <td className="p-3">{r.urlaubstage.toFixed(2)}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-gray-500" colSpan={8}>
                  Keine Einträge für diesen Mitarbeiter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Zusammenfassung */}
      {s && (
        <div className="rounded-xl border p-4 space-y-1 text-sm">
          <div className="font-semibold">Zusammenfassung</div>
          <div>IST gesamt: {s.sumIst}</div>
          <div>SOLL gesamt: {s.sumSoll}</div>
          <div>eSOLL gesamt: {s.sumEffSoll}</div>
          <div>Abwesenheit (h): {s.sumAbw}</div>
          <div>Δ gesamt: {s.sumDelta}</div>
          <div>Urlaub (Tage): {s.sumUrlaubTage.toFixed(2)}</div>
          <div>End-Saldo: {s.endSaldo}</div>
        </div>
      )}
    </div>
  );
}
