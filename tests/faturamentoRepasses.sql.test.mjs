import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('SQL repasses: confirmation, sync, paid protection and rollback', {
  skip: !process.env.REPASSE_PGLITE_MODULE && 'Set REPASSE_PGLITE_MODULE to an installed PGlite module URL.',
}, async () => {
  const { PGlite } = await import(process.env.REPASSE_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table public.app_users (id bigint primary key);')
    await db.exec(await readFile(new URL('../scripts/supabase-central-servicos.sql', import.meta.url), 'utf8'))
    const migration = await readFile(new URL('../scripts/supabase-faturamento-repasses.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    await db.exec(`
      insert into public.central_servicos_recursos(nome, status) values ('Ana','Ativo'), ('Beto','Ativo'), ('Caio','Ativo'), ('Inativo','Inativo');
      insert into public.central_servicos_faturamentos(titulo, nota, emissao, referencia, previsao_pagamento, contrato)
        values ('Fatura Teste', 'NF123', '2026-10-02', '2026-09', '2026-10-20', 'Contrato Teste'), ('Outro', '', null, '', null, '');
    `)
    const save = async (rows, confirm = false, invoice = 1) => {
      const { rows: result } = await db.query('select public.central_servicos_salvar_repasses($1, $2::jsonb, $3) as items', [invoice, rows === null ? null : JSON.stringify(rows), confirm])
      return result[0].items
    }
    const payments = async () => (await db.query('select * from public.central_servicos_pagamentos order by id')).rows
    let items = await save([{ recursoId: 1, valor: 100 }, { recursoId: 2, valor: 200 }])
    assert.equal(items.length, 2)
    assert.equal((await payments()).length, 0)
    items = await save(null, true)
    assert.equal((await payments()).length, 2)
    const ids = items.map((item) => item.pagamentoId)
    const payment = (await payments())[0]
    assert.equal(payment.tipo, 'Recurso')
    assert.equal(payment.relaciona, 'Ana')
    assert.equal(payment.status, 'Pendente')
    assert.equal(payment.referencia, '2026-09')
    assert.equal(payment.nota, 'NF123')
    assert.equal(payment.contrato, 'Contrato Teste')
    assert.equal(new Date(payment.emissao).toISOString().slice(0, 10), '2026-10-02')
    assert.equal(new Date(payment.previsao_pagamento).toISOString().slice(0, 10), '2026-10-20')
    items = await save(null, true)
    assert.deepEqual(items.map((item) => item.pagamentoId), ids)
    assert.equal((await payments()).length, 2)
    await Promise.all([save(null, true), save(null, true)])
    assert.equal((await payments()).length, 2)

    items = await save(items.map((item) => ({ id: item.id, recursoId: item.recursoId, valor: item.recursoId === 1 ? 125.50 : 200 })))
    assert.equal(Number((await payments())[0].valor), 125.50)
    const current = items.map((item) => ({ id: item.id, recursoId: item.recursoId, valor: item.valor }))
    await assert.rejects(save([{ ...current[0], valor: 999 }, { recursoId: 999, valor: 1 }]), /Recurso não encontrado/)
    assert.equal(Number((await payments())[0].valor), 125.50)
    await assert.rejects(save([{ recursoId: 1, valor: 1 }, { recursoId: 1, valor: 2 }]), /somente um repasse/)
    await assert.rejects(save([{ recursoId: 4, valor: 1 }]), /Ativo/)
    await assert.rejects(save([{ ...current[0], valor: 1.111 }]), /duas casas/)
    await assert.rejects(save([current[0]], false, 2), /não pertence/)
    await assert.rejects(save(null, true, 2), /pelo menos/)
    await assert.rejects(save([], false, 999), /não encontrado/)

    await db.query("update public.central_servicos_pagamentos set status = 'Pago', data_pagamento = '2026-10-03' where id = $1", [ids[0]])
    await assert.rejects(save([{ ...current[0], valor: 150 }, current[1]]), /pagamento Pago/)
    await assert.rejects(save([current[1]]), /pagamento Pago/)
    await assert.rejects(db.query('delete from public.central_servicos_pagamentos where id = $1', [ids[0]]), /aba Repasses/)
    await assert.rejects(db.query('update public.central_servicos_pagamentos set valor = 99 where id = $1', [ids[0]]), /aba Repasses/)
    await assert.rejects(db.query('delete from public.central_servicos_faturamento_repasses where id = $1', [current[0].id]), /pagamento Pago/)
    await assert.rejects(db.query('delete from public.central_servicos_faturamentos where id = 1'), /foreign key/)
    items = await save([current[0], { ...current[1], recursoId: 3, valor: 250 }])
    assert.equal((await payments())[1].relaciona, 'Caio')
    assert.equal(Number((await payments())[1].valor), 250)
    items = await save([current[0]])
    assert.equal(items.length, 1)
    assert.equal((await payments()).length, 1)
    assert.equal(items[0].pagamentoStatus, 'Pago')
    await db.query("update public.central_servicos_recursos set nome = 'Ana atualizada' where id = 1")
    await db.query("update public.central_servicos_pagamentos set data_pagamento = '2026-10-04' where id = $1", [ids[0]])
    assert.equal((await payments())[0].status, 'Pago')

    let swapped = await save([{ recursoId: 2, valor: 10 }, { recursoId: 3, valor: 20 }], false, 2)
    swapped = await save(swapped.map((item) => ({ id: item.id, recursoId: item.recursoId === 2 ? 3 : 2, valor: item.valor })), false, 2)
    assert.deepEqual(swapped.map((item) => item.recursoId), [3, 2])
    await save([], false, 2)
  } finally {
    await db.close()
  }
})

test('SQL invoice deletion removes repasses and pending payments atomically and preserves paid records', {
  skip: !process.env.REPASSE_PGLITE_MODULE && 'Set REPASSE_PGLITE_MODULE to an installed PGlite module URL.',
}, async () => {
  const { PGlite } = await import(process.env.REPASSE_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table public.app_users (id bigint primary key);')
    await db.exec(await readFile(new URL('../scripts/supabase-central-servicos.sql', import.meta.url), 'utf8'))
    const migration = await readFile(new URL('../scripts/supabase-faturamento-repasses.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    await db.exec(`
      insert into public.central_servicos_recursos(nome) values ('Ana'), ('Beto'), ('Caio');
      insert into public.central_servicos_contratos_servicos(titulo, tipo_contrato, saldo_quantidade, saldo_valor)
        values ('Banco teste', 'Banco de Horas', 8, 800);
      insert into public.central_servicos_faturamentos(titulo, contrato_id, quantidade, valor)
        values ('Excluir', 1, 2, 200), ('Preservar Pago', null, null, null), ('Sem repasses', null, null, null);
      insert into public.central_servicos_pagamentos(titulo, valor) values ('Pagamento independente', 50);
    `)
    const remove = (id) => db.query('select public.central_servicos_excluir_faturamento($1)', [id])
    const save = (id, rows, confirm) => db.query(
      'select public.central_servicos_salvar_repasses($1, $2::jsonb, $3)', [id, JSON.stringify(rows), confirm],
    )
    const count = async (table) => Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n)
    await save(1, [{ recursoId: 1, valor: 100 }, { recursoId: 2, valor: 100 }], true)
    // Include a saved draft without a generated payment.
    await db.exec('insert into public.central_servicos_faturamento_repasses(faturamento_id,recurso_id,valor) values (1,3,50)')
    await remove(1)
    assert.equal(await count('central_servicos_faturamento_repasses'), 0)
    assert.equal(await count('central_servicos_pagamentos'), 1)
    assert.equal(await count('central_servicos_faturamentos'), 2)
    const balance = (await db.query('select saldo_quantidade, saldo_valor from public.central_servicos_contratos_servicos where id = 1')).rows[0]
    assert.equal(Number(balance.saldo_quantidade), 10)
    assert.equal(Number(balance.saldo_valor), 1000)
    await assert.rejects(remove(1), /não encontrado/)
    assert.equal(Number((await db.query('select saldo_valor from public.central_servicos_contratos_servicos where id = 1')).rows[0].saldo_valor), 1000)

    await save(2, [{ recursoId: 1, valor: 100 }, { recursoId: 2, valor: 200 }], true)
    await db.exec("update public.central_servicos_pagamentos set status = 'Pago' where repasse_id = (select id from public.central_servicos_faturamento_repasses where faturamento_id = 2 and recurso_id = 2)")
    await assert.rejects(remove(2), /pagamento Pago/)
    assert.equal(await count('central_servicos_faturamento_repasses'), 2)
    assert.equal(await count('central_servicos_pagamentos'), 3)
    assert.equal(await count('central_servicos_faturamentos'), 2)
    await remove(3)
    assert.equal(await count('central_servicos_faturamentos'), 1)

    await db.exec(`
      insert into public.central_servicos_faturamentos(titulo,contrato_id,quantidade,valor) values ('Rollback',1,1,100);
      create function public.reject_balance_update() returns trigger language plpgsql as $$
      begin raise exception 'Falha simulada no saldo'; end; $$;
      create trigger reject_balance before update on public.central_servicos_contratos_servicos
        for each row execute function public.reject_balance_update();
    `)
    await save(4, [{ recursoId: 3, valor: 100 }], true)
    await assert.rejects(remove(4), /Falha simulada no saldo/)
    assert.equal(await count('central_servicos_faturamento_repasses'), 3)
    assert.equal(await count('central_servicos_pagamentos'), 4)
    assert.equal(await count('central_servicos_faturamentos'), 2)
    await db.exec('set role anon')
    await assert.rejects(remove(4), /permission denied/)
  } finally {
    await db.close()
  }
})
