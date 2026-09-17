# Public API

V1 is intentionally read-heavy and database-free.

## Read endpoints

- `GET /api/v1/health`
- `GET /api/v1/config`
- `GET /api/v1/index`
- `GET /api/v1/games`
- `GET /api/v1/games/:id`
- `GET /api/v1/devices`
- `GET /api/v1/devices/:id`
- `GET /api/v1/profiles`
- `GET /api/v1/profiles/:id`
- `GET /api/v1/search?q=...`

The same data is always recoverable directly from `generated/index.json` on GitHub.

## Submission endpoint

`POST /api/v1/submissions/profile` accepts `multipart/form-data` with structured fields and either a `csv` file or `googleSheetUrl`.

The endpoint creates a GitHub pull request. It does not write directly to `main`.

## Stability

`/api/v1` is the compatibility boundary. Clients should ignore response fields they do not understand, but should not rely on undocumented fields.

## V2

The redesigned site uses `/api/v2`. It exposes generic `targets` with `kind: game | software`, plus `/games`, `/software`, `/devices`, `/profiles`, `/search`, and reviewed CSV links. V1 remains unchanged for released clients. New submissions use `POST /api/v2/submissions/profiles`; update suggestions use `POST /api/v2/profiles/:id/proposals` and must include the expected revision and snapshot SHA-256 so stale proposals are rejected.
