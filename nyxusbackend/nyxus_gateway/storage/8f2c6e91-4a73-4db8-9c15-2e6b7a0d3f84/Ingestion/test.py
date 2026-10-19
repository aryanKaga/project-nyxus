
import json
import random

from TimesOfIndia.toi_feed_ingestor import TOIFeedIngestor


def main() -> None:
    ingestor = TOIFeedIngestor()

    data = ingestor.ingest()

    with open("data.json", "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)


if __name__ == "__main__":
    main()
