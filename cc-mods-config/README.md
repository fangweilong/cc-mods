# CC Mods Config

独立的 CC Mods TUI 配置管理插件。不依赖 `statusline-mod` 或其他功能 Mod；不加载状态栏时仍可配置用户输入框和 i18n。

## 加载

在集合仓库根目录运行：

```powershell
claude --plugin-dir "./cc-mods-config"
```

同时使用功能 Mod 时，一并加载对应目录。例如只使用配置面板和输入框：

```powershell
claude --plugin-dir "./cc-mods-config" --plugin-dir "./user-prompt-frame"
```

`CLAUDE_CODE_PLUGIN_DIRS` 已指向集合仓库根目录时，重启 Claude Code 或重新加载插件即可发现此目录。只复制所需插件时，需另行复制 `cc-mods-config/`；状态栏不再提供面板。

## 使用

运行 `/my-cc-mods-config` 会打开统一可视化配置面板，这是唯一的配置面板命令入口：

- 切换 `en` / `zh`
- 选择状态栏位置：模式提示区域（现有位置）/ 输入框下方
- 选择状态栏显示模式：完整模式（默认，保留模块前缀 Emoji）/ 简洁模式（仅移除模块前缀 Emoji，保留数据指示符号、颜色和模块内容）
- 启用/停用模块
- 调整模块顺序
- 编辑用户输入框标题、颜色和边框符号
- 配置原生界面语言（i18n）：语言代码或 JSON 路径、简体中文/English 原生语言选择器
- 重新加载已保存的 JSON 语言包，或单独取消语言修改
- 关闭面板

配置按 `statusline-mod`、`user-prompt-frame`、`i18n-mod` 和 `subagent-split-view` 分组，标题标明 Mod 名称与配置能力；各组之间留一行间隔，底部保存/关闭操作区也单独留出间隔。Subagent 分组仅提示当前没有可调配置。

语言选择改为单个原生 `Select` 控件，不再横排两个语言按钮。控件聚焦后使用方向键选择、Enter 确认，Tab 切换到其他控件；自定义语言代码和 JSON 路径仍通过输入框编辑。

修改后点击 `Save configuration` / 保存配置统一提交；`Close` 不保存未提交的草稿。i18n 需同时加载 `i18n-mod`，没有加载时提示不可用，宿主策略锁定时仅显示只读来源。

状态栏/面板的 `en` / `zh` 与 i18n 原生界面语言是两个独立设置。后者通过 `$.config.set` 保存宿主的 `i18n-mod.language`，继续由 i18n 校验文件与执行语言切换，不复制到状态栏 JSON 配置。

保存先提交 i18n；坏文件或策略拒绝会显示错误并保留语言草稿，其他 Mod 的配置文件不写入。两个存储不是原子事务：若 i18n 已提交但状态栏/输入框文件保存失败，会明确提示部分保存失败，重试不会重复提交已保存的语言草稿。重载只读取已保存的语言包；先保存或取消未提交的语言修改。

Subagent 面板当前没有可调配置。后续新增可调项也应统一接入此面板。

## 存储与职责

- 状态栏与输入框继续使用 `~/.config/my-cc-mods/config.json`，保留 `language`、`order`、`modules`、`promptFrame` 格式，新增 `position`（`session-mode` / `below-prompt`）与 `displayMode`（`full` / `compact`）；旧配置缺少位置字段时沿用现有位置，缺少显示模式或值无效时使用完整模式（`full`），无需迁移。
- i18n 继续通过宿主 `userConfig` 保存 `i18n-mod.language`，不直接写 `settings.json`，也不向上述 JSON 复制语言来源。
- 面板的草稿与错误状态归属 `cc-mods-config`，不访问其他 Mod 的 `$.state`。
- 不绘制状态栏、不隐藏原生快捷提示、不订阅模型或 Agent 的运行事件。
- 状态栏与输入框的配置即使未加载对应 Mod 也可预先保存；i18n 配置需加载 `i18n-mod` 才可使用，宿主锁定时显示只读。
- 各功能 Mod 独立读取自己的设置，不通过配置插件的运行时状态获取设置。状态栏监听兼容文件的成功写入以刷新，输入框在渲染消息时读取 `promptFrame`。

配置插件与状态栏各自保留兼容格式的默认值及规范化逻辑，不使用跨目录模块导入，确保每个插件目录可单独复制、安装和验证。

## 验证

在仓库根目录运行：

```powershell
claude plugin validate ./cc-mods-config
claude plugin test ./cc-mods-config
```

测试覆盖 terminal/desktop 面板、中英文 Mod 分组标题与间隔、状态栏位置和完整/简洁模式选择/保存/重新打开及旧配置默认值、模式无效值回退、唯一命令注册与已移除入口不再打开面板、无功能 Mod 时独立保存、兼容文件读取、草稿取消、i18n 校验和锁定策略、部分保存失败与重试。

类型声明由 Claude Code 在加载后生成到 `.claude-plugin/types/`，无需安装 npm 依赖。

## 目录结构

```text
cc-mods-config/
├── .claude-plugin/plugin.json
├── hooks/hooks.json
├── hooks/register.ts
├── types/index.d.ts
├── tests/config.test.ts
├── tsconfig.json
└── README.md
```
