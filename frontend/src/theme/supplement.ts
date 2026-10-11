// UI values used by the prototype that design/tokens.json doesn't name. Each one cites where it comes
// from (components.md or the renderer in reference/KEPT Play.dc.html). Keep this list short; anything
// added here should also be proposed for tokens.json.
export const supplement = {
  /** Token amendments (DECISIONS › Token amendments): values that replace tokens.json's. */
  amend: {
    /** Tertiary text #6A6A6A → #808080: 3.4:1 → 4.7:1 on bg.app (docs/notes/ACCESSIBILITY.md). */
    text: { tertiary: "#808080" },
  },
  color: {
    /** Button disabled label (components.md › Button › States). */
    disabledFg: "#5A5A5A",
    /** Toggle knob when off (components.md › Toggle). */
    toggleKnobOff: "#9A9A9A",
    /** Unselected option / tab bar / search ring: white .07 (OptionGrid, TabBar, SearchBar). */
    hairline07: "rgba(255,255,255,0.07)",
    /** Avatar row-tile / seat highlight and shade (RowList leading tile, SeatSlots). */
    tileHi22: "rgba(255,255,255,0.22)",
    tileHi35: "rgba(255,255,255,0.35)",
    tileHi45: "rgba(255,255,255,0.45)",
    tileShade15: "rgba(0,0,0,0.15)",
    tileShade20: "rgba(0,0,0,0.20)",
    /** Floating orbs around a big Keeper (renderer › kpx): highlight, coin ring, coin drop, shadow. */
    tileHi60: "rgba(255,255,255,0.60)",
    tileHi18: "rgba(255,255,255,0.18)",
    tileShade18: "rgba(0,0,0,0.18)",
    coinDrop: "rgba(60,80,10,0.90)",
    orbShadow: "rgba(0,0,0,0.45)",
    /** Grid legend swatches (renderer › grid legend). */
    legendPending: "#4A4A4A",
    legendReview: "rgba(167,139,250,0.5)",
    /** Grid "photo 1 done" cell ring (renderer CELL.h). */
    halfRing: "rgba(197,242,92,0.5)",
    /** Upload box ring (components.md › UploadBox). */
    uploadRing: "#333333",
    uploadHatchA: "#171717",
    uploadHatchB: "#1A1A1A",
    /** Camera pill backgrounds (components.md › ProofCamera). */
    camPill: "rgba(0,0,0,0.6)",
    camPillCheck: "rgba(0,0,0,0.65)",
    camPhotoPill: "rgba(255,255,255,0.12)",
    camCornerIdle: "rgba(255,255,255,0.65)",
    camObject: "rgba(255,255,255,0.42)",
    camGradient: ["#2A2A2E", "#0A0A0B"],
    /** Cover / hero decoration (BountyCover, HScroller, ProfileCard banner icon). */
    onCover28: "rgba(0,0,0,0.28)",
    decoWhite16: "rgba(255,255,255,0.16)",
    decoWhite20: "rgba(255,255,255,0.20)",
    /** Decor icons behind content (DESIGN.md §2.9). */
    decor: "#1E1E1E",
    /**
     * Screen tone washes (tokens color.toneWash, which only describes them): [colour, stop where it
     * fades out]. Ember sits on its own base; lock uses color.bg.lock.
     */
    toneWash: {
      lime: ["rgba(197,242,92,0.14)", 0.6],
      red: ["rgba(248,113,113,0.17)", 0.62],
      ember: ["rgba(251,146,60,0.18)", 0.6],
      emberBase: "#151010",
      grey: "rgba(0,0,0,0.30)",
    },
    /** The beam (tokens material.beam): white .22 → .05 at 55 % → 0, and its top light bar + glow. */
    beam: [["#FFFFFF", 0.22, 0], ["#FFFFFF", 0.05, 0.55], ["#FFFFFF", 0, 1]],
    beamBar: "#FFFFFF",
    beamGlow: "rgba(255,255,255,0.55)",
    /** Keeper floor shadow (components.md › KeeperPlacement). */
    keeperShadow: "rgba(0,0,0,0.6)",
    /** KeeperNote tile: radial #2A2A30 → #131313 (tokens.material.keeperNoteTile). */
    keeperNoteTile: ["#2A2A30", "#131313"],
    /** Swatch ring when unselected (AvatarBuilder). */
    swatchRing: "rgba(255,255,255,0.15)",
    /** Sheet grabber (components.md › BottomSheet). */
    grabber: "rgba(255,255,255,0.25)",
    /** Skeleton block (screens.md › States › loading). */
    skeleton: "#1C1C1C",
    /** The skeleton sweep band (D-83): transparent → white .06 → transparent. */
    skeletonShine: ["rgba(255,255,255,0)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0)"],
    /** Card sheen end / transparent. */
    transparent: "transparent",
  },
} as const;
