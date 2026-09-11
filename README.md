# Adaptive Profiles

Adaptive Profiles is a public, Git-backed registry for adaptive gaming control profiles.

The project keeps three things deliberately separate:

1. **Game knowledge** — semantic actions and each platform's default controls (for example, `Attack -> Mouse 1`).
2. **Adaptive devices** — the inputs and capabilities exposed by devices such as QuadStick.
3. **Profiles** — mappings from adaptive inputs to semantic game actions (for example, `Right Sip -> Attack`).

The canonical registry lives in this repository. A small Cloudflare Worker can provide the public API and convert validated website submissions into pull requests, while the website and QCM consume the generated registry index.

## Principles

- Public, portable data.
- No database required for canonical profiles.
- No arbitrary file hosting.
- Google Sheets remain supported as an import source, but accepted profiles keep a frozen CSV snapshot.
- Every accepted change is reviewable, versioned, diffable, and reversible through Git.
- QCM and third-party clients use the same public API/data model.
- No patient records, diagnoses, clinical notes, or other health information.

See `docs/ARCHITECTURE.md` for the system design and `CONTRIBUTING.md` for the submission model.
