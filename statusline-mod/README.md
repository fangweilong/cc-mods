# Claude Code Statusline Mod

通过 Claude Code Mod API 复刻 `cc-status-line` 的 statusline 版本，不依赖外部 Python 命令。

状态行使用 `SessionMode` 原生 UI 插槽渲染为两行：第一行显示 `accept edits on` 等模式提示，第二行从左侧显示状态栏。`PromptHint` 保持为空以避免重复渲染。不会使用 `$.ui.status()` 文本入口，因此不会出现 ANSI 控制符乱码，也不会自动附加 `statusline-mod:` 插件前缀。

## 复刻内容

主状态行保持 Python 版本的模块、顺序、图标和 RGB 配色：

- `model`：模型标识，粗体青色
- `state`：`Idle` / `Running` / `Thinking` / `Auth`
- `env`：`.venv`、conda、devcontainer、Node、pnpm、Go、Rust、Maven 等环境检测
- `git`：当前分支或 detached HEAD 短 SHA，干净 `✓`、有改动 `●`
- `git_stat`：未提交增删行统计，例如 `+42 -12`
- `context`：圆环上下文指示器，65% 黄色、85% 红色
- `tokens`：`↑` 输入、`↓` 输出，生成中追加 `…`
- `cache`：`⚡cache 80% (12.0k)`
- `quota`：`5h`、`1d`、`7d`、`1m` 配额与重置倒计时
- `cost`：会话成本，例如 `$0.37`
- `cwd`：`$HOME` 折叠为 `~`，深路径显示最后三段
- Subagent：单独追加 `↳` 行，包含模型、角色、状态、Context、Token 和任务描述

示例：

```text
Opus 5 │ Idle │ (.venv) │ main ● │ +42 -12 │ ctx ◑ 42% │ ↑15.0k ↓3.2k │ ⚡cache 80% (12.0k) │ 5h 76% · 2h 15m │ ~/Codes/project
↳ Opus 5 │ Explore │ running │ ctx ◕ 68% │ ↑1.2k ↓5.4k │ find all status line configs
```

## 配置兼容

Mod 读取与 Python 版本相同的配置文件：

```text
~/.config/my-cc-mods/config.json
```

配置格式保持兼容：

```json
{
  "language": "en",
  "order": [
    "model",
    "state",
    "env",
    "git",
    "git_stat",
    "context",
    "tokens",
    "cache",
    "quota",
    "cost",
    "cwd"
  ],
  "modules": {
    "model": true,
    "state": true,
    "env": true,
    "git": true,
    "git_stat": true,
    "context": true,
    "tokens": true,
    "cache": true,
    "quota": true,
    "cost": true,
    "cwd": true
  },
  "promptFrame": {
    "title": "用户输入",
    "color": "cyan",
    "horizontal": "─",
    "vertical": "│",
    "topLeft": "┌",
    "topRight": "┐",
    "bottomLeft": "└",
    "bottomRight": "┘"
  }
}
```

支持：

- `language`: `en` / `zh`
- `order`: 模块排序，缺失模块自动按默认顺序补齐
- `modules`: 各模块启用/停用
- `promptFrame`: 用户输入框标题、边框颜色、横竖线及四角符号

运行 `/my-cc-mods-config` 会打开 Mod 内置配置面板：

- 切换 `en` / `zh`
- 启用/停用模块
- 调整模块顺序
- 编辑用户输入框标题、颜色和边框符号
- 关闭面板

修改后点击 `Save configuration` 才会写回配置文件；`Close` 只关闭面板，不保存未提交的草稿。

## 与现有 statusline 的关系

这个 Mod 使用 `SessionMode` 原生 UI 在输入框下方绘制两行状态区域，不会修改 `settings.json`，也不会覆盖原生 `statusLine` / `subagentStatusLine` 配置。颜色使用 UI 的 RGB `Text.color`，不会把 ANSI 转义序列当作普通文本输出。

如果要单独测试 Mod 版本，请手动暂时注释当前配置中的：

```json
"statusLine": {
  "command": "python D:/Codes/other/cc-status-line/statusline.py main",
  "padding": 0,
  "type": "command"
},
"subagentStatusLine": {
  "command": "python D:/Codes/other/cc-status-line/statusline.py subagent",
  "type": "command"
}
```

## 加载

在集合仓库根目录执行：

```powershell
claude --plugin-dir ".\statusline-mod"
```

或使用绝对路径：

```powershell
claude --plugin-dir "D:\Codes\other\cc-mods\statusline-mod"
```

## 验证

```powershell
claude plugin validate .
claude plugin test .
```

类型声明由 Claude Code 在 Mod 加载后生成到 `.claude-plugin/types/`，不需要手动安装 npm 依赖。
