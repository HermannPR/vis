#!/usr/bin/env python3
"""Converts an `elicit` form (the widget's HTML) into a compact ```decisions block.

Usage: python3 -I elicit_to_vis.py form.html > decisions.md
Each group becomes one line: id | question | option | option ...
- data-multi="true" -> id+
- the button's second line -> hint (~); when it says "Recommended" (or the Spanish "Recomiendo"/"recomendada"),
  the option is marked with *
- a data-value different from the label -> => value
- textarea -> @text
"""
import html
import re
import sys
from html.parser import HTMLParser

RECOMMENDED = re.compile(r'recommend|recomiend|recomendad', re.I)
RECOMMENDED_PREFIX = re.compile(r'^(Recommended|I recommend|Recomiendo|Recomendada)\s*·?\s*', re.I)


class Reader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None
        self.groups = []
        self.stack = []         # open classes
        self.inside = None      # 'question' | 'button' | 'title'
        self.button = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class', '')
        self.stack.append((tag, cls))
        if 'elicit-header' in cls:
            self.inside = 'title'; self.title = ''
        elif 'elicit-group' in cls:
            self.groups.append({'question': '', 'id': None, 'multi': False, 'options': [], 'text': False})
        elif 'elicit-question' in cls:
            self.inside = 'question'
        elif 'elicit-pills' in cls and self.groups:
            self.groups[-1]['id'] = a.get('data-name')
            self.groups[-1]['multi'] = a.get('data-multi') == 'true'
        elif 'elicit-pill' in cls.split():
            self.inside = 'button'
            self.button = {'value': a.get('data-value', ''), 'parts': ['']}
        elif tag == 'textarea' and self.groups:
            self.groups[-1]['text'] = True
            if not self.groups[-1]['id']:
                self.groups[-1]['id'] = a.get('name') or a.get('data-name')
        elif tag == 'br' and self.inside == 'button':
            self.button['parts'].append('')
        if tag == 'br':
            self.stack.pop()

    def handle_endtag(self, tag):
        while self.stack:
            t, cls = self.stack.pop()
            if t == tag:
                break
        if tag == 'button' and self.inside == 'button':
            self.groups[-1]['options'].append(self.button); self.inside = None
        elif tag in ('label', 'div') and self.inside == 'question':
            self.inside = None
        elif tag in ('div', 'span') and self.inside == 'title' and self.title.strip():
            self.inside = None

    def handle_data(self, data):
        if self.inside == 'title':
            self.title += data
        elif self.inside == 'question' and self.groups:
            self.groups[-1]['question'] += data
        elif self.inside == 'button':
            self.button['parts'][-1] += data


def clean(s):
    return re.sub(r'\s+', ' ', s).strip().replace('|', '/')


def convert(text):
    reader = Reader()
    reader.feed(text)
    lines, used = [], set()
    for n, g in enumerate(reader.groups, 1):
        gid = re.sub(r'[^\w-]', '_', g['id'] or f'q{n}')
        if not re.match(r'[A-Za-z]', gid):
            gid = 'q' + gid
        base, k = gid, 2
        while gid in used:
            gid = f'{base}{k}'; k += 1
        used.add(gid)
        options = []
        for o in g['options']:
            parts = [clean(p) for p in o['parts'] if clean(p)]
            label = parts[0] if parts else clean(o['value'])
            hint = ' · '.join(parts[1:]) if len(parts) > 1 else None
            rec = bool(hint and RECOMMENDED.search(hint))
            if rec:
                hint = RECOMMENDED_PREFIX.sub('', hint) or None
            value = clean(html.unescape(o['value']))
            s = label + ('*' if rec else '')
            if hint:
                s += ' ~ ' + hint
            if value and value != label:
                s += ' => ' + value
            options.append(s)
        if g['text']:
            options.append('@text')
        lines.append(f"{gid}{'+' if g['multi'] else ''} | {clean(g['question'])} | " + ' | '.join(options))
    title = clean(reader.title or 'Decisions')
    return f'```decisions "{title}"\n' + '\n'.join(lines) + '\n```\n'


if __name__ == '__main__':
    sys.stdout.write(convert(open(sys.argv[1], encoding='utf-8').read()))
