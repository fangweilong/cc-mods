# project-files

提供 `/project-files [close|refresh]` 独立 Pane，用于浏览并预览当前 Claude Code session 的工作目录。

## 功能

- 根目录固定为 session cwd 的规范化 `realPath`；目录进入和返回均通过 `$.fs.list`、`$.fs.stat` 校验。
- 拒绝包含 `..` 的路径，并用 `realPath` 约束符号链接不能逃出 session cwd。
- 按文件类型预览：
  - Markdown（`.md` / `.mdx` / `.markdown`）使用原生 `Markdown` 渲染；
  - 常见代码文件使用原生 `Code` 做语法高亮；
  - `.diff` / `.patch` 使用 `Code` 的 diff 着色；
  - PNG 图片在 terminal surface 使用原生 `Image` 预览；其他图片格式或 surface 显示说明；
  - 其他 UTF-8 文本按原样显示。
- 文件预览以 bytes 读取，并用 `TextDecoder('utf-8', { fatal: true })` 严格解码；二进制或不可解码内容显示提示。
- 预览默认最多显示 60,000 个字符，目录默认最多显示 200 项；两者可在统一配置面板调整。
- 支持「复制路径」；快速切换目录或文件时用递增序号丢弃过期异步结果。
- 不调用 `process`，不修改现有 Pane，只打开 `project-files` 自己的 Pane。

## 配置

在 `/my-cc-mods-config` 的「文件浏览」页签调整：

- 预览上限（字符）：`20000` / `60000`（默认）/ `120000`；
- 目录列表上限（项）：`100` / `200`（默认）/ `500`。

配置保存在 `~/.config/my-cc-mods/config.json` 的 `projectFiles` 段：

```json
{
  "projectFiles": {
    "maxPreviewChars": 60000,
    "maxListEntries": 200
  }
}
```

面板保存后通过 `fs.write` 热重载；超长预览会截断并显示标记，列表只显示排序后的前 N 项。

## 使用

```text
/project-files
/project-files refresh
/project-files close
```

启动开发验证：

```powershell
claude --plugin-dir ".\project-files"
```

## 安装与卸载

在 CC GUI 侧边栏选择「插件」→「从本地目录安装」，选择包含 `manifest.json` 的 `project-files` 目录。修改后再次从同一目录安装即可热重载；在插件页卸载即可移除。

## 验证

```powershell
claude plugin validate .\project-files
claude plugin test .\project-files
```
