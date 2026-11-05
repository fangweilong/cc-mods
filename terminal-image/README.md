# terminal-image

在终端内渲染 PNG 图片：支持图形协议时使用宿主 `<Image>`，否则可用 `<Raster>` 以半块字符 + 真彩色降级显示。

支持三类位置：

| 位置 | 来源 |
| --- | --- |
| 用户消息 | 粘贴/拖入的 PNG 附件，显示在用户消息下方；`[Image #N]` 占位文本保留，避免看起来像丢图 |
| 助手回复 | Markdown 图片语法中的本地 PNG 路径，如 `![chart](./chart.png)` |
| 工具结果 | `Read`、MCP 等工具结果中的内联 PNG 图片块 |

图片张数不设上限：单张使用完整宽度，多张按可用宽度并排，一行放不下自动换行到下一行。

## 终端能力探测

渲染前先做一次环境探测，结果在会话内缓存：

| 结果 | 终端 | `blocks=auto` 时的行为 |
| --- | --- | --- |
| `supported` | Kitty、Ghostty、WezTerm（含对应 `TERM` / 环境变量） | `<Image>` 图形渲染 |
| `unsupported` | VS Code 集成终端、Apple Terminal、Windows Terminal（`WT_SESSION`）、`TERM=dumb` | `<Raster>` 字符块降级；`blocks=off` 时不渲染 |
| `unknown` | 其他终端、tmux | 交给宿主 `<Image>` 判断；可用 `blocks=on` 强制字符块 |

`blocks=on` 时任何终端都用字符块；`blocks=off` 恢复“只在支持时渲染”的旧行为。

手动覆盖探测结果：

```text
CC_TERMINAL_IMAGE=on    # 强制尝试宿主图形渲染
CC_TERMINAL_IMAGE=off   # 强制不渲染（包括字符块）
```

环境变量优先于配置面板中的“终端能力”。启动后可用 `/terminal-image` 查看探测结果、渲染方式、尺寸上限与最近一次字符块渲染张数。

## 配置

在 `/my-cc-mods-config` 的 **Images / 图片** 页签配置，保存后写入统一配置文件 `~/.config/my-cc-mods/config.json` 的 `image` 段：

| 字段 | 值域 | 默认值 |
| --- | --- | --- |
| `enabled` | boolean | `true` |
| `mode` | `auto` / `on` / `off` | `auto` |
| `blocks` | `auto` / `on` / `off` | `auto` |
| `maxColumns` | 1-255 | `48` |
| `maxRows` | 1-255 | `16` |
| `showUserImages` | boolean | `true` |
| `showAssistantImages` | boolean | `true` |
| `showToolImages` | boolean | `true` |

配置在 `session.start` 读取；面板保存后监听统一配置文件的成功写入并自动刷新，无需重启会话。字段缺失或非法时回退默认值。

## 限制

- 只支持 PNG。宿主的终端图片元素只接受 PNG / RGBA 字节；JPEG、GIF、WebP、SVG 不会渲染。
- 只处理本地文件路径。`http(s)` 和 `data:` 图片不会在渲染 hook 里发起网络请求。
- 单张内联图片解码后不超过 2 MiB；超过时，非 tmux 环境改用终端直接读取文件，tmux 环境跳过。字符块降级只能使用内联字节，超过 2 MiB 的文件源会跳过。
- 字符块降级自己解码 PNG：支持灰度/RGB/索引/RGBA、1–16 位深；不支持隔行（Adam7），单图上限 1677 万像素或 64 MiB RGBA。
- 字符块每格用上半块 `▀` 表示上下两个像素，透明像素按 `COLORFGBG` 的背景色合成；不读取终端主题，`COLORFGBG` 缺失时按黑底。
- 字符块结果按“内容 + 尺寸 + 背景色”缓存最近 32 项；重绘不会重复解码。单棵渲染树的 `cells` 总预算 60,000 字符（宿主上限 100,000），超出时缩小或跳过靠后的图片。
- tmux 内需要宿主的 `allow-passthrough` 等配置；探测结果按 `unknown` 交给宿主判断。字符块不依赖 passthrough。
- 用户粘贴图片按提交文本缓存，同一文本重复提交时只显示最后一次的图片；缓存不写入磁盘。消息里的 `[Image #N]` 占位保持不变，图片追加在消息下方。
- 图片按终端列数和 PNG 宽高比缩放，单元格宽高比按 2:1 估算，不读取终端像素尺寸。
- 配置保存在统一配置文件中；本 Mod 不维护第二份配置，也不直接写 `settings.json`。

## 使用

```powershell
claude --plugin-dir "D:\Codes\other\cc-mods\terminal-image"
```

只监听终端面（`terminal`）；desktop、VS Code 和 mobile 面原样交给宿主。同时加载 `cc-mods-config` 后，用 `/my-cc-mods-config` 的“图片”页签管理开关、终端能力策略、字符块降级、尺寸上限和三个来源。

## 验证

```powershell
claude plugin validate "D:\Codes\other\cc-mods\terminal-image"
claude plugin test "D:\Codes\other\cc-mods\terminal-image"
```

真实终端验收仍在支持的终端（如 WezTerm / Kitty / Ghostty）和不支持的终端（Windows Terminal、VS Code）各运行一次：前者确认 `<Image>` 不变，后者确认字符块可见、比例正确；再切换 `blocks=off` 确认恢复隐藏。
