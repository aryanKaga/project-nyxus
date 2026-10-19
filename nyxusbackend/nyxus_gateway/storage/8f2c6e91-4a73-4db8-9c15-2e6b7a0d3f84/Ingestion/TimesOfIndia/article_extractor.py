"""
toi_article.py - one function: URL in, parsed Times of India article out.

    pip install requests beautifulsoup4 lxml

    from toi_article import parse_toi_article
    data = parse_toi_article("https://timesofindia.indiatimes.com/.../articleshow/134964955.cms")

CLI:
    python toi_article.py <url>                      # prints JSON
    python toi_article.py --file page.html --url <u> # parse saved HTML

Returned dict keys (always all present; missing -> None or []):
    url, article_id, title, subtitle, authors, agency, published, modified,
    section, subsection, city, dateline, keywords, extracted_keywords,
    entities, summary, body, paragraphs, images[{url, caption, role}],
    article_type, word_count, language, parse_warnings
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import Counter
from datetime import datetime
from typing import Any, Optional, Union
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

__all__ = ["parse_toi_article", "parse_toi_html"]

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept-Language": "en-IN,en;q=0.9",
}

AGENCIES = {"PTI", "IANS", "ANI", "REUTERS", "AP", "AFP", "BLOOMBERG", "TNN", "AGENCIES",
            "TOI SPORTS DESK", "TOI BUSINESS DESK", "TOI ENTERTAINMENT DESK"}

# SEO filler TOI adds to every article's keyword list
GENERIC_TAGS = {"india", "india news", "india news today", "today news", "google news", "breaking news",
                "latest news", "news", "news today", "top news", "latest news today", "toi", "times of india",
                "news in hindi", "hindi news", "live news"}

BODY_SELECTORS = ["div[data-articlebody]", "div._s30J", "div.js_tbl_article", "div.artText",
                  "div.Normal", "div.article_content", "article"]

NOISE_SELECTORS = ["script", "style", "noscript", "iframe", "figure", "aside", "form", "button", "svg",
                   "[class*=poll], [class*=Poll], [class*=vote], [class*=opinion]",
                   "[class*=ad-], [class*=_ad], [id*=ad_], [class*=related], [class*=promo]",
                   "[class*=social], [class*=share], [class*=also-read], [class*=readmore]",
                   "[class*=trending], [class*=newsletter], [class*=app-download], [class*=follow]"]

# whole-line boilerplate
NOISE_LINE_RE = re.compile(
    r"^(poll|also read|read more|read also|watch|photos?:|follow us|download the (times of india|toi) app|"
    r"get the latest|click here|join our|subscribe|share opinion|trending|disclaimer|"
    r"strongly support|do not support|support|oppose|vote)\b"
    r"|users (already )?(shared opinion|voted)|vote\s*&\s*share|^\d+k?\+? users", re.I)
# widget text glued onto the end of real text -> cut from here on
WIDGET_CUT_RE = re.compile(r"(Poll\s*Vote\s*&\s*Share|Vote\s*&\s*Share your view|Download the TOI app)", re.I)

BLOCK_TAGS = ["p", "div", "section", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "ul", "ol"]


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def _clean(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    text = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()
    return text or None


def _fix_mojibake(s: Optional[str]) -> Optional[str]:
    """Repair UTF-8 that was decoded as cp1252/latin-1 ('âs' -> '’s'). No-op for clean text."""
    if not s or not re.search(r"[âÃÂ][\u0080-\u00ff\u2018-\u203a\u20ac\u0152-\u0178]", s):
        return s
    for enc in ("cp1252", "latin-1"):
        try:
            return s.encode(enc).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return s


def _iso(value: Any) -> Optional[str]:
    s = _clean(value) if isinstance(value, str) else None
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return s


def _as_list(v: Any) -> list:
    return [] if v is None else (v if isinstance(v, list) else [v])


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _meta(soup: BeautifulSoup, *names: str) -> Optional[str]:
    for n in names:
        tag = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if tag and tag.get("content"):
            return _clean(tag["content"])
    return None


# --------------------------------------------------------------------------- #
# metadata: JSON-LD -> meta tags -> URL
# --------------------------------------------------------------------------- #
ARTICLE_TYPES = {"NewsArticle", "Article", "ReportageNewsArticle", "LiveBlogPosting", "BlogPosting",
                 "WebPage", "ImageGallery", "VideoObject"}


def _read_jsonld(soup: BeautifulSoup, out: dict) -> None:
    cands = []
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            try:
                data = json.loads(re.sub(r"[\x00-\x1f]+", " ", raw))
            except json.JSONDecodeError:
                continue
        for d in _walk(data):
            types = {str(t) for t in _as_list(d.get("@type"))}
            if types & ARTICLE_TYPES and (d.get("headline") or d.get("articleBody")):
                cands.append((d, types))
    if not cands:
        return
    d, types = max(cands, key=lambda c: (bool(c[0].get("articleBody")), len(c[0])))

    if "LiveBlogPosting" in types:
        out["article_type"] = "liveblog"
    elif "VideoObject" in types:
        out["article_type"] = "video"
    elif "ImageGallery" in types:
        out["article_type"] = "photostory"

    out["title"] = _clean(d.get("headline") or d.get("name"))
    out["subtitle"] = _clean(d.get("alternativeHeadline"))
    out["summary"] = _clean(d.get("description"))
    out["published"] = _iso(d.get("datePublished"))
    out["modified"] = _iso(d.get("dateModified"))
    out["language"] = d.get("inLanguage")
    for a in _as_list(d.get("author")):
        name = _clean(a.get("name") if isinstance(a, dict) else str(a))
        if name:
            out["authors"].append(name)
    kw = d.get("keywords")
    out["keywords"] = [k.strip() for k in (kw.split(",") if isinstance(kw, str) else _as_list(kw)) if str(k).strip()]
    sec = d.get("articleSection")
    if isinstance(sec, list):
        sec = sec[0] if sec else None
    if sec:
        out["section"] = str(sec).lower()
    for img in _as_list(d.get("image")):
        if isinstance(img, dict) and img.get("url"):
            out["images"].append({"url": img["url"],
                                  "caption": _clean(img.get("caption") or img.get("description")),
                                  "role": "hero"})
        elif isinstance(img, str):
            out["images"].append({"url": img, "caption": None, "role": "hero"})
    if d.get("articleBody"):
        out["_ld_body"] = d["articleBody"]


def _read_meta(soup: BeautifulSoup, out: dict) -> None:
    out["title"] = out["title"] or _meta(soup, "og:title", "twitter:title") or _clean(
        soup.title.string if soup.title else None)
    if out["title"]:
        out["title"] = re.sub(r"\s*[-|]\s*(The )?Times of India.*$", "", out["title"], flags=re.I)
    out["summary"] = out["summary"] or _meta(soup, "og:description", "description", "twitter:description")
    out["published"] = out["published"] or _iso(_meta(soup, "article:published_time", "datePublished"))
    out["modified"] = out["modified"] or _iso(_meta(soup, "article:modified_time", "dateModified"))
    if not out["authors"]:
        a = _meta(soup, "author", "article:author")
        if a:
            out["authors"] = [x.strip() for x in re.split(r",|\band\b|&", a) if x.strip()]
    if not out["keywords"]:
        k = _meta(soup, "keywords", "news_keywords")
        if k:
            out["keywords"] = [x.strip() for x in k.split(",") if x.strip()]
    og = _meta(soup, "og:image", "twitter:image")
    if og:
        out["images"].append({"url": og, "caption": None, "role": "hero"})
    if not out["language"] and soup.html is not None:
        out["language"] = soup.html.get("lang")


def _read_url(url: str, out: dict) -> None:
    out["url"] = url
    m = re.search(r"/(?:articleshow|videoshow|photostory|liveblog)/(\d+)\.cms", url) or re.search(r"[/-](\d{6,})\.cms", url)
    if m:
        out["article_id"] = m.group(1)
    if "liveblog" in url:
        out["article_type"] = "liveblog"
    elif "photostory" in url:
        out["article_type"] = "photostory"
    elif "videoshow" in url:
        out["article_type"] = "video"
    stop = {"articleshow", "videoshow", "photostory", "liveblog", "amp_articleshow"}
    segs = []
    for p in [p for p in urlparse(url).path.split("/") if p]:
        if p in stop or p.endswith(".cms"):
            break
        segs.append(p)
    sec_path = segs[:-1] if len(segs) > 1 else segs[:1]  # last segment is the slug
    if sec_path:
        out["section"] = sec_path[0] if (not out["section"] or out["section"] == "news") else out["section"]
        if len(sec_path) > 1:
            out["subsection"] = sec_path[1]
            if sec_path[0] == "city":
                out["city"] = sec_path[1].replace("-", " ").title()


# --------------------------------------------------------------------------- #
# images
# --------------------------------------------------------------------------- #
LAZY_ATTRS = ("data-src", "data-original", "data-lazy-src", "data-srcset", "data-img", "src")
IMG_SKIP_RE = re.compile(r"(logo|icon|sprite|pixel|spacer|blank|placeholder|avatar|author|favicon|doubleclick|"
                         r"adsystem|googlesyndication|/ads?/|banner|social|whatsapp|facebook|twitter|"
                         r"play[-_]?button|loader|\.svg|\.gif$)", re.I)


def _best_srcset(srcset: str) -> Optional[str]:
    best, best_w = None, -1
    for part in srcset.split(","):
        bits = part.strip().split()
        if bits:
            w = int(bits[1][:-1]) if len(bits) > 1 and bits[1][:-1].isdigit() else 0
            if w >= best_w:
                best, best_w = bits[0], w
    return best


def _img_url(img: Tag, base: str) -> Optional[str]:
    for attr in LAZY_ATTRS:
        v = img.get(attr)
        if v and "srcset" in attr:
            v = _best_srcset(v)
        if v and not v.startswith("data:"):
            return urljoin(base, v.strip())
    if img.get("srcset"):
        v = _best_srcset(img["srcset"])
        return urljoin(base, v) if v else None
    return None


def _image_key(url: str) -> str:
    m = re.search(r"msid-(\d+)", url)  # one photo, many sizes
    return m.group(1) if m else url.split("?")[0]


def _caption_for(img: Tag) -> Optional[str]:
    fig = img.find_parent("figure")
    if fig and fig.find("figcaption"):
        return _fix_mojibake(_clean(fig.find("figcaption").get_text(" ", strip=True)))
    parent = img.parent
    for _ in range(3):
        if parent is None:
            break
        cap = parent.select_one("[class*=caption], [class*=imgcap], [class*=img_cap]")
        if cap:
            return _fix_mojibake(_clean(cap.get_text(" ", strip=True)))
        parent = parent.parent
    return _fix_mojibake(_clean(img.get("alt") or img.get("title")))


def _dom_images(container: Optional[Tag], base: str) -> list[dict]:
    out = []
    for img in (container.find_all("img") if container else []):
        if img.find_parent(class_=re.compile(r"author|related|trending|promo|ad[-_]|widget", re.I)):
            continue
        url = _img_url(img, base)
        if not url or IMG_SKIP_RE.search(url):
            continue
        try:
            w, h = int(img.get("width", 0) or 0), int(img.get("height", 0) or 0)
        except ValueError:
            w = h = 0
        if (w and w < 120) or (h and h < 80):
            continue
        out.append({"url": url, "caption": _caption_for(img), "role": "inline"})
    return out


def _merge_images(*groups: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for g in groups:
        for im in g:
            k = _image_key(im["url"])
            if k not in seen:
                seen[k] = dict(im)
            elif not seen[k].get("caption") and im.get("caption"):
                seen[k]["caption"] = im["caption"]
    return list(seen.values())


# --------------------------------------------------------------------------- #
# body text
# --------------------------------------------------------------------------- #
def _find_container(soup: BeautifulSoup) -> Optional[Tag]:
    for sel in BODY_SELECTORS:
        el = soup.select_one(sel)
        if el and len(el.get_text(strip=True)) > 200:
            return el
    best, best_len = None, 0  # last resort: block with most direct text
    for el in soup.find_all(["div", "section", "article"]):
        n = sum(len(t) for t in el.find_all(string=True, recursive=False))
        if n > best_len:
            best, best_len = el, n
    return best


def _split_glued(line: str) -> str:
    """'rolls.The video' -> 'rolls. The video' (block boundaries lost in the HTML)."""
    return re.sub(r"(?<=[a-z][.!?])(?=[A-Z][a-z]{2})", " ", line)


def _merge_fragments(lines: list[str]) -> list[str]:
    """Re-join lines that were split mid-sentence by inline wrappers."""
    out: list[str] = []
    for ln in lines:
        if out and not re.search(r"[.!?:;\"'\u201d\u2019)]$", out[-1]) and re.match(r"[a-z(\u2018\u201c\"']", ln) \
                and len(out[-1]) > 20:
            out[-1] += " " + ln
        else:
            out.append(ln)
    return out


def _clean_lines(raw_lines: list[str]) -> list[str]:
    lines = []
    for ln in raw_lines:
        ln = _fix_mojibake(_clean(ln) or "")
        if not ln:
            continue
        cut = WIDGET_CUT_RE.search(ln)
        if cut:
            ln = ln[:cut.start()].strip()
        if not ln or NOISE_LINE_RE.search(ln) or len(ln) < 3:
            continue
        lines.append(_split_glued(ln))
    return _merge_fragments(lines)


def _dom_paragraphs(container: Optional[Tag]) -> list[str]:
    if container is None:
        return []
    for sel in NOISE_SELECTORS:
        for n in container.select(sel):
            n.decompose()
    for br in container.find_all("br"):
        br.replace_with("\n")
    for tag in container.find_all(BLOCK_TAGS):  # every block boundary becomes a line break
        tag.insert_before("\n")
        tag.append("\n")
    return _clean_lines(container.get_text().split("\n"))


def _dedupe_paragraphs(paras: list[str]) -> list[str]:
    out: list[str] = []
    for p in paras:
        if any(p == q or (len(p) > 40 and p in q) for q in out):
            continue
        out = [q for q in out if not (len(q) > 40 and q in p)] + [p]
    return out


DATELINE_RE = re.compile(r"(?:(?<=^)|(?<=[.!?\s]))([A-Z][A-Z .,'&/-]{2,30}?)\s*[:\u2013\u2014]\s+(?=[A-Z\"\u201c])")


def _extract_dateline(paras: list[str]) -> tuple[Optional[str], list[str]]:
    """Find 'NEW DELHI:'; if it sits mid-paragraph, start a new paragraph there."""
    for i, p in enumerate(paras[:4]):
        m = DATELINE_RE.search(p)
        if m and len(m.group(1).strip()) >= 3 and not m.group(1).strip().endswith("SIR"):
            before, after = p[:m.start()].strip(), p[m.start():].strip()
            new = paras[:i] + ([before] if before else []) + [after] + paras[i + 1:]
            return m.group(1).strip(" ,"), new
    return None, paras


# --------------------------------------------------------------------------- #
# keywords & entities
# --------------------------------------------------------------------------- #
STOPWORDS = set("""a about above after again against all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he
her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or
other our out over own same she should so some such than that the their theirs them then there these they this those
through to too under until up us very was we were what when where which while who whom why will with would you your
said says say according told added official officials reported report reports one two three four five six seven eight
nine ten new former per cent lakh crore many much may might must however since still among within without including
week month year years day days time first last next monday tuesday wednesday thursday friday saturday sunday january
february march april june july august september october november december share watch poll vote opinion""".split())
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]+")


def extract_keywords(title: Optional[str], paras: list[str], top_n: int = 10) -> list[str]:
    text = ((title or "") + " . ") * 2 + " ".join(paras)
    scores: Counter = Counter()
    for sent in re.split(r"[.!?\n:;,()]+", text):
        toks = [t.lower().strip("'-") for t in _WORD_RE.findall(sent)]
        for i, t in enumerate(toks):
            if t in STOPWORDS or len(t) < 3:
                continue
            scores[t] += 1
            if i + 1 < len(toks) and toks[i + 1] not in STOPWORDS and len(toks[i + 1]) >= 3:
                scores[f"{t} {toks[i + 1]}"] += 1.5
    chosen: list[str] = []
    for k, v in scores.most_common(top_n * 4):
        if v < 3 or (" " not in k and any(k in c.split() for c in chosen)):
            continue
        chosen.append(k)
        if len(chosen) >= top_n:
            break
    return chosen


_ENT_WORD = r"(?:[A-Z][a-zA-Z.'&-]+|[A-Z]{2,})"
_ENTITY_RE = re.compile(rf"\b{_ENT_WORD}(?:\s+(?:of|de|for)\s+(?=[A-Z])|\s+)?(?:{_ENT_WORD}(?:\s+(?:of|de|for)\s+(?=[A-Z])|\s+)?)*")
_NOT_ENTITY = {"The", "A", "An", "On", "In", "At", "As", "But", "And", "Also", "While", "After", "Before", "This",
               "That", "These", "Those", "He", "She", "It", "They", "We", "However", "Meanwhile", "According",
               "Officials", "Police", "Share", "Watch", "Poll", "Vote", "Opinion", "Read", "Get", "Download", "TOI",
               "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January",
               "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"}


def extract_entities(paras: list[str], top_n: int = 12) -> list[str]:
    counts: Counter = Counter()
    mid: set[str] = set()
    for para in paras:
        for sent in re.split(r"(?<=[.!?:])\s+", para):
            for m in _ENTITY_RE.finditer(sent):
                words = m.group(0).strip(" .,'&-").split()
                while words and words[0] in _NOT_ENTITY:
                    words.pop(0)
                if not words:
                    continue
                phrase = re.sub(r"['\u2019]s$", "", " ".join(words))
                if re.search(r"-[a-z]", phrase):  # 'AI-generated'
                    continue
                if phrase.isupper() and (" " in phrase or len(phrase) > 5):
                    phrase = phrase.title()  # NEW DELHI -> New Delhi
                counts[phrase] += 1
                if m.start() > 0:
                    mid.add(phrase)
    out = []
    for phrase, _ in counts.most_common():
        if " " not in phrase and phrase not in mid and not phrase.isupper():
            continue  # capitalised only because it starts a sentence
        if len(phrase) < 3 or phrase.lower() in STOPWORDS:
            continue
        out.append(phrase)
        if len(out) >= top_n:
            break
    return out


def _topic_links(soup: BeautifulSoup) -> list[str]:
    names: list[str] = []
    for block in soup.select("[class*=keyword], [class*=topics], [class*=tags], [class*=Tags]"):
        for a in block.find_all("a", href=True):
            t = _clean(a.get_text(" ", strip=True)) if "/topic/" in a["href"] else None
            if t and t not in names:
                names.append(t)
    return names


# --------------------------------------------------------------------------- #
# public API
# --------------------------------------------------------------------------- #
def parse_toi_html(html: Union[str, bytes], url: str = "") -> dict:
    """Parse already-downloaded TOI HTML. Bytes are decoded as UTF-8."""
    if isinstance(html, bytes):
        html = html.decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "lxml")

    out: dict[str, Any] = {
        "url": url, "article_id": None, "title": None, "subtitle": None, "authors": [], "agency": None,
        "published": None, "modified": None, "section": None, "subsection": None, "city": None,
        "dateline": None, "keywords": [], "extracted_keywords": [], "entities": [], "summary": None,
        "body": "", "paragraphs": [], "images": [], "article_type": "article", "word_count": 0,
        "language": None, "parse_warnings": [],
    }
    _read_jsonld(soup, out)
    _read_meta(soup, out)
    if url:
        _read_url(url, out)

    container = _find_container(soup)
    dom_imgs = _dom_images(container, url)          # before the body pass strips <figure>/<img>
    dom_paras = _dom_paragraphs(container)

    ld_body = out.pop("_ld_body", None)
    ld_paras = _clean_lines(re.split(r"\n+", ld_body)) if ld_body else []
    # prefer whichever source gives more (cleaner, more split) paragraphs, unless it is much shorter
    dl, ll = sum(map(len, dom_paras)), sum(map(len, ld_paras))
    if ld_paras and (not dom_paras or (len(ld_paras) > len(dom_paras) and ll >= 0.6 * dl)):
        paras = ld_paras
    else:
        paras = dom_paras
    paras = _dedupe_paragraphs(paras)
    if not paras:
        out["parse_warnings"].append("no article body found (paywall, live blog, or layout change?)")

    out["dateline"], paras = _extract_dateline(paras)
    if out["dateline"] and not out["city"]:
        out["city"] = out["dateline"].title()

    # text fields: repair encoding, strip dateline prefix from summary
    out["title"] = _fix_mojibake(out["title"])
    out["subtitle"] = _fix_mojibake(out["subtitle"])
    summ = _fix_mojibake(out["summary"])
    if summ:
        summ = re.sub(r"^[A-Z][A-Z .,'&/-]{2,30}:\s*", "", summ)
    if paras and (not summ or not re.search(r"[.!?\"\u201d]$", summ)):   # missing or cut off mid-sentence
        first = next((p for p in paras if len(p) > 60), paras[0])
        first = re.sub(r"^[A-Z][A-Z .,'&/-]{2,30}:\s*", "", first)
        sents = re.split(r"(?<=[.!?])\s+", first)
        summ = " ".join(sents[:2])[:320].rstrip()
    out["summary"] = summ

    # authors vs agency
    keep = []
    for a in out["authors"]:
        a = _fix_mojibake(a)
        if a.upper() in AGENCIES:
            out["agency"] = out["agency"] or a
        else:
            keep.append(a)
    out["authors"] = keep
    if not out["authors"] and not out["agency"]:
        node = soup.select_one("[itemprop=author], [class*=auth_detail], [class*=author]")
        if node:
            name = _clean(re.sub(r"\|.*$", "", node.get_text(" ", strip=True)))
            if name:
                (out.__setitem__("agency", name) if name.upper() in AGENCIES else out["authors"].append(name))

    # keywords
    kws = []
    for k in out["keywords"] + _topic_links(soup):
        k = _fix_mojibake(k)
        if k and k.lower() not in GENERIC_TAGS and k.lower() not in {x.lower() for x in kws}:
            kws.append(k)
    out["keywords"] = kws

    out["paragraphs"] = paras
    out["body"] = "\n\n".join(paras)
    out["word_count"] = len(out["body"].split())
    out["extracted_keywords"] = extract_keywords(out["title"], paras)
    out["entities"] = extract_entities(paras)
    out["images"] = _merge_images(out["images"], dom_imgs)
    for im in out["images"]:
        im["caption"] = _fix_mojibake(im["caption"])

    if not out["title"]:
        out["parse_warnings"].append("title missing")
    if not out["published"]:
        out["parse_warnings"].append("publish date missing")
    return out


def parse_toi_article(url: str, timeout: int = 20, retries: int = 3) -> dict:
    """Fetch a Times of India article URL and return the parsed article as a dict."""
    if "indiatimes.com" not in urlparse(url).netloc:
        raise ValueError(f"Not a Times of India / indiatimes.com URL: {url}")
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=timeout)
            resp.raise_for_status()
            return parse_toi_html(resp.content, url=resp.url)   # raw bytes -> decoded as UTF-8 (no mojibake)
        except requests.RequestException as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Could not fetch {url}: {last_err}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--file":
        u = sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else ""
        with open(sys.argv[2], "rb") as f:
            result = parse_toi_html(f.read(), url=u)
    elif len(sys.argv) == 2:
        result = parse_toi_article(sys.argv[1])
    else:
        print(__doc__)
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))