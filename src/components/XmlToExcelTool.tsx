import { useMemo, useState, type ChangeEvent } from 'react'

type XmlRow = Record<string, string>
type WarningItem = { fileName: string; detail: string }
type GenerationMode = 'full' | 'totalizers'

const MAX_PREVIEW_ROWS = 8

const BASE_HEADERS = [
  'arquivoOrigem',
  'statusRegistro',
  'avisoProcessamento',
  'idEvento',
  'nrRecArqBase',
  'perApur',
  'tpInsc',
  'nrInsc',
  'cpfBenef',
  'qtdDependentes',
  'perRef',
  'ideDmDev',
  'tpPgto',
  'dtPgto',
  'codCateg',
  'crMen',
  'vlrRendTrib',
  'vlrRendTrib13',
  'vlrPrevOficial',
  'vlrPrevOficial13',
  'vlrCRMen',
  'vlrCR13Men',
  'vlrDedPC',
  'vlrDedPC13',
  'vlrSaudeTit',
] as const

const TOTAL_FIELDS = [
  'vlrRendTrib',
  'vlrRendTrib13',
  'vlrPrevOficial',
  'vlrPrevOficial13',
  'vlrCRMen',
  'vlrCR13Men',
] as const

const TOTALIZER_FIELDS = [
  'CRMen',
  'vlrRendTrib',
  'vlrRendTrib13',
  'vlrPrevOficial',
  'vlrPrevOficial13',
  'vlrCRMen',
  'vlrCR13Men',
  'vlrParcIsenta65',
  'vlrParcIsenta65Dec',
  'vlrDiarias',
  'vlrAjudaCusto',
  'vlrIndResContrato',
  'vlrAbonoPec',
  'vlrRendMoleGrave',
  'vlrRendMoleGrave13',
  'vlrAuxMoradia',
  'vlrBolsaMedico',
  'vlrBolsaMedico13',
  'vlrJurosMora',
  'vlrIsenOutros',
] as const

const TOTALIZER_HEADERS = [
  'arquivoOrigem',
  'statusRegistro',
  'avisoProcessamento',
  'idEvento',
  'nrRecArqBase',
  'perApur',
  'tpInsc',
  'nrInsc',
  'cpfBenef',
  ...TOTALIZER_FIELDS,
] as const

function directChildByName(parent: Element | null, name: string): Element | null {
  if (!parent) return null
  const children = Array.from(parent.children) as Element[]
  return children.find((child) => child.localName === name) ?? null
}

function directChildrenByName(parent: Element | null, name: string): Element[] {
  if (!parent) return []
  return (Array.from(parent.children) as Element[]).filter((child) => child.localName === name)
}

function descByName(root: Document | Element | null, name: string): Element | null {
  if (!root) return null
  const found = root.getElementsByTagNameNS('*', name)
  return found.length > 0 ? (found.item(0) as Element) : null
}

function textOf(parent: Element | null, name: string): string {
  return directChildByName(parent, name)?.textContent?.trim() ?? ''
}

function collectHeaders(rows: XmlRow[], mode: GenerationMode): string[] {
  if (mode === 'totalizers') {
    return [...TOTALIZER_HEADERS]
  }

  const infoHeaders = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row)
      .filter((key) => key.startsWith('infoIR_'))
      .forEach((key) => infoHeaders.add(key))
  })

  return [...BASE_HEADERS, ...Array.from(infoHeaders).sort((a, b) => a.localeCompare(b))]
}

function buildWarningRow(fileName: string, detail: string): XmlRow {
  return {
    arquivoOrigem: fileName,
    statusRegistro: 'AVISO',
    avisoProcessamento: detail,
  }
}

function parseXmlContent(xml: string, fileName: string, mode: GenerationMode): XmlRow[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML inválido')
  }

  const evtIrrfBenef = descByName(doc, 'evtIrrfBenef')
  if (!evtIrrfBenef) {
    throw new Error('Evento evtIrrfBenef não encontrado')
  }

  const ideEvento = directChildByName(evtIrrfBenef, 'ideEvento')
  const ideEmpregador = directChildByName(evtIrrfBenef, 'ideEmpregador')
  const ideTrabalhador = directChildByName(evtIrrfBenef, 'ideTrabalhador')

  const eventBaseRow: XmlRow = {
    arquivoOrigem: fileName,
    statusRegistro: 'OK',
    avisoProcessamento: '',
    idEvento: evtIrrfBenef.getAttribute('Id') ?? '',
    nrRecArqBase: textOf(ideEvento, 'nrRecArqBase'),
    perApur: textOf(ideEvento, 'perApur'),
    tpInsc: textOf(ideEmpregador, 'tpInsc'),
    nrInsc: textOf(ideEmpregador, 'nrInsc'),
    cpfBenef: textOf(ideTrabalhador, 'cpfBenef'),
  }

  if (mode === 'totalizers') {
    const totInfoIR = directChildByName(ideTrabalhador, 'totInfoIR')
    const consolidApurMenList = directChildrenByName(totInfoIR, 'consolidApurMen')

    if (!consolidApurMenList.length) {
      return [eventBaseRow]
    }

    return consolidApurMenList.map((consolidApurMen) => {
      const row: XmlRow = { ...eventBaseRow }
      TOTALIZER_FIELDS.forEach((field) => {
        row[field] = textOf(consolidApurMen, field)
      })
      return row
    })
  }

  const infoIRComplem = directChildByName(ideTrabalhador, 'infoIRComplem')
  const planSaude = directChildByName(infoIRComplem, 'planSaude')
  const infoIRCR = directChildByName(infoIRComplem, 'infoIRCR')
  const previdCompl = directChildByName(infoIRCR, 'previdCompl')

  const dmDevs = directChildrenByName(ideTrabalhador, 'dmDev')
  const dependentCount = String(directChildrenByName(infoIRComplem, 'ideDep').length)

  const baseRow: XmlRow = {
    ...eventBaseRow,
    qtdDependentes: dependentCount,
    vlrDedPC: textOf(previdCompl, 'vlrDedPC'),
    vlrDedPC13: textOf(previdCompl, 'vlrDedPC13'),
    vlrSaudeTit: textOf(planSaude, 'vlrSaudeTit'),
  }

  if (!dmDevs.length) {
    return [baseRow]
  }

  return dmDevs.map((dmDev) => {
    const row: XmlRow = {
      ...baseRow,
      perRef: textOf(dmDev, 'perRef'),
      ideDmDev: textOf(dmDev, 'ideDmDev'),
      tpPgto: textOf(dmDev, 'tpPgto'),
      dtPgto: textOf(dmDev, 'dtPgto'),
      codCateg: textOf(dmDev, 'codCateg'),
    }

    const infoIRList = directChildrenByName(dmDev, 'infoIR')
    infoIRList.forEach((item) => {
      const tpInfoIR = textOf(item, 'tpInfoIR')
      if (!tpInfoIR) return
      row[`infoIR_${tpInfoIR}`] = textOf(item, 'valor')
    })

    const totApurMen = directChildByName(dmDev, 'totApurMen')
    row.crMen = textOf(totApurMen, 'CRMen')
    TOTAL_FIELDS.forEach((field) => {
      row[field] = textOf(totApurMen, field)
    })

    return row
  })
}

function XmlToExcelTool() {
  const [xmlFiles, setXmlFiles] = useState<File[]>([])
  const [generationMode, setGenerationMode] = useState<GenerationMode>('full')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastGeneratedFile, setLastGeneratedFile] = useState<string | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<XmlRow[]>([])

  const warningCount = warnings.length

  const previewMatrix = useMemo(() => {
    return previewRows.slice(0, MAX_PREVIEW_ROWS).map((row) => previewHeaders.map((header) => row[header] ?? ''))
  }, [previewRows, previewHeaders])

  const handleXmlFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setWarnings([])
    setLastGeneratedFile(null)

    const files = event.target.files
    setXmlFiles(files ? Array.from(files) : [])
    setPreviewHeaders([])
    setPreviewRows([])
  }

  const handleGenerate = async () => {
    if (!xmlFiles.length) {
      setError('Selecione ao menos um arquivo XML.')
      return
    }

    setError(null)
    setWarnings([])
    setLastGeneratedFile(null)

    try {
      setIsGenerating(true)

      const rows: XmlRow[] = []
      const parseWarnings: WarningItem[] = []

      for (const file of xmlFiles) {
        try {
          const content = await file.text()
          const parsed = parseXmlContent(content, file.name, generationMode)
          rows.push(...parsed)
        } catch (parseError) {
          const detail = parseError instanceof Error ? parseError.message : 'falha ao processar XML'
          parseWarnings.push({ fileName: file.name, detail })
        }
      }

      const warningRows = parseWarnings.map((item) => buildWarningRow(item.fileName, item.detail))
      const finalRows = [...rows, ...warningRows]

      if (!finalRows.length) {
        setWarnings([])
        setError('Nenhum XML foi processado.')
        return
      }

      const headers = collectHeaders(finalRows, generationMode)
      const sheetName = generationMode === 'totalizers' ? 'Totalizadores' : 'Consolidado'

      const body = finalRows.map((row) => headers.map((header) => row[header] ?? ''))

      const XLSX = await import('xlsx')

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

      const dateTag = new Date().toISOString().slice(0, 10)
      const fileName =
        generationMode === 'totalizers'
          ? `xml-s-5002-totalizadores-${dateTag}.xlsx`
          : `xml-consolidado-${dateTag}.xlsx`
      XLSX.writeFile(workbook, fileName)

      setPreviewHeaders(headers)
      setPreviewRows(finalRows)
      setWarnings(parseWarnings.map((item) => `${item.fileName}: ${item.detail}`))
      setLastGeneratedFile(fileName)
    } catch (processError) {
      setError('Não foi possível gerar a planilha Excel.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>1) Selecionar arquivos XML</h2>
        <label className="file-input">
          <input type="file" accept=".xml,text/xml,application/xml" multiple onChange={handleXmlFilesChange} />
          <span>Selecionar XMLs</span>
        </label>
        <p className="muted">
          {xmlFiles.length
            ? `${xmlFiles.length} arquivo(s) selecionado(s).`
            : 'Nenhum XML selecionado.'}
        </p>

        <h2 style={{ marginTop: '1.25rem' }}>2) Tipo de geracao</h2>
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <label className="checkbox" style={{ alignItems: 'flex-start' }}>
            <input
              type="radio"
              name="generationMode"
              checked={generationMode === 'full'}
              onChange={() => setGenerationMode('full')}
            />
            Consolidado detalhado (dmDev/totApurMen)
          </label>
          <label className="checkbox" style={{ alignItems: 'flex-start' }}>
            <input
              type="radio"
              name="generationMode"
              checked={generationMode === 'totalizers'}
              onChange={() => setGenerationMode('totalizers')}
            />
            Somente totalizadores (totInfoIR/consolidApurMen)
          </label>
        </div>

        <h2 style={{ marginTop: '1.25rem' }}>3) Gerar planilha consolidada</h2>
        <button
          type="button"
          className="button-primary"
          onClick={handleGenerate}
          disabled={isGenerating || !xmlFiles.length}
        >
          {isGenerating
            ? 'Gerando...'
            : generationMode === 'totalizers'
              ? 'Gerar Excel de totalizadores'
              : 'Gerar Excel consolidado'}
        </button>

        {lastGeneratedFile && <p className="success">Arquivo gerado: {lastGeneratedFile}</p>}
        {error && <p className="error">{error}</p>}
        {warningCount > 0 && (
          <div className="results" style={{ marginTop: '0.75rem' }}>
            <strong>{warningCount} arquivo(s) com aviso:</strong>
            <ul>
              {warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Pré-visualização</h2>
        <p className="muted">
          {previewRows.length
            ? `${previewRows.length} linha(s) gerada(s) a partir dos XMLs.`
            : 'A prévia aparece após gerar o Excel.'}
        </p>

        {previewRows.length > 0 && (
          <div className="csv-preview">
            <div className="csv-summary">
              <span>Colunas: {previewHeaders.length}</span>
              <span>Linhas (total): {previewRows.length}</span>
            </div>
            <div className="csv-table">
              <table>
                <thead>
                  <tr>
                    {previewHeaders.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewMatrix.map((row, rowIndex) => (
                    <tr key={`xml-row-${rowIndex}`}>
                      {row.map((cell, colIndex) => (
                        <td key={`xml-cell-${rowIndex}-${colIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > MAX_PREVIEW_ROWS && (
              <p className="muted">Pré-visualização limitada a {MAX_PREVIEW_ROWS} linhas.</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default XmlToExcelTool
