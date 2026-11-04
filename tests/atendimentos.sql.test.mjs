import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const options = {
  skip: !process.env.REPASSE_PGLITE_MODULE && 'Set REPASSE_PGLITE_MODULE to an installed PGlite module URL.',
}
const types = [
  'Desenvolvimento', 'Sustentação / Suporte', 'Análise / Diagnóstico', 'Reunião',
  'Testes / Homologação', 'Documentação', 'Proposta / Estimativa',
  'Implantação / Deploy', 'Treinamento', 'Outros',
]
const payload = {
  numero: 'AT-2026-001', titulo: 'Teste', data: '2026-11-03', tipo: 'Desenvolvimento',
  cliente: 'Cliente teste', solicitante: 'Solicitante teste', descricao: '<p>Descrição</p>',
  responsavel: 'Recurso teste', status: 'open', observacoes: '',
  data_prevista: null, data_conclusao: null,
}

async function setup() {
  const { PGlite } = await import(process.env.REPASSE_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table public.app_users (id bigint primary key);')
    await db.exec(await readFile(new URL('../scripts/supabase-central-servicos.sql', import.meta.url), 'utf8'))
    const migration = await readFile(new URL('../scripts/supabase-atendimentos-historico.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const save = async (changes = {}, id = null, usuario = 'tester') => {
      const { rows } = await db.query(
        'select public.central_servicos_salvar_atendimento($1, $2::jsonb, $3, $4) as item',
        [id, JSON.stringify({ ...payload, ...changes }), usuario, 'Usuário teste'],
      )
      return rows[0].item
    }
    const history = async (id) => (await db.query(
      'select * from public.central_servicos_atendimento_historico where atendimento_id = $1 order by id', [id],
    )).rows
    return { db, save, history, migration }
  } catch (error) {
    await db.close()
    throw error
  }
}

test('atendimento dates are optional and completion is generated only on transition, in Brasilia time', options, async () => {
  const { db, save } = await setup()
  try {
    let item = await save()
    assert.equal(item.data_prevista, null)
    assert.equal(item.data_conclusao, null)
    item = await save({ data_prevista: '2026-11-10', status: 'in_progress' }, item.id)
    assert.equal(item.data_prevista, '2026-11-10')
    assert.equal(item.data_conclusao, null)
    const { rows: today } = await db.query("select (clock_timestamp() at time zone 'America/Sao_Paulo')::date::text as data")
    item = await save({ status: 'done' }, item.id)
    assert.equal(item.data_conclusao, today[0].data)
    item = await save({ status: 'done', data_conclusao: '2026-10-31' }, item.id)
    assert.equal(item.data_conclusao, '2026-10-31')
    item = await save({ status: 'open', data_conclusao: '2026-10-31' }, item.id)
    assert.equal(item.data_conclusao, '2026-10-31')
    await save({ status: 'open', data_conclusao: null }, item.id)
    item = await save({ status: 'done' }, item.id)
    assert.equal(item.data_conclusao, today[0].data)
    const initialDone = await save({ status: 'done' })
    assert.equal(initialDone.data_conclusao, today[0].data)
    const manual = await save({ status: 'done', data_conclusao: '2026-11-01' })
    assert.equal(manual.data_conclusao, '2026-11-01')
    await assert.rejects(save({ data_prevista: '2026-02-30' }), /date/)
  } finally {
    await db.close()
  }
})

test('audit stores inclusion and field differences with actor, including automatically generated dates', options, async () => {
  const { db, save, history } = await setup()
  try {
    const item = await save()
    let events = await history(item.id)
    assert.equal(events.length, 1)
    assert.equal(events[0].acao, 'inclusao')
    assert.equal(events[0].usuario, 'tester')
    assert.equal(events[0].usuario_nome, 'Usuário teste')
    assert.equal(events[0].valores_anteriores, null)
    assert.equal(events[0].valores_novos.tipo, payload.tipo)
    assert.ok(events[0].ocorrido_em)
    const changed = await save({ status: 'done', titulo: 'Novo título', data_prevista: '2026-11-04' }, item.id, 'editor')
    events = await history(item.id)
    assert.equal(events.length, 2)
    assert.equal(events[1].acao, 'alteracao')
    assert.equal(events[1].usuario, 'editor')
    assert.deepEqual(events[1].alteracoes.titulo, { anterior: 'Teste', novo: 'Novo título' })
    assert.deepEqual(events[1].alteracoes.status, { anterior: 'open', novo: 'done' })
    assert.deepEqual(events[1].alteracoes.data_conclusao, { anterior: null, novo: changed.data_conclusao })
    assert.equal(events[1].valores_anteriores.data_prevista, null)
    assert.equal(events[1].valores_novos.data_prevista, '2026-11-04')
    assert.equal(events[1].alteracoes.updated_at, undefined)
    await save(changed, item.id)
    assert.equal((await history(item.id)).length, 2, 'unchanged saves do not invent changes')
    await db.exec(`update public.central_servicos_atendimentos set titulo = 'Alterado no banco' where id = ${item.id}`)
    events = await history(item.id)
    assert.equal(events[2].usuario, 'Banco de dados', 'direct writes do not reuse the previous API actor')
  } finally {
    await db.close()
  }
})

test('all ten types are accepted and legacy values are preserved only when unchanged', options, async () => {
  const { db, save, history, migration } = await setup()
  try {
    for (const tipo of types) assert.equal((await save({ tipo })).tipo, tipo)
    await assert.rejects(save({ tipo: 'Tipo desconhecido' }), /Tipo/)
    await db.exec("insert into public.central_servicos_atendimentos (tipo) values ('Consultoria antiga')")
    const { rows: legacy } = await db.query("select id from public.central_servicos_atendimentos where tipo = 'Consultoria antiga'")
    const item = await save({ tipo: 'Consultoria antiga' }, legacy[0].id)
    assert.equal(item.tipo, 'Consultoria antiga')
    await assert.rejects(save({ tipo: 'Outro tipo antigo' }, item.id), /Tipo/)
    const before = await history(item.id)
    await db.exec(migration)
    assert.deepEqual(await history(item.id), before)
  } finally {
    await db.close()
  }
})

test('failure to record audit rolls back atendimento changes; history cannot be modified by application role', options, async () => {
  const { db, save, history } = await setup()
  try {
    const item = await save()
    await db.exec("alter table public.central_servicos_atendimento_historico add constraint reject_editor check (usuario <> 'editor')")
    await assert.rejects(save({ titulo: 'Nao deve salvar' }, item.id, 'editor'), /reject_editor/)
    assert.equal((await db.query('select titulo from public.central_servicos_atendimentos where id = $1', [item.id])).rows[0].titulo, 'Teste')
    assert.equal((await history(item.id)).length, 1)
    await assert.rejects(save({}, 999), /não encontrado/)
    await assert.rejects(save({}, null, ''), /Usuário/)
    const { rows: permissions } = await db.query(`
      select has_table_privilege('service_role', 'public.central_servicos_atendimento_historico', 'SELECT') as leitura,
        has_table_privilege('service_role', 'public.central_servicos_atendimento_historico', 'UPDATE') as alteracao,
        has_function_privilege('anon', 'public.central_servicos_salvar_atendimento(bigint,jsonb,text,text)', 'EXECUTE') as anon_execute
    `)
    assert.equal(permissions[0].leitura, true)
    assert.equal(permissions[0].alteracao, false)
    assert.equal(permissions[0].anon_execute, false)
  } finally {
    await db.close()
  }
})

test('migration preserves legacy records and does not invent historical events', options, async () => {
  const { db, migration } = await setup()
  try {
    await db.exec(`
      drop trigger trg_atendimento_auditar on public.central_servicos_atendimentos;
      drop trigger trg_atendimento_datas on public.central_servicos_atendimentos;
      alter table public.central_servicos_atendimentos drop column data_prevista, drop column data_conclusao;
      insert into public.central_servicos_atendimentos (titulo, tipo, status)
      values ('Histórico antigo', 'Consultoria', 'done');
    `)
    const before = (await db.query('select id, titulo, tipo, status, created_at, updated_at from public.central_servicos_atendimentos')).rows
    await db.exec(migration)
    await db.exec(migration)
    assert.deepEqual((await db.query('select id, titulo, tipo, status, created_at, updated_at from public.central_servicos_atendimentos')).rows, before)
    assert.equal((await db.query('select id from public.central_servicos_atendimento_historico')).rows.length, 0)
    const row = (await db.query('select data_prevista, data_conclusao from public.central_servicos_atendimentos')).rows[0]
    assert.deepEqual(row, { data_prevista: null, data_conclusao: null })
  } finally {
    await db.close()
  }
})

test('service_role can save and read history but cannot rewrite it; concurrent changes retain the previous values', options, async () => {
  const { db, save, history } = await setup()
  try {
    await db.exec(`
      grant select, insert, update, delete on public.central_servicos_atendimentos to service_role;
      grant usage, select on sequence public.central_servicos_atendimentos_id_seq to service_role;
      set role service_role;
    `)
    const item = await save()
    assert.equal((await history(item.id)).length, 1)
    await assert.rejects(db.exec('update public.central_servicos_atendimento_historico set usuario = \'Outro\''), /permission denied/)
    await Promise.all([
      save({ titulo: 'Primeira alteração' }, item.id, 'editor1'),
      save({ titulo: 'Segunda alteração' }, item.id, 'editor2'),
    ])
    const events = await history(item.id)
    assert.equal(events.length, 3)
    assert.equal(events[1].alteracoes.titulo.anterior, 'Teste')
    assert.equal(events[2].alteracoes.titulo.anterior, events[1].alteracoes.titulo.novo)
  } finally {
    await db.close()
  }
})
