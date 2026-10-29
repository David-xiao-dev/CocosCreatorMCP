import fs from 'node:fs/promises';
const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const log = await fs.readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const start = log.indexOf(`## ${pkg.version} `);
if (start < 0) throw new Error(`CHANGELOG has no entry for ${pkg.version}.`);
const next = log.indexOf('\n## ', start + 1);
const entry = log.slice(start, next < 0 ? undefined : next).trim();
console.log(`# Cocos Creator MCP ${pkg.version} — Development preview

Windows + Cocos Creator 3.8.8 is the editor integration tested locally. Hosted CI validates Node/MCP and package installation; it does not run Creator.

## License

Source available under CocosCreatorMCP Personal Non-Commercial License 1.0, not an OSI-approved open-source license. Personal learning and non-commercial use are free. Commercial/organizational/client use, paid services and redistribution (including modified versions) require prior written permission. Platform-required viewing/forking rights and third-party licenses are preserved. Contact: 17268680050@163.com. Read LICENSE and docs/LICENSING.md before use; this distribution is not MIT licensed.

${entry}

## Downloads

- **source.zip**: recommended for Windows users; extract, run npm ci, then the project installation command.
- **source.tar.gz**: the same complete source distribution for tar users.
- **extension.zip**: Creator bridge only, for manual project installation. The separate Node MCP service and its dependencies are still required. This is not a Creator Store installer.
- **SHA256SUMS.txt** and **manifest.json**: archive checksums and file lists.
- **release-check.json**: packaging verification from this build.

Read docs/INSTALLATION.md for prerequisites, Creator installation, Codex configuration and troubleshooting. Maintainers should read docs/GITHUB-RELEASE.md.

This is a preview. UI layout property readback is tested; the new layout panel's full input regression, cross-resolution visuals and failure cleanup remain incomplete. There is no claim of 100% editor automation, full Pro parity or measured Pro token superiority. The bridge requires no vendor API key; your chosen AI client supplies its own model access.
`);
