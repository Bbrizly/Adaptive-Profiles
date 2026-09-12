# Deployment

Adaptive Profiles has two deployment modes:

1. **Production:** Cloudflare Worker + static assets. This enables the API and website-created submission pull requests.
2. **Read-only preview:** GitHub Pages. This is useful for visual review and demos before Cloudflare is configured.

The canonical registry is GitHub in both modes.

## Production: Cloudflare Worker

The repository includes `worker/index.js`, `site/`, and `wrangler.jsonc`.

### Required GitHub credential

Create a fine-grained GitHub token scoped **only** to `Bbrizly/Adaptive-Profiles` with:

- Contents: read/write
- Pull requests: read/write

Store it as a Worker secret:

```bash
npx wrangler secret put GITHUB_TOKEN
```

A GitHub App is the preferred later replacement if contribution volume grows. Do not give the Worker access to unrelated repositories.

### Optional Turnstile

For public anonymous submissions:

1. Create a Cloudflare Turnstile widget for the production hostname.
2. Set `TURNSTILE_SITE_KEY` as a normal Worker variable.
3. Store the secret:

```bash
npx wrangler secret put TURNSTILE_SECRET
```

### Origin restriction

Set `PUBLIC_ORIGIN` to the final HTTPS site origin. The submission endpoint rejects cross-origin website submissions.

### Deploy

```bash
npm install
npm run check
npm run deploy
```

Wrangler deploys the Worker and `site/` assets together. `/api/*` runs through the Worker; normal page requests are served by the static asset binding with SPA fallback.

Never commit `.dev.vars`, `.env`, GitHub tokens, Turnstile secrets, or other credentials.

## Local production-like run

```bash
npm install
npm run check
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`.

Read-only browsing works without a token because the API reads public GitHub data. To test the submission bridge, create `.dev.vars`:

```text
GITHUB_TOKEN=<fine-grained repository token>
TURNSTILE_SECRET=<optional>
```

## Read-only GitHub Pages preview

The manual `.github/workflows/pages-preview.yml` workflow deploys only the contents of `site/`.

The preview intentionally:

- reads `generated/index.json` directly from raw GitHub
- uses hash routing so project Pages paths refresh safely
- links profile snapshots directly to raw GitHub
- disables website profile submission because no Worker credential exists
- keeps `Open in QCM` available for accepted profiles

### One-time GitHub setting

In the repository UI:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Then run:

**Actions → Read-only site preview → Run workflow**

GitHub will expose the deployment URL in the workflow environment.

## GitHub validation and index publishing

Every pull request runs `.github/workflows/validate.yml`.

On pushes to `main`:

1. source data is validated
2. Worker regression/security tests run
3. `generated/index.json` is rebuilt deterministically
4. if source content changed, the generated index is committed back to `main`

The generated file is a read model, not a second source of truth.

## Immediate read fallback

If the Worker is unavailable, read-only clients can use:

```text
https://raw.githubusercontent.com/Bbrizly/Adaptive-Profiles/main/generated/index.json
```

QCM additionally maintains its own last-good local index and verified CSV snapshot cache.

## QCM production dependency

`Open in QCM` requires a QuadStick Config Manager release containing the Adaptive Profiles integration on QCM `main`.

QCM's existing release workflow publishes cross-platform builds when a `vX.Y.Z` tag is pushed. See `docs/WORKFLOWS.md` for the exact release handoff.
