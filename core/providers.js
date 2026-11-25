// dsh-quick-provider - core provider catalog.
//
// Pure data + pure helpers: no Node built-ins, no DSH imports, no I/O. The
// host half and the browser half both consume this module, so an endpoint
// fixed here is fixed in both places.
//
// Every endpoint below is the vendor's published OpenAI-compatible API root.
// Vendors move endpoints; `tools/verify-endpoints.mjs` probes them all so a
// stale one is caught here rather than in a user's first request.
//
// Every model entry is a STARTING DEFAULT, not a recommendation. Model ids
// drift far faster than this file does, which is why the panel's "拉取模型"
// button asks the endpoint for its live list - that is the path we trust.
// The defaults exist so a save still works when `/models` is unavailable
// (some gateways do not expose it).

/**
 * Route-level switches shared by OpenAI-compatible gateways.
 *
 * `supportsDeveloperRole: false` is the important one. When pi-ai believes an
 * endpoint understands OpenAI's `developer` role it rewrites the system prompt
 * into that role; many Chinese gateways then reject the whole request with
 * `content_filter` while the identical request using `system` succeeds. Forcing
 * the system role is what makes these providers usable for agent work at all.
 */
export const OPENAI_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  supportsFinishReason: true,
  maxTokensField: 'max_tokens',
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: false,
}

/** Wire protocols this catalog may name (the accepted subset of the pi-ai table). */
export const SUPPORTED_APIS = ['openai-completions', 'anthropic-messages', 'openai-responses']

const TEXT = ['text']
const TEXT_IMAGE = ['text', 'image']

/** Reasoning levels as `{ level: wireValue }`; the value is what gets sent. */
const efforts = (...levels) => Object.fromEntries(levels.map((level) => [level, level]))
const LOW_HIGH = efforts('low', 'high')
const LOW_MEDIUM_HIGH = efforts('low', 'medium', 'high')
const OFF_LOW_MEDIUM_HIGH = { off: 'none', low: 'low', medium: 'medium', high: 'high' }

/**
 * The curated catalog.
 *
 * `env` is the credential reference written as `apiKeyEnv`; the key itself
 * lives in DSH's credentials service, never in a settings file.
 * `group` drives the panel's tab split: `cn` (mainland vendors), `global`,
 * `gateway` (aggregators and relays), `local` (self-hosted).
 */
export const PRESETS = [
  // ---------------------------------------------------------------- 国内厂商 --
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    group: 'cn',
    docs: 'https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    env: 'SILICONFLOW_API_KEY',
    baseURL: 'https://api.siliconflow.cn/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '模型 ID 带厂商前缀，如 deepseek-ai/DeepSeek-V3、Qwen/Qwen3-235B-A22B。',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B A22B', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'moonshotai/Kimi-K2-Instruct', name: 'Kimi K2 Instruct', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'zai-org/GLM-4.5', name: 'GLM-4.5', contextWindow: 131072, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    group: 'cn',
    docs: 'https://api-docs.deepseek.com/',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    env: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: 'DSH 自带 deepseek-official 路由；这里额外挂一条，便于走同一套密钥管理。',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', contextWindow: 131072, maxTokens: 65536, input: TEXT, reasoningEfforts: OFF_LOW_MEDIUM_HIGH },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    group: 'cn',
    docs: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    env: 'ZHIPU_API_KEY',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '注意路径是 /api/paas/v4，不是 /v1。',
    models: [
      { id: 'glm-4.6', name: 'GLM-4.6', contextWindow: 204800, maxTokens: 131072, input: TEXT_IMAGE, reasoningEfforts: OFF_LOW_MEDIUM_HIGH },
      { id: 'glm-4.5', name: 'GLM-4.5', contextWindow: 131072, maxTokens: 98304, input: TEXT, reasoningEfforts: OFF_LOW_MEDIUM_HIGH },
      { id: 'glm-4.5-air', name: 'GLM-4.5 Air', contextWindow: 131072, maxTokens: 24576, input: TEXT },
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 · 通义千问',
    group: 'cn',
    docs: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    env: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '必须带 /compatible-mode 这一段；国际站是 dashscope-intl.aliyuncs.com。',
    models: [
      { id: 'qwen3-max', name: 'Qwen3 Max', contextWindow: 262144, maxTokens: 32768, input: TEXT },
      { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'qwen-turbo', name: 'Qwen Turbo', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', contextWindow: 1048576, maxTokens: 65536, input: TEXT },
    ],
  },
  {
    id: 'ark',
    name: '火山方舟 · 豆包',
    group: 'cn',
    docs: 'https://www.volcengine.com/docs/82379/1298454',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    env: 'ARK_API_KEY',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '模型名可填控制台里的推理接入点 ID（ep- 开头），生产环境推荐这种写法。',
    models: [
      { id: 'doubao-seed-1-6-250615', name: 'Doubao Seed 1.6', contextWindow: 262144, maxTokens: 16384, input: TEXT_IMAGE },
      { id: 'doubao-1-5-pro-32k-250115', name: 'Doubao 1.5 Pro 32k', contextWindow: 32768, maxTokens: 4096, input: TEXT },
      { id: 'kimi-k2-250711', name: 'Kimi K2', contextWindow: 131072, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'moonshot',
    name: 'Kimi · 月之暗面',
    group: 'cn',
    docs: 'https://platform.moonshot.cn/docs/api/chat',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    env: 'MOONSHOT_API_KEY',
    baseURL: 'https://api.moonshot.cn/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    models: [
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905', contextWindow: 262144, maxTokens: 16384, input: TEXT },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', contextWindow: 131072, maxTokens: 4096, input: TEXT },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', contextWindow: 32768, maxTokens: 4096, input: TEXT },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    group: 'cn',
    docs: 'https://platform.minimaxi.com/document/ChatCompletion%20v2',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    env: 'MINIMAX_API_KEY',
    baseURL: 'https://api.minimaxi.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '国内站 api.minimaxi.com；海外站是 api.minimax.io。',
    models: [
      { id: 'MiniMax-M2', name: 'MiniMax M2', contextWindow: 204800, maxTokens: 131072, input: TEXT },
      { id: 'MiniMax-Text-01', name: 'MiniMax Text 01', contextWindow: 1000000, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    group: 'cn',
    docs: 'https://cloud.tencent.com/document/product/1729/111007',
    keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    env: 'HUNYUAN_API_KEY',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    models: [
      { id: 'hunyuan-turbos-latest', name: 'Hunyuan TurboS', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'hunyuan-t1-latest', name: 'Hunyuan T1', contextWindow: 131072, maxTokens: 16384, input: TEXT },
    ],
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 StepFun',
    group: 'cn',
    docs: 'https://platform.stepfun.com/docs/zh/api-reference/chat/create',
    keyUrl: 'https://platform.stepfun.com/interface-key',
    env: 'STEPFUN_API_KEY',
    baseURL: 'https://api.stepfun.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    models: [
      { id: 'step-2-16k', name: 'Step-2 16k', contextWindow: 16384, maxTokens: 4096, input: TEXT },
      { id: 'step-1v-8k', name: 'Step-1V 8k', contextWindow: 8192, maxTokens: 4096, input: TEXT_IMAGE },
    ],
  },
  {
    id: 'baichuan',
    name: '百川智能 Baichuan',
    group: 'cn',
    docs: 'https://platform.baichuan-ai.com/docs/api',
    keyUrl: 'https://platform.baichuan-ai.com/console/apikey',
    env: 'BAICHUAN_API_KEY',
    baseURL: 'https://api.baichuan-ai.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    models: [
      { id: 'Baichuan4', name: 'Baichuan4', contextWindow: 32768, maxTokens: 4096, input: TEXT },
      { id: 'Baichuan4-Turbo', name: 'Baichuan4 Turbo', contextWindow: 32768, maxTokens: 4096, input: TEXT },
    ],
  },
  {
    id: 'lingyi',
    name: '零一万物 01.AI',
    group: 'cn',
    docs: 'https://platform.lingyiwanwu.com/docs',
    keyUrl: 'https://platform.lingyiwanwu.com/apikeys',
    env: 'LINGYI_API_KEY',
    baseURL: 'https://api.lingyiwanwu.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    models: [
      { id: 'yi-lightning', name: 'Yi Lightning', contextWindow: 16384, maxTokens: 4096, input: TEXT },
      { id: 'yi-large', name: 'Yi Large', contextWindow: 32768, maxTokens: 4096, input: TEXT },
    ],
  },
  {
    id: 'spark',
    name: '讯飞星火 Spark',
    group: 'cn',
    docs: 'https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html',
    keyUrl: 'https://console.xfyun.cn/services/bmx1',
    env: 'SPARK_API_KEY',
    baseURL: 'https://spark-api-open.xf-yun.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '这里的 Key 是「APIPassword」，不是 AppID / APISecret。',
    models: [
      { id: '4.0Ultra', name: 'Spark 4.0 Ultra', contextWindow: 32768, maxTokens: 8192, input: TEXT },
      { id: 'generalv3.5', name: 'Spark Max 3.5', contextWindow: 8192, maxTokens: 4096, input: TEXT },
    ],
  },
  {
    id: 'qianfan',
    name: '百度千帆 · 文心',
    group: 'cn',
    docs: 'https://cloud.baidu.com/doc/qianfan/s/Hmh4suq26',
    keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
    env: 'QIANFAN_API_KEY',
    baseURL: 'https://qianfan.baidubce.com/v2',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '填的是 IAM API Key（bce-v3/... 形式）；个别应用还需要 appid 请求头。',
    models: [
      { id: 'ernie-4.5-turbo-128k', name: 'ERNIE 4.5 Turbo 128k', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'ernie-4.0-turbo-8k', name: 'ERNIE 4.0 Turbo 8k', contextWindow: 8192, maxTokens: 4096, input: TEXT },
    ],
  },
  {
    id: 'modelscope',
    name: '魔搭 ModelScope',
    group: 'cn',
    docs: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
    keyUrl: 'https://modelscope.cn/my/myaccesstoken',
    env: 'MODELSCOPE_API_KEY',
    baseURL: 'https://api-inference.modelscope.cn/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '提供免费推理额度，适合先跑通再换付费渠道。',
    models: [
      { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', name: 'Qwen3 235B Instruct', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', contextWindow: 131072, maxTokens: 8192, input: TEXT },
    ],
  },

  // ---------------------------------------------------------------- 国际厂商 --
  {
    id: 'openai',
    name: 'OpenAI',
    group: 'global',
    docs: 'https://platform.openai.com/docs/models',
    keyUrl: 'https://platform.openai.com/api-keys',
    env: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    api: 'openai-completions',
    models: [
      { id: 'gpt-5', name: 'GPT-5', contextWindow: 272000, maxTokens: 128000, input: TEXT_IMAGE, reasoningEfforts: LOW_MEDIUM_HIGH },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', contextWindow: 272000, maxTokens: 128000, input: TEXT_IMAGE, reasoningEfforts: LOW_MEDIUM_HIGH },
      { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576, maxTokens: 32768, input: TEXT_IMAGE },
      { id: 'o4-mini', name: 'o4-mini', contextWindow: 200000, maxTokens: 100000, input: TEXT_IMAGE, reasoningEfforts: LOW_MEDIUM_HIGH },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    group: 'global',
    docs: 'https://docs.anthropic.com/en/docs/about-claude/models',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    env: 'ANTHROPIC_API_KEY',
    baseURL: 'https://api.anthropic.com',
    api: 'anthropic-messages',
    note: '走 Anthropic 原生 Messages 协议，baseURL 不带 /v1。',
    models: [
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', contextWindow: 200000, maxTokens: 32000, input: TEXT_IMAGE, reasoningEfforts: LOW_HIGH },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000, maxTokens: 64000, input: TEXT_IMAGE },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200000, maxTokens: 32000, input: TEXT_IMAGE },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    group: 'global',
    docs: 'https://ai.google.dev/gemini-api/docs/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    env: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    api: 'openai-completions',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, maxTokens: 65536, input: TEXT_IMAGE, reasoningEfforts: LOW_HIGH },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576, maxTokens: 65536, input: TEXT_IMAGE },
    ],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    group: 'global',
    docs: 'https://docs.x.ai/docs/models',
    keyUrl: 'https://console.x.ai/',
    env: 'XAI_API_KEY',
    baseURL: 'https://api.x.ai/v1',
    api: 'openai-completions',
    models: [
      { id: 'grok-4', name: 'Grok 4', contextWindow: 256000, maxTokens: 32000, input: TEXT_IMAGE, reasoningEfforts: LOW_MEDIUM_HIGH },
      { id: 'grok-3-mini', name: 'Grok 3 mini', contextWindow: 131072, maxTokens: 16000, input: TEXT },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    group: 'global',
    docs: 'https://docs.mistral.ai/api/',
    keyUrl: 'https://console.mistral.ai/api-keys',
    env: 'MISTRAL_API_KEY',
    baseURL: 'https://api.mistral.ai/v1',
    api: 'openai-completions',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 131072, maxTokens: 32768, input: TEXT },
      { id: 'magistral-medium-latest', name: 'Magistral Medium', contextWindow: 131072, maxTokens: 32768, input: TEXT, reasoningEfforts: LOW_MEDIUM_HIGH },
    ],
  },

  // ---------------------------------------------------------------- 聚合网关 --
  {
    id: 'openrouter',
    name: 'OpenRouter',
    group: 'gateway',
    docs: 'https://openrouter.ai/models',
    keyUrl: 'https://openrouter.ai/keys',
    env: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    api: 'openai-completions',
    compat: { ...OPENAI_COMPAT, thinkingFormat: 'openrouter' },
    note: '一家 Key 打上百个模型；模型 ID 形如 anthropic/claude-sonnet-4.5。',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', contextWindow: 200000, maxTokens: 64000, input: TEXT_IMAGE },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, maxTokens: 65536, input: TEXT_IMAGE },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', contextWindow: 131072, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'siliconflow-intl',
    name: '硅基流动 · 国际站',
    group: 'gateway',
    docs: 'https://docs.siliconflow.com/',
    keyUrl: 'https://cloud.siliconflow.com/account/ak',
    env: 'SILICONFLOW_INTL_API_KEY',
    baseURL: 'https://api.siliconflow.com/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '海外网络访问走 .com；账号与国内站分开。',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B A22B', contextWindow: 131072, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    group: 'gateway',
    docs: 'https://console.groq.com/docs/models',
    keyUrl: 'https://console.groq.com/keys',
    env: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    api: 'openai-completions',
    note: '推理速度极快，适合做工具调用密集的跑批。',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 131072, maxTokens: 32768, input: TEXT },
      { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2 Instruct', contextWindow: 131072, maxTokens: 16384, input: TEXT },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    group: 'gateway',
    docs: 'https://docs.together.ai/docs/serverless-models',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    env: 'TOGETHER_API_KEY',
    baseURL: 'https://api.together.xyz/v1',
    api: 'openai-completions',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput', name: 'Qwen3 235B', contextWindow: 262144, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    group: 'gateway',
    docs: 'https://deepinfra.com/models',
    keyUrl: 'https://deepinfra.com/dash/api_keys',
    env: 'DEEPINFRA_API_KEY',
    baseURL: 'https://api.deepinfra.com/v1/openai',
    api: 'openai-completions',
    note: '路径要以 /v1/openai 结尾。',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 131072, maxTokens: 8192, input: TEXT },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', contextWindow: 131072, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    group: 'gateway',
    docs: 'https://inference-docs.cerebras.ai/models/overview',
    keyUrl: 'https://cloud.cerebras.ai/platform',
    env: 'CEREBRAS_API_KEY',
    baseURL: 'https://api.cerebras.ai/v1',
    api: 'openai-completions',
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', contextWindow: 131072, maxTokens: 32768, input: TEXT },
      { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen3 235B', contextWindow: 131072, maxTokens: 32768, input: TEXT },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    group: 'gateway',
    docs: 'https://docs.perplexity.ai/api-reference/chat-completions',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    env: 'PERPLEXITY_API_KEY',
    baseURL: 'https://api.perplexity.ai',
    api: 'openai-completions',
    note: '联网搜索型模型，baseURL 不带 /v1。',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', contextWindow: 200000, maxTokens: 8192, input: TEXT },
      { id: 'sonar', name: 'Sonar', contextWindow: 128000, maxTokens: 4096, input: TEXT },
    ],
  },

  // ---------------------------------------------------------------- 本地部署 --
  {
    id: 'ollama',
    name: 'Ollama 本地',
    group: 'local',
    docs: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    keyUrl: 'https://ollama.com/download',
    env: 'OLLAMA_API_KEY',
    baseURL: 'http://127.0.0.1:11434/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '无需真实 Key，但端点仍要一个占位凭据；先 ollama serve。',
    models: [
      { id: 'qwen3:8b', name: 'Qwen3 8B', contextWindow: 32768, maxTokens: 8192, input: TEXT },
      { id: 'gpt-oss:20b', name: 'GPT-OSS 20B', contextWindow: 32768, maxTokens: 8192, input: TEXT },
    ],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio 本地',
    group: 'local',
    docs: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
    keyUrl: 'https://lmstudio.ai/',
    env: 'LMSTUDIO_API_KEY',
    baseURL: 'http://127.0.0.1:1234/v1',
    api: 'openai-completions',
    compat: OPENAI_COMPAT,
    note: '在 LM Studio 里打开本地服务器，再用它的模型标识。',
    models: [
      { id: 'qwen3-8b', name: 'Qwen3 8B', contextWindow: 32768, maxTokens: 8192, input: TEXT },
    ],
  },
]

/** Groups in display order, with their tab labels. */
export const GROUPS = [
  { id: 'cn', label: '国内厂商' },
  { id: 'global', label: '国际厂商' },
  { id: 'gateway', label: '聚合网关' },
  { id: 'local', label: '本地部署' },
]

/** Look one preset up by id. */
export function findPreset(id) {
  return PRESETS.find((preset) => preset.id === id)
}

/** Every preset id, for validation. */
export const PRESET_IDS = PRESETS.map((preset) => preset.id)

/**
 * All presets in one flat list, grouped order first, for a client that wants a
 * single ordered sequence.
 */
export function orderedPresets() {
  const order = new Map(GROUPS.map((group, index) => [group.id, index]))
  return [...PRESETS].sort((a, b) => (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99))
}
