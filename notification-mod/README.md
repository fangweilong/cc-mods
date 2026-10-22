# notification-mod

在主会话的 `turn.complete` 后发送原生通知：

- `answer`：通过 `$.ui.notify` 发送成功通知。
- `error` / `refusal`：通过 `$.ui.notify` 发送失败通知。
- `aborted`：不发送通知。
- Subagent 回合（带 `agentId`）不发送通知，只监听主会话。
- 按 `turnId` 去重，去重记录保存在当前会话状态中，最多保留 200 条。
- 通知通道失败时安全忽略，不回退为 `$.ui.toast`。

`session.start` 和 `$.session.surfaces()` 只能提供会话绑定面的 best-effort 信息，不能判断操作系统焦点，因此本 Mod 不据此声称“窗口未聚焦时才通知”。`$.ui.notify` 的实际发送结果由 Claude Code 通知通道决定。

## 使用

```powershell
claude --plugin-dir "D:\Codes\other\cc-mods\notification-mod"
```

## 验证

```powershell
claude plugin validate "D:\Codes\other\cc-mods\notification-mod"
claude plugin test "D:\Codes\other\cc-mods\notification-mod"
```
