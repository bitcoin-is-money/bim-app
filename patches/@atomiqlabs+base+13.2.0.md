# @atomiqlabs/base patch

Changes `import { StorageObject }` to `import type { StorageObject }` in `SwapData.ts` so the symbol is erased at runtime.

Required because `StorageObject` is a type-only import; the value import triggers a circular reference / unused-value error in our strict TS build pipeline.

Patch bumped from 13.1.15 → 13.2.0; upstream still ships the value import, so the fix is still needed.
