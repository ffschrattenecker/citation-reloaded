// ts-jest compiles `import PromiseWorker from 'promise-worker'` without
// esModuleInterop, which accesses `.default` on the CommonJS export. Re-export
// the real constructor in the shape the transpiled imports expect.
//
// NB: the bare specifier 'promise-worker' would resolve back to this very
// file via moduleNameMapper (circular!), so require the package entry file
// directly instead.
const PromiseWorker = require('promise-worker/index.js');

module.exports = { default: PromiseWorker, PromiseWorker };
