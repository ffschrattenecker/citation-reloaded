import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_PATH = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mimics the old rollup-plugin-web-worker-loader setup: the worker is
 * bundled as self-contained code and instantiated from a Blob URL, so the
 * plugin ships as a single main.js with no separate worker asset.
 */
function webWorkerLoader() {
  return {
    name: 'web-worker-loader',
    setup(build) {
      // Redirect `web-worker:./foo` imports into a virtual namespace
      build.onResolve({ filter: /^web-worker:/ }, (args) => ({
        path: path.resolve(path.dirname(args.importer), args.path.replace(/^web-worker:/, '')),
        namespace: 'web-worker',
      }));

      // Replace the import with a factory that creates a blob-URL worker
      build.onLoad({ filter: /.*/, namespace: 'web-worker' }, async (args) => {
        const result = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          format: 'iife',
          platform: 'browser',
          target: 'es2018',
          // Intentionally no sourcemap: the worker code is embedded into
          // main.js as a string, and an inline worker sourcemap nearly
          // doubles the size of the emitted bundle.
          sourcemap: false,
          write: false,
          logLevel: 'silent',
        });

        const workerCode = result.outputFiles[0].text;
        return {
          loader: 'js',
          contents: `
            export default function WorkerFactory() {
              const blob = new Blob([${JSON.stringify(workerCode)}], {
                type: 'application/javascript',
              });
              const url = URL.createObjectURL(blob);
              return new Worker(url);
            }
          `,
        };
      });
    },
  };
}

/**
 * Carries over the chokidar hacks from the old rollup config, needed for a
 * platform-general Electron build:
 *  - `fsevents` is macOS-only; replace it with null.
 *  - Redirect chokidar's `fs` usage to Electron's original-fs.
 */
function chokidarHacks() {
  return {
    name: 'chokidar-hacks',
    setup(build) {
      build.onLoad({ filter: /[\\/]node_modules[\\/]chokidar[\\/]/ }, async (args) => {
        const contents = await fs.promises.readFile(args.path, 'utf8');
        return {
          loader: 'js',
          contents: contents
            .replaceAll("require('fsevents')", 'null')
            .replaceAll('require("fsevents")', 'null')
            .replaceAll("require('fs')", "require('original-fs')")
            .replaceAll('require("fs")', 'require("original-fs")'),
        };
      });
    },
  };
}

const common = {
  entryPoints: [path.join(SRC_PATH, 'src', 'main.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2018',
  sourcemap: 'inline',
  logLevel: 'info',
  outfile: path.join(SRC_PATH, 'main.js'),
  external: ['obsidian', 'original-fs'],
  plugins: [webWorkerLoader(), chokidarHacks()],
};

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await esbuild.context(common);
  await ctx.watch();
} else {
  await esbuild.build(common);
}
