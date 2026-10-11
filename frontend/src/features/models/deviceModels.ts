// The on-device proof models (kept-gesture): what the Live gate asks, and the download that fills it.
// The native side resumes a half-done download by itself; this hook only drives it and shows its progress.
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelDeviceModelDownload, downloadDeviceModels, getDeviceModelsStatus, onDeviceModelProgress, prepareDeviceScanner } from "kept-gesture";
import type { DeviceModelsStatus } from "kept-gesture";

export const modelsReady = (s: DeviceModelsStatus) => s.supported && s.gestureReady && s.visionReady;

export type ModelDownloadState = {
  phase: "idle" | "downloading" | "verifying";
  /** Both models together while downloading; the file being checked while verifying. */
  bytes: number;
  total: number;
  /** What is already on the phone from an earlier attempt: the primary button then says "Resume". */
  resumeBytes: number;
  error: "storage" | "failed" | null;
};

const IDLE: ModelDownloadState = { phase: "idle", bytes: 0, total: 0, resumeBytes: 0, error: null };

export const downloadError = (e: unknown): "storage" | "failed" => (/free up|storage|space/i.test(e instanceof Error ? e.message : String(e)) ? "storage" : "failed");

/**
 * Downloads (or resumes) the models, then warms the scanner and calls `onReady`. Pausing stops the transfer and
 * keeps the partial files; leaving the screen does the same.
 */
export function useModelDownload(onReady: () => void | Promise<void>) {
  const [state, setState] = useState<ModelDownloadState>(IDLE);
  const running = useRef(false);
  const paused = useRef(false);
  const alive = useRef(true);
  const ready = useRef(onReady);
  useEffect(() => { ready.current = onReady; }, [onReady]);
  const set = useCallback((p: Partial<ModelDownloadState>) => { if (alive.current) setState((s) => ({ ...s, ...p })); }, []);

  useEffect(() => {
    alive.current = true;
    void getDeviceModelsStatus().then((s) => set({ resumeBytes: s.downloadedBytes }), () => {});
    return () => {
      alive.current = false;
      if (running.current) { paused.current = true; void cancelDeviceModelDownload(); }
    };
  }, [set]);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    paused.current = false;
    set({ phase: "downloading", error: null, bytes: 0, total: 0 });
    const off = onDeviceModelProgress((p) => set({ phase: p.phase, bytes: p.bytes, total: p.total }));
    try {
      const status = await downloadDeviceModels();
      if (!modelsReady(status)) {
        // Paused: not a failure, the partial files stay and the button turns into Resume.
        if (paused.current) { set({ phase: "idle", resumeBytes: status.downloadedBytes }); return; }
        throw new Error("The models are not ready");
      }
      await prepareDeviceScanner();
      set({ phase: "idle" });
      await ready.current();
    } catch (e) {
      const status = await getDeviceModelsStatus().catch(() => null);
      set({ phase: "idle", error: paused.current ? null : downloadError(e), ...(status ? { resumeBytes: status.downloadedBytes } : {}) });
    } finally {
      off();
      running.current = false;
    }
  }, [set]);

  const pause = useCallback(() => { paused.current = true; void cancelDeviceModelDownload(); }, []);
  return { ...state, busy: state.phase !== "idle", start, pause };
}
