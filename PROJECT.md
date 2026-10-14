# nano-ss — Project Overview

## Purpose

nano-ss is a space flight simulator. The user commands a spacecraft that flies between planets, lands at spacedromes on those planets, and docks with other spacecraft.

## Goals

- Fly a user-commanded spacecraft between planets.
- Land at spacedromes on planets.
- Dock with other spacecraft.
- Control the ship with the keyboard and with a Thrustmaster T.Flight HOTAS X.
- Run primarily on Linux in a Chromium-based browser. Windows is secondary, best-effort (see D-009).
- Run well on a PC with integrated graphics, and stay usable on 16 GB RAM (see Hardware Baseline).
- Ship as a Docker container that serves the app on port 8787.

## Non-Goals

- Multiplayer (for now; D-008).
- Firefox support (D-009).
- Arcade-style flight (D-004).

## Tech Stack

Decided:

- **3D engine:** Three.js
- **Input:** keyboard and Thrustmaster T.Flight HOTAS X
- **Packaging:** Docker, serving on port 8787
- **Platforms:** Linux (primary), Windows (best-effort)
- **Browser:** Chromium-based (Chrome/Chromium). Firefox is not a target: it was about 2x slower with WebGPU in a previous sim.
- **Flight model:** realistic Newtonian physics with orbital mechanics (D-004)
- **Players:** single-player (D-008)

Still open: see D-002.

## Hardware Baseline

| | Reference (dev machine) | Minimum |
|---|---|---|
| CPU | AMD Ryzen 5 5500U (6 cores / 12 threads, Zen 2) | _TBD_ |
| RAM | 32 GB | 16 GB |
| GPU | AMD Radeon Vega 7 integrated (Lucienne), shares system RAM | Integrated |

Dev machine environment (from `chrome://gpu`, 2026-10-14):

- Debian 13, kernel 6.12, KDE Plasma on Wayland
- Chromium 155 (Debian package)
- Mesa 25.0.7 graphics driver (RADV Vulkan / radeonsi OpenGL)
- WebGPU: hardware accelerated through the Vulkan backend (`AMD Radeon Graphics (RADV RENOIR)`), with `shader-f16`, `timestamp-query`, and `subgroups` available
- Three 1080p monitors

Rules:

- **Workers scale with the machine.** Any parallel work, whether building scenery at build time (Node) or generating it at runtime (Web Workers), picks its worker count from the machine's CPU threads and free memory, never a fixed number. At build time that means `os.availableParallelism()` and free memory; in the browser, `navigator.hardwareConcurrency` and `navigator.deviceMemory`. Leave headroom for the OS and the main/render thread, and cap workers by a per-worker memory budget so a 16 GB machine does not run out of memory.
- **Worker count can be overridden** (environment variable at build time, setting in the app) for testing and tuning.
- **Graphics are budgeted for integrated GPUs.** Target: 1080p at 60 fps (D-010).
- **Recover from GPU device loss.** Chromium on this setup drops the GPU context when it runs out of video memory, and an integrated GPU shares system RAM. The renderer must handle WebGPU device loss by recreating resources, not crash.
- **Log the GPU adapter at startup** (WebGPU adapter info and features) so performance reports show which backend was actually used.

## Structure

```
nano-ss/
├── README.md     # Quick intro and getting started
├── PROJECT.md    # This file: purpose, scope, and plan
├── CLAUDE.md     # Guidance for Claude Code in this repo
└── .gitignore
```

## Open Decisions

Items discussed but not yet decided. Each entry records when it was raised, who owns the decision, and the actions expected from them. When an item is decided, move it to **Resolved Decisions** with the outcome and date.

### D-002: Choose tech stack

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** Three.js, Docker on port 8787, the input devices, Chromium on Linux, a realistic flight model, and single-player were decided on 2026-10-14. Still open: language (TypeScript is the recommendation), build tool (Vite is the recommendation), the web server inside the container (nginx serving static files is enough for single-player), the renderer (Three.js WebGPU renderer with automatic WebGL2 fallback is the recommendation; WebGPU is confirmed working on the dev machine, and the fallback covers Windows and other machines), and whether a physics/collision library is needed (e.g. Rapier). `.gitignore` is still generic and the build/test commands in `CLAUDE.md` are TBD.
- **Action expected (Panos):** Confirm or change the recommendations above. Then `.gitignore`, `README.md`, and `CLAUDE.md` get tailored to them.

### D-005: Universe and scale

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** Real solar system or a fictional system, and real or compressed distances. Real scale needs special rendering techniques (floating origin, logarithmic depth buffer) and a fast-travel mechanic (time compression or a cruise drive), because the trip between planets would otherwise take months.
- **Action expected (Panos):** Pick real or fictional, and real or compressed scale. If compressed, give a rough target travel time between planets.

### D-006: Landing scope

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** Landing only at spacedromes (fixed sites with local detailed terrain) is much smaller in scope than landing anywhere on a full-detail planet surface. A related choice is whether planets have atmospheres that affect flight (drag, re-entry).
- **Action expected (Panos):** Choose spacedromes only or landing anywhere, and whether atmospheres affect flight.

### D-007: How users run it

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** A Docker container on port 8787 means the simulator runs in a web browser at `http://localhost:8787`. Browsers only expose gamepads such as the HOTAS on secure pages, and `localhost` counts as secure. Opening the app from another machine on the network would need HTTPS. The alternative is a desktop app wrapper (Electron or Tauri), which would not need Docker.
- **Action expected (Panos):** Confirm browser on the same machine, or say if access from other machines (needs HTTPS) or a desktop app is wanted.

## Resolved Decisions

### D-010: GPU model and performance target

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Target is 1080p at 60 fps on the dev machine (AMD Ryzen 5 5500U, Radeon Vega 7 integrated). The render resolution scales down automatically when the frame rate drops, with 30 fps as the floor in the heaviest scenes. WebGPU is confirmed hardware accelerated in Chromium 155 on this machine via the Vulkan backend.

### D-004: Flight model realism

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** As realistic as possible, for full immersion in controlling the spacecraft: Newtonian 6-axis motion, real gravity and orbital mechanics, thrusters and fuel with real limits. Assistance only in the form a real spacecraft would have (e.g. attitude hold), not arcade flight. Consequence: travel between planets at real speeds takes months, so time compression is needed (affects D-005).

### D-008: Single-player or multiplayer

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Single-player for now. Other spacecraft are AI-controlled or static. The container serves static files only; no game server. Multiplayer may be revisited later.

### D-009: Target platform and browser

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Linux with a Chromium-based browser is the primary target. Input (including the HOTAS X axis and button mapping) is tailored to Linux Chromium. Windows is secondary and best-effort; it may need manual control rebinding. Firefox is not a target, because it ran about 2x slower with WebGPU in a previous sim.

### D-001: Project purpose

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** nano-ss is a space flight simulator built with Three.js. The user flies a spacecraft between planets, lands at spacedromes, and docks with other spacecraft. It uses keyboard and Thrustmaster T.Flight HOTAS X controls, runs on Linux (primary) and Windows, and ships as a Docker container on port 8787. See Purpose and Goals above. Scope details are still open in D-004 to D-008.

### D-003: Changelog approach

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** No `CHANGELOG.md` for now; git history with type-prefixed commit messages is the record. Create a versioned, human-readable `CHANGELOG.md` (Keep a Changelog format) at the first release or when a second developer joins, generated from git history. Rule recorded in `CLAUDE.md`.

## Roadmap

- [x] Initialize repository
- [x] Define purpose (2026-10-14)
- [ ] Settle remaining scope decisions (D-002, D-005, D-006, D-007)
- [ ] Choose tech stack
- [ ] First working version

## Owner

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)
