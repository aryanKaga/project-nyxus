# Vulnerability Check Report

## Overview
This report provides the findings from checking the repository for vulnerabilities. Due to hitting the configured graph step limit, this assessment reflects the evidence gathered up to that point. No further repository queries were run, and some details remain unverified.

---

## Findings Summary

### 1. Dependency Vulnerabilities (`npm audit`)
An audit of the project dependencies (`website/package.json`) revealed **5 vulnerabilities** (4 moderate, 1 high):

| Package | Affected Versions | Severity | Description / Advisory | Fix / Impact Notes |
| :--- | :--- | :--- | :--- | :--- |
| **esbuild** | `<=0.24.2` | Moderate | Enables any website to send requests to the development server and read the response ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) | Fix available via `npm audit fix --force` (installs `vite@8.3.5`, a breaking change). |
| **vite** | `<=6.4.3` | — | Depends on vulnerable versions of `esbuild`. | Part of the `esbuild` advisory chain. |
| **postcss-selector-parser** | `<7.1.6` | Moderate | Quadratic complexity in flat selector parsing allows CPU exhaustion ([GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)) | Fix available via `npm audit fix --force` (installs `tailwindcss@4.3.3`, a breaking change). |
| **postcss-nested** | `2.0.3 - 6.2.0` | — | Depends on vulnerable versions of `postcss-selector-parser`. | Part of the PostCSS advisory chain. |
| **tailwindcss** | `3.4.19` (and others) | — | Depends on vulnerable versions of `postcss-nested` and `postcss-selector-parser`. | Core dependency listed in `website/package.json`. |

---

### 2. Project Scope & Hotspots
The repository analysis scoped **19 files** and identified key graph-central modules (hotspots) for structural review:

* **`website/src/App.jsx`** (Fan-in: 1, Fan-out: 10, Score: 12)
* **`website/index.html`** (Fan-in: 0, Fan-out: 6, Score: 6)
* **`website/src/components/AuthModal.jsx`** (Fan-in: 1, Fan-out: 3, Score: 5)

Additional tracked files in scope include:
- `website/package.json`
- `website/package-lock.json`
- `website/vite.config.js`
- `website/tailwind.config.js`
- `website/postcss.config.js`
- Various React components inside `website/src/components/`

---

## Unverified Items
Because the configured graph step limit was reached during execution:
* Further repository details and deep code-level security analysis on the identified hotspots (`website/src/App.jsx`, `website/index.html`, `website/src/components/AuthModal.jsx`) could not be fully checked or verified.