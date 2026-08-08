# draw.io Blocks

Edit and render draw.io diagrams directly inside Markdown code blocks using either the hosted diagrams.net editor or an optional offline editor.

Supports desktop and mobile.

## Features

- Renders `drawio` code blocks as SVG previews
- Opens an editor in a modal or a new tab
- Autosaves changes to the original Markdown block
- Supports Obsidian light and dark themes
- Supports online and offline editing
- Optionally shows a preview grid and configurable border
- Optionally stores diagrams as compressed XML

## Requirements

Requires Obsidian 1.13.0 or later.

An internet connection is required for the hosted editor or to download the offline editor. After downloading, the editor and previews work without an internet connection.

## Installation

Install **draw.io Blocks** from **Settings → Community plugins → Browse**.

For manual installation, copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/drawio-blocks/
```

Then reload Obsidian and enable the plugin.

## Usage

Run **Insert inline draw.io diagram** from the command palette, or create an empty `drawio` code block:

````markdown
```drawio

```
````

Hover over the rendered preview and select **Open in modal** or **Open in tab**. Changes are saved automatically to the Markdown block.

## Settings

### Offline mode

**Local editor** shows the available version. Turn it on to download and enable the offline editor. Turn it off to use the hosted editor and remove the downloaded files.

When a newer verified editor is included with the plugin, an **Update** button is shown.

### Diagram appearance and storage

**Preview border color** sets the border color around SVG previews.

**Show preview grid** displays a grid behind SVG previews without changing the saved diagram.

**Compress XML** reduces Markdown block size, but makes the contents less readable and produces less useful Git diffs. Existing diagrams are converted the next time they are opened and saved.

## Commands

- **Insert inline draw.io diagram**
- **Refresh draw.io previews**
- **Reset draw.io editor settings**

## Privacy and security

In online mode, the editor and preview renderer are loaded from `https://embed.diagrams.net`, and diagram XML is passed to the hosted iframe through the diagrams.net embed protocol.

In offline mode, diagram XML stays in the local iframe. The downloaded editor comes from the official draw.io GitHub release and is verified against a pinned SHA-256 checksum before installation.

For more information, visit draw.io's [security documentation](https://www.drawio.com/docs/security/) and [privacy policy](https://www.drawio.com/trust/).

## Development

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Before releasing:

```bash
npm run format
npm run format:check
npm run lint
npm run build
```

## Release

Update the version, commit the changes, create a matching Git tag, and push both:

```bash
npm version <version> --no-git-tag-version

git add -A
git commit -m "<message>"

git tag <version>
git push
git push origin <version>
```

## Attribution

This plugin can download draw.io under the Apache License 2.0 and uses fflate under the MIT License.

This plugin is not affiliated with or endorsed by diagrams.net.
