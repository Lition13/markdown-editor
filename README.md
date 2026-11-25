# Markdown 编辑器

[在线使用](https://lition13.github.io/markdown-editor/) · [组件安装包](https://github.com/Lition13/markdown-editor/releases)

直接编辑正文，点「源码」或按 Ctrl+/ 切换到 Markdown 源文。通过「文件管理」新建、批量导入、搜索、切换、重命名和删除文件，用「导出」将当前文件保存为 Markdown。

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
| `className` | 设置组件外层样式 |
| `allowExpand` | 控制编辑器的全屏入口，默认开启 |
| `ariaLabel`、`placeholder` | 配置编辑区名称和提示 |
| `normalizeLink` | 在清洗前转换链接，返回 `undefined` 时使用原地址 |
| `onOpenLink` | 宿主处理通过校验的外链或 `#task=` 业务链接。文档内标题和脚注由组件处理 |
| `copyText` | 宿主提供剪贴板实现，默认使用浏览器剪贴板 |
| `overlayContainer`、`overlayTopInset` | 指定弹层容器和视口顶部留白，可用于嵌入有固定标题栏的应用 |

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
