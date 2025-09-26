class AnthropicProvider {
  constructor() {
    this.key = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
    if (!this.key) throw new Error('ANTHROPIC_API_KEY is undefined');
  }
  async chat(prompt, opts = {}) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.2
      })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${text}`);
    const json = JSON.parse(text);
    return json.content?.[0]?.text ?? '';
  }
}
module.exports = AnthropicProvider;
