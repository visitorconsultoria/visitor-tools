import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/components/CentralServicosTool.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('CentralServicosTool.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set([
  'handleSaveInvoice', 'normalizeInvoice', 'normalizeText', 'parseNullableDate',
  'parseNullableNumber', 'matchesPeriodFilter', 'toMonthKey', 'matchesInvoiceSearch',
])
const fragments = []
function collect(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) fragments.push(node.getText(tree))
  if (ts.isVariableDeclaration(node) && names.has(node.name.getText(tree))) fragments.push(`const ${node.getText(tree)};`)
  ts.forEachChild(node, collect)
}
collect(tree)
const compiled = ts.transpileModule(`${fragments.join('\n')}\nglobalThis.save = handleSaveInvoice;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

const emptyForm = {
  titulo: '', nota: '', emissao: '', referencia: '', previsaoPagamento: '', cliente: '',
  contrato: '', contratoId: '', descricao: '', quantidade: '', valor: '', status: 'Pendente',
  dataPagamento: '', faturamentoCorpoNota: '', faturamentoDocumentos: '',
  faturamentoPrazoEmissao: '', faturamentoDataVencimento: '', faturamentoCodigoServico: '',
}
const savedItem = {
  ...emptyForm, id: 101, contratoId: 10, titulo: 'Faturamento teste', cliente: 'Cliente teste',
  contrato: 'Contrato teste', valor: 150, quantidade: null,
  descricao: '<p>Descricao salva</p>', faturamentoCorpoNota: '<p>Corpo salvo</p>',
  faturamentoDocumentos: '<p>Documentos salvos</p>', faturamentoPrazoEmissao: '5 dias',
  faturamentoDataVencimento: '2026-11-10', faturamentoCodigoServico: '123',
}

function harness({ item = savedItem, periodField = 'emissao', search = '', editingId = null, dirty = false, status = 200 } = {}) {
  const state = {
    form: { ...emptyForm, ...(item ?? savedItem), contratoId: '10', valor: '150' },
    items: editingId ? [{ ...item, titulo: 'Titulo anterior' }] : [],
    editingId, search, period: { mode: 'mes', month: '2026-10' }, open: true, tab: 'dados',
  }
  const requests = []
  const invoiceState = { ...state }
  for (const key of ['items', 'form', 'editingId', 'search', 'isSaving', 'error', 'success']) {
    invoiceState[`set${key[0].toUpperCase()}${key.slice(1)}`] = (next) => {
      state[key] = typeof next === 'function' ? next(state[key]) : next
    }
  }
  const context = vm.createContext({
    Error,
    invoiceState, invoiceIsViewMode: false, invoiceRepassesBusy: false, invoiceRepassesDirty: dirty,
    invoicePeriod: state.period, invoicePeriodField: periodField,
    contractsForLinking: [{ id: 10, tipoContrato: 'Recorrente' }],
    EMPTY_INVOICE_FORM: emptyForm, INVOICE_STATUS_OPTIONS: ['Pendente', 'Faturado', 'Pago'],
    apiUrl: (path) => path,
    setInvoiceEditorOpen: (open) => { state.open = open },
    setInvoiceEditorTab: (tab) => { state.tab = tab },
    setInvoicePeriod: (next) => { state.period = typeof next === 'function' ? next(state.period) : next },
    fetch: async (path, options) => {
      requests.push({ path, ...options })
      return new Response(JSON.stringify(status === 200 ? { item } : { error: 'Falha de gravacao' }), { status })
    },
    readApiError: async (response) => { throw new Error((await response.json()).error) },
    loadCatalogItems: async () => { requests.push({ method: 'GET' }); return [] },
  })
  vm.runInContext(compiled, context)
  return { state, requests, save: () => context.save({ preventDefault() {} }) }
}

test('creating an invoice without emission reveals the returned record and preserves its details', async () => {
  const { state, requests, save } = harness()
  await save()
  assert.equal(state.period.mode, 'todos')
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].faturamentoCorpoNota, savedItem.faturamentoCorpoNota)
  assert.equal(state.items[0].faturamentoCodigoServico, savedItem.faturamentoCodigoServico)
  assert.equal(state.open, false)
  assert.equal(requests.length, 1, 'save must not depend on a second list request')
  const payload = JSON.parse(requests[0].body)
  assert.equal(payload.contrato_id, 10)
  assert.equal(payload.valor, 150)
  assert.equal(payload.descricao, savedItem.descricao)
  assert.equal(payload.faturamento_corpo_nota, savedItem.faturamentoCorpoNota)
  assert.equal(payload.faturamento_documentos, savedItem.faturamentoDocumentos)
  assert.equal(payload.faturamento_prazo_emissao, savedItem.faturamentoPrazoEmissao)
  assert.equal(payload.faturamento_data_vencimento, savedItem.faturamentoDataVencimento)
  assert.equal(payload.faturamento_codigo_servico, savedItem.faturamentoCodigoServico)
  assert.match(state.success, /filtro/i)
})

test('saving another emission month selects that month', async () => {
  const { state, save } = harness({ item: { ...savedItem, emissao: '2026-09-15' } })
  await save()
  assert.equal(state.period.mode, 'mes')
  assert.equal(state.period.month, '2026-09')
})

test('competence filter uses competence instead of emission after saving', async () => {
  const { state, save } = harness({ periodField: 'competencia', item: { ...savedItem, referencia: '2026-09', emissao: '2026-10-10' } })
  await save()
  assert.equal(state.period.month, '2026-09')
})

test('matching period and search are preserved', async () => {
  const { state, save } = harness({ search: 'cliente teste', item: { ...savedItem, emissao: '2026-10-10' } })
  await save()
  assert.equal(state.search, 'cliente teste')
  assert.equal(state.period.month, '2026-10')
  assert.equal(state.period.mode, 'mes')
})

test('search excluding the saved record is cleared', async () => {
  const { state, save } = harness({ search: 'outro cliente' })
  await save()
  assert.equal(state.search, '')
})

test('editing replaces the existing record without losing details or duplicating it', async () => {
  const { state, requests, save } = harness({ editingId: 101 })
  await save()
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].titulo, savedItem.titulo)
  assert.equal(state.items[0].faturamentoDocumentos, savedItem.faturamentoDocumentos)
  assert.equal(requests[0].method, 'PUT')
})

test('new invoice with repasses retains the draft and receives the saved ID', async () => {
  const { state, save } = harness({ dirty: true })
  await save()
  assert.equal(state.editingId, 101)
  assert.equal(state.open, true)
  assert.equal(state.tab, 'repasses')
  assert.equal(state.form.faturamentoCorpoNota, savedItem.faturamentoCorpoNota)
})

test('failed save keeps the form and filters and reports the error', async () => {
  const { state, save } = harness({ status: 500, search: 'outro cliente' })
  await save()
  assert.equal(state.open, true)
  assert.equal(state.form.titulo, savedItem.titulo)
  assert.equal(state.period.mode, 'mes')
  assert.equal(state.search, 'outro cliente')
  assert.equal(state.error, 'Falha de gravacao')
})

test('a successful HTTP response without a saved invoice does not close the form or report success', async () => {
  const { state, save } = harness({ item: null })
  await save()
  assert.equal(state.open, true)
  assert.equal(state.success, null)
  assert.match(state.error, /API.*faturamento/i)
})
