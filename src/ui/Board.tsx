export function createProject(s: State, name = "Neues Projekt"): State {
  const p: any = {
    id: uid(),
    name: str(name, "Neues Projekt"),
    active: true,

    // Fallback (falls jemand keine Arbeitsarten pflegt)
    kalkStunden: 0,

    // ✅ Standard-SOLL-Splitting (Maschine/Bank/Lack/Montage)
    arbeitsarten: {
      maschine: { kalkMinuten: 0 },
      bank: { kalkMinuten: 0 },
      lack: { kalkMinuten: 0 },
      montage: { kalkMinuten: 0 },
    },

    planNettoVkEur: 0,
    planMaterialEur: 0,
    istNettoVkEur: 0,
    istMaterialEur: 0,
  };

  // ✅ Neueste Projekte oben anzeigen
  s.projects = [p, ...(s.projects ?? [])];

  saveState(s);
  return s;
}
