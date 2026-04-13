import {build} from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/main.js',
  banner: {
    // Because of pino, still in CJS, not ESM
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
