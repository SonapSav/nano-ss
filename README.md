# nano-ss

A realistic space flight simulator set in the real solar system at real scale, built with Three.js. Fly a spaceplane between planets with a hyperdrive, land at spacedromes, and dock with other spacecraft, using the keyboard or a Thrustmaster T.Flight HOTAS X. See [PROJECT.md](PROJECT.md) for scope, decisions, and roadmap.

**Status:** Stage 2 (input): realistic 6-axis flight in empty space with keyboard and Thrustmaster T.Flight HOTAS X, fully rebindable.

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
| Z / X | Full throttle / cut |
| T | Assist: off, kill rotation, hold attitude |
| C | Chase / nose camera |
| Mouse drag, wheel | Orbit and zoom the chase camera |
| F | Fullscreen (also lets the sim receive Ctrl+W, Ctrl+N, Ctrl+T) |
| R | Reset ship: refuel and return to the start |
| F3 | Performance overlay |
| Esc | Pause and settings (frame rate, motion dust, controls) |

Rotation is realistic: a spin keeps going until thrusters stop it. Assist modes only manage rotation; nothing ever slows the ship down for you.

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
| Throttle button 5 | Switch camera |
| ST / SE | Pause and settings / performance overlay |

For the throttle, whichever moved last wins: Z, X, Shift, Ctrl change it, and moving the lever takes over again.

### Rebinding

Esc (or ST) opens the pause panel: click any key, axis, or button binding and press or move the new one. HOTAS axes have invert, dead zone, and response curve controls, and the throttle lever can be calibrated. Changes are saved in the browser; "Reset controls to defaults" restores them. `?gamepad=debug` in the URL shows every raw axis and button, for working out another controller's layout.

### HUD

- **VEL:** velocity along the ship's own axes (forward, right, up): what to watch when docking.
- **RCS plumes** on the hull show which thrusters fire; **motion dust** (switchable) shows slow drift.

## Debug options

- `?workers=N` in the URL overrides the worker count, for testing and tuning.
- The browser console logs the GPU backend, adapter, and worker budget at startup.

## Author

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)

## License

[MIT](LICENSE) © 2026 Panos Vasilopoulos. Third-party assets keep their own licenses, listed in `ASSETS.md`.
