# Claude Code User Prompt Frame

一个 Claude Code Mod：把对话记录中的用户消息显示为带有“用户输入”标题的边框区域。

## 效果

```text
┌─ 用户输入 ───────────────────────────────────────┐
│  现在继续测试，hello123。                         │
└──────────────────────────────────────────────────┘
```

特性：

- 中文标题：`用户输入`
- 根据当前终端宽度自适应，不使用固定最大宽度
- 中文、英文和 Emoji 混排时按终端显示宽度换行
- 多行消息保持边框对齐
- 发送后进入 transcript 滚动区域时，用户消息边框保持不变
- 兼容 transcript 重放时消息来源字段变化
- 任务通知和其他会话/Agent 消息交给 Claude Code 默认渲染
- 无需修改 Claude Code 源码

## 配置

本仓库所有配置统一在 **`/my-cc-mods-config` 可视化面板**管理。同时加载独立的 `cc-mods-config` 配置插件后，在“用户输入框”区域修改标题、颜色和边框符号，点击“保存配置”。无需手动编辑文件；下列格式仅保留作为兼容说明。

本 Mod 只读取统一配置文件中的 `promptFrame` 段，不依赖 `statusline-mod`：

```text
~/.config/my-cc-mods/config.json
```

示例：

```json
{
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

支持配置用户输入框标题、边框颜色、横线符号、竖线符号和四个角符号。只安装本 Mod 时也可以直接编辑该文件；配置缺失时使用默认样式。


### 方式一：命令行临时加载

```powershell
claude --plugin-dir "C:\path\to\claude-code-user-prompt-frame"
```

macOS/Linux：

```bash
claude --plugin-dir /path/to/claude-code-user-prompt-frame
```

### 方式二：复制到 Mod 开发目录

将项目目录复制到 Claude Code 当前会话使用的 Mod 目录中，然后在 Claude Code 中启用 Mod 热重载。

## 在 Mod 集合仓库中使用

本 Mod 位于集合仓库的 `user-prompt-frame/` 子目录，不要把多个 Mod 的文件合并到同一目录。

从集合仓库根目录加载本 Mod：

```powershell
claude --plugin-dir ".\user-prompt-frame"
```

也可以使用绝对路径：

```powershell
claude --plugin-dir "D:\Codes\other\cc-mods\user-prompt-frame"
```

从 GitHub 获取整个集合仓库：

```bash
git clone https://github.com/<your-account>/cc-mods.git
claude --plugin-dir ./cc-mods/user-prompt-frame
```

将 `<your-account>` 替换为实际 GitHub 用户名或组织名。

## 开发与验证

本项目依赖 Claude Code 自带的 Mod API，不需要 npm 依赖。

```bash
claude plugin validate .
claude plugin test .
```

类型声明由 Claude Code 在 Mod 加载后写入 `.claude-plugin/types/`，该目录已加入 `.gitignore`。

## 目录结构

```text
.
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── register.tsx
├── tests/
│   └── register.test.ts
├── .gitattributes
├── .gitignore
└── README.md
```

## 许可证

建议发布到 GitHub 时选择 MIT License，便于他人安装和修改。
