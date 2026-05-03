import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../lib/api'
import RichTextEditor from './RichTextEditor'

type Organization = {
  id: string
  name: string
}

type TicketItem = {
  id: string
  protocol: string
  subject: string
  department: string
  client: string
  status: string
  situation: string
  organizationId: string
  organizationName: string
  createdAt: string
  updatedAt: string
  raw: Record<string, unknown>
}

type TicketDetailAttachment = {
  name: string
  url: string
  size: number | null
}

type TicketDetailStatusPeriod = {
  operatorName: string
  date: string
}

type TicketDetailStatus = {
  id: string
  description: string
  applyDate: string
  message: string
  start: TicketDetailStatusPeriod | null
  end: TicketDetailStatusPeriod | null
}

type TicketDetailReply = {
  id: string
  senderType: string
  sender: string
  date: string
  message: string
  attachments: TicketDetailAttachment[]
}

type TicketDetailField = {
  id: string
  label: string
  value: string
}

type TicketDetail = {
  id: string
  protocol: string
  subject: string
  message: string
  mimetype: string
  customerName: string
  customerEmail: string
  customerId: string
  organizationName: string
  organizationId: string
  priority: string
  ticketType: string
  workTimeSeconds: number | null
  elapsedTimeSeconds: number | null
  creationDate: string
  scheduleDate: string
  firstReplyDate: string
  endDate: string
  situationDescription: string
  situationApplyDate: string
  categoryName: string
  departmentName: string
  operatorName: string
  costTotalFinal: number | null
  evaluationGrade: string
  evaluationComment: string
  evaluationSolved: string
  parentTicketId: string
  attachments: TicketDetailAttachment[]
  replies: TicketDetailReply[]
  statusHistory: TicketDetailStatus[]
  customOpenFields: TicketDetailField[]
  customClosedFields: TicketDetailField[]
  customEvaluationFields: TicketDetailField[]
  activeWhatsapp: boolean
  closedByInactivity: boolean
  reopened: boolean
  raw: Record<string, unknown>
}

type AppUser = {
  id: number
  username: string
  displayName: string
  isActive: boolean
  ticketOrganizations: string[]
}

type ExistingAppUser = {
  id: number
  username: string
  displayName: string
  isActive: boolean
  hasTicketHubAccess: boolean
}

type TicketHubToolProps = {
  currentUsername: string
  subPage: 'todos' | 'abertos' | 'admin'
}

type TicketDraftAttachment = {
  id: string
  file: File
}

type ReplyAttachmentPayload = {
  name: string
  type: string
  contentBase64: string
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Não foi possível conectar na API local. Inicie o servidor com npm run dev:all.'
  }
  if (error instanceof Error) {
    return error.message || fallback
  }
  return fallback
}

async function readJsonSafe<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as T
  } catch {
    const compact = raw.replace(/\s+/g, ' ').trim()
    const preview = compact.slice(0, 180)
    throw new Error(preview ? `${fallbackMessage} Resposta recebida: ${preview}` : fallbackMessage)
  }
}

async function fetchOrganizations(): Promise<Organization[]> {
  const response = await fetch(apiUrl('/api/ticket-hub/organizations'))
  if (!response.ok) {
    const data = await readJsonSafe<{ error?: string }>(
      response,
      `Erro ${response.status} ao buscar organizações.`,
    )
    throw new Error(data.error || `Erro ${response.status} ao buscar organizações.`)
  }

  const data = await readJsonSafe<
    | { organizations?: Array<Record<string, unknown>>; organization?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>
  >(response, 'Resposta inválida ao buscar organizações.')

  const list = Array.isArray(data)
    ? data
    : (data.organizations ?? data.organization ?? data.data ?? [])

  return list
    .map((org) => {
      const id = String(org.id ?? org.organization_id ?? org.id_organization ?? '').trim()
      const name = String(org.name ?? org.organization_name ?? org.org_name ?? '').trim()
      return { id, name }
    })
    .filter((org) => org.id && org.name)
}

function normalizeTicketRow(ticket: Record<string, unknown>): TicketItem {
  const extractString = (value: unknown): string => {
    if (value == null) return ''
    if (typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      const name = obj.name ?? obj.label ?? obj.description ?? obj.title ?? obj.id
      return String(name ?? '').trim()
    }
    return String(value).trim()
  }

  const readNested = (value: unknown, path: string[]): unknown => {
    let current = value
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
      current = (current as Record<string, unknown>)[segment]
    }
    return current
  }

  const pickFirst = (...values: unknown[]) => {
    for (const value of values) {
      const parsed = extractString(value)
      if (parsed && parsed !== '[object Object]') return parsed
    }
    return ''
  }

  const customer = (ticket.customer && typeof ticket.customer === 'object')
    ? ticket.customer as Record<string, unknown>
    : null
  const customerName = pickFirst(customer?.name, ticket.customer_name, ticket.client_name, ticket.requester_name, ticket.user_name)
  const customerOrganization = (customer?.organization && typeof customer.organization === 'object')
    ? customer.organization as Record<string, unknown>
    : null
  const customerOrganizationName = pickFirst(customerOrganization?.name)
  const clientDisplay = customerName
    ? (customerOrganizationName ? `${customerName} (${customerOrganizationName})` : customerName)
    : ''
  const organization = (ticket.organization && typeof ticket.organization === 'object')
    ? ticket.organization as Record<string, unknown>
    : null

  const detailId = pickFirst(
    ticket.id,
    ticket.ticket_id,
    ticket.ticketId,
    ticket.id_ticket,
    ticket.idTicket,
    ticket.ticket_hash,
    ticket.hash,
    ticket.code,
    readNested(ticket, ['ticket', 'id']),
    readNested(ticket, ['ticket_data', 'id']),
    readNested(ticket, ['data', 'id']),
  )

  return {
    id: detailId,
    protocol: pickFirst(ticket.protocol, ticket.ticket_protocol, ticket.number, ticket.protocolo),
    subject: pickFirst(ticket.subject, ticket.title, ticket.assunto),
    department: pickFirst(ticket.department_name, ticket.department, ticket.queue_name, ticket.group_name),
    client: clientDisplay,
    status: pickFirst(ticket.status_name, ticket.status, ticket.status_label),
    situation: pickFirst(ticket.situation_name, ticket.situation, ticket.state_name),
    organizationId: pickFirst(organization?.id, ticket.organization_id, ticket.org_id),
    organizationName: pickFirst(organization?.name, ticket.organization_name, ticket.org_name, ticket.company_name, customerOrganizationName),
    createdAt: pickFirst(ticket.creation_date, ticket.created_at, ticket.created, ticket.created_date, ticket.opened_at, ticket.date_create),
    updatedAt: pickFirst(ticket.updated_at, ticket.updated, ticket.last_update, ticket.date_update),
    raw: ticket,
  }
}

function formatDateTime(value: string): string {
  const input = String(value || '').trim()
  if (!input) return '—'
  const asDate = new Date(input)
  if (Number.isNaN(asDate.getTime())) return input
  return asDate.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function formatDuration(value: number | null): string {
  if (value == null || value < 0) return '—'
  if (value === 0) return '0 min'

  const totalMinutes = Math.round(value / 60)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []

  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes || parts.length === 0) parts.push(`${minutes}min`)

  return parts.join(' ')
}

function formatBytes(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let index = 0

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }

  return `${size.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[index]}`
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPriority(value: unknown): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) return '—'

  const labels: Record<string, string> = {
    '1': 'Baixa',
    '2': 'Normal',
    '3': 'Alta',
    '4': 'Urgente',
  }

  return labels[normalized] ?? normalized
}

function normalizeAttachments(value: unknown): TicketDetailAttachment[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const attachment = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        name: String(attachment.name ?? attachment.filename ?? '').trim(),
        url: String(attachment.url ?? attachment.link ?? '').trim(),
        size: parseOptionalNumber(attachment.size),
      }
    })
    .filter((item) => item.name || item.url)
}

function normalizeCustomFields(value: unknown): TicketDetailField[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const field = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        id: String(field.id ?? '').trim(),
        label: String(field.label ?? field.name ?? '').trim(),
        value: String(field.value ?? '').trim(),
      }
    })
    .filter((item) => item.label || item.value)
}

function sanitizeHtml(html: string): string {
  const input = String(html || '')
  if (!input.trim() || typeof DOMParser === 'undefined') return input

  const parser = new DOMParser()
  const parsed = parser.parseFromString(input, 'text/html')

  parsed.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => node.remove())

  parsed.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase()

      if (attributeName.startsWith('on') || attributeName === 'srcdoc') {
        element.removeAttribute(attribute.name)
        return
      }

      if ((attributeName === 'href' || attributeName === 'src') && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name)
        return
      }

      if (attributeName.startsWith('fr-')) {
        element.removeAttribute(attribute.name)
      }
    })
  })

  return parsed.body.innerHTML
}

function normalizeTicketDetail(payload: Record<string, unknown>): TicketDetail {
  const customer = payload.customer && typeof payload.customer === 'object'
    ? payload.customer as Record<string, unknown>
    : {}
  const customerOrganization = customer.organization && typeof customer.organization === 'object'
    ? customer.organization as Record<string, unknown>
    : {}
  const situation = payload.situation && typeof payload.situation === 'object'
    ? payload.situation as Record<string, unknown>
    : {}
  const category = payload.category && typeof payload.category === 'object'
    ? payload.category as Record<string, unknown>
    : {}
  const department = payload.department && typeof payload.department === 'object'
    ? payload.department as Record<string, unknown>
    : {}
  const operator = payload.operator && typeof payload.operator === 'object'
    ? payload.operator as Record<string, unknown>
    : {}
  const cost = payload.cost && typeof payload.cost === 'object'
    ? payload.cost as Record<string, unknown>
    : {}
  const evaluation = payload.evaluation && typeof payload.evaluation === 'object'
    ? payload.evaluation as Record<string, unknown>
    : {}
  const customFields = payload.custom_fields && typeof payload.custom_fields === 'object'
    ? payload.custom_fields as Record<string, unknown>
    : {}

  const statusHistory = Array.isArray(payload.status)
    ? payload.status
      .map((item) => {
        const status = item && typeof item === 'object' ? item as Record<string, unknown> : {}
        const start = status.start && typeof status.start === 'object' ? status.start as Record<string, unknown> : {}
        const end = status.end && typeof status.end === 'object' ? status.end as Record<string, unknown> : {}
        const startOperator = start.operator && typeof start.operator === 'object' ? start.operator as Record<string, unknown> : {}
        const endOperator = end.operator && typeof end.operator === 'object' ? end.operator as Record<string, unknown> : {}

        const normalizePeriod = (periodOperator: Record<string, unknown>) => {
          const operatorName = String(periodOperator.name ?? '').trim()
          const date = String(periodOperator.date ?? '').trim()
          return operatorName || date ? { operatorName, date } : null
        }

        return {
          id: String(status.id ?? '').trim(),
          description: String(status.description ?? '').trim(),
          applyDate: String(status.apply_date ?? '').trim(),
          message: String(status.message ?? '').trim(),
          start: normalizePeriod(startOperator),
          end: normalizePeriod(endOperator),
        }
      })
      .filter((item) => item.description || item.applyDate)
    : []

  const replies = Array.isArray(payload.replies)
    ? payload.replies
      .map((item) => {
        const reply = item && typeof item === 'object' ? item as Record<string, unknown> : {}
        return {
          id: String(reply.id ?? '').trim(),
          senderType: String(reply.sender_type ?? '').trim(),
          sender: String(reply.sender ?? '').trim(),
          date: String(reply.date ?? '').trim(),
          message: String(reply.message ?? '').trim(),
          attachments: normalizeAttachments(reply.attachments),
        }
      })
      .filter((item) => item.sender || item.message || item.date)
    : []

  return {
    id: String(payload.id ?? '').trim(),
    protocol: String(payload.protocol ?? '').trim(),
    subject: String(payload.subject ?? '').trim(),
    message: String(payload.message ?? '').trim(),
    mimetype: String(payload.mimetype ?? '').trim(),
    customerName: String(customer.name ?? '').trim(),
    customerEmail: String(customer.email ?? '').trim(),
    customerId: String(customer.id ?? '').trim(),
    organizationName: String(customerOrganization.name ?? payload.organization_name ?? '').trim(),
    organizationId: String(customerOrganization.id ?? payload.organization_id ?? '').trim(),
    priority: formatPriority(payload.priority),
    ticketType: String(payload.ticket_type ?? '').trim(),
    workTimeSeconds: parseOptionalNumber(payload.work_time),
    elapsedTimeSeconds: parseOptionalNumber(payload.elapsed_time),
    creationDate: String(payload.creation_date ?? '').trim(),
    scheduleDate: String(payload.schedule_date ?? '').trim(),
    firstReplyDate: String(payload.first_reply_date ?? '').trim(),
    endDate: String(payload.end_date ?? '').trim(),
    situationDescription: String(situation.description ?? '').trim(),
    situationApplyDate: String(situation.apply_date ?? '').trim(),
    categoryName: String(category.name ?? '').trim(),
    departmentName: String(department.name ?? '').trim(),
    operatorName: String(operator.name ?? '').trim(),
    costTotalFinal: parseOptionalNumber(cost.total_final),
    evaluationGrade: String(evaluation.grade ?? '').trim(),
    evaluationComment: String(evaluation.comment ?? '').trim(),
    evaluationSolved: evaluation.problem_solved == null ? '' : String(evaluation.problem_solved),
    parentTicketId: String(payload.parent_ticket_id ?? '').trim(),
    attachments: normalizeAttachments(payload.attachments),
    replies,
    statusHistory,
    customOpenFields: normalizeCustomFields(customFields.open),
    customClosedFields: normalizeCustomFields(customFields.closed),
    customEvaluationFields: normalizeCustomFields(customFields.evaluation),
    activeWhatsapp: Boolean(payload.active_whatsapp),
    closedByInactivity: Boolean(payload.closed_by_inactivity),
    reopened: Boolean(payload.reopened),
    raw: payload,
  }
}

async function fetchTicketDetail(currentUsername: string, ticketId: string, ensureOperatorLinked = false): Promise<TicketDetail> {
  const params = new URLSearchParams({ ticket_id: ticketId })
  if (ensureOperatorLinked) {
    params.set('ensure_operator_linked', '1')
  }

  const response = await fetch(apiUrl(`/api/ticket-hub/tickets/detail?${params.toString()}`), {
    headers: {
      'x-user': currentUsername.trim().toLowerCase(),
    },
  })

  if (!response.ok) {
    const data = await readJsonSafe<{ error?: string }>(
      response,
      `Erro ${response.status} ao buscar detalhes do chamado.`,
    )
    throw new Error(data.error || `Erro ${response.status} ao buscar detalhes do chamado.`)
  }

  const data = await readJsonSafe<{ detail?: Record<string, unknown> }>(
    response,
    'Resposta inválida do detalhe do chamado.',
  )
  if (!data.detail || typeof data.detail !== 'object') {
    throw new Error('Resposta inválida do detalhe do chamado.')
  }

  return normalizeTicketDetail(data.detail)
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Falha ao ler arquivo para envio.'))
    reader.readAsDataURL(file)
  })
}

async function postTicketReply(
  currentUsername: string,
  payload: {
    ticketId: string
    message: string
    attachments: ReplyAttachmentPayload[]
  },
): Promise<void> {
  const response = await fetch(apiUrl('/api/ticket-hub/tickets/reply/operator'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user': currentUsername.trim().toLowerCase(),
    },
    body: JSON.stringify({
      ticket_id: payload.ticketId,
      message: payload.message,
      attachment: payload.attachments,
    }),
  })

  if (!response.ok) {
    const data = await readJsonSafe<{ error?: string }>(
      response,
      `Erro ${response.status} ao responder o chamado.`,
    )
    throw new Error(data.error || `Erro ${response.status} ao responder o chamado.`)
  }
}

async function fetchTickets(currentUsername: string, page = 1, situation?: string): Promise<{
  tickets: TicketItem[]
  page: number
  pages: number | null
  nextPage: number | null
  previousPage: number | null
}> {
  const params = new URLSearchParams({ page: String(page) })
  if (situation) params.set('situation', situation)
  const response = await fetch(apiUrl(`/api/ticket-hub/tickets?${params.toString()}`), {
    headers: {
      'x-user': currentUsername.trim().toLowerCase(),
    },
  })

  if (!response.ok) {
    const data = await readJsonSafe<{ error?: string }>(
      response,
      `Erro ${response.status} ao buscar chamados.`,
    )
    throw new Error(data.error || `Erro ${response.status} ao buscar chamados.`)
  }

  const data = await readJsonSafe<
    | { tickets?: Array<Record<string, unknown>>; ticket?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>>; page?: number; pages?: number; next_page?: number | null; previous_page?: number | null }
    | Array<Record<string, unknown>>
  >(response, 'Resposta inválida ao buscar chamados.')

  const list = Array.isArray(data)
    ? data
    : (data.tickets ?? data.ticket ?? data.data ?? [])

  const normalized = list
    .map((item) => normalizeTicketRow(item))
    .filter((item) => item.id || item.protocol || item.subject)

  return {
    tickets: normalized,
    page: Array.isArray(data) ? page : Number(data.page || page),
    pages: Array.isArray(data) ? null : Number(data.pages || 0) || null,
    nextPage: Array.isArray(data) ? (normalized.length >= 50 ? page + 1 : null) : Number(data.next_page || 0) || null,
    previousPage: Array.isArray(data) ? (page > 1 ? page - 1 : null) : Number(data.previous_page || 0) || null,
  }
}

export default function TicketHubTool({ currentUsername, subPage }: TicketHubToolProps) {
  const normalizedUsername = currentUsername.trim().toLowerCase()
  const isVisitor = normalizedUsername === 'visitor'
  const isAdminPage = subPage === 'admin'

  const adminHeader = useMemo(
    () => ({ 'x-admin-user': normalizedUsername }),
    [normalizedUsername],
  )

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [appUsers, setAppUsers] = useState<ExistingAppUser[]>([])
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [draftOrgs, setDraftOrgs] = useState<string[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [isLoadingTickets, setIsLoadingTickets] = useState(false)
  const [isChangingTicketsPage, setIsChangingTicketsPage] = useState(false)
  const [ticketsPage, setTicketsPage] = useState(1)
  const [ticketsTotalPages, setTicketsTotalPages] = useState<number | null>(null)
  const [ticketsNextPage, setTicketsNextPage] = useState<number | null>(null)
  const [ticketsPreviousPage, setTicketsPreviousPage] = useState<number | null>(null)
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null)
  const [ticketDetailError, setTicketDetailError] = useState<string | null>(null)
  const [isLoadingTicketDetail, setIsLoadingTicketDetail] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<TicketDraftAttachment[]>([])
  const [replyError, setReplyError] = useState<string | null>(null)
  const [replySuccess, setReplySuccess] = useState<string | null>(null)
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)
  const [isRefreshingAdmin, setIsRefreshingAdmin] = useState(false)

  const isOpenSubPage = subPage === 'abertos'
  const isTicketsSubPage = subPage === 'todos' || subPage === 'abertos'
  const ticketSituationFilter = isOpenSubPage ? '0,1,2,3,6,7,8,9,10,11' : undefined

  const resetReplyComposer = () => {
    setReplyBody('')
    setReplyAttachments([])
    setReplyError(null)
    setReplySuccess(null)
  }

  const stripHtml = (value: string): string => {
    const html = String(value || '').trim()
    if (!html) return ''
    if (typeof DOMParser === 'undefined') return html

    const parser = new DOMParser()
    const parsed = parser.parseFromString(html, 'text/html')
    return String(parsed.body.innerText || parsed.body.textContent || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const hasReplyContent = () => {
    const html = String(replyBody || '').trim()
    if (!html) return false

    if (typeof DOMParser === 'undefined') return html.length > 0
    const parser = new DOMParser()
    const parsed = parser.parseFromString(html, 'text/html')
    const text = stripHtml(html)
    const hasMedia = Boolean(parsed.body.querySelector('img, video, audio, iframe, object, embed'))
    return text.length > 0 || hasMedia
  }

  const handleReplyFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(event.target.files || [])
    if (!inputFiles.length) return

    setReplyAttachments((prev) => {
      const existing = new Set(prev.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`))
      const additions = inputFiles
        .filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`))
        .map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
        }))
      return [...prev, ...additions]
    })

    event.target.value = ''
    setReplyError(null)
    setReplySuccess(null)
  }

  const handleRemoveReplyAttachment = (id: string) => {
    setReplyAttachments((prev) => prev.filter((item) => item.id !== id))
    setReplySuccess(null)
  }

  const handleReplySubmit = async () => {
    if (!hasReplyContent()) {
      setReplyError('Informe uma resposta antes de enviar.')
      setReplySuccess(null)
      return
    }

    const ticketId = String(selectedTicket?.id || '').trim()
    if (!ticketId) {
      setReplyError('ID do chamado inválido para responder.')
      setReplySuccess(null)
      return
    }

    const message = String(replyBody || '').trim()

    setIsSubmittingReply(true)

    try {
      const selectedAttachments = await Promise.all(replyAttachments.map(async (item) => {
        const base64DataUrl = await fileToBase64(item.file)
        const contentBase64 = base64DataUrl.includes(',')
          ? base64DataUrl.split(',')[1]
          : base64DataUrl
        return {
          name: item.file.name,
          type: item.file.type || 'application/octet-stream',
          contentBase64,
        }
      }))

      const attachments = selectedAttachments

      await postTicketReply(currentUsername, {
        ticketId,
        message,
        attachments,
      })

      const refreshedDetail = await fetchTicketDetail(currentUsername, ticketId, isOpenSubPage)
      setTicketDetail(refreshedDetail)
      setReplyBody('')
      setReplyAttachments([])
      setReplyError(null)
      setReplySuccess('Resposta enviada com sucesso.')
    } catch (err) {
      setReplyError(toFriendlyApiError(err, 'Não foi possível enviar a resposta do chamado.'))
      setReplySuccess(null)
    } finally {
      setIsSubmittingReply(false)
    }
  }

  useEffect(() => {
    if (!isVisitor || !isAdminPage) return
    const load = async () => {
      setIsLoadingOrgs(true)
      setOrgError(null)
      try {
        const orgs = await fetchOrganizations()
        setOrganizations(orgs)
      } catch (err) {
        setOrgError(toFriendlyApiError(err, 'Não foi possível carregar as organizações do TomTicket.'))
      } finally {
        setIsLoadingOrgs(false)
      }
    }
    void load()
  }, [isVisitor, isAdminPage])

  const loadUsers = async () => {
    setIsLoadingUsers(true)
    setUsersError(null)
    try {
      const response = await fetch(apiUrl('/api/ticket-hub/users'), { headers: adminHeader })
      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || 'Erro ao carregar usuários.')
      }
      const data = await response.json() as AppUser[]
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setUsersError(toFriendlyApiError(err, 'Erro ao carregar usuários.'))
    } finally {
      setIsLoadingUsers(false)
    }
  }

  const loadAppUsers = async () => {
    setUsersError(null)
    try {
      const response = await fetch(apiUrl('/api/ticket-hub/app-users'), { headers: adminHeader })
      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || 'Erro ao carregar usuarios da aplicacao.')
      }
      const data = await response.json() as ExistingAppUser[]
      setAppUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setUsersError(toFriendlyApiError(err, 'Erro ao carregar usuarios da aplicacao.'))
    }
  }

  useEffect(() => {
    if (!isVisitor || !isAdminPage) return
    void loadUsers()
  }, [isVisitor, isAdminPage])

  useEffect(() => {
    if (!isVisitor || !isAdminPage) return
    void loadAppUsers()
  }, [isVisitor, isAdminPage])

  const handleRefreshAdmin = async () => {
    if (!isVisitor || !isAdminPage || isRefreshingAdmin) return

    setIsRefreshingAdmin(true)
    setUsersError(null)
    setOrgError(null)

    try {
      const [orgs] = await Promise.all([
        fetchOrganizations(),
        loadUsers(),
        loadAppUsers(),
      ])
      setOrganizations(orgs)
    } catch (err) {
      const detail = toFriendlyApiError(err, 'Não foi possível atualizar os dados da Central de Chamados.')
      setUsersError(detail)
      setOrgError(detail)
    } finally {
      setIsRefreshingAdmin(false)
    }
  }

  const loadTicketsPage = useCallback(async (targetPage: number, mode: 'initial' | 'page' | 'refresh') => {
    if (!isTicketsSubPage) return

    if (mode === 'initial') {
      setIsLoadingTickets(true)
    } else {
      setIsChangingTicketsPage(true)
    }
    setTicketsError(null)

    try {
      const data = await fetchTickets(currentUsername, targetPage, ticketSituationFilter)
      setTickets(data.tickets)
      setTicketsPage(data.page || targetPage)
      setTicketsTotalPages(data.pages)
      setTicketsNextPage(data.nextPage)
      setTicketsPreviousPage(data.previousPage)
      if (mode === 'initial') {
        setSelectedTicket(null)
        setTicketDetail(null)
        setTicketDetailError(null)
      }
    } catch (err) {
      setTicketsError(toFriendlyApiError(err, 'Não foi possível carregar os chamados.'))
    } finally {
      if (mode === 'initial') {
        setIsLoadingTickets(false)
      } else {
        setIsChangingTicketsPage(false)
      }
    }
  }, [isTicketsSubPage, currentUsername, ticketSituationFilter])

  useEffect(() => {
    if (!isTicketsSubPage) return
    void loadTicketsPage(1, 'initial')
  }, [isTicketsSubPage, loadTicketsPage])

  const handleGoToTicketsPage = async (targetPage: number | null) => {
    if (!targetPage || targetPage < 1 || isLoadingTickets || isChangingTicketsPage) return
    await loadTicketsPage(targetPage, 'page')
  }

  const handleRefreshTickets = async () => {
    if (!isTicketsSubPage || isLoadingTickets || isChangingTicketsPage) return
    await loadTicketsPage(ticketsPage || 1, 'refresh')
  }

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        u.displayName.toLowerCase().includes(term),
    )
  }, [users, userSearch])

  const selectedAppUser = useMemo(
    () => appUsers.find((user) => String(user.id) === selectedUserId) ?? null,
    [appUsers, selectedUserId],
  )

  const filteredTickets = useMemo(() => {
    const term = ticketSearch.trim().toLowerCase()
    if (!term) return tickets

    return tickets.filter((ticket) =>
      ticket.protocol.toLowerCase().includes(term)
      || ticket.subject.toLowerCase().includes(term)
      || ticket.department.toLowerCase().includes(term)
      || ticket.client.toLowerCase().includes(term)
      || ticket.status.toLowerCase().includes(term)
      || ticket.situation.toLowerCase().includes(term)
      || ticket.organizationName.toLowerCase().includes(term)
    )
  }, [tickets, ticketSearch])

  const selectedTicketIndex = useMemo(() => {
    if (!selectedTicket) return -1
    return filteredTickets.findIndex((ticket) => (
      ticket.id === selectedTicket.id
      && ticket.protocol === selectedTicket.protocol
      && ticket.createdAt === selectedTicket.createdAt
    ))
  }, [filteredTickets, selectedTicket])

  const canGoToPrevTicket = !isOpenSubPage && selectedTicketIndex > 0
  const canGoToNextTicket = !isOpenSubPage && selectedTicketIndex >= 0 && selectedTicketIndex < filteredTickets.length - 1

  const handleGoToPrevTicket = () => {
    if (!canGoToPrevTicket) return
    setSelectedTicket(filteredTickets[selectedTicketIndex - 1])
  }

  const handleGoToNextTicket = () => {
    if (!canGoToNextTicket) return
    setSelectedTicket(filteredTickets[selectedTicketIndex + 1])
  }

  const closeTicketModal = () => {
    setSelectedTicket(null)
    setTicketDetail(null)
    setTicketDetailError(null)
    resetReplyComposer()
    if (isTicketsSubPage) {
      void handleRefreshTickets()
    }
  }

  useEffect(() => {
    if (!selectedTicket) return

    let isCancelled = false

    const loadDetail = async () => {
      setIsLoadingTicketDetail(true)
      setTicketDetail(null)
      setTicketDetailError(null)

      const ticketDetailId = String(selectedTicket.id || '').trim()
      if (!ticketDetailId) {
        setTicketDetailError('Este chamado não possui um ID de detalhe válido no retorno da listagem.')
        setIsLoadingTicketDetail(false)
        return
      }

      try {
        const detail = await fetchTicketDetail(currentUsername, ticketDetailId, isOpenSubPage)
        if (!isCancelled) {
          setTicketDetail(detail)
          resetReplyComposer()
        }
      } catch (err) {
        if (!isCancelled) {
          setTicketDetailError(toFriendlyApiError(err, 'Não foi possível carregar o detalhe do chamado.'))
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTicketDetail(false)
        }
      }
    }

    void loadDetail()

    return () => {
      isCancelled = true
    }
  }, [selectedTicket, currentUsername, isOpenSubPage])

  useEffect(() => {
    if (!selectedTicket) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTicketModal()
        return
      }

      if (event.key === 'ArrowLeft' && canGoToPrevTicket) {
        event.preventDefault()
        handleGoToPrevTicket()
        return
      }

      if (event.key === 'ArrowRight' && canGoToNextTicket) {
        event.preventDefault()
        handleGoToNextTicket()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [selectedTicket, canGoToPrevTicket, canGoToNextTicket, selectedTicketIndex, filteredTickets, isTicketsSubPage, ticketsPage, isLoadingTickets, isChangingTicketsPage])

  const detailTimeline = useMemo(() => {
    if (!ticketDetail) return []

    return [
      {
        id: `initial-${ticketDetail.id}`,
        sender: ticketDetail.customerName || ticketDetail.organizationName || 'Solicitante',
        senderType: 'C',
        date: ticketDetail.creationDate,
        message: ticketDetail.message,
        attachments: ticketDetail.attachments,
      },
      ...ticketDetail.replies.map((reply) => ({
        id: reply.id,
        sender: reply.sender || 'Atualização',
        senderType: reply.senderType,
        date: reply.date,
        message: reply.message,
        attachments: reply.attachments,
      })),
    ].filter((item) => item.message || item.attachments.length > 0 || item.date)
  }, [ticketDetail])

  const renderAttachmentList = (attachments: TicketDetailAttachment[], emptyLabel = 'Nenhum anexo.') => {
    if (!attachments.length) {
      return <p className="muted ch-ticket-detail__empty">{emptyLabel}</p>
    }

    return (
      <ul className="ch-ticket-detail-attachments">
        {attachments.map((attachment, index) => (
          <li key={`${attachment.url || attachment.name || 'attachment'}-${index}`}>
            <a href={attachment.url || '#'} target="_blank" rel="noreferrer">
              {attachment.name || 'Arquivo sem nome'}
            </a>
            <span>{formatBytes(attachment.size)}</span>
          </li>
        ))}
      </ul>
    )
  }

  const renderCustomFieldList = (fields: TicketDetailField[]) => {
    if (!fields.length) {
      return <p className="muted ch-ticket-detail__empty">Nenhum campo disponível.</p>
    }

    return (
      <dl className="ch-ticket-detail-fields-list">
        {fields.map((field) => (
          <div key={`${field.id || field.label}-${field.value}`}>
            <dt>{field.label || 'Campo'}</dt>
            <dd>{field.value || '—'}</dd>
          </div>
        ))}
      </dl>
    )
  }

  const handleStartEdit = (user: AppUser) => {
    setEditingUser(user)
    setDraftOrgs(user.ticketOrganizations)
    setSuccess(null)
    setUsersError(null)
  }

  const handleStartAccessRegistration = () => {
    if (!selectedAppUser) {
      setUsersError('Selecione um usuario existente para cadastrar o acesso.')
      return
    }

    const existingAccessUser = users.find((user) => user.id === selectedAppUser.id)
    if (existingAccessUser) {
      handleStartEdit(existingAccessUser)
      return
    }

    setEditingUser({
      id: selectedAppUser.id,
      username: selectedAppUser.username,
      displayName: selectedAppUser.displayName,
      isActive: selectedAppUser.isActive,
      ticketOrganizations: [],
    })
    setDraftOrgs([])
    setSuccess(null)
    setUsersError(null)
  }

  const handleCancelEdit = () => {
    setEditingUser(null)
    setDraftOrgs([])
    setSuccess(null)
  }

  const handleToggleOrg = (orgId: string) => {
    setDraftOrgs((prev) =>
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId],
    )
  }

  const handleToggleAllOrgs = () => {
    const allIds = organizations.map((o) => o.id)
    const hasAll = allIds.every((id) => draftOrgs.includes(id))
    setDraftOrgs(hasAll ? [] : allIds)
  }

  const handleSaveOrgs = async () => {
    if (!editingUser) return
    setIsSaving(true)
    setSuccess(null)
    setUsersError(null)
    const hasExistingAccess = users.some((user) => user.id === editingUser.id)
    try {
      const response = await fetch(apiUrl(hasExistingAccess ? `/api/ticket-hub/users/${editingUser.id}/organizations` : '/api/ticket-hub/users'), {
        method: hasExistingAccess ? 'PUT' : 'POST',
        headers: { ...adminHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(hasExistingAccess
          ? { organizations: draftOrgs }
          : { userId: editingUser.id, organizations: draftOrgs }),
      })
      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || 'Erro ao salvar organizações.')
      }
      setSuccess(hasExistingAccess
        ? `Organizações de "${editingUser.displayName || editingUser.username}" atualizadas com sucesso!`
        : `Acesso de "${editingUser.displayName || editingUser.username}" cadastrado com sucesso!`)
      setEditingUser(null)
      setDraftOrgs([])
      setSelectedUserId('')
      await Promise.all([loadUsers(), loadAppUsers()])
    } catch (err) {
      setUsersError(toFriendlyApiError(err, 'Erro ao salvar organizações.'))
    } finally {
      setIsSaving(false)
    }
  }

  if (subPage === 'todos' || subPage === 'abertos') {
    return (
      <div className="ticket-hub-tool">
        <section className="card ch-contacts-card">
          <div className="ch-section-header">
            <div>
              <h2>{subPage === 'abertos' ? 'Chamados Abertos' : 'Todos os chamados'}</h2>
              <p className="muted">{subPage === 'abertos' ? 'Chamados com situação em aberto retornados pela API do TomTicket' : 'Acompanhe os tickets retornados pela API do TomTicket'}</p>
            </div>
          </div>

          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                placeholder="Filtrar por protocolo, assunto, departamento, cliente, organização, status ou situação"
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
                aria-label="Buscar chamados"
              />
            </label>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void handleRefreshTickets()}
              disabled={isLoadingTickets || isChangingTicketsPage}
            >
              {isLoadingTickets || isChangingTicketsPage ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          {ticketsError && <p className="error">{ticketsError}</p>}

          {isLoadingTickets ? (
            <p className="muted">Carregando chamados...</p>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: '0.85rem' }}>
                Exibindo {filteredTickets.length} chamado{filteredTickets.length !== 1 ? 's' : ''}. Página atual: {ticketsPage}{ticketsTotalPages ? ` de ${ticketsTotalPages}` : ''}.
              </p>
              <div className="csv-table ch-table-theme">
                <table>
                  <thead>
                    <tr>
                      <th>Protocolo</th>
                      <th>Assunto</th>
                      <th>Departamento</th>
                      <th>Cliente</th>
                      <th>Organização</th>
                      <th>Data/Hora</th>
                      <th>Status</th>
                      <th>Situação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((ticket, index) => (
                      <tr key={`${ticket.id || ticket.protocol || 'ticket'}-${index}`}>
                        <td>{ticket.protocol || ticket.id || '—'}</td>
                        <td>{ticket.subject || '—'}</td>
                        <td>{ticket.department || '—'}</td>
                        <td>{ticket.client || '—'}</td>
                        <td>
                          <span className="ch-client-pill">{ticket.organizationName || (ticket.organizationId ? `ID ${ticket.organizationId}` : '—')}</span>
                        </td>
                        <td>{formatDateTime(ticket.createdAt)}</td>
                        <td>{ticket.status || '—'}</td>
                        <td>{ticket.situation || ticket.status || '—'}</td>
                        <td>
                          <div className="ch-row-actions ch-row-actions--icons">
                            <button
                              type="button"
                              className="ch-icon-action"
                              onClick={() => setSelectedTicket(ticket)}
                              title={isOpenSubPage ? 'Editar chamado' : 'Detalhes'}
                              aria-label={isOpenSubPage ? 'Editar chamado' : 'Ver detalhes do chamado'}
                              disabled={!ticket.id}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                {isOpenSubPage ? (
                                  <>
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                  </>
                                ) : (
                                  <>
                                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </>
                                )}
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredTickets.length === 0 && (
                      <tr>
                        <td colSpan={9} className="ch-empty">Nenhum chamado encontrado para os filtros/permissões atuais.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ch-header-actions" style={{ marginTop: '0.85rem', justifyContent: 'center' }}>
                {(ticketsPreviousPage || ticketsNextPage) ? (
                  <>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void handleGoToTicketsPage(ticketsPreviousPage)}
                      disabled={!ticketsPreviousPage || isChangingTicketsPage}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void handleGoToTicketsPage(ticketsNextPage)}
                      disabled={!ticketsNextPage || isChangingTicketsPage}
                    >
                      Próxima
                    </button>
                  </>
                ) : isChangingTicketsPage ? (
                  <p className="muted" style={{ margin: 0 }}>Carregando página...</p>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Sem páginas adicionais para navegação.</p>
                )}
              </div>
            </>
          )}
        </section>

        {selectedTicket && createPortal(
          <div
            className="ch-ticket-detail-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do chamado"
          >
            <section
              className="card ch-ticket-detail-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="ch-ticket-detail-header">
                <div>
                  <h3>Detalhes do Chamado: #{ticketDetail?.protocol || selectedTicket.protocol || selectedTicket.id || '—'}</h3>
                  <p className="muted">{ticketDetail?.subject || selectedTicket.subject || 'Sem assunto'}</p>
                </div>
                <div className="ch-ticket-detail-header__actions">
                  {!isOpenSubPage && (
                    <>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleGoToPrevTicket}
                        disabled={!canGoToPrevTicket}
                        title="Anterior (seta para esquerda)"
                      >
                        ◀ Anterior
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleGoToNextTicket}
                        disabled={!canGoToNextTicket}
                        title="Próximo (seta para direita)"
                      >
                        Próximo ▶
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={closeTicketModal}
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {isLoadingTicketDetail ? (
                <div className="ch-ticket-detail-state">
                  <p className="muted">Carregando detalhes do chamado...</p>
                </div>
              ) : ticketDetailError ? (
                <div className="ch-ticket-detail-state">
                  <p className="error">{ticketDetailError}</p>
                </div>
              ) : ticketDetail ? (
                <div className="ch-ticket-detail-layout">
                  <div className="ch-ticket-detail-main">
                    {detailTimeline.map((item) => (
                      <article key={item.id} className="ch-ticket-entry">
                        <div className="ch-ticket-entry__avatar" aria-hidden="true">
                          {item.sender.slice(0, 1).toUpperCase() || '?'}
                        </div>
                        <div className="ch-ticket-entry__content">
                          <div className="ch-ticket-entry__meta">
                            <div>
                              <strong>{item.sender}</strong>
                              <span>{item.senderType === 'A' ? 'Atendente' : 'Solicitante'}</span>
                            </div>
                            <time dateTime={item.date || undefined}>{formatDateTime(item.date)}</time>
                          </div>
                          {item.message ? (
                            <div
                              className="ch-ticket-entry__message"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.message) }}
                            />
                          ) : (
                            <p className="muted ch-ticket-detail__empty">Sem mensagem registrada.</p>
                          )}
                          {item.attachments.length > 0 && (
                            <div className="ch-ticket-entry__attachments">
                              <h4>Anexos</h4>
                              {renderAttachmentList(item.attachments)}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}

                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Histórico de Status</h4>
                      </div>
                      {ticketDetail.statusHistory.length === 0 ? (
                        <p className="muted ch-ticket-detail__empty">Nenhuma alteração de status informada.</p>
                      ) : (
                        <ul className="ch-ticket-status-list">
                          {ticketDetail.statusHistory.map((status) => (
                            <li key={`${status.id || status.description}-${status.applyDate}`}>
                              <div>
                                <strong>{status.description || 'Status'}</strong>
                                <span>{formatDateTime(status.applyDate)}</span>
                              </div>
                              {(status.start || status.end) && (
                                <p>
                                  {status.start ? `Início: ${status.start.operatorName || '—'} em ${formatDateTime(status.start.date)}` : ''}
                                  {status.start && status.end ? ' • ' : ''}
                                  {status.end ? `Fim: ${status.end.operatorName || '—'} em ${formatDateTime(status.end.date)}` : ''}
                                </p>
                              )}
                              {status.message && <p>{status.message}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {isOpenSubPage && (
                      <section className="ch-ticket-detail-card">
                        <div className="ch-ticket-detail-card__header">
                          <h4>Responder Chamado</h4>
                        </div>

                        <div className="ch-ticket-reply-composer">
                          <RichTextEditor
                            value={replyBody}
                            onChange={(html) => {
                              setReplyBody(html)
                              setReplyError(null)
                              setReplySuccess(null)
                            }}
                            placeholder="Insira aqui a resposta do seu chamado"
                            rows={8}
                          />

                          <div className="ch-ticket-reply-actions">
                            <label className="button-secondary ch-ticket-attach-btn">
                              <input
                                type="file"
                                multiple
                                onChange={handleReplyFilesChange}
                                disabled={isSubmittingReply}
                                style={{ display: 'none' }}
                              />
                              {isSubmittingReply ? 'Enviando...' : 'Anexar arquivos'}
                            </label>
                            <button
                              type="button"
                              className="button-primary"
                              onClick={() => void handleReplySubmit()}
                              disabled={isSubmittingReply}
                            >
                              {isSubmittingReply ? 'Enviando...' : 'Responder'}
                            </button>
                          </div>

                          {replyAttachments.length > 0 && (
                            <ul className="ch-ticket-reply-files">
                              {replyAttachments.map((item) => (
                                <li key={item.id}>
                                  <span>{item.file.name}</span>
                                  <button
                                    type="button"
                                    className="ch-ticket-file-remove"
                                    onClick={() => handleRemoveReplyAttachment(item.id)}
                                    aria-label={`Remover arquivo ${item.file.name}`}
                                  >
                                    Remover
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {replyError && <p className="error" style={{ margin: 0 }}>{replyError}</p>}
                          {replySuccess && <p className="success" style={{ margin: 0 }}>{replySuccess}</p>}
                        </div>
                      </section>
                    )}

                  </div>

                  <aside className="ch-ticket-detail-sidebar">
                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Cliente</h4>
                      </div>
                      <dl className="ch-ticket-detail-facts">
                        <div>
                          <dt>Cliente</dt>
                          <dd>{ticketDetail.customerName || '—'}</dd>
                        </div>
                        <div>
                          <dt>Organização</dt>
                          <dd>{ticketDetail.organizationName || '—'}</dd>
                        </div>
                        <div>
                          <dt>E-mail</dt>
                          <dd>{ticketDetail.customerEmail || '—'}</dd>
                        </div>
                        <div>
                          <dt>ID Cliente</dt>
                          <dd>{ticketDetail.customerId || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Informações do Chamado</h4>
                      </div>
                      <dl className="ch-ticket-detail-facts">
                        <div>
                          <dt>Responsável</dt>
                          <dd>{ticketDetail.operatorName || '—'}</dd>
                        </div>
                        <div>
                          <dt>Departamento</dt>
                          <dd>{ticketDetail.departmentName || selectedTicket.department || '—'}</dd>
                        </div>
                        <div>
                          <dt>Categoria</dt>
                          <dd>{ticketDetail.categoryName || '—'}</dd>
                        </div>
                        <div>
                          <dt>Prioridade</dt>
                          <dd>{ticketDetail.priority || '—'}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{ticketDetail.situationDescription || selectedTicket.situation || selectedTicket.status || '—'}</dd>
                        </div>
                        <div>
                          <dt>Tipo</dt>
                          <dd>{ticketDetail.ticketType || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Informações de Abertura</h4>
                      </div>
                      <dl className="ch-ticket-detail-facts">
                        <div>
                          <dt>Criado em</dt>
                          <dd>{formatDateTime(ticketDetail.creationDate)}</dd>
                        </div>
                        <div>
                          <dt>Primeira resposta</dt>
                          <dd>{formatDateTime(ticketDetail.firstReplyDate)}</dd>
                        </div>
                        <div>
                          <dt>Agendado para</dt>
                          <dd>{formatDateTime(ticketDetail.scheduleDate)}</dd>
                        </div>
                        <div>
                          <dt>Finalizado em</dt>
                          <dd>{formatDateTime(ticketDetail.endDate)}</dd>
                        </div>
                        <div>
                          <dt>Situação aplicada em</dt>
                          <dd>{formatDateTime(ticketDetail.situationApplyDate)}</dd>
                        </div>
                        <div>
                          <dt>Chamado pai</dt>
                          <dd>{ticketDetail.parentTicketId || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Tempo e Avaliação</h4>
                      </div>
                      <dl className="ch-ticket-detail-facts">
                        <div>
                          <dt>Tempo trabalhado</dt>
                          <dd>{formatDuration(ticketDetail.workTimeSeconds)}</dd>
                        </div>
                        <div>
                          <dt>Tempo decorrido</dt>
                          <dd>{formatDuration(ticketDetail.elapsedTimeSeconds)}</dd>
                        </div>
                        <div>
                          <dt>Custo final</dt>
                          <dd>{formatCurrency(ticketDetail.costTotalFinal)}</dd>
                        </div>
                        <div>
                          <dt>Nota</dt>
                          <dd>{ticketDetail.evaluationGrade || '—'}</dd>
                        </div>
                        <div>
                          <dt>Problema resolvido</dt>
                          <dd>{ticketDetail.evaluationSolved || 'Não informado'}</dd>
                        </div>
                        <div>
                          <dt>WhatsApp ativo</dt>
                          <dd>{ticketDetail.activeWhatsapp ? 'Sim' : 'Não'}</dd>
                        </div>
                        <div>
                          <dt>Fechado por inatividade</dt>
                          <dd>{ticketDetail.closedByInactivity ? 'Sim' : 'Não'}</dd>
                        </div>
                        <div>
                          <dt>Reaberto</dt>
                          <dd>{ticketDetail.reopened ? 'Sim' : 'Não'}</dd>
                        </div>
                      </dl>
                      {ticketDetail.evaluationComment && (
                        <div className="ch-ticket-detail-note">
                          <strong>Comentário da avaliação</strong>
                          <p>{ticketDetail.evaluationComment}</p>
                        </div>
                      )}
                    </section>

                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Anexos do Chamado</h4>
                      </div>
                      {renderAttachmentList(ticketDetail.attachments)}
                    </section>

                    <section className="ch-ticket-detail-card">
                      <div className="ch-ticket-detail-card__header">
                        <h4>Campos Personalizados</h4>
                      </div>
                      <div className="ch-ticket-detail-field-group">
                        <h5>Abertura</h5>
                        {renderCustomFieldList(ticketDetail.customOpenFields)}
                      </div>
                      <div className="ch-ticket-detail-field-group">
                        <h5>Fechamento</h5>
                        {renderCustomFieldList(ticketDetail.customClosedFields)}
                      </div>
                      <div className="ch-ticket-detail-field-group">
                        <h5>Avaliação</h5>
                        {renderCustomFieldList(ticketDetail.customEvaluationFields)}
                      </div>
                    </section>
                  </aside>
                </div>
              ) : null}
            </section>
          </div>,
          document.body
        )}
      </div>
    )
  }

  if (subPage === 'admin' && !isVisitor) {
    return (
      <section className="card">
        <h2>Acesso restrito</h2>
        <p className="muted">A página de Administração é acessível somente ao usuário visitor.</p>
      </section>
    )
  }

  return (
    <div className="ticket-hub-tool">
      {success && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #2f8f74' }}>
          <p className="success" style={{ margin: 0 }}>{success}</p>
        </div>
      )}

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 320px' }}>
            Usuário da aplicação
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              style={{ marginTop: '0.4rem' }}
              disabled={!!editingUser}
            >
              <option value="">Selecione um usuário existente</option>
              {appUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {(user.displayName || user.username)} {user.displayName ? `(${user.username})` : ''}{user.hasTicketHubAccess ? ' • já possui acesso' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={handleStartAccessRegistration}
            disabled={!selectedUserId || !!editingUser}
          >
            {selectedAppUser?.hasTicketHubAccess ? 'Gerenciar acesso' : 'Cadastrar acesso'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void handleRefreshAdmin()}
            disabled={isRefreshingAdmin || isLoadingUsers || isLoadingOrgs || isSaving}
          >
            {isRefreshingAdmin ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
          Selecione um usuário já cadastrado na aplicação para conceder ou ajustar o acesso à Central de Chamados.
        </p>
      </section>

      {editingUser && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>
            {users.some((user) => user.id === editingUser.id) ? 'Organizações de ' : 'Cadastrar acesso para '}
            {editingUser.displayName || editingUser.username}
            <span
              style={{
                marginLeft: '0.75rem',
                fontSize: '0.8rem',
                fontWeight: 400,
                padding: '0.2rem 0.6rem',
                borderRadius: '0.25rem',
                backgroundColor: editingUser.isActive ? '#dbeafe' : '#fee2e2',
                color: editingUser.isActive ? '#0c4a6e' : '#7f1d1d',
              }}
            >
              {editingUser.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </h2>

          {isLoadingOrgs ? (
            <p className="muted">Carregando organizações...</p>
          ) : orgError ? (
            <p className="error">{orgError}</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="toggle-all-orgs"
                  checked={organizations.length > 0 && organizations.every((o) => draftOrgs.includes(o.id))}
                  onChange={handleToggleAllOrgs}
                />
                <label htmlFor="toggle-all-orgs" style={{ margin: 0, cursor: 'pointer', fontWeight: 500 }}>
                  Selecionar todas as organizações
                </label>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.5rem',
                  marginBottom: '1.25rem',
                }}
              >
                {organizations.map((org) => (
                  <label
                    key={org.id}
                    className="checkbox"
                    style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={draftOrgs.includes(org.id)}
                      onChange={() => handleToggleOrg(org.id)}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{org.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="button-primary"
              onClick={() => void handleSaveOrgs()}
              disabled={isSaving || isLoadingOrgs || !!orgError}
            >
              {isSaving ? 'Salvando...' : users.some((user) => user.id === editingUser.id) ? 'Salvar organizações' : 'Cadastrar acesso'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Usuários com acesso à Central de Chamados</h2>
          <input
            type="search"
            placeholder="Filtrar por usuário ou nome"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            style={{ minWidth: '220px' }}
          />
        </div>

        {usersError && <p className="error">{usersError}</p>}

        {isLoadingUsers ? (
          <p className="muted">Carregando usuários...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="muted">
            {users.length === 0
              ? 'Nenhum usuário com acesso cadastrado na Central de Chamados.'
              : 'Nenhum usuário encontrado para o filtro informado.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontWeight: 600, fontSize: '0.875rem' }}>Usuário</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontWeight: 600, fontSize: '0.875rem' }}>Nome</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontWeight: 600, fontSize: '0.875rem' }}>Organizações</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', fontWeight: 600, fontSize: '0.875rem' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{user.username}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{user.displayName || '—'}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          backgroundColor: user.isActive ? '#dcfce7' : '#fee2e2',
                          color: user.isActive ? '#166534' : '#7f1d1d',
                        }}
                      >
                        {user.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {user.ticketOrganizations.length === 0 ? (
                        <em>Nenhuma organização</em>
                      ) : (
                        <span title={user.ticketOrganizations.join(', ')}>
                          {user.ticketOrganizations.length} organização{user.ticketOrganizations.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => handleStartEdit(user)}
                        style={{ fontSize: '0.875rem', padding: '0.3rem 0.75rem' }}
                        disabled={!!editingUser}
                      >
                        Editar organizações
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!isLoadingOrgs && !orgError && organizations.length > 0 && (
        <section className="card" style={{ marginTop: '1.5rem' }}>
          <h2>Organizações disponíveis no TomTicket ({organizations.length})</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {organizations.map((org) => (
              <div
                key={org.id}
                style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  backgroundColor: '#f9fafb',
                }}
              >
                <p style={{ fontWeight: 500, margin: '0 0 0.25rem' }}>{org.name}</p>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>ID: {org.id}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
