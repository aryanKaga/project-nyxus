from pydantic import BaseModel, Field
from typing import Dict


class User(BaseModel):
    api_key: str
    file_structure: Dict[str, str] = Field(default_factory=dict)






