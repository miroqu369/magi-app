'use strict';
const express = require('express');
const path = require('path');
const app = global.app || express();

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// プロバイダー読み込み
const GrokProvider = require('./providers/grok.js');
const GeminiProvider = require('./providers/gemini.js');
const AnthropicProvider = require('./providers/anthropic.js');
const OpenAIProvider = require('./providers/openai.js');

// Grok疎通確認
app.post('/api/grok/ping', async (req, res) => {
  try {
    const grok = new GrokProvider();
    await grok.ping();
    const text = await grok.chat('Hello', { temperature: 0.2 });
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 合議エンドポイント
app.post('/api/consensus', async (req, res) => {
  try {
    const { prompt, meta = {} } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const timeout = meta.timeout_ms || 25000;
    const temperature = meta.temperature ?? 0.2;

    const grok = new GrokProvider();
    const gemini = new GeminiProvider();
    const anthropic = new AnthropicProvider();

    const results = await Promise.allSettled([
      grok.chat(prompt, { temperature }).then(text => ({ provider: 'grok', ok: true, text })),
      gemini.chat(prompt, { temperature }).then(text => ({ provider: 'gemini', ok: true, text })),
      anthropic.chat(prompt, { temperature }).then(text => ({ provider: 'claude', ok: true, text }))
    ]);

    const candidates = results.map(r => 
      r.status === 'fulfilled' ? r.value : { provider: 'unknown', ok: false, error: r.reason?.message }
    );

    const successTexts = candidates.filter(c => c.ok).map(c => c.text);
    let agreement = 0;
    if (successTexts.length >= 2) {
      const pairs = [];
      for (let i = 0; i < successTexts.length; i++) {
        for (let j = i + 1; j < successTexts.length; j++) {
          pairs.push(similarity(successTexts[i], successTexts[j]));
        }
      }
      agreement = pairs.reduce((a, b) => a + b, 0) / pairs.length;
    }

    let final = successTexts[0] || 'No answer';
    let judge = null;

    if (agreement < 0.66 && successTexts.length >= 2) {
      const openai = new OpenAIProvider();
      const judgePrompt = `以下の3つのAI回答を比較し、最も適切な回答を選んでJSON形式で返してください。
必ず以下の形式で返してください：
{
  "winner": "grok" or "gemini" or "claude",
  "reason": "選んだ理由",
  "final": "最終的な回答文"
}

回答1 (Grok): ${candidates[0]?.text || 'N/A'}
回答2 (Gemini): ${candidates[1]?.text || 'N/A'}
回答3 (Claude): ${candidates[2]?.text || 'N/A'}`;

      const judgeText = await openai.chat(judgePrompt, { temperature: 0.1 });
      const match = judgeText.match(/\{[\s\S]*\}/);
      if (match) {
        judge = JSON.parse(match[0]);
        final = judge.final || final;
        judge.model = 'gpt-4o-mini';
      }
    }

    res.json({
      final,
      judge,
      candidates,
      metrics: { agreement_ratio: agreement }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function similarity(a, b) {
  const words1 = new Set(a.toLowerCase().split(/\s+/));
  const words2 = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  return intersection / Math.max(words1.size, words2.size);
}
