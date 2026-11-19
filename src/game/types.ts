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
  order: 'required' | 'irrelevant'
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export type CaseId = 'margin' | 'freight' | 'marketplace'

export type World = {
  seed: string
  caseId: CaseId
  caseName: string
  caseSummary: string
  mode: Difficulty
  tables: TableDefinition[]
  objectives: Objective[]
}

export type QueryResult = {
  objectiveId: string
  columns: string[]
  values: Array<Array<string | number | null>>
  solved: boolean
}

export type WorkerMessage =
  | { type: 'progress'; label: string; progress: number }
  | { type: 'ready'; world: World }
  | { type: 'result'; result: QueryResult }
  | { type: 'solution'; objectiveId: string; query: string }
  | { type: 'error'; message: string }

export type WorkerRequest =
  | { type: 'initialize'; seed: string; mode: Difficulty }
  | { type: 'execute'; objectiveId: string; query: string }
  | { type: 'reveal'; objectiveId: string }
