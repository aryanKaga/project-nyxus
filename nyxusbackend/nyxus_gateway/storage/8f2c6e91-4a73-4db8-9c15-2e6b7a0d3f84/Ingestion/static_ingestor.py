
from abc import ABC, abstractmethod
from dataclasses import dataclass
import json
from pathlib import Path


@dataclass
class NewsData:
    news_source: str
    news_url: str
    news_title: str
    article_data: dict | None = None


class StaticIngestor(ABC):
    "the config has something like domain_url-->extractor of article references mapping, the extractor will extract all the domain urls from the domain page"
    def __init__(self, config):
        self.config = config
        if self.config == None:
            raise ValueError("configuration for static ingestor required")



    @abstractmethod
    def _extract_urls(self) -> list[str]:
        """Return all the links news articles there in a page. this can be extracted via self.config[domain_url]"""
        raise NotImplementedError


    @abstractmethod
    def _scrape_news_data(self, urls: list[str]) -> list[NewsData]:
        """For each url extracted from different domains, scrap the news data"""
        raise NotImplementedError

    @abstractmethod
    def _clean_news_data(self, raw_news_data: list[NewsData]) -> list[dict]:
        """Convert extracted feed entries into clean structured article data."""
        raise NotImplementedError

    def ingest(self, output_path: str | Path | None = None) -> list[dict]:
        """Extract URLs, parse their articles, and return the parsed records."""
        urls = self._extract_urls()
        raw_news_data = self._scrape_news_data(urls)
        results = self._clean_news_data(raw_news_data)
        if output_path is not None:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with output_file.open("w", encoding="utf-8") as file:
                json.dump(results, file, ensure_ascii=False, indent=2)
                file.write("\n")
        return results