/**
 * Minimal test double for the Obsidian plugin API, following the manual ES6
 * class mock approach from the Obsidian Hub guide "How to add automated
 * tests to your plugin".
 *
 * Only what the plugin actually touches during load and unit-tested code
 * paths is implemented. Extended in `src/main.ts` is class-hierarchies'
 * instanceof checks, so real classes are required (e.g.
 * `adapter instanceof FileSystemAdapter`).
 */
import * as momentNs from 'moment';

export const moment = momentNs;

export class App {}

export class EventRef {}

export class Events {
  on(_name: string, _callback: unknown, _ctx?: unknown): EventRef {
    return new EventRef();
  }

  off(_ref: EventRef): void {}

  trigger(_name: string, ..._data: unknown[]): void {}
}

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
}

export class TFolder {
  path = '';
  name = '';
}

export class Editor {}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Records notice messages so tests can assert on them. */
export class Notice {
  static messages: string[] = [];

  constructor(message: string | DocumentFragment) {
    Notice.messages.push(String(message));
  }

  setMessage(_message: string): this {
    return this;
  }

  hide(): void {}

  static get lastMessage(): string | undefined {
    return Notice.messages[Notice.messages.length - 1];
  }
}

// The vault adapter. Deliberately unimplemented: tests subclass or
// Object.create the prototype and install jest.fn()s. Subclassing keeps
// `instanceof FileSystemAdapter` checks in src/main.ts honest.
export class FileSystemAdapter {
  getBasePath(): string {
    throw new Error('FileSystemAdapter.getBasePath not mocked');
  }

  read(_filePath: string): Promise<string> {
    return Promise.reject(new Error('FileSystemAdapter.read not mocked'));
  }

  exists(_filePath: string): Promise<boolean> {
    return Promise.reject(new Error('FileSystemAdapter.exists not mocked'));
  }
}

export class Plugin {
  app: App;
  manifest: Record<string, unknown>;

  /** Recorded addCommand() calls, so tests can assert on registrations. */
  commands: Array<Record<string, unknown>> = [];

  private data: unknown = null;

  constructor(app: App, manifest: Record<string, unknown>) {
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
  }

  addCommand(command: Record<string, unknown>): unknown {
    this.commands.push(command);
    return {};
  }

  addSettingTab(_tab: unknown): void {}

  registerEvent(_eventRef: unknown): void {}

  registerDomEvent(_el: unknown, _type: unknown, _callback: unknown): void {}
}

export class PluginSettingTab {
  constructor(
    public app: App,
    public plugin: unknown,
  ) {}
}

export class AbstractTextComponent<_T> {}

export class DropdownComponent<_T> {}

export class Setting {
  constructor(_containerEl: unknown) {}
}

export class SuggestModal<_T> {
  constructor(_app?: unknown) {}
}

export class FuzzySuggestModal<_T> extends SuggestModal<_T> {}

export class HoverPopover {}

export function renderMatches(..._args: unknown[]): void {}
