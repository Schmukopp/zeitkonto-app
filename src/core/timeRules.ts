import type { Buchung, DaySummary, StatusBuchung } from "./timeTypes";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function sumArbeitsMinuten(b: Buchung[], datum: string, mitarbeiterId: string) {
  return b
    .filter((x) => x.mitarbeiterId === mitarbeiterId && x.datum === datum && x.art === "arbeit")
    .reduce((a, x) => a + (Number((x as any).minuten) || 0), 0);
}

export function getStatus(b: Buchung[], datum: string, mitarbeiterId: string): StatusBuchung | null {
  const s = b.find(
    (x) =>
      x.mitarbeiterId === mitarbeiterId &&
      x.datum === datum &&
      (x.art === "urlaub" || x.art === "krank" || x.art === "ueberstundenabbau")
  );
  return (s as StatusBuchung) ?? null;
}

/**
 * NEUE Regel (wie von dir gefordert):
 * - Status ist nur für Abwesenheit (urlaub/krank) und Überstundenabbau relevant.
 * - Kein "Rest auffüllen" mehr.
 * - Default (minuten === null) = ganzer Tag (sollMinuten).
 * - ueberstundenabbau ist NICHT auf (soll - arbeit) begrenzt, sondern max = sollMinuten.
 */
export function calcStatusMinuten(
  sollMinuten: number,
  _arbeitMinuten: number,
  status: StatusBuchung | null
) {
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

export function calcDaySummary(args: {
  datum: string;
  mitarbeiterId: string;
  sollMinuten: number;
  buchungen: Buchung[];
}): DaySummary {
  const { datum, mitarbeiterId, sollMinuten, buchungen } = args;

  const arbeitMinuten = sumArbeitsMinuten(buchungen, datum, mitarbeiterId);
  const status = getStatus(buchungen, datum, mitarbeiterId);

  const { statusMinuten, maxAbbauMinuten, appliedStatusMinuten } = calcStatusMinuten(
    sollMinuten,
    arbeitMinuten,
    status
  );

  /**
   * ÜBERSTUNDEN-KONTO (korrekt):
   * - kein Status: arbeit - soll
   * - urlaub/krank: arbeit - 0  (Tag ist "abgedeckt")
   * - ueberstundenabbau: arbeit - abbauMinuten
   */
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
  };
}

export function minutesToHoursString(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.abs(min % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
import type { Mitarbeiter } from "./mitarbeiterStore";
import { urlaubswertForIsoDate } from "./workModel";

/**
 * Deterministische Kontenberechnung aus Buchungen:
 * - UrlaubstageVerbraucht = Summe(urlaubswert) für art="urlaub"
 * - ÜberstundenSaldo (h) = Summe(deltaUeberstundenMinuten) / 60
 *
 * Wichtig:
 * - Wir rechnen bewusst aus Buchungen, damit kein Drift entsteht.
 * - Zeitraum: standardmäßig alle Buchungen. (Optional später: nur aktuelles Kalenderjahr)
 */
export function recomputeMitarbeiterKonten(args: {
  mitarbeiter: Mitarbeiter[];
  buchungen: Buchung[];
}): Mitarbeiter[] {
  const { mitarbeiter, buchungen } = args;

  // Index: pro Mitarbeiter alle (datum -> status) + Sollminuten je Datum brauchen wir aus modell.
  // Wir laufen pragmatisch über alle Statusbuchungen und alle Arbeitstage, die es gibt.
  // Für Überstunden nehmen wir calcDaySummary (damit Regeln zentral sind).

  // Sammle alle Tage pro Mitarbeiter, die irgendwo vorkommen (Arbeit oder Status)
  const daysByM = new Map<string, Set<string>>();
  for (const b of buchungen) {
    const mid = (b as any).mitarbeiterId;
    const d = (b as any).datum;
    if (!mid || !d) continue;
    if (!daysByM.has(mid)) daysByM.set(mid, new Set());
    daysByM.get(mid)!.add(String(d));
  }

  return mitarbeiter.map((m) => {
    const days = daysByM.get(m.id) ?? new Set<string>();

    let sumDeltaUeMin = 0;
    let sumUrlaubTage = 0;

    for (const datum of days) {
      // Soll-Minuten aus Wochenmodell
      const sollMinuten = (() => {
        // workModel: Sa/So => 0, Mo–Fr => modell.tage[tag].sollMinuten
        // Wir nutzen deine bestehende Logik indirekt: in timeStore/Heute wird sollMinuten über sollMinutenForIsoDate gebildet.
        // Hier rechnen wir direkt:
        const js = new Date(datum + "T00:00:00").getDay(); // 0=So..6=Sa
        const map: Record<number, keyof typeof m.modell.tage> = { 1: "mo", 2: "di", 3: "mi", 4: "do", 5: "fr" };
        const t = map[js];
        return t ? (m.modell.tage[t]?.sollMinuten ?? 0) : 0;
      })();

      const day = calcDaySummary({
        datum,
        mitarbeiterId: m.id,
        sollMinuten,
        buchungen,
      });

      sumDeltaUeMin += day.deltaUeberstundenMinuten;

      if (day.statusArt === "urlaub") {
        // Urlaub in TAGEN nach Urlaubswert (0..1)
        sumUrlaubTage += urlaubswertForIsoDate(m.modell, datum);
      }
    }

    const nextSaldoH = Math.round((sumDeltaUeMin / 60) * 100) / 100; // 2 Dezimalstellen
    const nextUrlaubVerb = Math.round(sumUrlaubTage * 100) / 100;

    return {
      ...m,
      ueberstundenSaldo: nextSaldoH,
      urlaubstageVerbraucht: nextUrlaubVerb,
    };
  });
}
