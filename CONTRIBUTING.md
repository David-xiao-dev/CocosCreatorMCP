# Contributing

This is a source-available project under the [CocosCreatorMCP Personal Non-Commercial License 1.0](LICENSE), not an unrestricted open-source project. Personal non-commercial use is free; commercial/organizational use and redistribution require prior written authorization. Licensing contact: [17268680050@163.com](mailto:17268680050@163.com). See [the Chinese licensing guide](docs/LICENSING.md).

Issues, bug reports and ideas are welcome. Before submitting code, documentation or artwork, contact the maintainer to arrange a separate written contribution agreement. External patches will not be merged or distributed until that agreement is in place. It must identify the contributor's authority and grant the rights needed to use, modify, distribute and sublicense the contribution, including under commercial licenses. Contributors retain their copyright unless they separately agree otherwise. A PR, attribution or DCO alone does not constitute copyright transfer or this agreement. Do not upload third-party material you cannot license or confidential project content.

This project targets Creator 3.8.8 first. CI checks the Node.js/MCP layer without requiring the editor. Creator integration and GUI support must be verified separately; CI passing does not prove editor compatibility on another operating system.

1. Run `npm ci` and `npm test`.
2. Add native operations to `src/operations.mjs`; run `npm run generate` to update the extension catalog. Do not edit generated operation schemas by hand.
3. Implement editor handlers with native undo/AssetDB APIs. Generic scripts do not count as dedicated workflow coverage.
4. Add failure/recovery tests for state-changing operations, especially partial batches, references and timeouts.
5. Run live tests only against the disposable `test-project`, with Creator open and scene/AssetDB ready. Check readback, saved data and logs. Keep local evidence in ignored `artifacts/`.
6. Update `docs/COVERAGE.md` and the roadmap with exact tested boundaries. Never claim “all editor operations”, “complete rollback” or a Token saving percentage without corresponding evidence.

Use your own implementation. Public product descriptions can inform interoperability and workflow requirements; do not copy restricted third-party source, Pro binaries, documentation databases, branding or screenshots into the distribution.

Before publishing, check the package file list and repository for connection tokens, local project paths, logs, screenshots, credentials and game assets. The independent sandbox, artifacts and generated installation descriptors are excluded by default. Do not include the Creator installation, engine runtime or template assets in the extension release.

The complete user setup and maintainer release procedure is documented in [INSTALLATION.md](docs/INSTALLATION.md) and [GITHUB-RELEASE.md](docs/GITHUB-RELEASE.md). Hosted CI validates Node/MCP and release packaging; Creator integration checks must be run and recorded separately on a real editor.
