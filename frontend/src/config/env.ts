// Every build-time setting in one place. Expo inlines `process.env.EXPO_PUBLIC_*` only when read with
// this exact dot syntax, so each one is spelled out. The default is the hosted Devnet backend. `||`, not
// `??`: an empty `EXPO_PUBLIC_API_URL=` line in a .env would otherwise leave Live with no server at all.
export type Cluster = "devnet" | "testnet" | "mainnet-beta";

const cluster = (process.env.EXPO_PUBLIC_CLUSTER ?? "devnet") as Cluster;

export const env = {
  /** Override with http://localhost:3000 only when intentionally using the local API. */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || "https://kepttestapp.onrender.com").replace(/\/$/, ""),
  cluster,
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
  programId: process.env.EXPO_PUBLIC_PROGRAM_ID ?? "6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh",
  stakeMint: process.env.EXPO_PUBLIC_STAKE_MINT ?? "",
  /** Day length for new Oaths: 86400, or 120 with a debug program build for fast testing (BACKEND_GAPS P2-4). */
  daySeconds: Number(process.env.EXPO_PUBLIC_DAY_SECONDS ?? "86400"),
  /** Perf measurement only (scripts/perf.mts): every Keeper holds its still pose. */
  keeperStill: process.env.EXPO_PUBLIC_KEEPER_STILL === "1",
  /** MWA app identity shown by the wallet. The URI should serve /.well-known/assetlinks.json. */
  identity: {
    name: process.env.EXPO_PUBLIC_APP_IDENTITY_NAME || "KEPT",
    uri: process.env.EXPO_PUBLIC_APP_IDENTITY_URI || "https://keptdapp.vercel.app",
  },
} as const;

/** Live needs a reachable API: reject local addresses in release builds. */
export const liveConfigured = (url: string = env.apiUrl, dev: boolean = __DEV__): boolean =>
  dev || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.0\.2\.2)(:|\/|$)/.test(url);

export const walletChain = `solana:${env.cluster}` as const;
