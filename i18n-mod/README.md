# i18n-mod

Claude Code 部分界面本地化 Mod。语言包为 UTF-8 JSON，按配置读取当前选中的文件，不再静态导入所有语言包。

## 加载

在本仓库根目录运行：

```powershell
claude --plugin-dir ".\i18n-mod"
```

已将 `CLAUDE_CODE_PLUGIN_DIRS` 指向本仓库根目录时，重新加载插件或重启 Claude Code 后会发现此 Mod。未修改用户全局配置或其他 Mod；主动切换语言时才通过宿主配置 API 保存自己的语言来源。

开发与验证基于 Claude Code **2.1.294**。Mod API 仍是 Early Access，不保证旧版本兼容，也不保证所有客户端都有相同渲染位置。

## 配置与语言选择

本仓库所有 Mod 配置统一通过 **`/my-cc-mods-config` 可视化面板**管理。需同时加载独立的 `cc-mods-config` 配置插件与本 Mod，不需要加载 `statusline-mod`。

在“原生界面语言（i18n）”区域：

- 填写语言代码或 JSON 路径，或通过原生语言选择器选择简体中文/English（方向键选择，Enter 确认；Tab 切换控件）。
- 点击面板底部“保存配置”提交；输入过程只修改草稿。
- 点击“重新加载语言包”重读已保存的文件，不修改配置。
- “取消语言修改”只丢弃语言草稿；“关闭”不保存未提交修改。

坏文件或宿主策略拒绝会保留草稿并显示错误，其他 Mod 的配置文件不写入。锁定的语言来源显示为只读。本 Mod 的存储仍使用宿主 `userConfig`，不复制到状态栏的 JSON 文件。下面的 `/i18n`、`/config` 与手动 JSON 配置仅为独立加载或高级兼容用法。

宿主配置字段仍为 `language`，旧值 `zh-CN`、`en` 继续有效，但取消了写死的语言枚举。现在支持：

| 配置值 | 行为 |
| --- | --- |
| `zh-CN`（默认） | 读取插件目录下 `locales/zh-CN.json` |
| `ja` 等语言代码 | 读取插件目录下 `locales/<代码>.json`，文件须自行提供 |
| `./locales/custom.json` | 读取相对**插件目录**的 JSON，不以项目工作目录为基准 |
| `D:/translations/ja.json` | 读取本地绝对路径的 JSON |
| `en` | 原文模式，不读取语言文件 |

路径支持空格及 Windows 反斜杠；配置 JSON 内的反斜杠需要按 JSON 语法转义，推荐使用 `/`。不支持 URL、TOML、代码文件或 `~` 展开。Unix 绝对路径适用于对应平台；Windows 下请优先使用带盘符的绝对路径。

```text
/i18n
/i18n list
/i18n zh-CN
/i18n en
/i18n ./locales/custom.json
/i18n D:/translations/ja.json
/i18n reload
```

- `/i18n`、`/i18n list`：显示当前语言及来源，列出 `locales/` 下符合命名规范的文件代码。只读取目录元数据，不解析其他语言包，不写配置；外部文件通过路径选择，不自动扫描其目录。
- `/i18n <代码或路径>`：先读取、解析、校验，再保存来源并启用；坏文件和锁定的设置不会替换当前语言。
- `/i18n reload`：重新读取当前文件，成功后替换缓存；不写配置。文件编辑后执行此命令即可应用。
- `/config` 中的 `UI language / JSON language pack` 为文本字段，可填写代码或路径；保存前同样验证文件。
- 启动或插件热重载时读取配置指定的文件。加载失败保留已有会话语言；首次加载没有可用缓存时退回 `en` 并提示错误，不擅自改写配置。
- 当前包缓存于会话状态，界面重绘不重复读文件；切换后不缓存所有历史语言包。保存期间仅临时持有已验证候选包，保存完成或失败即释放临时引用。
- 已订阅语言状态的挂载界面会重新渲染；终端 scrollback 的历史行不追溯修改。

需要手动配置时，合并下列字段，不要覆盖其他设置：

```json
{
  "pluginConfigs": {
    "i18n-mod": {
      "options": {
        "language": "./locales/zh-CN.json"
      }
    }
  }
}
```

`--plugin-dir` 或集合目录通常使用 `i18n-mod` 作为键；若宿主已记录为 `i18n-mod@inline`，沿用已有键。日常使用统一 `/my-cc-mods-config` 面板；无需手动编辑或判断配置键。

## 扩展语言包

**新增 JSON 文件即可，不需要修改 TS 注册表或 manifest。** 最小语言包：

```json
{
  "id": "ja",
  "name": "日本語",
  "hints": {
    "shortcuts": "ショートカット"
  }
}
```

保存为插件目录中的 `locales/ja.json` 后，在统一面板填入 `ja`；保存到其他位置时，填入对应 JSON 路径并保存。兼容命令 `/i18n ja` 或 `/i18n <JSON路径>` 仍有效。代码文件名须使用规范大小写（例如 `zh-CN`、`zh-Hans-CN`、`ja`）和小写 `.json` 后缀；任意文件名仍可通过完整路径加载。

也可复制 `locales/zh-CN.json` 并修改译文：

| 字段 | 要求 |
| --- | --- |
| `id`、`name` | 必填字符串；`id` 为语言代码，`en` 保留给原文模式。按代码加载时，`id` 必须匹配所选代码 |
| `running`、`completed` | 可选，运行中及完成状态显示标签 |
| `duration` | 可选耗时模板，必须包含 `{duration}`，可包含 `{word}` |
| `hints` | 可选。支持 `shortcuts`、`interrupt`、`background`、`expand`、`collapse`、`history`、`cycleMode`、`acceptSuggestion`；只填译文，快捷键由代码保留 |
| `modes`、`notices`、`messages` | 可选的 `原文 → 译文` 字符串词典，精确匹配 |
| `command` | 可选命令文案，未填写的键回退到内置 English 控制消息 |

`command` 支持 `description`、`current`、`source`、`available`、`switched`、`reloaded`、`unsupported`、`loadFailed`、`saveFailed`、`usage`；保留对应的 `{language}`、`{source}`、`{languages}`、`{reason}` 占位符。

缺失的界面译文保留原文，不强制继承中文。加载时校验对象、字段类型、已知字段和键，拒绝不正确结构及不安全控制字符；支持 UTF-8 BOM。语法错误不回显文件内容。文件读取上限沿用宿主的 4 MiB 限制。

匹配规则、Spinner 原文词表、耗时原文词表统一留在 `hooks/source.ts` 和 `hooks/translate.ts`。JSON 只存显示数据，不能提供正则、可执行函数、`spinnerWords`、`durationWords` 或 `preserveOriginal`。JSON 不通过模块导入，也不执行代码。

## 当前已支持的 i18n

当前接入 **6 类原生界面位置**，另有 `/i18n` 自身的 **10 条控制文案**。以下统计基于 Claude Code 2.1.294 对接实现及当前内置 `locales/zh-CN.json`，不表示整个原生界面都已中文化；其他 JSON 语言包可只提供部分译文。

| 界面位置 | 当前中文覆盖 | 保留内容 |
| --- | --- | --- |
| 运行状态 `Spinner` | 识别 **134 个原文状态词**，统一显示“处理中”；另有 **10 条精确状态文案**，包括“思考中”“等待响应”“正在压缩会话”及省略号变体 | 动态任务描述、后缀、宿主计时及 Token 信息 |
| 回合耗时 `TurnDuration` | 识别 **36 个完成状态词**，整行显示为“已完成，用时 …” | 未知状态词沿用原生行 |
| 输入框提示 `PromptHint` | **8 类快捷提示**：快捷键、中断、后台运行、展开、收起、历史、切换模式、接受建议 | 实际快捷键、分隔符、未知片段、自定义尾部 |
| 工具进度 `ToolProgress` | **1 类提示**：“转入后台运行”，复用快捷提示词典中的 `background` | 工具身份及执行行为 |
| 模式标签 `SessionMode` | **6 条标签**：专注、记忆暂停、接受编辑、计划模式、自动模式、权限绕过 | 未知模式及顺序 |
| 提示通知 `InfoNotice` | **7 条精确通知文案**，见下表 | 尾部命令、可见性信息及未收录提示 |

状态词数量是可识别的原文数量，不是不同译文数量；省略号变体分别计入精确文案。后台运行提示在两个渲染位置复用，不应将它重复计为新增译文。

### 已收录的通知

| 原文 | 中文 |
| --- | --- |
| `Welcome back!` | 欢迎回来！ |
| `Welcome to Claude Code!` | 欢迎使用 Claude Code！ |
| `Tips for getting started` | 入门提示 |
| `Context left until auto-compact` | 自动压缩前剩余上下文 |
| `Auto-update failed` | 自动更新失败 |
| `Update available` | 有可用更新 |
| `Using custom model` | 正在使用自定义模型 |

只有宿主通过 `InfoNotice` 传入与词典键完全相同的文本时才会翻译。收录某条文案不表示所有显示该文案的界面都开放了这个渲染位置；带版本号、文件路径等动态内容的不同文本会保留原文。

### Mod 自身与其他界面

`/i18n` 的中文控制文案包括命令说明、当前语言、可选语言、语言来源、切换成功、重载成功、使用帮助，以及无效来源、加载失败、保存失败提示。缺失的命令译文回退到内置 English 文案。

**`/my-cc-mods-config` 配置面板和状态栏自己的 `en` / `zh` 显示设置独立维护，目前没有统一使用 i18n JSON 语言包。** 面板接入的是原生界面语言的选择与保存，不是将面板自身文本加入此语言包。

### 尚不覆盖

- 权限确认弹窗、原生配置/登录等未开放界面。
- 工具调用展示、工具参数、工具结果和命令输出。
- 用户输入、模型回复、文件内容，以及模型/system prompt 的语言设置。
- 未收录的原生文案；缺失译文保留原文。

本 Mod 不调用模型、网络或外部程序，不写业务文件；仅读取选中的语言文件及列举内置语言目录。

### 与其他 Mod 共存

`statusline-mod` 会隐藏原生 `PromptHint`，同用时该行仍不可见。其他 Mod 若在同一位置直接返回自定义树而不继续 `next`，最终效果受钩子顺序影响。本 Mod 不强制覆盖它，也不翻译其他 Mod 独立维护的文案；测试原生提示时需确认没有额外集合目录同时加载其他 Mod。

多数位置通过重写 props 并继续钩子链实现。只有已收录的耗时行由本 Mod 重绘完整文案，以避免中英文语法混排。

## 目录结构

```text
i18n-mod/
├── .claude-plugin/plugin.json
├── hooks/
│   ├── hooks.json
│   ├── register.ts
│   ├── language.ts
│   ├── original.ts
│   ├── source.ts
│   └── translate.ts
├── locales/zh-CN.json
├── types/index.d.ts
└── tests/
```

`language.ts` 是纯解析与校验模块，`original.ts` 是无文件依赖的原文模式及控制消息；它们不是逐语言注册表。宿主只能跟踪同文件内的 `$` 调用，因此文件 I/O 与配置调用保留在 `register.ts`。

## 验证

```powershell
claude plugin validate .\i18n-mod
claude plugin test .\i18n-mod
```

宿主首次加载生成 `.claude-plugin/types/` 后，如已安装 TypeScript：

```powershell
tsc -p .\i18n-mod
```

测试覆盖跨表面渲染契约、任意新语言与外部路径、仅选中包读取、无文件英文模式、JSON 结构验证、配置保存前验证、语言切换及状态重绘、错误回退、文件重载与宿主配置锁定。它们验证钩子和返回树，不等同于真实终端/桌面客户端截图验收。
