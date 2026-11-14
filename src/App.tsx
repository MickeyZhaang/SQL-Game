import { useEffect, useRef, useState } from 'react'
import type { QueryResult, WorkerMessage, World } from './game/types'
import GameWorker from './game/worker?worker'
import './App.css'

const storageKey = 'sql-game-current-seed'
const minimumLoadingTime = 3400

function newSeed() {
  return crypto.randomUUID().slice(0, 8)
}

function App() {
  const worker = useRef<Worker | null>(null)
  const loadingStartedAt = useRef(0)
  const latestSeed = useRef('')
  const readyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [seed, setSeed] = useState(() => localStorage.getItem(storageKey) ?? newSeed())
  const [world, setWorld] = useState<World | null>(null)
  const [progress, setProgress] = useState({ label: 'Preparing your case file', progress: 0 })
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const instance = new GameWorker()
    worker.current = instance
    instance.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') setProgress({ label: message.label, progress: message.progress })
      if (message.type === 'ready') {
        if (message.world.seed !== latestSeed.current) return
        const remainingTime = Math.max(0, minimumLoadingTime - (performance.now() - loadingStartedAt.current))
        setProgress({ label: 'Finalizing your case file', progress: 96 })
        clearTimeout(readyTimer.current)
        readyTimer.current = setTimeout(() => {
          setWorld(message.world)
          setQuery(message.world.objective.starterQuery)
          setProgress({ label: 'Workspace ready', progress: 100 })
          setIsLoading(false)
        }, remainingTime)
      }
      if (message.type === 'result') {
        setResult(message.result)
        setError('')
      }
      if (message.type === 'error') setError(message.message)
    }
    return () => {
      clearTimeout(readyTimer.current)
      instance.terminate()
    }
  }, [])

  useEffect(() => {
    latestSeed.current = seed
    loadingStartedAt.current = performance.now()
    localStorage.setItem(storageKey, seed)
    worker.current?.postMessage({ type: 'initialize', seed })
  }, [seed])

  function startLoading() {
    loadingStartedAt.current = performance.now()
    clearTimeout(readyTimer.current)
    setIsLoading(true)
    setResult(null)
    setError('')
    setProgress({ label: 'Preparing your case file', progress: 5 })
  }

  function restart() {
    startLoading()
    worker.current?.postMessage({ type: 'initialize', seed })
  }

  function beginNewRun() {
    startLoading()
    setSeed(newSeed())
  }

  function runQuery() {
    setError('')
    worker.current?.postMessage({ type: 'execute', query })
  }

  if (isLoading || !world) {
    return <main className="loading-shell"><p className="eyebrow">SQL GAME / RUN INITIALIZATION</p><h1>Building a world from <code>{seed}</code></h1><p className="loading-copy">{progress.label}</p><div className="progress-track"><span style={{ width: `${progress.progress}%` }} /></div><p className="loading-note">This exact dataset can be restarted or shared using its seed.</p></main>
  }

  return <main className="game-shell">
    <header>
      <div><p className="eyebrow">ACTIVE CASE</p><h1>{world.caseName}</h1></div>
      <div className="run-controls"><span>Seed <code>{world.seed}</code></span><button onClick={restart}>Restart run</button><button className="primary" onClick={beginNewRun}>New run</button></div>
    </header>
    <section className="case-file"><p className="eyebrow">INVESTIGATION 01</p><h2>{world.objective.title}</h2><p>{world.objective.prompt}</p></section>
    <section className="workspace">
      <aside className="schema"><div className="schema-heading"><p className="eyebrow">DATABASE</p><span>SQLite</span></div>{world.tables.map((table) => <section className="table-card" key={table.name}><h3>{table.name}</h3><p>{table.rowCount} records</p><ul>{table.columns.map((column) => <li key={column}>{column}</li>)}</ul></section>)}</aside>
      <section className="editor-panel"><div className="editor-heading"><p className="eyebrow">QUERY</p><button className="run-button" onClick={runQuery}>Run query <kbd>⌘↵</kbd></button></div><textarea aria-label="SQL query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') runQuery() }} spellCheck="false" />{error && <p className="error">{error}</p>}<div className="result-panel"><div className="result-heading"><p className="eyebrow">RESULTS</p>{result?.solved && <span className="solved">Objective complete</span>}</div>{result ? <ResultTable result={result} /> : <p className="empty">Run a query to inspect its result.</p>}</div></section>
    </section>
  </main>
}

function ResultTable({ result }: { result: QueryResult }) {
  if (!result.columns.length) return <p className="empty">Query ran successfully. No rows returned.</p>
  return <div className="table-scroll"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.values.map((row, index) => <tr key={index}>{row.map((value, cellIndex) => <td key={cellIndex}>{value ?? 'NULL'}</td>)}</tr>)}</tbody></table></div>
}

export default App
