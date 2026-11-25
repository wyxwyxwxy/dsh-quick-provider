// dsh-quick-provider - host half.
//
// The whole plugin exists to collapse "add a third-party model provider" from
// a YAML-editing exercise into two fields: pick a provider, paste a key. Every
// write lands through DSH's own services, so this package never touches
// settings.yaml or .credentials.yaml directly:
//
//   * `credentials.set(profile.apiKeyEnv, key)` stores the key in the
//     credentials service - the same reference a hand-written profile uses;
//   * `settings.mutate('llm-pi-ai', [set providers.<route>], revision)` writes
//     the user layer of the official pi-ai namespace, which validates the
//     profile and re-registers the route live: no restart, no YAML editing;
//   * `llm.registerModelDiscovery(ns)` lets the panel ask an endpoint which
//     models it serves, so the model list is read rather than guessed.
//
// The adapter being fed is `@deepseek-ai/dsh-llm-pi-ai`. This plugin does not
// implement a wire protocol and does not re-implement an adapter; it is a
// catalog plus a form, and it stays useful across adapter upgrades because of
// that.
//
// The panel is a browser half that talks to a handful of loopback-only JSON
// routes. Every route is fenced by the same guard: loopback socket, loopback
// Host header, and (when the browser sends one) a same-origin Origin. The
// routes carry API keys, so this fence is not optional.

import { GROUPS, PRESETS, PRESET_IDS, findPreset, orderedPresets } from './core/providers.js'
import {
  buildProfile,
  customEnvName,
  isRouteKey,
  normalizeBaseURL,
  profileError,
  repairProfileCompat,
} from './core/profile.js'

/** The official pi-ai settings namespace this plugin writes into. */
const PI_AI_NS = 'llm-pi-ai'
/** Route prefix for this plugin's own JSON surface. */
const ROUTE_PREFIX = '/dsh-quick-provider'
/** Settings namespace this plugin registers for its own (tiny) state. */
const NS = 'dsh-quick-provider'

/** Hard ceiling on one model-list probe: a silent endpoint must not hang a form. */
const DISCOVERY_TIMEOUT_MS = 20_000
/** How long a model-list answer is reused before asking again. */
const DISCOVERY_TTL_MS = 5 * 60 * 1000

// --- http helpers ------------------------------------------------------------

function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.')
}

function isLocalHostHeader(host) {
  if (typeof host !== 'string' || host.length === 0) return false
  const name = host.split(':')[0].replace(/^\[|\]$/g, '').toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // This surface hands out key-presence facts; never let a cache keep them.
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1e6) req.destroy()
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
}

/**
 * Credential-adjacent surface fence: loopback socket, loopback Host header, and
 * a same-origin check when the browser sends Origin.
 */
function guard(req, res) {
  if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) {
    sendJson(res, 403, { ok: false, code: 'forbidden', error: 'loopback only' })
    return false
  }
  const host = req.headers.host
  if (!isLocalHostHeader(host)) {
    sendJson(res, 403, { ok: false, code: 'forbidden', error: 'unexpected host' })
    return false
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0) {
    let originHost = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    if (originHost !== host) {
      sendJson(res, 403, { ok: false, code: 'forbidden', error: 'cross-origin request' })
      return false
    }
  }
  return true
}

/** An error carrying the HTTP status and machine code a route should answer with. */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

// --- service access ----------------------------------------------------------

function services(ctx) {
  return {
    settings: ctx.get('settings'),
    credentials: ctx.get('credentials'),
    llm: ctx.get('llm'),
  }
}

/** The `llm-pi-ai` settings descriptor, or undefined before it registers. */
function piAiDescriptor(settings) {
  if (!settings || typeof settings.describe !== 'function') return undefined
  let described
  try {
    described = settings.describe()
  } catch {
    return undefined
  }
  // `describe()` returns the descriptor array itself; an older shape wrapped it
  // as `{ namespaces }`. Accept both rather than betting on one.
  const list = Array.isArray(described)
    ? described
    : (described && Array.isArray(described.namespaces) ? described.namespaces : [])
  return list.find((entry) => entry && entry.ns === PI_AI_NS)
}

/**
 * The user-layer `providers` dict of the official namespace.
 *
 * The user layer - not the resolved value - is what this plugin reads and
 * writes, because that is the layer a settings write actually lands in. Reading
 * the resolved value would report a route as configured when it only exists in
 * a composition default.
 */
function userProviders(descriptor) {
  const user = descriptor && descriptor.user
  if (user === null || typeof user !== 'object') return {}
  const providers = user.providers
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) return {}
  return providers
}

/** Whether a settings write failed because another surface wrote first. */
function isConflict(error) {
  const code = error && (error.code || (error.cause && error.cause.code))
  return typeof code === 'string' && code.includes('conflict')
}

function messageOf(error) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

// --- model discovery ---------------------------------------------------------

/** Cache of discovered model lists, keyed by endpoint + protocol. */
const discoveryCache = new Map()

function cacheKey(baseURL, api) {
  return `${api}::${normalizeBaseURL(baseURL).toLowerCase()}`
}

/** Read one cached answer when it is still fresh. */
function cachedDiscovery(baseURL, api) {
  const hit = discoveryCache.get(cacheKey(baseURL, api))
  if (hit === undefined) return undefined
  if (Date.now() - hit.at > DISCOVERY_TTL_MS) {
    discoveryCache.delete(cacheKey(baseURL, api))
    return undefined
  }
  return hit.models
}

function storeDiscovery(baseURL, api, models) {
  discoveryCache.set(cacheKey(baseURL, api), { at: Date.now(), models })
}

/**
 * Normalize whatever a `/models` endpoint returned into `{id,name,...}` rows.
 *
 * Endpoints disagree: most return `{data:[{id}]}`, some return a bare array,
 * some wrap it as `{models:[...]}`, and Anthropic flattens `max_input_tokens`
 * into what everyone else calls a context window. All of it is folded here so
 * the panel sees one shape.
 */
function normalizeModelList(payload) {
  let rows
  if (Array.isArray(payload)) rows = payload
  else if (payload && Array.isArray(payload.data)) rows = payload.data
  else if (payload && Array.isArray(payload.models)) rows = payload.models
  else if (payload && payload.data && typeof payload.data === 'object') rows = Object.values(payload.data)
  else if (payload && payload.models && typeof payload.models === 'object') rows = Object.entries(payload.models).map(([id, v]) => ({ id, ...(v || {}) }))
  else return []

  const out = []
  const seen = new Set()
  for (const row of rows) {
    if (row === null || row === undefined) continue
    const id = typeof row === 'string'
      ? row
      : (typeof row.id === 'string' ? row.id : (typeof row.model === 'string' ? row.model : (typeof row.name === 'string' ? row.name : '')))
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    const entry = { id }
    if (typeof row === 'object') {
      const displayName = typeof row.display_name === 'string' ? row.display_name : (typeof row.displayName === 'string' ? row.displayName : (typeof row.name === 'string' && row.name !== id ? row.name : undefined))
      if (displayName !== undefined) entry.name = displayName
      const context = row.context_window ?? row.contextWindow ?? row.context_length ?? row.max_input_tokens ?? row.max_context_length
      if (Number.isInteger(context) && context > 0) entry.contextWindow = context
      const maxTokens = row.max_output_tokens ?? row.maxTokens ?? row.max_tokens ?? row.max_completion_tokens
      if (Number.isInteger(maxTokens) && maxTokens > 0) entry.maxTokens = maxTokens
    }
    out.push(entry)
  }
  return out
}

/**
 * Ask an endpoint which models it serves.
 *
 * Only `openai-completions` / `openai-responses` are probed over `GET /models`
 * with a bearer token; `anthropic-messages` uses its native header pair.
 * A 404 means "this gateway does not publish a list", which is a fact worth
 * reporting rather than an error worth throwing.
 */
async function fetchModelList({ baseURL, api, apiKey, signal }) {
  const base = normalizeBaseURL(baseURL)
  const headers = { accept: 'application/json' }
  let url
  if (api === 'anthropic-messages') {
    // Anthropic's list lives under /v1 regardless of the messages base.
    url = `${base.replace(/\/v1$/, '')}/v1/models?limit=1000`
    headers['anthropic-version'] = '2023-06-01'
    if (apiKey) headers['x-api-key'] = apiKey
  } else {
    url = `${base}/models`
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  if (signal !== undefined) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }

  let response
  try {
    response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
  } catch (error) {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', forwardAbort)
    if (controller.signal.aborted && !(signal && signal.aborted)) {
      throw new HttpError(504, 'discovery-timeout', `接口在 ${Math.round(DISCOVERY_TIMEOUT_MS / 1000)} 秒内没有响应`)
    }
    throw new HttpError(502, 'discovery-failed', `连接接口失败：${messageOf(error)}`)
  }
  clearTimeout(timer)
  if (signal !== undefined) signal.removeEventListener('abort', forwardAbort)

  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'bad-key', '接口拒绝了这把密钥（401/403），请确认 Key 与服务商是否匹配')
  }
  if (response.status === 404) {
    return { models: [], listed: false, note: '该接口没有公开模型列表，请手动填写模型 ID' }
  }
  if (!response.ok) {
    throw new HttpError(502, 'discovery-failed', `接口返回 HTTP ${response.status}`)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { models: [], listed: false, note: '接口返回的不是 JSON 模型列表，请手动填写模型 ID' }
  }
  const models = normalizeModelList(payload)
  return { models, listed: models.length > 0 }
}

// --- route payloads ----------------------------------------------------------

/** The catalog the panel renders: presets plus what is already configured. */
function catalogState(ctx) {
  const { settings, credentials } = services(ctx)
  const descriptor = piAiDescriptor(settings)
  const providers = userProviders(descriptor)

  const configured = []
  for (const [route, profile] of Object.entries(providers)) {
    const error = profileError(profile)
    configured.push({
      route,
      displayName: typeof profile?.displayName === 'string' ? profile.displayName : route,
      env: typeof profile?.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined,
      baseURL: typeof profile?.baseURL === 'string' ? profile.baseURL : undefined,
      api: typeof profile?.api === 'string' ? profile.api : undefined,
      models: Array.isArray(profile?.models) ? profile.models.length : 0,
      // A preset route is one this catalog declared; anything else is the
      // user's own, and the panel leaves those alone.
      presetId: PRESET_IDS.includes(route) ? route : undefined,
      error,
    })
  }

  return {
    presets: orderedPresets(),
    groups: GROUPS,
    configured: configured.sort((a, b) => a.route.localeCompare(b.route)),
    piAiReady: descriptor !== undefined,
    revision: descriptor !== undefined && typeof descriptor.revision === 'number' ? descriptor.revision : undefined,
    hasCredentials: credentials !== undefined,
  }
}

/**
 * Key-presence facts for one or more credential references.
 *
 * The panel needs to know whether a key exists so it can show "已保存" instead
 * of making the user hunt for it. It must never learn the value: only the
 * boolean survives this function.
 */
async function credentialFacts(ctx, refs) {
  const { credentials } = services(ctx)
  const out = {}
  for (const ref of refs) {
    if (typeof ref !== 'string' || ref === '') continue
    let configured = false
    if (credentials && typeof credentials.describe === 'function') {
      try {
        const described = await credentials.describe(ref)
        configured = Boolean(described && described.configured)
      } catch {
        configured = false
      }
    }
    out[ref] = { configured }
  }
  return out
}

/**
 * Add or replace one provider route.
 *
 * Order matters: the key is written first so a failed key write never leaves a
 * route pointing at a credential that does not exist. A route write that then
 * fails is reported, and the key stays stored - harmless, and exactly what the
 * user would have to do again anyway.
 */
async function applyRoute(ctx, body) {
  const { settings, credentials } = services(ctx)
  if (!settings) throw new HttpError(503, 'service-missing', 'DSH 设置服务不可用')
  if (!credentials) throw new HttpError(503, 'service-missing', 'DSH 凭据服务不可用')

  const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const presetId = typeof body.presetId === 'string' && body.presetId !== '' ? body.presetId : undefined
  const preset = presetId !== undefined ? findPreset(presetId) : undefined

  let route
  let profile
  try {
    route = String(body.route ?? presetId ?? '').trim()
    profile = buildProfile({
      route,
      presetId,
      displayName: body.displayName,
      api: body.api,
      baseURL: body.baseURL,
      apiKeyEnv: body.apiKeyEnv,
      models: body.models,
      compat: body.compat,
      headers: body.headers,
    })
  } catch (error) {
    throw new HttpError(400, 'invalid-draft', messageOf(error))
  }

  const descriptor = piAiDescriptor(settings)
  if (!descriptor) {
    throw new HttpError(503, 'namespace-missing', 'llm-pi-ai 设置命名空间尚未注册（DSH 版本可能不匹配）')
  }

  // An empty key is allowed when the reference already resolves - from the
  // environment, the credentials store, or another route. The profile then
  // simply points at the existing ref.
  if (key === '') {
    const facts = await credentialFacts(ctx, [profile.apiKeyEnv])
    if (!facts[profile.apiKeyEnv]?.configured) {
      throw new HttpError(400, 'key-required', `请填写 API Key（${profile.apiKeyEnv} 还没有保存过密钥）`)
    }
  } else {
    try {
      if (typeof credentials.set !== 'function') throw new Error('凭据服务不支持写入')
      await credentials.set(profile.apiKeyEnv, key)
    } catch (error) {
      throw new HttpError(
        409,
        'credential-not-writable',
        `无法保存密钥到 ${profile.apiKeyEnv}：${messageOf(error)}。若这把 Key 来自环境变量，请留空输入框直接启用。`,
      )
    }
  }

  const current = piAiDescriptor(settings)
  try {
    await settings.mutate(PI_AI_NS, [{ op: 'set', path: ['providers', route], value: profile }], current.revision)
  } catch (error) {
    if (isConflict(error)) throw new HttpError(409, 'conflict', '设置刚被其他界面改过，请刷新后重试')
    throw new HttpError(500, 'write-failed', `写入 llm-pi-ai 失败：${messageOf(error)}`)
  }

  return { route, env: profile.apiKeyEnv, models: profile.models.length, displayName: profile.displayName }
}

/** Remove one route, optionally forgetting its key too. */
async function removeRoute(ctx, body) {
  const { settings, credentials } = services(ctx)
  if (!settings) throw new HttpError(503, 'service-missing', 'DSH 设置服务不可用')
  const route = typeof body.route === 'string' ? body.route.trim() : ''
  if (!isRouteKey(route)) throw new HttpError(400, 'invalid', '需要合法的 route')

  const descriptor = piAiDescriptor(settings)
  if (!descriptor) throw new HttpError(503, 'namespace-missing', 'llm-pi-ai 设置命名空间尚未注册')
  const providers = userProviders(descriptor)
  if (!Object.hasOwn(providers, route)) throw new HttpError(404, 'not-configured', `路由 ${route} 未配置`)
  const env = typeof providers[route]?.apiKeyEnv === 'string' ? providers[route].apiKeyEnv : undefined

  try {
    await settings.mutate(PI_AI_NS, [{ op: 'unset', path: ['providers', route] }], descriptor.revision)
  } catch (error) {
    if (isConflict(error)) throw new HttpError(409, 'conflict', '设置刚被其他界面改过，请刷新后重试')
    throw new HttpError(500, 'write-failed', `移除失败：${messageOf(error)}`)
  }

  if (body.removeKey === true && env !== undefined && credentials && typeof credentials.unset === 'function') {
    try {
      await credentials.unset(env)
    } catch {
      // The route is gone; a leftover key is harmless and reported by /state.
    }
  }
  return { route }
}

/**
 * Heal profiles whose compat switches their protocol does not take.
 *
 * Runs once per registration pass. A route with such a switch is refused whole
 * by the adapter, so it never shows up anywhere the user could fix it - only an
 * in-place repair reaches it. The repair moves switches and nothing else.
 */
async function healProfiles(ctx) {
  const { settings } = services(ctx)
  const descriptor = piAiDescriptor(settings)
  if (!descriptor) return 0
  const providers = userProviders(descriptor)
  let healed = 0
  for (const [route, stored] of Object.entries(providers)) {
    const repaired = repairProfileCompat(stored)
    if (repaired === stored) continue
    try {
      await settings.mutate(PI_AI_NS, [{ op: 'set', path: ['providers', route], value: repaired }], descriptor.revision)
      healed += 1
      if (ctx.logger && typeof ctx.logger.info === 'function') {
        ctx.logger.info(`dsh-quick-provider: dropped compat switches "${route}" does not take`)
      }
    } catch (error) {
      if (ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn(`dsh-quick-provider: could not repair "${route}": ${messageOf(error)}`)
      }
    }
  }
  return healed
}

// --- plugin ------------------------------------------------------------------

export function apply(ctx) {
  const registerRoutes = (webServer, fiber) => {
    const route = (method, suffix, run) => {
      fiber.effect(() =>
        webServer.register({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/${suffix}`,
          handler: async (req, res) => {
            if (!guard(req, res)) return
            if (req.method !== method) {
              sendJson(res, 405, { ok: false, code: 'method', error: `${method} only` })
              return
            }
            let body = {}
            if (method === 'POST') {
              try {
                const raw = await readBody(req)
                if (raw) body = JSON.parse(raw)
              } catch {
                sendJson(res, 400, { ok: false, code: 'invalid', error: 'JSON 请求体格式错误' })
                return
              }
            }
            try {
              sendJson(res, 200, { ok: true, ...(await run(body)) })
            } catch (error) {
              const status = error instanceof HttpError ? error.status : 500
              const code = error instanceof HttpError ? error.code : 'internal'
              sendJson(res, status, { ok: false, code, error: messageOf(error) })
            }
          },
        }),
      )
    }

    // The catalog + what is already configured. This is what the panel loads.
    route('GET', 'state', async () => catalogState(ctx))
    // Key-presence only: never values.
    route('POST', 'credentials', async (body) => {
      const refs = Array.isArray(body.refs) ? body.refs.filter((r) => typeof r === 'string') : []
      return { entries: await credentialFacts(ctx, refs) }
    })
    // Ask an endpoint for its live model list (optionally with a key the user
    // just typed, before anything is saved).
    route('POST', 'models', async (body) => {
      const api = typeof body.api === 'string' && body.api !== '' ? body.api : 'openai-completions'
      const baseURLErr = normalizeBaseURL(body.baseURL ?? '') === '' ? '接口地址不能为空' : undefined
      if (baseURLErr !== undefined) throw new HttpError(400, 'invalid', baseURLErr)

      let apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      if (apiKey === '' && typeof body.apiKeyEnv === 'string' && body.apiKeyEnv !== '') {
        // Fall back to the stored key only for the address it was saved for.
        const descriptor = piAiDescriptor(services(ctx).settings)
        const providers = userProviders(descriptor)
        const stored = providers[body.route]
        const sameEndpoint = stored !== undefined
          && typeof stored.baseURL === 'string'
          && normalizeBaseURL(stored.baseURL).toLowerCase() === normalizeBaseURL(body.baseURL).toLowerCase()
        if (sameEndpoint) {
          const hit = await resolveStoredKey(ctx, stored.apiKeyEnv)
          if (hit !== undefined) apiKey = hit
        }
      }

      const cached = cachedDiscovery(body.baseURL, api)
      if (cached !== undefined) return { models: cached, cached: true, listed: cached.length > 0 }

      const result = await fetchModelList({ baseURL: body.baseURL, api, apiKey })
      if (result.listed) storeDiscovery(body.baseURL, api, result.models)
      return { ...result, cached: false, env: customEnvName(body.route ?? '') }
    })
    // Add or replace a route.
    route('POST', 'apply', async (body) => applyRoute(ctx, body))
    // Remove a route.
    route('POST', 'remove', async (body) => removeRoute(ctx, body))
  }

  const webServer = ctx.get('webServer')
  if (webServer) registerRoutes(webServer, ctx)
  else ctx.inject(['webServer'], (sub) => registerRoutes(sub.webServer, sub))

  // Heal once the official namespace exists. pi-ai declares it a beat after the
  // services come up, so the first pass usually lands too early; a short
  // backoff retry covers that instead of relying on an event that may never
  // come.
  ctx.inject(['settings'], (sub) => {
    let misses = 0
    const run = () => {
      const descriptor = piAiDescriptor(services(sub).settings)
      if (!descriptor) {
        misses += 1
        if (misses <= 10) setTimeout(run, Math.min(200 * misses, 2000))
        return
      }
      misses = 0
      healProfiles(sub).catch((error) => {
        if (sub.logger && typeof sub.logger.warn === 'function') {
          sub.logger.warn(`dsh-quick-provider: heal pass failed: ${messageOf(error)}`)
        }
      })
    }
    run()
  })
}

/**
 * Read a stored key back, for the discovery fallback only.
 *
 * This is the one place a key value leaves the credentials service, and it only
 * ever travels to the endpoint the user already saved for that route.
 */
async function resolveStoredKey(ctx, ref) {
  if (typeof ref !== 'string' || ref === '') return undefined
  const { credentials } = services(ctx)
  if (!credentials) return undefined
  try {
    if (typeof credentials.resolve === 'function') {
      const hit = await credentials.resolve(ref)
      if (hit && typeof hit.value === 'string' && hit.value !== '') return hit.value
    }
  } catch {
    return undefined
  }
  return undefined
}

export { customEnvName, PRESETS, NS }
