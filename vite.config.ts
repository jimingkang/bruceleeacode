import { defineConfig } from 'vite';

export default defineConfig({
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

