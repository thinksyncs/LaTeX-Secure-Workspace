# OpenSSF self-assessment

Project: [14764](https://www.bestpractices.dev/en/projects/14764).

This is a draft self-assessment, not an independent certification or a claim that the extension is free of vulnerabilities. On 2026-09-24 the public badge showed "in progress 99%". README embeds the live badge so its displayed status can update. Prepared answers are not evidence that the website has saved them.

## Evidence and import

[`.bestpractices.json`](../.bestpractices.json) proposes 47 answers (46 Met and 1 N/A). Each has a justification and public evidence URL. Unknown answers are omitted, not replaced with Met or N/A. Most source links pin the inspected revision `df86a3ebc1c18979fbb14f3542fdd286d3950496`; reassess after material changes.

OpenSSF supports [repository answer proposals](https://github.com/ossf/best-practices-badge/blob/main/docs/bestpractices-json.md) and [edit URLs with proposed values](https://github.com/ossf/best-practices-badge/blob/main/docs/automation-proposals.md). Proposals do not save themselves or override reviewed answers by default. The repository-file importer handles criterion statuses and justifications; set basic metadata in the form separately.

After this file reaches the default branch, open the [Passing form with reanalysis](https://www.bestpractices.dev/en/projects/14764/passing/edit?reanalyze=1). Review the proposals and remaining unknowns before saving. Use **Save (and continue)** to rerun repository analysis when needed. Read back the public JSON after saving; do not infer completion from this file or a green CI run.

Basic metadata:

- Name: LaTeX Workspace Security
- Description: A VS Code extension for LaTeX editing, explicit builds and integrated PDF preview. This independent LaTeX Workshop fork supports approved local TeX or optional Docker isolation, with no hosted compiler or document-upload service. Local TeX is not sandboxed.
- License: MIT (third-party notices remain in NOTICE).
- Implementation languages: TypeScript, JavaScript, Python, PowerShell, Shell.

## Pending evidence

- `release_notes_vulns`: No published repository advisories were returned on 2026-09-23. That does not establish that every externally assigned identifier is covered by release notes.
- `report_responses`: The public issue tracker returned no issues. Responses on other channels have not been checked; no response-rate claim is made.
- `enhancement_responses`: The public issue tracker returned no issues. Responses on other channels have not been checked.
- `vulnerability_report_response`: The five-business-day policy is a target, not evidence of actual response times. Maintainer confirmation for all reports in the last six months is pending.
- `test_most`: The configured coverage gate is 33% of lines, not evidence that most branches, input fields and functionality are covered.
- `test_policy`: Recent changes add tests, but an explicit maintainer policy for all major new functionality has not been confirmed.
- `tests_documented_added`: Contribution instructions explain how to run tests but do not explicitly require tests for major new functionality.
- `know_secure_design`: Requires a primary developer to confirm knowledge of all design principles specified by OpenSSF. Source controls alone do not establish personal knowledge.
- `know_common_errors`: Requires primary-developer confirmation of knowledge of relevant vulnerability classes and mitigations.
- `crypto_keylength`: Pinned SHA-256 was inspected; all cryptographic key-length and TLS-runtime settings were not reviewed.
- `crypto_working`: A complete inventory of host/runtime/dependency cryptographic mechanisms was not reviewed.
- `crypto_weaknesses`: Runtime/dependency cryptographic algorithm and mode choices were not fully reviewed.
- `crypto_pfs`: Perfect forward secrecy of runtime TLS sessions was not verified.
- `crypto_random`: Randomness for all runtime-generated cryptographic keys/nonces was not reviewed.
- `vulnerabilities_fixed_60_days`: Current dependency and CodeQL alert lists were empty, but a complete history of public disclosures and affected versions was not reviewed.
- `vulnerabilities_critical_fixed`: The public remediation policy exists, but actual response/fix history for all critical reports requires maintainer confirmation.
- `no_leaked_credentials`: GitHub returned zero open secret-scanning alerts on 2026-09-23. This alone is not a complete review of valid credentials across repository history.
- `static_analysis_fixed`: No open CodeQL alerts were returned on 2026-09-23. Timeliness for previously confirmed findings was not reviewed.
- `dynamic_analysis_fixed`: Fuzz tests and regressions exist, but a complete record of confirmed findings and remediation times was not reviewed.
- `dynamic_analysis_unsafe`: The project-owned source uses managed languages, but the VSIX also bundles PDF.js WebAssembly components. Their memory-safety analysis coverage was not checked, so N/A is not asserted.

## Checks and limits

Local compile and ESLint passed. Node tests passed (60 passed, 6 platform-specific skips). Proposal fields and N/A eligibility were checked against the official 67-criterion schema. The JSON is explicitly excluded from VSIX packaging.

On 2026-09-23 the GitHub APIs returned no open CodeQL, Dependabot or secret-scanning alerts and no published repository security advisories. These are point-in-time observations, not a complete security audit or proof of absence. No credentials were printed or validated against external services.

Build/test runs for Linux, macOS and Windows, CodeQL, npm Audit, Fuzzing and Docker secure builds passed on the inspected revision. However, [Managed TeX installation run 35817047877](https://github.com/thinksyncs/LaTeX-Secure-Workspace/actions/runs/35817047877) failed in the Japanese-named non-admin account: the PowerShell private-storage check was killed with SIGTERM and no diagnostic output. This is tracked in Beads as `LaTeX-Secure-Workspace-p40`; it does not establish an ACL defect. Do not describe this revision as having all CI green.

OpenSSF follow-up remains `LaTeX-Secure-Workspace-a7u`. The live README badge has been added; review of pending evidence and completion of the self-assessment remain outstanding. No Marketplace release is part of this documentation change.
