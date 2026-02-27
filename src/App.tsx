import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import JSZip from 'jszip'
import './App.css'
import XmlToExcelTool from './components/XmlToExcelTool'
import visitorLogo from './assets/visitor-logo.png'

type CsvData = {
  headers: string[]
  rows: string[][]
}

type MatchItem = {
  path: string
  name: string
  ext: '.prw' | '.tlpp'
  foundInCsv?: boolean
}

type XmlExcelRoutine = 's-5002' | 's-5011' | 's-5501'

type XmlExcelRoutineOption = {
  id: XmlExcelRoutine
  label: string
  available: boolean
}

const MAX_PREVIEW_ROWS = 8

const XML_EXCEL_ROUTINES: XmlExcelRoutineOption[] = [
  { id: 's-5002', label: 'Item S-5002', available: true },
  { id: 's-5011', label: 'Item S-5011', available: false },
  { id: 's-5501', label: 'Item S-5501', available: false },
]

function extractCsvNames(csvData: CsvData | null): Set<string> {
  if (!csvData) return new Set()
  const names = new Set<string>()
  csvData.rows.forEach((row) => {
    row.forEach((cell) => {
      const trimmed = cell.trim().toLowerCase()
      if (!trimmed) return

      const normalized = trimmed.replace(/\\/g, '/')
      const baseName = normalized.split('/').pop() || normalized
      if (!/\.(prw|tlpp)$/i.test(baseName)) return

      const nameWithoutExt = baseName.replace(/\.(prw|tlpp)$/i, '')
      names.add(nameWithoutExt)
    })
  })
  return names
}

const EXCLUDED_FILES = new Set(['_binary_class', '_binary_functions'])

function isExcludedFile(item: MatchItem): boolean {
  const nameWithoutExt = item.name.replace(/\.(prw|tlpp)$/i, '').toLowerCase()
  return EXCLUDED_FILES.has(nameWithoutExt)
}

function parseCsv(text: string): CsvData {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && (char === ';' || char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1
      }
      current.push(field)
      field = ''
      if (char === '\n' || char === '\r') {
        rows.push(current)
        current = []
      }
      continue
    }

    field += char
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }

  const headers = rows[0] ?? []
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0))

  return { headers, rows: dataRows }
}

function toCsv(rows: string[][], headers: string[], separator = ','): string {
  const escape = (value: string) => {
    const needsQuotes = /[",\n\r]/.test(value)
    const escaped = value.replace(/"/g, '""')
    return needsQuotes ? `"${escaped}"` : escaped
  }

  const lines = [headers, ...rows].map((row) => row.map((cell) => escape(cell ?? '')).join(separator))
  return `${lines.join('\n')}\n`
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  includeSubfolders: boolean,
  pathPrefix: string,
  results: MatchItem[],
): Promise<void> {
  const iterableHandle = dirHandle as FileSystemDirectoryHandle & {
    values: () => AsyncIterableIterator<FileSystemHandle>
  }

  for await (const entry of iterableHandle.values()) {
    if (entry.kind === 'file') {
      const lower = entry.name.toLowerCase()
      if (lower.endsWith('.prw') || lower.endsWith('.tlpp')) {
        const ext = lower.endsWith('.prw') ? '.prw' : '.tlpp'
        results.push({
          name: entry.name,
          ext,
          path: pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name,
        })
      }
    } else if (entry.kind === 'directory' && includeSubfolders) {
      await scanDirectory(
        entry as FileSystemDirectoryHandle,
        includeSubfolders,
        pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name,
        results,
      )
    }
  }
}

async function scanCompressedFiles(
  files: FileList,
  results: MatchItem[],
): Promise<void> {
  for (const file of Array.from(files)) {
    try {
      const zip = new JSZip()
      const contents = await zip.loadAsync(file)
      
      Object.keys(contents.files).forEach((path) => {
        const lower = path.toLowerCase()
        if (lower.endsWith('.prw') || lower.endsWith('.tlpp')) {
          const ext = lower.endsWith('.prw') ? '.prw' : '.tlpp'
          const fileName = path.split('/').pop() || path
          results.push({
            name: fileName,
            ext,
            path: `${file.name}/${path}`,
          })
        }
      })
    } catch (error) {
      console.error(`Erro ao processar arquivo ${file.name}:`, error)
    }
  }
}

function App() {
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)

  const [directoryName, setDirectoryName] = useState<string | null>(null)
  const [matches, setMatches] = useState<MatchItem[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [includeSubfolders, setIncludeSubfolders] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [showOnlyNotFound, setShowOnlyNotFound] = useState(false)
  const [showSourceMenu, setShowSourceMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState<'home' | 'process' | 'xml-excel'>('home')
  const [xmlExcelRoutine, setXmlExcelRoutine] = useState<XmlExcelRoutine>('s-5002')
  const sourceMenuRef = useRef<HTMLDivElement | null>(null)

  const csvNames = useMemo(() => extractCsvNames(csvData), [csvData])

  useEffect(() => {
    if (!showSourceMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && sourceMenuRef.current && !sourceMenuRef.current.contains(target)) {
        setShowSourceMenu(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [showSourceMenu])

  const filteredMatches = useMemo(() => {
    let result = matches
    
    if (showOnlyNotFound) {
      result = result.filter((item) => !item.foundInCsv)
    }
    
    const term = filterText.trim().toLowerCase()
    if (!term) return result
    return result.filter((item) => item.path.toLowerCase().includes(term))
  }, [filterText, matches, showOnlyNotFound])

  const selectedXmlRoutine = useMemo(
    () => XML_EXCEL_ROUTINES.find((item) => item.id === xmlExcelRoutine) ?? XML_EXCEL_ROUTINES[0],
    [xmlExcelRoutine],
  )

  const handleExportReport = () => {
    const reportMatches = matches.filter((item) => item.ext === '.prw' || item.ext === '.tlpp')
    if (!reportMatches.length) return
    const total = reportMatches.length
    const found = reportMatches.filter((item) => item.foundInCsv).length
    const notFound = total - found
    const foundPct = total ? ((found / total) * 100).toFixed(2).replace('.', ',') : '0,00'
    const notFoundPct = total ? ((notFound / total) * 100).toFixed(2).replace('.', ',') : '0,00'

    const summaryHeaders = ['Metrica', 'Valor']
    const summaryRows = [
      ['Total de arquivos na pasta/zip', String(total)],
      ['Encontrados no CSV', String(found)],
      ['Nao encontrados no CSV', String(notFound)],
      ['Percentual encontrados', `${foundPct}%`],
      ['Percentual nao encontrados', `${notFoundPct}%`],
    ]

    const detailHeaders = ['Status', 'Extensao', 'Nome', 'Caminho']
    const detailRows = reportMatches.map((item) => [
      item.foundInCsv ? 'Encontrado' : 'Nao encontrado',
      item.ext,
      item.name,
      item.path,
    ])

    const separator = ';'
    const summaryCsv = toCsv(summaryRows, summaryHeaders, separator)
    const detailCsv = toCsv(detailRows, detailHeaders, separator)
    const csv = `${summaryCsv}\n${detailCsv}`
    const fileName = `relatorio-comparacao-${new Date().toISOString().slice(0, 10)}.csv`
    downloadCsv(fileName, csv)
  }

  const handleCsvChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvError(null)
    setCsvFileName(file.name)

    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      setCsvData(parsed)
    } catch (error) {
      setCsvError('Não foi possível ler o arquivo CSV.')
      setCsvData(null)
    }
  }

  const handlePickDirectory = async () => {
    setScanError(null)
    setMatches([])
    if (!window.showDirectoryPicker) {
      setScanError('Seu navegador não suporta seleção de pasta.')
      return
    }

    try {
      setIsScanning(true)
      const handle = await window.showDirectoryPicker()
      setDirectoryName(handle.name)
      const results: MatchItem[] = []
      await scanDirectory(handle, includeSubfolders, '', results)
      results.forEach((item) => {
        const nameWithoutExt = item.name.replace(/\.(prw|tlpp)$/i, '').toLowerCase()
        item.foundInCsv = csvNames.has(nameWithoutExt)
      })
      const filtered = results.filter((item) => !isExcludedFile(item))
      filtered.sort((a, b) => a.path.localeCompare(b.path))
      setMatches(filtered)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setScanError('Não foi possível acessar a pasta selecionada.')
      }
    } finally {
      setIsScanning(false)
    }
  }

  const handleCompressedFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    
    setScanError(null)
    setMatches([])
    setDirectoryName(null)
    
    try {
      setIsScanning(true)
      const results: MatchItem[] = []
      await scanCompressedFiles(files, results)
      results.forEach((item) => {
        const nameWithoutExt = item.name.replace(/\.(prw|tlpp)$/i, '').toLowerCase()
        item.foundInCsv = csvNames.has(nameWithoutExt)
      })
      const filtered = results.filter((item) => !isExcludedFile(item))
      filtered.sort((a, b) => a.path.localeCompare(b.path))
      setMatches(filtered)
    } catch (error) {
      setScanError('Erro ao processar arquivos compactados.')
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <div className="sidebar__title">Visitor Tools</div>
            <img src={visitorLogo} alt="Visitor Tools" className="sidebar__logo" />
          </div>
        </div>
        <nav className="sidebar__nav">
          <button
            type="button"
            className={`sidebar__link ${currentPage === 'home' ? 'sidebar__link--active' : ''}`}
            onClick={() => {
              setCurrentPage('home')
              setShowSourceMenu(false)
            }}
            aria-current={currentPage === 'home' ? 'page' : undefined}
          >
            <span className="sidebar__icon">VT</span>
            <span>Visitor Tools</span>
          </button>
          <button
            type="button"
            className={`sidebar__link ${currentPage === 'process' ? 'sidebar__link--active' : ''}`}
            onClick={() => {
              setCurrentPage('process')
              setShowSourceMenu(false)
            }}
            aria-current={currentPage === 'process' ? 'page' : undefined}
          >
            <span className="sidebar__icon">CP</span>
            <span>Comparar Projeto</span>
          </button>
          <button
            type="button"
            className={`sidebar__link ${currentPage === 'xml-excel' ? 'sidebar__link--active' : ''}`}
            onClick={() => {
              setCurrentPage('xml-excel')
              setXmlExcelRoutine('s-5002')
              setShowSourceMenu(false)
            }}
            aria-current={currentPage === 'xml-excel' ? 'page' : undefined}
          >
            <span className="sidebar__icon">XE</span>
            <span>XML para Excel</span>
          </button>
          {currentPage === 'xml-excel' && (
            <div className="sidebar__subnav" aria-label="Rotinas XML para Excel">
              {XML_EXCEL_ROUTINES.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  className={`sidebar__sublink ${xmlExcelRoutine === routine.id ? 'sidebar__sublink--active' : ''}`}
                  onClick={() => {
                    setCurrentPage('xml-excel')
                    setXmlExcelRoutine(routine.id)
                    setShowSourceMenu(false)
                  }}
                  aria-current={xmlExcelRoutine === routine.id ? 'page' : undefined}
                >
                  {routine.label}
                  {!routine.available ? ' (em breve)' : ''}
                </button>
              ))}
            </div>
          )}
        </nav>
        <div className="sidebar__spacer" />
      </aside>
      <div className="app">
        <header className="app__header">
          <div>
            <h1>
              {currentPage === 'home'
                ? 'Visitor Tools'
                : currentPage === 'process'
                  ? 'Compara Projeto'
                  : `XML para Excel • ${selectedXmlRoutine.id.toUpperCase()}`}
            </h1>
            <p className="app__subtitle">
              {currentPage === 'home'
                ? 'Central de ferramentas da Visitor Consultoria.'
                : currentPage === 'process'
                  ? 'Comparar projeto com o inspetor de objetos'
                  : 'Consolidação de múltiplos XMLs do eSocial em uma única planilha Excel'}
            </p>
          </div>
        </header>

        {currentPage === 'home' ? (
          <div className="home">
            <section className="card home-hero">
              <h2>Visitor Tools</h2>
              <p>
                Organize e execute tarefas de apoio para projetos da Visitor Consultoria em um
                unico lugar.
              </p>
              <div className="home-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => setCurrentPage('process')}
                >
                  Abrir Comparar Projeto
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setCurrentPage('xml-excel')}
                >
                  Abrir XML para Excel
                </button>
              </div>
            </section>
            <div className="grid">
              <section className="card home-tool">
                <h3>Comparar Projeto</h3>
                <p>Importe o CSV do inspetor e compare com arquivos da pasta ou zip.</p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setCurrentPage('process')}
                >
                  Acessar
                </button>
              </section>
              <section className="card home-tool">
                <h3>XML para Excel</h3>
                <p>Leia múltiplos XMLs e consolide tudo em uma única planilha .xlsx.</p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setCurrentPage('xml-excel')}
                >
                  Acessar
                </button>
              </section>
            </div>
          </div>
        ) : currentPage === 'process' ? (
        <div className="grid">
        <section className="card">
          <h2>1) Importar arquivo CSV</h2>
          <label className="file-input">
            <input type="file" accept=".csv" onChange={handleCsvChange} />
            <span>Selecionar CSV</span>
          </label>
          {csvFileName && <p className="muted">Arquivo: {csvFileName}</p>}
          {csvError && <p className="error">{csvError}</p>}
          {csvData && (
            <div className="csv-preview">
              <div className="csv-summary">
                <span>Colunas: {csvData.headers.length}</span>
                <span>Linhas: {csvData.rows.length}</span>
              </div>
              <div className="csv-table">
                <table>
                  <thead>
                    <tr>
                      {csvData.headers.map((header, index) => (
                        <th key={`${header}-${index}`}>{header || `Coluna ${index + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.rows.slice(0, MAX_PREVIEW_ROWS).map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {csvData.headers.map((_, colIndex) => (
                          <td key={`cell-${rowIndex}-${colIndex}`}>{row[colIndex] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvData.rows.length > MAX_PREVIEW_ROWS && (
                <p className="muted">Pré-visualização limitada a {MAX_PREVIEW_ROWS} linhas.</p>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2>2) Selecionar pasta ou arquivos compactados</h2>
          <div className="controls" style={{ position: 'relative' }}>
            <div ref={sourceMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className="button-primary"
                onClick={() => setShowSourceMenu(!showSourceMenu)}
                disabled={isScanning}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {isScanning ? 'Escaneando...' : 'Selecionar fonte'}
                <span style={{ fontSize: '0.75rem' }}>▼</span>
              </button>
              {showSourceMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    background: '#fff',
                    border: '1px solid #d8e3df',
                    borderRadius: '10px',
                    minWidth: '200px',
                    marginTop: '0.5rem',
                    boxShadow: '0 4px 12px rgba(15, 61, 53, 0.12)',
                    zIndex: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowSourceMenu(false)
                      handlePickDirectory()
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      color: '#203b35',
                      borderBottom: '1px solid #e4ebe8',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f0f7f5'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    📁 Pasta local
                  </button>
                  <label
                    style={{
                      display: 'block',
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      color: '#203b35',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f0f7f5'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <input
                      type="file"
                      accept=".zip,.rar,.7z"
                      onChange={(e) => {
                        handleCompressedFilesChange(e)
                        setShowSourceMenu(false)
                      }}
                      disabled={isScanning}
                      multiple
                      style={{ display: 'none' }}
                    />
                    📦 Arquivos compactados
                  </label>
                </div>
              )}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeSubfolders}
                onChange={(event) => setIncludeSubfolders(event.target.checked)}
              />
              Incluir subpastas
            </label>
          </div>
          {directoryName && <p className="muted">Pasta: {directoryName}</p>}
          {scanError && <p className="error">{scanError}</p>}

          <div className="results">
            <div className="results__header">
              <div>
                <strong>{matches.length}</strong> arquivo(s) encontrado(s)
                {csvData && (
                  <>
                    <span> • </span>
                    <span style={{ color: '#2f8f74' }}>
                      <strong>{matches.filter((m) => m.foundInCsv).length}</strong> no CSV
                    </span>
                    <span> • </span>
                    <span style={{ color: '#d97706' }}>
                      <strong>{matches.filter((m) => !m.foundInCsv).length}</strong> não encontrado
                    </span>
                  </>
                )}
              </div>
              <div className="results__actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleExportReport}
                  disabled={!matches.length}
                >
                  Gerar relatorio
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              {csvData && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={showOnlyNotFound}
                    onChange={(event) => setShowOnlyNotFound(event.target.checked)}
                  />
                  Mostrar apenas não encontrados
                </label>
              )}
              <input
                type="search"
                placeholder="Filtrar por caminho"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                style={{ flex: 1, minWidth: '200px' }}
              />
            </div>
            <ul>
              {filteredMatches.map((item) => (
                <li
                  key={item.path}
                  style={{
                    opacity: csvData ? 1 : 0.7,
                    borderLeft: `4px solid ${item.foundInCsv ? '#2f8f74' : '#d97706'}`,
                    paddingLeft: '0.75rem',
                  }}
                >
                  <span className={`badge badge--${item.ext.replace('.', '')}`}>{item.ext}</span>
                  <span>{item.path}</span>
                  {csvData && (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.875rem',
                        color: item.foundInCsv ? '#2f8f74' : '#d97706',
                        fontWeight: 500,
                      }}
                    >
                      {item.foundInCsv ? '✓ No CSV' : '✗ Não encontrado'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!filteredMatches.length && <p className="muted">Nenhum arquivo listado.</p>}
          </div>
        </section>
        </div>
        ) : xmlExcelRoutine === 's-5002' ? (
          <XmlToExcelTool />
        ) : (
          <section className="card">
            <h2>{selectedXmlRoutine.label}</h2>
            <p className="muted">Esta rotina estará disponível em breve.</p>
          </section>
        )}
      </div>
    </div>
  )
}

export default App
