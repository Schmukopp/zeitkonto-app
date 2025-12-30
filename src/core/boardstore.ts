// src/core/boardStore.ts
const LS_BOARD_KEY = "orgaboard.board.projectIds.v1";
const LS_NACHKALK_KEY = "orgaboard.nachkalk.projectIds.v1";

function loadIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {}
}

export function loadBoardIds(): string[] {
  return loadIds(LS_BOARD_KEY);
}

export function saveBoardIds(ids: string[]) {
  saveIds(LS_BOARD_KEY, ids);
}

export function loadNachkalkIds(): string[] {
  return loadIds(LS_NACHKALK_KEY);
}

export function saveNachkalkIds(ids: string[]) {
  saveIds(LS_NACHKALK_KEY, ids);
}

export function addProjectToBoard(projectId: string) {
  const ids = loadBoardIds();
  if (ids.includes(projectId)) return;
  ids.push(projectId);
  saveBoardIds(ids);
}

export function removeProjectFromBoard(projectId: string) {
  const ids = loadBoardIds().filter((x) => x !== projectId);
  saveBoardIds(ids);
}

export function removeProjectFromNachkalk(projectId: string) {
  const ids = loadNachkalkIds().filter((x) => x !== projectId);
  saveNachkalkIds(ids);
}

export function markProjectFinished(projectId: string) {
  // Fertig/Abgeholt: vom Board runter + in Nachkalk
  removeProjectFromBoard(projectId);
  const nk = loadNachkalkIds();
  if (!nk.includes(projectId)) nk.push(projectId);
  saveNachkalkIds(nk);
}
