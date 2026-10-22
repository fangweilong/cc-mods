# tool-output

可选地折叠或平铺 Claude Code 的工具结果。只改变渲染，不修改工具结果、会话记录或发送给模型的内容。

## 模式

| 模式 | 行为 |
| --- | --- |
| `off` | 完全交回原生渲染。 |
| `fold`（默认） | 超过行数或字符阈值的长结果折叠成一行摘要，点击展开；再次点击收起。`ctrl+o` / `--verbose` 的原生展开优先。 |
| `flat` | 把工具组强制平铺为逐项 `ToolUse` 行。 |

错误结果默认保持展开，避免把失败信息藏起来。折叠阈值默认 12 行，可在统一配置面板中改为 8 / 12 / 20 / 40 / 80。

## 使用

加载 Mod：

```powershell
claude --plugin-dir ".\tool-output"
```

同时加载统一配置面板：

```powershell
claude --plugin-dir ".\cc-mods-config" --plugin-dir ".\tool-output"
```

打开面板后切换到「工具输出」页签，修改模式、阈值和错误结果行为，点击保存。

配置保存在 `~/.config/my-cc-mods/config.json` 的 `toolOutput` 段：

```json
{
  "toolOutput": {
    "mode": "fold",
    "foldAfterLines": 12,
    "keepErrorsExpanded": true
  }
}
```

面板保存后会通过 `fs.write` 热重载；未加载 `cc-mods-config` 时，手写该段同样生效。

## 设计边界

- 只挂 `ui.render` 的 `ToolResult` 与 `ToolGroup`，不拦截工具调用、不改 `output`。
- 折叠状态按 `tool_use_id` 保存在当前进程内，最多 500 条。
- 已折叠的完整内容仍可通过展开或 `ctrl+o` 查看；不改变原生 transcript。
- 短结果、错误结果（默认）和已由宿主展开的结果直接走原生渲染。

## 验证

```powershell
claude plugin validate .\tool-output
claude plugin test .\tool-output
```
