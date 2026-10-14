# nano-ss — Project Overview

## Purpose

nano-ss is a realistic space flight simulator set in the real solar system at real scale. The user commands a spacecraft that flies between planets using a hyperdrive, lands at spacedromes on those planets, and docks with other spacecraft.

## Goals

- Fly a user-commanded spacecraft between planets.
- Land at spacedromes on planets (spacedromes only; D-006).
- Dock with other spacecraft.
- Control the ship with the keyboard and with a Thrustmaster T.Flight HOTAS X.
- Run primarily on Linux in a Chromium-based browser. Windows is secondary, best-effort (see D-009).
- Run well on a PC with integrated graphics, and stay usable on 16 GB RAM (see Hardware Baseline).
- Ship as a Docker container that serves the app on port 8787, reachable from other machines on the local network (D-007).
- Use up to two monitors: one for the outside view, one for instruments, cameras, and maps (D-011).

## Non-Goals

- Multiplayer (for now; D-008).
- Firefox support (D-009).
- Arcade-style flight (D-004).
- Landing anywhere on a planet surface outside spacedromes (D-006).
- More than two monitors (D-011).

## Tech Stack

Decided:

- **Language:** TypeScript
- **Build tool:** Vite
- **3D engine:** Three.js
- **Web server:** nginx inside the container, serving static files over HTTPS (D-007)
- **Input:** keyboard and Thrustmaster T.Flight HOTAS X
- **Packaging:** Docker, serving on port 8787
- **Platforms:** Linux (primary), Windows (best-effort)
- **Browser:** Chromium-based (Chrome/Chromium). Firefox is not a target: it was about 2x slower with WebGPU in a previous sim.
- **Flight model:** realistic Newtonian physics with orbital mechanics (D-004)
- **Players:** single-player (D-008)
- **Universe:** real solar system at real scale (D-005), with hyperdrive speed bands for travel (D-015) and two-level time warp (D-016)

- **Renderer:** Three.js WebGPU renderer with automatic WebGL2 fallback (D-012)
- **HTTPS:** certificates from a local certificate authority made with mkcert (D-013)

- **Collisions:** custom contact checks behind a replaceable interface (D-017)
- **Atmospheres:** full aerodynamics and re-entry heating, spaceplane-style runway landings (D-014)
- **Ship:** one spaceplane: runway takeoff and landing where there is air, vertical landing and takeoff on thrusters on airless bodies (D-019)

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
- Three 1080p monitors (the sim uses at most two; D-011)

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
├── LICENSE       # MIT
└── .gitignore
```

## Open Decisions

Items discussed but not yet decided. Each entry records when it was raised, who owns the decision, and the actions expected from them. When an item is decided, move it to **Resolved Decisions** with the outcome and date.

### D-025: Google Drive storage and backup tool

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** `.blend` sources are backed up to Google Drive (`sonap.sav@gmail.com`, D-022). Claude's Drive tools cannot read the storage quota, so free space is unverified. The free Google plan is 15 GB shared with Gmail and Photos; `.blend` sources for the project could reach several GB over time, especially with saved versions. Google has no official Drive app for Linux. Options for the backup: rclone (free, open source; work locally in a folder such as `~/Development/nano-ss-assets` and sync it to Drive, keeping old versions in a separate Drive folder), KDE's built-in Google Drive integration (`kio-gdrive`, mounts Drive as a network folder; too slow to work on `.blend` files directly, fine for manual copies), or Insync (paid). Recommendation: rclone.
- **Action expected (Panos):** Check free space at https://drive.google.com/settings/storage and report it, and approve rclone (or choose another tool).

## Resolved Decisions

### D-021: Cockpit

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Staged path. (1) No cockpit while the engine is built: outside or nose camera plus a heads-up display, instruments on the second monitor. (2) A cockpit frame (canopy, window struts, glare shield, a few key displays) once the spaceplane design is settled. (3) Designed so it can grow toward a full 3D interior later. The cockpit is rendered as its own layer so it stays sharp next to very distant objects.

### D-022: Asset licensing and storage

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:**
  - **Licensing:** commit only assets that are our own, public domain, CC0, or CC-BY (credited); record every third-party asset in `ASSETS.md` (source, author, license, link). No NC licenses; SA only if accepted knowingly. NASA imagery is allowed, but no NASA logos or insignia and nothing implying NASA endorsement. Assets with restrictive licenses stay out of the repo.
  - **Storage (hybrid):** `.blend` sources live outside the repo and are backed up to Google Drive (`sonap.sav@gmail.com`); `.gitignore` excludes `*.blend` files. Exported, compressed game models (GLB with compressed textures) are committed so the Docker build is self-contained. Large NASA/USGS data is downloaded and processed by a script during the scenery build, cached locally in `data-cache/` (git-ignored). Storage check and backup tool continue in D-025.

### D-024: Project license

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** MIT, copyright 2026 Panos Vasilopoulos, in `LICENSE`. It covers the code and Panos's own committed assets (such as exported models). Third-party assets keep their own licenses, listed in `ASSETS.md`.

### D-023: Blender setup and MCP connection

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Blender 5.2.2 LTS from blender.org (Debian 13's own package, 4.3.2, is too old). Claude Code connects through the official Blender Foundation MCP server, chosen over the community `blender-mcp` server for maintenance and built-in Blender docs search, and to avoid its mixed-license asset integrations (D-022). Every Blender code call stays on manual approval in Claude Code, because the server runs code inside Blender without guards and with Panos's user permissions. `.blend` files are kept under version control or backed up. Cycles renders and texture baking will likely run on the CPU, since the Vega 7 is probably not supported for GPU rendering.

### D-020: Who makes the 3D models

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Panos models the assets in Blender, with Claude assisting through a Blender MCP connection (D-023): Claude handles precise, repetitive, and technical work (exact-dimension kit parts, materials, UVs, detail levels, export settings, budget checks) and explains techniques, while Panos makes the creative decisions. Greybox placeholders until the engine works. Stations and spacedrome buildings as a modular kit assembled in code. Planets, Moon, and stars from real data (D-005). Free Blender add-ons only.

### D-019: Landing on airless bodies and leaving Earth

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** One spaceplane for all bodies. Where there is air, it lands on a runway (D-014); on airless bodies such as the Moon, it lands and takes off vertically on thrusters, so airless spacedromes have landing pads. From Earth, it takes off horizontally from the runway using rocket engines and climbs to orbit.

### D-014: Atmospheric flight

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Full realism: drag, lift, and re-entry heating with a heat shield, using real atmosphere models (US Standard Atmosphere 1976 for Earth, NASA's Mars model later). Weather and wind are out of scope at first. Spaceplane style: re-entry, glide, and runway landing, so spacedromes on planets with atmospheres have runways. Comes in the stage right after the Moon; the first stage is Moon spacedromes plus orbital stations around Earth and the Moon. High time warp is not available in the atmosphere. Landing on airless bodies continues in D-019.

### D-017: Collision library

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Custom contact checks, no physics library for now: landing gear as points/rays against the pad and terrain, the hull as simple shapes, and docking as a capture check (position, angle, and closing speed within tolerances, then latches engage). Contact code sits behind its own interface so it can be switched to Rapier later if landings and crashes need richer behaviour (tipping, bouncing, scraping), without touching the orbital physics.

### D-016: Time warp in normal flight

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Two levels. Low factors (2x to 4x) keep full physics and control. High factors (10x to 1000x) are only allowed while coasting with engines off, and the ship follows its exact orbit. The sim drops back to 1x automatically before events such as reaching a station, a planned engine burn, or a close approach to the ground. Hyperdrive moves the ship; time warp speeds up the clock for the whole sim.

### D-012: Renderer

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Three.js WebGPU renderer with automatic WebGL2 fallback. WebGPU is confirmed on the dev machine; the fallback covers Windows and other machines. The collision library question continues in D-017.

### D-013: HTTPS certificate for local network access

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** mkcert. A local certificate authority issues the certificate that nginx serves on port 8787, and its root certificate is installed once on each machine that opens the sim, so no browser warnings appear. Needed because browsers only allow WebGPU and gamepads on secure pages.

### D-018: Hyperdrive cost

- **Raised:** 2026-10-14 (split out of D-015, as part of D-016)
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Hyperdrive needs a charge-up of a few seconds before it engages, for immersion. No fuel or energy cost for now.

### D-005: Universe and scale

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Option A: the real solar system at real scale, with real orbital data (NASA/JPL) and real elevation data (NASA/USGS) for spacedrome terrain. Hyperdrive (D-015) handles travel times. Built in stages as recommended: Earth and Moon first, then the inner planets, then the rest. The other options considered were a scaled-down real system (B), a fictional system with real physics (C), and a fictional compact system (D).

### D-015: Hyperdrive design

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Hyperdrive is a separate flight mode on top of the realistic physics: inside a drive bubble, with no momentum build-up and no g-forces. Normal flight (near planets, landing, docking) stays fully Newtonian with orbital mechanics.
  1. **Speed bands:** 0.1c, 1c, 10c, 100c. The HOTAS throttle selects the band; buttons engage the drive and drop out.
  2. **Gravity wells:** the drive cannot engage, or is forced to drop out, within a safety distance of each body that scales with its mass. The highest allowed band shrinks closer to a body.
  3. **Velocity on drop-out:** the drive matches the frame of the nearest body and leaves a small approach speed that the pilot must cancel with thrusters.
  - Cost and time warp continue in D-016.

### D-002: Tech stack

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** TypeScript, Vite, Three.js, and nginx serving the built static files in Docker on port 8787. Renderer and physics library details continue in D-012.

### D-006: Landing scope

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Landing only at spacedromes (fixed sites with locally detailed terrain), and docking with other spacecraft. No landing elsewhere on planet surfaces. Atmospheric effects continue in D-014.

### D-007: How users run it

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** The server (Docker + nginx) runs on one machine, and the sim can be opened in a browser from other machines on the same local network. The server only delivers files: each machine that opens the sim runs it on its own CPU and GPU, with its own keyboard and HOTAS. Requires HTTPS (D-013).

### D-011: Monitors

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** At most two monitors: one for the outside view, and one for instruments, cameras, and maps. Implementation notes: the instruments screen is a second browser window that receives the simulation state from the main window, which owns the physics and input. Extra camera views cost GPU time on the integrated GPU and must fit the 60 fps budget.

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
- [x] Choose universe and scale: real solar system (2026-10-14)
- [x] Settle scope decisions (2026-10-14)
- [ ] Choose tech stack
- [ ] First working version

## Owner

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)
