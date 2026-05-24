# auto_manim_generator.py
from manim import *
from pathlib import Path
import json
import subprocess
import re
from typing import Any, Dict, List

try:
    from manim_dsa import MTree
    from manim_dsa.constants import MTreeStyle
    HAS_MANIM_DSA = True
except ImportError:
    MTree = None
    MTreeStyle = None
    HAS_MANIM_DSA = False

class AutoManimConverter:
    def __init__(self, js_code: str, function_name: str, args: list, leetcode_id: int | str | None = None):
        self.js_code = js_code
        self.function_name = function_name
        self.args = args
        self.variable_info = self._analyze_js_variables()
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
        params = self.variable_info.get("functions", {}).get(self.function_name, [])
        param_count = len(params)
        if param_count == 1:
            return [args]
        if len(args) == 1:
            return args
        if param_count == len(args):
            return args
        if (
            param_count == 3
            and not any(isinstance(arg, (list, dict)) for arg in args)
            and params[1] in {"left", "lo", "low", "start", "l"}
            and params[2] in {"right", "hi", "high", "end", "r"}
        ):
            return [args, 0, len(args) - 1]
        if any(isinstance(arg, (list, dict)) for arg in args):
            return args
        return [args]

    def _extract_visual_choices(self, call_args: list) -> list:
        for arg in call_args:
            if isinstance(arg, list):
                return arg
        return call_args

    def _analyze_js_variables(self) -> Dict[str, Any]:
        """Find variables worth tracing from the provided JavaScript source."""

        code = self.js_code
        functions: Dict[str, List[str]] = {}
        for match in re.finditer(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)", code):
            params = [
                part.strip().split("=")[0].strip()
                for part in match.group(2).split(",")
                if part.strip()
            ]
            functions[match.group(1)] = params

        array_vars = set()
        for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]", code):
            array_vars.add(match.group(1))

        object_vars = set()
        set_vars = set()
        map_vars = set()
        for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{\s*\}|new\s+(?:Map|Set)\s*\()", code):
            object_vars.add(match.group(1))
        for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Set\s*\(", code):
            set_vars.add(match.group(1))
        for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Map\s*\(", code):
            map_vars.add(match.group(1))

        table_vars = set()
        for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]*(?:Array\.from|new\s+Array|Array\s*\()[^\n;]*)", code):
            initializer = match.group(2)
            if "Array.from" in initializer or "new Array" in initializer or "Array(" in initializer:
                table_vars.add(match.group(1))
        for match in re.finditer(r"\b([A-Za-z_$][\w$]*)\s*\[[^\]]+\](?:\s*\[[^\]]+\])?\s*=", code):
            table_vars.add(match.group(1))

        declared_vars = set()
        for match in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", code):
            declared_vars.add(match.group(1))
        for match in re.finditer(r"\bfor\s*\(\s*(?:let|var|const)\s+([A-Za-z_$][\w$]*)\s*=", code):
            declared_vars.add(match.group(1))

        scalar_vars = sorted(declared_vars - array_vars - object_vars - table_vars)
        array_roles: Dict[str, str] = {}
        stack_vars = set()
        for name in sorted(array_vars):
            push_patterns = re.findall(rf"\b{re.escape(name)}\.push\(([^;\n]*)\)", code)
            has_pop = re.search(rf"\b{re.escape(name)}\.pop\(\)", code) is not None
            saves_copy = any(arg.strip().startswith("[") or arg.strip().startswith("Array.from(") for arg in push_patterns)
            if saves_copy and not has_pop:
                array_roles[name] = "result"
            elif has_pop:
                array_roles[name] = "stack"
                stack_vars.add(name)
            else:
                array_roles[name] = name

        return {
            "functions": functions,
            "array_roles": array_roles,
            "array_vars": sorted(array_vars),
            "object_vars": sorted(object_vars),
            "set_vars": sorted(set_vars),
            "map_vars": sorted(map_vars),
            "stack_vars": sorted(stack_vars),
            "table_vars": sorted(table_vars),
            "scalar_vars": scalar_vars,
        }

    def _get_execution_trace(self) -> Dict:
        """Execute JS and capture execution trace"""

        instrumented_js_code = self._instrument_js_arrays(self.js_code)
        function_params_by_name = self.variable_info.get("functions", {})
        trace_wrappers = "\n".join(
            f"        {name} = makeTracedFunction('{name}', {name});"
            for name in function_params_by_name
        )
        tracer_code = f"""
        // Enhanced tracer for algorithm visualization
        const executionTrace = [];
        let stepCounter = 0;
        const trackedArrays = new WeakMap();

        function cloneValue(value) {{
            // Safe clone with depth and size limits to avoid huge JSON payloads
            const MAX_STRING = 200;
            const MAX_ARRAY = 20;
            const MAX_OBJECT_KEYS = 200;
            function _clone(v, depth) {{
                if (depth < 0) {{
                    if (v === null || v === undefined) return v;
                    return typeof v === 'object' ? '[Object]' : String(v);
                }}
                if (v === null || v === undefined) return v;
                const t = typeof v;
                if (t === 'string') {{
                    return v.length > MAX_STRING ? v.slice(0, MAX_STRING) + '...' : v;
                }}
                if (t === 'number' || t === 'boolean') return v;
                if (Array.isArray(v)) {{
                    const out = [];
                    for (let i = 0; i < Math.min(v.length, MAX_ARRAY); i++) {{
                        out.push(_clone(v[i], depth - 1));
                    }}
                    if (v.length > MAX_ARRAY) out.push('...(' + v.length + ' items)');
                    return out;
                }}
                if (t === 'object') {{
                    const obj = {{}};
                    let count = 0;
                    for (const k in v) {{
                        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
                        if (count++ >= MAX_OBJECT_KEYS) {{ obj['...'] = 'truncated'; break; }}
                        try {{ obj[k] = _clone(v[k], depth - 1); }} catch (e) {{ obj[k] = String(v[k]); }}
                    }}
                    return obj;
                }}
                try {{ return String(v); }} catch {{ return null; }}
            }}
            try {{ return _clone(value, 3); }} catch {{ try {{ return String(value); }} catch {{ return null; }} }}
        }}

        function makeTrackedArray(name) {{
            const array = [];
            trackedArrays.set(array, name);
            return array;
        }}

        // Limit events pushed to trace to avoid unbounded growth
        const MAX_TRACE = 12345678;
        function pushTrace(obj) {{
            if (executionTrace.length < MAX_TRACE) {{
                executionTrace.push(obj);
            }}
        }}

        // Trace scalar variable assignments (minimal helper)
        function traceAssign(name, value) {{
            const v = value;
            const tree = serializeBinaryTree(v);
            pushTrace({{
                step: stepCounter++,
                type: 'var_assign',
                name,
                value: cloneValue(v),
                binaryTree: tree
            }});
            return v;
        }}

        function isTreeNode(value) {{
            return value && typeof value === 'object' && 'val' in value && 'left' in value && 'right' in value;
        }}

        function serializeBinaryTree(root) {{
            if (!isTreeNode(root)) return null;
            const adjacency = {{}};
            const labels = {{}};
            const seen = new WeakMap();
            let counter = 0;
            function visit(node) {{
                if (!isTreeNode(node)) return null;
                if (seen.has(node)) return seen.get(node);
                const id = `node-${{counter++}}`;
                seen.set(node, id);
                labels[id] = cloneValue(node.val);
                adjacency[id] = [];
                const leftId = visit(node.left);
                const rightId = visit(node.right);
                if (leftId !== null) adjacency[id].push(leftId);
                if (rightId !== null) adjacency[id].push(rightId);
                return id;
            }}
            const rootId = visit(root);
            return {{ root: rootId, adjacency, labels }};
        }}

        class AutoTraceTreeNode {{
            constructor(val, left = null, right = null) {{
                this.val = val === undefined ? 0 : val;
                this.left = left;
                this.right = right;
            }}
        }}

        function treeNodeCtor() {{
            return typeof TreeNode === 'function' ? TreeNode : AutoTraceTreeNode;
        }}

        function isNullTreeSlot(value) {{
            if (value === null || value === undefined) return true;
            if (typeof value !== 'string') return false;
            const normalized = value.trim().toLowerCase();
            return normalized === 'null' || normalized === 'none' || normalized === 'undefined';
        }}

        function buildTreeFromLevelOrder(values) {{
            if (!Array.isArray(values) || values.length === 0 || isNullTreeSlot(values[0])) return null;
            const NodeCtor = treeNodeCtor();
            const root = new NodeCtor(values[0]);
            const queue = [root];
            let index = 1;
            while (queue.length && index < values.length) {{
                const node = queue.shift();
                if (!node) continue;

                const leftValue = values[index++];
                if (!isNullTreeSlot(leftValue)) {{
                    node.left = new NodeCtor(leftValue);
                    queue.push(node.left);
                }}

                if (index >= values.length) break;
                const rightValue = values[index++];
                if (!isNullTreeSlot(rightValue)) {{
                    node.right = new NodeCtor(rightValue);
                    queue.push(node.right);
                }}
            }}
            return root;
        }}

        function findTreeNodeByValue(root, target) {{
            if (!isTreeNode(root)) return null;
            const queue = [root];
            const seen = new WeakSet();
            while (queue.length) {{
                const node = queue.shift();
                if (!node || seen.has(node)) continue;
                seen.add(node);
                if (Object.is(node.val, target) || node.val === target) return node;
                if (node.left) queue.push(node.left);
                if (node.right) queue.push(node.right);
            }}
            return null;
        }}

        function normalizeTreeCallArgs(rawArgs, params) {{
            if (!Array.isArray(rawArgs) || !rawArgs.length) return rawArgs;

            const rootNames = new Set(['root', 'node', 'tree', 'head']);
            const rootIndex = params.findIndex((param) => rootNames.has(String(param || '').trim().toLowerCase()));
            if (rootIndex < 0 || !Array.isArray(rawArgs[rootIndex])) return rawArgs;

            const root = buildTreeFromLevelOrder(rawArgs[rootIndex]);
            if (!isTreeNode(root)) return rawArgs;

            const nodeParamNames = new Set(['p', 'q', 'target', 'targetnode', 'node', 'node1', 'node2']);
            return rawArgs.map((arg, index) => {{
                if (index === rootIndex) return root;
                const paramName = String(params[index] || '').trim().toLowerCase();
                if (nodeParamNames.has(paramName) && !Array.isArray(arg) && (arg === null || typeof arg !== 'object')) {{
                    return findTreeNodeByValue(root, arg) || arg;
                }}
                return arg;
            }});
        }}

        function arrayNameFor(array, fallbackName = 'array') {{
            return trackedArrays.get(array) || fallbackName || 'array';
        }}

        function traceArrayPush(array, items, fallbackName = 'array') {{
            const before = cloneValue(array);
            const pushedItems = items || [];
            const result = array.push(...pushedItems);
            pushTrace({{
                step: stepCounter++,
                type: 'array_push',
                arrayName: arrayNameFor(array, fallbackName),
                variableName: fallbackName,
                items: cloneValue(pushedItems),
                before,
                after: cloneValue(array)
            }});
            return result;
        }}

        function traceArrayPop(array, fallbackName = 'array') {{
            const before = cloneValue(array);
            const item = array.pop();
            pushTrace({{
                step: stepCounter++,
                type: 'array_pop',
                arrayName: arrayNameFor(array, fallbackName),
                variableName: fallbackName,
                item: cloneValue(item),
                before,
                after: cloneValue(array)
            }});
            return item;
        }}

        function tracePropSet(obj, key, value, name = 'object') {{
            obj[key] = value;
            pushTrace({{
                step: stepCounter++,
                type: 'prop_set',
                obj: name,
                key: cloneValue(key),
                value: cloneValue(value)
            }});
            return value;
        }}

        function collectionValue(collection) {{
            if (collection instanceof Map) return Array.from(collection.entries());
            if (collection instanceof Set) return Array.from(collection.values());
            return cloneValue(collection);
        }}

        function traceCollectionInit(name, collection, kind) {{
            pushTrace({{
                step: stepCounter++,
                type: 'collection_init',
                name,
                kind,
                value: collectionValue(collection)
            }});
            return collection;
        }}

        function traceSetAdd(collection, value, name = 'set') {{
            collection.add(value);
            pushTrace({{
                step: stepCounter++,
                type: 'collection_set',
                name,
                kind: 'set',
                op: 'add',
                key: cloneValue(value),
                value: collectionValue(collection)
            }});
            return collection;
        }}

        function traceSetDelete(collection, value, name = 'set') {{
            const result = collection.delete(value);
            pushTrace({{
                step: stepCounter++,
                type: 'collection_set',
                name,
                kind: 'set',
                op: 'delete',
                key: cloneValue(value),
                result: cloneValue(result),
                value: collectionValue(collection)
            }});
            return result;
        }}

        function traceMapSet(collection, key, value, name = 'map') {{
            collection.set(key, value);
            pushTrace({{
                step: stepCounter++,
                type: 'collection_set',
                name,
                kind: 'map',
                op: 'set',
                key: cloneValue(key),
                itemValue: cloneValue(value),
                value: collectionValue(collection)
            }});
            return collection;
        }}

        function traceMapDelete(collection, key, name = 'map') {{
            const result = collection.delete(key);
            pushTrace({{
                step: stepCounter++,
                type: 'collection_set',
                name,
                kind: 'map',
                op: 'delete',
                key: cloneValue(key),
                result: cloneValue(result),
                value: collectionValue(collection)
            }});
            return result;
        }}

        function traceTableInit(name, table) {{
            pushTrace({{
                step: stepCounter++,
                type: 'table_init',
                name,
                value: cloneValue(table)
            }});
            return table;
        }}

        function traceTableSet(table, row, col, value, name = 'table') {{
            if (col === null || col === undefined) {{
                table[row] = value;
            }} else {{
                table[row][col] = value;
            }}
            pushTrace({{
                step: stepCounter++,
                type: 'table_set',
                name,
                row: cloneValue(row),
                col: cloneValue(col),
                value: cloneValue(value),
                table: cloneValue(table)
            }});
            return value;
        }}
        
        // Your algorithm
        {instrumented_js_code}
        
        const functionParamsByName = {json.dumps(function_params_by_name)};
        let recursionDepth = 0;

        function makeTracedFunction(name, originalFunction) {{
            return function(...args) {{
                pushTrace({{
                    step: stepCounter++,
                    type: 'function_entry',
                    name,
                    params: functionParamsByName[name] || [],
                    args: cloneValue(args),
                    binaryTrees: args.map((arg) => serializeBinaryTree(arg)),
                    depth: recursionDepth
                }});

                recursionDepth++;
                const result = originalFunction.apply(this, args);
                recursionDepth--;

                pushTrace({{
                    step: stepCounter++,
                    type: 'function_exit',
                    name,
                    result: cloneValue(result),
                    depth: recursionDepth
                }});

                return result;
            }};
        }}
        
        // Replace detected functions with traced wrappers.
{trace_wrappers}
        
        // Execute and capture everything
        const rawCallArgs = {json.dumps(self.call_args)};
        const callArgs = normalizeTreeCallArgs(rawCallArgs, functionParamsByName[{json.dumps(self.function_name)}] || []);
        const finalResult = {self.function_name}(...callArgs);
        // Limit trace size to avoid very large JSON payloads
        const outTrace = executionTrace.slice(0, Math.min(executionTrace.length, MAX_TRACE));
        // Sanitize large or sensitive fields (stack traces) to keep payload small
        for (const ev of outTrace) {{
            try {{
                if (ev && typeof ev.stackTrace === 'string') {{
                    // Remove stackTrace entirely to avoid huge payloads
                    delete ev.stackTrace;
                }}
                // Also trim any deeply nested value strings
                if (ev && ev.value && typeof ev.value === 'string' && ev.value.length > 500) {{
                    ev.value = ev.value.slice(0, 500) + '...(truncated)';
                }}
            }} catch (e) {{ /* ignore sanitizer errors */ }}
        }}
        console.log(JSON.stringify({{
            trace: outTrace,
            trimmed: executionTrace.length > MAX_TRACE,
            result: finalResult,
            totalSteps: stepCounter
        }}));
        """

        result = subprocess.run(
            ['node', '-e', tracer_code],
            capture_output=True,
            text=True,
            timeout=180
        )

        if result.stdout:
            return json.loads(result.stdout)
        if result.stderr:
            raise RuntimeError(result.stderr)
        return {"trace": [], "result": None}

    def _instrument_js_arrays(self, js_code: str) -> str:
        """Instrument variables found in the JavaScript source."""

        replacements = self.variable_info.get("array_roles", {})

        instrumented = js_code
        for name, role in replacements.items():
            factory = f"makeTrackedArray('{role}')"
            for keyword in ("const", "let", "var"):
                instrumented = instrumented.replace(f"{keyword} {name} = []", f"{keyword} {name} = {factory}")
                instrumented = instrumented.replace(f"{keyword} {name}=[]", f"{keyword} {name}={factory}")

        vars_to_track = self.variable_info.get("scalar_vars", [])

        # Protect for-loop headers to avoid modifying the initializer inside parentheses.
        for_headers = []
        def _header_replacer(m):
            idx = len(for_headers)
            for_headers.append(m.group(0))
            return f"__FOR_HEADER_PLACEHOLDER_{idx}__"
        instrumented = re.sub(r"for\s*\([^)]*\)\s*\{", _header_replacer, instrumented)

        # Now safe to append traceAssign after declarations/assignments without touching for headers.
        for v in vars_to_track:
            # Declarations like "let left = expr;" -> "let left = expr; traceAssign('left', left);"
            decl_pattern = rf"(\b(?:let|var|const)\s+{v}\s*=\s*)([^;\n]+);"
            instrumented = re.sub(decl_pattern, lambda m: m.group(1) + m.group(2) + f"; traceAssign('{v}', {v});", instrumented)

            # Assignments at start of a line: "left = expr;" -> "left = expr; traceAssign('left', left);"
            assign_pattern = rf"(^|\n)(\s*){v}\s*=\s*([^;\n]+);"
            instrumented = re.sub(assign_pattern, lambda m: m.group(1) + m.group(2) + f"{v} = " + m.group(3) + f"; traceAssign('{v}', {v});", instrumented, flags=re.MULTILINE)

        # Restore for headers and inject traceAssign calls at the start of the loop body
        def _restore_header(match):
            placeholder = match.group(0)
            idx = int(re.search(r"_(\d+)__", placeholder).group(1))
            original = for_headers[idx]
            # find which tracked vars appear in the header initializer
            m = re.search(r"for\s*\(([^)]*)\)", original)
            trace_calls = ""
            if m:
                init = m.group(1).split(";")[0]
                found = [v for v in vars_to_track if re.search(rf"\b{re.escape(v)}\b", init)]
                if found:
                    trace_calls = "".join([f" traceAssign('{v}', {v});" for v in found])
            # insert trace calls immediately after the '{'
            return original + trace_calls

        instrumented = re.sub(r"__FOR_HEADER_PLACEHOLDER_\d+__", _restore_header, instrumented)

        for obj in self.variable_info.get("object_vars", []):
            instrumented = re.sub(rf"\b{obj}\s*\[\s*([^\]]+)\s*\]\s*=\s*([^;\n]+);",
                                  rf"tracePropSet({obj}, \1, \2, '{obj}');", instrumented)

        for name in self.variable_info.get("set_vars", []):
            instrumented = re.sub(
                rf"(\b(?:const|let|var)\s+{name}\s*=\s*new\s+Set\s*\([^;\n]*\);)",
                rf"\1 traceCollectionInit('{name}', {name}, 'set');",
                instrumented,
                count=1,
            )
            instrumented = re.sub(
                rf"\b{name}\.add\(([^;\n]+)\);",
                rf"traceSetAdd({name}, \1, '{name}');",
                instrumented,
            )
            instrumented = re.sub(
                rf"\b{name}\.delete\(([^;\n]+)\);",
                rf"traceSetDelete({name}, \1, '{name}');",
                instrumented,
            )

        for name in self.variable_info.get("map_vars", []):
            instrumented = re.sub(
                rf"(\b(?:const|let|var)\s+{name}\s*=\s*new\s+Map\s*\([^;\n]*\);)",
                rf"\1 traceCollectionInit('{name}', {name}, 'map');",
                instrumented,
                count=1,
            )
            instrumented = re.sub(
                rf"\b{name}\.set\(([^,\n]+),\s*([^;\n]+)\);",
                rf"traceMapSet({name}, \1, \2, '{name}');",
                instrumented,
            )
            instrumented = re.sub(
                rf"\b{name}\.delete\(([^;\n]+)\);",
                rf"traceMapDelete({name}, \1, '{name}');",
                instrumented,
            )

        for table in self.variable_info.get("table_vars", []):
            instrumented = re.sub(
                rf"\b{table}\s*\[\s*([^\]]+)\s*\]\s*\[\s*([^\]]+)\s*\]\s*=\s*([^;\n]+);",
                rf"traceTableSet({table}, \1, \2, \3, '{table}');",
                instrumented,
            )
            instrumented = re.sub(
                rf"\b{table}\s*\[\s*([^\]]+)\s*\]\s*=\s*([^;\n]+);",
                rf"traceTableSet({table}, \1, null, \2, '{table}');",
                instrumented,
            )
            instrumented = re.sub(
                rf"(\b(?:const|let|var)\s+{table}\s*=\s*[^;\n]+;)",
                rf"\1 traceTableInit('{table}', {table});",
                instrumented,
                count=1,
            )

        # Instrument array mutations after arrays have been wrapped with names.
        array_vars = set(replacements.keys())
        array_names = "|".join(sorted((re.escape(name) for name in array_vars), key=len, reverse=True))
        if array_names:
            instrumented = re.sub(
                rf"\b({array_names})\.push\(([^;\n]*)\);",
                lambda m: f"traceArrayPush({m.group(1)}, [{m.group(2)}], '{m.group(1)}');",
                instrumented,
            )
            instrumented = re.sub(
                rf"\b({array_names})\.pop\(\);",
                lambda m: f"traceArrayPop({m.group(1)}, '{m.group(1)}');",
                instrumented,
            )

        return instrumented

    def _convert_trace_to_steps(self) -> List[Dict]:
        """Convert JS execution trace to animation steps"""

        steps = []
        current_state = {
            "subset": [],
            "result": [],
            "index": 0,
            "call_stack": [],
            "decision_tree": [],
            "call_tree": [],
            "active_call_id": None,
            "tables": {},
            "active_table": None,
            "active_cell": None,
            "collections": {},
            "active_collection": None,
            "binary_trees": {},
            "active_binary_tree": None,
            "active_binary_node_value": None,
            "locals": {}
        }
        local_scopes = []
        call_node_stack = []
        call_node_counter = 0
        array_vars = set(self.variable_info.get("array_vars", []))
        object_vars = set(self.variable_info.get("object_vars", []))
        table_vars = set(self.variable_info.get("table_vars", []))
        collection_vars = set(self.variable_info.get("stack_vars", [])) | set(self.variable_info.get("set_vars", [])) | set(self.variable_info.get("map_vars", []))

        for trace_item in self.trace.get("trace", []):
            if trace_item["type"] == "var_assign":
                name = trace_item.get("name")
                val = trace_item.get("value")
                # record local
                if name:
                    current_state.setdefault("locals", {})[name] = val
                    if trace_item.get("binaryTree"):
                        current_state.setdefault("binary_trees", {})[name] = trace_item["binaryTree"]
                        current_state["active_binary_tree"] = name
                        if isinstance(val, dict) and "val" in val:
                            current_state["active_binary_node_value"] = val.get("val")
                steps.append({
                    "action": f"{name} = {val}",
                    "state": self._copy_state(current_state)
                })
                continue

            if trace_item["type"] == "prop_set":
                obj = trace_item.get("arrayName") or trace_item.get("obj")
                key = trace_item.get("key")
                val = trace_item.get("value")
                if obj:
                    current_state.setdefault("locals", {}).setdefault(obj, {})[str(key)] = val
                steps.append({
                    "action": f"{obj}[{key}] = {val}",
                    "state": self._copy_state(current_state)
                })
                continue

            if trace_item["type"] == "table_init":
                name = trace_item.get("name")
                value = trace_item.get("value")
                if name:
                    current_state.setdefault("tables", {})[name] = value
                    current_state.setdefault("locals", {})[name] = value
                    current_state["active_table"] = name
                    current_state["active_cell"] = None
                steps.append({
                    "action": f"Initialize table {name}",
                    "state": self._copy_state(current_state)
                })
                continue

            if trace_item["type"] == "table_set":
                name = trace_item.get("name")
                row = trace_item.get("row")
                col = trace_item.get("col")
                value = trace_item.get("value")
                if name:
                    current_state.setdefault("tables", {})[name] = trace_item.get("table")
                    current_state.setdefault("locals", {})[name] = trace_item.get("table")
                    current_state["active_table"] = name
                    current_state["active_cell"] = [row] if col is None else [row, col]
                steps.append({
                    "action": f"{name}[{row}] = {value}" if col is None else f"{name}[{row}][{col}] = {value}",
                    "state": self._copy_state(current_state)
                })
                continue

            if trace_item["type"] == "collection_init":
                name = trace_item.get("name")
                kind = trace_item.get("kind")
                value = trace_item.get("value")
                if name:
                    current_state.setdefault("collections", {})[name] = {"kind": kind, "value": value}
                    current_state.setdefault("locals", {})[name] = value
                    current_state["active_collection"] = name
                steps.append({
                    "action": f"Initialize {kind} {name}",
                    "state": self._copy_state(current_state)
                })
                continue

            if trace_item["type"] == "collection_set":
                name = trace_item.get("name")
                kind = trace_item.get("kind")
                op = trace_item.get("op")
                value = trace_item.get("value")
                if name:
                    current_state.setdefault("collections", {})[name] = {"kind": kind, "value": value}
                    current_state.setdefault("locals", {})[name] = value
                    current_state["active_collection"] = name
                steps.append({
                    "action": f"{name}.{op}({trace_item.get('key')})",
                    "state": self._copy_state(current_state)
                })
                continue

            if trace_item["type"] == "array_push":
                array_name = self._classify_array_event(trace_item)
                variable_name = trace_item.get("variableName")
                if variable_name:
                    current_state.setdefault("locals", {})[variable_name] = trace_item.get("after")
                if array_name == "stack":
                    current_state.setdefault("collections", {})[variable_name] = {"kind": "stack", "value": trace_item.get("after")}
                    current_state["active_collection"] = variable_name
                    steps.append({
                        "action": f"{variable_name}.push({trace_item.get('items')})",
                        "state": self._copy_state(current_state)
                    })
                elif array_name == "subset":
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
                variable_name = trace_item.get("variableName")
                if variable_name:
                    current_state.setdefault("locals", {})[variable_name] = trace_item.get("after")
                if array_name == "stack":
                    current_state.setdefault("collections", {})[variable_name] = {"kind": "stack", "value": trace_item.get("after")}
                    current_state["active_collection"] = variable_name
                    steps.append({
                        "action": f"{variable_name}.pop() -> {trace_item.get('item')}",
                        "state": self._copy_state(current_state)
                    })
                elif array_name == "subset":
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
                local_scopes.append(self._copy_state(current_state.get("locals", {})))
                function_name = trace_item.get("name")
                current_state.setdefault("call_stack", []).append(function_name)
                params = trace_item.get("params") or []
                args = trace_item.get("args") or []
                for index, arg in enumerate(args):
                    name = params[index] if index < len(params) else f"arg{index}"
                    current_state.setdefault("locals", {})[name] = arg
                    binary_trees = trace_item.get("binaryTrees") or []
                    if index < len(binary_trees) and binary_trees[index]:
                        normalized_name = str(name).strip().lower()
                        is_root_tree = normalized_name in {"root", "tree", "head"}
                        binary_tree_state = current_state.setdefault("binary_trees", {})
                        if not (is_root_tree and name in binary_tree_state):
                            binary_tree_state[name] = binary_trees[index]
                        if is_root_tree or not current_state.get("active_binary_tree"):
                            current_state["active_binary_tree"] = name
                        if is_root_tree and isinstance(arg, dict) and "val" in arg:
                            current_state["active_binary_node_value"] = arg.get("val")
                    if name in table_vars and isinstance(arg, list):
                        current_state.setdefault("tables", {})[name] = arg
                        current_state["active_table"] = name
                        current_state["active_cell"] = None
                node_id = f"call-{call_node_counter}"
                call_node_counter += 1
                label_args = ", ".join(
                    f"{params[index] if index < len(params) else f'arg{index}'}={self._format_trace_value(arg)}"
                    for index, arg in enumerate(args[:3])
                )
                if len(args) > 3:
                    label_args += ", ..."
                current_state.setdefault("call_tree", []).append({
                    "id": node_id,
                    "parent": call_node_stack[-1] if call_node_stack else "",
                    "label": f"{function_name}({label_args})",
                    "depth": len(call_node_stack),
                    "status": "active",
                })
                call_node_stack.append(node_id)
                current_state["active_call_id"] = node_id
                steps.append({
                    "action": f"Call {trace_item['name']} with [{', '.join(self._format_trace_value(arg) for arg in args)}]",
                    "state": self._copy_state(current_state),
                    "depth": trace_item["depth"]
                })

            elif trace_item["type"] == "function_exit":
                if call_node_stack:
                    finished_id = call_node_stack.pop()
                    for node in current_state.get("call_tree", []):
                        if node.get("id") == finished_id:
                            node["status"] = "done"
                            break
                    current_state["active_call_id"] = call_node_stack[-1] if call_node_stack else None
                if local_scopes:
                    restored_locals = local_scopes.pop()
                    for name in array_vars | object_vars | table_vars | collection_vars:
                        if name in current_state.get("locals", {}):
                            restored_locals[name] = current_state["locals"][name]
                    current_state["locals"] = restored_locals
                if current_state.get("call_stack"):
                    current_state["call_stack"].pop()
                steps.append({
                    "action": f"Return from {trace_item['name']}",
                    "state": self._copy_state(current_state)
                })

        return steps

    def _copy_state(self, state: Dict) -> Dict:
        return json.loads(json.dumps(state))

    def _format_trace_value(self, value: Any) -> str:
        if isinstance(value, dict):
            if {"val", "left", "right"}.issubset(value.keys()):
                return f"TreeNode({value.get('val')})"
            if len(value) > 4:
                keys = list(value.keys())[:3]
                preview = ", ".join(f"{key}: {self._format_trace_value(value[key])}" for key in keys)
                return "{" + preview + ", ...}"
            return "{" + ", ".join(f"{key}: {self._format_trace_value(val)}" for key, val in value.items()) + "}"
        if isinstance(value, list):
            if len(value) > 6:
                preview = ", ".join(self._format_trace_value(item) for item in value[:5])
                return f"[{preview}, ...]"
            return "[" + ", ".join(self._format_trace_value(item) for item in value) + "]"
        if value is None:
            return "null"
        return str(value)

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
            "variables": self.variable_info,
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
    #treePanel {{ position: relative; min-width: 100%; }}
    .tree-lines {{
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
      z-index: 0;
    }}
    .summary-row {{ display: flex; justify-content: center; gap: 48px; margin-bottom: 24px; }}
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
    .nodes {{ display: flex; justify-content: center; gap: 18px; min-width: 0; }}
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
    .table-wrap {{ display: inline-block; min-width: max-content; }}
    .table-wrap.below-tree {{ display: block; width: fit-content; margin: 22px auto 0; }}
    .table-title {{ margin: 2px 0 10px; color: #17212f; font-weight: 800; }}
    .collection-wrap, .binary-tree-wrap {{
        display: block;
      width: fit-content;
      min-width: 0;
      margin: 22px auto 0;
      position: relative;
      z-index: 1;
    }}
    .collection-title, .binary-tree-title {{
      margin: 2px 0 10px;
      color: #17212f;
      font-weight: 800;
    }}
    .collection-body {{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      max-width: 760px;
    }}
    .collection-chip, .map-entry {{
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      color: #17212f;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 13px;
      font-weight: 750;
    }}
    .collection-chip.active {{
      background: #fef08a;
      border-color: #eab308;
      box-shadow: inset 0 0 0 2px #facc15;
    }}
    .map-entry {{ gap: 8px; }}
    .map-arrow {{ color: #64748b; font-weight: 800; }}
    .dp-table {{ border-collapse: collapse; font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; }}
    .dp-table th, .dp-table td {{
      min-width: 42px;
      height: 34px;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
      text-align: center;
      background: #fff;
    }}
    .dp-table th {{ background: #f1f5f9; color: #475569; font-weight: 800; }}
    .dp-table td.active-cell {{
      background: #fef08a;
      border-color: #eab308;
      box-shadow: inset 0 0 0 2px #facc15;
      font-weight: 850;
    }}
    .call-node {{
      max-width: 190px;
      padding: 7px 9px;
      border: 2px solid #94a3b8;
      border-radius: 8px;
      background: #fff;
      color: #17212f;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      font-weight: 750;
      overflow-wrap: anywhere;
      text-align: center;
    }}
    .call-node.active {{
      border-color: #facc15;
      box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.25);
    }}
    .call-node.done {{ border-color: #22c55e; }}
    .tree-canvas {{
      position: relative;
      min-width: 320px;
      min-height: 140px;
      margin: 8px auto 0;
    }}
    .tree-canvas svg {{
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
      z-index: 0;
    }}
    .tree-edge {{
      stroke: #94a3b8;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }}
    .call-tree-node-wrap {{
      position: absolute;
      z-index: 1;
      display: flex;
      justify-content: center;
      width: 190px;
    }}
    .binary-node {{
      position: absolute;
      width: 38px;
      height: 38px;
      display: inline-grid;
      place-items: center;
      border: 2px solid #94a3b8;
      border-radius: 50%;
      background: #fff;
      color: #17212f;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 13px;
      font-weight: 850;
      z-index: 1;
    }}
    .binary-node.active {{
      border-color: #dc2626;
      background: #fee2e2;
      color: #991b1b;
      box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.18);
    }}
    .binary-tree-wrap .tree-row {{ grid-template-columns: 74px minmax(0, 1fr); }}
    .binary-tree-wrap .nodes {{ gap: 34px; }}
    .binary-tree-wrap .node-wrap {{ min-width: 64px; }}
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
        <h2 id="visualTitle">Decision Tree</h2>
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

    function renderStatePanel(state, active) {{
      const panel = document.getElementById("statePanel");
      panel.innerHTML = "";
      const lines = [
        ["subset[]", state.subset || []],
        ["decision", active?.label || "-"],
      ];
      const locals = state.locals || {{}};
      Object.keys(locals).sort().forEach((name) => {{
        lines.push([name, locals[name]]);
      }});

      const seen = new Set();
      lines.forEach(([name, value]) => {{
        const key = `${{name}}:${{JSON.stringify(value)}}`;
        if (seen.has(key)) return;
        seen.add(key);
        const line = document.createElement("div");
        line.className = "state-line";
        line.textContent = `${{name}}: ${{typeof value === "string" ? value : JSON.stringify(value)}}`;
        panel.append(line);
      }});
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

    function isMatrix(value) {{
      return Array.isArray(value) && value.length > 0 && value.every((row) => Array.isArray(row));
    }}

    function normalizeTable(value) {{
      if (!Array.isArray(value)) return null;
      if (isMatrix(value)) return value;
      return [value];
    }}

    function renderTablePanel(state, belowTree = false) {{
      const treePanel = document.getElementById("treePanel");
      const previous = treePanel.querySelector(".tree-lines");
      previous?.remove();
      const tables = state.tables || {{}};
      const tableName = state.active_table || Object.keys(tables).find((name) => normalizeTable(tables[name]));
      const table = tableName ? tables[tableName] : null;
      const rows = normalizeTable(table);
      if (!rows) return false;

      const wrap = document.createElement("div");
      wrap.className = "table-wrap" + (belowTree ? " below-tree" : "");
      const title = document.createElement("div");
      title.className = "table-title";
      title.textContent = `${{tableName}} table`;
      const grid = document.createElement("table");
      grid.className = "dp-table";

      const colCount = Math.max(...rows.map((row) => row.length), 0);
      const head = document.createElement("tr");
      head.append(document.createElement("th"));
      for (let col = 0; col < colCount; col += 1) {{
        const th = document.createElement("th");
        th.textContent = String(col);
        head.append(th);
      }}
      grid.append(head);

      const activeCell = state.active_cell || [];
      const activeRow = activeCell.length === 1 ? 0 : activeCell[0];
      const activeCol = activeCell.length === 1 ? activeCell[0] : activeCell[1];
      rows.forEach((row, rowIndex) => {{
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = String(rowIndex);
        tr.append(th);
        for (let col = 0; col < colCount; col += 1) {{
          const td = document.createElement("td");
          td.textContent = row[col] === undefined ? "" : String(row[col]);
          if (activeRow === rowIndex && activeCol === col) td.classList.add("active-cell");
          tr.append(td);
        }}
        grid.append(tr);
      }});

      wrap.append(title, grid);
      treePanel.append(wrap);
      return true;
    }}

    function displayValue(value) {{
      if (value === null) return "null";
      if (value === undefined) return "";
      if (typeof value === "string") return value;
      return JSON.stringify(value);
    }}

    function displayResult(value) {{
      if (value === null) return "null";
      if (value === undefined) return "";
      if (value && typeof value === "object" && "val" in value && "left" in value && "right" in value) {{
        return `TreeNode(${{value.val}})`;
      }}
      return displayValue(value);
    }}

    function renderCollectionPanel(state, belowTree = false) {{
      const treePanel = document.getElementById("treePanel");
      const collections = state.collections || {{}};
      const collectionName = state.active_collection || Object.keys(collections)[0];
      const item = collectionName ? collections[collectionName] : null;
      if (!item) return false;

      const kind = item.kind || "collection";
      const values = Array.isArray(item.value) ? item.value : [];
      const wrap = document.createElement("div");
      wrap.className = "collection-wrap" + (belowTree ? " below-tree" : "");
      const title = document.createElement("div");
      title.className = "collection-title";
      title.textContent = `${{collectionName}} ${{kind}}`;
      const body = document.createElement("div");
      body.className = "collection-body";

      if (!values.length) {{
        const empty = document.createElement("span");
        empty.className = "collection-chip";
        empty.textContent = "empty";
        body.append(empty);
      }} else if (kind === "map") {{
        values.forEach((entry) => {{
          const row = document.createElement("span");
          row.className = "map-entry";
          const key = document.createElement("span");
          key.textContent = displayValue(entry?.[0]);
          const arrow = document.createElement("span");
          arrow.className = "map-arrow";
          arrow.textContent = "=>";
          const value = document.createElement("span");
          value.textContent = displayValue(entry?.[1]);
          row.append(key, arrow, value);
          body.append(row);
        }});
      }} else {{
        values.forEach((value, index) => {{
          const chip = document.createElement("span");
          chip.className = "collection-chip" + (kind === "stack" && index === values.length - 1 ? " active" : "");
          chip.textContent = displayValue(value);
          body.append(chip);
        }});
      }}

      wrap.append(title, body);
      treePanel.append(wrap);
      return true;
    }}

    function renderBinaryTreePanel(state, belowTree = false) {{
      const treePanel = document.getElementById("treePanel");
      const trees = state.binary_trees || {{}};
      const treeName = state.active_binary_tree || Object.keys(trees)[0];
      const tree = treeName ? trees[treeName] : null;
      if (!tree || !tree.root || !tree.labels) return false;

      const adjacency = tree.adjacency || {{}};
      const labels = tree.labels || {{}};
      const activeNodeValue = state.active_binary_node_value;
      const depthByNode = new Map();
      const xByNode = new Map();
      const seen = new Set();
      let leafIndex = 0;
      let maxDepth = 0;

      function assignPosition(nodeId, depth) {{
        if (!nodeId || seen.has(nodeId)) return xByNode.get(nodeId) ?? leafIndex;
        seen.add(nodeId);
        depthByNode.set(nodeId, depth);
        maxDepth = Math.max(maxDepth, depth);

        const children = adjacency[nodeId] || [];
        if (!children.length) {{
          xByNode.set(nodeId, leafIndex);
          leafIndex += 1;
          return xByNode.get(nodeId);
        }}

        const childXs = children.map((childId) => assignPosition(childId, depth + 1));
        const x = childXs.reduce((sum, value) => sum + value, 0) / childXs.length;
        xByNode.set(nodeId, x);
        return x;
      }}

      assignPosition(tree.root, 0);
      if (!seen.size) return false;

      const wrap = document.createElement("div");
      wrap.className = "binary-tree-wrap" + (belowTree ? " below-tree" : "");
      const title = document.createElement("div");
      title.className = "binary-tree-title";
      title.textContent = `${{treeName}} TreeNode`;
      wrap.append(title);

      const nodeSize = 38;
      const horizontalGap = 92;
      const verticalGap = 74;
      const paddingX = 28;
      const paddingY = 22;
      const width = Math.max(260, Math.max(1, leafIndex) * horizontalGap + paddingX * 2);
      const height = Math.max(120, (maxDepth + 1) * verticalGap + paddingY * 2);
      const canvas = document.createElement("div");
      canvas.className = "tree-canvas";
      canvas.style.width = `${{width}}px`;
      canvas.style.height = `${{height}}px`;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));

      const pointFor = (nodeId) => ({{
        x: paddingX + xByNode.get(nodeId) * horizontalGap + nodeSize / 2,
        y: paddingY + depthByNode.get(nodeId) * verticalGap + nodeSize / 2,
      }});

      for (const [parentId, children] of Object.entries(adjacency)) {{
        if (!seen.has(parentId)) continue;
        const parentPoint = pointFor(parentId);
        children.forEach((childId) => {{
          if (!seen.has(childId)) return;
          const childPoint = pointFor(childId);
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.classList.add("tree-edge");
          line.setAttribute("x1", String(parentPoint.x));
          line.setAttribute("y1", String(parentPoint.y + nodeSize / 2));
          line.setAttribute("x2", String(childPoint.x));
          line.setAttribute("y2", String(childPoint.y - nodeSize / 2));
          svg.append(line);
        }});
      }}
      canvas.append(svg);

      for (const nodeId of seen) {{
        const point = pointFor(nodeId);
        const isActive = activeNodeValue !== null && activeNodeValue !== undefined && labels[nodeId] === activeNodeValue;
        const node = document.createElement("div");
        node.className = "binary-node" + (isActive ? " active" : "");
        node.style.left = `${{point.x - nodeSize / 2}}px`;
        node.style.top = `${{point.y - nodeSize / 2}}px`;
        node.textContent = displayValue(labels[nodeId]);
        canvas.append(node);
      }}

      wrap.append(canvas);
      treePanel.append(wrap);
      return true;
    }}

    function renderCallTreePanel(state) {{
      const treePanel = document.getElementById("treePanel");
      const calls = state.call_tree || [];
      if (!calls.length) return false;

      const byId = new Map(calls.map((node) => [node.id, node]));
      const childrenByParent = new Map();
      const roots = [];
      calls.forEach((node) => {{
        const parent = node.parent || "";
        if (!parent || !byId.has(parent)) {{
          roots.push(node.id);
          return;
        }}
        if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
        childrenByParent.get(parent).push(node.id);
      }});

      const xByNode = new Map();
      const depthByNode = new Map();
      const seen = new Set();
      let leafIndex = 0;
      let maxDepth = 0;

      function assignPosition(nodeId, depth) {{
        if (!nodeId || seen.has(nodeId)) return xByNode.get(nodeId) ?? leafIndex;
        seen.add(nodeId);
        depthByNode.set(nodeId, depth);
        maxDepth = Math.max(maxDepth, depth);
        const children = childrenByParent.get(nodeId) || [];
        if (!children.length) {{
          xByNode.set(nodeId, leafIndex);
          leafIndex += 1;
          return xByNode.get(nodeId);
        }}
        const childXs = children.map((childId) => assignPosition(childId, depth + 1));
        const x = childXs.reduce((sum, value) => sum + value, 0) / childXs.length;
        xByNode.set(nodeId, x);
        return x;
      }}

      roots.forEach((rootId) => assignPosition(rootId, 0));
      if (!seen.size) return false;

      const nodeWidth = 190;
      const nodeHeight = 54;
      const horizontalGap = 230;
      const verticalGap = 92;
      const paddingX = 24;
      const paddingY = 18;
      const width = Math.max(360, Math.max(1, leafIndex) * horizontalGap + paddingX * 2);
      const height = Math.max(150, (maxDepth + 1) * verticalGap + paddingY * 2 + nodeHeight);
      const canvas = document.createElement("div");
      canvas.className = "tree-canvas";
      canvas.style.width = `${{width}}px`;
      canvas.style.height = `${{height}}px`;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));

      const pointFor = (nodeId) => ({{
        x: paddingX + xByNode.get(nodeId) * horizontalGap + nodeWidth / 2,
        y: paddingY + depthByNode.get(nodeId) * verticalGap + nodeHeight / 2,
      }});

      for (const [parentId, children] of childrenByParent.entries()) {{
        if (!seen.has(parentId)) continue;
        const parentPoint = pointFor(parentId);
        children.forEach((childId) => {{
          if (!seen.has(childId)) return;
          const childPoint = pointFor(childId);
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const midY = parentPoint.y + (childPoint.y - parentPoint.y) / 2;
          path.classList.add("tree-edge");
          path.setAttribute("d", `M ${{parentPoint.x}} ${{parentPoint.y + nodeHeight / 2}} V ${{midY}} H ${{childPoint.x}} V ${{childPoint.y - nodeHeight / 2}}`);
          svg.append(path);
        }});
      }}
      canvas.append(svg);

      calls.forEach((item) => {{
        if (!seen.has(item.id)) return;
        const point = pointFor(item.id);
        const wrap = document.createElement("div");
        wrap.className = "call-tree-node-wrap";
        wrap.style.left = `${{point.x - nodeWidth / 2}}px`;
        wrap.style.top = `${{point.y - nodeHeight / 2}}px`;
        const node = document.createElement("div");
        node.className = "call-node" + (item.id === state.active_call_id ? " active" : "") + (item.status === "done" ? " done" : "");
        node.textContent = item.label;
        wrap.append(node);
        canvas.append(wrap);
      }});

      treePanel.append(canvas);
      return true;
    }}

    function render() {{
      const step = data.steps[currentStep] || {{ action: "Start", state: {{ subset: [], result: [], decision_tree: [] }} }};
      const state = step.state;
      const decisions = state.decision_tree || [];
      const active = decisions[decisions.length - 1] || null;
      const choicesData = Array.isArray(data.choices) ? data.choices : data.args;
      const slotCount = Math.max(1, Array.isArray(choicesData) ? choicesData.length : 1);

      document.getElementById("stepBox").textContent = `Step ${{currentStep + 1}}: ${{step.action || "Start"}}`;
      renderStatePanel(state, active);
      const finalResult = data.result !== undefined ? data.result : state.result || [];
      document.getElementById("resultBox").textContent = `Final Result: ${{displayResult(finalResult)}}`;

      const treePanel = document.getElementById("treePanel");
      treePanel.innerHTML = "";
      valueColorMap.clear();
      (choicesData || []).forEach(colorForValue);

      if (renderCallTreePanel(state)) {{
        renderBinaryTreePanel(state, true);
        renderCollectionPanel(state, true);
        renderTablePanel(state, true);
        document.getElementById("visualTitle").textContent = "Decision Tree";
        document.getElementById("prevButton").disabled = currentStep === 0;
        document.getElementById("nextButton").disabled = currentStep >= data.steps.length - 1;
        return;
      }}
      if (renderBinaryTreePanel(state)) {{
        renderCollectionPanel(state, true);
        renderTablePanel(state, true);
        document.getElementById("visualTitle").textContent = "Binary Tree";
        document.getElementById("prevButton").disabled = currentStep === 0;
        document.getElementById("nextButton").disabled = currentStep >= data.steps.length - 1;
        return;
      }}
      if (renderCollectionPanel(state)) {{
        renderTablePanel(state, true);
        document.getElementById("visualTitle").textContent = "Collection";
        document.getElementById("prevButton").disabled = currentStep === 0;
        document.getElementById("nextButton").disabled = currentStep >= data.steps.length - 1;
        return;
      }}
      if (renderTablePanel(state)) {{
        document.getElementById("visualTitle").textContent = "DP Table";
        document.getElementById("prevButton").disabled = currentStep === 0;
        document.getElementById("nextButton").disabled = currentStep >= data.steps.length - 1;
        return;
      }}
      document.getElementById("visualTitle").textContent = "Decision Tree";

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
                for name, value in sorted(state.get("locals", {}).items()):
                    lines.append(f"{name}: {value}")

                group = VGroup()
                for line in lines[:10]:
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

            def normalize_table(self, table):
                if not isinstance(table, list):
                    return None
                if table and all(isinstance(row, list) for row in table):
                    return table
                return [table]

            def render_table(self, step):
                state = step["state"]
                tables = state.get("tables", {})
                table_name = state.get("active_table")
                if not table_name:
                    for name, value in tables.items():
                        if self.normalize_table(value):
                            table_name = name
                            break
                table = self.normalize_table(tables.get(table_name)) if table_name else None
                if not table:
                    return self.render_decision_tree(step)

                max_rows = min(len(table), 8)
                max_cols = min(max((len(row) for row in table), default=0), 10)
                active_cell = state.get("active_cell") or []
                active_row = 0 if len(active_cell) == 1 else active_cell[0] if active_cell else None
                active_col = active_cell[0] if len(active_cell) == 1 else active_cell[1] if len(active_cell) > 1 else None

                diagram = VGroup()
                title = self.fitted_text(f"{table_name} table", font_size=18, color=WHITE, max_width=2.4)
                diagram.add(title)

                grid = VGroup()
                cell_w = 0.58
                cell_h = 0.42
                header_color = DARK_GRAY
                for row_index in range(max_rows + 1):
                    for col_index in range(max_cols + 1):
                        x = (col_index - max_cols / 2) * cell_w
                        y = ((max_rows / 2) - row_index) * cell_h
                        is_header = row_index == 0 or col_index == 0
                        data_row = row_index - 1
                        data_col = col_index - 1
                        is_active = data_row == active_row and data_col == active_col
                        rect = Rectangle(
                            width=cell_w,
                            height=cell_h,
                            color=YELLOW if is_active else GRAY,
                            stroke_width=3 if is_active else 1,
                            fill_color=YELLOW if is_active else header_color if is_header else BLACK,
                            fill_opacity=0.35 if is_active else 0.35 if is_header else 0,
                        )
                        rect.move_to(RIGHT * x + UP * y)
                        label_text = ""
                        if row_index == 0 and col_index > 0:
                            label_text = str(data_col)
                        elif col_index == 0 and row_index > 0:
                            label_text = str(data_row)
                        elif row_index > 0 and col_index > 0:
                            row = table[data_row] if data_row < len(table) else []
                            label_text = "" if data_col >= len(row) else str(row[data_col])
                        cell = VGroup(rect)
                        if label_text != "":
                            color = BLACK if is_active else WHITE
                            label = self.fitted_text(label_text, font_size=13, color=color, max_width=cell_w - 0.1)
                            label.move_to(rect.get_center())
                            cell.add(label)
                        grid.add(cell)

                grid.next_to(title, DOWN, buff=0.25)
                diagram.add(grid)
                return diagram

            def render_collection(self, step):
                state = step["state"]
                collections = state.get("collections", {})
                name = state.get("active_collection")
                if not name and collections:
                    name = next(iter(collections))
                item = collections.get(name) if name else None
                if not item:
                    return self.render_decision_tree(step)

                kind = item.get("kind")
                value = item.get("value") or []
                diagram = VGroup()
                title = self.fitted_text(f"{name} {kind}", font_size=18, color=WHITE, max_width=2.6)
                diagram.add(title)

                body = VGroup()
                if kind == "map":
                    rows = value[:8] if isinstance(value, list) else []
                    for key, val in rows:
                        key_text = self.fitted_text(str(key), font_size=13, color=WHITE, max_width=1.2)
                        val_text = self.fitted_text(str(val), font_size=13, color=WHITE, max_width=1.2)
                        arrow = self.fitted_text("->", font_size=13, color=GRAY, max_width=0.35)
                        row = VGroup(key_text, arrow, val_text).arrange(RIGHT, buff=0.08)
                        box = RoundedRectangle(width=max(1.7, row.width + 0.25), height=0.34, corner_radius=0.05, color=BLUE, stroke_width=1.5)
                        row.move_to(box.get_center())
                        body.add(VGroup(box, row))
                    body.arrange(DOWN, buff=0.06)
                elif kind == "set":
                    values = value[:10] if isinstance(value, list) else []
                    for entry in values:
                        circle = Circle(radius=0.2, color=TEAL, fill_color=TEAL, fill_opacity=0.35)
                        label = self.fitted_text(str(entry), font_size=12, color=WHITE, max_width=0.35)
                        label.move_to(circle.get_center())
                        body.add(VGroup(circle, label))
                    body.arrange(RIGHT, buff=0.08)
                else:
                    values = value[:10] if isinstance(value, list) else []
                    for index, entry in enumerate(values):
                        rect = RoundedRectangle(
                            width=0.48,
                            height=0.42,
                            corner_radius=0.05,
                            color=YELLOW if index == len(values) - 1 else BLUE,
                            stroke_width=2.8 if index == len(values) - 1 else 1.5,
                            fill_color=BLUE,
                            fill_opacity=0.22,
                        )
                        label = self.fitted_text(str(entry), font_size=12, color=WHITE, max_width=0.38)
                        label.move_to(rect.get_center())
                        body.add(VGroup(rect, label))
                    body.arrange(UP, buff=0.04)

                if len(body) == 0:
                    empty = self.fitted_text("(empty)", font_size=14, color=GRAY, max_width=1.4)
                    body.add(empty)

                body.next_to(title, DOWN, buff=0.22)
                diagram.add(body)
                return diagram

            def render_binary_tree(self, step):
                state = step["state"]
                trees = state.get("binary_trees", {})
                name = state.get("active_binary_tree")
                if not name and trees:
                    name = next(iter(trees))
                tree_data = trees.get(name) if name else None
                if not tree_data:
                    return self.render_decision_tree(step)

                adjacency = tree_data.get("adjacency", {})
                labels = tree_data.get("labels", {})
                root = tree_data.get("root")
                if not adjacency or not root:
                    return self.render_decision_tree(step)

                try:
                    if HAS_MANIM_DSA and MTree is not None:
                        style = MTreeStyle.GREEN if MTreeStyle is not None else None
                        tree = MTree(adjacency, root=root, style=style).node_layout() if style else MTree(adjacency, root=root).node_layout()
                        overlays = VGroup()
                        for node_id, label_value in labels.items():
                            node_mobject = tree.nodes.get(str(node_id))
                            if node_mobject is None:
                                continue
                            node_mobject.label.set_opacity(0)
                            label = self.fitted_text(str(label_value), font_size=15, color=WHITE, max_width=0.45)
                            label.move_to(node_mobject.get_center())
                            overlays.add(label)
                        title = self.fitted_text(f"{name} TreeNode", font_size=18, color=WHITE, max_width=2.8)
                        group = VGroup(title, VGroup(tree, overlays)).arrange(DOWN, buff=0.22)
                        return group
                except Exception:
                    pass

                rows = {}
                queue = [(root, 0)]
                visited = set()
                while queue:
                    node_id, depth = queue.pop(0)
                    if node_id in visited or depth > 5:
                        continue
                    visited.add(node_id)
                    rows.setdefault(depth, []).append(node_id)
                    for child in adjacency.get(node_id, []):
                        queue.append((child, depth + 1))

                diagram = VGroup()
                title = self.fitted_text(f"{name} TreeNode", font_size=18, color=WHITE, max_width=2.8)
                diagram.add(title)
                positioned = {}
                for depth, node_ids in rows.items():
                    count = len(node_ids)
                    y = 1.15 - depth * 0.62
                    for index, node_id in enumerate(node_ids):
                        x = 0 if count == 1 else -2.2 + 4.4 * index / max(1, count - 1)
                        circle = Circle(radius=0.2, color=GREEN, fill_color=GREEN, fill_opacity=0.28)
                        circle.move_to(RIGHT * x + UP * y)
                        label = self.fitted_text(str(labels.get(node_id, "")), font_size=13, color=WHITE, max_width=0.34)
                        label.move_to(circle.get_center())
                        rendered = VGroup(circle, label)
                        positioned[node_id] = rendered
                        diagram.add(rendered)
                for parent, children in adjacency.items():
                    for child in children:
                        if parent in positioned and child in positioned:
                            diagram.add(Line(positioned[parent].get_bottom(), positioned[child].get_top(), color=GRAY, stroke_width=1.5).set_z_index(-1))
                return diagram

            def render_call_tree(self, step):
                state = step["state"]
                calls = state.get("call_tree", [])
                if not calls:
                    return self.render_decision_tree(step)

                diagram = VGroup()
                rows = {}
                for node in calls:
                    rows.setdefault(node.get("depth", 0), []).append(node)

                positioned = {}
                max_depth = min(max(rows.keys(), default=0), 5)
                y_top = 1.55
                y_gap = 0.72
                for depth in range(0, max_depth + 1):
                    depth_nodes = rows.get(depth, [])[:6]
                    if not depth_nodes:
                        continue
                    y = y_top - depth * y_gap
                    row_label = self.fitted_text("root" if depth == 0 else f"depth {depth}", font_size=11, color=GRAY, max_width=0.9)
                    row_label.move_to(LEFT * 3.35 + UP * y)
                    diagram.add(row_label)
                    count = len(depth_nodes)
                    for index, node in enumerate(depth_nodes):
                        x = 0 if count == 1 else -2.45 + 4.9 * index / max(1, count - 1)
                        is_active = node.get("id") == state.get("active_call_id")
                        is_done = node.get("status") == "done"
                        color = YELLOW if is_active else GREEN if is_done else GRAY
                        rect = RoundedRectangle(
                            width=1.28,
                            height=0.42,
                            corner_radius=0.07,
                            color=color,
                            stroke_width=3 if is_active else 1.6,
                            fill_color=BLACK,
                            fill_opacity=0.08,
                        )
                        rect.move_to(RIGHT * x + UP * y)
                        label = self.fitted_text(node.get("label", ""), font_size=10, color=WHITE, max_width=1.14)
                        label.move_to(rect.get_center())
                        rendered = VGroup(rect, label)
                        positioned[node.get("id")] = rendered
                        diagram.add(rendered)

                for node in calls:
                    child = positioned.get(node.get("id"))
                    parent = positioned.get(node.get("parent"))
                    if child and parent:
                        diagram.add(Line(parent.get_bottom(), child.get_top(), color=GRAY, stroke_width=1.5).set_z_index(-1))

                return diagram

            def render_call_tree_with_dsa(self, step):
                if not HAS_MANIM_DSA or MTree is None:
                    return self.render_call_tree(step)

                state = step["state"]
                calls = state.get("call_tree", [])
                if not calls:
                    return self.render_decision_tree(step)

                try:
                    labels_by_id = {}
                    tree = {}
                    for index, node in enumerate(calls):
                        node_id = str(node.get("id") or f"call-{index}")
                        label = str(node.get("label") or node_id)
                        labels_by_id[node_id] = label[:28]
                        tree.setdefault(node_id, [])

                    root_id = str(calls[0].get("id") or "call-0")
                    for node in calls:
                        node_id = str(node.get("id"))
                        parent_id = str(node.get("parent") or "")
                        if parent_id and parent_id in tree and node_id in tree:
                            tree[parent_id].append(node_id)

                    style = MTreeStyle.BLUE if MTreeStyle is not None else None
                    rendered = MTree(tree, root=root_id, style=style).node_layout() if style else MTree(tree, root=root_id).node_layout()

                    # MTree labels are node ids by default. Overlay compact call labels so
                    # the tree stays tied to the traced function calls.
                    overlays = VGroup()
                    for node_id, label in labels_by_id.items():
                        node_mobject = rendered.nodes.get(node_id)
                        if node_mobject is None:
                            continue
                        node_mobject.label.set_opacity(0)
                        text = self.fitted_text(label, font_size=9, color=WHITE, max_width=1.05)
                        text.move_to(node_mobject.get_center())
                        overlays.add(text)

                    active_id = str(state.get("active_call_id") or "")
                    if active_id:
                        active_node = rendered.nodes.get(active_id)
                        if active_node is not None:
                            active_node.circle.set_stroke(YELLOW, width=8)
                            active_node.circle.set_fill(YELLOW, opacity=0.25)

                    for node in calls:
                        if node.get("status") != "done":
                            continue
                        node_id = str(node.get("id"))
                        done_node = rendered.nodes.get(node_id)
                        if done_node is not None and node_id != active_id:
                            done_node.circle.set_stroke(GREEN, width=5)

                    group = VGroup(rendered, overlays)
                    return group
                except Exception:
                    return self.render_call_tree(step)

            def render_center_visual(self, step):
                state = step["state"]
                if state.get("call_tree") and not state.get("decision_tree"):
                    call_tree = self.render_call_tree_with_dsa(step)
                    if state.get("binary_trees"):
                        tree = self.render_binary_tree(step)
                        tree.scale(0.78)
                        group = VGroup(call_tree, tree).arrange(DOWN, buff=0.28)
                        return group
                    if state.get("tables"):
                        table = self.render_table(step)
                        table.scale(0.72)
                        group = VGroup(call_tree, table).arrange(DOWN, buff=0.28)
                        return group
                    if state.get("collections"):
                        collection = self.render_collection(step)
                        collection.scale(0.78)
                        group = VGroup(call_tree, collection).arrange(DOWN, buff=0.28)
                        return group
                    return call_tree
                if state.get("tables"):
                    return self.render_table(step)
                if state.get("collections"):
                    return self.render_collection(step)
                if state.get("binary_trees"):
                    return self.render_binary_tree(step)
                return self.render_decision_tree(step)

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
                has_table_visual = any(step.get("state", {}).get("tables") for step in animation_steps)
                tree_label = Text("DP Table" if has_table_visual else "Decision Tree", font_size=20, color=GREEN)
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
                    new_tree_content = self.render_center_visual(step)
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
    snippets_dir = Path("media/texts/js")
    tree_node_code = (snippets_dir / "tree_node.js").read_text(encoding="utf-8")
    js_code = "\n\n".join([
        tree_node_code,
        (snippets_dir / "solution.js").read_text(encoding="utf-8"),
    ])

    converter = AutoManimConverter(js_code, "solution", [6,2,3,4,5,9,7])
    viewer = converter.generate_interactive_viewer("quick_sort")
    print(f"Interactive viewer: {viewer}")
