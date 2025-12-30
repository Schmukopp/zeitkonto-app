// src/ui/Zeitstrahlen.tsx
import React, { useMemo } from "react";

/**
 * Ziel:
 * - Zeit = Länge (keine Farbintensität/Verlauf für Zeit)
 * - Sauberes Corporate Design (schwarz/orange)
 * - Layer-Regel: Hintergrund z-0, Fortschritt z-10
 * - Robust gegen unterschiedliche Datenquellen: defensive Verarbeitung
 *
 * WICHTIG:
 * Diese Komponente akzeptiert "irgendwelche" Props (unknown/any) und versucht,
 * daraus sinnvolle Buchungen zu lesen, ohne dass TypeScript/Runtime direkt bricht.
 * Dadurch bleibt die App stabil, auch wenn dein Store/Shape noch nicht final ist.
 */

type IsoDate = string; // "YYYY-MM-DD"

type BookingLike = {
  date?: IsoDate;
  datum?: IsoDate;
  day?: IsoDate;
  projectId?: string;
  projektId?: string;
  projectName?: string;
  projektName?: string;
  minutes?: number;
  min?: number;
  hours?: number;
  std?: number;
};

type Props = {
  // Optional: wenn App.tsx oder ein Store bereits Daten reinreicht, nutzen wir sie.
  // Wir nehmen "any" bewusst, um nichts kaputt zu typisieren.
  bookings?: any;
  entries?: any;
  data?: any;

  // Optional: Tages-Soll in Stunden (fixe Länge)
  dayHours?: number;

  // Optional: Anzeige-Range
  startDate?: IsoDate; // Montag
  days?: number; // default 7
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfISOWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=So,1=Mo,...6=Sa
  const diff = (day === 0 ? -6 : 1) - day; // auf Montag
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
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
  // Häufige Formen: { items: [...] } oder { entries: [...] }
  if (Array.isArray(input.items)) return input.items as BookingLike[];
  if (Array.isArray(input.entries)) return input.entries as BookingLike[];
  if (Array.isArray(input.data)) return input.data as BookingLike[];
  return [];
}

function getBookingDate(b: BookingLike): IsoDate | null {
  return (b.date || b.datum || b.day || null) as any;
}

function getBookingMinutes(b: BookingLike): number {
  // Reihenfolge: minutes/min -> hours/std
  const m = safeNumber((b as any).minutes ?? (b as any).min);
  if (m != null) return Math.max(0, m);
  const h = safeNumber((b as any).hours ?? (b as any).std);
  if (h != null) return Math.max(0, h * 60);
  return 0;
}

function getProjectName(b: BookingLike): string {
  return (
    (b.projectName as any) ||
    (b.projektName as any) ||
    (b.projectId as any) ||
    (b.projektId as any) ||
    "Projekt"
  );
}

function formatDayLabel(iso: IsoDate) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const w = dt.toLocaleDateString("de-DE", { weekday: "short" });
  return `${w} ${pad2(d)}.${pad2(m)}`;
}

function sumByDate(bookings: BookingLike[]) {
  const map = new Map<IsoDate, number>(); // minutes
  for (const b of bookings) {
    const iso = getBookingDate(b);
    if (!iso) continue;
    const minutes = getBookingMinutes(b);
    map.set(iso, (map.get(iso) || 0) + minutes);
  }
  return map;
}

function groupByProject(bookings: BookingLike[]) {
  const map = new Map<string, BookingLike[]>();
  for (const b of bookings) {
    const name = getProjectName(b);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(b);
  }
  return map;
}

function pctFromMinutes(minutes: number, dayHours: number) {
  const maxMin = dayHours * 60;
  if (maxMin <= 0) return 0;
  return clamp((minutes / maxMin) * 100, 0, 100);
}

function Bar({
  pct,
  label,
  overPct,
}: {
  pct: number;
  label: string;
  overPct?: number; // >0 zeigt Überhang (rot) über 100% hinaus, aber capped visuell
}) {
  const safePct = clamp(pct, 0, 100);
  const safeOver = clamp(overPct || 0, 0, 100);

  return (
    <div className="relative h-7 rounded-lg border border-neutral-800 bg-neutral-950/70 overflow-hidden">
      {/* Hintergrund (Zeitstrahl) */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-neutral-950 to-neutral-900" />

      {/* Gearbeitet (z-10) – ORANGE, Länge = Zeit */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 bg-orange-500/90"
        style={{ width: `${safePct}%` }}
        aria-label={label}
      />

      {/* Überhang (wenn > 100%) – ROT ab 100% (nur Anzeige-Overlay) */}
      {safeOver > 0 ? (
        <div
          className="absolute right-0 top-0 bottom-0 z-20 bg-red-600/85"
          style={{ width: `${safeOver}%` }}
          title="Über Soll (Überstunden/Überhang)"
        />
      ) : null}

      <div className="relative z-30 flex items-center justify-between h-full px-2 text-[12px] text-neutral-200">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-neutral-300">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

export default function Zeitstrahlen(props: Props) {
  const dayHours = typeof props.dayHours === "number" && props.dayHours > 0 ? props.dayHours : 10;
  const daysCount = typeof props.days === "number" && props.days > 0 ? props.days : 7;

  const today = new Date();
  const start =
    props.startDate && /^\d{4}-\d{2}-\d{2}$/.test(props.startDate)
      ? new Date(
          Number(props.startDate.slice(0, 4)),
          Number(props.startDate.slice(5, 7)) - 1,
          Number(props.startDate.slice(8, 10))
        )
      : startOfISOWeek(today);

  const dayIsos = useMemo(() => {
    const arr: IsoDate[] = [];
    for (let i = 0; i < daysCount; i++) arr.push(toIsoDate(addDays(start, i)));
    return arr;
  }, [start.getTime(), daysCount]);

  // Datenquellen robust einsammeln
  const raw = props.bookings ?? props.entries ?? props.data ?? null;
  const bookings = useMemo(() => normalizeBookings(raw), [raw]);

  const minutesByDate = useMemo(() => sumByDate(bookings), [bookings]);
  const byProject = useMemo(() => groupByProject(bookings), [bookings]);

  // Gesamt pro Tag (für den großen Strahl)
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
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Zeitstrahl</div>
            <div className="text-xs text-neutral-400">
              Fixe Tageslänge: <span className="text-neutral-200">{dayHours}h</span> • Zeit = Länge (keine Farb-Intensität)
            </div>
          </div>
          <div className="text-xs text-neutral-400 tabular-nums">
            Woche ab: <span className="text-neutral-200">{toIsoDate(start)}</span>
          </div>
        </div>

        {/* Gesamtreihe */}
        <div className="px-4 py-4">
          <div className="text-xs text-neutral-400 mb-2">Gesamt pro Tag</div>

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${daysCount}, minmax(0, 1fr))` }}>
            {totalRows.map((r) => {
              const hours = r.minutes / 60;
              return (
                <div key={r.iso} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="truncate">{formatDayLabel(r.iso)}</span>
                    <span className="tabular-nums text-neutral-300">{hours.toFixed(2)}h</span>
                  </div>
                  <Bar
                    pct={r.pct}
                    overPct={r.overPct}
                    label={r.minutes > 0 ? "gearbeitet" : "keine Buchung"}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Projekte (optional) */}
        <div className="px-4 pb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-neutral-400">Projekte (wenn Buchungen vorhanden)</div>
            <div className="text-xs text-neutral-500">{byProject.size} Projekt(e)</div>
          </div>

          {byProject.size === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300">
              Keine Buchungen erkannt. Wenn deine App Buchungen hat, müssen sie als Array in
              <span className="font-mono text-neutral-200"> bookings</span> /
              <span className="font-mono text-neutral-200"> entries</span> /
              <span className="font-mono text-neutral-200"> data</span> an diese Komponente übergeben werden.
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(byProject.entries()).map(([projectName, list]) => {
                const map = sumByDate(list);
                return (
                  <div key={projectName} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
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
                            <Bar pct={pct} overPct={overPct} label={minutes > 0 ? "gearbeitet" : "—"} />
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

        {/* Footer */}
        <div className="px-4 py-3 border-t border-neutral-800 text-xs text-neutral-500">
          Hinweis: Über Soll wird ab 100% als roter Overlay-Anteil dargestellt (Länge bleibt maßgeblich).
        </div>
      </div>
    </div>
  );
}
