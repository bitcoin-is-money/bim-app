import {defineConfig} from 'vitest/config';

// export default defineConfig({
//   test: {
//     include: ['test/**/*.test.ts'],
//     environment: 'jsdom',
//     globals: true,
//   },
// });

export default defineConfig({
  test: {
    root: './',
    include: ['src/test/**/*.test.ts'],
    environment: 'jsdom',
    watch: false,
  }
});
