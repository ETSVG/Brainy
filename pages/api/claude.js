const SYMBOLS = {
  NAS100:'NQ=F', XAUUSD:'GC=F', XAGUSD:'SI=F',
  BTCUSD:'BTC-USD', ETHUSD:'ETH-USD', EURUSD:'EURUSD=X',
  GBPUSD:'GBPUSD=X', USDJPY:'USDJPY=X', USDCAD:'USDCAD=X', AUDUSD:'AUDUSD=X'
};

async function fetchMultiTF(marketId) {
  try {
    const sym = SYMBOLS[marketId] || marketId;
    const hdr = {'User-Agent':'Mozilla/5.0'};

    const [r5m, r15m, r1h] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=5m&range=1d`, {headers:hdr}),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=15m&range=3d`, {headers:hdr}),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1h&range=5d`, {headers:hdr})
    ]);

    const parseCandles = async (resp, n) => {
      try {
        const d = await resp.json();
        const result = d.chart?.result?.[0];
        if (!result) return [];
        const ts = result.timestamp || [];
        const q = result.indicators?.quote?.[0] || {};
        return ts.map((t,i) => ({
          dt: new Date(t*1000).toISOString().slice(0,16).replace('T',' '),
          o: q.open?.[i]?.toFixed(2), h: q.high?.[i]?.toFixed(2),
          l: q.low?.[i]?.toFixed(2), c: q.close?.[i]?.toFixed(2)
        })).filter(c=>c.o&&c.h&&c.l&&c.c).slice(-n);
      } catch(e){ return []; }
    };

    const [c5m, c15m, c1h] = await Promise.all([
      parseCandles(r5m, 60),
      parseCandles(r15m, 32),
      parseCandles(r1h, 25)
    ]);

    const closes5m = c5m.map(c => parseFloat(c.c));

    function calcEMA(data, period) {
      if (data.length < period) return null;
      const k = 2 / (period + 1);
      let e = data.slice(0, period).reduce((a,b)=>a+b,0) / period;
      for (let i = period; i < data.length; i++) e = data[i]*k + e*(1-k);
      return parseFloat(e.toFixed(2));
    }

    function calcATR(candles, period=14) {
      if (candles.length < period+1) return null;
      const trs = [];
      for (let i = 1; i < candles.length; i++) {
        const h=parseFloat(candles[i].h), l=parseFloat(candles[i].l), pc=parseFloat(candles[i-1].c);
        trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
      }
      return parseFloat((trs.slice(-period).reduce((a,b)=>a+b,0)/period).toFixed(2));
    }

    const last = c5m[c5m.length-1] || c1h[c1h.length-1];
    const ema9 = calcEMA(closes5m, 9);
    const ema21 = calcEMA(closes5m, 21);
    const ema50 = calcEMA(closes5m, 50);
    const atr14 = calcATR(c5m);

    return {
      price: last?.c,
      c5m, c15m, c1h,
      ema9, ema21, ema50, atr14,
      emaBias: (ema9 && ema21) ? (ema9 > ema21 ? 'HAUSSIER' : 'BAISSIER') : 'NEUTRE',
      high5d: c1h.length ? Math.max(...c1h.map(c=>parseFloat(c.h))).toFixed(2) : null,
      low5d:  c1h.length ? Math.min(...c1h.map(c=>parseFloat(c.l))).toFixed(2) : null,
    };
  } catch(e){ return null; }
}

async function callClaude(apiKey, systemPrompt, userContent, useWebSearch=false, maxTokens=1200) {
  const headers = {
    'Content-Type':'application/json',
    'x-api-key': apiKey,
    'anthropic-version':'2023-06-01',
  };
  if (useWebSearch) headers['anthropic-beta'] = 'web-search-2025-03-05';

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role:'user', content: userContent }]
  };
  if (useWebSearch) body.tools = [{ type:'web_search_20250305', name:'web_search' }];

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

    // Detect market from message
    let marketId = 'NAS100';
    const marketMatch = lastMsg.match(/MARCH[EÉ]:\s*\S+\s*\((\w+)\)/);
    if (marketMatch && SYMBOLS[marketMatch[1]]) {
      marketId = marketMatch[1];
    } else {
      const order = ['XAUUSD','XAGUSD','BTCUSD','ETHUSD','EURUSD','GBPUSD','USDJPY','USDCAD','AUDUSD','NAS100'];
      for (const k of order) {
        if (lastMsg.includes(k)) { marketId = k; break; }
      }
    }

    // === Fetch multi-timeframe OHLC + Macro in parallel ===
    const multiTFPromise = fetchMultiTF(marketId);

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

    const [ohlc, macroData] = await Promise.all([multiTFPromise, macroPromise]);

    // Prepare candle text for each timeframe (concise)
    const fmt1h = ohlc?.c1h?.length
      ? `=== 1H BIAS (${ohlc.c1h.length} bougies) ===\n${ohlc.c1h.map(c=>`${c.dt} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')}`
      : '1H: Indisponible';

    const fmt15m = ohlc?.c15m?.length
      ? `=== 15M STRUCTURE (${Math.min(ohlc.c15m.length,16)} bougies récentes) ===\n${ohlc.c15m.slice(-16).map(c=>`${c.dt} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')}`
      : '15M: Indisponible';

    const fmt5m = ohlc?.c5m?.length
      ? `=== 5M ENTRÉE (${Math.min(ohlc.c5m.length,40)} bougies récentes) ===\n${ohlc.c5m.slice(-40).map(c=>`${c.dt} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join('\n')}`
      : '5M: Indisponible';

    const emaBiasStr = ohlc?.ema9 && ohlc?.ema21
      ? (ohlc.ema9 > ohlc.ema21 ? `HAUSSIER (EMA9:${ohlc.ema9} > EMA21:${ohlc.ema21})` : `BAISSIER (EMA9:${ohlc.ema9} < EMA21:${ohlc.ema21})`)
      : 'N/A';

    const indicators = ohlc
      ? `Prix actuel: ${ohlc.price} | EMA9(5M): ${ohlc.ema9} | EMA21(5M): ${ohlc.ema21} | EMA50(5M): ${ohlc.ema50}
ATR14(5M): ${ohlc.atr14} | Biais EMA: ${emaBiasStr}
Haut 5j: ${ohlc.high5d} | Bas 5j: ${ohlc.low5d}`
      : 'Indicateurs indisponibles';

    // === ICT Silver Bullet 5M Scalping Analysis ===
    const techData = await callClaude(
      apiKey,
      `Tu es un expert ICT (Inner Circle Trader) spécialisé en SCALPING 5 MINUTES. Réponds UNIQUEMENT en JSON valide. Commence par {.

STRATÉGIE ICT SILVER BULLET 5M — RÈGLES STRICTES:

PHASE 1 — BIAIS HTF (1H):
• Bullish: HH+HL structure → chercher LONG seulement
• Bearish: LH+LL structure → chercher SHORT seulement
• Range 1H: signal WAIT obligatoire

PHASE 2 — CONFIRMATION 15M:
• CHoCH (Change of Character) confirmé dans direction du biais 1H
• OU BOS (Break of Structure) 15M
• FVG 15M dans la zone d'intérêt
• Sans confirmation 15M: signal WAIT

PHASE 3 — ENTRÉE 5M (Silver Bullet):
• Displacement candle 5M fort (≥2×ATR de corps) dans direction du biais
• FVG créé après displacement → entrée au pullback 50% du FVG
• OU Order Block 5M (dernière bougie haussière avant drop / baissière avant pump) → retest
• EMA9>EMA21 = confirme LONG | EMA9<EMA21 = confirme SHORT
• Stop Loss: sous/sur swing low/high 5M le plus récent + 0.3×ATR buffer
• Take Profit: prochain OB ou liquidity pool HTF | R:R minimum 1:2

KILL ZONES SCALPING 5M (Heure Maroc — PRIORITAIRES):
• London Open: 09h00-10h30 = MEILLEUR setup du jour (volatilité + liquidité maximales)
• New York Open: 14h30-16h00 = MEILLEUR setup NY (continuation ou reversal)
• London Close: 10h30-11h30 = secondaire (reversals possibles)
• NY Lunch Reversal: 12h00-13h00 = secondaire uniquement

SIGNAL WAIT obligatoire si:
• Hors Kill Zone ET pas de setup exceptionnel (FVG + CHoCH alignés parfaitement)
• News HIGH impact dans les 30 prochaines minutes
• EMA9 ≈ EMA21 (écart <0.5%) = range = pas de biais clair
• Pas de CHoCH 15M confirmé
• Pas de displacement 5M clair
• Structure 1H en range`,
      `Marché: ${marketId}. Heure Maroc: ${now}.

${indicators}

${fmt1h}

${fmt15m}

${fmt5m}

Génère le signal de scalping 5M en JSON complet:
{"direction":"LONG|SHORT|WAIT","currentPrice":"${ohlc?.price||'N/A'}","entry":"niveau précis (FVG 50% ou OB 5M)","stopLoss":"SL précis (swing + ATR buffer)","takeProfit":"TP précis (1:2 min, cibler OB HTF ou liquidity)","riskReward":"1:X","confidence":"HIGH|MEDIUM|LOW","technical":{"trend1H":"Bullish|Bearish|Range","orderBlock1H":"zone OB 1H dominant","choch15m":"Confirmé|Non confirmé","fvg15m":"Présent zone XX-YY|Absent","orderBlock5m":"zone OB 5M précis ou N/A","fvg5m":"zone FVG 5M ou N/A","displacement5m":"Haussier|Baissier|Absent","emaAlignment":"EMA9>EMA21 Bullish|EMA9<EMA21 Bearish|Neutre","ema9":"${ohlc?.ema9||'N/A'}","ema21":"${ohlc?.ema21||'N/A'}","atr14":"${ohlc?.atr14||'N/A'}","slDistance":"distance numérique en points","entryType":"FVG Retracement|OB Retest|Liquidity Sweep","reason":"explication complète du setup 5M"},"killZone":"active|inactive","sessionStatus":"optimal|hors session","waitReason":"si WAIT: raison précise en français"}`
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

    const slDist = parseFloat(techJson.technical?.slDistance)
      || (ohlc?.atr14 ? parseFloat(ohlc.atr14)*2.5 : 50);
    const pvMap = {NAS100:1,XAUUSD:10,XAGUSD:50,BTCUSD:0.1,ETHUSD:1,EURUSD:10,GBPUSD:10,USDJPY:1,USDCAD:10,AUDUSD:10};
    const pv = pvMap[marketId] || 1;
    const rrRatio = parseFloat(techJson.riskReward?.replace('1:','')) || 2;

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
      technical: {
        // HTF fields
        trend1H: techJson.technical?.trend1H,
        orderBlock: techJson.technical?.orderBlock1H,
        obType: techJson.technical?.trend1H?.includes('Bullish') ? 'Bullish' : 'Bearish',
        choch: techJson.technical?.choch15m,
        fvg: techJson.technical?.fvg15m,
        // 5M scalping fields
        orderBlock5m: techJson.technical?.orderBlock5m,
        fvg5m: techJson.technical?.fvg5m,
        displacement5m: techJson.technical?.displacement5m,
        emaAlignment: techJson.technical?.emaAlignment,
        ema9: ohlc?.ema9 || techJson.technical?.ema9,
        ema21: ohlc?.ema21 || techJson.technical?.ema21,
        atr14: ohlc?.atr14 || techJson.technical?.atr14,
        entryType: techJson.technical?.entryType,
        slDistance: String(slDist),
        entry: techJson.entry,
        stopLoss: techJson.stopLoss,
        takeProfit: techJson.takeProfit,
        riskReward: techJson.riskReward,
        reason: techJson.technical?.reason,
      },
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
        lotSize: (80/(slDist*pv)).toFixed(2)+' lots',
        riskAmount: '80',
        rewardAmount: String(Math.round(80*rrRatio))
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
