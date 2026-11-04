# terminal-image

在终端内渲染 PNG 图片，并按终端能力自动显示或隐藏。

支持三类位置：

| 位置 | 来源 |
| --- | --- |
| 用户消息 | 粘贴/拖入的 PNG 附件，显示在用户消息下方；`[Image #N]` 占位文本保留，避免看起来像丢图 |
| 助手回复 | Markdown 图片语法中的本地 PNG 路径，如 `![chart](./chart.png)` |
| 工具结果 | `Read`、MCP 等工具结果中的内联 PNG 图片块 |

图片张数不设上限：单张使用完整宽度，多张按可用宽度并排，一行放不下自动换行到下一行。

## 终端能力探测

渲染前先做一次环境探测，结果在会话内缓存：

| 结果 | 终端 | 行为 |
| --- | --- | --- |
| `supported` | Kitty、Ghostty、WezTerm（含对应 `TERM` / 环境变量） | 渲染图片 |
| `unsupported` | VS Code 集成终端、Apple Terminal、Windows Terminal（`WT_SESSION`）、`TERM=dumb` | 完全不渲染，不占位 |
| `unknown` | 其他终端、tmux | 插入宿主 `<Image>`，由 Claude Code 做最终能力判断；不支持时显示空白 |

手动覆盖探测结果：

```text
CC_TERMINAL_IMAGE=on    # 强制尝试渲染
CC_TERMINAL_IMAGE=off   # 强制不渲染
```

环境变量优先于配置面板中的“终端能力”。启动后可用 `/terminal-image` 查看当前探测结果、模式与尺寸上限。

## 配置

在 `/my-cc-mods-config` 的 **Images / 图片** 页签配置，保存后写入统一配置文件 `~/.config/my-cc-mods/config.json` 的 `image` 段：

| 字段 | 值域 | 默认值 |
| --- | --- | --- |
| `enabled` | boolean | `true` |
| `mode` | `auto` / `on` / `off` | `auto` |
| `maxColumns` | 1-255 | `48` |
| `maxRows` | 1-255 | `16` |
| `showUserImages` | boolean | `true` |
| `showAssistantImages` | boolean | `true` |
| `showToolImages` | boolean | `true` |

配置在 `session.start` 读取；面板保存后监听统一配置文件的成功写入并自动刷新，无需重启会话。字段缺失或非法时回退默认值。

## 限制

- 只支持 PNG。宿主的终端图片元素只接受 PNG / RGBA 字节；JPEG、GIF、WebP、SVG 不会渲染。
- 只处理本地文件路径。`http(s)` 和 `data:` 图片不会在渲染 hook 里发起网络请求。
- 单张内联图片解码后不超过 2 MiB；超过时，非 tmux 环境改用终端直接读取文件，tmux 环境跳过。
- tmux 内需要宿主的 `allow-passthrough` 等配置；探测结果按 `unknown` 交给宿主判断。
- 用户粘贴图片按提交文本缓存，同一文本重复提交时只显示最后一次的图片；缓存不写入磁盘。消息里的 `[Image #N]` 占位保持不变，图片追加在消息下方。
- 图片按终端列数和 PNG 宽高比缩放，单元格宽高比按 2:1 估算，不读取终端像素尺寸。
- 配置保存在统一配置文件中；本 Mod 不维护第二份配置，也不直接写 `settings.json`。

## 使用

```powershell
claude --plugin-dir "D:\Codes\other\cc-mods\terminal-image"
```

只监听终端面（`terminal`）；desktop、VS Code 和 mobile 面原样交给宿主。同时加载 `cc-mods-config` 后，用 `/my-cc-mods-config` 的“图片”页签管理开关、终端能力策略、尺寸上限和三个来源。

## 验证

```powershell
claude plugin validate "D:\Codes\other\cc-mods\terminal-image"
claude plugin test "D:\Codes\other\cc-mods\terminal-image"
```

真实终端验收仍需在支持的终端（如 WezTerm / Kitty / Ghostty）和明确不支持的终端（如 VS Code）各运行一次，确认图片与隐藏行为。
