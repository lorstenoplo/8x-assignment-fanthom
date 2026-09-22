// No-op stub so scripts (run outside Next's bundler via tsx) can import
// server/* modules that guard themselves with `import "server-only"`.
// Next's own bundler already handles the real package correctly for the
// app itself; this only applies to the scripts/tsconfig below.
module.exports = {};
