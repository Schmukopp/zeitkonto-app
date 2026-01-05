// src/ui/Statistik.tsx
import React, { useMemo, useState } from "react";
import type { State } from "../core/timeStore";
import { getJahresStatistik } from "../core/timeStore";

function fmtMoney(n?: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

function fmt1(n?: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.0";
  return x.toFixed(1);
}

type Props = {
  state: State;
};

type YearOption = { key: string; label: string; year: number | null };

export default function Statistik(p: Props) {
  try {
    const archived = useMemo(() => {
      return (p.state.projects ?? []).filter((pr: any) => pr?.status === "archiv");
    }, [p.state.projects]);

    const yearOptions: YearOption[] = useMemo(() => {
      const years = new Set<number>();
      for (const pr of archived) {
        const y = Number((pr as any)?.archivJahr);
        if (Number.isFinite(y) && y >= 2000 && y <= 2100) years.add(y);
      }
      const sorted = Array.from(years).sort((a, b) => b - a);

      return [
        { key: "all", label: "Alle Jahre", year: null },
        ...sorted.map((y) => ({ key: String(y), label: String(y), year: y })),
      ];
    }, [archived]);

    const [yearKey, setYearKey] = useState<string>("all");

    const selectedYear = useMemo(() => {
      const opt = yearOptions.find((o) => o.key === yearKey);
      return opt?.year ?? null;
    }, [yearKey, yearOptions]);

    const view = useMemo(() => {
      // Wenn gar keine Archivjahre existieren, bleibt alles 0
      const years = yearOptions
        .filter((o) => o.year != null)
        .map((o) => Number(o.year))
        .filter((y) => Number.isFinite(y));

      if (selectedYear == null) {
        let projektAnzahl = 0;
        let istMinutenGesamt = 0;
        let wertschoepfungEurGesamt = 0;

        for (const y of years) {
          const js = getJahresStatistik(p.state, y);
          projektAnzahl += js.projektAnzahl;
          istMinutenGesamt += js.istMinutenGesamt;
          wertschoepfungEurGesamt += js.wertschoepfungEurGesamt;
        }

        const istStundenGesamt = istMinutenGesamt / 60;
        const wertschoepfungEurProStd = istStundenGesamt > 0 ? wertschoepfungEurGesamt / istStundenGesamt : 0;

        return {
          label: "Alle Jahre",
          projektAnzahl,
          istMinutenGesamt,
          istStundenGesamt,
          wertschoepfungEurGesamt,
          wertschoepfungEurProStd,
        };
      }

      const js = getJahresStatistik(p.state, selectedYear);

      return {
        label: String(selectedYear),
        projektAnzahl: js.projektAnzahl,
        istMinutenGesamt: js.istMinutenGesamt,
        istStundenGesamt: js.istStundenGesamt,
        wertschoepfungEurGesamt: js.wertschoepfungEurGesamt,
        wertschoepfungEurProStd: js.wertschoepfungEurProStd,
      };
    }, [p.state, selectedYear, yearOptions]);

    const hasArchiv = archived.length > 0;

    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-semibold">Jahres- / Meisterstatistik</div>
              <div className="text-sm text-neutral-400">
                Kennzahlen aus archivierten Projekten (Quelle: Store-Statistik).
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-sm text-neutral-400">Jahr</div>
              <select
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                value={yearKey}
                onChange={(e) => setYearKey(e.target.value)}
                disabled={yearOptions.length === 0}
              >
                {yearOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {!hasArchiv ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
            Noch keine Projekte im Archiv – Statistik ist leer.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Auswahl</div>
              <div className="text-2xl font-semibold tabular-nums">{view.label}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Anzahl Projekte</div>
              <div className="text-2xl font-semibold tabular-nums">{view.projektAnzahl}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Summe Ist-Zeit</div>
              <div className="text-2xl font-semibold tabular-nums">{fmt1(view.istStundenGesamt)} h</div>
              <div className="text-xs text-neutral-500 tabular-nums">{Math.round(view.istMinutenGesamt)} min</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Summe Wertschöpfung</div>
              <div className="text-2xl font-semibold tabular-nums">{fmtMoney(view.wertschoepfungEurGesamt)} €</div>
              <div className="text-xs text-neutral-500">
                Ø Wert/Std:{" "}
                <span className="text-neutral-200 tabular-nums">{fmtMoney(view.wertschoepfungEurProStd)} €/h</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err: any) {
    return (
      <div className="rounded-2xl border border-red-800 bg-neutral-950 p-4">
        <div className="text-lg font-semibold text-red-300">Statistik-Fehler</div>
        <div className="mt-2 text-sm text-neutral-300">
          Beim Rendern ist ein Fehler passiert. Unten steht die Meldung:
        </div>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-200">
          {String(err?.stack || err?.message || err)}
        </pre>
      </div>
    );
  }
}
