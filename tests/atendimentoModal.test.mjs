import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/components/AtendimentoReportsTool.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('AtendimentoReportsTool.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function extract(name) {
  let found
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(tree)
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = `const ${node.getText(tree)}`
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(found, `${name} must exist`)
  return ts.transpileModule(`${found}; globalThis.subject = ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
}

test('completion date guidance is a tooltip on the date input, not visible helper text', () => {
  let input
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'input'
        && node.attributes.properties.some((attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'value'
          && attribute.initializer?.getText(tree) === '{form.dataConclusao}')) {
      input = node
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(input)
  const title = input.attributes.properties.find((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'title')
  assert.equal(title?.initializer?.text, 'Se vazia ao concluir, será preenchida com a data da conclusão.')
  assert.doesNotMatch(source, /<span[^>]*>Se vazia ao concluir, será preenchida com a data da conclusão\.<\/span>/)
})

test('modal offers precisely the ten requested types as select options while preserving legacy selection', () => {
  const context = vm.createContext({})
  vm.runInContext(extract('TYPE_OPTIONS'), context)
  assert.deepEqual(Array.from(context.subject), [
    'Desenvolvimento', 'Sustentação / Suporte', 'Análise / Diagnóstico', 'Reunião',
    'Testes / Homologação', 'Documentação', 'Proposta / Estimativa',
    'Implantação / Deploy', 'Treinamento', 'Outros',
  ])
  assert.match(source, /<select\s+value=\{form\.tipo\}/)
  assert.match(source, /!TYPE_OPTIONS\.includes\(form\.tipo\)/)
})

test('response normalization and edit form preserve both dates', () => {
  const context = vm.createContext({ normalizeStatus: (status) => status })
  vm.runInContext(extract('normalizeAtendimentoResponse'), context)
  const row = context.subject({ id: 1, dataPrevista: '2026-11-10', dataConclusao: '2026-11-03' })
  assert.equal(row.dataPrevista, '2026-11-10')
  assert.equal(row.dataConclusao, '2026-11-03')
  const state = {}
  const noop = () => {}
  Object.assign(context, {
    setEditingId: noop, setForm: (form) => { state.form = form },
    setFormVersion: noop, setError: noop, setSuccess: noop, setIsModalOpen: noop,
    setEditorTab: noop, normalizeDateInput: (value) => value,
  })
  vm.runInContext(extract('openEdit'), context)
  context.subject(row)
  assert.equal(state.form.dataPrevista, row.dataPrevista)
  assert.equal(state.form.dataConclusao, row.dataConclusao)
})

test('submit includes optional dates and session headers and uses database-generated completion date', async () => {
  let request
  let saved
  const noop = () => {}
  const context = vm.createContext({
    isSaving: false, editingId: null, form: { data: '2026-11-03', dataPrevista: '2026-11-05', dataConclusao: '', status: 'done' },
    userHeaders: { 'x-user': 'editor', 'x-user-display': 'Editor' },
    setError: noop, setSuccess: noop, setIsSaving: noop, closeModal: noop,
    normalizeDateInput: (date) => date,
    normalizeAtendimentoResponse: (item) => item,
    apiUrl: (url) => url,
    setItems: (update) => { saved = update([])[0] },
    fetch: async (url, init) => {
      request = { url, ...init }
      return { ok: true, json: async () => ({ item: { id: 1, dataConclusao: '2026-11-03' } }) }
    },
  })
  vm.runInContext(extract('handleSubmit'), context)
  await context.subject({ preventDefault: noop })
  assert.equal(request.headers['x-user'], 'editor')
  assert.equal(JSON.parse(request.body).dataPrevista, '2026-11-05')
  assert.equal(JSON.parse(request.body).dataConclusao, '')
  assert.equal(saved.dataConclusao, '2026-11-03')
})

test('spreadsheet exports planned and completion dates and modal contains read-only history tab', async () => {
  let workbook
  const context = vm.createContext({
    items: [{ data: '2026-11-03', dataPrevista: '2026-11-05', dataConclusao: '2026-11-04', descricao: '', status: 'done' }],
    exportFilters: { clientes: [], status: [], dataDe: '', dataAte: '' },
    toDisplayDate: (date) => date,
    stripHtml: (text) => text,
    toStatusLabel: () => 'Concluído',
    exportBrandedWorkbook: async (input) => { workbook = input },
    setExportOpen: () => {},
  })
  vm.runInContext(extract('handleGenerateSpreadsheet'), context)
  await context.subject()
  assert.equal(workbook.sheets[0].rows[0]['Data Prevista'], '2026-11-05')
  assert.equal(workbook.sheets[0].rows[0]['Data Conclusão'], '2026-11-04')
  assert.ok(workbook.sheets[0].columns.some((column) => column.key === 'Data Prevista'))
  assert.ok(workbook.sheets[0].columns.some((column) => column.key === 'Data Conclusão'))
  assert.match(source, /role="tab"[^>]*[\s\S]*Histórico/)
  assert.match(source, /AtendimentoHistoryTab/)
})
