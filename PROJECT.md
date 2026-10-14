# nano-ss — Project Overview

## Purpose

nano-ss is a **realistic space flight game** set in the real solar system at real scale (D-044). The player commands a spacecraft that flies between planets and moons using a hyperdrive, lands at spaceports (spacedromes) on airless bodies, and docks with other spacecraft. Newtonian physics is the foundation; player-friendly assists can be switched on and off. The first focus is **free flight and exploration**; missions come later.

## Goals

- Fly a player-commanded spacecraft between planets and moons, for free flight and exploration.
- Land at spaceports (spacedromes) on airless bodies only, vertically on thrusters (D-006, D-044).
- Dock with other spacecraft.
- Control the ship with the keyboard and with a Thrustmaster T.Flight HOTAS X.
- Run primarily on Linux in a Chromium-based browser. Windows is secondary, best-effort (see D-009).
- Run well on a PC with integrated graphics, and stay usable on 16 GB RAM (see Hardware Baseline).
- Ship as a Docker container that serves the app on port 8787, reachable from other machines on the local network (D-007).
- Use up to two monitors: one for the outside view, one for instruments, cameras, and maps (D-011).

## Non-Goals

- Multiplayer (for now; D-008).
- Firefox support (D-009).
- Arcade-style flight: physics stays Newtonian; assists are optional layers on top (D-004, D-044).
- Landing anywhere outside spaceports (D-006).
- Landing on bodies with an atmosphere, aerodynamics, and re-entry (D-044).
- Missions, for now: to be discussed after free flight and exploration (D-044).
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
- **Genre:** realistic game, not a strict simulator (D-044)
- **Flight model:** Newtonian physics with orbital mechanics (D-004), plus optional player assists (D-044)
- **Players:** single-player (D-008)
- **Universe:** real solar system at real scale (D-005), with hyperdrive speed bands for travel (D-015) and two-level time warp (D-016)

- **Renderer:** Three.js WebGPU renderer with automatic WebGL2 fallback (D-012)
- **HTTPS:** certificates from a local certificate authority made with mkcert (D-013)

- **Collisions:** custom contact checks behind a replaceable interface (D-017)
- **Landing:** airless bodies only; no aerodynamics or re-entry (D-044)
- **Ship:** a pure spacecraft (no wings), vertical landing and takeoff on thrusters everywhere (D-043)

- **Dev environment:** everything in Docker: Node 24, pnpm, dev server, checks, certificates, CI (D-030 to D-033)
- **Package manager:** pnpm (D-031)
- **Quality:** ESLint (typescript-eslint, strict type-checked), Prettier, Vitest, GitHub Actions CI (D-033)

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
- WebGPU: works through the Vulkan backend (`AMD Radeon Graphics (RADV RENOIR)`), with `shader-f16`, `timestamp-query`, and `subgroups`, once three Chromium Vulkan flags are enabled (D-034); without them pages get no adapter and the sim runs on WebGL2
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
├── README.md         # Intro, requirements, quick start, commands
├── PROJECT.md        # This file: purpose, scope, decisions, roadmap
├── CLAUDE.md         # Guidance for Claude Code in this repo
├── LICENSE           # MIT
├── ASSETS.md         # Third-party data and assets: source, credit, licence
├── Makefile          # All commands, each a docker compose call
├── compose.yaml      # Services: dev (tooling), web (nginx on 8787), certs (mkcert)
├── .env.example      # CERT_HOSTS; copied to the git-ignored .env
├── docker/           # Dockerfiles and nginx config
├── scripts/scenery/  # Downloads and builds game data (make scenery)
├── public/data/      # Built game data (JPL ephemerides, star catalogue), committed
├── public/textures/  # Built KTX2 textures (Earth, Moon), committed
├── .github/workflows # CI: make check + production image build
├── index.html
├── src/
│   ├── main.ts       # Startup: renderer, scene, loop, overlay
│   ├── platform/     # GPU report, worker budget (with tests)
│   ├── world/        # Clock, ephemeris, bodies, gravity, orbits, targets, time warp
│   ├── game/         # Physics step, landing state and services, landing guidance
│   ├── sim/          # Ship physics, flight computer, fixed-step loop
│   ├── input/        # Keyboard, HOTAS, bindings, storage
│   ├── render/       # Renderer setup, placeholder scene
│   └── ui/           # Stats overlay
└── certs/            # Local CA and certificate (git-ignored)
```

## Open Decisions

Items discussed but not yet decided. Each entry records when it was raised, who owns the decision, and the actions expected from them. When an item is decided, move it to **Resolved Decisions** with the outcome and date.

_None currently._

## Resolved Decisions

### D-052: Landing rules and guidance

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Chosen when planning Stage 5: **realistic touchdown limits**, the ship **can tip over**, **refuel and repair on the pad** (R stays as an emergency restart), and **the pilot flies the descent with HUD guidance** (no autopilot). Built in 5b and 5c:
  - **Contacts (D-017):** four spring-damper footpads (2·10⁵ N/m, damping ratio 0.8, friction 0.6) against the terrain height and slope, relative to the turning ground, so the ship settles, slides, or tips physically; hull points at the nose and both hull ends detect strikes. Spaceport terrain uses contacts; touching the Moon elsewhere is still a crash (D-006).
  - **Touchdown verdict** at first contact (bounces within 1 s count as the same landing): **safe** at ≤ 2 m/s down, ≤ 1 m/s sideways and ≤ 10° from vertical; **hard** up to 5 m/s, 2.5 m/s and 20°, which damages the legs (a second hard landing collapses them); beyond that, a hull strike, or more than 60° of tilt in contact is a **crash**, with the reason in the alert.
  - **Landed:** all four feet down and nearly still for 2 s with the engines off; the ship is then attached to the Moon-fixed frame (stable at any time warp, warp allowed). Throttle or translation lifts off. Within 25 m of a pad centre, both tanks refill and the legs are repaired over 10 s.
  - **Guidance:** Tab cycles the navigation target (practice target, Tranquility Base, Shackleton Rim); the pad has a ◎ marker; the hyperdrive's lunar arrival orbit is placed in the plane through the targeted pad, aimed where the pad will be as the Moon turns, so the ground track passes over it. In the Moon's sphere of influence the HUD shows surface distance and bearing, the pad's angle ahead in the orbit and its distance off the track (above 5 km), radar height of the feet, descent and ground speed, and the ballistic **impact point** ✕ with its miss from the pad (long/short, left/right).
  - **FA over the ground:** below 20 km over the Moon FA's reference is the ground; with the nose within 45° of vertical it adds the thrust that cancels lunar gravity, so a throttle cut hovers and cruise holds a climb or descent rate. After a touchdown FA leaves translation alone until the throttle opens, so the ship settles and a bounce is not held as a climb.
  - **Lighting:** the Moon blocks sunlight and earthshine (night on the Moon, the far side); earthshine scaled by Earth's lit fraction; Sun shadows within about 1.5 km of the ship below 50 km (setting); landing lights (P) that dim near the ground so the pool never glares.
  - Verified in tests (safe, hard, and crash landings; tipping on 25°; services only on the pad; a day landed at 1000×; FA hover and a 2 m/s FA descent to a safe landing; the arrival ground track passing 1.7 km from a targeted pad against 606 km without) and in headless screenshots at both sites.

### D-051: Spaceport sites and terrain

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Two spaceports: **Tranquility Base** (Apollo 11, 0.674°N 23.473°E: flat mare, Earth high in the sky) and the **Shackleton crater rim** at the south pole (crater centre 89.67°S 129.78°E per the IAU gazetteer; Artemis region: low Sun, long shadows, Earth near the horizon). The Shackleton pad is picked from the elevation data on the rim (6.4 km east and 8.2 km south of the projection centre, 1,737 m above the reference sphere, 1.8° slope). Terrain pipeline (part of `make scenery`): a pinned GDAL container cuts **40 km windows at 40 m** in a gnomonic projection centred on each site from the LOLA 118 m elevation model and the LROC WAC 100 m mosaic over `/vsicurl/`, plus a **400 km ring at 2 km** from the reduced global model, so real terrain reaches past the horizon; heights stored as Int16 in 0.5 m units (about 2 MB per site), colour as KTX2. In the game the ground height is the window (bilinear, plus deterministic metre-scale detail), blended into the ring and the ring into the reference sphere, with a flat 100 m apron under the pad and buildings; physics and rendering share it through the Moon-fixed frame. Rendering: three nested grids (ring at 2 km, window at 160 m, about 2 km around the pad at 8 m) with skirts, the global Moon map beyond the window, and the Moon sphere cut away inside each ring. Greybox spaceports: pad with painted ring and edge lights, habitat modules, fuel tanks, a mast with a beacon, a floodlight. Credits in `ASSETS.md`.

### D-050: Hyperdrive rules

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Built in Stage 4 on D-015 and D-018. Chosen when planning: **engage only above a safety altitude** (1,000 km over Earth, 100 km over the Moon; from the 400 km start orbit one climb burn of about 300 m/s), **arrival in a circular orbit** around the nearest body at that altitude (refining D-015's "match the nearest body's frame"), and **steering with the stick** while active. Details: bands 0.1c, 1c, 10c, 100c from the throttle in quarters; 5 s charge, aborted by drop-out or entering a blocked zone; a governor limits speed while closing on a body to (altitude − drop-out altitude) / (2 s · cos θ), with a 2 km/s floor, so approaches slow smoothly, end at the drop-out altitude, and cannot hit anything, while departures are unrestricted; drop-out manual (O / throttle button 8) or automatic at a body's drop-out altitude; time warp locked at 1× while active; no gravity, engines, or translation in the drive bubble, rotation and RCS fuel as normal. Keys U / O, HOTAS throttle buttons 7 / 8 (the pair reserved in D-040). Verified: Earth to the Moon at 0.1c and 100c ends in a circular lunar orbit at about 100 km in under a minute.

### D-049: Stage 3c scenery pipeline

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** `make scenery` builds all game data in containers: JPL ephemerides, the Yale Bright Star Catalogue (real sky, ICRF), and Earth and Moon textures encoded as GPU-compressed **KTX2** (KTX-Software 4.4.2 in the dev image, checksum-pinned) with `sharp` for resizing; jobs run in parallel following the worker rule (threads and free memory, `NANO_SS_WORKERS` override). Outputs are committed (about 8 MB of textures, 1.2 MB of data); sources stay in `data-cache/`. Earth: NASA Blue Marble (day), Black Marble (night lights), Blue Marble clouds. **Moon: the planned NASA SVS CGI Moon Kit was unreachable** (server down on 2026-10-14), and the small LOLA albedo map turned out to be stripy laser-track data, so the Moon uses the **LROC WAC 100 m mosaic** and the **LOLA 118 m elevation model** from the USGS Astrogeology archive: 6 to 9 GB files stored one row per block, read as reduced copies (8192 × 4096 and 4096 × 2048) by a pinned GDAL container fetching only the rows it needs. Textures are flipped once at build time because KTX2 textures are not flipped on upload. Credits in `ASSETS.md`.

### D-048: Time warp rules

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Built in Stage 3b following D-016: levels 1×, 2×, 4× (full control) and 10×, 100×, 1000× (coasting: engines, RCS, and FA ignored). Keys `.` / `,`, HOTAS R2 (8) / L2 (9). Each physics step covers `warp × 1/120` s of sim time in substeps of at most 1/80 of the free-fall time scale √(d³/GM) for Earth and the Moon (about 11 s in low Earth orbit), with hazards checked in every substep. Automatic drops: to 4× on any control input while coasting (including a throttle lever not fully back); to 1× on entering 10 km of the target, before a pass below the warp safety altitude (Earth 150 km, Moon 20 km) within 3 sim seconds per warp factor, or on changing sphere of influence. The HUD shows the warp level and why it dropped. Verified: one orbit at 1000× stays on the same orbit.

### D-047: Stage 3 world model

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Chosen when planning Stage 3: **start in a 400 km circular low Earth orbit** at 51.6° (ISS-like), on the sunlit side of the orbit, with the practice target co-orbiting 2 km ahead; **the world starts at the real current date and time**; **orbit line and map view** included in Stage 3 (built in 3c). Built in 3a:
  - **Frame:** Earth-centred inertial, ICRF (J2000 equatorial), metres, 64-bit; Earth's spin axis is the frame's Z axis.
  - **Moon and Sun positions from NASA JPL Horizons tables** (2020 to 2040, Moon every 12 h, Sun daily, about 1 MB in `public/data/`, refreshed with `make scenery`), interpolated to well under 1 km, instead of the analytic Meeus series first planned: real JPL data, and nothing transcribed from memory. Tested against independent Horizons points.
  - **Gravity:** Earth and Moon (with the indirect term for the Earth-centred frame); the Sun's pull is left out (tiny tidal effect in cislunar space). Translation integrates with RK4 at the 120 Hz step.
  - **Hazards:** below 100 km over Earth the ship burns up (no atmospheric flight, D-044); touching the Moon is a crash until Stage 5. R resets to the start orbit.
  - **Rendering:** reversed depth buffer (precision from 0.1 m to the Sun without a logarithmic buffer's cost); Earth and the Moon as plain lit spheres until 3c; sunlight from the real Sun direction; Earth's shadow switches sunlight off; navigation lights and hull floodlights keep the ship visible in eclipse.
  - **Assist frames:** prograde/retrograde follow the velocity relative to the body being orbited; within 5 km of the target, FA, VEL, closing speed, and STOP use the **target's orbiting frame**, in which a ship on the same orbit is at rest (otherwise two objects 2 km apart on one orbit differ by about 2.3 m/s and FA fired constantly).

### D-045: Cruise near targets

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Near a target, FA's "brake at throttle 0" made coasting toward it impossible. Now FA **cruises**: letting go of forward/back translation (rocker, H/N) holds the forward speed reached; slowing to almost 0 with the rocker, or **throttle cut (X)**, stops the ship relative to the target; pulling the main or retro engine throttle back to 0 also stops it. Sideways and up/down drift are still cancelled. The HUD shows CRUISE with the held speed.

### D-042: Forward-facing braking engine

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Add **retro engines** in the nose at about one third of the main engine's thrust (40 kN), using main propellant: braking from 100 m/s takes about 30 to 45 s without turning around (a flip and burn stays faster for large speed changes). Control: a **reverse toggle** on HOTAS throttle button 6 (index 5) and keyboard **B**; while on, the throttle lever drives the retro engines instead of the main engine, the HUD shows REVERSE, and the nose glows. Switching reverse on or off cuts thrust until the lever moves again, so the ship never suddenly burns the wrong way. Raised because braking required turning around (allowed under D-044).

### D-041: Game assists for braking and orientation

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Add, as switchable assists (D-044):
  - **Retrograde hold** and **Prograde hold** attitude modes: the ship turns itself to face against or along its velocity and holds there; the pilot still does the burn. Retrograde hold on HOTAS stick button 2 (R3) and keyboard **V**; prograde hold on keyboard **G**.
  - **Flight assist (FA)** that also cancels drift: with FA on, when there is no translation input the RCS brings the ship's velocity to zero (relative to the start point for now, later the nearest body or station); with FA off, pure Newtonian flight as before. Toggle on keyboard **Y**; HOTAS unassigned (rebindable).
  - **Edge arrows** at the screen border pointing to off-screen markers (⊕, ⊗, nose), since ⊗ is usually behind the ship.
  - **Time-to-stop hint** in the HUD: burn time needed to stop at full throttle with the main engine and with the retro engines, next to the remaining Δv.
  Raised because Panos could not find ⊗ and had to turn around to brake.
  Confirmed 2026-10-14 when planning Stage 2b: FA cancels sideways and up/down drift always, and with the throttle at 0 and no forward/back input it brakes to a stop (retro engines when moving forward, main engine when moving backward, RCS for the last 0.3 m/s); **FA is on by default**, remembered between sessions. Attitude holds approach their target at a time-optimal rate (a 180° flip takes about 15 to 20 s without overshoot). Built and verified in Stage 2b.

### D-044: Realistic game, not a strict simulator

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** nano-ss is a **realistic space flight game**. Newtonian physics, gravity and orbits, the real solar system at real scale, and the hyperdrive stay the foundation; player-friendly layers that a strict simulator rules out are allowed when they help play, preferably switchable (e.g. a flight assist that also cancels drift, retro engines, refuelling at spaceports). **Landing only at spaceports on airless bodies**: no Earth landing, no aerodynamics or re-entry; Earth stays for orbits, views, and stations. **Free flight and exploration first**; missions are discussed later. Changes earlier decisions: D-004 (assistance no longer limited to what real spacecraft have), D-014 (no atmospheric flight; its Stage 8 is dropped), D-019 (vertical landing everywhere), D-043 (ship shape). Cost of the change was low: Stages 0 to 2 are reused unchanged.

### D-043: Ship configuration revisited

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** With no atmospheric landings (D-044), the ship is a **pure spacecraft**: no wings, vertical landing and takeoff on thrusters at every spaceport. The look is Panos's design in Blender (D-020); the greybox is replaced by a spacecraft-shaped placeholder when convenient. Rejected: winged spaceplane, lifting body, and runway hybrid, all only needed for gliding re-entry.

### D-040: HOTAS X mapping

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Layout from the raw viewer checkpoint (`?gamepad=debug`) on Linux Chromium. Axes: 0 stick X = roll, 1 stick Y = pitch (pull back = nose up), 2 throttle lever = main throttle (absolute, forward = 100 %), 3 twist = yaw, 4 rocker = RCS forward/back (analog, right = forward), 5/6 hat = RCS left/right and up/down (forward = up). Buttons, chosen by urgency and hand position (8/9 R2/L2 = time warp faster/slower, added in Stage 3b): 0 trigger = assist kill rotation (the "panic button" for a tumble), 1 = hold attitude, 3 = assist off, 2 (R3) = retrograde hold (added in Stage 2b, D-041), 4 = switch camera, 5 (throttle button 6) = reverse toggle (added in Stage 2b, D-042), 11 ST = pause and settings, 10 SE = performance overlay; 6/7 = hyperdrive engage / drop out (Stage 4), 8/9 = time warp (Stage 3). Direct buttons per assist mode instead of a cycle button, so the emergency action is always one press. Dead zones 5 % stick, 10 % twist and rocker; mild response curves. Keyboard and HOTAS work together (axes summed); for the throttle, whichever moved last wins. Everything is rebindable in the pause panel, with per-axis invert, dead zone, curve, and throttle calibration, saved in the browser.

### D-039: RCS propellant budget

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Option (d): RCS tank raised from 300 kg to 800 kg and translation thrust lowered from 4 kN to 2 kN (about 0.1 m/s², finer for docking, half the propellant use; one axis held continuously lasts about 14 minutes). A temporary **reset ship** action (R) refills both tanks and returns the ship to the start until stations allow refuelling. Confirmed: RCS does not drain with assist off and hands off. Raised while testing because translation was not visible, which led to RCS exhaust plumes on the hull, optional motion reference dust (not physical; on by default, switchable), and a ship-axes velocity line (VEL) in the HUD.

### D-036: Keyboard layout

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** KSP-style: W/S pitch, A/D yaw, Q/E roll; I/K, J/L, H/N RCS translation; Shift/Ctrl throttle, Z full, X cut; T cycles assist; C camera; F fullscreen; F3 performance overlay; Esc pause. Bindings are data (`src/input/bindings.ts`) so Stage 2 can make them rebindable. The browser keeps Ctrl+W, Ctrl+N, and Ctrl+T for itself outside fullscreen, so fullscreen (F) uses keyboard lock, and the production build asks before leaving the page. Rejected: Elite-style, Orbiter-style numpad.

### D-037: Placeholder spaceplane size and numbers

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Dream Chaser class: about 9 m long, 7 m span, 10 t dry, 8 t main propellant, 800 kg RCS propellant (raised from 300 kg by D-039). Main engine 120 kN at Isp 340 s (about 0.7 g full, 1.2 g nearly empty, about 1.9 km/s delta-v); RCS 2 kN per translation axis (lowered from 4 kN by D-039), torques for about 3°/s² pitch/yaw and 6°/s² roll. Inertia from a box estimate that changes as propellant burns. All numbers are placeholders in `src/sim/ships/placeholderSpaceplane.ts`, tunable when the real design exists. Rejected: 20 m class, Space Shuttle class.

### D-038: Physics time step

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Fixed 120 Hz physics step with render interpolation, independent of the frame rate setting (D-035); verified identical results at 60 and 144 fps frame timings. Rotation uses Euler's equations (RK4), so torque-free tumbling is physical. Assist modes (Off, Kill rotation, Hold attitude) act on rotation only, through the RCS; translation is never automated (D-004).

### D-035: Frame rate on high-refresh monitors

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Option (c): a frame rate setting with two choices, **60 fps** (default) and **display refresh rate**. The default keeps the integrated GPU and the 15 W CPU cooler and avoids early throttling; the display rate is there for smoothness on high-refresh monitors (the dev machine's runs at 144 Hz). Physics runs on a fixed time step, so the setting never changes the simulation. Planned for Stage 1, together with the fixed physics step.

### D-034: WebGPU unavailable in the page on the dev machine

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Fixed by enabling three Chromium flags: **Vulkan** (`#enable-vulkan`), **Default ANGLE Vulkan** (`#default-angle-vulkan`), and **Vulkan from ANGLE** (`#vulkan-from-angle`). After relaunch, `chrome://gpu` shows Vulkan enabled and WebGPU hardware accelerated, and the sim runs on **WebGPU** (144 fps at the monitor's refresh rate, about 6.9 ms per frame on the placeholder scene, 10 workers). "Force enable WebGPU interop" was not needed and stays off. Before the fix, both `requestAdapter()` and `requestAdapter({ featureLevel: 'compatibility' })` returned `null` in Chromium 155.0.8059.39 (Debian 13), with Vulkan disabled. Every Linux machine that opens the sim needs the same flags (documented in `README.md`); without them the sim still runs on the WebGL2 fallback. Flag names may change in future Chromium versions.

### D-030: Development environment

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Everything runs in Docker so the project is transferable: a machine needs only Docker, git, make, and Chromium. A Compose `dev` service (Node 24, pinned image tag) runs the dev server, lint, type check, tests, and build; the host's Node 20 (end of life) is never used. Rejected: VS Code Dev Container (tied to one editor), Node installed per machine with fnm (each machine must install tools).

### D-031: Package manager

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** pnpm, version pinned in `package.json` and the Dockerfiles. Chosen over npm for faster installs, less disk use, and strict dependency checks.

### D-032: Certificate creation

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** mkcert runs in a one-off container (`make certs`), writing the local CA and server certificate to the git-ignored `certs/` folder; nothing is installed on the host. Certificates are mounted into the dev and web containers at runtime, never built into images. Each machine that opens the sim imports `certs/ca/rootCA.pem` into Chromium once. Certificate names come from `CERT_HOSTS` in `.env`.

### D-033: Continuous integration

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** GitHub Actions runs `make check` and `make build` on every push to `main` and on pull requests, using the same Docker setup as local development. This also proves the project builds on a clean machine from the repo alone.

### D-029: Snapshots on the NAS

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Panos created a TrueNAS periodic snapshot task on the dataset behind the share (recommended: daily, kept 3 months). Snapshots are read-only, so a bad push or deletion cannot overwrite them. Restore by cloning a snapshot in the TrueNAS web interface (or via Shadow Copies / `.zfs/snapshot` on the share) and copying the repo back; avoid "Rollback", which resets the whole dataset. On 2026-10-14 the share's `.zfs/snapshot` folder was visible from the dev machine but still empty, since the first scheduled snapshot had not run yet.

### D-028: Backup of Blender sources to the NAS

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Option (a): a second git remote on the NAS. The TrueNAS SMB share is mounted on the dev machine at `/mnt/truenas` (`cifs-utils`, systemd automount from `/etc/fstab` with `nofail`, credentials in a file readable only by Panos). The bare repo lives at `/mnt/truenas/nano-ss/nano-ss-assets.git`. The assets repo's `origin` pushes to both GitHub and the NAS, so one `git push` updates both; `git push nas` pushes to the NAS alone. Verified 2026-10-14: local, GitHub, and NAS copies at the same commit, NAS repo passes `git fsck`. Snapshots continue in D-029.

### D-027: Replace the Google Drive backup

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Google Drive dropped as too much setup for this project. Blender sources live in `~/Development/nano-ss-assets`, which is its own git repository pushed to a separate private GitHub repo under the `SonapSav` account (plain git, no LFS for now). Rules: textures kept as separate files, not packed into `.blend` files; commit at milestones, not every save; move to Git LFS if a file nears 50 MB or the repo nears 1 GB. The private repo is not linked from this public repo (no submodule). Cleanup done: rclone remote, config, and binary removed from the dev machine, `scripts/backup-assets.sh` removed, and Panos removed rclone's Google access. Rejected options: Git LFS from the start (small free quota), local-only backup (no off-site copy; a NAS backup may be added later, see D-028).

### D-026: Own Google OAuth client for rclone

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Dropped. Not needed after Google Drive was replaced (D-027).

### D-025: Google Drive storage and backup tool

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** Superseded by D-027 on 2026-10-14. Originally: `.blend` sources are backed up with rclone (v1.75.2 in `~/.local/bin`) to Panos's PrimeSoft Google Workspace Drive: 2 TiB total, about 93 MiB used on 2026-10-14. Remote name `nano-ss-drive`, scope `drive.file` (rclone only sees files it creates). Local working folder `~/Development/nano-ss-assets`; backup command `scripts/backup-assets.sh` syncs it to `nano-ss-assets/current` and moves replaced or deleted files to `nano-ss-assets/versions/<timestamp>`. The first authorization printed the OAuth tokens into the chat, so that grant was to be revoked and the remote was recreated without printing them. Own OAuth client continues in D-026.

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
  - **Storage (hybrid):** `.blend` sources live outside the repo and are kept in a separate private GitHub repo (D-027); `.gitignore` excludes `*.blend` files. Exported, compressed game models (GLB with compressed textures) are committed so the Docker build is self-contained. Large NASA/USGS data is downloaded and processed by a script during the scenery build, cached locally in `data-cache/` (git-ignored). Source storage: see D-027.

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

### D-019: Landing on airless bodies and leaving Earth (superseded by D-044, D-043)

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** One spaceplane for all bodies. Where there is air, it lands on a runway (D-014); on airless bodies such as the Moon, it lands and takes off vertically on thrusters, so airless spacedromes have landing pads. From Earth, it takes off horizontally from the runway using rocket engines and climbs to orbit.

### D-014: Atmospheric flight (superseded by D-044)

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
- **Outcome:** Three.js WebGPU renderer with automatic WebGL2 fallback. The fallback covers machines without WebGPU; the dev machine needs three Chromium Vulkan flags for WebGPU (D-034). The collision library question continues in D-017.

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
- **Outcome:** Target is 1080p at 60 fps on the dev machine (AMD Ryzen 5 5500U, Radeon Vega 7 integrated). The render resolution scales down automatically when the frame rate drops, with 30 fps as the floor in the heaviest scenes. WebGPU works in Chromium 155 on this machine once three Vulkan flags are enabled (D-034).

### D-004: Flight model realism (amended by D-044)

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

Planning (done 2026-10-14): repository, purpose, scope, tech stack, assets, and backups (D-001 to D-033).

- [x] **Stage 0: Setup.** Vite, TypeScript, and Three.js (WebGPU with WebGL2 fallback); Docker for all tooling; nginx serving HTTPS on 8787 with mkcert certificates; lint, format, type check, tests, and CI; placeholder scene with GPU report and worker budget. (2026-10-14; verified on WebGPU in Chromium, D-034)
- [x] **Stage 1: Flight core.** Realistic 6-axis flight in empty space on a fixed physics time step, chase and nose cameras, basic heads-up display, keyboard controls, frame rate setting (60 fps default or display rate; D-035). (2026-10-14; D-036 to D-038)
- [x] **Stage 2: Input.** HOTAS X support tuned for Linux Chromium, rebindable controls, calibration and dead zones. (2026-10-14; D-039, D-040)
- [x] **Stage 2b: Game assists.** Retro engines (D-042); retrograde/prograde hold, drift-cancelling flight assist, edge arrows, time-to-stop hint (D-041); spacecraft-shaped greybox (D-043). (2026-10-14)
- [x] **Stage 3: Earth and Moon.** Real orbits from NASA/JPL data, handling of huge distances, gravity, two-level time warp. Earth for orbits and views only (no landing, D-044). 3a orbits, 3b time warp, and 3c visuals (NASA textures, real stars, Sun, orbit line, map view) done 2026-10-14 (D-045, D-047 to D-049).
- [x] **Stage 4: Hyperdrive.** Speed bands 0.1c to 100c, charge-up, gravity-well limits, arrival speed matching. (2026-10-14; D-050)
- [x] **Stage 5: Moon spaceports.** Landing pads on real lunar terrain, vertical landing on thrusters, contact checks, refuelling. 5a terrain, 5b landing, 5c guidance. (2026-10-14; D-051, D-052)
- [ ] **Stage 6: Orbital stations.** Modular stations, docking with the capture check.
- [ ] **Stage 7: Second monitor.** Window for instruments, cameras, and maps.
- [ ] **Stage 8: Exploration across the solar system.** More airless destinations (other moons, Mercury, asteroids) with spaceports; planets with atmospheres are visited from orbit only.
- [ ] **Later: missions,** to be discussed (D-044).

Alongside: the spacecraft model in Blender (D-020, D-043); the cockpit frame once the design is settled (D-021).

## Owner

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)
