// Retain the historical 0.11.1 test entry point.
process.argv[3]='0.11.1';
await import('./online-update-release.e2e.mjs');
