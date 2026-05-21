#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

python3 -m venv .venv

python_version="$(
  .venv/bin/python - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"

if [[ "$python_version" == "3.14" ]]; then
  .venv/bin/python -m pip install "av>=16.0.0"
  .venv/bin/python -m pip install \
    "Pillow>=9.1" \
    "Pygments>=2.0.0" \
    "audioop-lts>=0.2.0" \
    "beautifulsoup4>=4.12" \
    "click>=8.0" \
    "cloup>=2.0.0" \
    "decorator>=4.3.2" \
    "isosurfaces>=0.1.0" \
    "manimpango>=0.5.0,<1.0.0" \
    "mapbox-earcut>=1.0.0" \
    "moderngl>=5.0.0,<6.0.0" \
    "moderngl-window>=2.0.0" \
    "networkx>=2.6" \
    "numpy>=2.1" \
    "pycairo>=1.13,<2.0.0" \
    "pydub>=0.20.0" \
    "rich>=12.0.0" \
    "scipy>=1.14.0" \
    "screeninfo>=0.7" \
    "skia-pathops>=0.7.0" \
    "srt>=3.0.0" \
    "svgelements>=1.8.0" \
    "tqdm>=4.0.0" \
    "typing-extensions>=4.0.0" \
    "watchdog>=2.0.0"
  .venv/bin/python -m pip install --no-deps manim==0.19.0
else
  .venv/bin/python -m pip install -r requirements.txt
fi
