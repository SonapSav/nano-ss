# nano-ss

A realistic space flight simulator set in the real solar system at real scale, built with Three.js. Fly a spaceplane between planets with a hyperdrive, land at spacedromes, and dock with other spacecraft, using the keyboard or a Thrustmaster T.Flight HOTAS X. See [PROJECT.md](PROJECT.md) for scope, decisions, and roadmap.

**Status:** Stage 0 (project setup). The app currently shows a placeholder scene that proves the WebGPU render pipeline.

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

## Debug options

- `?workers=N` in the URL overrides the worker count, for testing and tuning.
- The browser console logs the GPU backend, adapter, and worker budget at startup.

## Author

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)

## License

[MIT](LICENSE) © 2026 Panos Vasilopoulos. Third-party assets keep their own licenses, listed in `ASSETS.md`.
