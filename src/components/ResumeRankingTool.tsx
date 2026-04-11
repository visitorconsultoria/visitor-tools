import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { jsPDF } from 'jspdf'
import { apiUrl } from '../lib/api'

type MammothModule = {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
}

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null
let mammothModulePromise: Promise<MammothModule> | null = null

async function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href
      return lib
    })
  }
  return pdfjsModulePromise
}

async function loadMammoth() {
  if (!mammothModulePromise) {
    mammothModulePromise = import('mammoth').then((mod) => (mod.default ?? mod) as MammothModule)
  }
  return mammothModulePromise
}

// ─── AI analysis ──────────────────────────────────────────────────────────────

type AiAnalysis = {
  score: number
  resumo: string
  pontos_fortes: string[]
  lacunas: string[]
  habilidades_encontradas: string[]
  habilidades_ausentes: string[]
}

async function analyzeResume(
  resumeText: string,
  jobDescription: string,
): Promise<AiAnalysis> {
  const response = await fetch(apiUrl('/api/resume-ranking/analyze'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resumeText,
      jobDescription,
    }),
  })

  if (!response.ok) {
    let detail = 'Falha ao acessar a API interna de ranking.'
    try {
      const err = await response.json()
      detail = (err as { error?: string })?.error ?? response.statusText
    } catch {
      detail = response.statusText
    }
    throw new Error(`Erro ${response.status}: ${detail}`)
  }

  const parsed = await response.json() as Partial<AiAnalysis>

  return {
    score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, Math.round(parsed.score))) : 0,
    resumo: typeof parsed.resumo === 'string' ? parsed.resumo : '',
    pontos_fortes: Array.isArray(parsed.pontos_fortes) ? parsed.pontos_fortes.slice(0, 4) : [],
    lacunas: Array.isArray(parsed.lacunas) ? parsed.lacunas.slice(0, 4) : [],
    habilidades_encontradas: Array.isArray(parsed.habilidades_encontradas)
      ? parsed.habilidades_encontradas.slice(0, 12)
      : [],
    habilidades_ausentes: Array.isArray(parsed.habilidades_ausentes)
      ? parsed.habilidades_ausentes.slice(0, 12)
      : [],
  }
}

// ─── PDF / DOC / DOCX text extraction ───────────────────────────────────────

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await loadPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    pageTexts.push(pageText)
  }
  return pageTexts.join('\n')
}

async function extractTextFromDocx(file: File): Promise<string> {
  const mammoth = await loadMammoth()
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

async function extractTextFromDoc(file: File): Promise<string> {
  const mammoth = await loadMammoth()
  const arrayBuffer = await file.arrayBuffer()

  // Some .doc files are actually .docx renamed; try mammoth first.
  try {
    const result = await mammoth.extractRawText({ arrayBuffer })
    if (result.value.trim()) return result.value
  } catch {
    // Fallback below for legacy binary .doc files.
  }

  const decoded = new TextDecoder('windows-1252').decode(new Uint8Array(arrayBuffer))
  const cleaned = decoded
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s{2,}/g, ' ')

  const likelyLines = cleaned
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && /[A-Za-zÀ-ÿ]/.test(line))

  const extracted = likelyLines.join('\n').trim()
  if (!extracted || extracted.length < 80) {
    throw new Error('Nao foi possivel extrair texto de .doc antigo. Converta para .docx ou PDF para maior precisao.')
  }

  return extracted
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return extractTextFromPdf(file)
  if (ext === 'docx') return extractTextFromDocx(file)
  if (ext === 'doc') return extractTextFromDoc(file)
  return file.text()
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ResumeResult = AiAnalysis & {
  fileName: string
  error?: string
}

type ResultFilter = 'all' | 'success' | 'error'

function getGrade(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'A', color: '#2f8f74' }
  if (score >= 65) return { label: 'B', color: '#5aab8a' }
  if (score >= 50) return { label: 'C', color: '#d97706' }
  if (score >= 35) return { label: 'D', color: '#e05a3a' }
  return { label: 'F', color: '#b91c1c' }
}

function toSafePdfFilename(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function trimExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResumeRankingTool() {
  const [jobDescription, setJobDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<ResumeResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [processingFile, setProcessingFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const rankingStats = useMemo(() => {
    const success = results.filter((r) => !r.error)
    const failures = results.length - success.length
    const avg = success.length
      ? Math.round(success.reduce((sum, r) => sum + r.score, 0) / success.length)
      : 0

    return {
      total: results.length,
      success: success.length,
      failures,
      average: avg,
      best: success[0]?.score ?? 0,
      bestName: success[0]?.fileName ?? '',
    }
  }, [results])

  const visibleResults = useMemo(() => {
    return results
      .map((result, index) => ({ result, rankingPosition: index + 1 }))
      .filter(({ result }) => {
        if (resultFilter === 'success') return !result.error
        if (resultFilter === 'error') return Boolean(result.error)
        return true
      })
  }, [results, resultFilter])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      return ext === 'pdf' || ext === 'doc' || ext === 'docx'
    })
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...accepted.filter((f) => !existing.has(f.name + f.size))]
    })
  }, [])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files)
    event.target.value = ''
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      setError('Insira a descrição da vaga antes de analisar.')
      return
    }
    if (files.length === 0) {
      setError('Adicione ao menos um currículo (PDF, DOC ou DOCX).')
      return
    }

    setError(null)
    setIsLoading(true)
    setResults([])

    const processed: ResumeResult[] = []

    for (const file of files) {
      setProcessingFile(file.name)
      try {
        const text = await extractText(file)
        const analysis = await analyzeResume(text, jobDescription)
        processed.push({ fileName: file.name, ...analysis })
      } catch (err) {
        processed.push({
          fileName: file.name,
          score: 0,
          resumo: '',
          pontos_fortes: [],
          lacunas: [],
          habilidades_encontradas: [],
          habilidades_ausentes: [],
          error: err instanceof Error ? err.message : 'Erro ao processar arquivo.',
        })
      }
    }

    processed.sort((a, b) => b.score - a.score)
    setResults(processed)
    setProcessingFile(null)
    setIsLoading(false)
  }

  const handleClear = () => {
    setFiles([])
    setResults([])
    setError(null)
    setJobDescription('')
  }

  const handleExportPdf = () => {
    if (results.length === 0) return

    try {
      setError(null)

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 42
      const contentWidth = pageWidth - margin * 2
      let cursorY = margin

      const moveToNextPageIfNeeded = (requiredHeight: number) => {
        if (cursorY + requiredHeight <= pageHeight - margin) return
        doc.addPage()
        cursorY = margin
      }

      const writeWrapped = (
        text: string,
        opts: {
          x: number
          y: number
          width: number
          size?: number
          color?: [number, number, number]
          style?: 'normal' | 'bold'
          lineHeight?: number
        },
      ) => {
        const {
          x,
          y,
          width,
          size = 10,
          color = [32, 59, 53],
          style = 'normal',
          lineHeight = 1.35,
        } = opts

        doc.setFont('helvetica', style)
        doc.setFontSize(size)
        doc.setTextColor(color[0], color[1], color[2])

        const lines = doc.splitTextToSize(text, width)
        doc.text(lines, x, y, { lineHeightFactor: lineHeight })
        return lines.length * size * lineHeight
      }

      const validResults = results.filter((r) => !r.error)
      const avgScore = validResults.length
        ? Math.round(validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length)
        : 0
      const generatedAt = new Date()
      const generatedAtLabel = generatedAt.toLocaleString('pt-BR')

      doc.setFillColor(236, 247, 243)
      doc.roundedRect(margin, cursorY, contentWidth, 96, 10, 10, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(23, 61, 53)
      doc.text('Ranking de Candidatos', margin + 18, cursorY + 30)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(74, 122, 110)
      doc.text(`Gerado em: ${generatedAtLabel}`, margin + 18, cursorY + 50)
      doc.text(`Total analisado: ${results.length} candidato(s)`, margin + 18, cursorY + 66)
      doc.text(`Media de aderencia: ${avgScore}%`, margin + 18, cursorY + 82)

      cursorY += 118

      if (jobDescription.trim()) {
        moveToNextPageIfNeeded(80)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(32, 59, 53)
        doc.text('Resumo da vaga', margin, cursorY)

        const snippet = jobDescription.trim().slice(0, 320)
        const suffix = jobDescription.trim().length > 320 ? '...' : ''
        cursorY += 14
        const usedHeight = writeWrapped(`${snippet}${suffix}`, {
          x: margin,
          y: cursorY,
          width: contentWidth,
          size: 10,
          color: [66, 94, 86],
        })
        cursorY += usedHeight + 16
      }

      results.forEach((r, index) => {
        const grade = getGrade(r.score)

        moveToNextPageIfNeeded(160)

        doc.setFillColor(index === 0 ? 240 : 250, index === 0 ? 255 : 252, index === 0 ? 248 : 251)
        doc.setDrawColor(index === 0 ? 168 : 216, index === 0 ? 217 : 227, index === 0 ? 200 : 223)
        doc.roundedRect(margin, cursorY, contentWidth, 120, 8, 8, 'FD')

        let lineY = cursorY + 22
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(23, 61, 53)
        doc.text(`#${index + 1}  ${trimExt(r.fileName)}`, margin + 14, lineY)

        doc.setFontSize(11)
        doc.setTextColor(47, 143, 116)
        doc.text(`${r.score}% (${grade.label})`, pageWidth - margin - 14, lineY, { align: 'right' })

        lineY += 14
        doc.setFillColor(228, 235, 232)
        doc.roundedRect(margin + 14, lineY, contentWidth - 28, 6, 3, 3, 'F')
        doc.setFillColor(47, 143, 116)
        doc.roundedRect(margin + 14, lineY, ((contentWidth - 28) * r.score) / 100, 6, 3, 3, 'F')
        lineY += 18

        if (r.error) {
          writeWrapped(`Falha na analise: ${r.error}`, {
            x: margin + 14,
            y: lineY,
            width: contentWidth - 28,
            size: 10,
            color: [185, 28, 28],
          })
          cursorY += 136
          return
        }

        const summary = r.resumo?.trim() || 'Sem resumo retornado pela IA.'
        const summaryHeight = writeWrapped(summary, {
          x: margin + 14,
          y: lineY,
          width: contentWidth - 28,
          size: 10,
          color: [44, 79, 70],
        })

        lineY += summaryHeight + 6

        const strong = r.pontos_fortes.slice(0, 2).join(' | ')
        if (strong) {
          writeWrapped(`Pontos fortes: ${strong}`, {
            x: margin + 14,
            y: lineY,
            width: contentWidth - 28,
            size: 9,
            color: [26, 92, 68],
          })
          lineY += 14
        }

        const gaps = r.lacunas.slice(0, 2).join(' | ')
        if (gaps) {
          writeWrapped(`Lacunas: ${gaps}`, {
            x: margin + 14,
            y: lineY,
            width: contentWidth - 28,
            size: 9,
            color: [124, 74, 0],
          })
        }

        cursorY += 136
      })

      const stamp = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')}`
      doc.save(`ranking-candidatos-${toSafePdfFilename(stamp)}.pdf`)
    } catch {
      setError('Nao foi possivel gerar o PDF. Tente novamente.')
    }
  }

  const skillChipStyle = {
    ok: { background: '#dcf5ec', color: '#1a6b50' },
    missing: { background: '#fff7ed', color: '#92400e' },
  } as const
  const maxVisibleSkills = 8

  return (
    <div className="grid ranking-layout" style={{ alignItems: 'start' }}>
      {/* ── Left column ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Job description */}
        <section className="card">
          <h2>1) Descrição da Vaga</h2>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Cole o texto completo da vaga — requisitos, responsabilidades, habilidades desejadas.
          </p>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Ex: Procuramos desenvolvedor React com experiência em TypeScript, Node.js, REST APIs e metodologias ágeis..."
            rows={12}
            style={{
              width: '100%',
              resize: 'vertical',
              fontFamily: 'inherit',
              fontSize: '0.92rem',
              padding: '0.75rem',
              border: '1px solid #d8e3df',
              borderRadius: '8px',
              background: '#f9fbfa',
              color: '#203b35',
              boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
          />
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b8f84' }}>
            {jobDescription.trim().length} caracteres
          </div>
        </section>

        {/* Resume upload */}
        <section className="card">
          <h2>2) Currículos</h2>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Arquivos aceitos: <strong>PDF</strong>, <strong>DOC</strong> e <strong>DOCX</strong>.
          </p>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#2f8f74' : '#b2d0c8'}`,
              borderRadius: '10px',
              padding: '1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragging ? '#f0f7f5' : 'transparent',
              transition: 'all 0.2s ease',
              marginBottom: '0.75rem',
            }}
          >
            <p style={{ margin: 0, color: '#4a7a6e', fontSize: '0.95rem' }}>
              Arraste arquivos aqui ou{' '}
              <span style={{ color: '#2f8f74', fontWeight: 600 }}>clique para selecionar</span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {files.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${file.size}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.65rem',
                    background: processingFile === file.name ? '#e8f7f2' : '#f0f7f5',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    color: '#203b35',
                    border: processingFile === file.name ? '1px solid #2f8f74' : '1px solid transparent',
                  }}
                >
                  {processingFile === file.name && <span style={{ fontSize: '0.8rem', color: '#2f8f74' }}>⏳</span>}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <span style={{ color: '#6b8f84', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={isLoading}
                    style={{ background: 'none', border: 'none', cursor: isLoading ? 'default' : 'pointer', color: '#b91c1c', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}
                    aria-label={`Remover ${file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhum arquivo adicionado.</p>
          )}
        </section>

        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="button-primary"
            onClick={handleAnalyze}
            disabled={isLoading}
            style={{ flex: 1 }}
          >
            {isLoading
              ? `Analisando${processingFile ? ` "${processingFile.split('.')[0]}"` : ''}...`
              : `Analisar ${files.length > 0 ? `(${files.length})` : ''} currículos`}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleClear}
            disabled={isLoading}
          >
            Limpar
          </button>
        </div>
      </div>

      {/* ── Right column: results ─────────────────────────────────────────── */}
      <section className="card" style={{ minHeight: '200px', padding: '1.2rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Ranking de Candidatos</h2>
          {rankingStats.total > 0 && (
            <button
              type="button"
              className="button-secondary"
              onClick={handleExportPdf}
              disabled={isLoading}
            >
              Exportar PDF
            </button>
          )}
        </div>

        {!rankingStats.total && !isLoading && (
          <p className="muted">Os resultados aparecerão aqui após a análise.</p>
        )}

        {isLoading && (
          <p className="muted">
            Analisando com IA — processando um currículo por vez
            {processingFile ? ` (${processingFile})` : ''}...
          </p>
        )}

        {rankingStats.total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.65rem',
              }}
            >
              <div style={{ background: '#ecf7f3', border: '1px solid #d6ebe3', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#4a7a6e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#17423a' }}>{rankingStats.total}</p>
              </div>
              <div style={{ background: '#eefdf7', border: '1px solid #cfeee1', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#2f8f74', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Validos</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#1a6b50' }}>{rankingStats.success}</p>
              </div>
              <div style={{ background: '#fff8f1', border: '1px solid #f4dec8', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#b06008', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Media</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#8a4d05' }}>{rankingStats.average}%</p>
              </div>
              <div style={{ background: '#f7f9fb', border: '1px solid #e3e8ef', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#5b6b7c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Top score</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#1e3c55' }}>{rankingStats.best}%</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setResultFilter('all')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderColor: resultFilter === 'all' ? '#2f8f74' : undefined,
                    color: resultFilter === 'all' ? '#1a6b50' : undefined,
                    background: resultFilter === 'all' ? '#eaf5f1' : undefined,
                  }}
                >
                  Todos ({rankingStats.total})
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setResultFilter('success')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderColor: resultFilter === 'success' ? '#2f8f74' : undefined,
                    color: resultFilter === 'success' ? '#1a6b50' : undefined,
                    background: resultFilter === 'success' ? '#eaf5f1' : undefined,
                  }}
                >
                  Validos ({rankingStats.success})
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setResultFilter('error')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderColor: resultFilter === 'error' ? '#e05a3a' : undefined,
                    color: resultFilter === 'error' ? '#8a2a15' : undefined,
                    background: resultFilter === 'error' ? '#fff1ed' : undefined,
                  }}
                >
                  Com erro ({rankingStats.failures})
                </button>
              </div>

              {rankingStats.bestName && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#4f6f66' }}>
                  Top #1: <strong>{trimExt(rankingStats.bestName)}</strong>
                </p>
              )}
            </div>

            {visibleResults.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Nenhum resultado para o filtro selecionado.
              </p>
            )}

            {visibleResults.map(({ result: r, rankingPosition }) => {
              const grade = getGrade(r.score)
              return (
                <div
                  key={r.fileName}
                  style={{
                    border: `1px solid ${rankingPosition === 1 ? '#a8d9c8' : '#d8e3df'}`,
                    borderRadius: '12px',
                    padding: '1rem 1rem 0.95rem',
                    background: rankingPosition === 1 ? 'linear-gradient(180deg, #f0fff8 0%, #fafefc 100%)' : '#fafcfb',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1f6050', minWidth: '2.05rem', height: '2.05rem', borderRadius: '999px', background: '#ddf4eb', display: 'grid', placeItems: 'center' }}>
                      #{rankingPosition}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.98rem', color: '#153d35', lineHeight: 1.35, overflowWrap: 'anywhere' }} title={r.fileName}>
                        {trimExt(r.fileName)}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#6b8f84' }}>{r.fileName}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: '1.25rem', color: grade.color }}>{r.score}%</span>
                      <span style={{ background: grade.color, color: '#fff', fontWeight: 700, fontSize: '0.82rem', borderRadius: '999px', padding: '0.22rem 0.55rem' }}>
                        {grade.label}
                      </span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ height: '8px', background: '#e4ebe8', borderRadius: '5px', marginBottom: '0.95rem', overflow: 'hidden' }}>
                    <div style={{ width: `${r.score}%`, height: '100%', background: grade.color, borderRadius: '5px' }} />
                  </div>

                  {r.error ? (
                    <p className="error" style={{ margin: 0 }}>{r.error}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ background: '#eaf5f1', border: '1px solid #d5e8e0', borderRadius: '8px', padding: '0.6rem 0.8rem' }}>
                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.75rem', fontWeight: 700, color: '#2f8f74', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Resumo
                        </p>
                        <p style={{ margin: 0, fontSize: '0.86rem', color: '#2c4f46', lineHeight: 1.55 }}>
                          {r.resumo || 'Sem resumo retornado pela IA.'}
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '0.65rem' }}>
                        <div style={{ background: '#f3fbf8', border: '1px solid #d6ebe3', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                          <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#2f8f74', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Pontos fortes
                          </p>
                          {r.pontos_fortes.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {r.pontos_fortes.map((p) => (
                                <li key={p} style={{ fontSize: '0.83rem', color: '#1a5c44' }}>{p}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Nenhum ponto forte destacado.</p>
                          )}
                        </div>

                        <div style={{ background: '#fff8ef', border: '1px solid #f4dec8', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                          <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Lacunas
                          </p>
                          {r.lacunas.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {r.lacunas.map((p) => (
                                <li key={p} style={{ fontSize: '0.83rem', color: '#7c4a00' }}>{p}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Sem lacunas relevantes identificadas.</p>
                          )}
                        </div>
                      </div>

                      {(r.habilidades_encontradas.length > 0 || r.habilidades_ausentes.length > 0) && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '0.65rem' }}>
                          {r.habilidades_encontradas.length > 0 && (
                            <div>
                              <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#2f8f74', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Habilidades encontradas ({r.habilidades_encontradas.length})
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {r.habilidades_encontradas.slice(0, maxVisibleSkills).map((kw) => (
                                  <span key={kw} style={{ background: skillChipStyle.ok.background, color: skillChipStyle.ok.color, fontSize: '0.78rem', padding: '0.18rem 0.48rem', borderRadius: '999px', fontWeight: 600 }}>
                                    {kw}
                                  </span>
                                ))}
                                {r.habilidades_encontradas.length > maxVisibleSkills && (
                                  <span style={{ background: '#e5ece9', color: '#46635a', fontSize: '0.78rem', padding: '0.18rem 0.48rem', borderRadius: '999px', fontWeight: 600 }}>
                                    +{r.habilidades_encontradas.length - maxVisibleSkills}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {r.habilidades_ausentes.length > 0 && (
                            <div>
                              <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Habilidades ausentes ({r.habilidades_ausentes.length})
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {r.habilidades_ausentes.slice(0, maxVisibleSkills).map((kw) => (
                                  <span key={kw} style={{ background: skillChipStyle.missing.background, color: skillChipStyle.missing.color, fontSize: '0.78rem', padding: '0.18rem 0.48rem', borderRadius: '999px', fontWeight: 600 }}>
                                    {kw}
                                  </span>
                                ))}
                                {r.habilidades_ausentes.length > maxVisibleSkills && (
                                  <span style={{ background: '#f1e8de', color: '#7f4c0f', fontSize: '0.78rem', padding: '0.18rem 0.48rem', borderRadius: '999px', fontWeight: 600 }}>
                                    +{r.habilidades_ausentes.length - maxVisibleSkills}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
