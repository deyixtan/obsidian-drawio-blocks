# draw.io Blocks

Edit and render draw.io diagrams directly inside Markdown code blocks using the hosted diagrams.net editor.

Supports desktop and mobile.

## Features

- Renders `drawio` code blocks as SVG previews
- Opens diagrams.net when a preview is selected
- Autosaves changes to the original Markdown block
- Supports Obsidian light and dark themes
- Optionally stores diagrams as compressed XML

## Requirements

An internet connection is required to load the hosted diagrams.net editor and generate previews.

## Installation

Install **draw.io Blocks** from **Settings → Community plugins → Browse**.

For manual installation, copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/obsidian-drawio-blocks/
```

Then reload Obsidian and enable the plugin.

## Usage

Run **Insert inline draw.io diagram** from the command palette, or create an empty `drawio` code block:

````markdown
```drawio

```
````

Select the rendered preview to open the diagrams.net editor. Changes are saved automatically to the Markdown block.

## Settings

### Compress diagram XML

Stores diagrams using draw.io's compressed XML format.

This reduces Markdown block size, but makes the contents less readable and produces less useful Git diffs.

Existing diagrams are converted the next time they are opened and saved.

## Commands

- **Insert inline draw.io diagram**
- **Refresh draw.io previews**
- **Reset draw.io editor settings**

## Privacy and security

The editor and preview renderer are loaded from `https://embed.diagrams.net`. Diagram XML is passed to the hosted iframe through the diagrams.net embed protocol.

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

This plugin uses the hosted diagrams.net editor and is not affiliated with or endorsed by diagrams.net.
