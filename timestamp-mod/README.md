# timestamp-mod

加载后，用户消息上方单独显示发送时间；每个工具调用在工具块顶部用一行显示 `开始 → 结束 · 耗时`（执行中显示 `→ running`），工具块之间留空行分隔。为确保折叠的工具组也能逐项显示时间，启用时会展开 `ToolGroup`。该 Mod 不修改模型收到的 Prompt、用户消息内容、助手文本、工具参数或工具结果。

通过 `/my-cc-mods-config` 配置启用开关和时间格式规则。

配置保存在 `~/.config/my-cc-mods/config.json` 的 `timestamp` 段。支持占位符：`YYYY`、`YY`、`MM`、`DD`、`HH`、`mm`、`ss`、`SSS`。
