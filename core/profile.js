// dsh-quick-provider - core profile building and validation.
//
// Pure functions over plain data: turn one preset, or one hand-edited form,
// into the exact `llm-pi-ai` provider profile the official adapter accepts,
// and refuse drafts it would refuse later.
//
// The rules below mirror the adapter's own resolution rather than restating a
// doc: a route key is a dict key, an endpoint is an http(s) root without
// credentials/query/fragment, a model id is a non-empty string, and a declared
// reasoning level other than `off` needs a non-empty wire value. Getting one of
// these wrong means the user's first request fails with an error three layers
// deep, so the fence belongs here.

import { OPENAI_COMPAT, SUPPORTED_APIS, findPreset } from './providers.js'

/** Route keys the official loader and this panel agree on. */
export const ROUTE_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

/**
 * The compat switches each wire protocol actually takes.
 *
 * This table is a write fence, not documentation. The adapter fails an entire
 * route when a *model* carries a switch its protocol does not take, e.g.
 * `supportsTemperature` (an anthropic-messages switch) on an
 * openai-completions route serving a Claude model. An OpenAI-compatible gateway
 * fronting Claude must not inherit it just because the model is a Claude.
 */
export const OFFERED_COMPAT = {
  'openai-completions': [
    'supportsStore',
    'supportsDeveloperRole',
    'supportsReasoningEffort',
    'supportsUsageInStreaming',
    'supportsFinishReason',
    'maxTokensField',
    'requiresToolResultName',
    'requiresAssistantAfterToolResult',
    'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages',
    'thinkingFormat',
    'chatTemplateKwargs',
    'chatTemplateArgs',
    'supportsThinkingTokenBudget',
    'thinkingTokenBudgetField',
    'vllmPriority',
    'supportsStrictMode',
    'cacheControlFormat',
    'supportsLongCacheRetention',
  ],
  'anthropic-messages': [
    'supportsEagerToolInputStreaming',
    'supportsLongCacheRetention',
    'supportsCacheControlOnTools',
    'supportsTemperature',
    'forceAdaptiveThinking',
    'allowEmptySignature',
    'supportsStrictTools',
  ],
  'openai-responses': [
    'supportsDeveloperRole',
    'supportsMaxOutputTokens',
    'supportsStrictMode',
    'supportsLongCacheRetention',
  ],
}

/** The compat fields one protocol takes; empty for a protocol with no compat. */
export function offeredCompat(api) {
  return OFFERED_COMPAT[api] ?? []
}

/**
 * Drop every switch the protocol does not take.
 * @param api - the route's wire protocol.
 * @param compat - switches from a preset or a caller.
 * @returns the surviving switches, or undefined when none does.
 */
export function filterCompat(api, compat) {
  if (compat === undefined || compat === null || typeof compat !== 'object' || Array.isArray(compat)) return undefined
  // A protocol this table does not describe is left alone: guessing there would
  // strip switches the adapter may well take.
  if (OFFERED_COMPAT[api] === undefined) return Object.keys(compat).length === 0 ? undefined : { ...compat }
  const offered = offeredCompat(api)
  const kept = Object.entries(compat).filter(([field]) => offered.includes(field))
  return kept.length === 0 ? undefined : Object.fromEntries(kept)
}

/** Whether a string is a usable route key. */
export function isRouteKey(value) {
  return typeof value === 'string' && ROUTE_RE.test(value)
}

/**
 * Validate one http(s) base URL the way the adapter does.
 * @param value - candidate endpoint root.
 * @returns an error message, or undefined when acceptable.
 */
export function baseUrlError(value) {
  if (typeof value !== 'string' || value.trim() === '') return '接口地址不能为空'
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return '接口地址不是合法 URL'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '接口地址必须是 http(s)'
  if (url.username || url.password) return '接口地址不能带账号密码'
  if (url.search || url.hash) return '接口地址不能带查询参数或片段'
  return undefined
}

/**
 * Normalize a base URL: trim, drop trailing slashes.
 *
 * Trailing slashes are the single most common paste error - `.../v1/` plus the
 * adapter's own `/chat/completions` yields a double slash that some gateways
 * 404 on - so they are removed rather than rejected.
 */
export function normalizeBaseURL(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

/**
 * Validate a reasoning-efforts dict the way the adapter resolves it.
 * @returns an error message, or undefined when acceptable.
 */
export function effortsError(efforts) {
  if (efforts === undefined || efforts === false) return undefined
  if (efforts === null || typeof efforts !== 'object' || Array.isArray(efforts)) {
    return '思考级别必须是「级别 → 传输值」的对象'
  }
  for (const [level, wire] of Object.entries(efforts)) {
    if (level.trim() === '') return '思考级别的名字不能为空'
    // `off` is the one level allowed to carry null: "no thinking" has no wire
    // spelling to send.
    if (wire === null && level === 'off') continue
    if (typeof wire !== 'string' || wire.trim() === '') {
      return `思考级别「${level}」需要非空的传输值（只有 off 可以是 null）`
    }
  }
  return undefined
}

/** Validate one model entry; returns an error message or undefined. */
export function modelError(model) {
  if (model === null || typeof model !== 'object' || Array.isArray(model)) return '模型条目必须是对象'
  if (typeof model.id !== 'string' || model.id.trim() === '') return '模型 ID 不能为空'
  if (model.contextWindow !== undefined && !(Number.isInteger(model.contextWindow) && model.contextWindow > 0)) {
    return `模型「${model.id}」的上下文窗口必须是大于 0 的整数`
  }
  if (model.maxTokens !== undefined && !(Number.isInteger(model.maxTokens) && model.maxTokens > 0)) {
    return `模型「${model.id}」的输出上限必须是大于 0 的整数`
  }
  if (model.input !== undefined && (!Array.isArray(model.input) || model.input.some((m) => m !== 'text' && m !== 'image'))) {
    return `模型「${model.id}」的输入模态只能是 text / image`
  }
  return effortsError(model.reasoningEfforts)
}

/**
 * Strip a model entry down to the fields the adapter schema knows, so an extra
 * key from a hand-edited form cannot fail validation upstream.
 */
function cleanModel(model) {
  const next = { id: String(model.id).trim() }
  if (typeof model.name === 'string' && model.name.trim() !== '') next.name = model.name.trim()
  if (Number.isInteger(model.contextWindow) && model.contextWindow > 0) next.contextWindow = model.contextWindow
  if (Number.isInteger(model.maxTokens) && model.maxTokens > 0) next.maxTokens = model.maxTokens
  if (Array.isArray(model.input) && model.input.length > 0) next.input = [...new Set(model.input)]
  if (model.reasoningEfforts !== undefined && model.reasoningEfforts !== false) {
    next.reasoningEfforts = { ...model.reasoningEfforts }
  }
  return next
}

/**
 * Derive the credential reference for a custom provider.
 *
 * The reference has to be a name a `.credentials.yaml` can hold: uppercase
 * snake case ending in `_API_KEY`. Deriving it from the route id keeps one
 * provider from silently overwriting another's key.
 */
export function customEnvName(routeId) {
  const stem = String(routeId ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${stem || 'CUSTOM'}_API_KEY`
}

/**
 * Build one `llm-pi-ai` provider profile from a draft.
 *
 * The draft is what the panel submits:
 *   { route, presetId?, baseURL, api, models[], compat?, headers? }
 *
 * @returns the profile object to write at `providers.<route>`.
 * @throws Error with a user-facing message when the draft cannot be served.
 */
export function buildProfile(draft) {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('配置草稿必须是对象')

  const preset = draft.presetId !== undefined && draft.presetId !== '' ? findPreset(draft.presetId) : undefined

  // A preset route keeps the id the catalog declared, so "which preset is this"
  // stays answerable after the user renames the display label.
  const route = String(draft.route ?? preset?.id ?? '').trim()
  if (!isRouteKey(route)) {
    throw new Error('路由 ID 只能用小写字母、数字与连字符，且以字母或数字开头（最长 63 字符）')
  }

  const api = String(draft.api ?? preset?.api ?? 'openai-completions').trim()
  if (!SUPPORTED_APIS.includes(api)) {
    throw new Error(`不支持的接口协议「${api}」；可选：${SUPPORTED_APIS.join(' / ')}`)
  }

  const baseURLErr = baseUrlError(draft.baseURL ?? preset?.baseURL)
  if (baseURLErr !== undefined) throw new Error(baseURLErr)
  const baseURL = normalizeBaseURL(draft.baseURL ?? preset?.baseURL)

  const apiKeyEnv = String(draft.apiKeyEnv ?? preset?.env ?? customEnvName(route)).trim()
  if (apiKeyEnv === '' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    throw new Error(`凭据引用「${apiKeyEnv}」不是合法的变量名`)
  }

  const rawModels = Array.isArray(draft.models) ? draft.models : (preset?.models ?? [])
  if (rawModels.length === 0) throw new Error('至少需要选择一个模型')

  const seen = new Set()
  const models = []
  for (const raw of rawModels) {
    const err = modelError(raw)
    if (err !== undefined) throw new Error(err)
    const model = cleanModel(raw)
    // A duplicated id would make the picker show one entry and the adapter
    // resolve another; keep the first and drop the rest.
    if (seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
  }
  if (models.length === 0) throw new Error('至少需要选择一个模型')

  const profile = {
    displayName: String(draft.displayName ?? preset?.name ?? route).trim() || route,
    api,
    baseURL,
    apiKeyEnv,
    models,
  }

  // Route-level compat: the draft's switches win, then the preset's, then the
  // safe OpenAI-compatible defaults. Every layer is filtered by protocol so a
  // switch the route cannot take never reaches the adapter.
  const merged = { ...(preset?.compat ?? {}), ...(draft.compat ?? {}) }
  if (api === 'openai-completions' && Object.keys(merged).length === 0) {
    Object.assign(merged, OPENAI_COMPAT)
  }
  const compat = filterCompat(api, merged)
  if (compat !== undefined) profile.compat = compat

  if (draft.headers !== undefined && typeof draft.headers === 'object' && !Array.isArray(draft.headers)) {
    const headers = Object.fromEntries(
      Object.entries(draft.headers)
        .filter(([name, value]) => typeof name === 'string' && name !== '' && typeof value === 'string')
        .map(([name, value]) => [name, value]),
    )
    if (Object.keys(headers).length > 0) profile.headers = headers
  }

  return profile
}

/**
 * Validate a profile read back from settings, without rebuilding it.
 *
 * `buildProfile` is the write path; this is the read path, used to decide
 * whether a stored route is still serviceable before offering it in the panel.
 * It checks shape only, never intent: a route someone shaped by hand stays
 * theirs.
 * @returns an error message, or undefined when the profile is serviceable.
 */
export function profileError(profile) {
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return '配置必须是对象'
  if (typeof profile.baseURL !== 'string') return '缺少接口地址'
  const baseErr = baseUrlError(profile.baseURL)
  if (baseErr !== undefined) return baseErr
  if (profile.api !== undefined && !SUPPORTED_APIS.includes(profile.api)) return `不支持的协议「${profile.api}」`
  if (!Array.isArray(profile.models) || profile.models.length === 0) return '没有可用模型'
  for (const model of profile.models) {
    const err = modelError(model)
    if (err !== undefined) return err
  }
  return undefined
}

/**
 * Repair one already-stored profile: drop compat switches its protocol does not
 * take, at both the route and model level, and change nothing else.
 *
 * This is the heal path, not the write path. A profile written by an older
 * version (or edited by hand) can carry a model-level switch the adapter
 * refuses - and because that refusal is fatal for the whole route, the route
 * never appears in the picker and no later repair can reach it. Nothing here
 * reorders models, trims ids, or touches credentials.
 * @returns the repaired profile, or the same reference when nothing is wrong.
 */
export function repairProfileCompat(profile) {
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return profile
  const api = profile.api
  if (typeof api !== 'string' || OFFERED_COMPAT[api] === undefined) return profile
  let changed = false
  const next = { ...profile }
  if (profile.compat !== undefined) {
    const compat = filterCompat(api, profile.compat)
    if (compat === undefined) {
      delete next.compat
      changed = true
    } else if (Object.keys(compat).length !== Object.keys(profile.compat).length) {
      next.compat = compat
      changed = true
    }
  }
  if (Array.isArray(profile.models)) {
    next.models = profile.models.map((model) => {
      if (model === null || typeof model !== 'object' || Array.isArray(model) || model.compat === undefined) return model
      const compat = filterCompat(api, model.compat)
      if (compat === undefined) {
        const { compat: _dropped, ...rest } = model
        changed = true
        return rest
      }
      if (Object.keys(compat).length !== Object.keys(model.compat).length) {
        changed = true
        return { ...model, compat }
      }
      return model
    })
  }
  return changed ? next : profile
}
