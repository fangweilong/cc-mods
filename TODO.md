# TODO

按 Mod 归类。每项写明位置与原因；`file:line` 为当前代码的实际位置，改动后请同步更新。

## i18n-mod

- [ ] 补词典：在终端执行 `/i18n samples` 获取未翻译样本，人工筛选后补入 `locales/zh-CN.json` 的 `notices` / `messages` / `hints` / `modes` / `tools`。
      采集只在内存（`hooks/samples.ts`），重启即失；上限 200 条、单条 500 字符，属有意设计，不要改成自动落盘。
      先补 `/i18n samples copy`：用 `$.ui.copy({ text })`（省略 `surface` 时取 `$.session.surfaces()` 的第一个）把样本送到剪贴板，避免手工复制终端输出。
- [ ] 核对 `CommandOutput`：确认哪些命令输出走 `ui.render`、哪些是原生全屏 UI，再决定是否补翻译；不要按事件名猜测。
- [ ] 用实际 2.1.307 的工具描述校验 `tools` 词典，避免升级后键名失配（失配只会静默不翻译，不会报错）。
- [ ] 插件 / Skill / 用户 / MCP 命令描述当前不翻译（`hooks/commands.ts` 中 `e.provider.plugin !== 'engine'`）。
      放开前需评估：这些描述由第三方维护，翻译表会随插件更新持续失效。
- [ ] 真实终端验收：`/help`、`/config`、`/status`、toast/notice、任务通知行。现有测试只覆盖 hook 契约，不覆盖宿主渲染。

### 已确认不可做（不要再尝试）

- `/config` 子选项取值：`config.describe` 只允许改写 `label` / `description` / `isHidden`，没有 `options` / `value` 通道。
- `/status`、`/usage`、`/stats` 与命令执行面板：原生全屏本地渲染，`RenderComponent` 中没有对应渲染点。
- `config.list`：是插件 API 调用（`$.config.list()`），不是原生 `/config` 菜单的渲染来源；改它只会破坏调用方。

## statusline-mod

- [ ] `normalizeConfig` 会把新增模块强制排到末尾：面板里把 `turn_step` / `turn_reason` / `tool_count` 拖到前面，重新加载后被复位。
      位置 `hooks/register.ts:273-277`；`cc-mods-config/hooks/register.ts:141` 有同一份逻辑，需一起改。
      去掉该分段的依据：`DEFAULT_ORDER` 已把三个新模块放在末尾，旧配置的补齐逻辑（`register.ts:258-270`）足够。
- [ ] 8 个测试失败：跨平台路径断言（`/test-home` vs `D:\test-home`），与本机平台相关，非逻辑缺陷。

## cc-mods-config

- [ ] 8 个测试失败：同上，路径断言未做平台归一化。
- [ ] 若调整 statusline 的 `order` 归一化，本插件的 `normalizeConfig` 副本需同步，避免面板显示与实际生效顺序不一致。

## notification-mod

- [ ] 内存中的 `notifiedTurnIds` 无上限：仅在落盘时裁剪到 200（`hooks/register.ts:16,27`），长会话持续增长。
      修法：`add` 后按插入顺序裁剪内存 Set（保留最近 200）。
- [ ] 无前台/焦点判断：终端已在前台时仍发系统通知。当前 API 未暴露窗口焦点，需先确认宿主能力，不要伪造检测。

## todo-panel

- [ ] 收敛 `any`：`renderPanel($, e: any, ...)` 等，建议从 `claude-code` 取渲染事件类型。

## project-files

- [ ] `state.root` 直接取 `$.session.cwd()`（`hooks/register.ts:201`），未 canonicalize；而 `resolvedPath` 用 `stat.realPath` 比对（`hooks/register.ts:75`）。
      symlink / junction / 8.3 短路径下可能整目录被误判为越界。修法：启动时用 `$.fs.stat(cwd, { resolve: true }).realPath` 作为 root。
- [ ] `decodeText` 以含 `U+FFFD` 判定二进制（`hooks/register.ts:56-70`），合法包含替换字符的文本会被当作二进制。
      修法：改用 `TextDecoder('utf-8', { fatal: true })`，由解码异常判定非法序列。
- [ ] 异步导航竞态：`load` / `previewFile` 在 `await` 后用闭包中的旧 `state` 覆盖（`hooks/register.ts:98-130`），快速切换目录时可能回退到旧路径。
      修法：每次导航递增序号，回写前比对。

## 新 Mod 候选

| 候选 | 价值 | 依赖 API | 风险 |
| --- | --- | --- | --- |
| `prompt-library`：`#` 触发的提示词片段补全，片段存 `~/.claude/prompts` | 高，日常高频 | `prompt.autocomplete`（`token: /^#/`）、`$.fs` | 低 |
| `session-recap`：会话摘要 Pane，按回合生成要点 | 中高，长会话找回上下文 | `$.session.turns/messages`、`$.model.complete`、`$.ui.open` | 中：模型调用有成本 |
| `guard`：Bash 危险命令前置拦截/确认 | 高 | `tool.call` 返回 `{ deny }` 或 `next({ ...e, ... })` | 中：误拦会阻断正常工作 |
| `agent-pack`：内置常用 subagent 类型 | 中 | `agent.register` / `agent.offer` | 低 |
| `tool-usage`：工具耗时/失败率统计 Pane | 中 | `tool.call`、`$.ui.open` | 低，但与 timestamp-mod 有重叠 |
| `tts`：朗读回答 | 低 | `$.audio.speak` | 平台支持与打断体验未知 |

不建议的方向：

- 用 `prompt.compose` 常驻注入项目约定：与 `CLAUDE.md` 重叠，且 `session` 段落在每次请求都会付 token。
- 用 `model.complete` 自动改路由（按任务切模型）：模型切换没有稳定的公开通道，先验证 `config.set` 对 `model` 的实际效果再立项。
