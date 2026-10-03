# Dub Rehearsal Implementation Plan

> **For agentic workers:** Use Superpowers' executing-plans workflow for this plan. Steps use checkbox syntax for tracking.

**Goal:** A local browser rehearsal that imports a legacy Dub pack, records and retakes each line, plays the scene, and exports a subtitled video.

**Architecture:** A React shell owns the user flow. Pure TypeScript modules parse pack metadata and build the timeline. Browser media APIs record and render locally; any unsupported legacy video gets a clear diagnostic until the later mobile conversion path is implemented.

**Tech Stack:** React, TypeScript, Vite, JSZip, Vitest, Web Audio, MediaRecorder, Canvas.

---

## File map

- `src/pack/metadata.ts`: parse the legacy `[data]` key/value and list syntax.
- `src/pack/import.ts`: normalize ZIP and folder input, identify the Dub video, audio, captions, timestamps, characters, backing track, and author.
- `src/pack/types.ts`: `DubPack`, `DubLine`, validation issue types.
- `src/media/recording.ts`: microphone capture and line recording lifecycle.
- `src/media/render.ts`: scene playback/export with chosen takes, backing track, subtitles, and credits.
- `src/App.tsx`: import, validation, cast/line navigation, rehearsal, showcase, export.
- `src/styles.css`: responsive visual design and states.
- `tests/metadata.test.ts`, `tests/import.test.ts`, `tests/timeline.test.ts`: meaningful parser and timeline cases.
- `scripts/make-demo-pack.sh`: generate original synthetic test media with FFmpeg; no third-party assets.

## Tasks

### 1. Project foundation

- [ ] Create a Vite React TypeScript app with `dev`, `build`, `test`, and `preview` scripts.
- [ ] Install and pin React, React DOM, JSZip, Vite, TypeScript, Vitest, and type packages.
- [ ] Add a short README for local start, browser requirements, and independent-project status.
- [ ] Verify `npm run build` succeeds.

### 2. Legacy pack parser

- [ ] Define typed `DubPack` and `DubLine` models with timestamps in seconds and file blobs retained locally.
- [ ] Test metadata parsing for CRLF, `[data]`, quoted strings, comma-separated string lists, numeric timestamp lists, and malformed values.
- [ ] Implement metadata parsing and pass its tests.
- [ ] Test ZIP/root-folder normalization, `dub_video.ogv`, matching clip metadata, multiple timestamps, optional backing track, and validation errors.
- [ ] Implement ZIP and folder import without uploading the pack. Reject path traversal and unrelated files, and show exact missing file names.
- [ ] Verify parser tests and a build pass.

### 3. Rehearsal UI and recording

- [ ] Build a responsive import screen, pack summary, line navigator, reference player, caption and character view.
- [ ] Ask the browser for microphone access only when recording starts.
- [ ] Record one line at a time, stop cleanly, allow playback, retake, and choosing the active take.
- [ ] Revoke object URLs and stop microphone tracks on pack change or unmount.
- [ ] Verify the flow manually with a synthetic pack in a desktop browser.

### 4. Scene playback and export

- [ ] Test timeline ordering and caption visibility against timestamp and clip duration.
- [ ] Implement scene playback with the included video, optional backing track, selected takes, and original clips for unrecorded lines.
- [ ] Render subtitles and pack creator credits onto a canvas, mix audio with Web Audio, and export using a browser-supported MediaRecorder MIME type.
- [ ] Give a specific compatibility message if the browser cannot decode the pack's OGV video or export the scene.
- [ ] Verify generated export can be opened and its duration, sound, subtitles, and credits are correct.

### 5. Stage review

- [ ] Run `npm test` and `npm run build`.
- [ ] Import a real authorized legacy pack to validate metadata assumptions before claiming broad compatibility.
- [ ] Record observed desktop and phone browser differences for the later conversion work.

## Acceptance

One person can load a valid Dub pack, record and replay each prompted line, retake it, play the mixed scene, and download a video. Invalid packs receive actionable diagnostics. No pack or recording leaves the browser in this stage.

## Known risk

The original game's OGV video uses Theora. Browser support varies, especially on phones. Public beta compatibility will require a conversion path; this stage must expose that limitation honestly and measure it before choosing the server implementation.
