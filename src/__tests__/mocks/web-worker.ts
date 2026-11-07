/**
 * Stand-in for the `web-worker:./worker` import (normally handled by the
 * esbuild web-worker loader at build time). Provides just enough surface for
 * WorkerManager (util.ts): construction, promise-bookkeeping, termination.
 */
export default class StubWorker {
  onmessage: ((event: unknown) => void) | null = null;

  postMessage(_message: unknown): void {}

  terminate(): void {}

  addEventListener(_type: string, _callback: unknown): void {}

  removeEventListener(_type: string, _callback: unknown): void {}
}
