import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as monaco from 'monaco-editor';
import './style.css';
import { leetcodeOneToHundredProblems, type LeetCodeProblemSeed } from './leetcodeOneToHundred';

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

type AlgorithmGifResponse = {
  gifPath?: string;
  error?: string;
  stderr?: string;
  stdout?: string;
  warning?: string;
};

type AlgorithmInteractiveResponse = {
  htmlPath?: string;
  error?: string;
};

type CategoryNode = {
  title: string;
  query: string;
  children: Array<{
    title: string;
    query: string;
  }>;
};

class TreeNode {
  val: unknown;
  left: TreeNode | null;
  right: TreeNode | null;

  constructor(val: unknown = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

class ListNode {
  val: unknown;
  next: ListNode | null;

  constructor(val: unknown = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

const localSolutionProblems: Problem[] = [
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

function buildDefaultProblems(localProblems: Problem[], seedProblems: LeetCodeProblemSeed[]): Problem[] {
  const byId = new Map<number, Problem>();

  for (const seed of seedProblems) {
    byId.set(seed.id, {
      ...seed,
      code: '',
      source: 'local',
    });
  }

  for (const problem of localProblems) {
    byId.set(problem.id, {
      ...byId.get(problem.id),
      ...problem,
      source: problem.source ?? 'local',
    });
  }

  return [...byId.values()].sort((left, right) => left.id - right.id);
}

const defaultProblems: Problem[] = buildDefaultProblems(localSolutionProblems, leetcodeOneToHundredProblems);
let problems: Problem[] = [...defaultProblems];
// Store raw assistant text responses per problem so the output panel can show the assistant text
const assistantTextByProblem = new Map<string, string>();
const starterCode = problems[0].code;
const defaultArgs = problems[0].args;
let searchRequestId = 0;
let debugExplanationRequestId = 0;

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

      <section class="panel-block">
        <h2>Output</h2>
        <div id="outputPanel" class="output">No output yet.</div>
      </section>

      <section class="panel-block">
        <h2>Result</h2>
        <div id="resultPanel" class="result-output">No result yet.</div>
      </section>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="run-controls">
          <button id="runButton" type="button">Run</button>
          <button id="visualizeButton" type="button">Animation</button>
          <button id="resumeButton" type="button" disabled>Resume</button>
          <button id="stepOverButton" type="button" disabled>Step Over</button>
          <button id="stepInButton" type="button" disabled>Step In</button>
          <button id="stopButton" type="button" disabled>Stop</button>
        </div>
      </header>
      <div class="workspace-content">
        <section id="animationPanel" class="animation-panel hidden" aria-label="Algorithm animation">
          <div class="animation-panel-header">
            <span id="animationTitle">Animation</span>
            <button id="animationCloseButton" type="button" aria-label="Hide animation">Hide</button>
          </div>
          <iframe id="animationFrame" title="Algorithm animation"></iframe>
        </section>
        <div id="editor" class="editor" aria-label="JavaScript editor"></div>
        <section id="streamPanel" class="stream-panel hidden" aria-label="Assistant streaming output">
          <div class="stream-panel-title">Streaming</div>
          <pre id="streamContent"></pre>
        </section>
        <section class="ai-chat-panel" aria-label="Talk to Ollama" hidden>
          <textarea id="aiChatInput" rows="3" spellcheck="false" placeholder="Ask Ollama about this solution..."></textarea>
          <button id="aiChatSendButton" type="button">Send</button>
        </section>
      </div>
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

    </aside>

  </main>
`;

const editorElement = requiredElement<HTMLDivElement>('#editor');
const problemSearch = requiredElement<HTMLInputElement>('#problemSearch');
const problemSearchButton = requiredElement<HTMLButtonElement>('#problemSearchButton');
const problemList = requiredElement<HTMLDivElement>('#problemList');
const argsInput = requiredElement<HTMLTextAreaElement>('#argsInput');
const runButton = requiredElement<HTMLButtonElement>('#runButton');
const visualizeButton = requiredElement<HTMLButtonElement>('#visualizeButton');
const resumeButton = requiredElement<HTMLButtonElement>('#resumeButton');
const stepOverButton = requiredElement<HTMLButtonElement>('#stepOverButton');
const stepInButton = requiredElement<HTMLButtonElement>('#stepInButton');
const stopButton = requiredElement<HTMLButtonElement>('#stopButton');
const stateText = requiredElement<HTMLElement>('#stateText');
const lineText = requiredElement<HTMLElement>('#lineText');
const variablesPanel = requiredElement<HTMLDivElement>('#variablesPanel');
const outputPanel = requiredElement<HTMLDivElement>('#outputPanel');
const resultPanel = requiredElement<HTMLDivElement>('#resultPanel');
const animationPanel = requiredElement<HTMLElement>('#animationPanel');
const animationTitle = requiredElement<HTMLElement>('#animationTitle');
const animationFrame = requiredElement<HTMLIFrameElement>('#animationFrame');
const animationCloseButton = requiredElement<HTMLButtonElement>('#animationCloseButton');
const streamPanel = requiredElement<HTMLElement>('#streamPanel');
const streamContent = requiredElement<HTMLPreElement>('#streamContent');
const aiChatInput = requiredElement<HTMLTextAreaElement>('#aiChatInput');
const aiChatSendButton = requiredElement<HTMLButtonElement>('#aiChatSendButton');

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
  wordWrap: 'on',
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
let currentDebugVariables: Record<string, unknown> | null = null;
let debugStepCounter = 0;
let debugMatrixPath: Array<{ row: number; col: number; step: number }> = [];
let explainNextDebugPause = false;

monaco.languages.registerHoverProvider('javascript', {
  provideHover(model, position) {
    if (!currentDebugVariables) {
      return null;
    }

    const word = model.getWordAtPosition(position);
    if (!word || !(word.word in currentDebugVariables)) {
      return null;
    }

    return {
      range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      contents: [
        { value: `**${word.word}**` },
        { value: `\`\`\`json\n${formatHoverValue(currentDebugVariables[word.word])}\n\`\`\`` },
      ],
    };
  },
});

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

  return {
    ...baseFilters,
    searchKeywords: trimmedQuery,
  };
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
      resultPanel.textContent = error instanceof Error ? error.message : String(error);
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
  resultPanel.textContent = 'No result yet.';
  clearStreamingOutput();
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
    if (loadedProblem.source === 'deepseek') {
      void generateInteractiveAnimationFromCode(loadedProblem, loadedProblem.code);
    }
  }

  // Keep Output focused on the problem description. Solutions go directly into the editor.
  try {
    const assistantKey = loadedProblem.titleSlug ?? String(loadedProblem.id);
    const assistantText = assistantTextByProblem.get(assistantKey);
    if (assistantText) {
      try {
        const extracted = extractAssistantJavaScript(assistantText || '');
        if (extracted && extracted.trim()) {
          const normalized = normalizeLeetCodeJavaScript(extracted);
          editor.setValue(normalized);
          resetBreakpoints();

          // Update loadedProblem so state and caching reflect the inserted code
          loadedProblem.code = normalized;
          loadedProblem.source = 'deepseek';
          loadedProblem.isStarter = false;
          void generateInteractiveAnimationFromCode(loadedProblem, normalized);
        }
      } catch (e) {
        // ignore extraction errors
      }
    }
    renderProblemDescription(loadedProblem);
  } catch (e) {
    renderProblemDescription(loadedProblem);
  }

  cacheLoadedProblem(loadedProblem);
  renderProblemList(problems);
}

function cacheLoadedProblem(loadedProblem: Problem) {
  problems = problems.map((problem) => {
    const sameProblem = problem.id === loadedProblem.id || (problem.titleSlug && problem.titleSlug === loadedProblem.titleSlug);
    return sameProblem ? loadedProblem : problem;
  });
}

function clearStreamingOutput() {
  streamPanel.classList.add('hidden');
  streamContent.textContent = '';
}

function showStreamingOutput(content: string) {
  streamPanel.classList.remove('hidden');
  streamContent.textContent = content || 'Waiting for assistant response...';
  streamContent.scrollTop = streamContent.scrollHeight;
}

function renderProblemDescription(problem: Problem) {
  const desc = problem.description ? `${formatProblemDescription(problem.description)}\n\n` : '';
  renderOutputWithImages(desc || 'No description available.');
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
  renderProblemDescription(deepSeekBaseProblem);
  const deepSeekCode = await fetchDeepSeekSolution(deepSeekBaseProblem).catch(() => null);
  if (deepSeekCode && isUsefulSolutionCode(deepSeekCode)) {
    return {
      ...deepSeekBaseProblem,
      code: deepSeekCode,
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

function buildDeepSeekPrompt(problem: Problem): string {
  return [
    'Return a JavaScript solution only.',
    'Use LeetCode JavaScript format: function solution(...) { ... }.',
    'Do not write Python, Java, C++, TypeScript, pseudocode, or multiple language versions.',
    'Put the final JavaScript code in one ```javascript fenced block. Explanations are optional and must not contain code in other languages.',
    '',
    `Title: ${problem.title ?? ''}`,
    `LeetCode ID: ${problem.id ?? ''}`,
    `Slug: ${problem.titleSlug ?? ''}`,
    `Difficulty: ${problem.difficulty ?? ''}`,
    `Tags: ${(problem.tags ?? []).join(', ')}`,
    `Function arguments JSON example: ${problem.args ?? '[]'}`,
    '',
    'Problem description:',
    problem.description ?? '',
    '',
    'Starter code:',
    problem.code ?? '',
  ].join('\n');
}

// async function sendAiChatMessage() {
//   const message = aiChatInput.value.trim();
//   if (!message) {
//     return;
//   }
//
//   aiChatSendButton.disabled = true;
//   showStreamingOutput('');
//
//   try {
//     const context = [
//       'User question:',
//       message,
//       '',
//       'Current code:',
//       editor.getValue(),
//       '',
//       'Current function arguments:',
//       argsInput.value,
//     ].join('\n');
//
//     await streamOllamaChat(context);
//     aiChatInput.value = '';
//   } catch (error) {
//     showStreamingOutput(error instanceof Error ? error.message : String(error));
//   } finally {
//     aiChatSendButton.disabled = false;
//   }
// }

async function streamOllamaChat(prompt: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: (window as any).OLLAMA_MODEL ?? 'llama3.2:latest',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with ${response.status}.`);
  }

  let content = '';
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    showStreamingOutput(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const chunk = extractOllamaChunk(line);
      if (chunk) {
        content += chunk;
        showStreamingOutput(content);
      }
    }
  }

  const finalChunk = extractOllamaChunk(buffer);
  if (finalChunk) {
    content += finalChunk;
    showStreamingOutput(content);
  }

  return content;
}

async function explainDebugVariables(snapshot: DebugSnapshot) {
  const requestId = ++debugExplanationRequestId;
  showStreamingOutput('Explaining current debug step...');

  try {
    await streamDebugExplanation(buildDebugExplanationPrompt(snapshot), requestId);
  } catch (error) {
    if (requestId === debugExplanationRequestId) {
      showStreamingOutput(`Debug explanation unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function streamDebugExplanation(prompt: string, requestId: number) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: (window as any).OLLAMA_MODEL ?? 'llama3.2:latest',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 140,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with ${response.status}.`);
  }

  let content = '';
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (requestId === debugExplanationRequestId) {
      showStreamingOutput(limitWords(text, 100));
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const chunk = extractOllamaChunk(line);
      if (chunk) {
        content += chunk;
        if (requestId === debugExplanationRequestId) {
          showStreamingOutput(limitWords(content, 100));
        }
      }
    }
  }

  const finalChunk = extractOllamaChunk(buffer);
  if (finalChunk) {
    content += finalChunk;
  }

  if (requestId === debugExplanationRequestId) {
    showStreamingOutput(limitWords(content, 100));
  }

  return content;
}

function buildDebugExplanationPrompt(snapshot: DebugSnapshot) {
  return [
    'Explain this JavaScript debug step in no more than 100 words.',
    'Be concrete and quick. Mention the current line and the important variable changes/state.',
    'If a DP matrix is present, explain the current cell and what it represents.',
    'Do not include code.',
    '',
    `Current line: ${snapshot.line}`,
    'Variables from monitor:',
    summarizeDebugVariables(snapshot.variables),
  ].join('\n');
}

function summarizeDebugVariables(variables: Record<string, unknown>) {
  const entries = Object.entries(variables)
    .filter(([, value]) => value !== '[unavailable]' && typeof value !== 'function')
    .slice(0, 14)
    .map(([name, value]) => `${name}: ${compactDebugValue(value)}`);

  const matrixContext = summarizeMatrixDebugContext(variables);
  const text = [matrixContext, entries.join('\n')].filter(Boolean).join('\n');
  return text.length > 3500 ? `${text.slice(0, 3500)}\n...` : text || 'No variables captured.';
}

function summarizeMatrixDebugContext(variables: Record<string, unknown>) {
  const indexes = getVisibleIndexes(variables);
  const coordinate = getMatrixCoordinate(indexes);
  const matrices = Object.entries(variables).filter(([name, value]) => {
    return Array.isArray(value) && isRectangularPrimitiveMatrix(value) && isDynamicProgrammingMatrixName(name);
  });

  if (matrices.length === 0) {
    return '';
  }

  const matrixSummaries = matrices.slice(0, 3).map(([name, value]) => {
    const matrix = value as unknown[][];
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;
    const parts = [`DP matrix ${name}: ${rows}x${cols}`];
    if (coordinate && coordinate.row < rows && coordinate.col < cols) {
      parts.push(`current cell ${name}[${coordinate.row}][${coordinate.col}] = ${stringifyValue(matrix[coordinate.row][coordinate.col])}`);
    }
    return parts.join(', ');
  });

  return matrixSummaries.join('\n');
}

function compactDebugValue(value: unknown) {
  let text = stringifyValue(value);
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 420 ? `${text.slice(0, 420)}...` : text;
}

function limitWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}...` : text.trim();
}

function extractOllamaChunk(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const json = JSON.parse(trimmed);
    return String(
      json.message?.content ?? json.output ?? json.text ?? json.content ?? json.data ??
      (Array.isArray(json.choices) && (json.choices[0]?.message?.content ?? json.choices[0]?.content ?? json.choices[0]?.text)) ??
      (Array.isArray(json.results) && json.results[0]?.content) ?? '',
    );
  } catch {
    return '';
  }
}

async function fetchDeepSeekSolution(problem: Problem) {
  // Use the same-origin proxy so the browser never sends CORS preflight requests to Ollama directly.
  showStreamingOutput('');
  const prompt = buildDeepSeekPrompt(problem);

  const endpoints = [
    '/api/chat',
  ];

  for (const url of endpoints) {
    try {
      const isChat = url.endsWith('/api/chat');
      const requestBody = isChat
        ? { model: (window as any).OLLAMA_MODEL ?? 'llama3.2:latest', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 1500 }
        : { model: (window as any).OLLAMA_MODEL ?? 'llama3.2:latest', prompt, temperature: 0.2, max_tokens: 1500 };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        console.warn(`Ollama endpoint ${url} returned ${resp.status}`);
        continue;
      }

      let content = '';

      // Handle streaming NDJSON/chunked JSON responses (common for API chat endpoints)
      if (resp.body && typeof resp.body.getReader === 'function') {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const json = JSON.parse(trimmed);
              const chunk =
                json.message?.content ?? json.output ?? json.text ?? json.content ?? json.data ??
                (Array.isArray(json.choices) && (json.choices[0]?.message?.content ?? json.choices[0]?.content ?? json.choices[0]?.text)) ??
                (Array.isArray(json.results) && json.results[0]?.content) ?? '';

              if (chunk) {
                content += String(chunk);
                showStreamingOutput(content);
              }

              if (json.done) {
                // if server signals done, can break early
                // continue reading to drain stream until done is true and stream ends
              }
            } catch (e) {
              // partial JSON chunk — ignore
            }
          }
        }

        // leftover buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer.trim());
            const chunk =
              json.message?.content ?? json.output ?? json.text ?? json.content ?? json.data ??
              (Array.isArray(json.choices) && (json.choices[0]?.message?.content ?? json.choices[0]?.content ?? json.choices[0]?.text)) ??
              (Array.isArray(json.results) && json.results[0]?.content) ?? '';
            if (chunk) content += String(chunk);
            if (chunk) showStreamingOutput(content);
          } catch (e) {
            // ignore
          }
        }
      } else {
        const text = await resp.text();
        try {
          const json = JSON.parse(text);
          content = json.output ?? json.text ?? json.content ?? json.data ?? '';
          if (!content) {
            if (Array.isArray(json.choices) && json.choices[0]) {
              content = json.choices[0].content ?? json.choices[0].text ?? json.choices[0].message?.content ?? '';
            }
            if (!content && Array.isArray(json.results) && json.results[0]) {
              content = json.results[0].content ?? json.results[0].text ?? '';
            }
            if (!content && json.choices?.[0]?.message?.content) {
              content = json.choices[0].message.content;
            }
          }
        } catch (e) {
          content = text;
        }
      }

      if (content && String(content).trim()) {
        const raw = String(content).trim();
        // save raw assistant text for later display in the output panel
        try {
          const key = (problem.titleSlug ?? String(problem.id));
          assistantTextByProblem.set(key, raw);
        } catch (e) {
          // ignore
        }

        const code = extractAssistantJavaScript(raw);
        if (code?.trim()) {
          const normalized = normalizeLeetCodeJavaScript(code);
          editor.setValue(normalized);
          resetBreakpoints();
          showStreamingOutput(extractAssistantExplanation(raw, normalized) || 'Solution moved to code editor.');
          void generateInteractiveAnimationFromCode(problem, normalized);
          return normalized;
        }
        showStreamingOutput(raw);
        return code;
      }
    } catch (err) {
      console.warn('Ollama request failed for', url, err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback: call local Vite middleware that invokes the ollama CLI
  try {
    const response = await fetch('/ollama/solution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(problem),
    });

    const payload = (await response.json()) as { code?: string; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Ollama CLI request failed with ${response.status}.`);
    }

    return payload.code?.trim() ?? null;
  } catch (err) {
    console.error('Ollama CLI fallback failed:', err);
    return null;
  }
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

function extractAssistantJavaScript(content: string): string {
  if (!content) return '';

  const fencedBlocks = [...content.matchAll(/```([A-Za-z0-9_-]*)\s*\n?([\s\S]*?)```/g)];
  const javascriptBlock = fencedBlocks.find((match) => isJavaScriptFenceLanguage(match[1]) && looksLikeJavaScriptCode(match[2]));
  if (javascriptBlock?.[2]?.trim()) {
    return javascriptBlock[2].trim();
  }

  const unlabeledJavaScriptBlock = fencedBlocks.find((match) => !match[1] && looksLikeJavaScriptCode(match[2]));
  if (unlabeledJavaScriptBlock?.[2]?.trim()) {
    return unlabeledJavaScriptBlock[2].trim();
  }

  const hasNonJavaScriptFencedCode = fencedBlocks.some((match) => match[1] && !isJavaScriptFenceLanguage(match[1]));
  if (hasNonJavaScriptFencedCode) {
    return '';
  }

  // Remove lines that are plain JSON objects (NDJSON from streaming) to reduce noise
  const cleanedLines = content
    .split(/\r?\n/)
    .filter((l) => !/^\s*\{.*\}\s*$/.test(l))
    .join('\n')
    .trim();

  // If no fences, heuristically find code start (function, const, let, class)
  const codeStartMatch = cleanedLines.match(/(^|\n)\s*(function|const|let|class)\s+/m);
  if (codeStartMatch) {
    const idx = cleanedLines.indexOf(codeStartMatch[0].trim());
    const candidate = cleanedLines.slice(idx).trim();
    return looksLikeJavaScriptCode(candidate) ? candidate : '';
  }

  // Fallback: return cleaned content but strip any leading assistant prose lines
  // Remove any leading short prose sentences (heuristic)
  const lines = cleanedLines.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(function|const|let|class|\/\*|\/\/|\{)/.test(lines[i])) {
      const candidate = lines.slice(i).join('\n').trim();
      return looksLikeJavaScriptCode(candidate) ? candidate : '';
    }
  }

  return looksLikeJavaScriptCode(cleanedLines) ? cleanedLines : '';
}

function isJavaScriptFenceLanguage(language: string) {
  return /^(?:javascript|js|node|nodejs)$/i.test(language.trim());
}

function looksLikeJavaScriptCode(code: string) {
  const stripped = code.trim();
  if (!stripped) {
    return false;
  }

  if (/^\s*(?:def|class\s+\w+\s*:|from\s+\w+\s+import|import\s+\w+|#include|public\s+class|class\s+Solution\s*\{|using\s+namespace)\b/m.test(stripped)) {
    return false;
  }

  return /\bfunction\s+[A-Za-z_$][\w$]*\s*\(|\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|=>|\bnew\s+(?:Map|Set|Array|TreeNode|ListNode)\b|\bconsole\.|\bMath\./.test(stripped);
}

function buildCommentedAssistantSolution(assistantText: string, solutionCode: string) {
  const commentText = extractAssistantExplanation(assistantText, solutionCode);
  if (!commentText) {
    return solutionCode;
  }

  return `${toBlockComment(commentText)}\n\n${solutionCode}`;
}

function extractAssistantExplanation(assistantText: string, solutionCode: string) {
  const withoutFencedCode = assistantText
    .replace(/```(?:javascript|js)?\s*[\s\S]*?```/gi, '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (withoutFencedCode) {
    return withoutFencedCode;
  }

  const normalizedCodeStart = solutionCode.trim().split('\n')[0]?.trim();
  if (!normalizedCodeStart) {
    return assistantText.trim();
  }

  const codeStartIndex = assistantText.indexOf(normalizedCodeStart);
  return (codeStartIndex > 0 ? assistantText.slice(0, codeStartIndex) : '').trim();
}

function toBlockComment(text: string) {
  const sanitized = text.replace(/\*\//g, '* /').trim();
  return [
    '/*',
    ...sanitized.split(/\r?\n/).flatMap((line) => {
      const wrappedLines = wrapCommentLine(line, 88);
      return wrappedLines.length ? wrappedLines.map((wrappedLine) => ` * ${wrappedLine}`) : [' *'];
    }),
    ' */',
  ].join('\n');
}

function wrapCommentLine(line: string, maxLength: number) {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return [];
  }

  const words = trimmedLine.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length > maxLength) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += ` ${word}`;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function renderOutputWithImages(raw: string) {
  // raw may contain description + assistant text. Render text and inline images below description.
  outputPanel.innerHTML = '';
  if (!raw) return;

  // Extract markdown image syntax ![alt](url)
  const mdImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  // Extract data URL images
  const dataImageRegex = /(data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+(?:\.[A-Za-z0-9+/=]+)*)/g;
  // Extract plain image URLs ending with image extensions
  const urlImageRegex = /(https?:\/\/[^\s"'<>)+]+\.(?:png|jpe?g|gif|svg)(?:\?[^\s"'<>]+)?)/gi;

  // We'll process the string sequentially: find earliest match among regexes
  let cursor = 0;
  const combinedRegex = new RegExp(`${mdImageRegex.source}|${dataImageRegex.source}|${urlImageRegex.source}`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = combinedRegex.exec(raw)) !== null) {
    const idx = match.index;
    if (idx > cursor) {
      const textSegment = raw.slice(cursor, idx);
      const p = document.createElement('pre');
      p.textContent = textSegment.trim();
      p.style.whiteSpace = 'pre-wrap';
      outputPanel.appendChild(p);
    }

    const imageUrl = match[1] ?? match[2] ?? match[3];
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.style.maxWidth = '100%';
      img.style.marginTop = '8px';
      img.alt = '';
      outputPanel.appendChild(img);
    }

    cursor = combinedRegex.lastIndex;
  }

  if (cursor < raw.length) {
    const rest = raw.slice(cursor);
    const p = document.createElement('pre');
    p.textContent = rest.trim();
    p.style.whiteSpace = 'pre-wrap';
    outputPanel.appendChild(p);
  }
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

function formatProblemDescription(description: string) {
  return String(description)
    .replace(/\s+/g, ' ')
    .replace(/\b(Example\s+\d+:)/g, '\n\n$1\n')
    .replace(/\b(Constraints:)/g, '\n\n$1\n')
    .replace(/\b(Input:)/g, '\n$1')
    .replace(/\b(Output:)/g, '\n$1')
    .replace(/\b(Explanation:)/g, '\n$1')
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

visualizeButton.addEventListener('click', () => {
  void visualizeCurrentInput();
});

animationCloseButton.addEventListener('click', () => {
  hideAnimationPanel();
});

resumeButton.addEventListener('click', () => {
  resumeMode = 'continue';
  explainNextDebugPause = false;
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
  currentDebugVariables = null;
  resumeCurrentPause?.();
  setRunState('idle');
});

// aiChatSendButton.addEventListener('click', () => {
//   void sendAiChatMessage();
// });
//
// aiChatInput.addEventListener('keydown', (event) => {
//   if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
//     event.preventDefault();
//     void sendAiChatMessage();
//   }
// });

function stepToNextLine() {
  resumeMode = 'step';
  explainNextDebugPause = true;
  if (resumeCurrentPause) {
    resumeCurrentPause();
    return;
  }

  if (stateText.textContent === 'Idle' || stateText.textContent === 'Done' || stateText.textContent === 'Error') {
    void runCode('step');
  }
}

async function visualizeCurrentInput() {
  visualizeButton.disabled = true;
  outputPanel.textContent = 'Loading interactive animation...';

  try {
    const selectedProblem = getSelectedProblem();
    if (!selectedProblem) {
      throw new Error('Select a LeetCode problem before opening animation.');
    }

    const result = await findInteractiveAnimation(selectedProblem);
    renderInteractiveAnimation(result.htmlPath, selectedProblem);
    outputPanel.textContent = `Loaded animation: ${result.htmlPath}`;
  } catch (error) {
    outputPanel.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    visualizeButton.disabled = false;
  }
}

async function findInteractiveAnimation(problem: Problem) {
  const response = await fetch(`/algorithm/interactive?problemId=${encodeURIComponent(String(problem.id))}`);
  const payload = (await response.json()) as AlgorithmInteractiveResponse;
  if (!response.ok || !payload.htmlPath) {
    throw new Error(payload.error ?? `Animation request failed with ${response.status}.`);
  }

  return { htmlPath: payload.htmlPath };
}

function renderInteractiveAnimation(htmlPath: string, problem: Problem) {
  animationTitle.textContent = `${problem.id}. ${problem.title}`;
  animationFrame.src = `${htmlPath}?t=${Date.now()}`;
  animationPanel.classList.remove('hidden');
}

function hideAnimationPanel() {
  animationFrame.removeAttribute('src');
  animationPanel.classList.add('hidden');
}

async function generateInteractiveAnimationFromCode(problem: Problem, jsCode: string) {
  try {
    const parsedArgs = parseArguments(argsInput.value);
    if (!Array.isArray(parsedArgs)) {
      throw new Error('Function arguments must be a JSON array to generate animation.');
    }

    const response = await fetch('/algorithm/interactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problemId: problem.id,
        titleSlug: problem.titleSlug ?? String(problem.id),
        jsCode,
        args: parsedArgs,
      }),
    });

    const payload = (await response.json()) as AlgorithmInteractiveResponse;
    if (!response.ok || !payload.htmlPath) {
      throw new Error(payload.error ?? `Animation generation failed with ${response.status}.`);
    }

    showStreamingOutput(`Solution moved to code editor.\nGenerated animation: ${payload.htmlPath}`);
  } catch (error) {
    showStreamingOutput(`Solution moved to code editor.\nAnimation generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function generateAlgorithmGif(arrayData: unknown[], className: string) {
  const response = await fetch('/algorithm/gif', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arrayData, className }),
  });

  const payload = (await response.json()) as AlgorithmGifResponse;
  if (!response.ok || !payload.gifPath) {
    throw new Error([payload.error ?? `GIF request failed with ${response.status}.`, payload.stderr].filter(Boolean).join('\n'));
  }

  return { gifPath: payload.gifPath, warning: payload.warning ?? '' };
}

function extractFirstVisualizableArray(args: unknown[]) {
  if (args.every(isPrimitiveVisualizationValue)) {
    return args;
  }

  const firstArray = args.find((arg): arg is unknown[] => Array.isArray(arg) && arg.every(isPrimitiveVisualizationValue));
  if (!firstArray) {
    throw new Error('No primitive array found to visualize. Example: [[3, 1, 4, 2]].');
  }

  return firstArray;
}

function isPrimitiveVisualizationValue(value: unknown) {
  return ['number', 'string', 'boolean'].includes(typeof value);
}

function getVisualizationClassName(problem: Problem | null) {
  const text = normalizeSearchText(`${problem?.title ?? ''} ${problem?.titleSlug ?? ''} ${(problem?.tags ?? []).join(' ')}`);
  return /\b(sort|sorting|quick sort|quicksort)\b/.test(text) ? 'QuickSortVisualization' : 'ArrayVisualization';
}

function renderGeneratedGif(gifPath: string, arrayData: unknown[], className: string, warning = '') {
  outputPanel.innerHTML = '';

  const details = document.createElement('pre');
  details.textContent = [`Generated ${className}`, `Input: ${JSON.stringify(arrayData)}`, warning].filter(Boolean).join('\n');

  const image = document.createElement('img');
  image.src = `${gifPath}?t=${Date.now()}`;
  image.alt = `${className} GIF`;
  image.className = 'generated-gif';

  outputPanel.append(details, image);
}

async function runCode(initialMode: ResumeMode = 'continue') {
  stopped = false;
  resumeMode = initialMode;
  explainNextDebugPause = initialMode === 'step';
  debugStepCounter = 0;
  debugMatrixPath = [];
  setRunState('running');
  resultPanel.textContent = 'Running...';
  lineText.textContent = '-';
  clearActiveLine();
  currentDebugVariables = null;
  renderVariables(null);

  try {
    const parsed = parseArguments(argsInput.value);
    let args: unknown[] = [];
    let setupCode: string | null = null;

    if (Array.isArray(parsed)) {
      args = parsed;
    } else if (parsed && typeof parsed === 'object' && (parsed as any).__setup) {
      setupCode = (parsed as any).__setup as string;
    }

    const instrumentedCode = instrumentCode(editor.getValue(), breakpoints);

    // If setup code is present, bind the solution to the constructed root (or first detected var)
    let factory: Function;
    if (setupCode) {
      const match = setupCode.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+TreeNode/);
      const varName = match?.[1] ?? (setupCode.includes('root') ? 'root' : 'root');

      factory = new Function(
        '__debug__',
        'TreeNode',
        'ListNode',
        `${instrumentedCode}\n${setupCode}\nreturn typeof solution === 'function' ? solution.bind(null, ${varName}) : null;`,
      );
    } else {
      factory = new Function(
        '__debug__',
        'TreeNode',
        'ListNode',
        `${instrumentedCode}\nreturn typeof solution === 'function' ? solution : null;`,
      );
    }

    const solution = factory(handleProbe, TreeNode, ListNode) as ((...args: unknown[]) => unknown) | null;
    if (!solution) {
      throw new Error('Define a function named solution.');
    }

    const invocations = buildSolutionInvocations(args, editor.getValue());
    const results = [];
    for (const invocationArgs of invocations) {
      results.push(await solution(...invocationArgs));
    }

    if (stopped) {
      resultPanel.textContent = 'Stopped.';
      return;
    }

    resultPanel.textContent = stringifyValue(results.length === 1 ? results[0] : results);
    clearActiveLine();
    currentDebugVariables = null;
    lineText.textContent = '-';
    setRunState('done');
  } catch (error) {
    resultPanel.textContent = error instanceof Error ? error.message : String(error);
    setRunState('error');
  } finally {
    resumeCurrentPause = null;
    if (stateText.textContent === 'Running') {
      setRunState('done');
    }
  }
}

function parseArguments(input: string): unknown[] | { __setup: string } {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) {
      // Accept single value and wrap into array
      return [parsed];
    }

    return parsed;
  } catch (e) {
    // Not JSON: treat as setup JavaScript code for constructing test state (e.g., TreeNode)
    return { __setup: input };
  }
}

function buildSolutionInvocations(args: unknown[], code: string): unknown[][] {
  const paramNames = getSolutionParamNames(code);
  const treeParamNames = getTreeParamNames(code);
  const listParamNames = getListParamNames(code);
  const selectedProblem = getSelectedProblem();

  if (paramNames.length === 1 && shouldConvertArgumentToListCollection(paramNames[0], args, selectedProblem, listParamNames)) {
    return [[args.map((listValues) => buildLinkedListFromArray(listValues as unknown[]))]];
  }

  if (paramNames.length === 1 && shouldConvertArgumentToList(paramNames[0], args, selectedProblem, listParamNames)) {
    return [[buildLinkedListFromArray(args)]];
  }

  if (paramNames.length === 1 && shouldConvertArgumentToTree(paramNames[0], args, selectedProblem, paramNames, treeParamNames)) {
    return [[buildBinaryTreeFromLevelOrder(args)]];
  }

  if (
    paramNames.length === 1 &&
    shouldConvertArgumentToTree(paramNames[0], args[0], selectedProblem, paramNames, treeParamNames) &&
    args.every((arg) => Array.isArray(arg))
  ) {
    return args.map((arg) => [buildBinaryTreeFromLevelOrder(arg as unknown[])]);
  }

  return [args.map((arg, index) => {
    if (shouldConvertArgumentToListCollection(paramNames[index], arg, selectedProblem, listParamNames)) {
      return (arg as unknown[]).map((listValues) => buildLinkedListFromArray(listValues as unknown[]));
    }

    if (shouldConvertArgumentToList(paramNames[index], arg, selectedProblem, listParamNames)) {
      return buildLinkedListFromArray(arg as unknown[]);
    }

    return shouldConvertArgumentToTree(paramNames[index], arg, selectedProblem, paramNames, treeParamNames)
      ? buildBinaryTreeFromLevelOrder(arg as unknown[])
      : arg;
  })];
}

function getSolutionParamNames(code: string) {
  const match = stripJavaScriptComments(code).match(/function\s+solution\s*\(([^)]*)\)/);
  if (!match || !match[1].trim()) {
    return [];
  }

  return match[1]
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean);
}

function stripJavaScriptComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function getTreeParamNames(code: string) {
  const names = new Set<string>();
  const treeParamPattern = /@param\s*\{[^}]*TreeNode[^}]*}\s+([A-Za-z_$][\w$]*)/g;
  for (const match of code.matchAll(treeParamPattern)) {
    names.add(match[1]);
  }

  return names;
}

function getListParamNames(code: string) {
  const names = new Set<string>();
  const listParamPattern = /@param\s*\{[^}]*ListNode[^}]*}\s+([A-Za-z_$][\w$]*)/g;
  for (const match of code.matchAll(listParamPattern)) {
    names.add(match[1]);
  }

  return names;
}

function getSelectedProblem() {
  return problems.find((problem) => problem.id === selectedProblemId) ?? null;
}

function shouldConvertArgumentToTree(
  paramName: string | undefined,
  value: unknown,
  problem: Problem | null,
  paramNames: string[],
  treeParamNames: Set<string>,
) {
  if (!Array.isArray(value) || !isLevelOrderTreeInput(value)) {
    return false;
  }

  if (paramName && treeParamNames.has(paramName)) {
    return true;
  }

  const normalizedParamName = normalizeSearchText(paramName ?? '');
  if (normalizedParamName === 'root' || normalizedParamName.endsWith('root')) {
    return true;
  }

  const problemText = normalizeSearchText(`${problem?.title ?? ''} ${problem?.titleSlug ?? ''} ${(problem?.tags ?? []).join(' ')}`);
  return paramNames.length === 1 && /\b(binary tree|tree)\b/.test(problemText);
}

function shouldConvertArgumentToListCollection(
  paramName: string | undefined,
  value: unknown,
  problem: Problem | null,
  listParamNames: Set<string>,
) {
  if (!Array.isArray(value) || !value.every((item) => Array.isArray(item) && isListValuesInput(item))) {
    return false;
  }

  const normalizedParamName = normalizeSearchText(paramName ?? '');
  if (paramName && listParamNames.has(paramName)) {
    return true;
  }

  if (normalizedParamName === 'lists' || normalizedParamName.endsWith('lists')) {
    return true;
  }

  const problemText = normalizeSearchText(`${problem?.title ?? ''} ${problem?.titleSlug ?? ''} ${(problem?.tags ?? []).join(' ')}`);
  return /\blinked list\b/.test(problemText) && /\bmerge k sorted lists\b/.test(problemText);
}

function shouldConvertArgumentToList(
  paramName: string | undefined,
  value: unknown,
  problem: Problem | null,
  listParamNames: Set<string>,
) {
  if (!Array.isArray(value) || !isListValuesInput(value)) {
    return false;
  }

  const normalizedParamName = normalizeSearchText(paramName ?? '');
  if (paramName && listParamNames.has(paramName)) {
    return true;
  }

  if (normalizedParamName === 'head' || normalizedParamName.endsWith('head') || normalizedParamName.includes('list')) {
    return true;
  }

  const problemText = normalizeSearchText(`${problem?.title ?? ''} ${problem?.titleSlug ?? ''} ${(problem?.tags ?? []).join(' ')}`);
  return /\blinked list\b/.test(problemText);
}

function isListValuesInput(value: unknown[]) {
  return value.every((item) => item === null || ['number', 'string', 'boolean'].includes(typeof item));
}

function isLevelOrderTreeInput(value: unknown[]) {
  return value.every((item) => item === null || ['number', 'string', 'boolean'].includes(typeof item));
}

function buildLinkedListFromArray(values: unknown[]) {
  const dummy = new ListNode();
  let tail = dummy;
  for (const value of values) {
    if (value === null) {
      continue;
    }

    tail.next = new ListNode(value);
    tail = tail.next;
  }

  return dummy.next;
}

function buildBinaryTreeFromLevelOrder(values: unknown[]) {
  if (values.length === 0 || values[0] == null) {
    return null;
  }

  const root = new TreeNode(values[0]);
  const queue: TreeNode[] = [root];
  let valueIndex = 1;

  while (queue.length > 0 && valueIndex < values.length) {
    const node = queue.shift()!;
    const leftValue = values[valueIndex++];
    if (leftValue != null) {
      node.left = new TreeNode(leftValue);
      queue.push(node.left);
    }

    if (valueIndex >= values.length) {
      break;
    }

    const rightValue = values[valueIndex++];
    if (rightValue != null) {
      node.right = new TreeNode(rightValue);
      queue.push(node.right);
    }
  }

  return root;
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
  debugStepCounter += 1;
  recordMatrixDebugStep(snapshot.variables);
  setRunState('paused');
  lineText.textContent = String(snapshot.line);
  setActiveLine(snapshot.line);
  editor.revealLineInCenter(snapshot.line);
  editor.setPosition({ lineNumber: snapshot.line, column: 1 });
  currentDebugVariables = snapshot.variables;
  renderVariables(snapshot.variables);
  if (explainNextDebugPause) {
    explainNextDebugPause = false;
    void explainDebugVariables(snapshot);
  }

  await new Promise<void>((resolve) => {
    resumeCurrentPause = () => {
      resumeCurrentPause = null;
      resolve();
    };
  });

  if (!stopped) {
    clearActiveLine();
    currentDebugVariables = null;
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
  const localFunctionNames = collectLocalFunctionNames(lines);
  let solutionDepth = 0;
  let expressionDepth = 0;

  return lines
    .map((line, index) => {
      const lineNumber = index + 1;
      const trimmed = line.trim();
      const isSolutionDeclaration = /^function\s+solution\s*\(/.test(trimmed);
      const isNestedFunctionDeclaration = solutionDepth > 0 && /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/.test(trimmed);

      let nextLine = line;
      if (isSolutionDeclaration) {
        nextLine = line.replace(/function\s+solution\s*\(/, 'async function solution(');
      } else if (isNestedFunctionDeclaration) {
        nextLine = line.replace(/\bfunction\s+/, 'async function ');
      } else if (solutionDepth > 0) {
        nextLine = awaitLocalFunctionCalls(line, localFunctionNames);
      }

      const shouldProbe = solutionDepth > 0 && expressionDepth === 0 && isRunnableLine(trimmed);
      const openBraces = (line.match(/{/g) ?? []).length;
      const closeBraces = (line.match(/}/g) ?? []).length;
      expressionDepth = Math.max(0, expressionDepth + countExpressionDepthDelta(line));

      if (solutionDepth > 0 || isSolutionDeclaration) {
        solutionDepth = Math.max(0, solutionDepth + openBraces - closeBraces);
      }

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

function collectLocalFunctionNames(lines: string[]) {
  const names = new Set<string>();
  let solutionDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isSolutionDeclaration = /^function\s+solution\s*\(/.test(trimmed);
    const functionMatch = trimmed.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (solutionDepth > 0 && functionMatch && functionMatch[1] !== 'solution') {
      names.add(functionMatch[1]);
    }

    const openBraces = (line.match(/{/g) ?? []).length;
    const closeBraces = (line.match(/}/g) ?? []).length;
    if (solutionDepth > 0 || isSolutionDeclaration) {
      solutionDepth = Math.max(0, solutionDepth + openBraces - closeBraces);
    }
  }

  return names;
}

function awaitLocalFunctionCalls(line: string, functionNames: Set<string>) {
  if (functionNames.size === 0 || /\bawait\b/.test(line)) {
    return line;
  }

  let nextLine = line;
  for (const name of functionNames) {
    const callPattern = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g');
    nextLine = nextLine.replace(callPattern, `await ${name}(`);
  }

  return nextLine;
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
  const highlightedTreeNodes = getHighlightedTreeNodes(variables);
  const treeMonitor = renderTreeMonitor(variables, highlightedTreeNodes);
  const rows = Object.entries(variables).map(([name, value]) => {
    const row = document.createElement('div');
    row.className = 'variable-row';

    const label = document.createElement('span');
    label.className = 'variable-name';
    label.textContent = name;

    const code = document.createElement('code');
    code.append(renderVariableValue(value, indexByName, highlightedTreeNodes, name));

    row.append(label, code);
    return row;
  });

  variablesPanel.replaceChildren(
    ...(treeMonitor ? [treeMonitor] : []),
    ...rows,
  );
}

function getVisibleIndexes(variables: Record<string, unknown>) {
  const result = new Map<string, number>();
  for (const name of ['i', 'j', 'k', 'left', 'right', 'mid', 'row', 'col', 'r', 'c', 'x', 'y']) {
    const value = variables[name];
    if (Number.isInteger(value) && Number(value) >= 0) {
      result.set(name, Number(value));
    }
  }

  return result;
}

function recordMatrixDebugStep(variables: Record<string, unknown>) {
  const indexes = getVisibleIndexes(variables);
  const coordinate = getMatrixCoordinate(indexes);
  if (!coordinate) {
    return;
  }

  const last = debugMatrixPath[debugMatrixPath.length - 1];
  if (last?.row === coordinate.row && last.col === coordinate.col) {
    last.step = debugStepCounter;
    return;
  }

  debugMatrixPath.push({ ...coordinate, step: debugStepCounter });
}

function getMatrixCoordinate(indexes: Map<string, number>) {
  const row = indexes.get('i') ?? indexes.get('row') ?? indexes.get('r') ?? indexes.get('x');
  const col = indexes.get('j') ?? indexes.get('col') ?? indexes.get('c') ?? indexes.get('y') ?? indexes.get('k');
  if (typeof row !== 'number' || typeof col !== 'number') {
    return null;
  }

  return { row, col };
}

function getMatrixPathStep(row: number, col: number) {
  for (let index = debugMatrixPath.length - 1; index >= 0; index -= 1) {
    const entry = debugMatrixPath[index];
    if (entry.row === row && entry.col === col) {
      return entry.step;
    }
  }

  return null;
}

function getHighlightedTreeNodes(variables: Record<string, unknown>) {
  const highlighted = new Set<TreeNode>();
  for (const [name, value] of Object.entries(variables)) {
    if (!isTreeNode(value)) {
      continue;
    }

    const normalizedName = normalizeSearchText(name);
    if (['node', 'current', 'cur', 'curr', 'iterator', 'iter'].includes(normalizedName)) {
      highlighted.add(value);
    }
  }

  return highlighted;
}

function renderTreeMonitor(variables: Record<string, unknown>, highlightedTreeNodes: Set<TreeNode>) {
  const root = findRootTreeNode(variables);
  if (!root) {
    return null;
  }

  const monitor = document.createElement('section');
  monitor.className = 'tree-monitor';

  const header = document.createElement('div');
  header.className = 'tree-monitor-header';
  header.textContent = 'Tree';

  const diagram = renderTreeDiagram(root, highlightedTreeNodes);
  monitor.append(header, diagram);
  return monitor;
}

function findRootTreeNode(variables: Record<string, unknown>) {
  if (isTreeNode(variables.root)) {
    return variables.root;
  }

  const treeEntry = Object.entries(variables).find(([name, value]) => {
    const normalizedName = normalizeSearchText(name);
    return isTreeNode(value) && (normalizedName.endsWith('root') || normalizedName.includes('tree'));
  });

  return isTreeNode(treeEntry?.[1]) ? treeEntry[1] : null;
}

function renderVariableValue(value: unknown, indexes: Map<string, number>, highlightedTreeNodes: Set<TreeNode>, variableName?: string) {
  if (isTreeNode(value)) {
    return renderTreeDiagram(value, highlightedTreeNodes);
  }

  if (isListNode(value)) {
    return document.createTextNode(stringifyValue(listNodeToArray(value)));
  }

  if (!Array.isArray(value)) {
    return document.createTextNode(stringifyValue(value));
  }

  // Detect rectangular primitive matrices. Jagged nested arrays are usually adjacency lists.
  const is2D = isRectangularPrimitiveMatrix(value);
  if (is2D) {
    return renderMatrixValue(value as unknown[][], indexes, highlightedTreeNodes, variableName);
  }

  // Fallback: 1D array rendering with highlights
  const wrapper = document.createElement('span');
  wrapper.className = 'array-preview';
  wrapper.append('[');

  (value as unknown[]).forEach((item, itemIndex) => {
    if (itemIndex > 0) {
      wrapper.append(', ');
    }

    const element = document.createElement('span');
    element.append(renderVariableValue(item, indexes, highlightedTreeNodes));

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

function renderMatrixValue(
  rows: unknown[][],
  indexes: Map<string, number>,
  highlightedTreeNodes: Set<TreeNode>,
  variableName?: string,
) {
  const wrapper = document.createElement('div');
  wrapper.className = isDynamicProgrammingMatrixName(variableName ?? '') ? 'matrix-monitor dp-matrix-monitor' : 'matrix-monitor';

  if (variableName) {
    const coordinate = getMatrixCoordinate(indexes);
    const cols = rows[0]?.length ?? 0;
    const header = document.createElement('div');
    header.className = 'matrix-monitor-header';
    header.textContent = isDynamicProgrammingMatrixName(variableName)
      ? `DP Matrix: ${variableName} (${rows.length} x ${cols})`
      : `Matrix: ${variableName} (${rows.length} x ${cols})`;

    if (coordinate && coordinate.row < rows.length && coordinate.col < cols) {
      const detail = document.createElement('span');
      detail.className = 'matrix-monitor-current';
      detail.textContent = `${variableName}[${coordinate.row}][${coordinate.col}] = ${stringifyValue(rows[coordinate.row][coordinate.col])}`;
      header.append(detail);
    }

    wrapper.append(header);
  }

  const table = document.createElement('table');
  table.className = 'array-table matrix-table';

  const cols = Math.max(0, ...rows.map((r) => r.length));
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'array-row-index matrix-corner';
  corner.textContent = '';
  headRow.append(corner);

  for (let colIndex = 0; colIndex < cols; colIndex += 1) {
    const th = document.createElement('th');
    th.className = 'array-row-index';
    th.textContent = String(colIndex);
    headRow.append(th);
  }

  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th');
    rowHeader.className = 'array-row-index';
    rowHeader.textContent = String(rowIndex);
    tr.append(rowHeader);

    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const td = document.createElement('td');
      const cellVal = colIndex < row.length ? row[colIndex] : undefined;
      td.append(renderVariableValue(cellVal, indexes, highlightedTreeNodes));

      const pathStep = getMatrixPathStep(rowIndex, colIndex);
      if (pathStep !== null) {
        td.classList.add('dfs-path-element');
        const pathBadge = document.createElement('span');
        pathBadge.className = 'dfs-path-step';
        pathBadge.textContent = String(pathStep);
        td.append(pathBadge);
      }

      const coordinate = getMatrixCoordinate(indexes);
      if (coordinate?.row === rowIndex && coordinate.col === colIndex) {
        td.className = 'current-array-element';
        td.querySelector('.dfs-path-step')?.remove();
        td.title = `Current cell: ${[...indexes.entries()].filter(([, v]) => v === rowIndex || v === colIndex).map(([n]) => n).join(', ')}`;
        const step = document.createElement('span');
        step.className = 'current-array-step';
        step.textContent = String(debugStepCounter);
        td.append(step);
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.append(table);
  return wrapper;
}

function isDynamicProgrammingMatrixName(name: string) {
  return /^(?:dp|memo|cache|table|matrix|grid|cost|dist|distance|ways|count|counts|min|max)$/i.test(name);
}

function isRectangularPrimitiveMatrix(value: unknown[]) {
  if (value.length === 0 || !value.every((row) => Array.isArray(row))) {
    return false;
  }

  const rows = value as unknown[][];
  const width = rows[0].length;
  return rows.every((row) => {
    return row.length === width && row.every((item) => !Array.isArray(item) && !isPlainObject(item));
  });
}

function isPlainObject(value: unknown) {
  return value !== null && typeof value === 'object' && !(value instanceof Map) && !(value instanceof Set);
}

function isTreeNode(value: unknown): value is TreeNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    'val' in value &&
    'left' in value &&
    'right' in value
  );
}

function isListNode(value: unknown): value is ListNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    'val' in value &&
    'next' in value &&
    !('left' in value) &&
    !('right' in value)
  );
}

function listNodeToArray(head: ListNode | null) {
  const values: unknown[] = [];
  const seen = new Set<ListNode>();
  let current = head;
  while (current && !seen.has(current) && values.length < 1000) {
    seen.add(current);
    values.push(current.val);
    current = current.next;
  }

  if (current) {
    values.push('[cycle]');
  }

  return values;
}

function renderTreeDiagram(root: TreeNode, highlightedTreeNodes: Set<TreeNode>) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-diagram';
  wrapper.append(renderTreeNode(root, highlightedTreeNodes, 0));
  return wrapper;
}

function renderTreeNode(node: TreeNode | null, highlightedTreeNodes: Set<TreeNode>, depth: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'tree-node-group';

  const badge = document.createElement('span');
  badge.className = node && highlightedTreeNodes.has(node) ? 'tree-node current-tree-node' : 'tree-node';
  badge.textContent = node ? stringifyValue(node.val) : 'null';
  item.append(badge);

  if (!node || depth >= 7 || (!node.left && !node.right)) {
    return item;
  }

  const children = document.createElement('div');
  children.className = 'tree-children';
  children.append(renderTreeNode(node.left, highlightedTreeNodes, depth + 1));
  children.append(renderTreeNode(node.right, highlightedTreeNodes, depth + 1));
  item.append(children);

  return item;
}

function formatHoverValue(value: unknown) {
  if (isTreeNode(value)) {
    return JSON.stringify(treeNodePreview(value), null, 2);
  }

  const text = stringifyValue(value);
  return text.length > 1800 ? `${text.slice(0, 1800)}\n...` : text;
}

function treeNodePreview(node: TreeNode | null): unknown {
  if (!node) {
    return null;
  }

  return {
    val: node.val,
    left: node.left ? node.left.val : null,
    right: node.right ? node.right.val : null,
  };
}

function stringifyValue(value: unknown) {
  if (isListNode(value)) {
    return stringifyValue(listNodeToArray(value));
  }

  if (value instanceof Map) {
    return JSON.stringify(Object.fromEntries(value), jsonValueReplacer, 2);
  }

  if (value instanceof Set) {
    return JSON.stringify([...value], jsonValueReplacer, 2);
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  try {
    return JSON.stringify(value, jsonValueReplacer, 2);
  } catch {
    return String(value);
  }
}

function jsonValueReplacer(_key: string, value: unknown) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  return value;
}

function setRunState(state: RunState) {
  const label = state[0].toUpperCase() + state.slice(1);
  stateText.textContent = label;
  document.body.dataset.state = state;
  runButton.disabled = state === 'running' || state === 'paused';
  visualizeButton.disabled = state === 'running' || state === 'paused';
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
