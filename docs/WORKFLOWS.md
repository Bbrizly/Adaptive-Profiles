# Adaptive Profiles workflows

This document is the operational map for the project. The public registry is deliberately split into durable Git-backed content and a thin website/API layer.

## 1. Browse a profile and open it in QCM

```text
Player
  ↓
Adaptive Profiles website
  ↓ chooses game / device / profile
Profile detail page
  ↓ Open in QCM
qcm://profile/<registry-id>
  ↓
QuadStick Config Manager
  ↓
loads generated/index.json
  ↓
resolves the accepted profile
  ↓
downloads the reviewed profile.csv snapshot
  ↓
verifies snapshot SHA-256
  ↓
opens QCM's normal editor
  ↓
player reviews it
  ↓
player decides whether to save / install
```

A website click never writes to a QuadStick. The deep link only asks QCM to open a reviewed registry profile in its editor.

If QCM does not receive the custom protocol, the website shows an install/update fallback and lets the user retry or copy the `qcm://` link.

## 2. Submit an existing Google Sheet

```text
Contributor
  ↓ Add profile
chooses game + platform + device
  ↓
pastes public docs.google.com spreadsheet URL
  ↓
Cloudflare Worker
  ├─ validates the exact Google hostname/path
  ├─ exports one CSV sheet
  ├─ enforces UTF-8 and size limits
  ├─ builds structured profile metadata
  ├─ computes SHA-256 for the CSV snapshot
  └─ creates a GitHub submission branch + pull request
             ↓
          GitHub CI
             ↓
       maintainer review
             ↓ merge
     canonical data on main
             ↓
GitHub Action rebuilds generated/index.json
             ↓
website / API / QCM see the accepted profile
```

The Google Sheet remains provenance. The accepted Git snapshot is what QCM later verifies and opens, so the profile survives if the original Sheet is edited or disappears.

## 3. Submit a CSV

The flow is identical to the Google Sheet workflow except the contributor supplies one UTF-8 `.csv` file directly. Generic uploads are not accepted.

The Worker limits CSVs to 128 KiB and canonical profile data remains plain reviewable Git content.

## 4. Add or change game knowledge

Game knowledge is not guessed from profile CSV files.

A maintainer adds or edits the game definition under `data/games/`, including:

- semantic actions such as `attack`, `jump`, or `inventory`
- supported platforms
- verified default control schemes
- source/provenance for those controls

Then:

```text
Pull request → registry validation → review → merge → generated index rebuild
```

This separation lets multiple adaptive devices reuse the same game meaning.

## 5. Add an adaptive device

A maintainer adds or edits a device definition under `data/devices/`.

A device definition describes stable adaptive inputs and capabilities. It does not contain game-specific mappings.

```text
Device definition → validation → merge → reusable across every game/profile
```

## 6. Semantic mapping lifecycle

Imported legacy profiles may begin with:

```json
"semanticStatus": "unmapped"
```

That is intentional. The project preserves the real CSV without inventing meaning.

A later reviewed contribution can curate mappings from game semantic actions to adaptive device inputs. Once verified, the profile can become `mapped` and the website can display the three-layer relationship:

```text
Game action → platform default → adaptive input
```

## 7. Registry read workflow

The Cloudflare Worker exposes `/api/v1` as the convenient read API. The website first tries the API and can fall back to the public generated GitHub index.

Canonical source:

```text
data/* on GitHub main
       ↓ deterministic build
generated/index.json
       ↓
Worker API / website / QCM
```

The API is not the database. Git is the canonical database for V1.

## 8. Outage behavior

### Worker unavailable

The website can read `generated/index.json` directly from `raw.githubusercontent.com`. Profile CSV links in the GitHub Pages preview also use raw GitHub directly.

### GitHub temporarily unavailable to QCM

QCM keeps the last valid registry index and verified profile snapshots in its local application cache. An invalid or hash-mismatched snapshot is never accepted as a fallback.

### Submission bridge unavailable

Browsing still works. The website reports that submissions are unavailable instead of accepting data into nowhere.

## 9. Security boundary

The public project may contain:

- games
- device definitions
- public adaptive profile metadata
- public Google Sheet provenance
- reviewed profile CSV snapshots
- contributor display names / optional GitHub usernames

It must never contain:

- patient names
- diagnoses
- clinical notes
- contact details
- medical records
- private identifiers
- other PHI / personal health data

Any future clinical product belongs in a separate tenantized system with a different privacy and security model.

## 10. Run locally

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/Bbrizly/Adaptive-Profiles.git
cd Adaptive-Profiles
npm install
npm run check
npm run dev
```

Open the local URL Wrangler prints, normally `http://localhost:8787`.

Read-only browsing works without a GitHub token. To test website-created pull requests locally, create a gitignored `.dev.vars` file:

```text
GITHUB_TOKEN=<fine-grained token>
TURNSTILE_SECRET=<optional local Turnstile secret>
```

The GitHub token should be scoped only to `Bbrizly/Adaptive-Profiles` with repository Contents read/write and Pull Requests read/write.

## 11. Production deployment

The preferred production deployment is the included Cloudflare Worker + static assets configuration:

```bash
npm install
npx wrangler secret put GITHUB_TOKEN
# optional when Turnstile is enabled:
npx wrangler secret put TURNSTILE_SECRET
npm run deploy
```

Set `PUBLIC_ORIGIN` and `TURNSTILE_SITE_KEY` in `wrangler.jsonc`/Cloudflare environment configuration for the final production origin.

## 12. Read-only GitHub Pages preview

The repository includes a manual `pages-preview.yml` workflow. This is intentionally a preview, not the submission backend.

1. In GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Open **Actions → Read-only site preview → Run workflow**.
3. GitHub deploys the `site/` folder under the project Pages URL.

The preview uses the raw GitHub registry automatically and disables profile submission because there is no Worker write bridge.

## 13. Release QCM deep-link support

The QCM integration already lives on `Quadstick-Config-Manager/main`. QCM releases are created by pushing a semantic version tag. The release workflow builds Windows, macOS Apple Silicon, macOS Intel, and Linux packages automatically.

After release notes for the next version exist:

```bash
git checkout main
git pull
git tag v1.8.1
git push origin v1.8.1
```

Once that release is published, users who install/update QCM can use `Open in QCM` directly from Adaptive Profiles.
