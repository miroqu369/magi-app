const el = (s) => document.querySelector(s);
const results = el('#results');
const statusEl = el('#status');

function card(provider, model){
  const id = `card-${provider}`;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'p-4 rounded-xl border bg-white flex flex-col gap-3';
  div.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="font-semibold">${provider}</div>
      <div class="text-xs text-neutral-500 mono">${model || ''}</div>
    </div>
    <pre class="mono whitespace-pre-wrap text-sm" style="min-height:6rem">—</pre>
    <div class="text-xs text-neutral-500"></div>
  `;
  results.appendChild(div);
  return div;
}

function updateCard(div, text, latency, error){
  div.querySelector('pre').textContent = text || (error ? '' : '');
  div.querySelector('div.text-xs').textContent = error ? `error: ${error}` : (latency!=null ? `latency: ${latency} ms` : '');
  if(error){ div.classList.add('border-red-400'); }
}

el('#clear').addEventListener('click', ()=>{ results.innerHTML = ''; statusEl.textContent=''; });

el('#run').addEventListener('click', async ()=>{
  results.innerHTML = '';
  statusEl.textContent = '送信中…';

  const providers = [];
  if(el('#use-openai').checked) providers.push('openai');
  if(el('#use-gemini').checked) providers.push('gemini');
  if(el('#use-xai').checked) providers.push('xai');

  const body = {
    prompt: el('#prompt').value.trim(),
    providers,
    models: {
      openai: el('#model-openai').value.trim() || undefined,
      gemini: el('#model-gemini').value.trim() || undefined,
      xai: el('#model-xai').value.trim() || undefined,
    },
    temperature: Number(el('#temperature').value || 0.2),
    timeout_ms: Number(el('#timeout').value || 25000),
  };
  const maxTokens = Number(el('#maxTokens').value || 0);
  if(maxTokens>0) body.max_tokens = maxTokens;

  if(!body.prompt){
    statusEl.textContent = 'プロンプトが空です。';
    return;
  }

  const cards = {
    openai: card('openai', body.models.openai),
    gemini: card('gemini', body.models.gemini),
    xai: card('xai', body.models.xai),
  };

  try{
    const r = await fetch('/compare', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const isJson = r.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await r.json() : { error: await r.text() };
    if(!r.ok){ statusEl.textContent = `HTTP ${r.status}`; }

    if(data && data.results){
      data.results.forEach(row => {
        const d = cards[row.provider];
        if(!d) return;
        updateCard(d, row.output || '', row.latency_ms ?? null, row.error || null);
      });
      statusEl.textContent = '完了';
    } else {
      statusEl.textContent = 'レスポンス形式が不正です';
    }
  } catch(err){
    statusEl.textContent = '送信に失敗しました';
    console.error(err);
  }
});
