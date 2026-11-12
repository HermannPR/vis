/*! vis.js — visual blocks in Markdown for AI agents. MIT License. */
// One file: parser, validator, compilers (Vega-Lite, HTML, SVG, text) and browser mounting.
// In Node it is loaded with require(); in a browser it becomes window.vis. The rendering engines (Vega, Vega-Lite,
// Mermaid) are separate files, passed in through options or found as the globals vega, vegaLite and mermaid.
//
// Trust model. Everything in the Markdown is treated as untrusted and escaped, with two opt-in escape hatches:
// - ```html blocks are inserted raw only when the caller passes { allowHTML: true }; otherwise they render as code.
// - vega-lite specs (and chart data) never load anything over the network unless the caller passes
//   { allowRemoteData: true }: check() reports data.url as E_REMOTE and the Vega loader refuses every request.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.vis = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.2.0';
  const MAX_ROWS = 500, MAX_SERIES = 8, MAX_ERRORS = 5, MAX_KPIS = 12, MAX_SHEET = 48;

  // ---------- Strings (en and es) ----------
  // Every message vis emits lives here, keyed by id, with {param} interpolation. The Spanish strings keep the exact
  // wording of earlier versions. Unknown languages fall back to English.
  const STRINGS = {
    en: {
      // validation
      'err.unknownType': 'unknown block type "{type}"', 'fix.didYouMean': 'did you mean {s}?', 'fix.typeList': 'types: {list}',
      'err.unclosed': 'the block is not closed', 'fix.unclosed': 'add {fence} at the end of the block',
      'err.unknownAttr': 'unknown attribute {k}= in {type}', 'fix.didYouMeanAttr': 'did you mean {s}=?', 'fix.attrList': 'attributes: {list}', 'fix.noAttrs': 'this block takes no attributes',
      'err.extraHeader': 'unexpected "{x}" in the header', 'fix.quoteTitle': 'put the title in double quotes', 'fix.quoteTitleAttrs': 'put the title in double quotes and attributes as key=value',
      'err.unknownKind': 'unknown chart kind "{x}"', 'fix.use': 'use {s}', 'fix.kindList': 'kinds: {list}',
      'err.empty': 'the block is empty', 'fix.empty': 'add the block content',
      'err.outOfRange': '{k}={v} is out of range', 'fix.between': 'use a number between {min} and {max}',
      'err.invalidValue': '{k}={v} is not valid', 'fix.bool': 'use {k}=true or {k}=false',
      'fix.sort': 'use sort=desc, sort=asc or sort=none (data order)', 'err.normalize': 'normalize is only valid for stack=', 'fix.trueFalse': 'use true or false',
      'fix.vegaChart': 'check x=, y= and the chart kind', 'fix.vegaSpec': 'fix the spec',
      'err.tooManyCards': '{n} cards; the limit is {max}', 'fix.tooManyCards': 'keep the {max} most important or use a table',
      'err.notNumberAttr': 'value={v} is not a number', 'fix.value': 'write value=60', 'fix.max': 'write max=100',
      'err.valueRange': 'value={v} is outside 0-{max}', 'fix.valueRange': 'use a value between 0 and {max}',
      'err.timelineLine': 'each line is: date | event | status', 'fix.timelineLine': 'example: 2026-10-21 | First release | done',
      'err.invalidDate': 'invalid date "{v}"', 'fix.dateTime': 'use YYYY-MM-DD (time allowed: YYYY-MM-DD HH:MM)', 'fix.dateMonth': 'use YYYY-MM-DD or YYYY-MM',
      'err.unknownStatus': 'unknown status "{v}"', 'fix.statusList': 'statuses: done, in progress, pending, late, blocked',
      'fix.better': 'use better=lower or better=higher',
      'err.compareLine': 'each line is: metric | before | after (or before.png | after.png)', 'fix.compareLine': 'example: Errors | 31 | 4',
      'err.dupId': 'duplicate id "{id}"', 'fix.dupId': 'each question needs a unique id',
      'err.tooManyImages': '{n} images; the limit is {max}', 'fix.tooManyImages': 'split the sheet into several',
      'err.sheetLine': 'each line is: path | caption', 'fix.sheetLine': 'example: frames/001.png | Scene 1',
      'err.json': 'invalid JSON: {m}', 'fix.json': 'the vega-lite body must be strict JSON',
      'err.remote': 'vega-lite loads data from a URL ({url}) and remote data is disabled', 'fix.remote': 'inline the data in data.values',
      'err.remoteImage': 'the image {url} is a URL and remote content is disabled', 'fix.remoteImage': 'use a path relative to the document',
      'err.vegaDeep': 'the spec is nested more than 40 levels deep', 'fix.vegaDeep': 'flatten the spec',
      'err.vegaHref': 'links (href) are not supported in vega-lite blocks', 'fix.vegaHref': 'remove href from the spec and put the link in the text',
      'err.mermaidStart': 'mermaid starts with "{p}"', 'fix.mermaidStart': 'start with the diagram type: flowchart LR, sequenceDiagram, ...',
      'err.noData': 'the block has no data', 'fix.noData': 'add a CSV header and at least one row',
      'err.dupColumn': 'column "{c}" appears twice in the header', 'fix.dupColumn': 'use unique column names',
      'err.headerOnly': 'only a header, no data rows', 'fix.headerOnly': 'add rows below the header',
      'err.tooManyRows': '{n} rows; the limit is {max}', 'fix.tooManyRows': 'aggregate or summarize the data before charting',
      'err.cellCount': 'the row has {n} cells and the header {m}', 'fix.cellCount': 'one cell per column; quote text that contains a comma',
      'err.fieldMissing': '{k}={v} is not in the header ({cols})', 'fix.useField': 'use {k}={s}', 'fix.oneOf': 'use one of: {list}',
      'err.noY': 'no column for the y axis', 'fix.noY': 'add a numeric column or set y=',
      'err.colorMultiY': 'color= together with several y=', 'fix.colorMultiY': 'use one y= with color=, or several y= without color=',
      'err.thousands': '"{v}" in {y} has a thousands separator or is ambiguous', 'fix.thousandsOr': 'if thousands write {a}; if decimal write {b}', 'fix.write': 'write {a}',
      'err.notNumber': '"{v}" in column {y} is not a number', 'fix.decimalPoint': 'use a decimal point: {x}', 'fix.onlyNumber': 'keep only the number, no units or symbols (the unit goes in unit=)',
      'err.tooManySeries': '{n} series; the limit is {max}', 'fix.tooManySeries': 'group the smallest into "Other" or make several charts',
      'err.donutMultiY': 'donut takes a single y=', 'fix.donutMultiY': 'keep one value column',
      'err.donutNegative': 'donut with a negative value', 'fix.donutNegative': 'use chart bar for negative values',
      'err.scatterX': 'scatter needs a numeric x and {x} is not', 'fix.scatterX': 'use chart bar or line for categories',
      'err.kpiColon': 'kpi line without ":" ("{t}")', 'fix.kpiColon': 'write - Label: value (delta, status)',
      'err.kpiPipes': 'in kpi the delta and status go in parentheses, not separated by pipes', 'fix.kpiPipes': 'write - {label}: {value} ({rest})',
      'err.kpiExtra': 'unexpected "{x}" in the parentheses', 'fix.kpiExtra': 'the parentheses hold (delta, status), status = ok | warn | bad',
      'err.kpiNoValue': 'kpi "{label}" has no value', 'fix.kpiNoValue': 'write - Label: value',
      'err.taskBox': 'progress line without a checkbox ("{t}")', 'fix.taskBox': 'use - [x] done, - [~] in progress (60 %), - [ ] pending',
      'err.pctOver': '{pct} % is over 100', 'fix.pctOver': 'use a percentage between 0 and 100',
      'err.decLine': 'each question is: id | question | option | option ...', 'fix.decLine': 'example: deadline | Due date | @date',
      'err.decId': 'invalid id "{id}"', 'fix.decId': 'the id is one word without spaces: deadline, side, toppings+',
      'err.decEmptyOption': 'empty option (two | in a row)', 'fix.decEmptyOption': 'remove the extra |',
      'err.decInput': 'unknown input "{o}"', 'fix.decInput': 'use @date, @text or @range 0-10',
      'err.decRange': '@range without limits', 'fix.decRange': 'write @range 0-10',
      'err.decNoOptions': 'question "{id}" has no options', 'fix.decNoOptions': 'add options or an @date/@text/@range input',
      'err.decMultiRec': '"{id}" marks several options as recommended but takes one answer', 'fix.decMultiRec': 'mark only one with * or use id+',
      'err.noVega': 'Vega is not loaded', 'fix.noVega': 'load vega and vega-lite', 'err.noMermaid': 'Mermaid is not loaded', 'fix.noMermaid': 'install the optional mermaid package (npm i mermaid) or point VIS_MERMAID at mermaid.min.js',
      'fix.mermaid': 'check the diagram syntax', 'err.noSVGBlock': 'no chart or vega-lite block to export as SVG',
      // statuses
      'status.ok': 'ok', 'status.warn': 'warning', 'status.bad': 'bad', 'status.progress': 'in progress', 'status.pending': 'pending', 'status.done': 'done',
      // rendering
      'render.failed': 'Could not render {type}', 'alt.chart': 'chart', 'alt.vegaLite': 'chart', 'alt.head': '{kind} chart',
      'kind.bar': 'Bar', 'kind.line': 'Line', 'kind.area': 'Area', 'kind.scatter': 'Scatter', 'kind.donut': 'Donut',
      'alt.points': '{n} points on {x}', 'alt.series': '{y}: max {max} at {xmax}, min {min} at {xmin}',
      'progress.label': 'progress', 'compare.before': 'Before', 'compare.after': 'After', 'compare.change': 'Change',
      'dec.title': 'Decisions', 'dec.other': 'Other', 'dec.several': '(several)', 'dec.recommended': 'recommended',
      'dec.writePlaceholder': 'Write your answer', 'dec.otherSuffix': '(other)', 'dec.otherDate': 'Other date', 'dec.otherAnswer': 'Other answer',
      'dec.copy': 'Copy answer', 'dec.copied': 'Copied', 'dec.empty': 'Pick options and your answer appears here',
      'dec.writeDate': 'Write the date', 'dec.writeAnswer': 'Write your answer', 'dec.writeNumber': 'Write a number from {min} to {max}',
      'dec.sampleDate': 'Nov 20', 'dec.yourAnswer': 'your answer', 'dec.otherWrite': 'Other: write it', 'dec.otherDateWrite': 'Other date: write it',
      'dec.openHint': 'For an open option, the letter and your answer: ', 'dec.replyHint': 'Reply in the chat with number and letter, for example: ',
      // text fallback
      'text.date': 'Date', 'text.event': 'Event', 'text.status': 'Status', 'text.recommended': ' [recommended]',
      'text.dateInput': 'Date (YYYY-MM-DD): ____', 'text.textInput': 'Text: ____', 'text.rangeInput': 'From {min} to {max}: ____',
      'text.several': ' (you can pick several)', 'text.replyHint': 'Reply in one line, for example: 1a, 2b c, 3 2026-11-20', 'text.htmlOmitted': '[html content omitted in text]',
      // audit
      'audit.page': 'page', 'audit.text': 'text', 'audit.pageWidth': 'width {w} > {vw}', 'audit.fontSvg': '"{t}" at {fs} px (min 11)',
      'audit.outside': '"{t}" leaves the canvas ({d})', 'audit.image': 'image did not load: {src}', 'audit.contrastMin': '"{t}" {r}:1 (min 4.5)', 'audit.overlap': '"{a}" and "{b}"',
      'audit.mark': 'mark {c} {r}:1 (min 3)', 'audit.font': '"{t}" at {fs} px', 'audit.contrast': '"{t}" {r}:1', 'audit.right': '"{t}" overflows on the right',
      'audit.kpi': 'expected "{v}", rendered "{d}"', 'audit.alt': 'chart without alt text',
      // whatsapp
      'wa.maxMin': '- {name}: max {max} ({xmax}), min {min} ({xmin})', 'wa.last': '- {name}: {v} in {x}', 'wa.since': ' ({c} since {x})', 'wa.peak': '; peak {v} in {x}',
      'wa.ofMax': '{v} of {max} ({pct} %)', 'wa.before': 'before', 'wa.after': 'after',
      'wa.writeIt': '{label} (write it)', 'wa.recommended': ' (recommended)', 'wa.otherDate': 'another date (day and month)', 'wa.yourAnswer': 'your answer',
      'wa.number': 'a number from {min} to {max}', 'wa.aDate': 'a date (day and month)', 'wa.replyWith': 'Reply with {x}', 'wa.numbers': 'one or more numbers (for example: 1 3)',
      'wa.theNumber': 'the number', 'wa.orWrite': ' or write {x}', 'wa.orOwn': ' or write your own', 'wa.question': '*Question {i} of {n}:* {q}', 'wa.quoting': ', quoting this message',
      'wa.pollRange': '{n} options; a poll takes {min} to {max}', 'wa.noOptions': 'no options', 'wa.or': ' (or {x})', 'wa.writeOtherDate': 'write another date', 'wa.writeAnswer': 'write your answer',
      'wa.repeated': 'options repeat after cutting them to 100 characters', 'wa.unclosed': 'unclosed block', 'wa.compareImages': 'compare with images goes as text',
      'wa.notDrawn': '{type} is not drawn in WhatsApp', 'wa.asText': '{id}: {why}; sent as text', 'wa.raw': '_{type} not drawn_',
      'wa.tooMany': '{n} messages in a row; consider merging text or splitting the send', 'wa.cardOf': '({i} of {n})',
      // claude widget hook and web client
      'hook.errors': 'vis found errors in the widget Markdown. Fix them and call again:\n{lines}', 'hook.more': '\n(and {n} more errors)',
      'hook.submit': 'Send answer ↗', 'hook.summary': 'vis visual blocks', 'client.submit': 'Insert into message',
      // cli
      'cli.ok': 'ok: {n} block(s), no errors', 'cli.more': '\n... and {n} more', 'cli.done': 'done: {f}', 'cli.auditOk': 'audit {label}: ok',
      'cli.auditProblems': 'audit {label}: {n} problem(s)', 'cli.pngTheme': 'png needs --theme light or dark', 'cli.pngOut': 'png needs -o out.png',
      'cli.pngDone': 'done: {files}; render {ms} ms, total {total} ms', 'cli.badTo': '--to {to} is not valid: use html, png, svg or text',
      'cli.waOut': 'whatsapp needs -o <dir>', 'cli.waTheme': 'whatsapp needs --theme light or dark', 'cli.warning': 'warning: {a}',
      'cli.waDone': 'done: {f} ({n} messages, {p} PNG) in {ms} ms', 'cli.unknownCommand': 'unknown command: {cmd}', 'cli.unknownFlag': 'unknown option: {flag}',
      'cli.needsValue': '{flag} needs a value', 'cli.badValue': '{flag} {v} is not valid: use {list}', 'cli.overwrite': 'the output would overwrite the input; pass -o',
      'cli.fileSize': '{w}x{h}, {b} bytes',
    },
    es: {
      'err.unknownType': 'tipo de bloque desconocido "{type}"', 'fix.didYouMean': 'quisiste decir {s}?', 'fix.typeList': 'tipos: {list}',
      'err.unclosed': 'el bloque no se cierra', 'fix.unclosed': 'agrega {fence} al final del bloque',
      'err.unknownAttr': 'atributo desconocido {k}= en {type}', 'fix.didYouMeanAttr': 'quisiste decir {s}=?', 'fix.attrList': 'atributos: {list}', 'fix.noAttrs': 'este bloque no lleva atributos',
      'err.extraHeader': 'sobra "{x}" en la cabecera', 'fix.quoteTitle': 'el titulo va entre comillas', 'fix.quoteTitleAttrs': 'el titulo va entre comillas; los atributos como clave=valor',
      'err.unknownKind': 'clase de grafica desconocida "{x}"', 'fix.use': 'usa {s}', 'fix.kindList': 'clases: {list}',
      'err.empty': 'el bloque esta vacio', 'fix.empty': 'agrega el contenido del bloque',
      'err.outOfRange': '{k}={v} fuera de rango', 'fix.between': 'usa un numero entre {min} y {max}',
      'err.invalidValue': '{k}={v} no es valido', 'fix.bool': 'usa {k}=true o {k}=false',
      'fix.sort': 'usa sort=desc, sort=asc o sort=none (orden de los datos)', 'err.normalize': 'normalize solo vale para stack=', 'fix.trueFalse': 'usa true o false',
      'fix.vegaChart': 'revisa x=, y= y la clase de grafica', 'fix.vegaSpec': 'corrige el spec',
      'err.tooManyCards': '{n} tarjetas; el tope es {max}', 'fix.tooManyCards': 'deja las {max} mas importantes o usa una tabla',
      'err.notNumberAttr': 'value={v} no es un numero', 'fix.value': 'escribe value=60', 'fix.max': 'escribe max=100',
      'err.valueRange': 'value={v} fuera de 0-{max}', 'fix.valueRange': 'usa un valor entre 0 y {max}',
      'err.timelineLine': 'cada linea es: fecha | evento | estado', 'fix.timelineLine': 'ejemplo: 2026-10-21 | Primera version | listo',
      'err.invalidDate': 'fecha invalida "{v}"', 'fix.dateTime': 'usa AAAA-MM-DD (puede llevar hora: AAAA-MM-DD HH:MM)', 'fix.dateMonth': 'usa AAAA-MM-DD o AAAA-MM',
      'err.unknownStatus': 'estado desconocido "{v}"', 'fix.statusList': 'estados: listo, en curso, pendiente, atrasado',
      'fix.better': 'usa better=lower o better=higher',
      'err.compareLine': 'cada linea es: metrica | antes | despues (o antes.png | despues.png)', 'fix.compareLine': 'ejemplo: Errores | 31 | 4',
      'err.dupId': 'id repetido "{id}"', 'fix.dupId': 'cada pregunta necesita un id unico',
      'err.tooManyImages': '{n} imagenes; el tope es {max}', 'fix.tooManyImages': 'parte la hoja en varias',
      'err.sheetLine': 'cada linea es: ruta | pie', 'fix.sheetLine': 'ejemplo: cuadros/001.png | Escena 1',
      'err.json': 'JSON invalido: {m}', 'fix.json': 'el cuerpo de vega-lite es JSON estricto',
      'err.remote': 'vega-lite carga datos de una URL ({url}) y los datos remotos estan apagados', 'fix.remote': 'pon los datos en data.values',
      'err.remoteImage': 'la imagen {url} es una URL y el contenido remoto esta apagado', 'fix.remoteImage': 'usa una ruta relativa al documento',
      'err.vegaDeep': 'la especificacion tiene mas de 40 niveles de anidacion', 'fix.vegaDeep': 'aplana la especificacion',
      'err.vegaHref': 'los enlaces (href) no se aceptan en bloques vega-lite', 'fix.vegaHref': 'quita href de la especificacion y pon el enlace en el texto',
      'err.mermaidStart': 'mermaid empieza con "{p}"', 'fix.mermaidStart': 'empieza con el tipo de diagrama: flowchart LR, sequenceDiagram, ...',
      'err.noData': 'el bloque no tiene datos', 'fix.noData': 'agrega una cabecera CSV y al menos una fila',
      'err.dupColumn': 'la columna "{c}" esta repetida en la cabecera', 'fix.dupColumn': 'usa nombres de columna unicos',
      'err.headerOnly': 'solo hay cabecera, faltan filas de datos', 'fix.headerOnly': 'agrega filas debajo de la cabecera',
      'err.tooManyRows': '{n} filas; el tope es {max}', 'fix.tooManyRows': 'agrega o resume los datos antes de graficar',
      'err.cellCount': 'la fila tiene {n} celdas y la cabecera {m}', 'fix.cellCount': 'una celda por columna; si un texto lleva coma, ponlo entre comillas',
      'err.fieldMissing': '{k}={v} no esta en la cabecera ({cols})', 'fix.useField': 'usa {k}={s}', 'fix.oneOf': 'usa una de: {list}',
      'err.noY': 'no hay columna para el eje y', 'fix.noY': 'agrega una columna numerica o escribe y=',
      'err.colorMultiY': 'color= y varias y= a la vez', 'fix.colorMultiY': 'usa una sola y= con color=, o varias y= sin color=',
      'err.thousands': '"{v}" en {y} lleva separador de miles o es ambiguo', 'fix.thousandsOr': 'si son miles escribe {a}; si es decimal escribe {b}', 'fix.write': 'escribe {a}',
      'err.notNumber': '"{v}" en la columna {y} no es un numero', 'fix.decimalPoint': 'usa punto decimal: {x}', 'fix.onlyNumber': 'deja solo el numero, sin unidades ni simbolos (la unidad va en unit=)',
      'err.tooManySeries': '{n} series; el tope es {max}', 'fix.tooManySeries': 'junta las menores en "Otras" o haz varias graficas',
      'err.donutMultiY': 'donut admite una sola y=', 'fix.donutMultiY': 'deja una columna de valores',
      'err.donutNegative': 'donut con valor negativo', 'fix.donutNegative': 'usa chart bar para valores negativos',
      'err.scatterX': 'scatter necesita x numerica y {x} no lo es', 'fix.scatterX': 'usa chart bar o line para categorias',
      'err.kpiColon': 'linea de kpi sin ":" ("{t}")', 'fix.kpiColon': 'escribe - Etiqueta: valor (delta, estado)',
      'err.kpiPipes': 'en kpi el delta y el estado van entre parentesis, no separados con barras', 'fix.kpiPipes': 'escribe - {label}: {value} ({rest})',
      'err.kpiExtra': 'sobra "{x}" en el parentesis', 'fix.kpiExtra': 'el parentesis lleva (delta, estado), estado = ok | alerta | mal',
      'err.kpiNoValue': 'kpi "{label}" sin valor', 'fix.kpiNoValue': 'escribe - Etiqueta: valor',
      'err.taskBox': 'linea de progress sin casilla ("{t}")', 'fix.taskBox': 'usa - [x] listo, - [~] en curso (60 %), - [ ] pendiente',
      'err.pctOver': '{pct} % pasa de 100', 'fix.pctOver': 'usa un porcentaje entre 0 y 100',
      'err.decLine': 'cada pregunta es: id | pregunta | opcion | opcion ...', 'fix.decLine': 'ejemplo: plazo | Fecha limite | @fecha',
      'err.decId': 'id invalido "{id}"', 'fix.decId': 'el id es una palabra sin espacios: plazo, lado, dieta+',
      'err.decEmptyOption': 'opcion vacia (dos | seguidas)', 'fix.decEmptyOption': 'quita el | sobrante',
      'err.decInput': 'entrada desconocida "{o}"', 'fix.decInput': 'usa @fecha, @texto o @rango 0-10',
      'err.decRange': '@rango sin limites', 'fix.decRange': 'escribe @rango 0-10',
      'err.decNoOptions': 'la pregunta "{id}" no tiene opciones', 'fix.decNoOptions': 'agrega opciones o una entrada @fecha/@texto/@rango',
      'err.decMultiRec': '"{id}" tiene varias recomendadas y es de una respuesta', 'fix.decMultiRec': 'marca una sola con * o usa id+',
      'err.noVega': 'Vega no esta cargado', 'fix.noVega': 'carga vega y vega-lite', 'err.noMermaid': 'Mermaid no esta cargado', 'fix.noMermaid': 'instala el paquete opcional mermaid (npm i mermaid) o apunta VIS_MERMAID a mermaid.min.js',
      'fix.mermaid': 'revisa la sintaxis del diagrama', 'err.noSVGBlock': 'no hay bloque chart o vega-lite para sacar en SVG',
      'status.ok': 'ok', 'status.warn': 'alerta', 'status.bad': 'mal', 'status.progress': 'en curso', 'status.pending': 'pendiente', 'status.done': 'listo',
      'render.failed': 'No se pudo dibujar {type}', 'alt.chart': 'gráfica', 'alt.vegaLite': 'grafica', 'alt.head': 'Gráfica de {kind}',
      'kind.bar': 'barras', 'kind.line': 'líneas', 'kind.area': 'área', 'kind.scatter': 'dispersión', 'kind.donut': 'anillo',
      'alt.points': '{n} puntos en {x}', 'alt.series': '{y}: máximo {max} en {xmax}, mínimo {min} en {xmin}',
      'progress.label': 'avance', 'compare.before': 'Antes', 'compare.after': 'Después', 'compare.change': 'Cambio',
      'dec.title': 'Decisiones', 'dec.other': 'Otra', 'dec.several': '(varias)', 'dec.recommended': 'recomendada',
      'dec.writePlaceholder': 'Escribe tu respuesta', 'dec.otherSuffix': '(otra)', 'dec.otherDate': 'Otra fecha', 'dec.otherAnswer': 'Otra respuesta',
      'dec.copy': 'Copiar respuesta', 'dec.copied': 'Copiada', 'dec.empty': 'Elige opciones y aquí se arma la respuesta',
      'dec.writeDate': 'Escribe la fecha', 'dec.writeAnswer': 'Escribe tu respuesta', 'dec.writeNumber': 'Escribe un número del {min} al {max}',
      'dec.sampleDate': '20 nov', 'dec.yourAnswer': 'tu respuesta', 'dec.otherWrite': 'Otra: escríbela', 'dec.otherDateWrite': 'Otra fecha: escríbela',
      'dec.openHint': 'Para una opción abierta, la letra y tu respuesta: ', 'dec.replyHint': 'Responde en el chat con número y letra, por ejemplo: ',
      'text.date': 'Fecha', 'text.event': 'Evento', 'text.status': 'Estado', 'text.recommended': ' [recomendada]',
      'text.dateInput': 'Fecha (AAAA-MM-DD): ____', 'text.textInput': 'Texto: ____', 'text.rangeInput': 'Del {min} al {max}: ____',
      'text.several': ' (puedes elegir varias)', 'text.replyHint': 'Responde en una linea, por ejemplo: 1a, 2b c, 3 2026-11-20', 'text.htmlOmitted': '[contenido html omitido en texto]',
      'audit.page': 'pagina', 'audit.text': 'texto', 'audit.pageWidth': 'ancho {w} > {vw}', 'audit.fontSvg': '"{t}" a {fs} px (min 11)',
      'audit.outside': '"{t}" sale del lienzo ({d})', 'audit.image': 'la imagen no cargó: {src}', 'audit.contrastMin': '"{t}" {r}:1 (min 4.5)', 'audit.overlap': '"{a}" y "{b}"',
      'audit.mark': 'marca {c} {r}:1 (min 3)', 'audit.font': '"{t}" a {fs} px', 'audit.contrast': '"{t}" {r}:1', 'audit.right': '"{t}" sale por la derecha',
      'audit.kpi': 'esperaba "{v}", se dibujo "{d}"', 'audit.alt': 'grafica sin texto alternativo',
      'wa.maxMin': '- {name}: máximo {max} ({xmax}), mínimo {min} ({xmin})', 'wa.last': '- {name}: {v} en {x}', 'wa.since': ' ({c} desde {x})', 'wa.peak': '; pico {v} en {x}',
      'wa.ofMax': '{v} de {max} ({pct} %)', 'wa.before': 'antes', 'wa.after': 'después',
      'wa.writeIt': '{label} (escríbela)', 'wa.recommended': ' (recomendada)', 'wa.otherDate': 'otra fecha (día y mes)', 'wa.yourAnswer': 'tu respuesta',
      'wa.number': 'un número del {min} al {max}', 'wa.aDate': 'una fecha (día y mes)', 'wa.replyWith': 'Contesta con {x}', 'wa.numbers': 'uno o varios números (por ejemplo: 1 3)',
      'wa.theNumber': 'el número', 'wa.orWrite': ' o escribe {x}', 'wa.orOwn': ' o escribe la tuya', 'wa.question': '*Pregunta {i} de {n}:* {q}', 'wa.quoting': ', citando este mensaje',
      'wa.pollRange': '{n} opciones; la encuesta admite de {min} a {max}', 'wa.noOptions': 'sin opciones', 'wa.or': ' (o {x})', 'wa.writeOtherDate': 'escribe otra fecha', 'wa.writeAnswer': 'escribe tu respuesta',
      'wa.repeated': 'opciones repetidas al cortarlas a 100 caracteres', 'wa.unclosed': 'bloque sin cerrar', 'wa.compareImages': 'compare con imagenes va como texto',
      'wa.notDrawn': '{type} no se dibuja en WhatsApp', 'wa.asText': '{id}: {why}; va como texto', 'wa.raw': '_{type} sin dibujar_',
      'wa.tooMany': '{n} mensajes seguidos; conviene juntar texto o partir el envio', 'wa.cardOf': '({i} de {n})',
      'hook.errors': 'vis encontro errores en el Markdown del widget. Corrigelos y vuelve a llamar:\n{lines}', 'hook.more': '\n(y {n} errores mas)',
      'hook.submit': 'Enviar respuesta ↗', 'hook.summary': 'Bloques visuales de vis', 'client.submit': 'Pasar al mensaje',
      'cli.ok': 'ok: {n} bloque(s) sin errores', 'cli.more': '\n... y {n} mas', 'cli.done': 'listo: {f}', 'cli.auditOk': 'chequeos {label}: ok',
      'cli.auditProblems': 'chequeos {label}: {n} problema(s)', 'cli.pngTheme': 'png necesita --theme claro u oscuro', 'cli.pngOut': 'png necesita -o salida.png',
      'cli.pngDone': 'listo: {files}; dibujo {ms} ms, total {total} ms', 'cli.badTo': '--to {to} no existe: usa html, png, svg o text',
      'cli.waOut': 'whatsapp necesita -o carpeta', 'cli.waTheme': 'whatsapp usa --theme claro u oscuro', 'cli.warning': 'aviso: {a}',
      'cli.waDone': 'listo: {f} ({n} mensajes, {p} PNG) en {ms} ms', 'cli.unknownCommand': 'comando desconocido: {cmd}', 'cli.unknownFlag': 'opcion desconocida: {flag}',
      'cli.needsValue': '{flag} necesita un valor', 'cli.badValue': '{flag} {v} no es valido: usa {list}', 'cli.overwrite': 'la salida pisaria la entrada; usa -o',
      'cli.fileSize': '{w}x{h}, {b} bytes',
    },
  };
  const langOf = l => (/^es\b/i.test(String(l || '')) ? 'es' : 'en');
  // t(lang, id, params): the message in that language, with {param} replaced.
  function t(lang, id, params) {
    const s = STRINGS[langOf(lang)][id];
    const str = s != null ? s : STRINGS.en[id] != null ? STRINGS.en[id] : id;
    return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : str;
  }

  // ---------- Closed catalog of blocks ----------
  const BLOCK_TYPES = {
    chart: { pos: ['bar', 'line', 'area', 'scatter', 'donut'], attrs: ['x', 'y', 'color', 'stack', 'unit', 'height', 'horizontal', 'labels', 'sort'] },
    kpi: { attrs: ['cols'] },
    progress: { attrs: ['value', 'max'] },
    timeline: { attrs: [] },
    compare: { attrs: ['before', 'after', 'better'] },
    decisions: { attrs: [] },
    sheet: { attrs: ['cols'] },
    mermaid: { attrs: [] },
    'vega-lite': { attrs: [] },
    html: { attrs: [] },
  };
  // Aliases for the block type (English variants and Spanish names).
  const TYPE_ALIASES = {
    kpis: 'kpi', charts: 'chart', graph: 'chart', vegalite: 'vega-lite', vega: 'vega-lite', decision: 'decisions', comparison: 'compare', sheets: 'sheet',
    grafica: 'chart', grafico: 'chart', 'gráfica': 'chart', 'gráfico': 'chart', progreso: 'progress', compara: 'compare', comparar: 'compare',
    hoja: 'sheet', linea: 'timeline', 'línea': 'timeline', decisiones: 'decisions',
  };
  // Status keywords (lowercase) -> status code. The first group of each is the canonical English spelling.
  const KPI_STATUS = { ok: 'ok', warn: 'warn', bad: 'bad', warning: 'warn', bien: 'ok', alerta: 'warn', mal: 'bad' };
  const TIMELINE_STATUS = {
    done: 'ok', 'in progress': 'progress', pending: 'pending', late: 'bad', blocked: 'bad',
    listo: 'ok', hecho: 'ok', 'en curso': 'progress', curso: 'progress', pendiente: 'pending', atrasado: 'bad', bloqueado: 'bad',
  };
  const TIMELINE_KEYS = { en: ['done', 'in progress', 'pending', 'late', 'blocked'], es: ['listo', 'hecho', 'en curso', 'pendiente', 'atrasado', 'bloqueado'] };
  // Label of a status code: ok | warn | bad | progress | pending. In a task list a finished item is "done", not "ok".
  const statusLabel = (code, lang, task) => t(lang, task && code === 'ok' ? 'status.done' : 'status.' + code);

  // ---------- Themes ----------
  // The light values double as "sentinels": Vega's SVG is drawn with them and they are then replaced with
  // var(--token, #light), so the same SVG works in light and dark. No hex value repeats.
  // Series: Okabe-Ito (credit Masataka Okabe and Kei Ito) and ColorBrewer Dark2 (notice in THIRD_PARTY_NOTICES.md),
  // adjusted per theme to reach 3:1 against background and surface.
  const THEMES = {
    light: {
      bg: '#FFFFFF', surface: '#F5F7F9', text: '#1C2127', text2: '#525B66', muted: '#69727D', border: '#D3D9DF',
      grid: '#E4E8EC', axis: '#8A939C', ok: '#1A7F37', warn: '#9A6700', bad: '#CF222E', accent: '#0A69CA',
      s: ['#0072B2', '#D55E00', '#1B9E77', '#7570B3', '#E7298A', '#A6761D', '#C0619A', '#5F6A73'],
    },
    dark: {
      bg: '#0D1117', surface: '#161B22', text: '#E6EDF3', text2: '#A3ACB6', muted: '#8B949E', border: '#30363D',
      grid: '#232A33', axis: '#5D6670', ok: '#3FB950', warn: '#D29922', bad: '#F85149', accent: '#4C9EF5',
      s: ['#56B4E9', '#E69F00', '#2BB58C', '#9D98DB', '#EF5DA8', '#C9A14A', '#D99ABF', '#9AA4AE'],
    },
  };
  // Theme names: light | dark (Spanish claro | oscuro accepted). Anything else passes through (auto, objects).
  const themeName = x => (x === 'claro' ? 'light' : x === 'oscuro' ? 'dark' : x);
  // Each series has a text tone that reaches 4.5:1 on background and surface (the line keeps the original color).
  // In light it is always darkened a little so the sentinel does not collide with the series color.
  for (const T of [THEMES.light, THEMES.dark]) T.st = T.s.map(c => textTone(c, T, T === THEMES.light));
  function mix(a, b, k) {
    const p = h => h.replace('#', '').match(/../g).map(x => parseInt(x, 16)), A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function textTone(c, T, light) {
    const passes = x => contrast(x, T.bg) >= 4.5 && contrast(x, T.surface) >= 4.5;
    if (!light && passes(c)) return c;
    for (let k = 0.06; k < 1; k += 0.03) { const x = mix(c, light ? '#000000' : '#FFFFFF', k); if (passes(x)) return x; }
    return T.text;
  }
  const TOKENS = ['bg', 'surface', 'text', 'text2', 'muted', 'border', 'grid', 'axis', 'ok', 'warn', 'bad', 'accent'];
  const FONT_STACK = "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  function cssVars(T) {
    const v = TOKENS.map(k => `--vis-${k}:${T[k]}`);
    v.push(`color-scheme:${T === THEMES.dark ? 'dark' : 'light'}`);
    T.s.forEach((c, i) => v.push(`--vis-s${i + 1}:${c}`));
    T.st.forEach((c, i) => v.push(`--vis-t${i + 1}:${c}`));
    return v.join(';');
  }

  // Sentinel -> token map, to tokenize Vega's SVG.
  const SENTINELS = (() => {
    const m = {};
    TOKENS.forEach(k => { m[THEMES.light[k].toLowerCase()] = k; });
    THEMES.light.s.forEach((c, i) => { m[c.toLowerCase()] = 's' + (i + 1); });
    THEMES.light.st.forEach((c, i) => { m[c.toLowerCase()] = 't' + (i + 1); });
    return m;
  })();

  function tokenizeSVG(svg) {
    // fill="#HEX" / stroke="#HEX" -> style="fill:var(--vis-x,#HEX)", merged into an existing style.
    return svg.replace(/<([a-zA-Z]+)((?:\s+[^\s=>]+="[^"]*")*)\s*(\/?)>/g, (all, tag, attrs, slash) => {
      const styles = [];
      const rest = attrs.replace(/\s+(fill|stroke)="(#[0-9a-fA-F]{6})"/g, (a, prop, hex) => {
        const tok = SENTINELS[hex.toLowerCase()];
        if (!tok) return a;
        styles.push(`${prop}:var(--vis-${tok},${hex})`);
        return '';
      });
      if (!styles.length) return all;
      let out = rest;
      if (/\sstyle="/.test(out)) out = out.replace(/\sstyle="([^"]*)"/, (a, s) => ` style="${s.replace(/;?\s*$/, ';')}${styles.join(';')}"`);
      else out += ` style="${styles.join(';')}"`;
      return `<${tag}${out}${slash ? ' /' : ''}>`;
    });
  }

  // ---------- Utilities ----------
  const escapeHTML = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function levenshtein(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // A fence language that looks like a misspelled VIS type: one edit away (two for long words), counting a swap of two
  // neighbouring letters as one edit. Other languages (shell, csharp, chartjs, ...) are left alone as code.
  function nearType(x) {
    if (x.length < 4) return null;
    for (const c of Object.keys(BLOCK_TYPES)) {
      if (c.length < 5) continue;
      if (osa(x, c) <= (x.length >= 8 ? 2 : 1)) return c;
    }
    return null;
  }
  function osa(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function suggest(x, list) {
    let best = null, dist = 99;
    for (const c of list) { const k = levenshtein(String(x).toLowerCase(), c.toLowerCase()); if (k < dist) { dist = k; best = c; } }
    return dist <= Math.max(2, Math.floor(String(x).length / 3)) ? best : null;
  }

  const RE_NUM = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
  const RE_THOUSANDS = /^-?\d{1,3}([.,]\d{3})+$/;
  const RE_DATE = /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2}(:\d{2})?)?$/;
  function validDate(s) {
    if (!RE_DATE.test(s)) return false;
    const [y, mo, d] = s.slice(0, 10).split('-').map(Number);
    if (mo < 1 || mo > 12) return false;
    if (d !== undefined && !Number.isNaN(d)) { const f = new Date(Date.UTC(y, mo - 1, d)); return f.getUTCDate() === d; }
    return true;
  }

  // "Human" number for compare and captions: 4,2 s -> 4.2; 1.240 -> 1240 (when it looks like thousands);
  // 1,234.56 and 1.234,56 -> 1234.56 (the last separator is the decimal one); −3 (U+2212) -> -3.
  function parseHumanNumber(s) {
    const m = String(s).replace(/\s/g, '').replace(/−/g, '-').match(/-?[\d.,]*\d[\d.,]*/);
    if (!m) return null;
    let x = m[0];
    if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
    else if (/^-?\d{1,3}(,\d{3})+$/.test(x)) x = x.replace(/,/g, '');
    else if (x.includes(',') && x.includes('.')) {
      const dec = x.lastIndexOf(',') > x.lastIndexOf('.') ? ',' : '.';
      x = x.split(dec === ',' ? '.' : ',').join('').replace(',', '.');
    } else x = x.replace(',', '.');
    const v = parseFloat(x);
    return Number.isFinite(v) ? v : null;
  }

  function formatNumber(v) {
    if (!Number.isFinite(v)) return String(v);
    return String(Math.round(v * 100) / 100);
  }

  // ---------- Dates ----------
  const TIME_LOCALE = {
    es: { dateTime: '%A, %e de %B de %Y, %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['a. m.', 'p. m.'],
      days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
      months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
      shortMonths: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] },
    en: { dateTime: '%x, %X', date: '%-m/%-d/%Y', time: '%-I:%M:%S %p', periods: ['AM', 'PM'],
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], shortDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
  };
  // Both locales use a decimal point and a thousands comma, like the data itself.
  const NUMBER_LOCALE = { decimal: '.', thousands: ',', grouping: [3], currency: ['$', ''] };
  // Axis formats (d3 time format) per language: "28 oct" / "Oct 28".
  const AXIS_FORMAT = {
    es: { day: '%-d %b', dayYear: '%-d %b %Y', month: '%b', monthYear: '%b %Y' },
    en: { day: '%b %-d', dayYear: '%b %-d, %Y', month: '%b', monthYear: '%b %Y' },
  };
  // "2026-10-28" -> "28 oct" / "Oct 28" (with the year when asked); "2026-10" -> "oct" / "Oct"; the time stays.
  function shortDate(v, withYear, lang) {
    const s = String(v), m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
    if (!m) return v;
    const L = langOf(lang), mon = TIME_LOCALE[L].shortMonths[Number(m[2]) - 1], day = m[3] ? String(Number(m[3])) : '';
    const rest = s.slice(m[0].length).replace(/^[T ]/, ' ');
    if (L === 'en') return `${mon}${day ? ' ' + day : ''}${withYear ? (day ? ', ' : ' ') + m[1] : ''}${rest}`;
    return `${day ? day + ' ' : ''}${mon}${withYear ? ' ' + m[1] : ''}${rest}`;
  }

  // ---------- Info string ----------
  function parseInfo(info) {
    const toks = [];
    const re = /\s*(?:([A-Za-z_][\w-]*)=(?:"((?:[^"\\]|\\.)*)"|(\S+))|"((?:[^"\\]|\\.)*)"|(\S+))/g;
    let m;
    while ((m = re.exec(info)) && m[0].trim()) {
      if (m[1]) toks.push({ k: m[1], v: m[2] != null ? m[2].replace(/\\(.)/g, '$1') : m[3] });
      else if (m[4] != null) toks.push({ q: m[4].replace(/\\(.)/g, '$1') });
      else toks.push({ p: m[5] });
    }
    return toks;
  }

  // ---------- Document parser ----------
  // Returns segments: {kind:'md', text, line} and {kind:'block', type, typeRaw, title, pos, attrs, body, line, closed, n, fence}.
  // Fences follow CommonMark: ``` or ~~~ (3 or more), up to 3 spaces of indent; the closing fence uses the same
  // character and is at least as long, so a ```` block can contain ``` lines. An unclosed block runs to the end.
  function parse(md) {
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const segs = [];
    let buf = [], bufLine = 1, nBlock = 0;
    const flush = () => { if (buf.length) segs.push({ kind: 'md', text: buf.join('\n'), line: bufLine }); buf = []; };
    for (let i = 0; i < lines.length;) {
      const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[i]);
      if (!m || (m[2][0] === '`' && m[3].includes('`'))) {
        if (!buf.length) bufLine = i + 1;
        buf.push(lines[i]); i++; continue;
      }
      const fence = m[2], info = m[3].trim();
      const closing = new RegExp('^ {0,3}' + (fence[0] === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$');
      let j = i + 1;
      while (j < lines.length && !closing.test(lines[j])) j++;
      const closed = j < lines.length;
      const toks = parseInfo(info);
      const typeRaw = toks.length && toks[0].p ? toks[0].p : '';
      const type = typeRaw.toLowerCase();
      const canon = BLOCK_TYPES[type] ? type : (TYPE_ALIASES[type] || null);
      const near = !canon ? nearType(type) : null;
      if (canon || near) {
        flush();
        nBlock++;
        const b = { kind: 'block', type: canon || type, typeRaw, title: null, pos: [], attrs: {}, body: lines.slice(i + 1, j).join('\n'), line: i + 1, closed, n: nBlock, fence: fence + info };
        if (!canon) b.unknown = near;
        for (const x of toks.slice(1)) {
          if (x.k) b.attrs[x.k] = x.v;
          else if (x.q != null && b.title == null) b.title = x.q;
          else b.pos.push(x.p != null ? x.p : x.q);
        }
        segs.push(b);
      } else {
        if (!buf.length) bufLine = i + 1;
        for (let k = i; k <= Math.min(j, lines.length - 1); k++) buf.push(lines[k]);
      }
      i = closed ? j + 1 : lines.length;
    }
    flush();
    return segs;
  }

  // ---------- CSV ----------
  // One record per line (quoted fields cannot span lines). A quote opens a quoted field only at the start of the
  // field, so 12" stays as written; "" inside quotes is a literal quote. Cells are trimmed.
  function parseCSV(text) {
    const rows = [];
    String(text).split('\n').forEach((l, idx) => {
      if (!l.trim()) return;
      const cells = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"' && !cur.trim()) { q = true; cur = ''; }
        else if (c === ',') { cells.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      cells.push(cur.trim());
      rows.push({ cells, off: idx });
    });
    return rows;
  }
  // Body lines without blanks or # comments, with their offset inside the body (for error lines).
  const bodyLines = body => body.split('\n').map((text, off) => ({ text, off })).filter(x => x.text.trim() && !/^\s*#/.test(x.text));
  const splitCells = s => s.split('|').map(x => x.trim());

  // ---------- Validator ----------
  function E(b, code, off, message, fix) {
    return { code, block: b ? `${b.type}#${b.n}` : '-', line: b ? b.line + (off == null ? 0 : off + 1) : 0, message, fix: fix || '' };
  }

  function chartData(b, errs, lang) {
    const T = (id, p) => t(lang, id, p);
    const rows = parseCSV(b.body);
    if (!rows.length) { errs.push(E(b, 'E_EMPTY', null, T('err.noData'), T('fix.noData'))); return null; }
    const header = rows[0].cells, data = rows.slice(1);
    const dup = header.find((c, i) => header.indexOf(c) !== i);
    if (dup) errs.push(E(b, 'E_CSV_COLS', rows[0].off, T('err.dupColumn', { c: dup }), T('fix.dupColumn')));
    if (!data.length) errs.push(E(b, 'E_EMPTY', rows[0].off, T('err.headerOnly'), T('fix.headerOnly')));
    if (data.length > MAX_ROWS) errs.push(E(b, 'E_ROWS', null, T('err.tooManyRows', { n: data.length, max: MAX_ROWS }), T('fix.tooManyRows')));
    for (const r of data) if (r.cells.length !== header.length) {
      errs.push(E(b, 'E_CSV_COLS', r.off, T('err.cellCount', { n: r.cells.length, m: header.length }), T('fix.cellCount')));
      return null;
    }
    const a = b.attrs;
    const kind = b.pos[0] || 'bar';
    const missing = (k, v) => {
      const s = suggest(v, header);
      errs.push(E(b, 'E_FIELD', null, T('err.fieldMissing', { k, v, cols: header.join(',') }), s ? T('fix.useField', { k, s }) : T('fix.oneOf', { list: header.join(', ') })));
    };
    const x = a.x || header[0];
    if (!header.includes(x)) { missing('x', x); return null; }
    const color = a.color || null;
    if (color && !header.includes(color)) { missing('color', color); return null; }
    let ys;
    if (a.y) {
      ys = a.y.split(',').map(s => s.trim()).filter(Boolean);
      for (const y of ys) if (!header.includes(y)) { missing('y', y); return null; }
    } else ys = header.filter(c => c !== x && c !== color);
    if (!ys.length) { errs.push(E(b, 'E_FIELD', null, T('err.noY'), T('fix.noY'))); return null; }
    if (color && ys.length > 1) { errs.push(E(b, 'E_ATTR', null, T('err.colorMultiY'), T('fix.colorMultiY'))); return null; }
    const idx = c => header.indexOf(c);
    for (const y of ys) for (const r of data) {
      const v = r.cells[idx(y)];
      if (v === '') continue;
      // 1.240 or 1,240: could be one thousand two hundred forty or one point twenty-four; never guessed.
      if (RE_THOUSANDS.test(v)) {
        const dec = v.replace(/[.,](?=\d{3}$)/, '.').replace(/[.,]/g, (m, i, s) => (i === s.lastIndexOf('.') ? '.' : ''));
        const one = (v.match(/[.,]/g) || []).length === 1;
        errs.push(E(b, 'E_THOUSANDS', r.off, T('err.thousands', { v, y }), one ? T('fix.thousandsOr', { a: v.replace(/[.,]/g, ''), b: parseFloat(dec) }) : T('fix.write', { a: v.replace(/[.,]/g, '') })));
        return null;
      }
      if (!RE_NUM.test(v)) {
        const fix = /^-?\d+,\d+$/.test(v) ? T('fix.decimalPoint', { x: v.replace(',', '.') }) : T('fix.onlyNumber');
        errs.push(E(b, 'E_CSV_NUM', r.off, T('err.notNumber', { v, y }), fix)); return null;
      }
    }
    const series = color ? new Set(data.map(r => r.cells[idx(color)])).size : ys.length;
    if (series > MAX_SERIES) errs.push(E(b, 'E_SERIES', null, T('err.tooManySeries', { n: series, max: MAX_SERIES }), T('fix.tooManySeries')));
    if (kind === 'donut' && ys.length > 1) errs.push(E(b, 'E_ATTR', null, T('err.donutMultiY'), T('fix.donutMultiY')));
    if (kind === 'donut') for (const r of data) { if (Number(r.cells[idx(ys[0])]) < 0) { errs.push(E(b, 'E_VALUE', r.off, T('err.donutNegative'), T('fix.donutNegative'))); break; } }
    const xs = data.map(r => r.cells[idx(x)]);
    const xNum = xs.every(v => RE_NUM.test(v));
    const xDate = !xNum && xs.every(v => RE_DATE.test(v));
    if (xDate) for (const r of data) if (!validDate(r.cells[idx(x)])) { errs.push(E(b, 'E_DATE', r.off, T('err.invalidDate', { v: r.cells[idx(x)] }), T('fix.dateMonth'))); return null; }
    if (kind === 'scatter' && !xNum) errs.push(E(b, 'E_CSV_NUM', null, T('err.scatterX', { x }), T('fix.scatterX')));
    const values = data.map(r => {
      const o = {};
      header.forEach((c, i) => { o[c] = (ys.includes(c) || (c === x && xNum)) && r.cells[i] !== '' ? Number(r.cells[i]) : (r.cells[i] === '' ? null : r.cells[i]); });
      return o;
    });
    return { header, x, ys, color, values, xNum, xDate, kind };
  }

  // Finds data.url (or any "url" string) in a vega-lite spec.
  function tooDeep(o, depth) {
    if (!o || typeof o !== 'object') return false;
    if ((depth || 0) > 40) return true;
    return Object.keys(o).some(k => tooDeep(o[k], (depth || 0) + 1));
  }
  function hasKey(o, key, depth) {
    if (!o || typeof o !== 'object') return false;
    if ((depth || 0) > 40) return true; // too deep to inspect: treat it as present
    if (Object.prototype.hasOwnProperty.call(o, key)) return true;
    return Object.keys(o).some(k => hasKey(o[k], key, (depth || 0) + 1));
  }
  function findURL(o, depth) {
    if (!o || typeof o !== 'object') return null;
    if (depth > 40) return null;
    if (typeof o.url === 'string') return o.url;
    for (const k of Object.keys(o)) { const u = findURL(o[k], (depth || 0) + 1); if (u) return u; }
    return null;
  }

  const MERMAID_STARTS = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph', 'mindmap', 'timeline', 'sankey-beta', 'xychart-beta', 'block-beta', 'packet-beta', 'kanban', 'architecture-beta', 'radar-beta', 'treemap-beta', 'zenuml', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', '---', '%%{init:'];

  // ctx: { vegaLite, lang, allowRemoteData }
  function validateBlock(b, errs, ctx) {
    ctx = ctx || {};
    const lang = ctx.lang, T = (id, p) => t(lang, id, p);
    if (b.unknown !== undefined) { errs.push(E(b, 'E_TYPE', -1, T('err.unknownType', { type: b.typeRaw }), b.unknown ? T('fix.didYouMean', { s: b.unknown }) : T('fix.typeList', { list: Object.keys(BLOCK_TYPES).join(', ') }))); return; }
    if (!b.closed) errs.push(E(b, 'E_UNCLOSED', -1, T('err.unclosed'), T('fix.unclosed', { fence: /^[`~]+/.exec(b.fence)[0] })));
    const def = BLOCK_TYPES[b.type];
    for (const k of Object.keys(b.attrs)) if (!def.attrs.includes(k)) {
      const s = suggest(k, def.attrs);
      errs.push(E(b, 'E_ATTR', -1, T('err.unknownAttr', { k, type: b.type }), s ? T('fix.didYouMeanAttr', { s }) : (def.attrs.length ? T('fix.attrList', { list: def.attrs.join(', ') }) : T('fix.noAttrs'))));
    }
    if (def.pos) {
      if (b.pos.length > 1) errs.push(E(b, 'E_ATTR', -1, T('err.extraHeader', { x: b.pos.slice(1).join(' ') }), T('fix.quoteTitle')));
      if (b.pos[0] && !def.pos.includes(b.pos[0])) { const s = suggest(b.pos[0], def.pos); errs.push(E(b, 'E_TYPE', -1, T('err.unknownKind', { x: b.pos[0] }), s ? T('fix.use', { s }) : T('fix.kindList', { list: def.pos.join(', ') }))); }
    } else if (b.pos.length) errs.push(E(b, 'E_ATTR', -1, T('err.extraHeader', { x: b.pos.join(' ') }), T('fix.quoteTitleAttrs')));
    if (!b.body.trim() && !(b.type === 'progress' && b.attrs.value != null)) { errs.push(E(b, 'E_EMPTY', null, T('err.empty'), T('fix.empty'))); return; }
    const a = b.attrs;
    const num = (k, min, max) => {
      if (a[k] == null) return;
      if (!RE_NUM.test(a[k]) || Number(a[k]) < min || Number(a[k]) > max) errs.push(E(b, 'E_VALUE', -1, T('err.outOfRange', { k, v: a[k] }), T('fix.between', { min, max })));
    };
    const bool = k => { if (a[k] != null && !['true', 'false', 'normalize'].includes(a[k])) errs.push(E(b, 'E_VALUE', -1, T('err.invalidValue', { k, v: a[k] }), T('fix.bool', { k }))); };
    switch (b.type) {
      case 'chart': {
        num('height', 80, 900); bool('stack'); bool('horizontal'); bool('labels');
        if (a.sort != null && !['desc', 'asc', 'none'].includes(a.sort)) errs.push(E(b, 'E_VALUE', -1, T('err.invalidValue', { k: 'sort', v: a.sort }), T('fix.sort')));
        if (a.horizontal === 'normalize' || a.labels === 'normalize') errs.push(E(b, 'E_VALUE', -1, T('err.normalize'), T('fix.trueFalse')));
        const d = chartData(b, errs, lang);
        if (d && ctx.vegaLite) {
          const w = [];
          try { ctx.vegaLite.compile(compileChartSpec(b, d, { width: 640, lang }), { logger: arrayLogger(w) }); } catch (e) { w.push(e.message); }
          for (const m of w) errs.push(E(b, 'E_VEGA', null, `Vega-Lite: ${m}`, T('fix.vegaChart')));
        }
        break;
      }
      case 'kpi': {
        num('cols', 1, 6);
        const ls = bodyLines(b.body);
        if (ls.length > MAX_KPIS) errs.push(E(b, 'E_ROWS', null, T('err.tooManyCards', { n: ls.length, max: MAX_KPIS }), T('fix.tooManyCards', { max: MAX_KPIS })));
        for (const l of ls) { const k = parseKPI(l.text, lang); if (k.error) errs.push(E(b, 'E_LINE', l.off, k.error, k.fix)); }
        break;
      }
      case 'progress': {
        if (a.value != null) {
          if (!RE_NUM.test(a.value)) errs.push(E(b, 'E_VALUE', -1, T('err.notNumberAttr', { v: a.value }), T('fix.value')));
          const max = a.max != null ? Number(a.max) : 100;
          if (a.max != null && !(RE_NUM.test(a.max) && max > 0)) errs.push(E(b, 'E_VALUE', -1, T('err.invalidValue', { k: 'max', v: a.max }), T('fix.max')));
          else if (Number(a.value) < 0 || Number(a.value) > max) errs.push(E(b, 'E_VALUE', -1, T('err.valueRange', { v: a.value, max }), T('fix.valueRange', { max })));
        } else if (a.max != null) errs.push(E(b, 'E_ATTR', -1, T('err.unknownAttr', { k: 'max', type: b.type }), T('fix.value')));
        for (const l of bodyLines(b.body)) { const x = parseTask(l.text, lang); if (x.error) errs.push(E(b, 'E_LINE', l.off, x.error, x.fix)); }
        break;
      }
      case 'timeline': {
        for (const l of bodyLines(b.body)) {
          const p = splitCells(l.text);
          if (p.length < 2 || p.length > 3) { errs.push(E(b, 'E_LINE', l.off, T('err.timelineLine'), T('fix.timelineLine'))); continue; }
          if (!validDate(p[0])) errs.push(E(b, 'E_DATE', l.off, T('err.invalidDate', { v: p[0] }), T('fix.dateTime')));
          if (p[2] != null && p[2] !== '' && !TIMELINE_STATUS[p[2].toLowerCase()]) {
            const v = p[2].toLowerCase(), s = suggest(v, TIMELINE_KEYS[langOf(lang)]) || suggest(v, Object.keys(TIMELINE_STATUS));
            errs.push(E(b, 'E_STATUS', l.off, T('err.unknownStatus', { v: p[2] }), s ? T('fix.use', { s }) : T('fix.statusList')));
          }
        }
        break;
      }
      case 'compare': {
        if (a.better && !['lower', 'higher'].includes(a.better)) errs.push(E(b, 'E_VALUE', -1, T('err.invalidValue', { k: 'better', v: a.better }), T('fix.better')));
        for (const l of bodyLines(b.body)) {
          const p = splitCells(l.text);
          if (!((p.length === 3) || (p.length === 2 && p.every(isImage)))) errs.push(E(b, 'E_LINE', l.off, T('err.compareLine'), T('fix.compareLine')));
          else if (p.length === 2 && !ctx.allowRemoteData) for (const x of p) if (isRemote(x)) errs.push(E(b, 'E_REMOTE', l.off, T('err.remoteImage', { url: x }), T('fix.remoteImage')));
        }
        break;
      }
      case 'decisions': {
        const ids = new Set();
        for (const l of bodyLines(b.body)) {
          const q = parseDecision(l.text, lang);
          if (q.error) { errs.push(E(b, 'E_LINE', l.off, q.error, q.fix)); continue; }
          if (ids.has(q.id)) errs.push(E(b, 'E_ID_DUP', l.off, T('err.dupId', { id: q.id }), T('fix.dupId')));
          ids.add(q.id);
        }
        break;
      }
      case 'sheet': {
        num('cols', 1, 8);
        const ls = bodyLines(b.body);
        if (ls.length > MAX_SHEET) errs.push(E(b, 'E_ROWS', null, T('err.tooManyImages', { n: ls.length, max: MAX_SHEET }), T('fix.tooManyImages')));
        for (const l of ls) {
          const p = splitCells(l.text);
          if (!p[0] || p.length > 2) errs.push(E(b, 'E_LINE', l.off, T('err.sheetLine'), T('fix.sheetLine')));
          else if (!ctx.allowRemoteData && isRemote(p[0])) errs.push(E(b, 'E_REMOTE', l.off, T('err.remoteImage', { url: p[0] }), T('fix.remoteImage')));
        }
        break;
      }
      case 'vega-lite': {
        let spec;
        try { spec = JSON.parse(b.body); } catch (e) { errs.push(E(b, 'E_JSON', null, T('err.json', { m: e.message }), T('fix.json'))); break; }
        if (tooDeep(spec)) { errs.push(E(b, 'E_VEGA', null, T('err.vegaDeep'), T('fix.vegaDeep'))); break; }
        const url = ctx.allowRemoteData ? null : findURL(spec);
        if (url) errs.push(E(b, 'E_REMOTE', null, T('err.remote', { url }), T('fix.remote')));
        // Links in charts (the href channel or mark property) are not supported: they would be clickable URLs written by
        // the model, and Vega's SVG renderer in Node crashes on them.
        if (hasKey(spec, 'href')) errs.push(E(b, 'E_VEGA', null, T('err.vegaHref'), T('fix.vegaHref')));
        if (ctx.vegaLite) { const w = []; try { ctx.vegaLite.compile(spec, { logger: arrayLogger(w) }); } catch (e) { w.push(e.message); } for (const m of w) errs.push(E(b, 'E_VEGA', null, `Vega-Lite: ${m}`, T('fix.vegaSpec'))); }
        break;
      }
      case 'mermaid': {
        const p = b.body.trim().split(/\s+/)[0] || '';
        if (!MERMAID_STARTS.some(k => p === k || p.startsWith(k))) errs.push(E(b, 'E_VALUE', 0, T('err.mermaidStart', { p }), T('fix.mermaidStart')));
        break;
      }
    }
  }

  function arrayLogger(arr) {
    const l = { level() { return l; }, warn(...m) { arr.push(m.join(' ')); }, info() {}, debug() {}, error(...m) { arr.push(m.join(' ')); } };
    return l;
  }

  // check(md, { vegaLite, lang, max, allowRemoteData }) -> { ok, total, errors (first `max`), blocks }
  function check(md, opts) {
    opts = opts || {};
    const ctx = { vegaLite: opts.vegaLite || (typeof vegaLite !== 'undefined' ? vegaLite : null), lang: opts.lang, allowRemoteData: !!opts.allowRemoteData };
    const errs = [];
    const segs = parse(md);
    for (const s of segs) if (s.kind === 'block') validateBlock(s, errs, ctx);
    return { ok: errs.length === 0, total: errs.length, errors: errs.slice(0, opts.max || MAX_ERRORS), blocks: segs.filter(s => s.kind === 'block').length };
  }
  // One error per line: code|block|line|message|fix (pipes inside the fields become slashes).
  const formatError = e => [e.code, e.block, e.line, e.message, e.fix].map(x => String(x).replace(/\|/g, '/')).join('|');

  // ---------- Line readers ----------
  function parseKPI(text, lang) {
    const T = (id, p) => t(lang, id, p);
    const m = /^\s*[-*]?\s*([^:]+?):\s*(.+?)\s*$/.exec(text);
    if (!m) return { error: T('err.kpiColon', { t: text.trim() }), fix: T('fix.kpiColon') };
    let label = m[1], rest = m[2], delta = null, status = null;
    // Other blocks separate with |; in kpi the delta and the status go in parentheses.
    if (/\s\|\s/.test(rest)) return { error: T('err.kpiPipes'), fix: T('fix.kpiPipes', { label: label.trim(), value: rest.split('|')[0].trim(), rest: rest.split('|').slice(1).map(x => x.trim()).filter(Boolean).join(', ') }) };
    const p = /\(([^()]*)\)\s*$/.exec(rest);
    if (p) {
      rest = rest.slice(0, p.index).trim();
      for (const x of p[1].split(',').map(s => s.trim()).filter(Boolean)) {
        if (KPI_STATUS[x.toLowerCase()]) status = KPI_STATUS[x.toLowerCase()];
        else if (delta == null) delta = x;
        else return { error: T('err.kpiExtra', { x }), fix: T('fix.kpiExtra') };
      }
    }
    if (!rest) return { error: T('err.kpiNoValue', { label }), fix: T('fix.kpiNoValue') };
    return { label, value: rest, delta, status };
  }
  function parseTask(text, lang) {
    const m = /^\s*[-*]\s*\[([ xX~])\]\s*(.+?)\s*$/.exec(text);
    if (!m) return { error: t(lang, 'err.taskBox', { t: text.trim() }), fix: t(lang, 'fix.taskBox') };
    let label = m[2], pct = null;
    const p = /\((\d{1,3})\s*%\)\s*$/.exec(label);
    if (p) { pct = Number(p[1]); label = label.slice(0, p.index).trim(); if (pct > 100) return { error: t(lang, 'err.pctOver', { pct }), fix: t(lang, 'fix.pctOver') }; }
    const status = m[1] === ' ' ? 'pending' : m[1] === '~' ? 'progress' : 'ok';
    return { label, status, pct: status === 'ok' ? 100 : status === 'pending' ? 0 : (pct == null ? 50 : pct), pctGiven: pct != null };
  }
  const INPUT_TYPES = { date: 'date', text: 'text', range: 'range', fecha: 'date', texto: 'text', rango: 'range' };
  // A free "other" option: "...", "Other...", "Otra...", or any label ending in ... (or …).
  const OTHER_RE = /(\.\.\.|…)$/;
  function parseDecision(text, lang) {
    const T = (id, p) => t(lang, id, p);
    const p = splitCells(text);
    if (p.length < 3) return { error: T('err.decLine'), fix: T('fix.decLine') };
    let id = p[0], multi = false;
    if (id.endsWith('+')) { multi = true; id = id.slice(0, -1).trim(); }
    if (!/^[A-Za-z][\w-]*$/.test(id)) return { error: T('err.decId', { id: p[0] }), fix: T('fix.decId') };
    const options = [];
    let input = null;
    for (const o of p.slice(2)) {
      if (!o) return { error: T('err.decEmptyOption'), fix: T('fix.decEmptyOption') };
      if (o.startsWith('@')) {
        const m = /^@([a-z]+)(?:\s+(-?\d+)\s*-\s*(-?\d+))?$/.exec(o);
        if (!m || !INPUT_TYPES[m[1]]) return { error: T('err.decInput', { o }), fix: T('fix.decInput') };
        const type = INPUT_TYPES[m[1]];
        if (type === 'range' && m[2] == null) return { error: T('err.decRange'), fix: T('fix.decRange') };
        input = { type, min: m[2] != null ? Number(m[2]) : null, max: m[3] != null ? Number(m[3]) : null };
        continue;
      }
      if (OTHER_RE.test(o)) { options.push({ label: o.replace(OTHER_RE, '').trim() || T('dec.other'), other: true }); continue; }
      let label = o, value = null, hint = null, rec = false;
      const v = /\s*=>\s*(.+)$/.exec(label); if (v) { value = v[1].trim(); label = label.slice(0, v.index); }
      const h = /\s*~\s*(.+)$/.exec(label); if (h) { hint = h[1].trim(); label = label.slice(0, h.index); }
      label = label.trim();
      if (label.endsWith('*')) { rec = true; label = label.slice(0, -1).trim(); }
      options.push({ label, value: value || label, hint, rec });
    }
    if (!options.length && !input) return { error: T('err.decNoOptions', { id }), fix: T('fix.decNoOptions') };
    if (options.filter(o => o.rec).length > 1 && !multi) return { error: T('err.decMultiRec', { id }), fix: T('fix.decMultiRec') };
    return { id, multi, question: p[1], options, input };
  }
  const isImage = s => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(s);
  // An image path with a scheme (https:, file:, ...) or protocol-relative: whoever opens the page would fetch it, which
  // can carry data out of the conversation. Inline data:image URIs are fine.
  // Browsers drop tabs and newlines anywhere in a URL and control characters or spaces at its ends: do the same first.
  const isRemote = s => {
    const u = String(s).replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
    return (/^[a-z][a-z0-9+.-]*:/i.test(u) || /^[\\/]{2}/.test(u)) && !/^data:image\//i.test(u);
  };

  // ---------- chart -> Vega-Lite ----------
  // The title carries the unit unless it already says it.
  function chartTitle(b) {
    const unit = b.attrs.unit;
    return b.title ? (unit && !b.title.toLowerCase().includes(unit.toLowerCase()) ? `${b.title} (${unit})` : b.title) : null;
  }
  // o: { width, lang, titleInSVG }
  function compileChartSpec(b, d, o) {
    o = o || {};
    const T = THEMES.light, W = o.width || 640, F = AXIS_FORMAT[langOf(o.lang)];
    const a = b.attrs, kind = d.kind, unit = a.unit;
    const title = chartTitle(b);
    const long = d.ys.length > 1 && !d.color;
    const yField = long ? 'value' : d.ys[0];
    const series = long ? 'series' : d.color;
    // With a title the axes do not repeat what it says; without one, the y axis carries the column and the unit.
    const yTitle = title && kind !== 'scatter' ? null : long ? (unit || null) : (unit && unit.toLowerCase() !== d.ys[0].toLowerCase() ? `${d.ys[0]} (${unit})` : d.ys[0]);
    // Bars grouped by date: xOffset only works on a discrete axis; on a time axis the bars overlap.
    const discreteDate = d.xDate && kind === 'bar' && (long || !!d.color) && a.stack !== 'true' && a.stack !== 'normalize';
    const xType = d.xDate && !discreteDate ? 'temporal' : (d.xNum && kind !== 'bar') ? 'quantitative' : 'ordinal';
    // Bars with long labels or many categories lie down on their own (unless horizontal=false).
    const nCat = new Set(d.values.map(r => String(r[d.x]))).size;
    const labelLen = Math.max(...d.values.map(r => String(r[d.x]).length));
    const band = W / Math.max(1, nCat);
    const horiz = a.horizontal === 'true' || (a.horizontal == null && kind === 'bar' && xType === 'ordinal' && !d.xDate && (labelLen * 7.2 > band * 0.92 || nCat > 14));
    const stack = a.stack === 'true' ? 'zero' : a.stack === 'normalize' ? 'normalize' : null;
    const height = Number(a.height) || (horiz ? Math.max(160, d.values.length * (long ? 14 * d.ys.length + 10 : 28) + 60) : 240);
    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: W, height,
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: d.values },
      config: {
        background: null, font: FONT_STACK, padding: 4,
        view: { stroke: null },
        title: { color: T.text, fontSize: 17, fontWeight: 600, anchor: 'start', frame: 'bounds', offset: 12 },
        axis: { labelColor: T.text2, titleColor: T.text2, gridColor: T.grid, domainColor: T.axis, tickColor: T.axis, labelFontSize: 13, titleFontSize: 13, titleFontWeight: 'normal', labelPadding: 4 },
        axisX: { grid: false }, axisY: { domain: false, ticks: false },
        scale: { bandPaddingInner: 0.3 },
        legend: { labelColor: T.text2, titleColor: T.text2, labelFontSize: 13, titleFontSize: 13, orient: 'top', title: null, symbolType: 'square' },
        range: { category: T.s },
        bar: { color: T.s[0], cornerRadiusEnd: 3 }, line: { color: T.s[0], strokeWidth: 2 }, point: { color: T.s[0], filled: true, size: 50 },
        area: { color: T.s[0] }, arc: { stroke: T.bg, strokeWidth: 2 },
        text: { color: T.text2, fontSize: 13 },
      },
    };
    if (title && o.titleInSVG) spec.title = title;
    if (long) spec.transform = [{ fold: d.ys, as: ['series', 'value'] }];
    const xEnc = { field: d.x, type: xType, title: title && kind !== 'scatter' ? null : d.x, sort: null };
    if (xType === 'ordinal') xEnc.axis = { labelAngle: 0, labelLimit: 160 };
    if (d.xDate) {
      const years = new Set(d.values.map(r => String(r[d.x]).slice(0, 4)));
      const withDay = String(d.values[0][d.x]).length > 7;
      xEnc.axis = { format: years.size === 1 ? (withDay ? F.day : F.month) : (withDay ? F.dayYear : F.monthYear), labelAngle: 0, labelOverlap: 'greedy', labelFlush: false, labelSeparation: 6 };
      if (years.size === 1) xEnc.title = [...years][0];
      // On a discrete axis Vega-Lite ignores format: the label is built with utcFormat.
      // Padding on both sides so the first and last labels neither touch the y axis nor get cut.
      if (discreteDate) {
        const step = W / Math.max(1, nCat), half = (xEnc.axis.format.length + 1) * 3.6;
        xEnc.timeUnit = withDay ? 'utcyearmonthdate' : 'utcyearmonth';
        xEnc.axis.labelExpr = `utcFormat(datum.value, '${xEnc.axis.format}')`; delete xEnc.axis.format;
        xEnc.scale = { paddingOuter: Math.min(2, Math.max(0, (half + 4 - step / 2) / step)) };
      }
      // YYYY-MM dates are read as UTC: so is the scale, or west of UTC July 1 shows up as June 30.
      if (!discreteDate) xEnc.scale = Object.assign({ type: 'utc' }, kind !== 'bar' ? { padding: 14 } : {});
      if (!withDay && !discreteDate) {
        const month = v => { const [y, m] = String(v).split('-').map(Number); return y * 12 + m - 1; };
        const ms = d.values.map(r => month(r[d.x]));
        const months = Math.max(...ms) - Math.min(...ms) + 1;
        // "May" fits in ~40 px; "May 2026" needs ~64.
        const slots = Math.max(2, Math.floor(W * 0.85 / (/%Y/.test(xEnc.axis.format) ? 64 : 40)));
        // One tick per month, or every 2, 3, 4, 6 or 12 (aligned to the calendar): never two labels with the same month.
        // If possible the step puts ticks on the first and last month of the data; otherwise at least on the last.
        const fits = [1, 2, 3, 4, 6, 12].filter(p => Math.ceil(months / p) <= slots);
        const first = Math.min(...ms) % 12, last = Math.max(...ms) % 12;
        const step = fits.find(p => first % p === 0 && last % p === 0) || fits.find(p => last % p === 0 && months / p >= 3) || fits[0] || 12;
        xEnc.axis.tickCount = { interval: 'month', step };
      }
    }
    const yEnc = { field: yField, type: 'quantitative', title: yTitle, axis: { labelOverlap: 'greedy', labelSeparation: 6 } };
    const colorEnc = series ? { field: series, type: 'nominal', sort: long ? d.ys : null, scale: { range: T.s } } : undefined;
    const tooltip = [{ field: d.x, type: xType }].concat(long ? [{ field: 'series', type: 'nominal' }, { field: 'value', type: 'quantitative' }] : d.ys.map(y => ({ field: y, type: 'quantitative' }))).concat(d.color ? [{ field: d.color, type: 'nominal' }] : []);
    let enc;
    if (kind === 'donut') {
      const tot = d.values.reduce((s, r) => s + (r[d.ys[0]] || 0), 0);
      spec.transform = [{ window: [{ op: 'row_number', as: '_idx' }] }, { calculate: `datum['${d.ys[0].replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'] / ${tot || 1}`, as: '_pct' }];
      spec.mark = { type: 'arc', innerRadius: Math.round(height * 0.22), outerRadius: Math.round(height * 0.42) };
      spec.encoding = { theta: { field: d.ys[0], type: 'quantitative', stack: true }, color: { field: d.x, type: 'nominal', sort: null, scale: { range: T.s }, legend: { orient: 'right', title: null } }, order: { field: '_idx', type: 'quantitative' }, tooltip: [{ field: d.x, type: 'nominal' }, { field: d.ys[0], type: 'quantitative' }, { field: '_pct', type: 'quantitative', format: '.0%', title: '%' }] };
      return spec;
    }
    if (kind === 'scatter') {
      enc = { x: { field: d.x, type: 'quantitative', title: d.x, scale: { zero: false } }, y: Object.assign(yEnc, { scale: { zero: false } }), tooltip };
      if (colorEnc) enc.color = colorEnc;
      spec.mark = { type: 'point', filled: true, size: 60 };
      spec.encoding = enc;
      return spec;
    }
    const mark = kind === 'bar' ? 'bar' : kind === 'area' ? 'area' : 'line';
    spec.mark = mark === 'line' ? { type: 'line', strokeWidth: 2 } : mark === 'area' ? { type: 'area', line: { strokeWidth: 2 }, opacity: long || d.color ? 0.75 : 0.25 } : { type: 'bar', cornerRadiusEnd: 3 };
    if (mark === 'bar') yEnc.scale = { zero: true };
    else yEnc.scale = { nice: true, zero: kind === 'area' || undefined };
    // Bars from largest to smallest when the category is neither a date nor a number (sort=none keeps the data order).
    const order = a.sort || (mark === 'bar' && xType === 'ordinal' && !d.xNum && !d.xDate ? 'desc' : 'none');
    if (order !== 'none') xEnc.sort = { field: yField, op: 'sum', order: order === 'desc' ? 'descending' : 'ascending' };
    if (mark === 'area') yEnc.stack = (long || d.color) ? (stack || 'zero') : null;
    if (mark === 'bar') yEnc.stack = (long || d.color) ? stack : null;
    enc = { x: xEnc, y: yEnc, tooltip };
    if (colorEnc) enc.color = colorEnc;
    if (mark === 'bar' && (long || d.color) && !stack) enc[horiz ? 'yOffset' : 'xOffset'] = { field: series, sort: long ? d.ys : null };
    // Ticks by available space: one every ~64 px along the value axis.
    yEnc.axis.tickCount = Math.max(2, Math.round((horiz ? W * 0.75 : height) / 64));
    // The domain is rounded with the axis ticks: the highest value never sits above the last gridline.
    yEnc.scale = Object.assign(yEnc.scale || {}, { nice: yEnc.axis.tickCount });
    if (horiz) { const x = enc.x; enc.x = enc.y; enc.y = x; enc.y.axis = { labelLimit: 160, ticks: false, domain: false }; }
    else if (mark === 'bar' && xType === 'ordinal') xEnc.axis.ticks = false;
    // With value labels on bars the value axis is redundant.
    if (a.labels === 'true' && mark === 'bar') {
      enc[horiz ? 'x' : 'y'].axis = { labels: false, ticks: false, domain: false, grid: false, title: null };
      // Without an axis there is no need to round: leave room so the longest bar's label fits.
      if (!stack && !(long || d.color)) {
        const m = Math.max(0, ...d.values.map(r => r[yField]).filter(v => v != null));
        if (m > 0) {
          // Lying down, the room is measured in px: on a phone the bar area is narrow and 18 % is not enough for the figure.
          let f = horiz ? 1.18 : 1.1;
          if (horiz) { const area = W - Math.min(160, labelLen * 7.2) - 18, fig = formatNumber(m).length * 8 + 10; f = Math.max(f, area / Math.max(area * 0.4, area - fig)); }
          enc[horiz ? 'x' : 'y'].scale = { zero: true, nice: false, domainMax: m * f };
        }
      }
    }
    if (a.labels === 'true' && mark !== 'area') {
      const txt = { mark: { type: 'text', [horiz ? 'dx' : 'dy']: horiz ? 4 : -6, align: horiz ? 'left' : 'center', baseline: horiz ? 'middle' : 'bottom', color: T.text2, fontSize: 13 }, encoding: { x: enc.x, y: enc.y, text: { field: yField, type: 'quantitative', format: ',~r' } } };
      if (enc.xOffset) txt.encoding.xOffset = enc.xOffset;
      if (enc.yOffset) txt.encoding.yOffset = enc.yOffset;
      spec.layer = [{ mark: spec.mark, encoding: enc }, txt];
      delete spec.mark;
      return spec;
    }
    if (mark === 'line' || mark === 'area') return seriesEnds(spec, enc, d, { series, yField, height, long, T });
    spec.encoding = enc;
    return spec;
  }

  // Lines and areas: a dot on the last value of each series and, with 2 to 4 series that do not overlap, its name
  // next to it (instead of the legend). The rows at the last x get _end=1.
  function seriesEnds(spec, enc, d, { series, yField, height, long, T }) {
    const key = r => (d.xNum ? Number(r[d.x]) : String(r[d.x]));
    const groups = new Map();
    d.values.forEach((r, i) => { const g = long || !series ? '' : String(r[series]); const u = groups.get(g); if (u == null || key(r) >= key(d.values[u])) groups.set(g, i); });
    const ends = new Set(groups.values());
    spec.data = { values: d.values.map((r, i) => (ends.has(i) ? Object.assign({}, r, { _end: 1 }) : r)) };
    const lasts = long ? d.ys.map(y => [y, d.values[[...ends][0]][y]]) : [...groups].map(([g, i]) => [g, d.values[i][yField]]);
    const max = Math.max(...d.values.flatMap(r => (long ? d.ys.map(y => r[y]) : [r[yField]])).filter(v => v != null), 0) || 1;
    const vals = lasts.map(u => u[1]).filter(v => v != null).sort((x, y) => x - y);
    const apart = vals.every((v, i) => i === 0 || (v - vals[i - 1]) / max * height >= 16);
    const names = series && lasts.length >= 2 && lasts.length <= 4 && apart;
    const filter = [{ filter: 'datum._end === 1' }];
    const layers = [{ mark: spec.mark, encoding: enc }, { transform: filter, mark: { type: 'point', filled: true, size: 40, opacity: 1 }, encoding: { x: enc.x, y: enc.y, color: enc.color } }];
    if (names) {
      enc.color.legend = null;
      const S = JSON.stringify(series);
      const domain = long ? d.ys : [...new Set(d.values.map(r => String(r[series])))];
      const tone = domain.reduceRight((acc, v, i) => `datum[${S}] === ${JSON.stringify(v)} ? '${T.st[i % T.st.length]}' : ${acc}`, `'${T.text}'`);
      const label = [{ calculate: `datum[${S}] + ' ' + format(datum[${JSON.stringify(yField)}], ',~r')`, as: '_label' }, { calculate: tone, as: '_tone' }];
      layers.push({ transform: filter.concat(label), mark: { type: 'text', align: 'left', baseline: 'middle', dx: 7, fontSize: 13, fontWeight: 600 }, encoding: { x: enc.x, y: enc.y, color: { field: '_tone', type: 'nominal', scale: null }, text: { field: '_label', type: 'nominal' } } });
    }
    if (!enc.color) layers[1].mark.color = T.s[0];
    spec.layer = layers;
    delete spec.mark; delete spec.encoding;
    return spec;
  }

  // chartToVegaLite(block, { width, lang }) -> Vega-Lite spec; throws with the formatted errors if the data is invalid.
  function chartToVegaLite(b, o) {
    o = o || {};
    const errs = [];
    const d = chartData(b, errs, o.lang);
    if (!d) throw new Error(errs.map(formatError).join('\n'));
    return compileChartSpec(b, d, o);
  }

  // Alt text generated from the data (not from the drawing).
  function chartAlt(b, lang) {
    const d = chartData(b, [], lang);
    if (!d) return b.title || t(lang, 'alt.chart');
    const kind = t(lang, 'kind.' + d.kind);
    const parts = [`${t(lang, 'alt.head', { kind })}${b.title ? ': ' + b.title : ''}`, t(lang, 'alt.points', { n: d.values.length, x: d.x })];
    for (const y of (d.color ? [d.ys[0]] : d.ys)) {
      const vals = d.values.map(r => r[y]).filter(v => v != null);
      if (!vals.length) continue;
      const max = Math.max(...vals), min = Math.min(...vals);
      const rMax = d.values.find(r => r[y] === max), rMin = d.values.find(r => r[y] === min);
      parts.push(t(lang, 'alt.series', { y, max: formatNumber(max), xmax: rMax[d.x], min: formatNumber(min), xmin: rMin[d.x] }));
    }
    return parts.join('; ');
  }

  // ---------- Minimal Markdown to HTML (text, tables and lists; never raw HTML) ----------
  function inline(s) {
    const codes = [];
    let x = String(s).replace(/\u0000/g, '').replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    x = escapeHTML(x);
    // Links: only http(s), mailto, anchors, relative paths and a few file types; anything else stays as its text.
    // The label can't contain brackets, so each "[" scans only up to the next one (linear on hostile input).
    x = x.replace(/\[([^\][]{1,1000})\]\(([^)\s]{1,2000})\)/g, (m, txt, url) => {
      const u = url.replace(/&amp;/g, '&');
      if (!/^(https?:|mailto:|#|\.{0,2}\/|[\w-]+\.(md|html|png|jpe?g|pdf)$)/i.test(u)) return txt;
      return `<a href="${escapeHTML(u)}">${txt}</a>`;
    });
    x = x.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
    x = x.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
    x = x.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return x.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${escapeHTML(codes[i])}</code>`);
  }
  const tableCells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  function markdownToHTML(md) {
    const L = String(md).replace(/\r\n?/g, '\n').split('\n'); const out = []; let i = 0;
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s{0,3}(`{3,}|~{3,})/.test(l)) {
        const f = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(l); const c = []; i++;
        const closing = new RegExp('^\\s{0,3}' + f[1][0] + '{' + f[1].length + ',}\\s*$');
        while (i < L.length && !closing.test(L[i])) c.push(L[i++]);
        i++;
        const lang = f[2].trim().split(/\s+/)[0];
        out.push(`<pre><code${lang ? ` class="language-${escapeHTML(lang)}"` : ''}>${escapeHTML(c.join('\n'))}</code></pre>`); continue;
      }
      if (/^\s*>/.test(l)) { const c = []; while (i < L.length && /^\s*>/.test(L[i])) c.push(L[i++].replace(/^\s*>\s?/, '')); out.push(`<blockquote>${markdownToHTML(c.join('\n'))}</blockquote>`); continue; }
      if (l.includes('|') && i + 1 < L.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i + 1])) {
        const head = tableCells(l), al = tableCells(L[i + 1]).map(s => (s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : null));
        i += 2; const rows = [];
        while (i < L.length && L[i].includes('|') && L[i].trim()) rows.push(tableCells(L[i++]));
        const st = k => (al[k] ? ` style="text-align:${al[k]}"` : '');
        out.push(`<div class="vis-table"><table><thead><tr>${head.map((c, k) => `<th${st(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(f => `<tr>${head.map((_, k) => `<td${st(k)}>${inline(f[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if ((m = /^(\s*)([-*+]|\d+[.)])\s+/.exec(l))) {
        const ordered = /\d/.test(m[2]); const items = []; const base = m[1].length;
        while (i < L.length) {
          const mm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(L[i]);
          if (mm && mm[1].length <= base + 1) { items.push([mm[3]]); i++; continue; }
          if (L[i].trim() && /^\s{2,}/.test(L[i]) && items.length) { items[items.length - 1].push(L[i].replace(/^\s{2,4}/, '')); i++; continue; }
          break;
        }
        const li = it => {
          const task = /^\[([ xX])\]\s+(.*)$/.exec(it[0]);
          const head = task ? `<span class="vis-checkbox">${task[1] === ' ' ? '&#9744;' : '&#9745;'}</span> ${inline(task[2])}` : inline(it[0]);
          return `<li>${head}${it.length > 1 ? markdownToHTML(it.slice(1).join('\n')) : ''}</li>`;
        };
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(li).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
      }
      const p = [];
      while (i < L.length && L[i].trim() && !/^(#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s+|\s{0,3}(`{3,}|~{3,}))/.test(L[i])) p.push(L[i++].trim());
      if (!p.length) p.push(L[i++].trim());
      out.push(`<p>${p.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  // ---------- Blocks to HTML ----------
  const ICON = {
    ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.6 8.2l1.7 1.7 3.2-3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    progress: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>',
    pending: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    bad: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2l6.3 11.3H1.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.5v3.2M8 11.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  };

  function figure(b, inner, extra, title) {
    const x = title !== undefined ? title : b.title;
    return `<figure class="vis-block vis-${b.type}"${extra || ''}>${x ? `<figcaption class="vis-title">${escapeHTML(x)}</figcaption>` : ''}${inner}</figure>`;
  }

  function htmlKPI(b, o) {
    const lang = o.lang;
    const ks = bodyLines(b.body).map(l => parseKPI(l.text, lang)).filter(k => !k.error);
    const cols = b.attrs.cols ? `style="grid-template-columns:repeat(${Number(b.attrs.cols)},minmax(0,1fr))"` : '';
    const card = k => {
      const name = k.status ? statusLabel(k.status, lang) : '';
      const st = k.status ? `<span class="vis-status vis-st-${k.status}">${ICON[k.status]}${escapeHTML(name)}</span>` : '';
      const dl = k.delta ? `<span class="vis-delta${k.status ? ' vis-st-' + k.status : ''}">${/^[-−]/.test(k.delta) ? '&#9660;' : /^\+/.test(k.delta) ? '&#9650;' : ''} ${escapeHTML(k.delta)}</span>` : '';
      return `<div class="vis-kpi-card" role="group" aria-label="${escapeHTML(`${k.label}: ${k.value}${k.delta ? ', ' + k.delta : ''}${k.status ? ', ' + name : ''}`)}"><div class="vis-kpi-label">${escapeHTML(k.label)}</div><div class="vis-kpi-value">${escapeHTML(k.value)}</div><div class="vis-kpi-foot">${dl}${st}</div></div>`;
    };
    return figure(b, `<div class="vis-kpis" ${cols}>${ks.map(card).join('')}</div>`);
  }

  function progressData(b, lang) {
    const tasks = bodyLines(b.body).map(l => parseTask(l.text, lang)).filter(x => !x.error);
    let pct;
    if (b.attrs.value != null) pct = Number(b.attrs.value) / (b.attrs.max != null ? Number(b.attrs.max) : 100) * 100;
    else pct = tasks.length ? tasks.reduce((s, x) => s + x.pct, 0) / tasks.length : 0;
    return { tasks, pct: Math.round(pct) };
  }
  function htmlProgress(b, o) {
    const lang = o.lang;
    const { tasks, pct } = progressData(b, lang);
    const value = b.attrs.value != null ? `${formatNumber(Number(b.attrs.value))}${b.attrs.max != null ? ' / ' + formatNumber(Number(b.attrs.max)) : ' %'}` : `${pct} %`;
    const bar = `<div class="vis-meter"><div class="vis-meter-value">${escapeHTML(value)}</div><div class="vis-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHTML((b.title || t(lang, 'progress.label')) + ' ' + pct + ' %')}"><div class="vis-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div></div>`;
    const list = tasks.length ? `<ul class="vis-tasks">${tasks.map(x => `<li class="vis-task-${x.status}"><span class="vis-icon">${ICON[x.status]}</span><span class="vis-task-label">${escapeHTML(x.label)}</span><span class="vis-task-pct">${x.status === 'progress' && x.pctGiven ? x.pct + ' %' : escapeHTML(statusLabel(x.status, lang, true))}</span></li>`).join('')}</ul>` : '';
    return figure(b, bar + list);
  }

  function htmlTimeline(b, o) {
    const lang = o.lang;
    const items = bodyLines(b.body).map(l => splitCells(l.text)).filter(p => p.length >= 2);
    const withYear = new Set(items.map(p => p[0].slice(0, 4))).size > 1;
    return figure(b, `<ol class="vis-tl">${items.map(p => {
      const raw = (p[2] || '').toLowerCase(), e = TIMELINE_STATUS[raw] || 'pending';
      // The status is shown as written; a short alias ("curso") or a missing one shows the full name.
      const shown = raw === 'curso' || !p[2] ? statusLabel(e, lang) : p[2];
      return `<li class="vis-tl-${e}"><span class="vis-tl-dot">${ICON[e]}</span><span class="vis-tl-meta"><time datetime="${escapeHTML(p[0])}">${escapeHTML(shortDate(p[0], withYear, lang))}</time> · ${escapeHTML(shown)}</span><span class="vis-tl-event">${escapeHTML(p[1])}</span></li>`;
    }).join('')}</ol>`);
  }

  function htmlCompare(b, o) {
    const lang = o.lang;
    const rows = bodyLines(b.body).map(l => splitCells(l.text));
    const A = b.attrs.before || t(lang, 'compare.before'), D = b.attrs.after || t(lang, 'compare.after');
    const imgs = rows.filter(p => p.length === 2 && p.every(isImage));
    const nums = rows.filter(p => p.length === 3);
    let h = '';
    if (nums.length) {
      h += `<div class="vis-table"><table class="vis-cmp"><thead><tr><th></th><th style="text-align:right">${escapeHTML(A)}</th><th style="text-align:right">${escapeHTML(D)}</th><th style="text-align:right">${escapeHTML(t(lang, 'compare.change'))}</th></tr></thead><tbody>`;
      for (const [m, x, y] of nums) {
        const vx = parseHumanNumber(x), vy = parseHumanNumber(y);
        let change = '', cls = '';
        if (vx != null && vy != null && vx !== 0) {
          const pct = (vy - vx) / Math.abs(vx) * 100;
          change = `${pct > 0 ? '&#9650;&nbsp;+' : pct < 0 ? '&#9660;&nbsp;' : ''}${formatNumber(Math.round(pct)).replace(/^-/, '&minus;')}&nbsp;%`;
          if (b.attrs.better) cls = (pct < 0) === (b.attrs.better === 'lower') ? 'vis-st-ok' : (pct === 0 ? '' : 'vis-st-bad');
        }
        h += `<tr><th scope="row">${escapeHTML(m)}</th><td style="text-align:right">${escapeHTML(x)}</td><td style="text-align:right"><strong>${escapeHTML(y)}</strong></td><td style="text-align:right" class="${cls}">${change}</td></tr>`;
      }
      h += '</tbody></table></div>';
    }
    for (const [x, y] of imgs) h += `<div class="vis-pair"><figure><img src="${escapeHTML(imagePath(x, o))}" alt="${escapeHTML(A + ': ' + x)}" loading="lazy"><figcaption>${escapeHTML(A)}</figcaption></figure><figure><img src="${escapeHTML(imagePath(y, o))}" alt="${escapeHTML(D + ': ' + y)}" loading="lazy"><figcaption>${escapeHTML(D)}</figcaption></figure></div>`;
    return figure(b, h);
  }

  // Image paths are passed through o.resolveImage(path) when given (to map them to URLs). An <img> never runs code,
  // but a remote URL is fetched by whoever opens the page.
  function imagePath(r, o) { return o && o.resolveImage ? o.resolveImage(r) : r; }

  function htmlSheet(b, o) {
    const cols = Number(b.attrs.cols) || 3;
    const items = bodyLines(b.body).map(l => splitCells(l.text));
    return figure(b, `<div class="vis-sheet-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${items.map(([r, cap]) => `<figure><img src="${escapeHTML(imagePath(r, o))}" alt="${escapeHTML(cap || r)}" loading="lazy">${cap ? `<figcaption>${escapeHTML(cap)}</figcaption>` : ''}</figure>`).join('')}</div>`);
  }

  // Decisions answer: one line "Title — Question: answer · Question: answer".
  function decisionAnswer(title, pairs) {
    return `${title || 'Decisions'} — ${pairs.map(([q, r]) => `${q}: ${r}`).join(' · ')}`;
  }
  // Nothing can be tapped in an image: every option carries a letter and the footer says how to answer by chat.
  function htmlDecisionsStatic(b, qs, lang) {
    const T = (id, p) => t(lang, id, p);
    const L = k => String.fromCharCode(65 + k);
    const free = e => (e.type === 'date' ? T('dec.writeDate') : e.type === 'text' ? T('dec.writeAnswer') : T('dec.writeNumber', { min: e.min, max: e.max }));
    const sample = e => (e.type === 'date' ? T('dec.sampleDate') : e.type === 'range' ? String(Math.round((e.min + e.max) / 2)) : T('dec.yourAnswer'));
    let h = '<div class="vis-dec vis-dec-static">', open = null;
    const ex = [];
    qs.forEach((q, i) => {
      // If the question already carries its number ("4c · ..."), that one is used and not repeated.
      const m = /^\s*(\d{1,3}[a-z]?)\s*[·.)]\s+/i.exec(q.question);
      const num = m ? m[1] : String(i + 1), txt = m ? q.question.slice(m[0].length) : q.question;
      const key = k => (/[a-z]$/i.test(num) ? num + ' ' : num) + L(k);
      const ops = q.options.map(o => ({ label: o.other ? T('dec.otherWrite') : o.label, hint: o.hint, rec: o.rec, other: o.other }));
      // An input next to options is one more option; alone, it is a line to write on.
      if (q.input && ops.length) ops.push({ label: q.input.type === 'date' ? T('dec.otherDateWrite') : free(q.input), other: true });
      h += `<div class="vis-q"><p class="vis-q-text"><span class="vis-num">${escapeHTML(num)}</span><span>${escapeHTML(txt)}${q.multi ? ` <span class="vis-note">${T('dec.several')}</span>` : ''}</span></p>`;
      if (ops.length) {
        h += '<div class="vis-options">';
        ops.forEach((o, k) => { h += `<span class="vis-op${o.rec ? ' vis-rec' : ''}"><span class="vis-op-label"><b class="vis-letter">${L(k)}</b>${escapeHTML(o.label)}${o.rec ? ` <span class="vis-rec-badge">${T('dec.recommended')}</span>` : ''}</span>${o.hint ? `<span class="vis-op-hint">${escapeHTML(o.hint)}</span>` : ''}</span>`; });
        h += '</div>';
        const r = ops.some(o => o.rec) ? ops.findIndex(o => o.rec) : i % ops.length;
        ex.push({ i, t: q.multi && ops.length > 1 ? key(Math.min(r, r === 0 ? 1 : 0)) + L(Math.max(r, r === 0 ? 1 : 0)) : key(r), multi: q.multi });
        const k = ops.findIndex(o => o.other);
        if (!open && k >= 0) open = `${key(k)} ${q.input ? sample(q.input) : T('dec.yourAnswer')}`;
      } else if (q.input) {
        h += `<p class="vis-write">${escapeHTML(free(q.input))}</p>`;
        ex.push({ i, t: `${num} ${sample(q.input)}`, free: true });
      }
      h += '</div>';
    });
    // The example has at most 4 answers: the first, a multiple-choice one, a written one, then the rest in order.
    const picked = [];
    for (const f of [() => true, x => x.multi, x => x.free]) { const e = ex.find(x => f(x) && !picked.includes(x)); if (e) picked.push(e); }
    for (const e of ex) if (picked.length < 4 && !picked.includes(e)) picked.push(e);
    picked.sort((x, y) => x.i - y.i);
    const other = open ? `<br>${T('dec.openHint')}<b>${escapeHTML(open)}</b>` : '';
    return figure(b, h + `<p class="vis-dec-foot vis-answer">${T('dec.replyHint')}<b>${escapeHTML(picked.map(e => e.t).join(', '))}</b>${other}</p></div>`);
  }
  // The labels the form script needs travel as data-* attributes, so activateDecisions() stays self-contained
  // (it is serialized with toString() into standalone pages).
  function htmlDecisions(b, o) {
    const lang = o.lang, T = (id, p) => t(lang, id, p);
    const qs = bodyLines(b.body).map(l => parseDecision(l.text, lang)).filter(q => !q.error);
    if (o.static) return htmlDecisionsStatic(b, qs, lang);
    const uid = 'vd' + b.n + '-' + Math.random().toString(36).slice(2, 7);
    let h = `<form class="vis-dec" id="${uid}" data-title="${escapeHTML(b.title || T('dec.title'))}" data-empty="${escapeHTML(T('dec.empty'))}" data-copy="${escapeHTML(T('dec.copy'))}" data-copied="${escapeHTML(T('dec.copied'))}" onsubmit="return false">`;
    for (const q of qs) {
      h += `<fieldset class="vis-q" data-id="${escapeHTML(q.id)}" data-question="${escapeHTML(q.question)}" data-multi="${q.multi}"><legend>${escapeHTML(q.question)}${q.multi ? ` <span class="vis-note">${T('dec.several')}</span>` : ''}</legend><div class="vis-options">`;
      for (const op of q.options) {
        h += `<button type="button" class="vis-op${op.rec ? ' vis-rec' : ''}" aria-pressed="false" data-value="${escapeHTML(op.other ? '' : op.value)}"${op.other ? ' data-other="1"' : ''}><span class="vis-op-label">${escapeHTML(op.label)}${op.rec ? ` <span class="vis-rec-badge">${T('dec.recommended')}</span>` : ''}</span>${op.hint ? `<span class="vis-op-hint">${escapeHTML(op.hint)}</span>` : ''}</button>`;
      }
      h += '</div>';
      if (q.options.some(x => x.other)) h += `<input type="text" class="vis-other" placeholder="${escapeHTML(T('dec.writePlaceholder'))}" hidden aria-label="${escapeHTML(q.question + ' ' + T('dec.otherSuffix'))}">`;
      if (q.input) {
        const e = q.input;
        // With options above, the box has to say it is the alternative ("Other date"); alone, the question is enough.
        const other = q.options.length ? { date: T('dec.otherDate'), text: T('dec.otherAnswer') }[e.type] : '';
        const wrap = c => (other ? `<label class="vis-input-label"><span>${escapeHTML(other)}</span>${c}</label>` : c);
        const name = escapeHTML(q.question + (other ? ` (${other.toLowerCase()})` : ''));
        if (e.type === 'date') h += wrap(`<input type="date" class="vis-input" aria-label="${name}">`);
        else if (e.type === 'text') h += wrap(`<textarea class="vis-input" rows="2" aria-label="${name}"></textarea>`);
        else h += `<div class="vis-range"><span>${e.min}</span><input type="range" class="vis-input" min="${e.min}" max="${e.max}" step="1" value="${Math.round((e.min + e.max) / 2)}" aria-label="${escapeHTML(q.question)}"><span>${e.max}</span><output>${Math.round((e.min + e.max) / 2)}</output></div>`;
      }
      h += '</fieldset>';
    }
    h += `<div class="vis-dec-foot"><p class="vis-answer" aria-live="polite"></p><button type="button" class="vis-submit">${o.submitLabel ? '' : ICON.copy}<span>${escapeHTML(o.submitLabel || T('dec.copy'))}</span></button></div></form>`;
    return figure(b, h);
  }
  // Form script (once per page; mount() uses it too). Only references decisionAnswer, so it can be serialized.
  function activateDecisions(root, onAnswer) {
    root.querySelectorAll('form.vis-dec:not([data-vis-active])').forEach(f => {
      f.setAttribute('data-vis-active', '1');
      const answer = f.querySelector('.vis-answer');
      const read = () => {
        const pairs = [];
        f.querySelectorAll('.vis-q').forEach(g => {
          const vals = [];
          g.querySelectorAll('.vis-op[aria-pressed="true"]').forEach(bt => {
            if (bt.dataset.other) { const x = g.querySelector('.vis-other'); if (x && x.value.trim()) vals.push(x.value.trim()); }
            else vals.push(bt.dataset.value);
          });
          const en = g.querySelector('.vis-input'); if (en && en.value) vals.push(en.value);
          if (vals.length) pairs.push([g.dataset.question, vals.join(', ')]);
        });
        return { text: decisionAnswer(f.dataset.title, pairs), empty: !pairs.length };
      };
      // With nothing picked the button does nothing useful: it stays disabled until there is an answer.
      const submit = f.querySelector('.vis-submit');
      const paint = () => { const r = read(); answer.textContent = r.empty ? (f.dataset.empty || '') : r.text; submit.disabled = r.empty; };
      f.addEventListener('click', ev => {
        const bt = ev.target.closest('.vis-op'); if (!bt) return;
        const g = bt.closest('.vis-q');
        const on = bt.getAttribute('aria-pressed') !== 'true';
        if (g.dataset.multi !== 'true') g.querySelectorAll('.vis-op').forEach(x => x.setAttribute('aria-pressed', 'false'));
        bt.setAttribute('aria-pressed', String(on));
        const x = g.querySelector('.vis-other'); if (x) x.hidden = !g.querySelector('.vis-op[data-other][aria-pressed="true"]');
        paint();
      });
      f.addEventListener('input', ev => { const r = ev.target.closest('.vis-range'); if (r) r.querySelector('output').textContent = ev.target.value; paint(); });
      submit.addEventListener('click', () => {
        const txt = read().text;
        if (onAnswer) { onAnswer(txt, f); return; }
        const lbl = f.querySelector('.vis-submit span');
        const ok = () => { lbl.textContent = f.dataset.copied || ''; setTimeout(() => { lbl.textContent = f.dataset.copy || ''; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => { answer.textContent = txt; });
        else answer.textContent = txt;
      });
      paint();
    });
  }

  // ---------- Stylesheet (light, dark and auto) ----------
  // css({ theme: 'light'|'dark'|'auto', scope }). With auto the page can force a theme with
  // <html data-theme="light|dark"> (claro|oscuro also work).
  function css(opts) {
    opts = opts || {};
    const sc = opts.scope || '.vis-doc';
    const light = cssVars(THEMES.light), dark = cssVars(THEMES.dark);
    const theme = themeName(opts.theme || 'auto');
    let vars = `${sc}{${theme === 'dark' ? dark : light}}`;
    if (theme === 'auto') vars += `@media (prefers-color-scheme: dark){:root:not([data-theme=light]):not([data-theme=claro]) ${sc}{${dark}}}:root[data-theme=dark] ${sc},:root[data-theme=oscuro] ${sc}{${dark}}`;
    return vars + `
${sc}{color:var(--vis-text);font:15px/1.55 ${FONT_STACK};-webkit-font-smoothing:antialiased}
${sc} table,${sc} .vis-meter-value,${sc} .vis-task-pct{font-variant-numeric:tabular-nums}
${sc} h1,${sc} h2,${sc} h3{line-height:1.25;font-weight:600;margin:1.2em 0 .5em;text-wrap:balance}${sc} h1{font-size:24px}${sc} h2{font-size:20px}${sc} h3{font-size:17px}
${sc} p,${sc} ul,${sc} ol{margin:.6em 0}${sc} a{color:var(--vis-accent)}${sc} code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--vis-surface);border-radius:4px;padding:1px 4px}
${sc} pre{background:var(--vis-surface);border-radius:8px;padding:10px 12px;overflow-x:auto}${sc} pre code{background:none;padding:0}
${sc} hr{border:0;border-top:1px solid var(--vis-border);margin:1.4em 0}${sc} blockquote{margin:.8em 0;padding:0 0 0 12px;border-left:3px solid var(--vis-border);color:var(--vis-text2)}
${sc} .vis-table{overflow-x:auto;margin:.8em 0}${sc} table{border-collapse:collapse;width:100%;font-size:14px}${sc} th,${sc} td{padding:6px 10px;border-bottom:1px solid var(--vis-border);text-align:left;vertical-align:top}${sc} th:first-child,${sc} td:first-child{padding-left:0}${sc} thead th{color:var(--vis-text2);font-weight:500;border-bottom-color:var(--vis-axis)}
${sc} .vis-block{margin:1.4em 0;padding:0}${sc} .vis-title{font-size:17px;line-height:1.3;font-weight:600;margin:0 0 10px;color:var(--vis-text);text-wrap:balance}${sc} .vis-block .vis-table{margin:0}
${sc} .vis-chart svg,${sc} .vis-mermaid svg,${sc} .vis-vega-lite svg{display:block;max-width:100%;height:auto}
${sc} .vis-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
${sc} .vis-kpi-card{background:var(--vis-surface);border-radius:10px;padding:12px 14px;min-width:0}@supports (grid-template-rows:subgrid){${sc} .vis-kpi-card{display:grid;grid-row:span 3;grid-template-rows:subgrid;row-gap:0}}${sc} .vis-kpi-label{font-size:13px;color:var(--vis-text2)}
${sc} .vis-kpi-value{font-size:24px;font-weight:600;margin:2px 0 4px;overflow-wrap:anywhere}${sc} .vis-kpi-foot{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:13px;color:var(--vis-text2)}
${sc} .vis-status{display:inline-flex;align-items:center;gap:3px;font-weight:500}${sc} .vis-status svg,${sc} .vis-icon svg,${sc} .vis-tl-dot svg,${sc} .vis-submit svg{width:15px;height:15px;flex:none}
${sc} .vis-st-ok,${sc} .vis-task-ok .vis-icon,${sc} .vis-tl-ok .vis-tl-dot{color:var(--vis-ok)}${sc} .vis-st-warn{color:var(--vis-warn)}${sc} .vis-st-bad,${sc} .vis-tl-bad .vis-tl-dot{color:var(--vis-bad)}
${sc} .vis-task-progress .vis-icon,${sc} .vis-tl-progress .vis-tl-dot{color:var(--vis-accent)}${sc} .vis-task-pending .vis-icon,${sc} .vis-tl-pending .vis-tl-dot{color:var(--vis-muted)}
${sc} .vis-meter{display:flex;align-items:center;gap:12px}${sc} .vis-meter-value{font-size:22px;font-weight:600;min-width:64px}
${sc} .vis-track{flex:1;height:10px;border-radius:5px;background:var(--vis-grid);overflow:hidden}${sc} .vis-fill{height:100%;background:var(--vis-s1);border-radius:5px}
${sc} .vis-tasks{list-style:none;padding:0;margin:10px 0 0}${sc} .vis-icon{display:flex}${sc} .vis-tasks li{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--vis-grid)}${sc} .vis-tasks li:last-child{border-bottom:0}
${sc} .vis-task-label{flex:1}${sc} .vis-task-pct{font-size:13px;color:var(--vis-text2)}${sc} .vis-task-pending .vis-task-label{color:var(--vis-text2)}
${sc} .vis-tl{list-style:none;padding:0;margin:0}${sc} .vis-tl li{display:grid;grid-template-columns:22px 1fr;column-gap:8px;padding:5px 0 7px;position:relative}
${sc} .vis-tl li:not(:last-child)::before{content:"";position:absolute;left:10px;top:25px;bottom:-5px;border-left:2px solid var(--vis-grid)}
${sc} .vis-tl-dot{grid-row:1;height:20px;display:flex;align-items:center;justify-content:center}${sc} .vis-tl-meta{grid-column:2;font-size:13px;line-height:20px;color:var(--vis-text2)}
${sc} .vis-tl-event{grid-column:2;line-height:1.4}${sc} .vis-tl-pending .vis-tl-event{color:var(--vis-text2)}
${sc} .vis-cmp th[scope=row]{font-weight:500}${sc} .vis-cmp td,${sc} .vis-cmp thead th:not(:first-child){white-space:nowrap;width:1%}${sc} .vis-pair,${sc} .vis-sheet-grid{display:grid;gap:10px}${sc} .vis-pair{grid-template-columns:1fr 1fr;margin-top:10px}
${sc} .vis-pair figure,${sc} .vis-sheet-grid figure{margin:0}${sc} .vis-pair img,${sc} .vis-sheet-grid img{width:100%;height:auto;display:block;border-radius:6px;background:var(--vis-surface)}
${sc} .vis-pair figcaption,${sc} .vis-sheet-grid figcaption{font-size:13px;color:var(--vis-text2);margin-top:4px}
${sc} .vis-dec{border:1px solid var(--vis-border);border-radius:12px;padding:6px 14px 12px}${sc} .vis-q{border:0;padding:0;margin:12px 0}${sc} .vis-q legend{font-weight:500;padding:0;margin-bottom:8px}
${sc} .vis-note{font-weight:400;color:var(--vis-text2);font-size:13px}${sc} .vis-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
${sc} .vis-op{font:inherit;font-size:15px;color:var(--vis-text);background:var(--vis-bg);border:1px solid var(--vis-border);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;text-align:left;min-height:44px;box-sizing:border-box}
${sc} .vis-op:hover{border-color:var(--vis-axis)}${sc} .vis-op[aria-pressed=true]{border-color:var(--vis-accent);box-shadow:inset 0 0 0 1px var(--vis-accent);background:var(--vis-surface)}
${sc} .vis-op-label{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px}${sc} .vis-op-hint{font-size:13px;color:var(--vis-text2)}${sc} .vis-rec-badge{font-size:13px;font-weight:500;color:var(--vis-accent)}
${sc} .vis-other,${sc} .vis-input{font:inherit;font-size:14px;color:var(--vis-text);background:var(--vis-bg);border:1px solid var(--vis-border);border-radius:8px;padding:6px 10px;margin-top:8px;max-width:100%}
${sc} textarea.vis-input{display:block;width:100%;box-sizing:border-box;resize:vertical}${sc} .vis-input-label{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:10px;font-size:14px;color:var(--vis-text2)}${sc} .vis-input-label .vis-input{margin-top:0;flex:1;min-width:0}${sc} .vis-input-label textarea.vis-input{flex-basis:100%}${sc} .vis-range{display:flex;align-items:center;gap:8px}${sc} .vis-range input{flex:1}
${sc} .vis-dec-foot{display:flex;align-items:center;gap:10px;justify-content:space-between;border-top:1px solid var(--vis-grid);padding-top:10px;margin-top:6px}
${sc} .vis-answer{flex:1;min-width:0;margin:0;font-size:14px;line-height:1.4;color:var(--vis-text2);overflow-wrap:anywhere}
${sc} .vis-dec-static .vis-op{cursor:default}${sc} .vis-dec-static .vis-dec-foot{display:block;margin:8px 0 0}${sc} .vis-letter{font-weight:600;color:var(--vis-accent);margin-right:6px}${sc} .vis-q-text{font-weight:500;margin:0 0 8px;display:flex;gap:8px;align-items:baseline}${sc} .vis-dec-static .vis-options{display:grid;grid-template-columns:1fr;gap:6px}
${sc} .vis-write{margin:0;padding:8px 2px;min-height:44px;box-sizing:border-box;border-bottom:1px solid var(--vis-axis);color:var(--vis-text2);font-size:15px;display:flex;align-items:flex-end}
${sc} .vis-card{display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.3;color:var(--vis-text2);margin:0 0 6px;font-variant-numeric:tabular-nums}
${sc} .vis-num{flex:none;min-width:2ch;font-weight:600;color:var(--vis-text2);font-variant-numeric:tabular-nums}${sc} .vis-dec-static .vis-answer b{color:var(--vis-text);font-weight:600}
${sc} .vis-submit{font:inherit;font-size:14px;display:inline-flex;gap:6px;align-items:center;border-radius:8px;border:1px solid var(--vis-accent);color:var(--vis-accent);background:var(--vis-bg);padding:7px 12px;cursor:pointer}
${sc} .vis-submit:disabled{opacity:.45;cursor:default}${sc} .vis-error{border:1px solid var(--vis-bad);border-radius:8px;padding:8px 10px;font-size:13px;color:var(--vis-text)}${sc} .vis-error pre{margin:6px 0 0}
${sc} .vis-checkbox{color:var(--vis-text2)}
@media (max-width:480px){${sc} .vis-pair{grid-template-columns:1fr}}
`;
  }

  // ---------- Text fallback ----------
  const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  function unicodeBar(v, max, width) {
    if (!(max > 0) || !(v > 0)) return '';
    const u = v / max * width, whole = Math.floor(u), rest = Math.round((u - whole) * 8);
    return '█'.repeat(whole) + (rest === 8 ? '█' : EIGHTHS[rest]);
  }
  const SPARK = '▁▂▃▄▅▆▇█';
  function sparkline(vals) {
    const v = vals.filter(x => x != null); const mn = Math.min(...v), mx = Math.max(...v);
    return vals.map(x => (x == null ? ' ' : SPARK[mx === mn ? 3 : Math.round((x - mn) / (mx - mn) * 7)])).join('');
  }
  function gfmTable(head, rows, right) {
    const r = c => c.map(x => String(x == null ? '' : x).replace(/\|/g, '\\|'));
    return [`| ${r(head).join(' | ')} |`, `|${head.map((_, i) => (right && right[i] ? '---:' : '---')).join('|')}|`, ...rows.map(f => `| ${r(f).join(' | ')} |`)].join('\n');
  }
  function blockText(b, lang) {
    const T = (id, p) => t(lang, id, p);
    const title = b.title ? `**${b.title}**\n` : '';
    switch (b.type) {
      case 'chart': {
        const d = chartData(b, [], lang);
        if (!d) return title + '```\n' + b.body + '\n```';
        const unit = b.attrs.unit ? ` ${b.attrs.unit}` : '';
        if (d.kind === 'bar' || d.kind === 'donut') {
          if (d.color) return title + gfmTable(d.header, d.values.map(r => d.header.map(c => r[c])));
          const ys = d.ys;
          const max = Math.max(...d.values.flatMap(r => ys.map(y => r[y] || 0)));
          const tot = d.kind === 'donut' ? d.values.reduce((s, r) => s + (r[ys[0]] || 0), 0) : null;
          const width = Math.max(...d.values.map(r => String(r[d.x]).length));
          const lines = [];
          for (const r of d.values) for (const y of ys) {
            const label = ys.length > 1 ? `${String(r[d.x]).padEnd(width)} ${y}` : String(r[d.x]).padEnd(width);
            lines.push(`${label}  ${unicodeBar(r[y], max, 24).padEnd(24)} ${r[y] == null ? '-' : formatNumber(r[y])}${unit}${tot ? ` (${Math.round((r[y] || 0) / tot * 100)} %)` : ''}`);
          }
          return title + '```\n' + lines.join('\n') + '\n```';
        }
        const head = [d.x].concat(d.color ? d.header.filter(c => c !== d.x) : d.ys);
        const rows = d.values.map(r => head.map(c => (typeof r[c] === 'number' ? formatNumber(r[c]) : r[c])));
        let s = title + gfmTable(head, rows, head.map((c, i) => i > 0));
        if (!d.color && d.kind !== 'scatter') s += '\n\n' + d.ys.map(y => `${y}: ${sparkline(d.values.map(r => r[y]))}`).join('\n');
        return s;
      }
      case 'kpi': return title + bodyLines(b.body).map(l => parseKPI(l.text, lang)).filter(k => !k.error).map(k => `- ${k.label}: **${k.value}**${k.delta ? ` (${k.delta})` : ''}${k.status ? ` [${statusLabel(k.status, lang)}]` : ''}`).join('\n');
      case 'progress': {
        const { tasks, pct } = progressData(b, lang);
        const full = Math.max(0, Math.min(20, Math.round(pct / 5)));
        let s = title + `${'▓'.repeat(full)}${'░'.repeat(20 - full)} ${b.attrs.value != null && b.attrs.max != null ? `${b.attrs.value} / ${b.attrs.max}` : pct + ' %'}`;
        if (tasks.length) s += '\n' + tasks.map(x => `- [${x.status === 'ok' ? 'x' : x.status === 'progress' ? '~' : ' '}] ${x.label}${x.status === 'progress' && x.pctGiven ? ` (${x.pct} %)` : ''}`).join('\n');
        return s;
      }
      case 'timeline': return title + gfmTable([T('text.date'), T('text.event'), T('text.status')], bodyLines(b.body).map(l => splitCells(l.text)).map(p => [p[0], p[1], p[2] || '']));
      case 'compare': {
        const rows = bodyLines(b.body).map(l => splitCells(l.text));
        const A = b.attrs.before || T('compare.before'), D = b.attrs.after || T('compare.after');
        const nums = rows.filter(p => p.length === 3).map(([m, x, y]) => {
          const vx = parseHumanNumber(x), vy = parseHumanNumber(y);
          return [m, x, y, vx != null && vy != null && vx !== 0 ? `${(vy - vx) > 0 ? '+' : ''}${Math.round((vy - vx) / Math.abs(vx) * 100)} %` : ''];
        });
        let s = title + (nums.length ? gfmTable(['', A, D, T('compare.change')], nums, [0, 1, 1, 1]) : '');
        const imgs = rows.filter(p => p.length === 2);
        if (imgs.length) s += (nums.length ? '\n\n' : '') + imgs.map(([x, y]) => `- ${A}: ${x}\n- ${D}: ${y}`).join('\n');
        return s;
      }
      case 'decisions': {
        const qs = bodyLines(b.body).map(l => parseDecision(l.text, lang)).filter(q => !q.error);
        return title + qs.map((q, i) => {
          const ops = q.options.map((o, k) => `   ${String.fromCharCode(97 + k)}) ${o.label}${o.hint ? ` (${o.hint})` : ''}${o.rec ? T('text.recommended') : ''}${o.other ? ': ____' : ''}`);
          if (q.input) ops.push(`   ${q.input.type === 'date' ? T('text.dateInput') : q.input.type === 'text' ? T('text.textInput') : T('text.rangeInput', { min: q.input.min, max: q.input.max })}`);
          return `${i + 1}. ${q.question}${q.multi ? T('text.several') : ''}\n${ops.join('\n')}`;
        }).join('\n') + '\n\n' + T('text.replyHint');
      }
      case 'sheet': return title + bodyLines(b.body).map(l => splitCells(l.text)).map(([r, cap]) => `- ${cap || r}: ${r}`).join('\n');
      case 'html': return title + T('text.htmlOmitted');
      default: return '```' + b.type + '\n' + b.body + '\n```';
    }
  }
  // toText(md, { lang }) -> plain text / Markdown for channels without images.
  function toText(md, opts) {
    const lang = opts && opts.lang;
    return parse(md).map(s => (s.kind === 'md' ? s.text : blockText(s, lang))).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // ---------- Drawing ----------
  // A Vega loader that refuses every request (data.url, images, links): the default unless allowRemoteData.
  const NO_REMOTE = new Error('remote data is disabled (allowRemoteData)');
  const DENY_LOADER = { load: () => Promise.reject(NO_REMOTE), sanitize: () => Promise.resolve({ href: '' }), http: () => Promise.reject(NO_REMOTE), file: () => Promise.reject(NO_REMOTE) };
  // expr: vega-interpreter's interpreter. With it Vega builds no functions with new Function and passes a CSP without
  // 'unsafe-eval'. The locale (month names, number format) is set per view, so pages can mix languages.
  async function chartSVG(spec, vg, o) {
    const opts = { renderer: 'none', locale: { time: TIME_LOCALE[langOf(o.lang)], number: NUMBER_LOCALE } };
    if (o.expr) opts.expr = o.expr;
    if (!o.allowRemoteData) opts.loader = DENY_LOADER;
    // Vega's own errors become E_VEGA in renderBlock; its console logger stays quiet.
    const view = new vg.View(o.expr ? vg.parse(spec, null, { ast: true }) : vg.parse(spec), opts).logLevel(vg.None);
    let svg;
    try { svg = await view.toSVG(); } finally { view.finalize(); }
    return tokenizeSVG(svg);
  }
  let mermaidN = 0;
  // o: { width, lang, static, allowHTML, allowRemoteData, submitLabel, resolveImage, vega, vegaLite, mermaid, expr }
  async function renderBlock(b, o) {
    o = o || {};
    const lang = o.lang, T = (id, p) => t(lang, id, p);
    const errs = [];
    validateBlock(b, errs, { vegaLite: o.vegaLite || globalThis.vegaLite, lang, allowRemoteData: o.allowRemoteData });
    if (errs.length) return { html: `<div class="vis-block vis-error" role="note"><strong>${escapeHTML(T('render.failed', { type: b.type }))}</strong>: ${escapeHTML(errs[0].message)}${errs[0].fix ? ` (${escapeHTML(errs[0].fix)})` : ''}<pre><code>${escapeHTML(b.body)}</code></pre></div>`, errors: errs };
    switch (b.type) {
      case 'chart': case 'vega-lite': {
        const vg = o.vega || globalThis.vega, vl = o.vegaLite || globalThis.vegaLite;
        if (!vg || !vl) return { html: figure(b, `<pre><code>${escapeHTML(b.body)}</code></pre>`), errors: [E(b, 'E_ENGINE', null, T('err.noVega'), T('fix.noVega'))] };
        try {
        if (b.type === 'vega-lite') {
          const spec = JSON.parse(b.body);
          if (spec.width === 'container' || spec.width == null) spec.width = o.width || 640;
          const svg = await chartSVG(vl.compile(spec).spec, vg, o);
          return { html: figure(b, svg.replace(/^<svg /, `<svg role="img" aria-label="${escapeHTML(b.title || spec.description || t(lang, 'alt.vegaLite'))}" `)) };
        }
        const spec = vl.compile(chartToVegaLite(b, { width: o.width || 640, titleInSVG: o.titleInSVG, lang })).spec;
        const svg = await chartSVG(spec, vg, o);
        const alt = chartAlt(b, lang);
        return { html: figure(b, svg.replace(/^<svg /, `<svg role="img" aria-label="${escapeHTML(alt)}" `), ` data-alt="${escapeHTML(alt)}"`, o.titleInSVG ? null : chartTitle(b)), alt };
        } catch (e) {
          // A spec can pass Vega-Lite's compiler and still fail while drawing (an invalid SVG path, say): show it as code.
          return { html: figure(b, `<pre><code>${escapeHTML(b.body)}</code></pre>`), errors: [E(b, 'E_VEGA', null, `Vega: ${String(e && e.message || e).split('\n')[0]}`, T('fix.vegaSpec'))] };
        }
      }
      case 'mermaid': {
        const mm = o.mermaid || globalThis.mermaid;
        if (!mm) return { html: figure(b, `<pre><code class="language-mermaid">${escapeHTML(b.body)}</code></pre>`), errors: [E(b, 'E_ENGINE', null, T('err.noMermaid'), T('fix.noMermaid'))] };
        try {
          const { svg } = await mm.render('vis-mm-' + (++mermaidN), b.body);
          return { html: figure(b, svg) };
        } catch (e) { return { html: figure(b, `<pre><code>${escapeHTML(b.body)}</code></pre>`), errors: [E(b, 'E_MERMAID', null, String(e.message || e).split('\n')[0], T('fix.mermaid'))] }; }
      }
      case 'kpi': return { html: htmlKPI(b, o) };
      case 'progress': return { html: htmlProgress(b, o) };
      case 'timeline': return { html: htmlTimeline(b, o) };
      case 'compare': return { html: htmlCompare(b, o) };
      case 'sheet': return { html: htmlSheet(b, o) };
      case 'decisions': return { html: htmlDecisions(b, o) };
      // Raw HTML only for trusted content, on request. Otherwise it is shown as code.
      case 'html': return { html: o.allowHTML ? `<div class="vis-block vis-html">${b.body}</div>` : figure(b, `<pre><code class="language-html">${escapeHTML(b.body)}</code></pre>`) };
    }
    return { html: '' };
  }

  // renderHTML(md, opts) -> { html, errors, alts }. See renderBlock for the options.
  async function renderHTML(md, o) {
    o = o || {};
    const parts = [], errors = [], alts = [];
    for (const s of parse(md)) {
      if (s.kind === 'md') { parts.push(markdownToHTML(s.text)); continue; }
      const r = await renderBlock(s, o);
      parts.push(r.html);
      if (r.errors) errors.push(...r.errors);
      if (r.alt) alts.push(r.alt);
    }
    return { html: parts.join('\n'), errors, alts };
  }

  // Mounts vis on an already rendered page (a chat): finds elements with data-vis-src (the block's Markdown) or
  // <pre><code class="language-chart|kpi|..."> and replaces them with their drawing. On failure the code stays.
  // ```html blocks are only mounted with { allowHTML: true }.
  async function mount(root, o) {
    o = o || {};
    const nodes = [];
    root.querySelectorAll('[data-vis-src]:not([data-vis-done])').forEach(n => nodes.push({ n, md: n.getAttribute('data-vis-src') }));
    root.querySelectorAll('pre > code[class*="language-"]').forEach(c => {
      const m = /language-([\w-]+)/.exec(c.className); if (!m) return;
      const x = m[1].toLowerCase(), type = BLOCK_TYPES[x] ? x : TYPE_ALIASES[x];
      if (!type || type === 'html' || c.parentNode.hasAttribute('data-vis-done')) return;
      const info = c.getAttribute('data-info') || c.parentNode.getAttribute('data-info') || x;
      nodes.push({ n: c.parentNode, md: '````' + info + '\n' + c.textContent.replace(/\n$/, '') + '\n````' });
    });
    for (const { n, md } of nodes) {
      n.setAttribute('data-vis-done', '1');
      const b = parse(md).find(s => s.kind === 'block');
      if (!b || (b.type === 'html' && !o.allowHTML)) continue;
      try {
        const w = o.width || Math.max(280, Math.min(720, Math.floor((n.parentNode || n).getBoundingClientRect().width || 640)));
        const r = await renderBlock(b, Object.assign({}, o, { width: w }));
        if (r.errors && r.errors.length && o.keepCodeOnError !== false) continue;
        const div = document.createElement('div');
        div.className = 'vis-doc vis-mounted';
        div.innerHTML = r.html;
        n.replaceWith(div);
        activateDecisions(div, o.onAnswer);
      } catch (e) { if (o.onError) o.onError(e, b); }
    }
    return nodes.length;
  }

  // Whole document into an element (the CLI uses it inside Chromium).
  async function renderDocument(el, md, o) {
    o = o || {};
    const r = await renderHTML(md, o);
    el.innerHTML = r.html;
    activateDecisions(el, o.onAnswer);
    return r;
  }

  // Standalone SVG: the first chart or vega-lite block of the document (or block number o.block). Works in Node.
  async function renderSVG(md, o) {
    o = o || {};
    const bs = parse(md).filter(s => s.kind === 'block');
    const b = o.block ? bs[o.block - 1] : bs.find(s => s.type === 'chart' || s.type === 'vega-lite');
    if (!b || !['chart', 'vega-lite'].includes(b.type)) throw new Error(t(o.lang, 'err.noSVGBlock'));
    const r = await renderBlock(b, Object.assign({}, o, { titleInSVG: true }));
    if (r.errors && r.errors.length) throw new Error(r.errors.map(formatError).join('\n'));
    const svg = /<svg[\s\S]*<\/svg>/.exec(r.html)[0];
    return applyTheme(svg, o.theme || 'auto');
  }
  // light|dark: replaces var(--vis-x,#hex) with the theme's fixed color. auto: keeps the variables and adds a <style>
  // with both themes, so the SVG follows the system mode wherever it is opened.
  // theme can also be an object from themeFrom(). font replaces Vega's font with the one of the page showing the image.
  function applyTheme(svg, theme, font) {
    theme = themeName(theme);
    const f = String(font || '').replace(/"/g, "'");
    if (f && /^[\w\s,'.-]{1,200}$/.test(f)) svg = svg.split(`font-family="${FONT_STACK}"`).join(`font-family="${f}"`);
    if (theme === 'light' || theme === 'dark' || (theme && typeof theme === 'object')) {
      const T = typeof theme === 'object' ? theme : THEMES[theme];
      return svg.replace(/var\(--vis-([a-z0-9]+),(#[0-9A-Fa-f]{6})\)/g, (m, k, hex) => (/^s\d$/.test(k) ? T.s[Number(k.slice(1)) - 1] : /^t\d$/.test(k) ? T.st[Number(k.slice(1)) - 1] : T[k]) || hex);
    }
    const st = `<style>svg{${cssVars(THEMES.light)}}@media (prefers-color-scheme: dark){svg{${cssVars(THEMES.dark)}}}</style>`;
    return svg.replace(/(<svg[^>]*>)/, `$1${st}`);
  }

  // Theme for hosts that show vis with their own colors (a chat, for example): starts from light or dark and takes
  // the tokens given, only when they are #RRGGBB. The series text tones are recomputed against the new bg and surface.
  function themeFrom(base, changes) {
    const B = THEMES[themeName(base)] || THEMES.light, c = changes || {}, hex = x => /^#[0-9A-Fa-f]{6}$/.test(x);
    const T = Object.assign({}, B);
    for (const k of TOKENS) if (hex(c[k])) T[k] = c[k].toUpperCase();
    T.s = B.s.map((x, i) => (Array.isArray(c.s) && hex(c.s[i]) ? c.s[i].toUpperCase() : x));
    T.st = T.s.map(x => textTone(x, T, B === THEMES.light));
    return T;
  }

  // ---------- Deterministic checks on the drawing (browser) ----------
  // auditDOM(root, md, { lang }) -> problems [{ code, where, detail }]. Empty = pass.
  function auditDOM(root, md, o) {
    const lang = o && o.lang, T = (id, p) => t(lang, id, p);
    const P = [];
    const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => [c.r, c.g, c.b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const background = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return rgb(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; };
    const name = el => { const f = el.closest('.vis-block'); const x = f ? (f.className.match(/vis-([a-z-]+)/g) || []).find(c => c !== 'vis-block') : null; return x ? x.replace('vis-', '') : T('audit.text'); };
    const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
    const snip = (el, n) => el.textContent.trim().slice(0, n);
    // 1. Horizontal page overflow (no sideways scroll on a phone).
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) P.push({ code: 'C_OVERFLOW', where: T('audit.page'), detail: T('audit.pageWidth', { w: doc.scrollWidth, vw: window.innerWidth }) });
    // 2. Text in charts: size, overlaps, outside the canvas and contrast.
    root.querySelectorAll('svg').forEach((svg, si) => {
      if (svg.closest('.vis-op, .vis-status, .vis-icon, .vis-tl-dot, .vis-submit')) return;
      const sr = svg.getBoundingClientRect();
      const scale = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? sr.width / svg.viewBox.baseVal.width : 1;
      const where = `${name(svg)} svg${si + 1}`;
      const texts = [...svg.querySelectorAll('text')].filter(x => x.textContent.trim() && visible(x));
      const fb = background(svg);
      const boxes = texts.map(x => ({ t: x, r: x.getBoundingClientRect() }));
      for (const { t: x, r } of boxes) {
        const fs = parseFloat(getComputedStyle(x).fontSize) * (x.closest('foreignObject') ? 1 : scale);
        if (fs < 10.5) P.push({ code: 'C_FONT_SIZE', where, detail: T('audit.fontSvg', { t: snip(x, 30), fs: fs.toFixed(1) }) });
        if (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1) P.push({ code: 'C_OUTSIDE', where, detail: T('audit.outside', { t: snip(x, 30), d: [r.left - sr.left, sr.right - r.right, r.top - sr.top, sr.bottom - r.bottom].map(v => Math.round(v)).join(',') }) });
        const c = rgb(getComputedStyle(x).fill);
        if (c && c.a > 0.5 && !x.closest('g[class*="mark-text"]') && ratio(c, fb) < 4.5) P.push({ code: 'C_CONTRAST', where, detail: T('audit.contrastMin', { t: snip(x, 30), r: ratio(c, fb).toFixed(2) }) });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const sameRow = h > 0.5 * Math.min(a.height, b.height);
        if ((w > 1.5 && h > 1.5) || (sameRow && w > -3)) { P.push({ code: 'C_OVERLAP', where, detail: T('audit.overlap', { a: snip(boxes[i].t, 20), b: snip(boxes[j].t, 20) }) }); if (P.length > 40) return; }
      }
      // data marks: 3:1 against the background (faint fills are skipped: their line carries them)
      svg.querySelectorAll('g[class*="role-mark"]:not([class*="mark-text"]) > path, g[class*="role-mark"]:not([class*="mark-text"]) > rect, g[class*="role-mark"] > g > path').forEach(m => {
        const cs = getComputedStyle(m);
        const filled = cs.fill !== 'none' && Number(cs.fillOpacity) >= 0.5 && Number(cs.opacity) >= 0.5;
        const c = rgb(filled ? cs.fill : cs.stroke);
        if (!c || c.a < 0.5 || (!filled && cs.stroke === 'none')) return;
        if (m.closest('g[class*="role-legend"]') || m.closest('g[class*="role-axis"]')) return;
        const k = ratio(c, fb);
        if (k < 3) { const d = T('audit.mark', { c: cs.fill !== 'none' ? cs.fill : cs.stroke, r: k.toFixed(2) }); if (!P.some(p => p.detail === d)) P.push({ code: 'C_MARK_CONTRAST', where, detail: d }); }
      });
    });
    // 3. HTML text of the blocks: size and contrast.
    const seen = new Set();
    root.querySelectorAll('.vis-block *').forEach(el => {
      if (el.closest('svg') || !visible(el)) return;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) return;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
      if (fs < 10.5) P.push({ code: 'C_FONT_SIZE', where: name(el), detail: T('audit.font', { t: snip(el, 30), fs }) });
      const c = rgb(cs.color), fb = background(el);
      if (c) {
        const k = ratio(c, fb), large = fs >= 24 || (fs >= 18.6 && Number(cs.fontWeight) >= 700);
        const key = `${name(el)}:${cs.color}:${k.toFixed(2)}`;
        if (k < (large ? 3 : 4.5) && !seen.has(key)) { seen.add(key); P.push({ code: 'C_CONTRAST', where: name(el), detail: T('audit.contrast', { t: snip(el, 30), r: k.toFixed(2) }) }); }
      }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && !el.closest('.vis-table')) P.push({ code: 'C_OVERFLOW', where: name(el), detail: T('audit.right', { t: snip(el, 30) }) });
    });
    // 4. The KPIs drawn say the same as the source, and every chart has alt text (generated from the data).
    if (md) {
      const expected = [];
      parse(md).filter(s => s.kind === 'block' && s.type === 'kpi').forEach(b => bodyLines(b.body).forEach(l => { const k = parseKPI(l.text, lang); if (!k.error) expected.push(k.value); }));
      const drawn = [...root.querySelectorAll('.vis-kpi-value')].map(e => e.textContent);
      expected.forEach((v, i) => { if (drawn[i] !== v) P.push({ code: 'C_KPI', where: 'kpi', detail: T('audit.kpi', { v, d: drawn[i] }) }); });
      root.querySelectorAll('.vis-chart').forEach((f, i) => { if (!f.querySelector('svg[aria-label]')) P.push({ code: 'C_ALT', where: `chart${i + 1}`, detail: T('audit.alt') }); });
    }
    // Images that finished loading with nothing to show (wrong path, missing file).
    root.querySelectorAll('img').forEach(im => { if (im.complete && !im.naturalWidth) P.push({ code: 'C_IMAGE', where: name(im), detail: T('audit.image', { src: (im.getAttribute('src') || '').slice(0, 60) }) }); });
    return P;
  }

  // ---------- WCAG contrast ----------
  function luminance(hex) {
    const c = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  return {
    VERSION, BLOCK_TYPES, THEMES, FONT_STACK, STRINGS, t,
    parse, check, formatError, validateBlock, toText, markdownToHTML, renderHTML, renderDocument, renderSVG, mount,
    chartToVegaLite, chartAlt, chartTitle, css, cssVars, tokenizeSVG, applyTheme, themeFrom, auditDOM,
    activateDecisions, decisionAnswer, contrast, escapeHTML,
    // Block readers for adapters (whatsapp, text channels): no drawing involved.
    parseKPI, parseTask, parseDecision, parseCSV, bodyLines, splitCells, chartData, progressData,
    parseHumanNumber, formatNumber, shortDate, statusLabel, TIMELINE_STATUS,
  };
});
