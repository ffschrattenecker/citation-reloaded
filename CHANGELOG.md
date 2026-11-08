# Changelog

All notable changes to Citations Reloaded are documented here. For
releases prior to 0.4.6, see the upstream project at
<https://github.com/hans/obsidian-citation-plugin/releases>.

## [0.5.2]

### Changed

- The release workflow now consolidates artifact attestation into a single
  `actions/attest@v4` step and creates GitHub releases as drafts so release
  notes can be reviewed before publishing, per the current Obsidian release
  guide. No functional changes vs 0.5.1.

## [0.5.1]

### Fixed

- The 0.5.0 startup fallback for slow vaults passed the already-resolved
  absolute export path to the vault adapter, but Obsidian's
  `FileSystemAdapter` prefixes its argument with the vault root, so on
  real CIFS vaults the startup load read `<vault>/<absolute>` and failed
  with ENOENT — the library only appeared after a manual refresh. The
  adapter now receives the vault-relative path, and export files outside
  the vault are read through Electron's `fs` directly. Found by the CDP
  smoke test on the real vault; the unit-test adapter mocks now model
  the real path-joining behavior so this class of bug is covered.

### Changed

- The bundle is now minified and the external sourcemap is no longer
  shipped inline, and the BibTeX parser is no longer bundled twice
  (main bundle and embedded worker). This cuts `main.js` from
  ~6.6 MB to ~0.76 MB.

## [0.5.0]

### Added

New template variables, available in literature note title/content and
citation templates:

- `{{keywords}}` — comma-separated keywords/tags (BibLaTeX `keywords`, CSL
  `keyword`) (upstream issue hans/obsidian-citation-plugin#61)
- `{{ISBN}}` and `{{ISSN}}` (upstream issue #80)
- `{{files}}` — list of attached file paths from the BibLaTeX `file` field,
  e.g. for PDF backlinks via `{{#each files}}` (upstream issue #181)
- `{{dateAdded}}` — date the reference was added to the reference manager
  (BibLaTeX `dateadded`, CSL `accessed`)
- `{{firstAuthorLastName}}`, `{{authorLastNameString}}` — e.g. for
  "lastname year - title" note titles (upstream issue #144)
- `{{firstAuthorLastNameEtAl}}` — first author's last name plus "et al." when
  there are multiple authors, for "Smith et al., 2018"-style citations
  (upstream issue #133)
- `{{now}}` Handlebars helper — inserts the current date/time, e.g.
  `{{now}}` or `{{now "YYYY-MM-DD HH:mm"}}` (upstream issue #95)

- References can now be found in the search modal by citekey, not only by
  title/author/year (upstream issue #46).

### Fixed

- The search modal no longer stays on "Loading citation database" forever
  when loading fails; a load error now clears the loading state and shows an
  error notice (upstream issue #106).
- The literature note folder is created automatically if it does not exist.
- Insert commands now only run with an active Markdown editor, instead of
  failing silently or crashing when no editor is active.

### Changed

- Default hotkeys were removed from all commands to avoid conflicts between
  plugins and across platforms (Obsidian plugin guidelines; upstream issue
  #8). Bind your own hotkeys in Obsidian's "Hotkeys" settings.
- Settings tab reworked to follow Obsidian UI guidelines: no top-level
  heading, section headings via `setHeading()`, no "settings" in heading
  text.
- The citation export file is now read through the Vault API when it lives
  inside the vault; the adapter is only used for files outside the vault.
  On startup the library loads even before Obsidian has finished indexing
  the vault (previously failed with "Citation export file not found" on
  slow vaults, e.g. on network storage).
- Hardcoded colors in `styles.css` replaced with Obsidian CSS variables.
- Resources (file watcher, notices, web worker) are now released when the
  plugin unloads.
- `open()` of external URIs from bibliography data is now restricted to
  `zotero:` and `file:` schemes.
- Dev-only dependency vulnerabilities (jest/ts-jest chain) reduced via npm
  overrides; the shipped bundle has no known vulnerable dependencies.

## [0.4.6] — 2026-11-07

First release under the `citation-reloaded` identity.

### Fixed

- Plugin no longer loads on current Obsidian versions: Obsidian dropped
  ES5 plugin support, so its native ES6 API classes could not be
  extended by the ES5-compiled bundle. Rebuilt with an ES2018 target
  (upstream issue hans/obsidian-citation-plugin#288, fix PR #289).

### Changed

- New plugin ID `citation-reloaded`, name "Citations Reloaded";
  maintained by Franz Schrattenecker.
- README documents fork provenance and the build fix.

## 0.4.5 and earlier

Released upstream by Jon Gauthier and contributors.

[0.5.0]: https://github.com/ffschrattenecker/citation-reloaded/releases/tag/v0.5.0
[0.4.6]: https://github.com/ffschrattenecker/citation-reloaded/releases/tag/v0.4.6
