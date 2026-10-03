import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

async function harness() {
  const source = await readFile(new URL('../src/lib/confirmDialog.tsx', import.meta.url), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  const hosts = []
  const renders = []
  let effect
  let restored = 0
  let modalOpened = 0
  const dialog = { open: false, showModal() { this.open = true; modalOpened++ }, close() { this.open = false } }
  const previousFocus = { isConnected: true, focus() { restored++ } }
  const exports = {}
  const componentExports = {}
  const context = vm.createContext({
    exports, Error, queueMicrotask,
    HTMLElement: Object,
    document: {
      activeElement: previousFocus,
      createElement: () => {
        const host = { remove() { hosts.splice(hosts.indexOf(host), 1) } }
        return host
      },
      body: { appendChild(host) { hosts.push(host) } },
    },
    require: (name) => {
      if (name === '../components/ConfirmationDialog') return componentExports
      if (name === 'react') return {
        ...React,
        useRef: () => ({ current: dialog }),
        useEffect: (fn) => { effect = fn },
      }
      if (name === 'react-dom') return { flushSync: (fn) => fn() }
      if (name === 'react-dom/client') return {
        createRoot: () => ({
          render(element) {
            const tree = element.type(element.props)
            const cleanup = effect()
            renders.push({ tree, cleanup })
          },
          unmount() { renders.at(-1).cleanup?.() },
        }),
      }
      return require(name)
    },
  })
  const component = await readFile(new URL('../src/components/ConfirmationDialog.tsx', import.meta.url), 'utf8')
  context.exports = componentExports
  vm.runInContext(ts.transpileModule(component, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context)
  context.exports = exports
  vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context)
  assert.equal(typeof exports.confirmAction, 'function', 'shared application confirmation must exist')
  return { confirm: exports.confirmAction, hosts, renders, modalOpened: () => modalOpened, restored: () => restored }
}

function descendants(element) {
  return [element, ...React.Children.toArray(element.props?.children)
    .filter(React.isValidElement).flatMap(descendants)]
}

test('confirmation awaits user input, uses application buttons and cleans up after confirm', async () => {
  const h = await harness()
  let completed = false
  const promise = h.confirm('Excluir registro?').then((value) => { completed = true; return value })
  await Promise.resolve()
  assert.equal(completed, false)
  assert.equal(h.hosts.length, 1)
  assert.equal(h.modalOpened(), 1)
  const tree = h.renders[0].tree
  assert.equal(tree.type, 'dialog')
  assert.equal(tree.props.role, 'alertdialog')
  const elements = descendants(tree)
  const cancel = elements.find((e) => e.type === 'button' && e.props.children === 'Cancelar')
  assert.equal(cancel.props.autoFocus, true)
  const confirm = elements.find((e) => e.type === 'button' && e.props.children === 'Confirmar')
  assert.equal(confirm.props.className, 'button-primary')
  confirm.props.onClick()
  assert.equal(await promise, true)
  assert.equal(h.hosts.length, 0)
  assert.equal(h.restored(), 1)
})

test('cancel, native dismissal and Escape all decline without executing the action', async () => {
  for (const action of ['cancel', 'dismiss', 'escape']) {
    const h = await harness()
    const promise = h.confirm('Descartar?')
    const tree = h.renders[0].tree
    if (action === 'cancel') descendants(tree).find((e) => e.type === 'button' && e.props.children === 'Cancelar').props.onClick()
    else {
      let prevented = false
      if (action === 'dismiss') tree.props.onCancel({ preventDefault() { prevented = true } })
      else {
        assert.equal(typeof tree.props.onKeyDown, 'function', 'Escape must also work in embedded browsers')
        tree.props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true } })
      }
      assert.equal(prevented, true)
    }
    assert.equal(await promise, false)
    assert.equal(h.hosts.length, 0)
  }
})

test('simultaneous requests are shown sequentially and resolve only once', async () => {
  const h = await harness()
  const first = h.confirm('Primeira')
  const second = h.confirm('Segunda')
  assert.equal(h.hosts.length, 1)
  const firstButton = descendants(h.renders[0].tree).find((e) => e.type === 'button' && e.props.children === 'Confirmar')
  firstButton.props.onClick()
  firstButton.props.onClick()
  assert.equal(await first, true)
  assert.equal(h.hosts.length, 1)
  assert.equal(h.renders.length, 2)
  h.renders[1].tree.props.onCancel({ preventDefault() {} })
  assert.equal(await second, false)
  assert.equal(h.hosts.length, 0)
})

test('every former browser confirmation awaits the shared application modal', async () => {
  const files = (await readdir(new URL('../src/components/', import.meta.url))).filter((file) => file.endsWith('.tsx'))
  let count = 0
  for (const file of files) {
    const source = await readFile(new URL(`../src/components/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /window\.confirm\s*\(/, `${file} still uses browser confirmation`)
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 'confirmAction') {
        count++
        assert.equal(ts.isAwaitExpression(node.parent), true, `${file}: confirmation must be awaited`)
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  assert.equal(count, 18)
})
