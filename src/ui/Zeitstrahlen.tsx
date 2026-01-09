// src/ui/Zeitstrahlen.tsx
import React, { useMemo } from "react";

/**
 * Zeitstrahlen (Wochenansicht)
 *
 * Ziel (konkret, robust, ohne White-Screen-Risiko):
 * - Ein Tag hat fixe Länge (default 10h).
 * - Pro Tag wird eine HARTE 2h-Markierung angezeigt (keine Farbintensität/Verlauf).
 * - Diese 2h-Markierung ist in Zeile 2 UND Zeile 3 sichtbar (also doppelt) und wird nicht verdeckt.
 * - Datenquelle bevorzugt: props.state.buchungen (aus App.tsx wird {state, ms, settings} rein gereicht).
 *
 * WICHTIG:
 * - Wir sind defensiv beim Daten-Shape, um Runtime-Crashes zu vermeiden.
 */

type IsoDate = string; // "YYYY-MM-DD"

// Minimal-Shape (wir lesen nur, was wir brauchen)
type BookingLike = {
  id?: string;
  art?: string; // "arbeit" | "urlaub" | ...
  mitarbeiterId?: string;
  mitarbeiterName?: string;
  projektId?: string;
  datum?: IsoDate;

  minuten?: number;

  // toleriert
  date?: IsoDate;
  day?: IsoDate;
  min?: number;
  hours?: number;
  std?: number;

  projektName?: string;
  projectName?: string;
};

type Props = {
  // App.tsx übergibt aktuell: <Zeitstrahlen {...({ state, setState, ms, settings } as any)} />
  state?: any;
  ms?: any;
  settings?: any;

  // Optional alternative data sources (legacy)
  bookings?: any;
  entries?: any;
  data?: any;

  // Anzeige
  startDate?: IsoDate; // Montag
  days?: number; // default 7

  // Taglänge
  dayHours?: number; // default 10

  // Marker-Länge
  markerHours?: number; // default 2
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDateUTC(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function startOfISOWeekUTC(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const day = d.getUTCDay(); // 0=So..6=Sa
  const diff = (day === 0 ? -6 : 1) - day; // Montag
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDaysUTC(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = Number(v.replace(",", "."));
    if (Number.isFinite(x)) return x;
  }
  return null;
}

function normalizeBookings(input: any): BookingLike[] {
  if (!input) return [];
  if (Array.isArray(input)) return input as BookingLike[];

  if (Array.isArray(input.items)) return input.items as BookingLike[];
  if (Array.isArray(input.entries)) return input.entries as BookingLike[];
  if (Array.isArray(input.data)) return input.data as BookingLike[];

  return [];
}

function getBookingDate(b: BookingLike): IsoDate | null {
  const iso = (b.datum || b.date || b.day || null) as any;
  if (typeof iso === "string" && iso.trim().length >= 10) return iso.trim().slice(0, 10);
  return null;
}

function getBookingMinutes(b: BookingLike): number {
  const m = safeNumber((b as any).minuten ?? (b as any).minutes ?? (b as any).min);
  if (m != null) return Math.max(0, m);

  const h = safeNumber((b as any).hours ?? (b as any).std);
  if (h != null) return Math.max(0, h * 60);

  return 0;
}

function formatDayLabel(iso: IsoDate) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
  const w = dt.toLocaleDateString("de-DE", { weekday: "short" });
  return `${w} ${pad2(d)}.${pad2(m)}`;
}

function pctFromMinutes(minutes: number, dayHours: number) {
  const maxMin = dayHours * 60;
  if (maxMin <= 0) return 0;
  return clamp((minutes / maxMin) * 100, 0, 100);
}

function sumArbeitsMinutenByDate(bookings: BookingLike[]) {
  const map = new Map<IsoDate, number>(); // minutes
  for (const b of bookings) {
    if (!b || typeof b !== "object") continue;
    if (String((b as any).art ?? "") !== "arbeit") continue;

    const iso = getBookingDate(b);
    if (!iso) continue;

    const minutes = getBookingMinutes(b);
    map.set(iso, (map.get(iso) || 0) + minutes);
  }
  return map;
}

function groupArbeitsByProject(bookings: BookingLike[]) {
  const map = new Map<string, BookingLike[]>();
  for (const b of bookings) {
    if (!b || typeof b !== "object") continue;
    if (String((b as any).art ?? "") !== "arbeit") continue;

    const pid = String((b as any).projektId ?? "");
    const pname = String((b as any).projektName ?? (b as any).projectName ?? pid ?? "Projekt").trim() || "Projekt";
    const key = pname;

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return map;
}

function isHexColor(v: any): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s);
}

function pickMeisterColor(ms: any): string {
  try {
    const list = Array.isArray(ms?.mitarbeiter) ? ms.mitarbeiter : [];
    const meister = list.find((m: any) => String(m?.rolle) === "meister");
    const c = meister?.farbe;
    if (isHexColor(c)) return c;
  } catch {
    // ignore
  }
  // solide Standardfarbe (blau), kein Verlauf
  return "#3b82f6";
}

function Bar({
  pct,
  labelLeft,
  labelRight,
  overPct,
}: {
  pct: number;
  labelLeft: string;
  labelRight?: string;
  overPct?: number;
}) {
  const safePct = clamp(pct, 0, 100);
  const safeOver = clamp(overPct || 0, 0, 100);

  return (
    <div className="relative h-7 rounded-lg border border-neutral-800 bg-neutral-950/70 overflow-hidden">
      {/* Hintergrund */}
      <div className="absolute inset-0 z-0 bg-neutral-950" />

      {/* Gearbeitet (ORANGE, Länge = Zeit) */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 bg-orange-500/90"
        style={{ width: `${safePct}%` }}
        aria-label={labelLeft}
      />

      {/* Überhang (ROT) */}
      {safeOver > 0 ? (
        <div
          className="absolute right-0 top-0 bottom-0 z-20 bg-red-600/85"
          style={{ width: `${safeOver}%` }}
          title="Über Soll (Überstunden/Überhang)"
        />
      ) : null}

      <div className="relative z-30 flex items-center justify-between h-full px-2 text-[12px] text-neutral-200">
        <span className="truncate">{labelLeft}</span>
        <span className="tabular-nums text-neutral-300">{labelRight ?? `${Math.round(pct)}%`}</span>
      </div>
    </div>
  );
}

function MarkerBar({
  markerPct,
  color,
  leftText,
  rightText,
}: {
  markerPct: number;
  color: string;
  leftText: string;
  rightText?: string;
}) {
  const safePct = clamp(markerPct, 0, 100);

  return (
    <div className="relative h-7 rounded-lg border border-neutral-800 bg-neutral-950/70 overflow-hidden">
      {/* Hintergrund */}
      <div className="absolute inset-0 z-0 bg-neutral-950" />

      {/* HARTE 2h-Markierung (SOLID, kein Verlauf) */}
      <div
        className="absolute left-0 top-0 bottom-0 z-20"
        style={{
          width: `${safePct}%`,
          backgroundColor: color,
          opacity: 0.95,
        }}
        aria-label={leftText}
      />

      {/* Labels liegen oben (nicht verdeckt) */}
      <div className="relative z-30 flex items-center justify-between h-full px-2 text-[12px] text-neutral-200">
        <span className="truncate">{leftText}</span>
        <span className="tabular-nums text-neutral-300">{rightText ?? ""}</span>
      </div>
    </div>
  );
}

export default function Zeitstrahlen(props: Props) {
  const dayHours = typeof props.dayHours === "number" && props.dayHours > 0 ? props.dayHours : 10;
  const markerHours = typeof props.markerHours === "number" && props.markerHours > 0 ? props.markerHours : 2;
  const daysCount = typeof props.days === "number" && props.days > 0 ? props.days : 7;

  const meisterColor = useMemo(() => pickMeisterColor(props.ms), [props.ms]);

  // Start: Montag (UTC), damit DST nicht reingrätscht
  const today = new Date();
  const start =
    props.startDate && /^\d{4}-\d{2}-\d{2}$/.test(props.startDate)
      ? new Date(Date.UTC(Number(props.startDate.slice(0, 4)), Number(props.startDate.slice(5, 7)) - 1, Number(props.startDate.slice(8, 10)), 0, 0, 0, 0))
      : startOfISOWeekUTC(today);

  const dayIsos = useMemo(() => {
    const arr: IsoDate[] = [];
    for (let i = 0; i < daysCount; i++) arr.push(toIsoDateUTC(addDaysUTC(start, i)));
    return arr;
  }, [start.getTime(), daysCount]);

  // Datenquelle: bevorzugt state.buchungen (App übergibt state)
  const raw =
    (props.state && (props.state as any).buchungen) ??
    props.bookings ??
    props.entries ??
    props.data ??
    null;

  const bookings = useMemo(() => normalizeBookings(raw), [raw]);

  const minutesByDate = useMemo(() => sumArbeitsMinutenByDate(bookings), [bookings]);
  const byProject = useMemo(() => groupArbeitsByProject(bookings), [bookings]);

  const markerPct = useMemo(() => {
    const maxMin = dayHours * 60;
    const m = markerHours * 60;
    if (maxMin <= 0) return 0;
    return clamp((m / maxMin) * 100, 0, 100);
  }, [dayHours, markerHours]);

  const totalRows = useMemo(() => {
    return dayIsos.map((iso) => {
      const minutes = minutesByDate.get(iso) || 0;
      const pct = pctFromMinutes(minutes, dayHours);
      const overRaw = minutes - dayHours * 60;
      const overPct = overRaw > 0 ? pctFromMinutes(overRaw, dayHours) : 0;
      return { iso, minutes, pct, overPct };
    });
  }, [dayIsos, minutesByDate, dayHours]);

  return (
    <div className="p-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Zeitstrahl</div>
            <div className="text-xs text-neutral-400">
              Fixe Tageslänge: <span className="text-neutral-200">{dayHours}h</span> • Marker:{" "}
              <span className="text-neutral-200">{markerHours}h</span> (harte Markierung)
            </div>
          </div>
          <div className="text-xs text-neutral-400 tabular-nums">
            Woche ab: <span className="text-neutral-200">{toIsoDateUTC(start)}</span>
          </div>
        </div>

        {/* Wochenraster: pro Tag = 3 Zeilen (Gesamt, Marker Zeile 2, Marker Zeile 3) */}
        <div className="px-4 py-4">
          <div className="text-xs text-neutral-400 mb-2">Woche (pro Tag 3 Zeilen)</div>

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${daysCount}, minmax(0, 1fr))` }}>
            {totalRows.map((r) => {
              const hours = r.minutes / 60;

              return (
                <div key={r.iso} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="truncate">{formatDayLabel(r.iso)}</span>
                    <span className="tabular-nums text-neutral-300">{hours.toFixed(2)}h</span>
                  </div>

                  {/* Zeile 1: gearbeitet */}
                  <Bar
                    pct={r.pct}
                    overPct={r.overPct}
                    labelLeft={r.minutes > 0 ? "gearbeitet" : "keine Buchung"}
                    labelRight={`${Math.round(r.pct)}%`}
                  />

                  {/* Zeile 2: HARTE 2h-Markierung */}
                  <div className="mt-2">
                    <MarkerBar
                      markerPct={markerPct}
                      color={meisterColor}
                      leftText="Marker"
                      rightText={`${markerHours}h`}
                    />
                  </div>

                  {/* Zeile 3: HARTE 2h-Markierung (zweite Sichtbarkeit) */}
                  <div className="mt-2">
                    <MarkerBar
                      markerPct={markerPct}
                      color={meisterColor}
                      leftText="Marker"
                      rightText={`${markerHours}h`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Projekte (optional) – bleibt wie vorher, aber nur Arbeit-Buchungen */}
        <div className="px-4 pb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-neutral-400">Projekte (nur Arbeit-Buchungen)</div>
            <div className="text-xs text-neutral-500">{byProject.size} Projekt(e)</div>
          </div>

          {byProject.size === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
              Keine Arbeit-Buchungen erkannt. Erwartet wird ein Array wie <span className="font-mono text-neutral-200">state.buchungen</span> (art="arbeit", datum, minuten).
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(byProject.entries()).map(([projectName, list]) => {
                // Summe pro Tag fürs Projekt
                const map = new Map<IsoDate, number>();
                for (const b of list) {
                  const iso = getBookingDate(b);
                  if (!iso) continue;
                  const m = getBookingMinutes(b);
                  map.set(iso, (map.get(iso) || 0) + m);
                }

                return (
                  <div key={projectName} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-neutral-100 truncate">{projectName}</div>
                      <div className="text-xs text-neutral-400 tabular-nums">{list.length} Eintrag/Einträge</div>
                    </div>

                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${daysCount}, minmax(0, 1fr))` }}>
                      {dayIsos.map((iso) => {
                        const minutes = map.get(iso) || 0;
                        const pct = pctFromMinutes(minutes, dayHours);
                        const overRaw = minutes - dayHours * 60;
                        const overPct = overRaw > 0 ? pctFromMinutes(overRaw, dayHours) : 0;
                        const hours = minutes / 60;

                        return (
                          <div key={iso} className="min-w-0">
                            <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
                              <span className="truncate">{formatDayLabel(iso)}</span>
                              <span className="tabular-nums text-neutral-300">{hours > 0 ? `${hours.toFixed(2)}h` : ""}</span>
                            </div>
                            <Bar pct={pct} overPct={overPct} labelLeft={minutes > 0 ? "gearbeitet" : "—"} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-neutral-800 text-xs text-neutral-500">
          Hinweis: Der Marker ist eine feste 2h-Länge pro Tag (keine Farbintensität). Gearbeitete Zeit bleibt ORANGE, Überhang ab 100% wird ROT überlagert.
        </div>
      </div>
    </div>
  );
}
