from TimesOfIndia.toi_static_ingestor import TOIStaticIngestor


def main() -> None:
	ingestor = TOIStaticIngestor()
	articles = ingestor.ingest(output_path="static_ouput.json")
	print(f"Saved {len(articles)} parsed articles to static_ouput.json")


if __name__ == "__main__":
	main()