class GeminiProvider {
  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || 'screen-share-459802';
    this.location = 'us-central1';
  }
  async chat(prompt, opts = {}) {
    // Vertex AI の正しいエンドポイント（streamGenerateContentではなくgenerateContent）
    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/gemini-1.5-flash-002:generateContent`;
    
    // Cloud Runのメタデータサーバーからトークン取得
    const tokenResp = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }
    });
    const { access_token } = await tokenResp.json();
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: opts.temperature ?? 0.2 }
      })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${text}`);
    const json = JSON.parse(text);
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
module.exports = GeminiProvider;
