
from abc import ABC, abstractmethod
from typing import List

class Stalker(ABC):
    """This agent keeps an eye on what's happening in the
    world that might actually matter to the user."""

    def __init__(self, llm: LLM, profile: Profile) -> None:
        if not profile:
            raise ValueError("User profile cannot be empty")

        self.llm = llm
        self.profile = profile

    @abstractmethod
    def generate_news_queries(self,profile:json)->List[str]:
        "the implementation will take profile and return generatead queries for searching the news"


    @abstractmethod
    def collect_data(queries:List[str])->List[str]:
        """
        this implemented to generate evidence and data from given set of queries
        """

