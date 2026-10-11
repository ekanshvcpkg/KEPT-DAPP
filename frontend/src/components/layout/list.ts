// A row of a virtualised screen list (ScreenList in Screen.tsx).
import type { ReactElement } from "react";

/** What a row draws, and the space above it (what its list container's gap was). */
export interface ListItem { key: string; gapBefore?: number; render: () => ReactElement }
