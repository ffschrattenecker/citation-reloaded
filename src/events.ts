/**
 * Defines an event manager for the citations plugin.
 */

import { Events, EventRef } from 'obsidian';

export default class CitationEvents extends Events {
  on(name: 'library-load-start', callback: () => void, ctx?: unknown): EventRef;
  on(
    name: 'library-load-complete',
    callback: () => void,
    ctx?: unknown,
  ): EventRef;
  on(
    name: string,
    callback: (...data: unknown[]) => void,
    ctx?: unknown,
  ): EventRef {
    return super.on(name, callback, ctx);
  }

  trigger(name: 'library-load-start'): void;
  trigger(name: 'library-load-complete'): void;
  trigger(name: string, ...data: unknown[]): void {
    super.trigger(name, data);
  }
}
