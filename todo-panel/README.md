# Todo Panel

独立的任务面板。它监听 Claude Code 的 Task 工具（`TaskCreate`、`TaskUpdate`、`TaskList`、`TaskGet`），并兼容旧的 `TodoWrite`；工具成功后自动打开右侧 Pane，显示完成率、当前任务和每项任务状态。

## 使用

从仓库根目录加载：

```powershell
claude --plugin-dir ".\todo-panel"
```

自动收到成功的 Task / TodoWrite 结果后会打开面板，也可以手动执行：

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

## 任务来源

| 工具 | 面板行为 |
| --- | --- |
| `TaskList` | 用返回的 `tasks` 整表替换 |
| `TaskCreate` | 按返回的 `task.id` / `subject` 追加为 `pending` |
| `TaskUpdate` | 按 `taskId` 更新状态、标题；`status: 'deleted'` 时移除 |
| `TaskGet` | 用单个任务快照更新或追加 |
| `TodoWrite` | 兼容旧接口，用 `newTodos` 整表替换 |

Subagent 的工具调用不更新主面板。

## 设计边界

- 只观察工具的成功结果，不修改工具输入、工具结果或任务状态。
- `TaskUpdate` / `TaskGet` 遇到未知 id 时不新增占位项；`TaskCreate` 遇到重复 id 时忽略。
- `activeForm` 缺失时用任务标题兜底。
- 任务只保存在当前 Claude Code 进程的 Mod 状态中，不写入文件或跨会话存储。
- 与 `subagent-split-view` 独立，不依赖或修改该 Mod。

## 验证

```powershell
claude plugin validate .\todo-panel
claude plugin test .\todo-panel
```
