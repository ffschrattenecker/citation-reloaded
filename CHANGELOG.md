# Changelog

All notable changes to Citations Reloaded are documented here. For
releases prior to 0.4.6, see the upstream project at
<https://github.com/hans/obsidian-citation-plugin/releases>.

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

[0.4.6]: https://github.com/ffschrattenecker/citation-reloaded/releases/tag/v0.4.6
