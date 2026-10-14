export type LevelId = 1 | 2;

export type CardKind = "step" | "decoy";

export type CardDef = {
  id: string;
  title: string;
  detail: string;
  kind: CardKind;
};

export type Caller = {
  name: string;
  line: string;
  plan: string;
};

export type Scenario = {
  id: string;
  situation: string;
  card: CardDef;
  afterId: string;
};

export type RankId = "hostage" | "rookie" | "samurai" | "legend";

export const RANKS: Record<RankId, { title: string; blurb: string }> = {
  hostage: {
    title: "Hold Music Hostage",
    blurb: "The caller never got a word in. The flute solo did.",
  },
  rookie: {
    title: "Script Rookie",
    blurb: "You found the script. It was hiding under the strikes.",
  },
  samurai: {
    title: "SOA Samurai",
    blurb: "Scope honored, caller verified, nobody was promised a free toaster.",
  },
  legend: {
    title: "AEP Legend",
    blurb: "Peak season will tell stories about this close.",
  },
};

const step = (id: string, title: string, detail: string): CardDef => ({
  id,
  title,
  detail,
  kind: "step",
});

const decoy = (id: string, title: string, detail: string): CardDef => ({
  id,
  title,
  detail,
  kind: "decoy",
});

export const NEEDS_STEPS: CardDef[] = [
  step("greet", "Greet & identify yourself", "Your name, license, and the agency you represent."),
  step("recorded", "Recorded line notice", "Tell them this call is being recorded."),
  step("verify", "Secure the call", "Confirm name, date of birth, and Medicare number."),
  step("tpmo", "TPMO disclaimer", "You do not offer every plan available in their area."),
  step("soa", "Scope of Appointment", "Agree on what this call will cover before plan talk."),
  step("needs", "Needs assessment", "Doctors, drugs, and budget — before plans or a booked enrollment."),
  step("schedule", "Schedule Enrollment call", "Book the enrollment call. Do not enroll on this one."),
  step("close", "Recap & close", "Summarize next steps. No new pitches on the way out."),
];

export const ENROLL_STEPS: CardDef[] = [
  step("greet", "Greet & identify yourself", "Your name, license, and the agency you represent."),
  step("recorded", "Recorded line notice", "Tell them this call is being recorded."),
  step("verify", "Secure the call", "Confirm name, date of birth, and Medicare number."),
  step("tpmo", "TPMO disclaimer", "You do not offer every plan available in their area."),
  step("soa", "Scope of Appointment", "Agree on what this call will cover before plan talk."),
  step("needs", "Needs assessment", "Doctors, drugs, and budget — before plans or a booked enrollment."),
  step("compare", "Plan comparison", "Walk only the fictional options they asked about."),
  step("eligibility", "Eligibility questions", "Election period, current coverage, and timing."),
  step("enroll", "Enrollment", "Take the application only after they have chosen a plan."),
  step("readback", "Read the enrollment back", "Read the application back before anything is submitted."),
  step("close", "Recap & close", "Summarize next steps. No new pitches on the way out."),
];

export const NEEDS_DECOYS: CardDef[] = [
  decoy("free", "Tell them it's free", "Premiums, copays, and extras are not a gift."),
  decoy("sent", "Say Medicare sent you", "Medicare did not send you. Don't imply it did."),
  decoy("skip", "Skip the SOA to save time", "Scope of Appointment is not optional."),
];

export const ENROLL_DECOYS: CardDef[] = [
  ...NEEDS_DECOYS,
  decoy("pick-for-them", "I'll pick the best plan for you", "The caller chooses. You don't."),
  decoy("submit-now", "Submit it now, I'll read it back later", "Nothing is submitted before the read-back."),
];

export const DECOYS: CardDef[] = ENROLL_DECOYS;

export const SCENARIOS: Scenario[] = [
  {
    id: "son",
    situation: "Their son is on the line. Read the second-party disclaimer after you secure the call.",
    afterId: "verify",
    card: step(
      "second-party-son",
      "Read second party disclaimer",
      "A son is now on the line. Read the second-party disclaimer and confirm he may speak for the caller before you continue.",
    ),
  },
  {
    id: "spouse",
    situation: "Their spouse is on the line. Read the second-party disclaimer after you secure the call.",
    afterId: "verify",
    card: step(
      "second-party-spouse",
      "Read second party disclaimer",
      "A spouse is now on the line. Read the second-party disclaimer and confirm they may speak for the caller before you continue.",
    ),
  },
  {
    id: "pick-plan",
    situation: "They want you to pick the plan. They have to choose it before you enroll.",
    afterId: "eligibility",
    card: step(
      "caller-chooses",
      "Let the caller choose the plan",
      "You don't enroll a plan they didn't pick.",
    ),
  },
  {
    id: "talk-over",
    situation: "They missed the recording notice. Repeat it before you continue.",
    afterId: "recorded",
    card: step(
      "repeat-recorded",
      "Repeat the recorded-line notice",
      "If they didn't hear it, say it again before you continue.",
    ),
  },
  {
    id: "step-away",
    situation: "They stepped away and just got back. Confirm they're still consenting before needs assessment.",
    afterId: "soa",
    card: step(
      "confirm-back",
      "Confirm they're back and still consenting",
      "Don't resume plan talk until they're actually on the line.",
    ),
  },
  {
    id: "neighbor",
    situation: "They ask about a neighbor's plan. Stay on this caller before you compare plans.",
    afterId: "needs",
    card: step(
      "scope-redirect",
      "Redirect the out-of-scope question",
      "You can only discuss this caller's own coverage.",
    ),
  },
];

export function withScenario(steps: CardDef[], scenario: Scenario): CardDef[] {
  const index = steps.findIndex((card) => card.id === scenario.afterId);
  const at = index < 0 ? steps.length : index + 1;
  return [...steps.slice(0, at), scenario.card, ...steps.slice(at)];
}

export const CALLERS: Caller[] = [
  {
    name: "Dotty Fenwick",
    line: "Keeps pausing to tell the dog to get off the couch.",
    plan: "Lakeview Choice PPO",
  },
  {
    name: "Harold P. Biscuit",
    line: "Wants a plan that covers his competitive pie-eating league.",
    plan: "Crumb & Coverage HMO",
  },
  {
    name: "Junie Caldwell",
    line: "Whispers the whole call because her cat is 'in a meeting.'",
    plan: "Whisker Wellness PPO",
  },
  {
    name: "Sal Moretti",
    line: "Puts you on speaker next to a very loud espresso machine.",
    plan: "Morning Rally HMO",
  },
  {
    name: "Bea Langstrom",
    line: "Asks if any plan includes a frequent-nap rider.",
    plan: "Porchlight Plus PPO",
  },
  {
    name: "Clive Dalloway",
    line: "Has his notes written on the back of a grocery receipt.",
    plan: "Greenhouse Gold HMO",
  },
  {
    name: "Nia Okonkwo",
    line: "Taking the call on a walk and a little out of breath.",
    plan: "Bright Drawer PPO",
  },
  {
    name: "Marty Kell",
    line: "Thinks AEP is a limited-run energy drink and wants the citrus one.",
    plan: "Open Season Select HMO",
  },
  {
    name: "Ruthie Pell",
    line: "Answers every verification question with a bingo number.",
    plan: "Hall Card PPO",
  },
  {
    name: "Omar Voss",
    line: "Shopping plans between drum solos in a garage band.",
    plan: "Downbeat Advantage HMO",
  },
  {
    name: "Lila Cho",
    line: "Has three tabs open and a fierce opinion about your hold music.",
    plan: "Clear Type PPO",
  },
  {
    name: "Gus Penrose",
    line: "Called while lost in a hedge maze he planted himself.",
    plan: "Garden Gate HMO",
  },
];

const ALL: CardDef[] = [
  ...NEEDS_STEPS,
  ...ENROLL_STEPS,
  ...ENROLL_DECOYS,
  ...SCENARIOS.map((item) => item.card),
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(ALL.map((card) => [card.id, card]));

export function cardById(id: string): CardDef | undefined {
  return CARDS[id];
}

export const LEVELS: Record<
  LevelId,
  { name: string; eyebrow: string; summary: string; detail: string }
> = {
  1: {
    name: "Needs Assessment (only)",
    eyebrow: "8 steps + 3 traps",
    summary: "Assess needs, then book the enrollment call. Don't enroll on this one.",
    detail: "Opener through needs assessment, then schedule the enrollment call. Illegal lines go in Do Not Say.",
  },
  2: {
    name: "Enrollment (Chaos Calls)",
    eyebrow: "12 steps + 5 traps",
    summary: "Full enrollment. The bubble tells you the one extra step.",
    detail: "Read the caller's situation before you build. That extra card has one correct slot.",
  },
};

export function stepsFor(level: LevelId, scenario?: Scenario): CardDef[] {
  if (level === 1) return NEEDS_STEPS;
  return withScenario(ENROLL_STEPS, scenario ?? SCENARIOS[0]!);
}

export function decoysFor(level: LevelId): CardDef[] {
  return level === 1 ? NEEDS_DECOYS : ENROLL_DECOYS;
}
