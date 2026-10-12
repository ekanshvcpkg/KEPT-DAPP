// A Bounty as the app shows it (H1–H7, K, L5), whichever backend it comes from.

export type Category = "Fitness" | "Reading" | "Hydration" | "Music" | "Mind" | "Outdoors";
export const CATEGORIES: Category[] = ["Fitness", "Reading", "Hydration", "Music", "Mind", "Outdoors"];

/** One of a Bounty's daily tasks: what to do and what its proof photo shows (proof text, as an Oath habit's object). */
export interface BountyTask { name: string; object: string }

export interface BountyFacts {
  id: string;
  name: string;
  brand: { name: string; verified: boolean; logo: string; palette: number };
  /** Cover message (H1 cards, B3) and the longer detail message (H2). */
  message: string;
  detail: string;
  link: string | null;
  /** The program's object tag (0–7) for icons; what each photo checks is the task's own object. */
  objectId: number;
  /** The daily tasks, in order (D-99). Every entrant proves each one with its own photo every day; at least one. */
  tasks: BountyTask[];
  numDays: number;
  /** Pool after the KEPT fee: what survivors split. */
  pool: bigint;
  joinClosesAt: number;
  /** Day 1 begins (the first midnight after joins close). */
  startsAt: number;
  entrants: number;
  /** Still in (or survived, once ended). */
  remaining: number;
  category: Category;
  minKeptRate: number | null;
  tokenHeld: { symbol: string; amount: number } | null;
  /** The creator's wallet when it's the user's own Bounty. */
  createdBy: string | null;
  featured: boolean;
  recentlyOut: { name: string; day: number; at: number }[];
  /** H6: still in at the end of each day so far. */
  stillInByDay: number[];
  finishersOptIn: string[];
}
