const SYSTEM_PROMPT = `你在帮一个完全不懂英语的中国初学者学习和理解文字。
所有解释用中文；不要用语法术语，必须用时立刻用大白话解释；
如果输入是英文，解释中文含义、自然翻译和关键用法；
如果输入是中文，给出自然英文表达并解释怎么造句；
回答要简洁清楚，不要 markdown 表格。`;

function buildUserPrompt(text) {
  return `请解释或翻译下面这段选中文本：\n\n${text}`;
}

function endpoint(baseURL) {
  return baseURL.replace(/\/+$/, '') + '/chat/completions';
}

async function streamChatCompletion(config, text, handlers = {}) {
  const response = await fetch(endpoint(config.baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(text) }
      ],
      temperature: 0.3,
      max_tokens: 900,
      stream: true
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LLM HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('LLM response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          handlers.onDelta?.(delta, fullText);
        }
      }
    }
  }

  handlers.onDone?.(fullText);
  return fullText;
}

module.exports = {
  streamChatCompletion
};
