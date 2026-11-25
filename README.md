# dsh-quick-provider

**为 DeepSeek Harness 一键接入第三方模型。** 选提供商 → 填 API Key → 勾模型，三步完成。

内置 28 家主流提供商的接口地址与模型清单，全部按各家官方文档填写。不需要改 YAML，不需要记各家 `/v1` 还是 `/api/paas/v4`，不需要重启。

```
Settings → 快速接入 → 选「硅基流动」→ 粘 Key → 勾模型 → 保存并启用
```

保存后，这条路由立刻出现在模型选择器里，和官方自带的提供商完全一样，也能在官方 Models 页里继续编辑。

---

## 为什么有这个插件

DSH 官方已经支持接入任意第三方提供商，路径是 Settings → Models → Add model provider → Custom model API，要填 Provider ID、API 地址、API 协议、模型列表。

问题是那一步要求你**先知道答案**：

- 硅基流动的地址是 `https://api.siliconflow.cn/v1`，但智谱是 `https://open.bigmodel.cn/api/paas/v4`（不是 `/v1`），百炼必须带 `/compatible-mode`，DeepInfra 要以 `/v1/openai` 结尾，Anthropic 和 Perplexity 反而**不能**带 `/v1`。填错一个字符就是 404。
- 模型 ID 各家写法不同：硅基流动是 `deepseek-ai/DeepSeek-V3`，OpenRouter 是 `anthropic/claude-sonnet-4.5`，火山方舟建议填 `ep-` 开头的接入点 ID。
- 还有一层不明显但很致命的：很多国产兼容网关不接受 OpenAI 的 `developer` 角色。当适配器认为端点认识这个角色时，会把系统提示词改写成 `developer` 消息，网关直接以 `content_filter` 拒掉整个请求 —— 而同一个请求用 `system` 角色就完全正常。

这个插件做的就是把这些答案预先填好，并且把最后一层（角色兼容开关）默认处理掉。你只需要提供只有你才有的东西：密钥。

## 安装

需要 DeepSeek Harness 0.2 及以上。

```sh
dsh plugin --profile web add github:wyxwyxwxy/dsh-quick-provider
dsh web
```

然后打开 **Settings → 快速接入**。

装完不需要授权构建脚本：本仓库里就是最终运行的代码，没有 `prepare` 构建步骤，安装时不会有任何代码在你的机器上被执行。

卸载：

```sh
dsh plugin --profile web remove dsh-quick-provider
```

## 使用

1. 打开 **Settings → 快速接入**。
2. 按分组浏览，或直接搜索（支持中文名和 id）。已接入的会标「已接入」。
3. 点一个提供商。接口地址、协议、模型清单都已填好，卡片上有官方文档和获取 Key 的直达链接。
4. 填 API Key。
5. 勾选要用的模型。想用清单里没有的模型，就在输入框里填模型 ID 回车添加；也可以点**拉取模型列表**从端点实时读取（这一步会用你的 Key 去问端点，列表是真的）。
6. **保存并启用**。

保存后：

- 模型选择器里会多出这个提供商，选它即可开始对话。
- 官方 Models 页里也能看到这条路由，随时可以改上下文窗口、输出上限、思考级别。
- 想调接口地址（比如走中转、换成国际站），直接在面板的「接口地址」里改。地址和密钥是分开存的，改地址不会动密钥。

### 关于密钥

密钥写进 **DSH 凭据服务**，不写进任何配置文件。面板只显示「已保存 / 未保存」，不会回显密钥内容。

留空密钥框表示沿用已保存的那把 —— 所以改模型、改地址都不用重填 Key。

移除提供商时，默认只删路由、保留密钥（方便你之后再加回来）；勾上「同时删除已保存的密钥」才会一并清掉。

## 内置提供商

| 分组 | 提供商 |
|---|---|
| 国内厂商 | 硅基流动、DeepSeek、智谱 GLM、阿里云百炼（通义千问）、火山方舟（豆包）、Kimi（月之暗面）、MiniMax、腾讯混元、阶跃星辰、百川、零一万物、讯飞星火、百度千帆（文心）、魔搭 ModelScope |
| 国际厂商 | OpenAI、Anthropic Claude、Google Gemini、xAI Grok、Mistral AI |
| 聚合网关 | OpenRouter、硅基流动国际站、Groq、Together AI、DeepInfra、Cerebras、Perplexity |
| 本地部署 | Ollama、LM Studio |

模型清单是**起点默认值，不是推荐**。模型 ID 变得比这个文件快得多，所以「拉取模型列表」才是可信的路径 —— 默认清单的价值在于端点不提供 `/models` 时你仍然能保存。

## 需要知道的几件事

**国内网络访问国际站点。** OpenAI、Gemini、xAI、Mistral、Perplexity 的地址是对的，但国内网络直接访问通常不通（DNS 污染）。要么自备代理，要么改用聚合网关（OpenRouter、硅基流动国际站），要么把「接口地址」改成你自己的中转地址。

**这条路是官方支持的。** 本插件不实现任何线协议、不重写适配器，所有写入都通过 DSH 官方服务完成：

- `settings.mutate('llm-pi-ai', …)` 写入官方 provider 配置，由官方 schema 校验并即时热注册路由；
- `credentials.set(ref, key)` 写进官方凭据服务；
- 请求实际由官方 `@deepseek-ai/dsh-llm-pi-ai` 适配器发出。

这意味着适配器升级后插件依然有效，也不会和官方 Models 页抢配置。

**面板的安全边界。** 面板通过几个只监听回环地址的 JSON 路由工作，每个路由都校验：连接来自 127.0.0.1、Host 头是本机、浏览器发 Origin 时必须同源。因为这些路由会接触密钥，这道栅栏不是可选项。

## 开发者

```sh
npm test                  # 28 个单元测试：目录合法性、profile 校验、兼容开关栅栏、修复路径
npm run verify-endpoints  # 逐个探测内置端点是否还活着
```

```
.
├── core/providers.js   # 提供商目录（纯数据，无 I/O）
├── core/profile.js     # 构建 / 校验 / 修复 llm-pi-ai profile（纯函数）
├── index.js            # 宿主半侧：回环 JSON 路由，写入官方服务
├── lib/client.js       # 浏览器半侧：设置页「快速接入」面板
└── cordis.patch.yml    # bundle 层：把插件行插进 profile
```

加一家提供商 = 在 `core/providers.js` 里加一个对象。`npm test` 会校验它的 id 是合法路由名、`env` 不与别人冲突、地址是合法 http(s)、每个模型条目能被适配器接受。

`npm run verify-endpoints` 的判定标准值得说明：401 和 403 算**通过**。它们证明路径和线协议都对，只差一把密钥 —— 这正是全新安装时的状态。只有始终拿不到 HTTP 响应的才算失败。

## License

MIT
