// The Live gate's download: progress, pause and resume, errors that keep what was downloaded, and unsupported phones.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { cancelDeviceModelDownload, downloadDeviceModels, getDeviceModelsStatus, onDeviceModelProgress, prepareDeviceScanner } from "kept-gesture";
import type { DeviceModelsStatus, DownloadProgress } from "kept-gesture";
import { t } from "@/copy";
import { ModelGate, formatBytes } from "@/features/models/ModelGate";

const status = (over: Partial<DeviceModelsStatus> = {}): DeviceModelsStatus => ({
  supported: true, gestureReady: false, visionReady: false, modelBytes: 2_588_147_712, downloadedBytes: 0, totalBytes: 2_596_521_152, ...over,
});
const READY = status({ gestureReady: true, visionReady: true, downloadedBytes: 2_596_521_152 });
const mocked = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;

let emit: (p: DownloadProgress) => void;
beforeEach(() => {
  jest.clearAllMocks();
  mocked(onDeviceModelProgress).mockImplementation((l: (p: DownloadProgress) => void) => { emit = l; return () => {}; });
  mocked(getDeviceModelsStatus).mockResolvedValue(status());
  mocked(cancelDeviceModelDownload).mockResolvedValue(true);
  mocked(prepareDeviceScanner).mockResolvedValue(true);
});

const gate = async (props: Partial<React.ComponentProps<typeof ModelGate>> = {}) => {
  const onReady = jest.fn();
  const onLater = jest.fn();
  await render(<ModelGate unsupported={false} onReady={onReady} onLater={onLater} {...props} />);
  return { onReady, onLater };
};
const button = (name: string) => screen.findByRole("button", { name });

describe("model download gate", () => {
  it("explains the download, shows real progress, then hands over once the models are ready", async () => {
    let finish!: (s: DeviceModelsStatus) => void;
    mocked(downloadDeviceModels).mockReturnValue(new Promise((r) => { finish = r; }));
    const { onReady } = await gate();
    expect(screen.getByText(t("additions.mode.modelTitle"))).toBeTruthy();
    await fireEvent.press(await button(t("additions.mode.modelDownload")));
    await act(async () => { emit({ phase: "downloading", bytes: 1_298_260_576, total: 2_596_521_152 }); });
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 50 });
    expect(screen.getByText(t("additions.mode.modelProgress", { done: formatBytes(1_298_260_576), total: formatBytes(2_596_521_152) }))).toBeTruthy();
    await act(async () => { emit({ phase: "verifying", bytes: 1, total: 2 }); });
    expect(screen.getByText(t("additions.mode.modelVerifying"))).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => { finish(READY); });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(prepareDeviceScanner).toHaveBeenCalled();
  });

  it("an interrupted download keeps its progress: the error says so and the button becomes Resume", async () => {
    mocked(downloadDeviceModels).mockRejectedValue(new Error("The download was interrupted (1000 bytes this time). Retry to continue."));
    mocked(getDeviceModelsStatus).mockResolvedValue(status({ downloadedBytes: 900_000_000 }));
    const { onReady } = await gate();
    // Half-done from an earlier run (or an app restart): the gate opens on Resume, not a fresh download.
    expect(screen.queryByRole("button", { name: t("additions.mode.modelDownload") })).toBeNull();
    await fireEvent.press(await button(t("additions.mode.modelResume")));
    expect(await screen.findByText(t("additions.mode.modelDownloadError"))).toBeTruthy();
    expect(await button(t("additions.mode.modelResume"))).toBeTruthy();
    // Resuming runs the same download again (the native side continues from the partial file).
    mocked(downloadDeviceModels).mockResolvedValue(READY);
    await fireEvent.press(await button(t("additions.mode.modelResume")));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(downloadDeviceModels).toHaveBeenCalledTimes(2);
  });

  it("a failed or corrupted download (models still not ready) is an error, never a way in", async () => {
    mocked(downloadDeviceModels).mockResolvedValue(status({ gestureReady: true, visionReady: false }));
    const { onReady } = await gate();
    await fireEvent.press(await button(t("additions.mode.modelDownload")));
    expect(await screen.findByText(t("additions.mode.modelDownloadError"))).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("not enough storage gets its own message", async () => {
    mocked(downloadDeviceModels).mockRejectedValue(new Error("Free up at least 2.85 GB of device storage, then retry the model download."));
    await gate();
    await fireEvent.press(await button(t("additions.mode.modelDownload")));
    expect(await screen.findByText(t("additions.mode.modelStorageError"))).toBeTruthy();
  });

  it("Pause stops the transfer without an error and keeps what was downloaded", async () => {
    let finish!: (s: DeviceModelsStatus) => void;
    mocked(downloadDeviceModels).mockReturnValue(new Promise((r) => { finish = r; }));
    const { onReady } = await gate();
    await fireEvent.press(await button(t("additions.mode.modelDownload")));
    await act(async () => { emit({ phase: "downloading", bytes: 500, total: 1000 }); });
    await fireEvent.press(await button(t("additions.mode.modelPause")));
    expect(cancelDeviceModelDownload).toHaveBeenCalled();
    mocked(getDeviceModelsStatus).mockResolvedValue(status({ downloadedBytes: 500 }));
    await act(async () => { finish(status({ downloadedBytes: 500 })); });
    expect(await button(t("additions.mode.modelResume"))).toBeTruthy();
    expect(screen.queryByText(t("additions.mode.modelDownloadError"))).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("a phone that can't run the models only gets the explanation and a way out", async () => {
    const { onLater } = await gate({ unsupported: true });
    expect(screen.getByText(t("additions.mode.modelUnsupported"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("additions.mode.modelDownload") })).toBeNull();
    await fireEvent.press(await button(t("additions.mode.modelNotNow")));
    expect(onLater).toHaveBeenCalled();
  });
});
