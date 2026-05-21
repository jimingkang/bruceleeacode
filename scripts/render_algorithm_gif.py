import json
import os
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 960
HEIGHT = 540
BACKGROUND = (17, 24, 39)
TEXT = (248, 250, 252)
CELL = (37, 99, 235)
PIVOT = (245, 158, 11)
SORTED = (22, 163, 74)


def load_data():
    raw = os.environ.get("ALGORITHM_VISUALIZATION_DATA", "[]")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("ALGORITHM_VISUALIZATION_DATA must be a JSON array.")
    return data


def text_size(draw, text, font):
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def draw_frame(values, title, highlights=None):
    highlights = highlights or {}
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.load_default(size=32)
    value_font = ImageFont.load_default(size=24)

    title_width, title_height = text_size(draw, title, title_font)
    draw.text(((WIDTH - title_width) / 2, 56), title, fill=TEXT, font=title_font)

    if not values:
        empty = "[]"
        empty_width, _ = text_size(draw, empty, value_font)
        draw.text(((WIDTH - empty_width) / 2, 180), empty, fill=TEXT, font=value_font)
        return image

    count = len(values)
    gap = 12
    max_cell_width = 92
    cell_width = min(max_cell_width, max(44, (WIDTH - 160 - gap * (count - 1)) // count))
    cell_height = 76
    total_width = count * cell_width + (count - 1) * gap
    start_x = (WIDTH - total_width) / 2
    y = 215

    for index, value in enumerate(values):
        x = start_x + index * (cell_width + gap)
        color = highlights.get(index, CELL)
        draw.rounded_rectangle((x, y, x + cell_width, y + cell_height), radius=8, outline=color, width=4)
        label = str(value)
        label_width, label_height = text_size(draw, label, value_font)
        draw.text((x + (cell_width - label_width) / 2, y + (cell_height - label_height) / 2), label, fill=TEXT, font=value_font)

    return image


def quick_sort_snapshots(values):
    working = list(values)
    snapshots = []

    def partition(left, right):
        pivot = working[right]
        store = left
        for cursor in range(left, right):
            if working[cursor] <= pivot:
                working[store], working[cursor] = working[cursor], working[store]
                snapshots.append((right, list(working)))
                store += 1
        working[store], working[right] = working[right], working[store]
        snapshots.append((store, list(working)))
        return store

    def sort(left, right):
        if left >= right:
            return
        pivot_index = partition(left, right)
        sort(left, pivot_index - 1)
        sort(pivot_index + 1, right)

    sort(0, len(working) - 1)
    return snapshots


def build_frames(values, class_name):
    if class_name == "QuickSortVisualization" and all(isinstance(value, (int, float)) for value in values):
        frames = [draw_frame(values, "Quick Sort Visualization")]
        for pivot_index, snapshot in quick_sort_snapshots(values):
            frames.append(draw_frame(snapshot, "Quick Sort Visualization", {pivot_index: PIVOT}))
        sorted_values = sorted(values)
        frames.append(draw_frame(sorted_values, "Quick Sort Visualization", {index: SORTED for index in range(len(values))}))
        return frames

    return [draw_frame(values, class_name)]


def main():
    class_name = sys.argv[1] if len(sys.argv) > 1 else "ArrayVisualization"
    values = load_data()
    frames = build_frames(values, class_name)
    output_dir = Path("media/algorithm-gifs")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{class_name}-{int(time.time() * 1000)}.gif"
    frames[0].save(output_path, save_all=True, append_images=frames[1:], duration=650, loop=0)
    print(output_path)


if __name__ == "__main__":
    main()
