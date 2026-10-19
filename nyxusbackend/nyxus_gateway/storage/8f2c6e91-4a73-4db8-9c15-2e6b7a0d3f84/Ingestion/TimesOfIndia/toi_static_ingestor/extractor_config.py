"this files contains the relvant source page to all the news urls present in it"
from .extractors.extract_toi_us import get_article_links as extract_toi_us


EXTRACTOR_CONFIG = {
    "https://timesofindia.indiatimes.com/us": extract_toi_us,
}