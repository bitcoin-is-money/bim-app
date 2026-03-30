import {build} from 'esbuild';

await build({
  entryPoints: ['src/entrypoint.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/entrypoint.mjs',
  external: ['pg'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
