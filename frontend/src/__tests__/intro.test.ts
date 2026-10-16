import { chartGeometry, keptSeries, sampleMiss, sampleSummary, SAMPLE_DAYS } from "@/features/intro/introData";

describe("intro example (A1·i)", () => {
  it("a miss in the example Oath costs 10% of the stake, shared by the three keepers and KEPT", () => {
    const m = sampleMiss();
    expect(m.pot).toBe(200_000_000n);
    expect(m.lost).toBe(5_000_000n);
    expect(m.each).toBe(1_250_000n);
    expect(m.each * 3n + m.each).toBe(m.lost);
  });
  it("the kept-days series only rises, and stands still on the two missed days", () => {
    const s = keptSeries();
    expect(s).toHaveLength(SAMPLE_DAYS.length);
    expect(s.map((p) => p.kept)).toEqual([1, 2, 3, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12]);
    expect(s.filter((p) => p.slip).map((p) => p.day)).toEqual([4, 9]);
  });
  it("the summary comes from the engine: 12 of 14 kept, a kept rate, and the HP healed back to 100", () => {
    const s = sampleSummary();
    expect(s).toMatchObject({ days: 14, kept: 12, hp: 100 });
    expect(s.rate).not.toBeNull();
    expect(s.rate!).toBeGreaterThan(70);
    expect(s.rate!).toBeLessThan(100);
  });
  it("the chart path starts bottom-left of the data, ends at the top, and stays inside its box", () => {
    const g = chartGeometry(keptSeries(), 300, 160, 10);
    expect(g.xy).toHaveLength(14);
    expect(g.xy[0]!.x).toBe(10);
    expect(g.xy[13]!.x).toBe(290);
    expect(g.xy[13]!.y).toBe(10);
    for (const p of g.xy) { expect(p.y).toBeGreaterThanOrEqual(10); expect(p.y).toBeLessThanOrEqual(150); }
    expect(g.line.startsWith("M")).toBe(true);
    expect(g.area.endsWith("Z")).toBe(true);
  });
});
