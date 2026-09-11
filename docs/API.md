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
