export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export type TodoItem = {
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
