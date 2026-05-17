import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as monaco from 'monaco-editor';
import './style.css';

(self as unknown as { MonacoEnvironment: { getWorker: (_workerId: string, label: string) => Worker } }).MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) => {
    if (label === 'javascript' || label === 'typescript') {
      return new tsWorker();
    }

    return new editorWorker();
  },
};

type DebugSnapshot = {
  line: number;
  isBreakpoint: boolean;
  variables: Record<string, unknown>;
};

type RunState = 'idle' | 'running' | 'paused' | 'done' | 'error';
type ResumeMode = 'continue' | 'step';

type Problem = {
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  args: string;
  code: string;
  titleSlug?: string;
  description?: string;
  source?: 'local' | 'leetcode' | 'alfa' | 'deepseek';
  isStarter?: boolean;
};

type LeetCodeQuestionSummary = {
  frontendQuestionId?: string;
  questionFrontendId?: string;
  title: string;
  titleSlug: string;
  difficulty: string;
  topicTags: Array<{ name: string }>;
};

type LeetCodeQuestionDetail = {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  content: string;
  difficulty: string;
  exampleTestcases: string;
  solution: {
    content: string | null;
    body: string | null;
    canSeeDetail: boolean | null;
    paidOnly: boolean | null;
  } | null;
  codeSnippets: Array<{
    langSlug: string;
    code: string;
  }>;
  topicTags: Array<{ name: string }>;
};

type AlfaOfficialSolutionResponse = {
  question?: {
    solution?: {
      title?: string;
      content?: string | null;
      body?: string | null;
      canSeeDetail?: boolean;
      paidOnly?: boolean;
    } | null;
  };
};

type PlaygroundCodeResponse = {
  playgroundCode: {
    code: string | null;
  } | null;
};

type CategoryNode = {
  title: string;
  query: string;
  children: Array<{
    title: string;
    query: string;
  }>;
};

const defaultProblems: Problem[] = [
  {
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['array', 'hash table'],
    args: '[[2, 7, 11, 15], 9]',
    source: 'local',
    titleSlug: 'two-sum',
    code: `function solution(nums, target) {
  const seen = new Map();

  for (let i = 0; i < nums.length; i++) {
    const needed = target - nums[i];

    if (seen.has(needed)) {
      return [seen.get(needed), i];
    }

    seen.set(nums[i], i);
  }

  return [];
}`,
  },
  {
    id: 121,
    title: 'Best Time to Buy and Sell Stock',
    difficulty: 'Easy',
    tags: ['array', 'dynamic programming'],
    args: '[[7, 1, 5, 3, 6, 4]]',
    source: 'local',
    titleSlug: 'best-time-to-buy-and-sell-stock',
    code: `function solution(prices) {
  let minPrice = Infinity;
  let bestProfit = 0;

  for (let i = 0; i < prices.length; i++) {
    minPrice = Math.min(minPrice, prices[i]);
    bestProfit = Math.max(bestProfit, prices[i] - minPrice);
  }

  return bestProfit;
}`,
  },
  {
    id: 704,
    title: 'Binary Search',
    difficulty: 'Easy',
    tags: ['array', 'binary search'],
    args: '[[-1, 0, 3, 5, 9, 12], 9]',
    source: 'local',
    titleSlug: 'binary-search',
    code: `function solution(nums, target) {
  let left = 0;
  let right = nums.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (nums[mid] === target) {
      return mid;
    }

    if (nums[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return -1;
}`,
  },
  {
    id: 53,
    title: 'Maximum Subarray',
    difficulty: 'Medium',
    tags: ['array', 'dynamic programming'],
    args: '[[-2, 1, -3, 4, -1, 2, 1, -5, 4]]',
    source: 'local',
    titleSlug: 'maximum-subarray',
    code: `function solution(nums) {
  let current = nums[0];
  let best = nums[0];

  for (let i = 1; i < nums.length; i++) {
    current = Math.max(nums[i], current + nums[i]);
    best = Math.max(best, current);
  }

  return best;
}`,
  },
  {
    id: 20,
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    tags: ['string', 'stack'],
    args: '["()[]{}"]',
    source: 'local',
    titleSlug: 'valid-parentheses',
    code: `function solution(s) {
  const stack = [];
  const pairs = new Map([
    [')', '('],
    [']', '['],
    ['}', '{'],
  ]);

  for (let i = 0; i < s.length; i++) {
    const char = s[i];

    if (pairs.has(char)) {
      if (stack.pop() !== pairs.get(char)) {
        return false;
      }
    } else {
      stack.push(char);
    }
  }

  return stack.length === 0;
}`,
  },
];

let problems: Problem[] = [...defaultProblems];
const starterCode = problems[0].code;
const defaultArgs = problems[0].args;
let searchRequestId = 0;

const searchAliases: Record<string, string[]> = {
  'two point': ['two pointers', 'two pointer'],
  'two pointer': ['two pointers'],
  twopoint: ['two pointers', 'two pointer'],
  pointer: ['two pointers'],
  stack: ['stack', 'monotonic stack'],
  queue: ['queue', 'monotonic queue', 'priority queue'],
  set: ['hash table', 'set', 'hash set'],
  map: ['hash table', 'map', 'hash map'],
  hashmap: ['hash table', 'hash map'],
  hashset: ['hash table', 'hash set'],
  tree: ['tree', 'binary tree'],
  'binary tree': ['binary tree', 'tree', 'depth-first search', 'breadth-first search'],
  bst: ['binary search tree', 'tree'],
  combination: ['backtracking', 'combinatorics', 'combination'],
  combinations: ['backtracking', 'combinatorics', 'combination'],
  permutation: ['backtracking', 'permutation'],
  permutations: ['backtracking', 'permutation'],
  subset: ['backtracking', 'bit manipulation', 'subset'],
  subsets: ['backtracking', 'bit manipulation', 'subset'],
  binary: ['binary search', 'binary tree', 'binary search tree'],
};

const categoryTree: CategoryNode[] = [
  {
    title: 'Array & String',
    query: 'array',
    children: [
      { title: 'Two Pointers', query: 'two pointers' },
      { title: 'Sliding Window', query: 'sliding window' },
      { title: 'Prefix Sum', query: 'prefix sum' },
      { title: 'String', query: 'string' },
    ],
  },
  {
    title: 'Hashing',
    query: 'hash table',
    children: [
      { title: 'Hash Map', query: 'map' },
      { title: 'Hash Set', query: 'set' },
      { title: 'Counting', query: 'counting' },
    ],
  },
  {
    title: 'Stack & Queue',
    query: 'stack',
    children: [
      { title: 'Stack', query: 'stack' },
      { title: 'Monotonic Stack', query: 'monotonic stack' },
      { title: 'Queue', query: 'queue' },
      { title: 'Priority Queue', query: 'priority queue' },
    ],
  },
  {
    title: 'Tree',
    query: 'tree',
    children: [
      { title: 'Binary Tree', query: 'binary tree' },
      { title: 'Binary Search Tree', query: 'binary search tree' },
      { title: 'DFS', query: 'depth first search' },
      { title: 'BFS', query: 'breadth first search' },
    ],
  },
  {
    title: 'Graph',
    query: 'graph',
    children: [
      { title: 'Graph', query: 'graph' },
      { title: 'Union Find', query: 'union find' },
      { title: 'Topological Sort', query: 'topological sort' },
      { title: 'Shortest Path', query: 'shortest path' },
    ],
  },
  {
    title: 'Search & Sort',
    query: 'binary search',
    children: [
      { title: 'Binary Search', query: 'binary search' },
      { title: 'Sorting', query: 'sorting' },
      { title: 'Merge Sort', query: 'merge sort' },
      { title: 'Quickselect', query: 'quickselect' },
    ],
  },
  {
    title: 'Backtracking',
    query: 'backtracking',
    children: [
      { title: 'Combination', query: 'combination' },
      { title: 'Permutation', query: 'permutation' },
      { title: 'Subset', query: 'subset' },
    ],
  },
  {
    title: 'Dynamic Programming',
    query: 'dynamic programming',
    children: [
      { title: '1D DP', query: 'dynamic programming' },
      { title: 'Knapsack', query: 'knapsack' },
      { title: 'Memoization', query: 'memoization' },
    ],
  },
];

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found');
}

app.innerHTML = `
  <main class="debugger-shell">
    <aside class="problem-panel">
      <div class="problem-search">
        <label for="problemSearch">Search problems</label>
        <div class="problem-search-row">
          <input id="problemSearch" type="search" autocomplete="off" placeholder="1, Two Sum, Valid Parentheses" />
          <button id="problemSearchButton" type="button">Search</button>
        </div>
      </div>
      <div id="problemList" class="problem-list" aria-label="LeetCode problem results"></div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <h1>LeetCode JS Debugger</h1>
          <p>Click the Monaco gutter to set breakpoints, then run or step through the function.</p>
        </div>
        <div class="run-controls">
          <button id="runButton" type="button">Run</button>
          <button id="resumeButton" type="button" disabled>Resume</button>
          <button id="stepOverButton" type="button" disabled>Step Over</button>
          <button id="stepInButton" type="button" disabled>Step In</button>
          <button id="stopButton" type="button" disabled>Stop</button>
        </div>
      </header>
      <div id="editor" class="editor" aria-label="JavaScript editor"></div>
    </section>

    <aside class="side-panel">
      <section class="panel-block">
        <label for="argsInput">Function arguments</label>
        <textarea id="argsInput" spellcheck="false"></textarea>
      </section>

      <section class="panel-block status-card">
        <div class="status-row">
          <span>State</span>
          <strong id="stateText">Idle</strong>
        </div>
        <div class="status-row">
          <span>Paused line</span>
          <strong id="lineText">-</strong>
        </div>
      </section>

      <section class="panel-block">
        <h2>Variables</h2>
        <div id="variablesPanel" class="variables empty">Run to inspect variables at a breakpoint.</div>
      </section>

      <section class="panel-block">
        <h2>Output</h2>
        <pre id="outputPanel" class="output">No output yet.</pre>
      </section>
    </aside>

  </main>
`;

const editorElement = requiredElement<HTMLDivElement>('#editor');
const problemSearch = requiredElement<HTMLInputElement>('#problemSearch');
const problemSearchButton = requiredElement<HTMLButtonElement>('#problemSearchButton');
const problemList = requiredElement<HTMLDivElement>('#problemList');
const argsInput = requiredElement<HTMLTextAreaElement>('#argsInput');
const runButton = requiredElement<HTMLButtonElement>('#runButton');
const resumeButton = requiredElement<HTMLButtonElement>('#resumeButton');
const stepOverButton = requiredElement<HTMLButtonElement>('#stepOverButton');
const stepInButton = requiredElement<HTMLButtonElement>('#stepInButton');
const stopButton = requiredElement<HTMLButtonElement>('#stopButton');
const stateText = requiredElement<HTMLElement>('#stateText');
const lineText = requiredElement<HTMLElement>('#lineText');
const variablesPanel = requiredElement<HTMLDivElement>('#variablesPanel');
const outputPanel = requiredElement<HTMLPreElement>('#outputPanel');

argsInput.value = defaultArgs;
let selectedProblemId = problems[0].id;

const editor = monaco.editor.create(editorElement, {
  value: starterCode,
  language: 'javascript',
  theme: 'vs-dark',
  automaticLayout: true,
  fontSize: 14,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineNumbersMinChars: 3,
  glyphMargin: true,
  padding: { top: 14, bottom: 14 },
});

const breakpoints = new Set<number>([4, 8]);
let breakpointDecorations: string[] = [];
let activeLineDecorations: string[] = [];
let resumeCurrentPause: (() => void) | null = null;
let resumeMode: ResumeMode = 'continue';
let stopped = false;

function renderBreakpoints() {
  breakpointDecorations = editor.deltaDecorations(
    breakpointDecorations,
    [...breakpoints].map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'breakpoint-glyph',
        glyphMarginHoverMessage: { value: `Breakpoint on line ${line}` },
      },
    })),
  );
}

editor.onMouseDown((event) => {
  if (!event.target.position || !isBreakpointClickTarget(event.target.type)) {
    return;
  }

  const line = event.target.position.lineNumber;
  if (breakpoints.has(line)) {
    breakpoints.delete(line);
  } else {
    breakpoints.add(line);
  }

  renderBreakpoints();
});

function isBreakpointClickTarget(targetType: monaco.editor.MouseTargetType) {
  return (
    targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
    targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
    targetType === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS ||
    targetType === monaco.editor.MouseTargetType.CONTENT_TEXT ||
    targetType === monaco.editor.MouseTargetType.CONTENT_EMPTY
  );
}

function filterProblems(query: string) {
  const queryTerms = buildPlainSearchTerms(query);
  if (queryTerms.length === 0) {
    return defaultProblems;
  }

  return defaultProblems.filter((problem) => {
    return matchesProblemSearchByIdOrTitle(problem, queryTerms);
  });
}

async function searchProblems(query: string) {
  const requestId = ++searchRequestId;
  const localResults = filterProblems(query);

  if (!query.trim()) {
    problems = [...defaultProblems];
    renderProblemList(problems);
    return;
  }

  problemSearchButton.disabled = true;
  renderProblemList(localResults, 'Searching LeetCode...');

  try {
    const remoteResults = await fetchLeetCodeProblems(query);
    if (requestId !== searchRequestId) {
      return;
    }

    const merged = mergeProblems(localResults, remoteResults.map(questionSummaryToProblem));
    problems = merged;
    renderProblemList(problems);
  } catch (error) {
    if (requestId !== searchRequestId) {
      return;
    }

    problems = localResults;
    renderProblemList(problems, 'LeetCode search unavailable. Showing local matches.');
    console.error(error);
  } finally {
    if (requestId === searchRequestId) {
      problemSearchButton.disabled = false;
    }
  }
}

async function fetchLeetCodeProblems(query: string) {
  const trimmedQuery = query.trim();
  const isIdSearch = /^\d+$/.test(trimmedQuery);
  const response = await leetCodeGraphql<{
    problemsetQuestionListV2: {
      questions: LeetCodeQuestionSummary[];
    };
  }>(
    `query problemsetQuestionList($limit: Int!, $filters: QuestionFilterInput) {
      problemsetQuestionListV2(categorySlug: "", limit: $limit, skip: 0, filters: $filters) {
        questions {
          questionFrontendId
          title
          titleSlug
          difficulty
          topicTags {
            name
          }
        }
      }
    }`,
    {
      limit: isIdSearch ? 20 : 500,
      filters: buildLeetCodeSearchFilters(query),
    },
  );

  const questions = response.problemsetQuestionListV2.questions;
  if (isIdSearch) {
    return questions;
  }

  const queryTerms = buildSearchTerms(trimmedQuery);
  return questions.filter((question) => matchesQuestionSearch(question, queryTerms));
}

function buildSearchTerms(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const terms = new Set<string>([normalizedQuery]);
  for (const [alias, expansions] of Object.entries(searchAliases)) {
    if (normalizedQuery.includes(alias)) {
      expansions.forEach((term) => terms.add(normalizeSearchText(term)));
    }
  }

  normalizedQuery
    .split(' ')
    .filter(Boolean)
    .forEach((term) => {
      terms.add(term);
      searchAliases[term]?.forEach((alias) => terms.add(normalizeSearchText(alias)));
    });

  return [...terms].filter(Boolean);
}

function matchesProblemSearchByIdOrTitle(problem: Problem, queryTerms: string[]) {
  const searchableText = normalizeSearchText(`${problem.id} ${problem.title} ${problem.titleSlug ?? ''}`);
  return queryTerms.some((term) => searchableText.includes(term));
}

function matchesQuestionSearch(question: LeetCodeQuestionSummary, queryTerms: string[]) {
  const searchableText = normalizeSearchText(
    `${question.questionFrontendId ?? question.frontendQuestionId ?? ''} ${question.title} ${question.titleSlug}`,
  );
  return queryTerms.some((term) => searchableText.includes(term));
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildPlainSearchTerms(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery ? [normalizedQuery] : [];
}

function buildLeetCodeSearchFilters(query: string) {
  const trimmedQuery = query.trim();
  const baseFilters = { filterCombineType: 'ALL' };
  if (/^\d+$/.test(trimmedQuery)) {
    const id = Number(trimmedQuery);
    return {
      ...baseFilters,
      frontendIdFilter: {
        rangeLeft: id,
        rangeRight: id,
      },
    };
  }

  return baseFilters;
}

function questionSummaryToProblem(question: LeetCodeQuestionSummary): Problem {
  const questionId = question.frontendQuestionId ?? question.questionFrontendId ?? '0';
  return {
    id: Number(questionId),
    title: question.title,
    difficulty: normalizeDifficulty(question.difficulty),
    tags: question.topicTags.map((tag) => tag.name),
    args: '[]',
    code: '',
    titleSlug: question.titleSlug,
    source: 'leetcode',
  };
}

function normalizeDifficulty(difficulty: string): Problem['difficulty'] {
  const normalized = difficulty.toLowerCase();
  if (normalized === 'medium') {
    return 'Medium';
  }

  if (normalized === 'hard') {
    return 'Hard';
  }

  return 'Easy';
}

function mergeProblems(localResults: Problem[], remoteResults: Problem[]) {
  const seen = new Set<string>();
  return [...localResults, ...remoteResults].filter((problem) => {
    const key = `${problem.id}:${problem.titleSlug ?? problem.title}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function renderProblemList(results: Problem[], status?: string) {
  if (results.length === 0) {
    problemList.className = 'problem-list empty';
    problemList.textContent = status ?? 'No matching problems.';
    return;
  }

  problemList.className = 'problem-list';
  const children: HTMLElement[] = [];
  if (status) {
    const statusElement = document.createElement('div');
    statusElement.className = 'problem-list-status';
    statusElement.textContent = status;
    children.push(statusElement);
  }

  children.push(...results.map((problem) => createProblemButton(problem)));
  problemList.replaceChildren(...children);
}

function createProblemButton(problem: Problem, className = 'problem-item') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = problem.id === selectedProblemId ? `${className} selected` : className;
  button.addEventListener('click', () => {
    void loadProblem(problem).catch((error) => {
      outputPanel.textContent = error instanceof Error ? error.message : String(error);
      setRunState('error');
    });
  });

  const title = document.createElement('span');
  title.className = 'problem-title';
  title.textContent = `${problem.id}. ${problem.title}`;

  const meta = document.createElement('span');
  meta.className = `problem-meta difficulty-${problem.difficulty.toLowerCase()}`;
  const source = problem.source === 'alfa' ? 'Alfa' : problem.source === 'leetcode' ? 'LeetCode' : 'Local';
  meta.textContent = `${problem.difficulty} · ${source}`;

  button.append(title, meta);
  return button;
}

async function loadProblem(problem: Problem) {
  selectedProblemId = problem.id;
  stopped = true;
  resumeMode = 'continue';
  resumeCurrentPause?.();
  clearActiveLine();
  setRunState('idle');
  lineText.textContent = '-';
  outputPanel.textContent = problem.titleSlug ? 'Loading official solution from alfa-leetcode-api...' : 'No output yet.';
  renderVariables(null);

  if (problem.code) {
    argsInput.value = problem.args;
    editor.setValue(problem.code);
    resetBreakpoints();
  }

  renderProblemList(problems);

  const loadedProblem = problem.titleSlug ? await fetchProblemWithOfficialSolution(problem) : problem;

  argsInput.value = loadedProblem.args;
  if (loadedProblem.code.trim()) {
    editor.setValue(loadedProblem.code);
    resetBreakpoints();
  }

  outputPanel.textContent = getProblemLoadMessage(loadedProblem);
  cacheLoadedProblem(loadedProblem);
  renderProblemList(problems);
}

function cacheLoadedProblem(loadedProblem: Problem) {
  problems = problems.map((problem) => {
    const sameProblem = problem.id === loadedProblem.id || (problem.titleSlug && problem.titleSlug === loadedProblem.titleSlug);
    return sameProblem ? loadedProblem : problem;
  });
}

async function fetchProblemWithOfficialSolution(problem: Problem) {
  if (!problem.titleSlug) {
    return problem;
  }

  const localFallback = findDefaultProblem(problem);
  const officialCode = await fetchAlfaOfficialSolutionCode(problem.titleSlug).catch(() => null);

  if (officialCode && isUsefulSolutionCode(officialCode)) {
    const detail = await fetchLeetCodeProblem(problem.titleSlug).catch(() => null);
    return {
      ...(detail ?? localFallback ?? problem),
      args: detail?.args ?? localFallback?.args ?? problem.args,
      code: normalizeLeetCodeJavaScript(officialCode),
      source: 'alfa' as const,
    };
  }

  const detail = await fetchLeetCodeProblem(problem.titleSlug).catch(() => null);
  if (detail && isUsefulSolutionCode(detail.code)) {
    return detail;
  }

  const deepSeekBaseProblem = detail ?? localFallback ?? problem;
  const deepSeekCode = await fetchDeepSeekSolution(deepSeekBaseProblem).catch(() => null);
  if (deepSeekCode && isUsefulSolutionCode(deepSeekCode)) {
    return {
      ...deepSeekBaseProblem,
      code: normalizeLeetCodeJavaScript(deepSeekCode),
      source: 'deepseek' as const,
      isStarter: false,
    };
  }

  return localFallback ?? detail ?? problem;
}

function findDefaultProblem(problem: Problem) {
  return defaultProblems.find((candidate) => candidate.id === problem.id || candidate.titleSlug === problem.titleSlug);
}

function getProblemLoadMessage(problem: Problem) {
  if (problem.source === 'alfa') {
    return `Loaded alfa official solution JavaScript for ${problem.title}.`;
  }

  if (problem.source === 'leetcode') {
    return problem.isStarter
      ? `Loaded LeetCode starter for ${problem.title}; alfa did not return a JavaScript solution.`
      : `Loaded LeetCode JavaScript solution for ${problem.title}.`;
  }

  if (problem.source === 'deepseek') {
    return `Loaded DeepSeek generated JavaScript solution for ${problem.title}.`;
  }

  if (problem.source === 'local') {
    return `Loaded local fallback for ${problem.title}.`;
  }

  return problem.code.trim() ? `Loaded ${problem.title}.` : `No usable JavaScript solution found for ${problem.title}.`;
}

async function fetchAlfaOfficialSolutionCode(titleSlug: string) {
  const response = await fetch(`/alfa/officialSolution?titleSlug=${encodeURIComponent(titleSlug)}`);
  if (!response.ok) {
    throw new Error(`Official solution request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as AlfaOfficialSolutionResponse;
  const solutionContent = payload.question?.solution?.content ?? payload.question?.solution?.body ?? '';
  const inlineCode = extractJavaScriptFromSolution(solutionContent);
  if (inlineCode) {
    return inlineCode;
  }

  const playgroundIds = extractPlaygroundIds(solutionContent);
  for (const playgroundId of playgroundIds.reverse()) {
    const code = await fetchPlaygroundJavaScript(playgroundId).catch(() => null);
    if (code?.trim()) {
      return code;
    }
  }

  return null;
}

async function fetchDeepSeekSolution(problem: Problem) {
  // Try Ollama first (local ollama CLI / server must be available and OLLAMA_MODEL set in dev server)
  outputPanel.textContent = 'Generating JavaScript solution with Ollama...';
  try {
    const ollamaResp = await fetch('/ollama/solution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(problem),
    });

    const ollamaPayload = (await ollamaResp.json()) as { code?: string; error?: string };
    if (ollamaResp.ok && ollamaPayload.code?.trim()) {
      return ollamaPayload.code.trim();
    }

    console.warn('Ollama did not return code or failed:', ollamaPayload);
  } catch (err) {
    console.warn('Ollama request error:', err instanceof Error ? err.message : String(err));
  }

  // Fallback to DeepSeek
  outputPanel.textContent = 'Generating JavaScript solution with DeepSeek...';
  const response = await fetch('/deepseek/solution', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(problem),
  });

  const payload = (await response.json()) as { code?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `DeepSeek request failed with ${response.status}.`);
  }

  return payload.code?.trim() ?? null;
}

function extractPlaygroundIds(content: string) {
  const ids = new Set<string>();
  for (const match of content.matchAll(/leetcode\.com\/playground\/([A-Za-z0-9_-]+)\/shared/g)) {
    ids.add(match[1]);
  }

  for (const match of content.matchAll(/name=["']([A-Za-z0-9_-]+)["']/g)) {
    ids.add(match[1]);
  }

  return [...ids];
}

async function fetchPlaygroundJavaScript(uuid: string) {
  const response = await leetCodeGraphql<PlaygroundCodeResponse>(
    `query playgroundCode($uuid: String!, $langSlug: String!) {
      playgroundCode(uuid: $uuid, langSlug: $langSlug) {
        code
      }
    }`,
    { uuid, langSlug: 'javascript' },
  );

  return response.playgroundCode?.code ?? null;
}

async function fetchLeetCodeProblem(titleSlug: string): Promise<Problem> {
  outputPanel.textContent = 'Loading LeetCode problem...';
  const response = await leetCodeGraphql<{ question: LeetCodeQuestionDetail }>(
    `query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        titleSlug
        content
        difficulty
        exampleTestcases
        solution {
          content
          body
          canSeeDetail
          paidOnly
        }
        codeSnippets {
          langSlug
          code
        }
        topicTags {
          name
        }
      }
    }`,
    { titleSlug },
  );

  const question = response.question;
  const solutionCode = extractJavaScriptFromSolution(question.solution?.content ?? question.solution?.body ?? '');
  const starterCode = question.codeSnippets.find((snippet) => snippet.langSlug === 'javascript')?.code;
  const sourceCode = solutionCode ?? starterCode;
  const isStarter = !solutionCode;

  if (!sourceCode) {
    throw new Error(`No JavaScript solution or snippet found for ${question.title}.`);
  }

  const code = normalizeLeetCodeJavaScript(sourceCode);
  return {
    id: Number(question.questionFrontendId),
    title: question.title,
    difficulty: normalizeDifficulty(question.difficulty),
    tags: question.topicTags.map((tag) => tag.name),
    args: buildArgsFromExample(question.exampleTestcases, code),
    code,
    titleSlug: question.titleSlug,
    description: stripHtml(question.content),
    source: 'leetcode',
    isStarter,
  };
}

async function leetCodeGraphql<TData>(query: string, variables: Record<string, unknown>): Promise<TData> {
  const response = await fetch('/leetcode/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: TData; errors?: Array<{ message: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('\n'));
  }

  if (!payload.data) {
    throw new Error('LeetCode response did not include data.');
  }

  return payload.data;
}

function normalizeLeetCodeJavaScript(code: string) {
  let normalized = code.trim();
  normalized = normalized.replace(/\b(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*function\s*\(/, 'function solution(');
  normalized = normalized.replace(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/, 'function solution(');
  normalized = normalized.replace(/};\s*$/, '}');
  normalized = normalized.replace(/;\s*$/, '');

  return normalized;
}

function isUsefulSolutionCode(code: string) {
  const normalized = normalizeLeetCodeJavaScript(code);
  const bodyMatch = normalized.match(/function\s+solution\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/);
  const body = bodyMatch?.[1] ?? normalized;
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '');

  return /return|for\(|while\(|if\(|\.set\(|\.push\(|=>|Math\.|newMap|newSet/.test(stripped) && stripped.length > 12;
}

function extractJavaScriptFromSolution(content: string) {
  if (!content.trim()) {
    return null;
  }

  const markdownMatch = content.match(/```(?:javascript|js)\s*([\s\S]*?)```/i);
  if (markdownMatch?.[1]?.trim()) {
    return markdownMatch[1].trim();
  }

  const element = document.createElement('div');
  element.innerHTML = content;
  const codeBlocks = Array.from(element.querySelectorAll('pre, code'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean);

  return (
    codeBlocks.find((block) => /(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*function|function\s+[A-Za-z_$][\w$]*\s*\(/.test(block)) ??
    codeBlocks.find((block) => /return|for\s*\(|while\s*\(|=>/.test(block)) ??
    null
  );
}

function buildArgsFromExample(exampleTestcases: string, code: string) {
  const paramCount = getSolutionParamCount(code);
  const values = exampleTestcases
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, paramCount || undefined);

  return `[${values.join(', ')}]`;
}

function getSolutionParamCount(code: string) {
  const match = code.match(/function\s+solution\s*\(([^)]*)\)/);
  if (!match || !match[1].trim()) {
    return 0;
  }

  return match[1].split(',').filter((param) => param.trim()).length;
}

function stripHtml(html: string) {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function resetBreakpoints() {
  breakpoints.clear();
  const loopLineIndex = editor
    .getValue()
    .split('\n')
    .findIndex((line) => /\b(for|while)\b/.test(line));

  if (loopLineIndex >= 0) {
    breakpoints.add(loopLineIndex + 2);
  }

  renderBreakpoints();
}

renderBreakpoints();
renderProblemList(problems);

problemSearchButton.addEventListener('click', () => {
  void searchProblems(problemSearch.value);
});

problemSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    void searchProblems(problemSearch.value);
  }
});

runButton.addEventListener('click', () => {
  void runCode();
});

resumeButton.addEventListener('click', () => {
  resumeMode = 'continue';
  resumeCurrentPause?.();
});

stepOverButton.addEventListener('click', () => {
  stepToNextLine();
});

stepInButton.addEventListener('click', () => {
  stepToNextLine();
});

stopButton.addEventListener('click', () => {
  stopped = true;
  resumeMode = 'continue';
  clearActiveLine();
  resumeCurrentPause?.();
  setRunState('idle');
});

function stepToNextLine() {
  resumeMode = 'step';
  if (resumeCurrentPause) {
    resumeCurrentPause();
    return;
  }

  if (stateText.textContent === 'Idle' || stateText.textContent === 'Done' || stateText.textContent === 'Error') {
    void runCode('step');
  }
}

async function runCode(initialMode: ResumeMode = 'continue') {
  stopped = false;
  resumeMode = initialMode;
  setRunState('running');
  outputPanel.textContent = 'Running...';
  lineText.textContent = '-';
  clearActiveLine();
  renderVariables(null);

  try {
    const args = parseArguments(argsInput.value);
    const instrumentedCode = instrumentCode(editor.getValue(), breakpoints);
    const factory = new Function(
      '__debug__',
      `${instrumentedCode}
return typeof solution === 'function' ? solution : null;`,
    );

    const solution = factory(handleProbe) as ((...args: unknown[]) => unknown) | null;
    if (!solution) {
      throw new Error('Define a function named solution.');
    }

    const result = await solution(...args);
    if (stopped) {
      outputPanel.textContent = 'Stopped.';
      return;
    }

    outputPanel.textContent = stringifyValue(result);
    setRunState('done');
  } catch (error) {
    outputPanel.textContent = error instanceof Error ? error.message : String(error);
    setRunState('error');
  } finally {
    resumeCurrentPause = null;
    if (stateText.textContent === 'Running') {
      setRunState('done');
    }
  }
}

function parseArguments(input: string): unknown[] {
  const parsed = JSON.parse(input);
  if (!Array.isArray(parsed)) {
    throw new Error('Arguments must be a JSON array, for example: [[2,7,11,15], 9]');
  }

  return parsed;
}

async function handleBreakpoint(snapshot: DebugSnapshot) {
  return handleProbe(snapshot);
}

async function handleProbe(snapshot: DebugSnapshot) {
  if (stopped) {
    throw new Error('Execution stopped.');
  }

  if (!snapshot.isBreakpoint && resumeMode === 'continue') {
    return;
  }

  resumeMode = 'continue';
  setRunState('paused');
  lineText.textContent = String(snapshot.line);
  setActiveLine(snapshot.line);
  editor.revealLineInCenter(snapshot.line);
  editor.setPosition({ lineNumber: snapshot.line, column: 1 });
  renderVariables(snapshot.variables);

  await new Promise<void>((resolve) => {
    resumeCurrentPause = () => {
      resumeCurrentPause = null;
      resolve();
    };
  });

  if (!stopped) {
    clearActiveLine();
    setRunState('running');
  }
}

function setActiveLine(line: number) {
  activeLineDecorations = editor.deltaDecorations(activeLineDecorations, [
    {
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'active-debug-line',
        glyphMarginClassName: 'active-debug-glyph',
        linesDecorationsClassName: 'active-debug-line-marker',
      },
    },
  ]);
}

function clearActiveLine() {
  activeLineDecorations = editor.deltaDecorations(activeLineDecorations, []);
}

function instrumentCode(source: string, activeBreakpoints: Set<number>) {
  const lines = source.split('\n');
  const namesByLine = collectVisibleNames(lines);
  let functionDepth = 0;
  let expressionDepth = 0;

  return lines
    .map((line, index) => {
      const lineNumber = index + 1;
      const trimmed = line.trim();

      let nextLine = line;
      if (/^function\s+solution\s*\(/.test(trimmed)) {
        nextLine = line.replace(/function\s+solution\s*\(/, 'async function solution(');
      }

      const shouldProbe = functionDepth > 0 && expressionDepth === 0 && isRunnableLine(trimmed);
      const openBraces = (line.match(/{/g) ?? []).length;
      const closeBraces = (line.match(/}/g) ?? []).length;
      expressionDepth = Math.max(0, expressionDepth + countExpressionDepthDelta(line));
      functionDepth = Math.max(0, functionDepth + openBraces - closeBraces);

      if (!shouldProbe) {
        return nextLine;
      }

      const indent = line.match(/^\s*/)?.[0] ?? '';
      const capture = buildCaptureObject(namesByLine.get(lineNumber) ?? []);
      const isBreakpoint = activeBreakpoints.has(lineNumber);
      return `${indent}await __debug__({ line: ${lineNumber}, isBreakpoint: ${isBreakpoint}, variables: ${capture} });\n${nextLine}`;
    })
    .join('\n');
}

function countExpressionDepthDelta(line: string) {
  const structuralText = stripQuotedText(line);
  const openExpressions = (structuralText.match(/[\[(]/g) ?? []).length;
  const closeExpressions = (structuralText.match(/[\])]/g) ?? []).length;

  return openExpressions - closeExpressions;
}

function stripQuotedText(line: string) {
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '');
}

function isRunnableLine(trimmedLine: string) {
  return (
    Boolean(trimmedLine) &&
    trimmedLine !== '{' &&
    trimmedLine !== '}' &&
    !trimmedLine.startsWith('//') &&
    !/^function\s+/.test(trimmedLine) &&
    !/^(else|catch|finally)\b/.test(trimmedLine)
  );
}

function collectVisibleNames(lines: string[]) {
  const names = new Set<string>();
  const result = new Map<number, string[]>();
  const identifier = '[A-Za-z_$][\\w$]*';
  const declarationPattern = new RegExp(`\\b(?:let|const|var)\\s+(${identifier})`, 'g');
  const functionPattern = new RegExp(`\\bfunction\\s+(${identifier})\\s*\\(([^)]*)\\)`);
  const loopPattern = new RegExp(`\\b(?:let|const|var)\\s+(${identifier})\\s+(?:=|of|in)`);

  lines.forEach((line, index) => {
    const functionMatch = line.match(functionPattern);
    if (functionMatch) {
      names.add(functionMatch[1]);
      functionMatch[2]
        .split(',')
        .map((param) => param.trim())
        .filter((param) => new RegExp(`^${identifier}$`).test(param))
        .forEach((param) => names.add(param));
    }

    const loopMatch = line.match(loopPattern);
    if (loopMatch) {
      names.add(loopMatch[1]);
    }

    for (const match of line.matchAll(declarationPattern)) {
      names.add(match[1]);
    }

    result.set(index + 1, [...names]);
  });

  return result;
}

function buildCaptureObject(names: string[]) {
  const entries = names
    .filter((name) => name !== 'solution')
    .map((name) => `${JSON.stringify(name)}: (() => { try { return ${name}; } catch { return '[unavailable]'; } })()`);

  return `{ ${entries.join(', ')} }`;
}

function renderVariables(variables: Record<string, unknown> | null) {
  if (!variables || Object.keys(variables).length === 0) {
    variablesPanel.className = 'variables empty';
    variablesPanel.textContent = variables ? 'No variables captured at this line.' : 'Run to inspect variables at a breakpoint.';
    return;
  }

  variablesPanel.className = 'variables';
  const indexByName = getVisibleIndexes(variables);
  variablesPanel.replaceChildren(
    ...Object.entries(variables).map(([name, value]) => {
      const row = document.createElement('div');
      row.className = 'variable-row';

      const label = document.createElement('span');
      label.className = 'variable-name';
      label.textContent = name;

      const code = document.createElement('code');
      code.append(renderVariableValue(value, indexByName));

      row.append(label, code);
      return row;
    }),
  );
}

function getVisibleIndexes(variables: Record<string, unknown>) {
  const result = new Map<string, number>();
  for (const name of ['i', 'j', 'k', 'left', 'right', 'mid']) {
    const value = variables[name];
    if (Number.isInteger(value) && Number(value) >= 0) {
      result.set(name, Number(value));
    }
  }

  return result;
}

function renderVariableValue(value: unknown, indexes: Map<string, number>) {
  if (!Array.isArray(value) || indexes.size === 0) {
    return document.createTextNode(stringifyValue(value));
  }

  const wrapper = document.createElement('span');
  wrapper.className = 'array-preview';
  wrapper.append('[');

  value.forEach((item, itemIndex) => {
    if (itemIndex > 0) {
      wrapper.append(', ');
    }

    const element = document.createElement('span');
    element.textContent = stringifyValue(item);

    const matchingIndexes = [...indexes.entries()].filter(([, indexValue]) => indexValue === itemIndex);
    if (matchingIndexes.length > 0) {
      element.className = 'current-array-element';
      element.title = `Current index: ${matchingIndexes.map(([name]) => name).join(', ')}`;
    }

    wrapper.append(element);
  });

  wrapper.append(']');
  return wrapper;
}

function stringifyValue(value: unknown) {
  if (value instanceof Map) {
    return JSON.stringify(Object.fromEntries(value), null, 2);
  }

  if (value instanceof Set) {
    return JSON.stringify([...value], null, 2);
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function setRunState(state: RunState) {
  const label = state[0].toUpperCase() + state.slice(1);
  stateText.textContent = label;
  document.body.dataset.state = state;
  runButton.disabled = state === 'running' || state === 'paused';
  resumeButton.disabled = state !== 'paused';
  stepOverButton.disabled = state === 'running';
  stepInButton.disabled = state === 'running';
  stopButton.disabled = state !== 'running' && state !== 'paused';
}

function requiredElement<TElement extends HTMLElement>(selector: string) {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}
