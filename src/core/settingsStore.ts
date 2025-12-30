// src/core/settingsStore.ts
const LS_KEY = "orgaboard.settings.v1";

export type Settings = {
  // Betrieb
  wertschoepfungZielEurProStd: number; // €/h

  // Anzeige / UX
  showNumbersOnBoard: boolean;       // Zahlen (Soll/Ist/Delta) in Board/Pool anzeigen
  showDetailsInPool: boolean;        // Pool zeigt Zusatzinfos (Zugeordnet, Fortschritt)
  showArbeitsartIndicator: boolean;  // 4-Segment-Anzeige Maschine/Bank/Lack/Montage
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export const DEFAULT_SETTINGS: Settings = {
  wertschoepfungZielEurProStd: 105,

  showNumbersOnBoard: false,
  showDetailsInPool: true,
  showArbeitsartIndicator: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw) as Partial<Settings>;

    const ziel = clamp(
      Number(parsed.wertschoepfungZielEurProStd) || DEFAULT_SETTINGS.wertschoepfungZielEurProStd,
      0,
      9999
    );

    return {
      wertschoepfungZielEurProStd: ziel,

      showNumbersOnBoard: typeof parsed.showNumbersOnBoard === "boolean" ? parsed.showNumbersOnBoard : DEFAULT_SETTINGS.showNumbersOnBoard,
      showDetailsInPool: typeof parsed.showDetailsInPool === "boolean" ? parsed.showDetailsInPool : DEFAULT_SETTINGS.showDetailsInPool,
      showArbeitsartIndicator: typeof parsed.showArbeitsartIndicator === "boolean" ? parsed.showArbeitsartIndicator : DEFAULT_SETTINGS.showArbeitsartIndicator,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export function upsertSettings(s: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = {
    wertschoepfungZielEurProStd: clamp(
      Number(patch.wertschoepfungZielEurProStd ?? s.wertschoepfungZielEurProStd) || 0,
      0,
      9999
    ),

    showNumbersOnBoard: typeof patch.showNumbersOnBoard === "boolean" ? patch.showNumbersOnBoard : s.showNumbersOnBoard,
    showDetailsInPool: typeof patch.showDetailsInPool === "boolean" ? patch.showDetailsInPool : s.showDetailsInPool,
    showArbeitsartIndicator: typeof patch.showArbeitsartIndicator === "boolean" ? patch.showArbeitsartIndicator : s.showArbeitsartIndicator,
  };
  return next;
}
