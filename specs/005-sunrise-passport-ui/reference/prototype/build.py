# SUNRISE PASSPORT v2 - builds index.html from component functions (all markup is token-driven, see styles.css)
import re, glob, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------- assets
PH = {
    'tram': 'photo-1585208798174-6cedd86e019a', 'sintra': 'photo-1750832693915-fae6bf21d329', 'sintraY': 'photo-1697394494123-c6c1323a14f7', 'pena': 'photo-1744133128473-d056d93526ad',
    'porto': 'photo-1555881400-74d7acaacd8b', 'portoBridge': 'photo-1569959220744-ff553533f492', 'portoSunset': 'photo-1513735492246-483525079686',
    'lisbonRoofs': 'photo-1536663815808-535e2280d2c2', 'arco': 'photo-1548707309-dcebeab9ea9b', 'kyoto': 'photo-1493976040374-85c8e12f0c0e',
    'tokyo': 'photo-1540959733332-eab4deabeeaf', 'fushimi': 'photo-1478436127897-769e1b3f0f36', 'iceland': 'photo-1476610182048-b716b8518aae',
    'mexico': 'photo-1518105779142-d975f22f1b0a', 'zocalo': 'photo-1585464231875-d9ef1f5ad396', 'paris': 'photo-1431274172761-fca41d930114',
    'rome': 'photo-1552832230-c0197dd311b5', 'marta': 'photo-1494790108377-be9c29b29330', 'beach': 'photo-1507525428034-b723cf961d3e',
    'cinque': 'photo-1534445867742-43195f401b6c', 'torii': 'photo-1504109586057-7a2ae83d1338',
}
def phurl(k): return f'img/{PH[k]}.jpg'

FLAGS = {
 'pt': '<rect width="8" height="14" fill="#046A38"/><rect x="8" width="12" height="14" fill="#DA291C"/><circle cx="8" cy="7" r="2.6" fill="#FFE000"/>',
 'es': '<rect width="20" height="14" fill="#C60B1E"/><rect y="3.5" width="20" height="7" fill="#FFC400"/>',
 'fr': '<rect width="7" height="14" fill="#1F3FA6"/><rect x="7" width="6" height="14" fill="#fff"/><rect x="13" width="7" height="14" fill="#E1253A"/>',
 'it': '<rect width="7" height="14" fill="#009246"/><rect x="7" width="6" height="14" fill="#fff"/><rect x="13" width="7" height="14" fill="#CE2B37"/>',
 'de': '<rect width="20" height="5" fill="#111"/><rect y="5" width="20" height="4" fill="#DD0000"/><rect y="9" width="20" height="5" fill="#FFCE00"/>',
 'nl': '<rect width="20" height="5" fill="#AE1C28"/><rect y="5" width="20" height="4" fill="#fff"/><rect y="9" width="20" height="5" fill="#21468B"/>',
 'gb': '<rect width="20" height="14" fill="#1B3A8C"/><path d="M0 0l20 14M20 0L0 14" stroke="#fff" stroke-width="3"/><path d="M0 0l20 14M20 0L0 14" stroke="#C8102E" stroke-width="1.1"/><path d="M10 0v14M0 7h20" stroke="#fff" stroke-width="4.6"/><path d="M10 0v14M0 7h20" stroke="#C8102E" stroke-width="2.6"/>',
 'gr': '<rect width="20" height="14" fill="#0D5EAF"/><path d="M0 3.1h20M0 7h20M0 10.9h20" stroke="#fff" stroke-width="1.6"/><rect width="8" height="7.8" fill="#0D5EAF"/><path d="M4 0v7.8M0 3.9h8" stroke="#fff" stroke-width="1.8"/>',
 'cz': '<rect width="20" height="7" fill="#fff"/><rect y="7" width="20" height="7" fill="#D7141A"/><path d="M0 0l10 7L0 14z" fill="#11457E"/>',
 'jp': '<rect width="20" height="14" fill="#fff"/><circle cx="10" cy="7" r="4" fill="#BC002D"/>',
 'th': '<rect width="20" height="14" fill="#A51931"/><rect y="2.3" width="20" height="9.4" fill="#fff"/><rect y="4.7" width="20" height="4.6" fill="#2D2A4A"/>',
 'mx': '<rect width="7" height="14" fill="#006847"/><rect x="7" width="6" height="14" fill="#fff"/><rect x="13" width="7" height="14" fill="#CE1126"/><circle cx="10" cy="7" r="1.6" fill="#8B5A2B"/>',
 'us': '<rect width="20" height="14" fill="#fff"/><path d="M0 1h20M0 4.6h20M0 8.2h20M0 11.8h20" stroke="#B22234" stroke-width="1.8"/><rect width="9" height="7.6" fill="#3C3B6E"/>',
 'ma': '<rect width="20" height="14" fill="#C1272D"/><path d="M10 3.6l1.2 3.6-3.1-2.2h3.8L8.8 7.2z" fill="none" stroke="#006233" stroke-width=".9"/>',
 'is': '<rect width="20" height="14" fill="#02529C"/><path d="M0 7h20M7 0v14" stroke="#fff" stroke-width="4"/><path d="M0 7h20M7 0v14" stroke="#DC1E35" stroke-width="2"/>',
}
def flag(c, cls=''):
    return f'<span class="flag {cls}" aria-hidden="true"><svg viewBox="0 0 20 14" preserveAspectRatio="none">{FLAGS[c]}</svg></span>'

def ic(name, size=None, cls=''):
    c = 'ic' + (f' ic-{size}' if size else '') + (f' {cls}' if cls else '')
    return f'<svg class="{c}" aria-hidden="true"><use href="#i-{name}"/></svg>'

def ph(key, cls='', style='', extra=''):
    return f'<div class="ph {cls}" style="background-image:url({phurl(key)});{style}" {extra}></div>'

def sprite():
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>']
    for f in sorted(glob.glob(os.path.join(ROOT, 'cand', 'icons', '*.svg'))):
        name = os.path.basename(f)[:-4]
        s = open(f, encoding='utf8').read()
        m = re.search(r'<svg[^>]*>(.*)</svg>', s, re.S)
        if not m: continue
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{re.sub(chr(10)+"|\\s{2,}", " ", m.group(1)).strip()}</symbol>')
    out.append(open(os.path.join(ROOT, 'src', 'extra-symbols.svg'), encoding='utf8').read())
    out.append('</defs></svg>')
    return '\n'.join(out)

# ----------------------------------------------------------------- chrome
def status(photo=False):
    c = ' on-photo' if photo else ''
    return (f'<div class="status{c}"><span>9:41</span><span class="r"><svg width="18" height="12"><use href="#i-sig"/></svg>'
            '<svg width="17" height="12"><use href="#i-sbwifi"/></svg><svg width="27" height="13"><use href="#i-batt"/></svg></span></div><div class="island"></div>')
def hind(photo=False): return f'<div class="hind{" on-photo" if photo else ""}"></div>'

def tabbar(on):
    items = [('globe', 'globe', 'Globe'), ('trips', 'luggage', 'Trips'), ('profile', 'user-round', 'You')]
    o = '<nav class="tabbar" aria-label="Main">'
    for k, i, lb in items:
        cur = ' aria-current="page"' if k == on else ''
        o += f'<button class="tab{" is-on" if k == on else ""}"{cur}><span class="ind">{ic(i)}</span><span class="lb">{lb}</span></button>'
    return o + '</nav><div class="tabbar-fade"></div>'

def sync_chip(kind='queued'):
    if kind == 'queued': return f'<button class="sync-chip" aria-label="3 changes waiting to sync">{ic("cloud-upload")}3</button>'
    if kind == 'off': return f'<button class="sync-chip is-off" aria-label="Offline, 3 changes waiting">{ic("wifi-off")}3</button>'
    if kind == 'err': return f'<button class="sync-chip is-err" aria-label="Sync failed, retry">{ic("alert")}Retry</button>'
    return ''

def search_btn(cls='on-sky'): return f'<button class="icon-btn {cls}" aria-label="Search">{ic("search")}</button>'

def fab(label='New trip', raised=False, icon='plus', mini=False):
    return f'<button class="btn btn-primary fab{" is-raised" if raised else ""}{" mini" if mini else ""}" aria-label="{label}">{ic(icon)}<span class="lbl">{label}</span></button>'

def slot(fid, group, num, title, text, inner, photo_status=False):
    return (f'<section class="slot" data-slot="{fid}" data-group="{group}"><div class="phone" id="{fid}" data-frame="{fid}">{inner}'
            f'{status(photo_status)}{hind(photo_status)}</div>'
            f'<p class="cap"><b>{num}</b>{title}<span>{text}</span></p></section>')

def pill(kind, icon, text, extra=''):
    return f'<span class="pill s-{kind}" {extra}>{ic(icon)}{text}</span>'
def now_pill(text='Now · Day 3 of 8', photo=False):
    return f'<span class="pill s-now{" on-photo" if photo else ""}"><i class="live-dot"></i>{text}</span>'

LONG_TITLE = 'Lisbon to the Algarve via Sintra, Porto and the Douro Valley'   # 60 chars
assert len(LONG_TITLE) == 60, len(LONG_TITLE)
def L(txt, longtxt): return f'data-long="{longtxt}"'

# ----------------------------------------------------------------- shared blocks
def stats_row():
    def s(v, small, label, lg=None):
        a = f' data-long="{lg}"' if lg else ''
        return (f'<button class="stat"><div class="v t-numeral prop"><span{a}>{v}</span>{small}</div>'
                f'<div class="l">{label}{ic("chevron-right", 16, "mirror")}</div></button>')
    return ('<div class="stats">' + s('14', '<small>/195</small>', 'Countries') + s('22', '', 'Trips') +
            s('61,480', '', 'Kilometres', '1.26M') + '</div>')

def now_card(chev='chevron-right', thumb=None):
    t = thumb or ph('tram', 'th', 'background-position:50% 60%')
    return (f'<button class="now-card" aria-label="Portugal Road Trip, now, day 3 of 8">{t}<div class="bd">'
            f'<div class="t-callout clamp-1" data-long="{LONG_TITLE}">Portugal Road Trip</div>'
            f'<div class="meta t-label"><i class="live-dot" style="margin-right:2px"></i><span>Day 3 of 8 · Sintra</span></div>'
            f'<div class="dots" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="now"></i><i></i><i></i><i></i><i></i><i></i></div></div>'
            f'{ic(chev, 20, "chev mirror")}</button>')

def next_row():
    return (f'<button class="mini-row">{ph("iceland", "th")}<div class="bd"><div class="t-callout clamp-1">Iceland Ring Road</div>'
            f'<div class="meta-line">{flag("is")}<span>Jan 2027 · in 94 days</span></div></div>{ic("chevron-right", 20, "chev mirror")}</button>')

def banner(kind, text, act=None):
    icon = {'off': 'wifi-off', 'err': 'alert'}[kind]
    a = f'<button class="act">{act}</button>' if act else ''
    return f'<div class="banner {kind}" role="status">{ic(icon, 20)}<div class="tx">{text}</div>{a}</div>'

def sk(cls='', style=''): return f'<div class="sk {cls}" style="{style}"></div>'

# ----------------------------------------------------------------- HOME
def home(detent='half', state='normal'):
    fid = {'half': 'home', 'peek': 'home-peek', 'full': 'home-full', 'empty': 'home-empty'}[detent]
    if state != 'normal': fid = f'home-{state}'
    g = detent if state == 'normal' else {'loading': 'loading', 'offline': 'half', 'error': 'half'}[state]
    chip = {'normal': 'queued', 'offline': 'off', 'error': 'err', 'loading': ''}[state]
    if detent == 'empty': chip = ''
    greet_eb = 'Wed 14 Oct' if detent != 'empty' else '0 of 195 countries'
    hello = 'Hello,' if detent != 'empty' else 'Welcome,'
    head = (f'<header class="home-head"><div class="greet"><div class="t-eyebrow">{greet_eb}</div>'
            f'<h1 class="t-display">{hello} <span class="t-serif" data-long="Maria-Magdalena Fernandez-Castellanos">Marta</span></h1></div>'
            f'<div class="h-tools">{sync_chip(chip)}{search_btn() if detent != "empty" else ""}</div></header>')
    globe_el = f'<canvas class="globe" aria-label="Globe, 14 countries visited. Open the list for an accessible alternative."></canvas><div class="markers"></div>'
    if g == 'loading': globe_el = '<div class="sk-disc" data-skdisc></div>'
    body = ''
    if detent == 'half' and state in ('normal', 'offline', 'error', 'loading'):
        if state == 'loading':
            inner = ('<div class="stats">' + ''.join(f'<div class="stat"><div class="sk r-lg" style="width:70%;height:40px"></div><div class="sk line" style="width:80%;margin-top:4px"></div></div>' for _ in range(3)) + '</div>'
                     '<div class="now-card" aria-hidden="true">' + sk('r-lg', 'width:64px;height:64px;flex:none') + '<div class="bd" style="gap:8px">' + sk('line lg', 'width:70%') + sk('line', 'width:50%') + '</div></div>'
                     '<div class="mini-row" aria-hidden="true">' + sk('r-lg', 'width:48px;height:48px;flex:none') + '<div class="bd" style="display:flex;flex-direction:column;gap:8px">' + sk('line lg', 'width:55%') + sk('line', 'width:40%') + '</div></div>')
        else:
            bn = ''
            if state == 'offline': bn = banner('off', "Offline. 3 changes will sync when you're back online.")
            if state == 'error': bn = banner('err', "Couldn't sync 2 changes. Your trips are safe on this phone.", 'Retry')
            inner = bn + stats_row() + now_card() + (next_row() if not bn else '')
        body = f'<section class="sheet" data-d="half" aria-label="Your travel summary"><div class="grab-zone" role="adjustable" aria-label="Sheet size"><div class="grab"></div></div><div class="sheet-body">{inner}</div></section>'
        body += fab() if state != 'loading' else ''
    elif detent == 'peek':
        body = (f'<section class="sheet" data-d="peek"><div class="grab-zone" role="adjustable" aria-label="Sheet size"><div class="grab"></div></div>'
                f'<div class="sheet-body">{now_card("chevron-up")}</div></section>' + fab(mini=True)
                + f'<button class="icon-btn on-sky recentre" style="top:150px" aria-label="Recentre on current trip">{ic("locate-fixed")}</button>')
    elif detent == 'full':
        def crow(c, name, n, last):
            return (f'<button class="list-row">{flag(c, "lg")}<div class="bd"><div class="t-callout clamp-1">{name}</div>'
                    f'<div class="t-label c2 clamp-1">{n} · last {last}</div></div>{ic("chevron-right", 20, "chev mirror")}</button>')
        rows = (crow('pt', 'Portugal', '2 trips', 'Oct 2026') + crow('es', 'Spain', '3 trips', 'Apr 2024') + crow('it', 'Italy', '2 trips', 'Sep 2023')
                + crow('fr', 'France', '2 trips', 'Jun 2023') + crow('de', 'Germany', '1 trip', 'Dec 2022') + crow('gb', 'United Kingdom', '1 trip', 'May 2022')
                + crow('nl', 'Netherlands', '1 trip', 'Aug 2021') + crow('gr', 'Greece', '1 trip', 'Jul 2021') + crow('cz', 'Czechia', '1 trip', 'Dec 2019'))
        body = (f'<section class="sheet" data-d="full" aria-label="Countries"><div class="grab-zone" role="adjustable" aria-label="Sheet size"><div class="grab"></div></div>'
                f'<div class="sheet-head"><div><h2 class="t-headline">Countries</h2><div class="t-label c2">14 of 195 · 4 continents</div></div>{search_btn("tonal")}</div>'
                f'<div class="sheet-body" style="gap:0"><div class="sec-label t-eyebrow sticky">Europe · 9</div>{rows}</div></section>')
    elif detent == 'empty':
        body = ('<section class="invite" aria-label="Add your first trip"><div class="fan" aria-hidden="true">' + ''.join(f'<i style="background-image:url({phurl(k)})"></i>' for k in ('paris', 'iceland', 'kyoto')) + '</div>'
                '<h2 class="t-title">Where to <span class="t-serif">first?</span></h2>'
                '<p class="t-body">Add your first trip and watch your world light up on the globe.</p>'
                f'<button class="btn btn-primary btn-lg btn-block">{ic("plus")}Add your first trip</button>'
                f'<button class="btn btn-ghost">Find trips in my photos</button></section>')
    caps = {
        'home': ('01', 'Home · half detent', 'Globe is the hero, bleeding off both sides. The sheet holds three tappable numerals, the live trip and what is next. One sync chip, one search icon, one FAB above the tab pill.'),
        'home-peek': ('02', 'Home · peek detent', 'Whole planet on show (R 175, 20 px margins). The peek is one row: the live trip. Recentre appears only after the camera moved.'),
        'home-full': ('03', 'Home · full detent = Countries', 'Sheet at 92 %: the accessible list alternative to the globe, grouped by continent with flag chips. FAB hides.'),
        'home-empty': ('04', 'Home · empty', 'Globe stays mounted. A three-photo fan replaces the avatar pin; one card, one action, and an honest permission-gated secondary.'),
        'home-loading': ('H1', 'Home · loading', 'Skeleton disc where the globe will mount, skeleton sheet. Greeting is cached so the screen never looks blank.'),
        'home-offline': ('H2', 'Home · offline with waiting changes', 'Sync chip turns into wifi-off + count; one slim non-blocking banner. The globe keeps working offline.'),
        'home-error': ('H3', 'Home · sync error', 'Crimson chip with a verb (Retry), an icon, and a calm explanation that data is safe locally.'),
    }
    n, t, d = caps[fid]
    grp = 'Core frames' if state == 'normal' else 'Home states'
    inner = (f'<div class="screen" data-globe="{g}" data-detent="{detent}"><div class="sky"></div>{globe_el}{head}{body}{tabbar("globe")}</div>')
    return slot(fid, grp, n, t, d, inner)

# ----------------------------------------------------------------- TRIPS
def hero_card(kind='normal', cover=True):
    top_r = {'normal': f'<span class="rec-glyph" aria-label="Waiting to sync">{ic("cloud-upload")}</span>',
             'off': f'<span class="rec-glyph" aria-label="Waiting to sync">{ic("cloud-upload")}</span>',
             'err': f'<span class="pill on-photo" style="color:#9F1239"><svg class="ic" style="color:#9F1239"><use href="#i-alert"/></svg>Retry</span>'}.get(kind, '')
    bgstyle = f'background-image:url({phurl("tram")})' if cover else ''
    cg = ''
    cls = 'hero-card' + ('' if cover else ' cover-gen v1')
    attrs = '' if cover else ' data-code="PT"'
    if not cover:
        cg = f'<svg class="cg-stamp" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 6"/><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="60" y="70" text-anchor="middle" font-size="28" font-weight="800" fill="currentColor" font-family="Bricolage Grotesque">PT</text></svg>'
    return (f'<article class="{cls} ph" style="{bgstyle}"{attrs}>{cg}<div class="top">{now_pill(photo=True)}{top_r}</div>'
            f'<div class="bot"><div class="cap-ramp"></div><div class="cap-solid">'
            f'<div class="eb t-eyebrow">{flag("pt")}Portugal · 3 stops</div>'
            f'<h3 class="t-title clamp-2" data-long="{LONG_TITLE}">Portugal Road Trip</h3>'
            f'<div class="meta t-label">{ic("calendar", 16)}12–19 Oct · 7 nights</div>'
            f'<div class="strip" aria-label="Stops: Lisbon visited, Sintra now, Porto next"><div class="st done"><i></i>LIS</div><div class="st now done"><i></i>SNT</div><div class="st next"><i></i>OPO</div></div>'
            f'</div></div></article>')

def ticket():
    return (f'<article class="ticket"><div class="th" style="background-image:url({phurl("iceland")})"></div><div class="bd">'
            f'{pill("planned", "calendar", "Planned")}<div class="t-callout clamp-2" style="margin-top:2px">Iceland Ring Road</div>'
            f'<div class="meta-line">{flag("is")}<span>Iceland · Jan 2027</span></div></div>'
            f'<div class="stub"><div class="v t-title tnum">94</div><div class="u t-caption">days</div></div></article>')

def trip_row(key, title, cc, country, when, thumb=True, code=None, vcls='v1'):
    if thumb:
        th = f'<div class="th ph" style="background-image:url({phurl(key)})"></div>'
    else:
        th = f'<div class="th cover-gen thumb {vcls}" data-code="{code}"></div>'
    return (f'<a class="trip-row">{th}<div class="bd"><div class="t-callout clamp-1">{title}</div>'
            f'<div class="meta-line">{flag(cc)}<span>{country} · {when}</span></div></div>{ic("chevron-right", 20, "chev mirror")}</a>')

def year_head(y, n, km):
    return f'<div class="year-head"><div class="y"><b>{y}</b><span class="t-caption c2">{n}</span></div><span class="t-caption c3">{km}</span></div>'

def skel_row(): return ('<div class="trip-row" aria-hidden="true">' + sk('r-lg', 'width:64px;height:64px;flex:none') + '<div class="bd" style="gap:8px">' + sk('line lg', 'width:60%') + sk('line', 'width:80%') + '</div></div>')

def trips(state='normal'):
    fid = 'trips' if state == 'normal' else f'trips-{state}'
    chip = {'normal': 'queued', 'off': 'off', 'err': 'err'}.get(state, '')
    if state in ('loading', 'nocover', '200', 'toast'): chip = 'queued' if state in ('nocover', '200') else ''
    sub = '<div class="t-label c2" style="margin:-8px var(--sp-5) 12px">214 trips · since 2009 · tap a year to jump</div>' if state == '200' else ''
    topbar = (f'<header class="topbar"><div class="title"><h1 class="t-display">Trips</h1><div class="h-tools" style="display:flex;gap:8px;align-items:center">{sync_chip(chip)}{search_btn("tonal")}</div></div></header>')
    seg = ('<div style="padding:0 var(--sp-5) var(--sp-4)" class="segwrap"><div class="seg" role="radiogroup" aria-label="Filter trips">'
           '<button class="is-on" role="radio" aria-checked="true">All</button><button role="radio">Active <span class="n">1</span></button><button role="radio">Planned</button><button role="radio">Past</button></div></div>')
    items = ''
    if state == 'loading':
        items = (sk('r-xl', 'min-height:219px;height:219px') + sk('r-xl', 'height:96px') + '<div style="height:8px"></div>' + sk('line lg', 'width:90px') + skel_row() + skel_row() + skel_row())
        items = items.replace('r-xl', 'r-xl', 1)
        items = items.replace('<div class="sk r-xl" style="min-height:219px;height:219px"></div>', '<div class="sk r-xl" style="min-height:219px;height:219px"><svg class="ic sk-ic"><use href="#i-map-pin"/></svg></div>')
    else:
        bn = ''
        if state == 'off': bn = banner('off', "Offline. 3 changes will sync when you're back online.")
        if state == 'err': bn = banner('err', "Couldn't sync 2 changes. Tap Retry or try later; nothing is lost.", 'Retry')
        hero = hero_card({'off': 'off', 'err': 'err'}.get(state, 'normal'), cover=(state != 'nocover'))
        if state == 'nocover':
            r1 = trip_row('', 'Tokyo &amp; Kyoto', 'jp', 'Japan', 'Mar 2026 · 9 days', thumb=False, code='JP', vcls='v3')
            r2 = trip_row('', 'Mexico City', 'mx', 'Mexico', 'Nov 2025 · 6 days', thumb=False, code='MX', vcls='v2')
            r3 = trip_row('arco', 'Lisbon weekend', 'pt', 'Portugal', 'Jun 2025 · 3 days')
        else:
            r1 = trip_row('kyoto', 'Tokyo &amp; Kyoto', 'jp', 'Japan', 'Mar 2026 · 9 days')
            r2 = trip_row('mexico', 'Mexico City', 'mx', 'Mexico', 'Nov 2025 · 6 days')
            r3 = trip_row('arco', 'Lisbon weekend', 'pt', 'Portugal', 'Jun 2025 · 3 days')
        r1l = r1.replace('Tokyo &amp; Kyoto</div>', 'Tokyo &amp; Kyoto</div>').replace('class="t-callout clamp-1"', 'class="t-callout clamp-1" data-long="Tokyo, Kyoto, Osaka, Nara and Hiroshima rail loop"', 1)
        r1 = r1l
        if state == 'toast':
            body_rows = year_head('2026', '1 trip', '9,380 km') + f'<div class="rows">{r1}</div>' + year_head('2025', '2 trips', '4,210 km') + f'<div class="rows">{r2}</div>'
        elif state == '200':
            body_rows = year_head('2025', '6 trips', '4,210 km') + f'<div class="rows">{r2}{r3}</div>'
        else:
            body_rows = year_head('2026', '1 trip', '9,380 km') + f'<div class="rows">{r1}</div>' + year_head('2025', '2 trips', '4,210 km') + f'<div class="rows">{r2}{r3}</div>'
        if state == '200':
            items = bn + hero + ticket() + body_rows
        else:
            items = bn + hero + ticket() + body_rows
    scrub = ''
    if state == '200':
        scrub = '<nav class="year-scrub" aria-label="Jump to year"><span>26</span><span class="on">25</span><span>24</span><span>23</span><span>22</span><span>21</span><span>20</span><span>·</span><span>09</span></nav>'
    toast = ''
    if state == 'toast':
        toast = (f'<div class="toast" role="status"><div class="tx">Trip deleted</div><button class="act">{ic("undo", 20)}Undo</button><i class="bar"></i></div>')
    fabel = '' if state == 'loading' else fab(raised=(state == 'toast'))
    cls = 'list' + (' has-scrub' if state == '200' else '')
    inner = f'<div class="screen">{topbar}{sub}{seg}<div class="{cls}"{" style=\"padding-right:44px\"" if state == "200" else ""}>{items}</div>{scrub}{toast}{fabel}{tabbar("trips")}</div>'
    caps = {
        'normal': ('05', 'Trips list', 'Active trip as a hero card with a dashed stop strip, a ticket card with a countdown stub for what is next, then year-grouped compact rows. FAB above the tab pill; list padding clears both.'),
        'loading': ('T1', 'Trips · loading', 'Skeleton blocks mirror the real layout (hero, ticket, rows). Photo skeleton carries a pin glyph.'),
        'off': ('T2', 'Trips · offline', 'Slim non-blocking banner, chip becomes wifi-off. Record keeps its glyph-only waiting marker.'),
        'err': ('T3', 'Trips · sync error', 'Banner + the record that failed shows a white Retry pill on the photo. Data is local, so the list is never empty.'),
        'nocover': ('T4', 'Trips · no cover photo', 'Generated typographic covers: gradient, country code, flag and a dashed stamp. Three palettes, white text above 4.5:1.'),
        '200': ('T5', 'Trips · 200+ trips', 'Title carries the count, a year scrubber sits on the right edge, headers stay sticky. FlashList with getItemType in the build.'),
        'toast': ('T6', 'Trips · toast with Undo', 'Delete is reversible: ink toast above the tab pill with a 5 s countdown bar; FAB lifts above it.'),
    }
    n, t, d = caps[state]
    return slot(fid, 'Core frames' if state == 'normal' else 'Trips states', n, t, d, inner)

# ----------------------------------------------------------------- TRIP DETAIL
def stop(kind, name, dates, key, nights, last=False, now=False, long_name=None):
    node = {'done': f'<div class="node done">{ic("check", 16)}</div>', 'here': '<div class="node here">2</div>', 'next': '<div class="node next">3</div>'}[kind]
    spine = '' if last else f'<div class="spine{" coral" if kind == "here" else ""}"></div>'
    pillnow = now_pill("Now") if now else ''
    lg = f' data-long="{long_name}"' if long_name else ''
    return (f'<div class="stop"><div class="rail">{node}{spine}</div><div class="body"><div class="tx"><div class="ttl-row"><div class="t-callout clamp-2"{lg}>{name}</div>{pillnow}</div>'
            f'<div class="t-label c2">{dates} · {nights}</div></div><div class="th ph" style="background-image:url({phurl(key)})"></div></div></div>')
def transit(mode, text):
    return f'<div class="transit"><div class="rail"><div class="spine dot"></div></div><div class="tx">{ic(mode, 16)}{text}</div></div>'

def area(icon, n, lbl, lock=False, warn=False, longn=None):
    lk = f'<span class="lock" aria-label="Only you">{ic("lock")}</span>' if lock else ''
    bd = '<i class="badge"></i>' if warn else ''
    a = f' data-long="{longn}"' if longn else ''
    return (f'<button class="area{" warn" if warn else ""}">{lk}{bd}{ic(icon, 20)}<div class="n t-callout"{a}>{n}</div><div class="l t-caption">{lbl}</div></button>')

def days_row():
    ds = [('D1', '12 Oct'), ('D2', '13 Oct'), ('D3', '14 Oct'), ('D4', '15 Oct'), ('D5', '16 Oct'), ('D6', '17 Oct')]
    return '<div class="days" role="tablist" aria-label="Days">' + ''.join(f'<button class="day{" is-on" if d == "D3" else ""}" role="tab"><span class="d">{d}</span><span class="dt">{t}</span></button>' for d, t in ds) + '</div>'

def stops_head(n=3):
    return (f'<div class="sec-cap"><h2 class="t-headline">Stops <span class="c3">{n}</span></h2><div class="seg sm" style="width:136px" role="radiogroup" aria-label="Stops view">'
            '<button class="is-on" role="radio" aria-checked="true">List</button><button role="radio">Map</button></div></div>')

def trip_detail(variant='normal'):
    fid = 'trip' if variant == 'normal' else f'trip-{variant}'
    collapsed = variant == 'collapsed'
    chip = {'off': 'off', 'err': 'err'}.get(variant, 'queued' if variant in ('normal', 'collapsed', 'nocover') else '')
    nav = (f'<div class="td-nav"><button class="icon-btn glass" aria-label="Back">{ic("chevron-left", 24, "mirror")}</button><div class="r">'
           f'<button class="icon-btn glass" aria-label="Share">{ic("share")}</button><button class="icon-btn glass" aria-label="More">{ic("ellipsis")}</button></div></div>')
    title_block = ('<div class="td-title"><div class="cap-ramp"></div><div class="cap-solid"><div class="t-eyebrow" style="display:flex;gap:8px;align-items:center">'
                   f'{flag("pt")}Portugal · 12–19 Oct 2026</div><h1 class="t-title clamp-2" data-long="{LONG_TITLE}">Portugal Road Trip</h1></div></div>')
    cover = variant != 'nocover'
    hero_cls = 'td-hero ph' if cover else 'td-hero cover-gen v1'
    hero_style = f'background-image:url({phurl("sintraY")});background-position:50% 40%' if cover else ''
    cg = '' if cover else ('<svg class="cg-stamp" viewBox="0 0 120 120" aria-hidden="true" style="top:96px;right:60px"><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 6"/><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="60" y="70" text-anchor="middle" font-size="28" font-weight="800" fill="currentColor" font-family="Bricolage Grotesque">PT</text></svg>')
    hero = f'<div class="{hero_cls}" style="{hero_style}" data-code="PT">{cg}<div class="scrim-top"></div>{nav}{title_block}</div>'

    # status row
    if variant == 'zero':
        status_row = f'<div class="status-row"><div class="prog">{pill("planned", "calendar", "Planned · in 4 days")}</div>{sync_chip("")}</div>'
    elif variant == 'loading':
        status_row = '<div class="status-row">' + sk('r-full', 'width:150px;height:28px') + sk('r-full', 'width:48px;height:36px') + '</div>'
    else:
        status_row = (f'<div class="status-row"><div class="prog">{now_pill("Day 3 of 8")}<div class="dots" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="now"></i><i></i><i></i><i></i><i></i><i></i></div></div>{sync_chip(chip)}</div>')

    if variant == 'loading':
        areas = '<div class="areas">' + ''.join(sk('r-lg', 'min-height:76px') for _ in range(4)) + '</div>'
        priv = ''
        days = '<div class="days">' + ''.join(sk('r-lg', 'min-width:56px;height:56px') for _ in range(5)) + '</div>'
        stops = ('<div class="sec-cap">' + sk('line lg', 'width:90px') + sk('r-full', 'width:136px;height:32px') + '</div><div class="timeline">' +
                 ''.join(f'<div class="stop"><div class="rail"><div class="sk r-full" style="width:28px;height:28px;margin-top:8px"></div></div><div class="body"><div class="tx" style="display:flex;flex-direction:column;gap:8px">{sk("line lg", "width:55%")}{sk("line", "width:70%")}</div>{sk("r-lg", "width:56px;height:56px;flex:none")}</div></div>' for _ in range(3)) + '</div>')
        add = ''
    else:
        if variant == 'zero':
            areas = ('<div class="areas">' + area('images', '0', 'Photos') + area('notebook-pen', '0', 'Notes') + area('wallet', '€0', 'Expenses', lock=True) + area('file-text', '0', 'Docs', lock=True) + '</div>')
        elif variant == 'off':
            areas = ('<div class="areas">' + area('images', '128', 'Photos') + area('notebook-pen', '6', 'Notes') + area('wallet', '€842', 'Expenses', lock=True, longn='€1.26M') + area('file-text', '4', 'Docs', lock=True) + '</div>')
        elif variant == 'err':
            areas = ('<div class="areas">' + area('images', '128', 'Photos', warn=True) + area('notebook-pen', '6', 'Notes') + area('wallet', '€842', 'Expenses', lock=True, longn='€1.26M') + area('file-text', '4', 'Docs', lock=True) + '</div>')
        else:
            areas = ('<div class="areas">' + area('images', '128', 'Photos') + area('notebook-pen', '6', 'Notes') + area('wallet', '€842', 'Expenses', lock=True, longn='€1.26M') + area('file-text', '4', 'Docs', lock=True) + '</div>')
        priv = f'<div class="priv-line">{ic("lock")}Expenses and Documents are only visible to you</div>'
        days = '' if variant == 'zero' else days_row()
        if variant == 'zero':
            stops = (stops_head(0) + f'<div class="empty"><svg class="ghost-stamp" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/><circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 5"/><g transform="translate(36 36) scale(2)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="#i-plane" width="24" height="24"/></g></svg>'
                     '<h2 class="t-callout">No stops yet</h2><p class="t-label">Add where you are going. The globe draws your route and the cover follows.</p>'
                     f'<button class="btn btn-primary">{ic("plus")}Add first stop</button></div>')
            add = ''
        else:
            tl = (stop('done', 'Lisbon', '12–14 Oct', 'lisbonRoofs', '2 nights') + transit('car', '28 km · 40 min') +
                  stop('here', 'Sintra', '14–15 Oct', 'sintra', '1 night', now=True, long_name='Santiago de Compostela, Galicia, Spain') + transit('car', '313 km · 3 h 20 min') +
                  stop('next', 'Porto', '15–19 Oct', 'portoBridge', '4 nights', last=True))
            stops = stops_head(3) + f'<div class="timeline">{tl}</div>'
            add = f'<button class="add-stop">{ic("plus")}Add stop</button>'
    banner_html = ''
    if variant == 'off': banner_html = banner('off', "Offline. 3 changes will sync when you're back online.")
    if variant == 'err': banner_html = banner('err', "2 photos couldn't upload. They are safe on this phone.", 'Retry')

    if collapsed:
        hdr = (f'<div class="td-collapsed"><button class="icon-btn ghost" aria-label="Back">{ic("chevron-left", 24, "mirror")}</button><div class="ttl t-callout clamp-1" data-long="{LONG_TITLE}">Portugal Road Trip</div>'
               f'<button class="icon-btn ghost" aria-label="Share">{ic("share")}</button><button class="icon-btn ghost" aria-label="More">{ic("ellipsis")}</button></div>')
        daysc = '<div class="days" role="tablist" aria-label="Days" style="padding-bottom:8px;box-shadow:0 1px 0 var(--hairline);margin-bottom:-8px">' + ''.join(f'<button class="day{" is-on" if d == "D3" else ""}" role="tab"><span class="d">{d}</span><span class="dt">{t}</span></button>' for d, t in [('D1', '12 Oct'), ('D2', '13 Oct'), ('D3', '14 Oct'), ('D4', '15 Oct'), ('D5', '16 Oct'), ('D6', '17 Oct')]) + '</div>'
        inner = (f'<div class="screen" style="background:var(--paper)">{hdr}<div class="td-sheet" style="margin-top:0;border-radius:0;padding-top:106px"><div class="td-scroll" style="padding-top:var(--sp-3)">'
                 f'{daysc}{stops}{add}<div class="priv-line" style="margin-top:8px">{ic("lock")}Expenses and Documents are only visible to you</div></div></div></div>')
        return slot(fid, 'Trip states', 'D2', 'Trip detail · collapsed hero', 'Second hero state after scroll: title fades into a 56 px solid header, day chips stay pinned. The areas strip has scrolled away; stops rise to the top.', inner)

    scroll = f'<div class="td-scroll">{status_row}{banner_html}{areas}{priv}{days}{stops}{add}</div>'
    inner = f'<div class="screen" style="background:var(--paper)">{hero}<div class="td-sheet">{scroll}</div></div>'
    caps = {
        'normal': ('06', 'Trip detail · expanded hero', 'Bottom-anchored title on a deterministic scrim, 28 px sheet, ONE progress row, a compact areas strip (lock chips on private areas), day chips and a solid/dotted spine with dwell + transit info. Inline dashed Add stop; no FAB, no false grabber.'),
        'loading': ('D1', 'Trip · loading', 'Skeleton mirrors hero sheet: status, 4 areas, day chips, 3 stops.'),
        'off': ('D3', 'Trip · offline with waiting changes', 'Global chip + one slim banner. Nothing blocks reading or editing.'),
        'err': ('D4', 'Trip · sync error', 'Photos area gets a danger ring and dot, banner offers Retry. Cover and text stay readable.'),
        'nocover': ('D5', 'Trip · no cover', 'Generated cover: gradient, flag, dashed stamp and a ghost country code. Title scrim is unchanged.'),
        'zero': ('D6', 'Trip · zero stops', 'Ghost dashed stamp + one action. Areas show zeros; days are hidden until a stop exists.'),
    }
    n, t, d = caps[variant]
    return slot(fid, 'Core frames' if variant == 'normal' else 'Trip states', n, t, d, inner, photo_status=cover)

# ----------------------------------------------------------------- WELCOME
def welcome():
    inner = ('<div class="screen" data-globe="welcome"><div class="sky"></div><canvas class="globe" aria-label="A rotating globe with visited countries"></canvas><div class="markers"></div>'
             f'<div class="wordmark">{ic("mark")}TripTrackr</div>'
             '<div class="stamp ink-coral" data-stamp="welcome" style="position:absolute;z-index:6;right:20px;top:128px;width:104px;height:104px;--r:-10deg"></div>'
             '<section class="wl-sheet"><div class="kick t-eyebrow">Your travel passport</div>'
             '<h1 class="t-display">Everywhere<br>you’ve <span class="t-serif">been.</span></h1>'
             '<p class="lede t-body">Trips, photos and notes on one globe, even offline. Expenses stay only yours.</p>'
             '<div class="auth">'
             f'<button class="btn-auth btn-apple"><svg class="ic" style="fill:currentColor;stroke:none"><use href="#i-apple"/></svg>Continue with Apple</button>'
             f'<button class="btn-auth btn-google"><svg class="ic" style="stroke:none"><use href="#i-google"/></svg>Continue with Google</button>'
             f'<button class="btn-auth btn-email">{ic("mail")}Continue with email</button></div>'
             '<p class="legal">By continuing you accept the <u>Terms</u> and <u>Privacy Policy</u>.</p></section></div>')
    return slot('welcome', 'Core frames', '07', 'Welcome', 'Live globe backdrop (idle spin, static under Reduce Motion), 28 px sheet, three equal-weight 52 px buttons that follow the Apple and Google brand rules, one legal line. Android puts Google first and drops Apple.', inner)

# ----------------------------------------------------------------- PROFILE
def profile():
    seg = ('<div class="seg" role="radiogroup" aria-label="Period" data-period-seg><button class="is-on" data-p="all" role="radio" aria-checked="true">All time</button>'
           '<button data-p="2026" role="radio">2026</button><button data-p="2025" role="radio">2025</button></div>')
    stamp = lambda s, ink, name, r, extra='': f'<div class="stamp-cell"><div class="stamp ink-{ink}" data-stamp="{s}" style="--r:{r}deg{extra}"></div><div class="c">{name}</div></div>'
    inner = ('<div class="screen" style="background:var(--paper)"><div class="list" style="padding-top:var(--safe-top);padding-bottom:var(--list-pb);gap:var(--sp-4)">'
             f'<div class="p-head"><div class="avatar" style="width:72px;height:72px;background-image:url({phurl("marta")})" role="img" aria-label="Marta"></div>'
             '<div class="who"><h1 class="t-title clamp-1" data-long="Maria-Magdalena Fernandez-Castellanos">Marta</h1><div class="t-label c2">Traveller since 2021</div></div>'
             f'<button class="icon-btn tonal" aria-label="Share passport">{ic("share-2")}</button><button class="icon-btn tonal" aria-label="Settings">{ic("settings")}</button></div>'
             f'{seg}'
             '<section class="passport" aria-label="Passport, all time"><svg class="wm" viewBox="0 0 200 200" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">' + ''.join(f'<circle cx="100" cy="100" r="{r}"/>' for r in range(16, 100, 10)) + '<path d="M100 4v192M4 100h192" opacity=".6"/></svg>'
             f'<div class="top t-eyebrow">{ic("mark", 20)}<span data-pp-label>Passport · all time</span></div>'
             '<div class="pgrid">'
             '<div><div class="v t-numeral prop"><span data-pp="c">14</span><small data-pp-s="c">/195</small></div><div class="l">Countries</div></div>'
             '<div><div class="v t-numeral prop"><span data-pp="t">22</span></div><div class="l">Trips</div></div>'
             '<div><div class="v t-numeral prop"><span data-pp="d" data-long="1.26M">61,480</span><small>km</small></div><div class="l">Distance</div></div>'
             '<div><div class="v t-numeral prop"><span data-pp="k">4</span><small>/7</small></div><div class="l">Continents</div></div></div>'
             f'<div class="lap">{ic("globe", 20)}<span data-pp-lap>1.5× around the Earth</span></div>'
             '<div class="mrz" aria-hidden="true">P&lt;TRIPTRACKR&lt;&lt;MARTA&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div></section>'
             f'<button class="recap"><div class="ico">{ic("sparkles")}</div><div class="tx"><div class="t-callout clamp-1">Your 2026 in 7 slides</div><div class="t-label c2">See it and share it</div></div>{ic("chevron-right", 20, "chev mirror")}</button>'
             '<section class="visa" aria-label="Stamps"><div class="vh"><h2 class="t-headline">Stamps</h2><span class="t-caption c2">14 of 195</span></div><div class="stamps">'
             + stamp('pt', 'coral', 'Portugal', -7) + stamp('jp', 'navy', 'Japan', 6) + stamp('mx', 'teal', 'Mexico', 9) + stamp('es', 'green', 'Spain', -9) + stamp('it', 'coral', 'Italy', 5)
             + '<div class="stamp-cell"><div class="stamp ghost" data-stamp="ghost" style="--r:-4deg"></div><div class="c">Next: Iceland</div></div></div></section>'
             '</div>' + tabbar('profile') + '</div>')
    return slot('profile', 'Core frames', '08', 'Profile · You', 'Identity, an All time / 2026 / 2025 switch that drives the navy passport card, a recap entry, then a paper “visa page” with seeded-rotation stamps (6 shapes x 4 inks, multiply). Appearance and sync live in Settings.', inner)

# ----------------------------------------------------------------- FORM
def form(keyboard=False):
    fid = 'form-keyboard' if keyboard else 'form'
    bar = (f'<div class="fbar"><div class="grab"></div><button class="cancel">Cancel</button><h2 class="t t-callout">New trip</h2><div class="spacer"></div></div>')
    name = ('<div class="field"><div class="lbl">Trip name</div><div class="input">'
            f'<div class="v" data-long="{LONG_TITLE}">Portugal Road Trip</div></div></div>')
    dest_chips = (f'<div class="dest-chips"><span class="chip">{flag("pt")}Lisbon<span class="x">{ic("x", 16)}</span></span><span class="chip">{flag("pt")}Porto<span class="x">{ic("x", 16)}</span></span></div>')
    if keyboard:
        dest_in = (f'<div class="input is-focus">{ic("search", 20)}<div class="v">Sin<span class="caret"></span></div></div>')
        sugg = ('<div class="sugg" role="listbox" aria-label="Suggestions">'
                f'<button class="it" role="option">{flag("pt", "lg")}<div class="tx"><div class="t-callout"><mark>Sin</mark>tra</div><div class="t-label c2">Lisbon District, Portugal</div></div></button>'
                f'<button class="it" role="option">{flag("pt", "lg")}<div class="tx"><div class="t-callout"><mark>Sin</mark>es</div><div class="t-label c2">Setúbal District, Portugal</div></div></button>'
                f'<button class="it" role="option">{flag("es", "lg")}<div class="tx"><div class="t-callout"><mark>Sin</mark>arcas</div><div class="t-label c2">Valencia, Spain</div></div></button></div>')
        dest = f'<div class="field"><div class="lbl">Where to?<span class="opt">Cities or countries</span></div>{dest_chips}{dest_in}{sugg}</div>'
        body = f'<div class="fbody"><div style="display:flex;flex-direction:column;gap:var(--sp-6);transform:translateY(-112px)">{name}{dest}</div></div>'
        foot_style = 'bottom:291px'
        kbd = ('<div class="kbd" aria-hidden="true">' + ''.join('<div class="kr">' + ''.join(f'<i class="kk">{c}</i>' for c in row) + '</div>' for row in ('qwertyuiop', 'asdfghjkl', 'zxcvbnm')) +
               '<div class="kr"><i class="kk w">123</i><i class="kk sp"></i><i class="kk go">go</i></div></div>')
    else:
        dest = (f'<div class="field"><div class="lbl">Where to?<span class="opt">Cities or countries</span></div>{dest_chips}'
                f'<div class="input">{ic("search", 20)}<div class="v ph-t">Add a city or country</div></div></div>')
        covers = ('<div class="field"><div class="lbl">Cover<span class="opt">Suggested for Portugal</span></div><div class="covers">'
                  f'<div class="cov is-sel" role="radio" aria-checked="true" aria-label="Lisbon tram" style="background-image:url({phurl("tram")})"><span class="ck">{ic("check", 16)}</span></div>'
                  f'<div class="cov" role="radio" aria-label="Sintra" style="background-image:url({phurl("sintra")})"></div>'
                  f'<div class="cov" role="radio" aria-label="Porto" style="background-image:url({phurl("portoBridge")})"></div>'
                  f'<button class="cov add">{ic("image-plus", 24)}<span class="t-caption">Photos</span></button></div></div>')
        dates = ('<div class="field"><div class="lbl">Dates</div><button class="dates-pill" aria-label="12 October to 19 October 2026, 7 nights">'
                 f'<span class="dt">12 Oct</span><i class="dots"></i><span class="nights">7 nights</span><i class="dots"></i><span class="dt">19 Oct 2026</span>{ic("chevron-right", 20, "mirror")}</button></div>')
        cur = ('<div class="field"><div class="lbl">Currency<span class="opt">Default for Portugal</span></div><div class="currency">'
               f'<button class="chip is-selected" role="radio" aria-checked="true">{ic("check", 16)}EUR</button><button class="chip" role="radio">USD</button><button class="chip" role="radio">GBP</button><button class="chip" role="radio">JPY</button>'
               f'<button class="chip sq" role="radio" aria-label="More currencies">{ic("plus", 16)}</button></div>'
               f'<div class="helper">{ic("lock", 16)}Expenses are only visible to you.</div></div>')
        body = f'<div class="fbody">{name}{dest}{covers}{dates}{cur}</div>'
        foot_style = ''
        kbd = ''
    foot = f'<div class="ffoot{" abs" if keyboard else ""}" style="{foot_style}"><button class="btn btn-primary btn-lg btn-block">Save trip</button></div>'
    inner = ('<div class="screen form-wrap"><div class="form-backdrop" data-backdrop="trips"></div><div class="form-scrim"></div>'
             f'<section class="fsheet" aria-label="New trip">{bar}{body}{"" if keyboard else foot}</section>{foot if keyboard else ""}{kbd}</div>')
    if keyboard:
        return slot(fid, 'Core frames', '10', 'Form · keyboard open', 'Destination focused: the form scrolls the field into view, cover and dates drop below the fold, suggestions sit above the keyboard and the Save footer rides the keyboard.', inner)
    return slot(fid, 'Core frames', '09', 'Form · New trip', 'formSheet over the dimmed Trips tab. Destination drives cover (3 suggestions + Pick from photos), currency and the globe. Dates are one pill with a nights tag. Cancel is navy, not coral.', inner)

# ----------------------------------------------------------------- COMPONENTS (QA frame)
def components():
    def h(t): return f'<div class="t-eyebrow c2" style="margin:var(--sp-4) 0 var(--sp-2)">{t}</div>'
    row = lambda x: f'<div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center">{x}</div>'
    inner = ('<div class="screen" style="background:var(--paper)"><div class="list" style="padding:var(--safe-top) var(--sp-5) var(--sp-4);gap:0">'
             '<h1 class="t-title">Components</h1>'
             + h('Buttons') + row(f'<button class="btn btn-primary btn-sm">{ic("plus")}Primary</button><button class="btn btn-primary btn-sm is-pressed">Pressed</button><button class="btn btn-primary btn-sm is-disabled">Disabled</button><button class="btn btn-secondary btn-sm">Secondary</button><button class="btn btn-tonal btn-sm">Tonal</button><button class="btn btn-ghost btn-sm">Ghost</button><button class="btn btn-danger btn-sm">{ic("trash-2")}Delete</button><button class="btn btn-primary btn-sm is-loading"><i class="spin"></i>Saving</button><button class="btn btn-ink btn-sm is-focus">Focus</button>')
             + h('Status · always icon + text') + row(now_pill('Now') + pill('planned', 'calendar', 'Planned') + pill('past', 'circle-check', 'Past') + pill('ok', 'cloud-check', 'Synced') + pill('err', 'alert', 'Needs attention') + pill('private', 'lock', 'Only you') + pill('sync', 'cloud-upload', '3 waiting'))
             + h('Sync chip') + row(sync_chip('queued') + sync_chip('off') + sync_chip('err'))
             + h('Segmented pill') + '<div class="seg"><button class="is-on">All</button><button>Active <span class="n">1</span></button><button>Planned</button><button>Past</button></div>'
             + h('Chips') + row(f'<span class="chip is-selected">{ic("check")}EUR</span><span class="chip">USD</span><span class="chip">{flag("pt")}Lisbon <span class="x">{ic("x", 16)}</span></span><span class="chip dashed">{ic("plus", 16)}Add</span>')
             + h('Fields') + '<div style="display:flex;flex-direction:column;gap:var(--sp-3)"><div class="field"><div class="lbl">Default</div><div class="input"><div class="v ph-t">Placeholder</div></div></div>'
             + '<div class="field"><div class="lbl">Focus</div><div class="input is-focus"><div class="v">Lisbon<span class="caret"></span></div></div></div>'
             + f'<div class="field"><div class="lbl">Error</div><div class="input is-error"><div class="v">12 Oct</div></div><div class="helper" style="color:var(--danger)">{ic("alert", 16)}<span style="color:var(--danger)">Pick an end date after the start.</span></div></div></div>'
             + h('Toast') + f'<div class="toast" style="position:relative;left:0;right:0;bottom:auto"><div class="tx">Trip deleted</div><button class="act">{ic("undo", 20)}Undo</button><i class="bar"></i></div>'
             + '</div></div>')
    return slot('components', 'System', 'S1', 'Components · states', 'Buttons, status pills, sync chips, segmented pill, chips, fields and toast on tokens. Reference for the spec.', inner)

# ----------------------------------------------------------------- assemble
def main():
    frames = [
        home('half'), home('peek'), home('full'), home('empty'),
        trips(), trip_detail(), trip_detail('collapsed'),
        welcome(), profile(), form(), form(keyboard=True),
        home('half', 'loading'), home('half', 'offline'), home('half', 'error'),
        trips('loading'), trips('off'), trips('err'), trips('nocover'), trips('200'), trips('toast'),
        trip_detail('loading'), trip_detail('off'), trip_detail('err'), trip_detail('nocover'), trip_detail('zero'),
        components(),
    ]
    order = ['Core frames', 'Home states', 'Trips states', 'Trip states', 'System']
    frames.sort(key=lambda f: order.index(re.search(r'data-group="([^"]+)"', f).group(1)))
    cur = None
    out = []
    for f in frames:
        g = re.search(r'data-group="([^"]+)"', f).group(1)
        if g != cur:
            if cur is not None: out.append('</main>')
            out.append(f'<div class="group-h">{g}</div><main class="row-frames">')
            cur = g
        out.append(f)
    out.append('</main>')
    # keep group order tidy: Core frames first, then states, then system
    shell = open(os.path.join(ROOT, 'src', 'shell.html'), encoding='utf8').read()
    html = shell.replace('<!--SPRITE-->', sprite()).replace('<!--FRAMES-->', '\n'.join(out))
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf8').write(html)
    print('built index.html', len(html), 'frames', len(frames))
main()
