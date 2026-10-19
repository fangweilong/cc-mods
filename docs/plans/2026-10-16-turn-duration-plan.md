# 自定义 TurnDuration 实施计划

- 日期：2026-10-16
- 状态：任务 0–6 已完成；任务 7 文档已完成，按阻塞记录退出，真实终端验收待用户运行（2026-10-19）。不宣称真实终端或原生全状态验收通过。
- 设计依据：[2026-10-16-turn-duration-design.md](./2026-10-16-turn-duration-design.md)

## 1. 实施范围

在 `i18n-mod` 内新增一个明确选择启用的自定义耗时组件，复用现有语言包和配置面板。第一版只展示公开渲染输入中的耗时，不推断所有后台任务已完成，不显示没有可靠来源的结束时间和统计。

第一版目标输出：

```text
✻ 本轮用时 12m 38s
```

第一版正式配置：

| 键 | 默认值 | 值域 |
| --- | --- | --- |
| `i18n-mod.turnDurationMode` | `native` | `native` / `custom` |
| `i18n-mod.turnDurationVisible` | `true` | boolean |
| `i18n-mod.turnDurationSpacing` | `compact` | `compact` / `separated` |

第一版正式文案键：`turnDuration.elapsed`，仅支持 `{duration}` 占位符。

## 2. 执行规则

- 不修改、替换或重新签名可执行文件。
- 不修改启动器、用户现有启动配置或安装位置。
- 不修改原始会话消息、工具行为和模型输入。
- 保留工作区中现有、与本功能无关的修改，尤其是 PromptHint 的交互保护和词典逻辑。
- 按“先写失败测试，再实现，再验证”的顺序推进。
- 不提前实现没有数据来源的后台等待、预算或完成时间。
- 本计划不授权提交或推送；提交需用户另外要求。

## 3. 已有调查结论

本次规划已核实公开 API：

- `TurnDuration` 仅在 terminal 提供 `word`、`durationMs`、只读 `onScreen`。
- `requestId` 的公开契约没有保证它等于消息 UUID 或 `turnId`。
- `turn.complete` 有回合耗时和 `turnId`，没有原生结束 timestamp 或 duration 消息 UUID。
- 会话消息读取没有提供原生 footer 的预算、隐藏消息数等完整元数据。
- `agent.list` 不等于原生完整后台任务队列。
- 未证明能够通过可见配置行读取原生 `showTurnDuration`。

因此，第一版不需要新增回合事件订阅或任务列表查询。以上缺口不能在实现时用“最新一条记录”“当前时间”或“Agent 总数”替代。

## 4. 任务 0：确认范围与建立基线

涉及文件：不改实现，只核对设计与当前工作区。

- [x] 确认采用内部模块方案，不新增独立插件。
- [x] 确认第一版是“自定义耗时行”，不是“无损复刻原生全部功能”。
- [x] 确认默认原生、手动启用自定义，以及独立可见性和显式间距的行为。
- [x] 确认第一版不显示 `done` 对应的结束时间，后续能力按设计文档准入。
- [x] 运行现有 i18n 与统一配置面板测试，记录基线；已于 2026-10-19 重跑，未沿用旧结果。
- [x] 保存或检查当前 diff，区分已有修改与后续本功能修改。

验证：

```sh
claude plugin test ./i18n-mod
claude plugin test ./cc-mods-config
git status --short
```

退出条件：功能边界无歧义，基线结果已记录。已有失败须先说明，不归因于本功能。

执行记录（2026-10-19，仅任务 0）：

- 范围核对：复用 `i18n-mod` 内部模块，默认原生、手动切换自定义；自定义使用独立显隐和 0 / 1 顶部间距，English 仍透传原生。第一版仅展示公开耗时，不显示结束时刻或推断后台任务全部完成。
- 重跑 `claude plugin test ./i18n-mod`：124 通过、0 失败，3 个测试文件，退出码 0。
- 重跑 `claude plugin test ./cc-mods-config`：40 通过、0 失败，1 个测试文件，退出码 0。两套基线均无已有失败。
- 已审阅既有 7 个 tracked 文件改动（275 行新增、77 行删除），包括 PromptHint 交互保护、词典逻辑及 TurnDuration 原生透传；另有 2 份未跟踪设计/计划文件。基线快照：`/tmp/cc-mods-turn-duration-task0-n1p4tcgr`，含 tracked 工作区/暂存区/HEAD diff、状态、分支与 HEAD、9 份文件副本及 SHA256、测试完整日志和退出码。
- 本机 2.1.302 公开类型中的 `TurnDuration` 仍仅提供 `word`、`durationMs`、只读 `onScreen`，设计的数据边界未变。后续实现仍须按公开 API 及先失败测试顺序推进；真实终端零占位、滚动及重绘尚未验收。
- 本任务仅更新本计划记录，未修改实现、宿主、启动器、安装位置或持久启动配置，未提交或推送；任务 1–7 未执行。

## 5. 任务 1：添加类型、语言包 schema 与兼容测试

涉及文件：

- 修改 `i18n-mod/types/index.d.ts`。
- 修改 `i18n-mod/hooks/language.ts`。
- 修改 `i18n-mod/tests/language.test.ts`。
- 按需扩展 `i18n-mod/tests/fixtures.ts`。

步骤：

- [x] 先添加语言包解析测试：新的 `turnDuration.elapsed` 可加载，旧语言包仍可加载。
- [x] 定义文案与配置类型，以及需要由宿主保存、订阅的 `PluginState` 字段。
- [x] 将 `turnDuration` 加入语言包字段白名单，只接受第一版已实现的 `elapsed`。
- [x] 检查模板类型、安全控制字符、必需 `{duration}` 与未知占位符。
- [x] 明确空模板处理：不满足有效模板条件时不得进入自绘；schema 校验规则与渲染条件保持一致。
- [x] 保留旧 `completed`、`duration` 字段现有加载校验，但不把它们隐式映射到新组件。
- [x] 不给尚未支持的 `doneAt`、预算或后台模板预留可写的正式 schema 键。

退出条件：新旧语言包兼容；无效输入被拒绝且错误不泄露文件内容。

执行记录（2026-10-19）：

- 先新增 40 项解析/兼容测试，红灯为 126 通过、38 失败；失败原因是旧解析器拒绝 `turnDuration` 字段。日志：`/tmp/cc-mods-turn-duration-task1-red.log`。
- 实现后 `claude plugin test ./i18n-mod` 为 164 通过、0 失败；日志：`/tmp/cc-mods-turn-duration-task1-green.log`。`claude plugin validate ./i18n-mod`、`tsc --noEmit -p ./i18n-mod`、`git diff --check` 均通过。validate 仅有既存 marketplace 安装文案建议。
- 契约：`turnDuration` 和 `elapsed` 均可省略；空对象允许加载，保留缺失模板以供后续整行原生回退。显式空串、纯空白、非字符串和不含 `{duration}` 的模板均拒绝；仅允许该占位符（可重复），拒绝其他或残缺花括号及既有安全规则禁止的控制字符。错误不包含模板值或未知模板键名。
- 旧 `completed` / `duration` 校验不变，不映射新模板；未加入中文生产模板、配置声明、配置处理或渲染逻辑。后续渲染也必须拒绝空模板，缺失模板整行原生回退。
- 后续类型：`TurnDurationMode`、`TurnDurationSpacing`、`TurnDurationConfig`（`mode` / `visible` / `spacing`）、`TurnDurationMessages`；宿主状态键为 `i18n-mod.turnDuration`，文案为 `LanguagePack.turnDuration?.elapsed`。
- 公共 API 按本次 skill 提供的 2.1.302 类型核验，仅使用现有 declaration merging；未复制宿主类型入仓库，未执行任务 2 及以后内容。

## 6. 任务 2：实现纯逻辑与格式化测试

涉及文件：

- 新增 `i18n-mod/hooks/turn-duration.ts`。
- 新增 `i18n-mod/tests/turn-duration.test.ts`。

步骤：

- [x] 先测试配置默认值、合法值域与规范化结果。
- [x] 测试有效非负耗时按秒向下取整，至少覆盖 0、不到一秒、秒、分钟、小时和天。
- [x] 测试 59 秒到 1 分钟、59 分钟到 1 小时、23 小时到 1 天的边界。
- [x] 明确并测试紧凑格式；至少满足 `64000 → 1m 4s`、`758000 → 12m 38s`。
- [x] 对负值、NaN、Infinity 返回明确的“不可自绘”结果，不伪装为 0 秒。
- [x] 生成视图模型时只使用耗时、模板、可见性和间距；不根据 `word` 判断后台状态。
- [x] 构造合法的全宽、两列符号区、淡色正文渲染树。
- [x] 隐藏分支构造合法零内容树，不引入额外 Text、边框、margin 或原生 engine 节点。
- [x] 所有方法保持纯函数；不在该模块中调用 `$`、文件系统、时钟或进程。

退出条件：纯函数行为由测试锁定，没有数据源不明的依赖。

执行记录（2026-10-19，仅任务 2）：

- 先新增测试文件，再运行红灯：既有 164 项通过、新文件 1 项加载失败，明确因 `../hooks/turn-duration` 尚不存在而退出 1；没有将导入失败冒充逐项断言失败。日志：`/tmp/cc-mods-turn-duration-task2-red.log`。
- 新增纯模块后全套 i18n 测试为 263 通过、0 失败，4 个测试文件，含本任务新增 99 项。日志：`/tmp/cc-mods-turn-duration-task2-green.log`。覆盖全部 8 种合法配置组合、按字段独立回退且不强制类型转换、秒/分/时/天边界及小数毫秒、非法耗时、模板/schema 一致性、原生/隐藏优先级与两种间距。
- 紧凑格式明确为按秒向下取整、按 d/h/m/s 排列并省略零值单位；总计不足一秒为 `0s`，整分钟/小时/天为 `1m` / `1h` / `1d`；`64000 → 1m 4s`、`758000 → 12m 38s`。负值与非有限数返回 `undefined`，视图模型明确回退原生。
- 树使用本次 skill 的 2.1.302 公开 plain-data `RenderElement` 契约，测试通过 `$.ui.mount` 验证两种间距的自定义树与隐藏树被宿主接受。自定义树为 `width: '100%'`，符号区 `width/minWidth: 2` 且 `flexShrink: 0`，正文 `dimColor: true`，顶部间距仅 0/1；隐藏树仅 `{ type: 'Box', children: [] }`，无文字、间距、边框或 engine 节点。这里只验证宿主树契约，真实终端零占位、窄屏换行与滚动仍留任务 7。
- `claude plugin validate ./i18n-mod`、`tsc --noEmit -p ./i18n-mod`、`git diff --check` 均退出 0；validate 仅有既存 marketplace 安装文案建议。校验日志分别为 `/tmp/cc-mods-turn-duration-task2-validate.log`、`/tmp/cc-mods-turn-duration-task2-tsc.log`。
- 后续导出 API：`normalizeTurnDurationConfig(options = {})` 接收原始 `turnDurationMode` / `turnDurationVisible` / `turnDurationSpacing` 键并返回 `TurnDurationConfig`；`formatTurnDuration(durationMs)` 返回字符串或 `undefined`；`createTurnDurationViewModel(durationMs, template, config)` 返回导出的 `TurnDurationViewModel`（`native` 带明确 reason、`hidden`、`custom` 带 text/marginTop）；`renderTurnDuration(model)` 对 native 返回 `undefined`（调用方须 `next(e)`），其余返回合法树。English 原文透传、状态订阅、配置保存及所有 `$` I/O 留注册模块任务 3/4，纯模块不调用 `$`、fs、时钟、进程或依赖 `word`。
- 本任务只新增上述两个文件并更新本计划；保留既有未提交修改，未创建 dev-mods 副本，未修改宿主、启动器、安装或永久配置，未提交或推送；任务 3–7 未执行。

## 7. 任务 3：接入配置与可订阅状态

涉及文件：

- 修改 `i18n-mod/.claude-plugin/plugin.json`。
- 修改 `i18n-mod/hooks/register.ts`。
- 修改 `i18n-mod/types/index.d.ts`。
- 修改 `i18n-mod/tests/register.test.ts`。

步骤：

- [x] 在 manifest 中声明三个配置项；使用宿主实际支持的 userConfig 结构，不凭空新增 schema 语法。
- [x] 启动时从 options 初始化规范化配置，并写入本插件声明的状态。
- [x] 为相应 `config.set` 增加校验和成功后应用逻辑。
- [x] 仅在下游保存成功后应用宿主返回的最终值；被拒绝时保持当前显示状态。
- [x] 读取配置状态形成渲染订阅，避免依靠模块变量跨热重载存活。
- [x] 保持现有语言保存、重新加载及 `pendingSelection` 行为不变。
- [x] 验证语言配置与组件配置互不误拦截。

退出条件：配置保存、拒绝、宿主改写返回值、热重载均有回归测试。

执行记录（2026-10-19，仅任务 3）：

- 加载 `plugin-authoring`，按本次 2.1.302 公开 reference/types 核实 `userConfig` 的 `string` + `options` 选择项、`boolean` 开关及 `default`；`config.set` 的下游结果是 `{ value }` 或 `{ deny }`。未使用 `enum` 等未证实的 manifest 语法。
- 先写配置回归测试并运行红灯，再实现。测试搭建期间修正了测试 Engine 不公开 state noun、其他插件不能直接写 owner state、state 操作 hook 返回值有外层 `value` 等 fixture 契约问题。修正 fixture 后另作对照红灯复验：临时禁用任务 3 的初始化、配置应用和订阅读取，315 项中 270 通过、45 断言失败，无 fixture 加载/权限错误；日志 `/tmp/cc-mods-turn-duration-task3-red-confirmed.log`。这是对照复验，不冒充实现前首次运行。已恢复所有被临时禁用的实现。
- 最终 `claude plugin test ./i18n-mod` 为 316 通过、0 失败（原 263 项 + 本任务新增 53 项，4 个文件），日志 `/tmp/cc-mods-turn-duration-task3-green.log`；`claude plugin test ./cc-mods-config` 为 40 通过、0 失败，日志 `/tmp/cc-mods-turn-duration-task3-config.log`。
- 覆盖默认值、8 种合法 options 组合、未列出的存储选项回退、保留 state 的启动重建、语言加载失败不阻挡组件初始化、全 6 个合法配置值、3 键保存前不应用/宿主拒绝/宿主最终值改写、20 种严格非法输入、语言保存与 reload/候选拒绝互不影响、无关配置透传、状态订阅触发重绘、下游异常不提前写 state；另用直接重新调用 register 的生命周期 fixture 验证不同 options 的新 activation 重建同一宿主状态。这些不是用户真实会话的热重载验收。
- 配置键仍是 `i18n-mod.turnDurationMode` / `turnDurationVisible` / `turnDurationSpacing`，默认 `native` / `true` / `compact`。复用任务 1 已声明的 `TurnDurationConfig` 和 `PluginState['i18n-mod'].turnDuration`，不重复新增类型；内部字面量 ref 是 `turnDurationRef = { plugin: 'i18n-mod', key: 'turnDuration' }`，内部读取 helper 为 `currentTurnDuration($)`，均不导出，符合宿主 ref 只能用于 state 调用的扫描约束。没有模块变量存配置。
- 启动和新 activation 从宿主 options 规范化写 state；配置 hook 只匹配三个精确键，严格验证后原样 `next(e)`，成功后才读取当前 state、以宿主最终 `saved.value` 替换相关字段并规范化。拒绝不写 state，下游异常不提前写 state；现有语言 hook、命令保存、reload 和 `pendingSelection` 未改变。
- 本任务按分工先在现有 UI hook 内读该 state 建立订阅，但不改变绘制内容；任务 4 接入时应把读取移到 `TurnDuration` 对应分支，并相应将订阅测试迁到耗时组件。`TurnDuration` 仍不在 matcher 中，没有接入自定义渲染或中文生产模板。
- `claude plugin validate ./i18n-mod`、`tsc --noEmit -p ./i18n-mod`、`git diff --check` 均通过；日志 `/tmp/cc-mods-turn-duration-task3-validate.log`、`/tmp/cc-mods-turn-duration-task3-tsc.log`。validate 确认 `selection` / `turnDuration` 的声明及读写，只有既存 marketplace 安装文案建议。
- 本任务仅修改 manifest、register、register 测试及本计划；复用已有 types，保留 PromptHint/source/translate/README 等既有未提交改动。未创建 dev-mods 副本，未修改宿主、启动器、安装或永久配置，未提交或推送；任务 4–7 未执行。

## 8. 任务 4：接入 TurnDuration 渲染决策

涉及文件：

- 修改 `i18n-mod/hooks/register.ts`。
- 修改 `i18n-mod/tests/register.test.ts`。

先为下列行为写测试，再把 `TurnDuration` 加回渲染 matcher：

- [x] 默认 `native`：仍以原事件调用 `next(e)`，现有原生输出透传 fixture 继续通过。
- [x] English 原文模式：不论组件自定义配置如何，继续遵循原文透传契约。
- [x] 自定义且隐藏：不调用 `next(e)`，没有可见前缀、正文或额外间距。
- [x] 自定义且模板有效：输出 `✻ 本轮用时 …`，不追加原生行。
- [x] 自定义但缺少有效模板：完整回退原生，不拼接半句英文。
- [x] 非法耗时：完整回退原生，不显示伪造数字。
- [x] 未知 `word`：自定义仍使用中性耗时模板，不依赖旧词表。
- [x] `onScreen` 缺失、null 或有可见范围：不改写、不将其当作可见性配置。
- [x] compact / separated：分别使用 0 / 1 顶部间距。
- [x] 不输出没有可靠数据来源的结束时间、预算、等待文案或“全部完成”。

实现要求：所有 `$` 调用保留在注册模块中；不对原生 engine 引用进行不受支持的内部遍历。

退出条件：原生与自定义两条路径都能被明确验证，切换后不重复显示。

执行记录（2026-10-19，仅任务 4）：

- 先读 design/plan 并加载 `plugin-authoring`，按本次 2.1.302 公开类型复核：`TurnDuration` 仅 terminal 的 `word` / `durationMs` / 只读 `onScreen`，`next(e)` 返回 `RenderElement`，渲染期间 `$.state.get` 仅为当前实例建立订阅。未复制宿主类型、依赖私有状态或遍历原生 engine 引用。
- 先新增 47 项测试并将任务 3 的订阅测试从 PromptHint 迁至 TurnDuration，再运行实现前红灯：325 通过、38 断言失败，4 个文件，退出 1；失败为缺失自绘/隐藏/原生回退分支、English 提前读取组件配置、耗时组件未订阅和其他 UI 误订阅，不是 fixture 加载或权限错误。日志 `/tmp/cc-mods-turn-duration-task4-red.log`。
- 接入后 i18n 全套为 363 通过、0 失败（原 316 项 + 新增 47 项，4 个文件），日志 `/tmp/cc-mods-turn-duration-task4-green.log`；统一配置面板回归为 40 通过、0 失败，日志 `/tmp/cc-mods-turn-duration-task4-config.log`。
- 决策顺序：先读取当前语言并优先判断 `pack.preserveOriginal`，English 不读取组件配置而原样 `next(e)`；仅 TurnDuration 分支读取 `currentTurnDuration($)`，交给已有纯模块依次决定 native 原样透传、自定义隐藏返回空 Box、模板/耗时无效整行透传、自定义有效整行接管。`renderTurnDuration` 返回 `undefined` 时明确原样 `next(e)`，不追加 engine 节点，也不以 `onScreen` 或 `word` 推断状态。
- 覆盖 English 全 8 种配置组合、两种间距下有效/缺失模板的隐藏优先级、已知/未知 word × 3 类 onScreen × 2 类间距的精确自绘树、缺失命名空间/elapsed 的整行回退，以及 NaN/Infinity/负数、空白/无效模板的原事件身份透传。直接调用注册 hook 的冻结输入用于验证事件对象身份及非有限数，不用 JSON 序列化替代此断言。树精确断言及下游调用计数排除重复原生行、结束时间、预算、等待与“全部完成”等无来源语义。
- 订阅回归验证：耗时 native 路径也订阅配置，保存后可在同一挂载实例间切换 native → custom → separated → hidden → native；PromptHint、Spinner、SessionMode、ToolProgress、InfoNotice 均不再读取/订阅耗时配置。未改语言保存、`pendingSelection`、reload 或 PromptHint 交互保护。
- `claude plugin validate ./i18n-mod`、`tsc --noEmit -p ./i18n-mod`、`git diff --check` 均通过；日志 `/tmp/cc-mods-turn-duration-task4-validate.log`、`/tmp/cc-mods-turn-duration-task4-tsc.log`。validate 仅有既存 marketplace 安装文案建议；首次 tsc 指出新测试直接访问 RenderElement 联合的 props，已用 Box 类型收窄修正并通过重检。
- 本任务仅修改 register、register 测试及本计划，测试内使用专用模板 fixture；未改生产中文 locale 或公共 fixtures，任务 5 的语言切换/reload 专项、任务 6 面板入口和任务 7 真实终端验收尚未执行。空 Box 的真实终端零占位、宽度变化/窄屏换行、滚动离屏后重绘、真实热重载与原生全状态仍未验收，不把挂载 fixture 等同终端验收。
- 保留已有未提交修改；未创建 dev-mods 副本，未修改宿主、启动器、安装或永久配置，未提交或推送。

## 9. 任务 5：加入中文文案与语言切换回归

涉及文件：

- 修改 `i18n-mod/locales/zh-CN.json`。
- 修改 `i18n-mod/tests/fixtures.ts`。
- 修改 `i18n-mod/tests/register.test.ts`。
- 按需修改 `i18n-mod/tests/translate.test.ts`。

步骤：

- [x] 内置中文包加入 `turnDuration.elapsed: 本轮用时 {duration}`。
- [x] 添加另一种语言的最小 fixture，证明组件不把中文硬编码到渲染函数中。
- [x] 覆盖中文切 English、再切回中文。
- [x] 覆盖重新加载修改后的模板。
- [x] 覆盖无模板语言包的整行回退。
- [x] 断言语言文件不在重绘时重复读取。
- [x] 不将统一配置面板原有 en/zh 设置当作耗时行的第二份语言选择。

退出条件：当前 i18n 配置是唯一语言来源；模板热更新行为稳定。

执行记录（2026-10-19，仅任务 5）：

- 先读 design/plan 并加载 `plugin-authoring`，复核公开测试 API：挂载组件、状态订阅重绘、options 和宿主 fixture 行为；直接在仓库工作，不建立 dev-mods 副本。
- 先新增 13 项语言生命周期测试，测试 fixture 暂不提供耗时模板；实现前红灯为 363 通过、13 断言失败，4 个文件，退出 1。失败均为预期中文/日文耗时行缺失，不是导入、fixture 加载或权限错误；日志 `/tmp/cc-mods-turn-duration-task5-red.log`。另对正式中文 JSON 作独立资产断言，确认尚缺 `turnDuration.elapsed`，退出 1；日志 `/tmp/cc-mods-turn-duration-task5-asset-red.log`。
- 实现只添加生产中文模板和共享 fixture 文案，不修改 hooks 运行逻辑：中文为 `本轮用时 {duration}`；日文最小 fixture 仅含 id/name 和 `turnDuration.elapsed: このターンの所要時間 {duration}`。旧 `ZH_DATA` / `JA_DATA` 保持无新模板以继续覆盖旧包兼容，任务 4 的专用模板改为复用共享中文 fixture；未新增静态语言注册表或第二份语言配置。
- `claude plugin test ./i18n-mod` 绿灯为 376 通过、0 失败，4 个文件（原 363 项 + 新增 13 项）；日志 `/tmp/cc-mods-turn-duration-task5-green.log`。独立正式 JSON 资产断言也通过，日志 `/tmp/cc-mods-turn-duration-task5-asset-green.log`。fixture 测试与生产文件断言分别验证，未把模拟文件读取当成实际生产文件加载验收。
- 覆盖同一挂载实例分别通过 `/i18n` 和 `config.set` 进行中文 → English → 中文；日文语言代码/外部 JSON 路径两种来源；修改文件在 reload 前不生效，reload 后原实例更新；移除模板整行原生回退、恢复模板后重新自绘；旧 completed/duration 不拼入新行；六次显式重绘仅使用当前缓存、无重复 fs.read/fs.list；只保存 `i18n-mod.language`，不读取面板独立 en/zh JSON。有效日文输出直接证明模板来自所选包而不是中文硬编码。
- 失败保护回归：无效 JSON/非法模板 reload 保留已显示行；命令/配置保存被宿主拒绝时保留语言及行，并在后续配置请求中重新校验候选文件（覆盖 pendingSelection 释放）；宿主成功保存返回改写来源时，命令/配置两条路径均显示最终来源的日文模板。没有改动现有命令、语言保存、pendingSelection 或失败状态实现，也无需额外修改 translate 测试。
- `claude plugin validate ./i18n-mod`、`tsc --noEmit -p ./i18n-mod` 均退出 0，日志 `/tmp/cc-mods-turn-duration-task5-validate.log`、`/tmp/cc-mods-turn-duration-task5-tsc.log`。`cc-mods-config` 回归为 40 通过、0 失败，validate/tsc 均退出 0，日志 `/tmp/cc-mods-turn-duration-task5-config.log`、`/tmp/cc-mods-turn-duration-task5-config-validate.log`、`/tmp/cc-mods-turn-duration-task5-config-tsc.log`。两插件 validate 仅有既存 marketplace 安装文案建议；`git diff --check` 通过。
- 本任务仅修改 `i18n-mod/locales/zh-CN.json`、`i18n-mod/tests/fixtures.ts`、`i18n-mod/tests/register.test.ts` 与本计划，保留既有 PromptHint/source/translate/README 等未提交改动。未实现任务 6 面板入口或任务 7 README/真实终端验收；真实零占位、窄屏换行、滚动、热重载与原生完整状态仍未验证。未修改宿主、启动器、安装或永久配置，未提交或推送。

## 10. 任务 6：接入统一配置面板

涉及文件：

- 修改 `cc-mods-config/hooks/register.ts`。
- 按需修改 `cc-mods-config/types/index.d.ts`。
- 修改现有相关配置与面板测试文件。

步骤：

- [x] 在现有“语言与时间”区域增加模式、可见性、间距三个入口。
- [x] 使用实际配置行和 `$.config.list/set`，不直接改写插件安装文件或其他 Mod 的配置 JSON。
- [x] 提示自定义模式的独立可见性和第一版缺少原生统计的边界。
- [x] 保留现有草稿/保存交互；保存前不把未确认值应用到插件。
- [x] 覆盖插件未加载、配置行缺失、宿主锁定、保存被拒绝的情况。
- [x] 多项保存若部分成功，面板必须明确反馈，不能伪装为一次原子保存，也不能吞掉剩余草稿。
- [x] 不破坏现有语言来源保存、重新加载按钮及状态栏/输入框配置保存流程。

退出条件：用户可以只通过现有面板启用、隐藏、调整间距并切回原生，无需手动编辑配置文件。

执行记录（2026-10-19，仅任务 6）：

- 先读 design/plan 并加载 `plugin-authoring`，核对本次 2.1.302 公开 `ConfigRow`、`$.config.list/set`：配置行含当前值、kind、provider、isLocked；set 返回最终 `{ value }` 或 `{ deny }`，不可见/不存在的键可拒绝。布尔行实际 kind 为 `boolean`（初次 tsc 指出错误的 `toggle` 字面量后已修正）；没有复制宿主 API 类型或修改永久配置。
- 先扩展现有配置 fixture 并新增 28 项测试，再改实现。实现前红灯为 41 通过、27 失败，1 个文件，退出 1；失败是缺少耗时行控件、提示或无法选择尚未实现的控件，不是测试文件导入/加载失败。日志 `/tmp/cc-mods-turn-duration-task6-red.log`。原有 40 项仍通过，另 1 项无插件/列表失败兼容测试在基线即通过。实现后再补充 3 项外部配置刷新和 2 项直接 Promise rejection 专项，合计新增 33 项。
- 面板“语言与时间”增加模式、可见性、间距三个 keyed Select；仅从实际加载的 `i18n-mod.turnDurationMode` / `turnDurationVisible` / `turnDurationSpacing` 行读取，保存使用宿主 set，值域分别为 `native/custom`、boolean、`compact/separated`。Select 的 true/false 字符串只用于 UI，保存转换为真正 boolean。缺失/不支持的行不伪造默认值，锁定行只读；其他行、语言来源和本地配置继续可用。
- 新增本插件声明的 `turnDurationDraft` atom，只保存草稿及错误；选择不调用宿主 set、不写文件。成功项单独清除，重绘从宿主行反映最终值；覆盖三字段宿主改写最终值（含 false）、关闭/重开、单独取消耗时草稿、外部修改刷新且不覆盖草稿。没有将耗时配置混入既有状态栏/输入框 JSON，没有新增第二份语言来源。
- 保存顺序保持语言来源优先，再逐项保存耗时配置，最后走既有状态栏/输入框文件保存。每个耗时项保存前重新查询真实行与策略锁；拒绝、缺失、未加载、list/set 异常时停止后续写入，保留失败项、未尝试项和本地草稿。已有成功项不回滚、不重复提交；明确显示部分成功、已保存键、失败键以及剩余草稿保留。覆盖语言成功后耗时中途失败、耗时全部成功后文件失败及重试；没有伪装原子事务。
- 新增中英文可见提示：自定义独立显隐，v1 没有原生结束时刻、后台等待和预算统计，完整原生行为可切回 native；English 原文始终原生，耗时语言沿用上方 i18n 来源。保留语言来源编辑、取消、reload 拦截与命令，以及状态栏/输入框/时间戳原有草稿保存流程；原有语言单一焦点控件测试改为按其 key 计数，以兼容同区域新增的三个独立控件。
- `claude plugin test ./cc-mods-config` 最终为 73 通过、0 失败，1 个文件，日志 `/tmp/cc-mods-turn-duration-task6-green.log`；`claude plugin test ./i18n-mod` 为 376 通过、0 失败，4 个文件，日志 `/tmp/cc-mods-turn-duration-task6-i18n.log`。面板覆盖 terminal/desktop × en/zh、所有六种合法字段值，以及失败重试和最终值。模拟宿主 hook 的 throw 会被测试引擎隔离，另用直接捕获的注册 hook 注入真实拒绝的 list/set Promise，验证部分保存后失败与剩余草稿保留，不把引擎隔离等同真实 API rejection。非交互错误 Text 的断言使用实际显示文本，而不是把 Text key 当成交互定位键。
- 两插件 `validate`、`tsc --noEmit -p` 及 `git diff --check` 均退出 0。日志 `/tmp/cc-mods-turn-duration-task6-config-validate.log`、`/tmp/cc-mods-turn-duration-task6-config-tsc.log`、`/tmp/cc-mods-turn-duration-task6-i18n-validate.log`、`/tmp/cc-mods-turn-duration-task6-i18n-tsc.log`；validate 仅有既存 marketplace 安装文案建议。
- 本任务只修改 `cc-mods-config/hooks/register.ts`、`cc-mods-config/types/index.d.ts`、`cc-mods-config/tests/config.test.ts` 与本计划，未改 i18n 实现或 README，保留既有未提交修改。没有委派/启动 Explore、创建 dev-mods 副本、修改宿主/启动器/安装/永久配置、提交或推送。任务 7 仍未执行：真实终端零占位、窄屏/宽度变化、滚动离屏重绘、真实热重载和原生后台等待/完整统计未验收；面板 fixture 通过不等同这些真实终端边界已通过。

## 11. 任务 7：真实终端验收与文档

涉及文件：

- 修改 `i18n-mod/README.md`。
- 修改根 `readme.md`。

真实终端验收前，加载项目适用的运行 skill，使用用户批准的运行方式；不擅自修改永久启动配置或重启用户会话。

- [ ] 验证默认仍是原生，不静默启用。
- [ ] 手动启用自定义中文，完成一次回合，观察实际耗时行。
- [ ] 切换显隐，确认屏内无残留符号和多余空白行。
- [ ] 分别验证两种间距。
- [ ] 缩窄窗口、改变宽度、滚动离屏再返回，观察换行和重绘。
- [ ] 重新加载语言包、热重载插件，确认状态不会丢失或重复显示。
- [ ] 启动后台任务时，自定义行不冒称“全部完成”；切回原生后恢复宿主自身的等待/统计输出。
- [x] 核对 README 区分原生模式与自定义模式，明确第一版不含原生全部统计。
- [x] 若无法进行真实终端验收，明确记录未验证项，不能只凭模拟 fixture 宣称零占位和滚动正确。

退出条件：真实运行结果与设计一致，或阻塞项已明确记录，不扩大完成声明。

执行记录（2026-10-19，仅任务 7；文档已完成，真实终端验收待用户运行）：

- 首先加载 `run`，按要求查找项目运行 skill：仓库没有 `.claude/skills` 或项目专用运行 skill；随后读取 TUI fallback 并加载 `plugin-authoring`。已识别仓库现有入口：直接 `claude --plugin-dir ./cc-mods-config --plugin-dir ./i18n-mod`，以及用户原先配置集合目录时的发现/重载方式；这里只识别，不执行新会话启动或改持久配置。本机 `claude`、`tsc`、`tmux` 命令可解析，但工具可用不等于存在获批的可安全驱动验收会话。
- 阻塞：本次未提供用户批准且可安全驱动的独立真实终端验收入口；主会话的命名 agent 启动两次返回 `Socket closed before reply`，并经 `SendMessage` 确认无可达的 `task6-panel`；这是工具故障记录，并非用户授权或确认，本次不重试、不委派、不启动 Explore。通用 tmux/TUI 模式不授权另建付费模型回合、驱动/重启用户正在工作的会话、修改持久配置或创建 dev-mods 副本，因此未启动验收会话、后台任务或模型调用，也未操作现有会话。任务按本节允许的“无法真实终端验收时记录”退出条件结束，不能写成真实运行通过。
- 真实终端已验：**无**。未验项全部保留未勾选：默认 native、中文 custom 实际回合、隐藏是否零占位、compact/separated、宽窄窗和换行、离屏滚动返回重绘、语言包 reload、插件真实热重载、后台任务期间不冒称全部完成，以及切回 native 后宿主等待/统计恢复。没有以 fixture、挂载树或 PTY 静态树替代真实原生全状态集成验收。
- 文档：更新 `i18n-mod/README.md` 和根 `readme.md`，说明默认 native、面板“语言与时间”的 custom/显隐/间距/切回 native、English 原文优先、唯一 i18n 语言来源、三个真实配置键/值域、`turnDuration.elapsed` 的可选 schema/缺失回退/无效模板拒绝及旧字段兼容，披露 v1 不提供结束时刻/后台/预算/原生隐藏等效，以及同位置 hook 链顺序与短路影响。保留原有 PromptHint 交互保护、翻译白名单与 InfoNotice 前缀说明；原生提示 5 类和可选自定义耗时 1 类分别计数，不恢复旧完成词表宣称。设计文档仅必要同步已过时的阶段/配置/schema 状态，保留原始设计与任务 0–6 历史记录。
- 修改前保存 20 份既有改动/未跟踪文件的副本、SHA256 和 tracked/staged diff，目录 `/tmp/cc-mods-turn-duration-task7-kjurjt_u`。对照快照确认仅上述 4 份授权文档变化，其余 16 份已有改动/未跟踪文件逐字节不变，暂存区 diff 不变，未增删仓库路径；原有 PromptHint/InfoNotice 说明段落及任务 0–6 历史记录原文保留（`10-preservation-check.log`，退出 0）。本任务不改实现/测试或未授权配置；未创建仓库新文件、模拟器、通用引擎或 dev-mods 副本，未发布 Artifact。未动宿主可执行文件、签名、启动器、安装位置或持久启动配置，未提交或推送。
- 最终重新执行第 12 节全部 7 条命令（未沿用任务 6 日志）：i18n test 为 **376 通过、0 失败，4 个文件，退出码 0**；config test 为 **73 通过、0 失败，1 个文件，退出码 0**；合计 449 项通过，未增加或修改测试。两插件 validate、两插件 `tsc --noEmit -p`、`git diff --check` 均退出 0。validate 各有一条既存 marketplace 安装文案建议（共 2 条 Advice，不改变通过判定），本任务不扩展安装文档范围。完整日志为上述目录下 `01-i18n-test.log` 至 `07-diff-check.log`，每项有同名 `.exit`，汇总 `validation-results.json`。
- 新增/未跟踪的 4 个文本文件另查空白：两份设计/计划、`i18n-mod/hooks/turn-duration.ts`、`i18n-mod/tests/turn-duration.test.ts` 均无行尾空格/tab、缩进 space-before-tab、缺失末尾换行或多余 EOF 空行，独立扫描 **4 文件、0 问题，退出 0**（`09-new-file-whitespace-scan.log` / `.exit`）。补充的 `git diff --no-index --check /dev/null <文件>` 四次均无空白诊断，原始退出码均为 1，表示 no-index 存在文件差异，不能误记成退出 0；初次聚合脚本因此退出 1，非第 12 节命令失败或空白缺陷，原始输出保存在 `08-untracked-whitespace.log` 和对应结果/退出码文件。运行入口调查另存 `run-entry-discovery.log`，不混入真实终端通过证据。

## 12. 自动化验证命令

在仓库根目录运行：

```sh
claude plugin test ./i18n-mod
claude plugin validate ./i18n-mod
tsc --noEmit -p ./i18n-mod

claude plugin test ./cc-mods-config
claude plugin validate ./cc-mods-config
tsc --noEmit -p ./cc-mods-config

git diff --check
```

校验与测试是不同验证层：插件 validate 通过，不代表真实终端显示正确；fixture 透传通过，不代表已经覆盖原生完整状态机。

## 13. 第一版完成标准

以下勾选按注明的证据层判断；涉及真实终端的项目未验证就不勾选，任务 7 文档完成不等于第一版真实验收全部完成。

- [x] 不修改可执行文件、签名、启动器或现有启动配置（仅仓库源码/文档及自动化验证）。
- [ ] 默认仍走原生；启用自定义后产生完整中文耗时句，无 `for` 或 `done` 混排（自动化已覆盖，真实终端待用户验收）。
- [x] 组件没有把回合耗时推断为后台任务全部完成（代码与中性文案/树回归证据；真实后台场景仍未验）。
- [ ] 配置可见性与显式间距生效，切回原生可以恢复宿主行为（fixture 已覆盖，真实零占位/间距及宿主状态恢复待验）。
- [x] 当前语言选择、语言包加载和配置面板集成通过自动化回归（不等同真实 reload/插件热重载验收）。
- [x] 没有使用猜测关联的 timestamp、预算或任务数（沿用任务 0–6 的实现边界）。
- [x] 所有新增与既有测试、类型检查及插件校验结果已报告（本次重跑第 12 节全部 7 命令，结果/日志见任务 7）。
- [x] 真实终端验收结果和未覆盖项目已说明（本次未运行，阻塞见任务 7，未把未验证项勾为通过）。
- [x] 文档没有宣称与原生全部行为等价。

## 14. 后续阶段：按数据能力逐项扩展

以下不属于第一版实施承诺：

1. 结束时刻：先证明可靠时间来源，以及记录与渲染实例的稳定对应。
2. 后台等待与仍运行任务数：先确定任务类型、通知队列、远端任务等统计范围。
3. 预算、提醒次数、隐藏消息数：先找到受支持的原始数据来源。
4. 原生隐藏设置同步与自动间距：先证明能够读取并追踪必要上下文。
5. 时间单位与日期格式本地化：单独定义舍入、地区、时区和历史日期显示规则。

每项扩展都采用“能力证据 → 行为设计 → 失败测试 → 实现 → 真实验证”的顺序。没有证据的能力保持未支持，不让它们反过来阻塞第一版中性耗时组件。
