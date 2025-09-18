// server.js
import { GoogleAuth } from 'google-auth-library';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT) || 8080;
const host = '0.0.0.0';
app.use(express.json({ limit: '1mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- magi-app 呼び出し（ID トークン） ---------- */
const targetAudience = process.env.API_URL; // 例: https://magi-app-398890937507.asia-northeast1.run.app
if (!targetAudience) {
  console.error('FATAL: API_URL is undefined'); process.exit(1);
}
async function callInternalApi(path, { method = 'POST', body, headers = {} } = {}) {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(targetAudience); // UI 実行 SA で ID トークン
  const url = `${targetAudience}${path}`;
  const res = await client.request({
    url, method,
    headers: { 'Content-Type': 'application/json', ...headers },
    data: body
  });
  return res.data;
}

/* ---------------------- ヘルスチェック / ステータス ---------------------- */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/status', (_req, res) => {
  res.json({
    service: 'magi-ui',
    region: process.env.GOOGLE_CLOUD_REGION || 'unknown',
    api_url: targetAudience
  });
});

/* --------------------------- UI→API 委譲エンドポイント --------------------------- */
app.post('/compare', async (req, res) => {
  try {
    const data = await callInternalApi('/compare', { body: req.body });
    res.json(data);
  } catch (e) {
    const code = e?.response?.status || 500;
    res.status(code).json({ error: e?.message, detail: e?.response?.data });
  }
});

app.post('/consensus', async (req, res) => {
  try {
    const data = await callInternalApi('/consensus', { body: req.body });
    res.json(data);
  } catch (e) {
    const code = e?.response?.status || 500;
    res.status(code).json({ error: e?.message, detail: e?.response?.data });
  }
});

/* ----------------------------- 静的配信 / 画面 ---------------------------- */
app.use('/static', express.static(path.join(__dirname, 'public')));
app.get('/ui', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/', (_req, res) => res.redirect('/ui'));

/* -------------------------------- healthz -------------------------------- */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

/* -------------------------------- listen --------------------------------- */
const port = process.env.PORT || 8080;
const host = '0.0.0.0';

process.on('uncaughtException', (e) => { 
  console.error('uncaughtException', e); 
  process.exit(1); 
});
process.on('unhandledRejection', (e) => { 
  console.error('unhandledRejection', e); 
});

app.listen(port, host, () => {
  console.log(`magi-ui listening on ${host}:${port}`);
});
