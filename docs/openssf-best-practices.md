# OpenSSF Best Practices Badge

This repository is ready for OpenSSF Best Practices Badge enrollment, but the badge itself is activated on [bestpractices.dev](https://www.bestpractices.dev/) rather than from GitHub alone.

## What Is Already In Place

- Public source repository, license, and README
- `SECURITY.md` with a disclosure contact and response targets
- `CONTRIBUTING.md` for contribution guidance
- CI, code scanning, dependency review, and Scorecard workflows
- Fuzzing workflow and fuzz tests
- Branch protection on `master`

## Repo Files That Support The Badge

- [`README.md`](../README.md)
- [`SECURITY.md`](../SECURITY.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- [`SUPPORT.md`](../SUPPORT.md)
- [`/.github/CODEOWNERS`](../.github/CODEOWNERS)
- [`/.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md)

## Manual Activation Steps

1. Sign in at [bestpractices.dev](https://www.bestpractices.dev/).
2. Choose `Add New Project`.
3. Register this repository: `https://github.com/thinksyncs/LaTeX-Secure-Workspace`.
4. Complete the questionnaire using this repository's docs and policies.
5. Once the project page is created, copy the assigned project ID.
6. Add the live badge to `README.md` using the exact markup shown on the project page.

The badge markup format shown by the OpenSSF Best Practices site is:

```md
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/<project-id>/badge)](https://www.bestpractices.dev/projects/<project-id>)
```

## Notes

- There is no active project entry for this repository until someone creates it on `bestpractices.dev`.
- The Scorecard badge does not require a manual project ID and can be displayed directly from the Scorecard API.
