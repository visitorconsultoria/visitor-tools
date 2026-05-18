import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { jsPDF } from 'jspdf'
import { apiUrl } from '../lib/api'
import RichTextEditor from './RichTextEditor'
import internalPartnerLogo from '../assets/logo_3.png'
import visitorLogo from '../assets/vistor_logo_verde2.png'

type TermoStatus = 'draft' | 'sent'

type ProcessRow = {
  processName: string
  validationDate: string
  userSignature: string
  analystSignature: string
}

type ApprovalRow = {
  approvedBy: string
  signature: string
  approvalDate: string
}

type TermoRow = {
  id: number
  partner: string
  relationType: 'none' | 'estimativa' | 'proposta'
  relationId: number | null
  relationLabel: string
  documentCode: string
  clientName: string
  clientCode: string
  projectName: string
  projectCode: string
  clientSegment: string
  businessUnit: string
  validationDate: string
  proposalCode: string
  managerProvider: string
  managerClient: string
  milestone: string
  additionalComments: string
  processRows: ProcessRow[]
  approvalRows: ApprovalRow[]
  status: TermoStatus
}

type FormState = Omit<TermoRow, 'id'>

type EstimateOption = {
  id: number
  client: string
  demand: string
  status: 'pending' | 'sent' | 'cancelled' | 'completed'
}

type PropostaOption = {
  id: number
  cliente: string
  projeto: string
}

type RelationSource = {
  label: string
  clientName: string
  projectName: string
}

type PdfTheme = {
  logoSrc: string
  providerLabel: string
  propertyNotice: string
  dark: [number, number, number]
  medium: [number, number, number]
  light: [number, number, number]
  border: [number, number, number]
  body: [number, number, number]
  muted: [number, number, number]
}

type SectionId = 'dados' | 'ambientacao' | 'termo' | 'comentarios' | 'aceite'

const STORAGE_KEY = 'vt_termo_validacao_records'
const PARTNER_OPTIONS = ['Visitor', 'TOTVS', 'DWC', 'Newtech', 'Outro'] as const

const EMPTY_PROCESS_ROW = (): ProcessRow => ({
  processName: '',
  validationDate: getTodayISODate(),
  userSignature: '',
  analystSignature: '',
})

const EMPTY_APPROVAL_ROW = (): ApprovalRow => ({
  approvedBy: '',
  signature: '',
  approvalDate: getTodayISODate(),
})

function getTodayISODate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toDisplayDate(value: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }
  return value
}

function toSafePdfFilename(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'termo-validacao'
  )
}

function isVisitorTheme(partner: string): boolean {
  const normalized = partner.trim().toLowerCase()
  return normalized === 'visitor'
}

function createDefaultForm(): FormState {
  return {
    partner: 'Visitor',
    relationType: 'none',
    relationId: null,
    relationLabel: '',
    documentCode: 'MIT010 - CN SESI_PRD',
    clientName: 'SERVICO SOCIAL DA INDUSTRIA CONSELHO NACIONAL',
    clientCode: 'TEZFYE00',
    projectName: '[CN SESI] UNIFICACAO DE BASES (BACKOFFICE & RH)',
    projectCode: 'D000071234001',
    clientSegment: 'Industria',
    businessUnit: 'Setor Publico',
    validationDate: '2025-09-30',
    proposalCode: 'AAMOG105',
    managerProvider: 'Valdemir da Silva',
    managerClient: 'Felipe Miranda',
    milestone: 'MIT010',
    additionalComments:
      '<p>Informo que o ambiente de producao foi instalado com sucesso:</p>' +
      '<ul>' +
      '<li>Protheus: C:\\TOTVS\\PRD\\PROTHEUS_1224</li>' +
      '<li>DBAccess: C:\\TOTVS\\PRD\\dbaccess</li>' +
      '<li>Includes: C:\\TOTVS\\includes</li>' +
      '<li>Licence Server: C:\\TOTVS\\TOTVSLicenseVirtual</li>' +
      '</ul>' +
      '<p>O ambiente ja esta ativo e pronto, aguardando apenas a subida do banco de dados para inicio das operacoes.</p>',
    processRows: [
      {
        processName: 'Ambientacao do ambiente de producao',
        validationDate: '2025-09-30',
        userSignature: 'Felipe Miranda',
        analystSignature: 'Rodolfo A. Simoes',
      },
      {
        processName: 'Validacao tecnica do marco MIT010',
        validationDate: '2025-09-30',
        userSignature: 'Novack Borges',
        analystSignature: 'Rodolfo A. Simoes',
      },
      {
        processName: 'Aceite funcional da entrega',
        validationDate: '2025-09-30',
        userSignature: 'Samuel Mani',
        analystSignature: 'Rodolfo A. Simoes',
      },
    ],
    approvalRows: [
      { approvedBy: 'Felipe Miranda', signature: '', approvalDate: '2025-09-30' },
      { approvedBy: 'Novack Borges', signature: '', approvalDate: '2025-09-30' },
      { approvedBy: 'Samuel Mani', signature: '', approvalDate: '2025-09-30' },
    ],
    status: 'draft',
  }
}

function getPdfTheme(partner: string): PdfTheme {
  if (isVisitorTheme(partner)) {
    return {
      logoSrc: visitorLogo,
      providerLabel: 'Visitor',
      propertyNotice: 'Este documento e propriedade da Visitor Consultoria. Todos os direitos reservados.',
      dark: [17, 95, 68],
      medium: [44, 136, 103],
      light: [234, 246, 240],
      border: [174, 211, 194],
      body: [33, 43, 40],
      muted: [92, 103, 100],
    }
  }

  return {
    logoSrc: internalPartnerLogo,
    providerLabel: 'TOTVS',
    propertyNotice: 'Este documento e propriedade da TOTVS. Todos os direitos reservados.',
    dark: [28, 72, 120],
    medium: [74, 122, 171],
    light: [237, 243, 250],
    border: [184, 201, 224],
    body: [37, 43, 52],
    muted: [96, 103, 115],
  }
}

function normalizeRecord(input: unknown): TermoRow {
  const row = input as Partial<TermoRow>
  const partner = String(row.partner ?? 'Visitor')
  return {
    id: Number(row.id ?? 0),
    partner: partner.trim().toLowerCase() === 'interno' ? 'Visitor' : partner,
    relationType: row.relationType === 'estimativa' || row.relationType === 'proposta' ? row.relationType : 'none',
    relationId: row.relationId == null ? null : Number(row.relationId),
    relationLabel: String(row.relationLabel ?? ''),
    documentCode: String(row.documentCode ?? ''),
    clientName: String(row.clientName ?? ''),
    clientCode: String(row.clientCode ?? ''),
    projectName: String(row.projectName ?? ''),
    projectCode: String(row.projectCode ?? ''),
    clientSegment: String(row.clientSegment ?? ''),
    businessUnit: String(row.businessUnit ?? ''),
    validationDate: String(row.validationDate ?? ''),
    proposalCode: String(row.proposalCode ?? ''),
    managerProvider: String(row.managerProvider ?? ''),
    managerClient: String(row.managerClient ?? ''),
    milestone: String(row.milestone ?? ''),
    additionalComments: String(row.additionalComments ?? ''),
    processRows: Array.isArray(row.processRows) ? (row.processRows as ProcessRow[]) : [],
    approvalRows: Array.isArray(row.approvalRows) ? (row.approvalRows as ApprovalRow[]) : [],
    status: row.status === 'sent' ? 'sent' : 'draft',
  }
}

function normalizeEstimateOption(input: unknown): EstimateOption {
  const row = input as Partial<EstimateOption> & { demanda?: string }
  const status = String(row.status ?? '').trim().toLowerCase()
  return {
    id: Number(row.id ?? 0),
    client: String(row.client ?? ''),
    demand: String(row.demand ?? row.demanda ?? ''),
    status: status === 'sent'
      ? 'sent'
      : status === 'cancelled'
        ? 'cancelled'
        : status === 'completed'
          ? 'completed'
          : 'pending',
  }
}

function normalizePropostaOption(input: unknown): PropostaOption {
  const row = input as Partial<PropostaOption>
  return {
    id: Number(row.id ?? 0),
    cliente: String(row.cliente ?? ''),
    projeto: String(row.projeto ?? ''),
  }
}

function loadRecords(): TermoRow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    return Array.isArray(parsed) ? parsed.map(normalizeRecord) : []
  } catch {
    return []
  }
}

function saveRecords(records: TermoRow[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Falha ao carregar logo para o PDF.'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function generateTermoPdf(form: FormState): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const theme = getPdfTheme(form.partner)
  const showLogo = isVisitorTheme(form.partner)
  const logoDataUrl = showLogo ? await loadImageAsDataUrl(theme.logoSrc) : null
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 34
  const contentWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - margin - 36
  let y = margin + 24
  let pageNumber = 1

  const drawPageChrome = () => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...theme.muted)
    doc.text(String(pageNumber), margin, 18)
    doc.text(theme.propertyNotice, margin + 18, 18)

    if (logoDataUrl) {
      const imageProps = doc.getImageProperties(logoDataUrl)
      const logoHeight = 26
      const logoWidth = Math.min(logoHeight * (imageProps.width / imageProps.height), 96)
      doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - logoWidth, 24, logoWidth, logoHeight)
    }

    doc.setTextColor(...theme.dark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('TERMO DE VALIDACAO', pageWidth / 2, 48, { align: 'center' })
    y = 76
  }

  const ensureSpace = (needed: number) => {
    if (y + needed <= bottomLimit) return
    doc.addPage()
    pageNumber += 1
    drawPageChrome()
  }

  const sectionTitle = (title: string) => {
    ensureSpace(24)
    doc.setTextColor(...theme.dark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(title, margin, y)
    y += 7
    doc.setDrawColor(...theme.medium)
    doc.setLineWidth(0.7)
    doc.line(margin, y, margin + 160, y)
    y += 12
  }

  const htmlToText = (html: string): string[] => {
    const parser = new DOMParser()
    const parsed = parser.parseFromString(html || '<p>-</p>', 'text/html')
    const blocks = Array.from(parsed.body.children)
    const lines: string[] = []
    for (const block of blocks) {
      if (block.tagName.toLowerCase() === 'ul') {
        for (const li of Array.from(block.children)) {
          lines.push(`• ${(li.textContent || '').replace(/\s+/g, ' ').trim()}`)
        }
      } else {
        const text = (block.textContent || '').replace(/\s+/g, ' ').trim()
        if (text) lines.push(text)
      }
    }
    return lines.length ? lines : ['-']
  }

  const renderLines = (lines: string[], fontSize = 10) => {
    doc.setTextColor(...theme.body)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(fontSize)
    const joined = lines.join('\n')
    const wrapped = doc.splitTextToSize(joined, contentWidth)
    ensureSpace(wrapped.length * 13 + 2)
    doc.text(wrapped, margin, y)
    y += wrapped.length * 13 + 6
  }

  const drawFieldsGrid = (fields: Array<[string, string]>) => {
    const colGap = 18
    const colWidth = (contentWidth - colGap) / 2
    const rowHeight = 42
    const totalHeight = Math.ceil(fields.length / 2) * rowHeight + 12
    ensureSpace(totalHeight)

    doc.setFillColor(...theme.light)
    doc.setDrawColor(...theme.border)
    doc.roundedRect(margin, y, contentWidth, totalHeight, 8, 8, 'FD')

    fields.forEach(([label, value], index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const x = margin + 14 + col * (colWidth + colGap)
      const topY = y + 16 + row * rowHeight
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...theme.medium)
      doc.text(label, x, topY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...theme.body)
      const wrapped = doc.splitTextToSize(value || '-', colWidth - 8)
      doc.text(wrapped, x, topY + 12)
    })

    y += totalHeight + 18
  }

  const drawProcessTable = () => {
    const headers = [
      'Nome do Processo',
      'Data de Validacao',
      'Nome / Assinatura do Usuario Chave',
      `Nome / Assinatura do Analista de Servicos ${theme.providerLabel}`,
    ]
    const widths = [155, 86, 150, 151]
    const cellPadding = 6

    const drawHeader = () => {
      ensureSpace(28)
      let x = margin
      headers.forEach((header, index) => {
        doc.setFillColor(...theme.dark)
        doc.setDrawColor(...theme.border)
        doc.rect(x, y, widths[index], 28, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        const wrapped = doc.splitTextToSize(header, widths[index] - cellPadding * 2)
        doc.text(wrapped, x + cellPadding, y + 11)
        x += widths[index]
      })
      y += 28
    }

    drawHeader()

    form.processRows.forEach((row, index) => {
      const cells = [
        row.processName || '-',
        toDisplayDate(row.validationDate) || '-',
        row.userSignature || '-',
        row.analystSignature || '-',
      ]
      const groups = cells.map((cell, cellIndex) => doc.splitTextToSize(cell, widths[cellIndex] - cellPadding * 2))
      const rowHeight = Math.max(30, Math.max(...groups.map((group) => group.length)) * 11 + cellPadding * 2)

      if (y + rowHeight > bottomLimit) {
        doc.addPage()
        pageNumber += 1
        drawPageChrome()
        sectionTitle('Termo de Validacao de Entrega')
        drawHeader()
      }

      let x = margin
      groups.forEach((lines, cellIndex) => {
        const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : theme.light
        doc.setFillColor(...fill)
        doc.setDrawColor(...theme.border)
        doc.rect(x, y, widths[cellIndex], rowHeight, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...theme.body)
        doc.text(lines, x + cellPadding, y + 12)
        x += widths[cellIndex]
      })

      y += rowHeight
    })

    y += 12
  }

  const drawApprovalTable = () => {
    const headers = ['Aprovado por', 'Assinatura', 'Data']
    const widths = [250, 220, 92]
    const cellPadding = 6

    ensureSpace(32)
    let x = margin
    headers.forEach((header, index) => {
      doc.setFillColor(...theme.dark)
      doc.setDrawColor(...theme.border)
      doc.rect(x, y, widths[index], 24, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(255, 255, 255)
      doc.text(header, x + cellPadding, y + 15)
      x += widths[index]
    })
    y += 24

    form.approvalRows.forEach((row, index) => {
      const cells = [row.approvedBy || '-', row.signature || '____________________________', toDisplayDate(row.approvalDate) || '-']
      const groups = cells.map((cell, cellIndex) => doc.splitTextToSize(cell, widths[cellIndex] - cellPadding * 2))
      const rowHeight = Math.max(26, Math.max(...groups.map((group) => group.length)) * 11 + cellPadding * 2)
      ensureSpace(rowHeight + 2)

      let cellX = margin
      groups.forEach((lines, cellIndex) => {
        const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : theme.light
        doc.setFillColor(...fill)
        doc.setDrawColor(...theme.border)
        doc.rect(cellX, y, widths[cellIndex], rowHeight, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...theme.body)
        doc.text(lines, cellX + cellPadding, y + 12)
        cellX += widths[cellIndex]
      })

      y += rowHeight
    })
  }

  drawPageChrome()

  sectionTitle('Ambientacao')
  drawFieldsGrid([
    ['Nome do cliente:', form.clientName],
    ['Codigo de cliente:', form.clientCode],
    ['Nome do projeto:', form.projectName],
    ['Codigo do projeto:', form.projectCode],
    ['Segmento cliente:', form.clientSegment],
    ['Unidade TOTVS:', form.businessUnit],
    ['Data:', toDisplayDate(form.validationDate)],
    ['Proposta comercial:', form.proposalCode],
    [`Gerente/Coordenador ${theme.providerLabel}:`, form.managerProvider],
    ['Gerente/Coordenador cliente:', form.managerClient],
  ])

  if (form.relationType !== 'none') {
    sectionTitle('Vinculo')
    renderLines([form.relationLabel || 'Vínculo não informado'])
  }

  sectionTitle('Termo de Validacao de Entrega')
  renderLines([`Informo que foram concluidas as atividades que compoem o marco ${form.milestone || '<cite o marco>'}, estando o usuario de acordo com os processos abaixo relacionados. Sendo assim, declaro validados e aceitos os processos.`])
  drawProcessTable()

  sectionTitle('Comentarios adicionais')
  renderLines(htmlToText(form.additionalComments))

  sectionTitle('Aceite')
  drawApprovalTable()

  doc.save(`${toSafePdfFilename(form.documentCode)}.pdf`)
}

export default function TermoValidacaoTool() {
  const [records, setRecords] = useState<TermoRow[]>([])
  const [estimativas, setEstimativas] = useState<EstimateOption[]>([])
  const [propostas, setPropostas] = useState<PropostaOption[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TermoStatus>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isViewMode, setIsViewMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [form, setForm] = useState<FormState>(createDefaultForm())
  const [formVersion, setFormVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('dados')
  const modalRef = useRef<HTMLElement | null>(null)

  const theme = useMemo(() => getPdfTheme(form.partner), [form.partner])

  const relationOptions = useMemo(() => {
    if (form.relationType === 'estimativa') {
      return estimativas
        .filter((item) => item.status === 'sent')
        .map((item) => ({
        value: String(item.id),
        label: `#${item.id} - ${item.client} - ${item.demand}`,
        }))
    }

    if (form.relationType === 'proposta') {
      return propostas.map((item) => ({
        value: String(item.id),
        label: `#${item.id} - ${item.cliente} - ${item.projeto}`,
      }))
    }

    return []
  }, [estimativas, form.relationType, propostas])

  const selectedRelation = useMemo<RelationSource | null>(() => {
    if (form.relationType === 'estimativa') {
      const selectedEstimate = estimativas.find((item) => item.id === form.relationId)
      if (!selectedEstimate) return null
      return {
        label: `#${selectedEstimate.id} - ${selectedEstimate.client} - ${selectedEstimate.demand}`,
        clientName: selectedEstimate.client,
        projectName: selectedEstimate.demand,
      }
    }

    if (form.relationType === 'proposta') {
      const selectedProposal = propostas.find((item) => item.id === form.relationId)
      if (!selectedProposal) return null
      return {
        label: `#${selectedProposal.id} - ${selectedProposal.cliente} - ${selectedProposal.projeto}`,
        clientName: selectedProposal.cliente,
        projectName: selectedProposal.projeto,
      }
    }

    return null
  }, [estimativas, form.relationId, form.relationType, propostas])

  const currentRelationLabel = useMemo(() => {
    if (form.relationType === 'none' || !form.relationId) return ''
    return relationOptions.find((option) => option.value === String(form.relationId))?.label || form.relationLabel
  }, [form.relationId, form.relationLabel, form.relationType, relationOptions])

  const sections: Array<{ id: SectionId; label: string }> = [
    { id: 'dados', label: 'Dados Principais' },
    { id: 'ambientacao', label: 'Ambientação' },
    { id: 'termo', label: 'Termo' },
    { id: 'comentarios', label: 'Comentários' },
    { id: 'aceite', label: 'Aceite' },
  ]

  useEffect(() => {
    setRecords(loadRecords())
  }, [])

  useEffect(() => {
    const loadRelationOptions = async () => {
      try {
        const [estimativasResponse, propostasResponse] = await Promise.all([
          fetch(apiUrl('/api/estimativas')),
          fetch(apiUrl('/api/propostas')),
        ])

        if (estimativasResponse.ok) {
          const estimativasData = await estimativasResponse.json() as { items?: unknown[] }
          setEstimativas(Array.isArray(estimativasData.items) ? estimativasData.items.map(normalizeEstimateOption) : [])
        }

        if (propostasResponse.ok) {
          const propostasData = await propostasResponse.json() as { items?: unknown[] }
          setPropostas(Array.isArray(propostasData.items) ? propostasData.items.map(normalizePropostaOption) : [])
        }
      } catch {
        // O vínculo é opcional; se a API não responder, o termo continua funcionando localmente.
      }
    }

    void loadRelationOptions()
  }, [])

  useEffect(() => {
    if (!selectedRelation) return
    setForm((prev) => {
      const nextRelationLabel = selectedRelation.label
      const nextClientName = selectedRelation.clientName
      const nextProjectName = selectedRelation.projectName

      if (
        prev.relationLabel === nextRelationLabel
        && prev.clientName === nextClientName
        && prev.projectName === nextProjectName
      ) {
        return prev
      }

      return {
        ...prev,
        relationLabel: nextRelationLabel,
        clientName: nextClientName,
        projectName: nextProjectName,
      }
    })
  }, [selectedRelation])

  useEffect(() => {
    if (!isModalOpen || !modalRef.current) return
    modalRef.current.scrollTop = 0
  }, [isModalOpen, editingId])

  const persistRecords = (next: TermoRow[]) => {
    setRecords(next)
    saveRecords(next)
  }

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return records
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => {
        if (!term) return true
        return [row.documentCode, row.clientName, row.projectName, row.milestone, row.proposalCode].join(' ').toLowerCase().includes(term)
      })
      .sort((a, b) => b.id - a.id)
  }, [records, search, statusFilter])

  const openNew = () => {
    setError(null)
    setSuccess(null)
    setEditingId(null)
    setIsViewMode(false)
    setForm(createDefaultForm())
    setFormVersion((v) => v + 1)
    setActiveSection('dados')
    setIsModalOpen(true)
  }

  const openEdit = (row: TermoRow) => {
    setError(null)
    setSuccess(null)
    setEditingId(row.id)
    setIsViewMode(false)
    setForm({
      partner: row.partner,
      relationType: row.relationType,
      relationId: row.relationId,
      relationLabel: row.relationLabel,
      documentCode: row.documentCode,
      clientName: row.clientName,
      clientCode: row.clientCode,
      projectName: row.projectName,
      projectCode: row.projectCode,
      clientSegment: row.clientSegment,
      businessUnit: row.businessUnit,
      validationDate: row.validationDate,
      proposalCode: row.proposalCode,
      managerProvider: row.managerProvider,
      managerClient: row.managerClient,
      milestone: row.milestone,
      additionalComments: row.additionalComments,
      processRows: row.processRows.length ? row.processRows : [EMPTY_PROCESS_ROW()],
      approvalRows: row.approvalRows.length ? row.approvalRows : [EMPTY_APPROVAL_ROW()],
      status: row.status,
    })
    setFormVersion((v) => v + 1)
    setActiveSection('dados')
    setIsModalOpen(true)
  }

  const openView = (row: TermoRow) => {
    openEdit(row)
    setIsViewMode(true)
  }

  const closeModal = () => {
    if (isSaving) return
    setIsModalOpen(false)
    setEditingId(null)
    setIsViewMode(false)
  }

  const setF = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleProcessChange = <K extends keyof ProcessRow>(index: number, key: K, value: ProcessRow[K]) => {
    setForm((prev) => ({
      ...prev,
      processRows: prev.processRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    }))
  }

  const handleApprovalChange = <K extends keyof ApprovalRow>(index: number, key: K, value: ApprovalRow[K]) => {
    setForm((prev) => ({
      ...prev,
      approvalRows: prev.approvalRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    }))
  }

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isViewMode) return
    setError(null)
    setSuccess(null)

    if (!form.documentCode.trim() || !form.clientName.trim() || !form.projectName.trim()) {
      setError('Preencha Documento, Nome do cliente e Nome do projeto.')
      return
    }

    if (form.relationType !== 'none' && !form.relationId) {
      setError('Selecione a estimativa ou proposta vinculada.')
      return
    }

    const nextRecord: TermoRow = {
      id: editingId ?? Date.now(),
      ...form,
      relationLabel: currentRelationLabel,
    }

    setIsSaving(true)
    try {
      const next = editingId ? records.map((item) => (item.id === editingId ? nextRecord : item)) : [nextRecord, ...records]
      persistRecords(next)
      setSuccess(editingId ? 'Termo atualizado com sucesso.' : 'Termo criado com sucesso.')
      closeModal()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = (id: number) => {
    if (!window.confirm('Excluir este termo?')) return
    persistRecords(records.filter((item) => item.id !== id))
    setSuccess('Termo excluído com sucesso.')
  }

  const handlePdf = async (row: TermoRow) => {
    setError(null)
    setIsPrinting(true)
    try {
      await generateTermoPdf({ ...row, status: row.status })
      setSuccess(`PDF do termo ${row.id} gerado com sucesso.`)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Nao foi possivel gerar o PDF.')
    } finally {
      setIsPrinting(false)
    }
  }

  const addProcess = () => setF('processRows', [...form.processRows, EMPTY_PROCESS_ROW()])
  const removeProcess = (index: number) => {
    if (form.processRows.length === 1) return
    setF('processRows', form.processRows.filter((_, rowIndex) => rowIndex !== index))
  }
  const addApproval = () => setF('approvalRows', [...form.approvalRows, EMPTY_APPROVAL_ROW()])
  const removeApproval = (index: number) => {
    if (form.approvalRows.length === 1) return
    setF('approvalRows', form.approvalRows.filter((_, rowIndex) => rowIndex !== index))
  }

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Termo de Validação</h2>
            <p className="muted">Rotina no mesmo fluxo da Proposta Comercial, com layout e conteúdo baseados no anexo MIT010.</p>
          </div>
          <button type="button" className="button-primary" onClick={openNew}>Novo Termo</button>
        </div>

        <div className="estimativas-stats">
          <span>Total: <strong>{records.length}</strong></span>
          <span>Rascunhos: <strong>{records.filter((i) => i.status === 'draft').length}</strong></span>
          <span>Enviados: <strong>{records.filter((i) => i.status === 'sent').length}</strong></span>
          <button type="button" className="button-secondary" onClick={() => setRecords(loadRecords())}>Atualizar</button>
        </div>

        <div className="ch-table-toolbar">
          <label className="ch-table-search">
            <span className="ch-table-search__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </span>
            <input type="search" placeholder="Buscar por cliente, projeto, código..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | TermoStatus)} className="ch-filter-select">
            <option value="all">Todos</option>
            <option value="draft">Rascunhos</option>
            <option value="sent">Enviados</option>
          </select>
        </div>

        <div className="estimativas-table ch-table-theme">
          <table>
            <thead>
              <tr>
                <th>Cód.</th>
                <th>Cliente</th>
                <th>Projeto</th>
                <th>Data</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row) => (
                <tr key={row.id}>
                  <td>{row.documentCode}</td>
                  <td>{row.clientName}</td>
                  <td>{row.projectName}</td>
                  <td>{toDisplayDate(row.validationDate)}</td>
                  <td>{row.status === 'sent' ? 'Enviado' : 'Rascunho'}</td>
                  <td>
                    <div className="ch-row-actions ch-row-actions--icons">
                      <button type="button" className="ch-icon-action" title="Visualizar" onClick={() => openView(row)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action" title="Gerar PDF" disabled={isPrinting} onClick={() => void handlePdf(row)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action" title="Editar" onClick={() => openEdit(row)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action ch-icon-action--danger" title="Excluir" onClick={() => handleDelete(row.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredRecords.length && <p className="muted">Nenhum registro encontrado para os filtros atuais.</p>}
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </section>

      {isModalOpen && typeof document !== 'undefined' && createPortal((
        <div className="estimativas-modal-overlay" role="presentation">
          <section ref={modalRef} className="estimativas-modal" style={{ maxWidth: '980px' }} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="estimativas-modal__header">
              <h3>{isViewMode ? 'Visualizar Termo' : editingId ? 'Editar Termo' : 'Novo Termo de Validação'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>Fechar</button>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.75rem 1.5rem 0.5rem', borderBottom: '1px solid #dbe8e4' }}>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    padding: '0.28rem 0.7rem',
                    border: '1px solid #c5dcd6',
                    background: activeSection === section.id ? '#1f6f5d' : '#edf5f2',
                    color: activeSection === section.id ? '#fff' : '#173b35',
                    borderRadius: '7px',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: activeSection === section.id ? 700 : 500,
                  }}
                >
                  {section.label}
                </button>
              ))}
            </div>

            <form className="estimativas-form" onSubmit={handleSave} style={{ padding: '1.25rem 1.5rem' }}>
              {activeSection === 'dados' && (
                <>
                  <label>
                    Código
                    <input value={editingId ?? 'Gerado automaticamente'} disabled />
                  </label>
                  <label>
                    Parceiro
                    <select value={form.partner} onChange={(event) => setF('partner', event.target.value)} disabled={isViewMode}>
                      {PARTNER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Vínculo
                    <select
                      value={form.relationType}
                      onChange={(event) => {
                        const nextRelationType = event.target.value as FormState['relationType']
                        setF('relationType', nextRelationType)
                        setF('relationId', null)
                        setF('relationLabel', '')
                      }}
                      disabled={isViewMode}
                    >
                      <option value="none">Sem vínculo</option>
                      <option value="estimativa">Estimativa</option>
                      <option value="proposta">Proposta comercial</option>
                    </select>
                  </label>
                  {form.relationType !== 'none' && (
                    <label className="estimativas-form__full">
                      {form.relationType === 'estimativa' ? 'Estimativa vinculada' : 'Proposta comercial vinculada'}
                      <select
                        value={form.relationId ?? ''}
                        onChange={(event) => {
                          const nextRelationId = event.target.value ? Number(event.target.value) : null
                          const selectedLabel = relationOptions.find((option) => option.value === event.target.value)?.label || ''
                          setF('relationId', nextRelationId)
                          setF('relationLabel', selectedLabel)
                        }}
                        disabled={isViewMode}
                      >
                        <option value="">Selecione...</option>
                        {relationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  )}
                  <label>
                    Documento *
                    <input value={form.documentCode} onChange={(event) => setF('documentCode', event.target.value)} readOnly={isViewMode} required />
                  </label>
                  <label>
                    Data *
                    <input type="date" value={form.validationDate} onChange={(event) => setF('validationDate', event.target.value)} disabled={isViewMode} required />
                  </label>
                  <label>
                    Status
                    <select value={form.status} onChange={(event) => setF('status', event.target.value as TermoStatus)} disabled={isViewMode}>
                      <option value="draft">Rascunho</option>
                      <option value="sent">Enviado</option>
                    </select>
                  </label>
                  <label className="estimativas-form__full">
                    Vínculo atual
                    <input value={currentRelationLabel || form.relationLabel || 'Sem vínculo'} disabled />
                  </label>
                </>
              )}

              {activeSection === 'ambientacao' && (
                <>
                  <label>
                    Nome do cliente *
                    <input value={form.clientName} onChange={(event) => setF('clientName', event.target.value)} readOnly={isViewMode} required />
                  </label>
                  <label>
                    Código de cliente
                    <input value={form.clientCode} onChange={(event) => setF('clientCode', event.target.value)} readOnly={isViewMode} />
                  </label>
                  <label>
                    Nome do projeto *
                    <input value={form.projectName} onChange={(event) => setF('projectName', event.target.value)} readOnly={isViewMode} required />
                  </label>
                  <label>
                    Código do projeto
                    <input value={form.projectCode} onChange={(event) => setF('projectCode', event.target.value)} readOnly={isViewMode} />
                  </label>
                  <label>
                    Segmento cliente
                    <input value={form.clientSegment} onChange={(event) => setF('clientSegment', event.target.value)} readOnly={isViewMode} />
                  </label>
                  <label>
                    Unidade TOTVS
                    <input value={form.businessUnit} onChange={(event) => setF('businessUnit', event.target.value)} readOnly={isViewMode} />
                  </label>
                  <label>
                    Proposta comercial
                    <input value={form.proposalCode} onChange={(event) => setF('proposalCode', event.target.value)} readOnly={isViewMode} />
                  </label>
                  <label>
                    Gerente/Coordenador {theme.providerLabel}
                    <input value={form.managerProvider} onChange={(event) => setF('managerProvider', event.target.value)} readOnly={isViewMode} />
                  </label>
                  <label>
                    Gerente/Coordenador cliente
                    <input value={form.managerClient} onChange={(event) => setF('managerClient', event.target.value)} readOnly={isViewMode} />
                  </label>
                </>
              )}

              {activeSection === 'termo' && (
                <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Termo de Validação de Entrega
                  <label>
                    Marco validado
                    <input value={form.milestone} onChange={(event) => setF('milestone', event.target.value)} readOnly={isViewMode} placeholder="MIT010" />
                  </label>
                  <div>
                    <div className="estimativas-header-row" style={{ marginTop: '0.75rem' }}>
                      <h4>Processos validados</h4>
                      {!isViewMode && <button type="button" className="button-secondary" onClick={addProcess}>Adicionar item</button>}
                    </div>
                    <div className="estimativas-table ch-table-theme">
                      <table>
                        <thead>
                          <tr>
                            <th>Nome do Processo</th>
                            <th>Data</th>
                            <th>Usuário Chave</th>
                            <th>Analista Visitor/TOTVS</th>
                            {!isViewMode && <th>Ações</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {form.processRows.map((row, index) => (
                            <tr key={`process-${index}`}>
                              <td><input value={row.processName} onChange={(event) => handleProcessChange(index, 'processName', event.target.value)} readOnly={isViewMode} /></td>
                              <td><input type="date" value={row.validationDate} onChange={(event) => handleProcessChange(index, 'validationDate', event.target.value)} disabled={isViewMode} /></td>
                              <td><input value={row.userSignature} onChange={(event) => handleProcessChange(index, 'userSignature', event.target.value)} readOnly={isViewMode} /></td>
                              <td><input value={row.analystSignature} onChange={(event) => handleProcessChange(index, 'analystSignature', event.target.value)} readOnly={isViewMode} /></td>
                              {!isViewMode && <td><button type="button" onClick={() => removeProcess(index)} disabled={form.processRows.length <= 1}>Remover</button></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'comentarios' && (
                <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Comentários adicionais
                  <RichTextEditor
                    key={`comments-${formVersion}`}
                    value={form.additionalComments}
                    onChange={(html) => setF('additionalComments', html)}
                    placeholder="Observações adicionais do termo..."
                    rows={8}
                    disabled={isViewMode || isSaving}
                  />
                </div>
              )}

              {activeSection === 'aceite' && (
                <div className="estimativas-form__full">
                  <div className="estimativas-header-row">
                    <h4>Aceite</h4>
                    {!isViewMode && <button type="button" className="button-secondary" onClick={addApproval}>Adicionar aprovador</button>}
                  </div>
                  <div className="estimativas-table ch-table-theme">
                    <table>
                      <thead>
                        <tr>
                          <th>Aprovado por</th>
                          <th>Assinatura</th>
                          <th>Data</th>
                          {!isViewMode && <th>Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {form.approvalRows.map((row, index) => (
                          <tr key={`approval-${index}`}>
                            <td><input value={row.approvedBy} onChange={(event) => handleApprovalChange(index, 'approvedBy', event.target.value)} readOnly={isViewMode} /></td>
                            <td><input value={row.signature} onChange={(event) => handleApprovalChange(index, 'signature', event.target.value)} readOnly={isViewMode} placeholder="Opcional" /></td>
                            <td><input type="date" value={row.approvalDate} onChange={(event) => handleApprovalChange(index, 'approvalDate', event.target.value)} disabled={isViewMode} /></td>
                            {!isViewMode && <td><button type="button" onClick={() => removeApproval(index)} disabled={form.approvalRows.length <= 1}>Remover</button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <p className="error estimativas-form__full">{error}</p>}

              {!isViewMode && (
                <div className="estimativas-actions estimativas-form__full">
                  <button type="submit" className="button-primary" disabled={isSaving}>{isSaving ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}</button>
                </div>
              )}
            </form>
          </section>
        </div>
      ), document.body)}
    </div>
  )
}