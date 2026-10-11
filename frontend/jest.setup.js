/* global jest */
// Reanimated 4 + worklets in Jest: use the mocks both packages ship, then Reanimated's test helpers.
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  // The shipped mock leaves out useReducedMotion ("ADD ME IF NEEDED"). Tests run with Reduce Motion on, so
  // every component renders its end state and no count-up or loop schedules frames.
  // useFrameCallback isn't in the mock either (the parametric Keeper drives its frames with it).
  const useFrameCallback = () => ({ setActive: () => {}, isActive: false, callbackId: -1 });
  return { ...mock, useReducedMotion: () => true, useFrameCallback };
});

// Native modules the Phase 2 shell touches.
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("@solana-mobile/mobile-wallet-adapter-protocol-web3js", () => ({ transact: jest.fn(() => Promise.reject(new Error("MWA is not available in tests"))) }));
// expo-secure-store: an in-memory Keystore (tests read it back through `__store`).
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k) => { store.delete(k); }),
  };
});
// The Keystore's native side exists in tests (lib/secureStore asks before importing the package).
jest.mock("expo", () => {
  const actual = jest.requireActual("expo");
  return { ...actual, requireOptionalNativeModule: (name) => (name === "ExpoSecureStore" ? {} : actual.requireOptionalNativeModule(name)) };
});
// expo-camera: a preview that "takes" a fixed picture, and permission already granted.
jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  const CameraView = React.forwardRef(function CameraView(props, ref) {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ base64: "aW1hZ2U=", uri: "file://photo.jpg" }) }));
    return React.createElement(View, { testID: "camera-preview" });
  });
  const granted = { granted: true, status: "granted", canAskAgain: true, expires: "never" };
  return { CameraView, useCameraPermissions: () => [granted, async () => granted, async () => granted] };
});

// kept-gesture: the native on-device models don't exist in Jest. The pure parts (reading the model's answer, matching
// the gesture) are the real code; the native calls answer "ready" and "passed" unless a test says otherwise.
jest.mock("kept-gesture", () => {
  const verdict = jest.requireActual("kept-gesture/src/verdict");
  const ready = { supported: true, gestureReady: true, visionReady: true, modelBytes: 2588147712, downloadedBytes: 2596521152, totalBytes: 2596521152 };
  return {
    ...verdict,
    GEMMA_MODEL_BYTES: 2588147712,
    getDeviceModelsStatus: jest.fn(async () => ready),
    downloadDeviceModels: jest.fn(async () => ready),
    cancelDeviceModelDownload: jest.fn(async () => false),
    prepareDeviceScanner: jest.fn(async () => true),
    onDeviceModelProgress: jest.fn(() => () => {}),
    analyzeDevicePhoto: jest.fn(async (_uri, _object, gesture) => verdict.buildVerdict(
      { proofHash: "a".repeat(64), gestureSeen: "Thumb_Up", modelText: '{"objectPresent":true,"objectConfidence":0.9,"looksLikeScreenOrPrintout":false,"reason":"ok"}', model: "test", ms: 1 }, gesture)),
  };
});

// Screens mount their content at once: there are no native transitions to wait for (lib/screenReady).
require("./src/lib/screenReady").setScreenDeferral(false);
