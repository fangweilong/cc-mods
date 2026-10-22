# Claude Code Subagent Split View

在 Claude Code 右侧打开一个实时 Subagent 执行面板，显示：

- Subagent 名称、类型、模型和状态
- 当前任务描述、当前活动，以及最近 3 条工具 / 输出摘要
- 多个正在运行的 Subagent；已结束的 Agent 保留最近 6 个，方便回看
- 每张卡片有明确的「查看转录」按钮，调用 `$.ui.view({ agentId })` 打开原生 Subagent transcript（与鼠标点击 Subagent 相同）
- 正在查看的 Agent 会显示「返回主会话」，面板顶部也有 `↩ 主会话` 和 `清除`
- 不再把流式文本截成难以理解的长串；完整过程以原生 transcript 为准
- 面板不会因为 Agent 结束而自动关闭，由用户关闭或执行 `/subagent-view clear` 清理

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

面板使用 Claude Code 原生 `Pane`。全屏终端且宽度足够时显示在主会话右侧；终端较窄时会等待，执行 `/subagent-view` 或扩大终端后打开。点击卡片上的「查看转录」会调用 `$.ui.view({ agentId })` 显示该 Agent 的原生主视图 transcript；点击「返回主会话」或面板顶部的 `↩ 主会话` 回到主会话。

## 配置

本仓库所有可调配置统一在 **`/my-cc-mods-config` 可视化面板**管理（由独立的 `cc-mods-config` 插件提供）。本 Mod 当前自动工作，没有可调配置；`/subagent-view` 和 `clear` 是运行操作，不是独立配置入口。后续新增设置也应接入统一面板。

## 设计边界

本 Mod 只观察和渲染 Subagent 事件，不创建 Agent、不修改 Agent 参数、不改变权限和工具执行结果。日志仅保存在当前 Claude Code 进程内，最多保留每个 Agent 120 条记录；已结束的 Agent 最多保留 6 个，超出后按结束时间淘汰。

## 验证

```powershell
claude plugin validate .\subagent-split-view
claude plugin test .\subagent-split-view
```
