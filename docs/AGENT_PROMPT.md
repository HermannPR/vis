# Teaching an agent to write VIS

Paste the block below into your agent's system prompt (or a skill, or a tool description). It is about 500 tokens and covers everything an agent needs to write valid VIS on the first try. When it does make a mistake, run `vis check` and hand the error lines back: each one says exactly what to write instead.

A good loop looks like this:

1. The agent writes its report in Markdown with VIS blocks.
2. Your code runs `vis check report.md --json` (or `check(md)` in JavaScript).
3. If there are errors, send them back to the agent: "Fix these VIS errors and resend: ...". One retry is almost always enough.
4. Render: `vis render report.md --to html`, `--to png`, `--to text`, or `vis whatsapp report.md -o out/`.

---

```text
You can add visual blocks to your Markdown answers with VIS. A VIS block is a fenced code block whose info string starts with a block type. Use them only when they make the answer clearer; plain text is fine for everything else. Use made-up names only if the user gave you none.

Header: ```type [class] "Title" key=value key="two words"

chart (CSV body, header row first; classes: bar line area scatter donut)
  ```chart bar "Orders by channel" labels=true
  channel,orders
  Web,342
  App,264
  ```
  attrs: x= y=a,b color= stack=true|normalize unit="USD" horizontal=true labels=true sort=desc|asc|none height=240
  Numbers are plain: 1240 or 3.5. Never 1,240 or $1240 or 4,2. Put units in unit=.
  Dates on x: YYYY-MM or YYYY-MM-DD. Max 500 rows, 8 series. donut: one y, no negatives.

kpi (one card per line)
  - Revenue: $184,300 (+12 %, ok)
  status: ok | warn | bad. Delta and status go in parentheses, never after "|". Max 12.

progress
  a single bar: header ```progress "Migration" value=68 max=100 and an empty body, or a checklist:
  - [x] Done task
  - [~] Task in progress (70 %)
  - [ ] Pending task

timeline (date | event | status)
  2026-11-12 | Launch | pending
  status: done | in progress | pending | late | blocked

compare (metric | before | after)
  ```compare "Old vs new" before="Old" after="New" better=lower
  Page load | 4.2 s | 1.3 s
  ```

decisions (id | question | option | option ...)  — ask the human, don't decide for them
  when | When do we launch? | Nov 12* ~ as planned | Nov 19 ~ more testing | @date
  channels+ | Where do we announce it? | Email | Social | Other...
  * = your recommendation (one per question), ~ = short hint, => value = value to send back,
  id+ = several answers allowed, inputs: @date @text @range 0-10.

Other types: mermaid (body starts with the diagram type), vega-lite (strict JSON, no data.url, no href), sheet (path | caption; relative image paths, never URLs).
Keep titles short. One idea per block. Put the conclusion in a sentence before the block, not only inside it.
```

---

## Spanish

The same prompt works in Spanish. VIS accepts the Spanish keywords (`alerta`, `mal`, `listo`, `en curso`, `pendiente`, `atrasado`, `bloqueado`, `@fecha`, `@texto`, `@rango`) and, with `--lang es` or `lang: 'es'`, writes its error messages, fixes and labels in Spanish.
