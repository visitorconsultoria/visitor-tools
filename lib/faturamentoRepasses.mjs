export function parseInvoiceRepasses(input) {
  if (!Array.isArray(input) || input.length > 100) {
    throw new Error('Informe uma lista com até 100 repasses.')
  }
  const resources = new Set()
  const ids = new Set()
  return input.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Repasse ${index + 1}: dados inválidos.`)
    }
    const id = row.id === null || row.id === undefined ? null : Number(row.id)
    const recursoId = Number(row.recursoId)
    const text = String(row.valor ?? '').trim().replace(',', '.')
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
      throw new Error(`Repasse ${index + 1}: informe valor positivo com até duas casas decimais.`)
    }
    if (!Number.isSafeInteger(recursoId) || recursoId <= 0) {
      throw new Error(`Repasse ${index + 1}: selecione um recurso válido.`)
    }
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0 || ids.has(id))) {
      throw new Error(`Repasse ${index + 1}: identificador inválido ou repetido.`)
    }
    if (resources.has(recursoId)) {
      throw new Error('Cada recurso pode ter somente um repasse por faturamento.')
    }
    resources.add(recursoId)
    if (id !== null) ids.add(id)
    return { id, recursoId, valor: Number(text) }
  })
}

export async function invoiceRepassesOperation(config, invoiceId, rows, confirm = false) {
  if (config.centralServicosFaturamentosTable !== 'central_servicos_faturamentos'
      || config.centralServicosPagamentosTable !== 'central_servicos_pagamentos'
      || config.centralServicosRecursosTable !== 'central_servicos_recursos') {
    throw new Error('A migração de repasses exige os nomes padrão das tabelas de Faturamentos, Pagamentos e Recursos.')
  }
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new Error('ID do faturamento inválido.')
  const isRead = rows === undefined && !confirm
  const { data, error } = await config.client.rpc(
    isRead ? 'central_servicos_listar_repasses' : 'central_servicos_salvar_repasses',
    {
      p_faturamento_id: invoiceId,
      ...(!isRead ? { p_repasses: rows === undefined ? null : parseInvoiceRepasses(rows), p_confirmar: confirm } : {}),
    },
  )
  if (error) {
    const migrationHint = ['PGRST202', '42P01', '42703'].includes(error.code)
      ? ' Verifique a migração supabase-faturamento-repasses.sql.'
      : ''
    throw new Error(`Falha nos repasses: ${error.message}.${migrationHint}`)
  }
  if (!Array.isArray(data)) throw new Error('Resposta inválida da operação de repasses.')
  return data
}
