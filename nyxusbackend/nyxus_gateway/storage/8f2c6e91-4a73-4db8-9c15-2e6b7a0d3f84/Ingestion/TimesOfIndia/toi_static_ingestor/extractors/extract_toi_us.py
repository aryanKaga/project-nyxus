#!/usr/bin/env python3
"""Extract article URLs from the Times of India US homepage."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Tag

BASE_URL = "https://timesofindia.indiatimes.com"
DEFAULT_HTML = Path(__file__).with_name("us_page.html")
MAIN = "_main"

# --------------------------------------------------------------------------
# CONFIG - the site uses hashed CSS class names (e.g. "Jksrs"). If TOI ships a
# new build and sections come out wrong, only this block needs updating.
# --------------------------------------------------------------------------
CFG = {
    "heading_class": "Jksrs",          # <h2 class="Jksrs"> = section heading
    "subheading_wrapper": "E2INX",     # wrapper around a sub-heading (Style, Reviews, ...)
    "infocus_label": "Vl8Qa",          # "in focus:" label
    "footer_root": "footer_wrapper",
    "footer_block": "M3i9N",
    "footer_heading": "_fHcb",
}

# (kind, value, section, subsection) - nearest ancestor wins.
REGION_OVERRIDES = [
    ("class", "social_footer", "Footer", "Social"),
    ("class", "BakGc", "Header", "In the News"),
    ("class", "LpQPa", "Top Stories", "Column 1"),
    ("class", "YymZl", "Top Stories", "Column 2"),
    ("id", "top-bar-container", "Header", "Top bar"),
    ("id", "header-masthead", "Header", "Masthead"),
    ("tag", "nav", "Header", "Navigation"),
    ("class", "header-container", "Header", "Other"),
]

# Two sections are both titled "Videos" - tell them apart by ancestor id.
RENAME_BY_ANCESTOR_ID = {"videos": "Videos (TOI)", "etimesvideos": "Videos (ETimes)"}

# URL fragment -> link type. First match wins.
TYPE_PATTERNS = [
    ("/liveblog/", "liveblog"),
    ("/videoshow/", "video"),
    ("/photostory/", "photostory"),
    ("/movie-review/", "review"),
    ("/ottmoviereview/", "review"),
    ("/amp_articleshow/", "article"),
    ("/articleshow/", "article"),
]
ARTICLE_TYPES = {t for _, t in TYPE_PATTERNS}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def clean(s: str | None) -> str:
    s = re.sub(r"\s+", " ", s or "")
    return re.sub(r"[\u200b\u200c\u200d\ufeff]", "", s).strip()


def has_class(tag: Tag, cls: str) -> bool:
    return cls in (tag.get("class") or [])


def normalize_url(href: str, base: str) -> str | None:
    href = (href or "").strip()
    if not href or href.startswith(("#", "javascript:", "mailto:", "android-app:", "tel:")):
        return None
    p = urlsplit(urljoin(base, href))
    if not p.netloc:
        return None
    scheme = "https" if p.netloc.endswith(("indiatimes.com", "timesofindia.com")) else p.scheme
    return urlunsplit((scheme, p.netloc, p.path, p.query, ""))


def classify(url: str) -> str:
    path = urlsplit(url).path
    for frag, kind in TYPE_PATTERNS:
        if frag in path:
            return kind
    return "other"


def id_from_url(url: str) -> str | None:
    m = re.search(r"(\d{6,})\.cms$", urlsplit(url).path)
    return m.group(1) if m else None


# --------------------------------------------------------------------------
# result container with de-duplication
# --------------------------------------------------------------------------
class Collector:
    def __init__(self, keep_duplicates: bool = False, include_other: bool = False):
        self.urls: list[str] = []
        self._seen: set[str] = set()
        self.keep_duplicates = keep_duplicates
        self.include_other = include_other

    def add(self, section: str, sub: str, rec: dict) -> None:
        if rec["type"] == "other" and not self.include_other:
            return
        key = rec["id"] or rec["url"]
        if key in self._seen and not self.keep_duplicates:
            return
        self._seen.add(key)
        self.urls.append(rec["url"])


# --------------------------------------------------------------------------
# strategy 1: DOM walk
# --------------------------------------------------------------------------
def _footer_region(a: Tag) -> tuple[str, str]:
    block = a.find_parent(class_=CFG["footer_block"])
    if block:
        h = block.find(class_=CFG["footer_heading"])
        if h and clean(h.get_text()):
            return "Footer", clean(h.get_text())
    return "Footer", "Site links"


def _region_for(a: Tag):
    for p in a.parents:
        if not isinstance(p, Tag):
            continue
        for kind, val, sec, sub in REGION_OVERRIDES:
            if (
                (kind == "class" and has_class(p, val))
                or (kind == "id" and p.get("id") == val)
                or (kind == "tag" and p.name == val)
            ):
                return sec, sub
        if has_class(p, CFG["footer_root"]):
            return _footer_region(a)
    return None


def parse_dom(html: str, col: Collector, base_url: str = BASE_URL) -> None:
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:  # lxml missing
        soup = BeautifulSoup(html, "html.parser")
    body = soup.body or soup

    section, sub = "Top Stories", "Right rail"   # context before the first heading

    for el in body.find_all(True):
        # ---- headings update the running context -------------------------
        if el.name in ("h2", "h3"):
            text = clean(el.get_text(" "))
            if not text:
                continue
            if el.name == "h2" and has_class(el, CFG["heading_class"]):
                if el.parent is not None and has_class(el.parent, CFG["subheading_wrapper"]):
                    sub = text
                else:
                    for anc in el.find_parents(id=True):
                        if anc["id"] in RENAME_BY_ANCESTOR_ID:
                            text = RENAME_BY_ANCESTOR_ID[anc["id"]]
                            break
                    section, sub = text, MAIN
            elif el.name == "h3":
                if text.lower().startswith("in focus"):
                    sub = "In focus"
                else:
                    section, sub = text, MAIN
            continue
        if has_class(el, CFG["infocus_label"]):
            sub = "In focus"
            continue

        # ---- links --------------------------------------------------------
        if el.name != "a" or not el.get("href"):
            continue
        url = normalize_url(el["href"], base_url)
        if not url:
            continue

        # the heading's own link is the section URL, not an article
        if el.find_parent(["h2", "h3"]):
            continue

        region = _region_for(el)
        sec, sb = region if region else (section, sub)

        rec = {"url": url, "id": id_from_url(url), "type": classify(url)}
        col.add(sec, sb, rec)


# --------------------------------------------------------------------------
# strategy 2: embedded JSON state (window.App = {...})
# --------------------------------------------------------------------------
def _walk_state(node, section, sub, depth, emit) -> None:
    if isinstance(node, list):
        for x in node:
            _walk_state(x, section, sub, depth, emit)
        return
    if not isinstance(node, dict) or node.get("tn") == "ad":
        return
    if "wu" in node and "hl" in node:
        emit(section, sub, node)
        return
    label = node.get("name") or node.get("label") or node.get("title")
    if isinstance(label, str) and clean(label):
        label = clean(label)
        if depth == 0:
            section, sub = label, MAIN
        else:
            sub = label
    else:
        m = re.fullmatch(r"col_(\d)", str(node.get("tn", "")))
        if m:
            sub = f"Column {m.group(1)}"
    for v in node.values():
        if isinstance(v, (list, dict)):
            _walk_state(v, section, sub, depth + 1, emit)


def parse_state(html: str, col: Collector, base_url: str = BASE_URL) -> None:
    marker = "window.App="
    i = html.find(marker)
    if i < 0:
        return
    try:
        state, _ = json.JSONDecoder().raw_decode(html[i + len(marker):])
    except ValueError:
        return
    st = state.get("state", {}) if isinstance(state, dict) else {}

    def emit(section, sub, node):
        url = normalize_url(node.get("wu", ""), base_url)
        if not url:
            return
        rec = {
            "url": url,
            "id": id_from_url(url),
            "type": classify(url),
        }
        col.add(section or "Unknown", sub, rec)

    for sec in st.get("homepage_us", {}).get("data", {}).get("sections", []) or []:
        _walk_state(sec, None, MAIN, 0, emit)
    footer = st.get("footer_v2", {}).get("data", {})
    for key in ("electionLiveblogsWidget", "lastSectionItems", "sections", "siteLinks"):
        if key in footer:
            _walk_state(footer[key], "Footer", MAIN, 1, emit)


# --------------------------------------------------------------------------
# public API + renderers
# --------------------------------------------------------------------------
def get_article_links(
    html: str,
    source: str = "both",
    include_other: bool = False,
    keep_duplicates: bool = False,
    base_url: str = BASE_URL,
) -> list[str]:
    """Return article URLs, preserving their first-seen order."""
    col = Collector(keep_duplicates=keep_duplicates, include_other=include_other)
    if source in ("dom", "both"):
        parse_dom(html, col, base_url)
    if source in ("state", "both"):
        parse_state(html, col, base_url)
    return col.urls


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract article URLs from the TOI US homepage HTML")
    ap.add_argument(
        "html",
        nargs="?",
        default=str(DEFAULT_HTML),
        help=f"path to saved HTML, or - for stdin (default: {DEFAULT_HTML})",
    )
    ap.add_argument("-o", "--out", help="output file (default: stdout)")
    ap.add_argument("--source", choices=["dom", "state", "both"], default="both")
    ap.add_argument("--all-links", action="store_true", help="include non-article links (nav, sections, ...)")
    ap.add_argument("--keep-duplicates", action="store_true", help="repeat an article in every widget it appears in")
    ap.add_argument("--base-url", default=BASE_URL)
    args = ap.parse_args()

    html = sys.stdin.read() if args.html == "-" else open(args.html, encoding="utf-8", errors="replace").read()
    result = get_article_links(
        html,
        source=args.source,
        include_other=args.all_links,
        keep_duplicates=args.keep_duplicates,
        base_url=args.base_url,
    )
    text = "\n".join(result)
    if text:
        text += "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()