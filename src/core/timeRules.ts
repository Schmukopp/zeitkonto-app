import type { Buchung, DaySummary, StatusBuchung } from "./timeTypes";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function sumArbeitsMinuten(b: Buchung[], datum: string, mitarbeiterId: string) {
  return b
    .filter((x) => x.mitarbeiterId === mitarbeiterId && x.datum === datum && x.art === "arbeit")
    .reduce((a, x) => a + (Number(x.minuten) || 0), 0);
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
 * Regel: Überstundenabbau darf nur bis SOLL-Rest gehen:
 * maxAbbau = max(0, soll - arbeit)
 */
export function calcStatusMinuten(
  sollMinuten: number,
  arbeitMinuten: number,
  status: StatusBuchung | null
) {
  const rest = Math.max(0, sollMinuten - arbeitMinuten);
  const maxAbbau = rest;

  if (!status) {
    return { statusMinuten: 0, maxAbbauMinuten: maxAbbau, appliedStatusMinuten: 0 };
  }

  const desired = status.minuten == null ? rest : Math.max(0, Number(status.minuten) || 0);

  if (status.art === "ueberstundenabbau") {
    const applied = clamp(desired, 0, maxAbbau);
    return { statusMinuten: applied, maxAbbauMinuten: maxAbbau, appliedStatusMinuten: applied };
  }

  // Urlaub / Krank: Standard = bis Rest auffüllen (nicht über SOLL hinaus)
  const applied = clamp(desired, 0, rest);
  return { statusMinuten: applied, maxAbbauMinuten: maxAbbau, appliedStatusMinuten: applied };
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

  const deltaUeberstundenMinuten = arbeitMinuten - sollMinuten;

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
