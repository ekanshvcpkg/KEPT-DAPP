// The Keeper's hype lines during a live rep set, in his own voice: an old reaper, half prison warden, half bookmaker.
// Dry, wry, theatrical British; hard on the effort, never on who you are. Two sets of the same situations: "clean"
// (the default) and "noFilter" (Settings: swearing at the set, never slurs, never about identity, body, sex or
// self-harm). Pure data, no React Native imports: backend/scripts/keeper_hype_voice.ts reads it to generate the clips
// (frontend/assets/voice/hype/<id>.mp3, bundled through hypeSources.ts), and the tests check every id has its clip.
// Two tiers: the long lines (HYPE_MAX_CHARS, about 1.3–2.4 s spoken) for every situation, and a SHORT tier (1–3 words,
// HYPE_SHORT_MAX_CHARS, spoken in about 0.9 s or less) for the moments inside the rep rhythm (streak, milestones, slow,
// half rep, fault): at 1.5–2.5 s a rep, a long line rarely ends before the next count, a short one usually does. The coach
// (hypeCoach.ts) plays a long line when it fits and falls back to a short one; start and done stay long.

export type HypeLang = "clean" | "noFilter";
export type HypeSituation =
  | "start" // the counter saw the start position for the first time (cocky, energetic)
  | "first" // rep 1
  | "halfway"
  | "threeLeft"
  | "last" // one rep to go
  | "done" // the set is complete (praise, ego)
  | "streak" // a plain rep, every 3–4 reps (keeps the pressure on)
  | "slow" // a rep that dragged (shaming)
  | "halfRep" // not deep enough (shaming)
  | "fault" // form fault
  | "back" // back in frame after the counter lost you (encouraging)
  | "resume"; // counting again after the Freeze photo

export const HYPE_MAX_CHARS = 60;
export const HYPE_SHORT_MAX_CHARS = 20;
export type HypeTier = "long" | "short";

const TEXTS: Record<HypeSituation, Record<HypeLang, readonly string[]>> = {
  start: {
    clean: ["Odds are against you. Prove me wrong.", "Clock's running. Impress the bookie.", "On your marks, inmate. Let's see it."],
    noFilter: ["Right. Let's get this bloody show going.", "Odds are shit. Prove me wrong.", "Clock's on. Don't fuck this up."],
  },
  first: {
    clean: ["One down. Don't get cocky. That's my job.", "That's one. The house is watching.", "One. A start. Barely."],
    noFilter: ["One. Don't get bloody cocky.", "That's one. Bloody miracle.", "One down. Fucking finally."],
  },
  halfway: {
    clean: ["Halfway. I've moved your odds. Slightly.", "Half done. Don't fold now.", "Halfway there. Keep paying your debt."],
    noFilter: ["Halfway. Don't you fucking quit.", "Half done. Bloody hell, keep going.", "Halfway. I've got money on you, damn it."],
  },
  threeLeft: {
    clean: ["Three left. Don't you dare stop.", "Three more. The cell door's in sight.", "Three to go. I've seen weaker. Not many."],
    noFilter: ["Three left. Dig in, for fuck's sake.", "Three more. No bloody excuses.", "Three to go. Don't crap out now."],
  },
  last: {
    clean: ["Last one. Make it worth my time.", "One more. Then you walk free.", "Final rep. Win me some money."],
    noFilter: ["Last one. Make it fucking count.", "One more, then you're bloody free.", "Final rep. Win me some damn money."],
  },
  done: {
    // Never "Kept." here: the server hasn't judged the set yet (it recounts and checks the Freeze photo after this).
    clean: ["Set done. I trained you well, obviously.", "Done. I'd bet on you again. Probably.", "Set complete. You may thank me later."],
    noFilter: ["Done. Fucking magnificent. My coaching.", "Done. Bloody brilliant. Now I judge it.", "Set done. Not half bloody bad."],
  },
  streak: {
    clean: ["Keep it coming. I'm counting.", "Not bad. Don't let it go to your head.", "That's it. Earn your freedom.", "Steady. The house hates a winner."],
    noFilter: ["Keep the bloody pace.", "That's it. Don't you fucking stop.", "Not bad. Don't let it go to your bloody head.", "Hell yes. Earn your freedom."],
  },
  slow: {
    clean: ["Slower than a parole hearing.", "Is this a rep or a funeral?", "I've reaped faster souls. Move."],
    noFilter: ["Slower than a bloody parole board.", "Is this a rep or a fucking funeral?", "Glaciers move faster. Shift it, damn it."],
  },
  halfRep: {
    clean: ["Halfway down isn't down. Lower.", "That's a curtsy, not a rep.", "Deeper. I don't pay for half measures."],
    noFilter: ["Half-arsed. Get all the way down.", "That's not a rep, that's a bloody curtsy.", "Deeper, for fuck's sake."],
  },
  fault: {
    clean: ["Sloppy form. Fix it.", "Form like that voids the bet.", "Tidy that up. I'm watching."],
    noFilter: ["Sloppy as hell. Fix your form.", "That form's a bloody disgrace.", "Tidy it up. That was shite."],
  },
  back: {
    clean: ["There you are. Back to work.", "Welcome back. The clock didn't stop.", "Thought you'd escaped. Carry on."],
    noFilter: ["There you are. Back to bloody work.", "Back, are we? About bloody time.", "Thought you'd legged it. Crack on, damn it."],
  },
  resume: {
    clean: ["Lovely photo. Now back to work.", "Snap taken. Carry on, inmate.", "Pose done. The reps won't do themselves."],
    noFilter: ["Lovely photo. Now back to the bloody reps.", "Snap's done. Get fucking moving.", "Pose over. Reps, damn it."],
  },
};

/** The short tier: only the moments between two counts. Same character, a breath long. */
const SHORT: Partial<Record<HypeSituation, Record<HypeLang, readonly string[]>>> = {
  streak: { clean: ["Again.", "Lovely.", "That's it."], noFilter: ["Fucking move.", "Bloody go.", "Arse in gear."] },
  first: { clean: ["One. Barely."], noFilter: ["One. Bloody hell."] },
  halfway: { clean: ["Halfway, champ."], noFilter: ["Bloody halfway."] },
  threeLeft: { clean: ["Three left."], noFilter: ["Three, damn it."] },
  last: { clean: ["Last one."], noFilter: ["Last bloody one."] },
  slow: { clean: ["Move it."], noFilter: ["Move, damn it."] },
  halfRep: { clean: ["Deeper."], noFilter: ["Get bloody down."] },
  fault: { clean: ["Sloppy."], noFilter: ["Bloody sloppy."] },
  back: { clean: ["There you are.", "Welcome back."], noFilter: ["Finally, damn it.", "About bloody time."] },
  resume: { clean: ["Back to it.", "Carry on."], noFilter: ["Back, damn it.", "Bloody carry on."] },
};

export const HYPE_SITUATIONS = Object.keys(TEXTS) as HypeSituation[];
export const HYPE_SHORT_SITUATIONS = Object.keys(SHORT) as HypeSituation[];
export const HYPE_LANGS: readonly HypeLang[] = ["clean", "noFilter"];

export interface HypeLine { id: string; situation: HypeSituation; lang: HypeLang; tier: HypeTier; text: string }

/**
 * `start-clean-1`, `start-nofilter-1`, … (long) and `streak-clean-s1`, … (short): the id is also the clip's file name
 * (frontend/assets/voice/hype/<id>.mp3).
 */
const idOf = (situation: HypeSituation, lang: HypeLang, tier: HypeTier, i: number) =>
  `${situation}-${lang === "clean" ? "clean" : "nofilter"}-${tier === "short" ? "s" : ""}${i + 1}`;

const linesOf = (tier: HypeTier, texts: Partial<Record<HypeSituation, Record<HypeLang, readonly string[]>>>): HypeLine[] =>
  HYPE_SITUATIONS.flatMap((situation) => HYPE_LANGS.flatMap((lang) =>
    (texts[situation]?.[lang] ?? []).map((text, i) => ({ id: idOf(situation, lang, tier, i), situation, lang, tier, text }))));

export const HYPE_LINES: readonly HypeLine[] = [...linesOf("long", TEXTS), ...linesOf("short", SHORT)];

/** The line ids for a situation in a language and tier (long unless said), in manifest order. */
export function hypeIds(situation: HypeSituation, lang: HypeLang, tier: HypeTier = "long"): string[] {
  return HYPE_LINES.filter((l) => l.situation === situation && l.lang === lang && l.tier === tier).map((l) => l.id);
}

/**
 * What a line's words need from the activity of the set (2026-11-27: every live activity, not just push-ups and squats).
 * `down`: the effort goes down (push-ups, squats, lunges, burpees), so "deeper", "lower" and "get all the way down" make
 * sense; a half jumping jack, sit-up, high knee or press is short going UP. `unit`: "reps", or "seconds" for a held
 * plank, where "final rep", "the reps", "again", "move" or "keep the pace" would be wrong.
 */
export interface HypeActivity { down: boolean; unit: "reps" | "seconds" }
/** A set of push-ups: what every line was written for. */
export const REPS_DOWN: HypeActivity = { down: true, unit: "reps" };

/** The lines that fit only some activities; every other line fits any (checked against the texts in the tests). */
const NEEDS: Readonly<Record<string, "down" | "reps">> = {
  // "Halfway down isn't down. Lower." / "That's a curtsy" / "Deeper" / "Get all the way down" / "Get bloody down."
  "halfRep-clean-1": "down", "halfRep-clean-2": "down", "halfRep-clean-3": "down", "halfRep-clean-s1": "down",
  "halfRep-nofilter-1": "down", "halfRep-nofilter-2": "down", "halfRep-nofilter-3": "down", "halfRep-nofilter-s1": "down",
  // A slow rep, the final rep, the reps after the photo, "again", "move", "go", "the pace": a held plank has none of them.
  "slow-clean-1": "reps", "slow-clean-2": "reps", "slow-clean-3": "reps", "slow-clean-s1": "reps",
  "slow-nofilter-1": "reps", "slow-nofilter-2": "reps", "slow-nofilter-3": "reps", "slow-nofilter-s1": "reps",
  "last-clean-3": "reps", "last-nofilter-3": "reps",
  "resume-clean-3": "reps", "resume-nofilter-1": "reps", "resume-nofilter-2": "reps", "resume-nofilter-3": "reps",
  "streak-clean-s1": "reps", "streak-nofilter-1": "reps", "streak-nofilter-s1": "reps", "streak-nofilter-s2": "reps", "streak-nofilter-s3": "reps",
  // "Welcome back. The clock didn't stop.": a plank's clock does stop while the Keeper can't see you.
  "back-clean-2": "reps",
};

/** Whether a line's words fit the activity (a line not listed in NEEDS fits any). */
export function hypeFits(id: string, a: HypeActivity): boolean {
  const need = NEEDS[id];
  return need === undefined || (need === "down" ? a.down && a.unit === "reps" : a.unit === "reps");
}

/** The ids NEEDS restricts (the tests check each one exists). */
export const HYPE_RESTRICTED_IDS = Object.keys(NEEDS);
