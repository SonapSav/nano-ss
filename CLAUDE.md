# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

nano-ss is a realistic space flight game (TypeScript, Vite, Three.js WebGPU, nginx over HTTPS in Docker). See `PROJECT.md` for purpose, scope, and roadmap, and keep it updated as decisions are made.

## Planning and Open Decisions

`PROJECT.md` is the planning record. Whenever something is discussed and a decision can't be made in that conversation, add it under **Open Decisions** in `PROJECT.md`:

- Give it the next ID (`D-NNN`) and a short title.
- Record the date it was discussed (absolute date, `YYYY-MM-DD`).
- Name the owner who must decide or act. Currently that is always **Panos** (sole developer). Other developers may join later, so always name the owner explicitly.
- Note the context and the specific actions expected from the owner.
- When an item is decided, move it to **Resolved Decisions** with the outcome and the date it was decided.

## Repository

- Remote: https://github.com/SonapSav/nano-ss.git (**public** — never commit secrets, credentials, or `.env` files)
- Default branch: `main`
- Commit identity for this repo (set in local git config): `Panos Vasilopoulos <sonap.sav@gmail.com>`
- Push over HTTPS so the `SonapSav` GitHub account is used (SSH to `github.com` authenticates as a different account)

## Conventions

- Keep `README.md`, `PROJECT.md`, and `.gitignore` in sync with the chosen tech stack once one is selected.
- Commit messages: short imperative summary line with a type prefix (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), optional body explaining why. These messages are the change history until a changelog exists.

## Changelog

- Do not maintain a `CHANGELOG.md` for now, and never log individual commits or hashes in a file; git history is the record.
- Create `CHANGELOG.md` (Keep a Changelog format, grouped by version, human-readable summaries) when the first version/release is cut or a second developer joins. Generate it from git history (e.g. `/changelog-gen`).
- Decisions and their rationale belong in `PROJECT.md`, not the changelog.

## Environment

- **All tooling runs in Docker** (D-030), so the project transfers to any machine with Docker, git, make, and Chromium. Use `make` targets or `docker compose run --rm dev …`. Never run `pnpm`, `node`, or `mkcert` on the host (the host's Node is Debian's v20 and is not used).
- Package manager: pnpm, version pinned in `package.json` (`packageManager`) and in `docker/*.Dockerfile`; keep them in sync.
- Base images are pinned to exact tags in `docker/*.Dockerfile`.
- `certs/` holds the local CA and server certificate. Never commit it, print `certs/ca/rootCA-key.pem` or `certs/server.key`, or copy them into an image.
- TypeScript stays on 6.0.x until `typescript-eslint` supports TypeScript 7.

## Commands

| Command | Purpose |
|---|---|
| `make certs` | Create the local CA and HTTPS certificate |
| `make dev` | Dev server on `https://<host>:5173` |
| `make check` | Lint, format check, type check, unit tests (same as CI) |
| `make lint` / `make typecheck` / `make test` / `make format` | Single checks / formatting |
| `make scenery` | Download and rebuild game data (JPL ephemerides) into `public/data/` |
| `make build` | Build the production image |
| `make up` / `make down` / `make logs` | Production server on `https://<host>:8787` |
| `make shell` | Shell in the dev container |

Run `make check` before committing code changes.
