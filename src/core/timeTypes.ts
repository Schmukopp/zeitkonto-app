export type Bereich = "maschinenraum" | "bankraum" | "lackraum";

export type BuchungArt = "arbeit" | "urlaub" | "krank" | "ueberstundenabbau";

export type ArbeitsBuchung = {
  id: string;
  mitarbeiterId: string;
  datum: string; // YYYY-MM-DD
  art: "arbeit";
  projektId: string;
  bereich: Bereich;
  startTs?: number; // optional (Timer)
  endeTs?: number;  // optional (Timer)
  minuten: number;  // immer gesetzt (Quelle der Wahrheit)
  note?: string;
};

export type StatusBuchung = {
  id: string;
  mitarbeiterId: string;
  datum: string; // YYYY-MM-DD
  art: "urlaub" | "krank" | "ueberstundenabbau";
  minuten: number | null; // null = "auto"
  note?: string;
};

export type Buchung = ArbeitsBuchung | StatusBuchung;

export type Projekt = {
  id: string;
  name: string;
  active: boolean;
};

export type MitarbeiterKonto = {
  mitarbeiterId: string;
  urlaubGesamtTage: number;
  urlaubVerbrauchtTage: number;
  ueberstundenMinuten: number;
};

export type DaySummary = {
  datum: string;
  sollMinuten: number;
  arbeitMinuten: number;
  statusArt: StatusBuchung["art"] | null;
  statusMinuten: number;
  // Clamp-Info (wichtig)
  maxAbbauMinuten: number;
  // Kontenwirkung
  deltaUeberstundenMinuten: number; // arbeit - soll
  abbauMinuten: number;             // nur ueberstundenabbau
  urlaubMinuten: number;            // nur urlaub
  krankMinuten: number;             // nur krank
};
