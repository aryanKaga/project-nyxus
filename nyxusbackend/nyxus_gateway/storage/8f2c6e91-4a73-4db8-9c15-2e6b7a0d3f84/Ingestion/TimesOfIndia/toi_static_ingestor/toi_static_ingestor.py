"""TOI-specific entry point for configured static-page ingestion."""

from urllib.parse import urlsplit

import requests

from static_ingestor import NewsData, StaticIngestor
from ..article_extractor import parse_toi_article
from .extractor_config import EXTRACTOR_CONFIG


class TOIStaticIngestor(StaticIngestor):
    """Ingest article URLs using the Times of India extractor configuration."""

    def __init__(self, config=None, timeout: int = 20):
        super().__init__(EXTRACTOR_CONFIG if config is None else config)
        self.timeout = timeout

    def _extract_urls(self) -> list[str]:
        urls = []
        print('extracting urls')
        cnt  = 0
        for page_url, extractor in self.config.items():
            response = requests.get(page_url, timeout=self.timeout)
            response.raise_for_status()
            html = response.content.decode("utf-8", errors="replace")
            urls.extend(extractor(html, base_url=page_url))
            
      
        return urls

    @staticmethod
    def _is_toi_url(url: str) -> bool:
        hostname = urlsplit(url).hostname or ""
        return any(
            hostname == domain or hostname.endswith(f".{domain}")
            for domain in ("indiatimes.com", "timesofindia.com")
        )

    def _scrape_news_data(self, urls: list[str]) -> list[NewsData]:
        articles = []
        seen = set()
        for url in urls:
            if not self._is_toi_url(url) or url in seen:
                continue
            article = parse_toi_article(url, timeout=self.timeout)
            articles.append(
                NewsData(
                    news_source="Times of India",
                    news_url=url,
                    news_title=article.get("title") or "",
                    article_data=article,
                )
            )
            seen.add(url)
        return articles

    @staticmethod
    def _clean_news_data(raw_news_data: list[NewsData]) -> list[dict]:
        return [
            item.article_data
            for item in raw_news_data
            if item.article_data is not None
        ]
    