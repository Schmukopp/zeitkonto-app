import type { Buchung, DaySummary, StatusBuchung } from "./timeTypes";
import type { Mitarbeiter } from "./mitarbeiterStore";
import { urlaubswertForIsoDate } from "./workModel";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function sumArbeitsMinuten(b: Buchung[], datum: string, mitarbeiterId: string) {
  return (b ?? [])
    .filter((x: any) => x.mitarbeiterId === mitarbeiterId && x.datum === datum && x.art === "arbeit")
    .reduce((a: number, x: any) => a + (Number(x.minuten) || 0), 0);
}

export function getStatus(b: Buchung[], datum: string, mitarbeiterId: string): StatusBuchung | null {
  const s = (b ?? []).find(
    (x: any) =>
      x.mitarbeiterId === mitarbeiterId &&
      x.datum === datum &&
      (x.art === "urlaub" || x.art === "krank" || x.art === "ueberstundenabbau")
  );
  return (s as any) ?? null;
}

/**
 * Regel:
 * - Status ist nur für Abwesenheit (urlaub/krank) und Überstundenabbau relevant.
 * - Default (minuten === null) = ganzer Tag (sollMinuten).
 * - ueberstundenabbau max = sollMinuten.
 */
export function calcStatusMinuten(sollMinuten: number, _arbeitMinuten: number, status: StatusBuchung | null) {
  const maxProTag = Math.max(0, sollMinuten);

  if (!status) {
    return { statusMinuten: 0, maxAbbauMinuten: maxProTag, appliedStatusMinuten: 0 };
  }

  const desired =
    (status as any).minuten == null
      ? maxProTag
      : clamp(Math.max(0, Number((status as any).minuten) || 0), 0, maxProTag);

  const applied = clamp(desired, 0, maxProTag);

  return { statusMinuten: applied, maxAbbauMinuten: maxProTag, appliedStatusMinuten: applied };
}

/**
 * calcDaySummary kann in 2 Varianten aufgerufen werden:
 * 1) Neu: calcDaySummary({ datum, mitarbeiterId, sollMinuten, buchungen })
 * 2) Alt: calcDaySummary(state, mitarbeiterId, datum)  -> sollMinuten=0 fallback
 */
export function calcDaySummary(
  args:
    | {
        datum: string;
        mitarbeiterId: string;
        sollMinuten: number;
        buchungen: Buchung[];
      }
    | any,
  mitarbeiterIdMaybe?: string,
  datumMaybe?: string
): DaySummary {
  // Alte Signatur
  if (mitarbeiterIdMaybe && datumMaybe) {
    const state = args as any;
    const buchungen: Buchung[] = (state?.buchungen ?? []) as any;
    const sollMinuten = Number(state?.sollMinuten ?? 0) || 0;

    return calcDaySummary({
      datum: datumMaybe,
      mitarbeiterId: mitarbeiterIdMaybe,
      sollMinuten,
      buchungen,
    });
  }

  const { datum, mitarbeiterId, sollMinuten, buchungen } = args as any;

  const arbeitMinuten = sumArbeitsMinuten(buchungen, datum, mitarbeiterId);
  const status = getStatus(buchungen, datum, mitarbeiterId);

  const { statusMinuten, maxAbbauMinuten, appliedStatusMinuten } = calcStatusMinuten(
    sollMinuten,
    arbeitMinuten,
    status
  );

  let deltaUeberstundenMinuten = arbeitMinuten - sollMinuten;

  if (status?.art === "urlaub" || status?.art === "krank") {
    deltaUeberstundenMinuten = arbeitMinuten;
  } else if (status?.art === "ueberstundenabbau") {
    deltaUeberstundenMinuten = arbeitMinuten - appliedStatusMinuten;
  }

  return {
    datum,
    sollMinuten,
    arbeitMinuten,
    statusArt: status?.art ?? null,
    statusMinuten,
    maxAbbauMinuten,
    deltaUeberstundenMinuten,
    abbauMinuten: status?.art === "ueberstundenabbau" ? appliedStatusMinuten : 0,
    urlaubMinuten: status?.art === "urlaub" ? appliedStatusMinuten : 0,
    krankMinuten: status?.art === "krank" ? appliedStatusMinuten : 0,
  } as any;
}

export function minutesToHoursString(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.abs(min % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Deterministische Kontenberechnung aus Buchungen:
 * - UrlaubstageVerbraucht = Summe(urlaubswert) für Status art="urlaub"
 * - ÜberstundenSaldo (h) = Summe(deltaUeberstundenMinuten) / 60
 */
export function recomputeMitarbeiterKonten(args: { mitarbeiter: Mitarbeiter[]; buchungen: Buchung[] }): Mitarbeiter[] {
  const { mitarbeiter, buchungen } = args;

  const daysByM = new Map<string, Set<string>>();
  for (const b of buchungen ?? []) {
    const mid = (b as any)?.mitarbeiterId;
    const d = (b as any)?.datum;
    if (!mid || !d) continue;
    if (!daysByM.has(String(mid))) daysByM.set(String(mid), new Set());
    daysByM.get(String(mid))!.add(String(d).slice(0, 10));
  }

  function sollMinutenFromModell(m: Mitarbeiter, iso: string) {
    const js = new Date(iso + "T00:00:00").getDay(); // 0=So..6=Sa
    const map: Record<number, keyof typeof m.modell.tage> = { 1: "mo", 2: "di", 3: "mi", 4: "do", 5: "fr" };
    const t = map[js];
    return t ? (m.modell.tage[t]?.sollMinuten ?? 0) : 0;
  }

  return (mitarbeiter ?? []).map((m) => {
    const days = daysByM.get(m.id) ?? new Set<string>();

    let sumDeltaUeMin = 0;
    let sumUrlaubTage = 0;

    for (const datum of days) {
      const sollMinuten = sollMinutenFromModell(m, datum);

      const day = calcDaySummary({
        datum,
        mitarbeiterId: m.id,
        sollMinuten,
        buchungen,
      });

      sumDeltaUeMin += day.deltaUeberstundenMinuten;

      if (day.statusArt === "urlaub" && (day.statusMinuten ?? 0) > 0) {
        sumUrlaubTage += urlaubswertForIsoDate(m.modell, datum);
      }
    }

    const nextSaldoH = Math.round((sumDeltaUeMin / 60) * 100) / 100;
    const nextUrlaubVerb = Math.round(sumUrlaubTage * 100) / 100;

    return {
      ...m,
      ueberstundenSaldo: nextSaldoH,
      urlaubstageVerbraucht: nextUrlaubVerb,
    };
  });
}
