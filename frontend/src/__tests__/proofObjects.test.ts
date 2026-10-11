import { OBJECTS } from "@kept/config";
import { CATALOG } from "@/features/objects/catalog";
import { entryIcon, entryKeyOfText, objectIconOfText, objectNameOfText, proofTextOf, validEntry } from "@/features/objects/proof";

describe("proof objects: any catalog entry, identified by its text", () => {
  it("the program's eight keep their program text; every other entry is asked for by its lower-case label", () => {
    for (const o of OBJECTS) expect(proofTextOf(o.id)).toBe(o.text);
    expect(proofTextOf("kettlebell")).toBe("kettlebell");
    expect(proofTextOf("running_shoe")).toBe("running shoes");
    expect(proofTextOf("nope")).toBeNull();
  });
  it("every catalog entry has a proof text, a valid key and an icon", () => {
    for (const e of CATALOG) {
      expect(validEntry(e.key)).toBe(true);
      expect(proofTextOf(e.key)).toMatch(/^[\p{L}\p{N} ,.'()-]{1,80}$/u); // what the backend accepts as expectedObject
      expect(entryIcon(e.key)).toBeTruthy();
    }
  });
  it("proof texts are unique, so a stored text maps back to one entry", () => {
    const texts = CATALOG.map((e) => proofTextOf(e.key)!);
    expect(new Set(texts).size).toBe(texts.length);
    for (const e of CATALOG) expect(entryKeyOfText(proofTextOf(e.key)!)).toBe(e.key);
  });
  it("a text no entry has still shows a name and a camera icon", () => {
    expect(objectNameOfText("kettlebell")).toBe("Kettlebell");
    expect(objectNameOfText("garden gnome")).toBe("Garden gnome");
    expect(objectIconOfText("garden gnome")).toBe("camera");
    expect(objectIconOfText("dumbbell")).toBe("dumbbell");
  });
});
