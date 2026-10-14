import type { LevelId } from "@/game/content";

export const SAVE_VERSION = 2;
const SAVE_KEY = "call-flow-speedrun-v2";

export type ScoreEntry = {
  initials: string;
  score: number;
  rank: string;
  at: string;
};

export type SaveData = {
  version: number;
  boards: Record<"1" | "2", ScoreEntry[]>;
};

const LEVEL_KEYS = ["1", "2"] as const;

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, boards: { "1": [], "2": [] } };
}

function isEntry(value: unknown): value is ScoreEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as ScoreEntry;
  return (
    typeof entry.initials === "string" &&
    /^[A-Z]{1,3}$/.test(entry.initials) &&
    typeof entry.score === "number" &&
    Number.isFinite(entry.score) &&
    typeof entry.rank === "string" &&
    typeof entry.at === "string"
  );
}

export function loadSave(): SaveData {
  try {
    if (typeof localStorage === "undefined") return emptySave();
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<SaveData> | null;
    const next = emptySave();
    const boards = parsed?.boards;
    if (!boards || typeof boards !== "object") return next;
    for (const key of LEVEL_KEYS) {
      const list = boards[key];
      if (!Array.isArray(list)) continue;
      next.boards[key] = list.filter(isEntry).slice(0, 5);
    }
    return next;
  } catch {
    return emptySave();
  }
}

export function clearScores(): SaveData {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY);
  } catch {
    /* private mode — the boards still reset in memory */
  }
  return emptySave();
}

export function qualifies(board: ScoreEntry[], score: number): boolean {
  if (board.length < 5) return true;
  return score >= board[board.length - 1]!.score;
}

export function submitScore(level: LevelId, entry: ScoreEntry): SaveData {
  const save = loadSave();
  const key = String(level) as "1" | "2";
  const ranked = [...save.boards[key], entry]
    .sort((a, b) => b.score - a.score || (a.at < b.at ? 1 : -1))
    .slice(0, 5);
  save.boards[key] = ranked;
  save.version = SAVE_VERSION;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota — the round still finished */
  }
  return save;
}
