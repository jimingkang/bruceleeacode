import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from AutoManimConverter import AutoManimConverter


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip()).strip("-").lower()
    return slug or "animation"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--leetcode-id", required=True)
    parser.add_argument("--title-slug", default="")
    parser.add_argument("--function-name", default="solution")
    options = parser.parse_args()

    payload = json.load(sys.stdin)
    js_code = str(payload.get("jsCode", ""))
    args = payload.get("args", [])

    if not js_code.strip():
        raise ValueError("jsCode is required.")

    if not isinstance(args, list):
        raise ValueError("args must be a JSON array.")

    converter = AutoManimConverter(js_code, options.function_name, args, leetcode_id=options.leetcode_id)
    output_name = f"{safe_slug(options.leetcode_id)}_{safe_slug(options.title_slug or options.function_name)}_interactive"
    viewer = converter.generate_interactive_viewer(output_name)
    print(json.dumps({"htmlPath": str(viewer)}))


if __name__ == "__main__":
    main()
