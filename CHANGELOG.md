# Changelog

All notable changes to VIS are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The VIS *format* has its own version, documented in [docs/SPEC.md](docs/SPEC.md).

## [Unreleased]

## [0.2.0] - 2026-11-12

First public release.

### Added
- English as the default locale for error messages, fixes and rendered labels; Spanish stays available with `lang: 'es'`, `--lang es`, `VIS_LANG=es` or a Spanish system locale.
- English format keywords: `warn`/`bad` for KPIs, `done`/`in progress`/`pending`/`late`/`blocked` for timelines, `@date`/`@text`/`@range` for decisions. The Spanish keywords keep working as aliases.
- `vis --help` with per-command usage and documented exit codes.
- Format specification (`docs/SPEC.md`), a system-prompt cheat sheet for agents (`docs/AGENT_PROMPT.md`), and English and Spanish READMEs.
- `npm run verify-vendor` checks the vendored engines against their recorded hashes.
- Continuous integration on Linux and macOS with Node 22, 24 and 26, a release workflow with npm provenance, contributing guide, code of conduct, security policy, issue and pull request templates.
- ESM entry (`index.mjs`) with named exports, and the `@casiangel333/vis/engines`, `@casiangel333/vis/whatsapp` and `@casiangel333/vis/browser` entry points.
- `allowHTML` option and `--allow-html` flag: `html` blocks render as code unless enabled.
- `E_REMOTE`: Vega-Lite specs that ask for remote data are rejected, and the Vega loader refuses requests, unless `allowRemoteData` is set.
- `C_IMAGE` audit problem for images that don't load.
- Image paths in `sheet` and `compare` that are URLs are rejected (`E_REMOTE`) unless `allowRemoteData` is set, and `vega-lite` specs with links (`href`) are rejected.
- `-o -` writes the rendered output to stdout.

### Changed
- Public API, CLI flags, folders and file names are in English (`adapters/`, `clients/web/`, `examples/`, `lib/browser.mjs`). The Spanish CLI flags (`--ancho`, `--partir`, `--pie corto`, `--theme claro|oscuro`, ...) still work.
- Error codes are in English (`E_FIELD`, `E_THOUSANDS`, `E_UNCLOSED`, ...) and error objects use `message` instead of `msg`.
- The WhatsApp package writes `manifest.json` in format `vis-whatsapp/2` with English keys.
- Third-party notices moved to `THIRD_PARTY_NOTICES.md`.
- Mermaid is no longer bundled: install the `mermaid` package or set `VIS_MERMAID`. Without it, `mermaid` blocks render as code with an `E_ENGINE` note printed by the CLI.
- The headless browser driver talks to Chrome over a pipe instead of a debugging port.

### Fixed
- Numbers that mix separators, and the Unicode minus sign, are read correctly or rejected with a clear fix.
- Quoted CSV cells with commas and escaped quotes.
- Fences follow CommonMark: up to three spaces of indent, backticks or tildes, closing fence at least as long.
- Vega number and date formats follow the language of each chart instead of a global setting.
- `mount` recognizes Spanish block names.
- Unknown CLI flags are errors instead of being ignored.
- Text output goes to a `.txt` next to the input and never overwrites the input file.
- An empty standard input prints the usage instead of hanging.
- `--width` means the same content width in every command.
- Browser tabs, the Chrome process and temporary folders are cleaned up on errors.
- Images in `sheet` and `compare` resolve against the document's folder in PNG output and audits.
- WhatsApp captions no longer print `undefined` for late or blocked milestones.
- Chart alt text follows the selected language.
- A `vega-lite` spec with an `href` channel no longer crashes the process.
- Markdown links no longer take quadratic time on long runs of brackets.
- Code fences such as `shell`, `csharp` or `compose` are no longer reported as misspelled VIS types.
- A `vega-lite` spec that compiles but fails while drawing shows an `E_VEGA` error box instead of stopping the render.
- `render --to html` of a document with Mermaid keeps its decision forms working.
- Engine scripts and pages load from paths that contain `#` or spaces, and on Windows.

## [0.1.0] - 2026-11-04

Internal release, not published: parser, validator, HTML/SVG/PNG/text renderers, visual audits in Chromium, WhatsApp adapter, strict-CSP web client and Claude Code widget hook.

[Unreleased]: https://github.com/casiangel333/vis/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/casiangel333/vis/releases/tag/v0.2.0
