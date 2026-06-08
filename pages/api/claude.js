const SYMBOLS = {
  NAS100:'NQ=F', XAUUSD:'GC=F', XAGUSD:'SI=F',
  BTCUSD:'BTC-USD', ETHUSD:'ETH-USD', EURUSD:'EURUSD=X',
  GBPUSD:'GBPUSD=X', USDJPY:'USDJPY=X', USDCAD:'USDCAD=X', AUDUSD:'AUDUSD=X'
};

async function fetchOHLC(marketId) {
  try {
    const sym = SYMBOLS[marketId] || marketId;
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1h&range=5d`,
      { headers:{'User-Agent':'Mozilla/5.0'} }
    );
    const d = await r.json();
    const result = d.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const candles = ts.map((t,i) => ({
      dt: new Date(t*1000).toISOString().slice(0,16).replace('T',' '),
      o: q.open?.[i]?.toFixed(2), h: q.high?.[i]?.toFixed(2),
      l: q.low?.[i]?.toFixed(2), c: q.close?.[i]?.toFixed(2)
    })).filter(c=>c.o&&c.h&&c.l&&c.c).slice(-25);
    const last = candles[candles.length-1];
    const highs = candles.map(c=>parseFloat(c.h));
    const lows = candles.map(c=>parseFloat(c.l));
    return {
      price: last?.c,
      candles,
      high5d: Math.max(...highs).toFixed(2),
      low5d: Math.min(...lows).toFixed(2)
    };
  } catch(e){ return null; }
}

async function callClaude(apiKey, systemPrompt, userContent, useWebSearch=false) {
  const headers = {
    'Content-Type':'application/json',
    'x-api-key': apiKey,
    'anthropic-version':'2023-06-01',
  };
  if (useWebSearch) headers['anthropic-beta'] = 'web-search-2025-03-05';

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role:'user', content: userContent }]
  };
  if (useWebSearch) {
    body.tools = [{ type:'web_search_20250305', name:'web_search' }];
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers, body: JSON.stringify(body)
  });
  return r.json();
}

function extractText(data) {
  if (!data?.content) return '';
  return data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    const messages = body.messages || [];
    const lastMsg = messages[messages.length-1]?.content || '';
    const now = new Date().toISOString();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Detect market
    let marketId = 'NAS100';
    for (const k of Object.keys(SYMBOLS)) {
      if (lastMsg.includes(k)) { marketId = k; break; }
    }

    // === PILIER 1 : Fetch OHLC (parallel) ===
    const ohlcPromise = fetchOHLC(marketId);

    // === PILIER 2+3 : Macro + Institutions (web search, short prompt) ===
    const macroPromise = callClaude(
      apiKey,
      "Tu es analyste macro. Réponds UNIQUEMENT en JSON valide. Commence par {.",
      `Date: ${now}. Marché: ${marketId}.
Cherche en 2 recherches max:
1. Événements économiques importants aujourd'hui/cette semaine (Fed, CPI, NFP, PIB)
2. Pour ${marketId==='NAS100'?'Apple/Nvidia/Microsoft/Amazon/Google/Meta: earnings ce soir, news importantes, pré-market':'ce marché: news importantes du jour'}

JSON format:
{"fed":{"stance":"HAWKISH|DOVISH|NEUTRAL","info":"courte description"},"calendar":[{"event":"nom","date":"date","impact":"HIGH|MEDIUM|LOW","direction":"BULLISH|BEARISH|NEUTRAL"}],"institutions":{"topMover":"string","earnings":"description","premarket":"description","bias":"BULLISH|BEARISH|NEUTRAL"},"geopolitics":"résumé court","newsWarning":"alerte si HIGH dans 30min ou null","macroBias":"BULLISH|BEARISH|NEUTRAL"}`,
      true
    );

    // Wait for both in parallel
    const [ohlc, macroData] = await Promise.all([ohlcPromise, macroPromise]);

    // === PILIER 1 : Technical Analysis with OHLC ===
    const candlesTxt = ohlc
      ? `Prix: ${ohlc.price} | Haut 5j: ${ohlc.high5d} | Bas 5j: ${ohlc.low5d}\nBougies 1H:\n${ohlc.candles.map(c=>`${c.dt} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')}`
      : 'Données indisponibles';

    const techData = await callClaude(
      apiKey,
      "Tu es analyste ICT expert. Analyse les bougies et réponds UNIQUEMENT en JSON valide. Commence par {.",
      `Marché: ${marketId}. Heure Maroc: ${now}.
Kill Zones: Londres 09h-11h, New York 15h-17h (heure Maroc).

${candlesTxt}

Analyse et génère:
{"direction":"LONG|SHORT|WAIT","currentPrice":"${ohlc?.price||'N/A'}","entry":"niveau précis","stopLoss":"SL précis","takeProfit":"TP précis (1:3 min)","riskReward":"1:X","confidence":"HIGH|MEDIUM|LOW","technical":{"trend1H":"Bullish|Bearish|Range","orderBlock":"zone OB ex: 19800-19850","obType":"Bullish|Bearish","choch":"Confirmé|Non confirmé","fvg":"Présent|Absent","slDistance":"distance","reason":"explication courte"},"killZone":"active|inactive","sessionStatus":"optimal|hors session","waitReason":"si WAIT: raison précise"}`
    );

    // Parse both responses
    let macroJson = {};
    let techJson = {};

    try {
      let mt = extractText(macroData).replace(/```json|```/g,'').trim();
      const ms = mt.indexOf('{'), me = mt.lastIndexOf('}');
      if (ms!==-1&&me!==-1) macroJson = JSON.parse(mt.substring(ms,me+1));
    } catch(e){}

    try {
      let tt = extractText(techData).replace(/```json|```/g,'').trim();
      const ts2 = tt.indexOf('{'), te = tt.lastIndexOf('}');
      if (ts2!==-1&&te!==-1) techJson = JSON.parse(tt.substring(ts2,te+1));
    } catch(e){}

    // Merge into final signal
    const finalSignal = {
      market: marketId,
      direction: techJson.direction || 'WAIT',
      currentPrice: ohlc?.price || techJson.currentPrice || 'N/A',
      confidence: techJson.confidence || 'LOW',
      killZone: techJson.killZone || 'inactive',
      entry: techJson.entry,
      stopLoss: techJson.stopLoss,
      takeProfit: techJson.takeProfit,
      riskReward: techJson.riskReward,
      technical: techJson.technical || {},
      macro: {
        fed: macroJson.fed?.stance ? `${macroJson.fed.stance} — ${macroJson.fed.info}` : 'N/A',
        calendar: macroJson.calendar?.map(e=>`${e.event} (${e.date}) - ${e.impact}`).join(', ') || 'N/A',
        geopolitics: macroJson.geopolitics || 'N/A',
        newsWarning: macroJson.newsWarning || null,
        macroBias: macroJson.macroBias || 'NEUTRAL'
      },
      institutions: {
        topMover: macroJson.institutions?.topMover || 'N/A',
        premarket: macroJson.institutions?.premarket || 'N/A',
        earnings: macroJson.institutions?.earnings || 'N/A',
        aiNews: 'N/A',
        institutionalBias: macroJson.institutions?.bias || 'NEUTRAL',
        reason: macroJson.institutions?.topMover || 'N/A'
      },
      riskManagement: {
        lotSize: (()=>{const d=parseFloat(techJson.technical?.slDistance)||50;const pv={NAS100:1,XAUUSD:10,XAGUSD:50,BTCUSD:0.1,ETHUSD:1,EURUSD:10,GBPUSD:10,USDJPY:1,USDCAD:10,AUDUSD:10};return (80/((d)*(pv[marketId]||1))).toFixed(2)+' lots';})(),
        riskAmount: '80',
        rewardAmount: '240'
      },
      waitReason: techJson.waitReason || null
    };

    return res.status(200).json({
      content: [{ type:'text', text: JSON.stringify(finalSignal) }]
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
