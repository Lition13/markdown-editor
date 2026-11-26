# Markdown Editor

[English](./README.md) · [简体中文](./README.zh-CN.md)

[Open the online editor](https://lition13.github.io/markdown-editor/) · [GitHub Releases](https://github.com/Lition13/markdown-editor/releases)

Edit Markdown in your browser or embed the same editor and preview in a React project. The online workspace combines a file library, a focused editing area, and a clickable document outline.

## Get started online

A new file library opens **Getting started.md** by default. The example walks through editing commands, text formatting, lists, tables, code blocks, YAML front matter, math, Mermaid, image syntax, and footnotes. Open **入门示例.md** in the file manager for the Chinese version. Both are regular Markdown files you can edit and export. [English example](./apps/web/src/examples/en.md) · [Chinese example](./apps/web/src/examples/zh-CN.md)

- The toolbar, file manager, outline, and status bar start hidden. Move the pointer to the top edge to reveal the toolbar, or click or tap the edge to pin it. Hover over an icon for its label. The browser remembers which panels are open and whether the toolbar is pinned.
- The online interface starts in English and remembers your language choice. Use the language menu in the toolbar to switch to Simplified Chinese. While an original example is open, switching languages opens the matching example.
- The file manager shows a searchable folder tree. Drag files and folders to move them, or use Shift+Space to choose a destination from the keyboard. On touch screens, drag from the file or folder icon.
- Ctrl+Alt+F opens the file manager and focuses its search box. Use the arrow keys to browse and Enter to open a file or expand a folder. Ctrl+P opens **Quick Open** to search by name or path, then Enter opens the selected file. Returning to a file in the same tab restores the last editing position. The outline highlights the current section as you scroll in either edit mode.
- **Import** accepts `.md`, `.markdown`, `.txt`, and `.zip` and places them in the selected folder. ZIP import preserves folders, including empty ones, and reads text files in UTF-8. Matching folders merge and files with the same name get numbered suffixes. Each ZIP and the combined extracted text must be at most 100 MiB, with up to 10,000 entries per import and up to 128 path components per entry.
- Files are saved in the current browser with IndexedDB. The export button next to each rename button downloads a Markdown copy of the file or a ZIP of the folder. Older saved drafts are imported into the file library.
- The status bar shows the word count from the document body and the line count from the Markdown source.

### Editing tools and shortcuts

| Action | Default shortcut |
| --- | --- |
| Open the editing tools menu | `/` |
| Switch between formatted editing and source | Ctrl+/ |
| Insert a table | Ctrl+Alt+T |
| Enter fullscreen editing | Alt+Enter |
| Show or hide the document outline | Ctrl+Alt+O |
| Show or hide the file manager | Ctrl+Alt+F |
| Quickly open a file by name or path | Ctrl+P |
| Undo or redo | Ctrl+Z / Ctrl+Y |
| Exit fullscreen editing | Esc |

Type `/` to find text formatting, lists, task checkboxes, links, images, tables, code blocks, formulas, Mermaid diagrams, and syntax help. Search for **YAML front matter** to insert a `name` and `description` template or jump to the existing header. You can edit the YAML at the top of documents such as `SKILL.md`.

In a code block, Enter keeps the current indentation and expands paired brackets onto separate lines. Use Tab or Shift+Tab to adjust indentation. The code toolbar lets you change the language, copy the code, or continue writing below the block. Add local images with the image picker, paste, or drag and drop. KaTeX and Mermaid render in the workspace, including SVG rendering for Mermaid Event Modeling.

Open **Keyboard shortcuts** from the toolbar to search, record, disable, and reset bindings. The settings detect duplicate bindings and warn about common browser or system conflicts. For a binding with an arrow, press and release Ctrl+Shift+. before pressing the second key. [Chrome shortcuts](https://support.google.com/chrome/answer/157179?hl=en) · [Edge shortcuts](https://support.microsoft.com/en-gb/edge/keyboard-shortcuts-in-microsoft-edge) · [Firefox shortcuts](https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly) · [Windows shortcuts](https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows)

### Custom themes

Click the palette icon to open **Custom themes**. Choose a light or dark base, preview your colors, and save named themes in the current browser. **Theme source** accepts JSON and can copy an existing theme for sharing. The supported color keys are `background`, `sidebar`, `text`, `accent`, and `code`. Omitted colors use the base theme.

```json
{
  "name": "Paper",
  "base": "light",
  "colors": { "background": "#faf2e8", "accent": "#28775c" }
}
```

## Use it in React

Install a `.tgz` from [GitHub Releases](https://github.com/Lition13/markdown-editor/releases), or [build the package locally](#build-and-publish). The package uses React 19.

```sh
npm install ./lition13-markdown-editor-0.1.0.tgz
```

```tsx
import { useState } from "react";
import { MarkdownEditor, MarkdownPreview } from "@lition13/markdown-editor";
import "@lition13/markdown-editor/style.css";

export function Example() {
  const [source, setSource] = useState("# Getting started\n");
  return (
    <>
      <MarkdownEditor locale="en" value={source} onChange={setSource} />
      <MarkdownPreview locale="en" value={source} />
    </>
  );
}
```

The host owns the Markdown string, file operations, and persistence. Use a different React `key` for each document to give it its own cursor position, undo history, and editing mode.

| Prop | Purpose |
| --- | --- |
| `theme` | Select `light` or `dark` per instance. |
| `locale` | Set the editor, preview, and dialog language to `en` or `zh-CN`. Defaults to `zh-CN`. |
| `className` | Style the outer element. |
| `allowExpand` | Enable or disable fullscreen editing. Enabled by default. |
| `ariaLabel`, `placeholder` | Set the editor's accessible name and empty-state prompt. |
| `normalizeLink` | Transform a link before sanitization. Return `undefined` to use the original address. |
| `onOpenLink` | Handle a validated external link or a host link such as `#task=`. The editor handles heading and footnote links. |
| `copyText` | Supply a clipboard handler. The editor uses the browser clipboard by default. |
| `overlayContainer`, `overlayTopInset` | Set the overlay container and top inset for a host with a fixed header. |
| `shortcuts` | Override bindings by command ID. Use `{ table: "Ctrl+Shift+F8" }` to rebind table insertion or set a command to `null` to disable it. |

Use `getMarkdownShortcutCommands(locale)` to list localized commands and default keys. Use `checkMarkdownShortcut(action, binding, overrides, locale)` to validate a binding. The host can open fullscreen editing with `openFullscreen()` on the editor ref.

The package ships ES modules, TypeScript declarations, CSS, KaTeX fonts, and lazy-loaded diagram code. The host supplies React and React DOM. The editor uses CSS `@scope` and the Popover API.

## Develop and verify

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

The site lives in `apps/web` and uses the public component API from `packages/markdown-editor`.

```sh
npm run typecheck
npm test
npm run build
npm run preview
npm run test:e2e
npm run verify:package
```

The production preview is available under the same subpath as GitHub Pages. Local browser tests use Edge. GitHub Actions uses Playwright Chromium. The package verifier installs the packed tarball in a separate React project and checks types, styles, formula fonts, Mermaid, and host callbacks. [Open the local preview](http://127.0.0.1:4173/markdown-editor/)

## Build and publish

GitHub Actions verifies the default branch and deploys `apps/web/dist` to GitHub Pages. For a new repository, select **GitHub Actions** under **Settings → Pages**.

Build and verify a tarball from the same commit as the site release, then attach it to the matching GitHub Release.

```sh
npm run build
npm pack --workspace ./packages/markdown-editor
npm run verify:package -- ./lition13-markdown-editor-0.1.0.tgz
```

The project uses the MIT license. The package build includes third-party license notices. [License](./LICENSE)
