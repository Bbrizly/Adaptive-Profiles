# Contributing

Adaptive Profiles is intentionally structured. Canonical data is reviewed as code; the public website will create pull requests on a contributor's behalf.

## What belongs here

- Game definitions and semantic actions.
- Verified default control schemes with provenance.
- Adaptive device definitions.
- Adaptive profile metadata and a frozen CSV snapshot.

## What does not belong here

Never submit patient names, diagnoses, clinical notes, contact information, patient identifiers, credentials, executables, arbitrary attachments, or private files.

## Profile submissions

A profile directory contains exactly:

- `profile.json` — metadata and optional semantic mappings.
- `profile.csv` — the frozen QuadStick-compatible snapshot.

Profiles imported from a Google Sheet keep the public Sheet URL as provenance and also snapshot its CSV. Profiles may begin with `semanticStatus: "unmapped"`; semantic mappings can be added later in a reviewed PR.

## Canonical control changes

Default game controls affect many profiles. Changes must include a trustworthy source URL and should be reviewed more carefully than ordinary community profile additions.
