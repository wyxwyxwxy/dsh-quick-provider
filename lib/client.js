/**
 * dsh-quick-provider - browser half.
 *
 * One settings section: **快速接入** (Settings → 快速接入). It renders the
 * provider catalog, takes a key, and writes the route through the host half's
 * loopback JSON routes.
 *
 * Why a section rather than a card on the official Models page: the Models page
 * already edits routes it knows about, and its editor assumes you arrive with a
 * route in hand. This section is the *before* state - pick a vendor, paste a
 * key, done. Once a route is written it shows up in that page too, and stays
 * editable there.
 *
 * This is a classic client bundle (client-modules protocol): it registers a
 * factory with `window.__ModuleLoader__` and returns `apply()`. It imports
 * nothing but React value-wise - a cross-plugin value import fails the client
 * bundle-purity gate.
 *
 * @module dsh-quick-provider/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-quick-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement

    var ROUTE_PREFIX = '/dsh-quick-provider'
    var NS = 'dsh-quick-provider'

    // ---- copy ---------------------------------------------------------------

    var ZH = typeof navigator !== 'undefined' && navigator.language && navigator.language.indexOf('zh') === 0
    var T = ZH
      ? {
          nav: '快速接入',
          title: '快速接入第三方模型',
          intro: '选一个服务商，填 API Key，勾选模型即可。接口地址已按各家官方文档预填，支持随时修改。',
          configuredTitle: '已接入的提供商',
          configuredEmpty: '还没有接入任何第三方提供商。',
          modelsCount: function (n) { return n + ' 个模型' },
          connected: '已接入',
          add: '接入',
          remove: '移除',
          removeBusy: '移除中…',
          removeConfirm: function (name) { return '移除 ' + name + '？它的模型路由会从模型选择器里消失。' },
          removeKeyToo: '同时删除已保存的密钥',
          key: 'API Key',
          keyPlaceholder: function (env) { return '粘贴 ' + env },
          keySaved: '已保存密钥',
          keyNotSaved: '未保存密钥',
          keyHint: '密钥保存在 DSH 凭据服务里，不会写进任何配置文件。',
          keyKeep: '留空表示沿用已保存的密钥',
          baseURL: '接口地址',
          protocol: '接口协议',
          displayName: '显示名称',
          models: '模型',
          fetchModels: '拉取模型列表',
          fetching: '拉取中…',
          fetched: function (n) { return '从接口读到 ' + n + ' 个模型' },
          fetchFailed: '拉取失败',
          manualModel: '手动添加模型 ID',
          manualPlaceholder: '输入模型 ID 后回车',
          noModels: '还没有选择模型。点「拉取模型列表」，或在下面手动填一个模型 ID。',
          selected: function (n) { return '已选 ' + n + ' 个' },
          save: '保存并启用',
          saving: '保存中…',
          saved: '已接入，可以在模型选择器里选它了',
          saveFailed: '接入失败',
          cancel: '取消',
          back: '返回列表',
          docs: '文档',
          getKey: '获取 Key',
          note: '说明',
          searchPlaceholder: '搜索服务商…',
          noMatch: '没有匹配的服务商',
          all: '全部',
          advanced: '高级选项',
          reasonHint: '多数兼容网关需要把系统提示词按 system 角色发送；这里默认已处理。',
          presetBadge: '预设',
          customBadge: '自定义',
        }
      : {
          nav: 'Quick Connect',
          title: 'Quick-connect a third-party model',
          intro: 'Pick a provider, paste an API key, tick the models. Endpoints are prefilled from each vendor\'s docs and stay editable.',
          configuredTitle: 'Connected providers',
          configuredEmpty: 'No third-party provider connected yet.',
          modelsCount: function (n) { return n + ' models' },
          connected: 'Connected',
          add: 'Connect',
          remove: 'Remove',
          removeBusy: 'Removing…',
          removeConfirm: function (name) { return 'Remove ' + name + '? Its route disappears from the model picker.' },
          removeKeyToo: 'Also delete the saved key',
          key: 'API Key',
          keyPlaceholder: function (env) { return 'Paste ' + env },
          keySaved: 'Key saved',
          keyNotSaved: 'No key saved',
          keyHint: 'Keys live in the DSH credentials service; they are never written into a config file.',
          keyKeep: 'Leave blank to reuse the saved key',
          baseURL: 'Base URL',
          protocol: 'Protocol',
          displayName: 'Display name',
          models: 'Models',
          fetchModels: 'Fetch model list',
          fetching: 'Fetching…',
          fetched: function (n) { return n + ' models read from the endpoint' },
          fetchFailed: 'Fetch failed',
          manualModel: 'Add a model id',
          manualPlaceholder: 'Type a model id and press Enter',
          noModels: 'No model selected yet. Fetch the list, or type a model id below.',
          selected: function (n) { return n + ' selected' },
          save: 'Save and enable',
          saving: 'Saving…',
          saved: 'Connected - it is now in the model picker',
          saveFailed: 'Could not connect',
          cancel: 'Cancel',
          back: 'Back to list',
          docs: 'Docs',
          getKey: 'Get a key',
          note: 'Note',
          searchPlaceholder: 'Search providers…',
          noMatch: 'No matching provider',
          all: 'All',
          advanced: 'Advanced',
          reasonHint: 'Most compatible gateways need the system prompt sent as the system role; that is already handled here.',
          presetBadge: 'Preset',
          customBadge: 'Custom',
        }

    // ---- styles -------------------------------------------------------------

    var STYLE_ID = 'dsh-quick-provider-style'

    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
      var css = [
        '.qc-root{--qc-border:var(--border,#e3e3e8);--qc-muted:var(--muted-foreground,#6b6b76);--qc-bg:var(--background,#fff);--qc-card:var(--card,#fff);--qc-accent:var(--primary,#2563eb);--qc-soft:var(--muted,#f4f4f6);--qc-fg:var(--foreground,#17171c);font-size:13px;color:var(--qc-fg);line-height:1.55}',
        '.qc-root *{box-sizing:border-box}',
        '.qc-title{font-size:16px;font-weight:600;margin:0 0 4px}',
        '.qc-intro{color:var(--qc-muted);margin:0 0 16px;max-width:64em}',
        '.qc-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;border-bottom:1px solid var(--qc-border);padding-bottom:8px}',
        '.qc-tab{background:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;color:var(--qc-muted);font-size:12px;font-family:inherit}',
        '.qc-tab:hover{background:var(--qc-soft);color:var(--qc-fg)}',
        '.qc-tab.is-on{background:var(--qc-soft);color:var(--qc-fg);font-weight:600}',
        '.qc-search{width:100%;padding:7px 10px;border:1px solid var(--qc-border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--qc-bg);color:var(--qc-fg);margin-bottom:10px}',
        '.qc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}',
        '.qc-card{display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 12px;border:1px solid var(--qc-border);border-radius:9px;background:var(--qc-card);cursor:pointer;font-family:inherit;color:inherit;transition:border-color .12s,box-shadow .12s}',
        '.qc-card:hover{border-color:var(--qc-accent);box-shadow:0 1px 5px rgba(0,0,0,.06)}',
        '.qc-card-name{font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
        '.qc-card-meta{color:var(--qc-muted);font-size:11.5px}',
        '.qc-pill{font-size:10px;padding:1px 6px;border-radius:99px;background:var(--qc-soft);color:var(--qc-muted);font-weight:500}',
        '.qc-pill.ok{background:rgba(34,160,90,.12);color:#1a7f4b}',
        '.qc-panel{border:1px solid var(--qc-border);border-radius:10px;padding:14px;background:var(--qc-card);margin-top:12px}',
        '.qc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}',
        '.qc-panel-title{font-weight:600;font-size:14px;margin:0}',
        '.qc-links{display:flex;gap:10px;font-size:11.5px}',
        '.qc-links a{color:var(--qc-accent);text-decoration:none}',
        '.qc-links a:hover{text-decoration:underline}',
        '.qc-field{margin-bottom:10px}',
        '.qc-label{display:block;font-size:11.5px;font-weight:600;color:var(--qc-muted);margin-bottom:3px}',
        '.qc-input{width:100%;padding:7px 10px;border:1px solid var(--qc-border);border-radius:7px;font-family:inherit;font-size:12.5px;background:var(--qc-bg);color:var(--qc-fg)}',
        '.qc-input:focus{outline:2px solid var(--qc-accent);outline-offset:-1px;border-color:transparent}',
        '.qc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
        '.qc-row>.qc-input{flex:1;min-width:180px}',
        '.qc-hint{font-size:11px;color:var(--qc-muted);margin-top:3px}',
        '.qc-note{font-size:11.5px;color:var(--qc-muted);background:var(--qc-soft);border-radius:6px;padding:7px 9px;margin-bottom:10px}',
        '.qc-btn{border:1px solid var(--qc-border);background:var(--qc-card);color:var(--qc-fg);padding:6px 12px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12.5px;white-space:nowrap}',
        '.qc-btn:hover{background:var(--qc-soft)}',
        '.qc-btn:disabled{opacity:.5;cursor:not-allowed}',
        '.qc-btn.primary{background:var(--qc-accent);border-color:var(--qc-accent);color:#fff;font-weight:600}',
        '.qc-btn.primary:hover{filter:brightness(1.06)}',
        '.qc-btn.danger{color:#b42318;border-color:rgba(180,35,24,.3)}',
        '.qc-btn.small{padding:3px 8px;font-size:11.5px}',
        '.qc-models{max-height:260px;overflow:auto;border:1px solid var(--qc-border);border-radius:8px;padding:4px}',
        '.qc-model{display:flex;align-items:center;gap:7px;padding:4px 7px;border-radius:5px;font-size:12px}',
        '.qc-model:hover{background:var(--qc-soft)}',
        '.qc-model input{margin:0;flex:none}',
        '.qc-model-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}',
        '.qc-model-name{color:var(--qc-muted);font-size:11px;margin-left:auto;text-align:right}',
        '.qc-status{font-size:12px;margin-top:8px;padding:7px 10px;border-radius:7px}',
        '.qc-status.ok{background:rgba(34,160,90,.1);color:#1a7f4b}',
        '.qc-status.err{background:rgba(180,35,24,.09);color:#b42318}',
        '.qc-status.info{background:var(--qc-soft);color:var(--qc-muted)}',
        '.qc-list{display:flex;flex-direction:column;gap:6px}',
        '.qc-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--qc-border);border-radius:8px;background:var(--qc-card);flex-wrap:wrap}',
        '.qc-item-main{flex:1;min-width:150px}',
        '.qc-item-name{font-weight:600;font-size:12.5px}',
        '.qc-item-meta{color:var(--qc-muted);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}',
        '.qc-empty{color:var(--qc-muted);font-size:12px;padding:10px 0}',
        '.qc-subhead{font-size:12px;font-weight:600;margin:18px 0 8px;padding-top:14px;border-top:1px solid var(--qc-border)}',
        '.qc-badge-warn{font-size:11px;color:#b42318}',
      ].join('\n')
      var el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = css
      document.head.appendChild(el)
    }

    // ---- http ---------------------------------------------------------------

    function request(method, path, body) {
      var init = { method: method, headers: {} }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      return fetch(ROUTE_PREFIX + path, init).then(function (res) {
        return res.json().then(
          function (payload) {
            if (payload && payload.ok) return payload
            var err = new Error((payload && payload.error) || ('HTTP ' + res.status))
            err.code = payload && payload.code
            throw err
          },
          function () {
            throw new Error('HTTP ' + res.status)
          },
        )
      })
    }

    // ---- helpers ------------------------------------------------------------

    /** Human label for one preset's group. */
    function groupLabel(groups, id) {
      for (var i = 0; i < groups.length; i += 1) {
        if (groups[i].id === id) return groups[i].label
      }
      return id
    }

    /** Merge a fetched list into the preset defaults, keeping ticks already made. */
    function mergeModels(previous, fetched) {
      var byId = {}
      previous.forEach(function (m) { byId[m.id] = m })
      var out = []
      var seen = {}
      fetched.forEach(function (m) {
        if (seen[m.id]) return
        seen[m.id] = true
        var base = byId[m.id]
        out.push({
          id: m.id,
          name: m.name || (base && base.name) || m.id,
          contextWindow: m.contextWindow || (base && base.contextWindow),
          maxTokens: m.maxTokens || (base && base.maxTokens),
          input: (base && base.input) || ['text'],
        })
      })
      return out
    }

    // ---- provider picker ----------------------------------------------------

    function ProviderGrid(props) {
      var state = props.state
      var onPick = props.onPick
      var groups = state.groups || []
      var _g = React.useState('all'); var group = _g[0]; var setGroup = _g[1]
      var _q = React.useState(''); var query = _q[0]; var setQuery = _q[1]

      var connected = {}
      ;(state.configured || []).forEach(function (c) { connected[c.route] = true })

      var presets = (state.presets || []).filter(function (p) {
        if (group !== 'all' && p.group !== group) return false
        if (query.trim() === '') return true
        var q = query.trim().toLowerCase()
        return (p.name || '').toLowerCase().indexOf(q) !== -1 || (p.id || '').indexOf(q) !== -1
      })

      return h(
        'div',
        null,
        h('h2', { className: 'qc-title' }, T.title),
        h('p', { className: 'qc-intro' }, T.intro),
        h(
          'div',
          { className: 'qc-tabs' },
          h(
            'button',
            { type: 'button', className: 'qc-tab' + (group === 'all' ? ' is-on' : ''), onClick: function () { setGroup('all') } },
            T.all,
          ),
          groups.map(function (g) {
            return h(
              'button',
              {
                type: 'button',
                key: g.id,
                className: 'qc-tab' + (group === g.id ? ' is-on' : ''),
                onClick: function () { setGroup(g.id) },
              },
              g.label,
            )
          }),
        ),
        h('input', {
          className: 'qc-search',
          placeholder: T.searchPlaceholder,
          value: query,
          onChange: function (e) { setQuery(e.target.value) },
        }),
        presets.length === 0
          ? h('div', { className: 'qc-empty' }, T.noMatch)
          : h(
              'div',
              { className: 'qc-grid' },
              presets.map(function (p) {
                return h(
                  'button',
                  { type: 'button', key: p.id, className: 'qc-card', onClick: function () { onPick(p) } },
                  h(
                    'span',
                    { className: 'qc-card-name' },
                    p.name,
                    connected[p.id] ? h('span', { className: 'qc-pill ok' }, T.connected) : null,
                  ),
                  h('span', { className: 'qc-card-meta' }, (p.models || []).length + ' 个预设模型 · ' + groupLabel(groups, p.group)),
                )
              }),
            ),
      )
    }

    // ---- configure one provider --------------------------------------------

    function ProviderForm(props) {
      var preset = props.preset
      var savedFacts = props.savedFacts || {}
      var onBack = props.onBack
      var onDone = props.onDone
      var onNotify = props.onNotify

      var _key = React.useState(''); var apiKey = _key[0]; var setApiKey = _key[1]
      var _base = React.useState(preset.baseURL || ''); var baseURL = _base[0]; var setBaseURL = _base[1]
      var _dn = React.useState(preset.name || ''); var displayName = _dn[0]; var setDisplayName = _dn[1]
      var _api = React.useState(preset.api || 'openai-completions'); var api = _api[0]; var setApi = _api[1]
      var _models = React.useState(preset.models || []); var models = _models[0]; var setModels = _models[1]
      var _checked = React.useState((preset.models || []).map(function (m) { return m.id })); var checked = _checked[0]; var setChecked = _checked[1]
      var _manual = React.useState(''); var manual = _manual[0]; var setManual = _manual[1]
      var _busy = React.useState(null); var busy = _busy[0]; var setBusy = _busy[1]
      var _status = React.useState(null); var status = _status[0]; var setStatus = _status[1]
      var _open = React.useState(false); var advanced = _open[0]; var setAdvanced = _open[1]

      var env = preset.env
      var keySaved = savedFacts[env] && savedFacts[env].configured

      var toggle = function (id) {
        setChecked(function (prev) {
          var idx = prev.indexOf(id)
          if (idx === -1) return prev.concat([id])
          var next = prev.slice()
          next.splice(idx, 1)
          return next
        })
      }

      var fetchModels = function () {
        setBusy('fetch')
        setStatus(null)
        request('POST', '/models', {
          baseURL: baseURL,
          api: api,
          apiKey: apiKey,
          apiKeyEnv: env,
          route: preset.id,
        })
          .then(function (res) {
            var merged = mergeModels(models, res.models || [])
            if (merged.length === 0) {
              setStatus({ kind: 'info', text: res.note || '接口没有返回模型列表，请手动填写模型 ID。' })
              return
            }
            setModels(merged)
            // Newly fetched ids arrive ticked; ids the user already unticked stay unticked.
            var fetchedIds = merged.map(function (m) { return m.id })
            setChecked(function (prev) {
              var next = prev.filter(function (id) { return fetchedIds.indexOf(id) !== -1 })
              merged.forEach(function (m) { if (next.indexOf(m.id) === -1) next.push(m.id) })
              return next
            })
            setStatus({ kind: 'ok', text: T.fetched(merged.length) })
          })
          .catch(function (err) {
            setStatus({ kind: 'err', text: T.fetchFailed + '：' + (err.message || String(err)) })
          })
          .then(function () { setBusy(null) })
      }

      var addManual = function () {
        var id = manual.trim()
        if (id === '') return
        setModels(function (prev) {
          if (prev.some(function (m) { return m.id === id })) return prev
          return prev.concat([{ id: id, name: id, input: ['text'] }])
        })
        setChecked(function (prev) { return prev.indexOf(id) === -1 ? prev.concat([id]) : prev })
        setManual('')
      }

      var save = function () {
        var chosen = models.filter(function (m) { return checked.indexOf(m.id) !== -1 })
        if (chosen.length === 0) {
          setStatus({ kind: 'err', text: '请至少勾选一个模型。' })
          return
        }
        setBusy('save')
        setStatus(null)
        request('POST', '/apply', {
          presetId: preset.id,
          route: preset.id,
          displayName: displayName,
          baseURL: baseURL,
          api: api,
          apiKey: apiKey,
          models: chosen,
        })
          .then(function (res) {
            setStatus({ kind: 'ok', text: T.saved })
            if (onNotify) onNotify('ok', T.saved)
            if (onDone) onDone(res)
          })
          .catch(function (err) {
            var text = T.saveFailed + '：' + (err.message || String(err))
            setStatus({ kind: 'err', text: text })
            if (onNotify) onNotify('err', text)
          })
          .then(function () { setBusy(null) })
      }

      return h(
        'div',
        { className: 'qc-panel' },
        h(
          'div',
          { className: 'qc-panel-head' },
          h('div', null,
            h('h3', { className: 'qc-panel-title' }, preset.name),
            h('span', { className: 'qc-card-meta' }, groupLabel(props.groups || [], preset.group)),
          ),
          h(
            'div',
            { className: 'qc-links' },
            preset.docs ? h('a', { href: preset.docs, target: '_blank', rel: 'noreferrer' }, T.docs) : null,
            preset.keyUrl ? h('a', { href: preset.keyUrl, target: '_blank', rel: 'noreferrer' }, T.getKey) : null,
            h('button', { type: 'button', className: 'qc-btn small', onClick: onBack }, T.back),
          ),
        ),

        preset.note ? h('div', { className: 'qc-note' }, T.note + '：' + preset.note) : null,

        h(
          'div',
          { className: 'qc-field' },
          h('label', { className: 'qc-label' }, T.key + ' · ' + env),
          h('input', {
            className: 'qc-input',
            type: 'password',
            autoComplete: 'off',
            placeholder: keySaved ? T.keyKeep : T.keyPlaceholder(env),
            value: apiKey,
            onChange: function (e) { setApiKey(e.target.value) },
          }),
          h(
            'div',
            { className: 'qc-hint' },
            keySaved ? '✓ ' + T.keySaved : T.keyNotSaved,
            ' · ' + T.keyHint,
          ),
        ),

        h(
          'div',
          { className: 'qc-field' },
          h('label', { className: 'qc-label' }, T.baseURL),
          h('input', {
            className: 'qc-input',
            value: baseURL,
            onChange: function (e) { setBaseURL(e.target.value) },
            spellCheck: false,
          }),
        ),

        h(
          'div',
          { className: 'qc-field' },
          h('label', { className: 'qc-label' }, T.models + (checked.length > 0 ? ' · ' + T.selected(checked.length) : '')),
          h(
            'div',
            { className: 'qc-row', style: { marginBottom: '7px' } },
            h(
              'button',
              { type: 'button', className: 'qc-btn', onClick: fetchModels, disabled: busy !== null },
              busy === 'fetch' ? T.fetching : T.fetchModels,
            ),
            h('input', {
              className: 'qc-input',
              placeholder: T.manualPlaceholder,
              value: manual,
              onChange: function (e) { setManual(e.target.value) },
              onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); addManual() } },
            }),
            h('button', { type: 'button', className: 'qc-btn', onClick: addManual, disabled: manual.trim() === '' }, '+'),
          ),
          models.length === 0
            ? h('div', { className: 'qc-empty' }, T.noModels)
            : h(
                'div',
                { className: 'qc-models' },
                models.map(function (m) {
                  return h(
                    'label',
                    { className: 'qc-model', key: m.id },
                    h('input', {
                      type: 'checkbox',
                      checked: checked.indexOf(m.id) !== -1,
                      onChange: function () { toggle(m.id) },
                    }),
                    h('span', { className: 'qc-model-id' }, m.id),
                    m.name && m.name !== m.id ? h('span', { className: 'qc-model-name' }, m.name) : null,
                  )
                }),
              ),
        ),

        h(
          'div',
          null,
          h(
            'button',
            {
              type: 'button',
              className: 'qc-btn small',
              onClick: function () { setAdvanced(!advanced) },
            },
            T.advanced + (advanced ? ' ▲' : ' ▼'),
          ),
          advanced
            ? h(
                'div',
                { style: { marginTop: '10px' } },
                h(
                  'div',
                  { className: 'qc-field' },
                  h('label', { className: 'qc-label' }, T.displayName),
                  h('input', { className: 'qc-input', value: displayName, onChange: function (e) { setDisplayName(e.target.value) } }),
                ),
                h(
                  'div',
                  { className: 'qc-field' },
                  h('label', { className: 'qc-label' }, T.protocol),
                  h(
                    'select',
                    { className: 'qc-input', value: api, onChange: function (e) { setApi(e.target.value) } },
                    h('option', { value: 'openai-completions' }, 'openai-completions（绝大多数兼容网关）'),
                    h('option', { value: 'openai-responses' }, 'openai-responses（OpenAI Responses API）'),
                    h('option', { value: 'anthropic-messages' }, 'anthropic-messages（Anthropic 原生协议）'),
                  ),
                ),
                h('div', { className: 'qc-hint' }, T.reasonHint),
              )
            : null,
        ),

        status ? h('div', { className: 'qc-status ' + status.kind }, status.text) : null,

        h(
          'div',
          { className: 'qc-row', style: { marginTop: '12px' } },
          h(
            'button',
            { type: 'button', className: 'qc-btn primary', onClick: save, disabled: busy !== null },
            busy === 'save' ? T.saving : T.save,
          ),
          h('button', { type: 'button', className: 'qc-btn', onClick: onBack, disabled: busy !== null }, T.cancel),
        ),
      )
    }

    // ---- connected list -----------------------------------------------------

    function ConnectedList(props) {
      var state = props.state
      var onChanged = props.onChanged
      var _busy = React.useState(null); var busy = _busy[0]; var setBusy = _busy[1]
      var _dropKey = React.useState(false); var dropKey = _dropKey[0]; var setDropKey = _dropKey[1]

      var rows = state.configured || []
      if (rows.length === 0) {
        return h('div', null, h('div', { className: 'qc-subhead' }, T.configuredTitle), h('div', { className: 'qc-empty' }, T.configuredEmpty))
      }

      var remove = function (route, name) {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(T.removeConfirm(name))) return
        setBusy(route)
        request('POST', '/remove', { route: route, removeKey: dropKey })
          .then(function () { onChanged() })
          .catch(function (err) { onChanged(err) })
          .then(function () { setBusy(null) })
      }

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'qc-subhead', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' } },
          h('span', null, T.configuredTitle),
          h(
            'label',
            { className: 'qc-hint', style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: '400' } },
            h('input', { type: 'checkbox', checked: dropKey, onChange: function () { setDropKey(!dropKey) } }),
            T.removeKeyToo,
          ),
        ),
        h(
          'div',
          { className: 'qc-list' },
          rows.map(function (row) {
            return h(
              'div',
              { className: 'qc-item', key: row.route },
              h(
                'div',
                { className: 'qc-item-main' },
                h(
                  'div',
                  { className: 'qc-item-name' },
                  row.displayName || row.route,
                  row.presetId ? h('span', { className: 'qc-pill', style: { marginLeft: '6px' } }, T.presetBadge) : h('span', { className: 'qc-pill', style: { marginLeft: '6px' } }, T.customBadge),
                  row.error ? h('span', { className: 'qc-badge-warn', style: { marginLeft: '6px' } }, row.error) : null,
                ),
                h('div', { className: 'qc-item-meta' }, row.route + ' · ' + T.modelsCount(row.models) + (row.env ? ' · ' + row.env : '')),
                row.baseURL ? h('div', { className: 'qc-item-meta' }, row.baseURL) : null,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qc-btn danger small',
                  disabled: busy !== null,
                  onClick: function () { remove(row.route, row.displayName || row.route) },
                },
                busy === row.route ? T.removeBusy : T.remove,
              ),
            )
          }),
        ),
      )
    }

    // ---- section ------------------------------------------------------------

    function QuickConnectSection() {
      var _state = React.useState(null); var state = _state[0]; var setState = _state[1]
      var _error = React.useState(null); var error = _error[0]; var setError = _error[1]
      var _facts = React.useState({}); var facts = _facts[0]; var setFacts = _facts[1]
      var _picked = React.useState(null); var picked = _picked[0]; var setPicked = _picked[1]
      var _notice = React.useState(null); var notice = _notice[0]; var setNotice = _notice[1]

      var load = React.useCallback(function () {
        return request('GET', '/state')
          .then(function (res) {
            setState(res)
            setError(res.piAiReady ? null : 'llm-pi-ai 设置命名空间未注册，请确认 DSH 版本（本插件需要 ≥0.2）。')
            var refs = (res.presets || []).map(function (p) { return p.env })
            ;(res.configured || []).forEach(function (c) { if (c.env) refs.push(c.env) })
            var unique = refs.filter(function (r, i) { return typeof r === 'string' && refs.indexOf(r) === i })
            if (unique.length === 0) return
            return request('POST', '/credentials', { refs: unique })
              .then(function (cres) { setFacts((cres && cres.entries) || {}) })
              .catch(function () { setFacts({}) })
          })
          .catch(function (err) { setError(err.message || String(err)) })
      }, [])

      React.useEffect(function () { ensureStyles(); load() }, [load])

      if (error !== null && state === null) {
        return h('div', { className: 'qc-root' }, h('div', { className: 'qc-status err' }, error))
      }
      if (state === null) return h('div', { className: 'qc-root' }, h('p', { className: 'qc-intro' }, '…'))

      var body
      if (picked !== null) {
        body = h(ProviderForm, {
          preset: picked,
          groups: state.groups,
          savedFacts: facts,
          onBack: function () { setPicked(null); setNotice(null) },
          onDone: function () {
            setPicked(null)
            load()
          },
          onNotify: function (kind, text) { setNotice({ kind: kind, text: text }) },
        })
      } else {
        body = h(ProviderGrid, {
          state: state,
          onPick: function (preset) { setPicked(preset); setNotice(null) },
        })
      }

      return h(
        'div',
        { className: 'qc-root' },
        error !== null ? h('div', { className: 'qc-status err' }, error) : null,
        notice !== null && picked === null ? h('div', { className: 'qc-status ' + notice.kind }, notice.text) : null,
        body,
        h(ConnectedList, {
          state: state,
          onChanged: function (err) {
            load()
            if (err instanceof Error) setNotice({ kind: 'err', text: err.message })
          },
        }),
      )
    }

    // ---- plugin -------------------------------------------------------------

    var inject = ['slots']

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', function () {
        slots.register(
          {
            name: 'settings.section',
            id: 'quick-provider',
            order: 25,
            label: function () { return T.nav },
            inject: function () { return {} },
          },
          function () {
            return h(QuickConnectSection, null)
          },
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    // Pure helper exported for the unit test.
    exports.mergeModels = mergeModels
    return module.exports
  },
})
