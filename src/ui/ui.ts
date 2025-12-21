// src/ui/ui.ts
export const ui = {
  // ===== App Shell =====
  page: "min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6",
  headerRow: "flex flex-wrap items-center justify-between gap-3",
  section: "space-y-2",

  // ===== Text =====
  title: "text-2xl font-bold tracking-tight",
  subtitle: "text-sm text-zinc-400",
  label: "text-sm text-zinc-300",
  hint: "text-xs text-zinc-500",
  mono: "font-mono",

  // ===== Cards / Containers =====
  card:
    "rounded-2xl border border-zinc-800/80 bg-zinc-900/50 shadow-sm " +
    "backdrop-blur supports-[backdrop-filter]:bg-zinc-900/40",
  cardBody: "p-4 space-y-3",
  divider: "border-t border-zinc-800/80",

  // ===== Alerts =====
  alertError:
    "rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-100",
  alertInfo:
    "rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-200",

  // ===== Controls =====
  controlRow: "flex flex-wrap items-end gap-3",
  field: "flex flex-col gap-1",
  input:
    "border border-zinc-700 bg-zinc-950/40 rounded-lg p-2 text-zinc-100 placeholder:text-zinc-500 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500/80 focus:border-orange-500/60",
  select:
    "border border-zinc-700 bg-zinc-950/40 rounded-lg p-2 text-zinc-100 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500/80 focus:border-orange-500/60",
  numberInput:
    "border border-zinc-700 bg-zinc-950/40 rounded-lg p-2 text-zinc-100 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500/80 focus:border-orange-500/60",

  // Width helpers (optional)
  w28: "w-28",
  w32: "w-32",
  w36: "w-36",
  w40: "w-40",
  w48: "w-48",

  // ===== Buttons =====
  btnPrimary:
    "rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 " +
    "hover:bg-orange-400 active:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
  btnSecondary:
    "rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-100 " +
    "hover:bg-zinc-800/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50",
  btnGhost:
    "rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800/50 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500/40",
  btnDanger:
    "rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-2 text-sm text-red-100 " +
    "hover:bg-red-950/45 focus:outline-none focus:ring-2 focus:ring-red-500/40",

  // ===== Table =====
  tableWrap:
    "overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm",
  table: "min-w-full text-sm",
  thead: "bg-zinc-900/70",
  th: "p-3 text-left text-zinc-300 font-semibold",
  tr: "border-t border-zinc-800/80 hover:bg-zinc-800/30",
  td: "p-3 text-zinc-100",
  tdStrong: "p-3 font-medium text-zinc-100",
};
