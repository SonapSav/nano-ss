# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

nano-ss is a new project in early setup. See `PROJECT.md` for purpose, scope, and roadmap, and keep it updated as decisions are made.

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

## Commands

_TBD — add build, test, lint, and run commands once the stack is chosen._
