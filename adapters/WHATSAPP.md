# WhatsApp adapter

Turns a message with vis blocks into parts ready to send over WhatsApp, in order:

- **Charts and cards** (`chart`, `kpi`, `progress`, `timeline`, `compare`) go as phone PNGs: 1080 px wide, drawn at 320 CSS px (3.4x), because the chat shows images at about 260-300 pt and the text then reads without opening the image. Tall blocks are split into cards of up to 1600 px. Each image carries its short text version as the caption, in case it does not load: for data over time, the last value and the change since the first; for kpi, one icon per status, in the same order as the image.
- **Decisions** (`decisions`): one part per question. The numbered text always goes: first how to answer, then the options with the number apart (`*1* · Nov 12`). When the question fits WhatsApp's limits, the part also carries a poll.
- **Text**: Markdown becomes WhatsApp formatting (`*bold*`, `_italic_`, `~strike~`). Tables and code go monospaced. A text followed by an image goes inside that image's caption when it fits: one message less.
- **What is not drawn** stays as text, like in a chat: an invalid or unclosed block, `compare` with images, and the `sheet`, `mermaid`, `vega-lite` and `html` types. Each case adds a warning.

## Usage

```bash
vis whatsapp message.md -o out/
```

Options:

| Flag | Default | Meaning |
|---|---|---|
| `-o, --out <dir>` | required | where the PNGs and `manifest.json` go |
| `--theme light\|dark` | `light` | |
| `--width <px>` | `320` | CSS width the cards are drawn at |
| `--max-height <px>` | `1600` | tallest card before splitting |
| `--caption full\|short` | `full` | see below |
| `--strict` | off | exit with 2 when a PNG fails the drawing audit |
| `--lang en\|es` | `--lang`, then `VIS_LANG`, then the system locale | language of captions, numbered text and warnings |

The earlier Spanish flags still work: `--ancho`, `--alto-max`, `--estricto`, `--pie corto|completo`, `--theme claro|oscuro`. Using any of them also selects Spanish output unless `--lang` says otherwise.

**`--caption short`:** each image's caption carries only the text that goes with it, or its title when there is none, so the chat does not repeat what the image already says. The short text version goes to that part's `fallback`, to send only if the image does not arrive. Use it when a person reads the message on a phone; without it the caption carries both.

From code, without drawing:

```js
import { plan, shortText, toWhatsApp, LIMITS } from '@casiangel333/vis/whatsapp'
const { parts, fallback, warnings } = plan(markdown, engines, { caption: 'full', lang: 'en' })
```

`engines` is `{ vega, vegaLite }` when available (used to validate `chart`); `{}` works for planning.

## Manifest (`out/manifest.json`)

```json
{
  "format": "vis-whatsapp/2",
  "vis": "0.2.0",
  "lang": "en",
  "theme": "light",
  "width": 320,
  "parts": [
    { "type": "text", "text": "*Summary*\n\nVisits *went up*…" },
    { "type": "image", "block": "kpi#1", "caption": "*This week*\n✅ Revenue: *$184,300* (+12 %)", "alt": "…",
      "files": [{ "file": "01-kpi1.png", "caption": "<the caption>", "width": 1080, "height": 861, "bytes": 58667 }] },
    { "type": "poll", "block": "decisions#3", "id": "launch",
      "numbered": "*Question 1 of 2:* When do we launch?\nReply with the number…\n*1* · Nov 12 (recommended)\n*2* · Nov 19",
      "poll": { "question": "When do we launch?", "options": ["Nov 12 (recommended)", "Nov 19"], "multiple": false } }
  ],
  "fallback": "the whole message as text",
  "warnings": []
}
```

- `format` changes only when a key changes meaning or disappears. `vis-whatsapp/1` (Spanish keys, `manifiesto.json`) is no longer written.
- An image's `files` are in order. When a block was split into several cards, the first carries the full caption and the rest "(2 of 3)".
- `poll` is `null` (with a `reason`) when the question does not have 2 to 12 options, or when two options become equal after cutting them to 100 characters.
- `fallback` at the top level is the whole message as text, for a channel without images.
- With `--caption short`, each `image` part also has its own `fallback`: its text plus its short version.
- `alt` is the plain-text description of the image, without WhatsApp formatting.

## How to send it

In order, one part after another:

| Part | What to send |
|---|---|
| `text` | `text` |
| `image` | each file in `files`, with its `caption` |
| `poll`, channel with polls | the poll, then `numbered` as text: some clients do not show polls, and the vote may not arrive |
| `poll`, channel without polls | only `numbered` |

With Baileys:

```js
await sock.sendMessage(jid, { text: part.text })
await sock.sendMessage(jid, { image: fs.readFileSync(path.join(dir, f.file)), caption: f.caption })
await sock.sendMessage(jid, { poll: { name: part.poll.question, values: part.poll.options, selectableCount: part.poll.multiple ? 0 : 1 } })
```

In Baileys, `selectableCount: 0` means "several answers" and `1` means "one". Votes arrive encrypted in `messages.update` (`pollUpdates`); in groups with LIDs decryption may fail. That is why the numbered text always goes.

**Pace:** wait a random 2 to 5 s between messages, and put the decision last. With more than 6 messages the adapter warns: consider merging text or splitting the send.

## Limits it applies (`LIMITS`)

- Image caption: up to 1024 characters, cut at whole lines.
- Poll: 2 to 12 distinct options; question up to 255 characters and option up to 100.
- Image: 1080 px wide and up to 1600 px tall, so WhatsApp does not downscale it at standard quality.
