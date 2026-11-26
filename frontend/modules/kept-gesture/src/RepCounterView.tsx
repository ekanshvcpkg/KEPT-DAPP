// The live rep counter camera (docs/notes/REP_COUNTER_CONTRACT.md): a native CameraX preview that streams 12 pose joints
// from MediaPipe. It counts nothing itself: the samples go to the rep engine (packages/engine reps.ts), the same code the
// server replays, so the phone's count and the server's recount agree.
import * as React from "react";
import { Platform, View } from "react-native";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";

export type RepCounterFacing = "front" | "back";
/**
 * One pose sample. `t`: integer ms since the view became active (strictly increasing; from the camera's frame timestamps).
 * `w`,`h`: gravity-upright analysis frame in px (they swap when `rot` changes between portrait and landscape).
 * `rot`: the phone's physical rotation bucket for this frame, degrees clockwise from portrait: 0, 90 (left edge up), 180, 270.
 * `tilt`: integer degrees, -180..179, the phone's exact roll (from gravity) minus `rot`: how far image-down is from
 * gravity-down in this frame. Positive = turned further clockwise than the bucket. The bucket switches only past ±55°, so a
 * phone leaning against a wall can be tens of degrees off: callers should not count while |tilt| is large (RepSet: > 20).
 * 0 when the roll is unknown (no gravity sensor, or the phone has lain flat since the camera started).
 * `p`: 36 integers, for each joint in JOINTS order (11,12,13,14,15,16,23,24,25,26,27,28): round(x*1000), round(y*1000),
 * round(visibility*100), with x,y normalized to the frame (unmirrored, even for the front camera). Empty when no pose.
 */
export type RepPoseEvent = { t: number; w: number; h: number; rot: 0 | 90 | 180 | 270; tilt: number; p: number[] };
export type RepCounterErrorCode = "permission" | "camera" | "model" | "internal";
export type RepCounterErrorEvent = { code: RepCounterErrorCode; message: string };
/** The latest analysed frame: JPEG (longest side ≤ 640 px, quality 80) as base64 without a data: prefix, its SHA-256 hex, its `t`. */
export type RepCapture = { jpeg: string; sha256: string; t: number };
export type RepCounterHandle = { capture(): Promise<RepCapture> };

export type RepCounterViewProps = ViewProps & {
  /**
   * The camera is bound while true. Turning it on again starts a new activation (`t` restarts at 0, onReady again). A
   * detach/re-attach while it stays true keeps the activation: `t` goes on, no second onReady.
   */
  active: boolean;
  /** Default "front". */
  facing?: RepCounterFacing;
  /** Minimum ms between pose samples. Default 50 (20 Hz); the frame rate may make it coarser. */
  sampleIntervalMs?: number;
  /** The camera and the landmarker are running: once per activation, and again after an onError("camera") once frames flow again. */
  onReady?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onPose?: (event: NativeSyntheticEvent<RepPoseEvent>) => void;
  /** Each code at most once per activation ("camera" again after it recovered; "model" is retried once per activation). */
  onError?: (event: NativeSyntheticEvent<RepCounterErrorEvent>) => void;
};

type NativeHandle = { capture?: () => Promise<RepCapture> };
type NativeProps = RepCounterViewProps & { ref?: React.Ref<NativeHandle> };
type ExpoGlobal = { expo?: { getViewConfig?: (moduleName: string, viewName?: string) => unknown } };
type KeptGestureNative = { ViewPrototypes?: Record<string, { capture?: unknown } | undefined> };

const MODULE = "KeptGesture";
const UNAVAILABLE = "The live rep counter is available on Android only.";
const NOT_MOUNTED = "The rep counter is not mounted yet.";

/**
 * Decided once, up front: the native view exists only if the KeptGesture module is installed, registers this view (its
 * view config) and exposes capture() on the view prototype. requireNativeViewManager itself never throws for a missing
 * view; it would only fail when rendered.
 */
function nativeViewAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    const mod = requireOptionalNativeModule<KeptGestureNative>(MODULE);
    if (typeof mod?.ViewPrototypes?.[MODULE]?.capture !== "function") return false;
    const getViewConfig = (globalThis as ExpoGlobal).expo?.getViewConfig;
    return typeof getViewConfig !== "function" || getViewConfig(MODULE) != null;
  } catch {
    return false;
  }
}

const NativeRepCounter: React.ComponentType<NativeProps> | null = nativeViewAvailable()
  ? requireNativeViewManager<NativeProps>(MODULE)
  : null;

/** Off Android, or without the native view: a plain View, and capture() rejects. */
const Fallback = React.forwardRef<RepCounterHandle, RepCounterViewProps>(function RepCounterFallback(props, ref) {
  React.useImperativeHandle(ref, () => ({ capture: () => Promise.reject(new Error(UNAVAILABLE)) }), []);
  const { active: _active, facing: _facing, sampleIntervalMs: _interval, onReady: _onReady, onPose: _onPose, onError: _onError, ...viewProps } = props;
  return <View {...viewProps} />;
});

/** capture() is a native view function on the Expo component's prototype; the handle guards it (rejects, never throws). */
export const RepCounterView = NativeRepCounter
  ? React.forwardRef<RepCounterHandle, RepCounterViewProps>(function RepCounterView(props, ref) {
    const native = React.useRef<NativeHandle | null>(null);
    React.useImperativeHandle(ref, () => ({
      capture: () => {
        const view = native.current;
        if (typeof view?.capture !== "function") return Promise.reject(new Error(NOT_MOUNTED));
        try {
          return view.capture();
        } catch (e) {
          return Promise.reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    }), []);
    return <NativeRepCounter {...props} ref={native} />;
  })
  : Fallback;
