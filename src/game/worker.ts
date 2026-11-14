import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { QueryResult, WorkerMessage, World } from './types'

type Customer = [number, string, string]
type Invoice = [number, number, number, string]

let database: Database | undefined
let expectedResult = ''

function hash(seed: string) {
  let value = 2166136261
  for (const character of seed) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function createRandom(seed: string) {
  let state = hash(seed)
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function choose<T>(random: () => number, values: T[]) {
  return values[Math.floor(random() * values.length)]
}

function buildWorld(seed: string) {
  const random = createRandom(seed)
  const companyNames = ['Northstar', 'Aster', 'Summit', 'Solace', 'Cinder', 'Morrow']
  const firstNames = ['Avery', 'Mina', 'Theo', 'Jules', 'Rae', 'Niko', 'Sam', 'Iris']
  const lastNames = ['Chen', 'Morgan', 'Singh', 'Hayes', 'Sato', 'Diaz', 'Khan', 'Bennett']
  const regions = ['North', 'East', 'South', 'West']
  const customers: Customer[] = Array.from({ length: 28 }, (_, index) => [
    index + 1,
    `${choose(random, companyNames)} ${choose(random, ['Works', 'Supply', 'Labs', 'Group'])}`,
    choose(random, regions),
  ])
  const invoices: Invoice[] = Array.from({ length: 170 }, (_, index) => {
    const customerId = 1 + Math.floor(random() * customers.length)
    const amount = 8000 + Math.floor(random() * 190000)
    const month = 1 + Math.floor(random() * 6)
    const day = 1 + Math.floor(random() * 28)
    return [index + 1, customerId, amount, `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`]
  })
  const contacts = customers.flatMap(([customerId]) => {
    const count = random() > 0.24 ? 1 + Math.floor(random() * 3) : 0
    return Array.from({ length: count }, (_, index) => [
      `${customerId}-${index + 1}`,
      customerId,
      `${choose(random, firstNames)} ${choose(random, lastNames)}`,
      choose(random, ['owner', 'billing', 'operations']),
    ])
  })
  const world: World = {
    seed,
    caseName: 'The missing margin',
    tables: [
      { name: 'customers', columns: ['id', 'name', 'region'], rowCount: customers.length },
      { name: 'invoices', columns: ['id', 'customer_id', 'amount_cents', 'issued_on'], rowCount: invoices.length },
      { name: 'contacts', columns: ['id', 'customer_id', 'name', 'role'], rowCount: contacts.length },
    ],
    objective: {
      id: 'top-customers',
      title: 'Find the three largest accounts',
      prompt: 'Return each customer name and their total invoiced amount in cents. Show the three largest totals first.',
      starterQuery: 'SELECT c.name, SUM(i.amount_cents) AS total_invoiced\nFROM customers AS c\nJOIN invoices AS i ON i.customer_id = c.id\nGROUP BY c.id\nORDER BY total_invoiced DESC\nLIMIT 3;',
    },
  }
  return { world, customers, invoices, contacts }
}

function send(message: WorkerMessage) {
  self.postMessage(message)
}

function serializeResult(columns: string[], values: Array<Array<string | number | null>>) {
  return JSON.stringify({ columns, values })
}

async function initialize(seed: string) {
  send({ type: 'progress', label: 'Mapping customer relationships', progress: 18 })
  const generated = buildWorld(seed)
  send({ type: 'progress', label: 'Opening the SQLite workspace', progress: 43 })
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  database?.close()
  database = new SQL.Database()
  database.run('CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL)')
  database.run('CREATE TABLE invoices (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), amount_cents INTEGER NOT NULL, issued_on TEXT NOT NULL)')
  database.run('CREATE TABLE contacts (id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), name TEXT NOT NULL, role TEXT NOT NULL)')
  const insertCustomer = database.prepare('INSERT INTO customers VALUES (?, ?, ?)')
  generated.customers.forEach((row) => insertCustomer.run(row))
  insertCustomer.free()
  send({ type: 'progress', label: 'Loading financial records', progress: 67 })
  const insertInvoice = database.prepare('INSERT INTO invoices VALUES (?, ?, ?, ?)')
  generated.invoices.forEach((row) => insertInvoice.run(row))
  insertInvoice.free()
  const insertContact = database.prepare('INSERT INTO contacts VALUES (?, ?, ?, ?)')
  generated.contacts.forEach((row) => insertContact.run(row))
  insertContact.free()
  send({ type: 'progress', label: 'Preparing the first investigation', progress: 88 })
  const expected = database.exec(generated.world.objective.starterQuery)[0]
  expectedResult = serializeResult(expected.columns, expected.values as Array<Array<string | number | null>>)
  send({ type: 'ready', world: generated.world })
}

function execute(query: string) {
  if (!database) throw new Error('The workspace is still loading.')
  const statement = database.exec(query)[0]
  const result: QueryResult = {
    columns: statement?.columns ?? [],
    values: (statement?.values ?? []) as Array<Array<string | number | null>>,
    solved: false,
  }
  result.solved = serializeResult(result.columns, result.values) === expectedResult
  send({ type: 'result', result })
}

self.onmessage = (event: MessageEvent<{ type: 'initialize'; seed: string } | { type: 'execute'; query: string }>) => {
  if (event.data.type === 'initialize') {
    initialize(event.data.seed).catch((error: unknown) => send({ type: 'error', message: error instanceof Error ? error.message : 'Unable to initialize this run.' }))
    return
  }
  try {
    execute(event.data.query)
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'The query could not be run.' })
  }
}
