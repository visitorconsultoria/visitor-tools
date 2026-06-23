import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import dotenv from 'dotenv'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const CATALOGS_TABLE = String(process.env.SUPABASE_RUBRICA_CATALOGS_TABLE || 'rubrica_reference_catalogs').trim()
const ITEMS_TABLE = String(process.env.SUPABASE_RUBRICA_ITEMS_TABLE || 'rubrica_reference_items').trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Configuracao ausente: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.')
  process.exit(1)
}

const FILENAME_TO_CATALOG_KEY = [
  { match: /natureza/i, key: 'natureza-rubricas' },
  { match: /inc\.?\s*cp/i, key: 'inc-cp' },
  { match: /inc\.?\s*fgts/i, key: 'inc-fgts' },
  { match: /inc\.?\s*pis/i, key: 'inc-pis' },
  { match: /inc\.?\s*rpps/i, key: 'inc-rpps' },
  { match: /inc\.?\s*irrf/i, key: 'inc-irrf' },
  { match: /dirf/i, key: 'dirf-protheus' },
  { match: /id\s*c[aá]lculo/i, key: 'id-calculo-protheus' },
]

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const str = String(value ?? '').trim()
    if (str) return str
  }
  return ''
}

function parseDateValue(value) {
  const text = String(value ?? '').trim()
  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

   const brShortYear = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
   if (brShortYear) {
     const day = brShortYear[1].padStart(2, '0')
     const month = brShortYear[2].padStart(2, '0')
     const shortYear = Number(brShortYear[3])
     const fullYear = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear
     return `${fullYear}-${month}-${day}`
   }

  const asDate = new Date(text)
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString().slice(0, 10)
  }

  return null
}

function extractRowsFromWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
  if (!Array.isArray(matrix) || !matrix.length) return []

  const headerRow = matrix[0].map((cell) => normalizeHeader(cell))
  const byName = (keywords) => {
    for (let i = 0; i < headerRow.length; i += 1) {
      const header = headerRow[i]
      if (keywords.some((kw) => header.includes(kw))) return i
    }
    return -1
  }

  const idxCodigoNatureza = byName(['codigo da natureza'])
  const idxCodigo = byName(['codigo'])
  const idxDescAbrev = byName(['descricao abreviada'])
  const idxDescComp = byName(['descricao completa'])
  const idxInicio = byName(['inicio da vigencia', 'data inicio'])
  const idxFim = byName(['fim da vigencia', 'data fim'])
  const idxLinks = byName(['links de referencia', 'link de referencia', 'link referencia'])

  return matrix.slice(1).map((row) => {
    const code = firstNonEmpty(row[idxCodigoNatureza], row[idxCodigo])
    const shortDescription = firstNonEmpty(row[idxDescAbrev])
    const fullDescription = firstNonEmpty(row[idxDescComp], shortDescription)
    const validFrom = parseDateValue(row[idxInicio])
    const validTo = parseDateValue(row[idxFim])
    const linksRaw = firstNonEmpty(row[idxLinks])
    const referenceLinks = linksRaw
      ? Array.from(new Set(String(linksRaw).split(/\r?\n|;/g).map((item) => item.trim()).filter(Boolean)))
      : []

    return { code, shortDescription, fullDescription, validFrom, validTo, referenceLinks }
  }).filter((item) => item.code && item.shortDescription)
}

function resolveCatalogKeyFromFilename(fileName) {
  const baseName = fileName.replace(/^\d+\.\s+/, '').trim()
  const normalized = normalizeHeader(baseName)
  const found = FILENAME_TO_CATALOG_KEY.find((item) => item.match.test(normalized))
  return found?.key || ''
}

function parseArgs(argv) {
  const argDir = argv.find((item) => item.startsWith('--dir='))
  if (argDir) {
    const dirValue = argDir.split('=')[1]
    return path.resolve(process.cwd(), dirValue)
  }
  return path.resolve(__dirname, 'rubricas-defaults')
}

async function run() {
  const dirPath = parseArgs(process.argv.slice(2))
  const files = XLSX.utils.consts ? [] : []
  void files

  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(dirPath, { withFileTypes: true })
  const xlsxFiles = entries
    .filter((entry) => entry.isFile() && /\.xlsx$/i.test(entry.name))
    .map((entry) => path.join(dirPath, entry.name))

  if (!xlsxFiles.length) {
    throw new Error(`Nenhum .xlsx encontrado em ${dirPath}`)
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let totalUpserts = 0

  for (const filePath of xlsxFiles) {
    const fileName = path.basename(filePath)
    const catalogKey = resolveCatalogKeyFromFilename(fileName)
    if (!catalogKey) {
      console.warn(`Ignorando arquivo sem mapeamento de catalogo: ${fileName}`)
      continue
    }

    const rows = extractRowsFromWorkbook(filePath)
    if (!rows.length) {
      console.warn(`Arquivo sem linhas validas: ${fileName}`)
      continue
    }

    const { data: catalogRow, error: catalogError } = await client
      .from(CATALOGS_TABLE)
      .select('id, catalog_key, allow_multiple_links')
      .eq('catalog_key', catalogKey)
      .single()

    if (catalogError) {
      console.warn(`Catalogo ${catalogKey} deve existir antes do import: ${catalogError.message}`)
      continue
    }

    const catalogId = Number(catalogRow?.id ?? 0)
    if (!catalogId) {
      console.warn(`Catalogo ${catalogKey} sem ID valido. Arquivo ignorado: ${fileName}`)
      continue
    }

    const { error: deleteError } = await client
      .from(ITEMS_TABLE)
      .delete()
      .eq('catalog_id', catalogId)

    if (deleteError) {
      throw new Error(`Falha ao limpar itens existentes de ${fileName}: ${deleteError.message}`)
    }

    const payload = rows.map((row) => ({
      catalog_id: catalogId,
      catalog_key: catalogKey,
      code: row.code,
      short_description: row.shortDescription,
      full_description: row.fullDescription,
      valid_from: row.validFrom,
      valid_to: row.validTo,
      reference_links: catalogKey === 'id-calculo-protheus' ? row.referenceLinks : row.referenceLinks.slice(0, 1),
    }))

    const deduped = Array.from(
      new Map(payload.map((item) => [item.code, item])).values()
    )

    const { error } = await client
      .from(ITEMS_TABLE)
      .insert(deduped)

    if (error) {
      throw new Error(`Falha no insert de ${fileName}: ${error.message}`)
    }

    totalUpserts += deduped.length
    console.log(`Importado ${fileName}: ${deduped.length} registro(s) (deduped de ${payload.length}).`)
  }

  console.log(`Importacao concluida. Total de registros processados: ${totalUpserts}`)
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})