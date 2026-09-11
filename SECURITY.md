# Security

Please report security problems privately to the repository owner rather than opening a public exploit report.

## Security model

- The repository contains public, non-sensitive profile data only.
- The submission service accepts structured metadata plus one small CSV, or a public `docs.google.com` spreadsheet URL.
- Google Sheet import uses a strict host/path allowlist; it is not a generic URL fetcher.
- Production GitHub credentials live only in Cloudflare Worker secrets.
- The browser never receives repository write credentials.
- Pull requests are validated before merge.
- Anonymous submissions should use Turnstile and Worker rate limiting in production.
