# Webby Voicer — Figma handoff

**Start here:** [Visual wireframe PDF](../../output/pdf/webby-voicer-visual-wireframes.pdf) · [editable TikZ source](FIGMA_RIVE_WIREFRAMES.tex). It puts each page's desktop and phone draft beside its specifications. It also includes a reusable component board and a Rive animation storyboard. The [detailed written specification](../../output/pdf/webby-voicer-figma-rive-handoff.pdf) is a companion reference; this page is a quick index.

Design for **Dub Mode public beta** on desktop and phone. Classic Mode is later. The visual style can change completely; the screens below describe the behavior and content the app needs.

## Pages and key states

| Priority | Page | What the player needs to do | States to draw |
| --- | --- | --- | --- |
| 1 | Start | Choose Try demo, import a ZIP/folder, join by six-character code, or browse packs | Empty, loading, import error |
| 1 | Pack market | Browse starter picks and latest GameBanana Dub packs; open the original creator page to get a pack | Loading, empty, API error, pagination, mature label |
| 1 | Pack ready | See title, creator, subtitle, icon, cast, duration/line count; start solo or host a room | Video ready, OGV conversion needed, converting, failed |
| 1 | Solo rehearsal | See reference video and line image, choose a line, hear the original, record, listen, retake, play the mixed scene, export | Unrecorded, recording, saved, mic error, playing, exporting |
| 1 | Create/join room | Enter display name; join as performer or spectator; create from a local pack or join by code | Invalid code, full room, locked room, reconnecting |
| 1 | Room lobby | See code/share action, cast and spectators; claim a role; host can assign roles, lock room, choose turns or simultaneous, enable reactions/voting, start | Host, performer, spectator, unclaimed/claimed roles |
| 1 | Room recording | Follow the current line or see all assigned lines; hear original, record/retake, submit; host can advance/start showcase | My turn, waiting, submitted, disconnected, no mic |
| 1 | Showcase | Watch the finished video together; react or vote if host enabled them; performers can export | Countdown, playing, ended, export progress; spectator without download |
| 1 | Room ended/error | Explain ended/expired room and return to start | Host ended, inactivity expiry, connection failure |

The market is a discovery surface. Every GameBanana item links to its source page; the beta does not mirror or accept submissions. There is no account screen. Up to eight performers may join, plus spectators.

## Reusable Figma components

- **Navigation:** brand/header, primary/secondary/quiet buttons, back action, mobile navigation.
- **Pack:** artwork/card, creator/source link, subtitle, cast chips, duration and line count, import drop zone, validation message, conversion progress.
- **Room:** six-character code and copy/share action, participant row with connection status, role chip/selector, host controls, room phase and turn indicator, locked/full/expired notices.
- **Recording:** reference frame, original audio control, line row with timestamp/character/caption/status, current-line panel, mic permission prompt, recording timer/level, record/stop/retake/submit controls, take playback.
- **Showcase:** video player, subtitles/creator credit treatment, countdown, optional reactions and voting, export button/progress.
- **System:** toast, inline error, loading/empty state, dialog, tooltip, focus state, confirmation for ending a room.

Please provide desktop and phone frames for the priority pages (1440 px and 390 px are useful starting widths). For each key component, show default, hover/focus, disabled, loading, and error where relevant. Include text overflow examples: this real pack runs 1:15, has 22 lines, long captions, two characters, and overlapping timestamps. Its optional `icon.png`, per-line `.png` frame, and subtitle provide useful artwork cases. Define colors, type, spacing, radii, icon set, breakpoints, and reduced-motion behavior.

## Rive candidates

Rive should add feedback while the real controls and labels remain accessible HTML. These are useful optional animations:

| Asset | Suggested states or data | Where |
| --- | --- | --- |
| Recording indicator | idle, recording, saved, error; optional mic level | Solo and room recording |
| Pack loading | importing, converting with progress, ready, error | Import and pack ready |
| Room presence | joining, connected, reconnecting, left | Lobby and recording |
| Showcase cue | countdown, play, pause, finish | Showcase |
| Reaction burst | trigger plus emoji variant | Showcase, only if enabled |

Deliver `.riv` files plus source projects, state-machine or data-binding names, input names/types, artboard dimensions, and still-image fallbacks. Keep text, video, form fields, and download actions in HTML. We can use the [Rive CLI](https://rive.app/docs/cli/overview) locally to compile, inspect, screenshot, and test assets; publishing to a Rive workspace is a separate step.

## Suggested Figma file structure

1. **Foundations** — tokens, typography, iconography, layout grid.
2. **Components** — variants and interaction states.
3. **Dub flows** — desktop and phone page frames connected as a prototype.
4. **Rive specs** — motion examples, triggers, state names, fallbacks.

Build against the pages first; animation can arrive incrementally. The current interface is a functional placeholder and does not constrain the design.
