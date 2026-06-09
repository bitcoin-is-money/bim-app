# @apibara/plugin-drizzle patch

Wraps the `CREATE CONSTRAINT TRIGGER` statement in a `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block so re-registering reorg triggers on an existing table no longer fails.

Without the patch, restarting an indexer against an already-initialized database throws `duplicate_object` and aborts startup.

Upstream still emits the bare `CREATE CONSTRAINT TRIGGER` as of 2.1.3, so the fix is still needed.

Registered via pnpm `patchedDependencies` in `pnpm-workspace.yaml`.
