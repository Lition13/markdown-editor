# Markdown 编辑器

[English](./README.md) · [简体中文](./README.zh-CN.md)

[在线使用](https://lition13.github.io/markdown-editor/) · [组件安装包](https://github.com/Lition13/markdown-editor/releases)

在线版默认只显示编辑区，顶栏、文件栏、大纲和状态栏默认收起。鼠标移到上沿可显示顶栏，点击或轻点上沿可固定。鼠标悬停在图标上可查看对应功能。点源码图标或按 Ctrl+/ 可切换到 Markdown 源文，打开状态栏可查看字词数和源码行数。

浏览器会记住文件栏、大纲、状态栏和手动固定的顶栏。窄窗口会恢复上次打开的抽屉。

在线版界面默认使用英文。可通过顶栏的语言菜单切换简体中文和 English，浏览器会恢复所选语言。新文件库默认打开英文示例 `Getting started.md`，也可以从文件管理打开 `入门示例.md`。查看原始入门示例时，切换语言会打开对应的版本。两份示例涵盖编辑操作、排版、列表、表格、代码块、YAML、公式、图表、图片语法和脚注，也可直接在仓库中阅读。[英文示例](./apps/web/src/examples/en.md) · [中文示例](./apps/web/src/examples/zh-CN.md)

顶栏的调色板打开「自定义主题」。可用浅色或深色作为基底，预览并调整工作区背景、侧栏、文字、强调色和代码底色。「保存并应用」将具名主题存到当前浏览器。可以保存多套，在「编辑主题」中选择后重新应用。

在「编辑主题」中选择「新建主题」，打开「主题源码」即可粘贴或编辑 JSON。已有主题可通过「复制源码」分享。`base` 接受 `light`、`dark`，`colors` 的键对应 `background`（工作区）、`sidebar`（侧栏）、`text`（文字）、`accent`（强调色）及 `code`（代码底色）。省略的颜色沿用基底。

```json
{
  "name": "书页",
  "base": "light",
  "colors": { "background": "#faf2e8", "accent": "#28775c" }
}
```

文档开头由两行 `---` 包围的 YAML 文件头会在正文中高亮，可直接编辑。输入 `/` 搜索「YAML 文件头」，可以插入带 `name` 和 `description` 的模板，或跳到现有文件头。大纲和字词统计按 Markdown 正文计算，行数包含文件头。

代码块会沿用已有缩进。配对括号间按 Enter 会展开为多行，Tab 和 Shift+Tab 可以调整缩进。编辑代码时可以直接复制，或点「继续正文」把光标移到代码块下方。

在编辑区按 Alt+Enter 进入全屏。全屏顶栏可以切换「编辑」和「源码」，点「完成编辑」或按 Esc 返回工作台，并继续在当前编辑位置输入。

「文件管理」以目录树显示文件和文件夹。点击文件夹可原地展开或收起，刷新后保留展开状态。新建和导入使用当前选中的文件夹，点击「文件库」可选择根目录。文件与文件夹可直接拖到目标文件夹或「文件库」，触屏从文件或文件夹图标开始拖动，键盘可在条目上按 Shift+Space 选择放置位置。用「导出」将当前文件保存为 Markdown。

插入表格默认使用 Ctrl+Alt+T，显示或隐藏文档大纲默认使用 Ctrl+Alt+O，显示或隐藏文件管理默认使用 Ctrl+Alt+F。在顶部工具栏点键盘图标打开「快捷键设置」，可以搜索命令、录制或输入组合、停用和恢复默认。设置即时生效并保存在当前浏览器，斜杠菜单和表格菜单会显示当前绑定。设置带有「→」的自定义组合后，先按 Ctrl+Shift+. 并松开，再按箭头右边的键。

快捷键设置会拦截同一编辑场景中的重复组合与常见保留键，其他可能冲突的组合会显示提示。扩展程序和自定义系统键以实际按键行为为准。[Chrome 快捷键](https://support.google.com/chrome/answer/157179?hl=en)、[Edge 快捷键](https://support.microsoft.com/en-gb/edge/keyboard-shortcuts-in-microsoft-edge)、[Firefox 快捷键](https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly)、[Windows 快捷键](https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows)

文件保存在当前浏览器。旧版已保存的草稿会自动迁入文件列表，导入同名文件时会自动加编号。

- 实时正文、源码切换、斜杠菜单、快捷键和撤销重做
- 可编辑表格、多级列表、待办、代码高亮、脚注和文档内链接
- 支持选择、粘贴和拖入本地光栅图片
- KaTeX 公式和 Mermaid 图表随包提供，包括 Event Modeling 的 SVG 渲染
- 浅色、深色和全屏编辑

## 在 React 项目中使用

从 [GitHub Releases](https://github.com/Lition13/markdown-editor/releases) 下载 `.tgz`，在 React 19 项目中安装。

```sh
npm install ./lition13-markdown-editor-0.1.0.tgz
```

```tsx
import { useState } from "react";
import { MarkdownEditor, MarkdownPreview } from "@lition13/markdown-editor";
import "@lition13/markdown-editor/style.css";

export function Example() {
  const [source, setSource] = useState("# 开始写作\n");
  return (
    <>
      <MarkdownEditor value={source} onChange={setSource} />
      <MarkdownPreview value={source} />
    </>
  );
}
```

`value` 和 `onChange` 传递 Markdown 字符串。宿主负责文件读写和持久化。使用不同的 React `key` 可以让每篇文档拥有自己的光标、撤销历史和编辑模式。

| 接口 | 用途 |
| --- | --- |
| `theme` | `light` 或 `dark`，可按实例使用不同主题 |
| `locale` | `zh-CN` 或 `en`，设置编辑器、预览和弹层的界面语言，默认 `zh-CN` |
| `className` | 设置组件外层样式 |
| `allowExpand` | 控制编辑器的全屏入口，默认开启 |
| `ariaLabel`、`placeholder` | 配置编辑区名称和提示 |
| `normalizeLink` | 在清洗前转换链接，返回 `undefined` 时使用原地址 |
| `onOpenLink` | 宿主处理通过校验的外链或 `#task=` 业务链接。文档内标题和脚注由组件处理 |
| `copyText` | 宿主提供剪贴板实现，默认使用浏览器剪贴板 |
| `overlayContainer`、`overlayTopInset` | 指定弹层容器和视口顶部留白，可用于嵌入有固定标题栏的应用 |
| `shortcuts` | 按命令 ID 覆盖快捷键，例如 `{ table: "Ctrl+Shift+F8" }`，将命令的值设为 `null` 可停用它的快捷键 |

宿主可使用 `getMarkdownShortcutCommands(locale)` 显示对应语言的命令与默认键，使用 `checkMarkdownShortcut(action, binding, overrides, locale)` 检查替换组合。`markdownShortcutCommands` 仍提供中文命令列表。自定义快捷键由宿主保存。

宿主的工具栏可通过组件引用调用 `openFullscreen()`。

包导出 ES 模块、TypeScript 声明和 CSS。React 和 React DOM 由宿主应用提供，KaTeX 字体和按需加载的图表分块随安装包交付。用支持 CSS `@scope` 和 Popover API 的现代浏览器打开编辑器。

## 本地开发与验收

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

在线版位于 `apps/web`，通过 `@lition13/markdown-editor` 的公开入口使用 `packages/markdown-editor`。文件列表和内容保存在 IndexedDB。文件读写、搜索和导出由网页处理。

```sh
npm run typecheck
npm test
npm run build
npm run preview
npm run test:e2e
npm run verify:package
```

生产预览地址是 [localhost 子路径](http://127.0.0.1:4173/markdown-editor/)。本机端到端验收使用 Edge，GitHub Actions 使用 Playwright Chromium。`verify:package` 会把实际打包生成的 `.tgz` 安装到临时的 React 项目，验证类型、样式、公式字体、Mermaid 和宿主回调。

## 发布

默认分支通过检查后，由 GitHub Actions 把 `apps/web/dist` 部署到 GitHub Pages。首次部署在仓库的 **Settings → Pages** 选择 **GitHub Actions**。

组件包使用与网页对应的提交打版本标签。从生产构建生成并验收安装包，将这个 `.tgz` 附到 GitHub Release。

```sh
npm run build
npm pack --workspace ./packages/markdown-editor
npm run verify:package -- ./lition13-markdown-editor-0.1.0.tgz
```

使用 [MIT](./LICENSE) 许可证。组件构建在产物内附带第三方许可声明。
