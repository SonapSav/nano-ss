# nano-ss

A realistic space flight game set in the real solar system at real scale, built with Three.js. Fly a spacecraft between planets and moons with a hyperdrive, land at spaceports on airless worlds, and dock with other spacecraft, using the keyboard or a Thrustmaster T.Flight HOTAS X. See [PROJECT.md](PROJECT.md) for scope, decisions, and roadmap.

**Status:** Stage 3 (Earth and Moon): you start in a real 400 km orbit around Earth, with the real Moon, Sun, and stars where they are right now (NASA JPL data and the Yale Bright Star Catalogue), NASA imagery of Earth and the Moon, time warp up to 1000×, and an orbit map.

## Requirements

Everything runs in Docker, so a machine needs only:

- Docker with the Compose plugin
- git and GNU make
- A Chromium-based browser (Chrome or Chromium)

No Node.js, pnpm, or mkcert on the host.

## Quick start

```bash
git clone https://github.com/SonapSav/nano-ss.git
cd nano-ss
cp .env.example .env      # then edit CERT_HOSTS: this machine's hostname and LAN IP
make certs                # create a local certificate authority and HTTPS certificate
make dev                  # dev server: https://<host>:5173
make up                   # production server: https://<host>:8787
```

### Trust the certificate authority (once per machine)

The sim needs HTTPS, because browsers only allow WebGPU and gamepads on secure pages. `make certs` creates a private certificate authority in `certs/ca/`. On **every machine that opens the sim**, import `certs/ca/rootCA.pem` once into Chromium:

1. Open `chrome://certificate-manager` (or Settings, Privacy and security, Security, Manage certificates).
2. Under the locally installed or custom certificates, open **Trusted certificates** and **Import** `rootCA.pem`.
3. Restart the browser.

Copy only `rootCA.pem` to other machines. **Never share `certs/ca/rootCA-key.pem`:** anyone who has it can create certificates your browsers will trust. It is git-ignored and never copied into a Docker image.

If you add a hostname or the machine's IP changes, update `CERT_HOSTS` in `.env` and run `make certs` again. The authority is reused, so browsers don't need to import it again.

### Enable WebGPU in Chromium on Linux

Chromium on Linux may not offer WebGPU to pages until Vulkan is turned on; the sim then falls back to WebGL2 (the overlay's first line shows which one is active). In `chrome://flags`, set these to **Enabled** and relaunch:

- **Vulkan** (`#enable-vulkan`)
- **Default ANGLE Vulkan** (`#default-angle-vulkan`)
- **Vulkan from ANGLE** (`#vulkan-from-angle`)

`chrome://gpu` should then show **Vulkan: Enabled** and **WebGPU: Hardware accelerated**. If the browser misbehaves, use **Reset all** in `chrome://flags`. Tested with Chromium 155 on Debian 13 with an AMD Radeon integrated GPU; flag names may change in future versions.

## Commands

| Command | What it does |
|---|---|
| `make help` | List all commands |
| `make certs` | Create the CA and HTTPS certificate in `certs/` |
| `make dev` | Run the dev server on port 5173, with live reload |
| `make check` | Lint, format check, type check, and unit tests |
| `make lint` / `make typecheck` / `make test` | Run one of the checks |
| `make format` | Format the code with Prettier |
| `make install` | Install or update dependencies |
| `make build` | Build the production image |
| `make up` | Start the production server on port 8787 |
| `make down` | Stop all services |
| `make logs` | Follow the production server logs |
| `make shell` | Open a shell in the dev container |

Each target is a one-line `docker compose` call in the [Makefile](Makefile).

## Flight controls

| Keys | Action |
|---|---|
| W / S | Pitch down / up |
| A / D | Yaw left / right |
| Q / E | Roll left / right |
| I / K | Translate up / down (RCS) |
| J / L | Translate left / right (RCS) |
| H / N | Translate forward / back (RCS) |
| Shift / Ctrl | Throttle up / down |
| Z / X | Full throttle / cut (X also stops you near a target) |
| B | Reverse: the throttle drives the nose retro engines (brake while facing forward) |
| Y | Flight assist (FA) on/off |
| T | Rotation assist: off, kill rotation, hold attitude |
| V / G | Retrograde hold (face against motion) / prograde hold (face along motion) |
| C | Chase / nose camera |
| M | Map view: orbit line, apoapsis (Ap) and periapsis (Pe), Earth and the Moon (drag to orbit, wheel to zoom) |
| Mouse drag, wheel | Orbit and zoom the chase camera |
| F | Fullscreen (also lets the sim receive Ctrl+W, Ctrl+N, Ctrl+T) |
| . / , | Time warp faster / slower (1×, 2×, 4× flyable; 10×, 100×, 1000× coasting only) |
| R | Reset ship: refuel and return to the start |
| F3 | Performance overlay |
| Esc | Pause and settings (frame rate, motion dust, controls) |

Physics is Newtonian: a spin or a speed keeps going until thrusters stop it. **Flight assist (FA)** is on by default: it cancels sideways drift and, with the throttle at 0, brakes the ship to a stop. Press Y for pure Newtonian flight.

### Flying in orbit

- **Speeding up raises the other side of your orbit; slowing down lowers it.** A prograde burn (G, then throttle) raises the apoapsis half an orbit later; a retrograde burn (V) lowers the periapsis. The ORBIT lines show both and when you reach them.
- **Time warp** (. and , or R2/L2): up to 4× you keep full control; at 10× to 1000× the ship coasts, so one orbit takes about 5 s at 1000×. Warp drops by itself when you use the controls (to 4×), get within 10 km of the target, head for a low pass, or change sphere of influence (to 1×).
- **Below 100 km over Earth you burn up** (there is no atmospheric flight); R resets to the start orbit.
- **Reaching the practice target (◇, 2 km ahead at the start):** point at it, tap the rocker (or H) until closing speed is about 2 m/s, and let go: flight assist **cruises** at that speed and cancels drift. Within about 200 m slow down with the rocker back (or N); at almost 0, or with **X**, FA stops you. Near the target, VEL and STOP are measured in the target's orbiting frame.

### Thrustmaster T.Flight HOTAS X

Plug it in, open the sim, and **press any HOTAS button**: Chromium only shows a gamepad to a page after its first input. The HUD's INPUT line then names it. Keyboard and HOTAS work together.

| Control | Action |
|---|---|
| Stick left/right, forward/back | Roll, pitch (pull back = nose up) |
| Stick twist | Yaw |
| Throttle lever | Main throttle (forward = 100 %) |
| Throttle rocker | RCS forward/back (right = forward) |
| Hat | RCS up/down/left/right |
| Trigger | Assist: kill rotation |
| Stick button 2 / 4 | Assist: hold attitude / off |
| Stick button 3 (R3) | Retrograde hold: turn to face against the motion |
| Throttle button 5 | Switch camera |
| Throttle button 6 | Reverse (retro engines) on/off |
| R2 / L2 | Time warp faster / slower |
| ST / SE | Pause and settings / performance overlay |

For the throttle, whichever moved last wins: Z, X, Shift, Ctrl change it, and moving the lever takes over again.

### Rebinding

Esc (or ST) opens the pause panel: click any key, axis, or button binding and press or move the new one. HOTAS axes have invert, dead zone, and response curve controls, and the throttle lever can be calibrated. Changes are saved in the browser; "Reset controls to defaults" restores them. `?gamepad=debug` in the URL shows every raw axis and button, for working out another controller's layout.

### HUD

- **VEL:** velocity along the ship's own axes (forward, right, up): what to watch when docking.
- **STOP:** burn time to stop with the main or retro engines, and the Δv needed; warns when the remaining Δv is not enough.
- **Markers:** + nose, ⊕ direction of motion, ⊗ opposite (amber), ◇ target (blue); when off screen, an arrow at the screen edge points to them.
- **RCS plumes** on the hull show which thrusters fire; **motion dust** (switchable) shows slow drift.

## Debug options

- `?workers=N` in the URL overrides the worker count, for testing and tuning.
- The browser console logs the GPU backend, adapter, and worker budget at startup.

## Author

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)

## License

[MIT](LICENSE) © 2026 Panos Vasilopoulos. Third-party assets keep their own licenses, listed in `ASSETS.md`.
