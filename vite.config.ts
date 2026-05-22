import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [ollamaSolutionPlugin()],
  server: {
    // Note: binding to port 80 may require elevated privileges on Unix-like systems.
    port: 8080,
    host: true,
    hmr: {
      protocol: 'wss',
      host: 'bruceleecode.org',
      clientPort: 443,
    },
    // Allow the bruceleecode.org host for incoming requests (adjust as needed).
    allowedHosts: ['bruceleecode.org', 'localhost', '127.0.0.1'],
    proxy: {
      '/leetcode/graphql': {
        target: 'https://leetcode.com',
        changeOrigin: true,
        rewrite: () => '/graphql',
        headers: {
          Referer: 'https://leetcode.com',
          Origin: 'https://leetcode.com',
        },
      },
      '/alfa': {
        target: 'https://alfa-leetcode-api.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/alfa/, ''),
      },
      // Proxy Ollama HTTP API to avoid CORS/preflight issues from the browser
      '/api/chat': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        secure: false,
      },
      '/api/generate': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

function ollamaSolutionPlugin() {
  return {
    name: 'ollama-solution-api',
    configureServer(server:any) {
      server.middlewares.use('/algorithm-media', async (request: any, response: any) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        const mediaRoot = path.resolve(process.cwd(), 'media');
        const requestedPath = path.resolve(mediaRoot, relativePath);

        if (!requestedPath.startsWith(mediaRoot)) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }

        try {
          response.setHeader('Content-Type', getMediaContentType(requestedPath));
          createReadStream(requestedPath).pipe(response);
        } catch {
          response.statusCode = 404;
          response.end('Not found');
        }
      });

      server.middlewares.use('/algorithm/interactive', async (request: any, response: any) => {
        if (!['GET', 'POST'].includes(request.method ?? '')) {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }

        try {
          if (request.method === 'POST') {
            const body = await readJsonBody(request);
            const problemId = String(body.problemId ?? '').trim();
            const titleSlug = String(body.titleSlug ?? 'solution').trim();
            const jsCode = String(body.jsCode ?? '');
            const args = body.args;

            if (!/^\d+$/.test(problemId)) {
              throw new Error('problemId must be a LeetCode number.');
            }

            if (!Array.isArray(args)) {
              throw new Error('args must be a JSON array.');
            }

            const { execFile } = await import('child_process');
            const pythonExecutable = path.resolve(process.cwd(), '.venv/bin/python');
            const scriptPath = path.resolve(process.cwd(), 'scripts', 'generate_interactive_animation.py');

            // Determine function name: prefer explicit body.functionName, else try to detect from jsCode, else default to 'solution'
            let functionName = String(body.functionName ?? '').trim() || 'solution';
            if (!body.functionName) {
              const fnMatch1 = jsCode.match(/function\s+([A-Za-z_$][\w$]*)\s*\(/);
              const fnMatch2 = jsCode.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\()/);
              const fnMatch3 = jsCode.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>/);
              const detected = (fnMatch1 && fnMatch1[1]) || (fnMatch2 && fnMatch2[1]) || (fnMatch3 && fnMatch3[1]);
              if (detected) functionName = detected;
            }

            const payload = JSON.stringify({ jsCode, args });
            const execArgs = [scriptPath, '--leetcode-id', problemId, '--title-slug', titleSlug, '--function-name', functionName];

            const generated = await new Promise<any>((resolve, reject) => {
              const child = execFile(
                pythonExecutable,
                execArgs,
                {
                  cwd: process.cwd(),
                  maxBuffer: 20 * 1024 * 1024,
                  timeout: 120000,
                },
                (error: any, stdout: any, stderr: any) => {
                  if (error) {
                    reject(new Error(`${error.message}\n${String(stderr ?? stdout ?? '').slice(0, 4000)}`));
                    return;
                  }

                  try {
                    resolve(JSON.parse(String(stdout ?? '{}')));
                  } catch {
                    reject(new Error(`Animation generator returned invalid JSON: ${String(stdout ?? '').slice(0, 1000)}`));
                  }
                },
              );

              child.stdin?.end(payload);
            });

            const htmlPath = String(generated.htmlPath ?? '');
            const mediaRelativePath = path.relative(path.resolve(process.cwd(), 'media'), path.resolve(process.cwd(), htmlPath)).split(path.sep).join('/');
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ htmlPath: `/algorithm-media/${mediaRelativePath}` }));
            return;
          }

          const url = new URL(request.url ?? '/', 'http://localhost');
          const problemId = String(url.searchParams.get('problemId') ?? '').trim();
          if (!/^\d+$/.test(problemId)) {
            throw new Error('problemId must be a LeetCode number.');
          }
          const interactiveRoot = path.resolve(process.cwd(), 'media', 'interactive');
          const entries = await readdir(interactiveRoot, { withFileTypes: true }).catch(() => []);
          const match = entries
            .filter((entry) => entry.isFile() && entry.name.startsWith(`${problemId}_`) && entry.name.endsWith('.html'))
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right))[0];

          if (!match) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({
              error: `No interactive animation found. Expected a file named like media/interactive/${problemId}_*.html.`,
            }));
            return;
          }

          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ htmlPath: `/algorithm-media/interactive/${encodeURIComponent(match)}` }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use('/algorithm/gif', async (request: any, response: any) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }

        try {
          const body = await readJsonBody(request);
          const arrayData = body.arrayData;
          const className = String(body.className ?? 'ArrayVisualization');

          if (!Array.isArray(arrayData)) {
            throw new Error('arrayData must be an array.');
          }

          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(className)) {
            throw new Error('className must be a valid Python class name.');
          }

          const { execFile } = await import('child_process');
          const manimExecutable = path.resolve(process.cwd(), '.venv/bin/manim');
          const scriptPath = path.resolve(process.cwd(), 'my_algorithm_scene.py');
          const beforeStartedAt = Date.now();

          execFile(
            manimExecutable,
            ['-ql', '--format=gif', scriptPath, className],
            {
              cwd: process.cwd(),
              env: {
                ...process.env,
                ALGORITHM_VISUALIZATION_DATA: JSON.stringify(arrayData),
              },
              maxBuffer: 20 * 1024 * 1024,
              timeout: 180000,
            },
            async (err: any, stdout: any, stderr: any) => {
              if (err) {
                renderGifWithPillowFallback(className, arrayData, beforeStartedAt, String(stderr ?? err.message))
                  .then((payload) => {
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify(payload));
                  })
                  .catch((fallbackError) => {
                    response.statusCode = 500;
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({
                      error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                      manimError: err.message,
                      stderr: String(stderr ?? '').slice(0, 4000),
                      stdout: String(stdout ?? '').slice(0, 4000),
                    }));
                  });
                return;
              }

              const gifPath = await findLatestFile(path.resolve(process.cwd(), 'media'), '.gif', beforeStartedAt).catch(() => null);
              if (!gifPath) {
                response.statusCode = 500;
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ error: 'Manim finished but no GIF was found under media/.' }));
                return;
              }

              const mediaRelativePath = path.relative(path.resolve(process.cwd(), 'media'), gifPath).split(path.sep).join('/');
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({
                gifPath: `/algorithm-media/${mediaRelativePath}`,
                stdout: String(stdout ?? ''),
              }));
            },
          );
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use('/ollama/solution', async (request :any, response:any) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }

        // Use env model or default to a known local model if not set.
        const model = process.env.OLLAMA_MODEL ?? 'llama3.2:latest';

        try {
          const body = await readJsonBody(request);
          const prompt = buildDeepSeekPrompt(body);
          const { execFile } = await import('child_process');

          // Run ollama and return plain stdout. Use --nowordwrap to avoid inserted line breaks.
          console.log('[ollama] /ollama/solution request, model=', model);
          execFile('ollama', ['run', model, prompt, '--nowordwrap'], { maxBuffer: 10 * 1024 * 1024, timeout: 120000 }, (err:any, stdout:any, stderr:any) => {
            console.log('[ollama] stdout length=', stdout ? String(stdout).length : 0);
            if (stderr) console.error('[ollama] stderr', String(stderr).slice(0, 1000));
            if (err) {
              console.error('[ollama] error', err);
              response.statusCode = 500;
              response.setHeader('Content-Type', 'application/json');
              const timedOut = (err as any).killed && (err as any).signal === 'SIGTERM';
              response.end(JSON.stringify({ error: err.message + (stderr ? ': ' + String(stderr) : ''), timedOut }));
              return;
            }

            const content = String(stdout ?? '').trim();
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ code: stripMarkdownCodeFence(content), raw: content }));
          });
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

async function renderGifWithPillowFallback(className: string, arrayData: unknown[], beforeStartedAt: number, manimError: string) {
  const { execFile } = await import('child_process');
  const pythonExecutable = path.resolve(process.cwd(), '.venv/bin/python');
  const scriptPath = path.resolve(process.cwd(), 'scripts/render_algorithm_gif.py');

  await new Promise<void>((resolve, reject) => {
    execFile(
      pythonExecutable,
      [scriptPath, className],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ALGORITHM_VISUALIZATION_DATA: JSON.stringify(arrayData),
        },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000,
      },
      (error: any, stdout: any, stderr: any) => {
        if (error) {
          reject(new Error(`${error.message}\n${String(stderr ?? stdout ?? '').slice(0, 4000)}`));
          return;
        }

        resolve();
      },
    );
  });

  const gifPath = await findLatestFile(path.resolve(process.cwd(), 'media'), '.gif', beforeStartedAt);
  if (!gifPath) {
    throw new Error('Fallback renderer finished but no GIF was found under media/.');
  }

  const mediaRelativePath = path.relative(path.resolve(process.cwd(), 'media'), gifPath).split(path.sep).join('/');
  return {
    gifPath: `/algorithm-media/${mediaRelativePath}`,
    warning: `Manim failed, generated GIF with Python fallback renderer instead: ${manimError.slice(0, 800)}`,
  };
}

function getMediaContentType(filePath: string) {
  if (filePath.endsWith('.gif')) {
    return 'image/gif';
  }

  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }

  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }

  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }

  return 'application/octet-stream';
}

async function findLatestFile(root: string, extension: string, minimumMtimeMs: number): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  let latest: { path: string; mtimeMs: number } | null = null;

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findLatestFile(entryPath, extension, minimumMtimeMs);
      if (nested) {
        const nestedStat = await stat(nested);
        if (!latest || nestedStat.mtimeMs > latest.mtimeMs) {
          latest = { path: nested, mtimeMs: nestedStat.mtimeMs };
        }
      }
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(extension)) {
      continue;
    }

    const entryStat = await stat(entryPath);
    if (entryStat.mtimeMs < minimumMtimeMs - 1000) {
      continue;
    }

    if (!latest || entryStat.mtimeMs > latest.mtimeMs) {
      latest = { path: entryPath, mtimeMs: entryStat.mtimeMs };
    }
  }

  return latest?.path ?? null;
}

function readJsonBody(request: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk: any) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function buildDeepSeekPrompt(problem: any): string {
  return [
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

function stripMarkdownCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:javascript|js)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}
