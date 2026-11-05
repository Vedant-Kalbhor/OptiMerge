from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class OCRTableResult:
    source_name: str
    development_length: float
    points: List[Tuple[str, float, float, float]]

    @property
    def number_of_bends(self) -> int:
        return max(0, len(self.points) - 2)
