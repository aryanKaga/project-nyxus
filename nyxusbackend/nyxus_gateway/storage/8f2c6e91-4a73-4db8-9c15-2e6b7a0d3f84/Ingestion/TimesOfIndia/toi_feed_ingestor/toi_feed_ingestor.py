"""Load TOI RSS feeds and return parsed article data."""

from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests

from feed_ingestor import FeedIngestor, NewsData
from ..article_extractor import parse_toi_article


DEFAULT_CONFIG = Path(__file__).with_name("rss_feed.json")


class TOIFeedIngestor(FeedIngestor):
    def __init__(self, config_path: Path | str = DEFAULT_CONFIG, timeout: int = 20):
        self.config_path = Path(config_path)
        self.timeout = timeout
        with self.config_path.open(encoding="utf-8") as config_file:
            self.config = json.load(config_file)
        self.feeds = self._extract_feeds(self.config)
        super().__init__(next(iter(self.feeds.values())))

    @staticmethod
    def _extract_feeds(config: dict) -> dict[str, str]:
        """Flatten configured feed URLs into group.key entries."""
        feeds = {}
        for group, entries in config.items():
            if not isinstance(entries, dict):
                continue
            for key, url in entries.items():
                if isinstance(url, str) and urlparse(url).scheme in {"http", "https"}:
                    feeds[f"{group}.{key}"] = url
        if not feeds:
            raise ValueError("The config file contains no feed URLs")
        return feeds

    def _extract_feed(self) -> str:
        return self.rss_url

    def _fetch_news_rss_feed(self, feed_url: str) -> bytes:
        response = requests.get(feed_url, timeout=self.timeout)
        response.raise_for_status()
        return response.content

    def _scrape_news_data(self, news_rss_feed: bytes) -> list[NewsData]:
        root = ET.fromstring(news_rss_feed)
        source = self.config.get("source", "Times of India")
        entries = []
        seen_urls = set()
        for item in root.iter():
            if item.tag.rsplit("}", 1)[-1].lower() not in {"item", "entry"}:
                continue
            article_url = None
            title = ""
            for element in item.iter():
                tag_name = element.tag.rsplit("}", 1)[-1].lower()
                if tag_name == "link" and article_url is None:
                    article_url = element.get("href") or (element.text or "").strip()
                elif tag_name == "title":
                    title = (element.text or "").strip()
            if article_url and urlparse(article_url).scheme in {"http", "https"} and article_url not in seen_urls:
                entries.append(NewsData(source, article_url, title))
                seen_urls.add(article_url)
        return entries

    def _clean_news_data(self, raw_news_data: list[NewsData]) -> list[dict]:
        return [
            parse_toi_article(entry.news_url, timeout=self.timeout)
            for entry in raw_news_data
        ]

    def _feed_keys(self, requested: Optional[list[str]]) -> list[str]:
        if not requested:
            return list(self.feeds)

        selected = []
        for requested_key in requested:
            matches = [key for key in self.feeds if key == requested_key or key.rsplit(".", 1)[-1] == requested_key]
            if not matches:
                raise KeyError(f"Unknown TOI feed key: {requested_key}")
            if len(matches) > 1:
                raise ValueError(f"Ambiguous feed key {requested_key!r}; use one of: {', '.join(matches)}")
            if matches[0] not in selected:
                selected.append(matches[0])
        return list(selected)
        
    def ingest(self, feed_keys: Optional[list[str]] = None) -> dict[str, list[dict]]:
        """Return extracted article collections keyed by config group and feed key."""
        results = {}
        for feed_key in self._feed_keys(feed_keys):
            self.rss_url = self.feeds[feed_key]
            results[feed_key] = super().ingest()
        return results


def main() -> None:
    argument_parser = argparse.ArgumentParser(description=__doc__)
    argument_parser.add_argument(
        "feed_keys",
        nargs="*",
        help="Optional feed keys, such as main.top_stories or top_stories",
    )
    argument_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    arguments = argument_parser.parse_args()

    ingestor = TOIFeedIngestor(arguments.config)
    results = ingestor.ingest(arguments.feed_keys or None)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


