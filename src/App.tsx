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

function compareIsoWeek(a: string, b: string) {
  return a.localeCompare(b);
}

function eqId(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ===== UI-local Types =====
type WochenTag = "mo" | "di" | "mi" | "do" | "fr";
const WOCHENTAGE: WochenTag[] = ["mo", "di", "mi", "do", "fr"];

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

  // ===== State (persistiert) =====
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>(() =>
    loadFromStorage(KEY_M, initialMitarbeiter)
  );
  const [eintraege, setEintraege] = useState<WochenEintrag[]>(() =>
    loadFromStorage(KEY_E, initialEintraege)
  );
  const [abwesenheiten, setAbwesenheiten] = useState<AbwesenheitEintrag[]>(() =>
    loadFromStorage(KEY_A, initialAbwesenheiten)
  );

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

  // ===== Gefilterte Daten (für Tabelle + Listen) =====
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

  // ===== Aktionen: Wochen-Eintrag / Abwesenheit / Mitarbeiter =====
  // (Die UI/States dafür liegen in EntryAndAbsenceForms – hier bleiben nur die "Speicher-Funktionen")

  function addWochenEintrag(entry: WochenEintrag, willOverwrite: boolean) {
    setFormError(null);
    setFormInfo(null);

    const w = normalizeIsoWeek(entry.woche);
    if (!w) {
      setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
      return;
    }
    if (!Number.isFinite(entry.istStunden) || entry.istStunden < 0) {
      setFormError("IST-Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    saveSnapshot("vor Wochen-Eintrag");

    const clean: WochenEintrag = { ...entry, woche: w, mitarbeiterId: mitarbeiter.id };

    setEintraege((prev) => {
      const next = prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === w));
      next.push(clean);
      next.sort((a, b) => {
        const idCmp = a.mitarbeiterId.localeCompare(b.mitarbeiterId);
        return idCmp !== 0 ? idCmp : compareIsoWeek(a.woche, b.woche);
      });
      return next;
    });

    setFormInfo(willOverwrite ? "Eintrag überschrieben." : "Eintrag gespeichert.");
  }

  function deleteWochenEintrag(woche: string) {
    saveSnapshot("vor Wochen-Eintrag löschen");
    setEintraege((prev) => prev.filter((e) => !(eqId(e.mitarbeiterId, mitarbeiter.id) && e.woche === woche)));
    setFormInfo("Wochen-Eintrag gelöscht.");
  }

  function addAbwesenheit(item: AbwesenheitEintrag) {
    setFormError(null);
    setFormInfo(null);

    const w = normalizeIsoWeek(item.woche);
    if (!w) {
      setFormError("Woche ungültig. Format: YYYY-WNN (z.B. 2025-W05).");
      return;
    }
    if (!Number.isFinite(item.stunden) || item.stunden < 0) {
      setFormError("Stunden müssen eine Zahl >= 0 sein.");
      return;
    }

    const tagesSoll = mitarbeiter.modell.tage[item.tag]?.sollStunden ?? 0;
    if (tagesSoll <= 0) {
      setFormError(`Am ${item.tag.toUpperCase()} ist bei ${mitarbeiter.name} kein Arbeitstag (SOLL=0).`);
      return;
    }
    if (item.stunden > tagesSoll) {
      setFormError(
        `Abwesenheit (${item.stunden}h) darf Tages-SOLL (${tagesSoll}h) am ${item.tag.toUpperCase()} nicht überschreiten.`
      );
      return;
    }

    saveSnapshot("vor Abwesenheit");

    const clean: AbwesenheitEintrag = { ...item, woche: w, mitarbeiterId: mitarbeiter.id };

    setAbwesenheiten((prev) => {
      const next = prev.slice();
      next.push(clean);
      next.sort((a, b) => {
        const idCmp = a.mitarbeiterId.localeCompare(b.mitarbeiterId);
        return idCmp !== 0 ? idCmp : compareIsoWeek(a.woche, b.woche);
      });
      return next;
    });

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

  // Mitarbeiter
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

  function updateTagesRegel(tag: WochenTag, patch: Partial<{ sollStunden: number; urlaubswert: number }>) {
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

  // ===== Auswertung (sicher, kein Weißbildschirm) =====
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
        {formError ? <div className="mt-3 text-sm text-red-300">{formError}</div> : null}
        {formInfo ? <div className="mt-3 text-sm text-emerald-300">{formInfo}</div> : null}
      </div>

      {/* Eingaben */}
      <div className={`${ui.card} ${ui.cardBody}`}>
        <div className="font-semibold">Eingaben</div>
        <div className={ui.subtitle}>
          Wochen-Einträge und Abwesenheiten für <span className="text-zinc-200">{mitarbeiter.name}</span>
        </div>

        <EntryAndAbsenceForms
          ui={ui}
          mitarbeiter={mitarbeiter}
          eintraege={eintraege}
          abwesenheiten={abwesenheiten}
          normalizeIsoWeek={normalizeIsoWeek}
          eqId={eqId}
          onAddWochenEintrag={(entry, willOverwrite) => addWochenEintrag(entry, willOverwrite)}
          onAddAbwesenheit={(item) => addAbwesenheit(item)}
        />
      </div>

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

        <div className={ui.hint}>Tipp: Wenn ein Tag SOLL=0 ist, ist das ein „Nicht-Arbeitstag“. Dann darf dort keine Abwesenheit erfasst werden.</div>
      </div>

      {/* Tabelle */}
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead className={ui.thead}>
            <tr className="text-zinc-300">
              <th className={ui.th}>Woche</th>
              <th className={ui.th + " text-right"}>IST</th>
              <th className={ui.th + " text-right"}>SOLL</th>
              <th className={ui.th + " text-right"}>Abw</th>
              <th className={ui.th + " text-right"}>eSOLL</th>
              <th className={ui.th + " text-right"}>Δ</th>
              <th className={ui.th + " text-right"}>Saldo</th>
              <th className={ui.th + " text-right"}>Urlaub</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.woche} className={ui.tr}>
                <td className={ui.tdStrong}>{r.woche}</td>
                <td className={ui.td + " text-right tabular-nums"}>{r.istStunden}</td>
                <td className={ui.td + " text-right tabular-nums"}>{r.sollStunden}</td>
                <td className={ui.td + " text-right tabular-nums"}>{r.abwesenheitStunden}</td>
                <td className={ui.td + " text-right tabular-nums"}>{r.effektivesSoll}</td>
                <td className={ui.td + " text-right tabular-nums " + (r.delta < 0 ? "text-red-300" : "text-emerald-300")}>
                  {r.delta}
                </td>
                <td className={ui.td + " text-right tabular-nums"}>{r.saldo}</td>
                <td className={ui.td + " text-right tabular-nums"}>{r.urlaubstage.toFixed(2)}</td>
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
