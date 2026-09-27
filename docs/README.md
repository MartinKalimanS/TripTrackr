# docs

Long-form material that is not a specification. Specifications live in `specs/`; the
constitution lives in `.specify/memory/constitution.md`.

| Path                                                         | What it is                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`travelappblueprint.md`](./travelappblueprint.md)           | Original product blueprint. **Preserved verbatim — do not edit.**                                                             |
| [`travelappfullspec.md`](./travelappfullspec.md)             | Original full product specification. **Preserved verbatim — do not edit.**                                                    |
| [`legal/privacy-policy.md`](./legal/privacy-policy.md)       | Privacy policy source, specific to the data TripTrackr actually holds. Draft — counsel review, then publish at a public URL.  |
| [`legal/terms-of-service.md`](./legal/terms-of-service.md)   | Terms of service / EULA source, including subscription disclosures both stores require. Draft — counsel review, then publish. |
| [`legal/account-deletion.md`](./legal/account-deletion.md)   | Public account-deletion page (Google Play requires a web page; Apple requires the in-app path it describes). Draft.           |
| [`release/store-readiness.md`](./release/store-readiness.md) | Launch checklist: Apple, Google Play, EAS/third parties, backend. Every row has an owner; blocking rows gate submission.      |

Related, elsewhere in the repository:

- `infra/README.md` — running and deploying the backend; `infra/scripts/README.md` — backup and
  restore-rehearsal cadence.
- `specs/001-triptrackr-mvp/quickstart.md` — how to run and validate the product end to end.
- `.github/pull_request_template.md` — the review checklist every change goes through.

Conventions for files in this directory: Markdown, wrapped at 90 columns by Prettier (except the
two preserved originals), placeholders written as `[[PLACEHOLDER: …]]`, and a "Draft — review by
counsel" banner on anything legal until counsel has signed it off.
