// Live Oath updates over Supabase Realtime: the Phoenix join/broadcast/leave exchange on a fake WebSocket.
jest.mock("@/config/env", () => ({ env: { supabaseUrl: "https://x.supabase.co", supabasePublishableKey: "sb_publishable_test" } }));

type Sent = { topic: string; event: string; payload: unknown; ref: string };
class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: Sent[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(msg: object) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

beforeAll(() => { (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket; });

test("joins oath:<address>, passes broadcasts to listeners, leaves and closes when the last one unsubscribes", () => {
  jest.useFakeTimers();
  const { subscribeOath, firstToAnnounce } = require("@/features/oaths/realtime") as typeof import("@/features/oaths/realtime");
  const got: unknown[] = [];
  const off = subscribeOath("OATH1", (e) => got.push(e));
  const ws = FakeSocket.last!;
  expect(ws.url).toBe("wss://x.supabase.co/realtime/v1/websocket?apikey=sb_publishable_test&vsn=1.0.0");
  ws.open();
  expect(ws.sent[0]).toMatchObject({ topic: "realtime:oath:OATH1", event: "phx_join" });

  ws.receive({ topic: "realtime:oath:OATH1", event: "broadcast", payload: { event: "oath_changed", payload: { reason: "checkin", wallet: "W2" } } });
  ws.receive({ topic: "realtime:oath:OTHER", event: "broadcast", payload: { event: "oath_changed", payload: {} } });
  ws.receive({ topic: "realtime:oath:OATH1", event: "broadcast", payload: { event: "something_else", payload: {} } });
  expect(got).toEqual([{ oath: "OATH1", reason: "checkin", wallet: "W2" }]);

  jest.advanceTimersByTime(25_000);
  expect(ws.sent.some((m) => m.topic === "phoenix" && m.event === "heartbeat")).toBe(true);

  off();
  expect(ws.sent.some((m) => m.topic === "realtime:oath:OATH1" && m.event === "phx_leave")).toBe(true);
  expect(ws.closed).toBe(true);

  const e = { oath: "O", reason: "proof" as const, wallet: "W" };
  expect(firstToAnnounce(e, 1_000)).toBe(true);
  expect(firstToAnnounce(e, 2_000)).toBe(false);
  expect(firstToAnnounce(e, 7_000)).toBe(true);
  jest.useRealTimers();
});
