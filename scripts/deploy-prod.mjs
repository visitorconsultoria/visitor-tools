import { spawn } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('Variavel obrigatoria ausente: VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

if (!process.env.VITE_SUPABASE_URL) {
  console.error('Variavel obrigatoria ausente: VITE_SUPABASE_URL')
  process.exit(1)
}

const env = {
  ...process.env,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || 'https://visitor-tools-api.onrender.com',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_DATA_DICTIONARY_TABLE: process.env.VITE_SUPABASE_DATA_DICTIONARY_TABLE || 'data_dictionary',
}

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(command, ['run', 'deploy'], {
  env,
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
