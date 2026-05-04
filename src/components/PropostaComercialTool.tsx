import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { jsPDF } from 'jspdf'
import internalPartnerLogo from '../assets/logo_3.png'
import { apiUrl } from '../lib/api'
import RichTextEditor from './RichTextEditor'

// ─── Types ───────────────────────────────────────────────────────────────────

type PropostaStatus = 'draft' | 'sent'

type PrecificacaoItem = {
  escopo: string
  descricao: string
  valorMensal: string
}

type DeliveryItem = {
  tipoServico: string
  tipo: string
  valorUnit: string
}

type PropostaRow = {
  id: number
  cliente: string
  projeto: string
  contato: string
  tipo: string
  dataProposta: string
  desenvolvimento: boolean
  objetivo: string
  escopoTitulo: string
  escopoConteudo: string
  precificacaoTitulo: string
  precificacaoDescricao: string
  precificacaoItens: PrecificacaoItem[]
  bancoHorasConteudo: string
  deliveryItens: DeliveryItem[]
  outrasInformacoes: string
  incluirObjetivo: boolean
  incluirEscopo: boolean
  incluirPrecificacao: boolean
  incluirBancoHoras: boolean
  incluirDelivery: boolean
  incluirOutrasInformacoes: boolean
  status: PropostaStatus
  estimativaId: number | null
}

type FormState = {
  cliente: string
  projeto: string
  contato: string
  tipo: string
  dataProposta: string
  desenvolvimento: boolean
  objetivo: string
  escopoTitulo: string
  escopoConteudo: string
  precificacaoTitulo: string
  precificacaoDescricao: string
  precificacaoItens: PrecificacaoItem[]
  bancoHorasConteudo: string
  deliveryItens: DeliveryItem[]
  outrasInformacoes: string
  incluirObjetivo: boolean
  incluirEscopo: boolean
  incluirPrecificacao: boolean
  incluirBancoHoras: boolean
  incluirDelivery: boolean
  incluirOutrasInformacoes: boolean
  status: PropostaStatus
  estimativaId: number | null
}

type EstimativaOption = {
  id: number
  cliente: string
  demanda: string
  items: Array<{ detail: string; hours: string }>
}

// ─── PDF Colors ───────────────────────────────────────────────────────────────

const C_GREEN_DARK: [number, number, number] = [21, 92, 56]
const C_GREEN_MED: [number, number, number] = [34, 139, 87]
const C_GREEN_LIGHT_BG: [number, number, number] = [230, 243, 237]
const C_BOX_BG: [number, number, number] = [245, 250, 247]
const C_BOX_BORDER: [number, number, number] = [170, 210, 185]
const C_TABLE_HDR_BG: [number, number, number] = [21, 92, 56]
const C_TABLE_ROW_ALT: [number, number, number] = [247, 252, 249]
const C_BODY: [number, number, number] = [40, 40, 40]
const C_MUTED: [number, number, number] = [80, 80, 80]
const C_WHITE: [number, number, number] = [255, 255, 255]
const C_BORDER: [number, number, number] = [190, 218, 200]

// ─── Default content ─────────────────────────────────────────────────────────

const DEFAULT_OBJETIVO =
  '<p>Em atenção solicitação, apresentamos a seguir nossa Proposta Comercial nos termos abaixo.</p>'

const DEFAULT_ESCOPO_TITULO =
  'Sustentação – Consultoria especializada para Sustentação, Suporte, Manutenção e Desenvolvimento do ERP Protheus e seus Módulos de Negócio.'

const DEFAULT_ESCOPO_CONTEUDO =
  '<p><strong>Resumo:</strong></p>' +
  '<ul>' +
  '<li>Consultoria especializada nos sistemas TOTVS e temas de negócios relacionados.</li>' +
  '<li>Suporte na correção de problemas, atualizações e manutenções dos sistemas TOTVS.</li>' +
  '<li>Desenvolvimento, customizações e implementações de rotinas nos Sistemas TOTVS e suas integrações.</li>' +
  '</ul>' +
  '<p><strong>PREMISSAS:</strong></p>' +
  '<ul>' +
  '<li>É de responsabilidade da Visitor dispor e manter todos os equipamentos pessoais necessários para execução das atividades, como (Computador, telefone, internet, periféricos e afins)</li>' +
  '<li>O Expediente fixado é de segunda-feira a sexta-feira (exceto feriados) – das 09h às 18h00 com 01h00 de intervalo.</li>' +
  '<li>O modelo de atendimento e disponibilidade é programado em conjunto com o Cliente definir as atividades e sua Ordem de Prioridade, bem como o planejamento.</li>' +
  '<li>É de responsabilidade do Cliente a devida disponibilização dos ambientes de acesso, bem como a deliberação de informações e procedimentos pertinentes e/ou concorrentes com os processos internos e esclarecimento das regras e compliance da companhia.</li>' +
  '</ul>' +
  '<p><strong>LIMITAÇÕES COMPARTILHADAS:</strong></p>' +
  '<ul>' +
  '<li>A contratação de atendimento é remota, podendo existir visitas programadas previamente acordadas entre as partes de acordo com a necessidade do cliente e disponibilidade da contratada.</li>' +
  '<li>Eventuais custos de translado e hospedagem são de responsabilidade do Cliente.</li>' +
  '<li>A atuação nos aspectos técnicos é limitada às permissões funcionais do Sistema ERP Protheus, e a responsabilidade bem como Garantia do sistema é de seu Proprietário "Totvs S/A".</li>' +
  '<li>A volumetria de demanda de serviços para o suporte deve comportar o número de consultores contratados e disponibilizado, ficando a cargo do cliente o controle e acompanhamento de suas priorizações.</li>' +
  '</ul>'

const DEFAULT_PRECIFICACAO_TITULO = 'Consultoria Especializada'

const DEFAULT_PRECIFICACAO_DESCRICAO =
  '<p>Coordenação e Sustentação completa com a disponibilização de 01 Consultor Generalista e uma equipe de Consultores Especialistas de Negócio.</p>' +
  '<p>Neste modelo, a Visitor irá coordenar as atividades alternando o Consultor dedicado de acordo com a especialidade requerida e necessidade do cliente, bem como atuará no cenário de Melhoria Contínua e Ciclo de Vida do ERP e seus processos.</p>' +
  '<p><strong>Perfil recomendado:</strong> Clientes que demandem gestão técnica do ERP, com direcionamento de boas práticas e melhoria contínua. Bem como clientes que possuem regras de negócios complexas que exigem atenção especializada além de técnica.</p>'

const DEFAULT_BANCO_HORAS =
  '<p>O Modelo de Banco de Horas provisiona os profissionais previstos no escopo para o atendimento sob demanda do Cliente. Considerando as seguintes premissas:</p>' +
  '<ul>' +
  '<li>A contratação do Banco de Horas não configura a obrigatoriedade de consumo por parte do cliente.</li>' +
  '<li>A alocação do recurso está sujeita a prerrogativa do Cliente, que irá demandar e planejar os atendimentos conforme a necessidade.</li>' +
  '<li>A programação dos atendimentos se dará por meio de solicitação formal por parte do Cliente no canal indicado pela Visitor. Atualmente reservado em seu HelpDesk online. (Canal de Suporte VISITOR para abertura de Chamados e controle de BackLog)</li>' +
  '<li>Para atendimento de SLA, prevalece em horário Comercial (Segunda a Sexta das 8hs às 12:00 e das 13:30 às 18hs em dias úteis)</li>' +
  '<li>A modalidade de Banco de Horas não contempla atendimento Stand By.</li>' +
  '<li>Os serviços agendados poderão ser cancelados, desde que para tanto o CLIENTE notifique a VISITOR, com antecedência mínima de 2 (dois) dias úteis da data do agendamento. Caso contrário, serão cobradas as horas agendadas.</li>' +
  '</ul>' +
  '<p><strong>Condições de Faturamento e Prazos</strong></p>' +
  '<ul><li>Atividades de Delivery são faturadas a partir <strong>(Medição Mensal)</strong> com Faturamento para o dia 10 do mês subsequente.</li></ul>'

const DEFAULT_DELIVERY_ITENS: DeliveryItem[] = [
  { tipoServico: 'Consultoria e Suporte ERP – Geral', tipo: 'Horas', valorUnit: '150,00' },
  { tipoServico: 'Consultoria em Desenvolvimento e BSO', tipo: 'Horas', valorUnit: '150,00' },
  { tipoServico: 'Consultoria e Desenvolvimento em BI', tipo: 'Horas', valorUnit: '150,00' },
  { tipoServico: 'Consultoria e Desenvolvimento em React', tipo: 'Horas', valorUnit: '160,00' },
  { tipoServico: 'Consultoria e Desenvolvimento em RPA', tipo: 'Horas', valorUnit: '160,00' },
  { tipoServico: 'Consultoria e Desenvolvimento FLUIG', tipo: 'Horas', valorUnit: '160,00' },
]

const DEFAULT_OUTRAS_INFORMACOES =
  '<p><strong>Central de Atendimento:</strong></p>' +
  '<p>Área do Cliente: https://visitorconsultoria.tomticket.com/helpdesk</p>' +
  '<p>Base de Conhecimento: https://visitorconsultoria.tomticket.com/kb/</p>'

const EMPTY_FORM: FormState = {
  cliente: '',
  projeto: '',
  contato: '',
  tipo: '',
  dataProposta: '',
  desenvolvimento: false,
  objetivo: DEFAULT_OBJETIVO,
  escopoTitulo: DEFAULT_ESCOPO_TITULO,
  escopoConteudo: DEFAULT_ESCOPO_CONTEUDO,
  precificacaoTitulo: DEFAULT_PRECIFICACAO_TITULO,
  precificacaoDescricao: DEFAULT_PRECIFICACAO_DESCRICAO,
  precificacaoItens: [{ escopo: '', descricao: '', valorMensal: '' }],
  bancoHorasConteudo: DEFAULT_BANCO_HORAS,
  deliveryItens: DEFAULT_DELIVERY_ITENS.map((i) => ({ ...i })),
  outrasInformacoes: DEFAULT_OUTRAS_INFORMACOES,
  incluirObjetivo: true,
  incluirEscopo: true,
  incluirPrecificacao: true,
  incluirBancoHoras: true,
  incluirDelivery: true,
  incluirOutrasInformacoes: true,
  status: 'draft',
  estimativaId: null,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toISODate(value: string): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return trimmed
}

function toDisplayDate(value: string): string {
  const iso = toISODate(value)
  if (!iso) return value
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function getTodayISODate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return 'Nao foi possivel conectar na API local. Inicie com npm run dev:all.'
  if (error instanceof Error) {
    const m = error.message.toLowerCase()
    if (m.includes('failed to fetch') || m.includes('econnrefused')) {
      return 'Nao foi possivel conectar na API local. Inicie com npm run dev:all.'
    }
    return error.message
  }
  return fallback
}

function parseIncludeFlag(value: unknown): boolean {
  if (value === false || value === 0) return false
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'false' || v === '0' || v === 'off' || v === 'nao' || v === 'não') return false
    if (v === 'true' || v === '1' || v === 'on' || v === 'sim') return true
  }
  if (value == null) return true
  return Boolean(value)
}

function normalizePropostaResponse(input: unknown): PropostaRow {
  const r = input as Record<string, unknown>
  const parseArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  return {
    id: Number(r.id ?? 0),
    cliente: String(r.cliente ?? ''),
    projeto: String(r.projeto ?? ''),
    contato: String(r.contato ?? ''),
    tipo: String(r.tipo ?? ''),
    dataProposta: String(r.dataProposta ?? ''),
    desenvolvimento: Boolean(r.desenvolvimento),
    objetivo: String(r.objetivo ?? ''),
    escopoTitulo: String(r.escopoTitulo ?? ''),
    escopoConteudo: String(r.escopoConteudo ?? ''),
    precificacaoTitulo: String(r.precificacaoTitulo ?? ''),
    precificacaoDescricao: String(r.precificacaoDescricao ?? ''),
    precificacaoItens: parseArr(r.precificacaoItens) as PrecificacaoItem[],
    bancoHorasConteudo: String(r.bancoHorasConteudo ?? ''),
    deliveryItens: parseArr(r.deliveryItens) as DeliveryItem[],
    outrasInformacoes: String(r.outrasInformacoes ?? ''),
    incluirObjetivo: parseIncludeFlag(r.incluirObjetivo),
    incluirEscopo: parseIncludeFlag(r.incluirEscopo),
    incluirPrecificacao: parseIncludeFlag(r.incluirPrecificacao),
    incluirBancoHoras: parseIncludeFlag(r.incluirBancoHoras),
    incluirDelivery: parseIncludeFlag(r.incluirDelivery),
    incluirOutrasInformacoes: parseIncludeFlag(r.incluirOutrasInformacoes),
    status: r.status === 'sent' ? 'sent' : 'draft',
    estimativaId: r.estimativaId ? Number(r.estimativaId) : null,
  }
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Falha ao carregar logo.'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── PDF – HTML parser ────────────────────────────────────────────────────────

type PdfLine = { text: string; bold: boolean; bullet: boolean; empty: boolean }

function htmlToLines(html: string): PdfLine[] {
  if (!html || html.replace(/<[^>]+>/g, '').trim() === '') return []
  const lines: PdfLine[] = []
  try {
    const parser = new DOMParser()
    const parsed = parser.parseFromString(html, 'text/html')

    const hasBold = (el: Element) => el.querySelector('strong, b') !== null

    const processEl = (el: Element): void => {
      const tag = el.tagName.toLowerCase()
      if (tag === 'p' || tag === 'div') {
        const text = el.textContent?.trim() || ''
        if (!text) { lines.push({ text: '', bold: false, bullet: false, empty: true }); return }
        lines.push({ text, bold: hasBold(el), bullet: false, empty: false })
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of Array.from(el.children)) {
          if (li.tagName.toLowerCase() === 'li') {
            const text = li.textContent?.trim() || ''
            if (text) lines.push({ text, bold: false, bullet: true, empty: false })
          }
        }
      } else if (/^h[1-4]$/.test(tag)) {
        const text = el.textContent?.trim() || ''
        if (text) lines.push({ text, bold: true, bullet: false, empty: false })
      } else if (tag === 'blockquote' || tag === 'pre') {
        const text = el.textContent?.trim() || ''
        if (text) lines.push({ text, bold: false, bullet: false, empty: false })
      } else {
        for (const child of Array.from(el.children)) processEl(child)
      }
    }

    for (const child of Array.from(parsed.body.children)) processEl(child)
  } catch {
    const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (stripped) lines.push({ text: stripped, bold: false, bullet: false, empty: false })
  }
  return lines.filter((l, i, arr) => !(l.empty && arr[i - 1]?.empty))
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

async function generatePropostaPdf(proposta: PropostaRow): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const cw = pageWidth - margin * 2 // content width

  const logoDataUrl = await loadImageAsDataUrl(internalPartnerLogo)

  let y = margin

  // ── Header ──────────────────────────────────────────────────────────────────
  const drawHeader = () => {
    doc.setFillColor(...C_GREEN_LIGHT_BG)
    doc.roundedRect(margin, margin, cw, 54, 8, 8, 'F')

    if (logoDataUrl) {
      const props = doc.getImageProperties(logoDataUrl)
      const logoH = 40
      const logoW = Math.min(logoH * (props.width / props.height), 130)
      doc.addImage(logoDataUrl, 'PNG', margin + 10, margin + 7, logoW, logoH)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.setTextColor(...C_GREEN_DARK)
    doc.text('PROPOSTA DE SERVIÇOS', pageWidth - margin - 10, margin + 33, { align: 'right' })

    doc.setDrawColor(...C_GREEN_MED)
    doc.setLineWidth(0.8)
    doc.line(margin, margin + 60, pageWidth - margin, margin + 60)
    y = margin + 72
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const drawFooter = () => {
    const fy = pageHeight - margin - 18
    doc.setDrawColor(...C_BOX_BORDER)
    doc.setLineWidth(0.4)
    doc.line(margin, fy - 4, pageWidth - margin, fy - 4)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C_BODY)
    doc.text('VISITOR CONSUTORIA LTDA.', pageWidth / 2, fy, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_MUTED)
    doc.text(
      'Endereço: Rua Catharina Agostini, 299 – Flamboyant – Araras – SP – CEP 13609-500  |  Tel.: 11 98247-2830  |  eMail: visitor@visitorconsultoria.com  |  Site: https://www.visitorconsultoria.com',
      pageWidth / 2, fy + 10, { align: 'center' },
    )
  }

  // ── New page ─────────────────────────────────────────────────────────────────
  const newPage = () => {
    drawFooter()
    doc.addPage()
    drawHeader()
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin - 35) newPage()
  }

  // ── Section title ────────────────────────────────────────────────────────────
  const sectionTitle = (title: string) => {
    ensureSpace(36)
    // Re-apply font/color after ensureSpace (may have called newPage → drawHeader)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...C_GREEN_DARK)
    doc.text(title, margin, y)
    y += 4
    doc.setDrawColor(...C_GREEN_MED)
    doc.setLineWidth(0.8)
    doc.line(margin, y + 2, margin + cw * 0.55, y + 2)
    y += 14
  }

  // ── Sub-section title ─────────────────────────────────────────────────────────
  const subTitle = (title: string) => {
    // Pre-calculate with correct font
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const splitLines = doc.splitTextToSize(title, cw)
    const needed = splitLines.length * 11 * 1.5 + 12
    ensureSpace(needed)
    // Re-apply font after ensureSpace (which may have called newPage/drawHeader)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...C_GREEN_MED)
    doc.text(splitLines, margin, y)
    y += needed - 4
  }

  // ── Calc HTML height (pre-pass for boxes) ─────────────────────────────────────
  const calcHtmlHeight = (lines: PdfLine[], width: number, fs: number, lhf: number, pad: number): number => {
    let h = pad * 2
    for (const l of lines) {
      if (l.empty) { h += fs * 0.4; continue }
      doc.setFont('helvetica', l.bold ? 'bold' : 'normal')
      doc.setFontSize(fs)
      const tw = l.bullet ? width - 12 : width
      const wrapped = doc.splitTextToSize(l.text, tw)
      h += wrapped.length * fs * lhf + 2
    }
    return h
  }

  // ── Render HTML lines ─────────────────────────────────────────────────────────
  const renderLines = (lines: PdfLine[], width: number, fs: number, lhf: number, offsetX = 0) => {
    const lx = margin + offsetX
    for (const l of lines) {
      if (l.empty) { y += fs * 0.4; continue }
      const tw = l.bullet ? width - 12 : width
      const isBold = l.bold
      // Pre-calc split with correct font
      doc.setFont('helvetica', isBold ? 'bold' : 'normal')
      doc.setFontSize(fs)
      const wrapped = doc.splitTextToSize(l.text, tw)
      const needed = wrapped.length * fs * lhf + 2
      ensureSpace(needed)
      // Re-apply after ensureSpace (which may have called newPage → drawHeader changing font)
      doc.setFont('helvetica', isBold ? 'bold' : 'normal')
      doc.setFontSize(fs)
      doc.setTextColor(...C_BODY)
      if (l.bullet) doc.text('•', lx + 3, y)
      doc.text(wrapped, l.bullet ? lx + 12 : lx, y)
      y += needed
    }
  }

  // ── Render HTML in a box ──────────────────────────────────────────────────────
  const renderBoxedLines = (lines: PdfLine[], pad = 12, fs = 10, lhf = 1.38) => {
    if (!lines.length) return
    const usablePageH = pageHeight - margin - 35 - margin // full page content height
    const totalH = calcHtmlHeight(lines, cw - pad * 2, fs, lhf, pad)

    if (totalH <= usablePageH) {
      // Box fits on one page — try to keep it together
      ensureSpace(totalH + 4)
      doc.setFillColor(...C_BOX_BG)
      doc.setDrawColor(...C_BOX_BORDER)
      doc.setLineWidth(0.4)
      doc.roundedRect(margin, y, cw, totalH, 5, 5, 'FD')
      y += pad
      renderLines(lines, cw - pad * 2, fs, lhf, pad)
      y += pad / 2
    } else {
      // Box taller than one page — render line-by-line with left border stripe
      for (const l of lines) {
        if (l.empty) { y += fs * 0.4; continue }
        const isBold = l.bold
        doc.setFont('helvetica', isBold ? 'bold' : 'normal')
        doc.setFontSize(fs)
        const tw = l.bullet ? cw - pad * 2 - 12 : cw - pad * 2
        const wrapped = doc.splitTextToSize(l.text, tw)
        const needed = wrapped.length * fs * lhf + 2
        ensureSpace(needed + 4)
        doc.setFont('helvetica', isBold ? 'bold' : 'normal')
        doc.setFontSize(fs)
        doc.setTextColor(...C_BODY)
        if (l.bullet) doc.text('•', margin + pad + 3, y)
        doc.text(wrapped, l.bullet ? margin + pad + 12 : margin + pad, y)
        y += needed
      }
    }
  }

  // ── Info table (page 1 only) ──────────────────────────────────────────────────
  const drawInfoTable = () => {
    const rowH = 30
    const colW = cw / 2
    const rows = [
      [{ label: 'Cliente:', value: proposta.cliente }, { label: 'Projeto:', value: proposta.projeto }],
      [{ label: 'Contato:', value: proposta.contato }, { label: 'Tipo:', value: proposta.tipo }],
      [{ label: 'Data da Proposta:', value: toDisplayDate(proposta.dataProposta) }, { label: 'Desenvolvimento:', value: proposta.desenvolvimento ? 'Sim' : 'Não' }],
    ]

    doc.setDrawColor(...C_BORDER)
    doc.setLineWidth(0.5)

    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const cx = margin + ci * colW
        const cy = y + ri * rowH
        doc.setFillColor(...C_WHITE)
        doc.rect(cx, cy, colW, rowH, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...C_BODY)
        doc.text(cell.label, cx + 6, cy + rowH / 2 + 3)
        const lw = doc.getTextWidth(cell.label) + 4
        doc.setFont('helvetica', 'normal')
        const val = doc.splitTextToSize(cell.value, colW - lw - 16)
        doc.text(val[0] || '', cx + 6 + lw + 2, cy + rowH / 2 + 3)
      })
    })
    y += rows.length * rowH + 14
  }

  // ── Precificacao table ────────────────────────────────────────────────────────
  const drawPrecTable = (items: PrecificacaoItem[]) => {
    if (!items.length) return
    const colEsc = cw * 0.35
    const colDesc = cw * 0.45
    const headerH = 20

    ensureSpace(headerH + 20)

    // Header
    doc.setFillColor(...C_TABLE_HDR_BG)
    doc.setDrawColor(...C_TABLE_HDR_BG)
    doc.rect(margin, y, cw, headerH, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...C_WHITE)
    doc.text('Escopo', margin + 6, y + 13)
    doc.text('Descr.', margin + colEsc + 6, y + 13)
    doc.text('Valor', margin + colEsc + colDesc + 6, y + 13)
    y += headerH

    items.forEach((item, idx) => {
      const lineCountEsc = doc.splitTextToSize(item.escopo || '-', colEsc - 10).length
      const lineCountDesc = doc.splitTextToSize(item.descricao || '-', colDesc - 10).length
      const rowH = Math.max(lineCountEsc, lineCountDesc) * 9 * 1.35 + 12
      ensureSpace(rowH)
      const bg: [number, number, number] = idx % 2 === 0 ? C_WHITE : C_TABLE_ROW_ALT
      doc.setFillColor(...bg)
      doc.setDrawColor(...C_BORDER)
      doc.setLineWidth(0.4)
      doc.rect(margin, y, cw, rowH, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...C_BODY)
      const escopoLines = doc.splitTextToSize(item.escopo || '-', colEsc - 10)
      doc.text(escopoLines, margin + 6, y + 10)
      doc.setFont('helvetica', 'normal')
      const descLines = doc.splitTextToSize(item.descricao || '-', colDesc - 10)
      doc.text(descLines, margin + colEsc + 6, y + 10)
      doc.setFont('helvetica', 'bold')
      doc.text(item.valorMensal || '-', margin + colEsc + colDesc + 6, y + 10)
      y += rowH
    })
    y += 8
  }

  // ── Delivery table ────────────────────────────────────────────────────────────
  const drawDeliveryTable = (items: DeliveryItem[]) => {
    if (!items.length) return
    const colSvc = cw * 0.62
    const colTipo = cw * 0.15
    const headerH = 22

    ensureSpace(headerH + 20)

    doc.setFillColor(...C_TABLE_HDR_BG)
    doc.setDrawColor(...C_TABLE_HDR_BG)
    doc.rect(margin, y, cw, headerH, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...C_WHITE)
    doc.text('Tipo de Serviço', margin + 6, y + 14)
    doc.text('Tipo', margin + colSvc + 6, y + 14)
    doc.text('Vlr. Unit. ($)', margin + colSvc + colTipo + 6, y + 14)
    y += headerH

    items.forEach((item, idx) => {
      const serviceLines = doc.splitTextToSize(item.tipoServico || '-', colSvc - 10)
      const rowH = Math.max(serviceLines.length * 9 * 1.35, 20) + 10
      ensureSpace(rowH)
      const bg: [number, number, number] = idx % 2 === 0 ? C_WHITE : C_TABLE_ROW_ALT
      doc.setFillColor(...bg)
      doc.setDrawColor(...C_BORDER)
      doc.setLineWidth(0.4)
      doc.rect(margin, y, cw, rowH, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...C_BODY)
      doc.text(serviceLines, margin + 6, y + 10)
      doc.setFont('helvetica', 'normal')
      doc.text(item.tipo || 'Horas', margin + colSvc + 6, y + 10)
      doc.setFont('helvetica', 'bold')
      doc.text(item.valorUnit || '-', margin + colSvc + colTipo + 6, y + 10)
      y += rowH
    })
    y += 8
  }

  // ── Build the PDF ─────────────────────────────────────────────────────────────

  drawHeader()

  // Info table
  drawInfoTable()

  // OBJETIVO
  if (proposta.incluirObjetivo !== false) {
    ensureSpace(80)
    sectionTitle('OBJETIVO')
    renderLines(htmlToLines(proposta.objetivo), cw, 10, 1.38)
    y += 16
  }

  // ESCOPO DA PROPOSTA
  if (proposta.incluirEscopo !== false) {
    ensureSpace(proposta.escopoTitulo ? 90 : 60)
    sectionTitle('ESCOPO DA PROPOSTA')
    if (proposta.escopoTitulo) subTitle(proposta.escopoTitulo)
    renderBoxedLines(htmlToLines(proposta.escopoConteudo))
    y += 22
  }

  // PRECIFICAÇÃO
  if (proposta.incluirPrecificacao !== false) {
    ensureSpace(proposta.precificacaoTitulo ? 100 : 65)
    sectionTitle('PRECIFICAÇÃO')
    if (proposta.precificacaoTitulo) subTitle(proposta.precificacaoTitulo)
    renderLines(htmlToLines(proposta.precificacaoDescricao), cw, 10, 1.38)
    y += 12
    drawPrecTable(proposta.precificacaoItens)
  }

  // BANCO DE HORAS E DELIVERY
  if (proposta.incluirBancoHoras !== false) {
    y += 16
    ensureSpace(90)
    sectionTitle('BANCO DE HORAS E DELIVERY')
    renderBoxedLines(htmlToLines(proposta.bancoHorasConteudo))
    y += 16
  }

  // TABELA DE SERVIÇOS DELIVERY
  if (proposta.incluirDelivery !== false) {
    ensureSpace(70)
    sectionTitle('TABELA DE SERVIÇOS DELIVERY')
    drawDeliveryTable(proposta.deliveryItens)
  }

  // OUTRAS INFORMAÇÕES
  if (proposta.incluirOutrasInformacoes !== false) {
    y += 12
    ensureSpace(70)
    sectionTitle('OUTRAS INFORMAÇÕES')
    renderBoxedLines(htmlToLines(proposta.outrasInformacoes))
  }

  drawFooter()

  const safeName = (proposta.cliente || 'proposta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'proposta'

  doc.save(`proposta-${proposta.id}-${safeName}.pdf`)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PropostaComercialTool() {
  const [items, setItems] = useState<PropostaRow[]>([])
  const [estimativas, setEstimativas] = useState<EstimativaOption[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | PropostaStatus>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isViewMode, setIsViewMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isSyncingSectionFlags, setIsSyncingSectionFlags] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formVersion, setFormVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [selectedEstimativaId, setSelectedEstimativaId] = useState<number | ''>('')
  const [activeSection, setActiveSection] = useState<string>('dados')
  const modalRef = useRef<HTMLElement | null>(null)

  const fetchPropostas = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch(apiUrl('/api/propostas'))
      if (!res.ok) {
        let detail = 'Falha ao carregar propostas.'
        try { const e = await res.json(); detail = (e as { error?: string })?.error ?? detail } catch { /* ignore */ }
        throw new Error(detail)
      }
      const data = await res.json() as { items?: unknown[] }
      setItems(Array.isArray(data.items) ? data.items.map(normalizePropostaResponse) : [])
    } catch (e) {
      setError(toFriendlyError(e, 'Nao foi possivel carregar propostas.'))
    } finally {
      setIsLoading(false)
    }
  }

  const fetchEstimativas = async () => {
    try {
      const res = await fetch(apiUrl('/api/estimativas'))
      if (!res.ok) return
      const data = await res.json() as { items?: unknown[] }
      const rows = (Array.isArray(data.items) ? data.items : []) as Array<{
        id: number; client: string; demand: string; partner: string; items: Array<{ detail: string; hours: string }>
      }>
      setEstimativas(
        rows
          .filter((r) => r.partner?.toLowerCase() === 'interno')
          .map((r) => ({ id: r.id, cliente: r.client, demanda: r.demand, items: r.items || [] })),
      )
    } catch { /* silent */ }
  }

  useEffect(() => {
    void fetchPropostas()
    void fetchEstimativas()
  }, [])

  useEffect(() => {
    if (!isModalOpen) return
    if (!modalRef.current) return
    modalRef.current.scrollTop = 0
  }, [isModalOpen, editingId])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items
      .filter((i) => statusFilter === 'all' || i.status === statusFilter)
      .filter((i) => {
        if (!term) return true
        return [i.id, i.cliente, i.projeto, i.tipo, i.contato].join(' ').toLowerCase().includes(term)
      })
      .sort((a, b) => b.id - a.id)
  }, [items, search, statusFilter])

  const openNewModal = () => {
    setError(null); setSuccess(null)
    setForm({ ...EMPTY_FORM, dataProposta: getTodayISODate() })
    setEditingId(null); setIsViewMode(false)
    setFormVersion((v) => v + 1)
    setActiveSection('dados')
    setShowImport(false)
    setSelectedEstimativaId('')
    setIsModalOpen(true)
  }

  const openEditModal = (p: PropostaRow) => {
    setError(null); setSuccess(null)
    setEditingId(p.id)
    setForm({
      cliente: p.cliente, projeto: p.projeto, contato: p.contato, tipo: p.tipo,
      dataProposta: toISODate(p.dataProposta), desenvolvimento: p.desenvolvimento,
      objetivo: p.objetivo, escopoTitulo: p.escopoTitulo, escopoConteudo: p.escopoConteudo,
      precificacaoTitulo: p.precificacaoTitulo, precificacaoDescricao: p.precificacaoDescricao,
      precificacaoItens: p.precificacaoItens.length ? p.precificacaoItens.map((i) => ({ ...i })) : [{ escopo: '', descricao: '', valorMensal: '' }],
      bancoHorasConteudo: p.bancoHorasConteudo, deliveryItens: p.deliveryItens.map((i) => ({ ...i })),
      outrasInformacoes: p.outrasInformacoes,
      incluirObjetivo: p.incluirObjetivo, incluirEscopo: p.incluirEscopo,
      incluirPrecificacao: p.incluirPrecificacao, incluirBancoHoras: p.incluirBancoHoras,
      incluirDelivery: p.incluirDelivery, incluirOutrasInformacoes: p.incluirOutrasInformacoes,
      status: p.status, estimativaId: p.estimativaId,
    })
    setIsViewMode(false)
    setFormVersion((v) => v + 1)
    setActiveSection('dados')
    setShowImport(false)
    setIsModalOpen(true)
  }

  const openViewModal = (p: PropostaRow) => {
    openEditModal(p)
    setIsViewMode(true)
  }

  const closeModal = () => {
    if (isSaving) return
    setIsModalOpen(false); setEditingId(null); setIsViewMode(false)
    setShowImport(false); setSelectedEstimativaId('')
  }

  useEffect(() => {
    if (!isModalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isModalOpen, isSaving])

  const setF = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const importFromEstimativa = () => {
    if (!selectedEstimativaId) return
    const est = estimativas.find((e) => e.id === Number(selectedEstimativaId))
    if (!est) return
    setForm((prev) => ({
      ...prev,
      cliente: est.cliente,
      projeto: est.demanda,
      estimativaId: est.id,
      deliveryItens: est.items.length
        ? est.items.map((item) => ({ tipoServico: item.detail, tipo: 'Horas', valorUnit: item.hours }))
        : prev.deliveryItens,
    }))
    setFormVersion((v) => v + 1)
    setShowImport(false)
    setSelectedEstimativaId('')
  }

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isViewMode) return
    setError(null); setSuccess(null)
    if (!form.cliente.trim() || !form.projeto.trim() || !form.dataProposta) {
      setError('Preencha os campos obrigatórios: Cliente, Projeto e Data da Proposta.')
      return
    }
    const payload = { ...form, dataProposta: form.dataProposta }
    try {
      setIsSaving(true)
      const url = editingId ? apiUrl(`/api/propostas/${encodeURIComponent(String(editingId))}`) : apiUrl('/api/propostas')
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        let detail = editingId ? 'Falha ao atualizar.' : 'Falha ao salvar.'
        try { const err = await res.json(); detail = (err as { error?: string })?.error ?? detail } catch { /* ignore */ }
        throw new Error(detail)
      }
      const data = await res.json() as { item?: unknown }
      if (!data.item) throw new Error('Resposta invalida do servidor.')
      const saved = normalizePropostaResponse(data.item)
      setItems((prev) => editingId ? prev.map((i) => (i.id === editingId ? saved : i)) : [saved, ...prev])
      setSuccess(editingId ? 'Proposta atualizada com sucesso.' : 'Proposta criada com sucesso.')
      closeModal()
    } catch (err) {
      setError(toFriendlyError(err, 'Nao foi possivel salvar proposta.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Excluir esta proposta? Esta ação não pode ser desfeita.')) return
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/propostas/${encodeURIComponent(String(id))}`), { method: 'DELETE' })
      if (!res.ok) {
        let detail = 'Falha ao excluir.'
        try { const e = await res.json(); detail = (e as { error?: string })?.error ?? detail } catch { /* ignore */ }
        throw new Error(detail)
      }
      setItems((prev) => prev.filter((i) => i.id !== id))
      setSuccess('Proposta excluída com sucesso.')
    } catch (err) {
      setError(toFriendlyError(err, 'Nao foi possivel excluir proposta.'))
    }
  }

  const handleToggleStatus = async (p: PropostaRow) => {
    setError(null)
    const next: PropostaStatus = p.status === 'sent' ? 'draft' : 'sent'
    try {
      const res = await fetch(apiUrl(`/api/propostas/${encodeURIComponent(String(p.id))}/status`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error('Falha ao atualizar status.')
      setItems((prev) => prev.map((i) => (i.id === p.id ? { ...i, status: next } : i)))
    } catch (err) {
      setError(toFriendlyError(err, 'Nao foi possivel atualizar status.'))
    }
  }

  const handlePdf = async (p: PropostaRow) => {
    setError(null)
    setIsPrinting(true)
    try {
      await generatePropostaPdf(p)
      setSuccess(`PDF da proposta ${p.id} gerado com sucesso.`)
    } catch (err) {
      setError(toFriendlyError(err, 'Nao foi possivel gerar o PDF.'))
    } finally {
      setIsPrinting(false)
    }
  }

  type SectionFlagKey = 'incluirObjetivo' | 'incluirEscopo' | 'incluirPrecificacao' | 'incluirBancoHoras' | 'incluirDelivery' | 'incluirOutrasInformacoes'
  const toggleSectionInclusion = async (key: SectionFlagKey, included: boolean) => {
    if (isViewMode || isSyncingSectionFlags) return

    const previous = form[key] as boolean

    // Optimistic update for immediate UI/PDF behavior in current session.
    setF(key, included)
    if (editingId) {
      setItems((prev) => prev.map((item) => (item.id === editingId ? ({ ...item, [key]: included } as PropostaRow) : item)))
    }

    // New proposal has no id yet; persist when user clicks Salvar.
    if (!editingId) return

    try {
      setError(null)
      setIsSyncingSectionFlags(true)
      const res = await fetch(apiUrl(`/api/propostas/${encodeURIComponent(String(editingId))}/flags`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: included }),
      })
      if (!res.ok) {
        let detail = 'Falha ao atualizar tópico da proposta.'
        try { const err = await res.json(); detail = (err as { error?: string })?.error ?? detail } catch { /* ignore */ }
        throw new Error(detail)
      }
      const data = await res.json() as { item?: unknown }
      if (!data.item) throw new Error('Resposta invalida do servidor.')
      const saved = normalizePropostaResponse(data.item)
      setItems((prev) => prev.map((item) => (item.id === editingId ? saved : item)))
    } catch (err) {
      // Roll back if server update fails.
      setF(key, previous)
      setItems((prev) => prev.map((item) => (item.id === editingId ? ({ ...item, [key]: previous } as PropostaRow) : item)))
      setError(toFriendlyError(err, 'Nao foi possivel atualizar o tópico da proposta.'))
    } finally {
      setIsSyncingSectionFlags(false)
    }
  }

  const sections: Array<{ id: string; label: string; flagKey: SectionFlagKey | null }> = [
    { id: 'dados', label: 'Dados Principais', flagKey: null },
    { id: 'objetivo', label: 'Objetivo', flagKey: 'incluirObjetivo' },
    { id: 'escopo', label: 'Escopo', flagKey: 'incluirEscopo' },
    { id: 'precificacao', label: 'Precificação', flagKey: 'incluirPrecificacao' },
    { id: 'banco', label: 'Banco de Horas', flagKey: 'incluirBancoHoras' },
    { id: 'delivery', label: 'Tabela Delivery', flagKey: 'incluirDelivery' },
    { id: 'outras', label: 'Outras Informações', flagKey: 'incluirOutrasInformacoes' },
  ]

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Propostas Comerciais</h2>
            <p className="muted">Geração de propostas comerciais da Visitor Consultoria (somente parceiro Interno).</p>
          </div>
          <button type="button" className="button-primary" onClick={openNewModal}>Nova Proposta</button>
        </div>

        <div className="estimativas-stats">
          <span>Total: <strong>{items.length}</strong></span>
          <span>Rascunhos: <strong>{items.filter((i) => i.status === 'draft').length}</strong></span>
          <span>Enviadas: <strong>{items.filter((i) => i.status === 'sent').length}</strong></span>
          <button type="button" className="button-secondary" onClick={() => void fetchPropostas()} disabled={isLoading}>
            {isLoading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="ch-table-toolbar">
          <label className="ch-table-search">
            <span className="ch-table-search__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </span>
            <input type="search" placeholder="Buscar por cliente, projeto, tipo..." value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Buscar proposta" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | PropostaStatus)} className="ch-filter-select">
            <option value="all">Todos</option>
            <option value="draft">Rascunhos</option>
            <option value="sent">Enviadas</option>
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
                <th>Tipo</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.cliente}</td>
                  <td>{p.projeto}</td>
                  <td>{toDisplayDate(p.dataProposta)}</td>
                  <td>{p.tipo}</td>
                  <td>
                    <span className={`estimativas-status estimativas-status--${p.status === 'sent' ? 'sent' : 'pending'}`}>
                      {p.status === 'sent' ? 'Enviada' : 'Rascunho'}
                    </span>
                  </td>
                  <td>
                    <div className="ch-row-actions ch-row-actions--icons">
                      <button type="button" className="ch-icon-action" title="Visualizar" onClick={() => openViewModal(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action" title="Gerar PDF" disabled={isPrinting} onClick={() => void handlePdf(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action" title="Editar" onClick={() => openEditModal(p)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action" title={p.status === 'sent' ? 'Marcar como rascunho' : 'Marcar como enviada'} onClick={() => void handleToggleStatus(p)}>
                        {p.status === 'sent'
                          ? <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                          : <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        }
                      </button>
                      <button type="button" className="ch-icon-action ch-icon-action--danger" title="Excluir" onClick={() => void handleDelete(p.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && <p className="muted">Nenhum registro encontrado para os filtros atuais.</p>}
        {error && (
          <div className="estimativas-actions" style={{ marginTop: '0.65rem' }}>
            <p className="error" style={{ margin: 0 }}>{error}</p>
            <button type="button" className="button-secondary" onClick={() => void fetchPropostas()}>Tentar novamente</button>
          </div>
        )}
        {success && <p className="success">{success}</p>}
      </section>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {isModalOpen && typeof document !== 'undefined' && createPortal((
        <div className="estimativas-modal-overlay" role="presentation">
          <section
            ref={modalRef}
            className="estimativas-modal"
            style={{ maxWidth: '860px' }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="estimativas-modal__header">
              <h3>{isViewMode ? 'Visualizar Proposta' : editingId ? 'Editar Proposta' : 'Nova Proposta Comercial'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>Fechar</button>
            </div>

            {/* Import from estimate (only in create mode) */}
            {!editingId && !isViewMode && (
              <div style={{ padding: '0 1.5rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                {!showImport ? (
                  <button type="button" className="button-secondary" onClick={() => setShowImport(true)}>
                    Importar de Estimativa Existente
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={selectedEstimativaId}
                      onChange={(e) => setSelectedEstimativaId(e.target.value === '' ? '' : Number(e.target.value))}
                      style={{ flex: 1, minWidth: '240px' }}
                    >
                      <option value="">Selecione uma estimativa...</option>
                      {estimativas.map((est) => (
                        <option key={est.id} value={est.id}>#{est.id} – {est.cliente} – {est.demanda}</option>
                      ))}
                    </select>
                    <button type="button" className="button-primary" onClick={importFromEstimativa} disabled={!selectedEstimativaId}>
                      Importar
                    </button>
                    <button type="button" className="button-secondary" onClick={() => { setShowImport(false); setSelectedEstimativaId('') }}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Section tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.75rem 1.5rem 0.5rem', borderBottom: '1px solid #dbe8e4' }}>
              {sections.map((s) => {
                const included = s.flagKey ? (form[s.flagKey] as boolean) : true
                const isActive = activeSection === s.id
                const activeBg = '#1f6f5d'
                const activeTxt = '#ffffff'
                const inactiveBg = isActive ? activeBg : '#edf5f2'
                const inactiveTxt = s.flagKey && !included ? '#999' : '#173b35'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: '7px', border: `1.5px solid ${isActive ? activeBg : (s.flagKey && !included ? '#ccc' : '#c5dcd6')}`, overflow: 'hidden', marginBottom: '0.2rem', background: isActive ? activeBg : inactiveBg }}>
                    <button
                      type="button"
                      onClick={() => setActiveSection(s.id)}
                      style={{
                        display: 'block',
                        padding: '0.28rem 0.7rem',
                        border: 'none',
                        background: 'transparent',
                        color: isActive ? activeTxt : (s.flagKey && !included ? '#999' : inactiveTxt),
                        fontSize: '0.82rem',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        textDecoration: s.flagKey && !included ? 'line-through' : 'none',
                        whiteSpace: 'nowrap',
                        lineHeight: '1.4',
                        boxShadow: 'none',
                        transform: 'none',
                      }}
                    >
                      {s.label}
                    </button>
                    {s.flagKey && !isViewMode && (
                      <button
                        type="button"
                        title={included ? 'Excluir seção do PDF' : 'Incluir seção no PDF'}
                        onClick={() => void toggleSectionInclusion(s.flagKey as SectionFlagKey, !included)}
                        disabled={isSaving || isSyncingSectionFlags}
                        style={{
                          display: 'block',
                          padding: '0.28rem 0.45rem',
                          border: 'none',
                          borderLeft: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : '#c5dcd6'}`,
                          background: 'transparent',
                          color: isActive ? activeTxt : (included ? '#1f6f5d' : '#aaa'),
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          lineHeight: '1.4',
                          fontWeight: 700,
                          boxShadow: 'none',
                          transform: 'none',
                        }}
                      >
                        {included ? '✓' : '✕'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <form className="estimativas-form" onSubmit={handleSave} style={{ padding: '1.25rem 1.5rem' }}>

              {/* ── Dados Principais ─────────────────────────── */}
              {activeSection === 'dados' && (
                <>
                  <label>
                    Código
                    <input value={editingId ?? 'Gerado automaticamente'} disabled />
                  </label>
                  <label>
                    Cliente *
                    <input value={form.cliente} onChange={(e) => setF('cliente', e.target.value)} readOnly={isViewMode} required />
                  </label>
                  <label>
                    Projeto *
                    <input value={form.projeto} onChange={(e) => setF('projeto', e.target.value)} readOnly={isViewMode} required />
                  </label>
                  <label>
                    Contato
                    <input value={form.contato} onChange={(e) => setF('contato', e.target.value)} readOnly={isViewMode} placeholder="Nome(s) do(s) contato(s)" />
                  </label>
                  <label>
                    Tipo
                    <input value={form.tipo} onChange={(e) => setF('tipo', e.target.value)} readOnly={isViewMode} placeholder="Ex: Sustentação, Desenvolvimento..." />
                  </label>
                  <label>
                    Data da Proposta *
                    <input type="date" value={form.dataProposta} onChange={(e) => setF('dataProposta', e.target.value)} disabled={isViewMode} required />
                  </label>
                  <label>
                    Status
                    <select value={form.status} onChange={(e) => setF('status', e.target.value as PropostaStatus)} disabled={isViewMode}>
                      <option value="draft">Rascunho</option>
                      <option value="sent">Enviada</option>
                    </select>
                  </label>
                  <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={form.desenvolvimento}
                      onChange={(e) => setF('desenvolvimento', e.target.checked)}
                      disabled={isViewMode}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    Desenvolvimento
                  </label>
                </>
              )}

              {/* ── Objetivo ─────────────────────────────────── */}
              {activeSection === 'objetivo' && (
                <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Objetivo
                  <RichTextEditor
                    key={`objetivo-${formVersion}`}
                    value={form.objetivo}
                    onChange={(html) => setF('objetivo', html)}
                    placeholder="Texto de apresentação da proposta"
                    rows={4}
                    disabled={isViewMode || isSaving}
                  />
                </div>
              )}

              {/* ── Escopo ───────────────────────────────────── */}
              {activeSection === 'escopo' && (
                <>
                  <label className="estimativas-form__full">
                    Título do Escopo
                    <input value={form.escopoTitulo} onChange={(e) => setF('escopoTitulo', e.target.value)} readOnly={isViewMode} placeholder="Subtítulo da seção de escopo" />
                  </label>
                  <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                    Conteúdo do Escopo
                    <RichTextEditor
                      key={`escopo-${formVersion}`}
                      value={form.escopoConteudo}
                      onChange={(html) => setF('escopoConteudo', html)}
                      placeholder="Resumo, premissas e limitações..."
                      rows={8}
                      disabled={isViewMode || isSaving}
                    />
                  </div>
                </>
              )}

              {/* ── Precificação ─────────────────────────────── */}
              {activeSection === 'precificacao' && (
                <>
                  <label className="estimativas-form__full">
                    Título da Precificação
                    <input value={form.precificacaoTitulo} onChange={(e) => setF('precificacaoTitulo', e.target.value)} readOnly={isViewMode} />
                  </label>
                  <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                    Descrição da Precificação
                    <RichTextEditor
                      key={`prec-desc-${formVersion}`}
                      value={form.precificacaoDescricao}
                      onChange={(html) => setF('precificacaoDescricao', html)}
                      placeholder="Descrição do modelo de precificação..."
                      rows={5}
                      disabled={isViewMode || isSaving}
                    />
                  </div>
                  <div className="estimativas-form__full">
                    <div className="estimativas-header-row">
                      <h4>Itens de Precificação</h4>
                      {!isViewMode && (
                        <button type="button" className="button-secondary" onClick={() =>
                          setF('precificacaoItens', [...form.precificacaoItens, { escopo: '', descricao: '', valorMensal: '' }])
                        }>Adicionar item</button>
                      )}
                    </div>
                    <div className="estimativas-table ch-table-theme">
                      <table>
                        <thead>
                          <tr>
                            <th>Escopo</th>
                            <th>Descrição</th>
                            <th>Valor</th>
                            {!isViewMode && <th>Ações</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {form.precificacaoItens.map((item, idx) => (
                            <tr key={`prec-${idx}`}>
                              <td><input value={item.escopo} onChange={(e) => {
                                const upd = form.precificacaoItens.map((x, i) => i === idx ? { ...x, escopo: e.target.value } : x)
                                setF('precificacaoItens', upd)
                              }} readOnly={isViewMode} placeholder="Nome do escopo" /></td>
                              <td><input value={item.descricao} onChange={(e) => {
                                const upd = form.precificacaoItens.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x)
                                setF('precificacaoItens', upd)
                              }} readOnly={isViewMode} placeholder="Descrição" /></td>
                              <td><input value={item.valorMensal} onChange={(e) => {
                                const upd = form.precificacaoItens.map((x, i) => i === idx ? { ...x, valorMensal: e.target.value } : x)
                                setF('precificacaoItens', upd)
                              }} readOnly={isViewMode} placeholder="0,00" /></td>
                              {!isViewMode && (
                                <td>
                                  <button type="button" onClick={() => setF('precificacaoItens', form.precificacaoItens.filter((_, i) => i !== idx))} disabled={form.precificacaoItens.length <= 1}>Remover</button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ── Banco de Horas ───────────────────────────── */}
              {activeSection === 'banco' && (
                <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Banco de Horas e Delivery
                  <RichTextEditor
                    key={`banco-${formVersion}`}
                    value={form.bancoHorasConteudo}
                    onChange={(html) => setF('bancoHorasConteudo', html)}
                    placeholder="Descrição do modelo de banco de horas..."
                    rows={8}
                    disabled={isViewMode || isSaving}
                  />
                </div>
              )}

              {/* ── Tabela Delivery ──────────────────────────── */}
              {activeSection === 'delivery' && (
                <div className="estimativas-form__full">
                  <div className="estimativas-header-row">
                    <h4>Tabela de Serviços Delivery</h4>
                    {!isViewMode && (
                      <button type="button" className="button-secondary" onClick={() =>
                        setF('deliveryItens', [...form.deliveryItens, { tipoServico: '', tipo: 'Horas', valorUnit: '' }])
                      }>Adicionar item</button>
                    )}
                  </div>
                  <div className="estimativas-table ch-table-theme">
                    <table>
                      <thead>
                        <tr>
                          <th>Tipo de Serviço</th>
                          <th>Tipo</th>
                          <th>Vlr. Unit. (R$)</th>
                          {!isViewMode && <th>Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {form.deliveryItens.map((item, idx) => (
                          <tr key={`del-${idx}`}>
                            <td><input value={item.tipoServico} onChange={(e) => {
                              const upd = form.deliveryItens.map((x, i) => i === idx ? { ...x, tipoServico: e.target.value } : x)
                              setF('deliveryItens', upd)
                            }} readOnly={isViewMode} placeholder="Nome do serviço" /></td>
                            <td><input value={item.tipo} onChange={(e) => {
                              const upd = form.deliveryItens.map((x, i) => i === idx ? { ...x, tipo: e.target.value } : x)
                              setF('deliveryItens', upd)
                            }} readOnly={isViewMode} placeholder="Horas" /></td>
                            <td><input value={item.valorUnit} onChange={(e) => {
                              const upd = form.deliveryItens.map((x, i) => i === idx ? { ...x, valorUnit: e.target.value } : x)
                              setF('deliveryItens', upd)
                            }} readOnly={isViewMode} placeholder="0,00" /></td>
                            {!isViewMode && (
                              <td>
                                <button type="button" onClick={() => setF('deliveryItens', form.deliveryItens.filter((_, i) => i !== idx))} disabled={form.deliveryItens.length <= 1}>Remover</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Outras Informações ───────────────────────── */}
              {activeSection === 'outras' && (
                <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Outras Informações
                  <RichTextEditor
                    key={`outras-${formVersion}`}
                    value={form.outrasInformacoes}
                    onChange={(html) => setF('outrasInformacoes', html)}
                    placeholder="Central de atendimento, links e informações adicionais..."
                    rows={5}
                    disabled={isViewMode || isSaving}
                  />
                </div>
              )}

              {error && <p className="error estimativas-form__full">{error}</p>}

              {!isViewMode && (
                <div className="estimativas-actions estimativas-form__full">
                  <button type="submit" className="button-primary" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      ), document.body)}
    </div>
  )
}
