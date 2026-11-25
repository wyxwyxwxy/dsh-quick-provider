#!/usr/bin/env node
// Probe every preset endpoint so a stale one is caught here, not in a user's
// first request.
//
// What "reachable" means: the endpoint answered with an HTTP status rather than
// a DNS/TLS/connection failure. A 401 or 403 is a PASS - it proves the path and
// wire format are right and only the credential is missing, which is exactly the
// situation a fresh install is in. Anything that never got an HTTP response
// (ENOTFOUND, ECONNREFUSED, certificate problems) is a failure worth fixing
// before publishing.
//
//   node tools/verify-endpoints.mjs            # all presets
//   node tools/verify-endpoints.mjs siliconflow deepseek
//
// Local presets (Ollama, LM Studio) are skipped unless running locally: they are
// expected to be unreachable from CI.

import { PRESETS } from '../core/providers.js'

const TIMEOUT_MS = 12_000
const only = process.argv.slice(2)

/** Presets whose endpoint is expected to be absent off a developer machine. */
const LOCAL = new Set(PRESETS.filter((p) => p.group === 'local').map((p) => p.id))

async function probe(preset) {
  const base = preset.baseURL.replace(/\/+$/, '')
  // Anthropic's list endpoint lives under /v1 even though the messages base has
  // no version segment.
  const url = preset.api === 'anthropic-messages'
    ? `${base.replace(/\/v1$/, '')}/v1/models`
    : `${base}/models`

  const headers = { accept: 'application/json' }
  if (preset.api === 'anthropic-messages') headers['anthropic-version'] = '2023-06-01'
  else headers.authorization = 'Bearer endpoint-probe-not-a-real-key'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    // Drain so the socket closes.
    await res.text().catch(() => '')
    return { ok: true, status: res.status, url }
  } catch (error) {
    const timedOut = controller.signal.aborted
    return { ok: false, status: timedOut ? 'timeout' : 'no-response', url, error: error.message }
  } finally {
    clearTimeout(timer)
  }
}

const targets = only.length > 0
  ? PRESETS.filter((p) => only.includes(p.id))
  : PRESETS.filter((p) => !LOCAL.has(p.id))

if (targets.length === 0) {
  console.error('no presets matched')
  process.exit(1)
}

console.log(`probing ${targets.length} endpoint(s)…\n`)

let failed = 0
const results = await Promise.all(targets.map(async (preset) => ({ preset, result: await probe(preset) })))

for (const { preset, result } of results) {
  const status = String(result.status)
  // A 2xx/3xx/401/403/404 all mean the host answered; only a hard 5xx is worth a
  // second look, and even that usually means the endpoint exists.
  const reachable = result.ok
  if (!reachable) failed += 1
  const mark = reachable ? 'OK  ' : 'FAIL'
  const note = reachable ? `HTTP ${status}` : status
  console.log(`${mark} ${preset.id.padEnd(18)} ${preset.name.padEnd(24)} ${note}`)
  if (!reachable) console.log(`     ${result.url}`)
  if (!reachable && result.error) console.log(`     ${result.error}`)
}

console.log(`\n${targets.length - failed}/${targets.length} reachable`)
if (failed > 0) {
  console.log('\nEndpoints that never answered need checking against the vendor docs.')
  process.exitCode = 1
}
