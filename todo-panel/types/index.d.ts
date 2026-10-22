export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export type TodoItem = {
  /** TaskCreate/TaskList 分配的任务 id；TodoWrite 来源没有 id。 */
  id?: string
  content: string
  status: TodoStatus
  activeForm: string
}

declare module 'claude-code' {
  interface PluginState {
    'todo-panel': {
      todos: TodoItem[]
    }
  }
}
