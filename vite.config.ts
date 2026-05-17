import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [ollamaSolutionPlugin()],
  server: {
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
    },
  },
});

function ollamaSolutionPlugin() {
  return {
    name: 'ollama-solution-api',
    configureServer(server) {
      server.middlewares.use('/ollama/solution', async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }

        const model = process.env.OLLAMA_MODEL;
        if (!model) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Set OLLAMA_MODEL before starting the dev server.' }));
          return;
        }

        try {
          const body = await readJsonBody(request);
          const prompt = buildDeepSeekPrompt(body);
          const { execFile } = require('child_process');

          execFile('ollama', ['generate', model, '--prompt', prompt], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
              response.statusCode = 500;
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({ error: err.message + (stderr ? ': ' + String(stderr) : '') }));
              return;
            }

            const content = String(stdout ?? '').trim();
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ code: stripMarkdownCodeFence(content) }));
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

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
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

function buildDeepSeekPrompt(problem) {
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

function stripMarkdownCodeFence(content) {
  return content
    .trim()
    .replace(/^```(?:javascript|js)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

