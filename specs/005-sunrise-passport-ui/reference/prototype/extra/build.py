"""Build extra/index.html from src/shell.html + src/frames/*.html (+ src/inc/*.html) + icons/*.svg.
Frame file: first line  <!--frame id=add-stop no=01 title="Add stop" status=dark hind=dark kind=phone cap="...">-->
"""
import re, glob, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))

ORDER = ['add-stop', 'add-stop-kb', 'countries', 'photos', 'photo-viewer', 'expenses', 'add-expense', 'notes', 'note-editor',
         'documents', 'document-view', 'offline-maps', 'auth', 'register', 'permission-primer', 'permission-primer-location',
         'permission-primer-notifications', 'settings', 'recap', 'recap-2', 'recap-3', 'recap-share', 'trip-menu', 'delete-confirm',
         'search', 'search-recent', 'states']
ORDER.insert(ORDER.index('recap-share') + 1, 'recap-poster')


def sprite():
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>']
    for f in sorted(glob.glob(os.path.join(ROOT, 'icons', '*.svg'))):
        name = os.path.basename(f)[:-4]
        s = open(f, encoding='utf8').read()
        m = re.search(r'<svg[^>]*>(.*)</svg>', s, re.S)
        if not m:
            continue
        inner = re.sub(r'\s+', ' ', m.group(1)).strip()
        inner = re.sub(r'<!--.*?-->', '', inner)
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{inner}</symbol>')
    out.append(open(os.path.join(ROOT, 'src', 'symbols.svg'), encoding='utf8').read())
    out.append('</defs></svg>')
    return '\n'.join(out)


STATUS = ('<div class="status{c}"><span>9:41</span><span class="r"><svg width="18" height="12"><use href="#i-sig"/></svg>'
          '<svg width="17" height="12"><use href="#i-sbwifi"/></svg><svg width="27" height="13"><use href="#i-batt"/></svg></span></div><div class="island"></div>')


def macros(h):
    def inc(m):
        return open(os.path.join(ROOT, 'src', 'inc', m.group(1) + '.html'), encoding='utf8').read()
    for _ in range(2):
        h = re.sub(r'\{\{INC:([\w-]+)\}\}', inc, h)
    def tabs(m):
        on = m.group(1)
        items = [('globe', 'globe', 'Globe'), ('trips', 'luggage', 'Trips'), ('you', 'user-round', 'You')]
        out = '<nav class="tabs" aria-label="Main">'
        for k, ic, lb in items:
            out += f'<button class="tab{" is-on" if k == on else ""}"{" aria-current=\"page\"" if k == on else ""}><svg class="ic"><use href="#i-{ic}"/></svg>{lb}</button>'
        return out + '</nav>'
    h = re.sub(r'\{\{TABS:(\w+)\}\}', tabs, h)
    def icon(m):
        sz, name, cls = m.group(1), m.group(2), m.group(3)
        c = 'ic' + (' ic-' + sz if sz else '') + (' ' + cls.replace('.', ' ') if cls else '')
        return f'<svg class="{c}" aria-hidden="true"><use href="#i-{name}"/></svg>'
    h = re.sub(r'\[\[i(\d*):([\w-]+)((?:\.[\w-]+)*)\]\]', icon, h)
    def flag(m):
        sz, code = m.group(1), m.group(2)
        cls = {'': 'flag', '20': 'flag sm', '14': 'flag xs'}[sz]
        return f'<span class="{cls}" data-flag="{code}"></span>'
    h = re.sub(r'\[\[flag(\d*):(\w+)\]\]', flag, h)
    return h


def parse_meta(first):
    m = re.match(r'<!--frame (.*?)-->', first, re.S)
    meta = {}
    if m:
        for k, v1, v2 in re.findall(r'(\w+)=(?:"([^"]*)"|(\S+))', m.group(1)):
            meta[k] = v1 or v2
    return meta


def main():
    shell = open(os.path.join(ROOT, 'src', 'shell.html'), encoding='utf8').read()
    frames = []
    nums = {}
    for i, fid in enumerate(ORDER):
        p = os.path.join(ROOT, 'src', 'frames', fid + '.html')
        if not os.path.exists(p):
            continue
        txt = open(p, encoding='utf8').read()
        first, _, body = txt.partition('\n')
        meta = parse_meta(first)
        meta.setdefault('id', fid)
        status = meta.get('status', 'dark')
        hind = meta.get('hind', 'dark')
        no = meta.get('no', f'{len(frames) + 1:02d}')
        cap = f'<p class="cap"><b>{no}</b>{meta.get("title", fid)}<span>{meta.get("cap", "")}</span></p>'
        if meta.get('kind') == 'board':
            frames.append(f'<section class="slot wide" data-slot="{fid}"><div class="board-frame" id="{fid}" data-frame="{fid}">{body}</div>{cap}</section>')
            continue
        chrome = ''
        if status != 'none':
            chrome += STATUS.format(c='' if status == 'dark' else ' on-' + ('photo' if status == 'photo' else status))
        if hind != 'none':
            chrome += f'<div class="hind{"" if hind == "dark" else " on-" + ("photo" if hind == "photo" else hind)}"></div>'
        frames.append(f'<section class="slot" data-slot="{fid}"><div class="phone" id="{fid}" data-frame="{fid}">{body}{chrome}</div>{cap}</section>')
    css = chr(10).join(open(f, encoding='utf8').read() for f in sorted(glob.glob(os.path.join(ROOT, 'src', 'css', '*.css'))))
    open(os.path.join(ROOT, 'screens.css'), 'w', encoding='utf8').write(css)
    html = shell.replace('<!--SPRITE-->', sprite()).replace('<!--FRAMES-->', '\n'.join(frames))
    html = macros(html)
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf8').write(html)
    print('built index.html', len(html), 'frames:', len(frames))


main()
