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

  // Excel-Edit
  setDayArtHours: (isoDate: string, art: BuchungsArt, stunden: number) => void;
};

export function MitarbeiterMaske(p: Props) {
  const [week, setWeek] = useState<string>(defaultWeekToday());

  // Optional: kleines “Konto aktuell” aus den parallel gespeicherten Tagen (nur Mitarbeiter)
  // Das ist NICHT dein offizielles Wochen-Zeitkonto; es ist “Tagesbuchungen-Konto”.
  // Später mergen wir das sauber zusammen.
  const kontoAusTagen = useMemo(() => {
    // Wir berechnen über alle Tage (Mo–Fr + Wochenenden ignoriert über getTagesSoll=0)
    // Logik pro Tag:
    // frei reduziert effektives Soll; Ü-Abbau reduziert Konto direkt.
    const mapByDate = new Map<string, Record<BuchungsArt, number>>();
    for (const b of p.tagesBuchungen) {
      if (b.mitarbeiterId !== p.mitarbeiterId) continue;
      const row = mapByDate.get(b.datum) ?? { arbeit: 0, urlaub: 0, krank: 0, unbezahlt: 0, ueberstundenabbau: 0 };
      row[b.art] += Number(b.stunden) || 0;
      mapByDate.set(b.datum, row);
    }

    let konto = 0;
    for (const [iso, v] of mapByDate.entries()) {
      const tagesSoll = Number(p.getTagesSoll(iso)) || 0;
      const frei = v.urlaub + v.krank + v.unbezahlt;
      const effSoll = Math.max(0, tagesSoll - frei);
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
          Hinweis: Das ist das Konto aus den Tagesbuchungen (Mitarbeiter-Eingaben). Später führen wir das sauber mit dem Zeitkonto zusammen.
        </div>
      </div>

      <Wochenblatt
        ui={p.ui}
        mitarbeiterId={p.mitarbeiterId}
        week={week}
        setWeek={setWeek}
        getTagesSoll={p.getTagesSoll}
        tagesBuchungen={p.tagesBuchungen}
        setDayArtHours={p.setDayArtHours}
      />
    </div>
  );
}
