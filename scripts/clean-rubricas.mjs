import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const ITEMS_TABLE = String(process.env.SUPABASE_RUBRICA_ITEMS_TABLE || 'rubrica_reference_items').trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Configuracao ausente: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.')
  process.exit(1)
}

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

try {
  console.log('🧹 Limpando tabela de itens de rubricas...')
  
  const { error } = await client
    .from(ITEMS_TABLE)
    .delete()
    .gt('id', 0)

  if (error) {
    console.warn(`⚠️ ${error.message}`)
  } else {
    console.log('✅ Tabela limpa com sucesso!')
  }
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err)
  console.error(`Erro: ${detail}`)
  process.exit(1)
}
