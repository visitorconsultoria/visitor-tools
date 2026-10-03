import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceRepassesOperation, parseInvoiceRepasses } from '../lib/faturamentoRepasses.mjs'

test('validates and normalizes positive monetary values and resource IDs', () => {
  assert.deepEqual(parseInvoiceRepasses([{ recursoId: '2', valor: '123,45' }]), [
    { id: null, recursoId: 2, valor: 123.45 },
  ])
  assert.deepEqual(parseInvoiceRepasses([{ id: 3, recursoId: 2, valor: '0.01' }]), [
    { id: 3, recursoId: 2, valor: 0.01 },
  ])
  assert.deepEqual(parseInvoiceRepasses([]), [])
})

test('rejects invalid amounts, resources, duplicate IDs and repeated resources', () => {
  for (const valor of ['', null, '0', '-1', '1.234', 'NaN', 'Infinity', '1e3', '1000000000000']) {
    assert.throws(() => parseInvoiceRepasses([{ recursoId: 1, valor }]))
  }
  for (const recursoId of [null, '', 0, -1, 1.5, 'a', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseInvoiceRepasses([{ recursoId, valor: 1 }]))
  }
  assert.throws(() => parseInvoiceRepasses(null))
  assert.throws(() => parseInvoiceRepasses([null]))
  assert.throws(() => parseInvoiceRepasses([{ recursoId: 1, valor: 1 }, { recursoId: 1, valor: 2 }]))
  assert.throws(() => parseInvoiceRepasses([{ id: 1, recursoId: 1, valor: 1 }, { id: 1, recursoId: 2, valor: 2 }]))
  assert.throws(() => parseInvoiceRepasses(Array.from({ length: 101 }, (_, index) => ({ recursoId: index + 1, valor: 1 }))))
})

function config(rpc) {
  return {
    client: { rpc },
    centralServicosFaturamentosTable: 'central_servicos_faturamentos',
    centralServicosPagamentosTable: 'central_servicos_pagamentos',
    centralServicosRecursosTable: 'central_servicos_recursos',
  }
}

test('read, save and confirm use the proper atomic RPC; confirm uses persisted rows', async () => {
  const calls = []
  const settings = config(async (name, args) => { calls.push({ name, args }); return { data: [], error: null } })
  await invoiceRepassesOperation(settings, 7)
  await invoiceRepassesOperation(settings, 7, [{ recursoId: 2, valor: '12,34' }])
  await invoiceRepassesOperation(settings, 7, undefined, true)
  assert.deepEqual(calls, [
    { name: 'central_servicos_listar_repasses', args: { p_faturamento_id: 7 } },
    { name: 'central_servicos_salvar_repasses', args: { p_faturamento_id: 7, p_repasses: [{ id: null, recursoId: 2, valor: 12.34 }], p_confirmar: false } },
    { name: 'central_servicos_salvar_repasses', args: { p_faturamento_id: 7, p_repasses: null, p_confirmar: true } },
  ])
})

test('invalid requests fail before RPC and database errors are surfaced', async () => {
  const settings = config(async () => { throw new Error('Must not be called') })
  await assert.rejects(invoiceRepassesOperation(settings, 0), /ID/)
  await assert.rejects(invoiceRepassesOperation(settings, 1, null), /lista/)
  await assert.rejects(invoiceRepassesOperation({ ...settings, centralServicosPagamentosTable: 'other' }, 1), /nomes padrão/)
  await assert.rejects(invoiceRepassesOperation(config(async () => ({ error: { message: 'Pagamento Pago' } })), 1, []), /Pagamento Pago/)
  await assert.rejects(invoiceRepassesOperation(config(async () => ({ data: null, error: null })), 1), /Resposta inválida/)
})
