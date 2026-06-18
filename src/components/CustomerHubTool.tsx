import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { jsPDF } from 'jspdf'
import { apiUrl } from '../lib/api'

const STATUS_REPORT_PDF_LOGO_SRC = '/logo.png'

export type CustomerHubPage = 'dashboard' | 'clientes' | 'status-report' | 'contatos' | 'acessos' | 'sistemas' | 'processos' | 'historico'

type ClienteStatus = 'Ativo' | 'Inativo' | 'Em Implantacao'
type ClienteFonte = 'interno' | 'totvs' | 'outros'
type ContatoTipo = 'comercial' | 'servicos' | 'tecnico' | 'usuario' | 'gestao' | 'outros'
type AcessoTipo = 'vpn' | 'servidores' | 'protheus' | 'outros'

const CLIENTE_STATUS_LABEL: Record<ClienteStatus, string> = {
  Ativo: 'Ativo',
  Inativo: 'Inativo',
  'Em Implantacao': 'Em Implantação',
}

const CONTATO_TIPO_LABEL: Record<ContatoTipo, string> = {
  comercial: 'Comercial',
  servicos: 'Serviços',
  tecnico: 'Técnico',
  usuario: 'Usuário',
  gestao: 'Gestão',
  outros: 'Outros',
}

const ACESSO_TIPO_LABEL: Record<AcessoTipo, string> = {
  vpn: 'VPN',
  servidores: 'Servidores',
  protheus: 'Protheus',
  outros: 'Outros',
}

const CLIENTE_FONTE_LABEL: Record<ClienteFonte, string> = {
  interno: 'Interno',
  totvs: 'Totvs',
  outros: 'Outros',
}

type Cliente = {
  id: string
  nome: string
  cnpj: string
  segmento: string
  cidade: string
  status: ClienteStatus
  organizations: string
  dataInicio: string
  fonte: ClienteFonte
}

type Contato = {
  id: string
  nome: string
  clienteId: string
  cargo: string
  departamento: string
  email: string
  telefone: string
  tipo: ContatoTipo
}

type Acesso = {
  id: string
  clienteId: string
  tipo: AcessoTipo
  nome: string
  endereco: string
  usuario: string
  senha: string
  observacoes: string
  particular: boolean
  createdByUsername: string
}

type Sistema = {
  id: string
  produto: string
  clienteId: string
  modulo: string
  versao: string
  contatoId: string
  integracoes: string
  responsavel: string
  observacoes: string
}

type Processo = {
  id: string
  clienteId: string
  nome: string
  descricao: string
  criadoEm: string
  sistemaNome: string
  modulo: string
  responsavel: string
  detalhamento: string
  observacoes: string
  periodicidade: string
  criticidade: string
}

type Atividade = {
  id: string
  clienteId: string
  tipo: string
  descricao: string
  data: string
  evento: string
  sistemaNome: string
  modulo: string
  responsavel: string
  processoNome: string
  observacoes: string
}

type StatusReportTicket = {
  id: string
  protocol: string
  subject: string
  department: string
  client: string
  status: string
  situation: string
  organizationName: string
  createdAt: string
  updatedAt: string
}

type StatusReportTicketAttachment = {
  name: string
  url: string
}

type StatusReportTicketReply = {
  id: string
  sender: string
  senderType: string
  date: string
  message: string
}

type StatusReportTicketDetail = {
  id: string
  protocol: string
  subject: string
  customerName: string
  organizationName: string
  departmentName: string
  categoryName: string
  operatorName: string
  status: string
  priority: string
  createdAt: string
  updatedAt: string
  firstReplyAt: string
  endAt: string
  message: string
  attachments: StatusReportTicketAttachment[]
  replies: StatusReportTicketReply[]
}

type StatusReportPhase = 'pending' | 'typed' | 'sent'

type StatusReportResponse = {
  client: Cliente | null
  tickets: StatusReportTicket[]
  warning?: string
  dashboard?: {
    periodDays?: number
    openedLast15Days?: number
    finalizedLast15Days?: number
    openedPrevious15Days?: number
    finalizedPrevious15Days?: number
    openedCurrentTickets?: StatusReportTicketSummary[]
    finalizedCurrentTickets?: StatusReportTicketSummary[]
    openedPreviousTickets?: StatusReportTicketSummary[]
    finalizedPreviousTickets?: StatusReportTicketSummary[]
  }
}

type StatusReportTicketSummary = {
  ticketId: string
  protocol: string
  subject: string
  organizationName: string
}

type StatusReportCardTooltipData = {
  title: string
  lines: string[]
  overflow: number
}

type StatusReportCardTooltipState = StatusReportCardTooltipData & {
  x: number
  y: number
}

type StatusReportHistoryTicket = {
  ticketKey: string
  ticketId: string
  protocol: string
  subject: string
  organizationName: string
  sourceStatus: string
  sourceSituation: string
  reportStatus: string
  reportPhase: StatusReportPhase
}

type StatusReportHistoryEntry = {
  id: string
  clientId: string
  createdByUsername: string
  createdByDisplayName: string
  sentAt: string
  totalTickets: number
  tickets: StatusReportHistoryTicket[]
}

type StatusReportHistoryResponse = {
  items: StatusReportHistoryEntry[]
}

type StatusReportPdfTicket = {
  protocol: string
  subject: string
  organizationName: string
  sourceStatus: string
  sourceSituation: string
  reportStatus: string
  reportPhase: StatusReportPhase
  updatedAt: string
}

type StatusReportPdfPayload = {
  clientName: string
  clientCnpj: string
  sentAt: string
  generatedBy: string
  tickets: StatusReportPdfTicket[]
  comparison?: {
    periodDays: number
    openedCurrent: number
    openedPrevious: number
    finalizedCurrent: number
    finalizedPrevious: number
    reportCurrentTotal: number
    reportPreviousTotal: number
    reportAdded: number
    reportKept: number
    reportRemoved: number
    previousReportSentAt?: string
  }
}

type CustomerHubOrganization = {
  id: string
  name: string
}

type ModalState<T> = { open: boolean; data: Partial<T> }

function emptyModal<T>(): ModalState<T> {
  return { open: false, data: {} }
}

function normalizeCnpjDigits(value: string, padTo14 = false): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 14)
  if (!padTo14 || digits.length >= 14) return digits
  return digits.length >= 13 ? digits.padStart(14, '0') : digits
}

function formatCnpj(value: string, padTo14 = false): string {
  const digits = normalizeCnpjDigits(value, padTo14)
  if (!digits) return ''

  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function formatReportDateTime(value: string): string {
  const input = String(value || '').trim()
  if (!input) return '—'

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return input

  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function stripHtmlToText(value: string): string {
  const html = String(value || '').trim()
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return html

  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')
  return String(parsed.body.textContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildStatusReportTooltipData(title: string, tickets: Array<{ protocol?: string; subject?: string; organizationName?: string }>): StatusReportCardTooltipData {
  const list = Array.isArray(tickets) ? tickets : []
  if (!list.length) {
    return {
      title,
      lines: ['Nenhum ticket neste indicador.'],
      overflow: 0,
    }
  }

  const maxLines = 20
  const lines = list.slice(0, maxLines).map((ticket, index) => {
    const protocol = String(ticket.protocol || '').trim() || 'Sem protocolo'
    const subject = String(ticket.subject || '').trim() || 'Sem assunto'
    const organization = String(ticket.organizationName || '').trim()
    return `${index + 1}. ${protocol} - ${subject}${organization ? ` (${organization})` : ''}`
  })

  const overflow = list.length - maxLines
  return {
    title,
    lines,
    overflow: Math.max(0, overflow),
  }
}

let visitorLogoDataUrlPromise: Promise<string | null> | null = null

function toSafePdfFilename(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  if (typeof window === 'undefined') return null

  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (!context) {
          resolve(null)
          return
        }

        context.drawImage(image, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function getVisitorLogoDataUrl(): Promise<string | null> {
  if (!visitorLogoDataUrlPromise) {
    visitorLogoDataUrlPromise = loadImageAsDataUrl(STATUS_REPORT_PDF_LOGO_SRC)
  }
  return visitorLogoDataUrlPromise
}

function normalizeStatusReportTicketDetail(payload: Record<string, unknown>): StatusReportTicketDetail {
  const asRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  )

  const readText = (...values: unknown[]): string => {
    for (const value of values) {
      const text = String(value ?? '').trim()
      if (text) return text
    }
    return ''
  }

  const customer = asRecord(payload.customer)
  const customerOrganization = asRecord(customer.organization)
  const department = asRecord(payload.department)
  const category = asRecord(payload.category)
  const operator = asRecord(payload.operator)
  const situation = asRecord(payload.situation)

  const priorityMap: Record<string, string> = {
    '1': 'Baixa',
    '2': 'Normal',
    '3': 'Alta',
    '4': 'Urgente',
  }

  const priorityRaw = readText(payload.priority)
  const priority = priorityMap[priorityRaw] ?? priorityRaw

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
      .map((item) => {
        const attachment = asRecord(item)
        return {
          name: readText(attachment.name, attachment.filename),
          url: readText(attachment.url, attachment.link),
        }
      })
      .filter((item) => item.name || item.url)
    : []

  const replies = Array.isArray(payload.replies)
    ? payload.replies
      .map((item) => {
        const reply = asRecord(item)
        return {
          id: readText(reply.id),
          sender: readText(reply.sender),
          senderType: readText(reply.sender_type),
          date: readText(reply.date),
          message: stripHtmlToText(readText(reply.message)),
        }
      })
      .filter((item) => item.sender || item.message || item.date)
    : []

  return {
    id: readText(payload.id),
    protocol: readText(payload.protocol),
    subject: readText(payload.subject),
    customerName: readText(customer.name),
    organizationName: readText(customerOrganization.name, payload.organization_name),
    departmentName: readText(department.name),
    categoryName: readText(category.name),
    operatorName: readText(operator.name),
    status: readText(situation.description, payload.status),
    priority,
    createdAt: readText(payload.creation_date),
    updatedAt: readText(payload.updated_at, payload.update_date),
    firstReplyAt: readText(payload.first_reply_date),
    endAt: readText(payload.end_date),
    message: stripHtmlToText(readText(payload.message)),
    attachments,
    replies,
  }
}

// Convert API rows (numeric IDs) to frontend strings
function mapCliente(r: Record<string, unknown>): Cliente {
  return {
    id: String(r.id ?? ''),
    nome: String(r.nome ?? ''),
    cnpj: formatCnpj(String(r.cnpj ?? ''), true),
    segmento: String(r.segmento ?? ''),
    cidade: String(r.cidade ?? ''),
    status: (r.status as ClienteStatus) ?? 'Ativo',
    organizations: String(r.organizations ?? ''),
    dataInicio: String(r.dataInicio ?? ''),
    fonte: (r.fonte as ClienteFonte) ?? 'interno',
  }
}

function mapContato(r: Record<string, unknown>): Contato {
  return {
    id: String(r.id ?? ''),
    nome: String(r.nome ?? ''),
    clienteId: String(r.clienteId ?? ''),
    cargo: String(r.cargo ?? ''),
    departamento: String(r.departamento ?? ''),
    email: String(r.email ?? ''),
    telefone: String(r.telefone ?? ''),
    tipo: (r.tipo as ContatoTipo) ?? 'comercial',
  }
}

function mapSistema(r: Record<string, unknown>): Sistema {
  return {
    id: String(r.id ?? ''),
    produto: String(r.produto ?? ''),
    clienteId: String(r.clienteId ?? ''),
    modulo: String(r.modulo ?? ''),
    versao: String(r.versao ?? ''),
    contatoId: r.contatoId == null ? '' : String(r.contatoId),
    integracoes: String(r.integracoes ?? ''),
    responsavel: String(r.responsavel ?? ''),
    observacoes: String(r.observacoes ?? ''),
  }
}

function mapAcesso(r: Record<string, unknown>): Acesso {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    tipo: (r.tipo as AcessoTipo) ?? 'vpn',
    nome: String(r.nome ?? ''),
    endereco: String(r.endereco ?? ''),
    usuario: String(r.usuario ?? ''),
    senha: String(r.senha ?? ''),
    observacoes: String(r.observacoes ?? ''),
    particular: r.particular === true,
    createdByUsername: String(r.createdByUsername ?? ''),
  }
}

function mapProcesso(r: Record<string, unknown>): Processo {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    nome: String(r.nome ?? ''),
    descricao: String(r.descricao ?? ''),
    criadoEm: String(r.criadoEm ?? ''),
    sistemaNome: String(r.sistemaNome ?? ''),
    modulo: String(r.modulo ?? ''),
    responsavel: String(r.responsavel ?? ''),
    detalhamento: String(r.detalhamento ?? ''),
    observacoes: String(r.observacoes ?? ''),
    periodicidade: String(r.periodicidade ?? 'mensal'),
    criticidade: String(r.criticidade ?? 'media'),
  }
}

function mapAtividade(r: Record<string, unknown>): Atividade {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    tipo: String(r.tipo ?? ''),
    descricao: String(r.descricao ?? ''),
    data: String(r.data ?? ''),
    evento: String(r.evento ?? ''),
    sistemaNome: String(r.sistemaNome ?? ''),
    modulo: String(r.modulo ?? ''),
    responsavel: String(r.responsavel ?? ''),
    processoNome: String(r.processoNome ?? ''),
    observacoes: String(r.observacoes ?? ''),
  }
}

export default function CustomerHubTool({
  subPage,
  currentUsername,
  currentDisplayName,
  onOpenStatusReport,
}: {
  subPage: CustomerHubPage
  currentUsername: string
  currentDisplayName: string
  onOpenStatusReport?: (clientId: string) => void
}) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clienteModal, setClienteModal] = useState<ModalState<Cliente>>(emptyModal())
  const [contatoModal, setContatoModal] = useState<ModalState<Contato>>(emptyModal())
  const [acessoModal, setAcessoModal] = useState<ModalState<Acesso>>(emptyModal())
  const [sistemaModal, setSistemaModal] = useState<ModalState<Sistema>>(emptyModal())
  const [processoModal, setProcessoModal] = useState<ModalState<Processo>>(emptyModal())
  const [atividadeModal, setAtividadeModal] = useState<ModalState<Atividade>>(emptyModal())

  const closeAnyModal = () => {
    setClienteModal(emptyModal())
    setContatoModal(emptyModal())
    setAcessoModal(emptyModal())
    setSistemaModal(emptyModal())
    setProcessoModal(emptyModal())
    setAtividadeModal(emptyModal())
    setStatusReportTicketModal(emptyModal())
    setStatusReportTicketDetailModalOpen(false)
    setStatusReportTicketDetailSource(null)
    setStatusReportTicketDetail(null)
    setStatusReportTicketDetailError(null)
    setStatusReportTicketDetailLoading(false)
  }

  const [filterClienteId, setFilterClienteId] = useState('')
  const [clienteSearch, setClienteSearch] = useState('')
  const [contatoSearch, setContatoSearch] = useState('')
  const [acessoSearch, setAcessoSearch] = useState('')
  const [sistemaSearch, setSistemaSearch] = useState('')
  const [processoSearch, setProcessoSearch] = useState('')
  const [atividadeSearch, setAtividadeSearch] = useState('')
  const [statusReportClientId, setStatusReportClientId] = useState('')
  const [statusReportTickets, setStatusReportTickets] = useState<StatusReportTicket[]>([])
  const [statusReportTicketStatuses, setStatusReportTicketStatuses] = useState<Record<string, string>>({})
  const [statusReportTicketPhases, setStatusReportTicketPhases] = useState<Record<string, StatusReportPhase>>({})
  const [statusReportTicketModal, setStatusReportTicketModal] = useState<ModalState<{ ticketKey: string; status: string }>>(emptyModal())
  const [statusReportTicketDetailModalOpen, setStatusReportTicketDetailModalOpen] = useState(false)
  const [statusReportTicketDetailSource, setStatusReportTicketDetailSource] = useState<StatusReportTicket | null>(null)
  const [statusReportTicketDetail, setStatusReportTicketDetail] = useState<StatusReportTicketDetail | null>(null)
  const [statusReportTicketDetailLoading, setStatusReportTicketDetailLoading] = useState(false)
  const [statusReportTicketDetailError, setStatusReportTicketDetailError] = useState<string | null>(null)
  const [statusReportClient, setStatusReportClient] = useState<Cliente | null>(null)
  const [statusReportLoading, setStatusReportLoading] = useState(false)
  const [statusReportError, setStatusReportError] = useState<string | null>(null)
  const [statusReportWarning, setStatusReportWarning] = useState<string | null>(null)
  const [statusReportComparisonPeriodDays, setStatusReportComparisonPeriodDays] = useState(7)
  const [statusReportComparisonPeriodDaysApplied, setStatusReportComparisonPeriodDaysApplied] = useState(7)
  const [statusReportCardTooltip, setStatusReportCardTooltip] = useState<StatusReportCardTooltipState | null>(null)
  const [statusReportPeriodDashboard, setStatusReportPeriodDashboard] = useState({
    periodDays: 7,
    openedLast15Days: 0,
    finalizedLast15Days: 0,
    openedPrevious15Days: 0,
    finalizedPrevious15Days: 0,
    openedCurrentTickets: [] as StatusReportTicketSummary[],
    finalizedCurrentTickets: [] as StatusReportTicketSummary[],
    openedPreviousTickets: [] as StatusReportTicketSummary[],
    finalizedPreviousTickets: [] as StatusReportTicketSummary[],
  })
  const [statusReportHistory, setStatusReportHistory] = useState<StatusReportHistoryEntry[]>([])
  const [statusReportHistoryLoading, setStatusReportHistoryLoading] = useState(false)
  const [statusReportHistoryError, setStatusReportHistoryError] = useState<string | null>(null)
  const [statusReportSubmitting, setStatusReportSubmitting] = useState(false)
  const [statusReportPdfExporting, setStatusReportPdfExporting] = useState(false)
  const [statusReportRefreshToken, setStatusReportRefreshToken] = useState(0)
  const [customerHubOrganizations, setCustomerHubOrganizations] = useState<CustomerHubOrganization[]>([])
  const [customerHubOrganizationsLoading, setCustomerHubOrganizationsLoading] = useState(false)
  const [customerHubOrganizationsError, setCustomerHubOrganizationsError] = useState<string | null>(null)
  const [organizationDropdownOpen, setOrganizationDropdownOpen] = useState(false)
  const organizationDropdownRef = useRef<HTMLDivElement | null>(null)

  const requestHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {}
    if (!currentUsername.trim()) return headers

    headers['x-user'] = currentUsername.trim().toLowerCase()
    headers['x-user-display'] = currentDisplayName.trim()
    return headers
  }, [currentUsername, currentDisplayName])

  // Bootstrap: load all data on mount
  useEffect(() => {
    setIsLoading(true)
    setError(null)
    fetch(apiUrl('/api/customer-hub/bootstrap'), { headers: requestHeaders })
      .then((res) => {
        if (!res.ok) return res.json().then((b) => Promise.reject(new Error(b.error ?? `HTTP ${res.status}`)))
        return res.json()
      })
      .then((data) => {
        const clients = data.clients ?? data.clientes ?? []
        const contacts = data.contacts ?? data.contatos ?? []
        const accesses = data.accesses ?? data.acessos ?? []
        const systems = data.systems ?? data.sistemas ?? []
        const processes = data.processes ?? data.processos ?? []
        const activities = data.activities ?? data.atividades ?? []

        setClientes(clients.map(mapCliente))
        setContatos(contacts.map(mapContato))
        setAcessos(accesses.map(mapAcesso))
        setSistemas(systems.map(mapSistema))
        setProcessos(processes.map(mapProcesso))
        setAtividades(activities.map(mapAtividade))
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao carregar dados.'))
      .finally(() => setIsLoading(false))
  }, [requestHeaders])

  useEffect(() => {
    let cancelled = false

    const loadOrganizations = async () => {
      setCustomerHubOrganizationsLoading(true)
      setCustomerHubOrganizationsError(null)

      try {
        const response = await fetch(apiUrl('/api/customer-hub/organizations'), {
          headers: requestHeaders,
          cache: 'no-store',
        })
        const body = await response.json() as { organizations?: CustomerHubOrganization[]; error?: string }

        if (!response.ok) {
          throw new Error(body?.error ?? 'Erro ao carregar organizações da central de chamados.')
        }

        if (cancelled) return
        setCustomerHubOrganizations(Array.isArray(body.organizations) ? body.organizations : [])
      } catch (err) {
        if (cancelled) return
        setCustomerHubOrganizations([])
        setCustomerHubOrganizationsError(err instanceof Error ? err.message : 'Erro ao carregar organizações da central de chamados.')
      } finally {
        if (!cancelled) {
          setCustomerHubOrganizationsLoading(false)
        }
      }
    }

    void loadOrganizations()
    return () => {
      cancelled = true
    }
  }, [requestHeaders])

  useEffect(() => {
    const hasOpenModal = (
      clienteModal.open
      || contatoModal.open
      || acessoModal.open
      || sistemaModal.open
      || processoModal.open
      || atividadeModal.open
      || statusReportTicketModal.open
      || statusReportTicketDetailModalOpen
    )

    if (!hasOpenModal) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAnyModal()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [clienteModal.open, contatoModal.open, acessoModal.open, sistemaModal.open, processoModal.open, atividadeModal.open, statusReportTicketModal.open, statusReportTicketDetailModalOpen])

  useEffect(() => {
    if (!clienteModal.open) {
      setOrganizationDropdownOpen(false)
    }
  }, [clienteModal.open])

  useEffect(() => {
    if (!organizationDropdownOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (organizationDropdownRef.current?.contains(target)) return
      setOrganizationDropdownOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [organizationDropdownOpen])

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '-'
  const getContatoNome = (id: string) => contatos.find((c) => c.id === id)?.nome ?? '-'

  const getPartnerOrganizationIds = (value: string): string[] => {
    const raw = String(value ?? '').trim()
    if (!raw) return []

    const normalized = raw
      .replace(/\r?\n/g, ',')
      .replace(/[;|]/g, ',')

    const ids = normalized
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const bracketMatch = item.match(/\[([^\]]+)\]/)
        return bracketMatch?.[1]?.trim() || item
      })

    return Array.from(new Set(ids))
  }

  const organizationNameById = useMemo(() => {
    const map = new Map<string, string>()
    customerHubOrganizations.forEach((organization) => {
      map.set(String(organization.id), String(organization.name))
    })
    return map
  }, [customerHubOrganizations])

  const availableOrganizationIds = useMemo(() => new Set(customerHubOrganizations.map((organization) => String(organization.id))), [customerHubOrganizations])

  const normalizeSelectedOrganizationIds = (value: string): string[] => {
    const ids = getPartnerOrganizationIds(value)
    return ids.filter((id) => availableOrganizationIds.has(id))
  }

  const formatPartnerOrganizationsLabel = (value: string): string => {
    const ids = normalizeSelectedOrganizationIds(value)
    if (!ids.length) return '—'

    const names = ids.map((id) => organizationNameById.get(id) ?? `ID ${id}`)
    return names.join(', ')
  }

  const stats = useMemo(() => ({
    totalClientes: clientes.length,
    ativos: clientes.filter((c) => c.status === 'Ativo').length,
    inativos: clientes.filter((c) => c.status === 'Inativo').length,
    emImplantacao: clientes.filter((c) => c.status === 'Em Implantacao').length,
    totalContatos: contatos.length,
    totalAcessos: acessos.length,
    totalSistemas: sistemas.length,
    totalAtividades: atividades.length,
  }), [clientes, contatos, acessos, sistemas, atividades])

  const selectedStatusReportClient = useMemo(
    () => statusReportClient ?? clientes.find((cliente) => cliente.id === statusReportClientId) ?? null,
    [clientes, statusReportClient, statusReportClientId],
  )

  const getStatusReportTicketKey = (ticket: StatusReportTicket) => (
    `${ticket.id || ''}|${ticket.protocol || ''}|${ticket.subject || ''}`
  )

  const getStatusReportTicketPhase = (ticketKey: string): StatusReportPhase => {
    const explicitPhase = statusReportTicketPhases[ticketKey]
    if (explicitPhase) return explicitPhase

    const hasTypedStatus = Boolean(statusReportTicketStatuses[ticketKey]?.trim())
    return hasTypedStatus ? 'typed' : 'pending'
  }

  const getStatusReportPhaseLabel = (phase: StatusReportPhase): string => {
    if (phase === 'sent') return 'Enviado'
    if (phase === 'typed') return 'Digitado'
    return 'Pendente'
  }

  const getStatusReportPhaseClassName = (phase: StatusReportPhase): string => {
    if (phase === 'sent') return 'sent'
    if (phase === 'typed') return 'completed'
    return 'pending'
  }

  const lastReportedStatusByTicketRef = useMemo(() => {
    const map = new Map<string, string>()

    for (const historyEntry of statusReportHistory) {
      for (const historyTicket of historyEntry.tickets ?? []) {
        const reportStatus = String(historyTicket.reportStatus || '').trim()
        if (!reportStatus) continue

        const refs = [
          String(historyTicket.ticketKey || '').trim(),
          String(historyTicket.ticketId || '').trim(),
          String(historyTicket.protocol || '').trim(),
        ].filter(Boolean)

        for (const ref of refs) {
          if (!map.has(ref)) {
            map.set(ref, reportStatus)
          }
        }
      }
    }

    return map
  }, [statusReportHistory])

  const openStatusReportTicketModal = (ticket: StatusReportTicket) => {
    const ticketKey = getStatusReportTicketKey(ticket)
    const currentStatus = String(statusReportTicketStatuses[ticketKey] || '').trim()
    const fallbackStatus = (
      lastReportedStatusByTicketRef.get(ticketKey)
      || lastReportedStatusByTicketRef.get(String(ticket.id || '').trim())
      || lastReportedStatusByTicketRef.get(String(ticket.protocol || '').trim())
      || ''
    )

    setStatusReportTicketModal({
      open: true,
      data: {
        ticketKey,
        status: currentStatus || fallbackStatus,
      },
    })
  }

  const saveStatusReportTicketStatus = () => {
    const ticketKey = String(statusReportTicketModal.data.ticketKey ?? '').trim()
    if (!ticketKey) return

    const statusValue = String(statusReportTicketModal.data.status ?? '').trim()
    setStatusReportTicketStatuses((prev) => {
      if (!statusValue) {
        if (!Object.prototype.hasOwnProperty.call(prev, ticketKey)) return prev
        const next = { ...prev }
        delete next[ticketKey]
        return next
      }

      return {
        ...prev,
        [ticketKey]: statusValue,
      }
    })

    setStatusReportTicketPhases((prev) => {
      const currentPhase = prev[ticketKey]
      if (!statusValue) {
        if (currentPhase === 'pending' || !currentPhase) return prev
        return {
          ...prev,
          [ticketKey]: 'pending',
        }
      }

      if (currentPhase === 'sent') return prev
      return {
        ...prev,
        [ticketKey]: 'typed',
      }
    })

    setStatusReportTicketModal(emptyModal())
  }

  const closeStatusReportTicketDetailModal = () => {
    setStatusReportTicketDetailModalOpen(false)
    setStatusReportTicketDetailSource(null)
    setStatusReportTicketDetail(null)
    setStatusReportTicketDetailError(null)
    setStatusReportTicketDetailLoading(false)
  }

  const openStatusReportTicketDetailModal = async (ticket: StatusReportTicket) => {
    const ticketId = String(ticket.id || '').trim()
    setStatusReportTicketDetailSource(ticket)
    setStatusReportTicketDetailModalOpen(true)
    setStatusReportTicketDetail(null)
    setStatusReportTicketDetailError(null)

    if (!ticketId) {
      setStatusReportTicketDetailError('Este chamado não possui ID válido para consulta de detalhes.')
      return
    }

    setStatusReportTicketDetailLoading(true)

    try {
      const params = new URLSearchParams({ ticket_id: ticketId })
      const response = await fetch(apiUrl(`/api/ticket-hub/tickets/detail?${params.toString()}`), {
        headers: requestHeaders,
      })

      const bodyText = await response.text()
      const body = (bodyText ? JSON.parse(bodyText) : null) as { detail?: Record<string, unknown>; error?: string } | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Não foi possível carregar o detalhe do chamado.')
      }

      if (!body?.detail || typeof body.detail !== 'object') {
        throw new Error('Resposta inválida ao buscar detalhe do chamado.')
      }

      setStatusReportTicketDetail(normalizeStatusReportTicketDetail(body.detail))
    } catch (err) {
      setStatusReportTicketDetailError(err instanceof Error ? err.message : 'Não foi possível carregar o detalhe do chamado.')
    } finally {
      setStatusReportTicketDetailLoading(false)
    }
  }

  const setStatusReportTicketPhase = (ticket: StatusReportTicket, phase: StatusReportPhase) => {
    const ticketKey = getStatusReportTicketKey(ticket)

    setStatusReportTicketPhases((prev) => {
      if (prev[ticketKey] === phase) return prev
      return {
        ...prev,
        [ticketKey]: phase,
      }
    })
  }

  const statusReportSentTicketItems = useMemo(() => {
    return statusReportTickets
      .map((ticket) => {
        const ticketKey = getStatusReportTicketKey(ticket)
        const phase = getStatusReportTicketPhase(ticketKey)
        return {
          ticket,
          ticketKey,
          phase,
        }
      })
      .filter((item) => item.phase === 'sent')
  }, [statusReportTicketPhases, statusReportTicketStatuses, statusReportTickets])

  const statusReportOrderedHistory = useMemo(() => {
    return [...statusReportHistory].sort((a, b) => {
      const timeA = new Date(a.sentAt || '').getTime()
      const timeB = new Date(b.sentAt || '').getTime()
      return timeB - timeA
    })
  }, [statusReportHistory])

  const statusReportLatestHistory = useMemo(() => statusReportOrderedHistory[0] ?? null, [statusReportOrderedHistory])
  const statusReportPreviousHistory = useMemo(() => statusReportOrderedHistory[1] ?? null, [statusReportOrderedHistory])

  const statusReportComparison = useMemo(() => {
    const currentTickets = statusReportLatestHistory?.tickets ?? []
    const previousTickets = statusReportPreviousHistory?.tickets ?? []

    const currentSet = new Set(currentTickets.map((ticket) => ticket.ticketKey))
    const previousSet = new Set(previousTickets.map((ticket) => ticket.ticketKey))
    const currentMap = new Map(currentTickets.map((ticket) => [ticket.ticketKey, ticket]))
    const previousMap = new Map(previousTickets.map((ticket) => [ticket.ticketKey, ticket]))

    const added = Array.from(currentSet).filter((key) => !previousSet.has(key))
    const kept = Array.from(currentSet).filter((key) => previousSet.has(key))
    const removed = Array.from(previousSet).filter((key) => !currentSet.has(key))

    return {
      currentTotal: currentSet.size,
      previousTotal: previousSet.size,
      added: added.length,
      kept: kept.length,
      removed: removed.length,
      previousTickets,
      addedTickets: added
        .map((key) => currentMap.get(key))
        .filter((ticket): ticket is StatusReportHistoryTicket => Boolean(ticket)),
      keptTickets: kept
        .map((key) => currentMap.get(key))
        .filter((ticket): ticket is StatusReportHistoryTicket => Boolean(ticket)),
      removedTickets: removed
        .map((key) => previousMap.get(key))
        .filter((ticket): ticket is StatusReportHistoryTicket => Boolean(ticket)),
    }
  }, [statusReportLatestHistory, statusReportPreviousHistory])

  const statusReportFortnightChartRows = useMemo(() => {
    const rows = [
      {
        id: 'opened',
        label: 'Abertos',
        current: Number(statusReportPeriodDashboard.openedLast15Days ?? 0),
        previous: Number(statusReportPeriodDashboard.openedPrevious15Days ?? 0),
        currentColor: '#2563eb',
        previousColor: '#93c5fd',
      },
      {
        id: 'finalized',
        label: 'Finalizados',
        current: Number(statusReportPeriodDashboard.finalizedLast15Days ?? 0),
        previous: Number(statusReportPeriodDashboard.finalizedPrevious15Days ?? 0),
        currentColor: '#0f766e',
        previousColor: '#99f6e4',
      },
    ]

    const maxValue = Math.max(1, ...rows.flatMap((row) => [row.current, row.previous]))
    return rows.map((row) => ({
      ...row,
      currentPercent: Math.max(6, Math.round((row.current / maxValue) * 100)),
      previousPercent: Math.max(6, Math.round((row.previous / maxValue) * 100)),
      delta: row.current - row.previous,
    }))
  }, [statusReportPeriodDashboard])

  const openStatusReportCardTooltip = (
    event: { clientX: number; clientY: number },
    title: string,
    tickets: Array<{ protocol?: string; subject?: string; organizationName?: string }>,
  ) => {
    const tooltipData = buildStatusReportTooltipData(title, tickets)
    const maxWidth = 420
    const safeX = Math.min(Math.max(16, event.clientX + 14), Math.max(16, window.innerWidth - maxWidth - 16))
    const safeY = Math.min(Math.max(16, event.clientY + 14), Math.max(16, window.innerHeight - 220))

    setStatusReportCardTooltip({
      ...tooltipData,
      x: safeX,
      y: safeY,
    })
  }

  const closeStatusReportCardTooltip = () => {
    setStatusReportCardTooltip(null)
  }

  const handleSendStatusReport = async () => {
    if (!statusReportClientId) {
      alert('Selecione um cliente para enviar o status report.')
      return
    }

    if (!statusReportSentTicketItems.length) {
      alert('Marque ao menos um ticket como enviado antes de gravar o historico.')
      return
    }

    setStatusReportSubmitting(true)
    setStatusReportHistoryError(null)

    try {
      const generatedBy = currentDisplayName.trim() || currentUsername.trim() || 'Usuário'
      const payload = {
        clientId: statusReportClientId,
        sentAt: new Date().toISOString(),
        tickets: statusReportSentTicketItems.map(({ ticket, ticketKey, phase }) => ({
          ticketKey,
          ticketId: ticket.id,
          protocol: ticket.protocol,
          subject: ticket.subject,
          organizationName: ticket.organizationName,
          sourceStatus: ticket.status,
          sourceSituation: ticket.situation,
          reportStatus: statusReportTicketStatuses[ticketKey] ?? '',
          reportPhase: phase,
        })),
      }

      const response = await fetch(apiUrl('/api/customer-hub/status-report/history'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify(payload),
      })
      const bodyText = await response.text()
      const body = (bodyText ? JSON.parse(bodyText) : null) as { item?: StatusReportHistoryEntry; error?: string } | null

      if (!response.ok) {
        throw new Error(body?.error ?? 'Erro ao gravar historico do status report.')
      }

      if (body?.item) {
        setStatusReportHistory((prev) => [body.item as StatusReportHistoryEntry, ...prev])
      }

      const pdfTickets: StatusReportPdfTicket[] = statusReportSentTicketItems.map(({ ticket, ticketKey, phase }) => ({
        protocol: String(ticket.protocol || ticket.id || '').trim(),
        subject: String(ticket.subject || '').trim(),
        organizationName: String(ticket.organizationName || '').trim(),
        sourceStatus: String(ticket.status || '').trim(),
        sourceSituation: String(ticket.situation || '').trim(),
        reportStatus: String(statusReportTicketStatuses[ticketKey] || '').trim(),
        reportPhase: phase,
        updatedAt: String(ticket.updatedAt || ticket.createdAt || payload.sentAt).trim(),
      }))

      const currentReportTicketKeys = new Set(statusReportSentTicketItems.map((item) => item.ticketKey))
      const previousReportTicketKeys = new Set((statusReportLatestHistory?.tickets ?? []).map((ticket) => ticket.ticketKey))
      const reportAdded = Array.from(currentReportTicketKeys).filter((key) => !previousReportTicketKeys.has(key)).length
      const reportKept = Array.from(currentReportTicketKeys).filter((key) => previousReportTicketKeys.has(key)).length
      const reportRemoved = Array.from(previousReportTicketKeys).filter((key) => !currentReportTicketKeys.has(key)).length

      const exportPayload: StatusReportPdfPayload = {
        clientName: selectedStatusReportClient?.nome || 'Cliente',
        clientCnpj: selectedStatusReportClient?.cnpj || '',
        sentAt: payload.sentAt,
        generatedBy,
        tickets: pdfTickets,
        comparison: {
          periodDays: Number(statusReportPeriodDashboard.periodDays ?? 15),
          openedCurrent: Number(statusReportPeriodDashboard.openedLast15Days ?? 0),
          openedPrevious: Number(statusReportPeriodDashboard.openedPrevious15Days ?? 0),
          finalizedCurrent: Number(statusReportPeriodDashboard.finalizedLast15Days ?? 0),
          finalizedPrevious: Number(statusReportPeriodDashboard.finalizedPrevious15Days ?? 0),
          reportCurrentTotal: currentReportTicketKeys.size,
          reportPreviousTotal: previousReportTicketKeys.size,
          reportAdded,
          reportKept,
          reportRemoved,
          previousReportSentAt: statusReportLatestHistory?.sentAt,
        },
      }

      setStatusReportPdfExporting(true)
      try {
        await generateStatusReportPdf(exportPayload)
      } catch (pdfError) {
        console.error(pdfError)
        alert('Status report gravado, mas nao foi possivel gerar o PDF.')
      } finally {
        setStatusReportPdfExporting(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gravar historico do status report.'
      setStatusReportHistoryError(message)
      alert(message)
    } finally {
      setStatusReportSubmitting(false)
    }
  }

  const generateStatusReportPdf = async (report: StatusReportPdfPayload) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 38
    const contentWidth = pageWidth - margin * 2
    const lineHeightFactor = 1.35
    let y = margin

    const drawHeader = async (firstPage: boolean) => {
      const headerHeight = firstPage ? 106 : 84
      doc.setFillColor(231, 242, 238)
      doc.roundedRect(margin, y, contentWidth, headerHeight, 12, 12, 'F')

      const logoDataUrl = await getVisitorLogoDataUrl()
      if (logoDataUrl) {
        const logoHeight = firstPage ? 52 : 42
        const logoProps = doc.getImageProperties(logoDataUrl)
        const logoRatio = logoProps.width / logoProps.height
        const logoWidth = logoHeight * logoRatio
        const logoX = margin + 14
        const logoY = y + (headerHeight - logoHeight) / 2
        doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoWidth, logoHeight)
      }

      doc.setTextColor(20, 66, 57)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(firstPage ? 19 : 15)
      doc.text('Status Report', pageWidth - margin - 14, y + (firstPage ? 34 : 29), { align: 'right' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(43, 91, 82)
      doc.text(`Cliente: ${report.clientName || '—'}`, pageWidth - margin - 14, y + (firstPage ? 54 : 47), { align: 'right' })
      doc.text(`Enviado em: ${formatReportDateTime(report.sentAt)}`, pageWidth - margin - 14, y + (firstPage ? 70 : 62), { align: 'right' })

      if (firstPage) {
        const cnpjLabel = report.clientCnpj ? formatCnpj(report.clientCnpj, true) : '—'
        doc.text(`CNPJ: ${cnpjLabel}`, pageWidth - margin - 14, y + 86, { align: 'right' })
      }

      y += headerHeight + 16
    }

    const ensureSpace = async (required: number) => {
      if (y + required <= pageHeight - margin - 34) return
      doc.addPage()
      y = margin
      await drawHeader(false)
    }

    const drawWrappedText = (
      text: string,
      x: number,
      yPos: number,
      width: number,
      size = 10,
      style: 'normal' | 'bold' = 'normal',
      color: [number, number, number] = [37, 52, 50],
    ) => {
      doc.setFont('helvetica', style)
      doc.setFontSize(size)
      doc.setTextColor(color[0], color[1], color[2])
      const lines = doc.splitTextToSize(text || '—', width)
      doc.text(lines, x, yPos, { lineHeightFactor })
      return lines.length * size * lineHeightFactor
    }

    await drawHeader(true)

    await ensureSpace(70)
    doc.setFillColor(245, 248, 247)
    doc.roundedRect(margin, y, contentWidth, 62, 10, 10, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(29, 74, 65)
    doc.text('Resumo executivo', margin + 14, y + 22)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(57, 80, 74)
    doc.text(`Total de tickets enviados: ${report.tickets.length}`, margin + 14, y + 40)
    doc.text(`Responsável: ${report.generatedBy || '—'}`, margin + 210, y + 40)
    y += 80

    if (report.comparison) {
      const comparison = report.comparison
      const blockHeight = 214
      await ensureSpace(blockHeight)

      const periodLabel = comparison.periodDays > 0 ? `${comparison.periodDays} dias` : '15 dias'
      const maxBase = Math.max(1, comparison.openedCurrent, comparison.openedPrevious, comparison.finalizedCurrent, comparison.finalizedPrevious)

      const drawMetricRow = (
        yPos: number,
        label: string,
        current: number,
        previous: number,
        currentColor: [number, number, number],
        previousColor: [number, number, number],
      ) => {
        const barMaxWidth = 210
        const currentWidth = Math.max(8, Math.round((Math.max(0, current) / maxBase) * barMaxWidth))
        const previousWidth = Math.max(8, Math.round((Math.max(0, previous) / maxBase) * barMaxWidth))
        const delta = current - previous
        const barStartX = margin + 128
        const rightX = margin + contentWidth - 14

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(37, 62, 56)
        doc.text(label, margin + 14, yPos)
        const variation = delta > 0 ? `+ ${delta}` : delta < 0 ? `- ${Math.abs(delta)}` : '= 0'
        doc.text(variation, rightX, yPos, { align: 'right' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(81, 101, 96)
        doc.text(`Período atual: ${current}`, margin + 14, yPos + 16)
        doc.text(`Período anterior: ${previous}`, margin + 14, yPos + 38)

        const currentBarY = yPos + 10
        const previousBarY = yPos + 32

        doc.setFillColor(232, 238, 236)
        doc.roundedRect(barStartX, currentBarY, barMaxWidth, 8, 4, 4, 'F')
        doc.roundedRect(barStartX, previousBarY, barMaxWidth, 8, 4, 4, 'F')

        doc.setFillColor(currentColor[0], currentColor[1], currentColor[2])
        doc.roundedRect(barStartX, currentBarY, currentWidth, 8, 4, 4, 'F')
        doc.setFillColor(previousColor[0], previousColor[1], previousColor[2])
        doc.roundedRect(barStartX, previousBarY, previousWidth, 8, 4, 4, 'F')
      }

      doc.setFillColor(243, 248, 246)
      doc.roundedRect(margin, y, contentWidth, blockHeight - 14, 10, 10, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(24, 71, 62)
      doc.text('Dashboard Comparativo', margin + 14, y + 22)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(72, 92, 87)
      doc.text(`Período: ${periodLabel}`, margin + 14, y + 38)
      doc.text(
        `Report anterior: ${comparison.previousReportSentAt ? formatReportDateTime(comparison.previousReportSentAt) : '—'} | Total anterior: ${comparison.reportPreviousTotal}`,
        margin + 14,
        y + 52,
      )
      doc.text(
        `Enviados (atual): ${comparison.reportCurrentTotal} | Novos: ${comparison.reportAdded} | Mantidos: ${comparison.reportKept} | Removidos: ${comparison.reportRemoved}`,
        margin + 14,
        y + 66,
      )

      drawMetricRow(y + 92, 'Abertos', comparison.openedCurrent, comparison.openedPrevious, [37, 99, 235], [147, 197, 253])
      drawMetricRow(y + 146, 'Finalizados', comparison.finalizedCurrent, comparison.finalizedPrevious, [15, 118, 110], [153, 246, 228])

      y += blockHeight
    }

    await ensureSpace(30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(18, 66, 58)
    doc.text('Tickets reportados', margin, y)
    y += 18

    for (const [index, ticket] of report.tickets.entries()) {
      const reportStatusText = ticket.reportStatus || 'Sem status informado'
      const ticketStatusText = ticket.sourceStatus || ticket.sourceSituation || '—'
      const sourceSituationText = ticket.sourceSituation || '—'
      const updatedAtText = formatReportDateTime(ticket.updatedAt)

      const subjectLines = doc.splitTextToSize(ticket.subject || 'Sem assunto', contentWidth - 28)
      const reportStatusLines = doc.splitTextToSize(`Status report: ${reportStatusText}`, contentWidth - 28)
      const cardHeight = Math.max(94, 56 + (subjectLines.length + reportStatusLines.length) * 12)

      await ensureSpace(cardHeight + 10)

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(217, 228, 224)
      doc.roundedRect(margin, y, contentWidth, cardHeight, 10, 10, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(20, 66, 57)
      doc.text(`${index + 1}. Ticket ${ticket.protocol || '—'}`, margin + 12, y + 19)
      doc.text(`Status: ${ticketStatusText}`, pageWidth - margin - 12, y + 19, { align: 'right' })

      let cardY = y + 36
      const subjectHeight = drawWrappedText(ticket.subject || 'Sem assunto', margin + 12, cardY, contentWidth - 24, 10, 'bold', [41, 64, 59])
      cardY += subjectHeight + 5
      const reportStatusHeight = drawWrappedText(`Status report: ${reportStatusText}`, margin + 12, cardY, contentWidth - 24, 10, 'normal', [47, 63, 60])
      cardY += reportStatusHeight + 5
      drawWrappedText(`Situação: ${sourceSituationText}`, margin + 12, cardY, contentWidth - 24, 9, 'normal', [77, 93, 90])

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(96, 114, 110)
      doc.text(`Atualização: ${updatedAtText}`, pageWidth - margin - 12, y + cardHeight - 12, { align: 'right' })

      y += cardHeight + 10
    }

    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(225, 235, 232)
      doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(98, 112, 109)
      doc.text('Visitor Consultoria - Status Report', margin, pageHeight - 14)
      doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 14, { align: 'right' })
    }

    const safeClient = toSafePdfFilename(report.clientName || 'cliente') || 'cliente'
    const datePart = String(report.sentAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
    doc.save(`status-report-${safeClient}-${datePart}.pdf`)
  }

  const handleDownloadHistoryStatusReportPdf = async (entry: StatusReportHistoryEntry) => {
    if (!selectedStatusReportClient) {
      alert('Selecione um cliente para exportar o PDF do historico.')
      return
    }

    const exportPayload: StatusReportPdfPayload = {
      clientName: selectedStatusReportClient.nome,
      clientCnpj: selectedStatusReportClient.cnpj,
      sentAt: entry.sentAt,
      generatedBy: entry.createdByDisplayName || entry.createdByUsername || 'Usuário',
      tickets: (entry.tickets || []).map((ticket) => ({
        protocol: String(ticket.protocol || ticket.ticketId || '').trim(),
        subject: String(ticket.subject || '').trim(),
        organizationName: String(ticket.organizationName || '').trim(),
        sourceStatus: String(ticket.sourceStatus || '').trim(),
        sourceSituation: String(ticket.sourceSituation || '').trim(),
        reportStatus: String(ticket.reportStatus || '').trim(),
        reportPhase: ticket.reportPhase,
        updatedAt: String(entry.sentAt || '').trim(),
      })),
      comparison: {
        periodDays: Number(statusReportPeriodDashboard.periodDays ?? 15),
        openedCurrent: Number(statusReportPeriodDashboard.openedLast15Days ?? 0),
        openedPrevious: Number(statusReportPeriodDashboard.openedPrevious15Days ?? 0),
        finalizedCurrent: Number(statusReportPeriodDashboard.finalizedLast15Days ?? 0),
        finalizedPrevious: Number(statusReportPeriodDashboard.finalizedPrevious15Days ?? 0),
        reportCurrentTotal: Number(statusReportComparison.currentTotal ?? 0),
        reportPreviousTotal: Number(statusReportComparison.previousTotal ?? 0),
        reportAdded: Number(statusReportComparison.added ?? 0),
        reportKept: Number(statusReportComparison.kept ?? 0),
        reportRemoved: Number(statusReportComparison.removed ?? 0),
        previousReportSentAt: statusReportPreviousHistory?.sentAt,
      },
    }

    setStatusReportPdfExporting(true)
    try {
      await generateStatusReportPdf(exportPayload)
    } catch (pdfError) {
      console.error(pdfError)
      alert('Nao foi possivel gerar o PDF do historico selecionado.')
    } finally {
      setStatusReportPdfExporting(false)
    }
  }

  const handleOpenStatusReport = (clienteId: string) => {
    setStatusReportClientId(clienteId)
    setStatusReportClient(null)
    setStatusReportTickets([])
    setStatusReportPeriodDashboard({
      periodDays: statusReportComparisonPeriodDays,
      openedLast15Days: 0,
      finalizedLast15Days: 0,
      openedPrevious15Days: 0,
      finalizedPrevious15Days: 0,
      openedCurrentTickets: [],
      finalizedCurrentTickets: [],
      openedPreviousTickets: [],
      finalizedPreviousTickets: [],
    })
    setStatusReportTicketStatuses({})
    setStatusReportTicketPhases({})
    setStatusReportTicketModal(emptyModal())
    closeStatusReportTicketDetailModal()
    setStatusReportError(null)
    onOpenStatusReport?.(clienteId)
  }

  // CRUD — Clientes
  const handleSaveCliente = async () => {
    const d = clienteModal.data
    if (!d.nome?.trim()) return
    const cnpjDigits = normalizeCnpjDigits(String(d.cnpj ?? ''))
    if (cnpjDigits.length > 0 && cnpjDigits.length !== 14) {
      alert('CNPJ invalido. Informe 14 digitos.')
      return
    }
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/clients/${d.id}`) : apiUrl('/api/customer-hub/clients')
    const method = isEdit ? 'PUT' : 'POST'
    const payload = {
      ...d,
      cnpj: normalizeCnpjDigits(String(d.cnpj ?? '')),
      organizations: normalizeSelectedOrganizationIds(String(d.organizations ?? '')),
    }
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...requestHeaders }, body: JSON.stringify(payload) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapCliente(body.item as Record<string, unknown>)
      setClientes((prev) => isEdit ? prev.map((c) => c.id === saved.id ? saved : c) : [...prev, saved])
      setClienteModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
    }
  }

  const handleDeleteCliente = async (id: string) => {
    if (!window.confirm('Excluir este cliente e todos os registros vinculados?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/clients/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setClientes((prev) => prev.filter((c) => c.id !== id))
      setContatos((prev) => prev.filter((c) => c.clienteId !== id))
      setAcessos((prev) => prev.filter((a) => a.clienteId !== id))
      setSistemas((prev) => prev.filter((s) => s.clienteId !== id))
      setProcessos((prev) => prev.filter((p) => p.clienteId !== id))
      setAtividades((prev) => prev.filter((a) => a.clienteId !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir cliente.')
    }
  }

  // CRUD — Contatos
  const handleSaveContato = async () => {
    const d = contatoModal.data
    if (!d.nome?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/contacts/${d.id}`) : apiUrl('/api/customer-hub/contacts')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify(d),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapContato(body.item as Record<string, unknown>)
      setContatos((prev) => isEdit ? prev.map((c) => c.id === saved.id ? saved : c) : [...prev, saved])
      setContatoModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar contato.')
    }
  }

  const handleDuplicateContato = async (c: Contato) => {
    const payload = { ...c, id: undefined, nome: `${c.nome} (cópia)` }
    try {
      const res = await fetch(apiUrl('/api/customer-hub/contacts'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setContatos((prev) => [...prev, mapContato(body.item as Record<string, unknown>)])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao duplicar contato.')
    }
  }

  const handleDeleteContato = async (id: string) => {
    if (!window.confirm('Excluir este contato?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/contacts/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setContatos((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir contato.')
    }
  }

  // CRUD — Acessos
  const handleSaveAcesso = async () => {
    const d = acessoModal.data
    if (!d.nome?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/accesses/${d.id}`) : apiUrl('/api/customer-hub/accesses')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify(d),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapAcesso(body.item as Record<string, unknown>)
      setAcessos((prev) => isEdit ? prev.map((a) => a.id === saved.id ? saved : a) : [...prev, saved])
      setAcessoModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar acesso.')
    }
  }

  const handleDeleteAcesso = async (id: string) => {
    if (!window.confirm('Excluir este acesso?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/accesses/${id}`), {
        method: 'DELETE',
        headers: requestHeaders,
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setAcessos((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir acesso.')
    }
  }

  // CRUD — Sistemas
  const handleSaveSistema = async () => {
    const d = sistemaModal.data
    if (!d.produto?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/systems/${d.id}`) : apiUrl('/api/customer-hub/systems')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapSistema(body.item as Record<string, unknown>)
      setSistemas((prev) => isEdit ? prev.map((s) => s.id === saved.id ? saved : s) : [...prev, saved])
      setSistemaModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar sistema.')
    }
  }

  const handleDeleteSistema = async (id: string) => {
    if (!window.confirm('Excluir este sistema?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/systems/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setSistemas((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir sistema.')
    }
  }

  // CRUD — Processos
  const handleSaveProcesso = async () => {
    const d = processoModal.data
    if (!d.nome?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/processes/${d.id}`) : apiUrl('/api/customer-hub/processes')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapProcesso(body.item as Record<string, unknown>)
      setProcessos((prev) => isEdit ? prev.map((p) => p.id === saved.id ? saved : p) : [...prev, saved])
      setProcessoModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar processo.')
    }
  }

  const handleDeleteProcesso = async (id: string) => {
    if (!window.confirm('Excluir este processo?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/processes/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setProcessos((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir processo.')
    }
  }

  // CRUD — Histórico
  const handleSaveAtividade = async () => {
    const d = atividadeModal.data
    if (!d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/activities/${d.id}`) : apiUrl('/api/customer-hub/activities')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapAtividade(body.item as Record<string, unknown>)
      setAtividades((prev) => isEdit ? prev.map((a) => a.id === saved.id ? saved : a) : [...prev, saved])
      setAtividadeModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar atividade.')
    }
  }

  const handleDeleteAtividade = async (id: string) => {
    if (!window.confirm('Excluir esta atividade?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/activities/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setAtividades((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir atividade.')
    }
  }

  useEffect(() => {
    if (subPage !== 'status-report') return

    if (!statusReportClientId && filterClienteId) {
      setStatusReportClientId(filterClienteId)
    }
  }, [filterClienteId, statusReportClientId, subPage])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setStatusReportComparisonPeriodDaysApplied(statusReportComparisonPeriodDays)
    }, 450)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [statusReportComparisonPeriodDays])

  useEffect(() => {
    if (subPage !== 'status-report') return

    if (!statusReportClientId) {
      setStatusReportClient(null)
      setStatusReportTickets([])
      closeStatusReportTicketDetailModal()
      setStatusReportError(null)
      setStatusReportWarning(null)
      setStatusReportPeriodDashboard({
        periodDays: statusReportComparisonPeriodDays,
        openedLast15Days: 0,
        finalizedLast15Days: 0,
        openedPrevious15Days: 0,
        finalizedPrevious15Days: 0,
        openedCurrentTickets: [],
        finalizedCurrentTickets: [],
        openedPreviousTickets: [],
        finalizedPreviousTickets: [],
      })
      setStatusReportLoading(false)
      return
    }

    let cancelled = false

    const loadStatusReport = async () => {
      setStatusReportLoading(true)
      setStatusReportError(null)
      setStatusReportWarning(null)

      try {
        const selectedClient = clientes.find((cliente) => cliente.id === statusReportClientId) ?? null
        const organizationIds = getPartnerOrganizationIds(String(selectedClient?.organizations ?? ''))

        if (!organizationIds.length) {
          if (!cancelled) {
            setStatusReportClient(selectedClient)
            setStatusReportTickets([])
            setStatusReportError(null)
            setStatusReportWarning(null)
            setStatusReportPeriodDashboard({
              periodDays: statusReportComparisonPeriodDays,
              openedLast15Days: 0,
              finalizedLast15Days: 0,
              openedPrevious15Days: 0,
              finalizedPrevious15Days: 0,
              openedCurrentTickets: [],
              finalizedCurrentTickets: [],
              openedPreviousTickets: [],
              finalizedPreviousTickets: [],
            })
          }
          return
        }

        const response = await fetch(apiUrl(`/api/customer-hub/status-report?organizationIds=${encodeURIComponent(organizationIds.join(','))}&periodDays=${encodeURIComponent(String(statusReportComparisonPeriodDaysApplied))}`), {
          headers: requestHeaders,
          cache: 'no-store',
        })

        if (response.status === 304) {
          if (!cancelled) {
            setStatusReportError(null)
          }
          return
        }

        const bodyText = await response.text()
        let body: (StatusReportResponse & { error?: string }) | null = null

        if (bodyText) {
          try {
            body = JSON.parse(bodyText) as (StatusReportResponse & { error?: string }) | null
          } catch {
            if (!response.ok) {
              throw new Error(bodyText || 'Erro ao carregar o status report.')
            }
          }
        }

        if (!response.ok) {
          throw new Error(body?.error ?? 'Erro ao carregar o status report.')
        }

        if (cancelled) return

        setStatusReportClient(body?.client ?? selectedClient)
        setStatusReportTickets(Array.isArray(body?.tickets) ? body.tickets : [])
        setStatusReportWarning(String(body?.warning ?? '').trim() || null)
        setStatusReportPeriodDashboard({
          periodDays: Number(body?.dashboard?.periodDays ?? 7),
          openedLast15Days: Number(body?.dashboard?.openedLast15Days ?? 0),
          finalizedLast15Days: Number(body?.dashboard?.finalizedLast15Days ?? 0),
          openedPrevious15Days: Number(body?.dashboard?.openedPrevious15Days ?? 0),
          finalizedPrevious15Days: Number(body?.dashboard?.finalizedPrevious15Days ?? 0),
          openedCurrentTickets: Array.isArray(body?.dashboard?.openedCurrentTickets) ? body.dashboard.openedCurrentTickets : [],
          finalizedCurrentTickets: Array.isArray(body?.dashboard?.finalizedCurrentTickets) ? body.dashboard.finalizedCurrentTickets : [],
          openedPreviousTickets: Array.isArray(body?.dashboard?.openedPreviousTickets) ? body.dashboard.openedPreviousTickets : [],
          finalizedPreviousTickets: Array.isArray(body?.dashboard?.finalizedPreviousTickets) ? body.dashboard.finalizedPreviousTickets : [],
        })
      } catch (err) {
        if (!cancelled) {
          setStatusReportClient(null)
          setStatusReportTickets([])
          setStatusReportError(err instanceof Error ? err.message : 'Erro ao carregar o status report.')
          setStatusReportWarning(null)
          setStatusReportPeriodDashboard({
            periodDays: statusReportComparisonPeriodDaysApplied,
            openedLast15Days: 0,
            finalizedLast15Days: 0,
            openedPrevious15Days: 0,
            finalizedPrevious15Days: 0,
            openedCurrentTickets: [],
            finalizedCurrentTickets: [],
            openedPreviousTickets: [],
            finalizedPreviousTickets: [],
          })
        }
      } finally {
        if (!cancelled) {
          setStatusReportLoading(false)
        }
      }
    }

    void loadStatusReport()

    return () => {
      cancelled = true
    }
  }, [clientes, requestHeaders, statusReportClientId, statusReportComparisonPeriodDaysApplied, statusReportRefreshToken, subPage])

  useEffect(() => {
    if (subPage !== 'status-report') return

    if (!statusReportClientId) {
      setStatusReportHistory([])
      setStatusReportHistoryError(null)
      setStatusReportHistoryLoading(false)
      return
    }

    let cancelled = false

    const loadHistory = async () => {
      setStatusReportHistoryLoading(true)
      setStatusReportHistoryError(null)

      try {
        const response = await fetch(apiUrl(`/api/customer-hub/status-report/history?clientId=${encodeURIComponent(statusReportClientId)}&limit=12`), {
          headers: requestHeaders,
          cache: 'no-store',
        })
        const bodyText = await response.text()
        const body = (bodyText ? JSON.parse(bodyText) : null) as (StatusReportHistoryResponse & { error?: string }) | null

        if (!response.ok) {
          throw new Error(body?.error ?? 'Erro ao carregar historico do status report.')
        }

        if (cancelled) return
        setStatusReportHistory(Array.isArray(body?.items) ? body.items : [])
      } catch (err) {
        if (cancelled) return
        setStatusReportHistory([])
        setStatusReportHistoryError(err instanceof Error ? err.message : 'Erro ao carregar historico do status report.')
      } finally {
        if (!cancelled) {
          setStatusReportHistoryLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [requestHeaders, statusReportClientId, subPage, statusReportRefreshToken])

  useEffect(() => {
    if (subPage !== 'status-report') return
    setStatusReportTicketStatuses({})
    setStatusReportTicketPhases({})
    setStatusReportTicketModal(emptyModal())
    setStatusReportPeriodDashboard({
      periodDays: statusReportComparisonPeriodDays,
      openedLast15Days: 0,
      finalizedLast15Days: 0,
      openedPrevious15Days: 0,
      finalizedPrevious15Days: 0,
      openedCurrentTickets: [],
      finalizedCurrentTickets: [],
      openedPreviousTickets: [],
      finalizedPreviousTickets: [],
    })
  }, [statusReportClientId, subPage])

  const filteredClientes = clientes.filter((c) => {
    const term = clienteSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      c.nome,
      c.cnpj,
      c.segmento,
      c.cidade,
      CLIENTE_FONTE_LABEL[c.fonte] ?? c.fonte,
      CLIENTE_STATUS_LABEL[c.status] ?? c.status,
      formatPartnerOrganizationsLabel(c.organizations),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredContatos = filterClienteId ? contatos.filter((c) => c.clienteId === filterClienteId) : contatos
  const filteredContatosView = filteredContatos.filter((c) => {
    const term = contatoSearch.trim().toLowerCase()
    if (!term) return true

    const clienteNome = getClienteNome(c.clienteId).toLowerCase()
    const haystack = [
      c.nome,
      c.email,
      c.telefone,
      c.cargo,
      c.departamento,
      clienteNome,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredAcessos = filterClienteId ? acessos.filter((a) => a.clienteId === filterClienteId) : acessos
  const filteredAcessosView = filteredAcessos.filter((a) => {
    const term = acessoSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      getClienteNome(a.clienteId),
      ACESSO_TIPO_LABEL[a.tipo],
      formatPartnerOrganizationsLabel(clientes.find((cliente) => cliente.id === a.clienteId)?.organizations ?? ''),
      a.endereco,
      a.usuario,
      a.senha,
      a.observacoes,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredSistemas = filterClienteId ? sistemas.filter((s) => s.clienteId === filterClienteId) : sistemas
  const filteredSistemasView = filteredSistemas.filter((s) => {
    const term = sistemaSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      s.produto,
      getClienteNome(s.clienteId),
      s.modulo,
      s.versao,
      s.integracoes,
      s.responsavel || getContatoNome(s.contatoId),
      s.observacoes,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredProcessos = filterClienteId ? processos.filter((p) => p.clienteId === filterClienteId) : processos
  const filteredProcessosView = filteredProcessos.filter((p) => {
    const term = processoSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      p.nome,
      getClienteNome(p.clienteId),
      p.sistemaNome,
      p.modulo,
      p.periodicidade,
      p.criticidade,
      p.responsavel,
      p.detalhamento,
      p.observacoes,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredAtividades = filterClienteId ? atividades.filter((a) => a.clienteId === filterClienteId) : atividades
  const filteredAtividadesView = filteredAtividades.filter((a) => {
    const term = atividadeSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      a.data,
      getClienteNome(a.clienteId),
      a.evento || a.tipo,
      a.sistemaNome,
      a.modulo,
      a.responsavel,
      a.observacoes,
      a.descricao,
      a.processoNome,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const renderClienteModal = () => {
    const d = clienteModal.data
    const isEdit = Boolean(d.id)
    const cnpjDigits = normalizeCnpjDigits(String(d.cnpj ?? ''))
    const hasCnpjError = cnpjDigits.length > 0 && cnpjDigits.length !== 14
    const selectedOrganizationIds = normalizeSelectedOrganizationIds(String(d.organizations ?? ''))
    const selectedOrganizationNames = selectedOrganizationIds
      .map((id) => organizationNameById.get(id) ?? `ID ${id}`)
      .filter(Boolean)

    const togglePartnerOrganization = (organizationId: string, enabled: boolean) => {
      setClienteModal((m) => ({
        ...m,
        data: {
          ...m.data,
          organizations: (() => {
            const currentIds = getPartnerOrganizationIds(String(m.data.organizations ?? ''))
            const filteredCurrentIds = currentIds.filter((id) => availableOrganizationIds.has(id))
            const nextIds = enabled
              ? Array.from(new Set([...filteredCurrentIds, organizationId]))
              : filteredCurrentIds.filter((id) => id !== organizationId)
            return nextIds.join(',')
          })(),
        },
      }))
    }

    return (
      createPortal(
        <div className="estimativas-modal-overlay" role="presentation">
          <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="estimativas-modal__header">
              <h3>{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button type="button" className="button-secondary" onClick={() => setClienteModal(emptyModal())}>Fechar</button>
            </div>
            <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveCliente() }}>
              <label className="estimativas-form__full">
                Nome da Empresa *
                <input value={d.nome ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
              </label>
              <label>
                CNPJ
                <input
                  className={hasCnpjError ? 'ch-input-error' : ''}
                  value={d.cnpj ?? ''}
                  placeholder="00.000.000/0001-00"
                  onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, cnpj: formatCnpj(e.target.value) } }))}
                />
                {hasCnpjError && <span className="ch-field-error">CNPJ deve conter 14 dígitos.</span>}
              </label>
              <label>
                Segmento
                <input value={d.segmento ?? ''} placeholder="Ex: Indústria, Varejo" onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, segmento: e.target.value } }))} />
              </label>
              <label>
                Localização
                <input value={d.cidade ?? ''} placeholder="Cidade, Estado" onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, cidade: e.target.value } }))} />
              </label>
              <label>
                Data de Início
                <input type="date" value={d.dataInicio ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, dataInicio: e.target.value } }))} />
              </label>
              <label>
                Status
                <select value={d.status ?? 'Ativo'} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, status: e.target.value as ClienteStatus } }))}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Em Implantacao">Em Implantação</option>
                </select>
              </label>
              <label>
                Fonte
                <select value={d.fonte ?? 'interno'} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, fonte: e.target.value as ClienteFonte } }))}>
                  <option value="interno">Interno</option>
                  <option value="totvs">Totvs</option>
                  <option value="outros">Outros</option>
                </select>
              </label>
              <div className="estimativas-form__full ch-org-select-field">
                <span>Organizações vinculadas (Central de Chamados)</span>
                {customerHubOrganizationsLoading ? (
                  <span className="muted">Carregando organizações disponíveis...</span>
                ) : customerHubOrganizations.length === 0 ? (
                  <span className="muted">Nenhuma organização disponível para o seu usuário.</span>
                ) : (
                  <div className="ch-org-select" ref={organizationDropdownRef}>
                    <button
                      type="button"
                      className="ch-org-select__trigger"
                      onClick={() => setOrganizationDropdownOpen((prev) => !prev)}
                      aria-expanded={organizationDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span>
                        {selectedOrganizationIds.length > 0
                          ? selectedOrganizationNames.length <= 2
                            ? selectedOrganizationNames.join(', ')
                            : `${selectedOrganizationNames.slice(0, 2).join(', ')} +${selectedOrganizationNames.length - 2}`
                          : 'Selecione as organizações'}
                      </span>
                      <span className="ch-org-select__caret" aria-hidden="true">▾</span>
                    </button>
                    {organizationDropdownOpen && (
                      <div className="ch-org-select__dropdown" role="listbox" aria-label="Organizações disponíveis">
                        {customerHubOrganizations.map((organization) => {
                          const orgId = String(organization.id)
                          const checked = selectedOrganizationIds.includes(orgId)
                          return (
                            <label key={orgId} className="ch-org-select__item checkbox">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => togglePartnerOrganization(orgId, event.target.checked)}
                              />
                              {organization.name}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {customerHubOrganizationsError && <span className="ch-field-error">{customerHubOrganizationsError}</span>}
              </div>
              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={hasCnpjError}>{isEdit ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )
    )
  }

  const renderAcessoModal = () => {
    const d = acessoModal.data
    const isEdit = Boolean(d.id)

    return createPortal(
      <div className="estimativas-modal-overlay" role="presentation">
        <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="estimativas-modal__header">
            <h3>{isEdit ? 'Editar Acesso' : 'Novo Acesso'}</h3>
            <button type="button" className="button-secondary" onClick={() => setAcessoModal(emptyModal())}>Fechar</button>
          </div>
          <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveAcesso() }}>
            <label>
              Cliente *
              <select value={d.clienteId ?? ''} onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value } }))}>
                <option value="">Selecione...</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label>
              Tipo *
              <select value={d.tipo ?? 'vpn'} onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, tipo: e.target.value as AcessoTipo } }))}>
                <option value="vpn">VPN</option>
                <option value="servidores">Servidores</option>
                <option value="protheus">Protheus</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            <label>
              Nome do Acesso *
              <input value={d.nome ?? ''} placeholder="Ex: VPN Matriz, AppServer Produção" onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
            </label>
            <label>
              Endereço / Host
              <input value={d.endereco ?? ''} placeholder="IP, URL ou servidor" onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, endereco: e.target.value } }))} />
            </label>
            <label>
              Usuário
              <input value={d.usuario ?? ''} onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, usuario: e.target.value } }))} />
            </label>
            <label>
              Senha
              <input value={d.senha ?? ''} onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, senha: e.target.value } }))} />
            </label>
            <label className="estimativas-form__full">
              Observações
              <textarea rows={3} value={d.observacoes ?? ''} onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
            </label>
            <label className="estimativas-form__full">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={d.particular === true}
                  onChange={(e) => setAcessoModal((m) => ({ ...m, data: { ...m.data, particular: e.target.checked } }))}
                />
                Marcar como acesso particular (somente o criador visualiza)
              </span>
            </label>
            <div className="estimativas-actions estimativas-form__full">
              <button type="submit" className="button-primary">{isEdit ? 'Salvar' : 'Cadastrar'}</button>
            </div>
          </form>
        </section>
      </div>,
      document.body,
    )
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="customer-hub"><p className="muted">Carregando...</p></div>
  }

  if (error) {
    return <div className="customer-hub"><p className="error-message">{error}</p></div>
  }

  if (subPage === 'dashboard') {
    const statusItems = [
      { label: 'Ativos', value: stats.ativos, color: '#16a34a' },
      { label: 'Inativos', value: stats.inativos, color: '#647c76' },
      { label: 'Em Implantação', value: stats.emImplantacao, color: '#f59e0b' },
    ]

    const totalStatus = statusItems.reduce((acc, item) => acc + item.value, 0)
    let statusCursor = 0
    const statusGradient = totalStatus
      ? `conic-gradient(${statusItems
        .map((item) => {
          const start = (statusCursor / totalStatus) * 360
          statusCursor += item.value
          const end = (statusCursor / totalStatus) * 360
          return `${item.color} ${start}deg ${end}deg`
        })
        .join(', ')})`
      : 'conic-gradient(#d6e4df 0deg 360deg)'

    const segmentEntries = Array.from(
      clientes.reduce((acc, cliente) => {
        const key = String(cliente.segmento || 'Sem Segmento').trim() || 'Sem Segmento'
        acc.set(key, (acc.get(key) || 0) + 1)
        return acc
      }, new Map<string, number>()).entries(),
    ).sort((a, b) => b[1] - a[1])

    const maxSegmentValue = Math.max(1, ...segmentEntries.map(([, count]) => count))
    const recentActivities = [...atividades]
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .slice(0, 8)

    return (
      <div className="customer-hub">
        {clienteModal.open && renderClienteModal()}

        <header className="ch-dashboard-header">
          <div>
            <h2>Dashboard</h2>
            <p className="muted">Visão geral da gestão de clientes</p>
          </div>
          <button type="button" className="button-primary" onClick={() => setClienteModal({ open: true, data: { status: 'Ativo', fonte: 'interno', organizations: '' } })}>
            + Novo Cliente
          </button>
        </header>

        <div className="ch-stats">
          {[
            { label: 'Total de Clientes', value: stats.totalClientes, sub: `${stats.ativos} ativos`, icon: 'clients' },
            { label: 'Contatos', value: stats.totalContatos, sub: 'Cadastrados', icon: 'contacts' },
            { label: 'Acessos', value: stats.totalAcessos, sub: 'Ambientes mapeados', icon: 'accesses' },
            { label: 'Sistemas', value: stats.totalSistemas, sub: 'Implementados', icon: 'systems' },
            { label: 'Atividades', value: stats.totalAtividades, sub: 'Registradas', icon: 'activities' },
          ].map(({ label, value, sub, icon }) => (
            <div key={label} className="card ch-stat-card">
              <div className="ch-stat-card__top">
                <p className="ch-stat-card__label">{label}</p>
                <span className="ch-stat-card__icon" aria-hidden="true">
                  {icon === 'clients' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
                  )}
                  {icon === 'contacts' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3" /><path d="M4 18c0-2.4 2-4 5-4s5 1.6 5 4" /><circle cx="17" cy="8" r="2" /><path d="M15 15c1.8 0 3 .9 3 2.5" /></svg>
                  )}
                  {icon === 'accesses' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V8a5 5 0 0 1 10 0v3" /><circle cx="12" cy="16" r="1" /></svg>
                  )}
                  {icon === 'systems' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 20h6M12 17v3" /></svg>
                  )}
                  {icon === 'activities' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3.3-6.9" /><path d="M21 3v6h-6" /><path d="M12 7v5l3 2" /></svg>
                  )}
                </span>
              </div>
              <p className="ch-stat-card__value">{value}</p>
              <p className="muted ch-stat-card__sub">{sub}</p>
            </div>
          ))}
        </div>

        <div className="ch-dashboard-grid">
          <section className="card ch-chart-card">
            <h2>Clientes por Status</h2>
            <div className="ch-status-chart-wrap">
              <div className="ch-status-donut" style={{ background: statusGradient }}>
                <div className="ch-status-donut__hole" />
              </div>
              <div className="ch-status-legend">
                {statusItems.map((item) => (
                  <div key={item.label} className="ch-status-legend-item">
                    <span className="ch-status-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card ch-chart-card">
            <h2>Clientes por Segmento</h2>
            <div className="ch-segment-chart">
              {segmentEntries.map(([segmento, total]) => (
                <div key={segmento} className="ch-segment-row">
                  <div className="ch-segment-label">{segmento}</div>
                  <div className="ch-segment-bar-track">
                    <div className="ch-segment-bar" style={{ width: `${(total / maxSegmentValue) * 100}%` }} />
                  </div>
                </div>
              ))}
              {segmentEntries.length === 0 && <p className="muted">Nenhum cliente cadastrado.</p>}
              {segmentEntries.length > 0 && (
                <div className="ch-segment-axis" aria-hidden="true">
                  <span>0</span>
                  <span>0.25</span>
                  <span>0.5</span>
                  <span>0.75</span>
                  <span>1</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card ch-recent-card">
          <h2>
            <span className="ch-recent-title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </span>
            Atividades Recentes
          </h2>
          {recentActivities.length === 0 ? (
            <p className="muted">Nenhuma atividade registrada.</p>
          ) : (
            <ul className="ch-activity-list">
              {recentActivities.map((a) => (
                <li key={a.id}>
                  <span className="muted">{a.data}</span>
                  <strong>{getClienteNome(a.clienteId)}</strong>
                  <span>{(a.evento || a.tipo)}{a.observacoes || a.descricao ? ': ' + (a.observacoes || a.descricao) : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }

  // ── CLIENTES ───────────────────────────────────────────────────────────────
  if (subPage === 'clientes') {
    return (
      <div className="customer-hub">
        {clienteModal.open && renderClienteModal()}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Clientes</h2>
              <p className="muted">Gerencie os clientes</p>
            </div>
            <button type="button" className="button-primary" onClick={() => setClienteModal({ open: true, data: { status: 'Ativo', fonte: 'interno', organizations: '' } })}>
              + Novo Cliente
            </button>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                placeholder="Buscar por nome, CNPJ, segmento, cidade, fonte ou organização..."
                aria-label="Buscar cliente"
              />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Razão Social</th>
                  <th>CNPJ</th>
                  <th>Segmento</th>
                  <th>Cidade / UF</th>
                  <th>Status</th>
                  <th>Fonte</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>{formatCnpj(c.cnpj, true)}</td>
                    <td>{c.segmento}</td>
                    <td>{c.cidade}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${c.status === 'Ativo' ? 'ativo' : c.status === 'Inativo' ? 'inativo' : 'implantacao'}`}>
                        {CLIENTE_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td>{CLIENTE_FONTE_LABEL[c.fonte] ?? c.fonte}</td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="button-secondary" onClick={() => handleOpenStatusReport(c.id)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}>
                          Status Report
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar cliente" title="Editar" onClick={() => setClienteModal({ open: true, data: { ...c } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir cliente" title="Excluir" onClick={() => handleDeleteCliente(c.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClientes.length === 0 && (
                  <tr><td colSpan={7} className="ch-empty">Nenhum cliente cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  if (subPage === 'status-report') {
    return (
      <div className="customer-hub">
        {statusReportTicketDetailModalOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closeStatusReportTicketDetailModal}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <h3>Detalhes do chamado #{statusReportTicketDetail?.protocol || statusReportTicketDetailSource?.protocol || statusReportTicketDetailSource?.id || '—'}</h3>
                <button type="button" className="button-secondary" onClick={closeStatusReportTicketDetailModal}>Fechar</button>
              </div>

              {statusReportTicketDetailLoading ? (
                <p className="muted">Carregando detalhes...</p>
              ) : statusReportTicketDetailError ? (
                <p className="error">{statusReportTicketDetailError}</p>
              ) : statusReportTicketDetail ? (
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                  <div className="estimativas-stats">
                    <span><strong>Assunto:</strong> {statusReportTicketDetail.subject || statusReportTicketDetailSource?.subject || '—'}</span>
                    <span><strong>Status:</strong> {statusReportTicketDetail.status || statusReportTicketDetailSource?.situation || statusReportTicketDetailSource?.status || '—'}</span>
                    <span><strong>Cliente:</strong> {statusReportTicketDetail.customerName || statusReportTicketDetailSource?.client || '—'}</span>
                    <span><strong>Organização:</strong> {statusReportTicketDetail.organizationName || statusReportTicketDetailSource?.organizationName || '—'}</span>
                    <span><strong>Departamento:</strong> {statusReportTicketDetail.departmentName || statusReportTicketDetailSource?.department || '—'}</span>
                    <span><strong>Categoria:</strong> {statusReportTicketDetail.categoryName || '—'}</span>
                    <span><strong>Responsável:</strong> {statusReportTicketDetail.operatorName || '—'}</span>
                    <span><strong>Prioridade:</strong> {statusReportTicketDetail.priority || '—'}</span>
                    <span><strong>Criado em:</strong> {formatReportDateTime(statusReportTicketDetail.createdAt || statusReportTicketDetailSource?.createdAt || '')}</span>
                    <span><strong>Atualizado em:</strong> {formatReportDateTime(statusReportTicketDetail.updatedAt || statusReportTicketDetailSource?.updatedAt || '')}</span>
                    <span><strong>Primeira resposta:</strong> {formatReportDateTime(statusReportTicketDetail.firstReplyAt)}</span>
                    <span><strong>Finalizado em:</strong> {formatReportDateTime(statusReportTicketDetail.endAt)}</span>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 0.4rem' }}>Mensagem de abertura</h4>
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{statusReportTicketDetail.message || 'Sem mensagem registrada.'}</p>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 0.4rem' }}>Anexos</h4>
                    {statusReportTicketDetail.attachments.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>Nenhum anexo.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1.15rem' }}>
                        {statusReportTicketDetail.attachments.map((attachment, index) => (
                          <li key={`${attachment.url || attachment.name}-${index}`}>
                            {attachment.url ? (
                              <a href={attachment.url} target="_blank" rel="noreferrer">{attachment.name || 'Arquivo sem nome'}</a>
                            ) : (
                              <span>{attachment.name || 'Arquivo sem nome'}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 0.4rem' }}>Interações</h4>
                    {statusReportTicketDetail.replies.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>Sem respostas registradas.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: '0.7rem' }}>
                        {statusReportTicketDetail.replies.map((reply) => (
                          <article key={`${reply.id || reply.date}-${reply.sender}`} className="card" style={{ margin: 0, padding: '0.75rem 0.9rem' }}>
                            <p style={{ margin: 0, fontWeight: 600 }}>
                              {reply.sender || 'Atualização'}
                              {' '}
                              <span className="muted" style={{ fontWeight: 400 }}>({reply.senderType === 'A' ? 'Atendente' : 'Solicitante'})</span>
                            </p>
                            <p className="muted" style={{ margin: '0.2rem 0 0.5rem' }}>{formatReportDateTime(reply.date)}</p>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{reply.message || 'Sem conteúdo textual.'}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          </div>,
          document.body,
        )}

        {statusReportTicketModal.open && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={() => setStatusReportTicketModal(emptyModal())}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <h3>Incluir status do chamado</h3>
                <button type="button" className="button-secondary" onClick={() => setStatusReportTicketModal(emptyModal())}>Fechar</button>
              </div>

              <form className="estimativas-form" onSubmit={(event) => { event.preventDefault(); saveStatusReportTicketStatus() }}>
                <label className="estimativas-form__full">
                  Status para relatório
                  <textarea
                    rows={4}
                    value={String(statusReportTicketModal.data.status ?? '')}
                    onChange={(event) => setStatusReportTicketModal((prev) => ({
                      ...prev,
                      data: {
                        ...prev.data,
                        status: event.target.value,
                      },
                    }))}
                    placeholder="Ex.: Aguardando retorno do cliente, Em validação, Bloqueado por homologação..."
                  />
                </label>

                <div className="estimativas-actions">
                  <button type="submit" className="button-primary">Salvar status</button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setStatusReportTicketModal((prev) => ({
                        ...prev,
                        data: {
                          ...prev.data,
                          status: '',
                        },
                      }))
                    }}
                  >
                    Limpar
                  </button>
                </div>
              </form>
            </section>
          </div>,
          document.body,
        )}

        <section className="card estimativas-layout">
          <div className="estimativas-header-row">
            <div>
              <h2>Status Report</h2>
              <p className="muted">Selecione um cliente para carregar os chamados abertos do TomTicket.</p>
            </div>
          </div>

          <div className="estimativas-filters">
            <label>
              Cliente
              <select
                value={statusReportClientId}
                onChange={(event) => setStatusReportClientId(event.target.value)}
              >
                <option value="">Selecione...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                ))}
              </select>
            </label>
            <div className="estimativas-actions" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button-primary"
                onClick={() => { void handleSendStatusReport() }}
                disabled={!statusReportClientId || statusReportSubmitting || statusReportPdfExporting || statusReportSentTicketItems.length === 0}
              >
                {statusReportSubmitting ? 'Gravando...' : statusReportPdfExporting ? 'Gerando PDF...' : `Enviar report (${statusReportSentTicketItems.length})`}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setStatusReportRefreshToken((current) => current + 1)}
                disabled={!statusReportClientId || statusReportLoading}
              >
                {statusReportLoading ? 'Carregando...' : 'Recarregar'}
              </button>
            </div>
          </div>

          {statusReportError && <p className="error">{statusReportError}</p>}
          {statusReportWarning && <p className="muted">{statusReportWarning}</p>}
          {statusReportHistoryError && <p className="error">{statusReportHistoryError}</p>}

          {statusReportCardTooltip && typeof document !== 'undefined' && createPortal(
            <div
              style={{
                position: 'fixed',
                top: statusReportCardTooltip.y,
                left: statusReportCardTooltip.x,
                width: 'min(420px, calc(100vw - 32px))',
                maxHeight: '320px',
                overflow: 'auto',
                zIndex: 1200,
                border: '1px solid #d9e5df',
                borderRadius: '12px',
                background: '#ffffff',
                boxShadow: '0 14px 30px rgba(15, 74, 64, 0.18)',
                padding: '0.65rem 0.75rem',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0f4a40' }}>
                {statusReportCardTooltip.title}
              </p>
              <div style={{ marginTop: '0.4rem', display: 'grid', gap: '0.2rem' }}>
                {statusReportCardTooltip.lines.map((line, index) => (
                  <p key={`${index}-${line.slice(0, 32)}`} style={{ margin: 0, fontSize: '0.78rem', color: '#334155', lineHeight: 1.35 }}>
                    {line}
                  </p>
                ))}
                {statusReportCardTooltip.overflow > 0 && (
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                    ... +{statusReportCardTooltip.overflow} ticket(s)
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )}

          {!selectedStatusReportClient ? (
            <p className="muted">Escolha um cliente para iniciar o relatório.</p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <section className="card" style={{ margin: 0 }}>
                <h2>{selectedStatusReportClient.nome}</h2>
                <div
                  style={{
                    marginTop: '0.65rem',
                    border: '1px solid #d9e5df',
                    borderRadius: '14px',
                    background: 'linear-gradient(160deg, #f7fbf9 0%, #eef5f2 100%)',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
                      gap: '0.6rem',
                    }}
                  >
                    <div style={{ border: '1px solid #d2dfd8', borderRadius: '12px', background: '#fff', padding: '0.65rem 0.7rem' }}>
                      <p className="muted" style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CNPJ</p>
                      <strong style={{ fontSize: '0.92rem' }}>{selectedStatusReportClient.cnpj || '—'}</strong>
                    </div>
                    <div style={{ border: '1px solid #d2dfd8', borderRadius: '12px', background: '#fff', padding: '0.65rem 0.7rem' }}>
                      <p className="muted" style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Segmento</p>
                      <strong style={{ fontSize: '0.92rem' }}>{selectedStatusReportClient.segmento || '—'}</strong>
                    </div>
                    <div style={{ border: '1px solid #d2dfd8', borderRadius: '12px', background: '#fff', padding: '0.65rem 0.7rem' }}>
                      <p className="muted" style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cidade</p>
                      <strong style={{ fontSize: '0.92rem' }}>{selectedStatusReportClient.cidade || '—'}</strong>
                    </div>
                    <div style={{ border: '1px solid #cde0d7', borderRadius: '12px', background: '#ffffff', padding: '0.65rem 0.7rem' }}>
                      <p className="muted" style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Chamados abertos</p>
                      <strong style={{ fontSize: '1.25rem', color: '#0f5f54' }}>{statusReportTickets.length}</strong>
                    </div>
                    <div style={{ border: '1px solid #cde0d7', borderRadius: '12px', background: '#ffffff', padding: '0.65rem 0.7rem' }}>
                      <p className="muted" style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Enviados no ciclo</p>
                      <strong style={{ fontSize: '1.25rem', color: '#0f5f54' }}>{statusReportComparison.currentTotal}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '0.8rem',
                      border: '1px solid #d6e3dd',
                      borderRadius: '12px',
                      background: '#ffffff',
                      padding: '0.85rem 0.9rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0, color: '#0f4a40' }}>Dashboard comparativo</h3>
                        <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                          Janela de {statusReportPeriodDashboard.periodDays} dias com comparação do período atual e anterior.
                        </p>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#3f5f58', background: '#edf5f2', border: '1px solid #d2e0db', borderRadius: '999px', padding: '0.2rem 0.55rem' }}>
                        Report anterior: {statusReportPreviousHistory ? formatReportDateTime(statusReportPreviousHistory.sentAt) : '—'}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: '0.6rem',
                        padding: '0.55rem 0.65rem',
                        border: '1px solid #d7e2dd',
                        borderRadius: '10px',
                        background: '#f8fbfa',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.55rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#0f4a40', fontSize: '0.9rem' }}>Período de comparação (dias)</strong>
                        <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem' }}>Faixa permitida: 1 a 90</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="button-secondary"
                          style={{ minWidth: '34px', padding: '0.3rem 0.5rem' }}
                          onClick={() => setStatusReportComparisonPeriodDays((current) => Math.max(1, current - 1))}
                          aria-label="Diminuir período"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={statusReportComparisonPeriodDays}
                          onChange={(event) => {
                            const raw = Number.parseInt(event.target.value, 10)
                            if (!Number.isFinite(raw)) {
                              setStatusReportComparisonPeriodDays(7)
                              return
                            }
                            setStatusReportComparisonPeriodDays(Math.max(1, Math.min(90, raw)))
                          }}
                          style={{ width: '82px', textAlign: 'center', fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          className="button-secondary"
                          style={{ minWidth: '34px', padding: '0.3rem 0.5rem' }}
                          onClick={() => setStatusReportComparisonPeriodDays((current) => Math.min(90, current + 1))}
                          aria-label="Aumentar período"
                        >
                          +
                        </button>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          {[7, 15, 30].map((days) => (
                            <button
                              key={days}
                              type="button"
                              className="button-secondary"
                              style={{
                                fontSize: '0.74rem',
                                padding: '0.2rem 0.45rem',
                                borderColor: statusReportComparisonPeriodDays === days ? '#0f766e' : undefined,
                                color: statusReportComparisonPeriodDays === days ? '#0f766e' : undefined,
                                backgroundColor: statusReportComparisonPeriodDays === days ? '#ecfdf5' : undefined,
                              }}
                              onClick={() => setStatusReportComparisonPeriodDays(days)}
                            >
                              {days}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: '0.7rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '0.55rem',
                      }}
                    >
                      <div
                        onMouseEnter={(event) => openStatusReportCardTooltip(event, 'Tickets abertos no período', statusReportPeriodDashboard.openedCurrentTickets)}
                        onMouseMove={(event) => openStatusReportCardTooltip(event, 'Tickets abertos no período', statusReportPeriodDashboard.openedCurrentTickets)}
                        onMouseLeave={closeStatusReportCardTooltip}
                        style={{ background: '#f5fbff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '0.55rem 0.6rem', cursor: 'help' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>Abertos no período</p>
                        <strong style={{ color: '#1d4ed8', fontSize: '1.05rem' }}>{statusReportPeriodDashboard.openedLast15Days}</strong>
                      </div>
                      <div
                        onMouseEnter={(event) => openStatusReportCardTooltip(event, 'Tickets finalizados no período', statusReportPeriodDashboard.finalizedCurrentTickets)}
                        onMouseMove={(event) => openStatusReportCardTooltip(event, 'Tickets finalizados no período', statusReportPeriodDashboard.finalizedCurrentTickets)}
                        onMouseLeave={closeStatusReportCardTooltip}
                        style={{ background: '#ecfeff', border: '1px solid #c7f0f4', borderRadius: '10px', padding: '0.55rem 0.6rem', cursor: 'help' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>Finalizados no período</p>
                        <strong style={{ color: '#0f766e', fontSize: '1.05rem' }}>{statusReportPeriodDashboard.finalizedLast15Days}</strong>
                      </div>
                      <div
                        onMouseEnter={(event) => openStatusReportCardTooltip(event, 'Tickets do report anterior', statusReportComparison.previousTickets)}
                        onMouseMove={(event) => openStatusReportCardTooltip(event, 'Tickets do report anterior', statusReportComparison.previousTickets)}
                        onMouseLeave={closeStatusReportCardTooltip}
                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.6rem', cursor: 'help' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>Total anterior</p>
                        <strong style={{ color: '#334155', fontSize: '1.05rem' }}>{statusReportComparison.previousTotal}</strong>
                      </div>
                      <div
                        onMouseEnter={(event) => openStatusReportCardTooltip(event, 'Tickets novos no report', statusReportComparison.addedTickets)}
                        onMouseMove={(event) => openStatusReportCardTooltip(event, 'Tickets novos no report', statusReportComparison.addedTickets)}
                        onMouseLeave={closeStatusReportCardTooltip}
                        style={{ background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: '10px', padding: '0.55rem 0.6rem', cursor: 'help' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>Novos no report</p>
                        <strong style={{ color: '#166534', fontSize: '1.05rem' }}>{statusReportComparison.added}</strong>
                      </div>
                      <div
                        onMouseEnter={(event) => openStatusReportCardTooltip(event, 'Tickets mantidos no report', statusReportComparison.keptTickets)}
                        onMouseMove={(event) => openStatusReportCardTooltip(event, 'Tickets mantidos no report', statusReportComparison.keptTickets)}
                        onMouseLeave={closeStatusReportCardTooltip}
                        style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.55rem 0.6rem', cursor: 'help' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>Mantidos</p>
                        <strong style={{ color: '#92400e', fontSize: '1.05rem' }}>{statusReportComparison.kept}</strong>
                      </div>
                      <div
                        onMouseEnter={(event) => openStatusReportCardTooltip(event, 'Tickets removidos do report', statusReportComparison.removedTickets)}
                        onMouseMove={(event) => openStatusReportCardTooltip(event, 'Tickets removidos do report', statusReportComparison.removedTickets)}
                        onMouseLeave={closeStatusReportCardTooltip}
                        style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '0.55rem 0.6rem', cursor: 'help' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>Removidos</p>
                        <strong style={{ color: '#be123c', fontSize: '1.05rem' }}>{statusReportComparison.removed}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.85rem' }}>
                      {statusReportFortnightChartRows.map((row) => (
                        <div key={row.id} style={{ border: '1px solid #dce7e2', borderRadius: '12px', padding: '0.7rem 0.8rem', backgroundColor: '#fbfdfc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <strong style={{ color: '#174c43' }}>{row.label}</strong>
                            <span
                              style={{
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                color: row.delta > 0 ? '#0f766e' : row.delta < 0 ? '#be123c' : '#64748b',
                                background: row.delta > 0 ? '#ecfdf5' : row.delta < 0 ? '#fff1f2' : '#f1f5f9',
                                border: row.delta > 0 ? '1px solid #a7f3d0' : row.delta < 0 ? '1px solid #fecdd3' : '1px solid #cbd5e1',
                                borderRadius: '999px',
                                padding: '0.2rem 0.5rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              {row.delta > 0 ? '↑' : row.delta < 0 ? '↓' : '→'} {row.delta >= 0 ? '+' : ''}{row.delta}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gap: '0.45rem' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.22rem' }}>
                                <span>Período atual</span>
                                <strong>{row.current}</strong>
                              </div>
                              <div style={{ width: '100%', height: '10px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ width: `${row.currentPercent}%`, height: '100%', background: row.currentColor }} />
                              </div>
                            </div>

                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.22rem' }}>
                                <span>Período anterior</span>
                                <strong>{row.previous}</strong>
                              </div>
                              <div style={{ width: '100%', height: '10px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ width: `${row.previousPercent}%`, height: '100%', background: row.previousColor }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {statusReportHistoryLoading && <p className="muted" style={{ margin: '0.6rem 0 0' }}>Carregando histórico...</p>}
                  </div>
                </div>

                {!statusReportHistoryLoading && statusReportHistory.length > 0 && (
                  <div className="card" style={{ margin: '0.75rem 0 0', padding: '0.85rem 0.95rem' }}>
                    <h3 style={{ margin: '0 0 0.55rem' }}>Histórico de envios</h3>
                    <div className="estimativas-table ch-table-theme" style={{ marginTop: 0 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Enviado em</th>
                            <th>Responsável</th>
                            <th>Qtde tickets</th>
                            <th>Tickets</th>
                            <th>PDF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusReportHistory.slice(0, 6).map((entry) => {
                            const protocols = entry.tickets
                              .map((ticket) => ticket.protocol || ticket.ticketId)
                              .filter(Boolean)
                            return (
                              <tr key={entry.id}>
                                <td>{formatReportDateTime(entry.sentAt)}</td>
                                <td>{entry.createdByDisplayName || entry.createdByUsername || '—'}</td>
                                <td>{entry.totalTickets}</td>
                                <td>{protocols.length ? protocols.join(', ') : '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={() => { void handleDownloadHistoryStatusReportPdf(entry) }}
                                    disabled={statusReportPdfExporting}
                                  >
                                    {statusReportPdfExporting ? 'Gerando...' : 'Gerar PDF'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="estimativas-subgrid">
                  <h3 style={{ marginTop: 0, marginBottom: '0.65rem' }}>Chamados abertos</h3>
                  {statusReportLoading ? (
                    <p className="muted">Carregando chamados...</p>
                  ) : statusReportTickets.length === 0 ? (
                    <p className="muted">Nenhum chamado aberto encontrado para este cliente.</p>
                  ) : (
                    <div className="estimativas-table ch-table-theme">
                      <table>
                        <thead>
                          <tr>
                            <th>Ticket</th>
                            <th>Assunto</th>
                            <th>Status</th>
                            <th>Situação</th>
                            <th>Status report</th>
                            <th>Atualização</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusReportTickets.map((ticket) => {
                            const ticketKey = getStatusReportTicketKey(ticket)
                            const phase = getStatusReportTicketPhase(ticketKey)

                            return (
                              <tr key={`${ticket.id || ticket.protocol || ticket.subject}`}>
                              <td>{ticket.protocol || ticket.id || '—'}</td>
                              <td>{ticket.subject || '—'}</td>
                              <td>{ticket.status || '—'}</td>
                              <td>{ticket.situation || ticket.status || '—'}</td>
                              <td>
                                <span className={`estimativas-status estimativas-status--${getStatusReportPhaseClassName(phase)}`}>
                                  {getStatusReportPhaseLabel(phase)}
                                </span>
                              </td>
                              <td>{formatReportDateTime(ticket.updatedAt || ticket.createdAt)}</td>
                              <td>
                                <div className="ch-row-actions ch-row-actions--icons">
                                  <button
                                    type="button"
                                    className="ch-icon-action"
                                    title="Visualizar detalhes do chamado"
                                    onClick={() => { void openStatusReportTicketDetailModal(ticket) }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="ch-icon-action"
                                    title={statusReportTicketStatuses[ticketKey]?.trim() ? 'Editar status informado' : 'Digitar status informado'}
                                    onClick={() => openStatusReportTicketModal(ticket)}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="ch-icon-action"
                                    title="Marcar como pendente"
                                    onClick={() => setStatusReportTicketPhase(ticket, 'pending')}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l2.5 2.5"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="ch-icon-action"
                                    title="Marcar como digitado"
                                    onClick={() => setStatusReportTicketPhase(ticket, 'typed')}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="ch-icon-action"
                                    title="Marcar como enviado"
                                    onClick={() => setStatusReportTicketPhase(ticket, 'sent')}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                  </button>
                                </div>
                              </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    )
  }

  // ── CONTATOS ───────────────────────────────────────────────────────────────
  if (subPage === 'contatos') {
    const d = contatoModal.data
    return (
      <div className="customer-hub">
        {contatoModal.open && (
          createPortal(
            <div className="estimativas-modal-overlay" role="presentation">
              <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="estimativas-modal__header">
                  <h3>{d.id ? 'Editar Contato' : 'Novo Contato'}</h3>
                  <button type="button" className="button-secondary" onClick={() => setContatoModal(emptyModal())}>Fechar</button>
                </div>
                <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveContato() }}>
                  <label>
                    Nome *
                    <input value={d.nome ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
                  </label>
                  <label>
                    Cliente *
                    <select value={d.clienteId ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value } }))}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    Cargo
                    <input value={d.cargo ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, cargo: e.target.value } }))} />
                  </label>
                  <label>
                    Departamento
                    <input value={d.departamento ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, departamento: e.target.value } }))} />
                  </label>
                  <label>
                    E-mail
                    <input type="email" value={d.email ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, email: e.target.value } }))} />
                  </label>
                  <label>
                    Telefone
                    <input value={d.telefone ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, telefone: e.target.value } }))} />
                  </label>
                  <label>
                    Tipo
                    <select value={d.tipo ?? 'comercial'} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, tipo: e.target.value as ContatoTipo } }))}>
                      <option value="comercial">Comercial</option>
                      <option value="servicos">Serviços</option>
                      <option value="tecnico">Técnico</option>
                      <option value="usuario">Usuário</option>
                      <option value="gestao">Gestão</option>
                      <option value="outros">Outros</option>
                    </select>
                  </label>
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary">Salvar</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        )}

        <section className="card ch-contacts-card">
          <div className="ch-section-header">
            <div>
              <h2>Contatos</h2>
              <p className="muted">Gerencie os contatos dos clientes</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setContatoModal({ open: true, data: { tipo: 'comercial' } })}>
                + Novo Contato
              </button>
            </div>
          </div>

          <div className="ch-contacts-toolbar">
            <label className="ch-contacts-search">
              <span className="ch-contacts-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={contatoSearch}
                onChange={(e) => setContatoSearch(e.target.value)}
                placeholder="Buscar por nome, email ou empresa..."
                aria-label="Buscar contato"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div className="csv-table ch-contacts-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Cargo / Departamento</th>
                  <th>Contato</th>
                  <th>Tipo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredContatosView.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>
                      <span className="ch-client-pill">{getClienteNome(c.clienteId)}</span>
                    </td>
                    <td>
                      <div className="ch-contact-stacked">
                        <span>{c.cargo || '-'}</span>
                        <span className="muted">{c.departamento || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="ch-contact-stacked">
                        <span className="ch-contact-line">
                          <span className="ch-contact-line__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" /></svg>
                          </span>
                          {c.email || '-'}
                        </span>
                        <span className="ch-contact-line muted">
                          <span className="ch-contact-line__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6.2 6.2l1.2-1.2a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7A2 2 0 0 1 22 16.9z" /></svg>
                          </span>
                          {c.telefone || '-'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`ch-badge ch-badge--tipo-${c.tipo.toLowerCase()}`}>{CONTATO_TIPO_LABEL[c.tipo] ?? c.tipo}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Duplicar contato" title="Duplicar" onClick={() => handleDuplicateContato(c)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar contato" title="Editar" onClick={() => setContatoModal({ open: true, data: { ...c } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir contato" title="Excluir" onClick={() => handleDeleteContato(c.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContatosView.length === 0 && (
                  <tr><td colSpan={6} className="ch-empty">Nenhum contato encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── ACESSOS ───────────────────────────────────────────────────────────────
  if (subPage === 'acessos') {
    return (
      <div className="customer-hub">
        {acessoModal.open && renderAcessoModal()}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Acessos</h2>
              <p className="muted">Cadastre e localize rapidamente os acessos do ambiente de cada cliente</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setAcessoModal({ open: true, data: { tipo: 'vpn' } })}>
                + Novo Acesso
              </button>
            </div>
          </div>

          <div className="ch-table-toolbar">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={acessoSearch}
                onChange={(e) => setAcessoSearch(e.target.value)}
                placeholder="Buscar por cliente, tipo, nome, host, usuário ou observação..."
                aria-label="Buscar acesso"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Acesso</th>
                  <th>Endereço / Host</th>
                  <th>Credenciais</th>
                  <th>Privacidade</th>
                  <th>Observações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredAcessosView.map((a) => (
                  <tr key={a.id}>
                    <td>{getClienteNome(a.clienteId)}</td>
                    <td>
                      <span className={`ch-badge ch-badge--tipo-${a.tipo}`}>{ACESSO_TIPO_LABEL[a.tipo]}</span>
                    </td>
                    <td>{a.nome}</td>
                    <td>{a.endereco || '-'}</td>
                    <td>
                      <div className="ch-contact-stacked">
                        <span>{a.usuario || '-'}</span>
                        <span className="muted">{a.senha || '-'}</span>
                      </div>
                    </td>
                    <td>{a.particular ? 'Particular' : 'Compartilhado'}</td>
                    <td>{a.observacoes || '-'}</td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Editar acesso" title="Editar" onClick={() => setAcessoModal({ open: true, data: { ...a } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir acesso" title="Excluir" onClick={() => handleDeleteAcesso(a.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAcessosView.length === 0 && (
                  <tr><td colSpan={8} className="ch-empty">Nenhum acesso encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── SISTEMAS ───────────────────────────────────────────────────────────────
  if (subPage === 'sistemas') {
    const d = sistemaModal.data
    return (
      <div className="customer-hub">
        {sistemaModal.open && (
          createPortal(
            <div className="estimativas-modal-overlay" role="presentation">
              <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="estimativas-modal__header">
                  <h3>{d.id ? 'Editar Sistema' : 'Novo Sistema'}</h3>
                  <button type="button" className="button-secondary" onClick={() => setSistemaModal(emptyModal())}>Fechar</button>
                </div>
                <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveSistema() }}>
                  <label>
                    Produto / Sistema *
                    <input value={d.produto ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, produto: e.target.value } }))} />
                  </label>
                  <label>
                    Cliente *
                    <select value={d.clienteId ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value, contatoId: '' } }))}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    Módulo
                    <input value={d.modulo ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, modulo: e.target.value } }))} />
                  </label>
                  <label>
                    Versão
                    <input value={d.versao ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, versao: e.target.value } }))} />
                  </label>
                  <label>
                    Contato Responsável
                    <select value={d.contatoId ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, contatoId: e.target.value } }))}>
                      <option value="">Selecione...</option>
                      {contatos.filter((c) => !d.clienteId || c.clienteId === d.clienteId).map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Integrações
                    <input value={d.integracoes ?? ''} placeholder="Ex: E-commerce, BI, WMS" onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, integracoes: e.target.value } }))} />
                  </label>
                  <label>
                    Responsável (nome)
                    <input value={d.responsavel ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, responsavel: e.target.value } }))} />
                  </label>
                  <label className="estimativas-form__full">
                    Observações
                    <textarea rows={3} value={d.observacoes ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
                  </label>
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary">Salvar</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Sistemas e Produtos</h2>
              <p className="muted">Gerencie os sistemas implementados nos clientes</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setSistemaModal({ open: true, data: {} })}>
                + Novo Sistema
              </button>
            </div>
          </div>
          <div className="ch-table-toolbar">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={sistemaSearch}
                onChange={(e) => setSistemaSearch(e.target.value)}
                placeholder="Buscar por produto, cliente, modulo, versao ou responsavel..."
                aria-label="Buscar sistema"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cliente</th>
                  <th>Módulo</th>
                  <th>Versão</th>
                  <th>Integrações</th>
                  <th>Responsável</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredSistemasView.map((s) => (
                  <tr key={s.id}>
                    <td>{s.produto}</td>
                    <td>{getClienteNome(s.clienteId)}</td>
                    <td>{s.modulo}</td>
                    <td>{s.versao}</td>
                    <td>{s.integracoes}</td>
                    <td>{s.responsavel || getContatoNome(s.contatoId)}</td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Editar sistema" title="Editar" onClick={() => setSistemaModal({ open: true, data: { ...s } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir sistema" title="Excluir" onClick={() => handleDeleteSistema(s.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSistemasView.length === 0 && (
                  <tr><td colSpan={7} className="ch-empty">Nenhum sistema encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── PROCESSOS ──────────────────────────────────────────────────────────────
  if (subPage === 'processos') {
    const d = processoModal.data
    return (
      <div className="customer-hub">
        {processoModal.open && (
          createPortal(
            <div className="estimativas-modal-overlay" role="presentation">
              <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="estimativas-modal__header">
                  <h3>{d.id ? 'Editar Processo' : 'Novo Processo'}</h3>
                  <button type="button" className="button-secondary" onClick={() => setProcessoModal(emptyModal())}>Fechar</button>
                </div>
                <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveProcesso() }}>
                  <label>
                    Nome do Processo *
                    <input value={d.nome ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
                  </label>
                  <label>
                    Cliente *
                    <select value={d.clienteId ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value, sistemaNome: '', modulo: '', responsavel: '' } }))}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    Sistema
                    <input value={d.sistemaNome ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, sistemaNome: e.target.value } }))} />
                  </label>
                  <label>
                    Módulo
                    <input value={d.modulo ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, modulo: e.target.value } }))} />
                  </label>
                  <label>
                    Responsável
                    <select value={d.responsavel ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, responsavel: e.target.value } }))}>
                      <option value="">Selecione...</option>
                      {contatos.filter((c) => !d.clienteId || c.clienteId === d.clienteId).map((c) => (
                        <option key={c.id} value={c.nome}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Periodicidade
                    <select value={d.periodicidade ?? 'mensal'} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, periodicidade: e.target.value } }))}>
                      <option value="diario">Diário</option>
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                      <option value="semestral">Semestral</option>
                      <option value="anual">Anual</option>
                      <option value="sazonal">Sazonal</option>
                    </select>
                  </label>
                  <label>
                    Criticidade
                    <select value={d.criticidade ?? 'media'} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, criticidade: e.target.value } }))}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>
                  <label className="estimativas-form__full">
                    Detalhamento
                    <textarea rows={4} value={d.detalhamento ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, detalhamento: e.target.value } }))} />
                  </label>
                  <label className="estimativas-form__full">
                    Observações
                    <textarea rows={3} value={d.observacoes ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
                  </label>
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary">Salvar</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Processos</h2>
              <p className="muted">Documente os processos de negócio dos clientes</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setProcessoModal({ open: true, data: {} })}>
                + Novo Processo
              </button>
            </div>
          </div>
          <div className="ch-table-toolbar">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={processoSearch}
                onChange={(e) => setProcessoSearch(e.target.value)}
                placeholder="Buscar por processo, cliente, sistema, periodicidade ou criticidade..."
                aria-label="Buscar processo"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Sistema</th>
                  <th>Módulo</th>
                  <th>Periodicidade</th>
                  <th>Criticidade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcessosView.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{getClienteNome(p.clienteId)}</td>
                    <td>{p.sistemaNome}</td>
                    <td>{p.modulo}</td>
                    <td>{p.periodicidade}</td>
                    <td>
                      <span className={`ch-badge ch-badge--criticidade-${p.criticidade}`}>{p.criticidade}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Editar processo" title="Editar" onClick={() => setProcessoModal({ open: true, data: { ...p } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir processo" title="Excluir" onClick={() => handleDeleteProcesso(p.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProcessosView.length === 0 && (
                  <tr><td colSpan={7} className="ch-empty">Nenhum processo encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── HISTÓRICO ──────────────────────────────────────────────────────────────
  // subPage === 'historico'
  const dAtiv = atividadeModal.data
  return (
    <div className="customer-hub">
      {atividadeModal.open && (
        createPortal(
          <div className="estimativas-modal-overlay" role="presentation">
            <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="estimativas-modal__header">
                <h3>{dAtiv.id ? 'Editar Atividade' : 'Nova Atividade'}</h3>
                <button type="button" className="button-secondary" onClick={() => setAtividadeModal(emptyModal())}>Fechar</button>
              </div>
              <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveAtividade() }}>
                <label>
                  Cliente *
                  <select value={dAtiv.clienteId ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value, sistemaNome: '', modulo: '', responsavel: '', processoNome: '' } }))}>
                    <option value="">Selecione...</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label>
                  Data
                  <input type="date" value={dAtiv.data ?? new Date().toISOString().slice(0, 10)} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, data: e.target.value } }))} />
                </label>
                <label>
                  Evento *
                  <input value={dAtiv.evento ?? ''} placeholder="Ex: Treinamento, Atualização, Suporte" onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, evento: e.target.value } }))} />
                </label>
                <label>
                  Sistema
                  <input value={dAtiv.sistemaNome ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, sistemaNome: e.target.value } }))} />
                </label>
                <label>
                  Módulo
                  <input value={dAtiv.modulo ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, modulo: e.target.value } }))} />
                </label>
                <label>
                  Responsável
                  <select value={dAtiv.responsavel ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, responsavel: e.target.value } }))}>
                    <option value="">Selecione...</option>
                    {contatos.filter((c) => !dAtiv.clienteId || c.clienteId === dAtiv.clienteId).map((c) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Processo
                  <select value={dAtiv.processoNome ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, processoNome: e.target.value } }))}>
                    <option value="">Selecione...</option>
                    {processos.filter((p) => !dAtiv.clienteId || p.clienteId === dAtiv.clienteId).map((p) => (
                      <option key={p.id} value={p.nome}>{p.nome}</option>
                    ))}
                  </select>
                </label>
                <label className="estimativas-form__full">
                  Observações
                  <textarea rows={4} value={dAtiv.observacoes ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
                </label>
                <div className="estimativas-actions estimativas-form__full">
                  <button type="submit" className="button-primary">Salvar</button>
                </div>
              </form>
            </section>
          </div>,
          document.body
        )
      )}

      <section className="card">
        <div className="ch-section-header">
          <div>
            <h2>Histórico</h2>
            <p className="muted">Registre atividades e eventos dos clientes</p>
          </div>
          <div className="ch-header-actions">
            <button type="button" className="button-primary" onClick={() => setAtividadeModal({ open: true, data: { data: new Date().toISOString().slice(0, 10) } })}>
              + Nova Atividade
            </button>
          </div>
        </div>
        <div className="ch-table-toolbar">
          <label className="ch-table-search">
            <span className="ch-table-search__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </span>
            <input
              type="search"
              value={atividadeSearch}
              onChange={(e) => setAtividadeSearch(e.target.value)}
              placeholder="Buscar por data, cliente, evento, sistema ou responsavel..."
              aria-label="Buscar atividade"
            />
          </label>
          <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
            <option value="">Todos os Clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="csv-table ch-table-theme">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Evento</th>
                <th>Sistema</th>
                <th>Responsável</th>
                <th>Observações</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAtividadesView.map((a) => (
                <tr key={a.id}>
                  <td>{a.data}</td>
                  <td>{getClienteNome(a.clienteId)}</td>
                  <td>{a.evento || a.tipo}</td>
                  <td>{a.sistemaNome}{a.modulo ? ` / ${a.modulo}` : ''}</td>
                  <td>{a.responsavel}</td>
                  <td>{a.observacoes || a.descricao}</td>
                  <td>
                    <div className="ch-row-actions ch-row-actions--icons">
                      <button type="button" className="ch-icon-action" aria-label="Editar atividade" title="Editar" onClick={() => setAtividadeModal({ open: true, data: { ...a } })}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir atividade" title="Excluir" onClick={() => handleDeleteAtividade(a.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAtividadesView.length === 0 && (
                <tr><td colSpan={7} className="ch-empty">Nenhum registro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
