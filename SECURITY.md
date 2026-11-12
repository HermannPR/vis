# Security policy

## Supported versions

Only the latest release gets security fixes while VIS is in `0.x`.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/casiangel333/vis/security/advisories/new)).

Include the Markdown that triggers the problem, the command or API call, and what an attacker could do with it. We aim to reply within 7 days and to ship a fix or mitigation within 30 days for confirmed issues. We'll credit you in the advisory unless you prefer otherwise.

## What counts

VIS renders text that is often written by a language model, which may in turn have read untrusted input. So we treat the Markdown itself as untrusted. In scope:

- Script execution or HTML injection through any block, title, attribute, label or data value in `renderHTML`, `renderDocument`, `mount`, the SVG output or the web client.
- A document that makes the CLI or `lib/browser.mjs` read, write or fetch files or URLs outside what the command was asked to do.
- Ways around the web client's DOM allowlist or its strict Content Security Policy.
- Denial of service from a small document (for example, a few kilobytes that hang the parser or the renderer).

## Escape hatches (by design)

Some blocks exist for trusted authors and are limited by default:

- `html` renders as a code block unless the caller passes `allowHTML` (`--allow-html` in the CLI). Don't enable it for documents from untrusted sources.
- `vega-lite` accepts a full Vega-Lite spec. Remote `data.url` is rejected (`E_REMOTE`) and the Vega loader refuses every request unless the caller passes `allowRemoteData`; and the web client evaluates expressions with `vega-interpreter` instead of `new Function`, and links (`href`) are rejected; a hostile spec can still be slow to render.
- `sheet` and image paths in `compare` point to files. URLs are rejected (`E_REMOTE`) unless the caller passes `allowRemoteData`, so a document can't leak data through an image request. The web client never loads them. The CLI's browser page resolves them against the document's folder with a `file:` base URL, so a document can show any local image the user running the CLI can read; render documents from untrusted sources to text, or review image paths first.

The web client in `clients/web/` only renders `chart`, `kpi`, `progress`, `timeline`, `compare` and `decisions`; everything else is shown as a code block.

## Vendored engines

Vega, Vega-Lite and vega-interpreter are vendored at pinned versions with recorded hashes (`npm run verify-vendor` checks them). Mermaid is optional and comes from your own install (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). When upstream publishes an advisory that affects how VIS uses them, we upgrade and release.
