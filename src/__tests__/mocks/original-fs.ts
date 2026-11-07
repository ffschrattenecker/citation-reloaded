// The built bundle redirects chokidar's `fs` usage to Electron's
// `original-fs` (see esbuild.config.mjs). Jest runs in plain Node, so map it
// back to the standard fs module. Deliberately a CommonJS script: the bundle
// expects the fs module itself at `module.exports`, not under `.default`.
module.exports = require('fs');
