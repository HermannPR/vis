# VIS format specification

**Version:** 1.0 (draft) · **Status:** stable syntax, wording of error messages may still change.

VIS adds visual blocks to ordinary Markdown. A VIS document is a CommonMark document in which some fenced code blocks have a VIS type as their info string. Anything that isn't a VIS block is plain Markdown and renders as such, so a VIS document still reads well in any Markdown viewer, terminal or chat that knows nothing about VIS.

The format is designed to be **written by language models** and **read by people on small screens**. That shapes every rule below: few block types, one obvious way to write each thing, strict validation with a suggested fix for every error, and no layout knobs.

## 1. Blocks

A block is a fenced code block:

````
```type class "Title" key=value key="value with spaces"
body
```
````

- **Fence:** three or more backticks or tildes, indented by up to three spaces, closed by a fence of the same character that is at least as long. A block that never closes is an error (`E_UNCLOSED`).
- **Type:** the first word of the info string, case-insensitive. Unknown words that are not close to a VIS type are left alone (a ```` ```js ```` block stays a code block). A word that looks like a misspelled type, one edit away (two for words of eight letters or more, and swapping two neighbouring letters counts as one), such as `chrat` or `timline`, is an error with a suggestion (`E_TYPE`). Languages like `shell` or `csharp` are left alone.
- **Class:** an optional bare word after the type. Only `chart` takes one.
- **Title:** an optional double-quoted string. Escape a quote with `\"`.
- **Attributes:** `key=value`; quote the value if it contains spaces. Each type accepts a fixed list of attributes; anything else is an error with the closest valid name (`E_ATTR`).
- **Comments:** in line-based bodies (`kpi`, `progress`, `timeline`, `compare`, `decisions`, `sheet`) a line starting with `#` is ignored, and so are blank lines.

### Block types

| Type | Shows | Aliases |
|---|---|---|
| `chart` | Bar, line, area, scatter and donut charts from CSV | `charts`, `graph`, `grafica`, `grafico` |
| `kpi` | Metric cards with delta and status | `kpis` |
| `progress` | A progress bar or a checklist with percentages | `progreso` |
| `timeline` | Dated milestones with status | `linea` |
| `compare` | Before/after table, with the better side highlighted | `comparison`, `compara`, `comparar` |
| `decisions` | Questions for a human, with options and a recommended answer | `decision`, `decisiones` |
| `sheet` | A contact sheet of images with captions | `sheets`, `hoja` |
| `mermaid` | A Mermaid diagram (rendered by Mermaid) | |
| `vega-lite` | A raw Vega-Lite spec, as an escape hatch | `vegalite`, `vega` |
| `html` | Raw HTML, for trusted authors only | |

## 2. `chart`

````
```chart bar "Orders by channel" labels=true
channel,orders
Web,342
App,264
Store,236
```
````

**Classes:** `bar` (default), `line`, `area`, `scatter`, `donut`.

**Body:** CSV with a header row. Quote a cell that contains a comma: `"Smith, J."`.

**Attributes**

| Attribute | Values | Default | Meaning |
|---|---|---|---|
| `x` | a column name | first column | Category or time axis |
| `y` | one or more column names, comma-separated | every other column | Values; several columns make several series |
| `color` | a column name | none | Split one `y` into series by this column (long format) |
| `stack` | `true`, `false`, `normalize` | `false` for bars, stacked for multi-series areas | Stack series; `normalize` stacks to 100 % |
| `unit` | text | none | Unit added to the title or axis, e.g. `unit="USD"` |
| `height` | 80 to 900 | automatic | Plot height in CSS pixels |
| `horizontal` | `true`, `false` | automatic | Horizontal bars. Bars turn horizontal on their own when labels are long or there are more than 14 categories |
| `labels` | `true`, `false` | `false` | Print values on bars and at the end of lines |
| `sort` | `desc`, `asc`, `none` | `desc` for category bars, `none` otherwise | Bar order; `none` keeps the data order |

**Data rules**

- Numbers are plain: `1240`, `-3.5`, `1e6`. No thousands separators, no units, no currency symbols. `1,240` and `1.240` are rejected (`E_THOUSANDS`) because they are ambiguous; `4,2` is rejected with "use a decimal point" (`E_CSV_NUM`). Put the unit in `unit=`.
- An empty cell is a missing value.
- If every `x` value is a date (`YYYY-MM`, `YYYY-MM-DD`, optionally with `HH:MM[:SS]`), the axis is a time axis read in UTC. Invalid dates such as `2026-02-30` are errors (`E_DATE`).
- At most 500 rows (`E_ROWS`) and 8 series (`E_SERIES`).
- `color=` and several `y=` columns can't be combined.
- `donut` takes exactly one `y` and no negative values. `scatter` needs a numeric `x`.

## 3. `kpi`

````
```kpi "This week" cols=2
- Revenue: $184,300 (+12 %, ok)
- Orders: 1,240 (+3 %, ok)
- Returns: 4.8 % (+1.1 pts, warn)
- First response: 6 h (+2 h, bad)
```
````

One card per line: `- Label: value (delta, status)`.

- The value is free text and is shown as written, so here thousands separators and units are fine.
- The parenthesis is optional and holds a delta, a status, or both, in any order.
- **Status:** `ok`, `warn`, `bad`. Spanish aliases: `bien`, `alerta`, `mal`.
- Don't separate the delta with `|` (that's the syntax of other blocks); the validator suggests the right form.
- At most 12 cards. `cols` sets the number of columns (1 to 6) on wide screens; phones always stack.

## 4. `progress`

A single bar:

````
```progress "Migration" value=68 max=100
```
````

Or a checklist; the overall percentage is computed from the tasks:

````
```progress "New store"
- [x] Design
- [x] Catalog loaded
- [~] Payments in testing (70 %)
- [ ] Customer pilot
```
````

`[x]` done, `[~]` in progress (optional percentage 0 to 100 at the end), `[ ]` pending. An in-progress task without a percentage counts as half done in the total but shows no invented number.

## 5. `timeline`

````
```timeline "Launch plan"
2026-10-28 | Design | done
2026-11-06 | Payments in testing | in progress
2026-11-12 | Launch | pending
```
````

One milestone per line: `date | event | status`. The date is `YYYY-MM-DD`, optionally with `HH:MM`. The status is optional.

**Status:** `done`, `in progress`, `pending`, `late`, `blocked`. Spanish aliases: `listo`, `hecho`, `en curso`, `pendiente`, `atrasado`, `bloqueado`.

## 6. `compare`

````
```compare "Old site vs new" before="Old" after="New" better=lower
Page load | 4.2 s | 1.3 s
Failed payments per week | 31 | 4
```
````

One row per line: `metric | before | after`. With `better=lower` or `better=higher`, VIS reads the numbers in each cell and marks the better side. `before` and `after` name the columns.

A row may also be two images, `before.png | after.png`, for visual diffs. Image paths are resolved relative to the document by the CLI and are never fetched by the web client. Paths with a scheme (`https:`, `file:`, ...) or starting with `//` are an error (`E_REMOTE`) unless the caller passes `allowRemoteData`; inline `data:image/...` URIs are fine.

## 7. `decisions`

Questions that need a human. In HTML they render as a small form whose answer is a compact line an agent can parse; in images they render with letters so the person can answer by text; in WhatsApp each question becomes a poll when it fits.

````
```decisions "How do we launch?"
date | When do we launch? | Nov 12* ~ as planned | Nov 19 ~ one more week of testing | @date
channels+ | Where do we announce it? | Email | Social | WhatsApp
budget | Ad budget per week | @range 0-500
notes | Anything else? | @text
```
````

One question per line: `id | question | option | option ...`

- **id:** a word (`[A-Za-z][A-Za-z0-9_-]*`), unique in the block. A trailing `+` (`channels+`) allows several answers.
- **Option:** `Label* ~ hint => value`
  - `*` marks the recommended option. Only one per question, unless it allows several answers.
  - `~ hint` adds a short explanation under the label.
  - `=> value` sets the value sent back when it differs from the label.
- **Free option:** `...`, `Other...` or any label ending in `...` adds a free-text "Other" choice.
- **Inputs:** `@date`, `@text`, `@range min-max`. Spanish aliases: `@fecha`, `@texto`, `@rango`. A question may combine options and one input.

**Answer format.** The HTML form doesn't send anything by itself: it builds one line the person can review and send back to the agent. Unanswered questions are left out, and several answers are joined with commas:

```
How do we launch? — When do we launch?: Nov 12 · Where do we announce it?: Email, WhatsApp · Ad budget per week: 200
```

In images (PNG, WhatsApp) every option gets a letter and the person answers by text, for example `1A 2AC 3 200`.

## 8. `sheet`

````
```sheet "Storyboard" cols=3
frames/001.png | Scene 1
frames/002.png | Scene 2
```
````

One image per line: `path | caption`. At most 48 images; `cols` from 1 to 8. Paths follow the same rules as images in `compare`.

## 9. `mermaid`, `vega-lite`, `html`

- `mermaid`: the body must start with a Mermaid diagram type (`flowchart LR`, `sequenceDiagram`, `gantt`, ...). Rendered by Mermaid with `securityLevel: 'strict'`.
- `vega-lite`: the body is a strict-JSON Vega-Lite spec. It is compiled to check it, and Vega-Lite warnings are reported as errors (`E_VEGA`). Remote data (`data.url`) is an error (`E_REMOTE`) and is never loaded, unless the caller passes `allowRemoteData`. Links (`href`) are not supported (`E_VEGA`).
- `html`: rendered as a code block unless the caller passes `allowHTML` (`--allow-html` in the CLI); then it is passed through. Only enable it for authors you trust.

Prefer the specific blocks: they validate better, look consistent, and survive every output format.

## 10. Validation

`vis check` (or `check()` in the API) validates the whole document and returns up to five errors at a time, each with a stable code, the block, the line, a message and a fix:

```
E_THOUSANDS|chart#2|14|"1,240" in orders uses a thousands separator or is ambiguous|if it means thousands write 1240; if it is a decimal write 1.24
```

The line format is `code|block|line|message|fix`. `--json` returns the same data as objects. Messages and fixes are available in English and Spanish; codes are the same in both.

| Code | Meaning |
|---|---|
| `E_TYPE` | Unknown block type or chart class (with a suggestion) |
| `E_UNCLOSED` | Fence never closes |
| `E_ATTR` | Unknown attribute, extra words in the header, or incompatible attributes |
| `E_EMPTY` | Block has no content, or a chart has only a header |
| `E_VALUE` | Attribute value out of range or not allowed |
| `E_ROWS` | Too many rows, cards or images |
| `E_SERIES` | Too many series |
| `E_CSV_COLS` | Row length doesn't match the header, or duplicate column names |
| `E_CSV_NUM` | A value that should be a number isn't |
| `E_THOUSANDS` | Ambiguous thousands separator in a number |
| `E_FIELD` | `x=`, `y=` or `color=` names a column that doesn't exist |
| `E_DATE` | Invalid date |
| `E_LINE` | A line doesn't follow the block's syntax |
| `E_STATUS` | Unknown status word |
| `E_ID_DUP` | Two questions share an id |
| `E_JSON` | `vega-lite` body isn't valid JSON |
| `E_VEGA` | Vega-Lite rejected or warned about the spec |
| `E_REMOTE` | A `vega-lite` spec asks for remote data (`data.url`), or an image path is a URL |

Renderers may also report these, when drawing rather than when checking:

| Code | Meaning |
|---|---|
| `E_ENGINE` | The engine a block needs (Vega, Vega-Lite or Mermaid) is not available; the block is shown as code |
| `E_MERMAID` | Mermaid could not parse the diagram |

## 11. Rendering guarantees

Renderers should keep these properties, and `vis audit` checks them in a real browser:

- Text and marks pass WCAG contrast (4.5:1 for text, 3:1 for marks) in both light and dark themes.
- Nothing overlaps or leaves the canvas at 320 to 760 CSS pixels wide.
- KPI values in the picture match the source text.
- Every chart has a text alternative (`alt`) generated from its data.
- Plain-text output keeps every number from the source, so nothing is lost where images can't be shown.

`vis audit` reports each problem as `code|where|detail`:

| Code | Problem |
|---|---|
| `C_OVERFLOW` | The page is wider than the screen |
| `C_FONT_SIZE` | Text smaller than 10.5 CSS px |
| `C_OUTSIDE` | Text leaves the chart canvas |
| `C_CONTRAST` | Text below 4.5:1 contrast |
| `C_MARK_CONTRAST` | A chart mark below 3:1 contrast against the background |
| `C_OVERLAP` | Two labels overlap |
| `C_KPI` | A KPI value in the picture differs from the source |
| `C_ALT` | A chart has no text alternative |
| `C_IMAGE` | An image in `sheet` or `compare` did not load |

## 12. Versioning

The format version is independent from the library version. Within a major version of the format, documents that validate keep validating: new block types, attributes and keywords may be added, existing ones are not removed or renamed (old spellings stay as aliases).
