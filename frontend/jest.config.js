/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.js"],
  // @solana/* ship ESM-only .mjs builds for the react-native export condition.
  transform: { "^.+\\.mjs$": "babel-jest" },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Its exports map has only browser/node conditions; Metro picks the browser build, so do the same.
    "^rpc-websockets$": require("path").join(require.resolve("rpc-websockets"), "..", "index.browser.cjs"),
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-reanimated|react-native-worklets|@kept/.*|kept-gesture|@solana/.*|@solana-mobile/.*|@noble/.*|@tanstack/.*|uuid|jayson|rpc-websockets|superstruct)",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/android/"],
};
