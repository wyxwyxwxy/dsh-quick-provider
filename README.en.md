# dsh-quick-provider

**Quick-connect a third-party model to DeepSeek Harness.** Pick a provider, paste an API key, tick the models. Done.

28 mainstream providers ship with their endpoints and model lists, all taken from each vendor's own documentation. No YAML, no guessing whether it is `/v1` or `/api/paas/v4`, no restart.

```
Settings → Quick Connect → pick "SiliconFlow" → paste key → tick models → Save and enable
```

The route appears in the model picker immediately - exactly like a provider DSH ships with - and stays editable on the official Models page.

---

## Why this exists

DSH already supports any third-party provider: Settings → Models → Add model provider → Custom model API, then fill in Provider ID, base URL, protocol, and the model list.

The problem is that step expects you to **already know the answers**:

- SiliconFlow is `https://api.siliconflow.cn/v1`, but Zhipu is `https://open.bigmodel.cn/api/paas/v4` (not `/v1`), DashScope needs `/compatible-mode`, DeepInfra must end in `/v1/openai`, and Anthropic and Perplexity must **not** carry `/v1` at all. One wrong character is a 404.
- Model ids differ per vendor: SiliconFlow uses `deepseek-ai/DeepSeek-V3`, OpenRouter uses `anthropic/claude-sonnet-4.5`, Volcengine Ark wants its `ep-` endpoint id.
- And one failure is genuinely hard to see: many Chinese compatible gateways reject OpenAI's `developer` role. When the adapter believes an endpoint understands it, it rewrites the system prompt into a `developer` message, and the gateway rejects the entire request with `content_filter` - while the same request using `system` succeeds.

This plugin writes those answers down in advance and handles the last layer (the role-compat switch) by default. You supply only what only you have: the key.

## Install

Requires DeepSeek Harness 0.2 or later.

```sh
dsh plugin --profile web add github:wyxwyxwxy/dsh-quick-provider
dsh web
```

Then open **Settings → Quick Connect**.

No build-script approval is needed: the repository contains the code that actually runs, there is no `prepare` step, and installing executes nothing on your machine.

Remove it with:

```sh
dsh plugin --profile web remove dsh-quick-provider
```

## Using it

1. Open **Settings → Quick Connect**.
2. Browse by group or search (both English and Chinese names work). Connected providers are tagged.
3. Pick a provider. Endpoint, protocol and model list are prefilled; the card links straight to the vendor's docs and key page.
4. Paste the API key.
5. Tick the models you want. To use one that is not listed, type its id and press Enter - or hit **Fetch model list** to read the live list from the endpoint (this asks the endpoint with your key, so the result is real).
6. **Save and enable**.

After saving:

- The provider appears in the model picker; select it and start a conversation.
- The route is visible on the official Models page, where context window, output cap and reasoning levels stay editable.
- To change the endpoint (a relay, the international site), just edit **Base URL**. Endpoint and key are stored separately, so changing one leaves the other alone.

### About keys

Keys go into the **DSH credentials service** and are never written into a config file. The panel shows "key saved" or "no key saved" - it never echoes the value back.

Leaving the key field blank reuses the saved key, so changing models or the endpoint never means retyping it.

Removing a provider keeps its key by default (so re-adding it is one click); tick **Also delete the saved key** to clear it too.

## Built-in providers

| Group | Providers |
|---|---|
| China | SiliconFlow, DeepSeek, Zhipu GLM, Alibaba DashScope (Qwen), Volcengine Ark (Doubao), Kimi (Moonshot), MiniMax, Tencent Hunyuan, StepFun, Baichuan, 01.AI, iFlytek Spark, Baidu Qianfan (ERNIE), ModelScope |
| Global | OpenAI, Anthropic Claude, Google Gemini, xAI Grok, Mistral AI |
| Gateways | OpenRouter, SiliconFlow Global, Groq, Together AI, DeepInfra, Cerebras, Perplexity |
| Local | Ollama, LM Studio |

The model lists are **starting defaults, not recommendations**. Model ids drift far faster than this file does, which is why **Fetch model list** is the path to trust - the defaults exist so a save still works when an endpoint publishes no `/models`.

## Things worth knowing

**International endpoints from mainland networks.** The OpenAI, Gemini, xAI, Mistral and Perplexity endpoints are correct, but they are usually unreachable directly (DNS pollution). Use a proxy, route through a gateway (OpenRouter, SiliconFlow Global), or point **Base URL** at your own relay.

**This is the supported path.** The plugin implements no wire protocol and no adapter; every write lands through official DSH services:

- `settings.mutate('llm-pi-ai', …)` writes the official provider config, which the official schema validates and re-registers live;
- `credentials.set(ref, key)` writes to the official credentials service;
- requests are actually sent by the official `@deepseek-ai/dsh-llm-pi-ai` adapter.

So the plugin survives adapter upgrades, and it never fights the official Models page over config.

**The panel's fence.** It works through a few JSON routes bound to the loopback interface. Each one checks that the connection came from 127.0.0.1, that the Host header is local, and that a browser Origin - when present - is same-origin. Those routes touch keys, so the fence is not optional.

## Development

```sh
npm test                  # 28 unit tests: catalog validity, profile fences, compat gates, heal path
npm run verify-endpoints  # probe every built-in endpoint
```

```
.
├── core/providers.js   # provider catalog (pure data, no I/O)
├── core/profile.js     # build / validate / repair an llm-pi-ai profile (pure functions)
├── index.js            # host half: loopback JSON routes writing through official services
├── lib/client.js       # browser half: the Quick Connect settings panel
└── cordis.patch.yml    # bundle layer inserting the plugin row
```

Adding a provider is one object in `core/providers.js`. `npm test` then checks that its id is a legal route name, its `env` collides with nobody, its URL is a valid http(s) endpoint, and every model entry is one the adapter accepts.

The pass rule in `verify-endpoints` is worth knowing: **401 and 403 count as PASS**. They prove the path and wire format are right and only a credential is missing - which is exactly the state of a fresh install. Only an endpoint that never produces an HTTP response at all is a failure.

## License

MIT
