# Web-Based Choicer Voicer: Complete Technical Specification & Implementation Plan

## 1. Executive Summary & Product Vision
An online, browser-based recreation of **The Choicer Voicer** (inspired by the classic Mario Party minigame *The Choicest Voice*). The platform enables players to perform vocal impressions and dub scenes, receive real-time algorithmic judging, play in multiplayer party lobbies using 4-character room codes, and access an integrated marketplace of downloadable community voice packs and dub scenes.

### Core Pillars
1. **Zero-Install Web Accessibility:** Fully playable on desktop and mobile web browsers with Web Audio API microphone capture.
2. **Backward-Compatible Mod Engine:** Native parsing of existing desktop Choicer Voicer packs (`packs_voice/`) and video dub packs.
3. **Multiplayer Lobbies:** Real-time synchronized party rooms with host controls, room codes, live spectator voting, and turn-based / simultaneous impression rounds.
4. **DSP Voice Evaluation Engine:** Intelligent pitch contour and rhythm tracking (overcoming the volume/gain exploit of older engines).
5. **Integrated Pack Marketplace:** One-click lobby loading for community packs from an internal registry and direct integration with GameBanana's public API.

---

## 2. Choicer Voicer Pack Format & Ingestion Engine

### 2.1 File & Directory Specification
The platform strictly follows the established community layout:

#### Standard Voice Pack (`packs_voice/<pack_name>/`)
* `_author.txt`: Pack creator attribution.
* `_subtitle.txt`: Pack description and flavor text.
* `_pack_filler_image.[png|jpg|webp]`: Default fallback artwork for clips lacking individual images.
* `<clip_name>.[wav|mp3|ogg]`: Target audio line (priority order: `WAV > MP3 > OGG`).
* `<clip_name>.txt`: Subtitle/caption text for the line.
* `<clip_name>.[png|jpg|webp]`: Specific character portrait or prompt artwork.
* Sub-folders: Parsed as nested sub-packs / categories.

#### Dub Mode Pack (`packs_voice/<dub_pack_name>/`)
* `dub_video.[mp4|webm|ogv]`: The video clip to be dubbed.
* `_backing_track.[wav|mp3|ogg]`: Background music/SFX track with original dialogue removed.
* Metadata (`dub_meta.json` or `.txt` timing files):
  * Start and end timestamps (in milliseconds).
  * Character assignments (e.g., `Character: Narrator`, `Character: Hero`).
  * `dub_only` flag (restricts clip to Dub Mode only).

### 2.2 Ingestion & Local Processing
* **Client-Side ZIP Extraction:** Uses `JSZip` in a Web Worker to extract `.zip` files in-memory without server upload overhead.
* **Directory Drag-and-Drop:** Leverages the File System Access API (`showDirectoryPicker()`) or `<input webkitdirectory>` to read local `packs_voice` folders directly.
* **Audio & Video Decoding:**
  * Audio is decoded into PCM `AudioBuffer` objects via `AudioContext.decodeAudioData()`.
  * Fallback video transcoding/muxing via WebCodecs / HTML5 `<video>`.

---

## 3. Game Modes & Multiplayer Loop

```
[ Lobby Creation (4-Letter Code) ]
               │
               ▼
[ Pack & Game Mode Selection ]
               │
      ┌────────┴────────┐
      ▼                 ▼
[ Classic Mode ]   [ Dub Mode ]
      │                 │
      ▼                 ▼
- Target Clip Play   - Character Role Draft
- 3-2-1 Countdown    - Line-by-Line Recording
- Vocal Performance  - Theater Playback Sync
- Algorithmic Judge  - WebM Video Export
- Leaderboard Update │
      │                 │
      └────────┬────────┘
               ▼
   [ Match Podium & Review ]
```

### 3.1 Classic Mode (Voice Impression Showdown)
1. **Prompt Phase:** The host selects or randomizes a clip. The reference audio plays alongside the subtitle and portrait.
2. **Performance Phase:**
   * **Simultaneous Mode (Party):** All players record their takes at the same time to a synchronized countdown clock.
   * **Turn-Based Mode (Showcase):** Players take turns performing live while other lobby members listen and react with emojis.
3. **Scoring & Judging:** Scores (0–100) are generated via DSP similarity. Animated judge sprites present commentary based on score bands (<40: Brutal, 40–75: Fair, >75: Impressed).

### 3.2 Collaborative Dub Mode
1. **Casting Call:** Players draft characters in the scene.
2. **Timed Recording:** Each player records their lines against the video preview and visual cues.
3. **Dub Theater Showcase:** The room watches the completed video in sync:
   * Video plays with `_backing_track` playing underneath.
   * Player recordings are injected at exact cue timestamps. Unassigned roles retain original audio.
4. **Export:** Players can render and download the scene as a video file using client-side `MediaRecorder`.

---

## 4. Digital Signal Processing (DSP) Voice Scoring Engine

To prevent users from gaming the scoring by yelling into the microphone, a normalized multi-factor DSP evaluation pipeline is utilized:

```
Reference PCM ──┐
                ├─► [ Bandpass & RMS Normalization ] ──► [ Voice Activity Detection ]
Player PCM    ──┘                     │
                                      ▼
           ┌──────────────────────────┴──────────────────────────┐
           ▼                                                     ▼
 [ Pitch Tracking (pYIN) ]                             [ Cadence & Rhythm (DTW) ]
  • Relative semitone contour                           • Energy envelope matching
  • Key/octave invariance                               • Pause & syllable alignment
           │                                                     │
           └──────────────────────────┬──────────────────────────┘
                                      ▼
                      [ Timbre Resemblance (MFCC) ]
                       • 13-coefficient spectral flux
                                      │
                                      ▼
                       Final Score: 0 - 100 Points
```

* **Pitch Accuracy (40%):** Extracts the fundamental frequency ($F_0$) curve using the **pYIN algorithm**. Computes relative pitch trajectories to accommodate male, female, and child vocal ranges without octave penalties.
* **Cadence & Rhythm (35%):** Applies **Dynamic Time Warping (DTW)** on the RMS energy envelope to score speech timing, pause lengths, and syllable pacing.
* **Acoustic Timbre (25%):** 13-band Mel-Frequency Cepstral Coefficients (MFCC) to compare vocal resonance and tone.

---

## 5. Pack Marketplace & Community Hub

### 5.1 Dual-Source Distribution Model
1. **Native Verified Registry:**
   * Curated starter packs and verified original community submissions.
   * Hosted on Cloudflare R2 (zero egress fees) fronted by Cloudflare CDN for fast range-request downloads.
2. **GameBanana API Integration:**
   * Direct bridge to [GameBanana's The Choicer Voicer Section (#20674)](https://gamebanana.com/games/20674) using their public REST API (`/apiv11/`).
   * Gives instant access to existing community compilation packs, dub mode scenes, and custom judges.

### 5.2 Marketplace Features
* **In-Game Browser:** Search by keywords, language, pack type (Classic vs. Dub), character count, and duration.
* **Interactive Previews:** Audio waveform listener and 5-second video teaser previews before downloading.
* **One-Click Lobby Sync:** Host clicks "Load Pack"; the server coordinates streaming the assets to all lobby participants.
* **Browser Caching:** Packs are stored locally in IndexedDB to eliminate duplicate downloads.
* **Web Pack Studio:** Built-in validator that verifies ZIP structure, validates audio levels, tests video codec compatibility, and checks subtitle files before publishing.

---

## 6. System Architecture & Networking

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client Layer (Browser)                     │
│  React 19 + TypeScript + Vite │ TailwindCSS │ Web Audio API     │
└─────────────────┬─────────────────────────────┬─────────────────┘
                  │ WebSocket                   │ WebRTC
                  ▼                             ▼
┌──────────────────────────────────┐  ┌───────────────────────────┐
│       Signaling & State API      │  │      P2P Audio Relay      │
│  Fastify / Hono + Socket.io      │  │  Low-latency voice takes  │
│  Redis (Ephemeral Lobby Cache)   │  │  WebRTC DataChannels      │
└─────────────────┬────────────────┘  └───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Storage & Marketplace Layer                   │
│  Cloudflare R2 (Pack Assets) │ GameBanana API Gateway           │
└─────────────────────────────────────────────────────────────────┘
```

### 6.1 State Management & Latency Compensation
* **Room State Machine:** Centralized server-authoritative state machine broadcasting state transitions (`LOBBY` -> `PROMPT` -> `RECORDING` -> `SCORING` -> `PLAYBACK`).
* **NTP Time Synchronization:** Clients synchronize their clocks with the server (`serverTimeOffset = Date.now() - clientTime`) to ensure countdowns and video playback are frame-accurate across devices.
* **Ephemeral Data:** Audio takes are stored in temporary browser memory or cleared immediately when a match finishes to respect user privacy.

---

## 7. Implementation Roadmap

### Phase 1: Core Audio Engine & Pack Parser (Weeks 1–3)
- [ ] Implement `WebAudioEngine` for microphone input capture, gain normalization, and VAD.
- [ ] Build the client-side `PackLoader` supporting ZIP extraction (`JSZip`) and local directory picking.
- [ ] Implement the DSP scoring module (pYIN pitch tracking, DTW rhythm matching, and MFCC cosine similarity).
- [ ] Create single-player offline mode to validate audio analysis and scoring accuracy.

### Phase 2: Real-Time Lobby & Classic Multiplayer (Weeks 4–6)
- [ ] Develop WebSocket backend for room creation (4-letter codes), host controls, and player presence.
- [ ] Implement turn-based and simultaneous Classic Impression rounds.
- [ ] Build WebRTC DataChannel transfer for exchanging recorded audio snippets between players.
- [ ] Build animated Judge UI with reactive score animations and humorous evaluation dialogue.

### Phase 3: Collaborative Dub Mode & Video Synchronization (Weeks 7–9)
- [ ] Implement multi-track Web Audio mixer combining video visual feed, `_backing_track`, and player recordings at timestamp cues.
- [ ] Build character selection lobby for multi-character dub packs.
- [ ] Implement Dub Theater synchronized video player with live emoji reactions.
- [ ] Add in-browser video compilation and export (`MediaRecorder` / `ffmpeg.wasm`).

### Phase 4: Marketplace, GameBanana Integration, & Creator Studio (Weeks 10–12)
- [ ] Build in-game Marketplace UI with search, category filters, and audio/video preview players.
- [ ] Integrate GameBanana REST API gateway to query and download existing community mods.
- [ ] Implement IndexedDB pack cache for fast reloads without re-downloading.
- [ ] Launch Web Pack Studio with automated validator (audio loudness, file structure, timestamp syntax) and one-click export.
