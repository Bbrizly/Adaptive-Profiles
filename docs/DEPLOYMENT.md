# Deployment

## Cloudflare Worker

The repository includes a Worker and static site configured by `wrangler.jsonc`.

1. Create a fine-grained GitHub token scoped only to `Bbrizly/Adaptive-Profiles` with repository Contents read/write and Pull Requests read/write permissions. A GitHub App is the preferred later replacement when the project grows.
2. Store it as a Worker secret:
   `npx wrangler secret put GITHUB_TOKEN`
3. For production anonymous submissions, create a Cloudflare Turnstile widget and configure `TURNSTILE_SITE_KEY` as a normal variable and `TURNSTILE_SECRET` as a Worker secret.
4. Set `PUBLIC_ORIGIN` to the final site origin when using a custom domain.
5. Deploy with `npx wrangler deploy`.

Never commit `.dev.vars`, `.env`, GitHub tokens, or Turnstile secrets.

## GitHub validation

Every pull request runs `.github/workflows/validate.yml`. `generated/index.json` is deterministic and must match source data exactly.

## Immediate fallback

If the Worker is unavailable, read-only clients can use:
`https://raw.githubusercontent.com/Bbrizly/Adaptive-Profiles/main/generated/index.json`
