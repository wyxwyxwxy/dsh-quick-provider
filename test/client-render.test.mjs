// Client-half smoke test: drive the bundle through the client-modules protocol
// with a stub React, and assert that apply() actually registers a settings
// section into the slot the settings page dispatches.
//
// This catches the failure mode that is invisible at runtime: a bundle that
// parses, loads, and registers nothing (wrong slot name, wrong register shape),
// leaving a settings page with no section and no error anywhere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = join(here, '..', 'lib', 'client.js')

/** Minimal React stand-in: enough for a bundle that calls createElement/fragment. */
function makeReact() {
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    Fragment: Symbol('Fragment'),
    useState(initial) {
      // A test render never re-renders; returning the initial value is enough
      // to prove the component tree builds.
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useCallback(fn) {
      return fn
    },
    useRef(value) {
      return { current: value }
    },
    useMemo(fn) {
      return fn()
    },
  }
  return React
}

/**
 * Load the bundle the way the client module system does: install a
 * `window.__ModuleLoader__` that captures the factory, then evaluate the file.
 */
function loadBundle() {
  let captured
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry
      },
    },
    navigator: { language: 'zh-CN' },
    confirm: () => true,
  }
  // The bundle reaches for `document` only inside ensureStyles, which a render
  // test does not execute; a stub keeps the module top level safe regardless.
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ set textContent(v) {}, id: '' }),
    head: { appendChild() {} },
  }

  const source = readFileSync(CLIENT_PATH, 'utf8')
  // The bundle is a classic script, not an ES module: evaluate it with `vm`-free
  // indirect eval so it runs in this realm against the stubbed window.
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', 'fetch', source)(
    globalThis.window,
    globalThis.document,
    globalThis.window.navigator,
    globalThis.fetch,
  )

  assert.ok(captured !== undefined, 'the bundle must call window.__ModuleLoader__.load')
  assert.equal(captured.id, 'dsh-quick-provider')

  const React = makeReact()
  const exportsObj = captured.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require(${name})`)
  })
  return { exports: exportsObj, React }
}

test('bundle registers through the client-modules protocol', () => {
  const { exports } = loadBundle()
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots'])
})

test('apply registers one settings.section with a label and a component', () => {
  const { exports, React } = loadBundle()

  const registrations = []
  const slots = {
    inject(name, fn) {
      assert.equal(name, 'settings.section', 'the section must attach to settings.section')
      fn()
    },
    register(spec, component) {
      registrations.push({ spec, component })
    },
  }
  const ctx = {
    get(name) {
      return name === 'slots' ? slots : undefined
    },
  }

  exports.apply(ctx)

  assert.equal(registrations.length, 1, 'exactly one section should register')
  const { spec, component } = registrations[0]
  assert.equal(spec.name, 'settings.section')
  assert.equal(spec.id, 'quick-provider')
  assert.equal(typeof spec.order, 'number')
  assert.equal(typeof spec.label, 'function')
  assert.equal(typeof component, 'function', 'register takes a component function')

  // The label resolves to the section's nav title, in the active locale.
  const label = spec.label()
  assert.equal(typeof label, 'string')
  assert.ok(label.length > 0, 'the section needs a visible nav label')
})

test('apply is a no-op when the slots service is absent', () => {
  const { exports } = loadBundle()
  // A deployment that never composed the settings UI must not throw.
  assert.doesNotThrow(() => exports.apply({ get: () => undefined }))
})

test('mergeModels keeps fetched ids, preserves known metadata, and dedupes', () => {
  const { exports } = loadBundle()
  const previous = [
    { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 131072, maxTokens: 8192, input: ['text'] },
  ]
  const fetched = [
    { id: 'deepseek-ai/DeepSeek-V3' },
    { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B' },
    { id: 'Qwen/Qwen3-235B-A22B' },
  ]
  const merged = exports.mergeModels(previous, fetched)

  assert.equal(merged.length, 2, 'duplicate fetched ids collapse')
  const v3 = merged.find((m) => m.id === 'deepseek-ai/DeepSeek-V3')
  assert.equal(v3.contextWindow, 131072, 'known metadata survives an endpoint that omits it')
  assert.deepEqual(v3.input, ['text'], 'input modalities survive')
  const qwen = merged.find((m) => m.id === 'Qwen/Qwen3-235B-A22B')
  assert.equal(qwen.name, 'Qwen3 235B')
  assert.deepEqual(qwen.input, ['text'], 'an unknown model defaults to text input')
})
