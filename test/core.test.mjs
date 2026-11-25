// Unit tests for the core: the catalog and the profile builder.
//
// These are the parts a user never sees and everything depends on. A preset
// with a bad endpoint or an illegal route id is not a cosmetic bug - it becomes
// a route the adapter refuses, on the user's first click.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  GROUPS,
  PRESET_IDS,
  PRESETS,
  SUPPORTED_APIS,
  findPreset,
  orderedPresets,
} from '../core/providers.js'
import {
  OFFERED_COMPAT,
  baseUrlError,
  buildProfile,
  customEnvName,
  effortsError,
  filterCompat,
  isRouteKey,
  modelError,
  normalizeBaseURL,
  profileError,
  repairProfileCompat,
} from '../core/profile.js'

// --- the catalog -------------------------------------------------------------

test('every preset declares the fields the panel and the profile need', () => {
  for (const preset of PRESETS) {
    assert.ok(typeof preset.id === 'string' && preset.id.length > 0, `${preset.id}: id`)
    assert.ok(isRouteKey(preset.id), `${preset.id}: id must be a legal route key`)
    assert.ok(typeof preset.name === 'string' && preset.name.length > 0, `${preset.id}: name`)
    assert.ok(typeof preset.env === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(preset.env), `${preset.id}: env`)
    assert.ok(SUPPORTED_APIS.includes(preset.api), `${preset.id}: api ${preset.api}`)
    assert.equal(baseUrlError(preset.baseURL), undefined, `${preset.id}: baseURL`)
    assert.ok(GROUPS.some((g) => g.id === preset.group), `${preset.id}: group ${preset.group}`)
    assert.ok(preset.docs.startsWith('https://'), `${preset.id}: docs url`)
    assert.ok(preset.keyUrl.startsWith('https://'), `${preset.id}: keyUrl`)
    assert.ok(Array.isArray(preset.models) && preset.models.length > 0, `${preset.id}: models`)
    for (const model of preset.models) {
      assert.equal(modelError(model), undefined, `${preset.id}/${model.id}: ${modelError(model)}`)
    }
  }
})

test('preset ids and credential refs are unique', () => {
  const ids = new Set()
  const envs = new Map()
  for (const preset of PRESETS) {
    assert.equal(ids.has(preset.id), false, `duplicate preset id ${preset.id}`)
    ids.add(preset.id)
    // Two presets sharing one env would make saving the second overwrite the
    // first's key - silently, and with a working-looking result.
    assert.equal(envs.has(preset.env), false, `duplicate credential ref ${preset.env} (${envs.get(preset.env)} and ${preset.id})`)
    envs.set(preset.env, preset.id)
  }
  assert.equal(ids.size, PRESET_IDS.length)
})

test('every preset can be built into a serviceable profile', () => {
  for (const preset of PRESETS) {
    const profile = buildProfile({ presetId: preset.id })
    assert.equal(profileError(profile), undefined, `${preset.id}: ${profileError(profile)}`)
    assert.equal(profile.apiKeyEnv, preset.env)
    assert.equal(profile.baseURL, normalizeBaseURL(preset.baseURL))
    assert.equal(profile.api, preset.api)
    assert.ok(profile.models.length > 0)
    // The key itself must never appear anywhere in the profile.
    assert.equal(JSON.stringify(profile).includes('sk-'), false, `${preset.id}: no key material in the profile`)
  }
})

test('the catalog covers the providers the request named and the usual suspects', () => {
  for (const id of ['siliconflow', 'deepseek', 'zhipu', 'dashscope', 'ark', 'moonshot', 'minimax', 'openrouter', 'openai', 'anthropic', 'gemini', 'ollama']) {
    assert.ok(findPreset(id) !== undefined, `missing preset ${id}`)
  }
})

test('orderedPresets groups the catalog in display order', () => {
  const ordered = orderedPresets()
  assert.equal(ordered.length, PRESETS.length)
  const groupIndex = new Map(GROUPS.map((g, i) => [g.id, i]))
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(
      groupIndex.get(ordered[i - 1].group) <= groupIndex.get(ordered[i].group),
      'groups must not interleave',
    )
  }
})

// --- url handling ------------------------------------------------------------

test('baseUrlError rejects what the adapter rejects', () => {
  assert.match(baseUrlError(''), /不能为空/)
  assert.match(baseUrlError('api.example.com/v1'), /不是合法 URL/)
  assert.match(baseUrlError('ftp://example.com'), /http/)
  assert.match(baseUrlError('https://user:pw@example.com/v1'), /账号密码/)
  assert.match(baseUrlError('https://example.com/v1?a=1'), /查询参数/)
  assert.equal(baseUrlError('https://api.example.com/v1'), undefined)
  assert.equal(baseUrlError('http://127.0.0.1:11434/v1'), undefined, 'local endpoints stay allowed')
})

test('normalizeBaseURL strips the trailing slash that breaks chat/completions', () => {
  assert.equal(normalizeBaseURL('https://api.example.com/v1/'), 'https://api.example.com/v1')
  assert.equal(normalizeBaseURL('https://api.example.com/v1///'), 'https://api.example.com/v1')
  assert.equal(normalizeBaseURL('  https://api.example.com/v1  '), 'https://api.example.com/v1')
  assert.equal(normalizeBaseURL('https://api.example.com/v1'), 'https://api.example.com/v1')
})

// --- route keys --------------------------------------------------------------

test('isRouteKey accepts what the loader accepts and nothing else', () => {
  assert.equal(isRouteKey('siliconflow'), true)
  assert.equal(isRouteKey('my-gw-2'), true)
  assert.equal(isRouteKey('a'), true)
  assert.equal(isRouteKey('My-GW'), false, 'uppercase is not a legal route key')
  assert.equal(isRouteKey('-gw'), false)
  assert.equal(isRouteKey('gw_1'), false)
  assert.equal(isRouteKey(''), false)
  assert.equal(isRouteKey('a'.repeat(64)), false, 'length cap')
})

test('customEnvName derives a storable credential reference', () => {
  assert.equal(customEnvName('my-gw'), 'MY_GW_API_KEY')
  assert.equal(customEnvName('My GW'), 'MY_GW_API_KEY')
  assert.equal(customEnvName(''), 'CUSTOM_API_KEY')
  assert.match(customEnvName('a.b.c'), /^A_B_C_API_KEY$/)
})

// --- reasoning efforts -------------------------------------------------------

test('effortsError mirrors the adapter rule that only off may be null', () => {
  assert.equal(effortsError(undefined), undefined)
  assert.equal(effortsError(false), undefined)
  assert.equal(effortsError({ off: null, low: 'low' }), undefined)
  assert.equal(effortsError({ low: 'low' }), undefined)
  assert.match(effortsError({ low: null }), /非空/)
  assert.match(effortsError({ low: '' }), /非空/)
  assert.match(effortsError(['low']), /对象/)
})

// --- compat fences -----------------------------------------------------------

test('filterCompat drops switches the protocol does not take', () => {
  // supportsTemperature belongs to anthropic-messages; an OpenAI-compatible
  // gateway fronting Claude must not inherit it.
  const filtered = filterCompat('openai-completions', { supportsTemperature: true, supportsStore: false })
  assert.deepEqual(filtered, { supportsStore: false })

  const anthropic = filterCompat('anthropic-messages', { supportsTemperature: true, supportsStore: false })
  assert.deepEqual(anthropic, { supportsTemperature: true })

  assert.equal(filterCompat('openai-completions', {}), undefined)
  assert.equal(filterCompat('openai-completions', { supportsTemperature: true }), undefined)
})

test('the compat table only names fields the adapter knows', () => {
  // A switch the adapter does not recognise fails the whole route, so the fence
  // table has to stay a subset of the adapter's vocabulary.
  for (const [api, fields] of Object.entries(OFFERED_COMPAT)) {
    assert.ok(SUPPORTED_APIS.includes(api), `${api} is a writable protocol`)
    assert.ok(fields.length > 0, `${api} should list its switches`)
    for (const field of fields) {
      assert.ok(typeof field === 'string' && field.length > 0)
    }
  }
})

// --- buildProfile ------------------------------------------------------------

test('buildProfile refuses drafts that would fail at request time', () => {
  assert.throws(() => buildProfile(null), /对象/)
  assert.throws(() => buildProfile({ presetId: 'siliconflow', models: [] }), /至少需要选择一个模型/)
  assert.throws(() => buildProfile({ route: 'Bad Route', baseURL: 'https://x.test/v1', models: [{ id: 'm' }] }), /路由 ID/)
  assert.throws(() => buildProfile({ route: 'ok', api: 'bogus', baseURL: 'https://x.test/v1', models: [{ id: 'm' }] }), /不支持的接口协议/)
  assert.throws(() => buildProfile({ route: 'ok', baseURL: 'nope', models: [{ id: 'm' }] }), /不是合法 URL/)
  assert.throws(() => buildProfile({ route: 'ok', baseURL: 'https://x.test/v1', models: [{ id: '' }] }), /模型 ID/)
})

test('buildProfile keeps the safe OpenAI-compatible defaults', () => {
  const profile = buildProfile({ presetId: 'siliconflow' })
  assert.equal(profile.compat.supportsDeveloperRole, false)
  assert.equal(profile.compat.maxTokensField, 'max_tokens')
  assert.equal(profile.compat.supportsStore, false)
})

test('buildProfile gives an anthropic route no stray OpenAI switches', () => {
  const profile = buildProfile({ presetId: 'anthropic' })
  assert.equal(profile.api, 'anthropic-messages')
  // The preset declares no compat; the OpenAI defaults must not leak in.
  assert.equal(profile.compat, undefined)
  assert.equal(profile.baseURL, 'https://api.anthropic.com')
})

test('buildProfile honours a hand-edited endpoint and protocol', () => {
  const profile = buildProfile({
    route: 'my-relay',
    displayName: 'My Relay',
    api: 'openai-completions',
    baseURL: 'https://relay.example.com/v1/',
    apiKeyEnv: 'MY_RELAY_KEY',
    models: [{ id: 'gpt-5', name: 'GPT-5', contextWindow: 200000, maxTokens: 32000, input: ['text', 'image'] }],
  })
  assert.equal(profile.baseURL, 'https://relay.example.com/v1', 'trailing slash removed')
  assert.equal(profile.apiKeyEnv, 'MY_RELAY_KEY')
  assert.equal(profile.displayName, 'My Relay')
  assert.equal(profile.models[0].contextWindow, 200000)
})

test('buildProfile dedupes models and drops unknown fields', () => {
  const profile = buildProfile({
    route: 'dedupe',
    baseURL: 'https://x.test/v1',
    models: [
      { id: 'm', name: 'M', bogusField: 'dropped' },
      { id: 'm', name: 'M again' },
      { id: 'n' },
    ],
  })
  assert.deepEqual(profile.models.map((m) => m.id), ['m', 'n'])
  assert.equal(Object.hasOwn(profile.models[0], 'bogusField'), false)
})

test('buildProfile carries a header map only when one is given', () => {
  const without = buildProfile({ presetId: 'siliconflow' })
  assert.equal(without.headers, undefined)
  const withHeaders = buildProfile({
    presetId: 'siliconflow',
    headers: { 'x-app': 'dsh', ignored: 42 },
  })
  assert.deepEqual(withHeaders.headers, { 'x-app': 'dsh' })
})

test('a saved profile never contains key material, whatever was submitted', () => {
  // The write path takes the key separately; a key smuggled into the draft must
  // not survive into the profile that lands in settings.
  const profile = buildProfile({
    presetId: 'siliconflow',
    apiKey: 'sk-should-not-be-here',
    displayName: 'SiliconFlow',
  })
  assert.equal(JSON.stringify(profile).includes('sk-should-not-be-here'), false)
  assert.equal(Object.hasOwn(profile, 'apiKey'), false)
})

// --- heal path ---------------------------------------------------------------

test('repairProfileCompat drops only the switches the protocol cannot take', () => {
  const stored = {
    displayName: 'Relay',
    api: 'openai-completions',
    baseURL: 'https://x.test/v1',
    apiKeyEnv: 'RELAY_KEY',
    compat: { supportsStore: false, supportsTemperature: true },
    models: [{ id: 'm', compat: { supportsTemperature: true }, name: 'M' }],
  }
  const repaired = repairProfileCompat(stored)

  assert.deepEqual(repaired.compat, { supportsStore: false })
  assert.equal(Object.hasOwn(repaired.models[0], 'compat'), false)
  // Everything else is untouched: a route someone shaped stays theirs.
  assert.equal(repaired.displayName, 'Relay')
  assert.equal(repaired.apiKeyEnv, 'RELAY_KEY')
  assert.equal(repaired.models[0].name, 'M')
  assert.deepEqual(repaired.models[0].id, 'm')
})

test('repairProfileCompat returns the same reference when nothing is wrong', () => {
  const clean = {
    api: 'openai-completions',
    baseURL: 'https://x.test/v1',
    apiKeyEnv: 'K',
    compat: { supportsStore: false },
    models: [{ id: 'm' }],
  }
  assert.equal(repairProfileCompat(clean), clean, 'no copy when there is nothing to fix')
})

test('repairProfileCompat leaves a protocol it does not describe alone', () => {
  const stored = { api: 'something-new', baseURL: 'https://x.test/v1', models: [{ id: 'm' }], compat: { whatever: true } }
  assert.equal(repairProfileCompat(stored), stored)
})

// --- profile validation ------------------------------------------------------

test('profileError reports the reason a stored route is unserviceable', () => {
  assert.match(profileError(null), /对象/)
  assert.match(profileError({ baseURL: 'nope', models: [{ id: 'm' }] }), /不是合法 URL/)
  assert.match(profileError({ baseURL: 'https://x.test/v1', models: [] }), /没有可用模型/)
  assert.match(profileError({ baseURL: 'https://x.test/v1', api: 'bogus', models: [{ id: 'm' }] }), /不支持的协议/)
  assert.match(profileError({ baseURL: 'https://x.test/v1', models: [{ id: 'm', contextWindow: -1 }] }), /上下文窗口/)
  assert.equal(profileError({ baseURL: 'https://x.test/v1', models: [{ id: 'm' }] }), undefined)
})

test('modelError bounds input modalities to what the adapter accepts', () => {
  assert.match(modelError({ id: 'm', input: ['audio'] }), /输入模态/)
  assert.equal(modelError({ id: 'm', input: ['text', 'image'] }), undefined)
  assert.match(modelError({ id: 'm', maxTokens: 0 }), /输出上限/)
})
