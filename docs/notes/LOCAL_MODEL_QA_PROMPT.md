# Local Model QA Prompt

```text
Act as a QA tester for the local AI model checks in the KEPT Android app. Your task is to determine whether the model download and on-device proof-check flow work, and report any issues. Do not modify code or fix issues.

Project: /Users/voidmain/Documents/KEPT - DAPP/Kept-main

Start by reading the project's AGENTS.md and tracing the current implementation in the frontend, especially the kept-gesture module, model download gate, and Live proof flow. Use the code to identify the expected model, download source, integrity checks, supported devices, and expected proof behavior. Don't assume the UI or model is working just because the code is present.

Test on a supported physical 64-bit Android device if available. The Android emulator may not support this native inference module; if you only have an emulator, report that device limitation clearly and do not count an unrun inference check as a pass.

Check these cases:

1. On first launch, Live mode explains that the model is required and offers a download. Confirm the user cannot enter the Live proof flow without accepting and completing the download. Confirm Demo mode still works without downloading the model.
2. Download the model. Record the download's progress, final size, storage location, and whether the configured size/hash checks pass. Check what happens after an interrupted download, app restart, insufficient storage, and a failed or corrupted download.
3. Confirm the downloaded model is reused on the next launch instead of downloaded again, and that the app can detect a missing or invalid model.
4. Run the local checks on a valid proof image and on unsuitable images. Confirm the native MediaPipe/Gemma path actually runs on-device and produces the expected verdicts. Capture relevant logs and errors; don't infer success from the screen alone.
5. Complete the two-photo proof flow. Confirm photo one is checked locally, photo two remains unavailable until the required wait expires, and the flow recovers sensibly if the app is closed and reopened during the wait.
6. Inspect network activity during model download and proof submission. Report which data goes to the server and whether inference itself is performed locally. Do not expose wallet secrets, private keys, or personal data in the report.
7. Check failure states: no network during download, native module unavailable, inference error, and backend rejection after a local verdict. Report whether the app shows a useful error and allows a reasonable retry.

For every check, report:
- PASS, FAIL, or NOT RUN
- Device model, Android version, app build/commit, and whether the device is physical or an emulator
- Steps performed and observed result
- Relevant sanitized logs, HTTP status codes, screenshots, or screen names as evidence
- Exact reproduction steps for each failure
- Whether the issue appears to be in the app flow, native model module, device compatibility, or backend handoff

Do not report a check as passed unless you observed it working. Separate confirmed bugs from unverified assumptions and device limitations. Finish with a short list of launch-blocking issues and the next checks that require a supported physical device.
```
