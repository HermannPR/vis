# Contributing to VIS

Thanks for helping. VIS is small on purpose, so the bar for new features is "an agent will write this often and get it right". Fixes, clearer error messages, better rendering on phones and new examples are always welcome.

## Ground rules

- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security problems go through a private report, never a public issue. See [SECURITY.md](SECURITY.md).
- Use made-up data in examples, tests and screenshots. No real customers, names, prices or file paths.

## Getting set up

You need Node.js 22 or newer. PNG output, the `audit` command and the browser tests also need Chrome, Chromium or Brave; set `VIS_CHROME` if VIS can't find it.

```bash
git clone https://github.com/casiangel333/vis.git
cd vis
npm test
```

There is nothing to install: VIS has no runtime dependencies and the rendering engines are vendored in `vendor/`. Without a browser the browser tests are skipped, not failed.

## Project layout

| Path | What lives there |
|---|---|
| `vis.js` | The whole library: parser, validator, Vega-Lite compiler, HTML/SVG/text renderers, themes, strings in `en` and `es`. One UMD file that works in Node and in the browser. |
| `bin/vis.mjs` | The command line tool. |
| `index.mjs` | ESM entry with named exports for `vis.js`. |
| `lib/browser.mjs` | A tiny headless Chrome driver (DevTools protocol over a pipe) for PNG output and visual audits. |
| `lib/engines.mjs` | Loads the vendored Vega and Vega-Lite in Node. |
| `lib/lang.mjs` | Picks the CLI language from flags, environment and system locale. |
| `scripts/verify-vendor.mjs` | Checks the vendored files against the hashes in THIRD_PARTY_NOTICES.md. |
| `adapters/` | Integrations: the WhatsApp package builder and a Claude Code widget hook. |
| `clients/web/` | A drop-in client for chat apps with a strict Content Security Policy. |
| `examples/` | Documents used by the docs and the tests. |
| `test/` | `node:test` suites. |
| `vendor/`, `licenses/` | Third-party engines and their licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). |

## Making a change

1. Open an issue first for anything bigger than a bug fix, so we can agree on the shape before you write code.
2. Create a branch, make the change, and add a test that fails without it.
3. Run `npm test`. For visual changes, also run `node bin/vis.mjs audit examples/demo.md` and attach before/after PNGs to the pull request.
4. Add a line to `CHANGELOG.md` under **Unreleased**.
5. Open a pull request using the template.

### Changing the format

The format is the product. A change to a block, attribute or keyword must:

- be described in [`docs/SPEC.md`](docs/SPEC.md), including the error message for its most likely mistakes;
- keep existing documents valid (add, don't rename; keep old spellings as aliases);
- work in every output: HTML, SVG, PNG, plain text and WhatsApp;
- come with strings in both locales, `en` and `es`.

Use the **Format change proposal** issue template to start the discussion.

### Error messages

Agents read these messages and fix their own output, so they matter as much as the rendering. Each error has a stable `code` (`E_FIELD`, `E_CSV_NUM`, ...), a `message` that says what is wrong, and a `fix` that says exactly what to write instead. Never change a code; add a new one.

### Adding a locale

All user-facing strings live in one table in `vis.js`. Copy the `en` entries, translate them, add tests that render `examples/demo.md` in the new locale, and list the locale in the README.

## Style

- Plain modern JavaScript, no build step, no runtime dependencies. Node built-ins only in `bin/`, `lib/` and `adapters/`.
- Keep `vis.js` working when loaded with a plain `<script>` tag.
- Anything that ends up in HTML must go through `escapeHTML` or the DOM allowlist in the web client.

## Commit messages

Short imperative subject in English (`fix: keep donut labels inside the canvas`), with a body when the reason isn't obvious. We loosely follow [Conventional Commits](https://www.conventionalcommits.org/) so the changelog is easy to write.

## Releases

Maintainers cut releases: bump `version` in `package.json` and `VERSION` in `vis.js`, move the **Unreleased** notes in `CHANGELOG.md` under the new version, tag `vX.Y.Z` and publish. VIS follows [Semantic Versioning](https://semver.org/); while it is `0.x`, minor versions may change the API, but documents that validate keep validating.
