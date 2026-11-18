import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { buildCase } from './cases'
import type { Difficulty, Objective, QueryResult, WorkerMessage, WorkerRequest } from './types'

type Value = string | number | null
type ExpectedResult = { values: Value[][]; order: Objective['order'] }

let database: Database | undefined
let expectedResults = new Map<string, ExpectedResult>()

function send(message: WorkerMessage) {
  self.postMessage(message)
}

function normalizeRow(row: Value[]) {
  return JSON.stringify(row.map((value) => value === null ? null : typeof value === 'number' ? Number(value) : String(value)))
}

function matchesExpected(values: Value[][], expected: ExpectedResult) {
  if (values.length !== expected.values.length || values.some((row) => row.length !== expected.values[0]?.length)) return false
  const actualRows = values.map(normalizeRow)
  const expectedRows = expected.values.map(normalizeRow)
  if (expected.order === 'required') return actualRows.every((row, index) => row === expectedRows[index])
  return actualRows.sort().every((row, index) => row === expectedRows.sort()[index])
}

async function initialize(seed: string, mode: Difficulty) {
  send({ type: 'progress', label: 'Selecting a case file', progress: 18 })
  const generated = buildCase(seed, mode)
  send({ type: 'progress', label: 'Opening the SQLite workspace', progress: 43 })
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  database?.close()
  database = new SQL.Database()
  generated.loads.forEach(({ create }) => database?.run(create))
  send({ type: 'progress', label: 'Loading relational records', progress: 67 })
  generated.loads.forEach(({ insert, rows }) => {
    const statement = database?.prepare(insert)
    rows.forEach((row) => statement?.run(row))
    statement?.free()
  })
  expectedResults = new Map(generated.world.objectives.map((objective) => {
    const result = database?.exec(objective.starterQuery)[0]
    return [objective.id, { values: (result?.values ?? []) as Value[][], order: objective.order }]
  }))
  send({ type: 'progress', label: 'Preparing the investigation', progress: 88 })
  send({ type: 'ready', world: generated.world })
}

function execute(objectiveId: string, query: string) {
  if (!database) throw new Error('The workspace is still loading.')
  const expected = expectedResults.get(objectiveId)
  if (!expected) throw new Error('This investigation step is unavailable.')
  const statement = database.exec(query)[0]
  const values = (statement?.values ?? []) as Value[][]
  const result: QueryResult = { objectiveId, columns: statement?.columns ?? [], values, solved: matchesExpected(values, expected) }
  send({ type: 'result', result })
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'initialize') {
    initialize(event.data.seed, event.data.mode).catch((error: unknown) => send({ type: 'error', message: error instanceof Error ? error.message : 'Unable to initialize this run.' }))
    return
  }
  try {
    execute(event.data.objectiveId, event.data.query)
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'The query could not be run.' })
  }
}
