// Every build-time setting in one place. Expo inlines `process.env.EXPO_PUBLIC_*` only when read with
// this exact dot syntax, so each one is spelled out. Defaults: KEPT's hosted Devnet backend, program, mint and Supabase
// (public values), so a build without a .env (e.g. CI) works out of the box. `||`, not
// `??`: an empty `EXPO_PUBLIC_API_URL=` line in a .env would otherwise leave Live with no server at all.
type Cluster = "devnet" | "testnet" | "mainnet-beta";

const cluster = (process.env.EXPO_PUBLIC_CLUSTER ?? "devnet") as Cluster;

export const env = {
  /** Override with http://localhost:3000 only when intentionally using the local API. */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || "https://kept-api-vxk8.onrender.com").replace(/\/$/, ""),
  cluster,
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
  programId: process.env.EXPO_PUBLIC_PROGRAM_ID ?? "7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj",
  stakeMint: process.env.EXPO_PUBLIC_STAKE_MINT ?? "CDGRQc6aj7r6Kk41gvzeH2ta7vzL5rAXeogLJm7nkSqu",
  /** Day length for new Oaths: 86400, or 120 with a debug program build for fast testing (BACKEND_GAPS P2-4). */
  daySeconds: Number(process.env.EXPO_PUBLIC_DAY_SECONDS ?? "86400"),
  /** Perf measurement only (scripts/perf.mts): every Keeper holds its still pose. */
  keeperStill: process.env.EXPO_PUBLIC_KEEPER_STILL === "1",
  /** MWA app identity shown by the wallet. The URI should serve /.well-known/assetlinks.json. */
  /** Supabase project URL: the Keeper's receipts are public files there (bucket keeper-receipts); empty = backend only. */
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL || "https://bfcmapfznufzfbiyvcmx.supabase.co").replace(/\/$/, ""),
  /** Supabase publishable key (public by design): live Oath updates over Supabase Realtime. Empty = polling only. */
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_bE54B6bmkBU5IiJF9Cp_nQ_6k_bRZU0",
  identity: {
    name: process.env.EXPO_PUBLIC_APP_IDENTITY_NAME || "KEPT",
    // The identity every wallet accepts today; Settings › "Wallet identity: KEPT's own site" switches to kept-keeper.vercel.app.
    uri: process.env.EXPO_PUBLIC_APP_IDENTITY_URI || "https://keptdapp.vercel.app",
    /** Set to 1 once the identity site's assetlinks.json grants get_login_creds (wallets then re-authorize silently). */
    verified: process.env.EXPO_PUBLIC_APP_IDENTITY_VERIFIED === "1",
  },
} as const;

/** Live native-SOL Oath transactions stay off until the matching API and program have both been deployed. */
/** On unless a build turns it off with EXPO_PUBLIC_LIVE_NATIVE_SOL_OATHS=0 (our program on Devnet supports native SOL). */
export const liveNativeSolOathsEnabled = (): boolean => process.env.EXPO_PUBLIC_LIVE_NATIVE_SOL_OATHS !== "0";

/** Live needs a reachable API: reject local addresses in release builds. */
export const liveConfigured = (url: string = env.apiUrl, dev: boolean = __DEV__): boolean =>
  dev || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.0\.2\.2)(:|\/|$)/.test(url);

export const walletChain = `solana:${env.cluster}` as const;

/** HTTPS invite URL uses the app identity host so Android can verify and open it as an App Link. */
export const inviteUrl = (code: string): string => `${env.identity.uri.replace(/\/$/, "")}/o/${encodeURIComponent(code)}`;
