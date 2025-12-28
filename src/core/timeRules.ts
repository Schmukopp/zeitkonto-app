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
