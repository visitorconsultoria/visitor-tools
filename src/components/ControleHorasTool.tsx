import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../lib/api'
import { confirmAction } from '../lib/confirmDialog'
import { BRAND_COLORS, exportCustomWorkbook } from '../lib/xlsxBranding'

type ControleStatus = 'Aberto' | 'Fechado'
type MovimentoTipo = 'Prévia' | 'Débito'

type MovimentoItem = {
  id: string
  movimento: string
  data: string
  tipo: MovimentoTipo
  referencia: string
  recursoId: number | null
  consultor: string
  horas: number
  valorHoraConsultor: number | null
}

type ControleItem = {
  id: number
  titulo: string
  cliente: string
  contratoId: number | null
  contrato: string
  competencia: string
  horasContratadas: number | null
  valorHoraCliente: number | null
  valorHoraConsultor: number | null
  percentualImpostos: number | null
  percentualMargem: number | null
  horasReserva: number | null
  consultoresPagos: string[]
  movimentos: MovimentoItem[]
  observacoes: string
  status: ControleStatus
}

type MovimentoForm = {
  id: string
  movimento: string
  data: string
  tipo: MovimentoTipo
  referencia: string
  recursoId: string
  horas: string
  valorHoraConsultor: string
}

type ControleForm = {
  titulo: string
  cliente: string
  contratoId: string
  contrato: string
  competencia: string
  horasContratadas: string
  valorHoraCliente: string
  valorHoraConsultor: string
  percentualImpostos: string
  percentualMargem: string
  horasReserva: string
  consultoresPagos: string[]
  movimentos: MovimentoForm[]
  observacoes: string
  status: ControleStatus
}

type ResourceOption = { id: number; nome: string; status: string }

type ContractOption = {
  id: number
  titulo: string
  cliente: string
  quantidade: number | null
  valorUnitario: number | null
  status: string
}

type ControleCalcInput = {
  horasContratadas: number
  valorHoraCliente: number
  valorHoraConsultor: number
  percentualImpostos: number
  percentualMargem: number
  horasReserva: number
  consultoresPagos: string[]
  movimentos: MovimentoItem[]
}

type ControleResumoConsultor = {
  consultor: string
  horas: number
  custo: number
  pago: boolean
}

type ControleCalc = {
  totalCliente: number
  totalValorMovimentos: number
  totalHoras: number
  horasPrevia: number
  horasDebito: number
  saldoHoras: number
  custoConsultores: number
  custoReserva: number
  impostos: number
  margem: number
  margemParte1: number
  margemParte2: number
  percentualMargem: number
  resumo: ControleResumoConsultor[]
  totalGeralHoras: number
  totalGeralValor: number
  linhas: Array<MovimentoItem & { valor: number; custo: number; valorHoraAplicado: number }>
}

const STATUS_OPTIONS: ControleStatus[] = ['Aberto', 'Fechado']
const TIPO_OPTIONS: MovimentoTipo[] = ['Prévia', 'Débito']
const MOVIMENTO_SUGGESTIONS = ['AGENDA', 'ATENDIMENTO', 'PROJETO', 'AVULSO']

const DEFAULT_VALOR_HORA_CONSULTOR = '70'
const DEFAULT_PERCENTUAL_IMPOSTOS = '22'
const DEFAULT_PERCENTUAL_MARGEM = '35'

function toCanonicalCompetencia(value: string): string {
  const input = String(value || '').trim()
  const inputMatch = input.match(/^(\d{2})(\d{4})$/)
  if (inputMatch && Number(inputMatch[1]) >= 1 && Number(inputMatch[1]) <= 12) {
    return `${inputMatch[2]}-${inputMatch[1]}`
  }
  const storedMatch = input.match(/^(\d{4})-(\d{2})$/)
  if (storedMatch && Number(storedMatch[2]) >= 1 && Number(storedMatch[2]) <= 12) return input
  return input
}

function toCompetenciaInput(value: string): string {
  const canonical = toCanonicalCompetencia(value)
  const match = canonical.match(/^(\d{4})-(\d{2})$/)
  return match ? `${match[2]}${match[1]}` : canonical
}

function isValidCompetenciaInput(value: string): boolean {
  if (!value) return true
  const match = value.match(/^(\d{2})(\d{4})$/)
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= 12 && Number(match[2]) > 0)
}

function getCurrentCompetencia(): string {
  const now = new Date()
  return `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`
}

function createEmptyForm(): ControleForm {
  return {
    titulo: '',
    cliente: '',
    contratoId: '',
    contrato: '',
    competencia: getCurrentCompetencia(),
    horasContratadas: '',
    valorHoraCliente: '',
    valorHoraConsultor: DEFAULT_VALOR_HORA_CONSULTOR,
    percentualImpostos: DEFAULT_PERCENTUAL_IMPOSTOS,
    percentualMargem: DEFAULT_PERCENTUAL_MARGEM,
    horasReserva: '0',
    consultoresPagos: [],
    movimentos: [],
    observacoes: '',
    status: 'Aberto',
  }
}

function createMovimentoId(): string {
  return `mov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptyMovimento(data = ''): MovimentoForm {
  return {
    id: createMovimentoId(),
    movimento: 'AGENDA',
    data,
    tipo: 'Prévia',
    referencia: '',
    recursoId: '',
    horas: '',
    valorHoraConsultor: '',
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function toNumber(value: unknown, fallback = 0): number {
  return toNumberOrNull(value) ?? fallback
}

function numberToInput(value: number | null): string {
  return value === null ? '' : String(value)
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatHours(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function formatCompetencia(value: string): string {
  return toCompetenciaInput(value) || '-'
}

function buildSuggestedTitle(competencia: string): string {
  const match = toCanonicalCompetencia(competencia).match(/^(\d{4})-(\d{2})$/)
  if (!match) return 'BANCO DE HORAS'
  const month = new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return `BANCO DE HORAS - FAT. ${month.toUpperCase()}`
}

function normalizeMovimento(input: unknown, index: number): MovimentoItem {
  const item = (input ?? {}) as Record<string, unknown>
  const tipo = String(item.tipo ?? '').trim()
  const recursoId = Number(item.recursoId)
  return {
    id: String(item.id ?? '').trim() || `mov-${index + 1}`,
    movimento: String(item.movimento ?? '').trim() || 'AGENDA',
    data: String(item.data ?? '').trim(),
    tipo: TIPO_OPTIONS.includes(tipo as MovimentoTipo) ? tipo as MovimentoTipo : 'Prévia',
    referencia: String(item.referencia ?? ''),
    recursoId: Number.isInteger(recursoId) && recursoId > 0 ? recursoId : null,
    consultor: String(item.consultor ?? ''),
    horas: toNumber(item.horas),
    valorHoraConsultor: toNumberOrNull(item.valorHoraConsultor),
  }
}

function normalizeControle(input: unknown): ControleItem | null {
  const item = (input ?? {}) as Record<string, unknown>
  const id = Number(item.id)
  if (!Number.isInteger(id) || id <= 0) return null
  const status = String(item.status ?? '').trim()
  const contratoId = Number(item.contratoId)
  return {
    id,
    titulo: String(item.titulo ?? ''),
    cliente: String(item.cliente ?? ''),
    contratoId: Number.isInteger(contratoId) && contratoId > 0 ? contratoId : null,
    contrato: String(item.contrato ?? ''),
    competencia: toCanonicalCompetencia(String(item.competencia ?? '')),
    horasContratadas: toNumberOrNull(item.horasContratadas),
    valorHoraCliente: toNumberOrNull(item.valorHoraCliente),
    valorHoraConsultor: toNumberOrNull(item.valorHoraConsultor),
    percentualImpostos: toNumberOrNull(item.percentualImpostos),
    percentualMargem: toNumberOrNull(item.percentualMargem),
    horasReserva: toNumberOrNull(item.horasReserva),
    consultoresPagos: Array.isArray(item.consultoresPagos) ? item.consultoresPagos.map((v) => String(v)) : [],
    movimentos: Array.isArray(item.movimentos) ? item.movimentos.map(normalizeMovimento) : [],
    observacoes: String(item.observacoes ?? ''),
    status: STATUS_OPTIONS.includes(status as ControleStatus) ? status as ControleStatus : 'Aberto',
  }
}

function normalizeContractOption(input: unknown): ContractOption | null {
  const item = (input ?? {}) as Record<string, unknown>
  const id = Number(item.id)
  const tipoContrato = String(item.tipoContrato ?? item.tipo_contrato ?? '').trim()
  const tipo = String(item.tipo ?? '').trim()
  if (!Number.isInteger(id) || id <= 0) return null
  if (tipoContrato !== 'Banco de Horas' || (tipo && tipo !== 'Cliente')) return null
  return {
    id,
    titulo: String(item.titulo ?? ''),
    cliente: String(item.relaciona ?? ''),
    quantidade: toNumberOrNull(item.quantidade),
    valorUnitario: toNumberOrNull(item.valorUnitario ?? item.valor_unitario),
    status: String(item.status ?? ''),
  }
}

/** Replica os cálculos da planilha "BANCO DE HORAS - FAT." (valor, custo, impostos, margem e resumo por consultor). */
function computeControle(input: ControleCalcInput): ControleCalc {
  const totalCliente = input.horasContratadas * input.valorHoraCliente
  const linhas = input.movimentos.map((movimento) => {
    const valorHoraAplicado = movimento.valorHoraConsultor ?? input.valorHoraConsultor
    return {
      ...movimento,
      valorHoraAplicado,
      valor: movimento.horas * input.valorHoraCliente,
      custo: movimento.horas * valorHoraAplicado,
    }
  })

  const totalHoras = linhas.reduce((sum, linha) => sum + linha.horas, 0)
  const totalValorMovimentos = linhas.reduce((sum, linha) => sum + linha.valor, 0)
  const custoConsultores = linhas.reduce((sum, linha) => sum + linha.custo, 0)
  const horasPrevia = linhas.filter((linha) => linha.tipo === 'Prévia').reduce((sum, linha) => sum + linha.horas, 0)
  const horasDebito = linhas.filter((linha) => linha.tipo === 'Débito').reduce((sum, linha) => sum + linha.horas, 0)
  const custoReserva = input.horasReserva * input.valorHoraConsultor
  const impostos = totalCliente * (input.percentualImpostos / 100)
  const margem = totalCliente - custoConsultores - impostos
  const percentualMargem = input.percentualMargem

  const pagos = new Set(input.consultoresPagos.map((nome) => nome.toLowerCase()))
  const resumoMap = new Map<string, ControleResumoConsultor>()
  linhas.forEach((linha) => {
    const key = linha.consultor.trim().toLowerCase()
    if (!key) return
    const current = resumoMap.get(key) ?? { consultor: linha.consultor.trim(), horas: 0, custo: 0, pago: pagos.has(key) }
    current.horas += linha.horas
    current.custo += linha.custo
    resumoMap.set(key, current)
  })
  const resumo = Array.from(resumoMap.values()).sort((a, b) => a.consultor.localeCompare(b.consultor, 'pt-BR'))

  return {
    totalCliente,
    totalValorMovimentos,
    totalHoras,
    horasPrevia,
    horasDebito,
    saldoHoras: input.horasContratadas - totalHoras,
    custoConsultores,
    custoReserva,
    impostos,
    margem,
    margemParte1: margem * (percentualMargem / 100),
    margemParte2: margem * ((100 - percentualMargem) / 100),
    percentualMargem,
    resumo,
    totalGeralHoras: totalHoras + input.horasReserva,
    totalGeralValor: custoConsultores + custoReserva + impostos + margem,
    linhas,
  }
}

function controleToCalcInput(item: ControleItem): ControleCalcInput {
  return {
    horasContratadas: item.horasContratadas ?? 0,
    valorHoraCliente: item.valorHoraCliente ?? 0,
    valorHoraConsultor: item.valorHoraConsultor ?? toNumber(DEFAULT_VALOR_HORA_CONSULTOR),
    percentualImpostos: item.percentualImpostos ?? toNumber(DEFAULT_PERCENTUAL_IMPOSTOS),
    percentualMargem: item.percentualMargem ?? toNumber(DEFAULT_PERCENTUAL_MARGEM),
    horasReserva: item.horasReserva ?? 0,
    consultoresPagos: item.consultoresPagos,
    movimentos: item.movimentos,
  }
}

function formToControle(form: ControleForm, resources: ResourceOption[], id = 0): ControleItem {
  const resourceById = new Map(resources.map((resource) => [resource.id, resource.nome]))
  return {
    id,
    titulo: form.titulo.trim(),
    cliente: form.cliente.trim(),
    contratoId: toNumberOrNull(form.contratoId),
    contrato: form.contrato.trim(),
    competencia: toCanonicalCompetencia(form.competencia),
    horasContratadas: toNumberOrNull(form.horasContratadas),
    valorHoraCliente: toNumberOrNull(form.valorHoraCliente),
    valorHoraConsultor: toNumberOrNull(form.valorHoraConsultor),
    percentualImpostos: toNumberOrNull(form.percentualImpostos),
    percentualMargem: toNumberOrNull(form.percentualMargem),
    horasReserva: toNumberOrNull(form.horasReserva),
    consultoresPagos: form.consultoresPagos,
    movimentos: form.movimentos.map((movimento) => {
      const recursoId = toNumberOrNull(movimento.recursoId)
      return {
        id: movimento.id,
        movimento: movimento.movimento.trim() || 'AGENDA',
        data: movimento.data,
        tipo: movimento.tipo,
        referencia: movimento.referencia.trim(),
        recursoId,
        consultor: recursoId ? resourceById.get(recursoId) ?? '' : '',
        horas: toNumber(movimento.horas),
        valorHoraConsultor: toNumberOrNull(movimento.valorHoraConsultor),
      }
    }),
    observacoes: form.observacoes,
    status: form.status,
  }
}

function controleToForm(item: ControleItem, resources: ResourceOption[]): ControleForm {
  const resourceIdByName = new Map(resources.map((resource) => [resource.nome.trim().toLowerCase(), resource.id]))
  return {
    titulo: item.titulo,
    cliente: item.cliente,
    contratoId: item.contratoId ? String(item.contratoId) : '',
    contrato: item.contrato,
    competencia: toCompetenciaInput(item.competencia),
    horasContratadas: numberToInput(item.horasContratadas),
    valorHoraCliente: numberToInput(item.valorHoraCliente),
    valorHoraConsultor: numberToInput(item.valorHoraConsultor),
    percentualImpostos: numberToInput(item.percentualImpostos),
    percentualMargem: numberToInput(item.percentualMargem),
    horasReserva: numberToInput(item.horasReserva),
    consultoresPagos: [...item.consultoresPagos],
    movimentos: item.movimentos.map((movimento) => {
      const recursoId = movimento.recursoId ?? resourceIdByName.get(movimento.consultor.trim().toLowerCase()) ?? null
      return {
        id: movimento.id,
        movimento: movimento.movimento,
        data: movimento.data,
        tipo: movimento.tipo,
        referencia: movimento.referencia,
        recursoId: recursoId ? String(recursoId) : '',
        horas: String(movimento.horas),
        valorHoraConsultor: numberToInput(movimento.valorHoraConsultor),
      }
    }),
    observacoes: item.observacoes,
    status: item.status,
  }
}

async function readApiError(response: Response, fallback: string): Promise<never> {
  let detail = fallback
  try {
    const payload = await response.json() as { error?: string }
    detail = payload?.error ?? fallback
  } catch {
    detail = response.statusText || fallback
  }
  throw new Error(detail)
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Não foi possível conectar na API local. Inicie frontend + API com npm run dev:all.'
  }
  if (error instanceof Error) return error.message || fallback
  return fallback
}

const CURRENCY_FMT = '"R$" #,##0.00'
const HOURS_FMT = '#,##0.##'

async function exportControleWorkbook(item: ControleItem): Promise<void> {
  const calc = computeControle(controleToCalcInput(item))
  const valorHoraConsultor = item.valorHoraConsultor ?? toNumber(DEFAULT_VALOR_HORA_CONSULTOR)
  const percentualImpostos = item.percentualImpostos ?? toNumber(DEFAULT_PERCENTUAL_IMPOSTOS)
  const sheetName = (item.titulo || 'Banco de Horas').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
  const fileSlug = (item.titulo || 'banco-de-horas').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

  await exportCustomWorkbook(`${fileSlug || 'banco-de-horas'}.xlsx`, ({ workbook, logoImageId }) => {
    const ws = workbook.addWorksheet(sheetName)
    ws.columns = [
      { width: 16 }, { width: 13 }, { width: 12 }, { width: 16 }, { width: 22 }, { width: 22 },
      { width: 22 }, { width: 22 }, { width: 14 }, { width: 16 }, { width: 16 },
    ]

    const border = {
      top: { style: 'thin', color: { argb: BRAND_COLORS.border } },
      bottom: { style: 'thin', color: { argb: BRAND_COLORS.border } },
      left: { style: 'thin', color: { argb: BRAND_COLORS.border } },
      right: { style: 'thin', color: { argb: BRAND_COLORS.border } },
    }
    const fill = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const styleLabel = (cell: any) => {
      cell.font = { bold: true, color: { argb: BRAND_COLORS.white } }
      cell.fill = fill(BRAND_COLORS.header)
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = border
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const styleValue = (cell: any, numFmt?: string, bold = false) => {
      cell.border = border
      cell.alignment = { vertical: 'middle' }
      if (numFmt) cell.numFmt = numFmt
      if (bold) cell.font = { bold: true }
    }
    const setFormula = (ref: string, formula: string, result: number, numFmt?: string, bold = false) => {
      const cell = ws.getCell(ref)
      cell.value = { formula, result }
      styleValue(cell, numFmt, bold)
      return cell
    }
    const setValue = (ref: string, value: unknown, numFmt?: string, bold = false) => {
      const cell = ws.getCell(ref)
      cell.value = value
      styleValue(cell, numFmt, bold)
      return cell
    }
    const setLabel = (ref: string, value: string) => {
      const cell = ws.getCell(ref)
      cell.value = value
      styleLabel(cell)
      return cell
    }

    // Título
    ws.mergeCells('A1:K1')
    const titleCell = ws.getCell('A1')
    titleCell.value = item.titulo || buildSuggestedTitle(item.competencia)
    titleCell.font = { bold: true, size: 14, color: { argb: BRAND_COLORS.white } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    titleCell.fill = fill(BRAND_COLORS.title)
    ws.getRow(1).height = 30
    ws.addImage(logoImageId, { tl: { col: 0.12, row: 0.12 }, ext: { width: 76, height: 27 } })

    // Identificação
    setLabel('A2', 'CLIENTE')
    ws.mergeCells('B2:D2')
    setValue('B2', item.cliente, undefined, true)
    setLabel('E2', 'CONTRATO')
    ws.mergeCells('F2:G2')
    setValue('F2', item.contrato || '-')
    setLabel('H2', 'COMPETÊNCIA')
    setValue('I2', formatCompetencia(item.competencia))
    setLabel('J2', 'STATUS')
    setValue('K2', item.status)

    // Parâmetros (linha 3) - mesmas colunas da planilha original
    setLabel('A3', 'PARÂMETROS')
    setLabel('B3', 'H.CONTRATADAS')
    setValue('C3', item.horasContratadas ?? 0, HOURS_FMT)
    setLabel('D3', 'VLR.HORA')
    setValue('E3', item.valorHoraCliente ?? 0, CURRENCY_FMT)
    setLabel('F3', 'TOTAL CLIENTE')
    setFormula('G3', 'E3*C3', calc.totalCliente, CURRENCY_FMT, true)
    setLabel('H3', 'VLR.HORA CONSULTOR')
    setValue('I3', valorHoraConsultor, CURRENCY_FMT)
    setLabel('J3', 'H. CONSULTORES')

    // Movimentos
    const headerRow = 4
    const headers: Array<[string, string]> = [
      ['A', 'MOVIMENTO'], ['B', 'DATA'], ['C', 'TIPO'], ['D', 'VALOR'], ['E', 'REFERÊNCIA'],
      ['H', 'CONSULTOR'], ['I', 'HORAS'], ['J', 'DISPONIVEL'], ['K', 'PREVISTO'],
    ]
    ws.mergeCells(`E${headerRow}:G${headerRow}`)
    headers.forEach(([col, label]) => setLabel(`${col}${headerRow}`, label))

    const firstMovRow = headerRow + 1
    calc.linhas.forEach((linha, index) => {
      const r = firstMovRow + index
      setValue(`A${r}`, linha.movimento)
      const dateMatch = linha.data.match(/^(\d{4})-(\d{2})-(\d{2})/)
      setValue(`B${r}`, dateMatch ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))) : '', 'dd/mm/yyyy')
      setValue(`C${r}`, linha.tipo)
      setFormula(`D${r}`, `$E$3*I${r}`, linha.valor, CURRENCY_FMT)
      ws.mergeCells(`E${r}:G${r}`)
      setValue(`E${r}`, linha.referencia)
      setValue(`H${r}`, linha.consultor)
      setValue(`I${r}`, linha.horas, HOURS_FMT)
      if (linha.valorHoraConsultor !== null) {
        setFormula(`J${r}`, `I${r}*${linha.valorHoraConsultor}`, linha.custo, CURRENCY_FMT)
      } else {
        setFormula(`J${r}`, `I${r}*$I$3`, linha.custo, CURRENCY_FMT)
      }
      setFormula(`K${r}`, `J${r}`, linha.custo, CURRENCY_FMT)
      if (index % 2 === 1) {
        ;['A', 'B', 'C', 'D', 'E', 'H', 'I', 'J', 'K'].forEach((col) => { ws.getCell(`${col}${r}`).fill = fill(BRAND_COLORS.stripe) })
      }
    })

    const lastMovRow = Math.max(firstMovRow, firstMovRow + calc.linhas.length - 1)
    const totalRow = firstMovRow + Math.max(calc.linhas.length, 1)
    setLabel(`A${totalRow}`, 'TOTAIS')
    setFormula(`D${totalRow}`, `SUM(D${firstMovRow}:D${lastMovRow})`, calc.totalValorMovimentos, CURRENCY_FMT, true)
    setLabel(`H${totalRow}`, 'RESULTADO')
    setFormula(`I${totalRow}`, `SUM(I${firstMovRow}:I${lastMovRow})`, calc.totalHoras, HOURS_FMT, true)
    setFormula(`J${totalRow}`, `SUM(J${firstMovRow}:J${lastMovRow})`, calc.custoConsultores, CURRENCY_FMT, true)
    setFormula(`K${totalRow}`, `SUM(K${firstMovRow}:K${lastMovRow})`, calc.custoConsultores, CURRENCY_FMT, true)
    setLabel(`H${totalRow + 1}`, 'SALDO HORAS')
    setFormula(`I${totalRow + 1}`, `C3-I${totalRow}`, calc.saldoHoras, HOURS_FMT, true)

    // Margem
    const margemHeaderRow = totalRow + 3
    const margemRow = margemHeaderRow + 1
    const percentualMargem = calc.percentualMargem
    const resumoHeaderRow = margemRow + 3
    const firstResumoRow = resumoHeaderRow + 1
    const reservaRow = firstResumoRow + calc.resumo.length
    const impostosRow = reservaRow + 1
    const margemResumoRow = impostosRow + 1
    const totalGeralRow = margemResumoRow + 1

    setLabel(`G${margemHeaderRow}`, 'TOTAL MARGEM GARANTIDA')
    setLabel(`H${margemHeaderRow}`, `MARGEM ${formatHours(percentualMargem)}%`)
    setLabel(`I${margemHeaderRow}`, `MARGEM ${formatHours(100 - percentualMargem)}%`)
    setFormula(`G${margemRow}`, `($G$3-$J$${totalRow}-$I$${impostosRow})`, calc.margem, CURRENCY_FMT, true)
    setFormula(`H${margemRow}`, `G${margemRow}*${percentualMargem / 100}`, calc.margemParte1, CURRENCY_FMT)
    setFormula(`I${margemRow}`, `G${margemRow}*${(100 - percentualMargem) / 100}`, calc.margemParte2, CURRENCY_FMT)

    // Resumo previsto por consultor
    setLabel(`G${resumoHeaderRow}`, 'RESUMOS PREVISTO')
    setLabel(`H${resumoHeaderRow}`, 'HORAS PROJETO')
    setLabel(`I${resumoHeaderRow}`, 'PREVISTO')
    setLabel(`J${resumoHeaderRow}`, 'SITUAÇÃO')
    const movRange = (col: string) => `$${col}$${firstMovRow}:$${col}$${lastMovRow}`
    calc.resumo.forEach((resumo, index) => {
      const r = firstResumoRow + index
      setValue(`G${r}`, resumo.consultor, undefined, true)
      setFormula(`H${r}`, `SUMIF(${movRange('H')},G${r},${movRange('I')})`, resumo.horas, HOURS_FMT)
      setFormula(`I${r}`, `SUMIF(${movRange('H')},G${r},${movRange('J')})`, resumo.custo, CURRENCY_FMT)
      setValue(`J${r}`, resumo.pago ? 'Pago' : 'Pendente')
    })
    setValue(`G${reservaRow}`, 'RESERVA', undefined, true)
    setValue(`H${reservaRow}`, item.horasReserva ?? 0, HOURS_FMT)
    setFormula(`I${reservaRow}`, `H${reservaRow}*$I$3`, calc.custoReserva, CURRENCY_FMT)
    setValue(`G${impostosRow}`, 'IMPOSTOS', undefined, true)
    setValue(`H${impostosRow}`, 0, HOURS_FMT)
    setFormula(`I${impostosRow}`, `$G$3*${percentualImpostos / 100}`, calc.impostos, CURRENCY_FMT)
    setValue(`G${margemResumoRow}`, 'MARGEM', undefined, true)
    setValue(`H${margemResumoRow}`, 0, HOURS_FMT)
    setFormula(`I${margemResumoRow}`, `$G$${margemRow}`, calc.margem, CURRENCY_FMT)
    setLabel(`G${totalGeralRow}`, 'Total Geral')
    setFormula(`H${totalGeralRow}`, `SUM(H${firstResumoRow}:H${margemResumoRow})`, calc.totalGeralHoras, HOURS_FMT, true)
    setFormula(`I${totalGeralRow}`, `SUM(I${firstResumoRow}:I${margemResumoRow})`, calc.totalGeralValor, CURRENCY_FMT, true)

    // H. CONSULTORES = total de horas previstas (consultores + reserva) x valor hora consultor
    setFormula('K3', `H${totalGeralRow}*I3`, calc.totalGeralHoras * valorHoraConsultor, CURRENCY_FMT, true)

    ws.views = [{ state: 'frozen', ySplit: headerRow }]
  })
}

export default function ControleHorasTool() {
  const [items, setItems] = useState<ControleItem[]>([])
  const [resources, setResources] = useState<ResourceOption[]>([])
  const [clientOptions, setClientOptions] = useState<string[]>([])
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [search, setSearch] = useState('')
  const [competenciaFilter, setCompetenciaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ControleStatus>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ControleForm>(createEmptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadData = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const [controlesResponse, resourcesResponse, clientsResponse, contractsResponse] = await Promise.all([
        fetch(apiUrl('/api/central-servicos/controles-horas')),
        fetch(apiUrl('/api/central-servicos/recursos')),
        fetch(apiUrl('/api/customer-hub/clients')),
        fetch(apiUrl('/api/central-servicos/contratos-servicos')),
      ])

      if (!controlesResponse.ok) await readApiError(controlesResponse, 'Falha ao carregar controles de horas.')
      if (!resourcesResponse.ok) await readApiError(resourcesResponse, 'Falha ao carregar recursos.')

      const controlesData = await controlesResponse.json() as { items?: unknown[] }
      const resourcesData = await resourcesResponse.json() as { items?: unknown[] }
      setItems((controlesData.items ?? []).map(normalizeControle).filter((item): item is ControleItem => Boolean(item)))
      setResources((resourcesData.items ?? [])
        .map((raw) => {
          const resource = raw as Record<string, unknown>
          const id = Number(resource.id)
          const nome = String(resource.nome ?? '').trim()
          return Number.isInteger(id) && id > 0 && nome ? { id, nome, status: String(resource.status ?? 'Ativo') } : null
        })
        .filter((resource): resource is ResourceOption => Boolean(resource))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))

      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json() as { items?: unknown[] }
        setClientOptions(Array.from(new Set((clientsData.items ?? [])
          .map((raw) => String((raw as { nome?: unknown }).nome ?? '').trim())
          .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')))
      }
      if (contractsResponse.ok) {
        const contractsData = await contractsResponse.json() as { items?: unknown[] }
        setContracts((contractsData.items ?? []).map(normalizeContractOption).filter((item): item is ContractOption => Boolean(item)))
      }
    } catch (loadError) {
      setError(toFriendlyApiError(loadError, 'Não foi possível carregar os controles de horas.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const calcByItemId = useMemo(() => {
    const map = new Map<number, ControleCalc>()
    items.forEach((item) => map.set(item.id, computeControle(controleToCalcInput(item))))
    return map
  }, [items])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    const competenciaTerm = competenciaFilter.trim()
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (competenciaTerm && !formatCompetencia(item.competencia).startsWith(competenciaTerm)) return false
      if (!term) return true
      return [item.titulo, item.cliente, item.contrato, item.competencia, formatCompetencia(item.competencia), item.status, ...item.movimentos.map((m) => `${m.consultor} ${m.referencia}`)]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [items, search, competenciaFilter, statusFilter])

  const overview = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const calc = calcByItemId.get(item.id)
      if (!calc) return acc
      acc.horasContratadas += item.horasContratadas ?? 0
      acc.horasUtilizadas += calc.totalHoras
      acc.totalCliente += calc.totalCliente
      acc.margem += calc.margem
      return acc
    }, { horasContratadas: 0, horasUtilizadas: 0, totalCliente: 0, margem: 0 })
  }, [filteredItems, calcByItemId])

  const formItem = useMemo(() => formToControle(form, resources, editingId ?? 0), [form, resources, editingId])
  const formCalc = useMemo(() => computeControle(controleToCalcInput(formItem)), [formItem])

  const availableContracts = useMemo(() => {
    const cliente = form.cliente.trim().toLowerCase()
    return contracts.filter((contract) => {
      if (String(contract.id) === form.contratoId) return true
      if (contract.status && contract.status !== 'Ativo') return false
      return !cliente || contract.cliente.trim().toLowerCase() === cliente
    })
  }, [contracts, form.cliente, form.contratoId])

  const openNew = () => {
    setEditingId(null)
    const empty = createEmptyForm()
    setForm({ ...empty, titulo: buildSuggestedTitle(empty.competencia) })
    setFormError(null)
    setSuccess(null)
    setEditorOpen(true)
  }

  const openEdit = (item: ControleItem) => {
    setEditingId(item.id)
    setForm(controleToForm(item, resources))
    setFormError(null)
    setSuccess(null)
    setEditorOpen(true)
  }

  const openDuplicate = (item: ControleItem) => {
    const base = controleToForm(item, resources)
    setEditingId(null)
    setForm({
      ...base,
      titulo: `${item.titulo} (cópia)`,
      consultoresPagos: [],
      status: 'Aberto',
      movimentos: base.movimentos.map((movimento) => ({ ...movimento, id: createMovimentoId() })),
    })
    setFormError(null)
    setSuccess(null)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    if (isSaving) return
    setEditorOpen(false)
    setEditingId(null)
    setForm(createEmptyForm())
    setFormError(null)
  }

  const updateForm = <K extends keyof ControleForm>(field: K, value: ControleForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCompetenciaChange = (value: string) => {
    const competencia = value.replace(/\D/g, '').slice(0, 6)
    setForm((prev) => {
      const shouldUpdateTitle = !prev.titulo.trim() || prev.titulo === buildSuggestedTitle(prev.competencia)
      return { ...prev, competencia, titulo: shouldUpdateTitle ? buildSuggestedTitle(competencia) : prev.titulo }
    })
  }

  const handleContractChange = (value: string) => {
    const contract = contracts.find((item) => String(item.id) === value)
    setForm((prev) => {
      if (!contract) return { ...prev, contratoId: '', contrato: '' }
      return {
        ...prev,
        contratoId: String(contract.id),
        contrato: contract.titulo,
        cliente: contract.cliente || prev.cliente,
        horasContratadas: contract.quantidade !== null ? String(contract.quantidade) : prev.horasContratadas,
        valorHoraCliente: contract.valorUnitario !== null ? String(contract.valorUnitario) : prev.valorHoraCliente,
      }
    })
  }

  const updateMovimento = (id: string, field: keyof MovimentoForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      movimentos: prev.movimentos.map((movimento) => (movimento.id === id ? { ...movimento, [field]: value } : movimento)),
    }))
  }

  const addMovimento = () => {
    setForm((prev) => {
      const last = prev.movimentos[prev.movimentos.length - 1]
      const competencia = toCanonicalCompetencia(prev.competencia)
      const defaultDate = last?.data || (/^\d{4}-\d{2}$/.test(competencia) ? `${competencia}-01` : '')
      return { ...prev, movimentos: [...prev.movimentos, createEmptyMovimento(defaultDate)] }
    })
  }

  const duplicateMovimento = (id: string) => {
    setForm((prev) => {
      const index = prev.movimentos.findIndex((movimento) => movimento.id === id)
      if (index < 0) return prev
      const copy = { ...prev.movimentos[index], id: createMovimentoId() }
      const movimentos = [...prev.movimentos]
      movimentos.splice(index + 1, 0, copy)
      return { ...prev, movimentos }
    })
  }

  const removeMovimento = (id: string) => {
    setForm((prev) => ({ ...prev, movimentos: prev.movimentos.filter((movimento) => movimento.id !== id) }))
  }

  const togglePago = (consultor: string) => {
    setForm((prev) => {
      const key = consultor.toLowerCase()
      const exists = prev.consultoresPagos.some((nome) => nome.toLowerCase() === key)
      return {
        ...prev,
        consultoresPagos: exists
          ? prev.consultoresPagos.filter((nome) => nome.toLowerCase() !== key)
          : [...prev.consultoresPagos, consultor],
      }
    })
  }

  const validateForm = (): string | null => {
    if (!form.titulo.trim()) return 'Informe o título do controle.'
    if (!form.cliente.trim()) return 'Informe o cliente.'
    if (!isValidCompetenciaInput(form.competencia)) return 'Informe a competência no formato MMAAAA, com mês entre 01 e 12.'
    for (let index = 0; index < form.movimentos.length; index += 1) {
      const movimento = form.movimentos[index]
      if (!movimento.recursoId) return `Movimento ${index + 1}: selecione o consultor (cadastro de Recursos).`
      if (!(toNumber(movimento.horas) > 0)) return `Movimento ${index + 1}: informe a quantidade de horas.`
    }
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    setIsSaving(true)
    try {
      // Mantém somente os consultores que ainda possuem movimentos no controle.
      const consultoresAtivos = new Set(formCalc.resumo.map((resumo) => resumo.consultor.toLowerCase()))
      const payload = {
        ...formItem,
        consultoresPagos: formItem.consultoresPagos.filter((nome) => consultoresAtivos.has(nome.toLowerCase())),
      }
      const isEdit = editingId !== null
      const response = await fetch(apiUrl(isEdit ? `/api/central-servicos/controles-horas/${editingId}` : '/api/central-servicos/controles-horas'), {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) await readApiError(response, 'Falha ao salvar controle de horas.')
      const data = await response.json() as { item?: unknown }
      const saved = normalizeControle(data.item)
      if (saved) {
        setItems((prev) => (isEdit ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev]))
      }
      setSuccess(isEdit ? 'Controle atualizado com sucesso.' : 'Controle cadastrado com sucesso.')
      setIsSaving(false)
      setEditorOpen(false)
      setEditingId(null)
      setForm(createEmptyForm())
    } catch (saveError) {
      setFormError(toFriendlyApiError(saveError, 'Não foi possível salvar o controle.'))
      setIsSaving(false)
    }
  }

  const handleDelete = async (item: ControleItem) => {
    if (!await confirmAction(`Confirma a exclusão do controle "${item.titulo}"?`)) return
    setError(null)
    setSuccess(null)
    setIsDeleting(item.id)
    try {
      const response = await fetch(apiUrl(`/api/central-servicos/controles-horas/${item.id}`), { method: 'DELETE' })
      if (!response.ok) await readApiError(response, 'Falha ao excluir controle.')
      setItems((prev) => prev.filter((current) => current.id !== item.id))
      setSuccess('Controle excluído com sucesso.')
    } catch (deleteError) {
      setError(toFriendlyApiError(deleteError, 'Não foi possível excluir o controle.'))
    } finally {
      setIsDeleting(null)
    }
  }

  const handleExport = async (item: ControleItem) => {
    setError(null)
    setFormError(null)
    try {
      await exportControleWorkbook(item)
    } catch (exportError) {
      const message = toFriendlyApiError(exportError, 'Falha ao gerar a planilha do controle.')
      if (editorOpen) setFormError(message)
      else setError(message)
    }
  }

  const resourceSelectOptions = (currentId: string) => resources.filter((resource) => resource.status === 'Ativo' || String(resource.id) === currentId)

  const renderSummaryCard = (label: string, value: string, sub?: string) => (
    <article className="card ch-stat-card" key={label}>
      <p className="ch-stat-card__label">{label}</p>
      <p className="ch-stat-card__value" style={{ fontSize: '1.35rem' }}>{value}</p>
      {sub && <p className="ch-stat-card__sub muted">{sub}</p>}
    </article>
  )

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Controle de Banco de Horas **EM DESENVOLVIMENTO**</h2>
            <p className="muted">Horas contratadas pelo cliente, movimentos por consultor (cadastro de Recursos), custos, impostos e margem.</p>
          </div>
          <div className="ch-header-actions">
            <button type="button" className="button-primary" onClick={openNew}>Novo controle</button>
          </div>
        </div>

        <div className="ch-stats" style={{ marginBottom: '1rem' }}>
          {renderSummaryCard('Horas contratadas', formatHours(overview.horasContratadas), `${filteredItems.length} controle(s)`)}
          {renderSummaryCard('Horas utilizadas', formatHours(overview.horasUtilizadas), `Saldo: ${formatHours(overview.horasContratadas - overview.horasUtilizadas)}`)}
          {renderSummaryCard('Total cliente', formatCurrency(overview.totalCliente))}
          {renderSummaryCard('Margem garantida', formatCurrency(overview.margem))}
        </div>

        <div className="estimativas-stats">
          <div className="daily-activities-controls">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ControleStatus)}>
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Competência (MMAAAA)"
              aria-label="Filtrar por competência no formato MMAAAA"
              value={competenciaFilter}
              onChange={(e) => setCompetenciaFilter(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button type="button" className="button-secondary" onClick={() => { void loadData() }} disabled={isLoading}>
              {isLoading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div className="ch-table-toolbar ch-table-toolbar--single">
          <label className="ch-table-search">
            <span className="ch-table-search__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </span>
            <input
              type="search"
              placeholder="Buscar por título, cliente, competência ou consultor"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar controle"
            />
          </label>
        </div>

        <div className="estimativas-table ch-table-theme">
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Cliente</th>
                <th>Competência</th>
                <th>H. Contratadas</th>
                <th>H. Utilizadas</th>
                <th>Saldo</th>
                <th>Total Cliente</th>
                <th>Custo Consultores</th>
                <th>Margem</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const calc = calcByItemId.get(item.id)
                if (!calc) return null
                return (
                  <tr key={item.id}>
                    <td>{item.titulo}</td>
                    <td>{item.cliente}</td>
                    <td>{formatCompetencia(item.competencia)}</td>
                    <td>{formatHours(item.horasContratadas ?? 0)}</td>
                    <td>{formatHours(calc.totalHoras)}</td>
                    <td style={{ color: calc.saldoHoras < 0 ? '#c0392b' : undefined, fontWeight: 700 }}>{formatHours(calc.saldoHoras)}</td>
                    <td>{formatCurrency(calc.totalCliente)}</td>
                    <td>{formatCurrency(calc.custoConsultores)}</td>
                    <td style={{ color: calc.margem < 0 ? '#c0392b' : undefined }}>{formatCurrency(calc.margem)}</td>
                    <td><span className={item.status === 'Fechado' ? 'ch-badge ch-badge--danger' : 'ch-badge'}>{item.status}</span></td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" title="Editar" onClick={() => openEdit(item)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" title="Gerar planilha" onClick={() => { void handleExport(item) }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action" title="Duplicar" onClick={() => openDuplicate(item)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" title="Excluir" onClick={() => { void handleDelete(item) }} disabled={isDeleting === item.id}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && !isLoading && <p className="muted">Nenhum controle encontrado.</p>}
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </section>

      {editorOpen && typeof document !== 'undefined' && createPortal(
        <div className="estimativas-modal-overlay" role="presentation">
          <section
            className="estimativas-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="controle-horas-modal-title"
            style={{ width: 'min(1320px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="estimativas-modal__header">
              <h3 id="controle-horas-modal-title">{editingId !== null ? 'Editar controle de banco de horas' : 'Novo controle de banco de horas'}</h3>
              <div className="ch-row-actions" style={{ gap: '0.45rem' }}>
                <button type="button" className="button-secondary" onClick={() => { void handleExport(formItem) }} disabled={isSaving}>Gerar Planilha</button>
                <button type="button" className="button-secondary" onClick={closeEditor} disabled={isSaving}>Fechar</button>
              </div>
            </div>

            <form className="estimativas-form" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))' }} onSubmit={(e) => { void handleSubmit(e) }}>
              <label style={{ gridColumn: 'span 2' }}>
                Título *
                <input type="text" value={form.titulo} onChange={(e) => updateForm('titulo', e.target.value)} placeholder="Ex: BANCO DE HORAS - FAT. JUNHO" required />
              </label>
              <label>
                Competência (MMAAAA)
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="032026"
                  value={form.competencia}
                  onChange={(e) => handleCompetenciaChange(e.target.value)}
                  aria-label="Competência no formato MMAAAA"
                />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(e) => updateForm('status', e.target.value as ControleStatus)}>
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Cliente *
                <input
                  list="controle-horas-client-options"
                  type="text"
                  value={form.cliente}
                  onChange={(e) => updateForm('cliente', e.target.value)}
                  placeholder="Nome do cliente"
                  required
                />
                <datalist id="controle-horas-client-options">
                  {clientOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Contrato (Banco de Horas)
                <select value={form.contratoId} onChange={(e) => handleContractChange(e.target.value)}>
                  <option value="">Sem vínculo com contrato</option>
                  {availableContracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>{contract.titulo}{contract.cliente ? ` — ${contract.cliente}` : ''}</option>
                  ))}
                </select>
              </label>
              <label>
                Horas contratadas
                <input type="number" min="0" step="0.01" value={form.horasContratadas} onChange={(e) => updateForm('horasContratadas', e.target.value)} />
              </label>
              <label>
                Valor hora cliente (R$)
                <input type="number" min="0" step="0.01" value={form.valorHoraCliente} onChange={(e) => updateForm('valorHoraCliente', e.target.value)} />
              </label>
              <label>
                Valor hora consultor (R$)
                <input type="number" min="0" step="0.01" value={form.valorHoraConsultor} onChange={(e) => updateForm('valorHoraConsultor', e.target.value)} />
              </label>
              <label>
                Horas de reserva
                <input type="number" min="0" step="0.01" value={form.horasReserva} onChange={(e) => updateForm('horasReserva', e.target.value)} />
              </label>
              <label>
                Impostos (%)
                <input type="number" min="0" max="100" step="0.01" value={form.percentualImpostos} onChange={(e) => updateForm('percentualImpostos', e.target.value)} />
              </label>
              <label>
                Divisão da margem (%)
                <input type="number" min="0" max="100" step="0.01" value={form.percentualMargem} onChange={(e) => updateForm('percentualMargem', e.target.value)} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Observações
                <input type="text" value={form.observacoes} onChange={(e) => updateForm('observacoes', e.target.value)} placeholder="Informações adicionais (opcional)" />
              </label>

              <div className="estimativas-form__full">
                <div className="estimativas-header-row" style={{ marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Movimentos</h4>
                  <button type="button" className="button-secondary" onClick={addMovimento}>Adicionar movimento</button>
                </div>
                <div className="estimativas-table ch-table-theme" style={{ overflowX: 'auto' }}>
                  <table style={{ minWidth: '1150px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '120px' }}>Movimento</th>
                        <th style={{ width: '140px' }}>Data</th>
                        <th style={{ width: '105px' }}>Tipo</th>
                        <th>Referência</th>
                        <th style={{ width: '190px' }}>Consultor *</th>
                        <th style={{ width: '85px' }}>Horas *</th>
                        <th style={{ width: '110px' }}>Vlr. hora consultor</th>
                        <th style={{ width: '115px' }}>Valor</th>
                        <th style={{ width: '115px' }}>Disponível</th>
                        <th style={{ width: '70px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.movimentos.map((movimento, index) => {
                        const linha = formCalc.linhas[index]
                        return (
                          <tr key={movimento.id}>
                            <td>
                              <input list="controle-horas-movimento-options" type="text" value={movimento.movimento} onChange={(e) => updateMovimento(movimento.id, 'movimento', e.target.value)} />
                            </td>
                            <td>
                              <input type="date" value={movimento.data} onChange={(e) => updateMovimento(movimento.id, 'data', e.target.value)} />
                            </td>
                            <td>
                              <select value={movimento.tipo} onChange={(e) => updateMovimento(movimento.id, 'tipo', e.target.value)}>
                                {TIPO_OPTIONS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                              </select>
                            </td>
                            <td>
                              <input type="text" value={movimento.referencia} onChange={(e) => updateMovimento(movimento.id, 'referencia', e.target.value)} placeholder="#599 - INDICADORES..." />
                            </td>
                            <td>
                              <select value={movimento.recursoId} onChange={(e) => updateMovimento(movimento.id, 'recursoId', e.target.value)} required>
                                <option value="">Selecione o recurso</option>
                                {resourceSelectOptions(movimento.recursoId).map((resource) => (
                                  <option key={resource.id} value={resource.id}>{resource.nome}{resource.status !== 'Ativo' ? ` (${resource.status})` : ''}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input type="number" min="0" step="0.01" value={movimento.horas} onChange={(e) => updateMovimento(movimento.id, 'horas', e.target.value)} required />
                            </td>
                            <td>
                              <input type="number" min="0" step="0.01" value={movimento.valorHoraConsultor} onChange={(e) => updateMovimento(movimento.id, 'valorHoraConsultor', e.target.value)} placeholder={form.valorHoraConsultor || '-'} title="Deixe em branco para usar o valor hora consultor do controle" />
                            </td>
                            <td>{formatCurrency(linha?.valor ?? 0)}</td>
                            <td>{formatCurrency(linha?.custo ?? 0)}</td>
                            <td>
                              <div className="ch-row-actions ch-row-actions--icons">
                                <button type="button" className="ch-icon-action" title="Duplicar movimento" onClick={() => duplicateMovimento(movimento.id)}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                </button>
                                <button type="button" className="ch-icon-action ch-icon-action--danger" title="Remover movimento" onClick={() => removeMovimento(movimento.id)}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {!form.movimentos.length && (
                        <tr><td colSpan={10} className="muted">Nenhum movimento lançado. Clique em "Adicionar movimento".</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 800 }}>
                        <td colSpan={5}>TOTAIS</td>
                        <td>{formatHours(formCalc.totalHoras)}</td>
                        <td />
                        <td>{formatCurrency(formCalc.totalValorMovimentos)}</td>
                        <td>{formatCurrency(formCalc.custoConsultores)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  <datalist id="controle-horas-movimento-options">
                    {MOVIMENTO_SUGGESTIONS.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </div>
              </div>

              <div className="estimativas-form__full ch-stats">
                {renderSummaryCard('Total cliente', formatCurrency(formCalc.totalCliente), `${formatHours(toNumber(form.horasContratadas))} h × ${formatCurrency(toNumber(form.valorHoraCliente))}`)}
                {renderSummaryCard('Saldo de horas', formatHours(formCalc.saldoHoras), `Prévia: ${formatHours(formCalc.horasPrevia)} h • Débito: ${formatHours(formCalc.horasDebito)} h`)}
                {renderSummaryCard('Custo consultores', formatCurrency(formCalc.custoConsultores), `Impostos: ${formatCurrency(formCalc.impostos)}`)}
                {renderSummaryCard(
                  'Total margem garantida',
                  formatCurrency(formCalc.margem),
                  `${formatHours(formCalc.percentualMargem)}%: ${formatCurrency(formCalc.margemParte1)} • ${formatHours(100 - formCalc.percentualMargem)}%: ${formatCurrency(formCalc.margemParte2)}`,
                )}
              </div>

              <div className="estimativas-form__full">
                <h4 style={{ margin: '0 0 0.5rem' }}>Resumo previsto</h4>
                <div className="estimativas-table ch-table-theme">
                  <table>
                    <thead>
                      <tr>
                        <th>Consultor</th>
                        <th>Horas projeto</th>
                        <th>Previsto</th>
                        <th>Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formCalc.resumo.map((resumo) => (
                        <tr key={resumo.consultor}>
                          <td>{resumo.consultor}</td>
                          <td>{formatHours(resumo.horas)}</td>
                          <td>{formatCurrency(resumo.custo)}</td>
                          <td>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                              <input type="checkbox" checked={resumo.pago} onChange={() => togglePago(resumo.consultor)} />
                              {resumo.pago ? 'Pago' : 'Pendente'}
                            </label>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td>RESERVA</td>
                        <td>{formatHours(toNumber(form.horasReserva))}</td>
                        <td>{formatCurrency(formCalc.custoReserva)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td>IMPOSTOS ({formatHours(toNumber(form.percentualImpostos))}%)</td>
                        <td>0</td>
                        <td>{formatCurrency(formCalc.impostos)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td>MARGEM</td>
                        <td>0</td>
                        <td>{formatCurrency(formCalc.margem)}</td>
                        <td />
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 800 }}>
                        <td>Total Geral</td>
                        <td>{formatHours(formCalc.totalGeralHoras)}</td>
                        <td>{formatCurrency(formCalc.totalGeralValor)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {formError && <p className="error estimativas-form__full">{formError}</p>}

              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : editingId !== null ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}
