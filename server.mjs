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
    ticketHubAccessesTable: process.env.SUPABASE_TICKET_HUB_ACCESSES_TABLE || 'ticket_hub_accesses',
    propostasTable: process.env.SUPABASE_PROPOSTAS_TABLE || 'propostas_comerciais',
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
    ticketHubAccessesTable: config.ticketHubAccessesTable,
    propostasTable: config.propostasTable,
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
    parceiro: String(row.parceiro ?? ''),
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

function parseCustomerClientPayload(payload) {
  return {
    nome: String(payload.nome ?? '').trim(),
    cnpj: String(payload.cnpj ?? '').trim(),
    segmento: String(payload.segmento ?? '').trim(),
    cidade: String(payload.cidade ?? '').trim(),
    status: normalizeCustomerClientStatus(payload.status),
    parceiro: String(payload.parceiro ?? '').trim(),
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

async function listCustomerClients() {
  const { client, customerClientsTable } = getSupabaseClient()
  const { data: rows, error } = await client
    .from(customerClientsTable)
    .select('id, nome, cnpj, segmento, cidade, status, parceiro, data_inicio, fonte, created_at')
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
    .select('id, nome, cnpj, segmento, cidade, status, parceiro, data_inicio, fonte')
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
    .select('id, nome, cnpj, segmento, cidade, status, parceiro, data_inicio, fonte')
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

async function listCustomerAccesses(clientId) {
  const { client, customerAccessesTable } = getSupabaseClient()
  let query = client
    .from(customerAccessesTable)
    .select('id, cliente_id, tipo, nome, endereco, usuario, senha, observacoes, created_at')
    .order('nome', { ascending: true })

  if (clientId) {
    query = query.eq('cliente_id', clientId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)
  return (rows || []).map(normalizeCustomerAccessRow)
}

async function createCustomerAccess(payload) {
  const parsed = parseCustomerAccessPayload(payload)
  validateCustomerAccessPayload(parsed)

  const { client, customerAccessesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerAccessesTable)
    .insert(parsed)
    .select('id, cliente_id, tipo, nome, endereco, usuario, senha, observacoes')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerAccessRow(row)
}

async function updateCustomerAccess(id, payload) {
  const parsed = parseCustomerAccessPayload(payload)
  validateCustomerAccessPayload(parsed)

  const { client, customerAccessesTable } = getSupabaseClient()
  const { data: row, error } = await client
    .from(customerAccessesTable)
    .update(parsed)
    .eq('id', id)
    .select('id, cliente_id, tipo, nome, endereco, usuario, senha, observacoes')
    .single()

  if (error) throw new Error(error.message)
  return normalizeCustomerAccessRow(row)
}

async function deleteCustomerAccess(id) {
  const { client, customerAccessesTable } = getSupabaseClient()
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

async function getCustomerHubBootstrap() {
  const [clientes, contatos, acessos, sistemas, processos, atividades] = await Promise.all([
    listCustomerClients(),
    listCustomerContacts(),
    listCustomerAccesses(),
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
    .select('id, number, date, type, requester, description, responsible, status, notes, created_at')
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
    .select('id, number, date, type, requester, description, responsible, status, notes')
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
    .select('id, number, date, type, requester, description, responsible, status, notes')
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

app.get('/api/customer-hub/bootstrap', async (_req, res) => {
  try {
    const data = await getCustomerHubBootstrap()
    return res.json(data)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao carregar Central de Clientes: ${detail}` })
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
    const clientIdRaw = String(req.query.clientId ?? '').trim()
    const clientId = clientIdRaw ? parseCustomerHubIdInput(clientIdRaw, 'cliente') : null
    const items = await listCustomerAccesses(clientId)
    return res.json({ items })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao buscar acessos: ${detail}` })
  }
})

app.post('/api/customer-hub/accesses', async (req, res) => {
  try {
    const item = await createCustomerAccess(req.body || {})
    return res.status(201).json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao salvar acesso: ${detail}` })
  }
})

app.put('/api/customer-hub/accesses/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'acesso')
    const item = await updateCustomerAccess(id, req.body || {})
    return res.json({ ok: true, item })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(400).json({ error: `Falha ao atualizar acesso: ${detail}` })
  }
})

app.delete('/api/customer-hub/accesses/:id', async (req, res) => {
  try {
    const id = parseCustomerHubIdInput(req.params.id, 'acesso')
    await deleteCustomerAccess(id)
    return res.json({ ok: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro inesperado'
    return res.status(500).json({ error: `Falha ao excluir acesso: ${detail}` })
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

// ---- Ticket Hub ----

const TOMTICKET_API_TOKEN = process.env.TOMTICKET_API_TOKEN || ''
const TOMTICKET_API_BASE_URL = (process.env.TOMTICKET_API_BASE_URL || 'https://api.tomticket.com/v2.0').replace(/\/+$/, '')
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
      const orgId = String(
        detailData?.customer?.organization?.id
        ?? detailData?.organization?.id
        ?? detailData?.organization_id
        ?? '',
      ).trim()

      if (orgId && !userAccess.organizations.includes(orgId)) {
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
      const orgId = String(
        detailData?.customer?.organization?.id
        ?? detailData?.organization?.id
        ?? detailData?.organization_id
        ?? '',
      ).trim()

      if (orgId && !userAccess.organizations.includes(orgId)) {
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

// ─── Propostas Comerciais ────────────────────────────────────────────────────

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
    incluirObjetivo: row.incluir_objetivo !== false,
    incluirEscopo: row.incluir_escopo !== false,
    incluirPrecificacao: row.incluir_precificacao !== false,
    incluirBancoHoras: row.incluir_banco_horas !== false,
    incluirDelivery: row.incluir_delivery !== false,
    incluirOutrasInformacoes: row.incluir_outras_informacoes !== false,
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
    incluir_objetivo: payload.incluirObjetivo !== false,
    incluir_escopo: payload.incluirEscopo !== false,
    incluir_precificacao: payload.incluirPrecificacao !== false,
    incluir_banco_horas: payload.incluirBancoHoras !== false,
    incluir_delivery: payload.incluirDelivery !== false,
    incluir_outras_informacoes: payload.incluirOutrasInformacoes !== false,
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

// ─────────────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`API de ranking rodando em http://localhost:${port}`)
})
