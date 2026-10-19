from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class NewsData:
    news_source: str
    news_url: str
    news_title: str


class FeedIngestor(ABC):
    def __init__(self, rss_url: str):
        self.rss_url = rss_url

    @abstractmethod
    def _extract_feed(self) -> str:
        """Return the selected RSS feed URL."""
        raise NotImplementedError

    @abstractmethod
    def _fetch_news_rss_feed(self, feed_url: str) -> bytes:
        """Fetch the RSS feed response."""
        raise NotImplementedError

    @abstractmethod
    def _scrape_news_data(self, news_rss_feed: bytes) -> list[NewsData]:
        """Extract article metadata from an RSS feed response."""
        raise NotImplementedError

    @abstractmethod
    def _clean_news_data(self, raw_news_data: list[NewsData]) -> list[dict]:
        """Convert extracted feed entries into clean structured article data."""
        raise NotImplementedError

    def ingest(self) -> list[dict]:
        """Run the feed extraction, fetch, scrape, and article parsing pipeline."""
        feed_url = self._extract_feed()
        rss_content = self._fetch_news_rss_feed(feed_url)
        raw_news_data = self._scrape_news_data(rss_content)
        return self._clean_news_data(raw_news_data)