// src/ui/Forms.tsx
import React, { useMemo, useState } from "react";
import {
  loadBuchungen,
  loadMitarbeiter,
  loadProjekte,
  saveBuchungen,
  saveMitarbeiter,
  saveProjekte,
  uid,
  todayIso,
  type Buchung,
  type Mitarbeiter,
  type Projekt,
} from "../core/storage";

const input =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-orange-500";
const label = "text-xs text-neutral-400";
const btn =
  "rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500";
const btnOrange =
  "rounded-lg border border-orange-700 bg-orange-500/90 px-3 py-2 text-sm text-neutral-950 font-semibold hover:bg-orange-500";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="mb-3 text-sm font-semibold text-neutral-100">{title}</div>
      {children}
    </div>
  );
}

export default function Forms() {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>(() => loadMitarbeiter());
  const [projekte, setProjekte] = useState<Projekt[]>(() => loadProjekte());
  const [buchungen, setBuchungen] = useState<Buchung[]>(() => loadBuchungen());

  // Mitarbeiter Form
  const [mName, setMName] = useState("");
  const [mEditId, setMEditId] = useState<string | null>(null);

  // Projekt Form
  const [pName, setPName] = useState("");
  const [pVerantw, setPVerantw] = useState("");
  const [pKalk, setPKalk] = useState("10");
  const [pStart, setPStart] = useState(todayIso());
  const [pEditId, setPEditId] = useState<string | null>(null);

  // Buchung Form (Test/Real)
  const [bM, setBM] = useState("");
  const [bP, setBP] = useState("");
  const [bDate, setBDate] = useState(todayIso());
  const [bHours, setBHours] = useState("2");
  const [bBereich, setBBereich] = useState<Buchung["bereich"]>("bank");

  const canSaveProjekt = useMemo(() => {
    const k = Number(String(pKalk).replace(",", "."));
    return pName.trim().length > 0 && pVerantw.trim().length > 0 && Number.isFinite(k) && k > 0;
  }, [pName, pVerantw, pKalk]);

  function persistAll(nextM = mitarbeiter, nextP = projekte, nextB = buchungen) {
    saveMitarbeiter(nextM);
    saveProjekte(nextP);
    saveBuchungen(nextB);
  }

  // Mitarbeiter actions
  function addOrUpdateMitarbeiter() {
    const name = mName.trim();
    if (!name) return;

    let next: Mitarbeiter[];
    if (mEditId) {
      next = mitarbeiter.map((m) => (m.id === mEditId ? { ...m, name } : m));
    } else {
      next = [...mitarbeiter, { id: uid("m"), name }];
    }
    setMitarbeiter(next);
    persistAll(next, projekte, buchungen);
    setMName("");
    setMEditId(null);
  }

  function editMitarbeiter(m: Mitarbeiter) {
    setMEditId(m.id);
    setMName(m.name);
  }

  function deleteMitarbeiter(id: string) {
    const nextM = mitarbeiter.filter((m) => m.id !== id);
    // Projekte/Buchungen die darauf zeigen bleiben erstmal (später sauber migrieren/validieren)
    setMitarbeiter(nextM);
    persistAll(nextM, projekte, buchungen);
    if (mEditId === id) {
      setMEditId(null);
      setMName("");
    }
  }

  // Projekt actions
  function addOrUpdateProjekt() {
    if (!canSaveProjekt) return;

    const name = pName.trim();
    const kalk = Number(String(pKalk).replace(",", "."));
    const ver = pVerantw.trim();
    const start = pStart;

    let next: Projekt[];
    if (pEditId) {
      next = projekte.map((p) =>
        p.id === pEditId
          ? { ...p, name, verantwortlicherMitarbeiterId: ver, kalkulierteStunden: kalk, geplantesStartDatum: start }
          : p
      );
    } else {
      next = [
        ...projekte,
        {
          id: uid("p"),
          name,
          verantwortlicherMitarbeiterId: ver,
          kalkulierteStunden: kalk,
          geplantesStartDatum: start,
        },
      ];
    }
    setProjekte(next);
    persistAll(mitarbeiter, next, buchungen);

    setPName("");
    setPVerantw("");
    setPKalk("10");
    setPStart(todayIso());
    setPEditId(null);
  }

  function editProjekt(p: Projekt) {
    setPEditId(p.id);
    setPName(p.name);
    setPVerantw(p.verantwortlicherMitarbeiterId);
    setPKalk(String(p.kalkulierteStunden));
    setPStart(p.geplantesStartDatum || todayIso());
  }

  function deleteProjekt(id: string) {
    const nextP = projekte.filter((p) => p.id !== id);
    const nextB = buchungen.filter((b) => b.projektId !== id); // Buchungen dazu löschen (reproduzierbar & sauber)
    setProjekte(nextP);
    setBuchungen(nextB);
    persistAll(mitarbeiter, nextP, nextB);
    if (pEditId === id) {
      setPEditId(null);
      setPName("");
      setPVerantw("");
      setPKalk("10");
      setPStart(todayIso());
    }
  }

  // Buchung actions
  function addBuchung() {
    const mi = bM.trim();
    const pr = bP.trim();
    const dt = bDate;
    const h = Number(String(bHours).replace(",", "."));
    if (!mi || !pr || !dt || !Number.isFinite(h) || h <= 0) return;

    const nextB: Buchung[] = [
      ...buchungen,
      {
        id: uid("b"),
        mitarbeiterId: mi,
        projektId: pr,
        datum: dt,
        stunden: h,
        bereich: bBereich,
      },
    ];
    setBuchungen(nextB);
    persistAll(mitarbeiter, projekte, nextB);
    setBHours("2");
  }

  function resetDemo() {
    localStorage.removeItem("mitarbeiter");
    localStorage.removeItem("projekte");
    localStorage.removeItem("buchungen");
    const nextM: Mitarbeiter[] = [];
    const nextP: Projekt[] = [];
    const nextB: Buchung[] = [];
    setMitarbeiter(nextM);
    setProjekte(nextP);
    setBuchungen(nextB);
  }

  return (
    <div className="p-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Datenpflege (reproduzierbar)</div>
            <div className="text-xs text-neutral-400">
              Single Source of Truth: localStorage Keys <span className="font-mono text-neutral-200">mitarbeiter</span>,{" "}
              <span className="font-mono text-neutral-200">projekte</span>,{" "}
              <span className="font-mono text-neutral-200">buchungen</span>
            </div>
          </div>
          <button className={btn} onClick={resetDemo} title="Setzt lokale Daten zurück">
            Reset Local Data
          </button>
        </div>

        <div className="p-4 grid gap-4 lg:grid-cols-2">
          {/* Mitarbeiter */}
          <Section title="Mitarbeiter">
            <div className="grid gap-2">
              <div className={label}>Name</div>
              <input className={input} value={mName} onChange={(e) => setMName(e.target.value)} placeholder="z. B. Est, Don, …" />

              <div className="flex gap-2 mt-2">
                <button className={btnOrange} onClick={addOrUpdateMitarbeiter}>
                  {mEditId ? "Mitarbeiter speichern" : "Mitarbeiter anlegen"}
                </button>
                {mEditId ? (
                  <button className={btn} onClick={() => { setMEditId(null); setMName(""); }}>
                    Abbrechen
                  </button>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                {mitarbeiter.length === 0 ? (
                  <div className="text-sm text-neutral-500">Noch keine Mitarbeiter.</div>
                ) : (
                  mitarbeiter.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-neutral-100 truncate">{m.name}</div>
                        <div className="text-xs text-neutral-500 font-mono truncate">{m.id}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className={btn} onClick={() => editMitarbeiter(m)}>Bearbeiten</button>
                        <button className={btn} onClick={() => deleteMitarbeiter(m.id)}>Löschen</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Section>

          {/* Projekte */}
          <Section title="Projekte (mit kalkulierten Stunden)">
            <div className="grid gap-2">
              <div className={label}>Projektname</div>
              <input className={input} value={pName} onChange={(e) => setPName(e.target.value)} placeholder="z. B. Küche – Fronten" />

              <div className={label}>Verantwortlicher Mitarbeiter</div>
              <select className={input} value={pVerantw} onChange={(e) => setPVerantw(e.target.value)}>
                <option value="">Bitte wählen…</option>
                {mitarbeiter.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className={label}>Kalkulierte Stunden (Pflicht)</div>
                  <input className={input} value={pKalk} onChange={(e) => setPKalk(e.target.value)} />
                </div>
                <div>
                  <div className={label}>Geplantes Startdatum</div>
                  <input className={input} type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button className={btnOrange} onClick={addOrUpdateProjekt} disabled={!canSaveProjekt}>
                  {pEditId ? "Projekt speichern" : "Projekt anlegen"}
                </button>
                {pEditId ? (
                  <button className={btn} onClick={() => { setPEditId(null); setPName(""); setPVerantw(""); setPKalk("10"); setPStart(todayIso()); }}>
                    Abbrechen
                  </button>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                {projekte.length === 0 ? (
                  <div className="text-sm text-neutral-500">Noch keine Projekte.</div>
                ) : (
                  projekte.map((p) => (
                    <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm text-neutral-100 truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500">
                            Kalk: <span className="tabular-nums text-neutral-200">{p.kalkulierteStunden}</span>h • Start:{" "}
                            <span className="font-mono text-neutral-200">{p.geplantesStartDatum || "—"}</span>
                          </div>
                          <div className="text-xs text-neutral-500">
                            Verantwortlich:{" "}
                            <span className="text-neutral-200">
                              {mitarbeiter.find((m) => m.id === p.verantwortlicherMitarbeiterId)?.name || p.verantwortlicherMitarbeiterId}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-500 font-mono truncate">{p.id}</div>
                        </div>
                        <div className="flex gap-2">
                          <button className={btn} onClick={() => editProjekt(p)}>Bearbeiten</button>
                          <button className={btn} onClick={() => deleteProjekt(p.id)}>Löschen</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Section>

          {/* Buchungen */}
          <Section title="Buchungen (Test/Real)">
            <div className="grid gap-2">
              <div className={label}>Mitarbeiter</div>
              <select className={input} value={bM} onChange={(e) => setBM(e.target.value)}>
                <option value="">Bitte wählen…</option>
                {mitarbeiter.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <div className={label}>Projekt</div>
              <select className={input} value={bP} onChange={(e) => setBP(e.target.value)}>
                <option value="">Bitte wählen…</option>
                {projekte.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className={label}>Datum</div>
                  <input className={input} type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} />
                </div>
                <div>
                  <div className={label}>Stunden</div>
                  <input className={input} value={bHours} onChange={(e) => setBHours(e.target.value)} />
                </div>
                <div>
                  <div className={label}>Bereich</div>
                  <select className={input} value={bBereich || "bank"} onChange={(e) => setBBereich(e.target.value as any)}>
                    <option value="maschine">Maschine</option>
                    <option value="bank">Bank</option>
                    <option value="lack">Lack</option>
                    <option value="montage">Montage</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button className={btnOrange} onClick={addBuchung}>Buchung hinzufügen</button>
              </div>

              <div className="mt-3 space-y-2">
                {buchungen.length === 0 ? (
                  <div className="text-sm text-neutral-500">Noch keine Buchungen.</div>
                ) : (
                  buchungen
                    .slice()
                    .sort((a, b) => (a.datum < b.datum ? 1 : -1))
                    .slice(0, 12)
                    .map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm text-neutral-100 truncate">
                            {b.datum} • <span className="tabular-nums">{b.stunden}</span>h • {b.bereich || "—"}
                          </div>
                          <div className="text-xs text-neutral-500 truncate">
                            {mitarbeiter.find((m) => m.id === b.mitarbeiterId)?.name || b.mitarbeiterId} →{" "}
                            {projekte.find((p) => p.id === b.projektId)?.name || b.projektId}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-500 font-mono truncate">{b.id}</div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </Section>

          {/* Status */}
          <Section title="Status">
            <div className="space-y-2 text-sm text-neutral-300">
              <div>
                Mitarbeiter: <span className="tabular-nums text-neutral-100">{mitarbeiter.length}</span>
              </div>
              <div>
                Projekte: <span className="tabular-nums text-neutral-100">{projekte.length}</span>
              </div>
              <div>
                Buchungen: <span className="tabular-nums text-neutral-100">{buchungen.length}</span>
              </div>
              <div className="text-xs text-neutral-500">
                Wenn Board sauber auf localStorage liest, siehst du nach dem Anlegen von Projekten/Buchungen sofort Balken im Board.
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
