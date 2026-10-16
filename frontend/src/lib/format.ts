// Formatting at the edge. Amounts arrive as bigint base units and are only turned into text here.
import { SKR_DECIMALS, SKR_UNIT, SOL_DECIMALS } from "@kept/config";

/**
 * 1234567n → "1,234,567". By hand: Hermes' Intl.NumberFormat throws on BigInt ("Cannot convert
 * BigInt to number"), unlike Node, so Jest never saw it.
 */
const groupBig = (n: bigint): string => groupDigits(n.toString());
/** "1234567" → "1,234,567" (a run of digits; safe on the UI thread and in Hermes). */
export const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const grouped = { format: (n: number | bigint) => groupBig(typeof n === "bigint" ? n : BigInt(Math.round(n))) };

/** 1_043_000_000n → "1,043"; 779_166_667n → "779.17" (2 dp only when not whole, rounded half-up). */
export function formatSkr(units: bigint, opts: { dp?: 0 | 2 | "auto"; sign?: boolean } = {}): string {
  const dp = opts.dp ?? "auto";
  const neg = units < 0n;
  const abs = neg ? -units : units;
  let body: string;
  if (dp === 0) {
    body = grouped.format((abs + SKR_UNIT / 2n) / SKR_UNIT);
  } else {
    const cents = (abs * 100n + SKR_UNIT / 2n) / SKR_UNIT; // whole hundredths, half-up
    const frac = Number(cents % 100n);
    body = grouped.format(cents / 100n) + (dp === 2 || frac !== 0 ? "." + String(frac).padStart(2, "0") : "");
  }
  // Design uses the true minus sign "−" (U+2212) for losses.
  const prefix = neg ? "−" : opts.sign && units > 0n ? "+" : "";
  return prefix + body;
}


/** "≈ $10" from base units and the price API's usdPerSkr. */
export function formatUsd(units: bigint, usdPerSkr: number): string {
  const usd = (Number(units) / 10 ** SKR_DECIMALS) * usdPerSkr;
  return "≈ $" + (usd >= 100 ? grouped.format(Math.round(usd)) : usd.toFixed(usd % 1 === 0 ? 0 : 2));
}

/** "≈ $42.80" from native lamports and the price API's usdPerSol. */
export function formatUsdSol(lamports: bigint, usdPerSol: number): string {
  const usd = (Number(lamports) / 10 ** SOL_DECIMALS) * usdPerSol;
  return "≈ $" + (usd >= 100 ? grouped.format(Math.round(usd)) : usd.toFixed(usd % 1 === 0 ? 0 : 2));
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** 33522 → "09:18:42" (B1 "resets in"). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}
/** 33522 → "9h 18m"; 600 → "10m"; 601200 → "6d 23h" (card tags, D2, Rematch windows). */
export function shortDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
/** 147600 → "41h" (G1: a 48-hour review window is counted in hours). */
export const hoursLeft = (seconds: number): string => `${Math.floor(Math.max(0, seconds) / 3600)}h`;
/** Seconds since → "20m", "2h", "3d" (inbox times). */
export function ago(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
/** Lamports → "0.84", "0.000005", "1" (SOL amounts, no trailing zeros). */
export function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
