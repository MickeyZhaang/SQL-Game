export type TableDefinition = {
  name: string
  columns: string[]
  rowCount: number
}

export type Objective = {
  id: string
  title: string
  prompt: string
  starterQuery: string
}

export type World = {
  seed: string
  caseName: string
  tables: TableDefinition[]
  objective: Objective
}

export type QueryResult = {
  columns: string[]
  values: Array<Array<string | number | null>>
  solved: boolean
}

export type WorkerMessage =
  | { type: 'progress'; label: string; progress: number }
  | { type: 'ready'; world: World }
  | { type: 'result'; result: QueryResult }
  | { type: 'error'; message: string }
