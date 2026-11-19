import type { CaseId, Difficulty, Objective, TableDefinition, World } from './types'

type Value = string | number | null
type TableLoad = { create: string; insert: string; rows: Value[][] }

export type GeneratedCase = { world: World; loads: TableLoad[]; solutions: Map<string, string> }

export function hash(seed: string) {
  let value = 2166136261
  for (const character of seed) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function randomFor(seed: string) {
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

function objectives(mode: Difficulty, easy: Objective[], medium: Objective[], hard: Objective[]) {
  return mode === 'easy' ? easy : mode === 'medium' ? medium : hard
}

function marginCase(seed: string, mode: Difficulty): GeneratedCase {
  const random = randomFor(seed)
  const names = ['Northstar', 'Aster', 'Summit', 'Solace', 'Cinder', 'Morrow']
  const regions = ['North', 'East', 'South', 'West']
  const customers = Array.from({ length: 28 }, (_, index) => [index + 1, `${choose(random, names)} ${choose(random, ['Works', 'Supply', 'Labs', 'Group'])}`, choose(random, regions)])
  const invoices = Array.from({ length: 170 }, (_, index) => [index + 1, 1 + Math.floor(random() * customers.length), 8000 + Math.floor(random() * 190000), `2025-${String(1 + Math.floor(random() * 6)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`])
  const contacts = customers.flatMap(([id]) => Array.from({ length: random() > .24 ? 1 + Math.floor(random() * 3) : 0 }, (_, index) => [`${id}-${index + 1}`, id, `${choose(random, ['Avery', 'Mina', 'Theo', 'Jules'])} ${choose(random, ['Chen', 'Morgan', 'Singh', 'Hayes'])}`, choose(random, ['owner', 'billing', 'operations'])]))
  return makeCase('margin', seed, mode, 'The missing margin', 'A financial investigation into which accounts are distorting the quarter.', [
    table('customers', ['id', 'name', 'region'], customers, 'CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL)', 'INSERT INTO customers VALUES (?, ?, ?)'),
    table('invoices', ['id', 'customer_id', 'amount_cents', 'issued_on'], invoices, 'CREATE TABLE invoices (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, issued_on TEXT NOT NULL)', 'INSERT INTO invoices VALUES (?, ?, ?, ?)'),
    table('contacts', ['id', 'customer_id', 'name', 'role'], contacts, 'CREATE TABLE contacts (id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL)', 'INSERT INTO contacts VALUES (?, ?, ?, ?)'),
  ], objectives(mode,
    [objective('north-customers', 'Map the northern accounts', 'Return the name and region for every customer in the North region.', 'SELECT name, region FROM customers WHERE region = \'North\';'), objective('billing-contacts', 'Locate billing contacts', 'Return the customer name, contact name, and role for every billing contact.', "SELECT c.name, ct.name, ct.role FROM customers c JOIN contacts ct ON ct.customer_id = c.id WHERE ct.role = 'billing';"), objective('large-invoices', 'Inspect the largest invoices', 'Return the customer name and invoice amount for the five largest invoices, largest first.', 'SELECT c.name, i.amount_cents FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.amount_cents DESC LIMIT 5;', 'required')],
    [objective('regional-revenue', 'Compare revenue by region', 'Return every customer region and its total invoiced amount.', 'SELECT c.region, SUM(i.amount_cents) FROM customers c JOIN invoices i ON i.customer_id = c.id GROUP BY c.region;'), objective('top-accounts', 'Find the largest accounts', 'Return the three customers with the highest total invoiced amount, largest first.', 'SELECT c.name, SUM(i.amount_cents) AS total FROM customers c JOIN invoices i ON i.customer_id = c.id GROUP BY c.id ORDER BY total DESC LIMIT 3;', 'required'), objective('contact-coverage', 'Measure contact coverage', 'Return every customer name and its number of contacts.', 'SELECT c.name, COUNT(ct.id) FROM customers c LEFT JOIN contacts ct ON ct.customer_id = c.id GROUP BY c.id;')],
    [objective('uncovered-accounts', 'Find uncovered accounts', 'Return the names of customers that do not have a contact.', 'SELECT c.name FROM customers c LEFT JOIN contacts ct ON ct.customer_id = c.id WHERE ct.id IS NULL;'), objective('monthly-revenue', 'Establish the monthly trend', 'Return every invoice month and its total invoiced amount, in chronological order.', 'SELECT substr(issued_on, 1, 7), SUM(amount_cents) FROM invoices GROUP BY 1 ORDER BY 1;', 'required'), objective('revenue-ranking', 'Rank the largest accounts', 'Return the five highest-revenue accounts with their totals and revenue rank, highest first.', 'WITH totals AS (SELECT c.name, SUM(i.amount_cents) total FROM customers c JOIN invoices i ON i.customer_id = c.id GROUP BY c.id) SELECT name, total, ROW_NUMBER() OVER (ORDER BY total DESC) FROM totals ORDER BY 3 LIMIT 5;', 'required')],
  ))
}

function freightCase(seed: string, mode: Difficulty): GeneratedCase {
  const random = randomFor(seed)
  const regions = ['North', 'East', 'South', 'West']
  const routes = Array.from({ length: 14 }, (_, index) => [index + 1, `RT-${String(index + 101)}`, choose(random, regions)])
  const drivers = Array.from({ length: 22 }, (_, index) => [index + 1, `${choose(random, ['Avery', 'Mina', 'Theo', 'Jules', 'Rae'])} ${choose(random, ['Chen', 'Morgan', 'Singh', 'Hayes'])}`, choose(random, regions)])
  const shipments = Array.from({ length: 180 }, (_, index) => [index + 1, 1 + Math.floor(random() * routes.length), 1 + Math.floor(random() * drivers.length), 9000 + Math.floor(random() * 230000), random() > .2 ? 'delivered' : 'delayed', `2025-${String(1 + Math.floor(random() * 6)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`])
  return makeCase('freight', seed, mode, 'The delayed network', 'A logistics case tracing where expensive delays are taking root.', [
    table('routes', ['id', 'code', 'region'], routes, 'CREATE TABLE routes (id INTEGER PRIMARY KEY, code TEXT NOT NULL, region TEXT NOT NULL)', 'INSERT INTO routes VALUES (?, ?, ?)'),
    table('drivers', ['id', 'name', 'home_region'], drivers, 'CREATE TABLE drivers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, home_region TEXT NOT NULL)', 'INSERT INTO drivers VALUES (?, ?, ?)'),
    table('shipments', ['id', 'route_id', 'driver_id', 'cost_cents', 'status', 'dispatched_on'], shipments, 'CREATE TABLE shipments (id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL, driver_id INTEGER NOT NULL, cost_cents INTEGER NOT NULL, status TEXT NOT NULL, dispatched_on TEXT NOT NULL)', 'INSERT INTO shipments VALUES (?, ?, ?, ?, ?, ?)'),
  ], objectives(mode,
    [objective('west-routes', 'Map western routes', 'Return the code and region for every route in the West region.', "SELECT code, region FROM routes WHERE region = 'West';"), objective('delayed-drivers', 'Identify delayed shipments', 'Return each delayed shipment id, driver name, and route code.', "SELECT s.id, d.name, r.code FROM shipments s JOIN drivers d ON d.id = s.driver_id JOIN routes r ON r.id = s.route_id WHERE s.status = 'delayed';"), objective('expensive-shipments', 'Inspect costly shipments', 'Return the five most costly shipment ids and costs, highest first.', 'SELECT id, cost_cents FROM shipments ORDER BY cost_cents DESC LIMIT 5;', 'required')],
    [objective('regional-cost', 'Compare route costs', 'Return every route region and its total shipment cost.', 'SELECT r.region, SUM(s.cost_cents) FROM routes r JOIN shipments s ON s.route_id = r.id GROUP BY r.region;'), objective('expensive-routes', 'Find expensive routes', 'Return the three routes with the highest total shipment cost, highest first.', 'SELECT r.code, SUM(s.cost_cents) total FROM routes r JOIN shipments s ON s.route_id = r.id GROUP BY r.id ORDER BY total DESC LIMIT 3;', 'required'), objective('driver-coverage', 'Measure driver coverage', 'Return every driver name and their shipment count.', 'SELECT d.name, COUNT(s.id) FROM drivers d LEFT JOIN shipments s ON s.driver_id = d.id GROUP BY d.id;')],
    [objective('delay-free-drivers', 'Find delay-free drivers', 'Return the names of drivers with no delayed shipments.', "SELECT d.name FROM drivers d LEFT JOIN shipments s ON s.driver_id = d.id AND s.status = 'delayed' WHERE s.id IS NULL;"), objective('monthly-cost', 'Establish the cost trend', 'Return every shipment month and its total cost, in chronological order.', 'SELECT substr(dispatched_on, 1, 7), SUM(cost_cents) FROM shipments GROUP BY 1 ORDER BY 1;', 'required'), objective('route-ranking', 'Rank the costly routes', 'Return the five costliest routes with their totals and rank, highest first.', 'WITH totals AS (SELECT r.code, SUM(s.cost_cents) total FROM routes r JOIN shipments s ON s.route_id = r.id GROUP BY r.id) SELECT code, total, ROW_NUMBER() OVER (ORDER BY total DESC) FROM totals ORDER BY 3 LIMIT 5;', 'required')],
  ))
}

function marketplaceCase(seed: string, mode: Difficulty): GeneratedCase {
  const random = randomFor(seed)
  const regions = ['North', 'East', 'South', 'West']
  const sellers = Array.from({ length: 24 }, (_, index) => [index + 1, `${choose(random, ['Arc', 'Cedar', 'Golden', 'Harbor', 'Pixel'])} ${choose(random, ['Market', 'Goods', 'Supply', 'Studio'])}`, choose(random, regions)])
  const listings = Array.from({ length: 76 }, (_, index) => [index + 1, 1 + Math.floor(random() * sellers.length), choose(random, ['home', 'outdoor', 'tech', 'apparel'])])
  const orders = Array.from({ length: 190 }, (_, index) => [index + 1, 1 + Math.floor(random() * listings.length), 1200 + Math.floor(random() * 150000), `2025-${String(1 + Math.floor(random() * 6)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`])
  const returns = orders.filter(() => random() < .16).map(([id], index) => [index + 1, id, choose(random, ['damaged', 'late', 'incorrect'])])
  return makeCase('marketplace', seed, mode, 'The return spiral', 'A marketplace case connecting seller performance, orders, and customer returns.', [
    table('sellers', ['id', 'name', 'region'], sellers, 'CREATE TABLE sellers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL)', 'INSERT INTO sellers VALUES (?, ?, ?)'),
    table('listings', ['id', 'seller_id', 'category'], listings, 'CREATE TABLE listings (id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL, category TEXT NOT NULL)', 'INSERT INTO listings VALUES (?, ?, ?)'),
    table('orders', ['id', 'listing_id', 'amount_cents', 'ordered_on'], orders, 'CREATE TABLE orders (id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, ordered_on TEXT NOT NULL)', 'INSERT INTO orders VALUES (?, ?, ?, ?)'),
    table('returns', ['id', 'order_id', 'reason'], returns, 'CREATE TABLE returns (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, reason TEXT NOT NULL)', 'INSERT INTO returns VALUES (?, ?, ?)'),
  ], objectives(mode,
    [objective('northern-sellers', 'Map northern sellers', 'Return the name and region for every seller in the North region.', "SELECT name, region FROM sellers WHERE region = 'North';"), objective('tech-listings', 'Locate tech listings', 'Return the seller name and listing id for every tech listing.', "SELECT s.name, l.id FROM sellers s JOIN listings l ON l.seller_id = s.id WHERE l.category = 'tech';"), objective('largest-orders', 'Inspect the largest orders', 'Return the five largest order ids and amounts, highest first.', 'SELECT id, amount_cents FROM orders ORDER BY amount_cents DESC LIMIT 5;', 'required')],
    [objective('category-sales', 'Compare category sales', 'Return every listing category and its total order amount.', 'SELECT l.category, SUM(o.amount_cents) FROM listings l JOIN orders o ON o.listing_id = l.id GROUP BY l.category;'), objective('top-sellers', 'Find the largest sellers', 'Return the three sellers with the highest total order amount, highest first.', 'SELECT s.name, SUM(o.amount_cents) total FROM sellers s JOIN listings l ON l.seller_id = s.id JOIN orders o ON o.listing_id = l.id GROUP BY s.id ORDER BY total DESC LIMIT 3;', 'required'), objective('return-coverage', 'Measure return coverage', 'Return every seller name and their number of returned orders.', 'SELECT s.name, COUNT(r.id) FROM sellers s LEFT JOIN listings l ON l.seller_id = s.id LEFT JOIN orders o ON o.listing_id = l.id LEFT JOIN returns r ON r.order_id = o.id GROUP BY s.id;')],
    [objective('return-free-sellers', 'Find return-free sellers', 'Return the names of sellers with no returned orders.', 'SELECT s.name FROM sellers s LEFT JOIN listings l ON l.seller_id = s.id LEFT JOIN orders o ON o.listing_id = l.id LEFT JOIN returns r ON r.order_id = o.id GROUP BY s.id HAVING COUNT(r.id) = 0;'), objective('monthly-sales', 'Establish the sales trend', 'Return every order month and its total amount, in chronological order.', 'SELECT substr(ordered_on, 1, 7), SUM(amount_cents) FROM orders GROUP BY 1 ORDER BY 1;', 'required'), objective('seller-ranking', 'Rank the leading sellers', 'Return the five highest-volume sellers with their totals and rank, highest first.', 'WITH totals AS (SELECT s.name, SUM(o.amount_cents) total FROM sellers s JOIN listings l ON l.seller_id = s.id JOIN orders o ON o.listing_id = l.id GROUP BY s.id) SELECT name, total, ROW_NUMBER() OVER (ORDER BY total DESC) FROM totals ORDER BY 3 LIMIT 5;', 'required')],
  ))
}

function researchCase(seed: string, mode: Difficulty): GeneratedCase {
  const random = randomFor(seed)
  const divisions = ['Bio', 'Climate', 'Materials', 'Systems']
  const researchers = Array.from({ length: 20 }, (_, index) => [index + 1, `${choose(random, ['Avery', 'Mina', 'Theo', 'Jules'])} ${choose(random, ['Chen', 'Morgan', 'Singh', 'Hayes'])}`, choose(random, divisions)])
  const experiments = Array.from({ length: 58 }, (_, index) => [index + 1, 1 + Math.floor(random() * researchers.length), choose(random, ['cell', 'water', 'alloy', 'sensor']), `2025-${String(1 + Math.floor(random() * 6)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`])
  const observations = experiments.flatMap(([id]) => Array.from({ length: random() > .18 ? 1 + Math.floor(random() * 4) : 0 }, (_, index) => [Number(id) * 10 + index, id, 20 + Math.floor(random() * 900), random() > .16 ? 'verified' : 'flagged']))
  return makeCase('research', seed, mode, 'The contaminated signal', 'A research case tracing suspicious readings through experiments and validation records.', [
    table('researchers', ['id', 'name', 'division'], researchers, 'CREATE TABLE researchers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, division TEXT NOT NULL)', 'INSERT INTO researchers VALUES (?, ?, ?)'),
    table('experiments', ['id', 'researcher_id', 'discipline', 'started_on'], experiments, 'CREATE TABLE experiments (id INTEGER PRIMARY KEY, researcher_id INTEGER NOT NULL, discipline TEXT NOT NULL, started_on TEXT NOT NULL)', 'INSERT INTO experiments VALUES (?, ?, ?, ?)'),
    table('observations', ['id', 'experiment_id', 'signal', 'status'], observations, 'CREATE TABLE observations (id INTEGER PRIMARY KEY, experiment_id INTEGER NOT NULL, signal INTEGER NOT NULL, status TEXT NOT NULL)', 'INSERT INTO observations VALUES (?, ?, ?, ?)'),
  ], objectives(mode,
    [objective('bio-researchers', 'Map the bio division', 'Return the name and division for every Bio researcher.', "SELECT name, division FROM researchers WHERE division = 'Bio';"), objective('flagged-observations', 'Locate flagged observations', 'Return each flagged observation id, researcher name, and discipline.', "SELECT o.id, r.name, e.discipline FROM observations o JOIN experiments e ON e.id = o.experiment_id JOIN researchers r ON r.id = e.researcher_id WHERE o.status = 'flagged';"), objective('largest-signals', 'Inspect largest signals', 'Return the five largest observation ids and signals, highest first.', 'SELECT id, signal FROM observations ORDER BY signal DESC LIMIT 5;', 'required')],
    [objective('division-signals', 'Compare division signals', 'Return every researcher division and its total signal.', 'SELECT r.division, SUM(o.signal) FROM researchers r JOIN experiments e ON e.researcher_id = r.id JOIN observations o ON o.experiment_id = e.id GROUP BY r.division;'), objective('top-researchers', 'Find the highest-signal researchers', 'Return the three researchers with the highest total signal, highest first.', 'SELECT r.name, SUM(o.signal) total FROM researchers r JOIN experiments e ON e.researcher_id = r.id JOIN observations o ON o.experiment_id = e.id GROUP BY r.id ORDER BY total DESC LIMIT 3;', 'required'), objective('experiment-coverage', 'Measure observation coverage', 'Return every experiment id and its observation count.', 'SELECT e.id, COUNT(o.id) FROM experiments e LEFT JOIN observations o ON o.experiment_id = e.id GROUP BY e.id;')],
    [objective('unobserved-experiments', 'Find unobserved experiments', 'Return the ids of experiments without observations.', 'SELECT e.id FROM experiments e LEFT JOIN observations o ON o.experiment_id = e.id WHERE o.id IS NULL;'), objective('monthly-signal', 'Establish the signal trend', 'Return every experiment month and its total signal, in chronological order.', 'SELECT substr(e.started_on, 1, 7), SUM(o.signal) FROM experiments e JOIN observations o ON o.experiment_id = e.id GROUP BY 1 ORDER BY 1;', 'required'), objective('researcher-ranking', 'Rank the researchers', 'Return the five highest-signal researchers with totals and rank, highest first.', 'WITH totals AS (SELECT r.name, SUM(o.signal) total FROM researchers r JOIN experiments e ON e.researcher_id = r.id JOIN observations o ON o.experiment_id = e.id GROUP BY r.id) SELECT name, total, ROW_NUMBER() OVER (ORDER BY total DESC) FROM totals ORDER BY 3 LIMIT 5;', 'required')],
  ))
}

function eventsCase(seed: string, mode: Difficulty): GeneratedCase {
  const random = randomFor(seed)
  const cities = ['Portland', 'Austin', 'Denver', 'Raleigh']
  const venues = Array.from({ length: 16 }, (_, index) => [index + 1, `${choose(random, ['Harbor', 'Atlas', 'Civic', 'Juniper'])} ${choose(random, ['Hall', 'Stage', 'Center', 'Pavilion'])}`, choose(random, cities)])
  const events = Array.from({ length: 54 }, (_, index) => [index + 1, 1 + Math.floor(random() * venues.length), choose(random, ['music', 'comedy', 'sport', 'talk']), `2025-${String(1 + Math.floor(random() * 6)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`])
  const tickets = Array.from({ length: 180 }, (_, index) => [index + 1, 1 + Math.floor(random() * events.length), 1500 + Math.floor(random() * 18000), random() > .14 ? 'sold' : 'refunded'])
  return makeCase('events', seed, mode, 'The empty house', 'An event operations case connecting venues, programming, ticket sales, and refunds.', [
    table('venues', ['id', 'name', 'city'], venues, 'CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL)', 'INSERT INTO venues VALUES (?, ?, ?)'),
    table('events', ['id', 'venue_id', 'category', 'held_on'], events, 'CREATE TABLE events (id INTEGER PRIMARY KEY, venue_id INTEGER NOT NULL, category TEXT NOT NULL, held_on TEXT NOT NULL)', 'INSERT INTO events VALUES (?, ?, ?, ?)'),
    table('tickets', ['id', 'event_id', 'price_cents', 'status'], tickets, 'CREATE TABLE tickets (id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, price_cents INTEGER NOT NULL, status TEXT NOT NULL)', 'INSERT INTO tickets VALUES (?, ?, ?, ?)'),
  ], objectives(mode,
    [objective('austin-venues', 'Map Austin venues', 'Return the name and city for every venue in Austin.', "SELECT name, city FROM venues WHERE city = 'Austin';"), objective('refunded-tickets', 'Locate refunded tickets', 'Return each refunded ticket id, venue name, and event category.', "SELECT t.id, v.name, e.category FROM tickets t JOIN events e ON e.id = t.event_id JOIN venues v ON v.id = e.venue_id WHERE t.status = 'refunded';"), objective('highest-tickets', 'Inspect expensive tickets', 'Return the five most expensive ticket ids and prices, highest first.', 'SELECT id, price_cents FROM tickets ORDER BY price_cents DESC LIMIT 5;', 'required')],
    [objective('category-sales', 'Compare category sales', 'Return every event category and its total ticket revenue.', "SELECT e.category, SUM(t.price_cents) FROM events e JOIN tickets t ON t.event_id = e.id WHERE t.status = 'sold' GROUP BY e.category;"), objective('top-venues', 'Find the top venues', 'Return the three venues with the highest sold-ticket revenue, highest first.', "SELECT v.name, SUM(t.price_cents) total FROM venues v JOIN events e ON e.venue_id = v.id JOIN tickets t ON t.event_id = e.id WHERE t.status = 'sold' GROUP BY v.id ORDER BY total DESC LIMIT 3;", 'required'), objective('ticket-coverage', 'Measure ticket coverage', 'Return every event id and its ticket count.', 'SELECT e.id, COUNT(t.id) FROM events e LEFT JOIN tickets t ON t.event_id = e.id GROUP BY e.id;')],
    [objective('refund-free-events', 'Find refund-free events', 'Return the ids of events with no refunded tickets.', "SELECT e.id FROM events e LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'refunded' WHERE t.id IS NULL;"), objective('monthly-sales', 'Establish the revenue trend', 'Return every event month and its sold-ticket revenue, in chronological order.', "SELECT substr(e.held_on, 1, 7), SUM(t.price_cents) FROM events e JOIN tickets t ON t.event_id = e.id WHERE t.status = 'sold' GROUP BY 1 ORDER BY 1;", 'required'), objective('venue-ranking', 'Rank the venues', 'Return the five highest-revenue venues with totals and rank, highest first.', "WITH totals AS (SELECT v.name, SUM(t.price_cents) total FROM venues v JOIN events e ON e.venue_id = v.id JOIN tickets t ON t.event_id = e.id WHERE t.status = 'sold' GROUP BY v.id) SELECT name, total, ROW_NUMBER() OVER (ORDER BY total DESC) FROM totals ORDER BY 3 LIMIT 5;", 'required')],
  ))
}

function objective(id: string, title: string, prompt: string, starterQuery: string, order: Objective['order'] = 'irrelevant'): Objective {
  return { id, title, prompt, starterQuery, order }
}

function table(name: string, columns: string[], rows: Value[][], create: string, insert: string): TableLoad & { definition: TableDefinition } {
  return { create, insert, rows, definition: { name, columns, rowCount: rows.length } }
}

function makeCase(caseId: CaseId, seed: string, mode: Difficulty, caseName: string, caseSummary: string, tables: Array<TableLoad & { definition: TableDefinition }>, objectives: Objective[]): GeneratedCase {
  const solutions = new Map(objectives.map((item) => [item.id, item.starterQuery]))
  const visibleObjectives = objectives.map((item) => ({ ...item, starterQuery: mode === 'easy' ? starterFor(item.starterQuery) : '' }))
  return { world: { seed, mode, caseId, caseName, caseSummary, tables: tables.map((entry) => entry.definition), objectives: visibleObjectives }, loads: tables.map(({ create, insert, rows }) => ({ create, insert, rows })), solutions }
}

function starterFor(solution: string) {
  const source = solution.match(/\bFROM\s+([\w]+)/i)?.[1]
  return source ? `SELECT\nFROM ${source};` : 'SELECT\nFROM'
}

export function buildCase(seed: string, mode: Difficulty): GeneratedCase {
  const builders = [marginCase, freightCase, marketplaceCase, researchCase, eventsCase]
  return builders[hash(seed) % builders.length](seed, mode)
}
