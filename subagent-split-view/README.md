# Claude Code Subagent Split View

在 Claude Code 右侧打开一个实时 Subagent 执行面板，显示：

- Subagent 名称、类型、模型和状态
- 当前任务描述
- 当前活动：thinking、工具调用或回答生成
- thinking / text 流式输出
- 工具调用参数摘要和执行结果
- 多个正在运行的 Subagent 的状态
- Subagent 完成、失败、取消或终止后自动移除对应卡片
- 没有运行中的 Subagent 后自动关闭分屏

## 使用

从集合仓库根目录加载：

```powershell
claude --plugin-dir ".\subagent-split-view"
```

Subagent 启动后会自动请求打开面板，也可以手动执行：

```text
/subagent-view
```

清除已记录的执行日志：

```text
/subagent-view clear
```

面板使用 Claude Code 原生 `Pane`。全屏终端且宽度足够时显示在主会话右侧；终端较窄时会等待，执行 `/subagent-view` 或扩大终端后打开。

## 设计边界

本 Mod 只观察和渲染 Subagent 事件，不创建 Agent、不修改 Agent 参数、不改变权限和工具执行结果。日志仅保存在当前 Claude Code 进程内，最多保留每个 Agent 120 条记录。

## 验证

```powershell
claude plugin validate .\subagent-split-view
claude plugin test .\subagent-split-view
```
