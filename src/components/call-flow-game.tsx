import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Ban,
  Check,
  Headset,
  Keyboard,
  MousePointer2,
  PhoneOff,
  ShieldAlert,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  LogOut,
} from "lucide-react";
import {
  LEVELS,
  type LevelId,
  cardById,
} from "@/game/content";
import {
  LOW_PATIENCE,
  beginCall,
  hotkeyFor,
  indexForHotkey,
  initialState,
  isValidDrop,
  placeInBin,
  placeOnSlot,
  projectedCloseValue,
  selectCard,
  startLevel,
  tick,
  undoLast,
  type GameState,
} from "@/game/logic";
import { playChing, playDial, resumeAudio, setHold, setMuted, unlockAudio } from "@/game/audio";
import { clearScores, loadSave, qualifies, submitScore, type SaveData } from "@/game/storage";

type Action =
  | { type: "start"; level: LevelId }
  | { type: "begin" }
  | { type: "menu" }
  | { type: "tick"; dt: number }
  | { type: "select"; cardId: string | null }
  | { type: "slot"; index: number; cardId: string }
  | { type: "bin"; cardId: string }
  | { type: "undo" };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "start":
      return startLevel(action.level);
    case "begin":
      return beginCall(state);
    case "menu":
      return initialState();
    case "tick":
      return tick(state, action.dt);
    case "select":
      return selectCard(state, action.cardId);
    case "slot":
      return placeOnSlot(state, action.cardId, action.index);
    case "bin":
      return placeInBin(state, action.cardId);
    case "undo":
      return undoLast(state);
    default:
      return state;
  }
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function patienceMood(patience: number): "calm" | "waiting" | "impatient" | "done" {
  if (patience > 72) return "calm";
  if (patience > 48) return "waiting";
  if (patience > 24) return "impatient";
  return "done";
}

function CallerMood({ patience }: { patience: number }) {
  const mood = patienceMood(patience);
  return (
    <svg
      className="caller-fig shrink-0"
      data-mood={mood}
      viewBox="0 0 72 84"
      width="58"
      height="68"
      aria-hidden
    >
      <g className="caller-bob">
        <ellipse className="steam steam-a" cx="66" cy="14" rx="4.2" ry="3" />
        <ellipse className="steam steam-b" cx="73" cy="8" rx="3" ry="2.2" />
        <path className="caller-cardigan" d="M16 88V58c0-8 8-14 22-14s22 6 22 14v30H16z" />
        <circle className="caller-hair" cx="38" cy="30" r="18" />
        <circle className="caller-skin" cx="38" cy="34" r="14.5" />
        <ellipse className="caller-skin" cx="22.5" cy="36" rx="3.2" ry="4" />
        <ellipse className="caller-skin" cx="53.5" cy="36" rx="3.2" ry="4" />
        <g className="brows">
          <path className="caller-ink" d="M28 27.5h8" />
          <path className="caller-ink" d="M42 27.5h8" />
        </g>
        <g className="glasses">
          <circle cx="33" cy="34" r="5" />
          <circle cx="45" cy="34" r="5" />
          <path d="M38 34h2" />
        </g>
        <circle className="eye" cx="33" cy="34.4" r="1.45" />
        <circle className="eye" cx="45" cy="34.4" r="1.45" />
        <path className="caller-ink mouth mouth-calm" d="M31 42c2.4 2.6 10.6 2.6 13 0" />
        <path className="caller-ink mouth mouth-flat" d="M31 42.6h13" />
        <path className="caller-ink mouth mouth-mad" d="M31 44.2c2.4-2.6 10.6-2.6 13 0" />
        <path className="caller-shirt" d="M33.5 49h9l-1.6 12h-5.8z" />
        <g className="caller-phone">
          <rect x="58" y="56" width="13" height="22" rx="3" />
          <path d="M61 61h7" />
        </g>
      </g>
    </svg>
  );
}

function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? words[words.length - 1]![0] : "";
  return (first + last).toUpperCase();
}

function highlightFor(state: GameState, draggingId: string | null, hoverDrop: string | null, dropId: string) {
  if (!draggingId || !isValidDrop(state, draggingId, dropId)) return null;
  return hoverDrop === dropId ? "hot" : "open";
}

export function CallFlowGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [muted, setMutedOn] = useState(true);
  const [board, setBoard] = useState<SaveData | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverDrop, setHoverDrop] = useState<string | null>(null);
  const stateRef = useRef(state);
  const selectedRef = useRef<string | null>(state.selectedId);
  stateRef.current = state;
  selectedRef.current = state.selectedId;
  const ghostRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const playedFeedback = useRef(0);

  useEffect(() => {
    setBoard(loadSave());
  }, []);

  useEffect(() => {
    const probe = window as unknown as { __cf?: unknown };
    probe.__cf = {
      phase: state.phase,
      level: state.level,
      required: state.required,
      slots: state.slots,
      pool: state.pool,
      bin: state.bin,
      strikes: state.strikes,
      patience: Math.round(state.patience),
      score: state.end?.score ?? null,
      rank: state.end?.rankTitle ?? null,
      situation: state.situation,
      selectedId: state.selectedId,
    };
  }, [state]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const feedback = state.feedback;
    if (!feedback || playedFeedback.current === feedback.n) return;
    playedFeedback.current = feedback.n;
    if (feedback.kind === "ok") playChing();
    else if (feedback.kind === "bad") playDial();
  }, [state.feedback]);

  const patienceLow = state.phase === "playing" && state.patience <= LOW_PATIENCE;
  useEffect(() => {
    if (state.phase !== "playing") return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [state.phase]);
  useEffect(() => {
    setHold(patienceLow && !muted);
    return () => setHold(false);
  }, [patienceLow, muted]);

  useEffect(() => {
    if (state.phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let dead = false;
    const loop = (now: number) => {
      if (dead) return;
      const frame = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      acc += frame;
      if (acc >= 0.1) {
        const step = acc;
        acc = 0;
        dispatch({ type: "tick", dt: step });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "playing") return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      const current = stateRef.current;
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        const dir = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
        const ids = current.pool;
        if (ids.length === 0) return;
        const index = selectedRef.current ? ids.indexOf(selectedRef.current) : -1;
        const next = ids[(index + dir + ids.length) % ids.length]!;
        selectedRef.current = next;
        dispatch({ type: "select", cardId: next });
        document.querySelector<HTMLElement>(`[data-card-id="${next}"]`)?.focus();
        return;
      }
      const selectedId = selectedRef.current;
      if (!selectedId) return;
      if (event.key === "d" || event.key === "D") {
        event.preventDefault();
        dispatch({ type: "bin", cardId: selectedId });
        return;
      }
      const slot = indexForHotkey(event.key);
      if (slot == null) return;
      event.preventDefault();
      dispatch({ type: "slot", index: slot, cardId: selectedId });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase]);

  function toggleMute() {
    unlockAudio();
    const next = !muted;
    setMuted(next);
    setMutedOn(next);
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLButtonElement>, cardId: string) {
    if (event.button !== 0) return;
    const pointerId = event.pointerId;
    const originX = event.clientX;
    const originY = event.clientY;
    let moved = false;
    const clear = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!moved && dx * dx + dy * dy < 64) return;
      if (!moved) {
        moved = true;
        setDraggingId(cardId);
      }
      const ghost = ghostRef.current;
      if (ghost) {
        const x = Math.min(window.innerWidth - 240, Math.max(8, ev.clientX + 16));
        const y = Math.min(window.innerHeight - 88, Math.max(8, ev.clientY + 16));
        ghost.style.transform = `translate(${x}px, ${y}px)`;
      }
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const zone = hit?.closest("[data-drop]")?.getAttribute("data-drop") ?? null;
      setHoverDrop((prev) => (prev === zone ? prev : zone));
    };
    const up = (ev: PointerEvent) => {
      clear();
      if (!moved) return;
      suppressClick.current = true;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const zone = hit?.closest("[data-drop]")?.getAttribute("data-drop") ?? null;
      setDraggingId(null);
      setHoverDrop(null);
      if (zone?.startsWith("slot:")) {
        dispatch({ type: "slot", index: Number(zone.slice(5)), cardId });
      } else if (zone === "bin") {
        dispatch({ type: "bin", cardId });
      }
    };
    const cancel = () => {
      clear();
      if (moved) suppressClick.current = true;
      setDraggingId(null);
      setHoverDrop(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  const levelMeta = LEVELS[state.level];
  const closeValue = projectedCloseValue(state);
  const draggingCard = draggingId ? cardById(draggingId) : undefined;

  return (
    <main
      data-phase={state.phase}
      className={cx(
        "mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6",
        state.phase === "playing"
          ? "h-dvh max-h-dvh overflow-hidden overscroll-none"
          : "pb-12",
      )}
    >
      <header className="flex flex-wrap items-center gap-3 rounded-3xl bg-teal-deep px-4 py-3 text-paper">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-paper text-teal-deep">
          <Headset className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-paper/70 uppercase">Medicare desk drill</p>
          <h1 className="font-display text-2xl leading-none sm:text-3xl">Call Flow Speedrun</h1>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            aria-pressed={!muted}
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            onClick={toggleMute}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-sm font-semibold text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <span className="relative size-5" aria-hidden>
              <VolumeX
                className={cx(
                  "absolute inset-0 size-5 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  muted ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]",
                )}
              />
              <Volume2
                className={cx(
                  "absolute inset-0 size-5 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  muted ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none",
                )}
              />
            </span>
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      </header>

      {state.phase === "menu" ? (
        <Menu
          board={board}
          onStart={(level) => {
            unlockAudio();
            dispatch({ type: "start", level });
          }}
          onClear={() => setBoard(clearScores())}
        />
      ) : null}

      {state.phase === "briefing" ? (
        <Briefing
          state={state}
          onAnswer={() => {
            unlockAudio();
            dispatch({ type: "begin" });
          }}
          onBack={() => dispatch({ type: "menu" })}
        />
      ) : null}

      {state.phase === "playing" ? (
        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper px-3 py-2">
            <div className="flex min-w-48 flex-1 items-center gap-2">
              <CallerMood patience={state.patience} />
              <div className="min-w-36 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">Caller patience</p>
                <p className="text-sm font-semibold tabular-nums">
                  {Math.round(state.patience)}
                  <span className="font-normal text-ink/50"> · close {closeValue}</span>
                </p>
              </div>
              <div
                role="meter"
                aria-label="Caller patience"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(state.patience)}
                className="h-3 overflow-hidden rounded-full bg-ink/10"
              >
                <div
                  className={cx(
                    "h-full rounded-full transition-[width] duration-150 ease-out",
                    state.patience > 55 ? "bg-teal" : "bg-coral",
                    patienceLow && "patience-low",
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, state.patience))}%` }}
                />
              </div>
              </div>
            </div>
            <span className="rounded-full bg-teal/10 px-3 py-2 text-sm font-semibold text-teal-deep">
              {levelMeta.name}
            </span>
            <span
              className="inline-flex h-11 items-center gap-2 rounded-full bg-cream px-3 text-sm font-semibold"
              aria-label={`${state.strikes} of 3 compliance strikes`}
            >
              <ShieldAlert className="size-4 text-coral" aria-hidden />
              {state.strikes}/3
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: "undo" })}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.96]"
            >
              <Undo2 className="size-4" aria-hidden />
              Undo
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "menu" })}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.96]"
            >
              <LogOut className="size-4" aria-hidden />
              Exit
            </button>
          </div>

          <CallerBubble
            name={state.caller.name}
            line={state.caller.line}
            plan={state.caller.plan}
            situation={state.situation}
            compact
          />

          <p
            aria-live="polite"
            className={cx(
              "rounded-2xl px-4 py-2 text-sm font-medium",
              state.feedback?.kind === "bad" && "bg-coral/15 text-coral-deep",
              state.feedback?.kind === "ok" && "bg-teal/10 text-teal-deep",
              (!state.feedback || state.feedback.kind === "info") && "bg-paper text-ink/80",
            )}
          >
            {state.feedback?.text ?? "Drag a card onto a numbered step, or select one and press its number."}
          </p>

          <div
            className={cx(
              "grid min-h-0 flex-1 gap-3",
              state.level === 2
                ? "grid-cols-1 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] md:grid-cols-2 md:grid-rows-1"
                : "grid-cols-1 grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-cols-5 md:grid-rows-1 md:gap-4",
            )}
          >
            <div className={cx("flex min-h-0 flex-col gap-2 overflow-hidden", state.level !== 2 && "md:col-span-2")}>
              <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-line bg-paper/80 p-3">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="font-display text-xl leading-none">Card pool</h2>
                  <p className="text-xs font-semibold text-ink/60">{state.pool.length} left</p>
                </div>
                {state.level === 2 ? (
                  <EnrollmentPool
                    state={state}
                    draggingId={draggingId}
                    onCardPointerDown={onCardPointerDown}
                    onSelect={(id) => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      const next = state.selectedId === id ? null : id;
                      selectedRef.current = next;
                      dispatch({ type: "select", cardId: next });
                    }}
                  />
                ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
                  {state.pool.length === 0 ? (
                    <p className="px-2 py-6 text-sm text-ink/60">The pile is clear. Close the last open step.</p>
                  ) : (
                    state.pool.map((id) => {
                      const card = cardById(id);
                      if (!card) return null;
                      const selected = state.selectedId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          data-card-id={id}
                          aria-pressed={selected}
                          onPointerDown={(event) => onCardPointerDown(event, id)}
                          onClick={() => {
                            if (suppressClick.current) {
                              suppressClick.current = false;
                              return;
                            }
                            const next = state.selectedId === id ? null : id;
                            selectedRef.current = next;
                            dispatch({ type: "select", cardId: next });
                          }}
                          className={cx(
                            "touch-pan-y rounded-2xl border bg-paper px-3 py-3 text-left transition-[opacity,box-shadow,border-color] duration-150",
                            selected
                              ? "border-teal ring-2 ring-inset ring-teal"
                              : "border-line",
                            draggingId === id && "opacity-40",
                            state.justPlacedId === id && "fx-pop",
                          )}
                        >
                          <span className="font-semibold leading-tight">{card.title}</span>
                          <span className="mt-1 block text-sm text-ink/70">{card.detail}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                )}
              </section>
              {state.decoyIds.length > 0 ? (
                <Bin
                  state={state}
                  draggingId={draggingId}
                  hoverDrop={hoverDrop}
                  onClick={() => {
                    if (!state.selectedId) return;
                    dispatch({ type: "bin", cardId: state.selectedId });
                  }}
                />
              ) : null}
            </div>

            <section className={cx("flex min-h-0 flex-col overflow-hidden rounded-3xl border border-line bg-paper/80 p-3", state.level !== 2 && "md:col-span-3")}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-display text-xl leading-none">Call timeline</h2>
                <p className="text-xs text-ink/60">Empty steps glow while a real line is dragged</p>
              </div>
              <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
                {state.slots.map((cardId, index) => {
                  const dropId = `slot:${index}`;
                  const glow = highlightFor(state, draggingId, hoverDrop, dropId);
                  const card = cardId ? cardById(cardId) : undefined;
                  const hotkey = hotkeyFor(index);
                  const shake = state.fx.slot === index;
                  return (
                    <li key={`${index}-${shake ? state.fx.n : 0}`}>
                      <button
                        type="button"
                        data-drop={dropId}
                        onClick={() => {
                          if (!state.selectedId || cardId) return;
                          dispatch({ type: "slot", index, cardId: state.selectedId });
                        }}
                        className={cx(
                          "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-1.5 text-left transition-colors duration-150",
                          card ? "border-teal/30 bg-paper" : "border-dashed border-ink/20 bg-cream/70",
                          glow === "open" && "border-teal bg-teal/10",
                          glow === "hot" && "border-teal bg-teal/20 ring-2 ring-teal",
                          shake && "fx-shake",
                          card && state.justPlacedId === cardId && "fx-pop",
                        )}
                      >
                        <span className="flex w-12 shrink-0 flex-col items-center">
                          <span className="font-display text-2xl leading-none text-teal-deep">{index + 1}</span>
                          {hotkey ? (
                            <kbd className="mt-1 rounded-md border border-line bg-paper px-1.5 text-xs font-semibold text-ink/70">
                              {hotkey}
                            </kbd>
                          ) : (
                            <span className="mt-1 text-xs text-ink/50">tap</span>
                          )}
                        </span>
                        {card ? (
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-semibold">
                              <Check className="size-4 shrink-0 text-teal" aria-hidden />
                              {card.title}
                            </span>
                            <span className="block text-sm text-ink/65">{card.detail}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-ink/55">Drop the matching line</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </section>
      ) : null}

      {state.phase === "ended" && state.end ? (
        <EndPanel
          state={state}
          board={board}
          onSave={(next) => setBoard(next)}
          onReplay={() => {
            unlockAudio();
            dispatch({ type: "start", level: state.level });
          }}
          onMenu={() => dispatch({ type: "menu" })}
        />
      ) : null}

      {state.phase !== "playing" ? (
        <p className="text-center text-xs text-ink/50">
          Built by Alonzo Goffe · Fictional callers and fictional plans. A practice drill — not legal advice and not a carrier script.
        </p>
      ) : null}

      <div
        ref={ghostRef}
        className={cx(
          "pointer-events-none fixed top-0 left-0 z-50 w-60 rounded-2xl border border-teal bg-paper px-3 py-3 shadow-lg",
          draggingCard ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      >
        <p className="font-semibold">{draggingCard?.title}</p>
        <p className="text-sm text-ink/70">{draggingCard?.detail}</p>
      </div>
    </main>
  );
}

function CallerBubble({
  name,
  line,
  plan,
  situation = null,
  compact = false,
}: {
  name: string;
  line: string;
  plan: string;
  situation?: string | null;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-teal-deep font-display text-lg text-paper"
        aria-hidden
      >
        {initials(name)}
      </div>
      <div className="relative min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 py-2">
        <span className="absolute top-4 -left-1.5 size-3 rotate-45 border-b border-l border-line bg-paper" aria-hidden />
        <p className="font-display text-lg leading-tight">
          {name}
          <span className="ml-2 font-sans text-xs font-semibold tracking-wide text-teal-deep uppercase">
            {plan}
          </span>
        </p>
        <p className={cx("text-sm text-ink/80", compact && "truncate")}>{line}</p>
        {situation ? <p className="mt-1 text-sm font-semibold text-coral-deep">{situation}</p> : null}
      </div>
    </div>
  );
}

function Menu({
  board,
  onStart,
  onClear,
}: {
  board: SaveData | null;
  onStart: (level: LevelId) => void;
  onClear: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-3xl">
        <p className="font-display text-3xl leading-tight sm:text-4xl">
          Rebuild the call before their patience runs out.
        </p>
        <p className="mt-1 max-w-2xl text-sm text-ink/75 sm:text-base">
          Drag the script into order, or select a card and press its number. Bad lines go in Do Not Say.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([1, 2] as const).map((level) => {
          const meta = LEVELS[level];
          return (
            <button
              key={level}
              type="button"
              onClick={() => onStart(level)}
              className={cx(
                "flex flex-col items-start gap-2 rounded-3xl border bg-paper p-4 text-left transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.96] sm:p-5",
                level === 2 ? "border-coral" : "border-line",
              )}
            >
              <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal-deep">
                {meta.eyebrow}
              </span>
              <span className="font-display text-2xl leading-none sm:text-3xl">{meta.name}</span>
              <span className="text-sm text-ink/75">{meta.summary}</span>
            </button>
          );
        })}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: MousePointer2, title: "Drag", body: "Legal slots light up under the card." },
          { icon: Keyboard, title: "Number keys", body: "Select a card, then press 1–9 or 0." },
          { icon: Undo2, title: "Backspace", body: "Undoes the last lock. Strikes stay." },
          { icon: PhoneOff, title: "Three strikes", body: "Or an empty patience bar. Call over." },
        ].map((item) => (
          <li key={item.title} className="flex gap-3 rounded-2xl border border-line bg-paper px-3 py-2">
            <item.icon className="mt-0.5 size-5 shrink-0 text-teal-deep" aria-hidden />
            <span>
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="block text-sm text-ink/70">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
      <section className="rounded-3xl border border-line bg-paper p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Trophy className="size-5 text-teal-deep" aria-hidden />
          <h2 className="font-display text-2xl leading-none">High scores</h2>
          {confirmClear ? (
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-ink/75">
                Clear all high scores on this browser? This can’t be undone.
              </p>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-sm font-semibold text-ink/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
                className="text-sm font-semibold text-coral-deep"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="ml-auto text-sm font-semibold text-ink/60 underline-offset-2 hover:underline"
            >
              Clear scores
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {([1, 2] as const).map((level) => {
            const rows = board?.boards[String(level) as "1" | "2"] ?? [];
            return (
              <div key={level}>
                <h3 className="text-sm font-semibold text-teal-deep">{LEVELS[level].name}</h3>
                {board == null ? (
                  <p className="mt-2 text-sm text-ink/50">Checking this browser…</p>
                ) : rows.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/60">No closes saved yet.</p>
                ) : (
                  <ol className="mt-2 space-y-1">
                    {rows.map((row) => (
                      <li key={`${row.at}-${row.initials}`} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold tracking-widest">{row.initials}</span>
                        <span className="truncate text-ink/60">{row.rank}</span>
                        <span className="font-semibold tabular-nums">{row.score}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Briefing({
  state,
  onAnswer,
  onBack,
}: {
  state: GameState;
  onAnswer: () => void;
  onBack: () => void;
}) {
  const meta = LEVELS[state.level];
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <p className="text-sm font-semibold tracking-widest text-teal-deep uppercase">{meta.name}</p>
      <h2 className="font-display text-4xl leading-tight">Incoming call</h2>
      <CallerBubble
        name={state.caller.name}
        line={state.caller.line}
        plan={state.caller.plan}
        situation={state.situation}
      />
      <p className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm text-ink/80">{meta.detail}</p>
      <p className="text-sm text-ink/70">
        Patience starts when you pick up. Sound stays off until you unmute — dial tone on a strike, a cha-ching
        on a clean lock, hold music when they’re losing it.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAnswer}
          className="inline-flex h-12 items-center rounded-full bg-teal-deep px-6 font-semibold text-paper transition-transform duration-150 active:scale-[0.96]"
        >
          Answer the call
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-12 items-center rounded-full border border-line bg-paper px-6 font-semibold transition-transform duration-150 active:scale-[0.96]"
        >
          Back
        </button>
      </div>
    </section>
  );
}

function EnrollmentPool({
  state,
  draggingId,
  onCardPointerDown,
  onSelect,
}: {
  state: GameState;
  draggingId: string | null;
  onCardPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
  onSelect: (id: string) => void;
}) {
  const selected = state.selectedId ? cardById(state.selectedId) : undefined;
  const cardButton = (id: string) => {
    const card = cardById(id);
    if (!card) return null;
    const isSelected = state.selectedId === id;
    return (
      <button
        key={id}
        type="button"
        data-card-id={id}
        aria-pressed={isSelected}
        onPointerDown={(event) => onCardPointerDown(event, id)}
        onClick={() => onSelect(id)}
        className={cx(
          "touch-pan-y rounded-xl border border-line bg-paper px-2 py-1.5 text-left text-xs font-semibold leading-snug transition-[opacity,box-shadow,border-color] duration-150",
          isSelected && "border-teal ring-2 ring-inset ring-teal",
          draggingId === id && "opacity-40",
          state.justPlacedId === id && "fx-pop",
        )}
      >
        {card.title}
      </button>
    );
  };
  if (state.pool.length === 0) {
    return <p className="px-2 py-6 text-sm text-ink/60">The pile is clear. Close the last open step.</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
      <p className="rounded-xl bg-cream px-2.5 py-1 text-xs leading-snug text-ink/75">
        {selected ? selected.detail : "Select a card to read the line."}
      </p>
      <div className="grid grid-cols-2 gap-1">{state.pool.map(cardButton)}</div>
    </div>
  );
}

function Bin({
  state,
  draggingId,
  hoverDrop,
  onClick,
}: {
  state: GameState;
  draggingId: string | null;
  hoverDrop: string | null;
  onClick: () => void;
}) {
  const glow = highlightFor(state, draggingId, hoverDrop, "bin");
  const shake = state.fx.slot === "bin";
  return (
    <button
      type="button"
      data-drop="bin"
      onClick={onClick}
      className={cx(
        "rounded-3xl border-2 border-dashed px-3 py-2 text-left",
        glow === "hot" && "border-coral bg-coral/15 ring-2 ring-coral",
        glow === "open" && "border-coral bg-coral/10",
        !glow && "border-coral/50 bg-paper",
        shake && "fx-shake",
      )}
    >
      <span className="flex items-center gap-2 font-display text-xl leading-none text-coral-deep">
        <Ban className="size-5" aria-hidden />
        Do Not Say
      </span>
      <span className="mt-0.5 block text-xs text-ink/70">Drop traps here, or press D.</span>
      {state.bin.length > 0 ? (
        <span className="mt-2 flex flex-wrap gap-2">
          {state.bin.map((id) => (
            <span key={id} className="rounded-full bg-coral/10 px-2 py-1 text-xs font-semibold text-coral-deep line-through">
              {cardById(id)?.title}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function EndPanel({
  state,
  board,
  onSave,
  onReplay,
  onMenu,
}: {
  state: GameState;
  board: SaveData | null;
  onSave: (next: SaveData) => void;
  onReplay: () => void;
  onMenu: () => void;
}) {
  const end = state.end!;
  const key = String(state.level) as "1" | "2";
  const rows = board?.boards[key] ?? [];
  const canSave = board != null && qualifies(rows, end.score);
  const [initials, setInitials] = useState("");
  const [saved, setSaved] = useState(false);
  const reason =
    end.reason === "complete"
      ? "You closed the call."
      : end.reason === "strikes"
        ? "Compliance cut the cord."
        : "They hung up.";

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="rounded-3xl border border-line bg-paper p-6">
        <p className="text-sm font-semibold tracking-widest text-teal-deep uppercase">{LEVELS[state.level].name}</p>
        <p className="mt-2 text-sm text-ink/70">{reason}</p>
        <h2 className="mt-2 font-display text-5xl leading-none">{end.rankTitle}</h2>
        <p className="mt-3 text-ink/80">{end.rankBlurb}</p>
        <p className="mt-6 font-display text-6xl leading-none tabular-nums">{end.score}</p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Patience points {end.reason === "complete" ? "" : "(only if you close)"}</dt>
            <dd className="font-semibold tabular-nums">{end.patiencePoints}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>
              Accuracy bonus ({end.credited}/{end.total} first-try)
            </dt>
            <dd className="font-semibold tabular-nums">{end.accuracyBonus}</dd>
          </div>
        </dl>
        {canSave && !saved ? (
          <form
            className="mt-5 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^[A-Z]{3}$/.test(initials)) return;
              const next = submitScore(state.level, {
                initials,
                score: end.score,
                rank: end.rankTitle,
                at: new Date().toISOString(),
              });
              setSaved(true);
              onSave(next);
            }}
          >
            <label className="text-sm font-semibold">
              Initials
              <input
                value={initials}
                maxLength={3}
                autoComplete="off"
                spellCheck={false}
                aria-label="Initials"
                onChange={(event) =>
                  setInitials(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, "")
                      .slice(0, 3),
                  )
                }
                className="mt-1 block h-12 w-28 rounded-xl border border-line bg-cream text-center font-display text-2xl tracking-widest uppercase"
              />
            </label>
            <button
              type="submit"
              disabled={initials.length < 3}
              className="inline-flex h-12 items-center rounded-full bg-teal-deep px-5 font-semibold text-paper disabled:opacity-40"
            >
              Save score
            </button>
          </form>
        ) : null}
        {saved ? <p className="mt-4 text-sm font-semibold text-teal-deep">Saved on this browser.</p> : null}
        {!canSave && board ? <p className="mt-4 text-sm text-ink/60">Not a top-five close for this shift.</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex h-12 items-center rounded-full bg-teal-deep px-5 font-semibold text-paper transition-transform duration-150 active:scale-[0.96]"
          >
            Run it back
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="inline-flex h-12 items-center rounded-full border border-line px-5 font-semibold transition-transform duration-150 active:scale-[0.96]"
          >
            Call type menu
          </button>
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-paper p-6">
        <h3 className="font-display text-2xl leading-none">Order that closes the call</h3>
        <ol className="mt-4 space-y-2">
          {state.required.map((id, index) => (
            <li key={`${id}-${index}`} className="flex gap-3 text-sm">
              <span className="w-6 shrink-0 font-display text-lg leading-none text-teal-deep">{index + 1}</span>
              <span>
                <span className="font-semibold">{cardById(id)?.title}</span>
                <span className="block text-ink/65">{cardById(id)?.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        {state.decoyIds.length > 0 ? (
          <div className="mt-5">
            <h3 className="flex items-center gap-2 font-semibold text-coral-deep">
              <Ban className="size-4" aria-hidden />
              Do not say
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {state.decoyIds.map((id) => (
                <li key={id} className="text-ink/80">
                  {cardById(id)?.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
