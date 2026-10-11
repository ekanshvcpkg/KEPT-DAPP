// A card inside CardDeck fills the deck's height (D-85): content at the top, its action at the bottom, the
// spare space between. Cards read this; anything else lays them out at their own height.
import { createContext } from "react";

export const CardFill = createContext(false);
