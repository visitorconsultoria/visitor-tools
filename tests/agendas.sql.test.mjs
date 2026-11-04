import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const schema = await readFile(new URL('../scripts/supabase-central-servicos.sql', import.meta.url), 'utf8')
const options = {
  skip: !process.env.REPASSE_PGLITE_MODULE && 'Set REPASSE_PGLITE_MODULE to an installed PGlite module URL.',
}

async function createDatabase() {
  const { PGlite } = await import(process.env.REPASSE_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table public.app_users (id bigint primary key);')
    await db.exec(schema)
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}

test('new agenda schema allows multiple contracts and periods for the same resource and client', options, async () => {
  const db = await createDatabase()
  try {
    await db.exec(`
      insert into public.central_servicos_agendas
        (recurso, cliente, contrato_id, vigencia_inicio, vigencia_termino, status)
      values
        ('Recurso teste', 'Cliente teste', 1, '2026-10-01', '2026-10-31', 'Encerrado'),
        ('Recurso teste', 'Cliente teste', 1, '2026-11-01', '2026-11-30', 'Ativo'),
        ('Recurso teste', 'Cliente teste', 2, '2026-11-03', '2026-11-30', 'Ativo'),
        ('Recurso teste', 'Cliente teste', null, '2026-12-01', '2026-12-31', 'Ativo');
    `)
    const { rows } = await db.query('select id, contrato_id, status from public.central_servicos_agendas order by id')
    assert.equal(rows.length, 4)
    assert.equal(new Set(rows.map((row) => row.id)).size, 4)
    assert.deepEqual(rows.map((row) => row.contrato_id), [1, 1, 2, null])
    assert.equal(rows[0].status, 'Encerrado')
    await assert.rejects(db.exec('insert into public.central_servicos_agendas (id) overriding system value values (1)'), /duplicate key/)
    await assert.rejects(db.exec("insert into public.central_servicos_agendas (status) values ('Invalido')"), /check constraint/)
  } finally {
    await db.close()
  }
})

for (const upgrade of ['migration', 'schema']) {
  test(`agenda ${upgrade} removes legacy uniqueness idempotently without changing existing records`, options, async () => {
    const db = await createDatabase()
    try {
      await db.exec(`
        alter table public.central_servicos_agendas
          drop constraint if exists central_servicos_agendas_recurso_cliente_key;
        alter table public.central_servicos_agendas
          add constraint central_servicos_agendas_recurso_cliente_key unique (recurso, cliente);
        insert into public.central_servicos_agendas
          (recurso, cliente, contrato_id, observacoes, status)
        values ('Recurso teste', 'Cliente teste', 1, 'Historico preservado', 'Encerrado');
      `)
      const before = (await db.query('select * from public.central_servicos_agendas')).rows
      await assert.rejects(db.exec(`
        insert into public.central_servicos_agendas (recurso, cliente, contrato_id)
        values ('Recurso teste', 'Cliente teste', 2)
      `), /central_servicos_agendas_recurso_cliente_key/)
      const sql = upgrade === 'schema'
        ? schema
        : await readFile(new URL('../scripts/supabase-agendas-multiplos-planejamentos.sql', import.meta.url), 'utf8')
      await db.exec(sql)
      await db.exec(sql)
      assert.deepEqual((await db.query('select * from public.central_servicos_agendas')).rows, before)
      await db.exec(`
        insert into public.central_servicos_agendas (recurso, cliente, contrato_id)
        values ('Recurso teste', 'Cliente teste', 2), ('Recurso teste', 'Cliente teste', 1)
      `)
      assert.equal((await db.query('select id from public.central_servicos_agendas')).rows.length, 3)
    } finally {
      await db.close()
    }
  })
}
