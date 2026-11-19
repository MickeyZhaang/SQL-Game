import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { buildCase } from './cases'
import type { Difficulty, Objective, QueryResult, WorkerMessage, WorkerRequest } from './types'

type Value = string | number | null
type ExpectedResult = { values: Value[][]; order: Objective['order'] }

let database: Database | undefined
let expectedResults = new Map<string, ExpectedResult>()
let solutions = new Map<string, string>()

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

function formatSolution(query: string) {
  const clauses = query.trim()
    .replace(/\s+/g, ' ')
    .replace(/\bLEFT\s+JOIN\b/gi, 'LEFT_JOIN')
    .replace(/\bINNER\s+JOIN\b/gi, 'INNER_JOIN')
    .replace(/\b(WITH|SELECT|FROM|LEFT_JOIN|INNER_JOIN|JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b/gi, '\n$1')
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/LEFT_JOIN/g, 'LEFT JOIN').replace(/INNER_JOIN/g, 'INNER JOIN'))
  let depth = 0
  return clauses.flatMap((line) => {
    if (line.startsWith(')')) depth -= 1
    const indent = '  '.repeat(Math.max(depth, 0))
    depth += (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0)
    const select = line.match(/^SELECT\s+(.+)$/i)
    return select ? [`${indent}SELECT`, `${indent}  ${select[1]}`] : [`${indent}${line}`]
  }).join('\n')
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
  solutions = generated.solutions
  expectedResults = new Map(generated.world.objectives.map((objective) => {
    const result = database?.exec(solutions.get(objective.id) ?? '')[0]
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

function reveal(objectiveId: string) {
  const query = solutions.get(objectiveId)
  if (!query) throw new Error('This solution is unavailable.')
  send({ type: 'solution', objectiveId, query: formatSolution(query) })
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'initialize') {
    initialize(event.data.seed, event.data.mode).catch((error: unknown) => send({ type: 'error', message: error instanceof Error ? error.message : 'Unable to initialize this run.' }))
    return
  }
  try {
    if (event.data.type === 'reveal') reveal(event.data.objectiveId)
    else execute(event.data.objectiveId, event.data.query)
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'The query could not be run.' })
  }
}
