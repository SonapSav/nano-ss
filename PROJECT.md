# nano-ss — Project Overview

## Purpose

_TBD — describe what nano-ss is and the problem it solves._

## Goals

- _TBD_

## Non-Goals

- _TBD_

## Tech Stack

_TBD — language, frameworks, and key dependencies._

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

### D-001: Define project purpose and scope

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** The repo is set up, but what nano-ss is and the problem it solves are not defined yet.
- **Action expected (Panos):** Describe the purpose, goals, and non-goals so the sections above can be filled in.

### D-002: Choose tech stack

- **Raised:** 2026-10-14
- **Owner:** Panos
- **Status:** Open
- **Context:** No language or framework chosen yet. `.gitignore` is currently generic and the build/test commands in `CLAUDE.md` are TBD.
- **Action expected (Panos):** Pick the language and main frameworks. Then `.gitignore`, `README.md`, and `CLAUDE.md` get tailored to them.

## Resolved Decisions

### D-003: Changelog approach

- **Raised:** 2026-10-14
- **Decided:** 2026-10-14
- **Owner:** Panos
- **Outcome:** No `CHANGELOG.md` for now; git history with type-prefixed commit messages is the record. Create a versioned, human-readable `CHANGELOG.md` (Keep a Changelog format) at the first release or when a second developer joins, generated from git history. Rule recorded in `CLAUDE.md`.

## Roadmap

- [x] Initialize repository
- [ ] Define purpose and scope
- [ ] Choose tech stack
- [ ] First working version

## Owner

Panos Vasilopoulos — [sonap.sav@gmail.com](mailto:sonap.sav@gmail.com)
