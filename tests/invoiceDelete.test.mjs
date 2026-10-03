import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('async function deleteCentralServicosFaturamento(id)'), source.indexOf('async function listCentralServicosPagamentos()'))

function setup(error = null, table = 'central_servicos_faturamentos') {
  const calls = []
  const context = vm.createContext({
    Error,
    getSupabaseClient: () => ({
      centralServicosFaturamentosTable: table,
      centralServicosPagamentosTable: 'central_servicos_pagamentos',
      centralServicosRecursosTable: 'central_servicos_recursos',
      centralServicosContratosServicosTable: 'central_servicos_contratos_servicos',
      client: { rpc: async (name, args) => { calls.push({ name, args }); return { error } } },
    }),
    invoiceRepassesOperation: async () => [{ id: 1 }],
  })
  vm.runInContext(`${body}\nglobalThis.remove = deleteCentralServicosFaturamento`, context)
  return { calls, remove: context.remove }
}

test('invoice deletion delegates cascade and balance restoration to a single database transaction', async () => {
  const { calls, remove } = setup()
  await remove(7)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'central_servicos_excluir_faturamento')
  assert.equal(calls[0].args.p_faturamento_id, 7)
})

test('paid payment and missing migration errors are reported explicitly', async () => {
  await assert.rejects(setup({ message: 'Existe pagamento Pago' }).remove(7), /pagamento Pago/)
  await assert.rejects(setup({ code: 'PGRST202', message: 'Function not found' }).remove(7), /supabase-faturamento-repasses.sql/)
})

test('invoice deletion rejects unsupported tables and invalid IDs before RPC', async () => {
  const { calls, remove } = setup(null, 'custom_table')
  await assert.rejects(remove(7), /nomes padrão/)
  assert.equal(calls.length, 0)
  const normal = setup()
  await assert.rejects(normal.remove(0), /ID/)
  assert.equal(normal.calls.length, 0)
})

test('invoice confirmation warns about deleting repasses and pending payments; cancellation makes no request', async () => {
  const component = await readFile(new URL('../src/components/CentralServicosTool.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('CentralServicosTool.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleDeleteItem') handler = node.getText(tree)
    ts.forEachChild(node, find)
  }
  find(tree)
  let message
  let requests = 0
  const context = vm.createContext({
    window: {},
    confirmAction: async (text) => { message = text; return false },
    apiUrl: (path) => path,
    fetch: async () => { requests++; throw new Error('Must not call fetch') },
  })
  vm.runInContext(ts.transpileModule(`const ${handler}; globalThis.remove = handleDeleteItem;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  const noop = () => {}
  await context.remove('/api/central-servicos/faturamentos', 1, noop, '', noop, noop)
  assert.match(message, /repasses/i)
  assert.match(message, /pagamentos Pendentes/i)
  assert.match(message, /Pago/i)
  assert.equal(requests, 0)
  await context.remove('/api/central-servicos/despesas', 1, noop, '', noop, noop)
  assert.equal(message, 'Confirma a exclusão deste registro?')
})
