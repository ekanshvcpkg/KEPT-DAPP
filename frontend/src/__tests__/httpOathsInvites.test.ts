import { httpOaths } from "@/api/http/oaths";
import type { HttpClient } from "@/api/http/client";
import { useDeviceOaths } from "@/features/oaths/device";

const oath = { id: "native-sol-oath", isSolo: false } as Parameters<ReturnType<typeof httpOaths>["register"]>[0];
const goal = "read 10 pages";
const habits = [goal];
const objects = ["book"];

function client(inviteRead: () => Promise<unknown>) {
  const post = jest.fn(async (path: string) => {
    if (path === "/api/invites") return { code: "NEW-CODE", deepLink: "kept://join/NEW-CODE", oath: {} };
    return {};
  });
  const get = jest.fn(inviteRead);
  const send = jest.fn(async () => undefined);
  return { api: { post, get, send } as unknown as HttpClient, post, get, send };
}

describe("Live Oath invite registration", () => {
  it("creates an invite if the recovery lookup fails after the Oath was created", async () => {
    const c = client(async () => { throw new Error("invite lookup temporarily failed"); });
    await expect(httpOaths(c.api).register(oath, goal, habits, objects)).resolves.toBe("NEW-CODE");
    expect(c.post.mock.calls.map(([path]) => path)).toEqual(["/api/oaths/details", "/api/invites"]);
    expect(c.get).toHaveBeenCalledWith("/api/oaths/native-sol-oath/invite", expect.anything());
    expect(c.send).toHaveBeenCalledWith("/api/oaths/watch", { oath: "native-sol-oath" });
    expect(useDeviceOaths.getState().codes[oath.id]).toBe("NEW-CODE");
  });

  it("reuses the saved invite instead of creating a second code", async () => {
    const c = client(async () => ({ goalText: goal, habits, habitObjects: objects, invite: { code: "SAVED-123", deepLink: "kept://join/SAVED-123" } }));
    await expect(httpOaths(c.api).register(oath, goal, habits, objects)).resolves.toBe("SAVED-123");
    expect(c.post.mock.calls.map(([path]) => path)).toEqual(["/api/oaths/details"]);
    expect(useDeviceOaths.getState().codes[oath.id]).toBe("SAVED-123");
  });
});
