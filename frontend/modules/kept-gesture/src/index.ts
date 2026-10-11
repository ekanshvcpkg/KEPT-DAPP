import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import { buildVerdict } from "./verdict";
import type { DevicePhotoVerdict, RawDeviceAnalysis } from "./verdict";

export { buildVerdict, canonicalGesture, gestureMatches, parseModelAnswer } from "./verdict";
export type { DevicePhotoVerdict, ModelAnswer, RawDeviceAnalysis } from "./verdict";

export const GEMMA_MODEL_BYTES = 2_588_147_712;
export type DeviceModelsStatus = {
  supported: boolean;
  gestureReady: boolean;
  /** Present, the exact size, and verified (SHA-256 once, then a marker: startup never re-hashes 2.6 GB). */
  visionReady: boolean;
  modelBytes: number;
  /** Bytes of both models already on the phone (finished files and a half-done download); a retry resumes from there. */
  downloadedBytes: number;
  /** Bytes of both models in all. */
  totalBytes: number;
};
export type DownloadProgress = { phase: "downloading" | "verifying"; bytes: number; total: number };

type KeptGestureNative = {
  getModelStatus(): Promise<DeviceModelsStatus>;
  downloadModels(): Promise<DeviceModelsStatus>;
  cancelDownload(): Promise<boolean>;
  prepareScanner(): Promise<boolean>;
  analyze(uri: string, expectedObject: string, expectedGesture: string): Promise<RawDeviceAnalysis>;
  addListener(event: "onDownloadProgress", listener: (p: DownloadProgress) => void): { remove(): void };
};

const Native = Platform.OS === "android" ? (() => { try { return requireNativeModule<KeptGestureNative>("KeptGesture"); } catch { return null; } })() : null;
const ANDROID_ONLY = "On-device proof checking is currently available on Android only.";
const UNSUPPORTED: DeviceModelsStatus = { supported: false, gestureReady: false, visionReady: false, modelBytes: GEMMA_MODEL_BYTES, downloadedBytes: 0, totalBytes: GEMMA_MODEL_BYTES };
export const getDeviceModelsStatus = () => Native?.getModelStatus() ?? Promise.resolve(UNSUPPORTED);
export const downloadDeviceModels = () => Native?.downloadModels() ?? Promise.reject(new Error(ANDROID_ONLY));
/** Stops a running download. What is on disk stays, so the next download picks up from there. */
export const cancelDeviceModelDownload = () => Native?.cancelDownload() ?? Promise.resolve(false);
export const prepareDeviceScanner = () => Native?.prepareScanner() ?? Promise.reject(new Error(ANDROID_ONLY));
export function onDeviceModelProgress(listener: (p: DownloadProgress) => void): () => void {
  const sub = Native?.addListener("onDownloadProgress", listener);
  return () => sub?.remove();
}
/** Runs both models on the phone. The photo never leaves it; only this verdict (with the photo's hash) is sent on. */
export async function analyzeDevicePhoto(uri: string, expectedObject: string, expectedGesture: string): Promise<DevicePhotoVerdict> {
  if (!Native) throw new Error(ANDROID_ONLY);
  return buildVerdict(await Native.analyze(uri, expectedObject, expectedGesture), expectedGesture);
}
