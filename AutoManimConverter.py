# auto_manim_generator.py
from manim import *
from pathlib import Path
import json
import subprocess
from typing import Any, Dict, List

class AutoManimConverter:
    def __init__(self, js_code: str, function_name: str, args: list):
        self.js_code = js_code
        self.function_name = function_name
        self.args = args
        self.call_args = self._normalize_call_args(args)
        self.visual_choices = self._extract_visual_choices(self.call_args)
        self.trace = self._get_execution_trace()
        self.animation_steps = self._convert_trace_to_steps()

    def _normalize_call_args(self, args: list) -> list:
        if isinstance(args, tuple):
            return list(args)
        if not isinstance(args, list):
            return [args]
        if len(args) == 0:
            return []
        if len(args) == 1:
            return args
        if any(isinstance(arg, (list, dict)) for arg in args):
            return args
        return [args]

    def _extract_visual_choices(self, call_args: list) -> list:
        for arg in call_args:
            if isinstance(arg, list):
                return arg
        return call_args

    def _get_execution_trace(self) -> Dict:
        """Execute JS and capture execution trace"""

        instrumented_js_code = self._instrument_js_arrays(self.js_code)
        tracer_code = f"""
        // Enhanced tracer for algorithm visualization
        const executionTrace = [];
        let stepCounter = 0;
        const trackedArrays = new WeakMap();

        function cloneValue(value) {{
            return JSON.parse(JSON.stringify(value));
        }}

        function makeTrackedArray(name) {{
            const array = [];
            trackedArrays.set(array, name);
            return array;
        }}
        
        // Hook into array operations
        const originalPush = Array.prototype.push;
        Array.prototype.push = function(...items) {{
            const arrayName = trackedArrays.get(this) || 'array';
            const before = cloneValue(this);
            const result = originalPush.apply(this, items);
            const after = cloneValue(this);
            originalPush.call(executionTrace, {{
                step: stepCounter++,
                type: 'array_push',
                arrayName,
                before,
                after,
                items: cloneValue(items),
                stackTrace: new Error().stack
            }});
            return result;
        }};

        const originalPop = Array.prototype.pop;
        Array.prototype.pop = function() {{
            const arrayName = trackedArrays.get(this) || 'array';
            const before = cloneValue(this);
            const item = originalPop.apply(this);
            const after = cloneValue(this);
            originalPush.call(executionTrace, {{
                step: stepCounter++,
                type: 'array_pop',
                arrayName,
                before,
                after,
                item: cloneValue(item),
                stackTrace: new Error().stack
            }});
            return item;
        }};
        
        // Your algorithm
        {instrumented_js_code}
        
        // Hook into the backtrack function
        const originalFunction = {self.function_name};
        let recursionDepth = 0;
        
        function tracedFunction(...args) {{
            const entryStep = stepCounter++;
            originalPush.call(executionTrace, {{
                step: entryStep,
                type: 'function_entry',
                name: '{self.function_name}',
                args: JSON.parse(JSON.stringify(args)),
                depth: recursionDepth,
                state: this.getState ? this.getState() : null
            }});
            
            recursionDepth++;
            const result = originalFunction.apply(this, args);
            recursionDepth--;
            
            originalPush.call(executionTrace, {{
                step: stepCounter++,
                type: 'function_exit',
                name: '{self.function_name}',
                result: result,
                depth: recursionDepth
            }});
            
            return result;
        }}
        
        // Replace with traced version
        {self.function_name} = tracedFunction;
        
        // Execute and capture everything
        const callArgs = {json.dumps(self.call_args)};
        const finalResult = {self.function_name}(...callArgs);
        console.log(JSON.stringify({{
            trace: executionTrace,
            result: finalResult,
            totalSteps: stepCounter
        }}));
        """

        result = subprocess.run(
            ['node', '-e', tracer_code],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.stdout:
            return json.loads(result.stdout)
        if result.stderr:
            raise RuntimeError(result.stderr)
        return {"trace": [], "result": None}

    def _instrument_js_arrays(self, js_code: str) -> str:
        """Replace common subset/result arrays with named tracked arrays."""

        replacements = {
            "subset": "makeTrackedArray('subset')",
            "path": "makeTrackedArray('subset')",
            "current": "makeTrackedArray('subset')",
            "res": "makeTrackedArray('result')",
            "result": "makeTrackedArray('result')",
            "results": "makeTrackedArray('result')",
            "ans": "makeTrackedArray('result')",
        }

        instrumented = js_code
        for name, factory in replacements.items():
            for keyword in ("const", "let", "var"):
                instrumented = instrumented.replace(f"{keyword} {name} = []", f"{keyword} {name} = {factory}")
                instrumented = instrumented.replace(f"{keyword} {name}=[]", f"{keyword} {name}={factory}")

        return instrumented

    def _convert_trace_to_steps(self) -> List[Dict]:
        """Convert JS execution trace to animation steps"""

        steps = []
        current_state = {
            "subset": [],
            "result": [],
            "index": 0,
            "call_stack": [],
            "decision_tree": []
        }

        for trace_item in self.trace.get("trace", []):
            if trace_item["type"] == "array_push":
                array_name = self._classify_array_event(trace_item)
                if array_name == "subset":
                    current_state["subset"] = trace_item["after"]
                    item = trace_item["items"][0] if trace_item.get("items") else None
                    current_state["decision_tree"].append({
                        "label": f"add {item}",
                        "subset": trace_item["after"],
                        "depth": len(trace_item["after"]),
                        "kind": "add"
                    })
                    steps.append({
                        "action": f"Add {item} to subset",
                        "state": self._copy_state(current_state)
                    })
                elif array_name == "result":
                    saved = trace_item["items"][0] if trace_item.get("items") else trace_item["after"][-1]
                    current_state["result"] = trace_item["after"]
                    current_state["decision_tree"].append({
                        "label": f"save {saved}",
                        "subset": saved,
                        "depth": len(saved) + 1 if isinstance(saved, list) else 1,
                        "kind": "save"
                    })
                    steps.append({
                        "action": f"Save subset {saved}",
                        "state": self._copy_state(current_state)
                    })
                else:
                    steps.append({
                        "action": f"Push {trace_item['items']}",
                        "state": self._copy_state(current_state)
                    })

            elif trace_item["type"] == "array_pop":
                array_name = self._classify_array_event(trace_item)
                if array_name == "subset":
                    item = trace_item.get("item")
                    current_state["subset"] = trace_item["after"]
                    current_state["decision_tree"].append({
                        "label": f"remove {item}",
                        "subset": trace_item["after"],
                        "depth": len(trace_item["before"]),
                        "kind": "remove"
                    })
                    steps.append({
                        "action": f"Remove {item} from subset",
                        "state": self._copy_state(current_state)
                    })
                else:
                    steps.append({
                        "action": f"Pop {trace_item.get('item')}",
                        "state": self._copy_state(current_state)
                    })

            elif trace_item["type"] == "function_entry":
                steps.append({
                    "action": f"Call {trace_item['name']} with {trace_item['args']}",
                    "state": self._copy_state(current_state),
                    "depth": trace_item["depth"]
                })

            elif trace_item["type"] == "function_exit":
                steps.append({
                    "action": f"Return from {trace_item['name']}",
                    "state": self._copy_state(current_state)
                })

        return steps

    def _copy_state(self, state: Dict) -> Dict:
        return json.loads(json.dumps(state))

    def _classify_array_event(self, trace_item: Dict) -> str:
        array_name = trace_item.get("arrayName")
        if array_name != "array":
            return array_name

        before = trace_item.get("before", [])
        after = trace_item.get("after", [])
        item = trace_item.get("item")
        items = trace_item.get("items", [])
        changed_items = items if trace_item.get("type") == "array_push" else [item]
        input_size = len(self.visual_choices) if isinstance(self.visual_choices, list) else 0

        if (
            isinstance(before, list)
            and isinstance(after, list)
            and len(before) <= input_size
            and len(after) <= input_size
            and all(not isinstance(value, list) and not isinstance(value, dict) for value in changed_items)
        ):
            return "subset"

        return array_name

    def generate_interactive_viewer(self, output_file="algorithm_animation") -> Path:
        """Generate an HTML viewer with manual next-step controls."""

        output_dir = Path("media/interactive")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{output_file}.html"
        payload = {
            "functionName": self.function_name,
            "args": self.args,
            "callArgs": self.call_args,
            "choices": self.visual_choices,
            "steps": self.animation_steps,
            "result": self.trace.get("result", []),
        }

        output_path.write_text(
            f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{self.function_name} visualization</title>
  <style>
    :root {{
      color: #17212f;
      background: #f8fafc;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; }}
    .shell {{
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 12px;
      min-height: 100vh;
      padding: 16px;
    }}
    .topbar {{
      display: grid;
      grid-template-columns: minmax(180px, auto) minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }}
    h1 {{ margin: 0; color: #2563eb; font-size: 24px; }}
    .step-box, .result-box, .state-panel, .tree-panel {{
      border: 1px solid #c8d2df;
      border-radius: 8px;
      background: #ffffff;
    }}
    .step-box {{
      min-height: 54px;
      padding: 10px 14px;
      color: #17212f;
      font-weight: 750;
    }}
    .controls {{ display: flex; gap: 8px; align-items: center; }}
    button {{
      height: 38px;
      border: 1px solid #2563eb;
      border-radius: 6px;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
      font-weight: 750;
      padding: 0 14px;
    }}
    button.secondary {{ background: #fff; color: #2563eb; }}
    .content {{
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 12px;
      min-height: 0;
    }}
    .state-panel {{ padding: 12px; align-self: start; }}
    .state-panel h2, .tree-panel h2 {{ margin: 0 0 10px; color: #15803d; font-size: 15px; text-transform: uppercase; }}
    .state-line {{ margin: 8px 0; font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; overflow-wrap: anywhere; }}
    .tree-panel {{ min-height: 500px; padding: 14px; overflow: auto; position: relative; }}
    #treePanel {{ position: relative; min-width: max-content; }}
    .tree-lines {{
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
      z-index: 0;
    }}
    .summary-row {{ display: flex; justify-content: space-around; gap: 18px; margin-bottom: 24px; }}
    .summary-item {{ display: flex; align-items: center; gap: 8px; font-weight: 800; }}
    .tree-row {{
      display: grid;
      grid-template-columns: 74px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      margin: 0;
      position: relative;
      z-index: 1;
    }}
    .row-label {{ color: #475569; font-weight: 800; font-size: 13px; }}
    .nodes {{ display: flex; justify-content: flex-start; gap: 18px; min-width: max-content; }}
    .root-row .nodes {{
      justify-content: center;
      min-width: 100%;
    }}
    .node-wrap {{ display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 100px; position: relative; z-index: 1; }}
    .array-node {{
      display: inline-flex;
      gap: 3px;
      padding: 4px;
      border: 2px solid #94a3b8;
      border-radius: 8px;
      background: #fff;
    }}
    .array-node.active {{ border-color: #facc15; box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.25); }}
    .array-node.remove {{ border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18); }}
    .cell {{
      width: 34px;
      height: 32px;
      display: inline-grid;
      place-items: center;
      border: 1px dashed #cbd5e1;
      border-radius: 5px;
      color: #fff;
      font-weight: 800;
      background: #f8fafc;
    }}
    .result-box {{ min-height: 56px; padding: 10px 14px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; overflow-wrap: anywhere; }}
    @media (max-width: 860px) {{
      .topbar, .content {{ grid-template-columns: 1fr; }}
      .controls {{ justify-content: flex-start; }}
    }}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <h1>Algorithm: {self.function_name}</h1>
      <div id="stepBox" class="step-box"></div>
      <div class="controls">
        <button id="prevButton" class="secondary" type="button">Previous</button>
        <button id="nextButton" type="button">Next Step</button>
      </div>
    </header>
    <section class="content">
      <aside class="state-panel">
        <h2>Current State</h2>
        <div id="statePanel"></div>
      </aside>
      <section class="tree-panel">
        <h2>Decision Tree</h2>
        <div id="treePanel"></div>
      </section>
    </section>
    <section id="resultBox" class="result-box"></section>
  </main>
  <script>
    const data = {json.dumps(payload)};
    let currentStep = 0;
    const colors = ["#3b9ddd", "#4db6ac", "#6574cd", "#f59e0b", "#22c55e"];
    const valueColorMap = new Map();

    function colorForValue(value) {{
      const key = JSON.stringify(value);
      if (!valueColorMap.has(key)) {{
        valueColorMap.set(key, colors[valueColorMap.size % colors.length]);
      }}
      return valueColorMap.get(key);
    }}

    function arrayNode(values, slotCount, active, kind, asChoices = false) {{
      const node = document.createElement("div");
      node.className = "array-node" + (active ? " active" : "") + (active && kind === "remove" ? " remove" : "");
      for (let index = 0; index < slotCount; index += 1) {{
        const cell = document.createElement("span");
        cell.className = "cell";
        if (index < values.length) {{
          cell.classList.add(asChoices ? "choice" : "filled");
          cell.textContent = String(values[index]);
          const color = colorForValue(values[index]);
          cell.style.background = color;
          cell.style.borderColor = color;
        }}
        node.append(cell);
      }}
      return node;
    }}

    function nodeKey(subset) {{
      return JSON.stringify(subset || []);
    }}

    function drawConnectors() {{
      const treePanel = document.getElementById("treePanel");
      const previous = treePanel.querySelector(".tree-lines");
      previous?.remove();

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("tree-lines");
      const bounds = treePanel.getBoundingClientRect();
      svg.setAttribute("width", String(Math.max(treePanel.scrollWidth, bounds.width)));
      svg.setAttribute("height", String(Math.max(treePanel.scrollHeight, bounds.height)));
      treePanel.prepend(svg);

      const nodes = [...treePanel.querySelectorAll("[data-node-key]")];
      const byKey = new Map(nodes.map((node) => [node.dataset.nodeKey, node]));
      const childIndexes = new Map();
      for (const child of nodes) {{
        const parentKey = child.dataset.parentKey;
        if (!parentKey || !byKey.has(parentKey)) continue;
        if (!childIndexes.has(parentKey)) childIndexes.set(parentKey, 0);

        const parent = byKey.get(parentKey);
        const childIndex = childIndexes.get(parentKey);
        childIndexes.set(parentKey, childIndex + 1);
        const parentBox = parent.getBoundingClientRect();
        const childBox = child.getBoundingClientRect();
        const x1 = parentBox.left + parentBox.width / 2 - bounds.left + treePanel.scrollLeft;
        const y1 = parentBox.bottom - bounds.top + treePanel.scrollTop;
        const x2 = childBox.left + childBox.width / 2 - bounds.left + treePanel.scrollLeft;
        const y2 = childBox.top - bounds.top + treePanel.scrollTop;
        const railOffset = 16 + childIndex * 8;
        const midY = Math.min(y2 - 12, y1 + railOffset);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${{x1}} ${{y1}} V ${{midY}} H ${{x2}} V ${{y2}}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#94a3b8");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.append(path);
      }}
    }}

    function render() {{
      const step = data.steps[currentStep] || {{ action: "Start", state: {{ subset: [], result: [], decision_tree: [] }} }};
      const state = step.state;
      const decisions = state.decision_tree || [];
      const active = decisions[decisions.length - 1] || null;
      const choicesData = Array.isArray(data.choices) ? data.choices : data.args;
      const slotCount = Math.max(1, Array.isArray(choicesData) ? choicesData.length : 1);

      document.getElementById("stepBox").textContent = `Step ${{currentStep + 1}}: ${{step.action || "Start"}}`;
      document.getElementById("statePanel").innerHTML = `
        <div class="state-line">subset[]: ${{JSON.stringify(state.subset || [])}}</div>
        <div class="state-line">decision: ${{active?.label || "-"}}</div>
      `;
      document.getElementById("resultBox").textContent = `Result: ${{JSON.stringify(state.result || [])}}`;

      const treePanel = document.getElementById("treePanel");
      treePanel.innerHTML = "";
      valueColorMap.clear();
      (choicesData || []).forEach(colorForValue);

      const summary = document.createElement("div");
      summary.className = "summary-row";
      const choices = document.createElement("div");
      choices.className = "summary-item";
      choices.append("choices =", arrayNode(choicesData || [], slotCount, false, "", true));
      const current = document.createElement("div");
      current.className = "summary-item";
      current.append("state =", arrayNode(state.subset || [], slotCount, true, active?.kind || ""));
      summary.append(choices, current);
      treePanel.append(summary);

      const visibleNodes = [{{ id: "root", parent: "", subset: [], depth: 0, kind: "start" }}];
      const path = ["root"];
      let activeNodeId = "root";
      decisions.forEach((decision, index) => {{
        if (decision.kind === "add") {{
          const id = `node-${{index}}`;
          const parent = path[path.length - 1] || "root";
          const subset = decision.subset || [];
          visibleNodes.push({{ id, parent, subset, depth: subset.length, kind: decision.kind }});
          path.push(id);
          activeNodeId = id;
        }} else if (decision.kind === "save") {{
          activeNodeId = path[path.length - 1] || "root";
        }} else if (decision.kind === "remove") {{
          if (path.length > 1) path.pop();
          activeNodeId = path[path.length - 1] || "root";
        }}
      }});

      const nodesByDepth = new Map();
      visibleNodes.forEach((node) => {{
        if (!nodesByDepth.has(node.depth)) nodesByDepth.set(node.depth, []);
        nodesByDepth.get(node.depth).push(node);
      }});

      const maxDepth = Math.max(...nodesByDepth.keys());
      const panelHeight = treePanel.closest(".tree-panel")?.clientHeight || 500;
      const rowGap = Math.max(22, Math.min(72, Math.floor((panelHeight - 160) / Math.max(1, maxDepth + 1))));
      summary.style.marginBottom = `${{rowGap}}px`;
      for (let depth = 0; depth <= maxDepth; depth += 1) {{
        const row = document.createElement("div");
        row.className = "tree-row";
        if (depth === 0) row.classList.add("root-row");
        row.style.margin = `${{rowGap}}px 0`;
        const label = document.createElement("div");
        label.className = "row-label";
        label.textContent = depth === 0 ? "start" : `round ${{depth}}`;
        const nodes = document.createElement("div");
        nodes.className = "nodes";
        (nodesByDepth.get(depth) || []).forEach((item) => {{
          const wrap = document.createElement("div");
          wrap.className = "node-wrap";
          wrap.dataset.nodeKey = item.id;
          if (item.parent) wrap.dataset.parentKey = item.parent;
          wrap.append(arrayNode(item.subset, slotCount, item.id === activeNodeId, active?.kind || ""));
          nodes.append(wrap);
        }});
        row.append(label, nodes);
        treePanel.append(row);
      }}

      document.getElementById("prevButton").disabled = currentStep === 0;
      document.getElementById("nextButton").disabled = currentStep >= data.steps.length - 1;
      requestAnimationFrame(drawConnectors);
    }}

    document.getElementById("prevButton").addEventListener("click", () => {{
      currentStep = Math.max(0, currentStep - 1);
      render();
    }});
    document.getElementById("nextButton").addEventListener("click", () => {{
      currentStep = Math.min(data.steps.length - 1, currentStep + 1);
      render();
    }});
    render();
  </script>
</body>
</html>
""",
            encoding="utf-8",
        )
        return output_path

    def generate_animation(self, output_file="algorithm_animation"):
        """Generate Manim animation automatically"""

        function_name = self.function_name
        args = self.args
        call_args = self.call_args
        visual_choices = self.visual_choices
        animation_steps = self.animation_steps
        trace = self.trace
        self.generate_interactive_viewer(output_file)

        class AutoAlgorithmVisualization(Scene):
            def color_for_value(self, value):
                palette = [BLUE, TEAL, PURPLE, ORANGE, GREEN]
                values = visual_choices if isinstance(visual_choices, list) else []
                unique_values = []
                for item in values:
                    if item not in unique_values:
                        unique_values.append(item)
                if value not in unique_values:
                    unique_values.append(value)
                return palette[unique_values.index(value) % len(palette)]

            def fitted_text(self, value, font_size=18, color=WHITE, max_width=5.4):
                text = Text(str(value), font_size=font_size, color=color)
                if text.width > max_width:
                    text.scale_to_fit_width(max_width)
                return text

            def render_state(self, step):
                state = step["state"]
                lines = [
                    f"subset[]: {state.get('subset', [])}",
                ]
                if state.get("decision_tree"):
                    lines.append(f"decision: {state['decision_tree'][-1]['label']}")

                group = VGroup()
                for line in lines:
                    group.add(self.fitted_text(line, font_size=16, max_width=5.2))
                group.arrange(DOWN, aligned_edge=LEFT, buff=0.18)
                return group

            def render_result(self, step):
                result = step["state"].get("result", [])
                text = json.dumps(result, separators=(",", ":"))
                return self.fitted_text(f"Result: {text}", font_size=14, color=GREEN, max_width=12.4)

            def render_decision_tree(self, step):
                values = visual_choices if isinstance(visual_choices, list) else []
                slot_count = max(1, len(values))
                decisions = step["state"].get("decision_tree", [])
                active_decision = decisions[-1] if decisions else None
                active_subset = active_decision.get("subset", []) if active_decision else []
                active_kind = active_decision.get("kind") if active_decision else None
                max_depth = min(slot_count, 4)

                diagram = VGroup()
                choices_label = self.fitted_text("choices =", font_size=15, color=WHITE, max_width=1.4)
                choices_node = self.render_array_node(values, slot_count, scale=0.5, color_mode="value")
                choices = VGroup(choices_label, choices_node).arrange(RIGHT, buff=0.15)
                choices.move_to(LEFT * 2.35 + UP * 1.95)

                state_label = self.fitted_text("state =", font_size=15, color=WHITE, max_width=1.2)
                state_node = self.render_array_node(active_subset, slot_count, scale=0.5, active_kind=active_kind)
                state = VGroup(state_label, state_node).arrange(RIGHT, buff=0.15)
                state.move_to(RIGHT * 2.15 + UP * 1.95)
                diagram.add(choices, state)

                nodes_by_key = {(): {"subset": [], "depth": 0, "kind": None}}
                for decision in decisions:
                    if decision.get("kind") in {"add", "save"}:
                        subset = tuple(decision.get("subset", []))
                        if len(subset) <= max_depth:
                            nodes_by_key[subset] = {
                                "subset": list(subset),
                                "depth": len(subset),
                                "kind": decision.get("kind"),
                            }

                rows = {}
                for node in nodes_by_key.values():
                    rows.setdefault(node["depth"], []).append(node)
                for depth_nodes in rows.values():
                    depth_nodes.sort(key=lambda item: tuple(str(value) for value in item["subset"]))

                positioned_nodes = {}
                y_top = 1.25
                y_gap = 0.82
                row_labels = ["start", "round 1", "round 2", "round 3", "round 4"]
                for depth in range(0, max_depth + 1):
                    depth_nodes = rows.get(depth, [])
                    if not depth_nodes:
                        continue

                    y = y_top - depth * y_gap
                    label = self.fitted_text(row_labels[depth] if depth < len(row_labels) else f"round {depth}", font_size=12, color=GRAY, max_width=1.0)
                    label.move_to(LEFT * 3.0 + UP * y)
                    diagram.add(label)

                    count = len(depth_nodes)
                    for index, node in enumerate(depth_nodes):
                        x = 0 if count == 1 else -2.15 + 4.3 * index / max(1, count - 1)
                        subset = node["subset"]
                        key = tuple(subset)
                        is_active = subset == active_subset
                        color = YELLOW if node["kind"] == "save" else GREEN
                        if is_active and active_kind == "remove":
                            color = RED
                        rendered = self.render_array_node(subset, slot_count, scale=0.45, highlight=is_active, active_kind=active_kind, stroke_color=color)
                        rendered.move_to(RIGHT * x + UP * y)
                        positioned_nodes[key] = rendered
                        diagram.add(rendered)

                for key, rendered in positioned_nodes.items():
                    if not key:
                        continue
                    parent_key = key[:-1]
                    parent = positioned_nodes.get(parent_key)
                    if parent:
                        diagram.add(Line(parent.get_bottom(), rendered.get_top(), color=GRAY, stroke_width=2).set_z_index(-1))

                return diagram

            def render_array_node(self, values, slot_count, scale=0.5, highlight=False, active_kind=None, stroke_color=BLUE, color_mode=None):
                cells = VGroup()
                for index in range(slot_count):
                    filled = index < len(values)
                    border = stroke_color if highlight else GRAY
                    fill_color = self.color_for_value(values[index]) if filled else BLACK
                    rect = RoundedRectangle(
                        width=0.46,
                        height=0.42,
                        corner_radius=0.06,
                        color=border,
                        stroke_width=4 if highlight else 2,
                        fill_color=fill_color,
                        fill_opacity=0.88 if filled else 0,
                    )
                    if not filled:
                        rect.set_stroke(GRAY, width=1.4, opacity=0.55)
                    cell = VGroup(rect)
                    if filled:
                        label = Text(str(values[index]), font_size=18, color=WHITE)
                        label.move_to(rect.get_center())
                        cell.add(label)
                    cells.add(cell)

                cells.arrange(RIGHT, buff=0.03)
                wrapper_color = RED if highlight and active_kind == "remove" else stroke_color if highlight else GRAY
                wrapper = RoundedRectangle(
                    width=cells.width + 0.12,
                    height=cells.height + 0.12,
                    corner_radius=0.08,
                    color=wrapper_color,
                    stroke_width=2.2 if highlight else 1.2,
                )
                wrapper.move_to(cells.get_center())
                group = VGroup(wrapper, cells)
                group.scale(scale / 0.5)
                return group

            def construct(self):
                # Title
                title = Text(f"Algorithm: {function_name}", font_size=36, color=BLUE)
                title.to_edge(UP)
                self.play(Write(title))

                # Input display
                input_text = Text(f"Input: {json.dumps(call_args)}", font_size=24, color=YELLOW)
                input_text.next_to(title, DOWN)
                self.play(Write(input_text))

                # State display area
                state_box = Rectangle(height=2.8, width=4.55, color=WHITE)
                state_box.move_to(LEFT * 4.25 + DOWN * 0.15)
                state_label = Text("Current State", font_size=20, color=GREEN)
                state_label.move_to(state_box.get_top() + DOWN * 0.3)

                self.play(Create(state_box), Write(state_label))

                tree_box = Rectangle(height=4.45, width=8.45, color=WHITE)
                tree_box.move_to(RIGHT * 2.15 + DOWN * 0.05)
                tree_label = Text("Decision Tree", font_size=20, color=GREEN)
                tree_label.move_to(tree_box.get_top() + DOWN * 0.3)
                self.play(Create(tree_box), Write(tree_label))

                result_box = Rectangle(height=0.54, width=13.1, color=GRAY)
                result_box.to_edge(DOWN, buff=0.94)
                self.play(Create(result_box), run_time=0.25)

                step_box = Rectangle(height=0.62, width=13.1, color=GRAY)
                step_box.to_edge(DOWN, buff=0.18)
                self.play(Create(step_box), run_time=0.25)

                # Animate each step
                step_display = Text("", font_size=16, color=WHITE)
                step_display.move_to(step_box.get_center())
                self.add(step_display)
                result_display = Text("", font_size=14, color=GREEN)
                result_display.move_to(result_box.get_center())
                self.add(result_display)
                state_content = VGroup(Text("", font_size=16))
                state_content.move_to(state_box.get_center())
                self.add(state_content)
                tree_content = VGroup(Text("", font_size=14))
                tree_content.move_to(tree_box.get_center() + DOWN * 0.08)
                self.add(tree_content)

                for step_num, step in enumerate(animation_steps[:30]):  # Limit steps
                    # Update step description
                    new_step = self.fitted_text(f"Step {step_num + 1}: {step['action']}", font_size=16, max_width=12.5)
                    new_step.move_to(step_box.get_center())

                    # Update state visualization
                    new_state_content = self.render_state(step)
                    if new_state_content.width > state_box.width - 0.35:
                        new_state_content.scale_to_fit_width(state_box.width - 0.35)
                    if new_state_content.height > state_box.height - 0.65:
                        new_state_content.scale_to_fit_height(state_box.height - 0.65)
                    new_state_content.move_to(state_box.get_center())
                    new_tree_content = self.render_decision_tree(step)
                    if new_tree_content.width > tree_box.width - 0.35:
                        new_tree_content.scale_to_fit_width(tree_box.width - 0.35)
                    if new_tree_content.height > tree_box.height - 0.7:
                        new_tree_content.scale_to_fit_height(tree_box.height - 0.7)
                    new_tree_content.move_to(tree_box.get_center() + DOWN * 0.08)
                    new_result = self.render_result(step)
                    new_result.move_to(result_box.get_center())

                    self.play(
                        Transform(step_display, new_step),
                        Transform(result_display, new_result),
                        Transform(state_content, new_state_content),
                        Transform(tree_content, new_tree_content),
                        run_time=0.5
                    )

                    self.wait(0.5)

                final_result = self.fitted_text(
                    f"Result: {json.dumps(trace.get('result', []), separators=(',', ':'))}",
                    font_size=14,
                    color=GREEN,
                    max_width=12.4,
                )
                final_result.move_to(result_box.get_center())
                self.play(Transform(result_display, final_result))
                self.wait(3)

        # Render the animation
        scene = AutoAlgorithmVisualization()
        scene.render()

        # Convert to GIF
        from manim import config
        config.preview = True
        config.format = "gif"

        return scene

# Usage example
if __name__ == "__main__":
    # Your LeetCode 90 JavaScript code
    js_code = """
/* 回溯算法：子集和 I */
function backtrack(state, target, total, choices, res) {
    // 子集和等于 target 时，记录解
    if (total === target) {
        res.push([...state]);
        return;
    }
    // 遍历所有选择
    for (let i = 0; i < choices.length; i++) {
        // 剪枝：若子集和超过 target ，则跳过该选择
        if (total + choices[i] > target) {
            continue;
        }
        // 尝试：做出选择，更新元素和 total
        state.push(choices[i]);
        // 进行下一轮选择
        backtrack(state, target, total + choices[i], choices, res);
        // 回退：撤销选择，恢复到之前的状态
        state.pop();
    }
}

/* 求解子集和 I（包含重复子集） */
function subsetSumINaive(nums, target) {
    const state = []; // 状态（子集）
    const total = 0; // 子集和
    const res = []; // 结果列表（子集列表）
    backtrack(state, target, total, nums, res);
    return res;
}
    """

    # Args map to subsetSumINaive(nums, target).
    converter = AutoManimConverter(js_code, "subsetSumINaive", [[1, 2, 2], 3])
    viewer = converter.generate_interactive_viewer("90_subsets-ii_interactive")
    print(f"Interactive viewer: {viewer}")
