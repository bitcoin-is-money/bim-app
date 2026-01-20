// Main services barrel export
// Import from specific folders to maintain clear separation

// Client services (browser only)
export * from './client';

// Server services (Node.js only) - NOT exported to prevent client bundling
// Import directly from './server' when needed in server contexts
// export * from './server';

// Shared services (isomorphic)
export * from './shared';
