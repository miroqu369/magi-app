cd ~/magi-app
mv -f server.js server.js.bak 2>/dev/null || true

cat > server.js <<'EOF'
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT) || 8080;
const host = '0.0.0.0';
app.use(express.json({ limit: '1mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* --------------------------- 共通ユーティリティ --------------------------- */
async function httpPostJson(url, { headers = {}, body = {}, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const started = Date.now();
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latency = Date.now() - started;
    const text = await resp.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { ok: resp.ok, status: resp.status, data, text, latency };
  } catch (e) {
    const msg = e?.message || String(e);
    const isAbort = msg.includes('abort') || msg.includes('aborted');
    return { ok: false, status: isAbort ? 504 : 500, data: null, text: msg, latency: null };
  } finally {
    clearTimeout(t);
  }
}

function normalizeText(x) {
  if (!x) return '';
  if (Array.isArray(x)) return x.filter(Boolean).join('\n');
  return String(x);
}

/* ------------------------------ ヘルス/状態 ------------------------------- */
app.get('/healthz', (_ ,res)=>res.status(200).send('ok'));
app.get('/status', (_ ,res) => {
  res.json({
    service: 'magi-app',
    region: process.env.GOOGLE_CLOUD_REGION || 'unknown',
    secretsBound: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      XAI_API_KEY: !!process.env.XAI_API_KEY
    }
  });
});

/* -------------------------------- /ask ----------------------------------- */
app.post('/ask', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });

    const { prompt, model, system, temperature = 0.2, timeout_ms = 30000, max_tokens } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required (string)' });

    const mdl = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const body = {
      model: mdl,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      temperature
    };
    if (max_tokens) body.max_tokens = max_tokens;

    const r = await httpPostJson('https://api.openai.com/v1/chat/completions', {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body,
      timeoutMs: timeout_ms
    });

    if (!r.ok) {
      const msg = r.data?.error?.message || `upstream_error_${r.status}`;
      return res.status(r.status).json({ error: msg, upstream: r.data || r.text });
    }

    const out = r.data?.choices?.[0]?.message?.content ?? '';
    return res.json({ model: r.data?.model || mdl, output: out, usage: r.data?.usage || null });
  } catch (e) {
    const msg = e?.message || String(e);
    const isAbort = msg.includes('abort');
    return res.status(isAbort ? 504 : 500).json({ error: msg });
  }
});

/* ------------------------------ /compare --------------------------------- */
app.post('/compare', async (req, res) => {
  try {
    const { prompt, system, providers, models = {}, temperature = 0.2, timeout_ms = 30000, max_tokens } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required (string)' });
    const targetProviders = (providers && providers.length) ? providers : ['openai','gemini','xai'];
    const tasks = [];

    if (targetProviders.includes('openai')) {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) {
        tasks.push(Promise.resolve({ provider:'openai', model:models.openai||null, output:'', latency_ms:null, error:'OPENAI_API_KEY not set' }));
      } else {
        const mdl = models.openai || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const body = { model: mdl, messages: [ ...(system ? [{ role:'system', content: system }] : []), { role:'user', content: prompt } ], temperature };
        if (max_tokens) body.max_tokens = max_tokens;
        const started = Date.now();
        tasks.push(httpPostJson('https://api.openai.com/v1/chat/completions', {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body, timeoutMs: timeout_ms
        }).then(r => r.ok
          ? { provider:'openai', model:r.data?.model||mdl, output: normalizeText(r.data?.choices?.[0]?.message?.content ?? ''), latency_ms: r.latency ?? (Date.now()-started) }
          : { provider:'openai', model: mdl, output:'', latency_ms: r.latency ?? (Date.now()-started), error: r.data?.error?.message || r.text || `upstream_error_${r.status}` }));
      }
    }

    if (targetProviders.includes('gemini')) {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        tasks.push(Promise.resolve({ provider:'gemini', model:models.gemini||null, output:'', latency_ms:null, error:'GEMINI_API_KEY not set' }));
      } else {
        const mdl = models.gemini || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const body = { model: mdl, contents: [ ...(system ? [{ role:'user', parts:[{ text:`SYSTEM: ${system}` }]}] : []), { role:'user', parts:[{ text: prompt }]} ], generationConfig: { temperature, ...(max_tokens ? { maxOutputTokens:max_tokens } : {}) } };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
        const started = Date.now();
        tasks.push(httpPostJson(url, { body, timeoutMs: timeout_ms }).then(r => r.ok
          ? { provider:'gemini', model: mdl, output: normalizeText((r.data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text)), latency_ms: r.latency ?? (Date.now()-started) }
          : { provider:'gemini', model: mdl, output:'', latency_ms: r.latency ?? (Date.now()-started), error: r.data?.error?.message || r.text || `upstream_error_${r.status}` }));
      }
    }

    if (targetProviders.includes('xai')) {
      const XAI_API_KEY = process.env.XAI_API_KEY;
      if (!XAI_API_KEY) {
        tasks.push(Promise.resolve({ provider:'xai', model:models.xai||null, output:'', latency_ms:null, error:'XAI_API_KEY not set' }));
      } else {
        const mdl = models.xai || process.env.XAI_MODEL || 'grok-2-latest';
        const body = { model: mdl, messages: [ ...(system ? [{ role:'system', content: system }] : []), { role:'user', content: prompt } ], temperature, ...(max_tokens ? { max_tokens } : {}) };
        const started = Date.now();
        tasks.push(httpPostJson('https://api.x.ai/v1/chat/completions', {
          headers: { Authorization: `Bearer ${XAI_API_KEY}` }, body, timeoutMs: timeout_ms
        }).then(r => r.ok
          ? { provider:'xai', model:r.data?.model||mdl, output: normalizeText(r.data?.choices?.[0]?.message?.content ?? ''), latency_ms: r.latency ?? (Date.now()-started) }
          : { provider:'xai', model: mdl, output:'', latency_ms: r.latency ?? (Date.now()-started), error: r.data?.error?.message || r.text || `upstream_error_${r.status}` }));
      }
    }

    const started_at = new Date().toISOString();
    const settled = await Promise.allSettled(tasks);
    const results = settled.map(s => s.status === 'fulfilled' ? s.value : ({ provider:'unknown', model:null, output:'', latency_ms:null, error:s.reason?.message || String(s.reason) }));
    const finished_at = new Date().toISOString();

    const order = { openai:1, gemini:2, xai:3 };
    results.sort((a,b)=> (order[a.provider] ?? 99) - (order[b.provider] ?? 99));

    return res.json({ prompt, started_at, finished_at, results });
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(500).json({ error: msg });
  }
});

/* ------------------------------ consensus -------------------------------- */
function _normForVote(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[。．]/g,'.').trim();}
function majorityVote(answers){const m=new Map();for(const a of answers){const k=_normForVote(a);m.set(k,(m.get(k)||0)+1);}let w=null,c=0;for(const[k,v]of m.entries()){if(v>c){c=v;w=k;}}const ties=[...m.entries()].filter(([_,v])=>v===c).map(([k])=>k);return{winner:w,count:c,ties,totals:Object.fromEntries(m)};}
async function judgeByGPT(prompt,candidates){
  const OPENAI_API_KEY=process.env.OPENAI_API_KEY; if(!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set for judge');
  const JUDGE_MODEL=process.env.JUDGE_MODEL||'gpt-4o';
  const system='You are an impartial judge. Return JSON like {"winner": <index>, "reason": "<short>"}';
  const user=[`User prompt:\n${prompt}`,'Candidates:',...candidates.map((t,i)=>`[${i}] ${t}`),'Rules:','- Pick exactly one index.','- Prefer factual accuracy, internal consistency, and clarity.'].join('\n');
  const r=await httpPostJson('https://api.openai.com/v1/chat/completions',{headers:{Authorization:`Bearer ${OPENAI_API_KEY}`},body:{model:JUDGE_MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:0},timeoutMs:30000});
  if(!r.ok) throw new Error(r.data?.error?.message||`judge_upstream_error_${r.status}`);
  const txt=r.data?.choices?.[0]?.message?.content||''; const m=txt.match(/\{[\s\S]*\}/); if(!m) return{index:0,reason:'fallback'};
  try{const js=JSON.parse(m[0]); return {index:Number(js.winner)||0, reason:String(js.reason||'judge')}}catch{return{index:0,reason:'parse_fallback'};}
}
app.post('/consensus', async (req,res)=>{
  try{
    const {prompt,system,providers,models={},temperature=0.2,timeout_ms=30000,max_tokens}=req.body||{};
    if(!prompt||typeof prompt!=='string') return res.status(400).json({error:'prompt is required (string)'});
    const target=(providers&&providers.length)?providers:['openai','gemini','xai'];
    const tasks=[];
    if(target.includes('openai')){const k=process.env.OPENAI_API_KEY;if(!k){tasks.push(Promise.resolve({provider:'openai',model:models.openai||null,output:'',latency_ms:null,error:'OPENAI_API_KEY not set'}));}
      else{const mdl=models.openai||process.env.OPENAI_MODEL||'gpt-4o-mini';const b={model:mdl,messages:[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}],temperature};if(max_tokens)b.max_tokens=max_tokens;const st=Date.now();
        tasks.push(httpPostJson('https://api.openai.com/v1/chat/completions',{headers:{Authorization:`Bearer ${k}`},body:b,timeoutMs:timeout_ms}).then(r=>r.ok?{provider:'openai',model:r.data?.model||mdl,output:normalizeText(r.data?.choices?.[0]?.message?.content??''),latency_ms:r.latency??(Date.now()-st)}:{provider:'openai',model:mdl,output:'',latency_ms:r.latency??(Date.now()-st),error:r.data?.error?.message||r.text||`upstream_error_${r.status}`}));}}
    if(target.includes('gemini')){const k=process.env.GEMINI_API_KEY;if(!k){tasks.push(Promise.resolve({provider:'gemini',model:models.gemini||null,output:'',latency_ms:null,error:'GEMINI_API_KEY not set'}));}
      else{const mdl=models.gemini||process.env.GEMINI_MODEL||'gemini-1.5-flash';const b={model:mdl,contents:[...(system?[{role:'user',parts:[{text:`SYSTEM: ${system}` }]}]:[]),{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature,...(max_tokens?{maxOutputTokens:max_tokens}:{})}};const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(k)}`;const st=Date.now();
        tasks.push(httpPostJson(url,{body:b,timeoutMs:timeout_ms}).then(r=>r.ok?{provider:'gemini',model:mdl,output:normalizeText((r.data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text)),latency_ms:r.latency??(Date.now()-st)}:{provider:'gemini',model:mdl,output:'',latency_ms:r.latency??(Date.now()-st),error:r.data?.error?.message||r.text||`upstream_error_${r.status}`}));}}
    if(target.includes('xai')){const k=process.env.XAI_API_KEY;if(!k){tasks.push(Promise.resolve({provider:'xai',model:models.xai||null,output:'',latency_ms:null,error:'XAI_API_KEY not set'}));}
      else{const mdl=models.xai||process.env.XAI_MODEL||'grok-2-latest';const b={model:mdl,messages:[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}],temperature,...(max_tokens?{max_tokens}:{})};const st=Date.now();
        tasks.push(httpPostJson('https://api.x.ai/v1/chat/completions',{headers:{Authorization:`Bearer ${k}`},body:b,timeoutMs:timeout_ms}).then(r=>r.ok?{provider:'xai',model:r.data?.model||mdl,output:normalizeText(r.data?.choices?.[0]?.message?.content??''),latency_ms:r.latency??(Date.now()-st)}:{provider:'xai',model:mdl,output:'',latency_ms:r.latency??(Date.now()-st),error:r.data?.error?.message||r.text||`upstream_error_${r.status}`}));}}
    const started_at=new Date().toISOString();
    const settled=await Promise.allSettled(tasks);
    const results=settled.map(s=>s.status==='fulfilled'?s.value:({provider:'unknown',model:null,output:'',latency_ms:null,error:s.reason?.message||String(s.reason)}));
    const finished_at=new Date().toISOString();
    const ok=results.filter(r=>!r.error&&r.output);
    if(ok.length===0){const msg=results.map(r=>`[${r.provider}] ${r.error||'no output'}`).join(' | ');return res.status(502).json({error:`no_valid_answers: ${msg}`,results});}
    let final='',decidedBy='majority',judge=null;
    const vote=majorityVote(ok.map(r=>r.output));
    if(vote.ties.length<=1){final=ok.find(r=>_normForVote(r.output)===vote.winner)?.output||ok[0].output;}
    else{const {index,reason}=await judgeByGPT(prompt,ok.map(r=>r.output));final=ok[index]?.output??ok[0].output;decidedBy='judge';judge={index,reason};}
    const order={openai:1,gemini:2,xai:3};results.sort((a,b)=>(order[a.provider]??99)-(order[b.provider]??99));
    return res.json({prompt,started_at,finished_at,decidedBy,judge,results,final});
  }catch(e){return res.status(500).json({error:e?.message||String(e)});}
});

/* ------------------------------- 静的ホスト ------------------------------- */
app.use('/static', express.static(path.join(__dirname, 'public')));
app.get('/ui', (_req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

/* --------------------------------- root ---------------------------------- */
app.get('/', (_ ,res)=>res.type('text').send('magi-app up'));

/* -------------------------------- listen --------------------------------- */
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('unhandledRejection', e); });
app.listen(port, host, () => console.log(`listening on ${host}:${port}`));
EOF
