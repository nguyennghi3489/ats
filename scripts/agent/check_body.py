"""Checks an issue body file against a GitHub issue form, like Forgejo's form check.

The body must repeat every form field, in order, as:

    ### <label>

    <description, copied exactly, when the field has one>

    Required.                      (only for required fields)

    ~~~~~ markdown
    <value>
    ~~~~~

Required fields need a non-empty value. Prints the first rejected line and exits 1, or prints "ok".
usage: python3 -I check_body.py <form.yml> <body.md>
"""
import re
import sys


def form_fields(path):
    # Minimal reader for our own forms: label, description, required per textarea.
    fields, cur = [], None
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if re.match(r'\s*- type:', line):
            cur = {'label': None, 'description': None, 'required': False}
            fields.append(cur)
        elif cur is not None:
            m = re.match(r'\s*(label|description|required):\s*(.*)$', line)
            if m:
                k, v = m.groups()
                cur[k] = (v.strip() == 'true') if k == 'required' else v.strip()
    return fields


def check(form, body):
    lines = open(body, encoding='utf-8').read().split('\n')
    i = 0

    def skip_blank():
        nonlocal i
        while i < len(lines) and not lines[i].strip():
            i += 1

    def fail(msg):
        sys.exit(f'line {i + 1}: {msg}')

    for f in form_fields(form):
        skip_blank()
        if i >= len(lines) or lines[i] != f'### {f["label"]}':
            fail(f'expected "### {f["label"]}"')
        i += 1
        if f['description']:
            skip_blank()
            if i >= len(lines) or lines[i] != f['description']:
                fail(f'expected the description of "{f["label"]}" copied exactly')
            i += 1
        skip_blank()
        if i < len(lines) and lines[i] == 'Required.':
            if not f['required']:
                fail(f'"{f["label"]}" is optional; remove "Required."')
            i += 1
        elif f['required']:
            fail(f'"{f["label"]}" is required; add "Required."')
        skip_blank()
        if i >= len(lines) or lines[i] != '~~~~~ markdown':
            fail('expected "~~~~~ markdown"')
        start = i = i + 1
        while i < len(lines) and lines[i] != '~~~~~':
            i += 1
        if i >= len(lines):
            fail('unclosed "~~~~~" block')
        if f['required'] and not '\n'.join(lines[start:i]).strip():
            fail(f'"{f["label"]}" is required but empty')
        i += 1
    skip_blank()
    if i < len(lines):
        fail('unexpected text after the last field')
    print('ok')


if __name__ == '__main__':
    check(*sys.argv[1:3])
