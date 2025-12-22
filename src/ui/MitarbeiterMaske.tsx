import React, { useMemo, useState } from "react";
import { Wochenblatt, defaultWeekToday } from "./Wochenblatt";

type Ui = Record<string, string>;

export type BuchungsArt = "arbeit" | "urlaub" | "krank" | "unbezahlt" | "ueberstundenabbau";

export type TagesBuchung = {
  id: string;
  mitarbeiterId: string;
  datum: string; // YYYY-MM-DD
  art: BuchungsArt;
  stunden: number;
  note?: string;
};

type Props = {
  ui: Ui;
  mitarbeiterId: string;
  mitarbeiterName: string;

  // intern: Tages-SOLL aus Modell (nicht anzeigen)
  getTagesSoll: (isoDate: string) => number;

  tagesBuchungen: TagesBuchung[];

  // CRUD Handler (aus App)
  addWorkLine: (isoDate: string) => void;
  updateBooking: (id: string, patch: Partial<Pick<TagesBuchung, "note" | "stunden">>) => void;
  deleteBooking: (id: string) => void;

  setAbsence: (isoDate: string, art: "urlaub" | "krank" | "unbezahlt" | "none", stundenOrNull: number | null) => void;
  setUeAbbau: (isoDate: string, stunden: number) => void;
};

export function MitarbeiterMaske(p: Props) {
  const [week, setWeek] = useState<string>(defaultWeekToday());

  // Konto aus Tagesbuchungen (nur Mitarbeiter) – als Richtwert
  const kontoAusTagen = useMemo(() => {
    const mapByDate = new Map<string, Record<BuchungsArt, number>>();
    for (const b of p.tagesBuchungen) {
      if (b.mitarbeiterId !== p.mitarbeiterId) continue;
      const row = mapByDate.get(b.datum) ?? { arbeit: 0, urlaub: 0, krank: 0, unbezahlt: 0, ueberstundenabbau: 0 };
      row[b.art] += Number(b.stunden) || 0;
      mapByDate.set(b.datum, row);
    }

    let konto = 0;
    for (const [iso, v] of mapByDate.entries()) {
      const soll = Number(p.getTagesSoll(iso)) || 0;
      const frei = v.urlaub + v.krank + v.unbezahlt;
      const effSoll = Math.max(0, soll - frei);
      const ueHeute = v.arbeit - effSoll;
      konto += ueHeute - v.ueberstundenabbau;
    }
    return konto;
  }, [p.tagesBuchungen, p.mitarbeiterId, p]);

  return (
    <div className="space-y-4">
      <div className={`${p.ui.card} ${p.ui.cardBody}`}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-semibold">Mitarbeiter</div>
            <div className={p.ui.subtitle}>{p.mitarbeiterName}</div>
          </div>

          <div className="text-sm text-zinc-400">
            Überstundenkonto (aus Tagesbuchungen):
            <div className={"tabular-nums font-semibold " + (kontoAusTagen < 0 ? "text-red-300" : "text-emerald-300")}>
              {kontoAusTagen} h
            </div>
          </div>
        </div>

        <div className={p.ui.hint + " mt-2"}>
          Ziel: Mitarbeiter tragen täglich Projekte/Tätigkeiten ein. Abwesenheit kann ohne Stunden (voller Tag) gesetzt werden.
        </div>
      </div>

      <Wochenblatt
        ui={p.ui}
        mitarbeiterId={p.mitarbeiterId}
        week={week}
        setWeek={setWeek}
        getTagesSoll={p.getTagesSoll}
        tagesBuchungen={p.tagesBuchungen}
        addWorkLine={p.addWorkLine}
        updateBooking={p.updateBooking}
        deleteBooking={p.deleteBooking}
        setAbsence={p.setAbsence}
        setUeAbbau={p.setUeAbbau}
      />
    </div>
  );
}
