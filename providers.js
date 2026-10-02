// Public provider metadata only. Never put credentials in this file.
globalThis.WENSHU_PROVIDERS = Object.freeze({
  openai: { name: 'OpenAI', mark: 'O', description: 'GPT 与推理模型', baseUrl: 'https://api.openai.com/v1', apiStyle: 'responses', modelsUrl: 'https://api.openai.com/v1/models', keyUrl: 'https://platform.openai.com/api-keys' },
  deepseek: { name: 'DeepSeek', mark: 'D', description: '中文写作与深度思考', baseUrl: 'https://api.deepseek.com', apiStyle: 'chat-completions', modelsUrl: 'https://api.deepseek.com/models', keyUrl: 'https://platform.deepseek.com/api_keys' },
  custom: { name: '其他 / 自定义', description: '私有部署 · 兼容接口', custom: true },
  qwen: { name: '通义千问', mark: '千', description: '阿里云百炼 · 北京地域', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiStyle: 'chat-completions', models: ['qwen-plus', 'qwen-turbo'], keyUrl: 'https://bailian.console.aliyun.com/' }
});
