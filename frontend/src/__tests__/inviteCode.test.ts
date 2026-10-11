import { codeFrom } from "@/screens/join/Join";

describe("invite code parsing", () => {
  it("preserves case in backend-issued deep links", () => {
    expect(codeFrom("kept://join/Ab3dE9x")).toBe("Ab3dE9x");
  });

  it("extracts the code from the designed hosted invite URL", () => {
    expect(codeFrom("https://kept.app/o/Ab3dE9x")).toBe("Ab3dE9x");
  });

  it("preserves case when a code is entered directly", () => {
    expect(codeFrom("Ab3dE9x")).toBe("Ab3dE9x");
  });
});
