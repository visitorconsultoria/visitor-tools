import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('const CENTRAL_SERVICOS_ATENDIMENTO_STATUSES'), source.indexOf("app.get('/api/central-servicos/atendimentos',"))
const catalogHelpers = source.slice(source.indexOf('async function createCentralServicosItem('), source.indexOf('async function deleteCentralServicosItem('))
const payload = { data: '2026-11-03', solicitante: 'Pessoa', descricao: 'Descrição', responsavel: 'Recurso', dataPrevista: '2026-11-05', dataConclusao: '' }

function setup(error = null, table = 'central_servicos_atendimentos', missing = false) {
  const calls = []
  let queriedTable
  const row = { id: 1, data_prevista: '2026-11-05', data_conclusao: '2026-11-03', status: 'done' }
  const query = {
    insert: () => query,
    update: () => query,
    single: async () => ({ data: row, error }),
    select: (columns) => { calls.push({ select: columns }); return query },
    order: () => query,
    ilike: (column, value) => { calls.push({ ilike: [column, value] }); return query },
    in: (column, values) => { calls.push({ in: [column, values] }); return query },
    eq: () => query,
    maybeSingle: async () => ({ data: missing ? null : row, error }),
    then: (resolve, reject) => Promise.resolve({
      data: queriedTable === 'central_servicos_atendimento_historico'
        ? [{ id: 2, acao: 'alteracao', ocorrido_em: '2026-11-03T12:00:00Z', usuario: 'editor', usuario_nome: 'Editor', alteracoes: { status: { anterior: 'open', novo: 'done' } } }]
        : [row], error,
    }).then(resolve, reject),
  }
  const context = vm.createContext({
    Error,
    parseCentralServicosTextInput: (value) => String(value ?? '').trim(),
    parseCentralServicosNullableDateInput: (value) => String(value ?? '').trim() || null,
    normalizeDateInput: (value) => String(value ?? ''),
    getSupabaseClient: () => ({
      centralServicosAtendimentosTable: table,
      client: {
        rpc: async (name, args) => { calls.push({ name, args }); return { data: row, error } },
        from: (name) => { queriedTable = name; calls.push({ from: name }); return query },
      },
    }),
  })
  vm.runInContext(`${catalogHelpers}\n${body}
    globalThis.api = {
      parse: parseCentralServicosAtendimentoPayload,
      normalize: normalizeCentralServicosAtendimentoRow,
      create: createCentralServicosAtendimento,
      update: updateCentralServicosAtendimento,
      list: listCentralServicosAtendimentos,
      history: listCentralServicosAtendimentoHistorico,
    }`, context)
  return { api: context.api, calls }
}

test('atendimento normalization and payload include both dates and accept empty optional dates', () => {
  const { api } = setup()
  assert.equal(api.parse(payload).data_prevista, '2026-11-05')
  assert.equal(api.parse(payload).data_conclusao, null)
  assert.equal(api.normalize({}).dataPrevista, '')
  assert.equal(api.normalize({ data_conclusao: '2026-11-03' }).dataConclusao, '2026-11-03')
})

test('create and update use audited transaction with actor and return database completion date', async () => {
  const { api, calls } = setup()
  const actor = { username: 'editor', displayName: 'Editor teste' }
  const item = await api.create(payload, actor)
  await api.update(7, payload, actor)
  assert.equal(item.dataConclusao, '2026-11-03')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].name, 'central_servicos_salvar_atendimento')
  assert.equal(calls[0].args.p_id, null)
  assert.equal(calls[1].args.p_id, 7)
  assert.equal(calls[0].args.p_usuario, 'editor')
  assert.equal(calls[0].args.p_usuario_nome, 'Editor teste')
  assert.equal(calls[0].args.p_dados.data_prevista, '2026-11-05')
})

test('main atendimento list includes completed records while daily resource selection remains active-only', async () => {
  const main = setup()
  await main.api.list()
  assert.equal(main.calls.some((call) => call.in), false)
  assert.match(main.calls.find((call) => call.select).select, /data_prevista, data_conclusao/)
  const daily = setup()
  await daily.api.list('Recurso')
  assert.deepEqual(Array.from(daily.calls.find((call) => call.in).in[1]), ['open', 'in_progress'])
})

test('transaction errors, missing migrations and unsupported tables are explicit', async () => {
  const actor = { username: 'editor', displayName: '' }
  await assert.rejects(setup({ code: 'PGRST202', message: 'Function missing' }).api.create(payload, actor), /supabase-atendimentos-historico.sql/)
  await assert.rejects(setup({ message: 'Falha no histórico' }).api.update(1, payload, actor), /Falha no histórico/)
  const custom = setup(null, 'custom_atendimentos')
  await assert.rejects(custom.api.create(payload, actor), /padrão/)
  assert.equal(custom.calls.length, 0)
})

test('history checks the atendimento exists and returns actor and field differences', async () => {
  const { api } = setup()
  const rows = await api.history(1)
  assert.equal(rows[0].usuarioNome, 'Editor')
  assert.equal(rows[0].ocorridoEm, '2026-11-03T12:00:00Z')
  assert.equal(rows[0].alteracoes.status.novo, 'done')
  await assert.rejects(setup(null, 'central_servicos_atendimentos', true).api.history(999), /não encontrado/)
  await assert.rejects(setup({ code: '42P01', message: 'Missing table' }).api.history(1), /supabase-atendimentos-historico.sql/)
})

test('missing actors and invalid IDs are rejected before RPC; payload cannot override audit user', async () => {
  const { api, calls } = setup()
  await assert.rejects(api.create(payload), /sessao/)
  await assert.rejects(api.update(0, payload, { username: 'editor' }), /ID/)
  assert.equal(calls.length, 0)
  await api.create({ ...payload, usuario: 'forged', usuario_nome: 'forged' }, { username: 'editor', displayName: 'Editor' })
  assert.equal(calls[0].args.p_usuario, 'editor')
  assert.equal(calls[0].args.p_dados.usuario, undefined)
})
