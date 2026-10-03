# Webby Voicer: confirmed product plan

This document records the decisions confirmed on 2 October 2026. `CHOICER_VOICER_PLAN.md` is the initial proposal; where the two differ, this document is current.

## Build status

The local application now includes Dub rehearsal, anonymous room coordination, and a source-linked pack market. A supplied, unmodified Dub ZIP imported all 22 lines, two roles, backing track, icon, subtitle, and reference frames. Its OGV video converted and started mixed playback in a desktop browser; the synthetic fixture also passed export flow. Local server checks passed for pack sharing, role permissions, submitted takes, scheduled showcase, and room deletion. Public release still needs more real-pack testing, phone browser checks, microphone and export checks on devices, production rate limits, cost monitoring, and deployment review. No live service has been launched.

## Product

Webby Voicer is an independent, free browser game compatible with existing Choicer Voicer Dub packs. It is not an official version of The Choicer Voicer. It launches with Dub Mode, anonymous multiplayer, local pack import, a pack marketplace, and downloadable finished videos. Classic impression mode follows later.

## First playable milestone: local Dub rehearsal

1. Import an existing Dub pack from a ZIP or folder.
2. Validate its video, per-line audio, per-line timestamps, and optional metadata. Explain missing or unsupported assets to the player.
3. Show each line's original audio, character, caption, and timing. Record one line at a time; let the player hear and retake their own recording.
4. Mix the selected takes with the video and optional backing track. Keep the original voice for unassigned lines when it is available.
5. Play the finished scene with subtitles and creator credits, and export a downloadable video.

The legacy importer must use the actual Dub pack format. The creator's [official guide](https://thechoicervoicer.neocities.org/v2/content_guide/dub_packs) requires an OGV video named `dub_video.ogv` and timestamp metadata on individual audio samples. The earlier proposal's `dub_meta.json` and MP4/WebM examples are possible Webby Voicer extensions, not legacy compatibility requirements. We will verify parsing against real, authorized packs before declaring compatibility complete.

## Public beta requirements

- Desktop and phone browser support, including a compatibility path for legacy OGV video on browsers that cannot play it directly.
- Anonymous rooms with six-character codes, optional host lock, up to eight performers, and additional spectators.
- Players claim roles; the host can reassign roles before recording. The host chooses turn-based or simultaneous recording.
- Local packs share automatically with room members. Shared server copies and recorded takes expire when the room ends, with a recovery timeout for abandoned rooms.
- Others hear submitted takes, not the performer's live microphone. Players can hear and retake their own lines before submission.
- A group showcase uses the backing track where available. Unassigned roles use original audio when available, or subtitles with silence.
- Reactions are optional. Voting is off by default and can be enabled by the host. Dub Mode has no automatic score.
- Performers can download the finished video while the room is open; spectators can watch but cannot download by default. Export includes subtitles and creator credits.
- A marketplace shows project-curated packs and GameBanana listings, with no content category filter and no user submissions at launch. Every GameBanana listing links to its source page. Webby Voicer mirrors files only when their license or creator permits it; otherwise the original download remains available.
- Free to play, without ads or paid packs. A small beta targets a monitored hosting budget of roughly USD 5–20 per month. No paid service is enabled merely by building locally.

## Delivery sequence

1. **Local Dub rehearsal:** legacy pack import and validation, line recording and retakes, scene playback, subtitles, credits, and local export.
2. **Rooms:** host controls, role assignment, synchronized recording and showcase, spectator access, ephemeral pack and take transfer, deletion and timeout behavior.
3. **Marketplace:** curated registry, GameBanana discovery, source links, mirror permission tracking, and room pack loading.
4. **Beta readiness:** iOS/Android and desktop browser testing, OGV conversion path, export format checks, accessibility, usage monitoring, and cost controls.
5. **Later:** Classic Mode with a fun and explainable automatic score, then creator submissions if wanted.

## Engineering approach

Start with a React and TypeScript browser app. Keep pack parsing and timeline logic in small testable modules. Do media processing locally where reliable; measure OGV compatibility and export on mobile before choosing the server conversion path. For the beta, evaluate Cloudflare Workers, Durable Objects, and R2 as a coherent low-cost stack. Consult current library documentation through Context7 before implementing APIs, and use GitNexus after a codebase exists to inspect dependencies and change impact.

## Reference sources

- [Official Dub pack guide](https://thechoicervoicer.neocities.org/v2/content_guide/dub_packs)
- [Official voice pack guide](https://thechoicervoicer.neocities.org/v2/content_guide/voice_packs)
- [Creator's official game page and independence warning](https://yeahmaybe.itch.io/the-choicer-voicer)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
