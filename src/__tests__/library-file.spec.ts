/**
 * Regression tests for vault/indexing races on the citation export file,
 * both found by CDP smoke tests on a CIFS-mounted vault:
 *
 * - v0.5.0-rc: loading went through `app.vault.getAbstractFileByPath`
 *   only, which is not yet populated when the plugin loads on slow
 *   vaults; loading failed with "Citation export file not found in
 *   vault" until a manual refresh. Loading must fall back to the
 *   adapter while the file is not indexed.
 * - v0.5.0-release re-run: the fallback passed the *absolute* resolved
 *   path to `FileSystemAdapter.read/exists`, but the real adapter
 *   prefixes its argument with the vault root (`getFullPath`), so it
 *   read "<vault>/<absolute>" and the startup load died with ENOENT.
 *   The adapter mocks here model that joining behavior; a passthrough
 *   `jest.fn()` cannot catch this class of bug.
 */
import CitationPlugin from '../main';
import { App, FileSystemAdapter, TFile } from 'obsidian';
import * as fs from 'original-fs';

jest.mock('original-fs', () => ({
  promises: {
    readFile: jest.fn(),
    access: jest.fn(),
  },
}));

const VAULT_ROOT = '/vault';
const BIB_REL = 'My Library.bib';
const BIB_ABS = `${VAULT_ROOT}/${BIB_REL}`;
const CONTENT = '@book{key, title = {T}}';

const TEST_MANIFEST = {
  id: 'citation-reloaded',
  name: 'Citations Reloaded',
  version: '0.0.0-test',
  minAppVersion: '0.15.9',
  description: 'test manifest',
  author: 'test',
  isDesktopOnly: true,
};

const fsReadFile = fs.promises.readFile as unknown as jest.Mock;
const fsAccess = fs.promises.access as unknown as jest.Mock;

beforeEach(() => {
  fsReadFile.mockReset().mockResolvedValue(CONTENT);
  fsAccess.mockReset().mockResolvedValue(undefined);
});

type AdapterGuts = { read: (p: string) => Promise<string>; exists: (p: string) => Promise<boolean> };

/**
 * Faithful stand-in for Obsidian's FileSystemAdapter: `read`/`exists`
 * join the vault root onto their argument (like the real `getFullPath`
 * observed via CDP at runtime), so only vault-relative paths resolve.
 * With `onDisk = false` the library file is absent even via the adapter.
 */
function makeAdapter(onDisk = true): FileSystemAdapter {
  const adapter = Object.create(FileSystemAdapter.prototype) as FileSystemAdapter;
  const guts = adapter as unknown as { getBasePath: () => string } & AdapterGuts;
  guts.getBasePath = () => VAULT_ROOT;
  guts.read = (p: string) => {
    const full = `${VAULT_ROOT}/${p}`;
    return full === BIB_ABS && onDisk
      ? Promise.resolve(CONTENT)
      : Promise.reject(new Error(`ENOENT: no such file or directory, open '${full}'`));
  };
  guts.exists = (p: string) =>
    Promise.resolve(onDisk && `${VAULT_ROOT}/${p}` === BIB_ABS);
  jest.spyOn(guts, 'read');
  jest.spyOn(guts, 'exists');
  return adapter;
}

function makePlugin(
  adapter: FileSystemAdapter,
  getAbstractFileByPath: (path: string) => unknown,
): { plugin: CitationPlugin; vault: Record<string, jest.Mock> } {
  const vault: Record<string, jest.Mock> = { read: jest.fn() };

  const fakeApp = {
    vault: {
      adapter,
      getAbstractFileByPath,
      read: vault.read,
    },
  } as unknown as App;

  const plugin = new CitationPlugin(fakeApp, TEST_MANIFEST);

  return { plugin, vault };
}

describe('readLibraryFile on slow-indexing vaults (startup race)', () => {
  it('reads through the Vault API once the file is indexed', async () => {
    const adapter = makeAdapter();
    const file = new TFile();
    const { plugin, vault } = makePlugin(adapter, () => file);
    vault.read.mockResolvedValue(CONTENT);

    const content = await plugin.readLibraryFile(BIB_ABS);

    expect(content).toBe(CONTENT);
    expect(vault.read).toHaveBeenCalledWith(file);
  });

  it('falls back to the adapter with the vault-relative path while the index is still populating', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);

    // Regression (v0.5.0-rc): threw "Citation export file not found in
    // vault" here on the real CIFS vault.
    const content = await plugin.readLibraryFile(BIB_ABS);

    expect(content).toBe(CONTENT);
    // Regression (v0.5.0-release): the fallback passed BIB_ABS, the
    // already-resolved absolute path, to adapter.read — the real adapter
    // joins the vault root onto it and ENOENTs at startup.
    expect((adapter as unknown as AdapterGuts).read).toHaveBeenCalledWith(
      BIB_REL,
    );
    expect(
      ((adapter as unknown as AdapterGuts).read as jest.Mock).mock
        .calls[0][0],
    ).not.toMatch(/^\//);
  });

  it('falls back to the adapter even when the file only exists on disk late', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);

    await expect(plugin.readLibraryFile(BIB_ABS)).resolves.toBe(CONTENT);
  });

  it('reads libraries outside the vault through original-fs', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);

    const content = await plugin.readLibraryFile('/etc/My Library.bib');

    expect(content).toBe(CONTENT);
    expect(fsReadFile).toHaveBeenCalledWith('/etc/My Library.bib', 'utf-8');
  });
});

describe('libraryFileExists on slow-indexing vaults', () => {
  it('returns true for an indexed file', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => new TFile());

    await expect(plugin.libraryFileExists(BIB_ABS)).resolves.toBe(true);
  });

  it('falls back to the adapter while the index is still populating', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);

    await expect(plugin.libraryFileExists(BIB_ABS)).resolves.toBe(true);
    expect((adapter as unknown as AdapterGuts).exists).toHaveBeenCalledWith(
      BIB_REL,
    );
  });

  it('returns false only when the adapter confirms the file is missing', async () => {
    const adapter = makeAdapter(false);
    const { plugin } = makePlugin(adapter, () => null);

    await expect(plugin.libraryFileExists(BIB_ABS)).resolves.toBe(false);
  });

  it('checks libraries outside the vault through original-fs', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);

    await expect(
      plugin.libraryFileExists('/etc/My Library.bib'),
    ).resolves.toBe(true);
    expect(fsAccess).toHaveBeenCalledWith('/etc/My Library.bib');

    fsAccess.mockRejectedValue(new Error('ENOENT'));
    await expect(
      plugin.libraryFileExists('/etc/My Library.bib'),
    ).resolves.toBe(false);
  });
});
