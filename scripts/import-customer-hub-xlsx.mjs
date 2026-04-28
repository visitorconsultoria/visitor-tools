import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import xlsx from 'xlsx'

dotenv.config()

const DEFAULT_FILE = 'D:/Downloads/Celula RH.xlsx'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeStatus(value) {
  const raw = normalizeKey(value)
  if (raw === 'ativo' || raw === 'active') return 'Ativo'
  if (raw === 'inativo' || raw === 'inactive') return 'Inativo'
  if (raw === 'emimplantacao' || raw === 'implantacao' || raw === 'implementation') return 'Em Implantacao'
  return 'Ativo'
}

function normalizeFonte(value) {
  const raw = normalizeKey(value)
  if (raw === 'interno') return 'interno'
  if (raw === 'totvs') return 'totvs'
  if (raw === 'outros' || raw === 'outro') return 'outros'
  return 'interno'
}

function normalizeContatoTipo(value) {
  const raw = normalizeKey(value)
  if (['comercial', 'servicos', 'tecnico', 'usuario', 'gestao', 'outros'].includes(raw)) return raw
  if (raw === 'servico') return 'servicos'
  return 'comercial'
}

function parseDateExcel(value) {
  if (value == null || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = xlsx.SSF.parse_date_code(value)
    if (!parsed) return null
    const month = String(parsed.m).padStart(2, '0')
    const day = String(parsed.d).padStart(2, '0')
    return `${parsed.y}-${month}-${day}`
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10)
  }

  const text = normalizeText(value)
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(0, 10)
  }

  return null
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function getTables() {
  return {
    clients: process.env.SUPABASE_CUSTOMER_CLIENTS_TABLE || 'customer_hub_clients',
    contacts: process.env.SUPABASE_CUSTOMER_CONTACTS_TABLE || 'customer_hub_contacts',
    systems: process.env.SUPABASE_CUSTOMER_SYSTEMS_TABLE || 'customer_hub_systems',
    processes: process.env.SUPABASE_CUSTOMER_PROCESSES_TABLE || 'customer_hub_processes',
    activities: process.env.SUPABASE_CUSTOMER_ACTIVITIES_TABLE || 'customer_hub_activities',
  }
}

function getSheetRows(workbook, name) {
  const sheet = workbook.Sheets[name]
  if (!sheet) return []
  return xlsx.utils.sheet_to_json(sheet, { defval: '' })
}

function getField(row, aliases) {
  const entries = Object.entries(row)
  const aliasKeys = aliases.map((alias) => normalizeKey(alias))

  for (const [rawKey, rawValue] of entries) {
    if (aliasKeys.includes(normalizeKey(rawKey))) {
      return rawValue
    }
  }

  return ''
}

function normalizeClientRow(row) {
  return {
    sourceId: normalizeText(getField(row, ['id'])),
    nome: normalizeText(getField(row, ['name', 'nome', 'clientName', 'cliente'])),
    cnpj: normalizeText(getField(row, ['cnpj', 'document'])),
    segmento: normalizeText(getField(row, ['segment', 'segmento'])),
    cidade: normalizeText(getField(row, ['location', 'cidade'])),
    data_inicio: parseDateExcel(getField(row, ['startDate', 'dataInicio', 'data_inicio'])),
    status: normalizeStatus(getField(row, ['status'])),
    fonte: normalizeFonte(getField(row, ['fonte', 'source'])),
  }
}

function normalizeContactRow(row) {
  return {
    sourceId: normalizeText(getField(row, ['id'])),
    sourceClientId: normalizeText(getField(row, ['clientId', 'clienteId'])),
    sourceClientName: normalizeText(getField(row, ['clientName', 'cliente'])),
    nome: normalizeText(getField(row, ['name', 'nome'])),
    cargo: normalizeText(getField(row, ['role', 'cargo'])),
    departamento: normalizeText(getField(row, ['department', 'departamento'])),
    email: normalizeText(getField(row, ['email'])),
    telefone: normalizeText(getField(row, ['phone', 'telefone'])),
    tipo: normalizeContatoTipo(getField(row, ['tipo', 'type'])),
  }
}

function normalizeSystemRow(row) {
  return {
    sourceId: normalizeText(getField(row, ['id'])),
    sourceClientId: normalizeText(getField(row, ['clientId', 'clienteId'])),
    sourceClientName: normalizeText(getField(row, ['clientName', 'cliente'])),
    produto: normalizeText(getField(row, ['system', 'produto', 'sistema'])),
    modulo: normalizeText(getField(row, ['module', 'modulo'])),
    versao: normalizeText(getField(row, ['version', 'versao'])),
    integracoes: normalizeText(getField(row, ['integrations', 'integracoes'])),
    responsavel: normalizeText(getField(row, ['responsible', 'responsavel'])),
    observacoes: normalizeText(getField(row, ['observations', 'observacoes'])),
  }
}

function normalizeProcessRow(row) {
  return {
    sourceClientId: normalizeText(getField(row, ['clientId', 'clienteId'])),
    sourceClientName: normalizeText(getField(row, ['clientName', 'cliente'])),
    nome: normalizeText(getField(row, ['name', 'nome', 'process', 'processo'])),
    descricao: normalizeText(getField(row, ['description', 'descricao'])),
    criado_em: parseDateExcel(getField(row, ['createdAt', 'created_at', 'data', 'criadoEm'])),
    sistema_nome: normalizeText(getField(row, ['system', 'sistemaNome', 'sistema_nome'])),
    modulo: normalizeText(getField(row, ['module', 'modulo'])),
    responsavel: normalizeText(getField(row, ['responsible', 'responsavel'])),
    detalhamento: normalizeText(getField(row, ['details', 'detalhamento'])),
    observacoes: normalizeText(getField(row, ['observations', 'observacoes'])),
    periodicidade: normalizeKey(getField(row, ['periodicity', 'periodicidade'])) || 'mensal',
    criticidade: normalizeKey(getField(row, ['criticality', 'criticidade'])) || 'media',
  }
}

function normalizeActivityRow(row) {
  return {
    sourceClientId: normalizeText(getField(row, ['clientId', 'clienteId'])),
    sourceClientName: normalizeText(getField(row, ['clientName', 'cliente'])),
    tipo: normalizeText(getField(row, ['type', 'tipo'])) || 'Atividade',
    descricao: normalizeText(getField(row, ['description', 'descricao'])),
    data: parseDateExcel(getField(row, ['date', 'data', 'createdAt', 'created_at'])),
    evento: normalizeText(getField(row, ['event', 'evento'])),
    sistema_nome: normalizeText(getField(row, ['system', 'sistemaNome', 'sistema_nome'])),
    modulo: normalizeText(getField(row, ['module', 'modulo'])),
    responsavel: normalizeText(getField(row, ['responsible', 'responsavel'])),
    processo_nome: normalizeText(getField(row, ['process', 'processName', 'processo_nome'])),
    observacoes: normalizeText(getField(row, ['observations', 'observacoes'])),
  }
}

function normalizePeriodicidade(value) {
  const allowed = new Set(['diario', 'semanal', 'quinzenal', 'mensal', 'semestral', 'anual', 'sazonal'])
  return allowed.has(value) ? value : 'mensal'
}

function normalizeCriticidade(value) {
  const allowed = new Set(['baixa', 'media', 'alta'])
  return allowed.has(value) ? value : 'media'
}

async function deleteAllRows(client, tables) {
  const order = [tables.activities, tables.processes, tables.systems, tables.contacts, tables.clients]

  for (const table of order) {
    const { error } = await client.from(table).delete().gt('id', 0)
    if (error) {
      throw new Error(`Falha ao limpar tabela ${table}: ${error.message}`)
    }
  }
}

async function run() {
  const filePath = process.argv[2] ? String(process.argv[2]) : DEFAULT_FILE
  const mode = process.argv[3] ? String(process.argv[3]).toLowerCase() : 'replace'

  const workbook = xlsx.readFile(filePath)
  const client = getSupabase()
  const tables = getTables()

  const clientsRaw = getSheetRows(workbook, 'Clientes')
  const contactsRaw = getSheetRows(workbook, 'Contatos')
  const systemsRaw = getSheetRows(workbook, 'Sistemas')
  const processesRaw = getSheetRows(workbook, 'Processos')
  const activitiesRaw = getSheetRows(workbook, 'Historico')

  const clientsInput = clientsRaw.map(normalizeClientRow).filter((item) => item.nome)
  const contactsInput = contactsRaw.map(normalizeContactRow).filter((item) => item.nome)
  const systemsInput = systemsRaw.map(normalizeSystemRow).filter((item) => item.produto)
  const processesInput = processesRaw.map(normalizeProcessRow).filter((item) => item.nome)
  const activitiesInput = activitiesRaw.map(normalizeActivityRow).filter((item) => item.descricao || item.evento)

  if (mode === 'replace') {
    await deleteAllRows(client, tables)
  }

  const sourceClientMap = new Map()
  const nameClientMap = new Map()

  for (const row of clientsInput) {
    const payload = {
      nome: row.nome,
      cnpj: row.cnpj,
      segmento: row.segmento,
      cidade: row.cidade,
      status: row.status,
      parceiro: '',
      data_inicio: row.data_inicio,
      fonte: row.fonte,
    }

    const { data, error } = await client
      .from(tables.clients)
      .insert(payload)
      .select('id, nome')
      .single()

    if (error) {
      throw new Error(`Falha ao inserir cliente ${row.nome}: ${error.message}`)
    }

    if (row.sourceId) sourceClientMap.set(row.sourceId, Number(data.id))
    nameClientMap.set(normalizeKey(row.nome), Number(data.id))
  }

  const sourceContactMap = new Map()
  const contactByNameByClient = new Map()

  for (const row of contactsInput) {
    const targetClientId = sourceClientMap.get(row.sourceClientId) || nameClientMap.get(normalizeKey(row.sourceClientName))
    if (!targetClientId) continue

    const payload = {
      cliente_id: targetClientId,
      nome: row.nome,
      cargo: row.cargo,
      departamento: row.departamento,
      email: row.email,
      telefone: row.telefone,
      tipo: row.tipo,
    }

    const { data, error } = await client
      .from(tables.contacts)
      .insert(payload)
      .select('id, cliente_id, nome')
      .single()

    if (error) {
      throw new Error(`Falha ao inserir contato ${row.nome}: ${error.message}`)
    }

    if (row.sourceId) sourceContactMap.set(row.sourceId, Number(data.id))

    const key = `${data.cliente_id}:${normalizeKey(data.nome)}`
    contactByNameByClient.set(key, Number(data.id))
  }

  for (const row of systemsInput) {
    const targetClientId = sourceClientMap.get(row.sourceClientId) || nameClientMap.get(normalizeKey(row.sourceClientName))
    if (!targetClientId) continue

    const contactKey = `${targetClientId}:${normalizeKey(row.responsavel)}`
    const contatoId = contactByNameByClient.get(contactKey) || null

    const payload = {
      cliente_id: targetClientId,
      produto: row.produto,
      modulo: row.modulo,
      versao: row.versao,
      contato_id: contatoId,
      integracoes: row.integracoes,
      responsavel: row.responsavel,
      observacoes: row.observacoes,
    }

    const { error } = await client.from(tables.systems).insert(payload)
    if (error) {
      throw new Error(`Falha ao inserir sistema ${row.produto}: ${error.message}`)
    }
  }

  for (const row of processesInput) {
    const targetClientId = sourceClientMap.get(row.sourceClientId) || nameClientMap.get(normalizeKey(row.sourceClientName))
    if (!targetClientId) continue

    const payload = {
      cliente_id: targetClientId,
      nome: row.nome,
      descricao: row.descricao,
      criado_em: row.criado_em || new Date().toISOString().slice(0, 10),
      sistema_nome: row.sistema_nome,
      modulo: row.modulo,
      responsavel: row.responsavel,
      detalhamento: row.detalhamento,
      observacoes: row.observacoes,
      periodicidade: normalizePeriodicidade(row.periodicidade),
      criticidade: normalizeCriticidade(row.criticidade),
    }

    const { error } = await client.from(tables.processes).insert(payload)
    if (error) {
      throw new Error(`Falha ao inserir processo ${row.nome}: ${error.message}`)
    }
  }

  for (const row of activitiesInput) {
    const targetClientId = sourceClientMap.get(row.sourceClientId) || nameClientMap.get(normalizeKey(row.sourceClientName))
    if (!targetClientId) continue

    const payload = {
      cliente_id: targetClientId,
      tipo: row.tipo || 'Atividade',
      descricao: row.descricao || row.evento || 'Atividade',
      data: row.data || new Date().toISOString().slice(0, 10),
      evento: row.evento,
      sistema_nome: row.sistema_nome,
      modulo: row.modulo,
      responsavel: row.responsavel,
      processo_nome: row.processo_nome,
      observacoes: row.observacoes,
    }

    const { error } = await client.from(tables.activities).insert(payload)
    if (error) {
      throw new Error(`Falha ao inserir historico (${payload.descricao}): ${error.message}`)
    }
  }

  console.log('Importacao concluida com sucesso.')
  console.log(`Arquivo: ${filePath}`)
  console.log(`Clientes: ${clientsInput.length}`)
  console.log(`Contatos: ${contactsInput.length}`)
  console.log(`Sistemas: ${systemsInput.length}`)
  console.log(`Processos: ${processesInput.length}`)
  console.log(`Historico: ${activitiesInput.length}`)
  console.log('Aba Resumos ignorada: nao existe tabela correspondente na API atual.')
}

run().catch((error) => {
  console.error('Erro na importacao:', error.message)
  process.exit(1)
})
