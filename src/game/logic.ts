import {
  CALLERS,
  DECOYS,
  SCENARIOS,
  type Caller,
  type LevelId,
  type RankId,
  type Scenario,
  RANKS,
  cardById,
  decoysFor,
  stepsFor,
} from "@/game/content";

export type EndReason = "complete" | "strikes" | "patience";

export type FeedbackKind = "ok" | "bad" | "info";

export type Feedback = {
  n: number;
  kind: FeedbackKind;
  text: string;
};

export type HistoryEntry = {
  cardId: string;
  where: "slot" | "bin";
  slotIndex: number;
};

export type FxTarget = number | "bin" | null;

export type EndState = {
  reason: EndReason;
  score: number;
  patiencePoints: number;
  accuracyBonus: number;
  credited: number;
  total: number;
  rank: RankId;
  rankTitle: string;
  rankBlurb: string;
};

export type GameState = {
  phase: "menu" | "briefing" | "playing" | "ended";
  level: LevelId;
  caller: Caller;
  situation: string | null;
  required: string[];
  slots: (string | null)[];
  pool: string[];
  decoyIds: string[];
  bin: string[];
  history: HistoryEntry[];
  missed: string[];
  credited: string[];
  selectedId: string | null;
  strikes: number;
  patience: number;
  elapsed: number;
  drainBoostUntil: number;
  feedback: Feedback | null;
  end: EndState | null;
  fx: { slot: FxTarget; n: number };
  justPlacedId: string | null;
  feedbackN: number;
};

const DRAIN: Record<LevelId, number> = { 1: 1.25, 2: 100 / 120 };
const STRIKE_HIT = 14;
const BOOST_MULT = 1.75;
const BOOST_SECS = 3.2;
export const LOW_PATIENCE = 32;

export function initialState(): GameState {
  return {
    phase: "menu",
    level: 1,
    caller: CALLERS[0]!,
    situation: null,
    required: [],
    slots: [],
    pool: [],
    decoyIds: [],
    bin: [],
    history: [],
    missed: [],
    credited: [],
    selectedId: null,
    strikes: 0,
    patience: 100,
    elapsed: 0,
    drainBoostUntil: 0,
    feedback: null,
    end: null,
    fx: { slot: null, n: 0 },
    justPlacedId: null,
    feedbackN: 0,
  };
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = next[i]!;
    next[i] = next[j]!;
    next[j] = swap;
  }
  return next;
}

function say(state: GameState, kind: FeedbackKind, text: string): Feedback {
  return { n: state.feedbackN + 1, kind, text };
}

export function hotkeyFor(index: number): string | null {
  if (index >= 0 && index < 9) return String(index + 1);
  if (index === 9) return "0";
  return null;
}

export function indexForHotkey(key: string): number | null {
  if (key >= "1" && key <= "9") return Number(key) - 1;
  if (key === "0") return 9;
  return null;
}

export function isValidDrop(state: GameState, cardId: string, dropId: string): boolean {
  const card = cardById(cardId);
  if (!card || state.phase !== "playing") return false;
  if (!state.pool.includes(cardId)) return false;
  if (dropId === "bin") return card.kind === "decoy" && state.decoyIds.length > 0;
  if (!dropId.startsWith("slot:")) return false;
  const index = Number(dropId.slice(5));
  if (!Number.isInteger(index) || index < 0 || index >= state.slots.length) return false;
  if (state.slots[index]) return false;
  return card.kind === "step";
}

export function startLevel(level: LevelId): GameState {
  const scenario: Scenario | null =
    level === 2 ? (SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)] ?? SCENARIOS[0]!) : null;
  const steps = stepsFor(level, scenario ?? undefined);
  const decoys = decoysFor(level);
  const caller = CALLERS[Math.floor(Math.random() * CALLERS.length)] ?? CALLERS[0]!;
  return {
    ...initialState(),
    phase: "briefing",
    level,
    caller,
    situation: scenario?.situation ?? null,
    required: steps.map((card) => card.id),
    slots: steps.map(() => null),
    pool: shuffle([...steps, ...decoys].map((card) => card.id)),
    decoyIds: decoys.map((card) => card.id),
  };
}

export function beginCall(state: GameState): GameState {
  if (state.phase !== "briefing") return state;
  return {
    ...state,
    phase: "playing",
    elapsed: 0,
    patience: 100,
    feedback: say(state, "info", "Call connected. Build the script before their patience does."),
    feedbackN: state.feedbackN + 1,
  };
}

function creditFor(state: GameState, cardId: string): string[] {
  if (state.credited.includes(cardId) || state.missed.includes(cardId)) return state.credited;
  return [...state.credited, cardId];
}

function accuracyBonus(credited: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((credited / total) * 700);
}

export function projectedCloseValue(state: GameState): number {
  const total = state.required.length + state.decoyIds.length;
  return Math.round(state.patience * 10) + accuracyBonus(state.credited.length, total);
}

function finish(state: GameState, reason: EndReason): GameState {
  const total = state.required.length + state.decoyIds.length;
  const credited = state.credited.length;
  const bonus = accuracyBonus(credited, total);
  const patiencePoints = reason === "complete" ? Math.round(state.patience * 10) : 0;
  const score = patiencePoints + bonus;
  const rank = rankFor(score, reason);
  const meta = RANKS[rank];
  const text =
    reason === "complete"
      ? "Clean close. The caller is still on the line."
      : reason === "strikes"
        ? "Three strikes. Compliance ended the call."
        : "Patience hit zero. They hung up.";
  return {
    ...state,
    phase: "ended",
    patience: reason === "patience" ? 0 : state.patience,
    selectedId: null,
    end: {
      reason,
      score,
      patiencePoints,
      accuracyBonus: bonus,
      credited,
      total,
      rank,
      rankTitle: meta.title,
      rankBlurb: meta.blurb,
    },
    feedback: say(state, reason === "complete" ? "ok" : "bad", text),
    feedbackN: state.feedbackN + 1,
  };
}

function rankFor(score: number, reason: EndReason): RankId {
  if (reason !== "complete") {
    return score >= 520 ? "rookie" : "hostage";
  }
  if (score >= 1080) return "legend";
  if (score >= 760) return "samurai";
  if (score >= 420) return "rookie";
  return "hostage";
}

function strike(
  state: GameState,
  cardId: string,
  text: string,
  slot: FxTarget,
): GameState {
  const missed = state.missed.includes(cardId) ? state.missed : [...state.missed, cardId];
  const strikes = state.strikes + 1;
  const patience = Math.max(0, state.patience - STRIKE_HIT);
  const line = `${text} Strike ${strikes} of 3.`;
  const next: GameState = {
    ...state,
    strikes,
    patience,
    missed,
    drainBoostUntil: state.elapsed + BOOST_SECS,
    justPlacedId: null,
    fx: { slot, n: state.fx.n + 1 },
    feedback: { n: state.feedbackN + 1, kind: "bad", text: line },
    feedbackN: state.feedbackN + 1,
  };
  if (strikes >= 3) return finish(next, "strikes");
  if (patience <= 0) return finish(next, "patience");
  return next;
}

function afterSuccess(state: GameState): GameState {
  const full = state.slots.every((slot) => slot != null);
  if (full && state.pool.length === 0) return finish(state, "complete");
  return state;
}

export function placeOnSlot(state: GameState, cardId: string, slotIndex: number): GameState {
  if (state.phase !== "playing") return state;
  if (!state.pool.includes(cardId)) return state;
  const card = cardById(cardId);
  if (!card) return state;
  if (slotIndex < 0 || slotIndex >= state.slots.length) {
    return {
      ...state,
      feedback: say(state, "info", "That step isn't on this call."),
      feedbackN: state.feedbackN + 1,
    };
  }
  if (card.kind === "decoy") {
    return strike(
      state,
      cardId,
      "That line is a complaint waiting to happen.",
      slotIndex,
    );
  }
  if (state.slots[slotIndex]) {
    return {
      ...state,
      feedback: say(state, "info", `Step ${slotIndex + 1} is already filled.`),
      feedbackN: state.feedbackN + 1,
    };
  }
  if (state.required[slotIndex] !== cardId) {
    const expected = cardById(state.required[slotIndex] ?? "");
    const name = expected?.title ?? "something else";
    return strike(state, cardId, `Step ${slotIndex + 1} needs ${name}.`, slotIndex);
  }
  const slots = state.slots.slice();
  slots[slotIndex] = cardId;
  const next: GameState = {
    ...state,
    slots,
    pool: state.pool.filter((id) => id !== cardId),
    history: [...state.history, { cardId, where: "slot", slotIndex }],
    credited: creditFor(state, cardId),
    selectedId: state.selectedId === cardId ? null : state.selectedId,
    justPlacedId: cardId,
    feedback: say(state, "ok", `${card.title} locked into step ${slotIndex + 1}.`),
    feedbackN: state.feedbackN + 1,
  };
  return afterSuccess(next);
}

export function placeInBin(state: GameState, cardId: string): GameState {
  if (state.phase !== "playing") return state;
  if (!state.pool.includes(cardId)) return state;
  if (state.decoyIds.length === 0) {
    return {
      ...state,
      feedback: say(state, "info", "No discard bin on this shift."),
      feedbackN: state.feedbackN + 1,
    };
  }
  const card = cardById(cardId);
  if (!card) return state;
  if (card.kind !== "decoy") {
    return strike(state, cardId, "That belongs on the call, not in the bin.", "bin");
  }
  const next: GameState = {
    ...state,
    pool: state.pool.filter((id) => id !== cardId),
    bin: [...state.bin, cardId],
    history: [...state.history, { cardId, where: "bin", slotIndex: -1 }],
    credited: creditFor(state, cardId),
    selectedId: state.selectedId === cardId ? null : state.selectedId,
    justPlacedId: cardId,
    feedback: say(state, "ok", `Binned. Do not say “${card.title}.”`),
    feedbackN: state.feedbackN + 1,
  };
  return afterSuccess(next);
}

export function undoLast(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const last = state.history[state.history.length - 1];
  if (!last) {
    return {
      ...state,
      feedback: say(state, "info", "Nothing to undo."),
      feedbackN: state.feedbackN + 1,
    };
  }
  if (last.where === "slot") {
    if (state.slots[last.slotIndex] !== last.cardId) {
      return {
        ...state,
        history: state.history.slice(0, -1),
        feedback: say(state, "info", "That step is already empty."),
        feedbackN: state.feedbackN + 1,
      };
    }
    const slots = state.slots.slice();
    slots[last.slotIndex] = null;
    return {
      ...state,
      slots,
      pool: [last.cardId, ...state.pool.filter((id) => id !== last.cardId)],
      history: state.history.slice(0, -1),
      credited: state.credited.filter((id) => id !== last.cardId),
      selectedId: last.cardId,
      justPlacedId: null,
      feedback: say(state, "info", "Last placement popped back to the pile. The strike stays."),
      feedbackN: state.feedbackN + 1,
    };
  }
  if (!state.bin.includes(last.cardId)) {
    return {
      ...state,
      history: state.history.slice(0, -1),
      feedback: say(state, "info", "That card already left the bin."),
      feedbackN: state.feedbackN + 1,
    };
  }
  return {
    ...state,
    bin: state.bin.filter((id) => id !== last.cardId),
    pool: [last.cardId, ...state.pool.filter((id) => id !== last.cardId)],
    history: state.history.slice(0, -1),
    credited: state.credited.filter((id) => id !== last.cardId),
    selectedId: last.cardId,
    justPlacedId: null,
    feedback: say(state, "info", "Pulled back out of Do Not Say."),
    feedbackN: state.feedbackN + 1,
  };
}

export function tick(state: GameState, dt: number): GameState {
  if (state.phase !== "playing") return state;
  const step = Math.min(0.1, Math.max(0, dt));
  if (step === 0) return state;
  const boosted = state.elapsed < state.drainBoostUntil;
  const rate = DRAIN[state.level] * (boosted ? BOOST_MULT : 1);
  const elapsed = state.elapsed + step;
  const patience = state.patience - rate * step;
  const base: GameState = { ...state, elapsed, patience: Math.max(0, patience) };
  if (patience <= 0) return finish(base, "patience");
  return base;
}

export function selectCard(state: GameState, cardId: string | null): GameState {
  if (state.phase !== "playing") return state;
  if (cardId && !state.pool.includes(cardId)) return state;
  return { ...state, selectedId: cardId };
}

export function decoyTitle(id: string): string {
  return cardById(id)?.title ?? DECOYS.find((card) => card.id === id)?.title ?? id;
}
