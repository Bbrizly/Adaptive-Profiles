# Adaptive Profiles

## Compatibility repository

The active application is moving to `Bbrizly/Adaptive-Profiles-App`, and the canonical public registry is `Bbrizly/Adaptive-Profiles-Registry`. This repository remains public and is retained for compatibility with already-shipped QuadStick Config Manager releases.

Older clients depend on these exact raw paths, which must remain available:

- `generated/index.json`
- `data/profiles/**`

New registry changes are mirrored here as derived compatibility artifacts. Do not add private application source or remove these paths.

Adaptive Profiles is a public, Git-backed registry for adaptive gaming control profiles.

It turns scattered spreadsheets and forum links into three clean, reusable layers:

1. **Game knowledge** — semantic actions and verified platform defaults such as `Attack → Mouse 1`.
2. **Adaptive devices** — stable input vocabularies for hardware such as QuadStick.
3. **Community profiles** — reviewed mappings and immutable CSV snapshots that can be opened safely in QCM.

The canonical registry lives in GitHub. Cloudflare is only the website/API/submission bridge, so the public data remains portable, reviewable, diffable, and recoverable without a proprietary database.

## What works now

- Browse games, verified controls, adaptive devices, and accepted profiles.
- Search/filter profiles by game, device, platform, title, description, and tags.
- Preserve Google Sheets as provenance while freezing the reviewed CSV in Git.
- Submit a public Google Sheet or CSV through a structured website flow that creates a GitHub pull request.
- Validate contributions in CI before merge.
- Deterministically regenerate `generated/index.json` after accepted content changes.
- Read the registry through `/api/v1` or directly from raw GitHub.
- Open a profile through `qcm://profile/<registry-id>` in QuadStick Config Manager.
- QCM verifies the reviewed CSV SHA-256 and opens its normal editor before the user decides whether to save or install anything.

## Run it locally

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/Bbrizly/Adaptive-Profiles.git
cd Adaptive-Profiles
npm install
npm run check
npm run dev
```

Open the local URL printed by Wrangler, normally `http://localhost:8787`.

Read-only browsing needs no secret. To exercise website-created pull requests locally, add a gitignored `.dev.vars` containing a fine-grained `GITHUB_TOKEN` scoped only to this repository.

## Main workflows

```text
Browse
Website → profile → qcm:// link → QCM → verified GitHub CSV → editor

Contribute
Google Sheet / CSV → Worker validation → GitHub PR → CI → review → merge → regenerated index

Read
Git source → generated/index.json → Worker API / website / QCM
```

See [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) for the complete operational map, local-run instructions, outage behavior, security boundaries, GitHub Pages preview, and QCM release flow.

## Project principles

- Public, portable data.
- Git is the V1 canonical database; dynamic infrastructure is added only when a feature genuinely needs it.
- No arbitrary file hosting.
- No guessed semantic mappings from opaque CSV files.
- Every accepted change is reviewable, versioned, diffable, and reversible.
- Google Sheets remain supported as import provenance, but accepted profiles keep a frozen reviewed snapshot.
- QCM and third-party clients consume the same public model.
- **No patient records, diagnoses, clinical notes, contact information, or other health information.**

## Repository map

```text
data/                 canonical game, device, and profile content
generated/index.json  deterministic read model
schemas/              public data contracts
site/                 frontend
worker/               Cloudflare read API + submission bridge
openapi/              API contract
tools/                validation/index generation
tests/                Worker/security regression tests
docs/                 architecture, deployment, workflows
```

## Documentation

- [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) — end-to-end product and operator workflows
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and boundaries
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Cloudflare + preview deployment
- [`docs/API.md`](docs/API.md) — public read API
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution model
- [`SECURITY.md`](SECURITY.md) — public-data and security boundary
