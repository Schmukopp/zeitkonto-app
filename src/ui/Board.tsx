// src/ui/Board.tsx
import React, { useMemo } from "react";

/**
 * CLEAN / REPRODUZIERBAR / STABIL
 *
 * - Keine "magischen" Store-Imports (die dir später wieder alles zerreißen)
 * - Datenquelle: localStorage (falls vorhanden) -> reproduzierbar
 * - Fallback: saubere Demo-Daten, damit UI IMMER funktioniert
 *
 * Darstellung:
 * - 8 Wochen: oben 4, unten 4
 * - Pro Mitarbeiter: 3 Spuren (Plan / Ist / Reserve)
 * - Zeit = Länge (keine Farbintensität als Zeitersatz)
 * - Corporate: schwarz/orange
 *
 * Nächster Ausbau (später):
 * - Drag & Drop
 * - echte Store-Anbindung (zentral, sauber)
 * - Phasen (Maschine/Bank/Lack/Montage) farblich
 */

type IsoDate = string; // "YYYY-MM-DD"

type Mitarbeiter = {
  id: string;
  name: string;
  // später: Arbeitszeitmodell, etc.
};

type Projekt = {
  id: string;
  name: string;
  verantwortlicherMitarbeiterId: string;
  // grobe Planung:
  geplantesStartDatum?: IsoDate; // optional
  kalkulierteStunden: number; // Pflicht (deine Regel)
  farbe?: string; // optional (später)
};

type Buchung = {
  id: string;
  mitarbeiterId: string;
  projektId: string;
  datum: IsoDate;
  stunden: number; // Ist-Zeit (deine Realität)
  bereich?: "maschine" | "bank" | "lack" | "montage";
};

/** ---------- Datum / Kalender (ISO-Wochen, Mo-Start) ---------- */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIso(iso: IsoDate): Date {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const dt = new Date(y, m, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function startOfISOWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=So,1=Mo
  const diff = (day === 0 ? -6 : 1) - day; // auf Montag
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoWeekNumber(date: Date) {
  // ISO week calc (ohne lib, robust genug)
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Donnerstag der Woche entscheidet
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

function formatWeekRange(monday: Date) {
  const start = monday;
  const end = addDays(monday, 6);
  const s = `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}.${String(start.getFullYear()).slice(2)}`;
  const e = `${pad2(end.getDate())}.${pad2(end.getMonth() + 1)}.${String(end.getFullYear()).slice(2)}`;
  return `${s}–${e}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** ---------- Storage (reproduzierbar) ---------- */

function loadJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** ---------- Demo-Fallback (damit UI immer läuft) ---------- */

function demoMitarbeiter(): Mitarbeiter[] {
  return [
    { id: "m1", name: "Mitarbeiter 1" },
    { id: "m2", name: "Mitarbeiter 2" },
    { id: "m3", name: "Mitarbeiter 3" },
  ];
}

function demoProjekte(monday: Date): Projekt[] {
  const start = toIsoDate(addDays(monday, 0));
  return [
    {
      id: "p1",
      name: "Küche – Fronten",
      verantwortlicherMitarbeiterId: "m1",
      geplantesStartDatum: start,
      kalkulierteStunden: 24,
    },
    {
      id: "p2",
      name: "Einbauschrank",
      verantwortlicherMitarbeiterId: "m2",
      geplantesStartDatum: toIsoDate(addDays(monday, 3)),
      kalkulierteStunden: 18,
    },
    {
      id: "p3",
      name: "Treppe – Lack",
      verantwortlicherMitarbeiterId: "m3",
      geplantesStartDatum: toIsoDate(addDays(monday, 7)),
      kalkulierteStunden: 16,
    },
  ];
}

function demoBuchungen(monday: Date): Buchung[] {
  // bewusst parallel -> soll Verkürzung bedeuten (mehr Ist pro Tag)
  const d0 = toIsoDate(addDays(monday, 0));
  const d1 = toIsoDate(addDays(monday, 1));
  const d2 = toIsoDate(addDays(monday, 2));
  const d3 = toIsoDate(addDays(monday, 3));
  return [
    { id: "b1", mitarbeiterId: "m1", projektId: "p1", datum: d0, stunden: 6, bereich: "bank" },
    { id: "b2", mitarbeiterId: "m2", projektId: "p1", datum: d0, stunden: 4, bereich: "maschine" }, // parallel
    { id: "b3", mitarbeiterId: "m1", projektId: "p1", datum: d1, stunden: 8, bereich: "bank" },
    { id: "b4", mitarbeiterId: "m3", projektId: "p1", datum: d2, stunden: 6, bereich: "montage" },

    { id: "b5", mitarbeiterId: "m2", projektId: "p2", datum: d3, stunden: 7, bereich: "bank" },
  ];
}

/** ---------- Kernlogik: Projekt-Zeitstrahl aus Ist (verkürzen/verlängern) ---------- */

/**
 * Regel (dein Wunsch, technisch sauber):
 * - Die Projektdauer ist NICHT fix "kalkulierteStunden / Tagesstunden" (nur Plan).
 * - Der echte Verlauf ergibt sich aus Ist-Buchungen:
 *   - Mehr parallel gebuchte Stunden am selben Tag -> schnellerer Fortschritt -> früher fertig (verkürzt).
 *   - Wenn Ist > kalkuliert -> Überzug -> Strahl wird länger + rote Überhang-Phase.
 *
 * Hier nutzen wir:
 * - TagesSollStunden = 10 (fix; später pro Mitarbeiter-Modell)
 */
const DAY_HOURS = 10;

type ProjectTimeline = {
  projektId: string;
  // Start = erste Buchung, sonst geplantesStartDatum, sonst "heute-Woche-Mo"
  startIso: IsoDate;
  // Ende = Tag der letzten Buchung ODER rechnerisches Ende, wenn kalkuliert noch offen
  endIso: IsoDate;
  // PlanEnde (kalkuliert) = Start + kalkStd/DAY_HOURS in Tagen (aufgerundet)
  planEndIso: IsoDate;
  // Summe Ist
  istStunden: number;
  // Kalk
  kalkStunden: number;
};

function buildProjectTimeline(
  projekt: Projekt,
  buchungen: Buchung[],
  fallbackStartMonday: Date
): ProjectTimeline {
  const projBookings = buchungen
    .filter((b) => b.projektId === projekt.id)
    .slice()
    .sort((a, b) => parseIso(a.datum).getTime() - parseIso(b.datum).getTime());

  const firstBooking = projBookings[0]?.datum || null;
  const lastBooking = projBookings.length ? projBookings[projBookings.length - 1].datum : null;

  const startIso =
    firstBooking ||
    projekt.geplantesStartDatum ||
    toIsoDate(fallbackStartMonday);

  const start = parseIso(startIso);

  const planDays = Math.max(1, Math.ceil(projekt.kalkulierteStunden / DAY_HOURS));
  const planEnd = addDays(start, planDays - 1);
  const planEndIso = toIsoDate(planEnd);

  const istStunden = projBookings.reduce((sum, b) => sum + (Number.isFinite(b.stunden) ? b.stunden : 0), 0);

  // Ende:
  // - Wenn Buchungen existieren: Ende mindestens letzte Buchung.
  // - Wenn keine Buchungen: Ende = PlanEnde.
  // - Wenn Ist über Plan hinaus: Ende = letzte Buchung (real).
  // - Wenn Ist unter Plan, aber Buchungen vorhanden und Projekt noch nicht fertig: Ende = PlanEnde (rechnerisch).
  let endIso = planEndIso;

  if (lastBooking) {
    // reale Sichtbarkeit bis letzte Buchung
    endIso = lastBooking;

    // Wenn Ist noch < kalkuliert, aber letzte Buchung vor PlanEnde: sichtbar bis PlanEnde (Projekt läuft "noch")
    if (istStunden < projekt.kalkulierteStunden) {
      const last = parseIso(lastBooking);
      if (last.getTime() < planEnd.getTime()) endIso = planEndIso;
    }
  }

  // Wenn Überzug und Buchungen weitergehen: endIso bleibt lastBooking (real)
  // Wenn Überzug, aber keine Buchungen (unlogisch), bleibt PlanEnde.

  return {
    projektId: projekt.id,
    startIso,
    endIso,
    planEndIso,
    istStunden,
    kalkStunden: projekt.kalkulierteStunden,
  };
}

/** ---------- UI Helper: Position im 8-Wochen-Fenster ---------- */

type BoardRange = {
  startMonday: Date; // Montag der "aktuellen" KW
  day0: Date; // day0 = startMonday - 7 (weil oben links 1 Woche in Vergangenheit)
  totalDays: number; // 56
  dayIsos: IsoDate[];
};

function buildBoardRange(): BoardRange {
  const today = new Date();
  const currentMonday = startOfISOWeek(today);

  // Regel: oben links = 1 Woche in Vergangenheit, dann aktuelle, +1,+2 / unten +3..+6
  // => Wir starten bei currentMonday - 7 Tage
  const day0 = addDays(currentMonday, -7);
  const totalDays = 56;

  const dayIsos: IsoDate[] = [];
  for (let i = 0; i < totalDays; i++) dayIsos.push(toIsoDate(addDays(day0, i)));

  return { startMonday: currentMonday, day0, totalDays, dayIsos };
}

function dayIndex(range: BoardRange, iso: IsoDate): number {
  const t = parseIso(iso).getTime();
  const t0 = range.day0.getTime();
  return Math.floor((t - t0) / 86400000);
}

/** ---------- Komponenten ---------- */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950/70 px-2 py-0.5 text-[11px] text-neutral-200">
      {children}
    </span>
  );
}

function ProjectBar({
  projekt,
  timeline,
  range,
}: {
  projekt: Projekt;
  timeline: ProjectTimeline;
  range: BoardRange;
}) {
  const startIdx = dayIndex(range, timeline.startIso);
  const endIdx = dayIndex(range, timeline.endIso);
  const planEndIdx = dayIndex(range, timeline.planEndIso);

  // Sichtbar nur, wenn irgendwie im Fenster
  const visibleStart = clamp(startIdx, 0, range.totalDays - 1);
  const visibleEnd = clamp(endIdx, 0, range.totalDays - 1);
  const visiblePlanEnd = clamp(planEndIdx, 0, range.totalDays - 1);

  if (visibleEnd < 0 || visibleStart > range.totalDays - 1) return null;
  if (visibleEnd < visibleStart) return null;

  const leftPct = (visibleStart / range.totalDays) * 100;
  const widthPct = ((visibleEnd - visibleStart + 1) / range.totalDays) * 100;

  // Fortschritt:
  const progressPct =
    timeline.kalkStunden > 0 ? clamp((timeline.istStunden / timeline.kalkStunden) * 100, 0, 100) : 0;

  // Überzug sichtbar, wenn planEnd < end
  const overrun = endIdx > planEndIdx;

  // Wo beginnt rot? Ab PlanEnde+1 (wenn innerhalb sichtbar)
  const redStartIdx = visiblePlanEnd + 1;
  const redStartPct = (redStartIdx / range.totalDays) * 100;
  const redWidthPct =
    overrun && visibleEnd >= redStartIdx ? ((visibleEnd - redStartIdx + 1) / range.totalDays) * 100 : 0;

  return (
    <div className="relative h-8">
      {/* Hintergrund-Strahl (z-0) */}
      <div
        className="absolute inset-y-0 rounded-lg border border-neutral-800 bg-neutral-950/70 z-0"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />

      {/* Orange Fortschritt (z-10): Zeit = Länge; hier: Balken als Projektspanne, Fortschritt als Füllung */}
      <div
        className="absolute inset-y-0 rounded-lg bg-orange-500/90 z-10 overflow-hidden"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        title={`${projekt.name} – Ist ${timeline.istStunden.toFixed(1)}h / Kalk ${timeline.kalkStunden.toFixed(1)}h`}
      >
        <div
          className="h-full bg-orange-200/20"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Rot ab Überzug (z-20) */}
      {redWidthPct > 0 ? (
        <div
          className="absolute inset-y-0 rounded-lg bg-red-600/85 z-20"
          style={{ left: `${redStartPct}%`, width: `${redWidthPct}%` }}
          title="Überzug (kalkulierte Stunden überschritten)"
        />
      ) : null}

      {/* Label (z-30) */}
      <div
        className="absolute inset-y-0 z-30 flex items-center px-2 text-[12px] text-neutral-950"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      >
        <span className="truncate font-semibold">
          {projekt.name}
        </span>
        <span className="ml-2 text-[11px] text-neutral-900/80 tabular-nums whitespace-nowrap">
          {timeline.istStunden.toFixed(1)}h/{timeline.kalkStunden.toFixed(1)}h
        </span>
      </div>
    </div>
  );
}

function WeekHeader({ monday }: { monday: Date }) {
  const kw = isoWeekNumber(monday);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-neutral-100">KW {kw}</div>
        <Pill>{formatWeekRange(monday)}</Pill>
      </div>
    </div>
  );
}

export default function Board() {
  const range = useMemo(() => buildBoardRange(), []);

  // 8 Wochen = 56 Tage, Wochen-Mondays:
  const weekMondays = useMemo(() => {
    // range.day0 ist Montag (currentMonday - 7), also Wochenstart
    const arr: Date[] = [];
    for (let w = 0; w < 8; w++) arr.push(addDays(range.day0, w * 7));
    return arr;
  }, [range]);

  // Daten: localStorage -> sonst Demo
  const mitarbeiter = useMemo(() => {
    const stored = loadJson<any>("mitarbeiter");
    const arr = safeArray<Mitarbeiter>(stored);
    return arr.length ? arr : demoMitarbeiter();
  }, []);

  const projekte = useMemo(() => {
    const stored = loadJson<any>("projekte");
    const arr = safeArray<Projekt>(stored);
    return arr.length ? arr : demoProjekte(range.startMonday);
  }, [range.startMonday]);

  const buchungen = useMemo(() => {
    const stored = loadJson<any>("buchungen");
    const arr = safeArray<Buchung>(stored);
    return arr.length ? arr : demoBuchungen(range.startMonday);
  }, [range.startMonday]);

  // Timeline je Projekt
  const timelines = useMemo(() => {
    const map = new Map<string, ProjectTimeline>();
    for (const p of projekte) {
      map.set(p.id, buildProjectTimeline(p, buchungen, range.startMonday));
    }
    return map;
  }, [projekte, buchungen, range.startMonday]);

  // Projekte nach Verantwortlichem gruppieren (Plan-Spur)
  const projekteByMitarbeiter = useMemo(() => {
    const map = new Map<string, Projekt[]>();
    for (const m of mitarbeiter) map.set(m.id, []);
    for (const p of projekte) {
      if (!map.has(p.verantwortlicherMitarbeiterId)) map.set(p.verantwortlicherMitarbeiterId, []);
      map.get(p.verantwortlicherMitarbeiterId)!.push(p);
    }
    return map;
  }, [mitarbeiter, projekte]);

  return (
    <div className="p-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Board</div>
            <div className="text-xs text-neutral-400">
              Fixe Regel: oben links = Vorwoche, dann aktuelle, +1, +2 / unten +3 bis +6 • Zeit = Länge • Design schwarz/orange
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Pill>Tages-Soll: {DAY_HOURS}h</Pill>
            <Pill>Range: 8 Wochen</Pill>
          </div>
        </div>

        {/* Wochen-Header (2 Reihen a 4) */}
        <div className="px-4 pt-4 grid gap-3">
          <div className="grid grid-cols-4 gap-3">
            {weekMondays.slice(0, 4).map((m) => (
              <WeekHeader key={m.toISOString()} monday={m} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {weekMondays.slice(4, 8).map((m) => (
              <WeekHeader key={m.toISOString()} monday={m} />
            ))}
          </div>
        </div>

        {/* Mitarbeiter-Lanes */}
        <div className="px-4 py-4 space-y-4">
          {mitarbeiter.map((m) => {
            const list = projekteByMitarbeiter.get(m.id) || [];
            return (
              <div key={m.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-neutral-100">{m.name}</div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Pill>{list.length} Projekt(e)</Pill>
                    <Pill>Buchungen: {buchungen.filter((b) => b.mitarbeiterId === m.id).length}</Pill>
                  </div>
                </div>

                {/* 3 Spuren (Plan / Ist / Reserve) */}
                <div className="space-y-2">
                  {/* Spur 1: Plan (Projekte am Verantwortlichen) */}
                  <div>
                    <div className="mb-1 text-[11px] text-neutral-400">Spur 1 – Plan (Verantwortlicher)</div>
                    <div className="relative h-8 rounded-lg border border-neutral-800 bg-neutral-950/40 overflow-hidden">
                      {/* Raster: 56 Tage als sehr dezente Vertikallinien */}
                      <div className="absolute inset-0 z-0">
                        <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${range.totalDays}, minmax(0, 1fr))` }}>
                          {range.dayIsos.map((iso) => (
                            <div key={iso} className="border-r border-neutral-900/60" />
                          ))}
                        </div>
                      </div>

                      <div className="absolute inset-0 z-10 px-1">
                        {list.map((p) => {
                          const tl = timelines.get(p.id);
                          if (!tl) return null;
                          return <ProjectBar key={p.id} projekt={p} timeline={tl} range={range} />;
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Spur 2: Ist (Buchungen des Mitarbeiters) – aktuell nur Info-Leiste (stabil), Visual später */}
                  <div>
                    <div className="mb-1 text-[11px] text-neutral-400">Spur 2 – Ist (Buchungen)</div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-2 py-2 text-xs text-neutral-300">
                      {buchungen.filter((b) => b.mitarbeiterId === m.id).length === 0 ? (
                        <span className="text-neutral-500">Keine Buchungen im Datensatz erkannt.</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {buchungen
                            .filter((b) => b.mitarbeiterId === m.id)
                            .slice(0, 10)
                            .map((b) => (
                              <Pill key={b.id}>
                                {b.datum} • {b.stunden}h •{" "}
                                {projekte.find((p) => p.id === b.projektId)?.name || b.projektId}
                              </Pill>
                            ))}
                          {buchungen.filter((b) => b.mitarbeiterId === m.id).length > 10 ? (
                            <span className="text-neutral-500">…</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spur 3: Reserve */}
                  <div>
                    <div className="mb-1 text-[11px] text-neutral-400">Spur 3 – Reserve</div>
                    <div className="h-8 rounded-lg border border-neutral-800 bg-neutral-950/30" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-neutral-800 text-xs text-neutral-500">
          Diese Board-Version ist absichtlich „clean“ und reproduzierbar (localStorage/Demo). Nächster Schritt: Ist-Spur als echte Balken (z-10) in Spur 2, ohne Verlaufs-Tricks.
        </div>
      </div>
    </div>
  );
}
