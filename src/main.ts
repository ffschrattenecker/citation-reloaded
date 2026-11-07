import {
  Editor,
  FileSystemAdapter,
  moment,
  normalizePath,
  Notice,
  Plugin,
  TFile,
  TFolder,
} from 'obsidian';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { create, TemplateDelegate as Template } from 'handlebars';

// Handlebars' `registerHelper` and `compile` are `this`-dependent methods on
// the runtime environment. With esbuild, calling them as bare named imports
// compiles to unbound calls (`(0, ns.registerHelper)(...)`), which crashes
// at plugin load. Use a dedicated environment with bound methods instead.
const Handlebars = create();
const compileTemplate = Handlebars.compile.bind(Handlebars);
const registerHelper = Handlebars.registerHelper.bind(Handlebars);

import CitationEvents from './events';
import {
  InsertCitationModal,
  InsertNoteLinkModal,
  InsertNoteContentModal,
  OpenNoteModal,
} from './modals';
import { VaultExt } from './obsidian-extensions.d';
import { CitationSettingTab, CitationsPluginSettings } from './settings';
import {
  Entry,
  EntryData,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  IIndexable,
  Library,
} from './types';
import {
  DISALLOWED_FILENAME_CHARACTERS_RE,
  Notifier,
  WorkerManager,
  WorkerManagerBlocked,
} from './util';
import LoadWorker from 'web-worker:./worker';

// Template helper for inserting the current date/time, e.g. `{{now}}` (date
// only) or `{{now "YYYY-MM-DD HH:mm"}}`. Useful for "date added" style
// frontmatter in literature notes.
registerHelper('now', (format?: unknown) => {
  const fmt = typeof format === 'string' ? format : 'YYYY-MM-DD';
  return moment().format(fmt);
});

export default class CitationPlugin extends Plugin {
  settings: CitationsPluginSettings;
  library: Library;

  // Template compilation options
  private templateSettings = {
    noEscape: true,
  };

  private loadWorker = new WorkerManager(new LoadWorker(), {
    blockingChannel: true,
  });

  private watcher: chokidar.FSWatcher;

  events = new CitationEvents();

  loadErrorNotifier = new Notifier(
    'Unable to load citations. Please update Citations plugin settings.',
  );
  literatureNoteErrorNotifier = new Notifier(
    'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
  );

  async loadSettings(): Promise<void> {
    this.settings = new CitationsPluginSettings();

    const loadedSettings = await this.loadData();
    if (!loadedSettings) return;

    const toLoad = [
      'citationExportPath',
      'citationExportFormat',
      'literatureNoteTitleTemplate',
      'literatureNoteFolder',
      'literatureNoteContentTemplate',
      'markdownCitationTemplate',
      'alternativeMarkdownCitationTemplate',
    ];
    toLoad.forEach((setting) => {
      if (setting in loadedSettings) {
        (this.settings as IIndexable)[setting] = loadedSettings[setting];
      }
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.init();
  }

  async onunload(): Promise<void> {
    // Release resources so nothing outlives the plugin (e.g. on reload).
    await this.watcher?.close();
    this.loadErrorNotifier.unload();
    this.literatureNoteErrorNotifier.unload();
    this.loadWorker.terminate();
  }

  async init(): Promise<void> {
    if (this.settings.citationExportPath) {
      // Load library for the first time
      this.loadLibrary();

      // Set up a watcher to refresh whenever the export is updated
      // Wait until files are finished being written before going ahead with
      // the refresh -- here, we request that `change` events be accumulated
      // until nothing shows up for 500 ms
      const watchOptions = {
        awaitWriteFinish: {
          stabilityThreshold: 500,
        },
      };

      this.watcher = chokidar
        .watch(
          this.resolveLibraryPath(this.settings.citationExportPath),
          watchOptions,
        )
        .on('change', () => {
          this.loadLibrary();
        })
        .on('error', (error) => {
          console.error(error);
          this.loadErrorNotifier.show();
        });
    }

    // NB: no default hotkeys are set on purpose -- they conflict between
    // plugins and platforms. Users can bind their own in Obsidian's hotkey
    // settings.
    this.addCommand({
      id: 'open-literature-note',
      name: 'Open literature note',
      callback: () => {
        if (!this.settings.citationExportPath) {
          new Notice(
            'Set a citation export path in the plugin settings first.',
          );
          return;
        }
        const modal = new OpenNoteModal(this.app, this);
        modal.open();
      },
    });

    this.addCommand({
      id: 'update-bib-data',
      name: 'Refresh citation database',
      callback: () => {
        this.loadLibrary();
      },
    });

    this.addCommand({
      id: 'insert-citation',
      name: 'Insert literature note link',
      editorCallback: (editor) => {
        const modal = new InsertNoteLinkModal(this.app, this, editor);
        modal.open();
      },
    });

    this.addCommand({
      id: 'insert-literature-note-content',
      name: 'Insert literature note content in the current pane',
      editorCallback: (editor) => {
        const modal = new InsertNoteContentModal(this.app, this, editor);
        modal.open();
      },
    });

    this.addCommand({
      id: 'insert-markdown-citation',
      name: 'Insert Markdown citation',
      editorCallback: (editor) => {
        const modal = new InsertCitationModal(this.app, this, editor);
        modal.open();
      },
    });

    this.addSettingTab(new CitationSettingTab(this.app, this));
  }

  /**
   * Resolve a provided library path, allowing for relative paths rooted at
   * the vault directory.
   */
  resolveLibraryPath(rawPath: string): string {
    const vaultRoot =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter.getBasePath()
        : '/';
    return path.resolve(vaultRoot, rawPath);
  }

  /**
   * If the resolved path points inside the vault, return its vault-relative
   * path; otherwise return null.
   */
  private getVaultRelativePath(filePath: string): string | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return null;

    const relative = path.relative(adapter.getBasePath(), filePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    return normalizePath(relative);
  }

  /**
   * Read the citation export file as UTF-8 text. Prefers the Vault API when
   * the file is already indexed; falls back to the adapter when it is not
   * (e.g. during startup on slow vaults, before Obsidian has finished
   * indexing files).
   */
  async readLibraryFile(filePath: string): Promise<string> {
    const relative = this.getVaultRelativePath(filePath);
    if (relative) {
      const file = this.app.vault.getAbstractFileByPath(relative);
      if (file instanceof TFile) {
        return this.app.vault.read(file);
      }
    }
    return this.app.vault.adapter.read(filePath);
  }

  /**
   * Returns true iff the citation export file exists and is readable.
   */
  async libraryFileExists(filePath: string): Promise<boolean> {
    const relative = this.getVaultRelativePath(filePath);
    if (relative) {
      const file = this.app.vault.getAbstractFileByPath(relative);
      if (file instanceof TFile) {
        return true;
      }
    }
    return this.app.vault.adapter.exists(filePath);
  }

  async loadLibrary(): Promise<Library> {
    if (!this.settings.citationExportPath) {
      console.warn(
        'Citations plugin: citation export path is not set. Please update plugin settings.',
      );
      return null;
    }

    const filePath = this.resolveLibraryPath(this.settings.citationExportPath);

    // Unload current library.
    this.events.trigger('library-load-start');
    this.library = null;

    try {
      const databaseRaw = await this.readLibraryFile(filePath);

      // If there is a remaining error message, hide it
      this.loadErrorNotifier.hide();

      const entries = await this.loadWorker.post<EntryData[]>({
        databaseRaw,
        databaseType: this.settings.citationExportFormat,
      });

      let adapter: new (data: EntryData) => Entry;
      let idKey: string;

      switch (this.settings.citationExportFormat) {
        case 'biblatex':
          adapter = EntryBibLaTeXAdapter;
          idKey = 'key';
          break;
        case 'csl-json':
          adapter = EntryCSLAdapter;
          idKey = 'id';
          break;
      }

      this.library = new Library(
        Object.fromEntries(
          entries.map((e: EntryData) => [
            (e as IIndexable)[idKey],
            new adapter(e),
          ]),
        ),
      );

      this.events.trigger('library-load-complete');

      return this.library;
    } catch (e: unknown) {
      if (e instanceof WorkerManagerBlocked) {
        // Silently catch WorkerManager error, which will be thrown if the
        // library is already being loaded -- the in-progress load will emit
        // its own completion event.
        return null;
      }

      console.error(e);
      this.loadErrorNotifier.show();
      // Always signal that loading finished, so open modals don't stay in
      // the "loading" state forever (upstream issue #106).
      this.events.trigger('library-load-error');

      return null;
    }
  }

  /**
   * Returns true iff the library is currently being loaded on the worker thread.
   */
  get isLibraryLoading(): boolean {
    return this.loadWorker.blocked;
  }

  get literatureNoteTitleTemplate(): Template {
    return compileTemplate(
      this.settings.literatureNoteTitleTemplate,
      this.templateSettings,
    );
  }

  get literatureNoteContentTemplate(): Template {
    return compileTemplate(
      this.settings.literatureNoteContentTemplate,
      this.templateSettings,
    );
  }

  get markdownCitationTemplate(): Template {
    return compileTemplate(
      this.settings.markdownCitationTemplate,
      this.templateSettings,
    );
  }

  get alternativeMarkdownCitationTemplate(): Template {
    return compileTemplate(
      this.settings.alternativeMarkdownCitationTemplate,
      this.templateSettings,
    );
  }

  getTitleForCitekey(citekey: string): string {
    const unsafeTitle = this.literatureNoteTitleTemplate(
      this.library.getTemplateVariablesForCitekey(citekey),
    );
    return unsafeTitle.replace(DISALLOWED_FILENAME_CHARACTERS_RE, '_');
  }

  getPathForCitekey(citekey: string): string {
    const title = this.getTitleForCitekey(citekey);
    // TODO escape note title
    return path.join(this.settings.literatureNoteFolder, `${title}.md`);
  }

  getInitialContentForCitekey(citekey: string): string {
    return this.literatureNoteContentTemplate(
      this.library.getTemplateVariablesForCitekey(citekey),
    );
  }

  getMarkdownCitationForCitekey(citekey: string): string {
    return this.markdownCitationTemplate(
      this.library.getTemplateVariablesForCitekey(citekey),
    );
  }

  getAlternativeMarkdownCitationForCitekey(citekey: string): string {
    return this.alternativeMarkdownCitationTemplate(
      this.library.getTemplateVariablesForCitekey(citekey),
    );
  }

  /**
   * Run a case-insensitive search for the literature note file corresponding to
   * the given citekey. If no corresponding file is found, create one.
   */
  async getOrCreateLiteratureNoteFile(citekey: string): Promise<TFile> {
    const normalizedPath = normalizePath(this.getPathForCitekey(citekey));

    let file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (file == null) {
      // First try a case-insensitive lookup.
      const matches = this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.toLowerCase() == normalizedPath.toLowerCase());
      if (matches.length > 0) {
        file = matches[0];
      } else {
        try {
          // Make sure the configured literature note folder exists.
          const folderPath = normalizePath(this.settings.literatureNoteFolder);
          if (
            folderPath &&
            !(this.app.vault.getAbstractFileByPath(folderPath) instanceof
              TFolder)
          ) {
            await this.app.vault.createFolder(folderPath);
          }

          file = await this.app.vault.create(
            normalizedPath,
            this.getInitialContentForCitekey(citekey),
          );
        } catch (exc) {
          this.literatureNoteErrorNotifier.show();
          throw exc;
        }
      }
    }

    return file as TFile;
  }

  async openLiteratureNote(citekey: string, newPane: boolean): Promise<void> {
    try {
      const file = await this.getOrCreateLiteratureNoteFile(citekey);
      this.app.workspace.getLeaf(newPane).openFile(file);
    } catch (e) {
      console.error(e);
    }
  }

  async insertLiteratureNoteLink(
    citekey: string,
    editor: Editor,
  ): Promise<void> {
    try {
      const file = await this.getOrCreateLiteratureNoteFile(citekey);
      const useMarkdown: boolean = (<VaultExt>this.app.vault).getConfig(
        'useMarkdownLinks',
      );
      const title = this.getTitleForCitekey(citekey);

      let linkText: string;
      if (useMarkdown) {
        const uri = encodeURI(
          this.app.metadataCache.fileToLinktext(file, '', false),
        );
        linkText = `[${title}](${uri})`;
      } else {
        linkText = `[[${title}]]`;
      }

      editor.replaceSelection(linkText);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Format literature note content for a given reference and insert it at the
   * cursor in the given editor.
   */
  async insertLiteratureNoteContent(
    citekey: string,
    editor: Editor,
  ): Promise<void> {
    const content = this.getInitialContentForCitekey(citekey);
    editor.replaceRange(content, editor.getCursor());
  }

  async insertMarkdownCitation(
    citekey: string,
    editor: Editor,
    alternative = false,
  ): Promise<void> {
    const func = alternative
      ? this.getAlternativeMarkdownCitationForCitekey
      : this.getMarkdownCitationForCitekey;
    const citation = func.bind(this)(citekey);

    editor.replaceRange(citation, editor.getCursor());
  }
}
