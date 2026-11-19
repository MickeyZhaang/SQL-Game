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

export type CaseId = 'margin' | 'freight' | 'marketplace' | 'research' | 'events' | 'clinic' | 'campus' | 'studio' | 'farm' | 'hotel' | 'energy' | 'support'

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
  submitted: boolean
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
  | { type: 'test'; objectiveId: string; query: string }
  | { type: 'submit'; objectiveId: string; query: string }
  | { type: 'reveal'; objectiveId: string }
