# Architecture

## Source of truth

GitHub `main` is the canonical public registry. Git provides history, review, rollback and durable storage without inventing a database for content that changes relatively infrequently.

## Data layers

### Game knowledge

A game defines semantic actions such as `attack`, `jump`, and `inventory`. Default control schemes live separately under each game, for example `Attack -> Mouse 1` on PC.

### Device knowledge

Adaptive devices define available inputs/capabilities independently of any game.

### Profiles

A profile belongs to a game/platform/device combination. Its preferred representation is `adaptive input -> semantic game action`. Imported legacy QuadStick CSVs may initially be `unmapped`; the frozen CSV remains installable while semantic mappings are curated later.

## Runtime

- Static website: Cloudflare Workers Static Assets.
- API/submission bridge: a small Cloudflare Worker.
- Canonical content: this repository.
- Generated read model: `generated/index.json`.
- QCM: a client of the public API, with a raw-GitHub index fallback.

No D1/R2/database is required for V1.

## Submission flow

1. Contributor chooses game, platform and adaptive device.
2. They provide a public Google Sheet URL or one small CSV.
3. The Worker validates metadata, source, size, origin, Turnstile (when configured), and duplicate IDs.
4. Google Sheets are fetched only from the strict `docs.google.com/spreadsheets/d/...` form and converted to CSV.
5. The Worker creates a short-lived submission branch in GitHub.
6. It commits `profile.json` and `profile.csv`.
7. It opens a pull request.
8. GitHub Actions validates the full registry and deterministic index.
9. A maintainer merges the PR.
10. The website/API sees the new profile through `generated/index.json`.

## What GitHub is not

Do not use Git commits for page views, analytics, sessions, comments, notifications, likes, or other high-frequency mutable state. If those features become necessary, they can use a real database without changing the canonical registry format.
