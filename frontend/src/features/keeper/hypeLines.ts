// The Keeper's hype lines during a live rep set, in his own voice: an old reaper, half prison warden, half bookmaker.
// Dry, wry, theatrical British; hard on the effort, never on who you are. Two sets of the same situations: "clean"
// (the default) and "noFilter" (Settings: swearing at the set, never slurs, never about identity, body, sex or
// self-harm). Pure data, no React Native imports: backend/scripts/keeper_hype_voice.ts reads it to generate the clips
// (frontend/assets/voice/hype/<id>.mp3, bundled through hypeSources.ts), and the tests check every id has its clip.
// Keep each line short (HYPE_MAX_CHARS, about 1–2 s spoken) so it fits between two reps.

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
    clean: ["Kept. I trained you well, obviously.", "Done. I'd bet on you again. Probably.", "Set complete. You may thank me later."],
    noFilter: ["Done. Fucking magnificent. My coaching.", "Kept. Bloody brilliant. You're welcome.", "Set done. Not half bloody bad."],
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

export const HYPE_SITUATIONS = Object.keys(TEXTS) as HypeSituation[];
export const HYPE_LANGS: readonly HypeLang[] = ["clean", "noFilter"];

export interface HypeLine { id: string; situation: HypeSituation; lang: HypeLang; text: string }

/** `start-clean-1`, `start-nofilter-1`, …: the id is also the clip's file name (frontend/assets/voice/hype/<id>.mp3). */
const idOf = (situation: HypeSituation, lang: HypeLang, i: number) => `${situation}-${lang === "clean" ? "clean" : "nofilter"}-${i + 1}`;

export const HYPE_LINES: readonly HypeLine[] = HYPE_SITUATIONS.flatMap((situation) =>
  HYPE_LANGS.flatMap((lang) => TEXTS[situation][lang].map((text, i) => ({ id: idOf(situation, lang, i), situation, lang, text }))));

/** The line ids for a situation in a language, in manifest order. */
export function hypeIds(situation: HypeSituation, lang: HypeLang): string[] {
  return HYPE_LINES.filter((l) => l.situation === situation && l.lang === lang).map((l) => l.id);
}
