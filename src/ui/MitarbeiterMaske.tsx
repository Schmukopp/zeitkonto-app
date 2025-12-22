import React, { useMemo, useState } from "react";

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

export function isoToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtArtShort(a: BuchungsArt) {
  switch (a) {
    case "arbeit":
      return "Arb";
    case "urlaub":
      return "Url";
    case "krank":
      return "Kra";
    case "unbezahlt":
      return "Unb";
    case "ueberstundenabbau":
      return "ÜAb";
  }
}

function fmtArtLong(a: BuchungsArt) {
  switch (a) {
    case "arbeit":
      return "Arbeit";
    case "urlaub":
      return "Urlaub";
    case "krank":
      return "Krank";
    case "unbezahlt":
      return "Unbezahlt";
    case "ueberstundenabbau":
      return "Überstundenabbau";
  }
}

function parseIsoDateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

function toWochenTag(iso: string): "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so" | null {
  const dt = parseIsoDateLocal(iso);
  if (!dt) return null;
  const wd = dt.getDay(); // 0 So ... 6 Sa
  if (wd === 1) return "mo";
  if (wd === 2) return "di";
  if (wd === 3) return "mi";
  if (wd === 4) return "do";
  if (wd === 5) return "fr";
  if (wd === 6) return "sa";
  return "so";
}

type Props = {
  ui: Ui;
  mitarbeiterId: string;
  mitarbeiterName: string;

  // intern: Tages-SOLL aus Modell (wird NICHT angezeigt)
  getTagesSoll: (isoDate: string) => number;

  tagesBuchungen: TagesBuchung[];
  addTagesBuchung: (b: Omit<TagesBuchung, "id">) => void;
  deleteTagesBuchung: (id: string) => void;
};

export function MitarbeiterMaske(p: Props) {
  const [datum, setDatum] = useState<string>(isoToday());
  const [art, setArt] = useState<BuchungsArt>("arbeit");
  const [stunden, setStunden] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  const [msgErr, setMsgErr] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState<string | null>(null);

  const tag = toWochenTag(datum);

  const tagesSoll = useMemo(() => {
    const v = p.getTagesSoll(datum);
    return Number.isFinite(v) ? v : 0;
  }, [p, datum]);

  const dayRows = useMemo(() => {
    return p.tagesBuchungen
      .filter((x) => x.mitarbeiterId === p.mitarbeiterId && x.datum === datum)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [p.tagesBuchungen, p.mitarbeiterId, datum]);

  const sums = useMemo(() => {
    const byArt: Record<BuchungsArt, number> = {
      arbeit: 0,
      urlaub: 0,
      krank: 0,
      unbezahlt: 0,
      ueberstundenabbau: 0
    };

    for (const r of dayRows) byArt[r.art] += Number(r.stunden) || 0;

    const arbeitszeit = byArt.arbeit;
    const frei = byArt.urlaub + byArt.krank + byArt.unbezahlt;
    const abbau = byArt.ueberstundenabbau;

    // intern: effektives SOLL, aber NICHT anzeigen
    const effSoll = Math.max(0, tagesSoll - frei);

    // „Ü-Stunden heute“ = Arbeit - effSoll
    const ueHeute = arbeitszeit - effSoll;

    // Kontoänderung heute = Ü-Stunden heute - Überstundenabbau
    const kontoAenderung = ueHeute - abbau;

    return {
      byArt,
      arbeitszeit,
      frei,
      abbau,
      ueHeute,
      kontoAenderung
    };
  }, [dayRows, tagesSoll]);

  function submit() {
    setMsgErr(null);
    setMsgOk(null);

    const d = (datum ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return setMsgErr("Datum ungültig. Format: YYYY-MM-DD.");
    if (!Number.isFinite(stunden) || stunden < 0) return setMsgErr("Stunden müssen eine Zahl >= 0 sein.");

    p.addTagesBuchung({
      mitarbeiterId: p.mitarbeiterId,
      datum: d,
      art,
      stunden,
      note: note.trim() ? note.trim() : undefined
    });

    setMsgOk("Eintrag hinzugefügt.");
    setStunden(0);
    setNote("");
  }

  const pill = "rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-300";

  return (
    <div className={`${p.ui.card} ${p.ui.cardBody}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">Mitarbeiter</div>
          <div className={p.ui.subtitle}>{p.mitarbeiterName}</div>
        </div>

        <div className="text-sm text-zinc-400">
          Datum:
          <div className="mt-1">
            <input className={p.ui.input} type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Kompakte Tages-KPIs (ohne SOLL) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={pill}>
          Tag: <span className="font-medium">{tag ? tag.toUpperCase() : "—"}</span>
        </span>
        <span className={pill}>
          Arbeit: <span className="font-medium tabular-nums">{sums.arbeitszeit}</span> h
        </span>
        <span className={pill}>
          Frei: <span className="font-medium tabular-nums">{sums.frei}</span> h
        </span>
        <span className={pill}>
          Ü-Abbau: <span className="font-medium tabular-nums">{sums.abbau}</span> h
        </span>
        <span className={pill}>
          Ü-Stunden heute:{" "}
          <span className={"font-medium tabular-nums " + (sums.ueHeute < 0 ? "text-red-300" : "text-emerald-300")}>
            {sums.ueHeute}
          </span>{" "}
          h
        </span>
        <span className={pill}>
          Konto ± heute:{" "}
          <span
            className={
              "font-medium tabular-nums " + (sums.kontoAenderung < 0 ? "text-red-300" : "text-emerald-300")
            }
          >
            {sums.kontoAenderung}
          </span>{" "}
          h
        </span>
      </div>

      {/* Formular kompakt */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className={p.ui.label}>Art</label>
          <select className={p.ui.select} value={art} onChange={(e) => setArt(e.target.value as BuchungsArt)}>
            <option value="arbeit">Arbeit</option>
            <option value="urlaub">Urlaub</option>
            <option value="krank">Krank</option>
            <option value="unbezahlt">Unbezahlt</option>
            <option value="ueberstundenabbau">Überstundenabbau</option>
          </select>
          <div className={p.ui.hint}>Mehrere Einträge pro Tag sind erlaubt.</div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={p.ui.label}>Stunden</label>
          <input
            className={p.ui.numberInput}
            type="number"
            min={0}
            step="0.25"
            value={stunden}
            onChange={(e) => setStunden(Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1 md:col-span-2">
          <label className={p.ui.label}>Notiz (optional)</label>
          <input className={p.ui.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z.B. Montage, Arzttermin" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={p.ui.btnPrimary} onClick={submit}>
          Hinzufügen
        </button>
        {msgErr ? <div className="text-sm text-red-300">{msgErr}</div> : null}
        {msgOk ? <div className="text-sm text-emerald-300">{msgOk}</div> : null}
      </div>

      {/* Liste: sehr kompakt */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Einträge am {datum}</div>
          <div className="text-sm text-zinc-400">
            Ü-Stunden heute:{" "}
            <span className={sums.ueHeute < 0 ? "text-red-300 tabular-nums font-medium" : "text-emerald-300 tabular-nums font-medium"}>
              {sums.ueHeute}
            </span>{" "}
            h
          </div>
        </div>

        {dayRows.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-400">Keine Einträge für dieses Datum.</div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-zinc-300">
                <tr>
                  <th className="p-2 text-left">Art</th>
                  <th className="p-2 text-right">h</th>
                  <th className="p-2 text-left">Notiz</th>
                  <th className="p-2 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="p-2">
                      <span className="text-xs text-zinc-400">{fmtArtShort(r.art)}</span>{" "}
                      <span className="text-zinc-200">{fmtArtLong(r.art)}</span>
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.stunden}</td>
                    <td className="p-2 text-zinc-400">{r.note ?? ""}</td>
                    <td className="p-2 text-right">
                      <button type="button" className={p.ui.btnDanger} onClick={() => p.deleteTagesBuchung(r.id)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-zinc-800">
                  <td className="p-2 font-semibold">Kompakt</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{sums.arbeitszeit}</td>
                  <td className="p-2 text-zinc-500">
                    Frei {sums.frei}h · Ü-Abbau {sums.abbau}h · Ü-Stunden{" "}
                    <span className={sums.ueHeute < 0 ? "text-red-300" : "text-emerald-300"}>{sums.ueHeute}</span>h · Konto{" "}
                    <span className={sums.kontoAenderung < 0 ? "text-red-300" : "text-emerald-300"}>{sums.kontoAenderung}</span>h
                  </td>
                  <td className="p-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
