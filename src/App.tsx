import { useEffect, useRef, useState } from 'react'
import type { Difficulty, QueryResult, WorkerMessage, World } from './game/types'
import GameWorker from './game/worker?worker'
import './App.css'

const storageKey = 'sql-game-current-seed'
const modeStorageKey = 'sql-game-current-mode'
const minimumLoadingTime = 3400
const modes: Array<{ id: Difficulty; label: string; detail: string }> = [
  { id: 'easy', label: 'Easy', detail: 'Selects and basic joins' },
  { id: 'medium', label: 'Medium', detail: 'Joins and aggregations' },
  { id: 'hard', label: 'Hard', detail: 'Full SQL investigation' },
]

function newSeed() {
  return crypto.randomUUID().slice(0, 8)
}

function runKey(seed: string, mode: Difficulty) {
  return `${seed}:${mode}`
}

function App() {
  const worker = useRef<Worker | null>(null)
  const loadingStartedAt = useRef(0)
  const latestRun = useRef('')
  const currentObjectiveId = useRef('')
  const readyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const progressTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const [seed, setSeed] = useState(() => localStorage.getItem(storageKey) ?? newSeed())
  const [mode, setMode] = useState<Difficulty>(() => (localStorage.getItem(modeStorageKey) as Difficulty | null) ?? 'easy')
  const [world, setWorld] = useState<World | null>(null)
  const [objectiveIndex, setObjectiveIndex] = useState(0)
  const [completedObjectives, setCompletedObjectives] = useState<string[]>([])
  const [progress, setProgress] = useState({ label: 'Preparing your case file', progress: 0 })
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  function startProgressTimer() {
    clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      const elapsed = performance.now() - loadingStartedAt.current
      const timedProgress = Math.min(96, 5 + Math.round((elapsed / minimumLoadingTime) * 91))
      setProgress((current) => ({ ...current, progress: timedProgress }))
    }, 50)
  }

  function startLoading() {
    loadingStartedAt.current = performance.now()
    clearTimeout(readyTimer.current)
    startProgressTimer()
    setIsLoading(true)
    setResult(null)
    setError('')
    setProgress({ label: 'Preparing your case file', progress: 5 })
  }

  useEffect(() => {
    const instance = new GameWorker()
    worker.current = instance
    instance.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') setProgress((current) => ({ ...current, label: message.label }))
      if (message.type === 'ready') {
        if (runKey(message.world.seed, message.world.mode) !== latestRun.current) return
        const remainingTime = Math.max(0, minimumLoadingTime - (performance.now() - loadingStartedAt.current))
        setProgress((current) => ({ ...current, label: 'Finalizing your case file' }))
        clearTimeout(readyTimer.current)
        readyTimer.current = setTimeout(() => {
          if (runKey(message.world.seed, message.world.mode) !== latestRun.current) return
          clearInterval(progressTimer.current)
          currentObjectiveId.current = message.world.objectives[0].id
          setWorld(message.world)
          setObjectiveIndex(0)
          setCompletedObjectives([])
          setQuery(message.world.objectives[0].starterQuery)
          setProgress({ label: 'Workspace ready', progress: 100 })
          setIsLoading(false)
        }, remainingTime)
      }
      if (message.type === 'result') {
        if (message.result.objectiveId !== currentObjectiveId.current) return
        setResult(message.result)
        setError('')
      }
      if (message.type === 'error') setError(message.message)
    }
    return () => {
      clearTimeout(readyTimer.current)
      clearInterval(progressTimer.current)
      instance.terminate()
    }
  }, [])

  useEffect(() => {
    latestRun.current = runKey(seed, mode)
    loadingStartedAt.current = performance.now()
    startProgressTimer()
    localStorage.setItem(storageKey, seed)
    localStorage.setItem(modeStorageKey, mode)
    worker.current?.postMessage({ type: 'initialize', seed, mode })
  }, [seed, mode])

  function restart() {
    startLoading()
    worker.current?.postMessage({ type: 'initialize', seed, mode })
  }

  function beginNewRun() {
    const nextSeed = newSeed()
    latestRun.current = runKey(nextSeed, mode)
    startLoading()
    setSeed(nextSeed)
  }

  function changeMode(nextMode: Difficulty) {
    if (nextMode === mode) return
    latestRun.current = runKey(seed, nextMode)
    startLoading()
    setMode(nextMode)
  }

  function runQuery() {
    if (!currentObjectiveId.current) return
    setError('')
    worker.current?.postMessage({ type: 'execute', objectiveId: currentObjectiveId.current, query })
  }

  function continueInvestigation() {
    if (!world || !result?.solved) return
    setCompletedObjectives((current) => [...new Set([...current, result.objectiveId])])
    const nextIndex = objectiveIndex + 1
    if (nextIndex >= world.objectives.length) return
    const nextObjective = world.objectives[nextIndex]
    currentObjectiveId.current = nextObjective.id
    setObjectiveIndex(nextIndex)
    setQuery(nextObjective.starterQuery)
    setResult(null)
  }

  if (isLoading || !world) {
    return <main className="loading-shell"><p className="eyebrow">SQL GAME / RUN INITIALIZATION</p><h1>Building a <code>{mode}</code> world from <code>{seed}</code></h1><p className="loading-copy">{progress.label}</p><div className="progress-track"><span style={{ width: `${progress.progress}%` }} /></div><p className="loading-note">This exact dataset can be restarted or shared using its seed.</p></main>
  }

  const objective = world.objectives[objectiveIndex]
  const investigationComplete = completedObjectives.length === world.objectives.length

  return <main className="game-shell">
    <header>
      <div><p className="eyebrow">ACTIVE CASE</p><h1>{world.caseName}</h1></div>
      <div className="run-controls"><span>Seed <code>{world.seed}</code></span><button onClick={restart}>Restart run</button><button className="primary" onClick={beginNewRun}>New run</button></div>
    </header>
    <section className="mode-switcher" aria-label="Difficulty mode">{modes.map((option) => <button className={option.id === mode ? 'mode active' : 'mode'} key={option.id} onClick={() => changeMode(option.id)}><span>{option.label}</span><small>{option.detail}</small></button>)}</section>
    <section className="case-file"><p className="eyebrow">{investigationComplete ? 'CASE COMPLETE' : `INVESTIGATION ${String(objectiveIndex + 1).padStart(2, '0')} / ${String(world.objectives.length).padStart(2, '0')}`}</p><h2>{investigationComplete ? 'The case file is complete' : objective.title}</h2><p>{investigationComplete ? 'Start another run to investigate a new deterministic dataset.' : objective.prompt}</p></section>
    <section className="workspace">
      <aside className="schema"><div className="schema-heading"><p className="eyebrow">DATABASE</p><span>SQLite</span></div><div className="finding-count"><span>Findings</span><strong>{completedObjectives.length} / {world.objectives.length}</strong></div>{world.tables.map((table) => <section className="table-card" key={table.name}><h3>{table.name}</h3><p>{table.rowCount} records</p><ul>{table.columns.map((column) => <li key={column}>{column}</li>)}</ul></section>)}</aside>
      <section className="editor-panel"><div className="editor-heading"><p className="eyebrow">QUERY</p><button className="run-button" disabled={investigationComplete} onClick={runQuery}>Run query <kbd>⌘↵</kbd></button></div><textarea aria-label="SQL query" disabled={investigationComplete} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') runQuery() }} spellCheck="false" />{error && <p className="error">{error}</p>}<div className="result-panel"><div className="result-heading"><p className="eyebrow">RESULTS</p>{result?.solved && <span className="solved">Finding confirmed</span>}</div>{result ? <ResultTable result={result} /> : <p className="empty">Run a query to inspect its result.</p>}{result?.solved && !investigationComplete && <div className="continue-row"><p>{objectiveIndex + 1 === world.objectives.length ? 'All findings are confirmed.' : 'This finding unlocks the next lead.'}</p><button className="primary" onClick={continueInvestigation}>{objectiveIndex + 1 === world.objectives.length ? 'Close case' : 'Continue investigation'}</button></div>}</div></section>
    </section>
  </main>
}

function ResultTable({ result }: { result: QueryResult }) {
  if (!result.columns.length) return <p className="empty">Query ran successfully. No rows returned.</p>
  return <div className="table-scroll"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.values.map((row, index) => <tr key={index}>{row.map((value, cellIndex) => <td key={cellIndex}>{value ?? 'NULL'}</td>)}</tr>)}</tbody></table></div>
}

export default App
