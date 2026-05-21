import json
import os

from manim import BLUE, DOWN, GREEN, ORANGE, UP, WHITE, Write, Scene, Square, Text, VGroup


def load_custom_data():
    raw = os.environ.get("ALGORITHM_VISUALIZATION_DATA", "[]")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid ALGORITHM_VISUALIZATION_DATA JSON: {exc}") from exc

    if not isinstance(data, list):
        raise ValueError("ALGORITHM_VISUALIZATION_DATA must be a JSON array.")

    return data


class ArrayVisualization(Scene):
    def construct(self):
        values = load_custom_data()
        self.render_array(values, title="Array Visualization")

    def render_array(self, values, title="Array Visualization", highlights=None):
        highlights = highlights or {}
        title_text = Text(title, font_size=34).to_edge(UP)
        cells = VGroup()

        for index, value in enumerate(values):
            color = highlights.get(index, BLUE)
            box = Square(side_length=0.8, color=color)
            label = Text(str(value), font_size=28, color=WHITE).move_to(box.get_center())
            cell = VGroup(box, label)
            cells.add(cell)

        if len(cells) > 0:
            cells.arrange(buff=0.18).next_to(title_text, DOWN, buff=0.75)
            cells.scale_to_fit_width(min(12.5, max(1.0, cells.width)))
            self.play(Write(title_text), Write(cells))
        else:
            empty = Text("[]", font_size=34).next_to(title_text, DOWN, buff=0.75)
            self.play(Write(title_text), Write(empty))

        self.wait(0.5)


class QuickSortVisualization(ArrayVisualization):
    def construct(self):
        values = load_custom_data()
        if len(values) == 0:
            self.render_array(values, title="Quick Sort Visualization")
            return

        if not all(isinstance(value, (int, float)) for value in values):
            self.render_array(values, title="Quick Sort Input")
            return

        working = list(values)
        title_text = Text("Quick Sort Visualization", font_size=34).to_edge(UP)
        cells = self.create_cells(working)
        cells.next_to(title_text, DOWN, buff=0.75)
        self.play(Write(title_text), Write(cells))
        self.wait(0.2)

        for pivot_index, snapshot in self.quick_sort_snapshots(working):
            next_cells = self.create_cells(
                snapshot,
                {pivot_index: ORANGE, **{index: GREEN for index in range(len(snapshot)) if snapshot[index] == sorted(values)[index]}},
            )
            next_cells.next_to(title_text, DOWN, buff=0.75)
            self.play(cells.animate.become(next_cells), run_time=0.45)

        final_cells = self.create_cells(sorted(values), {index: GREEN for index in range(len(values))})
        final_cells.next_to(title_text, DOWN, buff=0.75)
        self.play(cells.animate.become(final_cells), run_time=0.45)
        self.wait(0.5)

    def create_cells(self, values, highlights=None):
        highlights = highlights or {}
        cells = VGroup()
        for index, value in enumerate(values):
            box = Square(side_length=0.8, color=highlights.get(index, BLUE))
            label = Text(str(value), font_size=28, color=WHITE).move_to(box.get_center())
            cells.add(VGroup(box, label))

        if len(cells) > 0:
            cells.arrange(buff=0.18)
            cells.scale_to_fit_width(min(12.5, max(1.0, cells.width)))
        return cells

    def quick_sort_snapshots(self, values):
        snapshots = []

        def partition(left, right):
            pivot = values[right]
            store = left
            for cursor in range(left, right):
                if values[cursor] <= pivot:
                    values[store], values[cursor] = values[cursor], values[store]
                    snapshots.append((right, list(values)))
                    store += 1
            values[store], values[right] = values[right], values[store]
            snapshots.append((store, list(values)))
            return store

        def sort(left, right):
            if left >= right:
                return
            pivot_index = partition(left, right)
            sort(left, pivot_index - 1)
            sort(pivot_index + 1, right)

        sort(0, len(values) - 1)
        return snapshots
