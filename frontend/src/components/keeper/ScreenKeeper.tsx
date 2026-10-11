// The Keeper on a screen (components.md › KeeperMark, KeeperNote, KeeperPlacement; the prototype's
// renderVals › kp). A screen's Keeper line either stays in the content as a big KeeperPlacement (size
// ≥ 120 in the design, and always on sheets) or moves behind the KeeperMark as a KeeperNote:
// - no screen opens the note by itself (D-81: it covered the screen on entry): an unread line makes the
//   mark show its dot and knock (×3) until it's opened; on a tab with no line, the mark opens the idle line;
// - on flow screens an opened note closes after 4.8 s; a tap anywhere else closes it (Screen's backdrop);
// - the note always closes on blur (navigation, tab change, a sheet opening, back) and lives inside its
//   screen, so it can never stay up on another screen.
import { createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavigationContext } from "@react-navigation/native";
import { create } from "zustand";
import type { KeeperLine } from "@/copy";
import { metrics } from "@/theme";
import { keeperAt, layoutOf } from "@/app/layout";
import type { KeeperPlacementProps } from "./KeeperUI";
import { KeeperNote, KeeperPlacement } from "./KeeperUI";
import type { KeeperAnimName } from "./rig";

type ScreenKind = "tab" | "flow" | "sheet";

/** Lines the user has opened this session (`screen:line`): their mark stops knocking. */
const useSeen = create<{ seen: Record<string, true>; mark(k: string): void }>()((set) => ({
  seen: {},
  mark: (k) => set((s) => (s.seen[k] ? s : { seen: { ...s.seen, [k]: true } })),
}));
/** Test hook: forget what was read. */
export const __resetSeenKeeperLines = () => useSeen.setState({ seen: {} });

interface ScreenKeeperState {
  kind: ScreenKind;
  /** The screen's own line(s); null when it has none (tabs then fall back to the idle line). */
  lines: KeeperLine[] | null;
  open: boolean;
  /** Unread line: the mark shows the dot and knocks. */
  fresh: boolean;
  toggle(): void;
  close(): void;
}

interface Registry extends ScreenKeeperState {
  register(lines: KeeperLine[] | null, anim?: KeeperAnimName): void;
}

const Ctx = createContext<Registry | null>(null);
/** The Keeper state of the enclosing screen (NavBar / AppHeader read it for the mark). */
export const useScreenKeeper = (): ScreenKeeperState | null => useContext(Ctx);

/** The line shown in the note: a single line, or the k-th of several (the action pill cycles). */
function lineKey(id: string, lines: KeeperLine[]) { return `${id}:${lines.map((l) => l.line).join("|")}`; }

/**
 * Screen-level provider (used by Screen). `idle` is the tab's idle line (copy.keeper.idle.<tab>),
 * shown when a tab screen has no line of its own.
 */
export function useKeeperHost(id: string | undefined, kind: ScreenKind, idle: KeeperLine | null) {
  const nav = useContext(NavigationContext);
  const [lines, setLines] = useState<KeeperLine[] | null>(null);
  const [anim, setAnim] = useState<KeeperAnimName>("idle");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = lines && id ? lineKey(id, lines) : null;
  const seen = useSeen((s) => (key ? !!s.seen[key] : true));
  const markSeen = useSeen((s) => s.mark);

  const disarm = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const arm = useCallback(() => { disarm(); timer.current = setTimeout(() => setOpen(false), metrics.keeperNote.holdMs); }, [disarm]);
  const close = useCallback(() => { disarm(); setOpen(false); }, [disarm]);

  // Always closes when the screen loses focus (navigation, tab change, sheet, back).
  useEffect(() => {
    if (!nav) return;
    return nav.addListener("blur", close);
  }, [nav, close]);
  useEffect(() => disarm, [disarm]);

  const register = useCallback((l: KeeperLine[] | null, a: KeeperAnimName = "idle") => {
    setLines((prev) => (sameLines(prev, l) ? prev : l));
    setAnim(a);
  }, []);
  const toggle = useCallback(() => {
    if (key) markSeen(key);
    if (open) { close(); return; }
    setOpen(true);
    if (kind === "flow") arm();
  }, [key, markSeen, open, close, kind, arm]);
  const cycle = useCallback(() => { setIndex((i) => i + 1); if (kind === "flow") arm(); }, [kind, arm]);

  const shown = lines ?? (kind === "tab" && idle ? [idle] : null);
  const isOpen = open && !!shown;
  const value: Registry = useMemo(() => ({
    kind, lines, open: isOpen, fresh: !!lines && !seen && !open, toggle, close, register,
  }), [kind, lines, isOpen, open, seen, toggle, close, register]);

  const current = shown ? shown[index % shown.length]! : null;
  const note = isOpen && current ? (
    <KeeperNote
      key={`${current.line}`}
      mood={current.mood}
      line={current.line}
      anim={index ? (["point", "wave", "thumbs", "shrug"] as const)[index % 4]! : anim}
      origin={kind === "tab" ? "left" : "right"}
      top={0}
      onClose={close}
      {...(shown && shown.length > 1 ? { action: { label: `${(index % shown.length) + 1}/${shown.length}`, onPress: cycle } } : {})}
    />
  ) : null;
  return { value, note, Provider: Ctx.Provider };
}

const sameLines = (a: KeeperLine[] | null, b: KeeperLine[] | null) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((l, i) => l.line === b[i]!.line && l.mood === b[i]!.mood));

interface ScreenKeeperProps extends Omit<KeeperPlacementProps, "mood" | "line" | "lines"> {
  /** The design id whose placement to use (app/layout.gen.json). */
  id: string;
  /** One or more lines; several cycle (bubble "k/n ›" inline, the note's action pill otherwise). */
  lines: KeeperLine[];
}

/** Whether the design shows this screen's Keeper in the content (size ≥ 120, or a sheet). */
function keeperIsInline(id: string, kind: ScreenKind | undefined): boolean {
  if (kind === "sheet") return true;
  const k = layoutOf(id)?.keeper;
  return !!k && k.size >= metrics.keeperPlacement.inlineMin;
}

/**
 * The Keeper's slot in a screen's content: a KeeperPlacement where the design draws him (big moments),
 * otherwise nothing here; the line goes to the KeeperMark and KeeperNote.
 */
export function ScreenKeeper({ id, lines, ...rest }: ScreenKeeperProps) {
  const host = useContext(Ctx);
  // Outside a Screen (sheets, the Gallery) there's no mark to move to: he stays in the content.
  const inline = !host || keeperIsInline(id, host.kind);
  const register = host?.register;
  const key = lines.map((l) => `${l.mood}:${l.line}`).join("|");
  const anim = rest.anim;
  useEffect(() => {
    if (inline || !register) return;
    register(lines, anim);
    return () => register(null);
    // `lines` is compared by content (key) so a new array per render doesn't re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, register, key, anim]);
  if (!inline) return null;
  const first = lines[0];
  if (!first) return null;
  return <KeeperPlacement mood={first.mood} {...(lines.length > 1 ? { lines: lines.map((l) => l.line) } : { line: first.line })} {...keeperAt(id)} {...rest} />;
}

/** Screen uses this to skip the enter wrapper (and its gap) for a ScreenKeeper that renders nothing. */
export function isNoteOnlyKeeper(node: ReactNode, kind: ScreenKind): boolean {
  return isValidElement(node) && node.type === ScreenKeeper && !keeperIsInline((node.props as ScreenKeeperProps).id, kind);
}

