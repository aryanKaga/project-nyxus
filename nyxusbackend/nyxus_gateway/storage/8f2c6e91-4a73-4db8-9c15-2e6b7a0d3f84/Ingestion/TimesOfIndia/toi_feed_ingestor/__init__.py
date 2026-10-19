from ..article_extractor import parse_toi_article, parse_toi_html

__all__ = ["TOIFeedIngestor", "parse_toi_article", "parse_toi_html"]


def __getattr__(name: str):
	if name == "TOIFeedIngestor":
		from .toi_feed_ingestor import TOIFeedIngestor

		return TOIFeedIngestor
	raise AttributeError(f"module {__name__!r} has no attribute {name!r}")