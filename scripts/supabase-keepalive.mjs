import dotenv from 'dotenv'

dotenv.config()

const argv = process.argv.slice(2)
const argMap = Object.fromEntries(
  argv
    .filter((item) => item.startsWith('--'))
    .map((item) => {
      const [key, ...rest] = item.slice(2).split('=')
      return [key, rest.length ? rest.join('=') : 'true']
    }),
)

function parseBoolean(value) {
  return String(value || '').toLowerCase() === 'true'
}

function parseIntervalMinutes(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 5
  return parsed
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
const oneShot = parseBoolean(argMap.once)
const intervalMinutes = parseIntervalMinutes(argMap['interval-minutes'] || process.env.SUPABASE_KEEP_ALIVE_MINUTES)
const intervalMs = Math.round(intervalMinutes * 60 * 1000)

const requestedTable = String(argMap.table || process.env.SUPABASE_KEEP_ALIVE_TABLE || '').trim()
const candidateTables = [
  requestedTable,
  process.env.SUPABASE_ESTIMATIVAS_TABLE,
  process.env.SUPABASE_DAILY_ACTIVITIES_TABLE,
  process.env.SUPABASE_USERS_TABLE,
  process.env.SUPABASE_PROPOSTAS_TABLE,
  process.env.SUPABASE_DATA_DICTIONARY_TABLE,
  'estimativas',
]
  .map((item) => String(item || '').trim())
  .filter(Boolean)

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_ANON_KEY) sao obrigatorios para keep-alive.')
  process.exit(1)
}

function nowIso() {
  return new Date().toISOString()
}

async function pingTable(tableName) {
  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(tableName)}?select=id&limit=1`

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    let details = ''
    try {
      const text = await response.text()
      details = text.slice(0, 200)
    } catch {
      details = ''
    }

    const error = new Error(`HTTP ${response.status}${details ? ` - ${details}` : ''}`)
    error.status = response.status
    throw error
  }

  return true
}

async function resolveWorkingTable() {
  for (const tableName of candidateTables) {
    try {
      await pingTable(tableName)
      return tableName
    } catch (error) {
      const status = Number(error?.status || 0)
      if (status === 404 || status === 400) {
        continue
      }
      throw new Error(`Falha ao validar tabela ${tableName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(
    'Nao foi possivel encontrar uma tabela valida para ping. Defina SUPABASE_KEEP_ALIVE_TABLE com uma tabela existente no banco.',
  )
}

let activeTable = null

async function runPing() {
  if (!activeTable) {
    activeTable = await resolveWorkingTable()
    console.log(`[${nowIso()}] tabela keep-alive: ${activeTable}`)
  }

  await pingTable(activeTable)
  console.log(`[${nowIso()}] ping ok (${activeTable})`)
}

async function start() {
  console.log(`[${nowIso()}] iniciando keep-alive do Supabase`)

  try {
    await runPing()
  } catch (error) {
    console.error(`[${nowIso()}] erro no ping inicial: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  if (oneShot) {
    return
  }

  console.log(`[${nowIso()}] proximo ping a cada ${intervalMinutes} minuto(s)`)
  const timer = setInterval(async () => {
    try {
      await runPing()
    } catch (error) {
      console.error(`[${nowIso()}] erro no ping: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, intervalMs)

  const shutdown = () => {
    clearInterval(timer)
    console.log(`[${nowIso()}] keep-alive encerrado`)
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void start()
