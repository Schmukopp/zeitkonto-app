// src/ui/Statistik.tsx
import React, { useMemo, useState } from "react";
import type { State } from "../core/timeStore";

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

function minutesToHoursNum(min?: number): number {
  const m = Number(min) || 0;
  return m / 60;
}

type Props = {
  state: State;
};

type YearOption = { key: string; label: string; year: number | null };

export default function Statistik(p: Props) {
  const archived = useMemo(() => {
    return (p.state.projects ?? []).filter((pr: any) => pr?.status === "archiv");
  }, [p.state.projects]);

  const yearOptions: YearOption[] = useMemo(() => {
    const years = new Set<number>();
    for (const pr of archived) {
      const y = Number(pr?.archivJahr);
      if (Number.isFinite(y) && y >= 2000 && y <= 2100) years.add(y);
    }
    const sorted = Array.from(years).sort((a, b) => b - a);

    return [
      { key: "all", label: "Alle Jahre", year: null },
      ...sorted.map((y) => ({ key: String(y), label: String(y), year: y })),
    ];
  }, [archived]);

  const [yearKey, setYearKey] = useState<string>(() => yearOptions[0]?.key ?? "all");

  const selectedYear = useMemo(() => {
    const opt = yearOptions.find((o) => o.key === yearKey);
    return opt?.year ?? null;
  }, [yearKey, yearOptions]);

  const stats = useMemo(() => {
    const list = selectedYear == null ? archived : archived.filter((p: any) => Number(p?.archivJahr) === selectedYear);

    let count = 0;
    let sumIstMin = 0;
    let sumUeberzugMin = 0;

    let sumVk = 0;
    let sumMat = 0;

    // Wertschöpfung = VK - Material (Istwerte)
    for (const pr of list) {
      count++;

      const ab = pr?.abschluss;
      const istMin = Number(ab?.istMinuten) || 0;
      const ue = Number(ab?.ueberzugMinuten) || 0;

      sumIstMin += Math.max(0, istMin);
      sumUeberzugMin += Math.max(0, ue);

      const vk = Number(ab?.nettoVkIstEur ?? pr?.istNettoVkEur) || 0;
      const mat = Number(ab?.materialIstEur ?? pr?.istMaterialEur) || 0;

      sumVk += Math.max(0, vk);
      sumMat += Math.max(0, mat);
    }

    const sumIstH = minutesToHoursNum(sumIstMin);
    const sumUeberzugH = minutesToHoursNum(sumUeberzugMin);

    const sumWert = Math.max(0, sumVk) - Math.max(0, sumMat);
    const avgWertProStd = sumIstH > 0 ? sumWert / sumIstH : 0;

    return {
      listCount: count,
      sumIstMin,
      sumIstH,
      sumUeberzugMin,
      sumUeberzugH,
      sumVk,
      sumMat,
      sumWert,
      avgWertProStd,
    };
  }, [archived, selectedYear]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">Meisterstatistik</div>
            <div className="text-sm text-neutral-400">
              Kennzahlen aus archivierten Projekten (Basis: Abschluss + Nachkalkulation).
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm text-neutral-400">Jahr</div>
            <select
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              value={yearKey}
              onChange={(e) => setYearKey(e.target.value)}
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

      {archived.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
          Noch keine Projekte im Archiv – Statistik ist leer.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Anzahl Projekte</div>
            <div className="text-2xl font-semibold tabular-nums">{stats.listCount}</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Summe Ist-Zeit</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt1(stats.sumIstH)} h</div>
            <div className="text-xs text-neutral-500 tabular-nums">{Math.round(stats.sumIstMin)} min</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Summe Überzug</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt1(stats.sumUeberzugH)} h</div>
            <div className="text-xs text-neutral-500 tabular-nums">{Math.round(stats.sumUeberzugMin)} min</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Summe Ist Netto-VK</div>
            <div className="text-2xl font-semibold tabular-nums">{fmtMoney(stats.sumVk)} €</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Summe Ist Material</div>
            <div className="text-2xl font-semibold tabular-nums">{fmtMoney(stats.sumMat)} €</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Summe Wertschöpfung</div>
            <div className="text-2xl font-semibold tabular-nums">{fmtMoney(stats.sumWert)} €</div>
            <div className="text-xs text-neutral-500">
              Ø Wert/Std: <span className="text-neutral-200 tabular-nums">{fmtMoney(stats.avgWertProStd)} €/h</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
