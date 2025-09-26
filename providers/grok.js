class GrokProvider {
  constructor() {
    this.key = process.env.XAI_API_KEY;
    this.base = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
    this.model = process.env.XAI_MODEL || 'grok-2';
    if (!this.key) throw new Error('XAI_API_KEY is undefined');
  }
  async ping() {
    const resp = await fetch(`${this.base}/models`, {
      headers: { 'Authorization': `Bearer ${this.key}` }
    });
    if (!resp.ok) throw new Error(`xAI ping ${resp.status}`);
    return true;
  }
  async chat(prompt, opts = {}) {
    const resp = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.2
      })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`xAI ${resp.status}: ${text}`);
    const json = JSON.parse(text);
    return json.choices?.[0]?.message?.content ?? '';
  }
}
module.exports = GrokProvider;
