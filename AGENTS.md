# AGENTS.md

面向在本仓库工作的 Agent。项目说明、目录、验证命令、开发约定与待办统一放在这里。

仓库地址：<https://github.com/fangweilong/cc-mods>

## 项目概述

Claude Code Mod 集合，提供状态栏、Subagent 实时面板、统一配置面板、用户输入框增强、文件浏览、工具输出折叠与部分界面本地化。

- 每个子目录都是一个**独立 Mod**，可单独安装、验证和使用。
- 不要把多个 Mod 的文件合并到同一目录，也不要跨目录 import。
- 使用 Claude Code 自带的 Mod API，不需要安装 npm 依赖。
- 类型声明由宿主在加载后生成到各 Mod 的 `.claude-plugin/types/`，该目录已被 Git 忽略。

## 目录结构

```text
cc-mods/
├── AGENTS.md                  # 本文件：约定、命令、待办
├── readme.md                  # 用户向文档
├── cc-mods-config/            # 统一可视化配置面板
├── statusline-mod/            # 原生 Mod UI 状态栏
├── subagent-split-view/       # Subagent 实时面板 + 原生转录入口
├── i18n-mod/                  # 界面本地化
├── timestamp-mod/             # 消息时间、工具耗时、TPS
├── user-prompt-frame/         # 用户输入框边框
├── todo-panel/                # Task / Todo 进度 Pane
├── notification-mod/          # 回合完成/失败通知
├── project-files/             # 文件浏览与预览 Pane
├── tool-output/               # 工具结果折叠 / 平铺
└── docs/                      # 设计与实施计划
```

每个 Mod 的典型结构：

```text
<mod>/
├── .claude-plugin/plugin.json
├── hooks/hooks.json           # {"modules":["./register.ts"]}
├── hooks/register.ts
├── types/index.d.ts           # 手动维护的 API 类型
├── tests/                     # claude plugin test
├── tsconfig.json
└── README.md
```

## 开发与验证

在仓库根目录执行：

```powershell
claude plugin validate .\tool-output
claude plugin test .\tool-output
```

临时加载：

```powershell
claude --plugin-dir ".\cc-mods-config" --plugin-dir ".\tool-output"
```

- Mod API 以当前 Claude Code 生成的声明为准；升级前先核对 `.claude-plugin/types/` 或 `claude-code` 类型。
- 测试使用 `claude plugin test` 与 `claude-code/testing` 的 `test/expect/mock`、`$.ui.mount`。
- 修改行为时同步更新该 Mod 的 `README.md`、根 `readme.md` 与调用方。
- 注释只记录业务约束、设计决策与技术限制，不解释显而易见的代码。

## 核心约定

- **所有用户可调项统一接入 `/my-cc-mods-config` 面板**，不要为单个 Mod 新增独立配置命令作为主入口。
- 状态栏、输入框、时间、工具输出配置保存在 `~/.config/my-cc-mods/config.json`。
- i18n 语言与耗时行选项通过宿主 `userConfig`（`settings.json`）保存，不复制到上述 JSON。
- 各 Mod 独立读取自己的设置，不通过 `cc-mods-config` 的运行时状态获取配置；配置读取与规范化逻辑可各自保留副本。
- 面板保存不是跨存储的原子事务；失败时需报告部分保存并保留未提交草稿。
- 只改显示、不篡改工具结果/会话记录/模型输入，是多个 Mod 的共同边界。

## 各 Mod 职责

| 目录 | 作用 |
| --- | --- |
| `cc-mods-config/` | 统一配置面板，管理各 Mod 可调项；不依赖功能 Mod。 |
| `statusline-mod/` | 渲染状态栏：模型、环境、Git、Context、Token、配额、成本、目录，以及可选回合步骤/原因/工具次数。 |
| `subagent-split-view/` | Subagent 卡片；「查看转录」调用 `$.ui.view({ agentId })` 打开原生转录，已结束 Agent 保留回看。 |
| `i18n-mod/` | 翻译已开放的运行状态、快捷键、模式、提示、`/config` 标签、命令与工具描述。 |
| `timestamp-mod/` | 用户消息时间、工具耗时与 Token、每段回答 TPS。 |
| `user-prompt-frame/` | 用户消息边框，按终端显示宽度处理中英混排。 |
| `todo-panel/` | 监听成功的 Task 工具结果并渲染进度 Pane。 |
| `notification-mod/` | 主会话完成/失败时 `$.ui.notify`；不判断窗口焦点。 |
| `project-files/` | 在 session cwd 内浏览文件，预览文本/Markdown/代码/diff/PNG。 |
| `tool-output/` | `off` / `fold` / `flat` 三种模式改变工具结果与工具组显示。 |

## 原生能力速查

工具结果折叠不是“只有 Mod 才能做”的能力，但原生**没有专门的持久化折叠配置**：

- `verbose`（`settings.json` / `/config verbose=true` / `--verbose`）：显示完整工具输出而非截断摘要。
- `viewMode`：会话启动视图，`default` / `verbose` / `focus`；与 `verbose` 同时设置时优先。
- `ctrl+o`：运行时展开/收起详细输出。
- 没有类似 `collapseToolResults` / `toolOutput` 的原生 settings 键；默认折叠与按组展开属于原生渲染行为。
- `tool-output` 的 `fold` 是在原生行为之上，按“行数或字符阈值”折叠**单个长结果**；`flat` 则强制展开工具组。原生 `verbose` / `ctrl+o` 始终优先。

## 待办

每项写明位置与原因；`file:line` 为当前代码的实际位置，改动后同步更新。

### i18n-mod

- [ ] 补词典：在终端执行 `/i18n samples` 获取未翻译样本，人工筛选后补入 `locales/zh-CN.json` 的 `notices` / `messages` / `hints` / `modes` / `tools`。
      采集只在内存（`hooks/samples.ts`），重启即失；上限 200 条、单条 500 字符，属有意设计，不要改成自动落盘。
      先补 `/i18n samples copy`：用 `$.ui.copy({ text })`（省略 `surface` 时取 `$.session.surfaces()` 的第一个）把样本送到剪贴板，避免手工复制终端输出。
- [ ] 核对 `CommandOutput`：确认哪些命令输出走 `ui.render`、哪些是原生全屏 UI，再决定是否补翻译；不要按事件名猜测。
- [ ] 用实际 2.1.307 的工具描述校验 `tools` 词典，避免升级后键名失配（失配只会静默不翻译，不会报错）。
- [ ] 插件 / Skill / 用户 / MCP 命令描述当前不翻译（`hooks/commands.ts` 中 `e.provider.plugin !== 'engine'`）。
      放开前需评估：这些描述由第三方维护，翻译表会随插件更新持续失效。
- [ ] 真实终端验收：`/help`、`/config`、`/status`、toast/notice、任务通知行。现有测试只覆盖 hook 契约，不覆盖宿主渲染。

### statusline-mod

- [ ] `normalizeConfig` 会把新增模块强制排到末尾：面板里把 `turn_step` / `turn_reason` / `tool_count` 拖到前面，重新加载后被复位。
      位置 `hooks/register.ts:273-277`；`cc-mods-config/hooks/register.ts:141` 有同一份逻辑，需一起改。
      去掉该分段的依据：`DEFAULT_ORDER` 已把三个新模块放在末尾，旧配置的补齐逻辑（`register.ts:258-270`）足够。
- [ ] 8 个测试失败：跨平台路径断言（`/test-home` vs `D:\test-home`），与本机平台相关，非逻辑缺陷。

### cc-mods-config

- [ ] 8 个测试失败：同上，路径断言未做平台归一化。
- [ ] 若调整 statusline 的 `order` 归一化，本插件的 `normalizeConfig` 副本需同步，避免面板显示与实际生效顺序不一致。

### notification-mod

- [ ] 内存中的 `notifiedTurnIds` 无上限：仅在落盘时裁剪到 200（`hooks/register.ts:16,27`），长会话持续增长。
      修法：`add` 后按插入顺序裁剪内存 Set（保留最近 200）。
- [ ] 无前台/焦点判断：终端已在前台时仍发系统通知。当前 API 未暴露窗口焦点，需先确认宿主能力，不要伪造检测。

### todo-panel

- [ ] 收敛 `any`：`renderPanel($, e: any, ...)` 等，建议从 `claude-code` 取渲染事件类型。

### project-files

- [ ] 预览已支持 Markdown / Code / diff / PNG（terminal），并修复 root canonicalize、fatal UTF-8 解码与异步导航竞态。
      仍需真实终端验收 `Image` 在 iTerm2 3.5+ 的缩放与窄面板表现。

### subagent-split-view

- [ ] 真实终端验收 `$.ui.view({ agentId })` 的返回路径、`deny` 提示，以及「返回主会话」在多 Agent 切换后的状态一致性。
- [ ] `renderPanel($, e: any)` 仍使用 `any`，待渲染事件类型稳定后收敛。

### tool-output

- [ ] 真实终端验收 `fold` 的展开/收起与原生 `ctrl+o` 的优先级，`flat` 在嵌套工具组下的表现。
- [ ] `foldAfterLines` 只按行数判断，长单行结果依赖 2000 字符兜底；如需按工具类型区分阈值，先收集实际样本。

## 已确认不可做（不要再尝试）

- `/config` 子选项取值：`config.describe` 只允许改写 `label` / `description` / `isHidden`，没有 `options` / `value` 通道。
- `/status`、`/usage`、`/stats` 与命令执行面板：原生全屏本地渲染，`RenderComponent` 中没有对应渲染点。
- `config.list`：是插件 API 调用（`$.config.list()`），不是原生 `/config` 菜单的渲染来源；改它只会破坏调用方。

## 新 Mod 候选

| 候选 | 价值 | 依赖 API | 风险 |
| --- | --- | --- | --- |
| `prompt-library`：`#` 触发的提示词片段补全，片段存 `~/.claude/prompts` | 高，日常高频 | `prompt.autocomplete`（`token: /^#/`）、`prompt.edit`、`PromptDecoration.virtualText`、`$.fs` | 低 |
| `session-recap`：会话摘要 Pane，按回合生成要点 | 中高，长会话找回上下文 | `$.session.turns/messages`、`$.model.fork`（复用主会话缓存前缀，比 complete 便宜）、`$.ui.open` | 中：模型调用有成本 |
| `guard`：Bash 危险命令前置拦截/确认 | 高 | `tool.check` 返回 `{ decision: 'ask', reason }`（2.1.304 起为真人审批）、`prompt.mention`、`.catch` fail-closed | 中：需真实终端验收审批交互 |
| `agent-pack`：内置常用 subagent 类型 | 中 | `agent.register` / `agent.offer` | 低 |
| `tool-usage`：工具耗时/失败率统计 Pane | 中 | `tool.call`、`$.ui.open` | 低，但与 timestamp-mod 有重叠 |
| `tts`：朗读回答 | 低 | `$.audio.speak` | 平台支持与打断体验未知 |

不建议的方向：

- 用 `prompt.compose` 常驻注入项目约定：与 `CLAUDE.md` 重叠，且 `session` 段落在每次请求都会付 token。
- 用 `model.complete` 自动改路由（按任务切模型）：模型切换没有稳定的公开通道，先验证 `config.set` 对 `model` 的实际效果再立项。
