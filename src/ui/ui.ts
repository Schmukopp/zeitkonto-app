export const ui = {
  // Page
  page: "min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6",
  headerRow: "flex items-center justify-between gap-4",
  title: "text-2xl font-bold tracking-tight",
  subtitle: "text-sm text-zinc-400",

  // Cards
  card: "rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-sm",
  cardBody: "p-4 space-y-3",

  // Text
  label: "text-sm text-zinc-300",
  hint: "text-xs text-zinc-500",

  // Inputs
  input:
    "w-full border border-zinc-700 bg-zinc-950/40 rounded-lg p-2 text-zinc-100 placeholder:text-zinc-500 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500",
  select:
    "w-full border border-zinc-700 bg-zinc-950/40 rounded-lg p-2 text-zinc-100 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500",
  numberInput:
    "w-full border border-zinc-700 bg-zinc-950/40 rounded-lg p-2 text-zinc-100 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-500",

  // Buttons
  btnPrimary:
    "rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 " +
    "hover:bg-orange-400 active:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed",
  btnSecondary:
    "rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-sm " +
    "hover:bg-zinc-800/50",
  btnDanger:
    "rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-2 text-sm text-red-200 " +
    "hover:bg-red-950/45",

  // Table
  tableWrap: "overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40 shadow-sm",
  table: "min-w-full text-sm",
  thead: "bg-zinc-900/70",
  th: "p-3 text-left text-zinc-300 font-semibold",
  tr: "border-t border-zinc-800",
  td: "p-3",
  tdStrong: "p-3 font-medium",

  // Alerts
  alertError: "rounded-xl border border-red-700/60 bg-red-950/30 p-3 text-sm text-red-200",
  alertInfo: "rounded-xl border border-zinc-700 bg-zinc-950/30 p-3 text-sm text-zinc-200",
};
