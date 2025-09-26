'use strict';
const express = require('express');

global.app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/status', (_req, res) => {
  res.json({
    service: 'magi-app',
    time: new Date().toISOString(),
    secrets: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      XAI_API_KEY: !!process.env.XAI_API_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY
    }
  });
});

try { require('./server.js'); } catch (e) { console.error('server.js load error:', e); }

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => console.log(`MAGI System listening on :${port}`));
