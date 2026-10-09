# my-cc-mods

仓库地址：<https://github.com/fangweilong/cc-mods>

Claude Code Mod 集合，提供状态栏、Subagent 实时面板、用户输入框增强和部分界面本地化。每个子目录都是一个独立 Mod，可单独安装、验证和使用；不要把多个 Mod 的文件合并到同一目录。

## 统一可视化配置

**本仓库所有现有可调配置统一在 `/my-cc-mods-config` 可视化面板中管理，无需手动编辑配置文件。** 配置面板只保留这一个命令入口。

```text
/my-cc-mods-config
```

面板由独立的 `cc-mods-config` 插件提供，不依赖 `statusline-mod` 或其他功能 Mod。状态栏与输入框的设置可预先保存；完整管理 i18n 时需同时加载 `i18n-mod`，未加载时显示不可用提示，宿主策略锁定的设置显示为只读。推荐按下文集合目录方式加载仓库。

| 配置区域 | 可视化设置 |
| --- | --- |
| 状态栏与配置面板 | `en` / `zh` 显示语言、状态栏位置（现有位置 / 输入框下方）、显示模式（完整 / 简洁）、模块开关和顺序 |
| 用户输入框 | 标题、颜色、横竖线和四角符号 |
| 原生界面语言（i18n） | 语言代码或 JSON 路径、简体中文/English 原生语言选择器、重新加载已保存的语言包、取消语言修改 |
| Subagent 实时面板 | 当前自动工作，没有可调配置；打开/清理命令仍保留 |

修改后使用面板底部的 **保存配置 / Save configuration**。i18n 路径相对 `i18n-mod` 目录解析；坏文件或策略拒绝会保留语言草稿并显示错误，不写入其他 Mod 配置。**重新加载语言包** 不保存草稿；先保存或取消语言修改再重载。

入口统一，存储保持兼容：状态栏与输入框仍保存到 `~/.config/my-cc-mods/config.json`；i18n 通过宿主 `userConfig` 保存 `i18n-mod.language`，不在上述文件维护第二份语言设置。两个存储不是原子事务：若 i18n 已保存但后续文件写入失败，面板会明确提示部分保存失败，可重试保存。

项目配置约定：后续新增的用户可调项也应接入这个可视化面板；Mod 的命令行配置入口和手动配置格式仅作为兼容/高级用法，不要求日常使用时分别配置各 Mod。

## 项目组成

| 目录 | Mod 名称 | 作用 |
| --- | --- | --- |
| `cc-mods-config/` | `cc-mods-config` | 独立的全仓库统一可视化配置面板，管理状态栏、输入框与 i18n 配置；不依赖任何功能 Mod。 |
| `statusline-mod/` | `statusline-mod` | 使用 Claude Code 原生 Mod UI 渲染两行状态区域，展示模型、会话状态、运行环境、Git 分支与增删统计、Context、Token、缓存命中、配额、成本和工作目录；同时显示运行中的 Subagent 摘要，不包含配置面板。 |
| `subagent-split-view/` | `subagent-split-view` | 在 Claude Code 右侧打开实时 Subagent 面板，展示 Subagent 的名称、类型、模型、任务、当前活动、thinking/text 流、工具调用及执行结果；Subagent 全部结束后自动关闭面板。 |
| `i18n-mod/` | `i18n-mod` | 汉化已开放的运行状态、耗时、快捷键、模式及部分提示；按需读取 JSON 语言包，支持简体中文与 English 原文模式，通过统一 `/my-cc-mods-config` 面板选择语言代码或文件路径；新增语言无需注册。 |
| `user-prompt-frame/` | `user-prompt-frame` | 为用户消息添加“用户输入”边框，按终端宽度自适应，并按终端显示宽度处理中文、英文和 Emoji 混排；任务通知、其他会话消息和 Agent 消息仍使用 Claude Code 默认渲染。 |

### 各 Mod 的边界

- `cc-mods-config` 独立提供统一配置面板，保存兼容配置文件；主动保存 i18n 时通过宿主配置 API 更新其语言选项，不直接改写 `settings.json`，不依赖其他 Mod 的状态。
- `statusline-mod` 只观察和渲染会话状态、读取配置，不注册配置面板命令、不写配置，也不覆盖原生 `statusLine` / `subagentStatusLine` 配置。
- `subagent-split-view` 只观察和渲染 Subagent 事件，不创建 Agent、不修改 Agent 参数、不改变权限或工具执行结果；日志只保存在当前 Claude Code 进程内，每个 Agent 最多保留 120 条。
- `i18n-mod` 只改变已开放的界面提示，不翻译会话内容、不调用模型；主动切换语言时通过宿主 `userConfig` 保存自己的语言选项。权限弹窗不在覆盖范围内；与 `statusline-mod` 同用时，原生快捷键提示仍被后者隐藏。
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
claude --plugin-dir "./cc-mods-config"
claude --plugin-dir ".\statusline-mod"
claude --plugin-dir ".\subagent-split-view"
claude --plugin-dir ".\user-prompt-frame"
claude --plugin-dir ".\i18n-mod"
```

也可以使用绝对路径：

```powershell
claude --plugin-dir "D:/Codes/other/cc-mods/cc-mods-config"
claude --plugin-dir "D:\Codes\other\cc-mods\statusline-mod"
claude --plugin-dir "D:\Codes\other\cc-mods\subagent-split-view"
claude --plugin-dir "D:\Codes\other\cc-mods\user-prompt-frame"
claude --plugin-dir "D:\Codes\other\cc-mods\i18n-mod"
```

需要面板和功能 Mod 同时可用时，在同一次启动中加载各目录，例如不加载状态栏、只配置输入框和 i18n：

```powershell
claude --plugin-dir "./cc-mods-config" --plugin-dir "./user-prompt-frame" --plugin-dir "./i18n-mod"
```

macOS/Linux 使用同样的方式，将路径改为 Unix 路径，例如：

```bash
claude --plugin-dir ./cc-mods-config
claude --plugin-dir ./user-prompt-frame
claude --plugin-dir ./i18n-mod
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
claude --plugin-dir ./i18n-mod
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

配置完成后重启 Claude Code。该变量应指向集合仓库根目录，即包含 `cc-mods-config/`、`statusline-mod/`、`subagent-split-view/`、`user-prompt-frame/` 和 `i18n-mod/` 的目录；如果只想临时加载某一个 Mod，请继续使用 `--plugin-dir` 方式。

### 方式四：复制到本地 Mod 开发目录

将需要使用的整个子目录复制到 Claude Code 当前会话使用的 Mod 开发目录中，然后在 Claude Code 中启用 Mod 热重载。必须保持子目录自身的结构，例如：

```text
<Mod 开发目录>/
├── i18n-mod/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts
│   ├── hooks/language.ts
│   ├── hooks/source.ts
│   ├── hooks/translate.ts
│   ├── locales/zh-CN.json
│   ├── types/index.d.ts
│   └── tests/
└── user-prompt-frame/
    ├── .claude-plugin/plugin.json
    ├── hooks/hooks.json
    └── hooks/register.tsx
```

不要只复制 `hooks/`，也不要将多个 Mod 合并到同一个目录。此方式适合持续修改和观察 UI 效果。

## 使用说明

### `cc-mods-config`

独立加载即可使用，不需要状态栏。执行以下唯一命令打开统一可视化配置面板：

```text
/my-cc-mods-config
```

### `statusline-mod`

启动后默认在模式提示区域以简洁模式渲染状态栏。加载 `cc-mods-config` 后，可通过 `/my-cc-mods-config` 的“状态栏位置”选择现有位置或“输入框下方”，通过“状态栏显示模式”选择完整模式或简洁模式。简洁模式不显示各项前面的 Emoji 图标，保留文字配色、Git 状态、上下文圆环和 Token 箭头。保存后自动切换且不重复显示；单独加载状态栏不会注册配置命令。

配置文件路径：

```text
~/.config/my-cc-mods/config.json
```

配置支持：

- `position`：`session-mode`（默认、现有模式提示区域）或 `below-prompt`（输入框下方的提示区域）；旧配置无需迁移。
- `displayMode`：`full`（完整模式，保留前缀图标）或 `compact`（简洁模式，默认，隐藏前缀图标）；缺少或无效时保持简洁模式。
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

### `i18n-mod`

默认简体中文。打开 `/my-cc-mods-config`，在“原生界面语言（i18n）”区域填写语言代码或 JSON 路径，点击“保存配置”；编辑语言包文件后，通过同一区域的“重新加载语言包”按钮应用。

新增语言只需提供 JSON 文件，不必修改注册表；只缓存当前包。English 原文模式和缺失译文保留原生文案，不改变用户输入、模型回复或工具结果。`/i18n`、`/config` 仍可作为高级兼容入口，日常配置无需使用它们。

当前已接入 **6 类原生界面位置**：运行状态、回合耗时、输入框快捷提示、工具后台运行提示、模式标签和部分通知；另有 `/i18n` 自身的 10 条控制文案。完整数量及边界见 [当前已支持的 i18n](./i18n-mod/README.md#当前已支持的-i18n)。状态栏和配置面板自身的 `en` / `zh` 文案仍独立维护，不属于 i18n JSON 语言包；与 `statusline-mod` 同用时，原生输入框快捷提示仍被隐藏。新增语言包步骤和其他共存限制见 [i18n-mod/README.md](./i18n-mod/README.md)。

### `user-prompt-frame`

无需额外命令。加载 Mod 后，用户消息会显示为带标题的边框，例如：

```text
┌─ 用户输入 ─────────────────────────────┐
│  现在继续测试，hello123。              │
└────────────────────────────────────────┘
```

在 `/my-cc-mods-config` 的“用户输入框”区域修改样式；底层仍兼容统一配置文件中的 `promptFrame` 段。配置文件不存在或字段无效时，会自动使用默认样式。

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
claude plugin validate ./cc-mods-config
claude plugin test ./cc-mods-config
claude plugin validate .\statusline-mod
claude plugin test .\statusline-mod
claude plugin validate .\subagent-split-view
claude plugin test .\subagent-split-view
claude plugin validate .\user-prompt-frame
claude plugin test .\user-prompt-frame
claude plugin validate .\i18n-mod
claude plugin test .\i18n-mod
```

## 目录结构

```text
cc-mods/
├── .gitignore
├── LICENSE
├── readme.md
├── cc-mods-config/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts
│   ├── types/index.d.ts
│   └── tests/config.test.ts
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
├── i18n-mod/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts
│   ├── hooks/language.ts
│   ├── hooks/source.ts
│   ├── hooks/translate.ts
│   ├── locales/zh-CN.json
│   ├── types/index.d.ts
│   └── tests/
└── user-prompt-frame/
    ├── .claude-plugin/plugin.json
    ├── hooks/hooks.json
    ├── hooks/register.tsx
    └── tests/register.test.ts
```

## 许可证

本项目采用 [MIT License](./LICENSE)。
