# Claude Code Statusline Mod

通过 Claude Code Mod API 复刻 `cc-status-line` 的 statusline 版本，不依赖外部 Python 命令。统一配置面板由独立的 `cc-mods-config` 插件提供。

状态行根据 `position` 选择原生 UI 插槽：

- `session-mode`（默认、现有位置）：在 `SessionMode` 模式提示区域渲染两行，第一行显示 `accept edits on` 等模式提示，第二行从左侧显示状态栏；用文本中的显式换行分隔，不依赖 `Box` 的纵向布局。没有模式提示时只显示状态栏，不留空行；`PromptHint` 保持为空。
- `below-prompt`（输入框下方）：在 `PromptHint` 提示区域保留原生快捷提示及其他 Mod 的绘制结果，在下一行显示状态栏；`SessionMode` 交回宿主和其他 Mod 渲染，保留模式提示。

状态栏只在所选位置绘制，不会重复渲染。状态栏和外层模式文本显式启用换行，宽度不足时显示后续行，不以 `...` / `…` 截断 Token 或其他模块。不会使用 `$.ui.status()` 文本入口，因此不会出现 ANSI 控制符乱码，也不会自动附加 `statusline-mod:` 插件前缀。

## 状态栏样式

主状态行支持两种显示模式，以低亮度 ` | ` 分隔各模块：

- 完整模式 `full`：每个模块统一使用 Emoji 作为栏目图标，不混用单色字符图标。
- 简洁模式 `compact`（默认）：去掉各模块前面的 Emoji 图标及其空格，保留文字、配色和所有数据；分支圆点/勾号、增删符号、上下文圆环与 Token 箭头不受影响。不会删除模型名、分支名或路径内容中自带的 Emoji，也不改变 Subagent 行。

两种模式保留 Python 版本兼容的模块、配置顺序与开关，不添加背景色，也不要求 Nerd Font；原生 UI 与 ANSI 格式化输出使用相同的文本和配色。以下图标说明对应完整模式。

- `model`：`🤖` 模型标识，粗体青绿色
- `state`：`🎯 Idle` / `🎯 Running` / `🎯 Thinking` / `🎯 Auth`
- `env`：`🧩` `.venv`、conda、devcontainer、Node、pnpm、Go、Rust、Maven 等环境检测
- `git`：`🌿` 蓝色分支或 detached HEAD 短 SHA；干净 `✓` 为绿色，有改动 `●` 为黄色，不改变分支文字颜色
- `git_stat`：`📝` 未提交增删行统计，例如绿色 `+42`、红色 `-12`
- `context`：`🧠` 上下文，保留圆环指示器，65% 黄色、85% 红色
- `tokens`：粉色 `🧮`，`↑` 输入、`↓` 输出，保留 `k` / `M` 数量格式；生成中不追加省略号，运行状态由 `state` 模块表示。模型每次请求完成后即时累计，包含带工具调用的中间请求；`turn.complete` 仅作无 step usage 时的兜底，避免重复统计。
- `cache`：青绿色 `💾 cache 80% (12.0k)`
- `quota`：`⏳` `5h`、`1d`、`7d`、`1m` 配额与重置倒计时
- `cost`：`💰` 会话成本，例如 `$0.37`
- `cwd`：绿色 `📂` 工作目录，`$HOME` 折叠为 `~`，深路径显示最后三段
- Subagent：单独追加 `↳` 行，包含模型、角色、状态、Context、Token 和任务描述

示例：

```text
🤖 Opus 5 | 🎯 Idle | 🧩 (.venv) | 🌿 main ● | 📝 +42 -12 | 🧠 ctx ◑ 42% | 🧮 ↑15.0k ↓3.2k | 💾 cache 80% (12.0k) | ⏳ 5h 76% · 2h 15m | 📂 ~/Codes/project
↳ Opus 5 │ Explore │ running │ ctx ◕ 68% │ ↑1.2k ↓5.4k │ find all status line configs
```

简洁模式示例（相同数据，无前缀图标）：

```text
Opus 5 | Idle | (.venv) | main ● | +42 -12 | ctx ◑ 42% | ↑15.0k ↓3.2k | cache 80% (12.0k) | 5h 76% · 2h 15m | ~/Codes/project
```

## 配置兼容

Mod 读取与 Python 版本相同的配置文件：

```text
~/.config/my-cc-mods/config.json
```

配置格式保持兼容：

```json
{
  "position": "session-mode",
  "displayMode": "compact",
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

- `position`: `session-mode`（现有位置，默认）/ `below-prompt`（输入框下方）；缺少或无效时沿用现有位置
- `displayMode`: `full`（完整模式，带前缀图标）/ `compact`（简洁模式，默认，无前缀图标）；缺少或无效时使用简洁模式
- `language`: `en` / `zh`
- `order`: 模块排序，缺失模块自动按默认顺序补齐
- `modules`: 各模块启用/停用
- `promptFrame`: 用户输入框标题、边框颜色、横竖线及四角符号

统一配置由独立的 [`cc-mods-config`](../cc-mods-config/README.md) 插件管理。加载该插件后执行 `/my-cc-mods-config`，可修改状态栏位置、显示模式、语言、模块开关与顺序。选择位置或显示模式后点击“保存配置”，状态栏自动切换；关闭面板不保存未提交的修改。

本 Mod 不注册配置命令、不渲染配置面板、不写配置文件，也不依赖配置插件才能运行。面板保存兼容配置文件后，状态栏会重新读取并刷新；手动修改文件则在下一次会话测量或回合结束时读取。配置插件不依赖状态栏，未加载本 Mod 时仍可使用面板预先配置。

## 与现有 statusline 的关系

这个 Mod 根据位置配置使用 `SessionMode` 或 `PromptHint` 原生 UI 绘制状态栏，不会直接改写 `settings.json`。不会覆盖原生 `statusLine` / `subagentStatusLine` 配置。颜色使用 UI 的 RGB `Text.color`，不会把 ANSI 转义序列当作普通文本输出。

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
