/**
 * Loads the *built* bundle (main.js) rather than the TypeScript sources.
 *
 * Regression guard for bundler-level failures that are invisible when unit
 * tests import src/ directly: in the v0.5.0-rc smoke test, esbuild rewrote
 * `import { registerHelper } from 'handlebars'` to an unbound
 * `(0, ns.registerHelper)(...)` call, which threw `Cannot read properties of
 * undefined (reading 'helpers')` at module scope and crashed the plugin on
 * load. Lint, typecheck, and src-level Jest runs all missed it; loading the
 * real bundle catches it.
 */
import { execSync } from 'child_process';
import * as path from 'path';

import type { App } from 'obsidian';

// The bundle instantiates its worker via `new Worker(blobUrl)`; Node has no
// such global, so stub it before the bundle is required.
class StubWorker {
  onmessage: ((event: unknown) => void) | null = null;
  postMessage(_message?: unknown): void {}
  terminate(): void {}
  addEventListener(_type?: string, _callback?: unknown): void {}
  removeEventListener(_type?: string, _callback?: unknown): void {}
}
(globalThis as unknown as Record<string, unknown>).Worker = StubWorker;

type PluginLike = {
  onload(): Promise<void>;
  onunload(): Promise<void>;
  commands: Array<Record<string, unknown>>;
};

type BundleModule = {
  default: new (app: App, manifest: unknown) => PluginLike;
};

const rootDir = path.join(__dirname, '..', '..');

let Bundle: BundleModule;

beforeAll(() => {
  execSync('node esbuild.config.mjs', { cwd: rootDir, stdio: 'pipe' });
  Bundle = jest.requireActual(path.join(rootDir, 'main.js')) as BundleModule;
}, 60000);

describe('built bundle (main.js)', () => {
  it('requires without module-scope errors (regression: v0.5.0-rc unbound handlebars calls)', () => {
    expect(typeof Bundle.default).toBe('function');
  });

  it('onload completes and registers all five commands', async () => {
    const app = { vault: { adapter: {} } } as unknown as App;
    const plugin = new Bundle.default(app, {
      id: 'citation-reloaded',
      version: '0.0.0-test',
    });

    await expect(plugin.onload()).resolves.toBeUndefined();
    expect(plugin.commands).toHaveLength(5);
  });

  it('onunload releases resources without throwing', async () => {
    const app = { vault: { adapter: {} } } as unknown as App;
    const plugin = new Bundle.default(app, {
      id: 'citation-reloaded',
      version: '0.0.0-test',
    });
    await plugin.onload();

    await expect(plugin.onunload()).resolves.toBeUndefined();
  });
});
