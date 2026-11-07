import {
  App,
  Editor,
  EventRef,
  FuzzyMatch,
  FuzzySuggestModal,
  Notice,
  renderMatches,
  SearchMatches,
  SearchMatchPart,
} from 'obsidian';
import CitationPlugin from './main';
import { Entry } from './types';

// Stub some methods we know are there..
interface FuzzySuggestModalExt<T> extends FuzzySuggestModal<T> {
  chooser: ChooserExt;
}
interface ChooserExt {
  useSelectedItem(evt: MouseEvent | KeyboardEvent): void;
}

/**
 * Only these URI schemes may be handed to the OS via `open()` -- the values
 * come from user-controlled bibliography files, so anything else (e.g.
 * `https:` or `javascript:`) is refused.
 */
const ALLOWED_EXTERNAL_URI_SCHEMES = ['zotero:', 'file:'];

export function openExternalUri(uri: string): void {
  let scheme: string;
  try {
    scheme = new URL(uri).protocol;
  } catch {
    new Notice(`Cannot open malformed URI: ${uri}`);
    return;
  }
  if (ALLOWED_EXTERNAL_URI_SCHEMES.includes(scheme)) {
    open(uri);
  } else {
    new Notice(`Refusing to open URI with unsupported scheme: ${scheme}`);
  }
}

class SearchModal extends FuzzySuggestModal<Entry> {
  plugin: CitationPlugin;
  limit = 50;

  loadingEl: HTMLElement;

  eventRefs: EventRef[];

  private keydownListenerTimeout: ReturnType<typeof setTimeout>;

  constructor(app: App, plugin: CitationPlugin, protected editor?: Editor) {
    super(app);
    this.plugin = plugin;

    this.resultContainerEl.addClass('zoteroModalResults');

    this.inputEl.setAttribute('spellcheck', 'false');
    this.setPlaceholder('Search by title, author, year, or citekey');

    this.loadingEl = this.resultContainerEl.parentElement.createEl('div', {
      cls: 'zoteroModalLoading',
    });
    this.loadingEl.createEl('div', { cls: 'zoteroModalLoadingAnimation' });
    this.loadingEl.createEl('p', {
      text: 'Loading citation database. Please wait...',
    });
  }

  onOpen() {
    super.onOpen();

    this.eventRefs = [
      this.plugin.events.on('library-load-start', () => {
        this.setLoading(true);
      }),

      this.plugin.events.on('library-load-complete', () => {
        this.setLoading(false);
      }),

      this.plugin.events.on('library-load-error', () => {
        this.setLoading(false);
      }),
    ];

    this.setLoading(this.plugin.isLibraryLoading);

    // Don't immediately register keyevent listeners. If the modal was triggered
    // by an "Enter" keystroke (e.g. via the Obsidian command dialog), this event
    // will be received here erroneously.
    this.keydownListenerTimeout = setTimeout(() => {
      this.inputEl.addEventListener('keydown', (ev) => this.onInputKeydown(ev));
      this.inputEl.addEventListener('keyup', (ev) => this.onInputKeyup(ev));
    }, 200);
  }

  onClose() {
    clearTimeout(this.keydownListenerTimeout);
    this.eventRefs?.forEach((e) => this.plugin.events.offref(e));
  }

  getItems(): Entry[] {
    if (this.plugin.isLibraryLoading || !this.plugin.library) {
      return [];
    }

    return Object.values(this.plugin.library.entries);
  }

  getItemText(item: Entry): string {
    // Include the citekey so references can be found by citekey as well
    return [item.id, item.title, item.authorString, item.year]
      .filter((part) => part != null && part !== '')
      .join(' ');
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.loadingEl.removeClass('d-none');
      this.inputEl.disabled = true;
      this.resultContainerEl.empty();
    } else {
      this.loadingEl.addClass('d-none');
      this.inputEl.disabled = false;
      this.inputEl.focus();

      // @ts-expect-error: updateSuggestions is not exposed in the public
      // Obsidian typings.
      this.updateSuggestions();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    this.plugin.openLiteratureNote(item.id, false).catch(console.error);
  }

  renderSuggestion(match: FuzzyMatch<Entry>, el: HTMLElement): void {
    el.empty();
    const entry = match.item;

    const container = el.createEl('div', { cls: 'zoteroResult' });
    const citekeyEl = container.createEl('span', { cls: 'zoteroCitekey' });
    const titleEl = container.createEl('span', {
      cls: 'zoteroTitle',
    });
    const authorsCls = entry.authorString
      ? 'zoteroAuthors'
      : 'zoteroAuthors zoteroAuthorsEmpty';
    const authorsEl = container.createEl('span', {
      cls: authorsCls,
    });

    // Highlight string matches for each rendered part of the search item.
    // `getItemText` returns `<citekey> <title> <authorString> <year>`, so
    // compute each rendered element's offset within that string (the year is
    // searchable but not rendered).
    const allMatches = match.match.matches;

    // Filter a match list to contain only the relevant matches for a given
    // substring, and with match indices shifted relative to the start of that
    // substring
    const shiftMatches = (
      matches: SearchMatches,
      start: number,
      end: number,
    ) => {
      return matches
        .map((match: SearchMatchPart) => {
          const [matchStart, matchEnd] = match;
          return [
            matchStart - start,
            Math.min(matchEnd - start, end),
          ] as SearchMatchPart;
        })
        .filter((match: SearchMatchPart) => {
          const [matchStart] = match;
          return matchStart >= 0;
        });
    };

    // Render each segment in the same order as `getItemText`, tracking the
    // running offset (segments are joined by single spaces).
    let offset = 0;
    const renderSegment = (segmentEl: HTMLElement, text: string): void => {
      const start = offset;
      offset += text.length + 1;
      if (text) {
        renderMatches(segmentEl, text, shiftMatches(allMatches, start, start + text.length));
      } else {
        segmentEl.setText('');
      }
    };

    renderSegment(citekeyEl, entry.id || '');
    renderSegment(titleEl, entry.title || '');
    renderSegment(authorsEl, entry.authorString || '');
  }

  onInputKeydown(ev: KeyboardEvent) {
    if (ev.key == 'Tab') {
      ev.preventDefault();
    }
  }

  onInputKeyup(ev: KeyboardEvent) {
    if (ev.key == 'Enter' || ev.key == 'Tab') {
      ((this as unknown) as FuzzySuggestModalExt<Entry>).chooser.useSelectedItem(
        ev,
      );
    }
  }
}

export class OpenNoteModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin) {
    super(app, plugin);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to open literature note' },
      { command: 'ctrl ↵', purpose: 'to open literature note in a new pane' },
      { command: 'tab', purpose: 'open in Zotero' },
      { command: 'shift tab', purpose: 'open PDF' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    if (evt instanceof MouseEvent || evt.key == 'Enter') {
      const newPane =
        evt instanceof KeyboardEvent && (evt as KeyboardEvent).ctrlKey;
      this.plugin.openLiteratureNote(item.id, newPane);
    } else if (evt.key == 'Tab') {
      if (evt.shiftKey) {
        const files = item.files || [];
        const pdfPaths = files.filter((path) =>
          path.toLowerCase().endsWith('pdf'),
        );
        if (pdfPaths.length == 0) {
          new Notice('This reference has no associated PDF files.');
        } else {
          openExternalUri(`file://${pdfPaths[0]}`);
        }
      } else {
        openExternalUri(item.zoteroSelectURI);
      }
    }
  }
}

export class InsertNoteLinkModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin, editor: Editor) {
    super(app, plugin, editor);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert literature note reference' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: unknown): void {
    if (!this.editor) return;
    this.plugin
      .insertLiteratureNoteLink(item.id, this.editor)
      .catch(console.error);
  }
}

export class InsertNoteContentModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin, editor: Editor) {
    super(app, plugin, editor);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      {
        command: '↵',
        purpose: 'to insert literature note content in active pane',
      },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChooseItem(item: Entry, evt: unknown): void {
    if (!this.editor) return;
    this.plugin
      .insertLiteratureNoteContent(item.id, this.editor)
      .catch(console.error);
  }
}

export class InsertCitationModal extends SearchModal {
  constructor(app: App, plugin: CitationPlugin, editor: Editor) {
    super(app, plugin, editor);

    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to insert Markdown citation' },
      { command: 'shift ↵', purpose: 'to insert secondary Markdown citation' },
      { command: 'esc', purpose: 'to dismiss' },
    ]);
  }

  onChooseItem(item: Entry, evt: MouseEvent | KeyboardEvent): void {
    if (!this.editor) return;
    const isAlternative = evt instanceof KeyboardEvent && evt.shiftKey;
    this.plugin
      .insertMarkdownCitation(item.id, this.editor, isAlternative)
      .catch(console.error);
  }
}
