// Symbols mapping for Yahoo Finance
const SYMBOLS = {
  NAS100: 'NQ=F', XAUUSD: 'GC=F', XAGUSD: 'SI=F',
  BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD', EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X', USDCAD: 'USDCAD=X', AUDUSD: 'AUDUSD=X'
};

async function getLivePrice(marketId) {
  try {
    const sym = SYMBOLS[marketId] || marketId;
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=5m&range=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const d = await r.json();
    const meta = d.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      price: meta.regularMarketPrice,
      prevClose: meta.previousClose || meta.chartPreviousClose,
      change: meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose),
      changePct: (((meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose)) / (meta.previousClose || meta.chartPreviousClose)) * 100).toFixed(2)
    };
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    const messages = body.messages || [];

    // Extract market ID from the last message
    const lastMsg = messages[messages.length - 1]?.content || '';
    let marketId = 'NAS100';
    for (const [k] of Object.entries(SYMBOLS)) {
      if (lastMsg.includes(k)) { marketId = k; break; }
    }

    // Fetch live price
    const priceData = await getLivePrice(marketId);
    const priceInfo = priceData
      ? `PRIX LIVE: ${priceData.price} | Variation: ${priceData.change > 0 ? '+' : ''}${priceData.change?.toFixed(2)} (${priceData.changePct}%) | Clôture précédente: ${priceData.prevClose}`
      : 'Prix indisponible (utilise tes connaissances)';

    // Build enhanced messages with live price
    const enhancedMessages = messages.map((m, i) => {
      if (i === messages.length - 1) {
        return {
          role: m.role,
          content: `${m.content}\n\n=== DONNÉES LIVE INJECTÉES ===\n${priceInfo}\nHeure: ${new Date().toISOString()}`
        };
      }
      return { role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
    });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: "Tu es un analyste trading professionnel ICT. Tu as accès aux données live fournies dans le message. Réponds TOUJOURS en JSON valide uniquement. Commence par { et termine par }.",
        messages: enhancedMessages,
      }),
    });

    const data = await r.json();

    // Extract JSON from response
    if (data.content?.[0]?.text) {
      let text = data.content[0].text.replace(/```json|```/g, '').trim();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        data.content[0].text = text.substring(start, end + 1);
      }
    }

    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
