# my-cc-mods

仓库地址：<https://github.com/fangweilong/cc-mods>

Claude Code Mod 集合，提供状态栏、Subagent 实时面板和用户输入框增强。每个子目录都是一个独立 Mod，可单独安装、验证和使用；不要把多个 Mod 的文件合并到同一目录。

## 项目组成

| 目录 | Mod 名称 | 作用 |
| --- | --- | --- |
| `statusline-mod/` | `statusline-mod` | 使用 Claude Code 原生 Mod UI 渲染两行状态区域，展示模型、会话状态、运行环境、Git 分支与增删统计、Context、Token、缓存命中、配额、成本和工作目录；同时显示运行中的 Subagent 摘要。 |
| `subagent-split-view/` | `subagent-split-view` | 在 Claude Code 右侧打开实时 Subagent 面板，展示 Subagent 的名称、类型、模型、任务、当前活动、thinking/text 流、工具调用及执行结果；Subagent 全部结束后自动关闭面板。 |
| `user-prompt-frame/` | `user-prompt-frame` | 为用户消息添加“用户输入”边框，按终端宽度自适应，并按终端显示宽度处理中文、英文和 Emoji 混排；任务通知、其他会话消息和 Agent 消息仍使用 Claude Code 默认渲染。 |

### 各 Mod 的边界

- `statusline-mod` 只观察会话、用量、Git 和 Agent 状态，不修改 `settings.json`，也不覆盖原生 `statusLine` / `subagentStatusLine` 配置。
- `subagent-split-view` 只观察和渲染 Subagent 事件，不创建 Agent、不修改 Agent 参数、不改变权限或工具执行结果；日志只保存在当前 Claude Code 进程内，每个 Agent 最多保留 120 条。
- `user-prompt-frame` 只改变符合用户输入条件的 `UserMessage` 渲染，不改变消息内容或会话行为。

## 环境要求

- 已安装支持 Mod API 的 Claude Code。可检查版本：

  ```powershell
  claude --version
  ```

- 本项目使用 Claude Code 自带的 Mod API，不需要安装 npm 依赖，也不需要执行 `npm install`。
- Claude Code 首次加载 Mod 后会在各项目的 `.claude-plugin/types/` 生成类型声明；该目录已被 Git 忽略，不需要手动提交。
- 推荐使用 UTF-8 终端，以正确显示边框、箭头、圆环和其他 Unicode 字符。

## 安装方式

### 方式一：从当前集合仓库临时加载（推荐开发和测试）

在本仓库根目录执行对应命令。每个命令加载一个独立 Mod：

```powershell
claude --plugin-dir ".\statusline-mod"
claude --plugin-dir ".\subagent-split-view"
claude --plugin-dir ".\user-prompt-frame"
```

也可以使用绝对路径：

```powershell
claude --plugin-dir "D:\Codes\other\cc-mods\statusline-mod"
claude --plugin-dir "D:\Codes\other\cc-mods\subagent-split-view"
claude --plugin-dir "D:\Codes\other\cc-mods\user-prompt-frame"
```

macOS/Linux 使用同样的方式，将路径改为 Unix 路径，例如：

```bash
claude --plugin-dir ./user-prompt-frame
```

### 方式二：克隆仓库后加载

```bash
git clone https://github.com/fangweilong/cc-mods.git cc-mods
cd cc-mods
claude --plugin-dir ./statusline-mod
```

切换到其他 Mod 时，只需替换 `--plugin-dir` 后的子目录：

```bash
claude --plugin-dir ./subagent-split-view
claude --plugin-dir ./user-prompt-frame
```

### 方式三：在 `settings.json` 的 `env` 中配置集合目录

如果希望每次启动 Claude Code 都自动加载这个 Mod 集合，可以在 Claude Code 的 `settings.json` 中配置 `CLAUDE_CODE_PLUGIN_DIRS`。Windows 通常位于：

```text
C:\Users\<用户名>\.claude\settings.json
```

在已有的 `env` 对象中追加配置，不要覆盖其中已有的其他环境变量：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "D:/Codes/other/cc-mods"
  }
}
```

将路径替换为本仓库的实际绝对路径。Windows 路径推荐使用 `/`，也可以写成双反斜杠：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "D:\\Codes\\other\\cc-mods"
  }
}
```

macOS/Linux 示例：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/home/<用户名>/cc-mods"
  }
}
```

配置完成后重启 Claude Code。该变量应指向集合仓库根目录，即包含 `statusline-mod/`、`subagent-split-view/` 和 `user-prompt-frame/` 的目录；如果只想临时加载某一个 Mod，请继续使用 `--plugin-dir` 方式。

### 方式四：复制到本地 Mod 开发目录

将需要使用的整个子目录复制到 Claude Code 当前会话使用的 Mod 开发目录中，然后在 Claude Code 中启用 Mod 热重载。必须保持子目录自身的结构，例如：

```text
<Mod 开发目录>/
└── user-prompt-frame/
    ├── .claude-plugin/plugin.json
    ├── hooks/hooks.json
    └── hooks/register.tsx
```

不要只复制 `hooks/`，也不要将三个 Mod 合并到同一个目录。此方式适合持续修改和观察 UI 效果。

## 使用说明

### `statusline-mod`

启动后会在输入区下方渲染状态区域。可执行以下命令打开配置面板：

```text
/my-cc-mods-config
```

配置文件路径：

```text
~/.config/my-cc-mods/config.json
```

配置支持：

- `language`：`en` 或 `zh`。
- `order`：状态模块顺序。
- `modules`：单独启用或停用模块。
- `promptFrame`：用户输入框标题、颜色、横竖线和四角符号；`user-prompt-frame` 也读取这一段配置。

如果之前通过 `settings.json` 配置了 Python 版 `statusLine` 或 `subagentStatusLine`，请在单独测试本 Mod 时暂时停用旧配置，避免重复显示。

### `subagent-split-view`

Subagent 启动后会自动尝试打开右侧面板，也可以手动打开：

```text
/subagent-view
```

清除当前进程中已记录的执行日志：

```text
/subagent-view clear
```

终端宽度不足时，面板会等待；扩大终端后重新执行 `/subagent-view` 即可。

### `user-prompt-frame`

无需额外命令。加载 Mod 后，用户消息会显示为带标题的边框，例如：

```text
┌─ 用户输入 ─────────────────────────────┐
│  现在继续测试，hello123。              │
└────────────────────────────────────────┘
```

默认样式也可通过统一配置文件中的 `promptFrame` 段修改。配置文件不存在或字段无效时，会自动使用默认样式。

## 验证与测试

每个 Mod 都可以独立执行校验和测试。进入对应目录后运行：

```powershell
cd .\statusline-mod
claude plugin validate .
claude plugin test .
```

```powershell
cd ..\subagent-split-view
claude plugin validate .
claude plugin test .
```

```powershell
cd ..\user-prompt-frame
claude plugin validate .
claude plugin test .
```

也可以从仓库根目录直接执行：

```powershell
claude plugin validate .\statusline-mod
claude plugin test .\statusline-mod
claude plugin validate .\subagent-split-view
claude plugin test .\subagent-split-view
claude plugin validate .\user-prompt-frame
claude plugin test .\user-prompt-frame
```

## 目录结构

```text
cc-mods/
├── .gitignore
├── LICENSE
├── readme.md
├── statusline-mod/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts
│   └── tests/register.test.ts
├── subagent-split-view/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts
│   └── tests/register.test.ts
└── user-prompt-frame/
    ├── .claude-plugin/plugin.json
    ├── hooks/hooks.json
    ├── hooks/register.tsx
    └── tests/register.test.ts
```

## 许可证

本项目采用 [MIT License](./LICENSE)。
