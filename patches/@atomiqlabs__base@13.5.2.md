# @atomiqlabs/base patch

Changes `import { StorageObject }` to `import type { StorageObject }` in `SwapData.ts` so the symbol is erased at runtime.

Required because `StorageObject` is a type-only import; the value import triggers a circular reference / unused-value error in our strict TS build pipeline.

Upstream still ships the value import as of 13.5.2, so the fix is still needed.

Registered via pnpm `patchedDependencies` in `pnpm-workspace.yaml`.
