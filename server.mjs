import express from 'express'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT || 8787)

function normalizeOriginValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    return new URL(raw).origin
  } catch {
    return raw.replace(/\/$/, '')
  }
}

const configuredCorsOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => normalizeOriginValue(item))
  .filter(Boolean)

function getCorsOrigin(originHeader) {
  const requestOrigin = normalizeOriginValue(originHeader)
  if (!requestOrigin) return '*'
  if (!configuredCorsOrigins.length) return '*'
  return configuredCorsOrigins.includes(requestOrigin) ? requestOrigin : ''
}

function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    estimativasTable: process.env.SUPABASE_ESTIMATIVAS_TABLE || 'estimativas',
    estimativaItemsTable: process.env.SUPABASE_ESTIMATIVA_ITEMS_TABLE || 'estimativa_items',
    dailyActivitiesTable: process.env.SUPABASE_DAILY_ACTIVITIES_TABLE || 'daily_activities',
    usersTable: process.env.SUPABASE_USERS_TABLE || 'app_users',
    dataDictionaryTable: process.env.SUPABASE_DATA_DICTIONARY_TABLE || 'data_dictionary',
  }
}

function validateSupabaseConfig() {
  const config = getSupabaseConfig()
  const missing = []

  if (!config.url) missing.push('SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')

  return {
    config,
    missing,
  }
}

function getSupabaseClient() {
  const { config, missing } = validateSupabaseConfig()
  if (missing.length) {
    throw new Error(`Configuracao do Supabase incompleta: ${missing.join(', ')}`)
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return {
    client,
    estimativasTable: config.estimativasTable,
    estimativaItemsTable: config.estimativaItemsTable,
    dailyActivitiesTable: config.dailyActivitiesTable,
    usersTable: config.usersTable,
    dataDictionaryTable: config.dataDictionaryTable,
  }
}

const MENU_KEYS = ['process', 'xml-excel', 'excel-csv-sqlite', 'resume-ranking', 'estimativas', 'daily-activities']

function normalizeMenuPermissions(value) {
  const items = Array.isArray(value) ? value : []
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter((item) => MENU_KEYS.includes(item))))
}

function isVisitorAdminUser(username) {
  return String(username || '').trim().toLowerCase() === 'visitor'
}

function getAdminUserFromRequest(req) {
  const directHeader = req.headers['x-admin-user']
  const headerValue = Array.isArray(directHeader) ? directHeader[0] : directHeader
  return String(headerValue || '').trim().toLowerCase()
}

function getSessionUserFromRequest(req) {
  const usernameHeader = req.headers['x-user']
  const displayNameHeader = req.headers['x-user-display']

  const usernameRaw = Array.isArray(usernameHeader) ? usernameHeader[0] : usernameHeader
  const displayNameRaw = Array.isArray(displayNameHeader) ? displayNameHeader[0] : displayNameHeader

  const username = String(usernameRaw || '').trim().toLowerCase()
  const displayName = String(displayNameRaw || '').trim()

  if (!username) {
    throw new Error('Usuario de sessao nao informado.')
  }

  return {
    username,
    displayName,
  }
}

function getDailyActivityScopeFromRequest(req) {
  const sessionUser = getSessionUserFromRequest(req)
  return {
    ...sessionUser,
    isVisitor: isVisitorAdminUser(sessionUser.username),
    resourceName: sessionUser.displayName || sessionUser.username,
  }
}

function assertVisitorAdmin(req) {
  const adminUser = getAdminUserFromRequest(req)
  if (!isVisitorAdminUser(adminUser)) {
    throw new Error('Acesso negado: rotina restrita ao usuario visitor.')
  }
}

function normalizeUserRow(row) {
  return {
    id: Number(row.id ?? 0),
    username: String(row.username ?? ''),
    displayName: String(row.display_name ?? ''),
    isActive: Boolean(row.is_active),
    allowedMenus: normalizeMenuPermissions(row.allowed_menus),
  }
}

function parseUserPayload(payload) {
  return {
    username: String(payload.username ?? '').trim().toLowerCase(),
    password: String(payload.password ?? '').trim(),
    displayName: String(payload.displayName ?? '').trim(),
    isActive: payload.isActive !== false,
    allowedMenus: normalizeMenuPermissions(payload.allowedMenus),
  }
}

function validateUserPayload(parsed, options = { requirePassword: true }) {
  if (!parsed.username) {
    throw new Error('Usuario obrigatorio.')
  }

  if (options.requirePassword && !parsed.password) {
    throw new Error('Senha obrigatoria.')
  }

  if (!parsed.allowedMenus.length && !isVisitorAdminUser(parsed.username)) {
    throw new Error('Selecione ao menos um item de menu para o usuario.')
  }
}

async function authenticateUser(username, password) {
  const { client, usersTable } = getSupabaseClient()

  const normalizedUsername = String(username || '').trim().toLowerCase()
  const normalizedPassword = String(password || '')

  if (!normalizedUsername || !normalizedPassword) {
    throw new Error('Usuario e senha obrigatorios.')
  }

  const { data: row, error } = await client
    .from(usersTable)
    .select('id, username, password, display_name, is_active, allowed_menus')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!row || String(row.password || '') !== normalizedPassword) {
    throw new Error('Usuario ou senha invalidos.')
  }

  if (!row.is_active) {
    throw new Error('Usuario inativo. Contate o administrador.')
  }

  const user = normalizeUserRow(row)
  if (isVisitorAdminUser(user.username)) {
    user.allowedMenus = Array.from(new Set([...MENU_KEYS, 'user-admin']))
  }

  return user
}

async function listUsers() {
  const { client, usersTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(usersTable)
    .select('id, username, display_name, is_active, allowed_menus, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (rows || []).map(normalizeUserRow)
}

async function createUser(payload) {
  const parsed = parseUserPayload(payload)
  validateUserPayload(parsed, { requirePassword: true })

  const { client, usersTable } = getSupabaseClient()
  const insertPayload = {
    username: parsed.username,
    password: parsed.password,
    display_name: parsed.displayName,
    is_active: parsed.isActive,
    allowed_menus: isVisitorAdminUser(parsed.username) ? MENU_KEYS : parsed.allowedMenus,
  }

  const { data: row, error } = await client
    .from(usersTable)
    .insert(insertPayload)
    .select('id, username, display_name, is_active, allowed_menus')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeUserRow(row)
}

async function updateUser(id, payload) {
  const { client, usersTable } = getSupabaseClient()

  const { data: currentRow, error: currentError } = await client
    .from(usersTable)
    .select('id, username, display_name, is_active, allowed_menus')
    .eq('id', id)
    .single()

  if (currentError) {
    throw new Error(currentError.message)
  }

  if (isVisitorAdminUser(currentRow.username)) {
    const password = String(payload?.password ?? '').trim()
    if (!password) {
      throw new Error('Para o usuario visitor, informe uma nova senha.')
    }

    const { data: visitorRow, error: visitorError } = await client
      .from(usersTable)
      .update({ password })
      .eq('id', id)
      .select('id, username, display_name, is_active, allowed_menus')
      .single()

    if (visitorError) {
      throw new Error(visitorError.message)
    }

    return normalizeUserRow(visitorRow)
  }

  const parsed = parseUserPayload(payload)
  validateUserPayload(parsed, { requirePassword: false })

  const updatePayload = {
    username: parsed.username,
    display_name: parsed.displayName,
    is_active: parsed.isActive,
    allowed_menus: isVisitorAdminUser(parsed.username) ? MENU_KEYS : parsed.allowedMenus,
  }

  if (parsed.password) {
    updatePayload.password = parsed.password
  }

  const { data: row, error } = await client
    .from(usersTable)
    .update(updatePayload)
    .eq('id', id)
    .select('id, username, display_name, is_active, allowed_menus')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeUserRow(row)
}

function normalizeDateInput(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  return trimmed
}

function normalizeEstimateStatus(value) {
  return value === 'sent' ? 'sent' : 'pending'
}

function parseEstimateIdInput(value) {
  const id = Number(String(value ?? '').trim())
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('ID da estimativa invalido.')
  }
  return id
}

function parseDailyActivityIdInput(value) {
  const id = Number(String(value ?? '').trim())
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('ID do apontamento invalido.')
  }
  return id
}

function normalizeDailyActivityRow(row) {
  return {
    id: Number(row.id ?? 0),
    date: String(row.date ?? ''),
    resource: String(row.resource ?? ''),
    activity: String(row.activity ?? ''),
    hours: String(row.hours ?? ''),
    notes: String(row.notes ?? ''),
  }
}

function parseDailyActivityPayload(payload) {
  return {
    date: normalizeDateInput(String(payload.date ?? '')),
    resource: String(payload.resource ?? '').trim(),
    activity: String(payload.activity ?? '').trim(),
    hours: String(payload.hours ?? '').replace(',', '.').trim(),
    notes: String(payload.notes ?? '').trim(),
  }
}

function validateDailyActivityPayload(parsed) {
  const missing = []
  if (!parsed.date) missing.push('date')
  if (!parsed.resource) missing.push('resource')
  if (!parsed.activity) missing.push('activity')

  if (missing.length) {
    throw new Error(`Campos obrigatorios ausentes: ${missing.join(', ')}`)
  }

  const hours = Number(parsed.hours)
  if (Number.isNaN(hours) || hours <= 0) {
    throw new Error('Horas invalida. Informe valor maior que zero.')
  }
}

async function listDailyActivities(scope) {
  const { client, dailyActivitiesTable } = getSupabaseClient()

  let query = client
    .from(dailyActivitiesTable)
    .select('id, date, resource, activity, hours, notes, created_at')
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (!scope.isVisitor) {
    query = query.eq('resource', scope.resourceName)
  }

  const { data: rows, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (rows || []).map(normalizeDailyActivityRow)
}

async function createDailyActivity(payload, scope) {
  const parsed = parseDailyActivityPayload(payload)
  if (!scope.isVisitor) {
    parsed.resource = scope.resourceName
  }
  validateDailyActivityPayload(parsed)

  const { client, dailyActivitiesTable } = getSupabaseClient()
  const insertPayload = {
    date: parsed.date,
    resource: parsed.resource,
    activity: parsed.activity,
    hours: Number(parsed.hours),
    notes: parsed.notes,
  }

  const { data: row, error } = await client
    .from(dailyActivitiesTable)
    .insert(insertPayload)
    .select('id, date, resource, activity, hours, notes')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeDailyActivityRow(row)
}

async function updateDailyActivity(id, payload, scope) {
  const parsed = parseDailyActivityPayload(payload)
  if (!scope.isVisitor) {
    parsed.resource = scope.resourceName
  }
  validateDailyActivityPayload(parsed)

  const { client, dailyActivitiesTable } = getSupabaseClient()

  if (!scope.isVisitor) {
    const { data: ownedItem, error: ownershipError } = await client
      .from(dailyActivitiesTable)
      .select('id, resource')
      .eq('id', id)
      .eq('resource', scope.resourceName)
      .maybeSingle()

    if (ownershipError) {
      throw new Error(ownershipError.message)
    }

    if (!ownedItem) {
      throw new Error('Acesso negado: voce pode editar somente seus apontamentos.')
    }
  }

  const updatePayload = {
    date: parsed.date,
    resource: parsed.resource,
    activity: parsed.activity,
    hours: Number(parsed.hours),
    notes: parsed.notes,
  }

  const { data: row, error } = await client
    .from(dailyActivitiesTable)
    .update(updatePayload)
    .eq('id', id)
    .select('id, date, resource, activity, hours, notes')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeDailyActivityRow(row)
}

async function deleteDailyActivity(id, scope) {
  const { client, dailyActivitiesTable } = getSupabaseClient()

  if (!scope.isVisitor) {
    const { data: ownedItem, error: ownershipError } = await client
      .from(dailyActivitiesTable)
      .select('id, resource')
      .eq('id', id)
      .eq('resource', scope.resourceName)
      .maybeSingle()

    if (ownershipError) {
      throw new Error(ownershipError.message)
    }

    if (!ownedItem) {
      throw new Error('Acesso negado: voce pode excluir somente seus apontamentos.')
    }
  }

  const { error } = await client
    .from(dailyActivitiesTable)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

function normalizeEstimateRow(row, items = []) {
  return {
    id: Number(row.id ?? 0),
    partner: String(row.partner ?? ''),
    client: String(row.client ?? ''),
    date: String(row.date ?? ''),
    demand: String(row.demand ?? ''),
    notes: String(row.notes ?? ''),
    status: normalizeEstimateStatus(row.status),
    items: items.map((item) => ({
      id: Number(item.id ?? 0),
      detail: String(item.detail ?? ''),
      hours: String(item.hours ?? ''),
    })),
  }
}

function parseEstimatePayload(payload) {
  const header = {
    partner: String(payload.partner ?? '').trim(),
    client: String(payload.client ?? '').trim(),
    date: normalizeDateInput(String(payload.date ?? '')),
    demand: String(payload.demand ?? '').trim(),
    notes: String(payload.notes ?? '').trim(),
    status: normalizeEstimateStatus(payload.status),
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items = rawItems
    .map((item, index) => ({
      detail: String(item?.detail ?? '').trim(),
      hours: String(item?.hours ?? '').replace(',', '.').trim(),
      sort_order: index + 1,
    }))
    .filter((item) => item.detail || item.hours)

  return { header, items }
}

function validateEstimatePayload(parsed) {
  const missing = []
  if (!parsed.header.partner) missing.push('partner')
  if (!parsed.header.client) missing.push('client')
  if (!parsed.header.date) missing.push('date')
  if (!parsed.header.demand) missing.push('demand')

  if (missing.length) {
    throw new Error(`Campos obrigatorios ausentes: ${missing.join(', ')}`)
  }

  if (!parsed.items.length) {
    throw new Error('Informe ao menos um item de detalhe/horas.')
  }

  parsed.items.forEach((item, index) => {
    if (!item.detail) {
      throw new Error(`Item ${index + 1}: detalhe obrigatorio.`)
    }

    const hours = Number(item.hours)
    if (Number.isNaN(hours) || hours <= 0) {
      throw new Error(`Item ${index + 1}: horas invalida.`)
    }
  })
}

async function listEstimates() {
  const { client, estimativasTable, estimativaItemsTable } = getSupabaseClient()

  const { data: rows, error } = await client
    .from(estimativasTable)
    .select('id, partner, client, date, demand, notes, status, created_at')
    .order('id', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  if (!rows?.length) return []

  const ids = rows.map((row) => Number(row.id))
  const { data: itemRows, error: itemsError } = await client
    .from(estimativaItemsTable)
    .select('id, estimativa_id, detail, hours, sort_order')
    .in('estimativa_id', ids)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    throw new Error(itemsError.message)
  }

  const itemsByEstimate = new Map()
  ;(itemRows || []).forEach((item) => {
    const key = Number(item.estimativa_id)
    const current = itemsByEstimate.get(key) || []
    current.push(item)
    itemsByEstimate.set(key, current)
  })

  return rows.map((row) => normalizeEstimateRow(row, itemsByEstimate.get(Number(row.id)) || []))
}

async function getEstimateById(id) {
  const { client, estimativasTable, estimativaItemsTable } = getSupabaseClient()

  const { data: row, error } = await client
    .from(estimativasTable)
    .select('id, partner, client, date, demand, notes, status')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const { data: itemRows, error: itemsError } = await client
    .from(estimativaItemsTable)
    .select('id, detail, hours, sort_order')
    .eq('estimativa_id', id)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    throw new Error(itemsError.message)
  }

  return normalizeEstimateRow(row, itemRows || [])
}

async function createEstimate(payload) {
  const parsed = parseEstimatePayload(payload)
  validateEstimatePayload(parsed)

  const { client, estimativasTable, estimativaItemsTable } = getSupabaseClient()

  const { data: inserted, error } = await client
    .from(estimativasTable)
    .insert(parsed.header)
    .select('id, partner, client, date, demand, notes, status')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const estimateId = Number(inserted.id)

  const itemsPayload = parsed.items.map((item) => ({
    estimativa_id: estimateId,
    detail: item.detail,
    hours: Number(item.hours),
    sort_order: item.sort_order,
  }))

  const { data: createdItems, error: itemsError } = await client
    .from(estimativaItemsTable)
    .insert(itemsPayload)
    .select('id, detail, hours')

  if (itemsError) {
    // Best effort rollback if children fail.
    await client.from(estimativasTable).delete().eq('id', estimateId)
    throw new Error(itemsError.message)
  }

  return normalizeEstimateRow(inserted, createdItems || [])
}

async function updateEstimate(id, payload) {
  const parsed = parseEstimatePayload(payload)
  validateEstimatePayload(parsed)

  const { client, estimativasTable, estimativaItemsTable } = getSupabaseClient()

  const { error: updateError } = await client
    .from(estimativasTable)
    .update(parsed.header)
    .eq('id', id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const { error: deleteItemsError } = await client
    .from(estimativaItemsTable)
    .delete()
    .eq('estimativa_id', id)

  if (deleteItemsError) {
    throw new Error(deleteItemsError.message)
  }

  const itemsPayload = parsed.items.map((item) => ({
    estimativa_id: id,
    detail: item.detail,
    hours: Number(item.hours),
    sort_order: item.sort_order,
  }))

  const { error: insertItemsError } = await client
    .from(estimativaItemsTable)
    .insert(itemsPayload)

  if (insertItemsError) {
    throw new Error(insertItemsError.message)
  }

  return getEstimateById(id)
}

async function updateEstimateStatus(id, status) {
  const { client, estimativasTable } = getSupabaseClient()

  const { error } = await client
    .from(estimativasTable)
    .update({ status: normalizeEstimateStatus(status) })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

async function deleteEstimate(id) {
  const { client, estimativasTable } = getSupabaseClient()

  const { error } = await client
    .from(estimativasTable)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

function parseDataDictionarySyncPayload(payload) {
  const sourceFileName = String(payload?.sourceFileName ?? '').trim() || null
  const replaceAll = payload?.replaceAll === true
  const rawItems = Array.isArray(payload?.items) ? payload.items : []

  const unique = new Map()
  for (const item of rawItems) {
    const fieldName = String(item?.fieldName ?? '').trim().toUpperCase()
    const rawType = String(item?.fieldType ?? '').trim().toUpperCase()
    const fieldType = rawType ? rawType.slice(0, 1) : ''
    if (!fieldName || !fieldType) continue
    unique.set(fieldName, {
      field_name: fieldName,
      field_type: fieldType,
      source_file_name: sourceFileName,
      updated_at: new Date().toISOString(),
    })
  }

  const items = Array.from(unique.values())
  if (!items.length) {
    throw new Error('Nenhum mapeamento valido recebido para sincronizacao.')
  }

  return { items, replaceAll }
}

async function syncDataDictionary(payload) {
  const { client, dataDictionaryTable } = getSupabaseClient()
  const parsed = parseDataDictionarySyncPayload(payload)

  if (parsed.replaceAll) {
    const { error: clearError } = await client
      .from(dataDictionaryTable)
      .delete()
      .neq('field_name', '')

    if (clearError) {
      throw new Error(clearError.message)
    }
  }

  const { error: insertError } = await client
    .from(dataDictionaryTable)
    .upsert(parsed.items, { onConflict: 'field_name' })

  if (insertError) {
    throw new Error(insertError.message)
  }

  return { count: parsed.items.length }
}

async function listDataDictionary() {
  const { client, dataDictionaryTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(dataDictionaryTable)
    .select('field_name, field_type')
    .order('field_name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const items = (rows || [])
    .map((row) => ({
      fieldName: String(row.field_name ?? '').trim().toUpperCase(),
      fieldType: String(row.field_type ?? '').trim().toUpperCase(),
    }))
    .filter((item) => item.fieldName && item.fieldType)

  return { items }
}

const SYSTEM_PROMPT = `Voce e um especialista em recrutamento e selecao de RH. Analise o curriculo fornecido em relacao a descricao da vaga e retorne SOMENTE um objeto JSON valido, sem texto adicional, com exatamente esta estrutura:
{
  "score": <inteiro de 0 a 100 representando a aderencia geral do candidato a vaga>,
  "resumo": "<2 a 3 frases em portugues descrevendo o perfil do candidato e seu grau de adequacao a vaga>",
  "pontos_fortes": ["<ponto forte relevante para a vaga>", ...],
  "lacunas": ["<gap ou requisito nao atendido>", ...],
  "habilidades_encontradas": ["<habilidade/tecnologia/requisito presente no curriculo>", ...],
  "habilidades_ausentes": ["<habilidade/tecnologia/requisito da vaga nao encontrado no curriculo>", ...]
}
Seja objetivo e preciso. Limite pontos_fortes e lacunas a no maximo 4 itens cada. Limite habilidades a no maximo 12 itens cada.`

app.use(express.json({ limit: '5mb' }))

app.use((req, res, next) => {
  const requestOrigin = String(req.headers.origin || '')
  const allowedOrigin = getCorsOrigin(requestOrigin)

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-user, x-user-display')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  return next()
})

app.get('/api/health', (_req, res) => {
  const configured = Boolean(process.env.GITHUB_MODELS_TOKEN)
  const supabaseStatus = validateSupabaseConfig()
  res.json({
    status: configured ? 'ok' : 'missing_token',
    provider: 'github-models',
    model: process.env.GITHUB_MODELS_MODEL || 'gpt-4o-mini',
    estimativas: supabaseStatus.missing.length
      ? `missing:${supabaseStatus.missing.join(',')}`
      : 'ok',
  })
})

app.get('/api/estimativas', async (_req, res) => {
  try {
    const items = await listEstimates()
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao buscar estimativas: ${detail}` })
  }
})

app.get('/api/daily-activities', async (req, res) => {
  try {
    const scope = getDailyActivityScopeFromRequest(req)
    const items = await listDailyActivities(scope)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado|acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao buscar apontamentos: ${detail}` })
  }
})

app.post('/api/daily-activities', async (req, res) => {
  try {
    const scope = getDailyActivityScopeFromRequest(req)
    const item = await createDailyActivity(req.body || {}, scope)
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado|acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao salvar apontamento: ${detail}` })
  }
})

app.put('/api/daily-activities/:id', async (req, res) => {
  try {
    const scope = getDailyActivityScopeFromRequest(req)
    const id = parseDailyActivityIdInput(req.params.id)
    const item = await updateDailyActivity(id, req.body || {}, scope)
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado|acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao atualizar apontamento: ${detail}` })
  }
})

app.delete('/api/daily-activities/:id', async (req, res) => {
  try {
    const scope = getDailyActivityScopeFromRequest(req)
    const id = parseDailyActivityIdInput(req.params.id)
    await deleteDailyActivity(id, scope)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado|acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao excluir apontamento: ${detail}` })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const user = await authenticateUser(username, password)
    return res.json({ ok: true, user })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(401).json({ error: detail })
  }
})

app.get('/api/users', async (req, res) => {
  try {
    assertVisitorAdmin(req)
    const items = await listUsers()
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao listar usuarios: ${detail}` })
  }
})

app.post('/api/users', async (req, res) => {
  try {
    assertVisitorAdmin(req)
    const item = await createUser(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao criar usuario: ${detail}` })
  }
})

app.put('/api/users/:id', async (req, res) => {
  try {
    assertVisitorAdmin(req)
    const id = Number(String(req.params.id || '').trim())
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID do usuario invalido.' })
    }

    const item = await updateUser(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao atualizar usuario: ${detail}` })
  }
})

app.post('/api/data-dictionary/sync', async (req, res) => {
  try {
    const result = await syncDataDictionary(req.body || {})
    return res.json({ ok: true, ...result })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao sincronizar dicionario: ${detail}` })
  }
})

app.get('/api/data-dictionary', async (_req, res) => {
  try {
    const result = await listDataDictionary()
    return res.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao buscar dicionario: ${detail}` })
  }
})

app.post('/api/estimativas', async (req, res) => {
  try {
    const item = await createEstimate(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar estimativa: ${detail}` })
  }
})

app.put('/api/estimativas/:id', async (req, res) => {
  try {
    const id = parseEstimateIdInput(req.params.id)

    const item = await updateEstimate(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar estimativa: ${detail}` })
  }
})

app.patch('/api/estimativas/:id/status', async (req, res) => {
  try {
    const id = parseEstimateIdInput(req.params.id)
    const status = req.body?.status

    if (status !== 'pending' && status !== 'sent') {
      return res.status(400).json({ error: 'Status invalido. Use pending ou sent.' })
    }

    await updateEstimateStatus(id, status)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao atualizar status: ${detail}` })
  }
})

app.delete('/api/estimativas/:id', async (req, res) => {
  try {
    const id = parseEstimateIdInput(req.params.id)

    await deleteEstimate(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir estimativa: ${detail}` })
  }
})

app.post('/api/resume-ranking/analyze', async (req, res) => {
  try {
    const githubModelsToken = process.env.GITHUB_MODELS_TOKEN || ''
    const githubModelsModel = process.env.GITHUB_MODELS_MODEL || 'gpt-4o-mini'

    if (!githubModelsToken) {
      return res.status(500).json({
        error: 'Servidor sem token configurado. Defina GITHUB_MODELS_TOKEN no arquivo .env.',
      })
    }

    const { resumeText, jobDescription } = req.body || {}
    if (typeof resumeText !== 'string' || typeof jobDescription !== 'string') {
      return res.status(400).json({ error: 'Payload invalido.' })
    }

    const userMessage = `DESCRICAO DA VAGA:\n${jobDescription.slice(0, 3000)}\n\nCURRICULO:\n${resumeText.slice(0, 8000)}`

    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${githubModelsToken}`,
      },
      body: JSON.stringify({
        model: githubModelsModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 900,
      }),
    })

    if (!response.ok) {
      let detail = ''
      try {
        const err = await response.json()
        detail = err?.error?.message || response.statusText
      } catch {
        detail = response.statusText
      }

      if (response.status === 401 && /models permission is required|models:read|permission/i.test(detail)) {
        return res.status(502).json({
          error: 'Erro 401 no provedor: o token do GitHub precisa da permissao models:read.',
        })
      }

      return res.status(502).json({
        error: `Erro ${response.status} no provedor: ${detail}`,
      })
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || '{}'

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      return res.status(502).json({ error: 'Resposta da IA em formato invalido.' })
    }

    return res.json({
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
    })
  } catch {
    return res.status(500).json({ error: 'Falha interna ao analisar curriculo.' })
  }
})

app.listen(port, () => {
  console.log(`API de ranking rodando em http://localhost:${port}`)
})
