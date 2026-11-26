// Live Oath updates over Supabase Realtime (Broadcast). The backend pings channel `oath:<address>` when a member's
// proof lands or a day is recorded on chain (backend/src/v4/realtime.ts); each phone in the Oath then refetches it.
// The ping is only a hint to refetch: nothing in it is trusted, so a forged ping just causes a refresh.
//
// A small client for Supabase Realtime's Phoenix protocol over React Native's built-in WebSocket (join, heartbeat,
// broadcast), so the app adds no dependency. One socket, ref-counted channels, reconnect with backoff, closed while
// the app is in the background (the 30 s polling and the refetch on focus cover that gap).
import { AppState } from "react-native";
import { env } from "@/config/env";

export type OathChanged = { oath: string; reason: "proof" | "checkin"; wallet: string | null };
type Listener = (e: OathChanged) => void;

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

const channels = new Map<string, Set<Listener>>();
let ws: WebSocket | null = null;
let ref = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let backoff = 1_000;
// currentState can be null before the first change event; only "background" means closed.
let foreground = AppState.currentState !== "background";

export const realtimeEnabled = () => !!env.supabaseUrl && !!env.supabasePublishableKey;

const topicOf = (oath: string) => `realtime:oath:${oath}`;
const send = (msg: object) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ ...msg, ref: String(++ref) })); };
const join = (oath: string) => send({ topic: topicOf(oath), event: "phx_join", payload: { config: { broadcast: { self: false, ack: false }, presence: { key: "" }, private: false } } });

function connect(): void {
  if (ws || !foreground || channels.size === 0 || !realtimeEnabled()) return;
  const url = `${env.supabaseUrl.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(env.supabasePublishableKey)}&vsn=1.0.0`;
  const socket = new WebSocket(url);
  ws = socket;
  socket.onopen = () => {
    backoff = 1_000;
    for (const oath of channels.keys()) join(oath);
    heartbeat = setInterval(() => send({ topic: "phoenix", event: "heartbeat", payload: {} }), HEARTBEAT_MS);
  };
  socket.onmessage = (m) => {
    let msg: { topic?: string; event?: string; payload?: { event?: string; payload?: { reason?: unknown; wallet?: unknown } } };
    try { msg = JSON.parse(String(m.data)); } catch { return; }
    if (msg.event !== "broadcast" || msg.payload?.event !== "oath_changed" || !msg.topic?.startsWith("realtime:oath:")) return;
    const oath = msg.topic.slice("realtime:oath:".length);
    const p = msg.payload.payload ?? {};
    const e: OathChanged = { oath, reason: p.reason === "checkin" ? "checkin" : "proof", wallet: typeof p.wallet === "string" ? p.wallet : null };
    for (const l of channels.get(oath) ?? []) l(e);
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    teardown();
    if (foreground && channels.size > 0) {
      retry = setTimeout(() => { retry = null; connect(); }, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  };
  socket.onerror = () => socket.close();
}

function teardown(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  ws = null;
}

function disconnect(): void {
  if (retry) clearTimeout(retry);
  retry = null;
  const socket = ws;
  teardown();
  socket?.close();
}

AppState.addEventListener("change", (state) => {
  foreground = state !== "background";
  if (foreground) connect();
  else disconnect();
});

/** Calls `listener` whenever the backend says Oath `oath` changed. Returns the unsubscribe function. */
export function subscribeOath(oath: string, listener: Listener): () => void {
  if (!realtimeEnabled()) return () => undefined;
  let set = channels.get(oath);
  if (!set) {
    set = new Set();
    channels.set(oath, set);
    if (ws) join(oath);
  }
  set.add(listener);
  connect();
  return () => {
    const s = channels.get(oath);
    if (!s) return;
    s.delete(listener);
    if (s.size > 0) return;
    channels.delete(oath);
    send({ topic: topicOf(oath), event: "phx_leave", payload: {} });
    if (channels.size === 0) disconnect();
  };
}

/** Announce each change once even when several screens listen to the same Oath. */
const announced = new Map<string, number>();
export function firstToAnnounce(e: OathChanged, nowMs: number): boolean {
  const key = `${e.oath}:${e.reason}:${e.wallet}`;
  const last = announced.get(key);
  if (last !== undefined && nowMs - last < 5_000) return false;
  announced.set(key, nowMs);
  return true;
}
