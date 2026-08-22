import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { apiUrl } from '../lib/api'
import RichTextEditor from './RichTextEditor'
import AtendimentoReportsTool from './AtendimentoReportsTool'

export type CentralServicosPage = 'dashboard' | 'agenda' | 'atendimentos' | 'recursos' | 'contratos-servicos' | 'despesas' | 'faturamento' | 'pagamentos'

type ApiListResponse = {
  items?: unknown[]
}

type ResourceStatus = 'Ativo' | 'Inativo' | 'Bloqueado'
type RelationType = 'Cliente' | 'Recurso'
type ContractType = 'Recorrente' | 'Banco de Horas' | 'Delivery' | 'Projeto'
type ValueType = 'Hora' | 'Valor' | 'Tarefa'
type ExpenseType = 'Fixa' | 'Avulsa'
type InvoiceStatus = 'Pendente' | 'Faturado' | 'Pago'
type PaymentStatus = 'Pendente' | 'Pago'
type SortDirection = 'asc' | 'desc'
type ResourceSortKey = 'nome' | 'cpf' | 'cnpj' | 'sexo' | 'status'
type ContractSortKey = 'titulo' | 'tipo' | 'relaciona' | 'tipoContrato' | 'valorUnitario' | 'status'
type ExpenseSortKey = 'titulo' | 'tipo' | 'relaciona' | 'tipoDespesa' | 'valorUnitario'
type InvoiceSortKey = 'titulo' | 'nota' | 'cliente' | 'contrato' | 'emissao' | 'valor' | 'status'
type InvoiceExportFilters = {
  clientes: string[]
  contratos: string[]
  emissaoDe: string
  emissaoAte: string
  previsaoDe: string
  previsaoAte: string
}
type PaymentSortKey = 'titulo' | 'tipo' | 'relaciona' | 'contrato' | 'emissao' | 'previsaoPagamento' | 'valor' | 'status'
type PaymentExportFilters = {
  recursos: string[]
  contratos: string[]
  emissaoDe: string
  emissaoAte: string
  previsaoDe: string
  previsaoAte: string
}
type AgendaDedicacao = 'Full' | 'Parcial' | 'Avulsa' | 'Parcial + Avulsa'
type AgendaStatus = 'Ativo' | 'Encerrado'
type AgendaWeekDay = 'SEG' | 'TER' | 'QUA' | 'QUI' | 'SEX' | 'SAB' | 'DOM'
type AgendaSortKey = 'recurso' | 'cliente' | 'dedicacao' | 'vigenciaInicio' | 'status'
type AgendaViewMode = 'grade' | 'calendario' | 'lista'
type AgendaTooltip = { content: string; top: number; left: number }
type CentralServicosResourceScope = 'all' | 'self'

type CentralServicosToolProps = {
  subPage: CentralServicosPage
  currentUsername?: string
  currentDisplayName?: string
  resourceScope?: CentralServicosResourceScope
}

type ResourceItem = {
  id: number
  nome: string
  cpf: string
  cnpj: string
  sexo: string
  dataNascimento: string
  emailPessoal: string
  dadosPagamento: string
  status: ResourceStatus
}

type ResourceForm = {
  nome: string
  cpf: string
  cnpj: string
  sexo: string
  dataNascimento: string
  emailPessoal: string
  dadosPagamento: string
  status: ResourceStatus
}

type ContractItem = {
  id: number
  contratoBaseId: number
  versao: number
  titulo: string
  tipo: RelationType
  relaciona: string
  descricao: string
  tipoContrato: ContractType
  valorUnitario: number | null
  tipoValor: ValueType
  quantidade: number | null
  saldoQuantidade: number | null
  saldoValor: number | null
  dataInicio: string
  vigenciaInicio: string
  vigenciaTermino: string
  observacoes: string
  faturamentoCorpoNota: string
  faturamentoDocumentos: string
  faturamentoPrazoEmissao: string
  faturamentoDataVencimento: string
  faturamentoCodigoServico: string
  status: 'Ativo' | 'Encerrado'
}

type ContractForm = {
  titulo: string
  tipo: RelationType
  relaciona: string
  descricao: string
  tipoContrato: ContractType
  valorUnitario: string
  tipoValor: ValueType
  quantidade: string
  saldoQuantidade: string
  saldoValor: string
  dataInicio: string
  vigenciaInicio: string
  vigenciaTermino: string
  observacoes: string
  faturamentoCorpoNota: string
  faturamentoDocumentos: string
  faturamentoPrazoEmissao: string
  faturamentoDataVencimento: string
  faturamentoCodigoServico: string
  status: 'Ativo' | 'Encerrado'
}

type ExpenseItem = {
  id: number
  titulo: string
  tipo: RelationType
  relaciona: string
  descricao: string
  tipoDespesa: ExpenseType
  valorUnitario: number | null
  tipoValor: ValueType
  quantidade: number | null
  dataInicio: string
  vigenciaInicio: string
  vigenciaTermino: string
  observacoes: string
}

type ExpenseForm = {
  titulo: string
  tipo: RelationType
  relaciona: string
  descricao: string
  tipoDespesa: ExpenseType
  valorUnitario: string
  tipoValor: ValueType
  quantidade: string
  dataInicio: string
  vigenciaInicio: string
  vigenciaTermino: string
  observacoes: string
}

type InvoiceItem = {
  id: number
  contratoId: number | null
  titulo: string
  nota: string
  emissao: string
  referencia: string
  previsaoPagamento: string
  cliente: string
  contrato: string
  descricao: string
  quantidade: number | null
  valor: number | null
  status: InvoiceStatus
  dataPagamento: string
}

type InvoiceForm = {
  contratoId: string
  titulo: string
  nota: string
  emissao: string
  referencia: string
  previsaoPagamento: string
  cliente: string
  contrato: string
  descricao: string
  quantidade: string
  valor: string
  status: InvoiceStatus
  dataPagamento: string
}

type PaymentItem = {
  id: number
  titulo: string
  nota: string
  emissao: string
  referencia: string
  previsaoPagamento: string
  tipo: RelationType
  relaciona: string
  contrato: string
  descricao: string
  valor: number | null
  status: PaymentStatus
  dataPagamento: string
}

type PaymentForm = {
  titulo: string
  nota: string
  emissao: string
  referencia: string
  previsaoPagamento: string
  tipo: RelationType
  relaciona: string
  contrato: string
  descricao: string
  valor: string
  status: PaymentStatus
  dataPagamento: string
}

type AgendaItem = {
  id: number
  recurso: string
  cliente: string
  contratoId: number | null
  contrato: string
  dedicacao: AgendaDedicacao
  diasSemana: AgendaWeekDay[]
  datasAvulsas: string[]
  vigenciaInicio: string
  vigenciaTermino: string
  observacoes: string
  status: AgendaStatus
}

type AgendaForm = {
  recurso: string
  cliente: string
  contratoId: string
  contrato: string
  dedicacao: AgendaDedicacao
  diasSemana: AgendaWeekDay[]
  datasAvulsas: string[]
  dataAvulsaInput: string
  vigenciaInicio: string
  vigenciaTermino: string
  observacoes: string
  status: AgendaStatus
}

const EMPTY_RESOURCE_FORM: ResourceForm = {
  nome: '',
  cpf: '',
  cnpj: '',
  sexo: 'Nao Informado',
  dataNascimento: '',
  emailPessoal: '',
  dadosPagamento: '',
  status: 'Ativo',
}

const EMPTY_CONTRACT_FORM: ContractForm = {
  titulo: '',
  tipo: 'Cliente',
  relaciona: '',
  descricao: '',
  tipoContrato: 'Recorrente',
  valorUnitario: '',
  tipoValor: 'Hora',
  quantidade: '',
  saldoQuantidade: '',
  saldoValor: '',
  dataInicio: '',
  vigenciaInicio: '',
  vigenciaTermino: '',
  observacoes: '',
  faturamentoCorpoNota: '',
  faturamentoDocumentos: '',
  faturamentoPrazoEmissao: '',
  faturamentoDataVencimento: '',
  faturamentoCodigoServico: '',
  status: 'Ativo',
}

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  titulo: '',
  tipo: 'Cliente',
  relaciona: '',
  descricao: '',
  tipoDespesa: 'Fixa',
  valorUnitario: '',
  tipoValor: 'Hora',
  quantidade: '',
  dataInicio: '',
  vigenciaInicio: '',
  vigenciaTermino: '',
  observacoes: '',
}

const EMPTY_INVOICE_FORM: InvoiceForm = {
  contratoId: '',
  titulo: '',
  nota: '',
  emissao: '',
  referencia: '',
  previsaoPagamento: '',
  cliente: '',
  contrato: '',
  descricao: '',
  quantidade: '',
  valor: '',
  status: 'Pendente',
  dataPagamento: '',
}

const EMPTY_PAYMENT_FORM: PaymentForm = {
  titulo: '',
  nota: '',
  emissao: '',
  referencia: '',
  previsaoPagamento: '',
  tipo: 'Cliente',
  relaciona: '',
  contrato: '',
  descricao: '',
  valor: '',
  status: 'Pendente',
  dataPagamento: '',
}

const EMPTY_PAYMENT_EXPORT_FILTERS: PaymentExportFilters = {
  recursos: [],
  contratos: [],
  emissaoDe: '',
  emissaoAte: '',
  previsaoDe: '',
  previsaoAte: '',
}

const EMPTY_INVOICE_EXPORT_FILTERS: InvoiceExportFilters = {
  clientes: [],
  contratos: [],
  emissaoDe: '',
  emissaoAte: '',
  previsaoDe: '',
  previsaoAte: '',
}

const EMPTY_AGENDA_FORM: AgendaForm = {
  recurso: '',
  cliente: '',
  contratoId: '',
  contrato: '',
  dedicacao: 'Full',
  diasSemana: [],
  datasAvulsas: [],
  dataAvulsaInput: '',
  vigenciaInicio: '',
  vigenciaTermino: '',
  observacoes: '',
  status: 'Ativo',
}

const RESOURCE_SEX_OPTIONS = ['Nao Informado', 'Masculino', 'Feminino', 'Outro'] as const
const RESOURCE_STATUS_OPTIONS: ResourceStatus[] = ['Ativo', 'Inativo', 'Bloqueado']
const RELATION_TYPE_OPTIONS: RelationType[] = ['Cliente', 'Recurso']
const CONTRACT_TYPE_OPTIONS: ContractType[] = ['Recorrente', 'Banco de Horas', 'Delivery', 'Projeto']
const VALUE_TYPE_OPTIONS: ValueType[] = ['Hora', 'Valor', 'Tarefa']
const EXPENSE_TYPE_OPTIONS: ExpenseType[] = ['Fixa', 'Avulsa']
const INVOICE_STATUS_OPTIONS: InvoiceStatus[] = ['Pendente', 'Faturado', 'Pago']
const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ['Pendente', 'Pago']
const AGENDA_DEDICACAO_OPTIONS: AgendaDedicacao[] = ['Full', 'Parcial', 'Avulsa', 'Parcial + Avulsa']
const AGENDA_STATUS_OPTIONS: AgendaStatus[] = ['Ativo', 'Encerrado']
const AGENDA_WEEK_DAYS: Array<{ key: AgendaWeekDay; label: string }> = [
  { key: 'SEG', label: 'Segunda' },
  { key: 'TER', label: 'Terça' },
  { key: 'QUA', label: 'Quarta' },
  { key: 'QUI', label: 'Quinta' },
  { key: 'SEX', label: 'Sexta' },
]
const AGENDA_FULL_WEEK_DAYS: AgendaWeekDay[] = AGENDA_WEEK_DAYS.map((day) => day.key)
const AGENDA_ALL_WEEK_DAYS: AgendaWeekDay[] = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']
const RESOURCE_DEFAULT_SORT: { key: ResourceSortKey; direction: SortDirection } = { key: 'nome', direction: 'asc' }
const CONTRACT_DEFAULT_SORT: { key: ContractSortKey; direction: SortDirection } = { key: 'titulo', direction: 'asc' }
const EXPENSE_DEFAULT_SORT: { key: ExpenseSortKey; direction: SortDirection } = { key: 'titulo', direction: 'asc' }
const INVOICE_DEFAULT_SORT: { key: InvoiceSortKey; direction: SortDirection } = { key: 'emissao', direction: 'desc' }
const PAYMENT_DEFAULT_SORT: { key: PaymentSortKey; direction: SortDirection } = { key: 'emissao', direction: 'desc' }
const AGENDA_DEFAULT_SORT: { key: AgendaSortKey; direction: SortDirection } = { key: 'recurso', direction: 'asc' }

const PAGE_META: Record<CentralServicosPage, { title: string; description: string; emptyLabel: string; searchPlaceholder: string }> = {
  dashboard: {
    title: 'Dashboard de Faturamento',
    description: 'Acompanhe indicadores de faturamento, status e evolução mensal.',
    emptyLabel: 'Faturamento',
    searchPlaceholder: 'Buscar por título, cliente, contrato ou status',
  },
  recursos: {
    title: 'Cadastro de Recursos',
    description: 'Cadastre recursos com dados pessoais, documentação, e-mail e status operacional.',
    emptyLabel: 'Recurso',
    searchPlaceholder: 'Buscar por nome, CPF, CNPJ ou e-mail',
  },
  agenda: {
    title: 'Calendário de Apontamento e Produtividade',
    description: 'Visualize de forma centralizada as agendas programadas e a disponibilidade dos recursos, evitando conflitos de alocação.',
    emptyLabel: 'Planejamento',
    searchPlaceholder: 'Buscar por recurso, cliente ou status',
  },
  atendimentos: {
    title: 'Atendimentos',
    description: 'Registre e acompanhe os atendimentos prestados aos clientes, com editor de texto rico para descrições e observações.',
    emptyLabel: 'Atendimento',
    searchPlaceholder: 'Buscar por número, cliente, solicitante ou descrição',
  },
  'contratos-servicos': {
    title: 'Cadastro de Contratos e Serviços',
    description: 'Registre contratos, vínculos com cliente ou recurso, valores, vigência e observações.',
    emptyLabel: 'Contrato',
    searchPlaceholder: 'Buscar por título, relação, tipo ou status',
  },
  despesas: {
    title: 'Cadastro de Despesa',
    description: 'Controle despesas fixas ou avulsas vinculadas a cliente ou recurso.',
    emptyLabel: 'Despesa',
    searchPlaceholder: 'Buscar por título, relação, tipo ou observações',
  },
  faturamento: {
    title: 'Cadastro de Faturamento',
    description: 'Consolide notas, emissões, previsões de pagamento e status de faturamento.',
    emptyLabel: 'Faturamento',
    searchPlaceholder: 'Buscar por título, cliente, contrato ou status',
  },
  pagamentos: {
    title: 'Cadastro de Pagamentos',
    description: 'Organize pagamentos previstos e realizados para cliente ou recurso vinculado ao contrato.',
    emptyLabel: 'Pagamento',
    searchPlaceholder: 'Buscar por título, tipo, contrato ou status',
  },
}

function readApiError(response: Response, fallback: string): Promise<never> {
  return response
    .json()
    .then((payload) => {
      const detail = (payload as { error?: string })?.error ?? fallback
      throw new Error(detail)
    })
    .catch(() => {
      throw new Error(response.statusText || fallback)
    })
}

function formatDateDisplay(value: string): string {
  const text = String(value || '').trim()
  if (!text) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-')
    return `${day}/${month}/${year}`
  }
  return text
}

function formatCurrencyDisplay(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseNullableDate(value: string): string | null {
  const text = String(value || '').trim()
  return text || null
}

function parseNullableNumber(value: string): number | null {
  const text = String(value || '').trim().replace(',', '.')
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMonthKeyLabel(value: string): string {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})$/)
  if (!match) return text || '-'
  const [, year, month] = match
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a - b
}

function toSortableDate(value: string): number {
  const text = String(value || '').trim()
  if (!text) return Number.NEGATIVE_INFINITY
  if (/^\d{4}-\d{2}$/.test(text)) {
    const asMonth = `${text}-01`
    const stamp = Date.parse(asMonth)
    return Number.isFinite(stamp) ? stamp : Number.NEGATIVE_INFINITY
  }
  const stamp = Date.parse(text)
  return Number.isFinite(stamp) ? stamp : Number.NEGATIVE_INFINITY
}

function applyDirection(result: number, direction: SortDirection): number {
  return direction === 'asc' ? result : -result
}

function getNextDirection(currentKey: string, nextKey: string, currentDirection: SortDirection): SortDirection {
  if (currentKey !== nextKey) return 'asc'
  return currentDirection === 'asc' ? 'desc' : 'asc'
}

function formatCurrencyInputBrl(rawValue: string): string {
  const text = String(rawValue || '').trim()
  if (!text) return ''
  const numeric = Number(text.replace(',', '.'))
  if (!Number.isFinite(numeric)) return ''
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseCurrencyInputBrl(maskedValue: string): string {
  const digits = String(maskedValue || '').replace(/\D/g, '')
  if (!digits) return ''
  const numeric = Number(digits) / 100
  return numeric.toFixed(2)
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeResource(input: unknown): ResourceItem | null {
  const item = input as Partial<ResourceItem>
  const id = Number(item.id)
  const nome = normalizeText(item.nome)
  if (!Number.isFinite(id) || id <= 0 || !nome) return null

  return {
    id,
    nome,
    cpf: normalizeText(item.cpf),
    cnpj: normalizeText(item.cnpj),
    sexo: RESOURCE_SEX_OPTIONS.includes(normalizeText(item.sexo) as typeof RESOURCE_SEX_OPTIONS[number]) ? normalizeText(item.sexo) : 'Nao Informado',
    dataNascimento: normalizeText(item.dataNascimento ?? (item as { data_nascimento?: unknown }).data_nascimento),
    emailPessoal: normalizeText(item.emailPessoal ?? (item as { email_pessoal?: unknown }).email_pessoal),
    dadosPagamento: normalizeText(item.dadosPagamento ?? (item as { dados_pagamento?: unknown }).dados_pagamento),
    status: RESOURCE_STATUS_OPTIONS.includes(normalizeText(item.status) as ResourceStatus) ? normalizeText(item.status) as ResourceStatus : 'Ativo',
  }
}

function normalizeContract(input: unknown): ContractItem | null {
  const item = input as Partial<ContractItem>
  const id = Number(item.id)
  const titulo = normalizeText(item.titulo)
  if (!Number.isFinite(id) || id <= 0 || !titulo) return null

  return {
    id,
    contratoBaseId: Number(item.contratoBaseId ?? (item as { contrato_base_id?: unknown }).contrato_base_id) || id,
    versao: Number(item.versao) > 0 ? Number(item.versao) : 1,
    titulo,
    tipo: RELATION_TYPE_OPTIONS.includes(normalizeText(item.tipo) as RelationType) ? normalizeText(item.tipo) as RelationType : 'Cliente',
    relaciona: normalizeText(item.relaciona),
    descricao: normalizeText(item.descricao),
    tipoContrato: CONTRACT_TYPE_OPTIONS.includes(normalizeText(item.tipoContrato) as ContractType)
      ? normalizeText(item.tipoContrato) as ContractType
      : 'Recorrente',
    valorUnitario: parseNullableNumber(normalizeText(item.valorUnitario ?? (item as { valor_unitario?: unknown }).valor_unitario)),
    tipoValor: VALUE_TYPE_OPTIONS.includes(normalizeText(item.tipoValor) as ValueType)
      ? normalizeText(item.tipoValor) as ValueType
      : 'Hora',
    quantidade: parseNullableNumber(normalizeText(item.quantidade)),
    saldoQuantidade: parseNullableNumber(normalizeText(item.saldoQuantidade ?? (item as { saldo_quantidade?: unknown }).saldo_quantidade)),
    saldoValor: parseNullableNumber(normalizeText(item.saldoValor ?? (item as { saldo_valor?: unknown }).saldo_valor)),
    dataInicio: normalizeText(item.dataInicio ?? (item as { data_inicio?: unknown }).data_inicio),
    vigenciaInicio: normalizeText(item.vigenciaInicio ?? (item as { vigencia_inicio?: unknown }).vigencia_inicio),
    vigenciaTermino: normalizeText(item.vigenciaTermino ?? (item as { vigencia_termino?: unknown }).vigencia_termino),
    observacoes: normalizeText(item.observacoes),
    faturamentoCorpoNota: normalizeText(item.faturamentoCorpoNota),
    faturamentoDocumentos: normalizeText(item.faturamentoDocumentos),
    faturamentoPrazoEmissao: normalizeText(item.faturamentoPrazoEmissao),
    faturamentoDataVencimento: normalizeText(item.faturamentoDataVencimento),
    faturamentoCodigoServico: normalizeText(item.faturamentoCodigoServico),
    status: normalizeText(item.status) === 'Encerrado' ? 'Encerrado' : 'Ativo',
  }
}

function normalizeExpense(input: unknown): ExpenseItem | null {
  const item = input as Partial<ExpenseItem>
  const id = Number(item.id)
  const titulo = normalizeText(item.titulo)
  if (!Number.isFinite(id) || id <= 0 || !titulo) return null

  return {
    id,
    titulo,
    tipo: RELATION_TYPE_OPTIONS.includes(normalizeText(item.tipo) as RelationType) ? normalizeText(item.tipo) as RelationType : 'Cliente',
    relaciona: normalizeText(item.relaciona),
    descricao: normalizeText(item.descricao),
    tipoDespesa: EXPENSE_TYPE_OPTIONS.includes(normalizeText(item.tipoDespesa) as ExpenseType)
      ? normalizeText(item.tipoDespesa) as ExpenseType
      : 'Fixa',
    valorUnitario: parseNullableNumber(normalizeText(item.valorUnitario ?? (item as { valor_unitario?: unknown }).valor_unitario)),
    tipoValor: VALUE_TYPE_OPTIONS.includes(normalizeText(item.tipoValor) as ValueType)
      ? normalizeText(item.tipoValor) as ValueType
      : 'Hora',
    quantidade: parseNullableNumber(normalizeText(item.quantidade)),
    dataInicio: normalizeText(item.dataInicio ?? (item as { data_inicio?: unknown }).data_inicio),
    vigenciaInicio: normalizeText(item.vigenciaInicio ?? (item as { vigencia_inicio?: unknown }).vigencia_inicio),
    vigenciaTermino: normalizeText(item.vigenciaTermino ?? (item as { vigencia_termino?: unknown }).vigencia_termino),
    observacoes: normalizeText(item.observacoes),
  }
}

function normalizeInvoice(input: unknown): InvoiceItem | null {
  const item = input as Partial<InvoiceItem>
  const id = Number(item.id)
  const titulo = normalizeText(item.titulo)
  if (!Number.isFinite(id) || id <= 0 || !titulo) return null

  return {
    id,
    contratoId: Number(item.contratoId ?? (item as { contrato_id?: unknown }).contrato_id) || null,
    titulo,
    nota: normalizeText(item.nota),
    emissao: normalizeText(item.emissao),
    referencia: normalizeText(item.referencia),
    previsaoPagamento: normalizeText(item.previsaoPagamento ?? (item as { previsao_pagamento?: unknown }).previsao_pagamento),
    cliente: normalizeText(item.cliente),
    contrato: normalizeText(item.contrato),
    descricao: normalizeText(item.descricao),
    quantidade: parseNullableNumber(normalizeText(item.quantidade)),
    valor: parseNullableNumber(normalizeText(item.valor)),
    status: INVOICE_STATUS_OPTIONS.includes(normalizeText(item.status) as InvoiceStatus)
      ? normalizeText(item.status) as InvoiceStatus
      : 'Pendente',
    dataPagamento: normalizeText(item.dataPagamento ?? (item as { data_pagamento?: unknown }).data_pagamento),
  }
}

function normalizePayment(input: unknown): PaymentItem | null {
  const item = input as Partial<PaymentItem>
  const id = Number(item.id)
  const titulo = normalizeText(item.titulo)
  if (!Number.isFinite(id) || id <= 0 || !titulo) return null

  return {
    id,
    titulo,
    nota: normalizeText(item.nota),
    emissao: normalizeText(item.emissao),
    referencia: normalizeText(item.referencia),
    previsaoPagamento: normalizeText(item.previsaoPagamento ?? (item as { previsao_pagamento?: unknown }).previsao_pagamento),
    tipo: RELATION_TYPE_OPTIONS.includes(normalizeText(item.tipo) as RelationType) ? normalizeText(item.tipo) as RelationType : 'Cliente',
    relaciona: normalizeText((item as { relaciona?: unknown }).relaciona),
    contrato: normalizeText(item.contrato),
    descricao: normalizeText(item.descricao),
    valor: parseNullableNumber(normalizeText(item.valor)),
    status: PAYMENT_STATUS_OPTIONS.includes(normalizeText(item.status) as PaymentStatus)
      ? normalizeText(item.status) as PaymentStatus
      : 'Pendente',
    dataPagamento: normalizeText(item.dataPagamento ?? (item as { data_pagamento?: unknown }).data_pagamento),
  }
}

function normalizeAgenda(input: unknown): AgendaItem | null {
  const item = input as Partial<AgendaItem>
  const id = Number(item.id)
  const recurso = normalizeText(item.recurso)
  const cliente = normalizeText(item.cliente)
  if (!Number.isFinite(id) || id <= 0 || !recurso || !cliente) return null

  const rawDias = Array.isArray(item.diasSemana ?? (item as { dias_semana?: unknown }).dias_semana)
    ? (item.diasSemana ?? (item as { dias_semana?: unknown[] }).dias_semana) as unknown[]
    : []
  const rawDatasAvulsas = Array.isArray(item.datasAvulsas ?? (item as { datas_avulsas?: unknown }).datas_avulsas)
    ? (item.datasAvulsas ?? (item as { datas_avulsas?: unknown[] }).datas_avulsas) as unknown[]
    : []

  return {
    id,
    recurso,
    cliente,
    contratoId: Number(item.contratoId ?? (item as { contrato_id?: unknown }).contrato_id) || null,
    contrato: normalizeText(item.contrato),
    dedicacao: AGENDA_DEDICACAO_OPTIONS.includes(normalizeText(item.dedicacao) as AgendaDedicacao)
      ? normalizeText(item.dedicacao) as AgendaDedicacao
      : 'Full',
    diasSemana: rawDias
      .map((day) => normalizeText(day))
      .filter((day): day is AgendaWeekDay => AGENDA_ALL_WEEK_DAYS.includes(day as AgendaWeekDay)) as AgendaWeekDay[],
    datasAvulsas: Array.from(new Set(rawDatasAvulsas.map((date) => parseNullableDate(normalizeText(date))).filter((date): date is string => Boolean(date)))).sort(),
    vigenciaInicio: normalizeText(item.vigenciaInicio ?? (item as { vigencia_inicio?: unknown }).vigencia_inicio),
    vigenciaTermino: normalizeText(item.vigenciaTermino ?? (item as { vigencia_termino?: unknown }).vigencia_termino),
    observacoes: normalizeText(item.observacoes),
    status: AGENDA_STATUS_OPTIONS.includes(normalizeText(item.status) as AgendaStatus)
      ? normalizeText(item.status) as AgendaStatus
      : 'Ativo',
  }
}

function agendaVigenciasOverlap(a: AgendaItem, b: AgendaItem): boolean {
  const aStart = a.vigenciaInicio ? Date.parse(a.vigenciaInicio) : Number.NEGATIVE_INFINITY
  const aEnd = a.vigenciaTermino ? Date.parse(a.vigenciaTermino) : Number.POSITIVE_INFINITY
  const bStart = b.vigenciaInicio ? Date.parse(b.vigenciaInicio) : Number.NEGATIVE_INFINITY
  const bEnd = b.vigenciaTermino ? Date.parse(b.vigenciaTermino) : Number.POSITIVE_INFINITY
  return aStart <= bEnd && bStart <= aEnd
}

function getAgendaWeeklyDays(item: AgendaItem): AgendaWeekDay[] {
  if (item.dedicacao === 'Full') return AGENDA_FULL_WEEK_DAYS
  if (item.dedicacao === 'Parcial' || item.dedicacao === 'Parcial + Avulsa') return item.diasSemana
  return []
}

function getWeekDayFromDateKey(dateKey: string): AgendaWeekDay | null {
  const stamp = Date.parse(`${dateKey}T00:00:00`)
  if (Number.isNaN(stamp)) return null
  return AGENDA_ALL_WEEK_DAYS[(new Date(stamp).getDay() + 6) % 7] ?? null
}

function isDateInsideAgendaVigencia(item: AgendaItem, dateKey: string): boolean {
  if (item.vigenciaInicio && dateKey < item.vigenciaInicio) return false
  if (item.vigenciaTermino && dateKey > item.vigenciaTermino) return false
  return true
}

function isAgendaScheduledOnDateKey(item: AgendaItem, dateKey: string): boolean {
  if (item.status !== 'Ativo') return false
  if (!isDateInsideAgendaVigencia(item, dateKey)) return false
  if (item.datasAvulsas.includes(dateKey)) return true

  const weekDay = getWeekDayFromDateKey(dateKey)
  return weekDay ? getAgendaWeeklyDays(item).includes(weekDay) : false
}

function isAgendaScheduledOnWeekDay(item: AgendaItem, weekDay: AgendaWeekDay): boolean {
  return getAgendaWeeklyDays(item).includes(weekDay)
    || item.datasAvulsas.some((dateKey) => getWeekDayFromDateKey(dateKey) === weekDay)
}

function formatAgendaSchedule(item: AgendaItem): string {
  const weeklyDays = getAgendaWeeklyDays(item)
  const weeklyLabel = item.dedicacao === 'Full'
    ? 'Todos os dias úteis'
    : weeklyDays.length > 0
      ? weeklyDays.join(', ')
      : ''
  const specificDates = item.datasAvulsas.map((date) => formatDateDisplay(date)).join(', ')

  if (weeklyLabel && specificDates) return `${weeklyLabel}; Datas específicas: ${specificDates}`
  if (weeklyLabel) return weeklyLabel
  if (specificDates) return `Datas específicas: ${specificDates}`
  return '-'
}

function agendasHaveScheduleConflict(a: AgendaItem, b: AgendaItem): boolean {
  const weeklyDaysA = getAgendaWeeklyDays(a)
  const weeklyDaysB = getAgendaWeeklyDays(b)
  const hasWeeklyConflict = weeklyDaysA.length > 0
    && weeklyDaysB.length > 0
    && agendaVigenciasOverlap(a, b)
    && weeklyDaysA.some((day) => weeklyDaysB.includes(day))

  if (hasWeeklyConflict) return true

  return [...a.datasAvulsas, ...b.datasAvulsas].some((dateKey) => (
    isAgendaScheduledOnDateKey(a, dateKey) && isAgendaScheduledOnDateKey(b, dateKey)
  ))
}

function computeAgendaConflictIds(items: AgendaItem[]): Set<number> {
  const conflicts = new Set<number>()
  const activeItems = items.filter((item) => item.status === 'Ativo')

  for (let i = 0; i < activeItems.length; i += 1) {
    for (let j = i + 1; j < activeItems.length; j += 1) {
      const a = activeItems[i]
      const b = activeItems[j]
      if (a.recurso.toLowerCase() !== b.recurso.toLowerCase()) continue
      if (agendasHaveScheduleConflict(a, b)) {
        conflicts.add(a.id)
        conflicts.add(b.id)
      }
    }
  }

  return conflicts
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isAgendaScheduledOn(item: AgendaItem, date: Date): boolean {
  if (item.status !== 'Ativo') return false

  const dateKey = toDateKey(date)
  if (item.vigenciaInicio && dateKey < item.vigenciaInicio) return false
  if (item.vigenciaTermino && dateKey > item.vigenciaTermino) return false

  return isAgendaScheduledOnDateKey(item, dateKey)
}

function useCatalogState<TItem, TForm>(initial: TForm) {
  const [items, setItems] = useState<TItem[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<TForm>(initial)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  return {
    items,
    setItems,
    search,
    setSearch,
    form,
    setForm,
    editingId,
    setEditingId,
    isLoading,
    setIsLoading,
    isSaving,
    setIsSaving,
    error,
    setError,
    success,
    setSuccess,
  }
}

async function loadCatalogItems<T>(endpoint: string, normalize: (item: unknown) => T | null, init?: RequestInit): Promise<T[]> {
  const response = await fetch(apiUrl(endpoint), init)
  if (!response.ok) {
    await readApiError(response, 'Falha ao carregar registros.')
  }

  const data = await response.json() as ApiListResponse
  return Array.isArray(data.items) ? data.items.map(normalize).filter((item): item is T => Boolean(item)) : []
}

export default function CentralServicosTool({ subPage, currentUsername = '', currentDisplayName = '', resourceScope = 'all' }: CentralServicosToolProps) {
  const meta = PAGE_META[subPage]
  const currentResourceName = currentDisplayName.trim() || currentUsername.trim()
  const canViewAllResources = resourceScope !== 'self'
  const userHeaders = {
    'x-user': currentUsername.trim(),
    'x-user-display': currentDisplayName.trim(),
  }

  const resourceState = useCatalogState<ResourceItem, ResourceForm>(EMPTY_RESOURCE_FORM)
  const [resourceEditorOpen, setResourceEditorOpen] = useState(false)
  const [resourceIsViewMode, setResourceIsViewMode] = useState(false)
  const [resourceSort, setResourceSort] = useState<{ key: ResourceSortKey; direction: SortDirection }>(RESOURCE_DEFAULT_SORT)
  const contractState = useCatalogState<ContractItem, ContractForm>(EMPTY_CONTRACT_FORM)
  const [contractEditorOpen, setContractEditorOpen] = useState(false)
  const [contractIsViewMode, setContractIsViewMode] = useState(false)
  const [contractEditorTab, setContractEditorTab] = useState<'dados' | 'faturamento'>('dados')
  const [contractVersioningFromId, setContractVersioningFromId] = useState<number | null>(null)
  const [contractSort, setContractSort] = useState<{ key: ContractSortKey; direction: SortDirection }>(CONTRACT_DEFAULT_SORT)
  const expenseState = useCatalogState<ExpenseItem, ExpenseForm>(EMPTY_EXPENSE_FORM)
  const [expenseEditorOpen, setExpenseEditorOpen] = useState(false)
  const [expenseIsViewMode, setExpenseIsViewMode] = useState(false)
  const [expenseSort, setExpenseSort] = useState<{ key: ExpenseSortKey; direction: SortDirection }>(EXPENSE_DEFAULT_SORT)
  const invoiceState = useCatalogState<InvoiceItem, InvoiceForm>(EMPTY_INVOICE_FORM)
  const [invoiceEditorOpen, setInvoiceEditorOpen] = useState(false)
  const [invoiceIsViewMode, setInvoiceIsViewMode] = useState(false)
  const [invoiceSort, setInvoiceSort] = useState<{ key: InvoiceSortKey; direction: SortDirection }>(INVOICE_DEFAULT_SORT)
  const [invoiceExportOpen, setInvoiceExportOpen] = useState(false)
  const [invoiceExportFilters, setInvoiceExportFilters] = useState<InvoiceExportFilters>(EMPTY_INVOICE_EXPORT_FILTERS)
  const [invoiceExportClientDropdownOpen, setInvoiceExportClientDropdownOpen] = useState(false)
  const [invoiceExportContractDropdownOpen, setInvoiceExportContractDropdownOpen] = useState(false)
  const invoiceExportClientDropdownRef = useRef<HTMLDivElement | null>(null)
  const invoiceExportContractDropdownRef = useRef<HTMLDivElement | null>(null)
  const paymentState = useCatalogState<PaymentItem, PaymentForm>(EMPTY_PAYMENT_FORM)
  const [paymentEditorOpen, setPaymentEditorOpen] = useState(false)
  const [paymentIsViewMode, setPaymentIsViewMode] = useState(false)
  const [paymentSort, setPaymentSort] = useState<{ key: PaymentSortKey; direction: SortDirection }>(PAYMENT_DEFAULT_SORT)
  const [paymentExportOpen, setPaymentExportOpen] = useState(false)
  const [paymentExportFilters, setPaymentExportFilters] = useState<PaymentExportFilters>(EMPTY_PAYMENT_EXPORT_FILTERS)
  const [paymentExportResourceDropdownOpen, setPaymentExportResourceDropdownOpen] = useState(false)
  const [paymentExportContractDropdownOpen, setPaymentExportContractDropdownOpen] = useState(false)
  const paymentExportResourceDropdownRef = useRef<HTMLDivElement | null>(null)
  const paymentExportContractDropdownRef = useRef<HTMLDivElement | null>(null)
  const agendaState = useCatalogState<AgendaItem, AgendaForm>(EMPTY_AGENDA_FORM)
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false)
  const [agendaIsViewMode, setAgendaIsViewMode] = useState(false)
  const [agendaSort, setAgendaSort] = useState<{ key: AgendaSortKey; direction: SortDirection }>(AGENDA_DEFAULT_SORT)
  const [agendaViewMode, setAgendaViewMode] = useState<AgendaViewMode>('grade')
  const [agendaCalendarMonth, setAgendaCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [agendaTooltip, setAgendaTooltip] = useState<AgendaTooltip | null>(null)
  const [agendaResourceFilter, setAgendaResourceFilter] = useState<string[]>([])
  const [agendaResourceDropdownOpen, setAgendaResourceDropdownOpen] = useState(false)
  const agendaResourceDropdownRef = useRef<HTMLDivElement | null>(null)
  const [monthlyHoverIndex, setMonthlyHoverIndex] = useState<number | null>(null)
  const [competencyHoverIndex, setCompetencyHoverIndex] = useState<number | null>(null)
  const [competencyYear, setCompetencyYear] = useState<number | null>(null)
  const [clientOptions, setClientOptions] = useState<string[]>([])
  const [resourceOptions, setResourceOptions] = useState<string[]>([])
  const [contractsForLinking, setContractsForLinking] = useState<ContractItem[]>([])

  const renderSortableHeader = (
    label: string,
    isActive: boolean,
    direction: SortDirection,
    onClick: () => void,
  ) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        color: 'inherit',
        padding: 0,
        cursor: 'pointer',
      }}
      title={`Ordenar por ${label}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ opacity: isActive ? 1 : 0.45 }}>{isActive ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )

  const resetState = () => {
    resourceState.setItems([])
    resourceState.setSearch('')
    resourceState.setForm(EMPTY_RESOURCE_FORM)
    resourceState.setEditingId(null)
    setResourceEditorOpen(false)
    setResourceIsViewMode(false)
    setResourceSort(RESOURCE_DEFAULT_SORT)
    resourceState.setError(null)
    resourceState.setSuccess(null)
    contractState.setItems([])
    contractState.setSearch('')
    contractState.setForm(EMPTY_CONTRACT_FORM)
    contractState.setEditingId(null)
    setContractEditorOpen(false)
    setContractIsViewMode(false)
    setContractEditorTab('dados')
    setContractVersioningFromId(null)
    setContractSort(CONTRACT_DEFAULT_SORT)
    contractState.setError(null)
    contractState.setSuccess(null)
    expenseState.setItems([])
    expenseState.setSearch('')
    expenseState.setForm(EMPTY_EXPENSE_FORM)
    expenseState.setEditingId(null)
    setExpenseEditorOpen(false)
    setExpenseIsViewMode(false)
    setExpenseSort(EXPENSE_DEFAULT_SORT)
    expenseState.setError(null)
    expenseState.setSuccess(null)
    invoiceState.setItems([])
    invoiceState.setSearch('')
    invoiceState.setForm(EMPTY_INVOICE_FORM)
    invoiceState.setEditingId(null)
    setInvoiceEditorOpen(false)
    setInvoiceIsViewMode(false)
    setInvoiceSort(INVOICE_DEFAULT_SORT)
    setInvoiceExportOpen(false)
    setInvoiceExportFilters(EMPTY_INVOICE_EXPORT_FILTERS)
    setInvoiceExportClientDropdownOpen(false)
    setInvoiceExportContractDropdownOpen(false)
    setMonthlyHoverIndex(null)
    setCompetencyHoverIndex(null)
    setCompetencyYear(null)
    invoiceState.setError(null)
    invoiceState.setSuccess(null)
    paymentState.setItems([])
    paymentState.setSearch('')
    paymentState.setForm(EMPTY_PAYMENT_FORM)
    paymentState.setEditingId(null)
    setPaymentEditorOpen(false)
    setPaymentIsViewMode(false)
    setPaymentSort(PAYMENT_DEFAULT_SORT)
    setPaymentExportOpen(false)
    setPaymentExportFilters(EMPTY_PAYMENT_EXPORT_FILTERS)
    setPaymentExportResourceDropdownOpen(false)
    setPaymentExportContractDropdownOpen(false)
    paymentState.setError(null)
    paymentState.setSuccess(null)
    agendaState.setItems([])
    agendaState.setSearch('')
    agendaState.setForm(EMPTY_AGENDA_FORM)
    agendaState.setEditingId(null)
    setAgendaEditorOpen(false)
    setAgendaIsViewMode(false)
    setAgendaSort(AGENDA_DEFAULT_SORT)
    setAgendaTooltip(null)
    setAgendaResourceFilter([])
    setAgendaResourceDropdownOpen(false)
    agendaState.setError(null)
    agendaState.setSuccess(null)
  }

  const showAgendaTooltip = (content: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const left = Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180)
    setAgendaTooltip({ content, top: rect.bottom + 10, left })
  }

  const hideAgendaTooltip = () => setAgendaTooltip(null)

  useEffect(() => {
    if (!agendaResourceDropdownOpen) return undefined

    const closeOnOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (agendaResourceDropdownRef.current?.contains(target)) return
      setAgendaResourceDropdownOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAgendaResourceDropdownOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideInteraction)
    document.addEventListener('touchstart', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideInteraction)
      document.removeEventListener('touchstart', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [agendaResourceDropdownOpen])

  useEffect(() => {
    if (!paymentExportResourceDropdownOpen && !paymentExportContractDropdownOpen) return undefined

    const closeOnOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (paymentExportResourceDropdownRef.current?.contains(target)) return
      if (paymentExportContractDropdownRef.current?.contains(target)) return
      setPaymentExportResourceDropdownOpen(false)
      setPaymentExportContractDropdownOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPaymentExportResourceDropdownOpen(false)
      setPaymentExportContractDropdownOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideInteraction)
    document.addEventListener('touchstart', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideInteraction)
      document.removeEventListener('touchstart', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [paymentExportResourceDropdownOpen, paymentExportContractDropdownOpen])

  useEffect(() => {
    if (!invoiceExportClientDropdownOpen && !invoiceExportContractDropdownOpen) return undefined

    const closeOnOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (invoiceExportClientDropdownRef.current?.contains(target)) return
      if (invoiceExportContractDropdownRef.current?.contains(target)) return
      setInvoiceExportClientDropdownOpen(false)
      setInvoiceExportContractDropdownOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setInvoiceExportClientDropdownOpen(false)
      setInvoiceExportContractDropdownOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideInteraction)
    document.addEventListener('touchstart', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideInteraction)
      document.removeEventListener('touchstart', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [invoiceExportClientDropdownOpen, invoiceExportContractDropdownOpen])

  const closeResourceEditor = () => {
    if (resourceState.isSaving) return
    resourceState.setForm(EMPTY_RESOURCE_FORM)
    resourceState.setEditingId(null)
    setResourceIsViewMode(false)
    setResourceEditorOpen(false)
  }

  const closeContractEditor = () => {
    if (contractState.isSaving) return
    contractState.setForm(EMPTY_CONTRACT_FORM)
    contractState.setEditingId(null)
    setContractIsViewMode(false)
    setContractEditorTab('dados')
    setContractVersioningFromId(null)
    setContractEditorOpen(false)
  }

  const closeExpenseEditor = () => {
    if (expenseState.isSaving) return
    expenseState.setForm(EMPTY_EXPENSE_FORM)
    expenseState.setEditingId(null)
    setExpenseIsViewMode(false)
    setExpenseEditorOpen(false)
  }

  const closeInvoiceEditor = () => {
    if (invoiceState.isSaving) return
    invoiceState.setForm(EMPTY_INVOICE_FORM)
    invoiceState.setEditingId(null)
    setInvoiceIsViewMode(false)
    setInvoiceEditorOpen(false)
  }

  const closePaymentEditor = () => {
    if (paymentState.isSaving) return
    paymentState.setForm(EMPTY_PAYMENT_FORM)
    paymentState.setEditingId(null)
    setPaymentIsViewMode(false)
    setPaymentEditorOpen(false)
  }

  const closeAgendaEditor = () => {
    if (agendaState.isSaving) return
    agendaState.setForm(EMPTY_AGENDA_FORM)
    agendaState.setEditingId(null)
    setAgendaIsViewMode(false)
    setAgendaEditorOpen(false)
  }

  useEffect(() => {
    resetState()

    const load = async () => {
      if (subPage === 'atendimentos') return

      if (subPage === 'agenda') {
        agendaState.setIsLoading(true)
        try {
          const [agendas, resources, clients, contracts] = await Promise.all([
            loadCatalogItems('/api/central-servicos/agendas', normalizeAgenda, { headers: userHeaders }),
            loadCatalogItems('/api/central-servicos/recursos', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
            loadCatalogItems('/api/customer-hub/clients', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
            loadCatalogItems('/api/central-servicos/contratos-servicos', normalizeContract),
          ])
          const visibleResources = canViewAllResources
            ? resources
            : resources.filter((resource) => resource.trim().toLowerCase() === currentResourceName.trim().toLowerCase())
          agendaState.setItems(agendas)
          setResourceOptions(visibleResources.length || canViewAllResources ? visibleResources : [currentResourceName].filter(Boolean))
          setAgendaResourceFilter(visibleResources.length || canViewAllResources ? visibleResources : [currentResourceName].filter(Boolean))
          setClientOptions(clients)
          setContractsForLinking(contracts)
        } catch (loadError) {
          agendaState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar agendas.')
        } finally {
          agendaState.setIsLoading(false)
        }
        return
      }

      if (subPage === 'recursos') {
        resourceState.setIsLoading(true)
        try {
          resourceState.setItems(await loadCatalogItems('/api/central-servicos/recursos', normalizeResource))
        } catch (loadError) {
          resourceState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar recursos.')
        } finally {
          resourceState.setIsLoading(false)
        }
        return
      }

      if (subPage === 'contratos-servicos') {
        contractState.setIsLoading(true)
        try {
          const [contracts, clients, resources] = await Promise.all([
            loadCatalogItems('/api/central-servicos/contratos-servicos', normalizeContract),
            loadCatalogItems('/api/customer-hub/clients', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
            loadCatalogItems('/api/central-servicos/recursos', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
          ])
          contractState.setItems(contracts)
          setClientOptions(clients)
          setResourceOptions(resources)
        } catch (loadError) {
          contractState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar contratos.')
        } finally {
          contractState.setIsLoading(false)
        }
        return
      }

      if (subPage === 'despesas') {
        expenseState.setIsLoading(true)
        try {
          const [expenses, clients, resources] = await Promise.all([
            loadCatalogItems('/api/central-servicos/despesas', normalizeExpense),
            loadCatalogItems('/api/customer-hub/clients', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
            loadCatalogItems('/api/central-servicos/recursos', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
          ])
          expenseState.setItems(expenses)
          setClientOptions(clients)
          setResourceOptions(resources)
        } catch (loadError) {
          expenseState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar despesas.')
        } finally {
          expenseState.setIsLoading(false)
        }
        return
      }

      if (subPage === 'dashboard' || subPage === 'faturamento') {
        invoiceState.setIsLoading(true)
        try {
          const [invoices, clients, contracts] = await Promise.all([
            loadCatalogItems('/api/central-servicos/faturamentos', normalizeInvoice),
            loadCatalogItems('/api/customer-hub/clients', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
            loadCatalogItems('/api/central-servicos/contratos-servicos', normalizeContract),
          ])
          invoiceState.setItems(invoices)
          setClientOptions(clients)
          setContractsForLinking(contracts)
        } catch (loadError) {
          invoiceState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar faturamentos.')
        } finally {
          invoiceState.setIsLoading(false)
        }
        return
      }

      paymentState.setIsLoading(true)
      try {
        const [payments, clients, resources, contracts] = await Promise.all([
          loadCatalogItems('/api/central-servicos/pagamentos', normalizePayment),
          loadCatalogItems('/api/customer-hub/clients', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
          loadCatalogItems('/api/central-servicos/recursos', (item: unknown) => { const r = item as { nome?: unknown }; const n = String(r.nome ?? ''); return n || null }),
          loadCatalogItems('/api/central-servicos/contratos-servicos', normalizeContract),
        ])
        paymentState.setItems(payments)
        setClientOptions(clients)
        setResourceOptions(resources)
        setContractsForLinking(contracts)
      } catch (loadError) {
        paymentState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar pagamentos.')
      } finally {
        paymentState.setIsLoading(false)
      }
    }

    void load()
  }, [subPage, currentUsername, currentDisplayName, resourceScope])

  const handleSaveAgenda = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (agendaIsViewMode) return
    const { form, editingId } = agendaState
    const recurso = canViewAllResources ? form.recurso.trim() : currentResourceName.trim()
    const cliente = form.cliente.trim()
    if (!recurso) {
      agendaState.setError('Selecione o recurso do planejamento.')
      return
    }
    if (!cliente) {
      agendaState.setError('Selecione o cliente do planejamento.')
      return
    }
    if ((form.dedicacao === 'Parcial' || form.dedicacao === 'Parcial + Avulsa') && form.diasSemana.length === 0) {
      agendaState.setError('Selecione ao menos um dia da semana para dedicação parcial.')
      return
    }
    if (form.dedicacao === 'Avulsa' && form.datasAvulsas.length === 0) {
      agendaState.setError('Selecione ao menos uma data para dedicação avulsa.')
      return
    }

    agendaState.setIsSaving(true)
    agendaState.setError(null)
    agendaState.setSuccess(null)

    const payload = {
      recurso,
      cliente,
      contrato_id: form.contratoId ? Number(form.contratoId) : null,
      contrato: form.contrato.trim(),
      dedicacao: form.dedicacao,
      dias_semana: form.dedicacao === 'Full'
        ? AGENDA_FULL_WEEK_DAYS
        : form.dedicacao === 'Avulsa'
          ? []
          : form.diasSemana,
      datas_avulsas: form.dedicacao === 'Avulsa' || form.dedicacao === 'Parcial + Avulsa'
        ? form.datasAvulsas
        : [],
      vigencia_inicio: parseNullableDate(form.vigenciaInicio),
      vigencia_termino: parseNullableDate(form.vigenciaTermino),
      observacoes: form.observacoes.trim(),
      status: form.status,
    }

    try {
      const response = await fetch(apiUrl(editingId ? `/api/central-servicos/agendas/${editingId}` : '/api/central-servicos/agendas'), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...userHeaders },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        await readApiError(response, 'Falha ao salvar planejamento de agenda.')
      }

      agendaState.setItems(await loadCatalogItems('/api/central-servicos/agendas', normalizeAgenda, { headers: userHeaders }))
      agendaState.setForm(EMPTY_AGENDA_FORM)
      agendaState.setEditingId(null)
      setAgendaEditorOpen(false)
      agendaState.setSuccess(editingId ? 'Planejamento atualizado com sucesso.' : 'Planejamento cadastrado com sucesso.')
    } catch (saveError) {
      agendaState.setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar planejamento de agenda.')
    } finally {
      agendaState.setIsSaving(false)
    }
  }

  const handleSaveResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (resourceIsViewMode) return
    const { form, editingId } = resourceState
    const nome = form.nome.trim()
    if (!nome) {
      resourceState.setError('Preencha o nome do recurso.')
      return
    }

    resourceState.setIsSaving(true)
    resourceState.setError(null)
    resourceState.setSuccess(null)

    const payload = {
      nome,
      cpf: form.cpf.trim(),
      cnpj: form.cnpj.trim(),
      sexo: form.sexo,
      data_nascimento: parseNullableDate(form.dataNascimento),
      email_pessoal: form.emailPessoal.trim(),
      dados_pagamento: form.dadosPagamento.trim(),
      status: form.status,
    }

    try {
      const response = await fetch(apiUrl(editingId ? `/api/central-servicos/recursos/${editingId}` : '/api/central-servicos/recursos'), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        await readApiError(response, 'Falha ao salvar recurso.')
      }

      resourceState.setItems(await loadCatalogItems('/api/central-servicos/recursos', normalizeResource))
      resourceState.setForm(EMPTY_RESOURCE_FORM)
      resourceState.setEditingId(null)
      setResourceEditorOpen(false)
      resourceState.setSuccess(editingId ? 'Recurso atualizado com sucesso.' : 'Recurso cadastrado com sucesso.')
    } catch (saveError) {
      resourceState.setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar recurso.')
    } finally {
      resourceState.setIsSaving(false)
    }
  }

  const handleSaveContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (contractIsViewMode) return
    const { form, editingId } = contractState
    const titulo = form.titulo.trim()
    if (!titulo) {
      contractState.setError('Preencha o título do contrato.')
      return
    }

    const currentContract = editingId === null ? null : contractState.items.find((item) => item.id === editingId) ?? null

    contractState.setIsSaving(true)
    contractState.setError(null)
    contractState.setSuccess(null)

    const payload = {
      contrato_base_id: currentContract?.contratoBaseId ?? null,
      versao: currentContract?.versao ?? 1,
      titulo,
      tipo: form.tipo,
      relaciona: form.relaciona.trim(),
      descricao: form.descricao.trim(),
      tipo_contrato: form.tipoContrato,
      valor_unitario: parseNullableNumber(form.valorUnitario),
      tipo_valor: form.tipoValor,
      quantidade: parseNullableNumber(form.quantidade),
      saldo_quantidade: parseNullableNumber(form.saldoQuantidade),
      saldo_valor: parseNullableNumber(form.saldoValor),
      data_inicio: parseNullableDate(form.dataInicio),
      vigencia_inicio: parseNullableDate(form.vigenciaInicio),
      vigencia_termino: parseNullableDate(form.vigenciaTermino),
      observacoes: form.observacoes.trim(),
      faturamento_corpo_nota: form.faturamentoCorpoNota,
      faturamento_documentos: form.faturamentoDocumentos,
      faturamento_prazo_emissao: form.faturamentoPrazoEmissao.trim(),
      faturamento_data_vencimento: parseNullableDate(form.faturamentoDataVencimento),
      faturamento_codigo_servico: form.faturamentoCodigoServico.trim(),
      status: form.status,
    }

    try {
      const versioning = contractVersioningFromId !== null
      const response = await fetch(apiUrl(versioning
        ? `/api/central-servicos/contratos-servicos/${contractVersioningFromId}/versionar`
        : editingId ? `/api/central-servicos/contratos-servicos/${editingId}` : '/api/central-servicos/contratos-servicos'), {
        method: versioning ? 'POST' : editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        await readApiError(response, 'Falha ao salvar contrato.')
      }

      contractState.setItems(await loadCatalogItems('/api/central-servicos/contratos-servicos', normalizeContract))
      contractState.setForm(EMPTY_CONTRACT_FORM)
      contractState.setEditingId(null)
      setContractVersioningFromId(null)
      setContractEditorOpen(false)
      contractState.setSuccess(versioning ? 'Contrato versionado com sucesso.' : editingId ? 'Contrato atualizado com sucesso.' : 'Contrato cadastrado com sucesso.')
    } catch (saveError) {
      contractState.setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar contrato.')
    } finally {
      contractState.setIsSaving(false)
    }
  }

  const handleSaveExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (expenseIsViewMode) return
    const { form, editingId } = expenseState
    const titulo = form.titulo.trim()
    if (!titulo) {
      expenseState.setError('Preencha o título da despesa.')
      return
    }

    expenseState.setIsSaving(true)
    expenseState.setError(null)
    expenseState.setSuccess(null)

    const payload = {
      titulo,
      tipo: form.tipo,
      relaciona: form.relaciona.trim(),
      descricao: form.descricao.trim(),
      tipo_despesa: form.tipoDespesa,
      valor_unitario: parseNullableNumber(form.valorUnitario),
      tipo_valor: form.tipoValor,
      quantidade: parseNullableNumber(form.quantidade),
      data_inicio: parseNullableDate(form.dataInicio),
      vigencia_inicio: parseNullableDate(form.vigenciaInicio),
      vigencia_termino: parseNullableDate(form.vigenciaTermino),
      observacoes: form.observacoes.trim(),
    }

    try {
      const response = await fetch(apiUrl(editingId ? `/api/central-servicos/despesas/${editingId}` : '/api/central-servicos/despesas'), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        await readApiError(response, 'Falha ao salvar despesa.')
      }

      expenseState.setItems(await loadCatalogItems('/api/central-servicos/despesas', normalizeExpense))
      expenseState.setForm(EMPTY_EXPENSE_FORM)
      expenseState.setEditingId(null)
      setExpenseEditorOpen(false)
      expenseState.setSuccess(editingId ? 'Despesa atualizada com sucesso.' : 'Despesa cadastrada com sucesso.')
    } catch (saveError) {
      expenseState.setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar despesa.')
    } finally {
      expenseState.setIsSaving(false)
    }
  }

  const handleSaveInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (invoiceIsViewMode) return
    const { form, editingId } = invoiceState
    const titulo = form.titulo.trim()
    if (!titulo) {
      invoiceState.setError('Preencha o título do faturamento.')
      return
    }
    const linkedContract = contractsForLinking.find((contract) => String(contract.id) === invoiceState.form.contratoId)
    if (linkedContract?.tipoContrato === 'Banco de Horas' && (!invoiceState.form.quantidade || Number(invoiceState.form.quantidade) <= 0)) {
      invoiceState.setError('Informe a quantidade faturada para contratos de Banco de Horas.')
      return
    }

    invoiceState.setIsSaving(true)
    invoiceState.setError(null)
    invoiceState.setSuccess(null)

    const payload = {
      contrato_id: linkedContract?.id ?? null,
      titulo,
      nota: form.nota.trim(),
      emissao: parseNullableDate(form.emissao),
      referencia: form.referencia.trim(),
      previsao_pagamento: parseNullableDate(form.previsaoPagamento),
      cliente: form.cliente.trim(),
      contrato: form.contrato.trim(),
      descricao: form.descricao.trim(),
      quantidade: linkedContract?.tipoContrato === 'Banco de Horas' ? parseNullableNumber(form.quantidade) : null,
      valor: parseNullableNumber(form.valor),
      status: form.status,
      data_pagamento: parseNullableDate(form.dataPagamento),
    }

    try {
      const response = await fetch(apiUrl(editingId ? `/api/central-servicos/faturamentos/${editingId}` : '/api/central-servicos/faturamentos'), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        await readApiError(response, 'Falha ao salvar faturamento.')
      }

      invoiceState.setItems(await loadCatalogItems('/api/central-servicos/faturamentos', normalizeInvoice))
      invoiceState.setForm(EMPTY_INVOICE_FORM)
      invoiceState.setEditingId(null)
      setInvoiceEditorOpen(false)
      invoiceState.setSuccess(editingId ? 'Faturamento atualizado com sucesso.' : 'Faturamento cadastrado com sucesso.')
    } catch (saveError) {
      invoiceState.setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar faturamento.')
    } finally {
      invoiceState.setIsSaving(false)
    }
  }

  const handleSavePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paymentIsViewMode) return
    const { form, editingId } = paymentState
    const titulo = form.titulo.trim()
    if (!titulo) {
      paymentState.setError('Preencha o título do pagamento.')
      return
    }

    paymentState.setIsSaving(true)
    paymentState.setError(null)
    paymentState.setSuccess(null)

    const payload = {
      titulo,
      nota: form.nota.trim(),
      emissao: parseNullableDate(form.emissao),
      referencia: form.referencia.trim(),
      previsao_pagamento: parseNullableDate(form.previsaoPagamento),
      tipo: form.tipo,
      relaciona: form.relaciona.trim(),
      contrato: form.contrato.trim(),
      descricao: form.descricao.trim(),
      valor: parseNullableNumber(form.valor),
      status: form.status,
      data_pagamento: parseNullableDate(form.dataPagamento),
    }

    try {
      const response = await fetch(apiUrl(editingId ? `/api/central-servicos/pagamentos/${editingId}` : '/api/central-servicos/pagamentos'), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        await readApiError(response, 'Falha ao salvar pagamento.')
      }

      paymentState.setItems(await loadCatalogItems('/api/central-servicos/pagamentos', normalizePayment))
      paymentState.setForm(EMPTY_PAYMENT_FORM)
      paymentState.setEditingId(null)
      setPaymentEditorOpen(false)
      paymentState.setSuccess(editingId ? 'Pagamento atualizado com sucesso.' : 'Pagamento cadastrado com sucesso.')
    } catch (saveError) {
      paymentState.setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar pagamento.')
    } finally {
      paymentState.setIsSaving(false)
    }
  }

  const handleDeleteItem = async (
    endpoint: string,
    id: number,
    reload: () => Promise<void>,
    successMessage: string,
    setError: (value: string | null) => void,
    setSuccess: (value: string | null) => void,
  ) => {
    try {
      if (typeof window !== 'undefined' && !window.confirm('Confirma a exclusão deste registro?')) {
        return
      }

      setError(null)
      setSuccess(null)

      const response = await fetch(apiUrl(`${endpoint}/${id}`), { method: 'DELETE' })
      if (!response.ok) {
        await readApiError(response, 'Falha ao excluir registro.')
      }

      await reload()
      setSuccess(successMessage)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao excluir registro.')
    }
  }

  const renderDashboardSection = () => {
    const invoices = invoiceState.items
    const paidCount = invoices.filter((item) => item.status === 'Pago').length
    const pendingCount = invoices.filter((item) => item.status === 'Pendente').length
    const invoicedCount = invoices.filter((item) => item.status === 'Faturado').length
    const paidValue = invoices.reduce((total, item) => total + (item.status === 'Pago' ? item.valor ?? 0 : 0), 0)
    const totalValue = invoices.reduce((total, item) => total + (item.valor ?? 0), 0)
    const averageTicket = invoices.length ? totalValue / invoices.length : 0

    const monthlyMap = new Map<string, number>()
    invoices.forEach((item) => {
      const source = String(item.referencia || item.emissao || '').trim()
      const monthKey = source.match(/^\d{4}-\d{2}/)?.[0] || ''
      if (!monthKey) return
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + (item.valor ?? 0))
    })

    const monthlySeries = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => compareText(a, b))
      .slice(-12)
      .map(([month, value]) => ({
        month,
        label: formatMonthKeyLabel(month),
        value,
      }))

    const highestMonthly = monthlySeries.reduce((max, item) => Math.max(max, item.value), 0)

    const chartWidth = 760
    const chartHeight = 250
    const chartPadding = { top: 16, right: 16, bottom: 28, left: 44 }
    const chartInnerWidth = chartWidth - chartPadding.left - chartPadding.right
    const chartInnerHeight = chartHeight - chartPadding.top - chartPadding.bottom
    const monthStep = monthlySeries.length > 1 ? chartInnerWidth / (monthlySeries.length - 1) : 0
    const toY = (value: number, max: number) => {
      if (max <= 0) return chartPadding.top + chartInnerHeight
      const ratio = value / max
      return chartPadding.top + chartInnerHeight - ratio * chartInnerHeight
    }
    const monthlyPoints = monthlySeries.map((item, index) => ({
      ...item,
      x: chartPadding.left + index * monthStep,
      y: toY(item.value, highestMonthly),
    }))
    const monthlyPath = monthlyPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

    const competencyMap = new Map<string, number>()
    invoices.forEach((item) => {
      const source = String(item.referencia || item.emissao || '').trim()
      const monthKey = source.match(/^\d{4}-\d{2}/)?.[0] || ''
      if (!monthKey) return
      competencyMap.set(monthKey, (competencyMap.get(monthKey) ?? 0) + (item.valor ?? 0))
    })

    const availableYears = Array.from(new Set(
      Array.from(competencyMap.keys())
        .map((key) => Number(key.slice(0, 4)))
        .filter((year) => Number.isFinite(year)),
    )).sort((a, b) => a - b)
    const fallbackCurrentYear = availableYears.length ? availableYears[availableYears.length - 1] : new Date().getFullYear()
    const currentYear = competencyYear !== null && availableYears.includes(competencyYear)
      ? competencyYear
      : fallbackCurrentYear
    const previousYear = currentYear - 1
    const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const fullCompetencySeries = monthLabels.map((label, index) => {
      const month = String(index + 1).padStart(2, '0')
      const currentKey = `${currentYear}-${month}`
      const previousKey = `${previousYear}-${month}`
      return {
        label,
        month,
        hasCurrentData: competencyMap.has(currentKey),
        currentValue: competencyMap.get(currentKey) ?? 0,
        previousValue: competencyMap.get(previousKey) ?? 0,
      }
    })
    const lastDataMonthIndex = fullCompetencySeries.reduce(
      (maxIndex, item, index) => (item.hasCurrentData ? index : maxIndex),
      -1,
    )
    const competencySeries = lastDataMonthIndex >= 0
      ? fullCompetencySeries.slice(0, lastDataMonthIndex + 1)
      : []
    const competencyMax = competencySeries.reduce((max, item) => Math.max(max, item.currentValue, item.previousValue), 0)
    const competencyStep = competencySeries.length > 1 ? chartInnerWidth / (competencySeries.length - 1) : 0
    const competencyPoints = competencySeries.map((item, index) => ({
      ...item,
      x: chartPadding.left + index * competencyStep,
      currentY: toY(item.currentValue, competencyMax),
      previousY: toY(item.previousValue, competencyMax),
    }))
    const competencyCurrentPath = competencyPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.currentY}`).join(' ')
    const competencyPreviousPath = competencyPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.previousY}`).join(' ')

    const hoveredMonthlyPoint = monthlyHoverIndex === null ? null : (monthlyPoints[monthlyHoverIndex] ?? null)
    const hoveredCompetencyPoint = competencyHoverIndex === null ? null : (competencyPoints[competencyHoverIndex] ?? null)

    const statusDistribution = [
      { label: 'Pendente', count: pendingCount, color: '#b07f08' },
      { label: 'Faturado', count: invoicedCount, color: '#2f7a98' },
      { label: 'Pago', count: paidCount, color: '#2b7a48' },
    ]

    const reload = async () => {
      invoiceState.setIsLoading(true)
      invoiceState.setError(null)
      try {
        invoiceState.setItems(await loadCatalogItems('/api/central-servicos/faturamentos', normalizeInvoice))
      } catch (loadError) {
        invoiceState.setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar faturamentos.')
      } finally {
        invoiceState.setIsLoading(false)
      }
    }

    return (
      <div className="customer-hub central-servicos">
        <section className="card">
          <div className="ch-dashboard-header">
            <div>
              <h2>Dashboard de Faturamento</h2>
              <p className="muted">Visão consolidada dos lançamentos de faturamento da central de serviços.</p>
            </div>
          </div>
        </section>

        <section className="ch-stats">
          <article className="card ch-stat-card">
            <p className="ch-stat-card__label">Valor Total</p>
            <p className="ch-stat-card__value">{formatCurrencyDisplay(totalValue)}</p>
            <p className="muted ch-stat-card__sub">{invoices.length} registro(s)</p>
          </article>
          <article className="card ch-stat-card">
            <p className="ch-stat-card__label">Valor Recebido</p>
            <p className="ch-stat-card__value">{formatCurrencyDisplay(paidValue)}</p>
            <p className="muted ch-stat-card__sub">Status Pago</p>
          </article>
          <article className="card ch-stat-card">
            <p className="ch-stat-card__label">Ticket Médio</p>
            <p className="ch-stat-card__value">{formatCurrencyDisplay(averageTicket)}</p>
            <p className="muted ch-stat-card__sub">Por lançamento</p>
          </article>
          <article className="card ch-stat-card">
            <p className="ch-stat-card__label">Pendentes + Faturados</p>
            <p className="ch-stat-card__value">{pendingCount + invoicedCount}</p>
            <p className="muted ch-stat-card__sub">Em aberto</p>
          </article>
        </section>

        <section className="ch-dashboard-grid">
          <article className="card ch-chart-card">
            <h3>Evolução Mensal</h3>
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              {hoveredMonthlyPoint
                ? `${hoveredMonthlyPoint.label}: ${formatCurrencyDisplay(hoveredMonthlyPoint.value)}`
                : 'Passe o mouse sobre os pontos para ver os valores.'}
            </p>
            {monthlySeries.length ? (
              <div className="ch-line-chart-wrap" style={{ marginTop: '0.75rem' }}>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="ch-line-chart" role="img" aria-label="Evolução mensal do faturamento">
                  <line
                    x1={chartPadding.left}
                    x2={chartWidth - chartPadding.right}
                    y1={chartHeight - chartPadding.bottom}
                    y2={chartHeight - chartPadding.bottom}
                    className="ch-line-chart__axis"
                  />
                  <path d={monthlyPath} className="ch-line-chart__line ch-line-chart__line--primary" />
                  {monthlyPoints.map((point, index) => (
                    <g key={point.month}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={monthlyHoverIndex === index ? 5.5 : 4}
                        className="ch-line-chart__point ch-line-chart__point--primary"
                        onMouseEnter={() => setMonthlyHoverIndex(index)}
                        onMouseLeave={() => setMonthlyHoverIndex(null)}
                      />
                      <text x={point.x} y={chartHeight - 8} textAnchor="middle" className="ch-line-chart__label">{point.label}</text>
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <p className="muted">Sem dados mensais para exibir.</p>
            )}
          </article>

          <article className="card ch-chart-card">
            <div className="ch-dashboard-inline-toolbar">
              <h3>Competências: {currentYear} vs {previousYear}</h3>
              <label>
                Ano de referência
                <select
                  value={String(currentYear)}
                  onChange={(event) => {
                    const selected = Number(event.target.value)
                    setCompetencyYear(Number.isFinite(selected) ? selected : null)
                    setCompetencyHoverIndex(null)
                  }}
                >
                  {[...availableYears].reverse().map((year) => (
                    <option key={year} value={String(year)}>{year}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              {hoveredCompetencyPoint
                ? `${hoveredCompetencyPoint.label}: ${currentYear} ${formatCurrencyDisplay(hoveredCompetencyPoint.currentValue)} | ${previousYear} ${formatCurrencyDisplay(hoveredCompetencyPoint.previousValue)}`
                : `Comparação até ${competencySeries.length ? competencySeries[competencySeries.length - 1].label : '-'} (${currentYear} x ${previousYear}).`}
            </p>
            {competencySeries.length ? (
              <div className="ch-line-chart-wrap" style={{ marginTop: '0.75rem' }}>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="ch-line-chart" role="img" aria-label="Comparativo anual de competências de faturamento">
                  <line
                    x1={chartPadding.left}
                    x2={chartWidth - chartPadding.right}
                    y1={chartHeight - chartPadding.bottom}
                    y2={chartHeight - chartPadding.bottom}
                    className="ch-line-chart__axis"
                  />
                  <path d={competencyPreviousPath} className="ch-line-chart__line ch-line-chart__line--secondary" />
                  <path d={competencyCurrentPath} className="ch-line-chart__line ch-line-chart__line--primary" />
                  {competencyPoints.map((point, index) => (
                    <g key={`${point.month}-${point.label}`}>
                      <circle
                        cx={point.x}
                        cy={point.previousY}
                        r={competencyHoverIndex === index ? 5.5 : 4}
                        className="ch-line-chart__point ch-line-chart__point--secondary"
                        onMouseEnter={() => setCompetencyHoverIndex(index)}
                        onMouseLeave={() => setCompetencyHoverIndex(null)}
                      />
                      <circle
                        cx={point.x}
                        cy={point.currentY}
                        r={competencyHoverIndex === index ? 5.5 : 4}
                        className="ch-line-chart__point ch-line-chart__point--primary"
                        onMouseEnter={() => setCompetencyHoverIndex(index)}
                        onMouseLeave={() => setCompetencyHoverIndex(null)}
                      />
                      <text x={point.x} y={chartHeight - 8} textAnchor="middle" className="ch-line-chart__label">{point.label}</text>
                    </g>
                  ))}
                </svg>
                <div className="ch-status-list" style={{ marginTop: '0.4rem' }}>
                  <div className="ch-status-item">
                    <span className="ch-status-dot" style={{ backgroundColor: '#2b7a48' }} />
                    <span>{currentYear}</span>
                  </div>
                  <div className="ch-status-item">
                    <span className="ch-status-dot" style={{ backgroundColor: '#2f7a98' }} />
                    <span>{previousYear}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted">Sem competências com dados para o ano selecionado.</p>
            )}
          </article>
        </section>

        <section className="card">
          <h3>Distribuição por Status</h3>
          <div className="ch-status-list">
            {statusDistribution.map((status) => (
              <div key={status.label} className="ch-status-item">
                <span className="ch-status-dot" style={{ backgroundColor: status.color }} />
                <span>{status.label}</span>
                <strong>{status.count}</strong>
              </div>
            ))}
          </div>
        </section>

        {invoiceState.error && (
          <div className="estimativas-actions" style={{ marginTop: '0.65rem' }}>
            <p className="error" style={{ margin: 0 }}>{invoiceState.error}</p>
            <button type="button" className="button-secondary" onClick={() => void reload()}>
              Tentar novamente
            </button>
          </div>
        )}
        {invoiceState.isLoading && <p className="muted">Carregando dashboard...</p>}
      </div>
    )
  }

  const renderAgendaSection = () => {
    const scopedItems = canViewAllResources
      ? agendaState.items.filter((item) => agendaResourceFilter.includes(item.recurso))
      : agendaState.items
    const term = agendaState.search.trim().toLowerCase()
    const filteredItems = !term ? scopedItems : scopedItems.filter((item) => (
        item.recurso.toLowerCase().includes(term)
        || item.cliente.toLowerCase().includes(term)
        || item.dedicacao.toLowerCase().includes(term)
        || item.status.toLowerCase().includes(term)
      ))
    const sortedItems = [...filteredItems].sort((a, b) => {
      let result = 0
      if (agendaSort.key === 'recurso') result = compareText(a.recurso, b.recurso)
      if (agendaSort.key === 'cliente') result = compareText(a.cliente, b.cliente)
      if (agendaSort.key === 'dedicacao') result = compareText(a.dedicacao, b.dedicacao)
      if (agendaSort.key === 'vigenciaInicio') result = toSortableDate(a.vigenciaInicio) - toSortableDate(b.vigenciaInicio)
      if (agendaSort.key === 'status') result = compareText(a.status, b.status)
      return applyDirection(result, agendaSort.direction)
    })

    const conflictIds = computeAgendaConflictIds(scopedItems)
    const activeItems = scopedItems.filter((item) => item.status === 'Ativo')
    const recursos = Array.from(new Set(activeItems.map((item) => item.recurso))).sort((a, b) => compareText(a, b))
    const selectedResourceCount = agendaResourceFilter.length
    const resourceFilterLabel = selectedResourceCount === 0
      ? 'Nenhum recurso selecionado'
      : selectedResourceCount === resourceOptions.length
        ? 'Todos os recursos'
        : `${selectedResourceCount} recurso(s) selecionado(s)`

    const reload = async () => {
      agendaState.setItems(await loadCatalogItems('/api/central-servicos/agendas', normalizeAgenda, { headers: userHeaders }))
    }

    const openNewAgendaEditor = () => {
      agendaState.setForm(canViewAllResources ? EMPTY_AGENDA_FORM : { ...EMPTY_AGENDA_FORM, recurso: currentResourceName })
      agendaState.setEditingId(null)
      setAgendaIsViewMode(false)
      setAgendaEditorOpen(true)
    }

    const openEditAgendaEditor = (item: AgendaItem, viewOnly: boolean) => {
      hideAgendaTooltip()
      agendaState.setForm({
        recurso: item.recurso,
        cliente: item.cliente,
        contratoId: item.contratoId === null ? '' : String(item.contratoId),
        contrato: item.contrato,
        dedicacao: item.dedicacao,
        diasSemana: item.diasSemana,
        datasAvulsas: item.datasAvulsas,
        dataAvulsaInput: '',
        vigenciaInicio: item.vigenciaInicio,
        vigenciaTermino: item.vigenciaTermino,
        observacoes: item.observacoes,
        status: item.status,
      })
      agendaState.setEditingId(item.id)
      setAgendaIsViewMode(viewOnly)
      setAgendaEditorOpen(true)
    }

    return (
      <div className="customer-hub central-servicos">
        {agendaTooltip && createPortal(
          <div className="agenda-tooltip" style={{ top: agendaTooltip.top, left: agendaTooltip.left }} role="tooltip">
            {agendaTooltip.content}
          </div>,
          document.body,
        )}

        {agendaEditorOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closeAgendaEditor}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="agenda-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="agenda-modal-title">{agendaIsViewMode ? 'Visualizar Planejamento' : agendaState.editingId ? 'Editar Planejamento' : 'Novo Planejamento'}</h3>
                  <p className="muted">Defina o recurso, cliente, dedicação e vigência para manter a agenda centralizada.</p>
                </div>
                <button type="button" className="button-secondary" onClick={closeAgendaEditor}>
                  Fechar
                </button>
              </div>

              {agendaState.error && <p className="error">{agendaState.error}</p>}
              {agendaState.success && <p className="success">{agendaState.success}</p>}

              <form onSubmit={handleSaveAgenda} className="estimativas-form">
                <label>
                  Recurso
                  <input
                    list="agenda-resource-options"
                    value={agendaState.form.recurso}
                    onChange={(event) => agendaState.setForm((prev) => ({ ...prev, recurso: event.target.value }))}
                        readOnly={agendaIsViewMode || !canViewAllResources}
                    required
                  />
                  <datalist id="agenda-resource-options">
                    {resourceOptions.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </label>
                <label>
                  Cliente
                  <select
                    value={agendaState.form.cliente}
                    onChange={(event) => agendaState.setForm((prev) => ({ ...prev, cliente: event.target.value, contratoId: '', contrato: '' }))}
                    disabled={agendaIsViewMode}
                    required
                  >
                    <option value="">— Selecione —</option>
                    {clientOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Contrato
                  <select
                    value={agendaState.form.contratoId}
                    onChange={(event) => {
                      const selected = contractsForLinking.find((contract) => String(contract.id) === event.target.value)
                      agendaState.setForm((prev) => ({ ...prev, contratoId: event.target.value, contrato: selected?.titulo ?? '' }))
                    }}
                    disabled={agendaIsViewMode || !agendaState.form.cliente}
                  >
                    <option value="">— Selecione —</option>
                    {contractsForLinking
                      .filter((contract) => contract.status === 'Ativo' && contract.tipo === 'Cliente' && contract.relaciona === agendaState.form.cliente)
                      .map((contract) => <option key={contract.id} value={String(contract.id)}>{contract.titulo} v{contract.versao}</option>)}
                  </select>
                </label>
                <label>
                  Dedicação
                  <select
                    value={agendaState.form.dedicacao}
                    onChange={(event) => agendaState.setForm((prev) => ({ ...prev, dedicacao: event.target.value as AgendaDedicacao }))}
                    disabled={agendaIsViewMode}
                  >
                    {AGENDA_DEDICACAO_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={agendaState.form.status}
                    onChange={(event) => agendaState.setForm((prev) => ({ ...prev, status: event.target.value as AgendaStatus }))}
                    disabled={agendaIsViewMode}
                  >
                    {AGENDA_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                {(agendaState.form.dedicacao === 'Parcial' || agendaState.form.dedicacao === 'Parcial + Avulsa') && (
                  <fieldset className="estimativas-form__full agenda-weekday-fieldset">
                    <legend>Dias da semana</legend>
                    <div className="agenda-weekday-grid">
                      {AGENDA_WEEK_DAYS.map((day) => (
                        <label key={day.key} className="agenda-weekday-option">
                          <input
                            type="checkbox"
                            checked={agendaState.form.diasSemana.includes(day.key)}
                            disabled={agendaIsViewMode}
                            onChange={(event) => agendaState.setForm((prev) => ({
                              ...prev,
                              diasSemana: event.target.checked
                                ? [...prev.diasSemana, day.key]
                                : prev.diasSemana.filter((d) => d !== day.key),
                            }))}
                          />
                          <span>{day.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {(agendaState.form.dedicacao === 'Avulsa' || agendaState.form.dedicacao === 'Parcial + Avulsa') && (
                  <fieldset className="estimativas-form__full agenda-weekday-fieldset">
                    <legend>Datas específicas</legend>
                    <div className="agenda-date-selector">
                      <input
                        type="date"
                        value={agendaState.form.dataAvulsaInput}
                        onChange={(event) => agendaState.setForm((prev) => ({ ...prev, dataAvulsaInput: event.target.value }))}
                        disabled={agendaIsViewMode}
                      />
                      {!agendaIsViewMode && (
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => agendaState.setForm((prev) => {
                            const date = parseNullableDate(prev.dataAvulsaInput)
                            if (!date) return prev
                            return {
                              ...prev,
                              datasAvulsas: Array.from(new Set([...prev.datasAvulsas, date])).sort(),
                              dataAvulsaInput: '',
                            }
                          })}
                        >
                          Adicionar
                        </button>
                      )}
                    </div>
                    <div className="agenda-date-list" aria-label="Datas específicas selecionadas">
                      {agendaState.form.datasAvulsas.map((date) => (
                        <span key={date} className="agenda-date-chip">
                          {formatDateDisplay(date)}
                          {!agendaIsViewMode && (
                            <button
                              type="button"
                              aria-label={`Remover data ${formatDateDisplay(date)}`}
                              onClick={() => agendaState.setForm((prev) => ({ ...prev, datasAvulsas: prev.datasAvulsas.filter((item) => item !== date) }))}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {agendaState.form.datasAvulsas.length === 0 && <span className="muted">Nenhuma data específica selecionada.</span>}
                    </div>
                  </fieldset>
                )}
                <label>
                  Vigência Início
                  <input type="date" value={agendaState.form.vigenciaInicio} onChange={(event) => agendaState.setForm((prev) => ({ ...prev, vigenciaInicio: event.target.value }))} disabled={agendaIsViewMode} />
                </label>
                <label>
                  Vigência Término
                  <input type="date" value={agendaState.form.vigenciaTermino} onChange={(event) => agendaState.setForm((prev) => ({ ...prev, vigenciaTermino: event.target.value }))} disabled={agendaIsViewMode} />
                </label>
                <label className="estimativas-form__full">
                  Observações
                  <textarea rows={3} value={agendaState.form.observacoes} onChange={(event) => agendaState.setForm((prev) => ({ ...prev, observacoes: event.target.value }))} readOnly={agendaIsViewMode} />
                </label>
                {!agendaIsViewMode && (
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary" disabled={agendaState.isSaving}>
                      {agendaState.editingId ? 'Salvar alterações' : 'Cadastrar planejamento'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          </div>,
          document.body,
        )}

        {!agendaEditorOpen && agendaState.error && <p className="error">{agendaState.error}</p>}
        {!agendaEditorOpen && agendaState.success && <p className="success">{agendaState.success}</p>}
        {conflictIds.size > 0 && (
          <p className="error">
            Atenção: existem {conflictIds.size} planejamento(s) com conflito de agenda (mesmo recurso alocado no mesmo dia). Verifique os itens destacados.
          </p>
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>{meta.title}</h2>
              <p className="muted">{meta.description}</p>
            </div>
            <div className="ch-row-actions" style={{ gap: '0.5rem' }}>
              <button type="button" className={`button-secondary${agendaViewMode === 'grade' ? ' sidebar__link--active' : ''}`} onClick={() => setAgendaViewMode('grade')}>
                Grade Semanal
              </button>
              <button type="button" className={`button-secondary${agendaViewMode === 'calendario' ? ' sidebar__link--active' : ''}`} onClick={() => setAgendaViewMode('calendario')}>
                Calendário
              </button>
              <button type="button" className={`button-secondary${agendaViewMode === 'lista' ? ' sidebar__link--active' : ''}`} onClick={() => setAgendaViewMode('lista')}>
                Lista
              </button>
              <button type="button" className="button-primary" onClick={openNewAgendaEditor}>
                + Novo Planejamento
              </button>
            </div>
          </div>

          {!agendaState.isLoading && canViewAllResources && resourceOptions.length > 0 && (
            <div className="agenda-resource-filter" aria-label="Selecionar recursos exibidos">
              <div className="agenda-resource-filter__header">
                <strong>Recursos exibidos</strong>
                <div className="ch-row-actions" style={{ gap: '0.45rem' }}>
                  <button type="button" className="button-secondary" onClick={() => setAgendaResourceFilter(resourceOptions)}>
                    Todos
                  </button>
                  <button type="button" className="button-secondary" onClick={() => setAgendaResourceFilter([])}>
                    Limpar
                  </button>
                </div>
              </div>
              <div className="agenda-resource-filter__dropdown" ref={agendaResourceDropdownRef}>
                <button
                  type="button"
                  className="agenda-resource-filter__trigger"
                  aria-expanded={agendaResourceDropdownOpen}
                  aria-controls="agenda-resource-filter-list"
                  onClick={() => setAgendaResourceDropdownOpen((prev) => !prev)}
                >
                  <span>{resourceFilterLabel}</span>
                  <span className="agenda-resource-filter__chevron" aria-hidden="true">▾</span>
                </button>
                {agendaResourceDropdownOpen && (
                  <div id="agenda-resource-filter-list" className="agenda-resource-filter__grid">
                    {resourceOptions.map((resource) => (
                      <label key={resource} className="agenda-resource-filter__option">
                        <input
                          type="checkbox"
                          checked={agendaResourceFilter.includes(resource)}
                          onChange={(event) => setAgendaResourceFilter((prev) => (
                            event.target.checked
                              ? Array.from(new Set([...prev, resource]))
                              : prev.filter((item) => item !== resource)
                          ))}
                        />
                        <span>{resource}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!agendaState.isLoading && !canViewAllResources && (
            <p className="muted agenda-resource-filter__scope-note">
              Visualização limitada ao recurso {currentResourceName || currentUsername}.
            </p>
          )}

          {agendaState.isLoading && <p className="muted">Carregando agendas...</p>}

          {agendaViewMode === 'grade' && !agendaState.isLoading && (
            <div className="csv-table ch-table-theme agenda-week-grid">
              <table>
                <thead>
                  <tr>
                    <th>Recurso</th>
                    {AGENDA_WEEK_DAYS.map((day) => <th key={day.key}>{day.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {recursos.map((recurso) => {
                    const recursoItems = activeItems.filter((item) => item.recurso === recurso)
                    return (
                      <tr key={recurso}>
                        <td>{recurso}</td>
                        {AGENDA_WEEK_DAYS.map((day) => {
                          const dayItems = recursoItems.filter((item) => isAgendaScheduledOnWeekDay(item, day.key))
                          const hasConflict = dayItems.some((item) => conflictIds.has(item.id))
                          return (
                            <td key={day.key} className="agenda-week-grid__cell" style={hasConflict ? { backgroundColor: '#fdecea' } : undefined}>
                              {dayItems.length === 0
                                ? <span className="muted">-</span>
                                : dayItems.map((item) => {
                                  const tooltip = [
                                    `Recurso: ${item.recurso}`,
                                    `Cliente: ${item.cliente}`,
                                    `Contrato: ${item.contrato || '-'}`,
                                    `Dedicação: ${item.dedicacao}`,
                                    `Agenda: ${formatAgendaSchedule(item)}`,
                                    `Vigência: ${formatDateDisplay(item.vigenciaInicio)} a ${formatDateDisplay(item.vigenciaTermino)}`,
                                    item.observacoes ? `Observações: ${item.observacoes}` : '',
                                  ].filter(Boolean).join('\n')
                                  return (
                                    <div key={item.id} className="agenda-week-grid__item">
                                      <span
                                        className={`ch-badge agenda-week-grid__badge ${conflictIds.has(item.id) ? 'ch-badge--danger agenda-week-grid__badge--conflict' : 'ch-badge--ativo'}`}
                                        aria-label={tooltip}
                                        onMouseEnter={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                                        onMouseMove={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                                        onMouseLeave={hideAgendaTooltip}
                                        onFocus={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                                        onBlur={hideAgendaTooltip}
                                        tabIndex={0}
                                      >{item.cliente}</span>
                                      {item.contrato && (
                                        <small
                                          aria-label={tooltip}
                                          onMouseEnter={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                                          onMouseMove={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                                          onMouseLeave={hideAgendaTooltip}
                                          onFocus={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                                          onBlur={hideAgendaTooltip}
                                          tabIndex={0}
                                        >{item.contrato}</small>
                                      )}
                                    </div>
                                  )
                                })}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {recursos.length === 0 && (
                    <tr><td colSpan={AGENDA_WEEK_DAYS.length + 1} className="ch-empty">Nenhum planejamento ativo cadastrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {agendaViewMode === 'calendario' && !agendaState.isLoading && (() => {
            const calendarYear = agendaCalendarMonth.getFullYear()
            const calendarMonth = agendaCalendarMonth.getMonth()
            const firstDay = new Date(calendarYear, calendarMonth, 1)
            const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
            const leadingDays = (firstDay.getDay() + 6) % 7
            const totalCells = Math.ceil((leadingDays + lastDay.getDate()) / 7) * 7
            const calendarDays = Array.from({ length: totalCells }, (_, index) => {
              const date = new Date(calendarYear, calendarMonth, index - leadingDays + 1)
              return date.getMonth() === calendarMonth ? date : null
            })
            const monthLabel = agendaCalendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

            return (
              <div>
                <div className="ch-section-header" style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{monthLabel}</h3>
                    <p className="muted" style={{ margin: '0.2rem 0 0' }}>Período exibido: 01/{String(calendarMonth + 1).padStart(2, '0')}/{calendarYear} a {formatDateDisplay(toDateKey(lastDay))}</p>
                  </div>
                  <div className="ch-row-actions" style={{ gap: '0.5rem' }}>
                    <button type="button" className="button-secondary" onClick={() => setAgendaCalendarMonth(new Date(calendarYear, calendarMonth - 1, 1))}>Mês anterior</button>
                    <button type="button" className="button-secondary" onClick={() => setAgendaCalendarMonth(new Date())}>Hoje</button>
                    <button type="button" className="button-secondary" onClick={() => setAgendaCalendarMonth(new Date(calendarYear, calendarMonth + 1, 1))}>Próximo mês</button>
                  </div>
                </div>
                <div className="agenda-calendar" role="grid" aria-label={`Agenda de ${monthLabel}`}>
                  {AGENDA_ALL_WEEK_DAYS.map((day) => <div key={day} className="agenda-calendar__weekday" role="columnheader">{day}</div>)}
                  {calendarDays.map((date, index) => {
                    if (!date) return <div key={`empty-${index}`} className="agenda-calendar__day agenda-calendar__day--empty" role="gridcell" />
                    const dayItems = activeItems.filter((item) => isAgendaScheduledOn(item, date))
                    const hasConflict = dayItems.some((item) => conflictIds.has(item.id))
                    const isToday = toDateKey(date) === toDateKey(new Date())
                    return (
                      <div key={toDateKey(date)} className={`agenda-calendar__day${isToday ? ' agenda-calendar__day--today' : ''}${hasConflict ? ' agenda-calendar__day--conflict' : ''}`} role="gridcell">
                        <span className="agenda-calendar__date">{date.getDate()}</span>
                        {dayItems.map((item) => {
                          const tooltip = [
                            `Recurso: ${item.recurso}`,
                            `Cliente: ${item.cliente}`,
                            `Contrato: ${item.contrato || '-'}`,
                            `Dedicação: ${item.dedicacao}`,
                            `Agenda: ${formatAgendaSchedule(item)}`,
                            `Vigência: ${formatDateDisplay(item.vigenciaInicio)} a ${formatDateDisplay(item.vigenciaTermino)}`,
                          ].join('\n')
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`agenda-calendar__event${conflictIds.has(item.id) ? ' agenda-calendar__event--conflict' : ''}`}
                              aria-label={tooltip}
                              onClick={() => openEditAgendaEditor(item, true)}
                              onMouseEnter={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                              onMouseMove={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                              onMouseLeave={hideAgendaTooltip}
                              onFocus={(event) => showAgendaTooltip(tooltip, event.currentTarget)}
                              onBlur={hideAgendaTooltip}
                            >
                              <strong>{item.recurso}</strong><span>{item.cliente}</span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
                {activeItems.length === 0 && <p className="ch-empty">Nenhum planejamento ativo cadastrado.</p>}
              </div>
            )
          })()}

          {agendaViewMode === 'lista' && !agendaState.isLoading && (
            <>
              <div className="ch-table-toolbar ch-table-toolbar--single">
                <label className="ch-table-search">
                  <span className="ch-table-search__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  </span>
                  <input
                    type="search"
                    value={agendaState.search}
                    onChange={(event) => agendaState.setSearch(event.target.value)}
                    placeholder={meta.searchPlaceholder}
                    aria-label="Buscar planejamento"
                  />
                </label>
              </div>
              <div className="csv-table ch-table-theme">
                <table>
                  <thead>
                    <tr>
                      <th>{renderSortableHeader('Recurso', agendaSort.key === 'recurso', agendaSort.direction, () => setAgendaSort((prev) => ({ key: 'recurso', direction: getNextDirection(prev.key, 'recurso', prev.direction) })))}</th>
                      <th>{renderSortableHeader('Cliente', agendaSort.key === 'cliente', agendaSort.direction, () => setAgendaSort((prev) => ({ key: 'cliente', direction: getNextDirection(prev.key, 'cliente', prev.direction) })))}</th>
                      <th>Contrato</th>
                      <th>{renderSortableHeader('Dedicação', agendaSort.key === 'dedicacao', agendaSort.direction, () => setAgendaSort((prev) => ({ key: 'dedicacao', direction: getNextDirection(prev.key, 'dedicacao', prev.direction) })))}</th>
                      <th>Dias</th>
                      <th>{renderSortableHeader('Vigência Início', agendaSort.key === 'vigenciaInicio', agendaSort.direction, () => setAgendaSort((prev) => ({ key: 'vigenciaInicio', direction: getNextDirection(prev.key, 'vigenciaInicio', prev.direction) })))}</th>
                      <th>Vigência Término</th>
                      <th>{renderSortableHeader('Status', agendaSort.key === 'status', agendaSort.direction, () => setAgendaSort((prev) => ({ key: 'status', direction: getNextDirection(prev.key, 'status', prev.direction) })))}</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.recurso}</td>
                        <td>{item.cliente}</td>
                        <td>{item.contrato || '-'}</td>
                        <td>{item.dedicacao}</td>
                        <td>{formatAgendaSchedule(item)}</td>
                        <td>{formatDateDisplay(item.vigenciaInicio)}</td>
                        <td>{formatDateDisplay(item.vigenciaTermino)}</td>
                        <td>
                          <span className={`ch-badge ch-badge--${item.status === 'Ativo' ? 'ativo' : 'implantacao'}`}>
                            {conflictIds.has(item.id) ? 'Conflito' : item.status}
                          </span>
                        </td>
                        <td>
                          <div className="ch-row-actions ch-row-actions--icons">
                            <button type="button" className="ch-icon-action" aria-label="Visualizar planejamento" title="Visualizar" onClick={() => openEditAgendaEditor(item, true)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                            <button type="button" className="ch-icon-action" aria-label="Editar planejamento" title="Editar" onClick={() => openEditAgendaEditor(item, false)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                            <button
                              type="button"
                              className="ch-icon-action ch-icon-action--danger"
                              aria-label="Excluir planejamento"
                              title="Excluir"
                              onClick={() => void handleDeleteItem('/api/central-servicos/agendas', item.id, reload, 'Planejamento removido com sucesso.', agendaState.setError, agendaState.setSuccess)}
                              disabled={agendaState.isSaving}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {sortedItems.length === 0 && (
                      <tr><td colSpan={9} className="ch-empty">Nenhum planejamento cadastrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    )
  }

  const renderResourceSection = () => {
    const term = resourceState.search.trim().toLowerCase()
    const filteredItems = !term ? resourceState.items : resourceState.items.filter((item) => (
        item.nome.toLowerCase().includes(term)
        || item.cpf.toLowerCase().includes(term)
        || item.cnpj.toLowerCase().includes(term)
        || item.emailPessoal.toLowerCase().includes(term)
        || item.status.toLowerCase().includes(term)
      ))
    const sortedItems = [...filteredItems].sort((a, b) => {
      let result = 0
      if (resourceSort.key === 'nome') result = compareText(a.nome, b.nome)
      if (resourceSort.key === 'cpf') result = compareText(a.cpf, b.cpf)
      if (resourceSort.key === 'cnpj') result = compareText(a.cnpj, b.cnpj)
      if (resourceSort.key === 'sexo') result = compareText(a.sexo, b.sexo)
      if (resourceSort.key === 'status') result = compareText(a.status, b.status)
      return applyDirection(result, resourceSort.direction)
    })

    const reload = async () => {
      resourceState.setItems(await loadCatalogItems('/api/central-servicos/recursos', normalizeResource))
    }

    return (
      <div className="customer-hub central-servicos">
        {resourceEditorOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closeResourceEditor}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="resource-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="resource-modal-title">{resourceIsViewMode ? 'Visualizar Recurso' : resourceState.editingId ? 'Editar Recurso' : 'Novo Recurso'}</h3>
                  <p className="muted">Informe os dados cadastrais do recurso e o status para disponibilidade interna.</p>
                </div>
                <button type="button" className="button-secondary" onClick={closeResourceEditor}>
                  Fechar
                </button>
              </div>

              <form onSubmit={handleSaveResource} className="estimativas-form">
                <label>
                  Nome
                  <input value={resourceState.form.nome} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, nome: event.target.value }))} readOnly={resourceIsViewMode} required />
                </label>
                <label>
                  CPF
                  <input value={resourceState.form.cpf} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, cpf: event.target.value }))} readOnly={resourceIsViewMode} />
                </label>
                <label>
                  CNPJ
                  <input value={resourceState.form.cnpj} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, cnpj: event.target.value }))} readOnly={resourceIsViewMode} />
                </label>
                <label>
                  Sexo
                  <select value={resourceState.form.sexo} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, sexo: event.target.value }))} disabled={resourceIsViewMode}>
                    {RESOURCE_SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option === 'Nao Informado' ? 'Não informado' : option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Data de Nascimento
                  <input type="date" value={resourceState.form.dataNascimento} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, dataNascimento: event.target.value }))} disabled={resourceIsViewMode} />
                </label>
                <label>
                  eMail Pessoal
                  <input type="email" value={resourceState.form.emailPessoal} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, emailPessoal: event.target.value }))} readOnly={resourceIsViewMode} />
                </label>
                <label className="estimativas-form__full">
                  Dados de Pagamento
                  <textarea rows={3} value={resourceState.form.dadosPagamento} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, dadosPagamento: event.target.value }))} readOnly={resourceIsViewMode} />
                </label>
                <label>
                  Status
                  <select value={resourceState.form.status} onChange={(event) => resourceState.setForm((prev) => ({ ...prev, status: event.target.value as ResourceStatus }))} disabled={resourceIsViewMode}>
                    {RESOURCE_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                {!resourceIsViewMode && (
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary" disabled={resourceState.isSaving}>
                      {resourceState.editingId ? 'Salvar alterações' : 'Cadastrar recurso'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          </div>,
          document.body,
        )}

        {resourceState.error && <p className="error">{resourceState.error}</p>}
        {resourceState.success && <p className="success">{resourceState.success}</p>}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>{meta.title}</h2>
              <p className="muted">{meta.description}</p>
            </div>
            <button type="button" className="button-primary" onClick={() => {
              resourceState.setForm(EMPTY_RESOURCE_FORM)
              resourceState.setEditingId(null)
              setResourceIsViewMode(false)
              setResourceEditorOpen(true)
            }}>
              + Novo Recurso
            </button>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={resourceState.search}
                onChange={(event) => resourceState.setSearch(event.target.value)}
                placeholder={meta.searchPlaceholder}
                aria-label="Buscar recurso"
              />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader('Nome', resourceSort.key === 'nome', resourceSort.direction, () => setResourceSort((prev) => ({ key: 'nome', direction: getNextDirection(prev.key, 'nome', prev.direction) })))}</th>
                  <th>{renderSortableHeader('CPF', resourceSort.key === 'cpf', resourceSort.direction, () => setResourceSort((prev) => ({ key: 'cpf', direction: getNextDirection(prev.key, 'cpf', prev.direction) })))}</th>
                  <th>{renderSortableHeader('CNPJ', resourceSort.key === 'cnpj', resourceSort.direction, () => setResourceSort((prev) => ({ key: 'cnpj', direction: getNextDirection(prev.key, 'cnpj', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Sexo', resourceSort.key === 'sexo', resourceSort.direction, () => setResourceSort((prev) => ({ key: 'sexo', direction: getNextDirection(prev.key, 'sexo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Status', resourceSort.key === 'status', resourceSort.direction, () => setResourceSort((prev) => ({ key: 'status', direction: getNextDirection(prev.key, 'status', prev.direction) })))}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nome}</td>
                    <td>{item.cpf || '-'}</td>
                    <td>{item.cnpj || '-'}</td>
                    <td>{item.sexo}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${item.status === 'Ativo' ? 'ativo' : item.status === 'Inativo' ? 'inativo' : 'implantacao'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button
                          type="button"
                          className="ch-icon-action"
                          aria-label="Visualizar recurso"
                          title="Visualizar"
                          onClick={() => {
                            resourceState.setForm({
                              nome: item.nome,
                              cpf: item.cpf,
                              cnpj: item.cnpj,
                              sexo: item.sexo,
                              dataNascimento: item.dataNascimento,
                              emailPessoal: item.emailPessoal,
                              dadosPagamento: item.dadosPagamento,
                              status: item.status,
                            })
                            resourceState.setEditingId(item.id)
                            setResourceIsViewMode(true)
                            setResourceEditorOpen(true)
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button
                          type="button"
                          className="ch-icon-action"
                          aria-label="Editar recurso"
                          title="Editar"
                          onClick={() => {
                            resourceState.setForm({
                              nome: item.nome,
                              cpf: item.cpf,
                              cnpj: item.cnpj,
                              sexo: item.sexo,
                              dataNascimento: item.dataNascimento,
                              emailPessoal: item.emailPessoal,
                              dadosPagamento: item.dadosPagamento,
                              status: item.status,
                            })
                            resourceState.setEditingId(item.id)
                            setResourceIsViewMode(false)
                            setResourceEditorOpen(true)
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button
                          type="button"
                          className="ch-icon-action"
                          aria-label="Duplicar recurso"
                          title="Duplicar"
                          onClick={() => {
                            resourceState.setForm({
                              nome: item.nome,
                              cpf: item.cpf,
                              cnpj: item.cnpj,
                              sexo: item.sexo,
                              dataNascimento: item.dataNascimento,
                              emailPessoal: item.emailPessoal,
                              dadosPagamento: item.dadosPagamento,
                              status: item.status,
                            })
                            resourceState.setEditingId(null)
                            setResourceIsViewMode(false)
                            setResourceEditorOpen(true)
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" /></svg>
                        </button>
                        <button
                          type="button"
                          className="ch-icon-action ch-icon-action--danger"
                          aria-label="Excluir recurso"
                          title="Excluir"
                          onClick={() => void handleDeleteItem('/api/central-servicos/recursos', item.id, reload, 'Recurso removido com sucesso.', resourceState.setError, resourceState.setSuccess)}
                          disabled={resourceState.isSaving}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedItems.length === 0 && (
                  <tr><td colSpan={6} className="ch-empty">Nenhum recurso cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  const renderContractSection = () => {
    const term = contractState.search.trim().toLowerCase()
    const filteredItems = !term ? contractState.items : contractState.items.filter((item) => (
        item.titulo.toLowerCase().includes(term)
        || item.relaciona.toLowerCase().includes(term)
        || item.tipoContrato.toLowerCase().includes(term)
        || item.tipoValor.toLowerCase().includes(term)
        || item.status.toLowerCase().includes(term)
      ))
    const sortedItems = [...filteredItems].sort((a, b) => {
      let result = 0
      if (contractSort.key === 'titulo') result = compareText(a.titulo, b.titulo)
      if (contractSort.key === 'tipo') result = compareText(a.tipo, b.tipo)
      if (contractSort.key === 'relaciona') result = compareText(a.relaciona, b.relaciona)
      if (contractSort.key === 'tipoContrato') result = compareText(a.tipoContrato, b.tipoContrato)
      if (contractSort.key === 'valorUnitario') result = compareNullableNumber(a.valorUnitario, b.valorUnitario)
      if (contractSort.key === 'status') result = compareText(a.status, b.status)
      return applyDirection(result, contractSort.direction)
    })

    const reload = async () => {
      contractState.setItems(await loadCatalogItems('/api/central-servicos/contratos-servicos', normalizeContract))
    }

    return (
      <div className="customer-hub central-servicos">
        {contractEditorOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closeContractEditor}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="contract-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="contract-modal-title">{contractIsViewMode ? 'Visualizar Contrato' : contractState.editingId ? 'Editar Contrato' : 'Novo Contrato'}</h3>
                  <p className="muted">Cadastre o vínculo, o tipo de contrato, o valor unitário e a vigência.</p>
                </div>
                <button type="button" className="button-secondary" onClick={closeContractEditor}>Fechar</button>
              </div>

              <form onSubmit={handleSaveContract} className="estimativas-form">
                <div className="central-servicos-tabs estimativas-form__full" role="tablist" aria-label="Seções do contrato">
                  <button type="button" className={contractEditorTab === 'dados' ? 'central-servicos-tab central-servicos-tab--active' : 'central-servicos-tab'} onClick={() => setContractEditorTab('dados')} role="tab" aria-selected={contractEditorTab === 'dados'}>Dados do contrato</button>
                  <button type="button" className={contractEditorTab === 'faturamento' ? 'central-servicos-tab central-servicos-tab--active' : 'central-servicos-tab'} onClick={() => setContractEditorTab('faturamento')} role="tab" aria-selected={contractEditorTab === 'faturamento'}>Detalhes do faturamento</button>
                </div>
                {contractEditorTab === 'dados' && (
                  <>
                <label>
                  Título
                  <input value={contractState.form.titulo} onChange={(event) => contractState.setForm((prev) => ({ ...prev, titulo: event.target.value }))} readOnly={contractIsViewMode} required />
                </label>
                <label>
                  Tipo
                  <select value={contractState.form.tipo} onChange={(event) => contractState.setForm((prev) => ({ ...prev, tipo: event.target.value as RelationType }))} disabled={contractIsViewMode}>
                    {RELATION_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Relaciona
                  <select value={contractState.form.relaciona} onChange={(event) => contractState.setForm((prev) => ({ ...prev, relaciona: event.target.value }))} disabled={contractIsViewMode}>
                    <option value="">— Selecione —</option>
                    {(contractState.form.tipo === 'Cliente' ? clientOptions : resourceOptions).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label>
                  Tipo de Contrato
                  <select value={contractState.form.tipoContrato} onChange={(event) => contractState.setForm((prev) => ({ ...prev, tipoContrato: event.target.value as ContractType }))} disabled={contractIsViewMode}>
                    {CONTRACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Tipo Valor
                  <select value={contractState.form.tipoValor} onChange={(event) => contractState.setForm((prev) => ({ ...prev, tipoValor: event.target.value as ValueType }))} disabled={contractIsViewMode}>
                    {VALUE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Valor Unitário
                  <input type="number" step="0.01" value={contractState.form.valorUnitario} onChange={(event) => contractState.setForm((prev) => ({ ...prev, valorUnitario: event.target.value }))} readOnly={contractIsViewMode} />
                </label>
                <label>
                  Quantidade
                  <input type="number" step="0.01" value={contractState.form.quantidade} onChange={(event) => contractState.setForm((prev) => ({ ...prev, quantidade: event.target.value }))} readOnly={contractIsViewMode} />
                </label>
                {contractState.form.tipoContrato === 'Banco de Horas' && (
                  <>
                    <label>
                      Saldo de Quantidade
                      <input type="number" min="0" step="0.01" value={contractState.form.saldoQuantidade} onChange={(event) => contractState.setForm((prev) => ({ ...prev, saldoQuantidade: event.target.value }))} readOnly={contractIsViewMode} />
                    </label>
                    <label>
                      Saldo de Valor
                      <input type="number" min="0" step="0.01" value={contractState.form.saldoValor} onChange={(event) => contractState.setForm((prev) => ({ ...prev, saldoValor: event.target.value }))} readOnly={contractIsViewMode} />
                    </label>
                  </>
                )}
                <label>
                  Data de Início
                  <input type="date" value={contractState.form.dataInicio} onChange={(event) => contractState.setForm((prev) => ({ ...prev, dataInicio: event.target.value }))} disabled={contractIsViewMode} />
                </label>
                <label>
                  Vigência - Início
                  <input type="date" value={contractState.form.vigenciaInicio} onChange={(event) => contractState.setForm((prev) => ({ ...prev, vigenciaInicio: event.target.value }))} disabled={contractIsViewMode} />
                </label>
                <label>
                  Vigência - Término
                  <input type="date" value={contractState.form.vigenciaTermino} onChange={(event) => contractState.setForm((prev) => ({ ...prev, vigenciaTermino: event.target.value }))} disabled={contractIsViewMode} />
                </label>
                <label>
                  Status
                  <select value={contractState.form.status} onChange={(event) => contractState.setForm((prev) => ({ ...prev, status: event.target.value as 'Ativo' | 'Encerrado' }))} disabled={contractIsViewMode}>
                    <option value="Ativo">Ativo</option>
                    <option value="Encerrado">Encerrado</option>
                  </select>
                </label>
                <div className="estimativas-form__full rich-field">
                  <span className="rich-field__label">Descrição</span>
                  <RichTextEditor value={contractState.form.descricao} onChange={(value) => contractState.setForm((prev) => ({ ...prev, descricao: value }))} placeholder="Descreva o contrato." rows={4} disabled={contractIsViewMode} />
                </div>
                <div className="estimativas-form__full rich-field">
                  <span className="rich-field__label">Observações</span>
                  <RichTextEditor value={contractState.form.observacoes} onChange={(value) => contractState.setForm((prev) => ({ ...prev, observacoes: value }))} placeholder="Adicione observações do contrato." rows={4} disabled={contractIsViewMode} />
                </div>
                  </>
                )}
                {contractEditorTab === 'faturamento' && (
                  <>
                    <div className="estimativas-form__full rich-field">
                      <span className="rich-field__label">Corpo da Nota</span>
                      <RichTextEditor value={contractState.form.faturamentoCorpoNota} onChange={(value) => contractState.setForm((prev) => ({ ...prev, faturamentoCorpoNota: value }))} placeholder="Texto que deverá constar no corpo da nota fiscal." rows={6} disabled={contractIsViewMode} />
                    </div>
                    <div className="estimativas-form__full rich-field">
                      <span className="rich-field__label">Documentos para Anexar</span>
                      <RichTextEditor value={contractState.form.faturamentoDocumentos} onChange={(value) => contractState.setForm((prev) => ({ ...prev, faturamentoDocumentos: value }))} placeholder="Liste os documentos necessários para anexar à nota." rows={5} disabled={contractIsViewMode} />
                    </div>
                    <label>
                      Prazo de Emissão
                      <input value={contractState.form.faturamentoPrazoEmissao} onChange={(event) => contractState.setForm((prev) => ({ ...prev, faturamentoPrazoEmissao: event.target.value }))} readOnly={contractIsViewMode} placeholder="Ex.: até o 5º dia útil" />
                    </label>
                    <label>
                      Data de Vencimento
                      <input type="date" value={contractState.form.faturamentoDataVencimento} onChange={(event) => contractState.setForm((prev) => ({ ...prev, faturamentoDataVencimento: event.target.value }))} disabled={contractIsViewMode} />
                    </label>
                    <label>
                      Código de Serviço
                      <input value={contractState.form.faturamentoCodigoServico} onChange={(event) => contractState.setForm((prev) => ({ ...prev, faturamentoCodigoServico: event.target.value }))} readOnly={contractIsViewMode} />
                    </label>
                  </>
                )}
                {!contractIsViewMode && (
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary" disabled={contractState.isSaving}>
                      {contractState.editingId ? 'Salvar alterações' : 'Cadastrar contrato'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          </div>,
          document.body,
        )}

        {contractState.error && <p className="error">{contractState.error}</p>}
        {contractState.success && <p className="success">{contractState.success}</p>}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>{meta.title}</h2>
              <p className="muted">{meta.description}</p>
            </div>
            <button type="button" className="button-primary" onClick={() => {
              contractState.setForm(EMPTY_CONTRACT_FORM)
              contractState.setEditingId(null)
              setContractVersioningFromId(null)
              setContractIsViewMode(false)
              setContractEditorOpen(true)
            }}>
              + Novo Contrato
            </button>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input type="search" value={contractState.search} onChange={(event) => contractState.setSearch(event.target.value)} placeholder={meta.searchPlaceholder} aria-label="Buscar contrato" />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader('Título', contractSort.key === 'titulo', contractSort.direction, () => setContractSort((prev) => ({ key: 'titulo', direction: getNextDirection(prev.key, 'titulo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Tipo', contractSort.key === 'tipo', contractSort.direction, () => setContractSort((prev) => ({ key: 'tipo', direction: getNextDirection(prev.key, 'tipo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Relaciona', contractSort.key === 'relaciona', contractSort.direction, () => setContractSort((prev) => ({ key: 'relaciona', direction: getNextDirection(prev.key, 'relaciona', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Tipo Contrato', contractSort.key === 'tipoContrato', contractSort.direction, () => setContractSort((prev) => ({ key: 'tipoContrato', direction: getNextDirection(prev.key, 'tipoContrato', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Valor', contractSort.key === 'valorUnitario', contractSort.direction, () => setContractSort((prev) => ({ key: 'valorUnitario', direction: getNextDirection(prev.key, 'valorUnitario', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Status', contractSort.key === 'status', contractSort.direction, () => setContractSort((prev) => ({ key: 'status', direction: getNextDirection(prev.key, 'status', prev.direction) })))}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.titulo} <span className="muted" style={{ fontSize: '0.78rem' }}>v{item.versao}</span></td>
                    <td>{item.tipo}</td>
                    <td>{item.relaciona || '-'}</td>
                    <td>{item.tipoContrato}</td>
                    <td>{formatCurrencyDisplay(item.valorUnitario)}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${item.status === 'Ativo' ? 'ativo' : 'inativo'}`}>{item.status}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Visualizar contrato" title="Visualizar" onClick={() => {
                          contractState.setForm({
                            titulo: item.titulo,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            descricao: item.descricao,
                            tipoContrato: item.tipoContrato,
                            valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                            tipoValor: item.tipoValor,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            saldoQuantidade: item.saldoQuantidade === null ? '' : String(item.saldoQuantidade),
                            saldoValor: item.saldoValor === null ? '' : String(item.saldoValor),
                            dataInicio: item.dataInicio,
                            vigenciaInicio: item.vigenciaInicio,
                            vigenciaTermino: item.vigenciaTermino,
                            observacoes: item.observacoes,
                            status: item.status,
                            faturamentoCorpoNota: item.faturamentoCorpoNota ?? '',
                            faturamentoDocumentos: item.faturamentoDocumentos ?? '',
                            faturamentoPrazoEmissao: item.faturamentoPrazoEmissao ?? '',
                            faturamentoDataVencimento: item.faturamentoDataVencimento ?? '',
                            faturamentoCodigoServico: item.faturamentoCodigoServico ?? '',
                          })
                          contractState.setEditingId(item.id)
                          setContractVersioningFromId(null)
                          setContractIsViewMode(true)
                          setContractEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar contrato" title="Editar" onClick={() => {
                          contractState.setForm({
                            titulo: item.titulo,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            descricao: item.descricao,
                            tipoContrato: item.tipoContrato,
                            valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                            tipoValor: item.tipoValor,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            saldoQuantidade: item.saldoQuantidade === null ? '' : String(item.saldoQuantidade),
                            saldoValor: item.saldoValor === null ? '' : String(item.saldoValor),
                            dataInicio: item.dataInicio,
                            vigenciaInicio: item.vigenciaInicio,
                            vigenciaTermino: item.vigenciaTermino,
                            observacoes: item.observacoes,
                            faturamentoCorpoNota: item.faturamentoCorpoNota,
                            faturamentoDocumentos: item.faturamentoDocumentos,
                            faturamentoPrazoEmissao: item.faturamentoPrazoEmissao,
                            faturamentoDataVencimento: item.faturamentoDataVencimento,
                            faturamentoCodigoServico: item.faturamentoCodigoServico,
                            status: item.status,
                          })
                          contractState.setEditingId(item.id)
                          setContractVersioningFromId(null)
                          setContractIsViewMode(false)
                          setContractEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Duplicar contrato" title="Duplicar" onClick={() => {
                          contractState.setForm({
                            titulo: item.titulo,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            descricao: item.descricao,
                            tipoContrato: item.tipoContrato,
                            valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                            tipoValor: item.tipoValor,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            saldoQuantidade: item.saldoQuantidade === null ? '' : String(item.saldoQuantidade),
                            saldoValor: item.saldoValor === null ? '' : String(item.saldoValor),
                            dataInicio: item.dataInicio,
                            vigenciaInicio: item.vigenciaInicio,
                            vigenciaTermino: item.vigenciaTermino,
                            observacoes: item.observacoes,
                            faturamentoCorpoNota: item.faturamentoCorpoNota,
                            faturamentoDocumentos: item.faturamentoDocumentos,
                            faturamentoPrazoEmissao: item.faturamentoPrazoEmissao,
                            faturamentoDataVencimento: item.faturamentoDataVencimento,
                            faturamentoCodigoServico: item.faturamentoCodigoServico,
                            status: item.status,
                          })
                          contractState.setEditingId(null)
                          setContractVersioningFromId(null)
                          setContractIsViewMode(false)
                          setContractEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Versionar contrato" title="Versionar" onClick={() => {
                          contractState.setForm({
                            titulo: `${item.titulo} - v${item.versao + 1}`,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            descricao: item.descricao,
                            tipoContrato: item.tipoContrato,
                            valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                            tipoValor: item.tipoValor,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            saldoQuantidade: item.saldoQuantidade === null ? '' : String(item.saldoQuantidade),
                            saldoValor: item.saldoValor === null ? '' : String(item.saldoValor),
                            dataInicio: item.dataInicio,
                            vigenciaInicio: item.vigenciaInicio,
                            vigenciaTermino: item.vigenciaTermino,
                            observacoes: item.observacoes,
                            faturamentoCorpoNota: item.faturamentoCorpoNota,
                            faturamentoDocumentos: item.faturamentoDocumentos,
                            faturamentoPrazoEmissao: item.faturamentoPrazoEmissao,
                            faturamentoDataVencimento: item.faturamentoDataVencimento,
                            faturamentoCodigoServico: item.faturamentoCodigoServico,
                            status: 'Ativo',
                          })
                          contractState.setEditingId(null)
                          setContractVersioningFromId(item.id)
                          setContractIsViewMode(false)
                          setContractEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /><path d="M12 7v5l3 2" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir contrato" title="Excluir" onClick={() => void handleDeleteItem('/api/central-servicos/contratos-servicos', item.id, reload, 'Contrato removido com sucesso.', contractState.setError, contractState.setSuccess)} disabled={contractState.isSaving}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedItems.length === 0 && <tr><td colSpan={7} className="ch-empty">Nenhum contrato cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  const renderExpenseSection = () => {
    const term = expenseState.search.trim().toLowerCase()
    const filteredItems = !term ? expenseState.items : expenseState.items.filter((item) => (
        item.titulo.toLowerCase().includes(term)
        || item.relaciona.toLowerCase().includes(term)
        || item.tipoDespesa.toLowerCase().includes(term)
        || item.tipoValor.toLowerCase().includes(term)
      ))
    const sortedItems = [...filteredItems].sort((a, b) => {
      let result = 0
      if (expenseSort.key === 'titulo') result = compareText(a.titulo, b.titulo)
      if (expenseSort.key === 'tipo') result = compareText(a.tipo, b.tipo)
      if (expenseSort.key === 'relaciona') result = compareText(a.relaciona, b.relaciona)
      if (expenseSort.key === 'tipoDespesa') result = compareText(a.tipoDespesa, b.tipoDespesa)
      if (expenseSort.key === 'valorUnitario') result = compareNullableNumber(a.valorUnitario, b.valorUnitario)
      return applyDirection(result, expenseSort.direction)
    })

    const reload = async () => {
      expenseState.setItems(await loadCatalogItems('/api/central-servicos/despesas', normalizeExpense))
    }

    return (
      <div className="customer-hub central-servicos">
        {expenseEditorOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closeExpenseEditor}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="expense-modal-title">{expenseIsViewMode ? 'Visualizar Despesa' : expenseState.editingId ? 'Editar Despesa' : 'Nova Despesa'}</h3>
                  <p className="muted">Cadastre despesas ligadas a cliente ou recurso com valores e vigência.</p>
                </div>
                <button type="button" className="button-secondary" onClick={closeExpenseEditor}>Fechar</button>
              </div>

              <form onSubmit={handleSaveExpense} className="estimativas-form">
                <label>
                  Título
                  <input value={expenseState.form.titulo} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, titulo: event.target.value }))} readOnly={expenseIsViewMode} required />
                </label>
                <label>
                  Tipo
                  <select value={expenseState.form.tipo} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, tipo: event.target.value as RelationType }))} disabled={expenseIsViewMode}>
                    {RELATION_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Relaciona
                  <select value={expenseState.form.relaciona} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, relaciona: event.target.value }))} disabled={expenseIsViewMode}>
                    <option value="">— Selecione —</option>
                    {(expenseState.form.tipo === 'Cliente' ? clientOptions : resourceOptions).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label>
                  Tipo de Despesa
                  <select value={expenseState.form.tipoDespesa} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, tipoDespesa: event.target.value as ExpenseType }))} disabled={expenseIsViewMode}>
                    {EXPENSE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Tipo Valor
                  <select value={expenseState.form.tipoValor} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, tipoValor: event.target.value as ValueType }))} disabled={expenseIsViewMode}>
                    {VALUE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Valor Unitário
                  <input type="number" step="0.01" value={expenseState.form.valorUnitario} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, valorUnitario: event.target.value }))} readOnly={expenseIsViewMode} />
                </label>
                <label>
                  Quantidade
                  <input type="number" step="0.01" value={expenseState.form.quantidade} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, quantidade: event.target.value }))} readOnly={expenseIsViewMode} />
                </label>
                <label>
                  Data de Início
                  <input type="date" value={expenseState.form.dataInicio} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, dataInicio: event.target.value }))} disabled={expenseIsViewMode} />
                </label>
                <label>
                  Vigência - Início
                  <input type="date" value={expenseState.form.vigenciaInicio} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, vigenciaInicio: event.target.value }))} disabled={expenseIsViewMode} />
                </label>
                <label>
                  Vigência - Término
                  <input type="date" value={expenseState.form.vigenciaTermino} onChange={(event) => expenseState.setForm((prev) => ({ ...prev, vigenciaTermino: event.target.value }))} disabled={expenseIsViewMode} />
                </label>
                <div className="estimativas-form__full rich-field">
                  <span className="rich-field__label">Descrição</span>
                  <RichTextEditor value={expenseState.form.descricao} onChange={(value) => expenseState.setForm((prev) => ({ ...prev, descricao: value }))} placeholder="Descreva a despesa." rows={4} disabled={expenseIsViewMode} />
                </div>
                <div className="estimativas-form__full rich-field">
                  <span className="rich-field__label">Observações</span>
                  <RichTextEditor value={expenseState.form.observacoes} onChange={(value) => expenseState.setForm((prev) => ({ ...prev, observacoes: value }))} placeholder="Adicione observações da despesa." rows={4} disabled={expenseIsViewMode} />
                </div>
                {!expenseIsViewMode && (
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary" disabled={expenseState.isSaving}>
                      {expenseState.editingId ? 'Salvar alterações' : 'Cadastrar despesa'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          </div>,
          document.body,
        )}

        {expenseState.error && <p className="error">{expenseState.error}</p>}
        {expenseState.success && <p className="success">{expenseState.success}</p>}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>{meta.title}</h2>
              <p className="muted">{meta.description}</p>
            </div>
            <button type="button" className="button-primary" onClick={() => {
              expenseState.setForm(EMPTY_EXPENSE_FORM)
              expenseState.setEditingId(null)
              setExpenseIsViewMode(false)
              setExpenseEditorOpen(true)
            }}>
              + Nova Despesa
            </button>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input type="search" value={expenseState.search} onChange={(event) => expenseState.setSearch(event.target.value)} placeholder={meta.searchPlaceholder} aria-label="Buscar despesa" />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader('Título', expenseSort.key === 'titulo', expenseSort.direction, () => setExpenseSort((prev) => ({ key: 'titulo', direction: getNextDirection(prev.key, 'titulo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Tipo', expenseSort.key === 'tipo', expenseSort.direction, () => setExpenseSort((prev) => ({ key: 'tipo', direction: getNextDirection(prev.key, 'tipo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Relaciona', expenseSort.key === 'relaciona', expenseSort.direction, () => setExpenseSort((prev) => ({ key: 'relaciona', direction: getNextDirection(prev.key, 'relaciona', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Tipo Despesa', expenseSort.key === 'tipoDespesa', expenseSort.direction, () => setExpenseSort((prev) => ({ key: 'tipoDespesa', direction: getNextDirection(prev.key, 'tipoDespesa', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Valor', expenseSort.key === 'valorUnitario', expenseSort.direction, () => setExpenseSort((prev) => ({ key: 'valorUnitario', direction: getNextDirection(prev.key, 'valorUnitario', prev.direction) })))}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.titulo}</td>
                    <td>{item.tipo}</td>
                    <td>{item.relaciona || '-'}</td>
                    <td>{item.tipoDespesa}</td>
                    <td>{formatCurrencyDisplay(item.valorUnitario)}</td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Visualizar despesa" title="Visualizar" onClick={() => {
                          expenseState.setForm({
                            titulo: item.titulo,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            descricao: item.descricao,
                            tipoDespesa: item.tipoDespesa,
                            valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                            tipoValor: item.tipoValor,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            dataInicio: item.dataInicio,
                            vigenciaInicio: item.vigenciaInicio,
                            vigenciaTermino: item.vigenciaTermino,
                            observacoes: item.observacoes,
                          })
                          expenseState.setEditingId(item.id)
                          setExpenseIsViewMode(true)
                          setExpenseEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar despesa" title="Editar" onClick={() => {
                          expenseState.setForm({
                            titulo: item.titulo,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            descricao: item.descricao,
                            tipoDespesa: item.tipoDespesa,
                            valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                            tipoValor: item.tipoValor,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            dataInicio: item.dataInicio,
                            vigenciaInicio: item.vigenciaInicio,
                            vigenciaTermino: item.vigenciaTermino,
                            observacoes: item.observacoes,
                          })
                          expenseState.setEditingId(item.id)
                          setExpenseIsViewMode(false)
                          setExpenseEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                          <button type="button" className="ch-icon-action" aria-label="Duplicar despesa" title="Duplicar" onClick={() => {
                            expenseState.setForm({
                              titulo: item.titulo,
                              tipo: item.tipo,
                              relaciona: item.relaciona,
                              descricao: item.descricao,
                              tipoDespesa: item.tipoDespesa,
                              valorUnitario: item.valorUnitario === null ? '' : String(item.valorUnitario),
                              tipoValor: item.tipoValor,
                              quantidade: item.quantidade === null ? '' : String(item.quantidade),
                              dataInicio: item.dataInicio,
                              vigenciaInicio: item.vigenciaInicio,
                              vigenciaTermino: item.vigenciaTermino,
                              observacoes: item.observacoes,
                            })
                            expenseState.setEditingId(null)
                            setExpenseIsViewMode(false)
                            setExpenseEditorOpen(true)
                          }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" /></svg>
                          </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir despesa" title="Excluir" onClick={() => void handleDeleteItem('/api/central-servicos/despesas', item.id, reload, 'Despesa removida com sucesso.', expenseState.setError, expenseState.setSuccess)} disabled={expenseState.isSaving}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedItems.length === 0 && <tr><td colSpan={6} className="ch-empty">Nenhuma despesa cadastrada.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  const renderInvoiceSection = () => {
    const term = invoiceState.search.trim().toLowerCase()
    const filteredItems = !term ? invoiceState.items : invoiceState.items.filter((item) => (
        item.titulo.toLowerCase().includes(term)
        || item.nota.toLowerCase().includes(term)
        || item.cliente.toLowerCase().includes(term)
        || item.contrato.toLowerCase().includes(term)
        || item.status.toLowerCase().includes(term)
      ))
    const sortedItems = [...filteredItems].sort((a, b) => {
      let result = 0
      if (invoiceSort.key === 'titulo') result = compareText(a.titulo, b.titulo)
      if (invoiceSort.key === 'nota') result = compareText(a.nota, b.nota)
      if (invoiceSort.key === 'cliente') result = compareText(a.cliente, b.cliente)
      if (invoiceSort.key === 'contrato') result = compareText(a.contrato, b.contrato)
      if (invoiceSort.key === 'emissao') result = toSortableDate(a.emissao) - toSortableDate(b.emissao)
      if (invoiceSort.key === 'valor') result = compareNullableNumber(a.valor, b.valor)
      if (invoiceSort.key === 'status') result = compareText(a.status, b.status)
      return applyDirection(result, invoiceSort.direction)
    })

    const reload = async () => {
      invoiceState.setItems(await loadCatalogItems('/api/central-servicos/faturamentos', normalizeInvoice))
    }

    const invoiceClientOptions = Array.from(new Set(invoiceState.items.map((item) => item.cliente).filter(Boolean))).sort((a, b) => compareText(a, b))
    const invoiceContractOptions = Array.from(new Set(invoiceState.items.map((item) => item.contrato).filter(Boolean))).sort((a, b) => compareText(a, b))
    const invoiceAvailableContractOptions = invoiceExportFilters.clientes.length === 0
      ? invoiceContractOptions
      : Array.from(new Set(
          invoiceState.items
            .filter((item) => invoiceExportFilters.clientes.includes(item.cliente))
            .map((item) => item.contrato)
            .filter(Boolean),
        )).sort((a, b) => compareText(a, b))

    const handleGenerateInvoiceSpreadsheet = () => {
      const { clientes, contratos, emissaoDe, emissaoAte, previsaoDe, previsaoAte } = invoiceExportFilters
      const emissaoDeStamp = emissaoDe ? toSortableDate(emissaoDe) : null
      const emissaoAteStamp = emissaoAte ? toSortableDate(emissaoAte) : null
      const previsaoDeStamp = previsaoDe ? toSortableDate(previsaoDe) : null
      const previsaoAteStamp = previsaoAte ? toSortableDate(previsaoAte) : null

      const rows = invoiceState.items.filter((item) => {
        if (clientes.length > 0 && item.cliente && !clientes.includes(item.cliente)) return false
        if (contratos.length > 0 && item.contrato && !contratos.includes(item.contrato)) return false
        if (emissaoDeStamp !== null && toSortableDate(item.emissao) < emissaoDeStamp) return false
        if (emissaoAteStamp !== null && toSortableDate(item.emissao) > emissaoAteStamp) return false
        if (previsaoDeStamp !== null && toSortableDate(item.previsaoPagamento) < previsaoDeStamp) return false
        if (previsaoAteStamp !== null && toSortableDate(item.previsaoPagamento) > previsaoAteStamp) return false
        return true
      })

      const sheetRows = rows.map((item) => ({
        Título: item.titulo,
        Nota: item.nota,
        Cliente: item.cliente,
        Contrato: item.contrato,
        Emissão: formatDateDisplay(item.emissao),
        Quantidade: item.quantidade,
        'Previsão de Pagamento': formatDateDisplay(item.previsaoPagamento),
        Valor: item.valor,
        Status: item.status,
        'Data de Pagamento': formatDateDisplay(item.dataPagamento),
      }))

      const worksheet = XLSX.utils.json_to_sheet(sheetRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Faturamentos')
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `faturamentos-${today}.xlsx`)
      setInvoiceExportOpen(false)
    }

    const selectedInvoiceClientCount = invoiceExportFilters.clientes.length
    const invoiceClientFilterLabel = selectedInvoiceClientCount === 0
      ? 'Nenhum cliente selecionado'
      : selectedInvoiceClientCount === invoiceClientOptions.length
        ? 'Todos os clientes'
        : `${selectedInvoiceClientCount} cliente(s) selecionado(s)`
    const selectedInvoiceContractCount = invoiceExportFilters.contratos.length
    const invoiceContractFilterLabel = selectedInvoiceContractCount === 0
      ? 'Nenhum contrato selecionado'
      : selectedInvoiceContractCount === invoiceAvailableContractOptions.length
        ? 'Todos os contratos'
        : `${selectedInvoiceContractCount} contrato(s) selecionado(s)`

    return (
      <div className="customer-hub central-servicos">
        {invoiceExportOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={() => setInvoiceExportOpen(false)}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-export-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="invoice-export-modal-title">Gerar Planilha de Faturamentos</h3>
                  <p className="muted">Selecione os filtros desejados para exportar os faturamentos em Excel.</p>
                </div>
                <button type="button" className="button-secondary" onClick={() => setInvoiceExportOpen(false)}>Fechar</button>
              </div>

              <div className="estimativas-form">
                <div className="estimativas-form__full payment-export-filter">
                  <div className="payment-export-filter__header">
                    <strong>Cliente</strong>
                    <div className="ch-row-actions" style={{ gap: '0.45rem' }}>
                      <button type="button" className="button-secondary" onClick={() => setInvoiceExportFilters((prev) => ({ ...prev, clientes: invoiceClientOptions }))}>Todos</button>
                      <button type="button" className="button-secondary" onClick={() => setInvoiceExportFilters((prev) => ({ ...prev, clientes: [] }))}>Limpar</button>
                    </div>
                  </div>
                  <div className="agenda-resource-filter__dropdown" ref={invoiceExportClientDropdownRef}>
                    <button
                      type="button"
                      className="agenda-resource-filter__trigger"
                      aria-expanded={invoiceExportClientDropdownOpen}
                      aria-controls="invoice-export-client-list"
                      onClick={() => setInvoiceExportClientDropdownOpen((prev) => !prev)}
                    >
                      <span>{invoiceClientFilterLabel}</span>
                      <span className="agenda-resource-filter__chevron" aria-hidden="true">▾</span>
                    </button>
                    {invoiceExportClientDropdownOpen && (
                      <div id="invoice-export-client-list" className="agenda-resource-filter__grid">
                        {invoiceClientOptions.map((cliente) => (
                          <label key={cliente} className="agenda-resource-filter__option">
                            <input
                              type="checkbox"
                              checked={invoiceExportFilters.clientes.includes(cliente)}
                              onChange={(event) => setInvoiceExportFilters((prev) => {
                                const clientes = event.target.checked
                                  ? Array.from(new Set([...prev.clientes, cliente]))
                                  : prev.clientes.filter((item) => item !== cliente)
                                const availableContracts = clientes.length === 0
                                  ? invoiceContractOptions
                                  : Array.from(new Set(
                                      invoiceState.items
                                        .filter((item) => clientes.includes(item.cliente))
                                        .map((item) => item.contrato)
                                        .filter(Boolean),
                                    ))
                                return { ...prev, clientes, contratos: prev.contratos.filter((c) => availableContracts.includes(c)) }
                              })}
                            />
                            <span>{cliente}</span>
                          </label>
                        ))}
                        {invoiceClientOptions.length === 0 && <span className="muted">Nenhum cliente encontrado.</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="estimativas-form__full payment-export-filter">
                  <div className="payment-export-filter__header">
                    <strong>Contrato</strong>
                    <div className="ch-row-actions" style={{ gap: '0.45rem' }}>
                      <button type="button" className="button-secondary" onClick={() => setInvoiceExportFilters((prev) => ({ ...prev, contratos: invoiceAvailableContractOptions }))}>Todos</button>
                      <button type="button" className="button-secondary" onClick={() => setInvoiceExportFilters((prev) => ({ ...prev, contratos: [] }))}>Limpar</button>
                    </div>
                  </div>
                  <div className="agenda-resource-filter__dropdown" ref={invoiceExportContractDropdownRef}>
                    <button
                      type="button"
                      className="agenda-resource-filter__trigger"
                      aria-expanded={invoiceExportContractDropdownOpen}
                      aria-controls="invoice-export-contract-list"
                      onClick={() => setInvoiceExportContractDropdownOpen((prev) => !prev)}
                    >
                      <span>{invoiceContractFilterLabel}</span>
                      <span className="agenda-resource-filter__chevron" aria-hidden="true">▾</span>
                    </button>
                    {invoiceExportContractDropdownOpen && (
                      <div id="invoice-export-contract-list" className="agenda-resource-filter__grid">
                        {invoiceAvailableContractOptions.map((contrato) => (
                          <label key={contrato} className="agenda-resource-filter__option">
                            <input
                              type="checkbox"
                              checked={invoiceExportFilters.contratos.includes(contrato)}
                              onChange={(event) => setInvoiceExportFilters((prev) => ({
                                ...prev,
                                contratos: event.target.checked
                                  ? Array.from(new Set([...prev.contratos, contrato]))
                                  : prev.contratos.filter((item) => item !== contrato),
                              }))}
                            />
                            <span>{contrato}</span>
                          </label>
                        ))}
                        {invoiceAvailableContractOptions.length === 0 && <span className="muted">Nenhum contrato encontrado.</span>}
                      </div>
                    )}
                  </div>
                </div>

                <label>
                  Emissão de
                  <input type="date" value={invoiceExportFilters.emissaoDe} onChange={(event) => setInvoiceExportFilters((prev) => ({ ...prev, emissaoDe: event.target.value }))} />
                </label>
                <label>
                  Emissão até
                  <input type="date" value={invoiceExportFilters.emissaoAte} onChange={(event) => setInvoiceExportFilters((prev) => ({ ...prev, emissaoAte: event.target.value }))} />
                </label>
                <label>
                  Previsão pagamento de
                  <input type="date" value={invoiceExportFilters.previsaoDe} onChange={(event) => setInvoiceExportFilters((prev) => ({ ...prev, previsaoDe: event.target.value }))} />
                </label>
                <label>
                  Previsão pagamento até
                  <input type="date" value={invoiceExportFilters.previsaoAte} onChange={(event) => setInvoiceExportFilters((prev) => ({ ...prev, previsaoAte: event.target.value }))} />
                </label>

                <div className="estimativas-actions estimativas-form__full">
                  <button type="button" className="button-primary" onClick={handleGenerateInvoiceSpreadsheet}>
                    Gerar planilha
                  </button>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}

        {invoiceEditorOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closeInvoiceEditor}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="invoice-modal-title">{invoiceIsViewMode ? 'Visualizar Faturamento' : invoiceState.editingId ? 'Editar Faturamento' : 'Novo Faturamento'}</h3>
                  <p className="muted">Controle notas, emissão, referência, previsão de pagamento e status.</p>
                </div>
                <button type="button" className="button-secondary" onClick={closeInvoiceEditor}>Fechar</button>
              </div>

              <form onSubmit={handleSaveInvoice} className="estimativas-form">
                <label>
                  Título
                  <input value={invoiceState.form.titulo} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, titulo: event.target.value }))} readOnly={invoiceIsViewMode} required />
                </label>
                <label>
                  Nota
                  <input value={invoiceState.form.nota} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, nota: event.target.value }))} readOnly={invoiceIsViewMode} />
                </label>
                <label>
                  Emissão
                  <input type="date" value={invoiceState.form.emissao} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, emissao: event.target.value }))} disabled={invoiceIsViewMode} />
                </label>
                <label>
                  Referência
                  <input type="month" value={invoiceState.form.referencia} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, referencia: event.target.value }))} disabled={invoiceIsViewMode} />
                </label>
                <label>
                  Previsão de Pagamento
                  <input type="date" value={invoiceState.form.previsaoPagamento} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, previsaoPagamento: event.target.value }))} disabled={invoiceIsViewMode} />
                </label>
                <label>
                  Cliente
                  <select value={invoiceState.form.cliente} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, cliente: event.target.value, contrato: '', contratoId: '', quantidade: '' }))} disabled={invoiceIsViewMode}>
                    <option value="">— Selecione —</option>
                    {clientOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label>
                  Contrato
                  <select value={invoiceState.form.contratoId} onChange={(event) => {
                    const selected = contractsForLinking.find((contract) => String(contract.id) === event.target.value)
                    invoiceState.setForm((prev) => ({ ...prev, contratoId: event.target.value, contrato: selected?.titulo ?? '', quantidade: selected?.tipoContrato === 'Banco de Horas' ? prev.quantidade : '' }))
                  }} disabled={invoiceIsViewMode || !invoiceState.form.cliente}>
                    <option value="">— Selecione —</option>
                    {contractsForLinking
                      .filter((c) => c.status === 'Ativo' && c.tipo === 'Cliente' && c.relaciona === invoiceState.form.cliente)
                      .map((c) => <option key={c.id} value={String(c.id)}>{c.titulo} v{c.versao}{c.tipoContrato === 'Banco de Horas' ? ` (saldo: ${c.saldoQuantidade ?? 0} h)` : ''}</option>)}
                  </select>
                </label>
                {contractsForLinking.find((contract) => String(contract.id) === invoiceState.form.contratoId)?.tipoContrato === 'Banco de Horas' && (
                  <label>
                    Quantidade Faturada
                    <input type="number" min="0.01" step="0.01" value={invoiceState.form.quantidade} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, quantidade: event.target.value }))} readOnly={invoiceIsViewMode} required />
                  </label>
                )}
                <label>
                  Valor
                  <input type="text" inputMode="decimal" value={formatCurrencyInputBrl(invoiceState.form.valor)} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, valor: parseCurrencyInputBrl(event.target.value) }))} readOnly={invoiceIsViewMode} placeholder="R$ 0,00" />
                </label>
                <label>
                  Status
                  <select value={invoiceState.form.status} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, status: event.target.value as InvoiceStatus }))} disabled={invoiceIsViewMode}>
                    {INVOICE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Data de Pagamento
                  <input type="date" value={invoiceState.form.dataPagamento} onChange={(event) => invoiceState.setForm((prev) => ({ ...prev, dataPagamento: event.target.value }))} disabled={invoiceIsViewMode} />
                </label>
                <div className="estimativas-form__full rich-field">
                  <span className="rich-field__label">Descrição</span>
                  <RichTextEditor value={invoiceState.form.descricao} onChange={(value) => invoiceState.setForm((prev) => ({ ...prev, descricao: value }))} placeholder="Descreva o faturamento." rows={4} disabled={invoiceIsViewMode} />
                </div>
                {!invoiceIsViewMode && (
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary" disabled={invoiceState.isSaving}>
                      {invoiceState.editingId ? 'Salvar alterações' : 'Cadastrar faturamento'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          </div>,
          document.body,
        )}

        {invoiceState.error && <p className="error">{invoiceState.error}</p>}
        {invoiceState.success && <p className="success">{invoiceState.success}</p>}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>{meta.title}</h2>
              <p className="muted">{meta.description}</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => {
                invoiceState.setForm(EMPTY_INVOICE_FORM)
                invoiceState.setEditingId(null)
                setInvoiceIsViewMode(false)
                setInvoiceEditorOpen(true)
              }}>
                + Novo Faturamento
              </button>
              <button type="button" className="button-secondary" onClick={() => {
                setInvoiceExportFilters(EMPTY_INVOICE_EXPORT_FILTERS)
                setInvoiceExportClientDropdownOpen(false)
                setInvoiceExportContractDropdownOpen(false)
                setInvoiceExportOpen(true)
              }}>
                Gerar Planilha
              </button>
            </div>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input type="search" value={invoiceState.search} onChange={(event) => invoiceState.setSearch(event.target.value)} placeholder={meta.searchPlaceholder} aria-label="Buscar faturamento" />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader('Título', invoiceSort.key === 'titulo', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'titulo', direction: getNextDirection(prev.key, 'titulo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Nota', invoiceSort.key === 'nota', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'nota', direction: getNextDirection(prev.key, 'nota', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Cliente', invoiceSort.key === 'cliente', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'cliente', direction: getNextDirection(prev.key, 'cliente', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Contrato', invoiceSort.key === 'contrato', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'contrato', direction: getNextDirection(prev.key, 'contrato', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Emissão', invoiceSort.key === 'emissao', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'emissao', direction: getNextDirection(prev.key, 'emissao', prev.direction) })))}</th>
                  <th>Quantidade</th>
                  <th>{renderSortableHeader('Valor', invoiceSort.key === 'valor', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'valor', direction: getNextDirection(prev.key, 'valor', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Status', invoiceSort.key === 'status', invoiceSort.direction, () => setInvoiceSort((prev) => ({ key: 'status', direction: getNextDirection(prev.key, 'status', prev.direction) })))}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.titulo}</td>
                    <td>{item.nota || '-'}</td>
                    <td>{item.cliente || '-'}</td>
                    <td>{item.contrato || '-'}</td>
                    <td>{formatDateDisplay(item.emissao)}</td>
                    <td>{item.quantidade === null ? '-' : item.quantidade}</td>
                    <td>{formatCurrencyDisplay(item.valor)}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${item.status === 'Pago' ? 'ativo' : 'implantacao'}`}>{item.status}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Visualizar faturamento" title="Visualizar" onClick={() => {
                          invoiceState.setForm({
                            titulo: item.titulo,
                            nota: item.nota,
                            emissao: item.emissao,
                            referencia: item.referencia,
                            previsaoPagamento: item.previsaoPagamento,
                            cliente: item.cliente,
                            contrato: item.contrato,
                            contratoId: item.contratoId === null ? '' : String(item.contratoId),
                            descricao: item.descricao,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            valor: item.valor === null ? '' : String(item.valor),
                            status: item.status,
                            dataPagamento: item.dataPagamento,
                          })
                          invoiceState.setEditingId(item.id)
                          setInvoiceIsViewMode(true)
                          setInvoiceEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar faturamento" title="Editar" onClick={() => {
                          invoiceState.setForm({
                            titulo: item.titulo,
                            nota: item.nota,
                            emissao: item.emissao,
                            referencia: item.referencia,
                            previsaoPagamento: item.previsaoPagamento,
                            cliente: item.cliente,
                            contrato: item.contrato,
                            contratoId: item.contratoId === null ? '' : String(item.contratoId),
                            descricao: item.descricao,
                            quantidade: item.quantidade === null ? '' : String(item.quantidade),
                            valor: item.valor === null ? '' : String(item.valor),
                            status: item.status,
                            dataPagamento: item.dataPagamento,
                          })
                          invoiceState.setEditingId(item.id)
                          setInvoiceIsViewMode(false)
                          setInvoiceEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                          <button type="button" className="ch-icon-action" aria-label="Duplicar faturamento" title="Duplicar" onClick={() => {
                            invoiceState.setForm({
                              titulo: item.titulo,
                              nota: item.nota,
                              emissao: item.emissao,
                              referencia: item.referencia,
                              previsaoPagamento: item.previsaoPagamento,
                              cliente: item.cliente,
                              contrato: item.contrato,
                              contratoId: item.contratoId === null ? '' : String(item.contratoId),
                              descricao: item.descricao,
                              quantidade: item.quantidade === null ? '' : String(item.quantidade),
                              valor: item.valor === null ? '' : String(item.valor),
                              status: item.status,
                              dataPagamento: item.dataPagamento,
                            })
                            invoiceState.setEditingId(null)
                            setInvoiceIsViewMode(false)
                            setInvoiceEditorOpen(true)
                          }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" /></svg>
                          </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir faturamento" title="Excluir" onClick={() => void handleDeleteItem('/api/central-servicos/faturamentos', item.id, reload, 'Faturamento removido com sucesso.', invoiceState.setError, invoiceState.setSuccess)} disabled={invoiceState.isSaving}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedItems.length === 0 && <tr><td colSpan={9} className="ch-empty">Nenhum faturamento cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  const renderPaymentSection = () => {
    const term = paymentState.search.trim().toLowerCase()
    const filteredItems = !term ? paymentState.items : paymentState.items.filter((item) => (
        item.titulo.toLowerCase().includes(term)
        || item.nota.toLowerCase().includes(term)
        || item.tipo.toLowerCase().includes(term)
        || item.relaciona.toLowerCase().includes(term)
        || item.contrato.toLowerCase().includes(term)
        || item.status.toLowerCase().includes(term)
      ))
    const sortedItems = [...filteredItems].sort((a, b) => {
      let result = 0
      if (paymentSort.key === 'titulo') result = compareText(a.titulo, b.titulo)
      if (paymentSort.key === 'tipo') result = compareText(a.tipo, b.tipo)
      if (paymentSort.key === 'relaciona') result = compareText(a.relaciona, b.relaciona)
      if (paymentSort.key === 'contrato') result = compareText(a.contrato, b.contrato)
      if (paymentSort.key === 'emissao') result = toSortableDate(a.emissao) - toSortableDate(b.emissao)
      if (paymentSort.key === 'previsaoPagamento') result = toSortableDate(a.previsaoPagamento) - toSortableDate(b.previsaoPagamento)
      if (paymentSort.key === 'valor') result = compareNullableNumber(a.valor, b.valor)
      if (paymentSort.key === 'status') result = compareText(a.status, b.status)
      return applyDirection(result, paymentSort.direction)
    })

    const reload = async () => {
      paymentState.setItems(await loadCatalogItems('/api/central-servicos/pagamentos', normalizePayment))
    }

    const paymentContractOptions = Array.from(new Set(paymentState.items.map((item) => item.contrato).filter(Boolean))).sort((a, b) => compareText(a, b))

    const handleGeneratePaymentSpreadsheet = () => {
      const { recursos, contratos, emissaoDe, emissaoAte, previsaoDe, previsaoAte } = paymentExportFilters
      const emissaoDeStamp = emissaoDe ? toSortableDate(emissaoDe) : null
      const emissaoAteStamp = emissaoAte ? toSortableDate(emissaoAte) : null
      const previsaoDeStamp = previsaoDe ? toSortableDate(previsaoDe) : null
      const previsaoAteStamp = previsaoAte ? toSortableDate(previsaoAte) : null

      const rows = paymentState.items.filter((item) => {
        if (recursos.length > 0 && item.tipo === 'Recurso' && !recursos.includes(item.relaciona)) return false
        if (contratos.length > 0 && item.contrato && !contratos.includes(item.contrato)) return false
        if (emissaoDeStamp !== null && toSortableDate(item.emissao) < emissaoDeStamp) return false
        if (emissaoAteStamp !== null && toSortableDate(item.emissao) > emissaoAteStamp) return false
        if (previsaoDeStamp !== null && toSortableDate(item.previsaoPagamento) < previsaoDeStamp) return false
        if (previsaoAteStamp !== null && toSortableDate(item.previsaoPagamento) > previsaoAteStamp) return false
        return true
      })

      const sheetRows = rows.map((item) => ({
        Título: item.titulo,
        Nota: item.nota,
        Tipo: item.tipo,
        Relaciona: item.relaciona,
        Contrato: item.contrato,
        Emissão: formatDateDisplay(item.emissao),
        'Previsão de Pagamento': formatDateDisplay(item.previsaoPagamento),
        Valor: item.valor,
        Status: item.status,
        'Data de Pagamento': formatDateDisplay(item.dataPagamento),
      }))

      const worksheet = XLSX.utils.json_to_sheet(sheetRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagamentos')
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `pagamentos-${today}.xlsx`)
      setPaymentExportOpen(false)
    }

    const selectedResourceCount = paymentExportFilters.recursos.length
    const paymentResourceFilterLabel = selectedResourceCount === 0
      ? 'Nenhum recurso selecionado'
      : selectedResourceCount === resourceOptions.length
        ? 'Todos os recursos'
        : `${selectedResourceCount} recurso(s) selecionado(s)`
    const selectedContractCount = paymentExportFilters.contratos.length
    const paymentContractFilterLabel = selectedContractCount === 0
      ? 'Nenhum contrato selecionado'
      : selectedContractCount === paymentContractOptions.length
        ? 'Todos os contratos'
        : `${selectedContractCount} contrato(s) selecionado(s)`

    return (
      <div className="customer-hub central-servicos">
        {paymentExportOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={() => setPaymentExportOpen(false)}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="payment-export-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="payment-export-modal-title">Gerar Planilha de Pagamentos</h3>
                  <p className="muted">Selecione os filtros desejados para exportar os pagamentos em Excel.</p>
                </div>
                <button type="button" className="button-secondary" onClick={() => setPaymentExportOpen(false)}>Fechar</button>
              </div>

              <div className="estimativas-form">
                <div className="estimativas-form__full payment-export-filter">
                  <div className="payment-export-filter__header">
                    <strong>Recurso</strong>
                    <div className="ch-row-actions" style={{ gap: '0.45rem' }}>
                      <button type="button" className="button-secondary" onClick={() => setPaymentExportFilters((prev) => ({ ...prev, recursos: resourceOptions }))}>Todos</button>
                      <button type="button" className="button-secondary" onClick={() => setPaymentExportFilters((prev) => ({ ...prev, recursos: [] }))}>Limpar</button>
                    </div>
                  </div>
                  <div className="agenda-resource-filter__dropdown" ref={paymentExportResourceDropdownRef}>
                    <button
                      type="button"
                      className="agenda-resource-filter__trigger"
                      aria-expanded={paymentExportResourceDropdownOpen}
                      aria-controls="payment-export-resource-list"
                      onClick={() => setPaymentExportResourceDropdownOpen((prev) => !prev)}
                    >
                      <span>{paymentResourceFilterLabel}</span>
                      <span className="agenda-resource-filter__chevron" aria-hidden="true">▾</span>
                    </button>
                    {paymentExportResourceDropdownOpen && (
                      <div id="payment-export-resource-list" className="agenda-resource-filter__grid">
                        {resourceOptions.map((resource) => (
                          <label key={resource} className="agenda-resource-filter__option">
                            <input
                              type="checkbox"
                              checked={paymentExportFilters.recursos.includes(resource)}
                              onChange={(event) => setPaymentExportFilters((prev) => ({
                                ...prev,
                                recursos: event.target.checked
                                  ? Array.from(new Set([...prev.recursos, resource]))
                                  : prev.recursos.filter((item) => item !== resource),
                              }))}
                            />
                            <span>{resource}</span>
                          </label>
                        ))}
                        {resourceOptions.length === 0 && <span className="muted">Nenhum recurso cadastrado.</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="estimativas-form__full payment-export-filter">
                  <div className="payment-export-filter__header">
                    <strong>Contrato</strong>
                    <div className="ch-row-actions" style={{ gap: '0.45rem' }}>
                      <button type="button" className="button-secondary" onClick={() => setPaymentExportFilters((prev) => ({ ...prev, contratos: paymentContractOptions }))}>Todos</button>
                      <button type="button" className="button-secondary" onClick={() => setPaymentExportFilters((prev) => ({ ...prev, contratos: [] }))}>Limpar</button>
                    </div>
                  </div>
                  <div className="agenda-resource-filter__dropdown" ref={paymentExportContractDropdownRef}>
                    <button
                      type="button"
                      className="agenda-resource-filter__trigger"
                      aria-expanded={paymentExportContractDropdownOpen}
                      aria-controls="payment-export-contract-list"
                      onClick={() => setPaymentExportContractDropdownOpen((prev) => !prev)}
                    >
                      <span>{paymentContractFilterLabel}</span>
                      <span className="agenda-resource-filter__chevron" aria-hidden="true">▾</span>
                    </button>
                    {paymentExportContractDropdownOpen && (
                      <div id="payment-export-contract-list" className="agenda-resource-filter__grid">
                        {paymentContractOptions.map((contrato) => (
                          <label key={contrato} className="agenda-resource-filter__option">
                            <input
                              type="checkbox"
                              checked={paymentExportFilters.contratos.includes(contrato)}
                              onChange={(event) => setPaymentExportFilters((prev) => ({
                                ...prev,
                                contratos: event.target.checked
                                  ? Array.from(new Set([...prev.contratos, contrato]))
                                  : prev.contratos.filter((item) => item !== contrato),
                              }))}
                            />
                            <span>{contrato}</span>
                          </label>
                        ))}
                        {paymentContractOptions.length === 0 && <span className="muted">Nenhum contrato encontrado.</span>}
                      </div>
                    )}
                  </div>
                </div>

                <label>
                  Emissão de
                  <input type="date" value={paymentExportFilters.emissaoDe} onChange={(event) => setPaymentExportFilters((prev) => ({ ...prev, emissaoDe: event.target.value }))} />
                </label>
                <label>
                  Emissão até
                  <input type="date" value={paymentExportFilters.emissaoAte} onChange={(event) => setPaymentExportFilters((prev) => ({ ...prev, emissaoAte: event.target.value }))} />
                </label>
                <label>
                  Previsão pagamento de
                  <input type="date" value={paymentExportFilters.previsaoDe} onChange={(event) => setPaymentExportFilters((prev) => ({ ...prev, previsaoDe: event.target.value }))} />
                </label>
                <label>
                  Previsão pagamento até
                  <input type="date" value={paymentExportFilters.previsaoAte} onChange={(event) => setPaymentExportFilters((prev) => ({ ...prev, previsaoAte: event.target.value }))} />
                </label>

                <div className="estimativas-actions estimativas-form__full">
                  <button type="button" className="button-primary" onClick={handleGeneratePaymentSpreadsheet}>
                    Gerar planilha
                  </button>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}

        {paymentEditorOpen && createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={closePaymentEditor}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="estimativas-modal__header">
                <div>
                  <h3 id="payment-modal-title">{paymentIsViewMode ? 'Visualizar Pagamento' : paymentState.editingId ? 'Editar Pagamento' : 'Novo Pagamento'}</h3>
                  <p className="muted">Registre pagamentos previstos e realizados com referência e status.</p>
                </div>
                <button type="button" className="button-secondary" onClick={closePaymentEditor}>Fechar</button>
              </div>

              <form onSubmit={handleSavePayment} className="estimativas-form">
                <label>
                  Título
                  <input value={paymentState.form.titulo} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, titulo: event.target.value }))} readOnly={paymentIsViewMode} required />
                </label>
                <label>
                  Nota
                  <input value={paymentState.form.nota} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, nota: event.target.value }))} readOnly={paymentIsViewMode} />
                </label>
                <label>
                  Emissão
                  <input type="date" value={paymentState.form.emissao} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, emissao: event.target.value }))} disabled={paymentIsViewMode} />
                </label>
                <label>
                  Referência
                  <input type="month" value={paymentState.form.referencia} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, referencia: event.target.value }))} disabled={paymentIsViewMode} />
                </label>
                <label>
                  Previsão de Pagamento
                  <input type="date" value={paymentState.form.previsaoPagamento} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, previsaoPagamento: event.target.value }))} disabled={paymentIsViewMode} />
                </label>
                <label>
                  Tipo
                  <select value={paymentState.form.tipo} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, tipo: event.target.value as RelationType, relaciona: '', contrato: '' }))} disabled={paymentIsViewMode}>
                    {RELATION_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Relaciona
                  <select value={paymentState.form.relaciona} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, relaciona: event.target.value, contrato: '' }))} disabled={paymentIsViewMode}>
                    <option value="">— Selecione —</option>
                    {(paymentState.form.tipo === 'Cliente' ? clientOptions : resourceOptions).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label>
                  Contrato
                  <select value={paymentState.form.contrato} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, contrato: event.target.value }))} disabled={paymentIsViewMode || !paymentState.form.relaciona}>
                    <option value="">— Nenhum —</option>
                    {contractsForLinking
                      .filter((c) => c.status === 'Ativo' && c.tipo === paymentState.form.tipo && c.relaciona === paymentState.form.relaciona)
                      .map((c) => <option key={c.id} value={c.titulo}>{c.titulo}</option>)}
                  </select>
                </label>
                <label>
                  Valor
                  <input type="text" inputMode="decimal" value={formatCurrencyInputBrl(paymentState.form.valor)} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, valor: parseCurrencyInputBrl(event.target.value) }))} readOnly={paymentIsViewMode} placeholder="R$ 0,00" />
                </label>
                <label>
                  Status
                  <select value={paymentState.form.status} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, status: event.target.value as PaymentStatus }))} disabled={paymentIsViewMode}>
                    {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Data de Pagamento
                  <input type="date" value={paymentState.form.dataPagamento} onChange={(event) => paymentState.setForm((prev) => ({ ...prev, dataPagamento: event.target.value }))} disabled={paymentIsViewMode} />
                </label>
                <div className="estimativas-form__full rich-field">
                  <span className="rich-field__label">Descrição</span>
                  <RichTextEditor value={paymentState.form.descricao} onChange={(value) => paymentState.setForm((prev) => ({ ...prev, descricao: value }))} placeholder="Descreva o pagamento." rows={4} disabled={paymentIsViewMode} />
                </div>
                {!paymentIsViewMode && (
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary" disabled={paymentState.isSaving}>
                      {paymentState.editingId ? 'Salvar alterações' : 'Cadastrar pagamento'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          </div>,
          document.body,
        )}

        {paymentState.error && <p className="error">{paymentState.error}</p>}
        {paymentState.success && <p className="success">{paymentState.success}</p>}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>{meta.title}</h2>
              <p className="muted">{meta.description}</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => {
                paymentState.setForm(EMPTY_PAYMENT_FORM)
                paymentState.setEditingId(null)
                setPaymentIsViewMode(false)
                setPaymentEditorOpen(true)
              }}>
                + Novo Pagamento
              </button>
              <button type="button" className="button-secondary" onClick={() => {
                setPaymentExportFilters(EMPTY_PAYMENT_EXPORT_FILTERS)
                setPaymentExportResourceDropdownOpen(false)
                setPaymentExportContractDropdownOpen(false)
                setPaymentExportOpen(true)
              }}>
                Gerar Planilha
              </button>
            </div>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input type="search" value={paymentState.search} onChange={(event) => paymentState.setSearch(event.target.value)} placeholder={meta.searchPlaceholder} aria-label="Buscar pagamento" />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader('Título', paymentSort.key === 'titulo', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'titulo', direction: getNextDirection(prev.key, 'titulo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Tipo', paymentSort.key === 'tipo', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'tipo', direction: getNextDirection(prev.key, 'tipo', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Relaciona', paymentSort.key === 'relaciona', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'relaciona', direction: getNextDirection(prev.key, 'relaciona', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Contrato', paymentSort.key === 'contrato', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'contrato', direction: getNextDirection(prev.key, 'contrato', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Emissão', paymentSort.key === 'emissao', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'emissao', direction: getNextDirection(prev.key, 'emissao', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Previsão Pagamento', paymentSort.key === 'previsaoPagamento', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'previsaoPagamento', direction: getNextDirection(prev.key, 'previsaoPagamento', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Valor', paymentSort.key === 'valor', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'valor', direction: getNextDirection(prev.key, 'valor', prev.direction) })))}</th>
                  <th>{renderSortableHeader('Status', paymentSort.key === 'status', paymentSort.direction, () => setPaymentSort((prev) => ({ key: 'status', direction: getNextDirection(prev.key, 'status', prev.direction) })))}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.titulo}</td>
                    <td>{item.tipo}</td>
                    <td>{item.relaciona || '-'}</td>
                    <td>{item.contrato || '-'}</td>
                    <td>{formatDateDisplay(item.emissao)}</td>
                    <td>{formatDateDisplay(item.previsaoPagamento)}</td>
                    <td>{formatCurrencyDisplay(item.valor)}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${item.status === 'Pago' ? 'ativo' : 'implantacao'}`}>{item.status}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Visualizar pagamento" title="Visualizar" onClick={() => {
                          paymentState.setForm({
                            titulo: item.titulo,
                            nota: item.nota,
                            emissao: item.emissao,
                            referencia: item.referencia,
                            previsaoPagamento: item.previsaoPagamento,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            contrato: item.contrato,
                            descricao: item.descricao,
                            valor: item.valor === null ? '' : String(item.valor),
                            status: item.status,
                            dataPagamento: item.dataPagamento,
                          })
                          paymentState.setEditingId(item.id)
                          setPaymentIsViewMode(true)
                          setPaymentEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar pagamento" title="Editar" onClick={() => {
                          paymentState.setForm({
                            titulo: item.titulo,
                            nota: item.nota,
                            emissao: item.emissao,
                            referencia: item.referencia,
                            previsaoPagamento: item.previsaoPagamento,
                            tipo: item.tipo,
                            relaciona: item.relaciona,
                            contrato: item.contrato,
                            descricao: item.descricao,
                            valor: item.valor === null ? '' : String(item.valor),
                            status: item.status,
                            dataPagamento: item.dataPagamento,
                          })
                          paymentState.setEditingId(item.id)
                          setPaymentIsViewMode(false)
                          setPaymentEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                          <button type="button" className="ch-icon-action" aria-label="Duplicar pagamento" title="Duplicar" onClick={() => {
                            paymentState.setForm({
                              titulo: item.titulo,
                              nota: item.nota,
                              emissao: item.emissao,
                              referencia: item.referencia,
                              previsaoPagamento: item.previsaoPagamento,
                              tipo: item.tipo,
                              relaciona: item.relaciona,
                              contrato: item.contrato,
                              descricao: item.descricao,
                              valor: item.valor === null ? '' : String(item.valor),
                              status: item.status,
                              dataPagamento: item.dataPagamento,
                            })
                            paymentState.setEditingId(null)
                            setPaymentIsViewMode(false)
                          setPaymentEditorOpen(true)
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir pagamento" title="Excluir" onClick={() => void handleDeleteItem('/api/central-servicos/pagamentos', item.id, reload, 'Pagamento removido com sucesso.', paymentState.setError, paymentState.setSuccess)} disabled={paymentState.isSaving}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedItems.length === 0 && <tr><td colSpan={9} className="ch-empty">Nenhum pagamento cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  if (subPage === 'dashboard') return renderDashboardSection()
  if (subPage === 'agenda') return renderAgendaSection()
  if (subPage === 'atendimentos') return <AtendimentoReportsTool />
  if (subPage === 'recursos') return renderResourceSection()
  if (subPage === 'contratos-servicos') return renderContractSection()
  if (subPage === 'despesas') return renderExpenseSection()
  if (subPage === 'faturamento') return renderInvoiceSection()
  return renderPaymentSection()
}
