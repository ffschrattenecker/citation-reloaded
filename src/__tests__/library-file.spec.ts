/**
 * Regression tests for the startup race found in the v0.5.0-rc smoke test on
 * a CIFS-mounted vault: `readLibraryFile` went through
 * `app.vault.getAbstractFileByPath`, which is not yet populated when the
 * plugin loads, and the plugin failed with "Citation export file not found
 * in vault" until a manual refresh. Loading must fall back to
 * `adapter.read`/`adapter.exists` when the file is not (yet) indexed.
 */
import CitationPlugin from '../main';
import { App, FileSystemAdapter, TFile } from 'obsidian';

const VAULT_ROOT = '/vault';

const TEST_MANIFEST = {
  id: 'citation-reloaded',
  name: 'Citations Reloaded',
  version: '0.0.0-test',
  minAppVersion: '0.15.9',
  description: 'test manifest',
  author: 'test',
  isDesktopOnly: true,
};

function makeAdapter(): FileSystemAdapter {
  const adapter = Object.create(
    FileSystemAdapter.prototype,
  ) as FileSystemAdapter;
  (adapter as unknown as { getBasePath: () => string }).getBasePath = () =>
    VAULT_ROOT;
  return adapter;
}

function makePlugin(
  adapter: FileSystemAdapter,
  getAbstractFileByPath: (path: string) => unknown,
): { plugin: CitationPlugin; vault: Record<string, jest.Mock> } {
  const vault: Record<string, jest.Mock> = {
    read: jest.fn(),
    adapterRead: jest.fn(),
    adapterExists: jest.fn(),
  };

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
    vault.read.mockResolvedValue('@book{key, title = {T}}');

    const content = await plugin.readLibraryFile(
      `${VAULT_ROOT}/My Library.bib`,
    );

    expect(content).toBe('@book{key, title = {T}}');
    expect(vault.read).toHaveBeenCalledWith(file);
  });

  it('falls back to the adapter while the vault index is still populating', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);
    const adapterRead = jest.fn().mockResolvedValue('@book{key, title = {T}}');
    (adapter as unknown as { read: typeof adapterRead }).read = adapterRead;

    // Regression: the pre-0.5.0-release code threw
    // "Citation export file not found in vault" here on the real CIFS vault.
    const content = await plugin.readLibraryFile(
      `${VAULT_ROOT}/My Library.bib`,
    );

    expect(content).toBe('@book{key, title = {T}}');
    expect(adapterRead).toHaveBeenCalledWith(`${VAULT_ROOT}/My Library.bib`);
  });

  it('uses the adapter for libraries outside the vault', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);
    const adapterRead = jest.fn().mockResolvedValue('@book{key, title = {T}}');
    (adapter as unknown as { read: typeof adapterRead }).read = adapterRead;

    const content = await plugin.readLibraryFile('/etc/My Library.bib');

    expect(content).toBe('@book{key, title = {T}}');
    expect(adapterRead).toHaveBeenCalledWith('/etc/My Library.bib');
  });
});

describe('libraryFileExists on slow-indexing vaults', () => {
  it('returns true for an indexed file', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => new TFile());
    await expect(
      plugin.libraryFileExists(`${VAULT_ROOT}/My Library.bib`),
    ).resolves.toBe(true);
  });

  it('falls back to the adapter while the vault index is still populating', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);
    const adapterExists = jest.fn().mockResolvedValue(true);
    (adapter as unknown as { exists: typeof adapterExists }).exists =
      adapterExists;

    await expect(
      plugin.libraryFileExists(`${VAULT_ROOT}/My Library.bib`),
    ).resolves.toBe(true);
    expect(adapterExists).toHaveBeenCalledWith(`${VAULT_ROOT}/My Library.bib`);
  });

  it('returns false only when the adapter confirms the file is missing', async () => {
    const adapter = makeAdapter();
    const { plugin } = makePlugin(adapter, () => null);
    const adapterExists = jest.fn().mockResolvedValue(false);
    (adapter as unknown as { exists: typeof adapterExists }).exists =
      adapterExists;

    await expect(
      plugin.libraryFileExists(`${VAULT_ROOT}/My Library.bib`),
    ).resolves.toBe(false);
  });
});
