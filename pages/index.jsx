import { useState, useEffect, useRef, useCallback } from "react";

// ── Helpers ───────────────────────────────────────────────────
const MO = 1;
const getMT = () => { const n=new Date(), u=n.getTime()+n.getTimezoneOffset()*60000; return new Date(u+MO*3600000); };

const ACCOUNT_TYPES = {
  "1step": {
    label: "FTMO 1-Step", steps: 1, dailyLossPct: 0.03, maxLossPct: 0.10,
    profitTargetPct: 0.10, trailing: true, bestDay: true, payout: 90,
    color: "#a855f7", phase2TargetPct: null
  },
  "2step": {
    label: "FTMO 2-Step", steps: 2, dailyLossPct: 0.05, maxLossPct: 0.10,
    profitTargetPct: 0.10, trailing: false, bestDay: false, payout: 80,
    color: "#00d4ff", phase2TargetPct: 0.05
  }
};
const SIZES = [10000,25000,50000,100000,200000];

const MARKETS = [
  {id:"NAS100",label:"NAS100",icon:"📈"},
  {id:"XAUUSD",label:"Gold",icon:"🥇"},
  {id:"XAGUSD",label:"Silver",icon:"🥈"},
  {id:"BTCUSD",label:"Bitcoin",icon:"₿"},
  {id:"ETHUSD",label:"Ethereum",icon:"⟠"},
  {id:"EURUSD",label:"EUR/USD",icon:"💶"},
  {id:"GBPUSD",label:"GBP/USD",icon:"💷"},
  {id:"USDJPY",label:"USD/JPY",icon:"💴"},
  {id:"USDCAD",label:"USD/CAD",icon:"🍁"},
  {id:"AUDUSD",label:"AUD/USD",icon:"🦘"},
];

const NAV = [
  {id:"signal",icon:"⚡",label:"Signal"},
  {id:"trades",icon:"📊",label:"Trades"},
  {id:"fundamental",icon:"🔬",label:"Analyse"},
  {id:"risk",icon:"💰",label:"Risk"},
  {id:"dashboard",icon:"🏠",label:"Dashboard"},
  {id:"setup",icon:"⚙️",label:"Compte"},
];

const notifColors = {info:"#3b82f6",success:"#10b981",warning:"#f59e0b",danger:"#ef4444"};
const dirColor = d => d==="LONG"?"#10b981":d==="SHORT"?"#ef4444":"#f59e0b";
const confColor = c => c==="HIGH"?"#10b981":c==="MEDIUM"?"#f59e0b":"#ef4444";
const fmt = n => typeof n==="number" ? (n>=0?"+":"")+n.toFixed(0)+"$" : n;

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  // Account config
  const [accountType, setAccountType] = useState(null);
  const [accountSize, setAccountSize] = useState(10000);
  const [phase, setPhase] = useState(1);
  const [accountStatus, setAccountStatus] = useState("evaluation"); // "evaluation" | "funded"

  // Derived account rules
  const rules = accountType ? (() => {
    const a = ACCOUNT_TYPES[accountType];
    const target = phase===2 && a.phase2TargetPct
      ? accountSize * a.phase2TargetPct
      : accountSize * a.profitTargetPct;
    const rpt = Math.round(accountSize * 0.008);
    return {
      ...a,
      dailyLoss: Math.round(accountSize * a.dailyLossPct),
      maxLoss: Math.round(accountSize * a.maxLossPct),
      profitTarget: target,
      riskPerTrade: rpt,
      rewardPerTrade: rpt * 3,
      isFunded: accountStatus === "funded",
      // Best Day rule: active on 1-step BOTH in evaluation AND funded (payout-gated)
      bestDay: a.bestDay, // always true for 1-step, false for 2-step
    };
  })() : null;

  // Trading state
  const [tab, setTab] = useState("setup");
  const [market, setMarket] = useState(MARKETS[0]);
  const [loading, setLoading] = useState(false);
  const [pendingSignal, setPendingSignal] = useState(null);
  const [openTrades, setOpenTrades] = useState([]);
  const [closedTrades, setClosedTrades] = useState([]);
  const [checking, setChecking] = useState(null);
  // Multiple challenges
  const [challenges, setChallenges] = useState([]);
  const [activeChallengeId, setActiveChallengeId] = useState(null);
  const [showAddChallenge, setShowAddChallenge] = useState(false);
  const [newChalName, setNewChalName] = useState("");
  // Risk management
  const [rmMarket, setRmMarket] = useState(MARKETS[0]);
  const [rmEntry, setRmEntry] = useState("");
  const [rmSL, setRmSL] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [now, setNow] = useState(getMT());
  // Fundamental analysis state
  const [fundMarket, setFundMarket] = useState(MARKETS[0]);
  const [fundData, setFundData] = useState({});
  const [fundLoading, setFundLoading] = useState(false);
  const notifId = useRef(0);
  const shownAlerts = useRef(new Set());
  const milestoneFired = useRef(new Set());

  useEffect(() => { const t=setInterval(()=>setNow(getMT()),1000); return()=>clearInterval(t); },[]);

  const push = useCallback((msg, type="info", sticky=false) => {
    const id = ++notifId.current;
    setNotifications(n=>[{id,msg,type,time:getMT().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})},...n.slice(0,29)]);
    if(!sticky) setTimeout(()=>setNotifications(n=>n.filter(x=>x.id!==id)),7000);
  },[]);

  // Session alerts
  useEffect(()=>{
    const h=now.getHours(),m=now.getMinutes(),k=`${h}:${m}`;
    const a=(l,msg,t)=>{ if(!shownAlerts.current.has(l+k)){shownAlerts.current.add(l+k);push(msg,t,true);} };
    if(h===8&&m===45) a("l1","🇬🇧 Session Londres dans 15 min — Prépare-toi !","info");
    if(h===9&&m===0)  a("l2","🇬🇧 SESSION LONDRES OUVERTE","success");
    if(h===14&&m===45) a("n1","🇺🇸 Session New York dans 15 min !","info");
    if(h===15&&m===0)  a("n2","🇺🇸 SESSION NY OUVERTE — Meilleure session !","success");
    if(h===23&&m===30) a("mid","⚠️ Ferme toutes positions avant minuit CET !","danger");
  },[now,push]);

  // Stats
  const todayStr = now.toDateString();
  const todayTrades = closedTrades.filter(t=>new Date(t.closedAt).toDateString()===todayStr);
  const todayWins = todayTrades.filter(t=>t.result==="TP").length;
  const todayLosses = todayTrades.filter(t=>t.result==="SL").length;
  const todayProfit = rules ? todayWins*rules.rewardPerTrade - todayLosses*rules.riskPerTrade : 0;
  const totalProfit = rules ? closedTrades.reduce((s,t)=>s+(t.result==="TP"?rules.rewardPerTrade:-rules.riskPerTrade),0) : 0;
  const progress = rules ? Math.min((totalProfit/rules.profitTarget)*100,100) : 0;
  const dailyLossUsed = rules ? todayLosses*rules.riskPerTrade : 0;

  // Milestone notifications
  useEffect(()=>{
    if(!rules) return;
    const fire=(key,msg,type)=>{ if(!milestoneFired.current.has(key)){milestoneFired.current.add(key);push(msg,type,true);} };
    if(dailyLossUsed>=rules.dailyLoss*0.66) fire("warn66","⚠️ Tu as utilisé 66% de ta limite journalière !","warning");
    if(todayLosses>=2) fire("stop2","🛑 2 TRADES PERDANTS AUJOURD'HUI — ARRÊTE DE TRADER !","danger");
    if(progress>=100) fire("done","🎉 FÉLICITATIONS ! Challenge FTMO réussi ! Demande ton payout !","success");
    if(progress>=50&&progress<100) fire("half","🔥 50% de l'objectif atteint ! Continue !","info");
    if(rules.bestDay){
      const positiveDays = [...new Set(closedTrades.filter(t=>t.result==="TP").map(t=>new Date(t.closedAt).toDateString()))];
      const totalPos = rules ? closedTrades.filter(t=>t.result==="TP").length*rules.rewardPerTrade : 0;
      if(todayWins*rules.rewardPerTrade > totalPos*0.5 && totalPos>0)
        fire("bestday"+todayStr,"⚠️ Règle 50% Best Day proche — Arrête de trader aujourd'hui !","warning");
    }
  },[todayLosses,dailyLossUsed,progress,rules,todayWins,closedTrades,todayStr,push]);

  // ── Challenge management ─────────────────────────────────
  function addChallenge(){
    if(!accountType) return;
    const id = Date.now();
    const newC = {
      id, name: newChalName || `Challenge ${challenges.length+1}`,
      accountType, accountSize, phase,
      status: "evaluation", // evaluation | funded
      startDate: new Date().toLocaleDateString("fr-FR"),
      totalProfit: 0, wins: 0, losses: 0
    };
    setChallenges(c=>[...c, newC]);
    setActiveChallengeId(id);
    setShowAddChallenge(false);
    setNewChalName("");
    push(`✅ Challenge "${newC.name}" ajouté !`, "success");
  }
  function toggleChallengeStatus(id){
    setChallenges(cs=>cs.map(c=>c.id===id?{...c,status:c.status==="evaluation"?"funded":"evaluation"}:c));
  }
  function removeChallenge(id){
    setChallenges(cs=>cs.filter(c=>c.id!==id));
    if(activeChallengeId===id) setActiveChallengeId(null);
  }

  // ── Risk calculator ──────────────────────────────────────
  const PIP_VALUES = {
    NAS100:{name:"NAS100",unit:"points",pipVal:1},
    XAUUSD:{name:"Gold",unit:"$",pipVal:10},
    XAGUSD:{name:"Silver",unit:"$",pipVal:50},
    BTCUSD:{name:"Bitcoin",unit:"$",pipVal:0.1},
    ETHUSD:{name:"Ethereum",unit:"$",pipVal:1},
    EURUSD:{name:"EUR/USD",unit:"pips",pipVal:10},
    GBPUSD:{name:"GBP/USD",unit:"pips",pipVal:10},
    USDJPY:{name:"USD/JPY",unit:"pips",pipVal:1000},
    USDCAD:{name:"USD/CAD",unit:"pips",pipVal:10},
    AUDUSD:{name:"AUD/USD",unit:"pips",pipVal:10},
  };
  const rmCalc = (() => {
    if(!rules||!rmEntry||!rmSL) return null;
    const entry = parseFloat(rmEntry), sl = parseFloat(rmSL);
    if(isNaN(entry)||isNaN(sl)||entry===sl) return null;
    const slDist = Math.abs(entry-sl);
    const pv = PIP_VALUES[rmMarket.id];
    const lots = (rules.riskPerTrade/(slDist*pv.pipVal));
    const tp1 = entry>sl ? entry+slDist*3 : entry-slDist*3;
    const maxDailyTrades = Math.floor(rules.dailyLoss/rules.riskPerTrade);
    const maxDailyGain = rules.bestDay ? Math.round(rules.profitTarget*0.45) : rules.rewardPerTrade*maxDailyTrades;
    return {
      lots: lots.toFixed(2), slDist: slDist.toFixed(2),
      riskAmt: rules.riskPerTrade, rewardAmt: rules.rewardPerTrade,
      tp1: tp1.toFixed(2), unit: pv.unit,
      maxDailyTrades, maxDailyGain,
      maxDailyLoss: rules.dailyLoss,
      maxTotalLoss: rules.maxLoss,
      maxSL: (rules.riskPerTrade/pv.pipVal).toFixed(2),
    };
  })();

  // ── Fetch Fundamental Analysis ───────────────────────────
  async function fetchFundamental(mkt){
    const key = mkt.id;
    if(fundData[key]) return; // already loaded
    setFundLoading(true);
    try {
      const d = getMT().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
      const res = await fetch("/api/claude",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1500,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          messages:[{role:"user",content:`Tu es analyste fondamental senior. Date: ${d}. Marché analysé: ${mkt.label} (${mkt.id}).

Recherche et analyse en temps réel:
1. Calendrier économique du jour et cette semaine (événements impactant ${mkt.label})
2. Dernières décisions et stratégie de la Fed (taux, discours, projections)
3. Actualités géopolitiques importantes (conflits, sanctions, tensions)
4. News importantes récentes impactant ${mkt.label}

Pour chaque événement donne: degré d'impact, probabilité d'impact en %, et direction probable (haussier/baissier/neutre sur ${mkt.label}) avec explication.

JSON UNIQUEMENT sans backticks ni markdown:
{
  "market":"${mkt.label}",
  "lastUpdated":"heure actuelle",
  "overallBias":"BULLISH"|"BEARISH"|"NEUTRAL",
  "overallSummary":"résumé global en 2 phrases",
  "calendar":[{"date":"date","time":"heure","event":"nom","country":"🇺🇸","impact":"HIGH"|"MEDIUM"|"LOW","impactProb":85,"direction":"BULLISH"|"BEARISH"|"NEUTRAL","directionExplain":"comment ça impacte ${mkt.label}"}],
  "fed":{"stance":"HAWKISH"|"DOVISH"|"NEUTRAL","lastDecision":"description","nextMeeting":"date","impactOn${mkt.id.replace('/','_')}":"explication impact","impactProb":75,"direction":"BULLISH"|"BEARISH"|"NEUTRAL"},
  "geopolitics":[{"title":"titre","summary":"résumé court","impact":"HIGH"|"MEDIUM"|"LOW","impactProb":60,"direction":"BULLISH"|"BEARISH"|"NEUTRAL","directionExplain":"impact sur ${mkt.label}"}],
  "topNews":[{"title":"titre","source":"source","summary":"résumé","impact":"HIGH"|"MEDIUM"|"LOW","impactProb":70,"direction":"BULLISH"|"BEARISH"|"NEUTRAL","directionExplain":"impact sur ${mkt.label}"}]
}`}]
        })
      });
      const data = await res.json();
      let text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      text = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(text);
      setFundData(prev=>({...prev,[key]:parsed}));
      push(`🔬 Analyse fondamentale ${mkt.label} chargée !`,"success");
    } catch(e){
      push("❌ Erreur analyse fondamentale","danger");
    }
    setFundLoading(false);
  }

  // ── Generate signal ──────────────────────────────────────
  async function generateSignal(){
    setLoading(true);
    setPendingSignal(null);
    try {
      const t=getMT().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      const d=getMT().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
      const h=getMT().getHours();
      const killZone = (h>=9&&h<11)?"Londres 🇬🇧 (09h-11h)":(h>=15&&h<17)?"New York 🇺🇸 (15h-17h)":"Hors Kill Zone";

      // Pip values for lot size calculation
      const pipVals={NAS100:1,XAUUSD:10,XAGUSD:50,BTCUSD:0.1,ETHUSD:1,EURUSD:10,GBPUSD:10,USDJPY:1000,USDCAD:10,AUDUSD:10};
      const pipVal = pipVals[market.id]||1;

      const res = await fetch("/api/claude",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:2000,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          messages:[{role:"user",content:`Tu es un analyste de trading senior spécialisé ICT (Inner Circle Trader).
DATE/HEURE MAROC: ${t} — ${d}
MARCHÉ: ${market.label} (${market.id})
KILL ZONE ACTUELLE: ${killZone}
COMPTE: ${rules?.label} | ${accountSize.toLocaleString()}$ | Statut: ${accountStatus==="funded"?"Compte Financé":"Évaluation"}
RISQUE/TRADE: ${rules?.riskPerTrade}$ | REWARD CIBLE: ${rules?.rewardPerTrade}$ | R:R MIN: 1:3

STRATÉGIE BRAINY — 3 PILIERS:
1. TECHNIQUE (ICT): Order Blocks 1H non testés, Structure marché (HH/HL ou LH/LL), CHoCH sur 15M, FVG dans la zone OB, entrée au retest du 50% de l'OB, SL sous/sur l'OB +5pts buffer
2. MACRO: Fed (hawkish/dovish), Calendrier économique (NFP/CPI/PIB), Géopolitique
3. INSTITUTIONS (si NAS100): Apple/Microsoft/Nvidia/Amazon/Google/Meta/Tesla — earnings, annonces IA, analyst ratings, pré-market

RÈGLES STRICTES:
- Signal WAIT si hors Kill Zone (09h-11h ou 15h-17h heure Maroc)
- Signal WAIT si news HIGH impact dans 30min
- Signal WAIT si earnings Big Tech ce soir
- Signal WAIT si pas de CHoCH confirmé
- Signal WAIT si marché en range sur 1H

MISSION: Recherche en temps réel:
1. Prix actuel ${market.id}
2. Structure de marché 1H (tendance, OB non testés)
3. News macro du jour (Fed, calendrier éco, géopolitique)
4. Si NAS100: news Big Tech (earnings, annonces, pré-market des 7 grandes)
5. Génère le signal complet selon les 3 piliers

JSON UNIQUEMENT sans backticks ni markdown:
{
  "market":"${market.label}",
  "direction":"LONG"|"SHORT"|"WAIT",
  "currentPrice":"prix actuel",
  "confidence":"HIGH"|"MEDIUM"|"LOW",
  "killZone":"${killZone}",

  "technical":{
    "trend1H":"Bullish|Bearish|Range",
    "orderBlock":"niveau ex: 19850-19870",
    "obType":"Bullish|Bearish",
    "choch":"Confirmé 15M|Non confirmé",
    "fvg":"Présent|Absent",
    "entry":"niveau précis d'entrée",
    "stopLoss":"niveau SL",
    "takeProfit":"niveau TP",
    "slDistance":"distance en points/pips",
    "riskReward":"1:X",
    "reason":"explication technique courte"
  },

  "macro":{
    "fed":"stance et impact ex: Dovish — favorable aux LONG",
    "calendar":"événements du jour et impact",
    "geopolitics":"situation géopolitique et impact",
    "newsWarning":"alerte si news HIGH dans 30min ou null",
    "macroBias":"BULLISH|BEARISH|NEUTRAL"
  },

  "institutions":{
    "topMover":"entreprise qui impact le plus aujourd'hui",
    "premarket":"résumé pré-market Big Tech",
    "earnings":"earnings prévus aujourd'hui/ce soir ou Aucun",
    "aiNews":"dernières annonces IA des Big Tech",
    "analystRatings":"upgrades/downgrades récents importants",
    "institutionalBias":"BULLISH|BEARISH|NEUTRAL",
    "reason":"explication impact institutionnel"
  },

  "riskManagement":{
    "accountType":"${rules?.label}",
    "accountSize":"${accountSize}",
    "accountStatus":"${accountStatus}",
    "riskAmount":"${rules?.riskPerTrade}",
    "rewardAmount":"${rules?.rewardPerTrade}",
    "lotSize":"calculé: riskAmount/(slDistance*pipVal) avec pipVal=${pipVal}",
    "maxDailyLoss":"${rules?.dailyLoss}",
    "maxTotalLoss":"${rules?.maxLoss}",
    "bestDayRule":"${rules?.bestDay?"Active — max 50% des profits positifs":"Non applicable"}"
  },

  "waitReason":"si WAIT: raison précise en français"
}`}]
        })
      });
      const data = await res.json();
      let text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      text = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(text);
      setPendingSignal({...parsed, id:Date.now(), timestamp:t, date:d, marketId:market.id});
      push(`⚡ Signal ${parsed.direction} ${market.label} — Prends-tu ce trade ?`, parsed.direction==="WAIT"?"warning":"success");
    } catch(e){
      push("❌ Erreur génération signal","danger");
    }
    setLoading(false);
  }

  // ── Trade taken / skipped ────────────────────────────────
  function takeTrade(){
    if(!pendingSignal) return;
    const trade = {...pendingSignal, takenAt:Date.now(), status:"open"};
    setOpenTrades(o=>[...o,trade]);
    setPendingSignal(null);
    setTab("trades");
    push(`✅ Trade ${trade.direction} ${trade.market} ouvert — Je surveille le résultat !`,"success");
  }
  function skipTrade(){
    setPendingSignal(null);
    push("⏭️ Trade ignoré","info");
  }

  // ── Check if SL or TP hit ────────────────────────────────
  async function checkTradeResult(trade){
    setChecking(trade.id);
    try {
      const res = await fetch("/api/claude",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:400,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          messages:[{role:"user",content:`Recherche le prix actuel de ${trade.marketId||trade.market} maintenant.
Trade ouvert: Direction ${trade.direction}, Entry: ${trade.entry}, SL: ${trade.stopLoss}, TP: ${trade.takeProfit}.
Le prix actuel a-t-il touché le SL ou le TP ?
JSON UNIQUEMENT sans backticks: {"currentPrice":"prix actuel","result":"TP"|"SL"|"OPEN","explanation":"explication courte en français"}`}]
        })
      });
      const data = await res.json();
      let text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      text = text.replace(/```json|```/g,"").trim();
      const r = JSON.parse(text);

      if(r.result==="TP"||r.result==="SL"){
        const closed = {...trade, result:r.result, currentPrice:r.currentPrice, closedAt:Date.now(), explanation:r.explanation};
        setOpenTrades(o=>o.filter(t=>t.id!==trade.id));
        setClosedTrades(c=>[closed,...c]);
        const won = r.result==="TP";
        push(`${won?"🎉 TP TOUCHÉ":"💔 SL TOUCHÉ"} — ${trade.direction} ${trade.market} ${won?"+"+rules?.rewardPerTrade+"$":"-"+rules?.riskPerTrade+"$"}`, won?"success":"danger", true);
      } else {
        push(`📊 ${trade.market} — Prix: ${r.currentPrice} — Trade encore ouvert`, "info");
      }
    } catch(e){
      push("❌ Erreur vérification prix","danger");
    }
    setChecking(null);
  }

  // ── Close trade manually ─────────────────────────────────
  function closeTrade(trade, result){
    const closed = {...trade, result, closedAt:Date.now(), explanation:"Fermé manuellement"};
    setOpenTrades(o=>o.filter(t=>t.id!==trade.id));
    setClosedTrades(c=>[closed,...c]);
    push(`${result==="TP"?"✅ TP":"❌ SL"} enregistré — ${trade.market}`, result==="TP"?"success":"danger", true);
  }

  const h=now.getHours();
  const activeSession=(h>=9&&h<12)?{name:"Londres",icon:"🇬🇧",color:"#3b82f6"}:(h>=15&&h<21)?{name:"New York",icon:"🇺🇸",color:"#f59e0b"}:null;

  // ── MAIN APP ─────────────────────────────────────────────
  const canvasRef = useRef(null);
  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width=window.innerWidth; canvas.height=window.innerHeight; };
    resize();

    // Generate candles
    const num = 38;
    const cw = canvas.width / num;
    const candles = [];
    let price = canvas.height * 0.52;
    for(let i=0;i<num;i++){
      const change = (Math.random()-0.47)*28;
      const open = price;
      price += change;
      const close = price;
      const high = Math.max(open,close) + Math.random()*14;
      const low  = Math.min(open,close) - Math.random()*14;
      candles.push({x:i*cw+cw/2, open, close, high, low, bull:close>=open});
    }

    // Particles
    const particles = Array.from({length:50},()=>({
      x:Math.random()*canvas.width,
      y:Math.random()*canvas.height,
      r:Math.random()*1.4+0.3,
      vx:(Math.random()-0.5)*0.25,
      vy:(Math.random()-0.5)*0.25,
      alpha:Math.random()*0.35+0.05,
      purple:Math.random()>0.5
    }));

    let frame=0, animId;

    function draw(){
      ctx.clearRect(0,0,canvas.width,canvas.height);

      // Grid
      ctx.lineWidth=1;
      ctx.strokeStyle="rgba(168,85,247,0.05)";
      for(let y=0;y<canvas.height;y+=55){
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
      }
      for(let x=0;x<canvas.width;x+=75){
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
      }

      // Candles
      candles.forEach((c,i)=>{
        const offset = Math.sin(frame*0.012+i*0.28)*2.5;
        const alpha  = 0.10 + Math.sin(frame*0.009+i*0.4)*0.04;
        const bullR="16,185,129", bearR="239,68,68";
        const r = c.bull ? bullR : bearR;

        // Wick
        ctx.strokeStyle=`rgba(${r},${alpha*0.7})`;
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.moveTo(c.x, c.high+offset);
        ctx.lineTo(c.x, c.low+offset);
        ctx.stroke();

        // Body — simple fillRect instead of roundRect
        const bodyH = Math.max(Math.abs(c.open-c.close), 3);
        const bodyY = Math.min(c.open,c.close)+offset;
        ctx.fillStyle=`rgba(${r},${alpha})`;
        ctx.fillRect(c.x-cw*0.22, bodyY, cw*0.44, bodyH);
      });

      // Dashed price line
      const lineY = canvas.height*0.44 + Math.sin(frame*0.014)*35;
      const grad = ctx.createLinearGradient(0,0,canvas.width,0);
      grad.addColorStop(0,"rgba(168,85,247,0)");
      grad.addColorStop(0.35,"rgba(168,85,247,0.18)");
      grad.addColorStop(0.65,"rgba(0,212,255,0.18)");
      grad.addColorStop(1,"rgba(0,212,255,0)");
      ctx.strokeStyle=grad;
      ctx.lineWidth=1;
      ctx.setLineDash([5,9]);
      ctx.beginPath(); ctx.moveTo(0,lineY); ctx.lineTo(canvas.width,lineY); ctx.stroke();
      ctx.setLineDash([]);

      // Moving glow dot
      const dotX = (frame*1.1) % canvas.width;
      const grd = ctx.createRadialGradient(dotX,lineY,0,dotX,lineY,16);
      grd.addColorStop(0,"rgba(0,212,255,0.55)");
      grd.addColorStop(1,"rgba(0,212,255,0)");
      ctx.fillStyle=grd;
      ctx.beginPath(); ctx.arc(dotX,lineY,16,0,Math.PI*2); ctx.fill();

      // Particles
      particles.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>canvas.width)  p.vx*=-1;
        if(p.y<0||p.y>canvas.height) p.vy*=-1;
        ctx.fillStyle = p.purple
          ? `rgba(168,85,247,${p.alpha})`
          : `rgba(0,212,255,${p.alpha})`;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      });

      // Corner glows — fixed colors
      const corners=[
        {x:0,            y:0,             c:"rgba(168,85,247,0.07)"},
        {x:canvas.width, y:0,             c:"rgba(0,212,255,0.06)"},
        {x:0,            y:canvas.height, c:"rgba(0,212,255,0.06)"},
        {x:canvas.width, y:canvas.height, c:"rgba(168,85,247,0.07)"},
      ];
      corners.forEach(({x,y,c})=>{
        const g = ctx.createRadialGradient(x,y,0,x,y,220);
        g.addColorStop(0,c);
        g.addColorStop(1,"rgba(0,0,0,0)");
        ctx.fillStyle=g;
        ctx.fillRect(x-220,y-220,440,440);
      });

      frame++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    window.addEventListener("resize",resize);
    return()=>{ cancelAnimationFrame(animId); window.removeEventListener("resize",resize); };
  },[]);

  // ── SETUP SCREEN ─────────────────────────────────────────
  if(!accountType) return (
    <div style={{minHeight:"100vh",background:"#07070f",color:"#fff",fontFamily:"'Segoe UI',system-ui,sans-serif",position:"relative"}}>
      <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:0,pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:"24px"}}>
      <div style={{fontSize:"40px",marginBottom:"12px"}}>⚡</div>
      <h1 style={{fontSize:"24px",fontWeight:"900",marginBottom:"6px",background:"linear-gradient(135deg,#fff,#a855f7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Brainy</h1>
      <p style={{color:"#555",marginBottom:"32px",fontSize:"14px"}}>Configure ton compte pour commencer</p>

      <div style={{width:"100%",maxWidth:"400px"}}>
        <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Type de Challenge</p>
        <div style={{display:"flex",gap:"12px",marginBottom:"24px"}}>
          {Object.entries(ACCOUNT_TYPES).map(([key,a])=>(
            <button key={key} onClick={()=>setAccountType(key)}
              style={{flex:1,padding:"20px 12px",borderRadius:"16px",border:`2px solid ${a.color}`,background:`${a.color}15`,cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:"18px",fontWeight:"900",color:a.color,marginBottom:"6px"}}>{a.label}</div>
              <div style={{fontSize:"11px",color:"#666"}}>
                {key==="1step"?"1 phase • 3% daily • EOD Trailing":"2 phases • 5% daily • Static"}
              </div>
              <div style={{fontSize:"12px",color:a.color,marginTop:"6px",fontWeight:"700"}}>{a.payout}% payout</div>
            </button>
          ))}
        </div>

        <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Taille du Compte</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"24px"}}>
          {SIZES.map(s=>(
            <button key={s} onClick={()=>setAccountSize(s)}
              style={{flex:"1",minWidth:"80px",padding:"12px 8px",borderRadius:"12px",border:`1px solid ${accountSize===s?"#a855f7":"#1a1a2e"}`,background:accountSize===s?"rgba(168,85,247,0.15)":"rgba(255,255,255,0.02)",color:accountSize===s?"#a855f7":"#666",cursor:"pointer",fontSize:"13px",fontWeight:accountSize===s?"700":"400"}}>
              ${(s/1000).toFixed(0)}K
            </button>
          ))}
        </div>

        <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Statut du Compte</p>
        <div style={{display:"flex",gap:"12px",marginBottom:"28px"}}>
          {[
            {id:"evaluation",icon:"⏳",label:"Évaluation",sub:"Je passe encore le challenge",color:"#f59e0b"},
            {id:"funded",icon:"✅",label:"Compte Financé",sub:"J'ai déjà passé l'évaluation",color:"#10b981"},
          ].map(s=>(
            <button key={s.id} onClick={()=>setAccountStatus(s.id)}
              style={{flex:1,padding:"16px 10px",borderRadius:"14px",border:`2px solid ${accountStatus===s.id?s.color:"#1a1a2e"}`,background:accountStatus===s.id?`${s.color}15`:"rgba(255,255,255,0.02)",cursor:"pointer",textAlign:"center",transition:"all 0.2s"}}>
              <div style={{fontSize:"22px",marginBottom:"6px"}}>{s.icon}</div>
              <div style={{fontSize:"13px",fontWeight:"800",color:accountStatus===s.id?s.color:"#555"}}>{s.label}</div>
              <div style={{fontSize:"10px",color:"#444",marginTop:"4px"}}>{s.sub}</div>
            </button>
          ))}
        </div>

        {accountType && (
          <button onClick={()=>setTab("signal")}
            style={{width:"100%",padding:"18px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#a855f7,#00d4ff)",color:"#fff",cursor:"pointer",fontSize:"16px",fontWeight:"800",boxShadow:"0 4px 30px rgba(168,85,247,0.3)"}}>
            Commencer ⚡
          </button>
        )}
      </div>
      </div>
    </div>
  );

  // ── MAIN APP ─────────────────────────────────────────

  return (
    <div style={{minHeight:"100vh",background:"#07070f",color:"#fff",fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:"80px",position:"relative"}}>

      {/* Animated background */}
      <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:0,pointerEvents:"none"}}/>

      {/* App content overlay */}
      <div style={{position:"relative",zIndex:1}}>

      {/* Notifications */}
      <div style={{position:"fixed",top:"12px",right:"12px",zIndex:1000,display:"flex",flexDirection:"column",gap:"8px",maxWidth:"290px"}}>
        {notifications.slice(0,3).map(n=>(
          <div key={n.id} style={{background:"#111",border:`1px solid ${notifColors[n.type]}44`,borderLeft:`3px solid ${notifColors[n.type]}`,borderRadius:"10px",padding:"10px 14px",boxShadow:`0 4px 24px ${notifColors[n.type]}18`,animation:"slideIn 0.3s ease"}}>
            <div style={{fontSize:"12px",color:"#fff",lineHeight:"1.4"}}>{n.msg}</div>
            <div style={{fontSize:"10px",color:"#444",marginTop:"3px"}}>{n.time}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{background:"rgba(13,13,26,0.85)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(168,85,247,0.15)",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:"10px",color:ACCOUNT_TYPES[accountType].color,letterSpacing:"1px",textTransform:"uppercase"}}>{rules?.label} • ${(accountSize/1000).toFixed(0)}K • {accountStatus==="funded"?"✅ Compte Financé":"⏳ Évaluation"}</div>
          <div style={{fontSize:"16px",fontWeight:"800",background:"linear-gradient(135deg,#fff,#a855f7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Brainy ⚡</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"17px",fontWeight:"700",color:"#a855f7"}}>{now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
          <div style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:activeSession?`${activeSession.color}22`:"#111",color:activeSession?activeSession.color:"#444",border:`1px solid ${activeSession?activeSession.color+"33":"#1a1a1a"}`}}>
            {activeSession?`${activeSession.icon} ${activeSession.name}`:"🔴 Hors session"}
          </div>
        </div>
      </div>

      <div style={{maxWidth:"680px",margin:"0 auto",padding:"16px 14px"}}>

        {/* ── SIGNAL TAB ── */}
        {tab==="signal" && (
          <div>
            {/* Market selector */}
            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"11px",color:"#555",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"1px"}}>Choisir le marché</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
                {MARKETS.map(m=>(
                  <button key={m.id} onClick={()=>setMarket(m)}
                    style={{padding:"8px 12px",borderRadius:"10px",border:`1px solid ${market.id===m.id?"#a855f7":"#1a1a2e"}`,background:market.id===m.id?"rgba(168,85,247,0.15)":"rgba(255,255,255,0.02)",color:market.id===m.id?"#a855f7":"#555",cursor:"pointer",fontSize:"13px",fontWeight:market.id===m.id?"700":"400",transition:"all 0.2s"}}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily stats bar */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"16px"}}>
              {[
                {label:"Aujourd'hui",value:fmt(todayProfit),color:todayProfit>=0?"#10b981":"#ef4444"},
                {label:"Perte/jour",value:`${dailyLossUsed}/${rules?.dailyLoss}$`,color:dailyLossUsed>=rules?.dailyLoss*0.66?"#ef4444":"#f59e0b"},
                {label:"Challenge",value:`${Math.round(progress)}%`,color:progress>=100?"#10b981":"#a855f7"},
              ].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid #15152a",borderRadius:"12px",padding:"12px",textAlign:"center"}}>
                  <div style={{fontSize:"10px",color:"#444",marginBottom:"4px"}}>{s.label}</div>
                  <div style={{fontSize:"15px",fontWeight:"800",color:s.color}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Generate button */}
            <button onClick={generateSignal} disabled={loading||todayLosses>=2}
              style={{width:"100%",padding:"18px",borderRadius:"14px",border:"none",background:loading||todayLosses>=2?"#111":"linear-gradient(135deg,#a855f7,#00d4ff)",color:loading||todayLosses>=2?"#333":"#fff",cursor:loading||todayLosses>=2?"not-allowed":"pointer",fontSize:"16px",fontWeight:"800",marginBottom:"20px",boxShadow:loading?"none":"0 4px 30px rgba(168,85,247,0.25)",transition:"all 0.3s"}}>
              {todayLosses>=2?"🛑 2 trades perdants — Stop obligatoire aujourd'hui":loading?"⏳ Analyse en cours...":` ⚡ Générer Signal — ${market.icon} ${market.label}`}
            </button>

            {loading && (
              <div style={{textAlign:"center",padding:"32px",background:"rgba(168,85,247,0.04)",borderRadius:"14px",border:"1px solid #a855f722"}}>
                <div style={{fontSize:"13px",color:"#555",lineHeight:"2.4"}}>
                  🔍 Recherche prix actuel {market.label}...<br/>
                  📊 Analyse ICT — Order Blocks + CHoCH + FVG...<br/>
                  📰 Calendrier économique + Fed + Géopolitique...<br/>
                  🏛️ News Big Tech + Earnings + Pré-market...<br/>
                  💰 Calcul Lot Size selon ton Risk Management...
                </div>
              </div>
            )}

            {/* Pending signal */}
            {pendingSignal && !loading && (
              <div style={{background:pendingSignal.direction==="WAIT"?"rgba(245,158,11,0.05)":pendingSignal.direction==="LONG"?"rgba(16,185,129,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${dirColor(pendingSignal.direction)}33`,borderRadius:"18px",padding:"20px",animation:"fadeUp 0.4s ease"}}>

                {/* Direction header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    <div style={{width:"46px",height:"46px",borderRadius:"12px",background:`${dirColor(pendingSignal.direction)}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",fontWeight:"900",color:dirColor(pendingSignal.direction)}}>
                      {pendingSignal.direction==="LONG"?"↑":pendingSignal.direction==="SHORT"?"↓":"⏳"}
                    </div>
                    <div>
                      <div style={{fontSize:"22px",fontWeight:"900",color:dirColor(pendingSignal.direction)}}>{pendingSignal.direction}</div>
                      <div style={{fontSize:"12px",color:"#555"}}>{pendingSignal.market} • {pendingSignal.timestamp}</div>
                    </div>
                  </div>
                  <div style={{fontSize:"12px",padding:"4px 10px",borderRadius:"99px",background:`${confColor(pendingSignal.confidence)}22`,color:confColor(pendingSignal.confidence),fontWeight:"700"}}>
                    {pendingSignal.confidence}
                  </div>
                </div>

                {/* Levels */}
                {pendingSignal.direction!=="WAIT" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"12px"}}>
                    {[
                      {label:"🎯 ENTRÉE",value:pendingSignal.technical?.entry||pendingSignal.entry,color:"#00d4ff"},
                      {label:"🛑 STOP LOSS",value:pendingSignal.technical?.stopLoss||pendingSignal.stopLoss,color:"#ef4444"},
                      {label:"💰 TAKE PROFIT",value:pendingSignal.technical?.takeProfit||pendingSignal.takeProfit,color:"#10b981"},
                    ].map((p,i)=>(
                      <div key={i} style={{background:"rgba(255,255,255,0.03)",borderRadius:"10px",padding:"10px",textAlign:"center",border:`1px solid ${p.color}33`}}>
                        <div style={{fontSize:"9px",color:"#555",marginBottom:"4px"}}>{p.label}</div>
                        <div style={{fontSize:"13px",fontWeight:"800",color:p.color}}>{p.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Risk Management */}
                {pendingSignal.direction!=="WAIT" && (
                  <div style={{background:"rgba(168,85,247,0.06)",borderRadius:"12px",padding:"12px",marginBottom:"12px",border:"1px solid #a855f733"}}>
                    <div style={{fontSize:"10px",color:"#a855f7",marginBottom:"8px",textTransform:"uppercase",letterSpacing:"1px"}}>💰 Risk Management</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
                      {[
                        {label:"R/R",value:pendingSignal.technical?.riskReward||"1:3",color:"#a855f7"},
                        {label:"Lot Size",value:pendingSignal.riskManagement?.lotSize||"—",color:"#00d4ff"},
                        {label:"Risque",value:`-${rules?.riskPerTrade}$`,color:"#ef4444"},
                        {label:"Gain",value:`+${rules?.rewardPerTrade}$`,color:"#10b981"},
                        {label:"SL Distance",value:pendingSignal.technical?.slDistance||"—",color:"#f59e0b"},
                        {label:"Kill Zone",value:pendingSignal.killZone?.split(" ")[0]||"—",color:"#3b82f6"},
                      ].map((r,i)=>(
                        <div key={i} style={{background:"rgba(255,255,255,0.03)",borderRadius:"8px",padding:"8px",textAlign:"center"}}>
                          <div style={{fontSize:"9px",color:"#444",marginBottom:"3px"}}>{r.label}</div>
                          <div style={{fontSize:"12px",fontWeight:"800",color:r.color}}>{r.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PILLAR 1 — Technique */}
                {pendingSignal.technical && pendingSignal.direction!=="WAIT" && (
                  <div style={{background:"rgba(0,212,255,0.04)",borderRadius:"10px",padding:"12px",marginBottom:"8px",borderLeft:"3px solid #00d4ff"}}>
                    <div style={{fontSize:"10px",color:"#00d4ff",marginBottom:"8px",textTransform:"uppercase",letterSpacing:"1px"}}>📊 Pilier 1 — Technique ICT</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"8px"}}>
                      {[
                        {label:"Tendance 1H",value:pendingSignal.technical.trend1H},
                        {label:"Order Block",value:pendingSignal.technical.orderBlock},
                        {label:"CHoCH 15M",value:pendingSignal.technical.choch},
                        {label:"FVG",value:pendingSignal.technical.fvg},
                      ].map((r,i)=>(
                        <div key={i} style={{background:"rgba(255,255,255,0.02)",borderRadius:"8px",padding:"7px 10px"}}>
                          <div style={{fontSize:"9px",color:"#444"}}>{r.label}</div>
                          <div style={{fontSize:"11px",fontWeight:"700",color:r.value?.includes("Confirmé")||r.value?.includes("Présent")||r.value?.includes("Bullish")?"#10b981":r.value?.includes("Non")||r.value?.includes("Absent")?"#ef4444":"#aaa"}}>{r.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:"11px",color:"#888",lineHeight:"1.5"}}>{pendingSignal.technical.reason}</div>
                  </div>
                )}

                {/* PILLAR 2 — Macro */}
                {pendingSignal.macro && (
                  <div style={{background:"rgba(168,85,247,0.04)",borderRadius:"10px",padding:"12px",marginBottom:"8px",borderLeft:"3px solid #a855f7"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                      <div style={{fontSize:"10px",color:"#a855f7",textTransform:"uppercase",letterSpacing:"1px"}}>📰 Pilier 2 — Macro</div>
                      <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:pendingSignal.macro.macroBias==="BULLISH"?"rgba(16,185,129,0.15)":pendingSignal.macro.macroBias==="BEARISH"?"rgba(239,68,68,0.15)":"rgba(245,158,11,0.15)",color:pendingSignal.macro.macroBias==="BULLISH"?"#10b981":pendingSignal.macro.macroBias==="BEARISH"?"#ef4444":"#f59e0b",fontWeight:"700"}}>{pendingSignal.macro.macroBias}</span>
                    </div>
                    {[
                      {label:"🏦 Fed",value:pendingSignal.macro.fed},
                      {label:"📅 Calendrier",value:pendingSignal.macro.calendar},
                      {label:"🌍 Géopolitique",value:pendingSignal.macro.geopolitics},
                    ].map((r,i)=>(
                      <div key={i} style={{fontSize:"11px",padding:"5px 0",borderBottom:i<2?"1px solid #111":"none"}}>
                        <span style={{color:"#555"}}>{r.label}: </span>
                        <span style={{color:"#999"}}>{r.value}</span>
                      </div>
                    ))}
                    {pendingSignal.macro.newsWarning && (
                      <div style={{marginTop:"8px",padding:"8px 10px",background:"rgba(245,158,11,0.1)",borderRadius:"8px",fontSize:"11px",color:"#f59e0b"}}>
                        ⚠️ {pendingSignal.macro.newsWarning}
                      </div>
                    )}
                  </div>
                )}

                {/* PILLAR 3 — Institutions */}
                {pendingSignal.institutions && (
                  <div style={{background:"rgba(16,185,129,0.04)",borderRadius:"10px",padding:"12px",marginBottom:"12px",borderLeft:"3px solid #10b981"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                      <div style={{fontSize:"10px",color:"#10b981",textTransform:"uppercase",letterSpacing:"1px"}}>🏛️ Pilier 3 — Institutions</div>
                      <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:pendingSignal.institutions.institutionalBias==="BULLISH"?"rgba(16,185,129,0.15)":pendingSignal.institutions.institutionalBias==="BEARISH"?"rgba(239,68,68,0.15)":"rgba(245,158,11,0.15)",color:pendingSignal.institutions.institutionalBias==="BULLISH"?"#10b981":pendingSignal.institutions.institutionalBias==="BEARISH"?"#ef4444":"#f59e0b",fontWeight:"700"}}>{pendingSignal.institutions.institutionalBias}</span>
                    </div>
                    {[
                      {label:"📈 Top Mover",value:pendingSignal.institutions.topMover},
                      {label:"🌅 Pré-market",value:pendingSignal.institutions.premarket},
                      {label:"📊 Earnings",value:pendingSignal.institutions.earnings},
                      {label:"🤖 News IA",value:pendingSignal.institutions.aiNews},
                    ].map((r,i)=>(
                      r.value && <div key={i} style={{fontSize:"11px",padding:"5px 0",borderBottom:i<3?"1px solid #111":"none"}}>
                        <span style={{color:"#555"}}>{r.label}: </span>
                        <span style={{color:"#999"}}>{r.value}</span>
                      </div>
                    ))}
                    <div style={{fontSize:"11px",color:"#777",marginTop:"8px",fontStyle:"italic"}}>{pendingSignal.institutions.reason}</div>
                  </div>
                )}

                {/* Wait reason */}
                {pendingSignal.direction==="WAIT" && pendingSignal.waitReason && (
                  <div style={{background:"rgba(245,158,11,0.08)",borderRadius:"10px",padding:"14px",marginBottom:"12px",borderLeft:"3px solid #f59e0b"}}>
                    <div style={{fontSize:"10px",color:"#f59e0b",marginBottom:"6px",textTransform:"uppercase",letterSpacing:"1px"}}>⏳ Raison d'attente</div>
                    <div style={{fontSize:"13px",color:"#bbb",lineHeight:"1.6"}}>{pendingSignal.waitReason}</div>
                  </div>
                )}

                {/* Take / Skip */}
                {pendingSignal.direction!=="WAIT" ? (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginTop:"4px"}}>
                    <button onClick={takeTrade}
                      style={{padding:"16px",borderRadius:"12px",border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",cursor:"pointer",fontSize:"15px",fontWeight:"800",boxShadow:"0 4px 20px rgba(16,185,129,0.3)"}}>
                      ✅ J'ai pris le trade
                    </button>
                    <button onClick={skipTrade}
                      style={{padding:"16px",borderRadius:"12px",border:"1px solid #1a1a2e",background:"rgba(255,255,255,0.02)",color:"#555",cursor:"pointer",fontSize:"15px",fontWeight:"700"}}>
                      ⏭️ Je passe
                    </button>
                  </div>
                ) : (
                  <button onClick={skipTrade}
                    style={{width:"100%",marginTop:"4px",padding:"14px",borderRadius:"12px",border:"1px solid #f59e0b33",background:"rgba(245,158,11,0.08)",color:"#f59e0b",cursor:"pointer",fontSize:"14px",fontWeight:"700"}}>
                    ⏳ Ok, j'attends un meilleur setup
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TRADES TAB ── */}
        {tab==="trades" && (
          <div>
            {/* Open trades */}
            {openTrades.length>0 && (
              <div style={{marginBottom:"24px"}}>
                <h3 style={{color:"#f59e0b",marginBottom:"12px",fontSize:"15px"}}>📂 Trades Ouverts ({openTrades.length})</h3>
                {openTrades.map(trade=>(
                  <div key={trade.id} style={{background:"rgba(245,158,11,0.05)",border:"1px solid #f59e0b33",borderRadius:"14px",padding:"16px",marginBottom:"10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <span style={{fontSize:"18px"}}>{MARKETS.find(m=>m.id===trade.marketId||m.label===trade.market)?.icon||"📊"}</span>
                        <span style={{fontWeight:"800",color:dirColor(trade.direction)}}>{trade.direction}</span>
                        <span style={{color:"#666",fontSize:"13px"}}>{trade.market}</span>
                      </div>
                      <span style={{fontSize:"11px",color:"#555"}}>{trade.timestamp}</span>
                    </div>
                    <div style={{display:"flex",gap:"8px",fontSize:"12px",marginBottom:"14px"}}>
                      <span style={{color:"#00d4ff"}}>🎯 {trade.entry}</span>
                      <span style={{color:"#ef4444"}}>🛑 {trade.stopLoss}</span>
                      <span style={{color:"#10b981"}}>💰 {trade.takeProfit}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
                      <button onClick={()=>checkTradeResult(trade)} disabled={checking===trade.id}
                        style={{padding:"10px",borderRadius:"10px",border:"1px solid #3b82f633",background:"rgba(59,130,246,0.08)",color:"#3b82f6",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>
                        {checking===trade.id?"⏳...":"🔍 Vérifier"}
                      </button>
                      <button onClick={()=>closeTrade(trade,"TP")}
                        style={{padding:"10px",borderRadius:"10px",border:"none",background:"rgba(16,185,129,0.15)",color:"#10b981",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>
                        ✅ TP touché
                      </button>
                      <button onClick={()=>closeTrade(trade,"SL")}
                        style={{padding:"10px",borderRadius:"10px",border:"none",background:"rgba(239,68,68,0.12)",color:"#ef4444",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>
                        ❌ SL touché
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Closed trades */}
            <h3 style={{color:"#a855f7",marginBottom:"12px",fontSize:"15px"}}>📋 Historique ({closedTrades.length})</h3>
            {closedTrades.length===0 ? (
              <div style={{textAlign:"center",padding:"40px",color:"#333"}}>
                <div style={{fontSize:"32px",marginBottom:"8px"}}>📭</div>
                Pas encore de trades fermés
              </div>
            ) : (
              closedTrades.map(t=>(
                <div key={t.id} style={{background:t.result==="TP"?"rgba(16,185,129,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${t.result==="TP"?"#10b98133":"#ef444433"}`,borderLeft:`3px solid ${t.result==="TP"?"#10b981":"#ef4444"}`,borderRadius:"12px",padding:"14px",marginBottom:"8px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <span>{MARKETS.find(m=>m.id===t.marketId||m.label===t.market)?.icon||"📊"}</span>
                      <span style={{fontWeight:"700",color:dirColor(t.direction)}}>{t.direction}</span>
                      <span style={{color:"#666",fontSize:"13px"}}>{t.market}</span>
                    </div>
                    <span style={{fontSize:"16px",fontWeight:"900",color:t.result==="TP"?"#10b981":"#ef4444"}}>
                      {t.result==="TP"?"+"+rules?.rewardPerTrade+"\$":"-"+rules?.riskPerTrade+"\$"}
                    </span>
                  </div>
                  <div style={{fontSize:"11px",color:"#555"}}>{t.explanation||""}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── FUNDAMENTAL TAB ── */}
        {tab==="fundamental" && (
          <div>
            {/* Market selector */}
            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"11px",color:"#555",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"1px"}}>Choisir le marché à analyser</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
                {MARKETS.map(m=>{
                  const loaded = !!fundData[m.id];
                  return (
                    <button key={m.id} onClick={()=>{setFundMarket(m); fetchFundamental(m);}}
                      style={{padding:"8px 12px",borderRadius:"10px",border:`1px solid ${fundMarket.id===m.id?"#a855f7":loaded?"#10b98144":"#1a1a2e"}`,background:fundMarket.id===m.id?"rgba(168,85,247,0.15)":loaded?"rgba(16,185,129,0.05)":"rgba(255,255,255,0.02)",color:fundMarket.id===m.id?"#a855f7":loaded?"#10b981":"#555",cursor:"pointer",fontSize:"13px",fontWeight:fundMarket.id===m.id?"700":"400",transition:"all 0.2s",position:"relative"}}>
                      {m.icon} {m.label}
                      {loaded && fundMarket.id!==m.id && <span style={{position:"absolute",top:"2px",right:"4px",width:"6px",height:"6px",background:"#10b981",borderRadius:"99px"}}/>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Refresh button */}
            <button onClick={()=>{setFundData(prev=>{const n={...prev};delete n[fundMarket.id];return n;}); setTimeout(()=>fetchFundamental(fundMarket),100);}}
              disabled={fundLoading}
              style={{width:"100%",padding:"14px",borderRadius:"12px",border:"none",background:fundLoading?"#111":"linear-gradient(135deg,#a855f7,#3b82f6)",color:fundLoading?"#333":"#fff",cursor:fundLoading?"not-allowed":"pointer",fontSize:"14px",fontWeight:"700",marginBottom:"20px",boxShadow:fundLoading?"none":"0 4px 20px rgba(168,85,247,0.2)"}}>
              {fundLoading?`⏳ Analyse ${fundMarket.label} en cours...`:`🔬 Analyser ${fundMarket.icon} ${fundMarket.label}`}
            </button>

            {fundLoading && (
              <div style={{textAlign:"center",padding:"32px",background:"rgba(168,85,247,0.04)",borderRadius:"14px",border:"1px solid #a855f722"}}>
                <div style={{fontSize:"13px",color:"#555",lineHeight:"2.2"}}>
                  📅 Calendrier économique du jour...<br/>
                  🏦 Stratégie et décisions Fed...<br/>
                  🌍 Actualités géopolitiques...<br/>
                  📰 News importantes {fundMarket.label}...
                </div>
              </div>
            )}

            {fundData[fundMarket.id] && !fundLoading && (()=>{
              const fd = fundData[fundMarket.id];
              const biasColor = fd.overallBias==="BULLISH"?"#10b981":fd.overallBias==="BEARISH"?"#ef4444":"#f59e0b";
              const dirColor2 = d => d==="BULLISH"?"#10b981":d==="BEARISH"?"#ef4444":"#f59e0b";
              const dirIcon2 = d => d==="BULLISH"?"↑ Haussier":d==="BEARISH"?"↓ Baissier":"→ Neutre";
              const impColor = i => i==="HIGH"?"#ef4444":i==="MEDIUM"?"#f59e0b":"#10b981";

              const ImpactBadge = ({impact,prob,direction})=>(
                <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap",marginTop:"8px"}}>
                  <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:`${impColor(impact)}18`,color:impColor(impact),fontWeight:"700"}}>{impact}</span>
                  <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:"rgba(255,255,255,0.05)",color:"#888"}}>Prob: {prob}%</span>
                  <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"99px",background:`${dirColor2(direction)}15`,color:dirColor2(direction),fontWeight:"700"}}>{dirIcon2(direction)}</span>
                </div>
              );

              return (
                <div style={{animation:"fadeUp 0.4s ease"}}>
                  {/* Overall bias */}
                  <div style={{background:`${biasColor}08`,border:`1px solid ${biasColor}33`,borderRadius:"16px",padding:"18px",marginBottom:"16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                      <span style={{fontSize:"13px",color:"#555"}}>Biais Global {fd.market}</span>
                      <span style={{fontSize:"16px",fontWeight:"900",color:biasColor,padding:"4px 14px",background:`${biasColor}15`,borderRadius:"99px"}}>{fd.overallBias}</span>
                    </div>
                    <p style={{fontSize:"13px",color:"#aaa",margin:0,lineHeight:"1.6"}}>{fd.overallSummary}</p>
                    <div style={{fontSize:"11px",color:"#444",marginTop:"8px"}}>Mis à jour: {fd.lastUpdated}</div>
                  </div>

                  {/* Fed */}
                  {fd.fed && (
                    <div style={{background:"rgba(59,130,246,0.05)",border:"1px solid #3b82f622",borderRadius:"14px",padding:"16px",marginBottom:"14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                        <span style={{fontSize:"14px",fontWeight:"700",color:"#3b82f6"}}>🏦 Stratégie Fed</span>
                        <span style={{fontSize:"12px",padding:"3px 10px",borderRadius:"99px",background:fd.fed.stance==="HAWKISH"?"rgba(239,68,68,0.15)":fd.fed.stance==="DOVISH"?"rgba(16,185,129,0.15)":"rgba(245,158,11,0.15)",color:fd.fed.stance==="HAWKISH"?"#ef4444":fd.fed.stance==="DOVISH"?"#10b981":"#f59e0b",fontWeight:"700"}}>
                          {fd.fed.stance}
                        </span>
                      </div>
                      <div style={{fontSize:"12px",color:"#888",marginBottom:"6px"}}>{fd.fed.lastDecision}</div>
                      <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Prochain meeting: <span style={{color:"#3b82f6"}}>{fd.fed.nextMeeting}</span></div>
                      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"10px",padding:"10px",borderLeft:"3px solid #3b82f6"}}>
                        <div style={{fontSize:"11px",color:"#3b82f6",marginBottom:"4px",textTransform:"uppercase",letterSpacing:"1px"}}>Impact sur {fd.market}</div>
                        <div style={{fontSize:"12px",color:"#aaa",lineHeight:"1.5"}}>{fd.fed[`impactOn${fundMarket.id.replace('/','_')}`]||fd.fed.impactOnNAS100||fd.fed.impactOnXAUUSD||Object.values(fd.fed).find(v=>typeof v==="string"&&v.length>30)||"—"}</div>
                        <ImpactBadge impact={fd.fed.impact||"MEDIUM"} prob={fd.fed.impactProb||70} direction={fd.fed.direction||"NEUTRAL"}/>
                      </div>
                    </div>
                  )}

                  {/* Economic Calendar */}
                  {fd.calendar?.length>0 && (
                    <div style={{marginBottom:"14px"}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:"#f59e0b",marginBottom:"10px"}}>📅 Calendrier Économique</div>
                      {fd.calendar.map((ev,i)=>(
                        <div key={i} style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${impColor(ev.impact)}22`,borderLeft:`3px solid ${impColor(ev.impact)}`,borderRadius:"12px",padding:"12px 14px",marginBottom:"8px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                              <span style={{fontSize:"16px"}}>{ev.country}</span>
                              <span style={{fontSize:"13px",fontWeight:"700",color:"#fff"}}>{ev.event}</span>
                            </div>
                            <span style={{fontSize:"11px",color:"#555",whiteSpace:"nowrap"}}>{ev.date} {ev.time}</span>
                          </div>
                          <div style={{fontSize:"12px",color:"#777",marginBottom:"4px"}}>{ev.directionExplain}</div>
                          <ImpactBadge impact={ev.impact} prob={ev.impactProb} direction={ev.direction}/>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Geopolitics */}
                  {fd.geopolitics?.length>0 && (
                    <div style={{marginBottom:"14px"}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:"#ef4444",marginBottom:"10px"}}>🌍 Géopolitique</div>
                      {fd.geopolitics.map((g,i)=>(
                        <div key={i} style={{background:"rgba(239,68,68,0.04)",border:"1px solid #ef444422",borderLeft:`3px solid ${impColor(g.impact)}`,borderRadius:"12px",padding:"12px 14px",marginBottom:"8px"}}>
                          <div style={{fontSize:"13px",fontWeight:"700",color:"#fff",marginBottom:"4px"}}>{g.title}</div>
                          <div style={{fontSize:"12px",color:"#777",marginBottom:"4px"}}>{g.summary}</div>
                          <div style={{fontSize:"12px",color:"#888",marginBottom:"4px",fontStyle:"italic"}}>{g.directionExplain}</div>
                          <ImpactBadge impact={g.impact} prob={g.impactProb} direction={g.direction}/>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top News */}
                  {fd.topNews?.length>0 && (
                    <div style={{marginBottom:"14px"}}>
                      <div style={{fontSize:"13px",fontWeight:"700",color:"#a855f7",marginBottom:"10px"}}>📰 News Importantes</div>
                      {fd.topNews.map((n,i)=>(
                        <div key={i} style={{background:"rgba(168,85,247,0.03)",border:"1px solid #a855f722",borderLeft:`3px solid ${impColor(n.impact)}`,borderRadius:"12px",padding:"12px 14px",marginBottom:"8px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
                            <div style={{fontSize:"13px",fontWeight:"700",color:"#fff",flex:1,paddingRight:"8px"}}>{n.title}</div>
                            <span style={{fontSize:"10px",color:"#555",whiteSpace:"nowrap"}}>{n.source}</span>
                          </div>
                          <div style={{fontSize:"12px",color:"#777",marginBottom:"4px"}}>{n.summary}</div>
                          <div style={{fontSize:"12px",color:"#888",fontStyle:"italic",marginBottom:"4px"}}>{n.directionExplain}</div>
                          <ImpactBadge impact={n.impact} prob={n.impactProb} direction={n.direction}/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {!fundData[fundMarket.id] && !fundLoading && (
              <div style={{textAlign:"center",padding:"50px 20px"}}>
                <div style={{fontSize:"40px",marginBottom:"12px"}}>🔬</div>
                <p style={{color:"#444",fontSize:"14px"}}>Clique sur "Analyser" pour charger<br/>l'analyse fondamentale de {fundMarket.icon} {fundMarket.label}</p>
              </div>
            )}
          </div>
        )}

        {/* ── RISK MANAGEMENT TAB ── */}
        {tab==="risk" && (
          <div>
            <h2 style={{color:"#10b981",marginBottom:"6px"}}>💰 Risk Management</h2>
            <p style={{color:"#555",fontSize:"13px",marginBottom:"20px"}}>Basé sur ton compte {rules?.label} — ${accountSize.toLocaleString()}</p>

            {/* Account limits summary */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>
              {[
                {icon:"🛑",label:"Perte Max/Jour",value:`${rules?.dailyLoss}$`,sub:`(${(rules?.dailyLossPct*100).toFixed(0)}% du compte)`,color:"#ef4444"},
                {icon:"📉",label:"Perte Max Totale",value:`${rules?.maxLoss}$`,sub:rules?.trailing?"EOD Trailing":"Static",color:"#f59e0b"},
                {icon:"🎯",label:"Gain Max/Jour",value:rules?.bestDay?`${Math.round(rules?.profitTarget*0.45)}$`:"Illimité",sub:rules?.bestDay?"Règle 50% Best Day":"Pas de limite",color:"#10b981"},
                {icon:"📊",label:"Max Trades/Jour",value:`${Math.floor((rules?.dailyLoss||0)/(rules?.riskPerTrade||1))} trades`,sub:`si tous perdants`,color:"#3b82f6"},
                {icon:"💸",label:"Risque/Trade",value:`${rules?.riskPerTrade}$`,sub:`(0.8% du compte)`,color:"#a855f7"},
                {icon:"💰",label:"Gain/Trade (1:3)",value:`${rules?.rewardPerTrade}$`,sub:`reward potentiel`,color:"#00d4ff"},
              ].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${s.color}22`,borderRadius:"12px",padding:"14px"}}>
                  <div style={{fontSize:"18px",marginBottom:"6px"}}>{s.icon}</div>
                  <div style={{fontSize:"11px",color:"#555",marginBottom:"4px"}}>{s.label}</div>
                  <div style={{fontSize:"18px",fontWeight:"800",color:s.color}}>{s.value}</div>
                  <div style={{fontSize:"10px",color:"#444",marginTop:"3px"}}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Position size calculator */}
            <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid #10b98122",borderRadius:"16px",padding:"20px",marginBottom:"16px"}}>
              <h3 style={{color:"#10b981",margin:"0 0 16px",fontSize:"15px"}}>🧮 Calculateur de Lot Size</h3>

              {/* Market selector */}
              <div style={{marginBottom:"14px"}}>
                <div style={{fontSize:"11px",color:"#555",marginBottom:"8px"}}>Marché</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                  {MARKETS.map(m=>(
                    <button key={m.id} onClick={()=>setRmMarket(m)}
                      style={{padding:"6px 10px",borderRadius:"8px",border:`1px solid ${rmMarket.id===m.id?"#10b981":"#1a1a2e"}`,background:rmMarket.id===m.id?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.02)",color:rmMarket.id===m.id?"#10b981":"#555",cursor:"pointer",fontSize:"12px",fontWeight:rmMarket.id===m.id?"700":"400"}}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entry & SL inputs */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
                {[
                  {label:"🎯 Prix d'Entrée",val:rmEntry,set:setRmEntry,placeholder:"ex: 20000"},
                  {label:"🛑 Stop Loss",val:rmSL,set:setRmSL,placeholder:"ex: 19900"},
                ].map((inp,i)=>(
                  <div key={i}>
                    <div style={{fontSize:"11px",color:"#555",marginBottom:"6px"}}>{inp.label}</div>
                    <input value={inp.val} onChange={e=>inp.set(e.target.value)}
                      placeholder={inp.placeholder}
                      style={{width:"100%",padding:"10px 12px",borderRadius:"10px",border:"1px solid #1a1a2e",background:"#111",color:"#fff",fontSize:"14px",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
              </div>

              {/* Result */}
              {rmCalc ? (
                <div style={{background:"#0d0d1a",borderRadius:"12px",padding:"16px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                    {[
                      {label:"📦 Lot Size",value:rmCalc.lots+" lots",color:"#10b981"},
                      {label:"📏 Distance SL",value:rmCalc.slDist+" "+rmCalc.unit,color:"#f59e0b"},
                      {label:"💸 Risque",value:"-"+rmCalc.riskAmt+"$",color:"#ef4444"},
                      {label:"💰 Potentiel",value:"+"+rmCalc.rewardAmt+"$",color:"#10b981"},
                      {label:"🎯 TP Suggéré",value:rmCalc.tp1,color:"#00d4ff"},
                      {label:"📊 SL Max (pts)",value:rmCalc.maxSL+" "+rmCalc.unit,color:"#a855f7"},
                    ].map((r,i)=>(
                      <div key={i} style={{textAlign:"center",padding:"10px",background:"rgba(255,255,255,0.03)",borderRadius:"8px"}}>
                        <div style={{fontSize:"10px",color:"#555",marginBottom:"4px"}}>{r.label}</div>
                        <div style={{fontSize:"14px",fontWeight:"800",color:r.color}}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{textAlign:"center",padding:"20px",color:"#333",fontSize:"13px"}}>
                  Entrée ton prix d'entrée et SL pour calculer le lot size
                </div>
              )}
            </div>

            {/* Daily trading plan */}
            <div style={{background:"rgba(59,130,246,0.05)",border:"1px solid #3b82f622",borderRadius:"14px",padding:"18px",marginBottom:"14px"}}>
              <h3 style={{color:"#3b82f6",margin:"0 0 14px",fontSize:"15px"}}>📋 Plan Journalier</h3>
              {[
                {label:"Max perte/jour",value:`${rules?.dailyLoss}$`,detail:`Stop trading si tu perds ${rules?.dailyLoss}$`,color:"#ef4444"},
                {label:"Max trades perdants/jour",value:"2 trades",detail:"Après 2 trades perdants dans la journée → STOP obligatoire",color:"#ef4444"},
                {label:"Max gain/jour",value:rules?.bestDay?`${Math.round((rules?.profitTarget||0)*0.45)}$`:"Pas de limite",detail:rules?.bestDay?"Règle 50% — ne dépasse pas pour valider le challenge":"Trading libre",color:"#10b981"},
                {label:"Objectif/jour (conseillé)",value:`${Math.round((rules?.profitTarget||0)/7)}$`,detail:"Pour passer en 7 jours réguliers",color:"#a855f7"},
                {label:"Risk/Reward minimum",value:"1:3",detail:"Ne jamais prendre moins — discipline absolue",color:"#00d4ff"},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"10px 0",borderBottom:i<4?"1px solid #0d0d1a":"none",gap:"12px"}}>
                  <div>
                    <div style={{fontSize:"13px",color:"#888"}}>{r.label}</div>
                    <div style={{fontSize:"11px",color:"#444",marginTop:"2px"}}>{r.detail}</div>
                  </div>
                  <div style={{fontSize:"15px",fontWeight:"800",color:r.color,whiteSpace:"nowrap"}}>{r.value}</div>
                </div>
              ))}
            </div>

            {/* Validation checklist */}
            <div style={{background:"rgba(168,85,247,0.04)",border:"1px solid #a855f722",borderRadius:"14px",padding:"18px"}}>
              <h3 style={{color:"#a855f7",margin:"0 0 14px",fontSize:"15px"}}>✅ Checklist Avant Chaque Trade</h3>
              {[
                "Mon SL est placé AVANT d'entrer dans le trade",
                `Mon risque ne dépasse pas ${rules?.riskPerTrade}$ (0.8%)`,
                "Mon R:R est minimum 1:3",
                "Je n'ai pas encore 2 trades perdants aujourd'hui — si oui STOP",
                "Pas de news HIGH impact dans les 30 prochaines minutes",
                rules?.bestDay ? "Mon gain du jour ne dépasse pas 45% de mon profit total" : "Je respecte la limite de perte journalière",
                "Je suis en session Londres ou New York",
        `Ma perte totale n'approche pas ${rules?.maxLoss}$`,
              ].filter(Boolean).map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"8px 0",borderBottom:i<6?"1px solid #0d0d1a":"none"}}>
                  <span style={{color:"#a855f7",fontSize:"14px",marginTop:"1px"}}>□</span>
                  <span style={{fontSize:"13px",color:"#777",lineHeight:"1.4"}}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {tab==="dashboard" && (
          <div>
            <h2 style={{color:"#a855f7",marginBottom:"18px"}}>🏠 Dashboard</h2>

            {/* Challenge progress or Funded mode */}
            {rules?.isFunded ? (
              <div style={{background:"rgba(16,185,129,0.06)",border:"1px solid #10b98133",borderRadius:"16px",padding:"20px",marginBottom:"16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"14px"}}>
                  <span style={{fontSize:"28px"}}>✅</span>
                  <div>
                    <div style={{fontSize:"16px",fontWeight:"800",color:"#10b981"}}>Compte FTMO Financé</div>
                    <div style={{fontSize:"12px",color:"#555"}}>{rules?.label} • ${accountSize.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{background:"rgba(255,255,255,0.02)",borderRadius:"12px",padding:"14px",marginBottom:"10px"}}>
                  <div style={{fontSize:"11px",color:"#10b981",marginBottom:"8px",textTransform:"uppercase",letterSpacing:"1px"}}>🎯 Objectif Compte Financé</div>
                  {[
                    {label:"Protéger le capital",value:"Priorité #1",color:"#ef4444"},
                    {label:"Perte max/jour",value:`${rules?.dailyLoss}$`,color:"#f59e0b"},
                    {label:"Perte max totale",value:`${rules?.maxLoss}$`,color:"#f59e0b"},
                    {label:"Règle 50% Best Day",value:rules?.bestDay?"✅ Active — Vérifiée au payout":"Non applicable",color:rules?.bestDay?"#f59e0b":"#555"},
                    {label:"Payout",value:`${rules?.payout}%`,color:"#10b981"},
                    {label:"Profit accumulé",value:fmt(totalProfit),color:totalProfit>=0?"#10b981":"#ef4444"},
                  ].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<5?"1px solid #111":"none"}}>
                      <span style={{fontSize:"13px",color:"#666"}}>{r.label}</span>
                      <span style={{fontSize:"13px",fontWeight:"700",color:r.color}}>{r.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:"12px",color:"#555",textAlign:"center"}}>
                  💡 Mode Funded — Protège ton compte !{rules?.bestDay?" La règle 50% Best Day s'applique au moment du payout.":""}
                </div>
              </div>
            ) : (
              <div style={{background:"rgba(168,85,247,0.05)",border:"1px solid #a855f722",borderRadius:"16px",padding:"20px",marginBottom:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"10px"}}>
                  <span style={{color:"#888",fontSize:"13px"}}>Progression Challenge {rules?.steps===2?`— Phase ${phase}`:""}</span>
                  <span style={{color:"#a855f7",fontWeight:"800"}}>{Math.round(progress)}%</span>
                </div>
                <div style={{height:"12px",background:"#111",borderRadius:"99px",overflow:"hidden",marginBottom:"8px"}}>
                  <div style={{height:"100%",width:`${progress}%`,background:progress>=100?"#10b981":"linear-gradient(90deg,#a855f7,#00d4ff)",borderRadius:"99px",transition:"width 0.5s ease"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",color:"#444"}}>
                  <span>{fmt(totalProfit)}</span>
                  <span style={{color:progress>=100?"#10b981":"#555"}}>{progress>=100?"🎉 RÉUSSI !":"Objectif: "+rules?.profitTarget+"$"}</span>
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"16px"}}>
              {[
                {label:"Profit Total",value:fmt(totalProfit),color:totalProfit>=0?"#10b981":"#ef4444"},
                {label:"Trades fermés",value:closedTrades.length,color:"#00d4ff"},
                {label:"Win Rate",value:closedTrades.length?Math.round(closedTrades.filter(t=>t.result==="TP").length/closedTrades.length*100)+"%":"—",color:"#a855f7"},
                {label:"Trades ouverts",value:openTrades.length,color:"#f59e0b"},
              ].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid #15152a",borderRadius:"12px",padding:"16px"}}>
                  <div style={{fontSize:"11px",color:"#555",marginBottom:"6px"}}>{s.label}</div>
                  <div style={{fontSize:"22px",fontWeight:"800",color:s.color}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Daily loss bar */}
            <div style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${dailyLossUsed>=rules?.dailyLoss*0.66?"#ef444433":"#15152a"}`,borderRadius:"14px",padding:"18px",marginBottom:"16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                <span style={{color:"#888",fontSize:"13px"}}>Perte journalière</span>
                <span style={{color:dailyLossUsed>=rules?.dailyLoss?"#ef4444":"#f59e0b",fontSize:"13px",fontWeight:"700"}}>{dailyLossUsed}$ / {rules?.dailyLoss}$</span>
              </div>
              <div style={{height:"10px",background:"#111",borderRadius:"99px",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min((dailyLossUsed/rules?.dailyLoss)*100,100)}%`,background:dailyLossUsed>=rules?.dailyLoss?"#ef4444":dailyLossUsed>=rules?.dailyLoss*0.66?"#f59e0b":"#10b981",borderRadius:"99px",transition:"width 0.5s"}}/>
              </div>
            </div>

            {/* Account rules reminder */}
            <div style={{background:"rgba(255,255,255,0.01)",border:"1px solid #15152a",borderRadius:"14px",padding:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"1px"}}>Règles {rules?.label}</div>
              {[
                `Daily loss max: ${rules?.dailyLoss}$ (${(rules?.dailyLossPct*100).toFixed(0)}%)`,
                `Max loss: ${rules?.maxLoss}$ (${rules?.trailing?"EOD Trailing":"Static"})`,
                `Risque/trade: ${rules?.riskPerTrade}$ → Gain: ${rules?.rewardPerTrade}$`,
                rules?.bestDay?"Best Day: max 50% du total":null,
                `Payout: ${rules?.payout}%`,
              ].filter(Boolean).map((r,i)=>(
                <div key={i} style={{fontSize:"12px",color:"#666",padding:"6px 0",borderBottom:i<3?"1px solid #0d0d1a":"none"}}>{r}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETUP TAB ── */}
        {tab==="setup" && (
          <div>
            <h2 style={{color:"#a855f7",marginBottom:"18px"}}>⚙️ Configuration Compte</h2>
            <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Type de Challenge</p>
            <div style={{display:"flex",gap:"12px",marginBottom:"24px"}}>
              {Object.entries(ACCOUNT_TYPES).map(([key,a])=>(
                <button key={key} onClick={()=>setAccountType(key)}
                  style={{flex:1,padding:"16px",borderRadius:"14px",border:`2px solid ${accountType===key?a.color:"#1a1a2e"}`,background:accountType===key?`${a.color}15`:"rgba(255,255,255,0.02)",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:"15px",fontWeight:"800",color:a.color,marginBottom:"4px"}}>{a.label}</div>
                  <div style={{fontSize:"10px",color:"#555"}}>{key==="1step"?"3% daily • EOD Trailing":"5% daily • Static"}</div>
                  <div style={{fontSize:"11px",color:a.color,marginTop:"4px",fontWeight:"700"}}>{a.payout}% payout</div>
                </button>
              ))}
            </div>

            <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Taille du Compte</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"24px"}}>
              {SIZES.map(s=>(
                <button key={s} onClick={()=>setAccountSize(s)}
                  style={{flex:"1",minWidth:"70px",padding:"12px",borderRadius:"12px",border:`1px solid ${accountSize===s?"#a855f7":"#1a1a2e"}`,background:accountSize===s?"rgba(168,85,247,0.15)":"rgba(255,255,255,0.02)",color:accountSize===s?"#a855f7":"#555",cursor:"pointer",fontSize:"13px",fontWeight:accountSize===s?"700":"400"}}>
                  ${(s/1000).toFixed(0)}K
                </button>
              ))}
            </div>

            {accountType==="2step" && (
              <div style={{marginBottom:"24px"}}>
                <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Phase</p>
                <div style={{display:"flex",gap:"8px"}}>
                  {[1,2].map(p=>(
                    <button key={p} onClick={()=>setPhase(p)}
                      style={{flex:1,padding:"12px",borderRadius:"12px",border:`1px solid ${phase===p?"#00d4ff":"#1a1a2e"}`,background:phase===p?"rgba(0,212,255,0.12)":"rgba(255,255,255,0.02)",color:phase===p?"#00d4ff":"#555",cursor:"pointer",fontSize:"14px",fontWeight:phase===p?"700":"400"}}>
                      Phase {p} {p===1?"(10%)":"(5%)"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p style={{color:"#888",fontSize:"12px",marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1px"}}>Statut du Compte</p>
            <div style={{display:"flex",gap:"10px",marginBottom:"24px"}}>
              {[
                {id:"evaluation",icon:"⏳",label:"Évaluation",sub:"Je passe le challenge",color:"#f59e0b"},
                {id:"funded",icon:"✅",label:"Compte Financé",sub:"Évaluation déjà passée",color:"#10b981"},
              ].map(s=>(
                <button key={s.id} onClick={()=>setAccountStatus(s.id)}
                  style={{flex:1,padding:"14px 10px",borderRadius:"12px",border:`2px solid ${accountStatus===s.id?s.color:"#1a1a2e"}`,background:accountStatus===s.id?`${s.color}15`:"rgba(255,255,255,0.02)",cursor:"pointer",textAlign:"center",transition:"all 0.2s"}}>
                  <div style={{fontSize:"20px",marginBottom:"4px"}}>{s.icon}</div>
                  <div style={{fontSize:"13px",fontWeight:"800",color:accountStatus===s.id?s.color:"#555"}}>{s.label}</div>
                  <div style={{fontSize:"10px",color:"#444",marginTop:"3px"}}>{s.sub}</div>
                </button>
              ))}
            </div>

            <button onClick={()=>setTab("signal")}
              style={{width:"100%",padding:"16px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#a855f7,#00d4ff)",color:"#fff",cursor:"pointer",fontSize:"15px",fontWeight:"800",boxShadow:"0 4px 24px rgba(168,85,247,0.3)"}}>
              ✅ Sauvegarder et Trader
            </button>

            {/* Multiple challenges */}
            <div style={{marginTop:"28px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                <h3 style={{color:"#a855f7",margin:0,fontSize:"15px"}}>📂 Mes Challenges ({challenges.length})</h3>
                <button onClick={()=>setShowAddChallenge(s=>!s)}
                  style={{padding:"6px 14px",borderRadius:"10px",border:"1px solid #a855f755",background:"rgba(168,85,247,0.12)",color:"#a855f7",cursor:"pointer",fontSize:"13px",fontWeight:"700"}}>
                  {showAddChallenge?"✕ Annuler":"+ Ajouter"}
                </button>
              </div>

              {showAddChallenge && (
                <div style={{background:"rgba(168,85,247,0.06)",border:"1px solid #a855f733",borderRadius:"14px",padding:"16px",marginBottom:"14px",animation:"fadeUp 0.3s ease"}}>
                  <div style={{fontSize:"11px",color:"#555",marginBottom:"8px"}}>Nom du challenge (optionnel)</div>
                  <input value={newChalName} onChange={e=>setNewChalName(e.target.value)}
                    placeholder="ex: Challenge Principal, Test Stratégie..."
                    style={{width:"100%",padding:"10px 12px",borderRadius:"10px",border:"1px solid #1a1a2e",background:"#111",color:"#fff",fontSize:"14px",outline:"none",marginBottom:"12px",boxSizing:"border-box"}}/>
                  <div style={{fontSize:"11px",color:"#666",marginBottom:"10px"}}>
                    Compte: <span style={{color:ACCOUNT_TYPES[accountType]?.color||"#a855f7"}}>{rules?.label}</span> — ${accountSize.toLocaleString()}
                  </div>
                  <button onClick={addChallenge}
                    style={{width:"100%",padding:"12px",borderRadius:"10px",border:"none",background:"linear-gradient(135deg,#a855f7,#6366f1)",color:"#fff",cursor:"pointer",fontSize:"14px",fontWeight:"700"}}>
                    ✅ Créer ce Challenge
                  </button>
                </div>
              )}

              {challenges.length===0 ? (
                <div style={{textAlign:"center",padding:"24px",color:"#333",fontSize:"13px",border:"1px dashed #1a1a2e",borderRadius:"12px"}}>
                  Aucun challenge — clique sur "+ Ajouter" pour commencer
                </div>
              ) : (
                challenges.map(c=>{
                  const cRules = (() => {
                    const a = ACCOUNT_TYPES[c.accountType];
                    if(!a) return null;
                    const target = c.phase===2 && a.phase2TargetPct ? c.accountSize*a.phase2TargetPct : c.accountSize*a.profitTargetPct;
                    return {...a, profitTarget:target, riskPerTrade:Math.round(c.accountSize*0.008)};
                  })();
                  const cProgress = cRules ? Math.min((c.totalProfit/cRules.profitTarget)*100,100) : 0;
                  const isActive = activeChallengeId===c.id;
                  return (
                    <div key={c.id} onClick={()=>setActiveChallengeId(c.id)}
                      style={{background:isActive?"rgba(168,85,247,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${isActive?"#a855f755":"#15152a"}`,borderRadius:"14px",padding:"16px",marginBottom:"10px",cursor:"pointer",transition:"all 0.2s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
                        <div>
                          <div style={{fontSize:"14px",fontWeight:"700",color:isActive?"#a855f7":"#fff",marginBottom:"3px"}}>{c.name}</div>
                          <div style={{fontSize:"11px",color:"#555"}}>{ACCOUNT_TYPES[c.accountType]?.label} • ${c.accountSize.toLocaleString()} • Depuis {c.startDate}</div>
                        </div>
                        <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                          <button onClick={e=>{e.stopPropagation();toggleChallengeStatus(c.id);}}
                            style={{padding:"4px 10px",borderRadius:"99px",border:"none",background:c.status==="funded"?"rgba(16,185,129,0.2)":"rgba(245,158,11,0.2)",color:c.status==="funded"?"#10b981":"#f59e0b",cursor:"pointer",fontSize:"11px",fontWeight:"700"}}>
                            {c.status==="funded"?"✅ Funded":"⏳ Évaluation"}
                          </button>
                          <button onClick={e=>{e.stopPropagation();removeChallenge(c.id);}}
                            style={{width:"24px",height:"24px",borderRadius:"6px",border:"1px solid #1a1a2e",background:"transparent",color:"#444",cursor:"pointer",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                        </div>
                      </div>
                      <div style={{height:"6px",background:"#111",borderRadius:"99px",overflow:"hidden",marginBottom:"6px"}}>
                        <div style={{height:"100%",width:`${cProgress}%`,background:cProgress>=100?"#10b981":ACCOUNT_TYPES[c.accountType]?.color||"#a855f7",borderRadius:"99px",transition:"width 0.5s"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:"#444"}}>
                        <span>{cProgress>=100?"🎉 Challenge réussi !":Math.round(cProgress)+"% de l'objectif"}</span>
                        <span>{cRules?.profitTarget}$ cible</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      </div>{/* end app content overlay */}

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(13,13,26,0.9)",backdropFilter:"blur(16px)",borderTop:"1px solid rgba(168,85,247,0.15)",display:"flex",justifyContent:"space-around",padding:"10px 0",zIndex:100}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",background:"none",border:"none",cursor:"pointer",color:tab===n.id?"#a855f7":"#333",fontSize:"10px",fontWeight:tab===n.id?"700":"400",position:"relative"}}>
            {n.id==="trades"&&openTrades.length>0&&<span style={{position:"absolute",top:"-2px",right:"8px",background:"#f59e0b",borderRadius:"99px",width:"8px",height:"8px"}}/>}
            <span style={{fontSize:"20px"}}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}
