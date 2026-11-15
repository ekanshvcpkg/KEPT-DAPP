// B5 (daily recap) and B1 (what's due today) after a day settles in Demo: a miss of your own is never shown
// as kept, and a Bounty that knocked you out is no longer asked of you.
import { t } from "@/copy";
import { clock } from "@/lib/clock";
import { MOCK_WALLET } from "@/api/mock/slices";
import { mockOaths } from "@/features/oaths/mockStore";
import { oathView } from "@/features/oaths/model";
import { recapOf, todayItems } from "@/screens/today/Today";

const DAY_MS = 86_400_000;

function viewsTomorrow() {
  mockOaths.reset();
  mockOaths.ensureSeeded("judges", MOCK_WALLET);
  // Profile › Skip to tomorrow: the day ends without the user proving the Hydrate Week Bounty.
  clock.set(Date.now() + DAY_MS);
  const now = Math.floor(clock.now() / 1000);
  return mockOaths.list(MOCK_WALLET).map((f) => oathView(f, now, MOCK_WALLET));
}

afterEach(() => { clock.reset(); });

it("a Bounty day you missed shows in the recap as your miss, not as kept", () => {
  const rows = recapOf(viewsTomorrow());
  const hydrate = rows.find((r) => r.v.facts.name === "Hydrate Week")!;
  expect(hydrate).toBeDefined();
  expect(hydrate.meMissed).toBe(true);
  expect(hydrate.missed).toContain(t("screens.D2.b6.r0.t"));
  // Read 20 pages was already kept that day: still "You kept · safe".
  const read = rows.find((r) => r.v.facts.name === "Read 20 pages")!;
  expect(read).toMatchObject({ meMissed: false, missed: [], lost: 0n });
  // Iron Week's second photo was never taken either, so it is a miss of yours there too.
  const iron = rows.find((r) => r.v.facts.name === "Iron Week")!;
  expect(iron.meMissed).toBe(true);
  expect(iron.lost).toBeGreaterThan(0n);
});

it("Today stops asking for proof on a Bounty you're out of", () => {
  const views = viewsTomorrow();
  const hydrate = views.find((v) => v.facts.name === "Hydrate Week")!;
  expect(hydrate.members[hydrate.me]!.missed.length).toBeGreaterThan(0);
  expect(todayItems(views).map((v) => v.facts.name)).not.toContain("Hydrate Week");
});
