# project-files

提供 `/project-files [close|refresh]` 独立 Pane，用于浏览并预览当前 Claude Code session 的工作目录。

## 功能

- 根目录固定为 session cwd；目录进入和返回均通过 `$.fs.list`、`$.fs.stat` 校验。
- 拒绝包含 `..` 的路径，并用 `realPath` 约束符号链接不能逃出 session cwd。
- 文件预览以 bytes 读取并严格解码 UTF-8；二进制或不可解码内容显示提示，不把二进制当文本渲染。
- 预览最多显示 12,000 个字符，超出部分显示截断标记；目录最多显示 200 项。
- 不调用 `process`，不修改现有 Pane，只打开 `project-files` 自己的 Pane。

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
