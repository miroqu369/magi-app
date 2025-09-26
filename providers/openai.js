class OpenAIProvider {
  constructor() {
    this.key = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!this.key) throw new Error('OPENAI_API_KEY is undefined');
  }
  async chat(prompt, opts = {}) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.1
      })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${text}`);
    const json = JSON.parse(text);
    return json.choices?.[0]?.message?.content ?? '';
  }
}
module.exports = OpenAIProvider;
