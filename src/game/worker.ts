import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { Difficulty, Objective, QueryResult, WorkerMessage, WorkerRequest, World } from './types'

type Customer = [number, string, string]
type Invoice = [number, number, number, string]
type ExpectedResult = { values: Array<Array<string | number | null>>; order: Objective['order'] }

let database: Database | undefined
let expectedResults = new Map<string, ExpectedResult>()

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

function objectivesFor(mode: Difficulty): Objective[] {
  if (mode === 'easy') {
    return [
      { id: 'north-customers', title: 'Map the northern accounts', prompt: 'Return the name and region for every customer in the North region.', starterQuery: 'SELECT name, region\nFROM customers\nWHERE region = \'North\';', order: 'irrelevant' },
      { id: 'billing-contacts', title: 'Locate billing contacts', prompt: 'Return the customer name, contact name, and role for every billing contact.', starterQuery: 'SELECT c.name, ct.name, ct.role\nFROM customers AS c\nJOIN contacts AS ct ON ct.customer_id = c.id\nWHERE ct.role = \'billing\';', order: 'irrelevant' },
      { id: 'large-invoices', title: 'Inspect the largest invoices', prompt: 'Return the customer name and invoice amount for the five largest invoices, largest first.', starterQuery: 'SELECT c.name, i.amount_cents\nFROM invoices AS i\nJOIN customers AS c ON c.id = i.customer_id\nORDER BY i.amount_cents DESC\nLIMIT 5;', order: 'required' },
    ]
  }
  if (mode === 'medium') {
    return [
      { id: 'regional-revenue', title: 'Compare revenue by region', prompt: 'Return every customer region and its total invoiced amount.', starterQuery: 'SELECT c.region, SUM(i.amount_cents) AS total_invoiced\nFROM customers AS c\nJOIN invoices AS i ON i.customer_id = c.id\nGROUP BY c.region;', order: 'irrelevant' },
      { id: 'top-accounts', title: 'Find the largest accounts', prompt: 'Return the three customers with the highest total invoiced amount, largest first.', starterQuery: 'SELECT c.name, SUM(i.amount_cents) AS total_invoiced\nFROM customers AS c\nJOIN invoices AS i ON i.customer_id = c.id\nGROUP BY c.id\nORDER BY total_invoiced DESC\nLIMIT 3;', order: 'required' },
      { id: 'contact-coverage', title: 'Measure contact coverage', prompt: 'Return every customer name and its number of contacts.', starterQuery: 'SELECT c.name, COUNT(ct.id) AS contact_count\nFROM customers AS c\nLEFT JOIN contacts AS ct ON ct.customer_id = c.id\nGROUP BY c.id;', order: 'irrelevant' },
    ]
  }
  return [
    { id: 'uncovered-accounts', title: 'Find uncovered accounts', prompt: 'Return the names of customers that do not have a contact.', starterQuery: 'SELECT c.name\nFROM customers AS c\nLEFT JOIN contacts AS ct ON ct.customer_id = c.id\nWHERE ct.id IS NULL;', order: 'irrelevant' },
    { id: 'monthly-revenue', title: 'Establish the monthly trend', prompt: 'Return every invoice month and its total invoiced amount, in chronological order.', starterQuery: 'SELECT substr(issued_on, 1, 7) AS month, SUM(amount_cents) AS total_invoiced\nFROM invoices\nGROUP BY month\nORDER BY month;', order: 'required' },
    { id: 'revenue-ranking', title: 'Rank the largest accounts', prompt: 'Return the five highest-revenue accounts with their totals and revenue rank, highest first.', starterQuery: 'WITH account_totals AS (\n  SELECT c.name, SUM(i.amount_cents) AS total_invoiced\n  FROM customers AS c\n  JOIN invoices AS i ON i.customer_id = c.id\n  GROUP BY c.id\n)\nSELECT name, total_invoiced, ROW_NUMBER() OVER (ORDER BY total_invoiced DESC) AS revenue_rank\nFROM account_totals\nORDER BY revenue_rank\nLIMIT 5;', order: 'required' },
  ]
}

function buildWorld(seed: string, mode: Difficulty) {
  const random = createRandom(seed)
  const companyNames = ['Northstar', 'Aster', 'Summit', 'Solace', 'Cinder', 'Morrow']
  const firstNames = ['Avery', 'Mina', 'Theo', 'Jules', 'Rae', 'Niko', 'Sam', 'Iris']
  const lastNames = ['Chen', 'Morgan', 'Singh', 'Hayes', 'Sato', 'Diaz', 'Khan', 'Bennett']
  const regions = ['North', 'East', 'South', 'West']
  const customers: Customer[] = Array.from({ length: 28 }, (_, index) => [index + 1, `${choose(random, companyNames)} ${choose(random, ['Works', 'Supply', 'Labs', 'Group'])}`, choose(random, regions)])
  const invoices: Invoice[] = Array.from({ length: 170 }, (_, index) => {
    const customerId = 1 + Math.floor(random() * customers.length)
    const amount = 8000 + Math.floor(random() * 190000)
    const month = 1 + Math.floor(random() * 6)
    const day = 1 + Math.floor(random() * 28)
    return [index + 1, customerId, amount, `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`]
  })
  const contacts = customers.flatMap(([customerId]) => Array.from({ length: random() > 0.24 ? 1 + Math.floor(random() * 3) : 0 }, (_, index) => [`${customerId}-${index + 1}`, customerId, `${choose(random, firstNames)} ${choose(random, lastNames)}`, choose(random, ['owner', 'billing', 'operations'])]))
  const world: World = {
    seed,
    mode,
    caseName: 'The missing margin',
    tables: [
      { name: 'customers', columns: ['id', 'name', 'region'], rowCount: customers.length },
      { name: 'invoices', columns: ['id', 'customer_id', 'amount_cents', 'issued_on'], rowCount: invoices.length },
      { name: 'contacts', columns: ['id', 'customer_id', 'name', 'role'], rowCount: contacts.length },
    ],
    objectives: objectivesFor(mode),
  }
  return { world, customers, invoices, contacts }
}

function send(message: WorkerMessage) {
  self.postMessage(message)
}

function normalizeRow(row: Array<string | number | null>) {
  return JSON.stringify(row.map((value) => value === null ? null : typeof value === 'number' ? Number(value) : String(value)))
}

function matchesExpected(values: Array<Array<string | number | null>>, expected: ExpectedResult) {
  if (values.length !== expected.values.length || values.some((row) => row.length !== expected.values[0]?.length)) return false
  const actualRows = values.map(normalizeRow)
  const expectedRows = expected.values.map(normalizeRow)
  if (expected.order === 'required') return actualRows.every((row, index) => row === expectedRows[index])
  return actualRows.sort().every((row, index) => row === expectedRows.sort()[index])
}

async function initialize(seed: string, mode: Difficulty) {
  send({ type: 'progress', label: 'Mapping customer relationships', progress: 18 })
  const generated = buildWorld(seed, mode)
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
  expectedResults = new Map(generated.world.objectives.map((objective) => {
    const result = database?.exec(objective.starterQuery)[0]
    return [objective.id, { values: (result?.values ?? []) as Array<Array<string | number | null>>, order: objective.order }]
  }))
  send({ type: 'progress', label: 'Preparing the investigation', progress: 88 })
  send({ type: 'ready', world: generated.world })
}

function execute(objectiveId: string, query: string) {
  if (!database) throw new Error('The workspace is still loading.')
  const expected = expectedResults.get(objectiveId)
  if (!expected) throw new Error('This investigation step is unavailable.')
  const statement = database.exec(query)[0]
  const values = (statement?.values ?? []) as Array<Array<string | number | null>>
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
