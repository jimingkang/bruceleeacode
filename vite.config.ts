import { defineConfig } from 'vite';

export default defineConfig({
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
