import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('../src/components/InvoiceRepassesTab.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText
const exports = {}
vm.runInNewContext(compiled, {
  exports,
  require: (name) => {
    if (name === '../lib/api') return { apiUrl: (url) => url }
    if (name === '../lib/confirmDialog') return { confirmAction: async () => false }
    return require(name)
  },
})

test('new invoice displays the repasse entry table and add-resource button', () => {
  const html = renderToStaticMarkup(React.createElement(exports.default, {
    invoiceId: null,
    readOnly: false,
    invoiceHasChanges: true,
    invoiceIsSaving: false,
    onDirtyChange: () => {},
    onBusyChange: () => {},
  }))
  assert.match(html, /Adicionar repasse/)
  assert.match(html, /<th>Recurso<\/th>/)
  assert.match(html, /Valor de repasse/)
})

test('view mode does not offer adding repasses', () => {
  const html = renderToStaticMarkup(React.createElement(exports.default, {
    invoiceId: 1,
    readOnly: true,
    invoiceHasChanges: false,
    invoiceIsSaving: false,
    onDirtyChange: () => {},
    onBusyChange: () => {},
  }))
  assert.doesNotMatch(html, /Adicionar repasse/)
})
