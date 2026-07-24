# draw.io Blocks

Edit and render draw.io diagrams directly inside fenced Markdown code blocks in Obsidian. The plugin uses the hosted diagrams.net embed editor and supports desktop and mobile.

## Features

- Renders inline `drawio` code blocks as SVG previews.
- Opens diagrams.net when you click a preview.
- Autosaves changes back to the exact Markdown code block.
- Follows Obsidian's light or dark appearance automatically.
- Remembers diagrams.net editor preferences per device.
- Provides a command to reset the remembered editor preferences.

## Requirements

An internet connection is required to load the hosted diagrams.net editor and generate previews. The plugin does not bundle an offline editor.

## Installation

### Community Plugins

1. Open **Settings → Community plugins**.
2. Select **Browse** and search for **draw.io Blocks**.
3. Install and enable the plugin.

### Manual

1. Build the plugin with `npm run build`, or download a release.
2. Create this folder in your vault:

    ```text
    <vault>/.obsidian/plugins/obsidian-drawio-blocks/
    ```

3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian and enable **draw.io Blocks** under **Settings → Community plugins**.

## Usage

Run **Insert inline draw.io diagram** from the command palette while a Markdown note is active. You can also create a block manually:

````markdown
```drawio
<mxfile>
  <diagram id="page-1" name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```
````

Click or tap the preview to edit the diagram.

The editor autosaves while it is open. Selecting **Exit** requests one final XML snapshot and closes the editor only after the Markdown block is updated successfully.

## Commands

- **Insert inline draw.io diagram** — inserts a starter `drawio` block into the active Markdown note.
- **Refresh draw.io previews** — regenerates every visible diagram preview.
- **Reset draw.io editor settings** — resets locally remembered diagrams.net preferences the next time the editor opens.

## Privacy and security

The editor and preview renderer are loaded from `https://embed.diagrams.net`. Diagram XML is passed to that iframe in your local browser through the diagrams.net embed protocol.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run format
npm run format:check
npm run lint
npm run build
```

The production build creates `main.js`. Do not commit that generated file; attach `main.js`, `manifest.json`, and `styles.css` individually to each GitHub release.

## Release

1. Update the version with `npm version <version>`.
2. Run `npm run format:check`, `npm run lint`, and `npm run build`.
3. Create a Git tag that exactly matches the manifest version, without a `v` prefix.
4. Push the tag. The release workflow creates a draft GitHub release with the required assets.

## Attribution

This plugin integrates the hosted diagrams.net editor through its embed API. It is not affiliated with or endorsed by diagrams.net.
