# Todo Panel

独立的 TodoWrite 任务面板。它监听 `TodoWrite` 工具调用，在工具成功返回新的结构化任务后自动打开右侧 Pane，显示完成率、当前任务和每项任务状态。

## 使用

从仓库根目录加载：

```powershell
claude --plugin-dir ".\todo-panel"
```

自动收到成功的 `TodoWrite` 结果后会打开面板，也可以手动执行：

```text
/todo-panel
```

清空当前进程中的任务：

```text
/todo-panel clear
```

关闭面板：

```text
/todo-panel close
```

终端宽度不足时，面板会等待；再次执行 `/todo-panel` 或扩大终端后即可显示。

## 设计边界

- 仅观察 `TodoWrite` 的成功结果，不修改工具输入、工具结果或任务状态。
- 同时兼容结果中的 `result.newTodos` 和直接的 `newTodos` 字段。
- 任务只保存在当前 Claude Code 进程的 Mod 状态中，不写入文件或跨会话存储。
- 与 `subagent-split-view` 独立，不依赖或修改该 Mod。

## 验证

```powershell
claude plugin validate .\todo-panel
claude plugin test .\todo-panel
```
