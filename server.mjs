import express from 'express'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { ASSIGNABLE_MENU_KEYS, getEffectiveMenus, isVisitorUsername, normalizeMenuPermissions } from './src/lib/menuConfig.mjs'

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
    digtDemandsTable: process.env.SUPABASE_DIGTE_DEMANDS_TABLE || 'digte_demands',
    customerClientsTable: process.env.SUPABASE_CUSTOMER_CLIENTS_TABLE || 'customer_hub_clients',
    customerContactsTable: process.env.SUPABASE_CUSTOMER_CONTACTS_TABLE || 'customer_hub_contacts',
    customerAccessesTable: process.env.SUPABASE_CUSTOMER_ACCESSES_TABLE || 'customer_hub_accesses',
    customerSystemsTable: process.env.SUPABASE_CUSTOMER_SYSTEMS_TABLE || 'customer_hub_systems',
    customerProcessesTable: process.env.SUPABASE_CUSTOMER_PROCESSES_TABLE || 'customer_hub_processes',
    customerActivitiesTable: process.env.SUPABASE_CUSTOMER_ACTIVITIES_TABLE || 'customer_hub_activities',
    customerStatusReportHistoryTable: process.env.SUPABASE_CUSTOMER_STATUS_REPORT_HISTORY_TABLE || 'customer_hub_status_report_history',
    ticketHubAccessesTable: process.env.SUPABASE_TICKET_HUB_ACCESSES_TABLE || 'ticket_hub_accesses',
    propostasTable: process.env.SUPABASE_PROPOSTAS_TABLE || 'propostas_comerciais',
    rubricaRulesTable: process.env.SUPABASE_RUBRICA_RULES_TABLE || 'rubrica_validation_rules',
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
    digtDemandsTable: config.digtDemandsTable,
    customerClientsTable: config.customerClientsTable,
    customerContactsTable: config.customerContactsTable,
    customerAccessesTable: config.customerAccessesTable,
    customerSystemsTable: config.customerSystemsTable,
    customerProcessesTable: config.customerProcessesTable,
    customerActivitiesTable: config.customerActivitiesTable,
    customerStatusReportHistoryTable: config.customerStatusReportHistoryTable,
    ticketHubAccessesTable: config.ticketHubAccessesTable,
    propostasTable: config.propostasTable,
    rubricaRulesTable: config.rubricaRulesTable,
  }
}

const MENU_KEYS = [...ASSIGNABLE_MENU_KEYS]

function isVisitorAdminUser(username) {
  return isVisitorUsername(username)
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
  const username = String(row.username ?? '')
  return {
    id: Number(row.id ?? 0),
    username,
    displayName: String(row.display_name ?? ''),
    isActive: Boolean(row.is_active),
    allowedMenus: getEffectiveMenus(username, row.allowed_menus, MENU_KEYS),
  }
}

function parseUserPayload(payload) {
  return {
    username: String(payload.username ?? '').trim().toLowerCase(),
    password: String(payload.password ?? '').trim(),
    displayName: String(payload.displayName ?? '').trim(),
    isActive: payload.isActive !== false,
    allowedMenus: normalizeMenuPermissions(payload.allowedMenus, MENU_KEYS),
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

  console.log('[updateUser] id:', id, 'allowed_menus a salvar:', updatePayload.allowed_menus)

  const { data: row, error } = await client
    .from(usersTable)
    .update(updatePayload)
    .eq('id', id)
    .select('id, username, display_name, is_active, allowed_menus')
    .single()

  console.log('[updateUser] Supabase retornou - error:', error, 'allowed_menus salvo:', row?.allowed_menus)

  if (error) {
    throw new Error(error.message)
  }

  if (!row) {
    throw new Error('Supabase nao retornou o registro atualizado. Verifique permissoes RLS.')
  }

  return normalizeUserRow(row)
}

async function changeUserPassword(username, currentPassword, newPassword) {
  const { client, usersTable } = getSupabaseClient()

  const normalizedUsername = String(username || '').trim().toLowerCase()
  const normalizedCurrentPassword = String(currentPassword || '')
  const normalizedNewPassword = String(newPassword || '').trim()

  if (!normalizedUsername) {
    throw new Error('Usuario nao informado.')
  }

  if (!normalizedCurrentPassword) {
    throw new Error('Senha atual obrigatoria.')
  }

  if (!normalizedNewPassword) {
    throw new Error('Nova senha obrigatoria.')
  }

  if (normalizedCurrentPassword === normalizedNewPassword) {
    throw new Error('Nova senha deve ser diferente da senha atual.')
  }

  const { data: row, error } = await client
    .from(usersTable)
    .select('id, username, password, is_active')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!row) {
    throw new Error('Usuario nao encontrado.')
  }

  if (String(row.password || '') !== normalizedCurrentPassword) {
    throw new Error('Senha atual incorreta.')
  }

  if (!row.is_active) {
    throw new Error('Usuario inativo. Contate o administrador.')
  }

  const { error: updateError } = await client
    .from(usersTable)
    .update({ password: normalizedNewPassword })
    .eq('id', row.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  return { ok: true }
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
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'sent') return 'sent'
  if (normalized === 'cancelled') return 'cancelled'
  if (normalized === 'completed') return 'completed'
  return 'pending'
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
    demand: String(row.demand ?? ''),
  }
}

function parseDailyActivityPayload(payload) {
  return {
    date: normalizeDateInput(String(payload.date ?? '')),
    resource: String(payload.resource ?? '').trim(),
    activity: String(payload.activity ?? '').trim(),
    hours: String(payload.hours ?? '').replace(',', '.').trim(),
    notes: String(payload.notes ?? '').trim(),
    demand: String(payload.demand ?? '').trim(),
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
    .select('id, date, resource, activity, hours, notes, demand, created_at')
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
    demand: parsed.demand,
  }

  const { data: row, error } = await client
    .from(dailyActivitiesTable)
    .insert(insertPayload)
    .select('id, date, resource, activity, hours, notes, demand')
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
    demand: parsed.demand,
  }

  const { data: row, error } = await client
    .from(dailyActivitiesTable)
    .update(updatePayload)
    .eq('id', id)
    .select('id, date, resource, activity, hours, notes, demand')
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
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    const to = from + pageSize - 1
    const { data: pageRows, error } = await client
      .from(dataDictionaryTable)
      .select('field_name, field_type')
      .order('field_name', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(error.message)
    }

    const batch = pageRows || []
    rows.push(...batch)

    if (batch.length < pageSize) break
    from += pageSize
  }

  const items = rows
    .map((row) => ({
      fieldName: String(row.field_name ?? '').trim().toUpperCase(),
      fieldType: String(row.field_type ?? '').trim().toUpperCase(),
    }))
    .filter((item) => item.fieldName && item.fieldType)

  return { items }
}

// ---- Central de Clientes ----

const CUSTOMER_CLIENT_STATUSES = ['Ativo', 'Inativo', 'Em Implantacao']
const CUSTOMER_CLIENT_FONTES = ['interno', 'totvs', 'outros']
const CUSTOMER_CONTACT_TYPES = ['comercial', 'servicos', 'tecnico', 'usuario', 'gestao', 'outros']
const CUSTOMER_ACCESS_TYPES = ['vpn', 'servidores', 'protheus', 'outros']
const CUSTOMER_PROCESS_PERIODICITIES = ['diario', 'semanal', 'quinzenal', 'mensal', 'semestral', 'anual', 'sazonal']
const CUSTOMER_PROCESS_CRITICALITIES = ['baixa', 'media', 'alta']
const STATUS_REPORT_PHASES = ['pending', 'typed', 'sent']

function parseCustomerHubIdInput(value, label) {
  const id = Number(String(value ?? '').trim())
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`ID de ${label} invalido.`)
  }
  return id
}

function normalizeCustomerClientStatus(value) {
  const status = String(value || '').trim()
  return CUSTOMER_CLIENT_STATUSES.includes(status) ? status : 'Ativo'
}

function normalizeCustomerClientFonte(value) {
  const fonte = String(value || '').trim().toLowerCase()
  return CUSTOMER_CLIENT_FONTES.includes(fonte) ? fonte : 'interno'
}

function normalizeCustomerContactType(value) {
  const type = String(value || '').trim().toLowerCase()
  return CUSTOMER_CONTACT_TYPES.includes(type) ? type : 'comercial'
}

function normalizeCustomerAccessType(value) {
  const type = String(value || '').trim().toLowerCase()
  return CUSTOMER_ACCESS_TYPES.includes(type) ? type : 'vpn'
}

function normalizeCustomerProcessPeriodicity(value) {
  const v = String(value || '').trim().toLowerCase()
  return CUSTOMER_PROCESS_PERIODICITIES.includes(v) ? v : 'mensal'
}

function normalizeCustomerProcessCriticality(value) {
  const v = String(value || '').trim().toLowerCase()
  return CUSTOMER_PROCESS_CRITICALITIES.includes(v) ? v : 'media'
}

function normalizeCustomerClientRow(row) {
  return {
    id: Number(row.id ?? 0),
    nome: String(row.nome ?? ''),
    cnpj: String(row.cnpj ?? ''),
    segmento: String(row.segmento ?? ''),
    cidade: String(row.cidade ?? ''),
    status: normalizeCustomerClientStatus(row.status),
    organizations: String(row.organizations ?? ''),
    dataInicio: row.data_inicio ? String(row.data_inicio) : '',
    fonte: normalizeCustomerClientFonte(row.fonte),
  }
}

function normalizeCustomerContactRow(row) {
  return {
    id: Number(row.id ?? 0),
    nome: String(row.nome ?? ''),
    clienteId: Number(row.cliente_id ?? 0),
    cargo: String(row.cargo ?? ''),
    departamento: String(row.departamento ?? ''),
    email: String(row.email ?? ''),
    telefone: String(row.telefone ?? ''),
    tipo: normalizeCustomerContactType(row.tipo),
  }
}

function normalizeCustomerSystemRow(row) {
  return {
    id: Number(row.id ?? 0),
    produto: String(row.produto ?? ''),
    clienteId: Number(row.cliente_id ?? 0),
    modulo: String(row.modulo ?? ''),
    versao: String(row.versao ?? ''),
    contatoId: row.contato_id == null ? null : Number(row.contato_id),
    integracoes: String(row.integracoes ?? ''),
    responsavel: String(row.responsavel ?? ''),
    observacoes: String(row.observacoes ?? ''),
  }
}

function normalizeCustomerAccessRow(row) {
  return {
    id: Number(row.id ?? 0),
    clienteId: Number(row.cliente_id ?? 0),
    tipo: normalizeCustomerAccessType(row.tipo),
    nome: String(row.nome ?? ''),
    endereco: String(row.endereco ?? ''),
    usuario: String(row.usuario ?? ''),
    senha: String(row.senha ?? ''),
    observacoes: String(row.observacoes ?? ''),
    particular: Boolean(row.particular),
    createdByUsername: String(row.created_by_username ?? ''),
  }
}

function normalizeCustomerProcessRow(row) {
  return {
    id: Number(row.id ?? 0),
    clienteId: Number(row.cliente_id ?? 0),
    nome: String(row.nome ?? ''),
    descricao: String(row.descricao ?? ''),
    criadoEm: String(row.criado_em ?? ''),
    sistemaNome: String(row.sistema_nome ?? ''),
    modulo: String(row.modulo ?? ''),
    responsavel: String(row.responsavel ?? ''),
    detalhamento: String(row.detalhamento ?? ''),
    observacoes: String(row.observacoes ?? ''),
    periodicidade: normalizeCustomerProcessPeriodicity(row.periodicidade),
    criticidade: normalizeCustomerProcessCriticality(row.criticidade),
  }
}

function normalizeCustomerActivityRow(row) {
  return {
    id: Number(row.id ?? 0),
    clienteId: Number(row.cliente_id ?? 0),
    tipo: String(row.tipo ?? ''),
    descricao: String(row.descricao ?? ''),
    data: String(row.data ?? ''),
    evento: String(row.evento ?? ''),
    sistemaNome: String(row.sistema_nome ?? ''),
    modulo: String(row.modulo ?? ''),
    responsavel: String(row.responsavel ?? ''),
    processoNome: String(row.processo_nome ?? ''),
    observacoes: String(row.observacoes ?? ''),
  }
}

function normalizeStatusReportPhase(value) {
  const phase = String(value || '').trim().toLowerCase()
  return STATUS_REPORT_PHASES.includes(phase) ? phase : 'pending'
}

function normalizeStatusReportHistoryTicket(ticket) {
  const data = ticket && typeof ticket === 'object' && !Array.isArray(ticket)
    ? ticket
    : {}

  return {
    ticketKey: String(data.ticketKey ?? '').trim(),
    ticketId: String(data.ticketId ?? '').trim(),
    protocol: String(data.protocol ?? '').trim(),
    subject: String(data.subject ?? '').trim(),
    organizationName: String(data.organizationName ?? '').trim(),
    sourceStatus: String(data.sourceStatus ?? '').trim(),
    sourceSituation: String(data.sourceSituation ?? '').trim(),
    reportStatus: String(data.reportStatus ?? '').trim(),
    reportPhase: normalizeStatusReportPhase(data.reportPhase),
  }
}

function normalizeCustomerStatusReportHistoryRow(row) {
  const ticketsRaw = Array.isArray(row.tickets_json) ? row.tickets_json : []
  const tickets = ticketsRaw
    .map(normalizeStatusReportHistoryTicket)
    .filter((ticket) => ticket.ticketKey || ticket.protocol || ticket.ticketId || ticket.subject)

  return {
    id: Number(row.id ?? 0),
    clientId: Number(row.cliente_id ?? 0),
    createdByUsername: String(row.created_by_username ?? ''),
    createdByDisplayName: String(row.created_by_display_name ?? ''),
    sentAt: String(row.sent_at ?? row.created_at ?? ''),
    totalTickets: Number(row.total_tickets ?? tickets.length),
    tickets,
  }
}

function parseCustomerClientPayload(payload) {
  const payloadAsObject = payload && typeof payload === 'object' ? payload : {}
  const organizations = normalizeOrganizationIds(payloadAsObject.organizations ?? payloadAsObject.partnerOrganizations)

  return {
    nome: String(payload.nome ?? '').trim(),
    cnpj: String(payload.cnpj ?? '').trim(),
    segmento: String(payload.segmento ?? '').trim(),
    cidade: String(payload.cidade ?? '').trim(),
    status: normalizeCustomerClientStatus(payload.status),
    organizations: organizations.join(','),
    data_inicio: normalizeDateInput(String(payload.dataInicio ?? '')) || null,
    fonte: normalizeCustomerClientFonte(payload.fonte),
  }
}

function validateCustomerClientPayload(parsed) {
  if (!parsed.nome) {
    throw new Error('Nome do cliente obrigatorio.')
  }
}

function parseCustomerContactPayload(payload) {
  return {
    nome: String(payload.nome ?? '').trim(),
    cliente_id: parseCustomerHubIdInput(payload.clienteId, 'cliente'),
    cargo: String(payload.cargo ?? '').trim(),
    departamento: String(payload.departamento ?? '').trim(),
    email: String(payload.email ?? '').trim(),
    telefone: String(payload.telefone ?? '').trim(),
    tipo: normalizeCustomerContactType(payload.tipo),
  }
}

function validateCustomerContactPayload(parsed) {
  if (!parsed.nome) {
    throw new Error('Nome do contato obrigatorio.')
  }
}

function parseCustomerSystemPayload(payload) {
  const rawContatoId = payload.contatoId
  const contatoIdText = String(rawContatoId ?? '').trim()

  return {
    produto: String(payload.produto ?? '').trim(),
    cliente_id: parseCustomerHubIdInput(payload.clienteId, 'cliente'),
    modulo: String(payload.modulo ?? '').trim(),
    versao: String(payload.versao ?? '').trim(),
    contato_id: contatoIdText ? parseCustomerHubIdInput(rawContatoId, 'contato') : null,
    integracoes: String(payload.integracoes ?? '').trim(),
    responsavel: String(payload.responsavel ?? '').trim(),
    observacoes: String(payload.observacoes ?? '').trim(),
  }
}

function validateCustomerSystemPayload(parsed) {
  if (!parsed.produto) {
    throw new Error('Produto/Sistema obrigatorio.')
  }
}

function parseCustomerAccessPayload(payload) {
  return {
    cliente_id: parseCustomerHubIdInput(payload.clienteId, 'cliente'),
    tipo: normalizeCustomerAccessType(payload.tipo),
    nome: String(payload.nome ?? '').trim(),
    endereco: String(payload.endereco ?? '').trim(),
    usuario: String(payload.usuario ?? '').trim(),
    senha: String(payload.senha ?? '').trim(),
    observacoes: String(payload.observacoes ?? '').trim(),
    particular: payload.particular === true,
  }
}

function validateCustomerAccessPayload(parsed) {
  if (!parsed.nome) {
    throw new Error('Nome do acesso obrigatorio.')
  }
}

function parseCustomerProcessPayload(payload) {
  return {
    cliente_id: parseCustomerHubIdInput(payload.clienteId, 'cliente'),
    nome: String(payload.nome ?? '').trim(),
    descricao: String(payload.descricao ?? '').trim(),
    criado_em: normalizeDateInput(String(payload.criadoEm ?? '')) || new Date().toISOString().slice(0, 10),
    sistema_nome: String(payload.sistemaNome ?? '').trim(),
    modulo: String(payload.modulo ?? '').trim(),
    responsavel: String(payload.responsavel ?? '').trim(),
    detalhamento: String(payload.detalhamento ?? '').trim(),
    observacoes: String(payload.observacoes ?? '').trim(),
    periodicidade: normalizeCustomerProcessPeriodicity(payload.periodicidade),
    criticidade: normalizeCustomerProcessCriticality(payload.criticidade),
  }
}

function validateCustomerProcessPayload(parsed) {
  if (!parsed.nome) {
    throw new Error('Nome do processo obrigatorio.')
  }
}

function parseCustomerActivityPayload(payload) {
  return {
    cliente_id: parseCustomerHubIdInput(payload.clienteId, 'cliente'),
    tipo: String(payload.tipo ?? '').trim() || 'Atividade',
    descricao: String(payload.descricao ?? '').trim(),
    data: normalizeDateInput(String(payload.data ?? '')) || new Date().toISOString().slice(0, 10),
    evento: String(payload.evento ?? '').trim(),
    sistema_nome: String(payload.sistemaNome ?? '').trim(),
    modulo: String(payload.modulo ?? '').trim(),
    responsavel: String(payload.responsavel ?? '').trim(),
    processo_nome: String(payload.processoNome ?? '').trim(),
    observacoes: String(payload.observacoes ?? '').trim(),
  }
}

function validateCustomerActivityPayload(parsed) {
  if (!parsed.descricao) {
    throw new Error('Descricao da atividade obrigatoria.')
  }
}

function parseCustomerStatusReportHistoryPayload(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}
  const sentAtRaw = String(source.sentAt ?? '').trim()

  const ticketsInput = Array.isArray(source.tickets) ? source.tickets : []
  const tickets = ticketsInput
    .map(normalizeStatusReportHistoryTicket)
    .filter((ticket) => ticket.ticketKey || ticket.protocol || ticket.ticketId || ticket.subject)

  return {
    cliente_id: parseCustomerHubIdInput(source.clientId, 'cliente'),
    sent_at: sentAtRaw || new Date().toISOString(),
    tickets_json: tickets,
    total_tickets: tickets.length,
  }
}

function validateCustomerStatusReportHistoryPayload(parsed) {
  if (!Array.isArray(parsed.tickets_json) || parsed.tickets_json.length === 0) {
    throw new Error('Informe ao menos um ticket enviado para gravar o historico.')
  }
}

async function listCustomerClients() {
  const { client, customerClientsTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(customerClientsTable)
    .select('id, nome, cnpj, segmento, cidade, status, organizations, data_inicio, fonte, created_at')
    .order('nome', { ascending: true })

  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerClientRow)
}

async function createCustomerClient(payload) {
  const parsed = parseCustomerClientPayload(payload)
  validateCustomerClientPayload(parsed)

  const { client, customerClientsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerClientsTable)
    .insert(parsed)
    .select('id, nome, cnpj, segmento, cidade, status, organizations, data_inicio, fonte')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerClientRow(row)
}

async function updateCustomerClient(id, payload) {
  const parsed = parseCustomerClientPayload(payload)
  validateCustomerClientPayload(parsed)

  const { client, customerClientsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerClientsTable)
    .update(parsed)
    .eq('id', id)
    .select('id, nome, cnpj, segmento, cidade, status, organizations, data_inicio, fonte')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerClientRow(row)
}

async function deleteCustomerClient(id) {
  const { client, customerClientsTable } = getSupabaseClient()
  const { error } = await client
    .from(customerClientsTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function listCustomerContacts(clientId) {
  const { client, customerContactsTable } = getSupabaseClient()
  let query = client
    .from(customerContactsTable)
    .select('id, nome, cliente_id, cargo, departamento, email, telefone, tipo, created_at')
    .order('nome', { ascending: true })

  if (clientId) {
    query = query.eq('cliente_id', clientId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerContactRow)
}

async function createCustomerContact(payload) {
  const parsed = parseCustomerContactPayload(payload)
  validateCustomerContactPayload(parsed)

  const { client, customerContactsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerContactsTable)
    .insert(parsed)
    .select('id, nome, cliente_id, cargo, departamento, email, telefone, tipo')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerContactRow(row)
}

async function updateCustomerContact(id, payload) {
  const parsed = parseCustomerContactPayload(payload)
  validateCustomerContactPayload(parsed)

  const { client, customerContactsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerContactsTable)
    .update(parsed)
    .eq('id', id)
    .select('id, nome, cliente_id, cargo, departamento, email, telefone, tipo')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerContactRow(row)
}

async function deleteCustomerContact(id) {
  const { client, customerContactsTable } = getSupabaseClient()
  const { error } = await client
    .from(customerContactsTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function listCustomerSystems(clientId) {
  const { client, customerSystemsTable } = getSupabaseClient()
  let query = client
    .from(customerSystemsTable)
    .select('id, produto, cliente_id, modulo, versao, contato_id, integracoes, responsavel, observacoes, created_at')
    .order('produto', { ascending: true })

  if (clientId) {
    query = query.eq('cliente_id', clientId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerSystemRow)
}

async function createCustomerSystem(payload) {
  const parsed = parseCustomerSystemPayload(payload)
  validateCustomerSystemPayload(parsed)

  const { client, customerSystemsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerSystemsTable)
    .insert(parsed)
    .select('id, produto, cliente_id, modulo, versao, contato_id, integracoes, responsavel, observacoes')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerSystemRow(row)
}

async function updateCustomerSystem(id, payload) {
  const parsed = parseCustomerSystemPayload(payload)
  validateCustomerSystemPayload(parsed)

  const { client, customerSystemsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerSystemsTable)
    .update(parsed)
    .eq('id', id)
    .select('id, produto, cliente_id, modulo, versao, contato_id, integracoes, responsavel, observacoes')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerSystemRow(row)
}

async function deleteCustomerSystem(id) {
  const { client, customerSystemsTable } = getSupabaseClient()
  const { error } = await client
    .from(customerSystemsTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function listCustomerAccesses(clientId, scope) {
  const { client, customerAccessesTable } = getSupabaseClient()
  let query = client
    .from(customerAccessesTable)
    .select('id, cliente_id, tipo, nome, endereco, usuario, senha, observacoes, particular, created_by_username, created_at')
    .order('nome', { ascending: true })

  if (clientId) {
    query = query.eq('cliente_id', clientId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)

  const normalizedRows = (rows || []).map(normalizeCustomerAccessRow)
  if (!scope?.username) {
    return normalizedRows.filter((item) => !item.particular)
  }

  return normalizedRows.filter((item) => !item.particular || item.createdByUsername === scope.username)
}

async function createCustomerAccess(payload, scope) {
  const parsed = parseCustomerAccessPayload(payload)
  validateCustomerAccessPayload(parsed)
  if (!scope?.username) {
    throw new Error('Usuario de sessao nao informado.')
  }

  parsed.created_by_username = scope.username

  const { client, customerAccessesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerAccessesTable)
    .insert(parsed)
    .select('id, cliente_id, tipo, nome, endereco, usuario, senha, observacoes, particular, created_by_username')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerAccessRow(row)
}

async function updateCustomerAccess(id, payload, scope) {
  const parsed = parseCustomerAccessPayload(payload)
  validateCustomerAccessPayload(parsed)
  if (!scope?.username) {
    throw new Error('Usuario de sessao nao informado.')
  }

  const { client, customerAccessesTable } = getSupabaseClient()
  const { data: currentRow, error: currentError } = await client
    .from(customerAccessesTable)
    .select('id, particular, created_by_username')
    .eq('id', id)
    .maybeSingle()

  if (currentError) throw new Error(currentError.message)
  if (!currentRow) throw new Error('Acesso nao encontrado.')

  if (currentRow.particular === true && String(currentRow.created_by_username ?? '') !== scope.username) {
    throw new Error('Acesso negado: apenas o criador pode alterar este acesso particular.')
  }

  const updatePayload = { ...parsed }
  if (parsed.particular === true && !String(currentRow.created_by_username ?? '').trim()) {
    updatePayload.created_by_username = scope.username
  }

  const { data: row, error } = await client
    .from(customerAccessesTable)
    .update(updatePayload)
    .eq('id', id)
    .select('id, cliente_id, tipo, nome, endereco, usuario, senha, observacoes, particular, created_by_username')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerAccessRow(row)
}

async function deleteCustomerAccess(id, scope) {
  const { client, customerAccessesTable } = getSupabaseClient()

  const { data: currentRow, error: currentError } = await client
    .from(customerAccessesTable)
    .select('id, particular, created_by_username')
    .eq('id', id)
    .maybeSingle()

  if (currentError) throw new Error(currentError.message)
  if (!currentRow) throw new Error('Acesso nao encontrado.')

  if (currentRow.particular === true && String(currentRow.created_by_username ?? '') !== String(scope?.username ?? '')) {
    throw new Error('Acesso negado: apenas o criador pode excluir este acesso particular.')
  }

  const { error } = await client
    .from(customerAccessesTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function listCustomerProcesses(clientId) {
  const { client, customerProcessesTable } = getSupabaseClient()
  let query = client
    .from(customerProcessesTable)
    .select('id, cliente_id, nome, descricao, criado_em, sistema_nome, modulo, responsavel, detalhamento, observacoes, periodicidade, criticidade, created_at')
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })

  if (clientId) {
    query = query.eq('cliente_id', clientId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerProcessRow)
}

async function createCustomerProcess(payload) {
  const parsed = parseCustomerProcessPayload(payload)
  validateCustomerProcessPayload(parsed)

  const { client, customerProcessesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerProcessesTable)
    .insert(parsed)
    .select('id, cliente_id, nome, descricao, criado_em, sistema_nome, modulo, responsavel, detalhamento, observacoes, periodicidade, criticidade')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerProcessRow(row)
}

async function updateCustomerProcess(id, payload) {
  const parsed = parseCustomerProcessPayload(payload)
  validateCustomerProcessPayload(parsed)

  const { client, customerProcessesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerProcessesTable)
    .update(parsed)
    .eq('id', id)
    .select('id, cliente_id, nome, descricao, criado_em, sistema_nome, modulo, responsavel, detalhamento, observacoes, periodicidade, criticidade')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerProcessRow(row)
}

async function deleteCustomerProcess(id) {
  const { client, customerProcessesTable } = getSupabaseClient()
  const { error } = await client
    .from(customerProcessesTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function listCustomerActivities(clientId) {
  const { client, customerActivitiesTable } = getSupabaseClient()
  let query = client
    .from(customerActivitiesTable)
    .select('id, cliente_id, tipo, descricao, data, evento, sistema_nome, modulo, responsavel, processo_nome, observacoes, created_at')
    .order('data', { ascending: false })
    .order('id', { ascending: false })

  if (clientId) {
    query = query.eq('cliente_id', clientId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerActivityRow)
}

async function createCustomerActivity(payload) {
  const parsed = parseCustomerActivityPayload(payload)
  validateCustomerActivityPayload(parsed)

  const { client, customerActivitiesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerActivitiesTable)
    .insert(parsed)
    .select('id, cliente_id, tipo, descricao, data, evento, sistema_nome, modulo, responsavel, processo_nome, observacoes')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerActivityRow(row)
}

async function updateCustomerActivity(id, payload) {
  const parsed = parseCustomerActivityPayload(payload)
  validateCustomerActivityPayload(parsed)

  const { client, customerActivitiesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerActivitiesTable)
    .update(parsed)
    .eq('id', id)
    .select('id, cliente_id, tipo, descricao, data, evento, sistema_nome, modulo, responsavel, processo_nome, observacoes')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerActivityRow(row)
}

async function deleteCustomerActivity(id) {
  const { client, customerActivitiesTable } = getSupabaseClient()
  const { error } = await client
    .from(customerActivitiesTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function listCustomerStatusReportHistory(clientId, limit = 10) {
  const { client, customerStatusReportHistoryTable } = getSupabaseClient()
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(50, Math.floor(Number(limit)))
    : 10

  const { data: rows, error } = await client
    .from(customerStatusReportHistoryTable)
    .select('id, cliente_id, created_by_username, created_by_display_name, sent_at, total_tickets, tickets_json, created_at')
    .eq('cliente_id', clientId)
    .order('sent_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit)

  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerStatusReportHistoryRow)
}

async function createCustomerStatusReportHistory(payload, scope) {
  if (!scope?.username) {
    throw new Error('Usuario de sessao nao informado.')
  }

  const parsed = parseCustomerStatusReportHistoryPayload(payload)
  validateCustomerStatusReportHistoryPayload(parsed)

  const insertPayload = {
    ...parsed,
    created_by_username: scope.username,
    created_by_display_name: String(scope.displayName || '').trim(),
  }

  const { client, customerStatusReportHistoryTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerStatusReportHistoryTable)
    .insert(insertPayload)
    .select('id, cliente_id, created_by_username, created_by_display_name, sent_at, total_tickets, tickets_json, created_at')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerStatusReportHistoryRow(row)
}

async function getCustomerHubBootstrap(scope) {
  const [clientes, contatos, acessos, sistemas, processos, atividades] = await Promise.all([
    listCustomerClients(),
    listCustomerContacts(),
    listCustomerAccesses(null, scope),
    listCustomerSystems(),
    listCustomerProcesses(),
    listCustomerActivities(),
  ])

  return {
    // Backward-compatible payload: frontend uses English keys today.
    clients: clientes,
    contacts: contatos,
    accesses: acessos,
    systems: sistemas,
    processes: processos,
    activities: atividades,
    clientes,
    contatos,
    acessos,
    sistemas,
    processos,
    atividades,
  }
}

const TOMTICKET_OPEN_SITUATIONS = '0,1,2,3,6,7,8,9,10,11'
const STATUS_REPORT_TICKETS_CACHE_TTL_MS = 30_000
const statusReportTicketsCache = new Map()

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeTomTicketComparableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function parseLinkedTomTicketOrganizationIds(value) {
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

function normalizeCustomerStatusReportTicket(ticket) {
  const extractString = (value) => {
    if (value == null) return ''
    if (typeof value === 'object' && !Array.isArray(value)) {
      const objectValue = value
      const candidate = objectValue.name ?? objectValue.label ?? objectValue.description ?? objectValue.title ?? objectValue.id
      return String(candidate ?? '').trim()
    }
    return String(value).trim()
  }

  const readNested = (value, path) => {
    let current = value
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
      current = current[segment]
    }
    return current
  }

  const pickFirst = (...values) => {
    for (const value of values) {
      const parsed = extractString(value)
      if (parsed) return parsed
    }
    return ''
  }

  const customer = ticket.customer && typeof ticket.customer === 'object' ? ticket.customer : null
  const organization = ticket.organization && typeof ticket.organization === 'object' ? ticket.organization : null

  return {
    id: pickFirst(ticket.id, ticket.ticket_id, ticket.ticketId, ticket.id_ticket, ticket.idTicket, ticket.ticket_hash, ticket.hash, readNested(ticket, ['ticket', 'id']), readNested(ticket, ['data', 'id'])),
    organizationId: pickFirst(organization?.id, ticket.organization_id, ticket.id_organization, ticket.organizationId, ticket.org_id),
    protocol: pickFirst(ticket.protocol, ticket.ticket_protocol, ticket.number, ticket.protocolo),
    subject: pickFirst(ticket.subject, ticket.title, ticket.assunto),
    department: pickFirst(ticket.department_name, ticket.department, ticket.queue_name, ticket.group_name),
    client: pickFirst(customer?.name, ticket.customer_name, ticket.client_name, ticket.requester_name, ticket.user_name),
    status: pickFirst(ticket.status_name, ticket.status, ticket.status_label),
    situation: pickFirst(ticket.situation_name, ticket.situation, ticket.state_name),
    organizationName: pickFirst(organization?.name, ticket.organization_name, ticket.org_name, ticket.company_name),
    createdAt: pickFirst(ticket.creation_date, ticket.created_at, ticket.created, ticket.created_date, ticket.opened_at, ticket.date_create),
    updatedAt: pickFirst(ticket.updated_at, ticket.updated, ticket.last_update, ticket.date_update),
  }
}

function ticketMatchesCustomer(ticket, customerName) {
  const needle = normalizeTomTicketComparableText(customerName)
  if (!needle) return false

  const haystack = normalizeTomTicketComparableText([
    ticket.client,
    ticket.organizationName,
    ticket.subject,
    ticket.department,
    ticket.status,
    ticket.situation,
  ].filter(Boolean).join(' '))

  if (!haystack) return false
  if (haystack.includes(needle) || needle.includes(haystack)) return true

  const tokens = needle.split(/\s+/).filter((token) => token.length >= 3)
  return tokens.some((token) => haystack.includes(token))
}

function isTomTicketFinalized(ticket) {
  const rawSituation = String(ticket.situation ?? '').trim()
  if (rawSituation === '5') {
    return true
  }

  const normalizedSituation = normalizeTomTicketComparableText(ticket.situation)
  return normalizedSituation === 'finalizado'
}

function parseTomTicketDate(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function isExcludedFromStatusReport(ticket) {
  const marker = 'sustentacao continuada'
  const haystack = normalizeTomTicketComparableText([
    ticket.subject,
    ticket.department,
    ticket.client,
    ticket.organizationName,
    ticket.status,
    ticket.situation,
  ].filter(Boolean).join(' '))

  return haystack.includes(marker)
}

function getStatusReportTicketMatchKey(ticket) {
  return [
    String(ticket.id || '').trim(),
    String(ticket.protocol || '').trim(),
    String(ticket.subject || '').trim().toLowerCase(),
    String(ticket.organizationId || '').trim(),
  ].join('|')
}

async function listOpenTicketHubTicketsForUsername(username, situationFilter = TOMTICKET_OPEN_SITUATIONS, organizationIds = null) {
  const userAccess = await getTicketHubUserAccessByUsername(username)
  if (!TOMTICKET_API_TOKEN) {
    throw new Error('Token TomTicket não configurado no servidor.')
  }

  const requestedOrganizationIds = Array.isArray(organizationIds)
    ? normalizeOrganizationIds(organizationIds)
    : []
  const userOrganizationIds = normalizeOrganizationIds(userAccess.organizations)
  const allowedOrganizationIds = new Set(userOrganizationIds)
  const scopedOrganizationIds = requestedOrganizationIds.length
    ? (userAccess.isVisitor
      ? requestedOrganizationIds
      : requestedOrganizationIds.filter((organizationId) => allowedOrganizationIds.has(organizationId)))
    : userOrganizationIds

  const cacheOrganizations = requestedOrganizationIds.length
    ? [...scopedOrganizationIds].sort((a, b) => String(a).localeCompare(String(b)))
    : (userAccess.isVisitor
      ? ['*visitor*']
      : [...userOrganizationIds].sort((a, b) => String(a).localeCompare(String(b))))
  const cacheKey = JSON.stringify({
    username,
    organizations: cacheOrganizations,
    situationFilter: String(situationFilter ?? ''),
  })
  const cachedEntry = statusReportTicketsCache.get(cacheKey)
  if (cachedEntry && (Date.now() - Number(cachedEntry.createdAt ?? 0)) < STATUS_REPORT_TICKETS_CACHE_TTL_MS) {
    return cachedEntry.tickets
  }

  const maxTomTicketPagesRaw = Number(process.env.TOMTICKET_STATUS_REPORT_MAX_PAGES || '1000')
  const maxTomTicketPages = Number.isFinite(maxTomTicketPagesRaw) && maxTomTicketPagesRaw > 0
    ? Math.floor(maxTomTicketPagesRaw)
    : 1000
  const headers = {
    'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const fetchTomTicketList = async (organizationId = '', page = 1, sit = situationFilter) => {
    const url = new URL(`${TOMTICKET_API_BASE_URL}/ticket/list`)
    url.searchParams.set('page', String(page))
    if (organizationId) {
      url.searchParams.set('organization_id', organizationId)
    }
    const finalUrl = sit ? `${url.toString()}&situation=${sit}` : url.toString()

    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(finalUrl, { method: 'GET', headers })

      if (response.status === 429) {
        if (attempt === maxAttempts) {
          throw new Error('TomTicket atingiu limite de requisições (429). Tente novamente em alguns segundos.')
        }

        const retryAfterRaw = Number(response.headers.get('retry-after') || '')
        const retryAfterMs = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
          ? retryAfterRaw * 1000
          : attempt * 900
        await waitMs(retryAfterMs)
        continue
      }

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Erro ${response.status} na API TomTicket.`)
      }

      return response.json()
    }

    throw new Error('Falha ao consultar chamados no TomTicket.')
  }

  const fetchTomTicketListAllPages = async (organizationId = '', sit = situationFilter) => {
    const mapByKey = new Map()
    let repeatedPagesWithoutNewItems = 0

    for (let page = 1; page <= maxTomTicketPages; page += 1) {
      let data
      try {
        data = await fetchTomTicketList(organizationId, page, sit)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error ?? '')
        if (/page not found/i.test(detail) || /"errorcode"\s*:\s*404/i.test(detail)) {
          break
        }
        throw error
      }

      const items = extractTomTicketTickets(data)
      if (!items.length) break

      let addedInPage = 0
      for (const item of items) {
        const key = JSON.stringify(item)
        if (!mapByKey.has(key)) {
          mapByKey.set(key, item)
          addedInPage += 1
        }
      }

      if (addedInPage === 0) {
        repeatedPagesWithoutNewItems += 1
      } else {
        repeatedPagesWithoutNewItems = 0
      }

      if (repeatedPagesWithoutNewItems >= 2) break
    }

    return Array.from(mapByKey.values())
  }

  let tickets = []
  try {
    if (!requestedOrganizationIds.length && userAccess.isVisitor) {
      tickets = await fetchTomTicketListAllPages('', situationFilter)
    } else if (!scopedOrganizationIds.length) {
      tickets = []
    } else {
      const mapByKey = new Map()
      for (const organizationId of scopedOrganizationIds) {
        try {
          const items = await fetchTomTicketListAllPages(organizationId, situationFilter)
          for (const item of items) {
            const key = JSON.stringify(item)
            if (!mapByKey.has(key)) {
              mapByKey.set(key, item)
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error ?? '')
          if (/organization not found/i.test(detail)) {
            continue
          }
          throw error
        }
      }
      tickets = Array.from(mapByKey.values())
    }
  } catch (error) {
    if (cachedEntry?.tickets) {
      return cachedEntry.tickets
    }
    throw error
  }

  const normalizedTickets = tickets.map(normalizeCustomerStatusReportTicket)
  statusReportTicketsCache.set(cacheKey, {
    createdAt: Date.now(),
    tickets: normalizedTickets,
  })

  return normalizedTickets
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

const DATA_COMPARISON_SYSTEM_PROMPT = `Voce e um especialista em reconciliacao de dados financeiros. Recebera um resumo de comparacao entre arquivo base e arquivos comparados, focado em itens ausentes no arquivo comparado.
Retorne SOMENTE um objeto JSON valido, sem texto adicional, com exatamente esta estrutura:
{
  "resumoGeral": "<resumo em portugues com foco no impacto dos itens ausentes>",
  "arquivos": [
    {
      "comparedFile": "<nome do arquivo comparado>",
      "diagnosis": "<diagnostico objetivo da causa provavel das ausencias>",
      "missingCount": <numero de itens ausentes>,
      "missingValueTotal": <valor total ausente em numero>,
      "topMissingKeys": ["<ate 8 chaves mais criticas>"],
      "recommendations": ["<acoes praticas de correcao>"]
    }
  ],
  "alertas": ["<riscos ou inconsistencias de alto impacto>"],
  "planoAcao": ["<passo 1>", "<passo 2>"]
}
Regras:
- Foco principal: identificar e explicar o que existe no base e esta ausente no comparado.
- Seja direto e acionavel.
- recommendations com no maximo 5 itens por arquivo.
- alertas com no maximo 8 itens.
- planoAcao com no maximo 8 passos.`

app.use(express.json({ limit: '40mb' }))

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

app.get('/api/auth/me', async (req, res) => {
  try {
    const usernameHeader = req.headers['x-user']
    const raw = Array.isArray(usernameHeader) ? usernameHeader[0] : usernameHeader
    const username = String(raw || '').trim().toLowerCase()

    if (!username) {
      return res.status(400).json({ error: 'Usuario nao informado.' })
    }

    const { client, usersTable } = getSupabaseClient()

    if (isVisitorAdminUser(username)) {
      return res.json({
        ok: true,
        allowedMenus: Array.from(new Set([...MENU_KEYS, 'user-admin'])),
      })
    }

    const { data: row, error } = await client
      .from(usersTable)
      .select('is_active, allowed_menus')
      .eq('username', username)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!row || !row.is_active) {
      return res.status(403).json({ error: 'Usuario inativo ou nao encontrado.' })
    }

    return res.json({ ok: true, allowedMenus: normalizeMenuPermissions(row.allowed_menus) })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao obter permissoes: ${detail}` })
  }
})

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const usernameHeader = req.headers['x-user']
    const raw = Array.isArray(usernameHeader) ? usernameHeader[0] : usernameHeader
    const username = String(raw || '').trim().toLowerCase()

    if (!username) {
      return res.status(400).json({ error: 'Usuario nao informado.' })
    }

    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '').trim()
    const confirmPassword = String(req.body?.confirmPassword || '').trim()

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Nova senha e confirmacao nao conferem.' })
    }

    await changeUserPassword(username, currentPassword, newPassword)
    return res.json({ ok: true, message: 'Senha alterada com sucesso.' })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /incorreta|nao encontrado|inativo/i.test(detail) ? 401 : 400
    return res.status(status).json({ error: detail })
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

    if (status !== 'pending' && status !== 'sent' && status !== 'cancelled' && status !== 'completed') {
      return res.status(400).json({ error: 'Status invalido. Use pending, sent, cancelled ou completed.' })
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

// ---- DIGTE Demands ----

const DIGTE_DEMAND_STATUSES = ['open', 'in_progress', 'done', 'cancelled']

function normalizeDigteDemandStatus(value) {
  const s = String(value || '').trim()
  return DIGTE_DEMAND_STATUSES.includes(s) ? s : 'open'
}

function parseDigteDemandIdInput(value) {
  const id = Number(String(value ?? '').trim())
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('ID da demanda invalido.')
  }
  return id
}

function normalizeDigteDemandRow(row) {
  return {
    id: Number(row.id ?? 0),
    number: String(row.number ?? ''),
    date: String(row.date ?? ''),
    type: String(row.type ?? ''),
    client: String(row.client ?? ''),
    requester: String(row.requester ?? ''),
    description: String(row.description ?? ''),
    responsible: String(row.responsible ?? ''),
    status: normalizeDigteDemandStatus(row.status),
    notes: String(row.notes ?? ''),
  }
}

function parseDigteDemandPayload(payload) {
  return {
    number: String(payload.number ?? '').trim(),
    date: normalizeDateInput(String(payload.date ?? '')),
    type: String(payload.type ?? '').trim(),
    client: String(payload.client ?? '').trim(),
    requester: String(payload.requester ?? '').trim(),
    description: String(payload.description ?? '').trim(),
    responsible: String(payload.responsible ?? '').trim(),
    status: normalizeDigteDemandStatus(payload.status),
    notes: String(payload.notes ?? '').trim(),
  }
}

function validateDigteDemandPayload(parsed) {
  const missing = []
  if (!parsed.date) missing.push('date')
  if (!parsed.requester) missing.push('requester')
  if (!parsed.description) missing.push('description')
  if (!parsed.responsible) missing.push('responsible')
  if (missing.length) {
    throw new Error(`Campos obrigatorios ausentes: ${missing.join(', ')}`)
  }
}

async function listDigteDemands() {
  const { client, digtDemandsTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(digtDemandsTable)
    .select('id, number, date, type, client, requester, description, responsible, status, notes, created_at')
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (rows || []).map(normalizeDigteDemandRow)
}

async function createDigteDemand(payload) {
  const parsed = parseDigteDemandPayload(payload)
  validateDigteDemandPayload(parsed)

  const { client, digtDemandsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(digtDemandsTable)
    .insert(parsed)
    .select('id, number, date, type, client, requester, description, responsible, status, notes')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeDigteDemandRow(row)
}

async function updateDigteDemand(id, payload) {
  const parsed = parseDigteDemandPayload(payload)
  validateDigteDemandPayload(parsed)

  const { client, digtDemandsTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(digtDemandsTable)
    .update(parsed)
    .eq('id', id)
    .select('id, number, date, type, client, requester, description, responsible, status, notes')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeDigteDemandRow(row)
}

async function deleteDigteDemand(id) {
  const { client, digtDemandsTable } = getSupabaseClient()
  const { error } = await client
    .from(digtDemandsTable)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

app.get('/api/digte-demands', async (_req, res) => {
  try {
    const items = await listDigteDemands()
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao buscar demandas: ${detail}` })
  }
})

app.post('/api/digte-demands', async (req, res) => {
  try {
    const item = await createDigteDemand(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar demanda: ${detail}` })
  }
})

app.put('/api/digte-demands/:id', async (req, res) => {
  try {
    const id = parseDigteDemandIdInput(req.params.id)
    const item = await updateDigteDemand(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar demanda: ${detail}` })
  }
})

app.delete('/api/digte-demands/:id', async (req, res) => {
  try {
    const id = parseDigteDemandIdInput(req.params.id)
    await deleteDigteDemand(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir demanda: ${detail}` })
  }
})

app.get('/api/customer-hub/bootstrap', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const data = await getCustomerHubBootstrap(scope)
    return res.json(data)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao carregar Central de Clientes: ${detail}` })
  }
})

app.get('/api/customer-hub/organizations', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const organizations = await listTicketHubOrganizationsForScope(scope)
    return res.json({ organizations })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao carregar organizacoes: ${detail}` })
  }
})

app.get('/api/customer-hub/status-report', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')

    const periodDaysRaw = Array.isArray(req.query.periodDays) ? req.query.periodDays[0] : req.query.periodDays
    const parsedPeriodDays = Number.parseInt(String(periodDaysRaw ?? '').trim(), 10)
    const periodDays = Number.isFinite(parsedPeriodDays)
      ? Math.max(1, Math.min(90, parsedPeriodDays))
      : 7

    const emptyDashboard = {
      periodDays,
      openedLast15Days: 0,
      finalizedLast15Days: 0,
      openedPrevious15Days: 0,
      finalizedPrevious15Days: 0,
      openedCurrentTickets: [],
      finalizedCurrentTickets: [],
      openedPreviousTickets: [],
      finalizedPreviousTickets: [],
    }

    const scope = getSessionUserFromRequest(req)
    const clientIdRaw = Array.isArray(req.query.clientId) ? req.query.clientId[0] : req.query.clientId
    const organizationIdsRaw = Array.isArray(req.query.organizationIds) ? req.query.organizationIds.join(',') : req.query.organizationIds
    const { client, customerClientsTable } = getSupabaseClient()
    let clientData = null

    const queryOrganizationIds = parseLinkedTomTicketOrganizationIds(organizationIdsRaw)
    let linkedOrganizationIds = queryOrganizationIds

    if (clientIdRaw != null && String(clientIdRaw).trim()) {
      const clientId = parseCustomerHubIdInput(clientIdRaw, 'cliente')

      const { data: clientRow, error: clientError } = await client
        .from(customerClientsTable)
        .select('id, nome, cnpj, segmento, cidade, status, organizations, data_inicio, fonte, created_at')
        .eq('id', clientId)
        .maybeSingle()

      if (clientError) throw new Error(clientError.message)
      if (!clientRow) {
        return res.status(404).json({ error: 'Cliente não encontrado.' })
      }

      clientData = normalizeCustomerClientRow(clientRow)
      if (!linkedOrganizationIds.length) {
        linkedOrganizationIds = parseLinkedTomTicketOrganizationIds(clientData.organizations)
      }
    }

    const userAccess = await getTicketHubUserAccessByUsername(scope.username)
    const allowedOrganizationIds = new Set(normalizeOrganizationIds(userAccess.organizations))
    const matchedOrganizationIds = userAccess.isVisitor
      ? linkedOrganizationIds
      : linkedOrganizationIds.filter((organizationId) => allowedOrganizationIds.has(organizationId))

    if (!matchedOrganizationIds.length) {
      return res.json({
        client: clientData,
        tickets: [],
        totalTickets: 0,
        dashboard: emptyDashboard,
      })
    }

    if (!TOMTICKET_API_TOKEN) {
      return res.json({
        client: clientData,
        tickets: [],
        totalTickets: 0,
        dashboard: emptyDashboard,
        warning: 'Token TomTicket não configurado no servidor.',
      })
    }

    const tickets = await listOpenTicketHubTicketsForUsername(
      scope.username,
      TOMTICKET_OPEN_SITUATIONS,
      matchedOrganizationIds,
    )
    const nonFinalizedTickets = tickets
      .filter((ticket) => !isTomTicketFinalized(ticket))
      .filter((ticket) => !isExcludedFromStatusReport(ticket))

    const matchedTickets = Array.from(new Map(
      nonFinalizedTickets.map((ticket) => [getStatusReportTicketMatchKey(ticket), ticket]),
    ).values())

    const ticketsFor15dWindow = await listOpenTicketHubTicketsForUsername(
      scope.username,
      '',
      matchedOrganizationIds,
    )

    const toDashboardTicketItem = (ticket) => ({
      ticketId: String(ticket.id || '').trim(),
      protocol: String(ticket.protocol || ticket.id || '').trim(),
      subject: String(ticket.subject || '').trim(),
      organizationName: String(ticket.organizationName || '').trim(),
    })

    const now = Date.now()
    const periodDurationMs = periodDays * 24 * 60 * 60 * 1000
    const periodStartMs = now - periodDurationMs
    const previousPeriodStartMs = now - (periodDurationMs * 2)

    const openedCurrentTickets = ticketsFor15dWindow.filter((ticket) => {
      const createdAt = parseTomTicketDate(ticket.createdAt)
      if (!createdAt) return false
      return createdAt.getTime() >= periodStartMs
    })

    const openedLast15Days = openedCurrentTickets.length

    const openedPreviousTickets = ticketsFor15dWindow.filter((ticket) => {
      const createdAt = parseTomTicketDate(ticket.createdAt)
      if (!createdAt) return false
      const createdAtMs = createdAt.getTime()
      return createdAtMs >= previousPeriodStartMs && createdAtMs < periodStartMs
    })

    const openedPrevious15Days = openedPreviousTickets.length

    const finalizedCurrentTickets = ticketsFor15dWindow.filter((ticket) => {
      if (!isTomTicketFinalized(ticket)) return false

      const updatedAt = parseTomTicketDate(ticket.updatedAt)
      const createdAt = parseTomTicketDate(ticket.createdAt)
      const referenceDate = updatedAt || createdAt
      if (!referenceDate) return false
      return referenceDate.getTime() >= periodStartMs
    })

    const finalizedLast15Days = finalizedCurrentTickets.length

    const finalizedPreviousTickets = ticketsFor15dWindow.filter((ticket) => {
      if (!isTomTicketFinalized(ticket)) return false

      const updatedAt = parseTomTicketDate(ticket.updatedAt)
      const createdAt = parseTomTicketDate(ticket.createdAt)
      const referenceDate = updatedAt || createdAt
      if (!referenceDate) return false

      const referenceDateMs = referenceDate.getTime()
      return referenceDateMs >= previousPeriodStartMs && referenceDateMs < periodStartMs
    })

    const finalizedPrevious15Days = finalizedPreviousTickets.length

    return res.json({
      client: clientData,
      tickets: matchedTickets,
      totalTickets: matchedTickets.length,
      dashboard: {
        periodDays,
        openedLast15Days,
        finalizedLast15Days,
        openedPrevious15Days,
        finalizedPrevious15Days,
        openedCurrentTickets: openedCurrentTickets.map(toDashboardTicketItem),
        finalizedCurrentTickets: finalizedCurrentTickets.map(toDashboardTicketItem),
        openedPreviousTickets: openedPreviousTickets.map(toDashboardTicketItem),
        finalizedPreviousTickets: finalizedPreviousTickets.map(toDashboardTicketItem),
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao carregar status report: ${detail}` })
  }
})

app.get('/api/customer-hub/status-report/history', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const clientIdRaw = Array.isArray(req.query.clientId) ? req.query.clientId[0] : req.query.clientId
    const clientId = parseCustomerHubIdInput(clientIdRaw, 'cliente')
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
    const limit = Number(String(limitRaw ?? '').trim() || '10')

    const items = await listCustomerStatusReportHistory(clientId, limit)
    return res.json({
      clientId,
      items,
      total: items.length,
      requestedBy: scope.username,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao carregar historico do status report: ${detail}` })
  }
})

app.post('/api/customer-hub/status-report/history', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const item = await createCustomerStatusReportHistory(req.body || {}, scope)
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao gravar historico do status report: ${detail}` })
  }
})

app.get('/api/customer-hub/clients', async (_req, res) => {
  try {
    const items = await listCustomerClients()
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao buscar clientes: ${detail}` })
  }
})

app.post('/api/customer-hub/clients', async (req, res) => {
  try {
    const item = await createCustomerClient(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar cliente: ${detail}` })
  }
})

app.put('/api/customer-hub/clients/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'cliente')
    const item = await updateCustomerClient(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar cliente: ${detail}` })
  }
})

app.delete('/api/customer-hub/clients/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'cliente')
    await deleteCustomerClient(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir cliente: ${detail}` })
  }
})

app.get('/api/customer-hub/contacts', async (req, res) => {
  try {
    const clientIdRaw = String(req.query.clientId ?? '').trim()
    const clientId = clientIdRaw ? parseCustomerHubIdInput(clientIdRaw, 'cliente') : null
    const items = await listCustomerContacts(clientId)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao buscar contatos: ${detail}` })
  }
})

app.post('/api/customer-hub/contacts', async (req, res) => {
  try {
    const item = await createCustomerContact(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar contato: ${detail}` })
  }
})

app.put('/api/customer-hub/contacts/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'contato')
    const item = await updateCustomerContact(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar contato: ${detail}` })
  }
})

app.delete('/api/customer-hub/contacts/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'contato')
    await deleteCustomerContact(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir contato: ${detail}` })
  }
})

app.get('/api/customer-hub/accesses', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const clientIdRaw = String(req.query.clientId ?? '').trim()
    const clientId = clientIdRaw ? parseCustomerHubIdInput(clientIdRaw, 'cliente') : null
    const items = await listCustomerAccesses(clientId, scope)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao buscar acessos: ${detail}` })
  }
})

app.post('/api/customer-hub/accesses', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const item = await createCustomerAccess(req.body || {}, scope)
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao salvar acesso: ${detail}` })
  }
})

app.put('/api/customer-hub/accesses/:id', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const id = parseCustomerHubIdInput(req.params.id, 'acesso')
    const item = await updateCustomerAccess(id, req.body || {}, scope)
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado|acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao atualizar acesso: ${detail}` })
  }
})

app.delete('/api/customer-hub/accesses/:id', async (req, res) => {
  try {
    const scope = getSessionUserFromRequest(req)
    const id = parseCustomerHubIdInput(req.params.id, 'acesso')
    await deleteCustomerAccess(id, scope)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /sessao nao informado|acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao excluir acesso: ${detail}` })
  }
})

app.get('/api/customer-hub/systems', async (req, res) => {
  try {
    const clientIdRaw = String(req.query.clientId ?? '').trim()
    const clientId = clientIdRaw ? parseCustomerHubIdInput(clientIdRaw, 'cliente') : null
    const items = await listCustomerSystems(clientId)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao buscar sistemas: ${detail}` })
  }
})

app.post('/api/customer-hub/systems', async (req, res) => {
  try {
    const item = await createCustomerSystem(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar sistema: ${detail}` })
  }
})

app.put('/api/customer-hub/systems/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'sistema')
    const item = await updateCustomerSystem(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar sistema: ${detail}` })
  }
})

app.delete('/api/customer-hub/systems/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'sistema')
    await deleteCustomerSystem(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir sistema: ${detail}` })
  }
})

app.get('/api/customer-hub/processes', async (req, res) => {
  try {
    const clientIdRaw = String(req.query.clientId ?? '').trim()
    const clientId = clientIdRaw ? parseCustomerHubIdInput(clientIdRaw, 'cliente') : null
    const items = await listCustomerProcesses(clientId)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao buscar processos: ${detail}` })
  }
})

app.post('/api/customer-hub/processes', async (req, res) => {
  try {
    const item = await createCustomerProcess(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar processo: ${detail}` })
  }
})

app.put('/api/customer-hub/processes/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'processo')
    const item = await updateCustomerProcess(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar processo: ${detail}` })
  }
})

app.delete('/api/customer-hub/processes/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'processo')
    await deleteCustomerProcess(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir processo: ${detail}` })
  }
})

app.get('/api/customer-hub/activities', async (req, res) => {
  try {
    const clientIdRaw = String(req.query.clientId ?? '').trim()
    const clientId = clientIdRaw ? parseCustomerHubIdInput(clientIdRaw, 'cliente') : null
    const items = await listCustomerActivities(clientId)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao buscar atividades: ${detail}` })
  }
})

app.post('/api/customer-hub/activities', async (req, res) => {
  try {
    const item = await createCustomerActivity(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar atividade: ${detail}` })
  }
})

app.put('/api/customer-hub/activities/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'atividade')
    const item = await updateCustomerActivity(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar atividade: ${detail}` })
  }
})

app.delete('/api/customer-hub/activities/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'atividade')
    await deleteCustomerActivity(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir atividade: ${detail}` })
  }
})

// ---- Resume Ranking ----

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

app.post('/api/data-comparison/analyze', async (req, res) => {
  try {
    const githubModelsToken = process.env.GITHUB_MODELS_TOKEN || ''
    const githubModelsModel = process.env.GITHUB_MODELS_MODEL || 'gpt-4o-mini'

    if (!githubModelsToken) {
      return res.status(500).json({
        error: 'Servidor sem token configurado. Defina GITHUB_MODELS_TOKEN no arquivo .env.',
      })
    }

    const payload = req.body || {}
    if (
      typeof payload !== 'object'
      || typeof payload.baseFileName !== 'string'
      || !Array.isArray(payload.keyFields)
      || !Array.isArray(payload.files)
    ) {
      return res.status(400).json({ error: 'Payload invalido para analise de comparacao.' })
    }

    const safePayload = {
      comparisonMode: String(payload.comparisonMode || 'row'),
      baseFileName: String(payload.baseFileName || ''),
      keyFields: payload.keyFields.slice(0, 10).map((item) => String(item || '')),
      valueFields: Array.isArray(payload.valueFields)
        ? payload.valueFields.slice(0, 10).map((item) => String(item || ''))
        : [],
      files: payload.files.slice(0, 25).map((item) => ({
        comparedFile: String(item?.comparedFile || ''),
        missingCount: Number(item?.missingCount || 0),
        missingValueTotal: Number(item?.missingValueTotal || 0),
        missingItems: Array.isArray(item?.missingItems)
          ? item.missingItems.slice(0, 60).map((missing) => ({
            key: String(missing?.key || ''),
            baseValue: typeof missing?.baseValue === 'string' ? missing.baseValue : '',
            baseTotal: Number(missing?.baseTotal || 0),
          }))
          : [],
      })),
    }

    const userMessage = `RESUMO PARA ANALISE DE AUSENCIAS:\n${JSON.stringify(safePayload).slice(0, 22000)}`

    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${githubModelsToken}`,
      },
      body: JSON.stringify({
        model: githubModelsModel,
        messages: [
          { role: 'system', content: DATA_COMPARISON_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.15,
        max_tokens: 1200,
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

    const arquivos = Array.isArray(parsed.arquivos)
      ? parsed.arquivos.slice(0, 25).map((item) => ({
        comparedFile: String(item?.comparedFile || ''),
        diagnosis: String(item?.diagnosis || ''),
        missingCount: Number(item?.missingCount || 0),
        missingValueTotal: Number(item?.missingValueTotal || 0),
        topMissingKeys: Array.isArray(item?.topMissingKeys)
          ? item.topMissingKeys.slice(0, 8).map((value) => String(value || ''))
          : [],
        recommendations: Array.isArray(item?.recommendations)
          ? item.recommendations.slice(0, 5).map((value) => String(value || ''))
          : [],
      }))
      : []

    return res.json({
      resumoGeral: String(parsed.resumoGeral || ''),
      arquivos,
      alertas: Array.isArray(parsed.alertas)
        ? parsed.alertas.slice(0, 8).map((item) => String(item || ''))
        : [],
      planoAcao: Array.isArray(parsed.planoAcao)
        ? parsed.planoAcao.slice(0, 8).map((item) => String(item || ''))
        : [],
    })
  } catch {
    return res.status(500).json({ error: 'Falha interna ao analisar comparacao de dados.' })
  }
})

// ---- Ticket Hub ----

const TOMTICKET_API_TOKEN = String(
  process.env.TOMTICKET_API_TOKEN
  || process.env.VITE_TOMTICKET_TOKEN
  || '',
).trim()
const TOMTICKET_API_BASE_URL = String(
  process.env.TOMTICKET_API_BASE_URL
  || process.env.VITE_TOMTICKET_API_BASE
  || 'https://api.tomticket.com/v2.0',
).replace(/\/+$/, '')
const TOMTICKET_DEFAULT_OPERATOR_ID = '07af7d3bb8d9636238663974e409e569'

function extractTomTicketOrganizations(payload) {
  const arrays = []

  const collect = (node, depth = 0) => {
    if (depth > 4 || node == null) return

    if (Array.isArray(node)) {
      arrays.push(node)
      for (const item of node) {
        collect(item, depth + 1)
      }
      return
    }

    if (typeof node !== 'object') return

    const commonKeys = ['organizations', 'organization', 'data', 'results', 'result', 'items']
    for (const key of commonKeys) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        collect(node[key], depth + 1)
      }
    }
  }

  collect(payload)

  const getId = (item) => {
    const candidates = [item.id, item.organization_id, item.id_organization, item.organizationId, item.org_id]
    for (const candidate of candidates) {
      const value = String(candidate ?? '').trim()
      if (value) return value
    }
    return ''
  }

  const getName = (item) => {
    const candidates = [item.name, item.organization_name, item.org_name, item.fantasia, item.company_name]
    for (const candidate of candidates) {
      const value = String(candidate ?? '').trim()
      if (value) return value
    }
    return ''
  }

  const mapById = new Map()
  for (const list of arrays) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const id = getId(item)
      const name = getName(item)
      if (!id || !name) continue
      if (!mapById.has(id)) {
        mapById.set(id, { id, name })
      }
    }
  }

  return Array.from(mapById.values())
}

async function listTicketHubOrganizationsForScope(scope) {
  if (!TOMTICKET_API_TOKEN) {
    return []
  }

  let userAccess
  try {
    userAccess = await getTicketHubUserAccessByUsername(scope.username)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? '')
    if (/acesso negado|nao encontrado|sessao/i.test(detail)) {
      return []
    }
    throw error
  }

  const response = await fetch(`${TOMTICKET_API_BASE_URL}/organization/list`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Erro ${response.status} na API TomTicket (organizations).`)
  }

  const data = await response.json()
  const organizations = extractTomTicketOrganizations(data)

  if (userAccess.isVisitor) {
    return organizations
  }

  const allowedOrganizations = new Set(normalizeOrganizationIds(userAccess.organizations))
  if (!allowedOrganizations.size) {
    return []
  }

  return organizations.filter((item) => allowedOrganizations.has(String(item.id)))
}

app.get('/api/ticket-hub/organizations', async (_req, res) => {
  if (!TOMTICKET_API_TOKEN) {
    return res.status(500).json({ error: 'Token TomTicket não configurado no servidor.' })
  }

  try {
    const response = await fetch(`${TOMTICKET_API_BASE_URL}/organization/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const detail = await response.text()
      return res.status(response.status).json({ error: `Erro na API TomTicket: ${detail}` })
    }

    const data = await response.json()
    const organizations = extractTomTicketOrganizations(data)
    return res.json({ organizations })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao consultar TomTicket: ${detail}` })
  }
})

function normalizeOrganizationIds(organizations) {
  const normalized = Array.isArray(organizations)
    ? organizations.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  return Array.from(new Set(normalized))
}

function extractTicketDetailOrganizationIds(detailData) {
  const ids = [
    detailData?.customer?.organization?.id,
    detailData?.organization?.id,
    detailData?.organization_id,
    detailData?.id_organization,
    detailData?.org_id,
  ]

  return normalizeOrganizationIds(ids)
}

function extractTomTicketTickets(payload) {
  const arrays = []

  const collect = (node, depth = 0) => {
    if (depth > 4 || node == null) return

    if (Array.isArray(node)) {
      arrays.push(node)
      for (const item of node) {
        collect(item, depth + 1)
      }
      return
    }

    if (typeof node !== 'object') return

    const commonKeys = ['tickets', 'ticket', 'data', 'results', 'result', 'items']
    for (const key of commonKeys) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        collect(node[key], depth + 1)
      }
    }
  }

  collect(payload)

  const seen = new Set()
  const list = []
  for (const array of arrays) {
    for (const item of array) {
      if (!item || typeof item !== 'object') continue
      const key = JSON.stringify(item)
      if (seen.has(key)) continue
      seen.add(key)
      list.push(item)
    }
  }

  return list
}

async function getTicketHubUserAccessByUsername(username) {
  const normalizedUsername = String(username || '').trim().toLowerCase()
  if (!normalizedUsername) {
    throw new Error('Usuario da sessao nao informado.')
  }

  if (isVisitorAdminUser(normalizedUsername)) {
    return {
      isVisitor: true,
      organizations: [],
    }
  }

  const { client, usersTable, ticketHubAccessesTable } = getSupabaseClient()
  const { data: userRow, error: userError } = await client
    .from(usersTable)
    .select('id, username, allowed_menus')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (userError) throw new Error(userError.message)
  if (!userRow) throw new Error('Usuario nao encontrado para acesso da Central de Chamados.')

  const allowedMenus = normalizeMenuPermissions(userRow.allowed_menus, MENU_KEYS)
  if (!allowedMenus.includes('ticket-hub')) {
    throw new Error('Acesso negado: usuario sem permissao para a Central de Chamados.')
  }

  const { data: accessRow, error: accessError } = await client
    .from(ticketHubAccessesTable)
    .select('organizations')
    .eq('user_id', Number(userRow.id))
    .maybeSingle()

  if (accessError) throw new Error(accessError.message)

  return {
    isVisitor: false,
    organizations: normalizeOrganizationIds(accessRow?.organizations),
  }
}

async function upsertTicketHubOrganizations(userId, organizations) {
  const { client, ticketHubAccessesTable } = getSupabaseClient()
  const normalizedOrganizations = normalizeOrganizationIds(organizations)

  const { error } = await client
    .from(ticketHubAccessesTable)
    .upsert(
      {
        user_id: userId,
        organizations: normalizedOrganizations,
      },
      { onConflict: 'user_id' },
    )

  if (error) throw new Error(error.message)

  return normalizedOrganizations
}

async function getTicketHubOrganizationMap(userIds) {
  const normalizedIds = (Array.isArray(userIds) ? userIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)

  if (!normalizedIds.length) {
    return new Map()
  }

  const { client, ticketHubAccessesTable } = getSupabaseClient()
  const { data, error } = await client
    .from(ticketHubAccessesTable)
    .select('user_id, organizations')
    .in('user_id', normalizedIds)

  if (error) throw new Error(error.message)

  const map = new Map()
  for (const row of (data || [])) {
    const id = Number(row.user_id)
    if (!Number.isInteger(id) || id <= 0) continue
    map.set(id, normalizeOrganizationIds(row.organizations))
  }

  return map
}

async function listTicketHubAppUsers() {
  const { client, usersTable } = getSupabaseClient()
  const { data, error } = await client
    .from(usersTable)
    .select('id, username, display_name, is_active, allowed_menus')
    .order('username', { ascending: true })

  if (error) throw new Error(error.message)

  return (data || [])
    .filter((row) => !isVisitorAdminUser(row.username))
    .map((row) => {
      const allowedMenus = normalizeMenuPermissions(row.allowed_menus, MENU_KEYS)
      return {
        id: Number(row.id),
        username: String(row.username ?? ''),
        displayName: String(row.display_name ?? ''),
        isActive: Boolean(row.is_active),
        hasTicketHubAccess: allowedMenus.includes('ticket-hub'),
      }
    })
}

// Helper: load all app users that have 'ticket-hub' permission and merge their org assignments
async function getTicketHubUsers() {
  const { client, usersTable } = getSupabaseClient()
  const { data, error } = await client
    .from(usersTable)
    .select('id, username, display_name, is_active, allowed_menus')
    .contains('allowed_menus', ['ticket-hub'])
    .order('username', { ascending: true })

  if (error) throw new Error(error.message)

  const users = (data || [])
  const organizationMap = await getTicketHubOrganizationMap(users.map((row) => Number(row.id)))

  return users.map((row) => ({
    id: Number(row.id),
    username: String(row.username ?? ''),
    displayName: String(row.display_name ?? ''),
    isActive: Boolean(row.is_active),
    ticketOrganizations: organizationMap.get(Number(row.id)) ?? [],
  }))
}

async function grantTicketHubAccess(userId, organizations) {
  const { client, usersTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(usersTable)
    .select('id, username, display_name, is_active, allowed_menus')
    .eq('id', userId)
    .single()

  if (error) throw new Error(error.message)

  if (isVisitorAdminUser(row.username)) {
    throw new Error('O usuario visitor nao pode ser cadastrado nesta administracao.')
  }

  const currentMenus = normalizeMenuPermissions(row.allowed_menus, MENU_KEYS)
  const nextMenus = currentMenus.includes('ticket-hub')
    ? currentMenus
    : [...currentMenus, 'ticket-hub']

  const { data: updatedRow, error: updateError } = await client
    .from(usersTable)
    .update({ allowed_menus: nextMenus })
    .eq('id', userId)
    .select('id, username, display_name, is_active, allowed_menus')
    .single()

  if (updateError) throw new Error(updateError.message)

  const savedOrganizations = await upsertTicketHubOrganizations(userId, organizations)

  return {
    id: Number(updatedRow.id),
    username: String(updatedRow.username ?? ''),
    displayName: String(updatedRow.display_name ?? ''),
    isActive: Boolean(updatedRow.is_active),
    ticketOrganizations: savedOrganizations,
  }
}

app.get('/api/ticket-hub/app-users', async (req, res) => {
  try {
    assertVisitorAdmin(req)
    const users = await listTicketHubAppUsers()
    return res.json(users)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao buscar usuarios da aplicacao: ${detail}` })
  }
})

app.get('/api/ticket-hub/users', async (req, res) => {
  try {
    assertVisitorAdmin(req)
    const users = await getTicketHubUsers()
    return res.json(users)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao buscar usuarios: ${detail}` })
  }
})

app.post('/api/ticket-hub/users', async (req, res) => {
  try {
    assertVisitorAdmin(req)

    const userId = Number(String(req.body?.userId ?? '').trim())
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Usuario selecionado invalido.' })
    }

    const organizations = normalizeOrganizationIds(req.body?.organizations)

    const item = await grantTicketHubAccess(userId, organizations)
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao cadastrar acesso: ${detail}` })
  }
})

app.put('/api/ticket-hub/users/:id/organizations', async (req, res) => {
  try {
    assertVisitorAdmin(req)
    const id = Number(String(req.params.id ?? '').trim())
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de usuario invalido.' })
    }

    const orgs = normalizeOrganizationIds(req.body?.organizations)

    // Confirm user exists and has ticket-hub permission
    const { client, usersTable } = getSupabaseClient()
    const { data, error } = await client
      .from(usersTable)
      .select('id')
      .eq('id', id)
      .contains('allowed_menus', ['ticket-hub'])
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return res.status(404).json({ error: 'Usuario nao encontrado ou sem permissao ticket-hub.' })
    }

    const savedOrganizations = await upsertTicketHubOrganizations(id, orgs)
    return res.json({ ok: true, organizations: savedOrganizations })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 400
    return res.status(status).json({ error: `Falha ao atualizar organizacoes: ${detail}` })
  }
})

app.get('/api/ticket-hub/tickets', async (req, res) => {
  if (!TOMTICKET_API_TOKEN) {
    return res.status(500).json({ error: 'Token TomTicket não configurado no servidor.' })
  }

  try {
    const sessionUser = getSessionUserFromRequest(req)
    const userAccess = await getTicketHubUserAccessByUsername(sessionUser.username)
    const parsePositiveNumber = (value) => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) return null
      return Math.floor(parsed)
    }
    const requestedPage = parsePositiveNumber(req.query.page)
    const situationRaw = String(req.query.situation ?? '').trim()
    const situation = /^[\d,]+$/.test(situationRaw) ? situationRaw : ''

    // Non-visitor users can only query tickets for organizations granted in administration.
    if (!userAccess.isVisitor && !userAccess.organizations.length) {
      if (requestedPage) {
        return res.json({
          tickets: [],
          page: requestedPage,
          pages: null,
          next_page: null,
          previous_page: requestedPage > 1 ? requestedPage - 1 : null,
        })
      }
      return res.json({ tickets: [] })
    }

    const headers = {
      'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
      'Content-Type': 'application/json',
    }
    const MAX_TOMTICKET_PAGES = 200
    const DEFAULT_TOMTICKET_PAGE_SIZE = 50

    const getTicketKey = (item) => String(item?.id ?? item?.ticket_id ?? '') || JSON.stringify(item)

    const getTicketPaginationInfo = (payload) => {
      const readNestedPaginationValue = (node, keys, depth = 0) => {
        if (!node || depth > 5) return null

        if (Array.isArray(node)) {
          for (const item of node) {
            const value = readNestedPaginationValue(item, keys, depth + 1)
            if (value != null) return value
          }
          return null
        }

        if (typeof node !== 'object') return null
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            return node[key]
          }
        }

        for (const value of Object.values(node)) {
          const nested = readNestedPaginationValue(value, keys, depth + 1)
          if (nested != null) return nested
        }

        return null
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
          currentPage: null,
          totalPages: null,
          pageSize: null,
          nextPage: null,
          previousPage: null,
        }
      }

      return {
        currentPage: parsePositiveNumber(readNestedPaginationValue(payload, ['page', 'current_page', 'currentPage'])),
        totalPages: parsePositiveNumber(readNestedPaginationValue(payload, ['pages', 'total_pages', 'totalPages', 'last_page', 'lastPage'])),
        pageSize: parsePositiveNumber(readNestedPaginationValue(payload, ['per_page', 'page_size', 'pageSize', 'limit'])),
        nextPage: parsePositiveNumber(readNestedPaginationValue(payload, ['next_page', 'nextPage'])),
        previousPage: parsePositiveNumber(readNestedPaginationValue(payload, ['previous_page', 'previousPage', 'prev_page', 'prevPage'])),
      }
    }

    const fetchTomTicketList = async (organizationId = '', page = 1, sit = '') => {
      const url = new URL(`${TOMTICKET_API_BASE_URL}/ticket/list`)
      url.searchParams.set('page', String(page))
      if (organizationId) {
        url.searchParams.set('organization_id', organizationId)
      }
      // Append situation without encoding commas (URLSearchParams.set encodes them as %2C)
      const finalUrl = sit ? `${url.toString()}&situation=${sit}` : url.toString()

      const response = await fetch(finalUrl, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Erro ${response.status} na API TomTicket.`)
      }

      return response.json()
    }

    const fetchTomTicketListPage = async (organizationId = '', page = 1, sit = '') => {
      const data = await fetchTomTicketList(organizationId, page, sit)
      return {
        items: extractTomTicketTickets(data),
        pageInfo: getTicketPaginationInfo(data),
      }
    }

    if (requestedPage) {
      if (userAccess.isVisitor) {
        const { items, pageInfo } = await fetchTomTicketListPage('', requestedPage, situation)
        const expectedPageSize = pageInfo.pageSize || DEFAULT_TOMTICKET_PAGE_SIZE
        const pages = pageInfo.totalPages
        const nextPage = pageInfo.nextPage
          ?? (pages && requestedPage < pages ? requestedPage + 1 : (items.length >= expectedPageSize ? requestedPage + 1 : null))
        const previousPage = pageInfo.previousPage ?? (requestedPage > 1 ? requestedPage - 1 : null)

        return res.json({
          tickets: items,
          page: requestedPage,
          pages,
          next_page: nextPage,
          previous_page: previousPage,
        })
      }

      const mapByKey = new Map()
      let aggregatedPages = null
      let hasAnyNextPage = false
      for (const organizationId of userAccess.organizations) {
        try {
          const { items, pageInfo } = await fetchTomTicketListPage(organizationId, requestedPage, situation)
          for (const item of items) {
            const key = getTicketKey(item)
            if (!mapByKey.has(key)) {
              mapByKey.set(key, item)
            }
          }

          const expectedPageSize = pageInfo.pageSize || DEFAULT_TOMTICKET_PAGE_SIZE
          const orgHasNextPage = pageInfo.nextPage
            ? true
            : (pageInfo.totalPages ? requestedPage < pageInfo.totalPages : items.length >= expectedPageSize)
          if (orgHasNextPage) hasAnyNextPage = true

          if (pageInfo.totalPages) {
            aggregatedPages = aggregatedPages ? Math.max(aggregatedPages, pageInfo.totalPages) : pageInfo.totalPages
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error ?? '')
          if (/organization not found/i.test(detail)) {
            continue
          }
          throw error
        }
      }

      return res.json({
        tickets: Array.from(mapByKey.values()),
        page: requestedPage,
        pages: aggregatedPages,
        next_page: hasAnyNextPage ? requestedPage + 1 : null,
        previous_page: requestedPage > 1 ? requestedPage - 1 : null,
      })
    }

    const fetchTomTicketListAllPages = async (organizationId = '', sit = '') => {
      const mapByKey = new Map()
      let repeatedPagesWithoutNewItems = 0

      for (let page = 1; page <= MAX_TOMTICKET_PAGES; page += 1) {
        const data = await fetchTomTicketList(organizationId, page, sit)
        const items = extractTomTicketTickets(data)
        if (!items.length) {
          break
        }

        let addedInPage = 0
        for (const item of items) {
          const key = getTicketKey(item)
          if (!mapByKey.has(key)) {
            mapByKey.set(key, item)
            addedInPage += 1
          }
        }

        const pageInfo = getTicketPaginationInfo(data)
        if (pageInfo.totalPages && page >= pageInfo.totalPages) {
          break
        }

        const expectedPageSize = pageInfo.pageSize || DEFAULT_TOMTICKET_PAGE_SIZE
        if (items.length < expectedPageSize) {
          break
        }

        if (addedInPage === 0) {
          repeatedPagesWithoutNewItems += 1
        } else {
          repeatedPagesWithoutNewItems = 0
        }

        // Safety guard if API keeps returning duplicated pages.
        if (repeatedPagesWithoutNewItems >= 2) {
          break
        }
      }

      return Array.from(mapByKey.values())
    }

    let tickets = []
    if (userAccess.isVisitor) {
      tickets = await fetchTomTicketListAllPages('', situation)
    } else {
      const mapByKey = new Map()
      for (const organizationId of userAccess.organizations) {
        try {
          const items = await fetchTomTicketListAllPages(organizationId, situation)
          for (const item of items) {
            const key = getTicketKey(item)
            if (!mapByKey.has(key)) {
              mapByKey.set(key, item)
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error ?? '')
          if (/organization not found/i.test(detail)) {
            continue
          }
          throw error
        }
      }
      tickets = Array.from(mapByKey.values())
    }

    return res.json({ tickets })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao consultar chamados: ${detail}` })
  }
})

async function handleTicketHubTicketDetail(req, res) {
  if (!TOMTICKET_API_TOKEN) {
    return res.status(500).json({ error: 'Token TomTicket não configurado no servidor.' })
  }

  try {
    const queryTicketIdRaw = Array.isArray(req.query.ticket_id) ? req.query.ticket_id[0] : req.query.ticket_id
    const ensureOperatorLinkRaw = Array.isArray(req.query.ensure_operator_linked)
      ? req.query.ensure_operator_linked[0]
      : req.query.ensure_operator_linked
    const shouldEnsureOperatorLink = String(ensureOperatorLinkRaw || '').trim() === '1'
    const paramTicketIdRaw = req.params?.ticketId
    const ticketId = String(queryTicketIdRaw || paramTicketIdRaw || '').trim()
    if (!ticketId) {
      return res.status(400).json({ error: 'ID do chamado não informado.' })
    }

    const sessionUser = getSessionUserFromRequest(req)
    const userAccess = await getTicketHubUserAccessByUsername(sessionUser.username)

    const url = new URL(`${TOMTICKET_API_BASE_URL}/ticket/detail`)
    url.searchParams.set('ticket_id', ticketId)

    const fetchTicketDetailFromApi = async () => {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Erro ${response.status} na API TomTicket.`)
      }

      const payload = await response.json()
      const detailData = payload?.data && typeof payload.data === 'object' ? payload.data : payload

      if (!detailData || typeof detailData !== 'object') {
        throw new Error('Resposta inválida da API de detalhe do chamado.')
      }

      return detailData
    }

    let detailData = await fetchTicketDetailFromApi()

    if (shouldEnsureOperatorLink) {
      const operator = detailData?.operator && typeof detailData.operator === 'object'
        ? detailData.operator
        : null
      const operatorId = String(operator?.id ?? '').trim()
      const operatorName = String(operator?.name ?? '').trim().toUpperCase()
      const shouldLinkOperator = operatorId !== TOMTICKET_DEFAULT_OPERATOR_ID || operatorName !== 'VISITOR'

      if (shouldLinkOperator) {
        const formPayload = new URLSearchParams({
          ticket_id: ticketId,
          operator_id: TOMTICKET_DEFAULT_OPERATOR_ID,
        })

        let linkResponse = await fetch(`${TOMTICKET_API_BASE_URL}/ticket/operator/link`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formPayload.toString(),
        })

        if (!linkResponse.ok) {
          // Some TomTicket environments only parse multipart bodies for this endpoint.
          const multipartPayload = new FormData()
          multipartPayload.append('ticket_id', ticketId)
          multipartPayload.append('operator_id', TOMTICKET_DEFAULT_OPERATOR_ID)

          linkResponse = await fetch(`${TOMTICKET_API_BASE_URL}/ticket/operator/link`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
            },
            body: multipartPayload,
          })
        }

        if (!linkResponse.ok) {
          const detail = await linkResponse.text()
          throw new Error(detail || `Erro ${linkResponse.status} ao vincular operador na API TomTicket.`)
        }

        // Reload detail after linking so frontend receives operator already associated.
        detailData = await fetchTicketDetailFromApi()
      }
    }

    if (!userAccess.isVisitor) {
      const allowedOrganizationIds = new Set(normalizeOrganizationIds(userAccess.organizations))
      const ticketOrganizationIds = extractTicketDetailOrganizationIds(detailData)
      const hasAllowedOrganization = ticketOrganizationIds.some((organizationId) => allowedOrganizationIds.has(organizationId))

      if (ticketOrganizationIds.length > 0 && !hasAllowedOrganization) {
        return res.status(403).json({ error: 'Acesso negado para este chamado.' })
      }
    }

    return res.json({ detail: detailData })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao consultar detalhe do chamado: ${detail}` })
  }
}

app.get('/api/ticket-hub/tickets/detail', handleTicketHubTicketDetail)

app.get('/api/ticket-hub/tickets/:ticketId/detail', async (req, res) => {
  return handleTicketHubTicketDetail(req, res)
})

app.post('/api/ticket-hub/tickets/reply/operator', async (req, res) => {
  if (!TOMTICKET_API_TOKEN) {
    return res.status(500).json({ error: 'Token TomTicket não configurado no servidor.' })
  }

  try {
    const sessionUser = getSessionUserFromRequest(req)
    const userAccess = await getTicketHubUserAccessByUsername(sessionUser.username)

    const ticketId = String(req.body?.ticket_id ?? '').trim()
    const message = String(req.body?.message ?? '').trim()
    const attachmentsRaw = Array.isArray(req.body?.attachment) ? req.body.attachment : []
    const startDate = String(req.body?.start_date ?? '').trim()
    const endDate = String(req.body?.end_date ?? '').trim()

    if (!ticketId) {
      return res.status(400).json({ error: 'Campo ticket_id é obrigatório.' })
    }

    if (!message) {
      return res.status(400).json({ error: 'Campo message é obrigatório.' })
    }

    const detailUrl = new URL(`${TOMTICKET_API_BASE_URL}/ticket/detail`)
    detailUrl.searchParams.set('ticket_id', ticketId)
    const detailResponse = await fetch(detailUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })

    if (!detailResponse.ok) {
      const detail = await detailResponse.text()
      throw new Error(detail || `Erro ${detailResponse.status} ao validar ticket na API TomTicket.`)
    }

    const detailPayload = await detailResponse.json()
    const detailData = detailPayload?.data && typeof detailPayload.data === 'object' ? detailPayload.data : detailPayload

    if (!userAccess.isVisitor) {
      const allowedOrganizationIds = new Set(normalizeOrganizationIds(userAccess.organizations))
      const ticketOrganizationIds = extractTicketDetailOrganizationIds(detailData)
      const hasAllowedOrganization = ticketOrganizationIds.some((organizationId) => allowedOrganizationIds.has(organizationId))

      if (ticketOrganizationIds.length > 0 && !hasAllowedOrganization) {
        return res.status(403).json({ error: 'Acesso negado para responder este chamado.' })
      }
    }

    const form = new FormData()
    form.append('ticket_id', ticketId)
    form.append('message', message)

    if (startDate && endDate) {
      form.append('start_date', startDate)
      form.append('end_date', endDate)
    }

    for (let index = 0; index < attachmentsRaw.length; index += 1) {
      const attachment = attachmentsRaw[index]
      if (!attachment || typeof attachment !== 'object') continue

      const fileName = String(attachment.name ?? '').trim() || `attachment-${index + 1}.bin`
      const contentType = String(attachment.type ?? '').trim() || 'application/octet-stream'
      const base64Raw = String(attachment.contentBase64 ?? '').trim()
      const base64 = base64Raw.includes(',') ? base64Raw.split(',').pop() : base64Raw

      if (!base64) continue

      const bytes = Buffer.from(base64, 'base64')
      const blob = new Blob([bytes], { type: contentType })
      form.append(`attachment[${index}]`, blob, fileName)
    }

    const response = await fetch(`${TOMTICKET_API_BASE_URL}/ticket/reply/operator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOMTICKET_API_TOKEN}`,
      },
      body: form,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `Erro ${response.status} na API TomTicket ao responder chamado.`)
    }

    const data = await response.json()
    return res.json({ ok: true, data })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    const status = /acesso negado/i.test(detail) ? 403 : 500
    return res.status(status).json({ error: `Falha ao responder chamado: ${detail}` })
  }
})

// ─── Validacao de Rubricas ───────────────────────────────────────────────────

const RUBRICA_RULE_SELECT = 'id, rule_name, trigger_column, trigger_value, expected_column, expected_value, expected_conditions, is_active, notes, created_at, updated_at'

function normalizeRubricaExpectedConditions(raw, fallbackColumn = '', fallbackValue = '') {
  const source = Array.isArray(raw)
    ? raw
    : (fallbackColumn && fallbackValue ? [{ column: fallbackColumn, value: fallbackValue }] : [])

  const normalized = source
    .map((item) => {
      const record = item && typeof item === 'object' ? item : {}
      return {
        column: String(record.column ?? '').trim(),
        value: String(record.value ?? '').trim(),
      }
    })
    .filter((item) => item.column && item.value)

  return normalized
}

function parseRubricaRuleIdInput(raw) {
  const id = Number(String(raw ?? '').trim())
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('ID da regra invalido.')
  }
  return id
}

function normalizeRubricaRuleRow(row) {
  const expectedConditions = normalizeRubricaExpectedConditions(
    row.expected_conditions,
    row.expected_column,
    row.expected_value,
  )

  return {
    id: Number(row.id ?? 0),
    ruleName: String(row.rule_name ?? ''),
    triggerColumn: String(row.trigger_column ?? ''),
    triggerValue: String(row.trigger_value ?? ''),
    expectedColumn: String(expectedConditions[0]?.column ?? row.expected_column ?? ''),
    expectedValue: String(expectedConditions[0]?.value ?? row.expected_value ?? ''),
    expectedConditions,
    isActive: Boolean(row.is_active),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function parseRubricaRulePayload(payload) {
  const expectedConditions = normalizeRubricaExpectedConditions(
    payload.expectedConditions,
    payload.expectedColumn,
    payload.expectedValue,
  )

  return {
    rule_name: String(payload.ruleName ?? '').trim(),
    trigger_column: String(payload.triggerColumn ?? '').trim(),
    trigger_value: String(payload.triggerValue ?? '').trim(),
    expected_column: String(expectedConditions[0]?.column ?? '').trim(),
    expected_value: String(expectedConditions[0]?.value ?? '').trim(),
    expected_conditions: expectedConditions,
    is_active: payload.isActive !== false,
    notes: String(payload.notes ?? '').trim(),
    updated_at: new Date().toISOString(),
  }
}

function validateRubricaRulePayload(parsed) {
  if (!parsed.rule_name) throw new Error('Nome da regra obrigatorio.')
  if (!parsed.trigger_column) throw new Error('Coluna gatilho obrigatoria.')
  if (!parsed.trigger_value) throw new Error('Valor gatilho obrigatorio.')
  if (!Array.isArray(parsed.expected_conditions) || !parsed.expected_conditions.length) {
    throw new Error('Informe ao menos um campo esperado para a regra.')
  }
}

async function listRubricaRules() {
  const { client, rubricaRulesTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(rubricaRulesTable)
    .select(RUBRICA_RULE_SELECT)
    .order('id', { ascending: false })

  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeRubricaRuleRow)
}

async function createRubricaRule(payload) {
  const parsed = parseRubricaRulePayload(payload)
  validateRubricaRulePayload(parsed)

  const { client, rubricaRulesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(rubricaRulesTable)
    .insert({ ...parsed, created_at: new Date().toISOString() })
    .select(RUBRICA_RULE_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return normalizeRubricaRuleRow(row)
}

async function updateRubricaRule(id, payload) {
  const parsed = parseRubricaRulePayload(payload)
  validateRubricaRulePayload(parsed)

  const { client, rubricaRulesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(rubricaRulesTable)
    .update(parsed)
    .eq('id', id)
    .select(RUBRICA_RULE_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return normalizeRubricaRuleRow(row)
}

async function deleteRubricaRule(id) {
  const { client, rubricaRulesTable } = getSupabaseClient()
  const { error } = await client
    .from(rubricaRulesTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

app.get('/api/rubrica-rules', async (_req, res) => {
  try {
    const items = await listRubricaRules()
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao buscar regras de rubricas: ${detail}` })
  }
})

app.post('/api/rubrica-rules', async (req, res) => {
  try {
    const item = await createRubricaRule(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao criar regra de rubrica: ${detail}` })
  }
})

app.put('/api/rubrica-rules/:id', async (req, res) => {
  try {
    const id = parseRubricaRuleIdInput(req.params.id)
    const item = await updateRubricaRule(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar regra de rubrica: ${detail}` })
  }
})

app.delete('/api/rubrica-rules/:id', async (req, res) => {
  try {
    const id = parseRubricaRuleIdInput(req.params.id)
    await deleteRubricaRule(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir regra de rubrica: ${detail}` })
  }
})

// ─── Propostas Comerciais ────────────────────────────────────────────────────

function parseIncludeFlag(value) {
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

function normalizePropostaRow(row) {
  const parseJsonb = (val) => {
    if (Array.isArray(val)) return val
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch { return [] }
    }
    return []
  }

  return {
    id: Number(row.id ?? 0),
    cliente: String(row.cliente ?? ''),
    projeto: String(row.projeto ?? ''),
    contato: String(row.contato ?? ''),
    tipo: String(row.tipo ?? ''),
    dataProposta: String(row.data_proposta ?? ''),
    desenvolvimento: Boolean(row.desenvolvimento),
    objetivo: String(row.objetivo ?? ''),
    escopoTitulo: String(row.escopo_titulo ?? ''),
    escopoConteudo: String(row.escopo_conteudo ?? ''),
    precificacaoTitulo: String(row.precificacao_titulo ?? ''),
    precificacaoDescricao: String(row.precificacao_descricao ?? ''),
    precificacaoItens: parseJsonb(row.precificacao_itens),
    bancoHorasConteudo: String(row.banco_horas_conteudo ?? ''),
    deliveryItens: parseJsonb(row.delivery_itens),
    outrasInformacoes: String(row.outras_informacoes ?? ''),
    incluirObjetivo: parseIncludeFlag(row.incluir_objetivo),
    incluirEscopo: parseIncludeFlag(row.incluir_escopo),
    incluirPrecificacao: parseIncludeFlag(row.incluir_precificacao),
    incluirBancoHoras: parseIncludeFlag(row.incluir_banco_horas),
    incluirDelivery: parseIncludeFlag(row.incluir_delivery),
    incluirOutrasInformacoes: parseIncludeFlag(row.incluir_outras_informacoes),
    status: row.status === 'sent' ? 'sent' : 'draft',
    estimativaId: row.estimativa_id ? Number(row.estimativa_id) : null,
  }
}

function parsePropostaPayload(payload) {
  const parseJsonbField = (val) => {
    if (Array.isArray(val)) return val
    return []
  }

  return {
    cliente: String(payload.cliente ?? '').trim(),
    projeto: String(payload.projeto ?? '').trim(),
    contato: String(payload.contato ?? '').trim(),
    tipo: String(payload.tipo ?? '').trim(),
    data_proposta: String(payload.dataProposta ?? '').trim(),
    desenvolvimento: Boolean(payload.desenvolvimento),
    objetivo: String(payload.objetivo ?? ''),
    escopo_titulo: String(payload.escopoTitulo ?? '').trim(),
    escopo_conteudo: String(payload.escopoConteudo ?? ''),
    precificacao_titulo: String(payload.precificacaoTitulo ?? '').trim(),
    precificacao_descricao: String(payload.precificacaoDescricao ?? ''),
    precificacao_itens: parseJsonbField(payload.precificacaoItens),
    banco_horas_conteudo: String(payload.bancoHorasConteudo ?? ''),
    delivery_itens: parseJsonbField(payload.deliveryItens),
    outras_informacoes: String(payload.outrasInformacoes ?? ''),
    incluir_objetivo: parseIncludeFlag(payload.incluirObjetivo),
    incluir_escopo: parseIncludeFlag(payload.incluirEscopo),
    incluir_precificacao: parseIncludeFlag(payload.incluirPrecificacao),
    incluir_banco_horas: parseIncludeFlag(payload.incluirBancoHoras),
    incluir_delivery: parseIncludeFlag(payload.incluirDelivery),
    incluir_outras_informacoes: parseIncludeFlag(payload.incluirOutrasInformacoes),
    status: payload.status === 'sent' ? 'sent' : 'draft',
    estimativa_id: payload.estimativaId ? Number(payload.estimativaId) : null,
    updated_at: new Date().toISOString(),
  }
}

function validatePropostaPayload(parsed) {
  if (!parsed.cliente) throw new Error('Cliente obrigatorio.')
  if (!parsed.projeto) throw new Error('Projeto obrigatorio.')
  if (!parsed.data_proposta) throw new Error('Data da proposta obrigatoria.')
}

function parsePropIdInput(raw) {
  const id = Number(String(raw ?? '').trim())
  if (!Number.isFinite(id) || id <= 0) throw new Error('ID de proposta invalido.')
  return id
}

const PROPOSTA_SELECT = 'id, cliente, projeto, contato, tipo, data_proposta, desenvolvimento, objetivo, escopo_titulo, escopo_conteudo, precificacao_titulo, precificacao_descricao, precificacao_itens, banco_horas_conteudo, delivery_itens, outras_informacoes, incluir_objetivo, incluir_escopo, incluir_precificacao, incluir_banco_horas, incluir_delivery, incluir_outras_informacoes, status, estimativa_id, created_at, updated_at'

async function listPropostas() {
  const { client, propostasTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(propostasTable)
    .select(PROPOSTA_SELECT)
    .order('id', { ascending: false })

  if (error) throw new Error(error.message)
  return (rows || []).map(normalizePropostaRow)
}

async function createProposta(payload) {
  const parsed = parsePropostaPayload(payload)
  validatePropostaPayload(parsed)

  const { client, propostasTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(propostasTable)
    .insert({ ...parsed, created_at: new Date().toISOString() })
    .select(PROPOSTA_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return normalizePropostaRow(row)
}

async function updateProposta(id, payload) {
  const parsed = parsePropostaPayload(payload)
  validatePropostaPayload(parsed)

  const { client, propostasTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(propostasTable)
    .update(parsed)
    .eq('id', id)
    .select(PROPOSTA_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return normalizePropostaRow(row)
}

async function deleteProposta(id) {
  const { client, propostasTable } = getSupabaseClient()
  const { error } = await client
    .from(propostasTable)
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function updatePropostaStatus(id, status) {
  const nextStatus = status === 'sent' ? 'sent' : 'draft'
  const { client, propostasTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(propostasTable)
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PROPOSTA_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return normalizePropostaRow(row)
}

function parsePropostaIncludeFlagsPayload(payload) {
  const src = payload && typeof payload === 'object' ? payload : {}
  const map = [
    ['incluirObjetivo', 'incluir_objetivo'],
    ['incluirEscopo', 'incluir_escopo'],
    ['incluirPrecificacao', 'incluir_precificacao'],
    ['incluirBancoHoras', 'incluir_banco_horas'],
    ['incluirDelivery', 'incluir_delivery'],
    ['incluirOutrasInformacoes', 'incluir_outras_informacoes'],
  ]

  const updates = {}
  for (const [apiKey, dbKey] of map) {
    if (Object.prototype.hasOwnProperty.call(src, apiKey)) {
      updates[dbKey] = parseIncludeFlag(src[apiKey])
    }
  }

  if (!Object.keys(updates).length) {
    throw new Error('Nenhum tópico de inclusão informado para atualização.')
  }

  updates.updated_at = new Date().toISOString()
  return updates
}

async function updatePropostaIncludeFlags(id, payload) {
  const updates = parsePropostaIncludeFlagsPayload(payload)
  const { client, propostasTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(propostasTable)
    .update(updates)
    .eq('id', id)
    .select(PROPOSTA_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return normalizePropostaRow(row)
}

app.get('/api/propostas', async (_req, res) => {
  try {
    const items = await listPropostas()
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao buscar propostas: ${detail}` })
  }
})

app.post('/api/propostas', async (req, res) => {
  try {
    const item = await createProposta(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao criar proposta: ${detail}` })
  }
})

app.put('/api/propostas/:id', async (req, res) => {
  try {
    const id = parsePropIdInput(req.params.id)
    const item = await updateProposta(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar proposta: ${detail}` })
  }
})

app.delete('/api/propostas/:id', async (req, res) => {
  try {
    const id = parsePropIdInput(req.params.id)
    await deleteProposta(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir proposta: ${detail}` })
  }
})

app.patch('/api/propostas/:id/status', async (req, res) => {
  try {
    const id = parsePropIdInput(req.params.id)
    const status = String(req.body?.status || '').trim()
    const item = await updatePropostaStatus(id, status)
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar status da proposta: ${detail}` })
  }
})

app.patch('/api/propostas/:id/flags', async (req, res) => {
  try {
    const id = parsePropIdInput(req.params.id)
    const item = await updatePropostaIncludeFlags(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar tópicos da proposta: ${detail}` })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`API de ranking rodando em http://localhost:${port}`)
})
