import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
async function setup(fetch) {
  const source = await readFile(new URL('../src/components/AtendimentoHistoryTab.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const states = []
  const effects = []
  let index = 0
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, fetch, AbortController, Date, Error,
    require: (name) => {
      if (name === 'react') return {
        ...React,
        useState: (initial) => {
          const key = index++
          if (!(key in states)) states[key] = initial
          return [states[key], (value) => { states[key] = typeof value === 'function' ? value(states[key]) : value }]
        },
        useEffect: (effect) => effects.push(effect),
      }
      if (name === '../lib/api') return { apiUrl: (url) => url }
      return require(name)
    },
  })
  const render = (id = 1) => {
    index = 0
    return renderToStaticMarkup(React.createElement(exports.default, {
      atendimentoId: id, currentUsername: 'editor', currentDisplayName: 'Editor teste',
    }))
  }
  return { render, effects }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('new atendimento history explains that it must be saved before any history request', async () => {
  let calls = 0
  const { render, effects } = await setup(async () => { calls++; throw new Error('Should not fetch') })
  assert.match(render(null), /Salve o atendimento/)
  effects[0]()
  await flush()
  assert.equal(calls, 0)
})

test('history loads actor, time and previous/new values without rendering rich text as HTML', async () => {
  let request
  const { render, effects } = await setup(async (url, init) => {
    request = { url, ...init }
    return { ok: true, json: async () => ({ items: [{
      id: 1, acao: 'alteracao', ocorridoEm: '2026-11-03T20:00:00Z', usuario: 'editor', usuarioNome: 'Editor teste',
      alteracoes: {
        status: { anterior: 'open', novo: 'done' },
        descricao: { anterior: '<p>Antigo</p>', novo: '<img src=x onerror=alert(1)>Novo' },
        data_conclusao: { anterior: null, novo: '2026-11-03' },
      },
    }] }) }
  })
  assert.match(render(), /Carregando histórico/)
  effects[0]()
  await flush()
  const html = render()
  assert.equal(request.url, '/api/central-servicos/atendimentos/1/historico')
  assert.equal(request.headers['x-user'], 'editor')
  assert.match(html, /Editor teste/)
  assert.match(html, /Concluído/)
  assert.match(html, /03\/11\/2026/)
  assert.match(html, /Antigo/)
  assert.match(html, /Novo/)
  assert.doesNotMatch(html, /<img|<input|<textarea|contenteditable/)
})

test('history failures are visible and offer retry instead of looking like empty success', async () => {
  const { render, effects } = await setup(async () => ({
    ok: false, statusText: 'Erro', json: async () => ({ error: 'Migração ausente' }),
  }))
  render()
  effects[0]()
  await flush()
  const html = render()
  assert.match(html, /Migração ausente/)
  assert.match(html, /Tentar novamente/)
  assert.doesNotMatch(html, /Nenhum histórico/)
})

test('closing history aborts loading and ignores a late response', async () => {
  let resolve
  let signal
  const { render, effects } = await setup((url, init) => {
    signal = init.signal
    return new Promise((done) => { resolve = done })
  })
  render()
  const cleanup = effects[0]()
  cleanup()
  assert.equal(signal.aborted, true)
  resolve({ ok: true, json: async () => ({ items: [] }) })
  await flush()
  assert.match(render(), /Carregando histórico/)
})
