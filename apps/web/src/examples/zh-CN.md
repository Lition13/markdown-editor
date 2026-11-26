# 开始写作

点击段落即可编辑，也可以输入 `/` 搜索工具。右侧大纲可以跳到各个章节。这是一份普通的 Markdown 文件，可以改写、重命名或导出一份副本。

## 编辑操作

| 操作 | 快捷键 |
| :--- | :--- |
| 打开编辑工具 | `/` |
| 切换正文和源码 | Ctrl+/ |
| 插入表格 | Ctrl+Alt+T |
| 显示或隐藏文件管理 | Ctrl+Alt+F |
| 显示或隐藏文档大纲 | Ctrl+Alt+O |
| 全屏编辑 | Alt+Enter |
| 撤销和重做 | Ctrl+Z / Ctrl+Y |
| 退出全屏 | Esc |

把鼠标移到页面上沿可显示工具栏，触屏可轻点上沿。点击源码图标可查看这份文件的写法，在编辑区按 Alt+Enter 可进入全屏。

## 文字和链接

试试 **加粗**、*斜体*、~~删除线~~ 和 `行内代码`。可以用[文档内链接](#公式与图表)跳到公式章节，也可以打开[项目仓库][project]。

> 引用可以用来记录提示、原话或会议中的一项决定。

---

## 列表和待办

- 规划文档结构。
  - 为主要内容添加标题。
  - 用大纲在标题间跳转。
- 开始写第一稿。

1. 编辑一个段落。
2. 切到源码核对写法。
3. 导出完成的文件。

- [ ] 试试勾选待办。
- [ ] 导入自己的 Markdown 文件。
- [x] 打开这份示例。

## 表格

| 章节 | 状态 | 条目数 |
| :--- | :---: | ---: |
| 大纲 | 已完成 | 3 |
| 初稿 | 进行中 | 2 |
| 审阅 | 待处理 | 1 |

点击单元格即可编辑。用 Tab 移到下一格，Shift+Tab 返回上一格。表格工具栏可以调整行列数、列对齐和行列位置。

## 代码和 YAML

```javascript
const topics = ["Markdown", "YAML", "Mermaid"]

for (const topic of topics) {
  console.log(topic)
}
```

点击代码块即可试用自动缩进、切换语言和复制代码。

YAML 文件头放在 Markdown 文件的最开头。从 `/` 菜单选择「YAML 文件头」，可以给 `SKILL.md` 等文档插入包含 `name` 和 `description` 的结构。

```yaml
---
name: markdown-quickstart
description: Markdown 编辑器的上手指南。
---
```

## 公式与图表

行内公式 $a^2 + b^2 = c^2$ 可以直接写在句子中。单独成行的公式可以放在公式块里。

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$

```mermaid
flowchart LR
  A[导入 Markdown] --> B[编辑正文]
  B --> C[导出文件]
```

点击图表下方的「查看源码」可以查看 Mermaid 写法。

## 图片和脚注

可以在 `/` 菜单里插入图片，也可以直接粘贴或拖入 PNG、JPEG、GIF、WebP 或 AVIF 文件。Markdown 图片以 `!` 开头，并附上图片说明。

```markdown
![工作台草图](workspace.png)
```

脚注可以把补充说明放在正文末尾。[^storage]

[^storage]: 在线版将文件保存在当前浏览器。可以导出 Markdown 副本，在其他位置保存。

[project]: https://github.com/Lition13/markdown-editor
