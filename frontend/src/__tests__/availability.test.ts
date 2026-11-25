// Live hides entry points whose backend isn't there yet (D-80); Demo (the mock) has everything.
import { featureAvailable } from "@/features/availability";
import { useMode } from "@/state/mode";

afterEach(() => { useMode.setState(useMode.getInitialState(), true); });

it("Bounty join is hidden in Live (proving a Bounty day isn't on the Keeper yet) and present in Demo", () => {
  useMode.setState({ mode: "live" });
  expect(featureAvailable("joinBounty")).toBe(false);
  expect(featureAvailable("createBounty")).toBe(false);
  expect(featureAvailable("rematch")).toBe(false);
  useMode.setState({ mode: "demo" });
  expect(featureAvailable("joinBounty")).toBe(true);
  expect(featureAvailable("rematch")).toBe(true);
});
