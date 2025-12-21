import { useEffect, useMemo, useState } from "react";
import { ui } from "./ui/ui";

import { zeitkontoProMitarbeiter, zusammenfassung } from "@core/services/timeAccount";
import type { Mitarbeiter, WochenEintrag, AbwesenheitEintrag, WochenAuswertung } from "@core/models/types";

import mitarbeiterData from "./data/mitarbeiter.json";
import eintraegeData from "./data/eintraege.json";
import abwesenheitenData from "./data/abwesenheiten.json";

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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function downloadJson(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
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

type Snapshot = {
  mitarbeiter: Mitarbeiter[];
  eintraege: WochenEintrag[];
  abwesenheiten: AbwesenheitEintrag[];
  savedAt: string; // ISO timestamp
};

// ===== Mini-Styles (schwarz/orange) =====
const k = {
  card: "rounded-2xl border border-zinc-800 bg-zinc-950/60 shadow-sm",
  cardBody: "p-4 md:p-5",
  title: "text-2xl font-bold text-zinc-100",
  subtitle: "text-sm text-zinc-400",
  label: "text-sm text-zinc-300",
  hint: "text-xs text-zinc-400",
  input:
    "border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-lg p-2 outline-none " +
    "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20",
  select:
    "border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-lg p-2 outline-none " +
    "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20",
  btn:
    "rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-zinc-950 " +
    "hover:bg-orange-400 active:bg-orange-500 disabled:opacity-50",
  btnGhost:
    "rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100 " +
    "hover:bg-zinc-900 disabled:opacity-50",
  badge:
    "inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200",
  tableWrap: "overflow-x-auto rounded-xl border border-zinc-800",
  th: "p-3 text-left text-xs font-semibold text-zinc-200 bg-zinc-900/60 border-b border-zinc-800",
  td: "p-3 text-sm text-zinc-100 border-t border-zinc-900",
};

export default function App() {
  // ===== Initialdaten =====
  
  const initialMitarbeiter = mitarbeiterData as Mitarbeiter[];
  const initialEintraege = eintraegeData as WochenEintrag[];
  const initialAbwesenheiten = abwesenheitenData as AbwesenheitEintrag[];

  // ===== State: Daten =====
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>(
    () => loadFromStorage(KEY_M, initialMitarbeiter)
  );
  const [eintraege, setEintraege] = useState<WochenEintrag[]>(
    () => loadFromStorage(KEY_E, initialEintraege)
  );
  const [abwesenheiten, setAbwesenheiten] = useState<AbwesenheitEintrag[]>(
    () => loadFromStorage(KEY_A, initialAbwesenheiten)
  );

  // ===== UI: Meldungen =====
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

  // ===== Export / Import =====
  function exportAll() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { mitarbeiter: mitarbeiterListe, eintraege, abwesenheiten },
    };
    downloadJson(`zeitkonto-export-${new Date().toISOString().slice(0, 10)}.json`, payload);
    setFormInfo("Export erstellt (Datei wurde heruntergeladen).");
  }

  async function importAll(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        version?: number;
        data?: {
          mitarbeiter?: Mitarbeiter[];
          eintraege?: WochenEintrag[];
          abwesenheiten?: AbwesenheitEintrag[];
        };
      };

      if (!parsed?.data) throw new Error("Ungültige Datei: data fehlt.");
      if (!Array.isArray(parsed.data.mitarbeiter)) throw new Error("Ungültige Datei: mitarbeiter fehlt.");
      if (!Array.isArray(parsed.data.eintraege)) throw new Error("Ungültige Datei: eintraege fehlt.");
      if (!Array.isArray(parsed.data.abwesenheiten)) throw new Error("Ungültige Datei: abwesenheiten fehlt.");

      saveSnapshot("vor Import");

      setMitarbeiterListe(parsed.data.mitarbeiter);
      setEintraege(parsed.data.eintraege);
      setAbwesenheiten(parsed.data.abwesenheiten);

      setFormInfo("Import erfolgreich. Daten wurden geladen.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    }
  }

  // ===== Persistenz =====
  useEffect(() => saveToStorage(KEY_M, mitarbeiterListe), [mitarbeiterListe]);
  useEffect(() => saveToStorage(KEY_E, eintraege), [eintraege]);
  useEffect(() => saveToStorage(KEY_A, abwesenheiten), [abwesenheiten]);

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

  if (mitarbeiterListe.length === 0) return <div className="p-6 text-zinc-100">Keine Mitarbeiter vorhanden.</div>;
  if (!mitarbeiter) return <div className="p-6 text-zinc-100">Kein Mitarbeiter gefunden.</div>;

  // ===== A8: Wochen-Eintrag =====
  const [newWoche, setNewWoche] = useState("2025-W50");
  const [newIst, setNewIst] = useState<number>(40);

  const normalizedNewWoche = normalizeIsoWeek(newWoche);
  const willOverwrite =
    !!normalizedNewWoche && eintraege.some((e) => eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === normalizedNewWoche);

  const istInvalid = !Number.isFinite(newIst) || newIst < 0;

  function addWochenEintrag() {
    setFormError(null);
    setFormInfo(null);

    saveSnapshot("vor Wochen-Eintrag");

    const norm = normalizeIsoWeek(newWoche);
    if (!norm) {
      setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
      return;
    }
    if (!Number.isFinite(newIst) || newIst < 0) {
      setFormError("IST-Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    const overwrote = eintraege.some((e) => eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === norm);
    const entry: WochenEintrag = { mitarbeiterId, woche: norm, istStunden: newIst };

    setEintraege((prev) => {
      const next = prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiterId) && e.woche === norm));
      next.push(entry);
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
    saveSnapshot("vor Wochen-Eintrag löschen");
    setEintraege((prev) => prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiterIdDel) && e.woche === woche)));
    setFormInfo("Wochen-Eintrag gelöscht.");
  }

  // ===== A8: Abwesenheit =====
  const [abwWoche, setAbwWoche] = useState("2025-W50");
  const [abwTag, setAbwTag] = useState<WochenTag>("mi");
  const [abwArt, setAbwArt] = useState<AbwesenheitsArt>("urlaub");
  const [abwStunden, setAbwStunden] = useState<number>(5);
  const [abwError, setAbwError] = useState<string | null>(null);

  function addAbwesenheit() {
    setAbwError(null);
    saveSnapshot("vor Abwesenheit");

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

    const tagesSoll = mitarbeiter.modell.tage[abwTag].sollStunden;

    if (tagesSoll <= 0) {
      setAbwError(`Am ${abwTag.toUpperCase()} ist bei ${mitarbeiter.name} kein Arbeitstag (SOLL=0).`);
      return;
    }
    if (abwStunden > tagesSoll) {
      setAbwError(
        `Abwesenheit (${abwStunden}h) darf Tages-SOLL (${tagesSoll}h) am ${abwTag.toUpperCase()} nicht überschreiten.`
      );
      return;
    }

    const entry: AbwesenheitEintrag = {
      mitarbeiterId: mitarbeiter.id,
      woche: aw,
      tag: abwTag,
      art: abwArt,
      stunden: abwStunden,
    };

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

    setFormInfo("Abwesenheit gespeichert.");
  }

  // ===== A10: Mitarbeiter verwalten =====
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmpName, setNewEmpName] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [deleteWithData, setDeleteWithData] = useState(true);

  function addMitarbeiter() {
    setEmpError(null);
    saveSnapshot("vor Mitarbeiter hinzufügen");

    const id = newEmpId.trim();
    const name = newEmpName.trim();

    if (!id) return setEmpError("Bitte eine Mitarbeiter-ID eingeben (z.B. 'peter').");
    if (!/^[a-z0-9_-]+$/i.test(id)) return setEmpError("ID darf nur Buchstaben, Zahlen, _ und - enthalten.");
    if (!name) return setEmpError("Bitte einen Namen eingeben.");
    if (mitarbeiterListe.some((m) => m.id.toLowerCase() === id.toLowerCase()))
      return setEmpError("Diese ID existiert bereits.");

    const defaultModell: Mitarbeiter["modell"] = {
      typ: "wochentage",
      tage: {
        mo: { sollStunden: 8, urlaubswert: 1.0 },
        di: { sollStunden: 8, urlaubswert: 1.0 },
        mi: { sollStunden: 8, urlaubswert: 1.0 },
        do: { sollStunden: 8, urlaubswert: 1.0 },
        fr: { sollStunden: 0, urlaubswert: 0.0 },
      },
    };

    const neu: Mitarbeiter = { id, name, modell: defaultModell };
    setMitarbeiterListe((prev) => [...prev, neu]);
    setMitarbeiterId(id);
    setNewEmpId("");
    setNewEmpName("");
    setFormInfo("Mitarbeiter hinzugefügt.");
  }

  function deleteMitarbeiter(id: string) {
    const ok = window.confirm(
      deleteWithData
        ? `Mitarbeiter '${id}' löschen UND alle zugehörigen Einträge/Abwesenheiten ebenfalls löschen?`
        : `Mitarbeiter '${id}' löschen? (Einträge/Abwesenheiten bleiben bestehen)`
    );
    if (!ok) return;

    saveSnapshot("vor Mitarbeiter löschen");

    setMitarbeiterListe((prev) => prev.filter((m) => !eqId(m.id, id)));

    if (deleteWithData) {
      setEintraege((prev) => prev.filter((e) => !eqId(e.mitarbeiterId, id)));
      setAbwesenheiten((prev) => prev.filter((a) => !eqId(a.mitarbeiterId, id)));
    }

    setFormInfo("Mitarbeiter gelöscht.");
  }

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
                ...patch,
              },
            },
          },
        };
      })
    );
  }

  function resetToDemoData() {
    const ok = window.confirm("Alles auf Demo-/Startdaten zurücksetzen? (localStorage wird überschrieben)");
    if (!ok) return;

    saveSnapshot("vor Reset");

    setMitarbeiterListe(initialMitarbeiter);
    setEintraege(initialEintraege);
    setAbwesenheiten(initialAbwesenheiten);

    setMitarbeiterId(initialMitarbeiter[0]?.id ?? "");
    setFromWoche("2025-W01");
    setToWoche("2025-W53");
    setFormInfo("Reset durchgeführt.");
  }

  // ===== Gefilterte Daten =====
  const eintraegeM = useMemo(
    () => eintraege.filter((e) => eqId(e.mitarbeiterId, mitarbeiter.id) && inRange(e.woche)),
    [eintraege, mitarbeiter.id, fromWoche, toWoche]
  );

  const abwesenheitenM = useMemo(
    () => abwesenheiten.filter((a) => eqId(a.mitarbeiterId, mitarbeiter.id) && inRange(a.woche)),
    [abwesenheiten, mitarbeiter.id, fromWoche, toWoche]
  );

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

  function deleteAbwesenheitByIndex(indexInFiltered: number) {
    const target = abwesenheitenView[indexInFiltered];
    if (!target) return;

    saveSnapshot("vor Abwesenheit löschen");

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

    setFormInfo("Abwesenheit gelöscht.");
  }

  // ===== Auswertung (sicher: UI wird nicht weiß) =====
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
    <div className={ui.page}>
      {/* ===== Kiste 1: Kopf / Filter / Sicherung ===== */}
      <div className={`${k.card} ${k.cardBody} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className={k.title}>Zeitkonto</div>
            <div className="text-xl font-semibold text-orange-400">{mitarbeiter.name}</div>
            <div className={k.subtitle}>Schwarz/Orange Theme – stabiler Aufbau</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={k.btn} type="button" onClick={resetToDemoData}>
              Reset (Demo-Daten)
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-200">
            Fehler in den Daten: {errorMsg}
          </div>
        )}

        {(formError || formInfo) && (
          <div className="space-y-2">
            {formError && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-200">
                Fehler: {formError}
              </div>
            )}
            {formInfo && (
              <div className="rounded-lg border border-green-900/40 bg-green-950/30 p-3 text-sm text-green-200">
                {formInfo}
              </div>
            )}
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-3">
            <label className={k.label}>Mitarbeiter</label>
            <select className={k.select} value={mitarbeiterId} onChange={(e) => setMitarbeiterId(e.target.value)}>
              {mitarbeiterListe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className={k.label}>Von</label>
            <input
              className={k.input + " w-32"}
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
            <label className={k.label}>Bis</label>
            <input
              className={k.input + " w-32"}
              value={toWoche}
              onChange={(e) => setToWoche(e.target.value)}
              onBlur={() => {
                const n = normalizeIsoWeek(toWoche);
                if (n) setToWoche(n);
              }}
              placeholder="2025-W53"
            />
          </div>

          <div className={k.hint}>Format: YYYY-WNN (z.B. 2025-W50)</div>
        </div>

        {!rangeOk && (
          <div className="text-sm text-amber-300">
            Hinweis: Zeitraum ungültig oder unvollständig – es werden aktuell alle Wochen angezeigt.
          </div>
        )}

        {/* Snapshot + Export/Import */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
          <div className="text-sm font-semibold text-zinc-100">Sicherung</div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={k.btn} type="button" onClick={() => saveSnapshot("manuell")}>
              Snapshot speichern
            </button>

            <button className={k.btnGhost} type="button" onClick={restoreSnapshot} disabled={!hasSnapshot}>
              Snapshot zurückholen
            </button>

            <button className={k.btnGhost} type="button" onClick={clearSnapshot} disabled={!hasSnapshot}>
              Snapshot löschen
            </button>

            <span className="text-sm text-zinc-300">
              Status: {hasSnapshot ? "vorhanden" : "nicht vorhanden"}
              {hasSnapshot && snapshotAt ? ` (letzter: ${snapshotAt.replace("T", " ").slice(0, 16)})` : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800">
            <button className={k.btnGhost} type="button" onClick={exportAll}>
              Export (Datei speichern)
            </button>

            <label className={k.btn + " cursor-pointer"}>
              Import (Datei laden)
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void importAll(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ===== Kiste 2: Zusammenfassung ===== */}
      <div className={`${k.card} ${k.cardBody} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-zinc-100">Zusammenfassung</div>
          <div className={k.hint}>Zeitraum: {rangeOk ? `${fromN} bis ${toN}` : "alle"}</div>
        </div>

        {s ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>IST gesamt</div>
              <div className="text-xl font-semibold text-zinc-100">{s.sumIst}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>eSOLL gesamt</div>
              <div className="text-xl font-semibold text-zinc-100">{s.sumEffSoll}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>Δ gesamt</div>
              <div className={"text-xl font-semibold " + (s.sumDelta < 0 ? "text-red-300" : "text-green-300")}>
                {s.sumDelta}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>End-Saldo</div>
              <div className={"text-xl font-semibold " + (s.endSaldo < 0 ? "text-red-300" : "text-green-300")}>
                {s.endSaldo}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>Abwesenheit (h)</div>
              <div className="text-xl font-semibold text-zinc-100">{s.sumAbw}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>Urlaub (Tage)</div>
              <div className="text-xl font-semibold text-zinc-100">{s.sumUrlaubTage.toFixed(2)}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>SOLL gesamt</div>
              <div className="text-xl font-semibold text-zinc-100">{s.sumSoll}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className={k.hint}>Wochen im Blick</div>
              <div className="text-xl font-semibold text-zinc-100">{rows.length}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-400">Keine Auswertung verfügbar.</div>
        )}
      </div>

      {/* ===== Kiste 3: Wochenübersicht ===== */}
      <div className={`${k.card} ${k.cardBody} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-zinc-100">Wochenübersicht</div>
          <span className={k.badge}>{rows.length} Zeilen</span>
        </div>

        <div className={k.tableWrap}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={k.th}>Woche</th>
                <th className={k.th}>IST</th>
                <th className={k.th}>SOLL</th>
                <th className={k.th}>Abw</th>
                <th className={k.th}>eSOLL</th>
                <th className={k.th}>Δ</th>
                <th className={k.th}>Saldo</th>
                <th className={k.th}>Urlaub (T)</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={`${r.mitarbeiterId}-${r.woche}`}>
                  <td className={k.td + " font-medium"}>{r.woche}</td>
                  <td className={k.td}>{r.istStunden}</td>
                  <td className={k.td}>{r.sollStunden}</td>
                  <td className={k.td}>{r.abwesenheitStunden}</td>
                  <td className={k.td}>{r.effektivesSoll}</td>

                  <td className={k.td + " " + (r.delta < 0 ? "text-red-300 font-semibold" : "text-green-300 font-semibold")}>
                    {r.delta}
                  </td>

                  <td className={k.td + " " + (r.saldo < 0 ? "text-red-300 font-semibold" : "text-green-300 font-semibold")}>
                    {r.saldo}
                  </td>

                  <td className={k.td}>{r.urlaubstage.toFixed(2)}</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-400" colSpan={8}>
                    Keine Einträge für diesen Mitarbeiter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Kiste 4: Eingaben & Verwaltung ===== */}
      <details className={`${k.card} ${k.cardBody}`} open={false}>
        <summary className="cursor-pointer font-semibold text-zinc-100">
          Eingaben & Verwaltung (klick zum Öffnen)
        </summary>

        <div className="mt-4 space-y-6">
          {/* Mitarbeiter verwalten */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="font-semibold text-zinc-100">Mitarbeiter verwalten</div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className={k.label}>Neue ID</label>
                <input className={k.input + " w-40"} value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} placeholder="z.B. peter" />
              </div>

              <div className="flex flex-col gap-1">
                <label className={k.label}>Name</label>
                <input className={k.input + " w-64"} value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="z.B. Peter Häusler" />
              </div>

              <button className={k.btn} type="button" onClick={addMitarbeiter}>
                Hinzufügen
              </button>
            </div>

            {empError && <div className="text-sm text-red-200">{empError}</div>}

            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={deleteWithData} onChange={(e) => setDeleteWithData(e.target.checked)} />
              Beim Löschen auch Einträge & Abwesenheiten entfernen
            </label>

            <div className="space-y-2">
              {mitarbeiterListe.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                  <div className="text-sm">
                    <div className="font-medium text-zinc-100">{m.name}</div>
                    <div className="text-zinc-400">ID: {m.id}</div>
                  </div>

                  <button className={k.btnGhost} type="button" onClick={() => deleteMitarbeiter(m.id)}>
                    Löschen
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Arbeitszeitmodell */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="font-semibold text-zinc-100">Arbeitszeitmodell (Wochentage)</div>
            <div className="text-sm text-zinc-300">
              Bearbeite Sollstunden und Urlaubswert pro Tag für: <span className="font-medium text-orange-300">{mitarbeiter.name}</span>
            </div>

            <div className={k.tableWrap}>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={k.th}>Tag</th>
                    <th className={k.th}>SOLL (h)</th>
                    <th className={k.th}>Urlaubswert</th>
                  </tr>
                </thead>
                <tbody>
                  {WOCHENTAGE.map((t) => {
                    const rule = mitarbeiter.modell.tage[t];
                    return (
                      <tr key={t}>
                        <td className={k.td + " font-medium"}>{t.toUpperCase()}</td>

                        <td className={k.td}>
                          <input
                            className={k.input + " w-28"}
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

                        <td className={k.td}>
                          <select
                            className={k.select}
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

          {/* Wochen-Eintrag hinzufügen */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="font-semibold text-zinc-100">Wochen-Eintrag hinzufügen</div>

            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addWochenEintrag();
              }}
            >
              <div className="flex flex-col gap-1">
                <label className={k.label}>Woche (ISO)</label>
                <input
                  className={k.input + " w-36 " + (newWoche.trim().length > 0 && !normalizedNewWoche ? "border-red-500" : "")}
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
                <label className={k.label}>IST-Stunden</label>
                <input
                  className={k.input + " w-28 " + (istInvalid ? "border-red-500" : "")}
                  type="number"
                  step="0.5"
                  min={0}
                  value={Number.isFinite(newIst) ? newIst : 0}
                  onChange={(e) => setNewIst(Number(e.target.value))}
                />
                {istInvalid && <div className="text-xs text-red-200">Bitte eine Zahl ≥ 0 eingeben.</div>}
              </div>

              <button className={k.btn} type="submit" disabled={!normalizedNewWoche || istInvalid}>
                Hinzufügen
              </button>
            </form>

            <div className={k.hint}>
              {normalizedNewWoche ? (
                willOverwrite ? (
                  <span className="text-amber-300">Achtung: Für diese Woche existiert bereits ein Eintrag – er wird überschrieben.</span>
                ) : (
                  <span className="text-green-300">Neuer Eintrag – wird hinzugefügt.</span>
                )
              ) : (
                <span>Format: YYYY-WNN (z.B. 2025-W05)</span>
              )}
            </div>
          </div>

          {/* Abwesenheit hinzufügen */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="font-semibold text-zinc-100">Abwesenheit hinzufügen</div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className={k.label}>Woche</label>
                <input
                  className={k.input + " w-32"}
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
                <label className={k.label}>Tag</label>
                <select className={k.select} value={abwTag} onChange={(e) => setAbwTag(e.target.value as WochenTag)}>
                  <option value="mo">MO</option>
                  <option value="di">DI</option>
                  <option value="mi">MI</option>
                  <option value="do">DO</option>
                  <option value="fr">FR</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className={k.label}>Art</label>
                <select className={k.select} value={abwArt} onChange={(e) => setAbwArt(e.target.value as AbwesenheitsArt)}>
                  <option value="urlaub">urlaub</option>
                  <option value="krank">krank</option>
                  <option value="feiertag">feiertag</option>
                  <option value="unbezahlt">unbezahlt</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className={k.label}>Stunden</label>
                <input className={k.input + " w-28"} type="number" min={0} step={0.5} value={abwStunden} onChange={(e) => setAbwStunden(Number(e.target.value))} />
              </div>

              <button className={k.btn} type="button" onClick={addAbwesenheit}>
                Hinzufügen
              </button>
            </div>

            {abwError && <div className="text-sm text-red-200">{abwError}</div>}
          </div>

          {/* Listen */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="font-semibold text-zinc-100">Wochen-Einträge (aktuell gefiltert)</div>

            {wochenEintraegeView.length === 0 ? (
              <div className="text-sm text-zinc-400">Keine Wochen-Einträge im Zeitraum.</div>
            ) : (
              <div className="space-y-2">
                {wochenEintraegeView.map((e) => (
                  <div key={`${e.mitarbeiterId}-${e.woche}`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                    <div className="text-sm">
                      <div className="font-medium text-zinc-100">{e.woche}</div>
                      <div className="text-zinc-400">IST: {e.istStunden} h</div>
                    </div>

                    <button className={k.btnGhost} type="button" onClick={() => deleteWochenEintrag(e.mitarbeiterId, e.woche)}>
                      Löschen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="font-semibold text-zinc-100">Abwesenheiten (aktuell gefiltert)</div>

            {abwesenheitenView.length === 0 ? (
              <div className="text-sm text-zinc-400">Keine Abwesenheiten im Zeitraum.</div>
            ) : (
              <div className="space-y-2">
                {abwesenheitenView.map((a, idx) => (
                  <div key={`${a.mitarbeiterId}-${a.woche}-${a.tag}-${a.art}-${a.stunden}-${idx}`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                    <div className="text-sm">
                      <div className="font-medium text-zinc-100">
                        {a.woche} – {String(a.tag).toUpperCase()}
                      </div>
                      <div className="text-zinc-400">
                        {a.art}: {a.stunden} h
                      </div>
                    </div>

                    <button className={k.btnGhost} type="button" onClick={() => deleteAbwesenheitByIndex(idx)}>
                      Löschen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
