import json
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


@pytest.fixture(scope="session")
def fixture_doc():
    with open(os.path.join(os.path.dirname(__file__), "fixtures", "articles.json"), encoding="utf-8") as fh:
        return json.load(fh)
