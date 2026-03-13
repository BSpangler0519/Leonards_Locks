// ============================================================
// STATE
// ============================================================
var API_KEY = localStorage.getItem('oddsApiKey') || '';
var CLAUDE_KEY = localStorage.getItem('claudeApiKey') || '';
var BANKROLL = parseFloat(localStorage.getItem('bankroll')) || 0;
var betSlip = [];
var parlayLegs = [{id:1,odds:-110},{id:2,odds:150}];
var parlayLegId = 3;
var allGamesData = [];
var allPicks = [];
var currentPickFilter = 'all';
var suggestedParlay = [];
var currentOddsFilter = 'all';
var statsMode = 'team';
var matchupTeam1 = null, matchupTeam2 = null;
var currentBetType = 'ml';
var editPanelOpen = false;
var selectedBookmaker = localStorage.getItem('preferredBook') || 'all';
var currentBetsSubTab = 'pending-panel';
var currentToolsSubTab = 'calc-panel';
var currentAccuracyView = 'ai';

var historyData = JSON.parse(localStorage.getItem('betHistory') || 'null') || [];
var pendingBets = JSON.parse(localStorage.getItem('pendingBets') || '[]');
var pickAccuracy = JSON.parse(localStorage.getItem('pickAccuracy') || '[]');
var prevOddsSnapshot = JSON.parse(localStorage.getItem('prevOddsSnapshot') || '{}');
var gameFlags = JSON.parse(localStorage.getItem('gameFlags') || '{}'); // {gameId: {injury_home, injury_away, fatigue_home, fatigue_away, note}}

// Cache
var CACHE_MINUTES = 30;
var oddsCache = null;
var cacheTimerInterval = null;

// ============================================================
// MATH
// ============================================================
function aToDec(o){ return o>0 ? o/100+1 : 100/Math.abs(o)+1; }
function implied(o){ return ((1/aToDec(o))*100).toFixed(1); }
function fmt(o){ return o>0?'+'+o:''+o; }
function calcParlay(legs){
  if(!legs.length) return {dec:1,prob:'0.0',american:0};
  var dec=legs.reduce(function(a,l){return a*aToDec(l.odds);},1);
  var am=dec>=2?Math.round((dec-1)*100):Math.round(-100/(dec-1));
  return {dec:dec,prob:((1/dec)*100).toFixed(1),american:am};
}

// ============================================================
// THEME / SPLASH
// ============================================================
var currentTheme = localStorage.getItem('theme') || 'dark';
function applyTheme(){
  var btn=document.getElementById('theme-btn');
  if(currentTheme==='light'){ document.body.classList.add('light'); if(btn) btn.textContent='DARK'; }
  else { document.body.classList.remove('light'); if(btn) btn.textContent='LIGHT'; }
}
function toggleTheme(){
  currentTheme = currentTheme==='dark'?'light':'dark';
  localStorage.setItem('theme',currentTheme);
  applyTheme();
}
var SHOW_SPLASH = true;
function dismissSplash(){
  var splash=document.getElementById('splash-screen');
  if(!splash||splash.style.display==='none') return;
  splash.removeEventListener('click', dismissSplash);
  splash.style.transition='opacity 0.8s'; splash.style.opacity='0';
  setTimeout(function(){
    splash.style.display='none';
    if(API_KEY) launchApp(); else showSetup();
  },800);
}
window.onload = function(){
  applyTheme();
  if(SHOW_SPLASH){
    var splash=document.getElementById('splash-screen');
    if(splash){
      var splashTapped=false;
      function splashTap(e){ if(splashTapped) return; splashTapped=true; dismissSplash(); }
      splash.addEventListener('touchstart', splashTap, {passive:true});
      splash.addEventListener('click', splashTap);
      // Show tap hint after 3s
      setTimeout(function(){ var h=document.getElementById('splash-hint'); if(h) h.style.opacity='1'; },3000);
      // Safety auto-dismiss after 30s
      setTimeout(dismissSplash, 30000);
      return;
    }
  }
  if(API_KEY) launchApp(); else showSetup();
};

// ============================================================
// SETUP
// ============================================================
function saveApiKey(){
  var k=document.getElementById('api-key-input').value.trim();
  if(!k){alert('Please paste your Odds API key first.');return;}
  API_KEY=k; localStorage.setItem('oddsApiKey',k);
  var ck=document.getElementById('claude-key-input').value.trim();
  if(ck){ CLAUDE_KEY=ck; localStorage.setItem('claudeApiKey',ck); }
  launchApp();
}
function skipSetup(){ launchApp(); }
function showSetup(){
  document.getElementById('setup-screen').style.display='block';
  document.getElementById('header').style.display='none';
  document.getElementById('content').style.display='none';
  if(API_KEY) document.getElementById('api-key-input').value=API_KEY;
  if(CLAUDE_KEY) document.getElementById('claude-key-input').value=CLAUDE_KEY;
}
function launchApp(){
  document.getElementById('setup-screen').style.display='none';
  document.getElementById('header').style.display='block';
  document.getElementById('content').style.display='block';
  initApp();
}
function initApp(){
  renderParlayLegs(); updateSingle(); updateParlay();
  renderHistory(); renderPendingBets(); updateBetsBadge();
  renderAccuracyTab();
  initPreferredBook();
  var bi=document.getElementById('bankroll-input');
  if(bi&&BANKROLL) bi.value=BANKROLL;
  if(API_KEY){ fetchOdds(); checkPendingBets(); generatePicks(); startCacheTimer(); }
  else renderOddsError('add_key');
  switchTab('games');
}

// ============================================================
// TABS
// ============================================================
function switchTab(name){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name);});
  document.querySelectorAll('.tab-content').forEach(function(t){t.style.display='none';});
  var el=document.getElementById('tab-'+name);
  if(el) el.style.display='block';
}
function switchPicksSub(panel){
  document.querySelectorAll('#tab-picks .sub-tab').forEach(function(b){b.classList.toggle('active',b.dataset.st===panel);});
  document.getElementById('picks-panel').style.display = panel==='picks-panel'?'block':'none';
  document.getElementById('slip-panel').style.display = panel==='slip-panel'?'block':'none';
}
function switchBetsSub(panel){
  currentBetsSubTab = panel;
  document.querySelectorAll('#tab-bets .sub-tab').forEach(function(b){b.classList.toggle('active',b.dataset.st===panel);});
  ['pending-panel','log-panel','accuracy-panel'].forEach(function(p){
    document.getElementById(p).style.display = p===panel?'block':'none';
  });
  if(panel==='accuracy-panel') renderAccuracyTab();
  if(panel==='log-panel') renderHistory();
}
function switchToolsSub(panel){
  currentToolsSubTab = panel;
  document.querySelectorAll('#tab-tools .sub-tab').forEach(function(b){b.classList.toggle('active',b.dataset.st===panel);});
  ['calc-panel','stats-panel','keys-panel'].forEach(function(p){
    document.getElementById(p).style.display = p===panel?'block':'none';
  });
}

// ============================================================
// BOOKMAKER SELECTOR
// ============================================================
var KNOWN_BOOKS = ['DraftKings','FanDuel','BetMGM','BetRivers','Bovada','BetOnline','LowVig'];
var availableBooks = [];

function buildBookSelector(games){
  var books = {};
  games.forEach(function(g){
    if(g._rawBookmakers) g._rawBookmakers.forEach(function(b){ books[b.key] = b.title; });
  });
  availableBooks = Object.keys(books).map(function(k){return{key:k,title:books[k]};});
  if(availableBooks.length <= 1){ document.getElementById('book-selector-row').style.display='none'; return; }
  document.getElementById('book-selector-row').style.display='block';
  // If preferred book not in response, fall back to 'all' silently
  var preferred=localStorage.getItem('preferredBook')||'all';
  var prefAvail=preferred==='all'||availableBooks.some(function(b){return b.key===preferred;});
  if(!prefAvail) selectedBookmaker='all';
  var html = '<button class="book-btn'+(selectedBookmaker==='all'?' active':'')+'" data-key="all" onclick="selectBook(\'all\')">BEST</button>';
  availableBooks.forEach(function(b){
    html += '<button class="book-btn'+(selectedBookmaker===b.key?' active':'')+'" data-key="'+b.key+'" onclick="selectBook(\''+b.key+'\')">'+b.title.replace('DraftKings','DK').replace('FanDuel','FD').replace('BetMGM','MGM').replace('BetRivers','Rivers').replace('Caesars','CZR')+'</button>';
  });
  document.getElementById('book-btns').innerHTML = html;
}

function selectBook(key){
  selectedBookmaker = key;
  localStorage.setItem('preferredBook', key);
  document.querySelectorAll('.book-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-key')===key);
  });
  if(window._rawGamesData){
    allGamesData = window._rawGamesData.map(function(g){ return transformGame(g, key); }).filter(Boolean);
    renderFilteredGames();
  }
}

// ============================================================
// CACHE
// ============================================================
function getCacheAge(){ return oddsCache ? Math.floor((Date.now()-oddsCache.timestamp)/1000) : null; }
function cacheExpired(){ var age=getCacheAge(); return age===null||age>CACHE_MINUTES*60; }
function updateCacheUI(){
  var statusEl=document.getElementById('cache-status');
  var forceBtn=document.getElementById('force-refresh-btn');
  if(!statusEl) return;
  if(!oddsCache){ statusEl.textContent=''; if(forceBtn) forceBtn.style.display='none'; return; }
  var age=getCacheAge();
  var remaining=Math.max(0,CACHE_MINUTES*60-age);
  var mins=Math.floor(remaining/60), secs=remaining%60;
  if(remaining>0){
    statusEl.style.color=remaining<120?'#f97316':'#445566';
    statusEl.textContent='Cache: '+mins+'m '+secs+'s';
    if(forceBtn) forceBtn.style.display='block';
  } else {
    statusEl.style.color='#38bdf8';
    statusEl.textContent='Cache expired - tap refresh';
    if(forceBtn) forceBtn.style.display='none';
  }
}
function startCacheTimer(){
  if(cacheTimerInterval) clearInterval(cacheTimerInterval);
  cacheTimerInterval=setInterval(updateCacheUI,1000);
}
async function forceRefresh(){
  oddsCache=null;
  document.getElementById('force-refresh-btn').style.display='none';
  document.getElementById('cache-status').textContent='';
  await refreshAll();
}

// ============================================================
// LINE MOVEMENT
// ============================================================
function saveOddsSnapshot(){
  var snap={};
  allGamesData.forEach(function(g){ snap[g.id]={homeML:g.homeML,awayML:g.awayML,spread:g.spread,total:g.total}; });
  localStorage.setItem('prevOddsSnapshot',JSON.stringify(snap));
}
function getLineMovement(gameId,field,current){
  var prev=prevOddsSnapshot[gameId];
  if(!prev||prev[field]==null||current==null) return null;
  var diff=current-prev[field];
  if(Math.abs(diff)<0.05) return null;
  return {diff:diff,prev:prev[field],current:current};
}

// ============================================================
// ODDS API
// ============================================================
function filterOdds(f){
  currentOddsFilter=f;
  document.querySelectorAll('.odds-filter').forEach(function(b){
    var a=b.dataset.f===f;
    b.style.borderColor=a?'#f59e0b':'#2a3a4a';
    b.style.background=a?'rgba(245,158,11,0.15)':'transparent';
    b.style.color=a?'#f59e0b':'#7a8fa6';
  });
  renderFilteredGames();
}

function renderFilteredGames(){
  var today=new Date(); today.setHours(0,0,0,0);
  var filtered=allGamesData.filter(function(g){
    if(currentOddsFilter==='today'){ var gd=new Date(g.commence_time); gd.setHours(0,0,0,0); return gd.getTime()===today.getTime(); }
    if(currentOddsFilter==='tournament') return g.league==='tournament';
    if(currentOddsFilter==='ncaab') return g.league==='ncaab';
    return true;
  });
  var countEl=document.getElementById('odds-game-count');
  if(countEl) countEl.textContent=filtered.length+' game'+(filtered.length!==1?'s':'')+' shown';
  if(!filtered.length){
    document.getElementById('odds-list').innerHTML='<div class="empty">No games match this filter.<br/><span style="font-size:11px">Try ALL to see everything.</span></div>';
    return;
  }
  renderGames(filtered);
}

async function fetchOdds(){
  if(!API_KEY){renderOddsError('add_key');return;}
  var btn=document.getElementById('refresh-btn');
  btn.disabled=true; btn.innerHTML='...';

  if(!cacheExpired()&&oddsCache){
    var cached=oddsCache.data;
    window._rawGamesData=cached;
    allGamesData=cached.map(function(g){return transformGame(g,selectedBookmaker);}).filter(Boolean);
    buildBookSelector(cached);
    document.getElementById('odds-filters').style.display=allGamesData.length?'block':'none';
    if(allGamesData.length){
      var hasTourney=allGamesData.some(function(g){return g.league==='tournament';});
      filterOdds(hasTourney?'tournament':currentOddsFilter);
    }
    document.getElementById('last-updated').textContent='Updated '+new Date(oddsCache.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' (cached)';
    updateCacheUI();
    btn.disabled=false; btn.innerHTML='&#8635;';
    return;
  }

  document.getElementById('odds-loading').style.display='block';
  document.getElementById('odds-list').innerHTML='';
  document.getElementById('odds-error').style.display='none';
  document.getElementById('odds-filters').style.display='none';

  try{
    var params='odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey='+API_KEY;
    var base='https://api.the-odds-api.com/v4/sports/';
    var results=await Promise.allSettled([
      fetch(base+'basketball_ncaab/'+params).then(function(r){return r.ok?r.json():[];}),
      fetch(base+'basketball_ncaab_championship/'+params).then(function(r){return r.ok?r.json():[];})
    ]);
    var d1=(results[0].status==='fulfilled'&&Array.isArray(results[0].value))?results[0].value:[];
    var d2=(results[1].status==='fulfilled'&&Array.isArray(results[1].value))?results[1].value:[];
    d1.forEach(function(g){g._league='ncaab';}); d2.forEach(function(g){g._league='tournament';});
    var combined=d1.concat(d2);
    combined.sort(function(a,b){return new Date(a.commence_time)-new Date(b.commence_time);});

    saveOddsSnapshot();
    oddsCache={data:combined,timestamp:Date.now()};
    startCacheTimer();
    window._rawGamesData=combined;
    allGamesData=combined.map(function(g){return transformGame(g,selectedBookmaker);}).filter(Boolean);
    buildBookSelector(combined);

    document.getElementById('odds-loading').style.display='none';
    if(!allGamesData.length){
      document.getElementById('odds-list').innerHTML='<div class="empty">No NCAA games with odds right now.<br/><span style="font-size:11px">Odds appear ~1 week before games.<br/></span></div>';
    } else {
      document.getElementById('odds-filters').style.display='block';
      filterOdds(d2.length>0?'tournament':'all');
    }
    var now=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    document.getElementById('last-updated').textContent='Updated '+now+' &middot; '+allGamesData.length+' games';
    updateCacheUI();
  } catch(e){
    document.getElementById('odds-loading').style.display='none';
    renderOddsError(e.message);
  }
  btn.disabled=false; btn.innerHTML='&#8635;';
}

function renderOddsError(msg){
  var el=document.getElementById('odds-error');
  el.style.display='block';
  if(msg==='add_key'){
    el.innerHTML='<div class="alert-yellow"><strong>&#9881; No API Key Set</strong>Get a free key at <a href="https://the-odds-api.com" target="_blank" style="color:#60a5fa">the-odds-api.com</a> (takes 2 min).<br/>Then tap <strong>TOOLS &rarr; KEYS &rarr; Change API Keys</strong>.<br/></div>';
  } else {
    el.innerHTML='<div class="alert-red">Error: '+msg+' &mdash; <span onclick="fetchOdds()" style="text-decoration:underline;cursor:pointer">retry</span></div>';
  }
}

function transformGame(g, bookKey){
  // Attach raw bookmakers for selector
  g._rawBookmakers = g.bookmakers;

  var books = g.bookmakers || [];
  if(!books.length) return null;

  // Count how many markets a bookmaker has (h2h=1, spreads=2, totals=4 - bitmask score)
  function bookScore(b){
    var keys = (b.markets||[]).map(function(m){return m.key;});
    return (keys.indexOf('h2h')>-1?1:0) + (keys.indexOf('spreads')>-1?2:0) + (keys.indexOf('totals')>-1?4:0);
  }

  var bk;
  if(!bookKey || bookKey==='all'){
    // BEST: pick the bookmaker with the most complete set of markets (h2h + spreads + totals)
    bk = books.reduce(function(best, b){
      return bookScore(b) > bookScore(best) ? b : best;
    }, books[0]);
  } else {
    bk = books.find(function(b){return b.key===bookKey;});
    if(!bk) bk = books[0];
  }
  if(!bk) return null;

  var home=g.home_team, away=g.away_team;

  // For each market, use selected book first, fall back to any book that has it
  function getMarket(key){
    var m = (bk.markets||[]).find(function(m){return m.key===key;});
    if(m) return m;
    // Fallback: find any bookmaker with this market
    for(var i=0;i<books.length;i++){
      m = (books[i].markets||[]).find(function(m){return m.key===key;});
      if(m) return m;
    }
    return null;
  }

  var h2h=getMarket('h2h');
  var spr=getMarket('spreads');
  var tot=getMarket('totals');
  var h2hO=h2h?h2h.outcomes:[];
  var sprO=spr?spr.outcomes:[];
  var totO=tot?tot.outcomes:[];
  var homeML=h2hO.find(function(o){return o.name===home;});
  var awayML=h2hO.find(function(o){return o.name===away;});
  var homeSpread=sprO.find(function(o){return o.name===home;});
  var overTotal=totO.find(function(o){return o.name==='Over';});
  if(!homeML||!awayML) return null;
  var t=new Date(g.commence_time);
  return {
    id:g.id, home:home, away:away,
    homeML:homeML.price, awayML:awayML.price,
    spread:homeSpread?homeSpread.point:null,
    spreadOdds:homeSpread?homeSpread.price:-110,
    total:overTotal?overTotal.point:null,
    book:bk.title,
    league:g._league||'ncaab',
    isTournament:g._league==='tournament',
    commence_time:g.commence_time,
    time:t.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',timeZoneName:'short'}),
    date:t.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})
  };
}

function escQ(s){ return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function shortName(t){ return (t||'').split(' ').slice(-1)[0]; }

function renderGames(games){
  var html='';
  games.forEach(function(g){
    var fav=g.homeML<g.awayML?'home':'away';
    var hAct=isInSlip(g.id,'homeML'), aAct=isInSlip(g.id,'awayML');
    var spAct=isInSlip(g.id,'spread'), ouAct=isInSlip(g.id,'ou');
    var spLabel=g.spread!=null?shortName(g.home)+' '+fmt(g.spread):'N/A';
    var totLabel=g.total!=null?''+g.total:'N/A';
    var badge=g.isTournament?'<span style="font-size:8px;color:#f59e0b;background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);border-radius:6px;padding:2px 6px;margin-left:6px;font-weight:700;vertical-align:middle">TOURNEY</span>':'';
    html+='<div class="card">'
      +'<div class="card-header"><span class="book">'+g.book+badge+'</span><span class="time">'+g.date+' &middot; '+g.time+'</span></div>'
      +'<div class="card-body">'
      +'<div class="team-row">'
      +'<div><div class="team-name'+(fav==='away'?' fav':'')+'">'+g.away+(fav==='away'?'<span class="fav-star">&#9733;</span>':'')+'</div><div class="implied">Implied '+implied(g.awayML)+'%</div></div>'
      +'<button class="odds-btn '+(g.awayML>0?'dog':'fav-btn')+(aAct?' active':'')+'" onclick="toggleSlip(\''+g.id+'\',\'awayML\','+g.awayML+',\''+escQ(g.away)+' ML\',this)">'+fmt(g.awayML)+'</button>'
      +'</div>'
      +'<div class="team-row">'
      +'<div><div class="team-name'+(fav==='home'?' fav':'')+'">'+g.home+(fav==='home'?'<span class="fav-star">&#9733;</span>':'')+'</div><div class="implied">Implied '+implied(g.homeML)+'%</div></div>'
      +'<button class="odds-btn '+(g.homeML>0?'dog':'fav-btn')+(hAct?' active':'')+'" onclick="toggleSlip(\''+g.id+'\',\'homeML\','+g.homeML+',\''+escQ(g.home)+' ML\',this)">'+fmt(g.homeML)+'</button>'
      +'</div>'
      +'<div class="sub-bets">'
      +'<button class="sub-btn'+(spAct?' active':'')+'" onclick="toggleSlip(\''+g.id+'\',\'spread\','+g.spreadOdds+',this.dataset.sliplabel,this)" data-sliplabel="'+escQ(spLabel)+'">'
      +'<div class="sub-label">SPREAD</div><div class="sub-val">'+spLabel+'</div><div class="sub-odds">'+fmt(g.spreadOdds)+'</div></button>'
      +'<button class="sub-btn'+(ouAct?' active':'')+'" onclick="toggleSlip(\''+g.id+'\',\'ou\',-110,this.dataset.sliplabel,this)" data-sliplabel="O/U '+totLabel+' ('+escQ(shortName(g.away))+' vs '+escQ(shortName(g.home))+')">'
      +'<div class="sub-label">TOTAL</div><div class="sub-val">'+totLabel+'</div><div class="sub-odds">O/U -110</div></button>'
      +'</div>'
      +'<div style="border-top:1px solid #1a2535;margin-top:8px;padding-top:8px;display:flex;gap:6px">'
      +'<button onclick="quickAddBet({away:\''+escQ(g.away)+'\',home:\''+escQ(g.home)+'\',commence_time:\''+g.commence_time+'\',type:\'ml\',team:\''+escQ(g.away)+'\',opponent:\''+escQ(g.home)+'\',odds:'+g.awayML+'})" style="flex:1;padding:5px 4px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:6px;color:#38bdf8;font-size:9px;font-weight:700;font-family:inherit">+ BET ML</button>'
      +(g.spread!=null?'<button onclick="quickAddBet({away:\''+escQ(g.away)+'\',home:\''+escQ(g.home)+'\',commence_time:\''+g.commence_time+'\',type:\'spread\',team:\''+escQ(g.home)+'\',opponent:\''+escQ(g.away)+'\',spread:'+g.spread+',odds:'+g.spreadOdds+'})" style="flex:1;padding:5px 4px;background:rgba(192,132,252,0.08);border:1px solid rgba(192,132,252,0.3);border-radius:6px;color:#c084fc;font-size:9px;font-weight:700;font-family:inherit">+ BET SPREAD</button>':'')
      +(g.total!=null?'<button onclick="quickAddBet({away:\''+escQ(g.away)+'\',home:\''+escQ(g.home)+'\',commence_time:\''+g.commence_time+'\',type:\'ou\',team:\''+escQ(g.away)+'\',opponent:\''+escQ(g.home)+'\',total:'+g.total+',ouSide:\'over\',odds:-110})" style="flex:1;padding:5px 4px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);border-radius:6px;color:#34d399;font-size:9px;font-weight:700;font-family:inherit">+ BET O/U</button>':'')
      +'<button onclick="openGameAnalysis(\''+g.id+'\',\''+escQ(g.away)+'\',\''+escQ(g.home)+'\')" style="flex:1;padding:5px 4px;background:rgba(129,140,248,0.08);border:1px solid rgba(129,140,248,0.3);border-radius:6px;color:#818cf8;font-size:9px;font-weight:700;font-family:inherit">'+(gameFlags[g.id]&&(gameFlags[g.id].injury_home||gameFlags[g.id].injury_away||gameFlags[g.id].fatigue_home||gameFlags[g.id].fatigue_away)?'&#9888; ':'')+'ASK CLAUDE</button>'+'</div></div></div>';
  });
  document.getElementById('odds-list').innerHTML=html;
}

// ============================================================
// BET SLIP
// ============================================================
function isInSlip(gid,type){ return betSlip.some(function(b){return b.key===gid+'-'+type;}); }
function toggleSlip(gid,type,odds,labelOrEl,btn){
  var label=(typeof labelOrEl==='string')?labelOrEl:btn.dataset.sliplabel||labelOrEl;
  var key=gid+'-'+type;
  var idx=betSlip.findIndex(function(b){return b.key===key;});
  if(idx>-1){betSlip.splice(idx,1);btn.classList.remove('active');}
  else{betSlip.push({key:key,label:label,odds:odds});btn.classList.add('active');}
  renderSlip(); updateBadge();
}
function updateBadge(){
  var b=document.getElementById('picks-badge');
  // use slip count in badge on PICKS tab
  if(betSlip.length){b.style.display='block';b.textContent=betSlip.length;}
  else b.style.display='none';
  // Update slip label in sub-tab
  var sl=document.getElementById('slip-count-label');
  if(sl) sl.textContent=betSlip.length?'('+betSlip.length+')':'';
}
function renderSlip(){
  var legsEl=document.getElementById('slip-legs');
  var emptyEl=document.getElementById('slip-empty');
  var summaryEl=document.getElementById('slip-summary');
  if(!betSlip.length){emptyEl.style.display='block';legsEl.innerHTML='';summaryEl.style.display='none';return;}
  emptyEl.style.display='none'; summaryEl.style.display='block';
  legsEl.innerHTML=betSlip.map(function(b){
    return '<div class="slip-leg"><div><div class="leg-label">'+b.label+'</div><div class="leg-implied">Implied '+implied(b.odds)+'%</div></div>'
      +'<div style="display:flex;align-items:center;gap:10px"><span class="leg-odds '+(b.odds>0?'dog':'fav-c')+'">'+fmt(b.odds)+'</span>'
      +'<button class="remove-btn" onclick="removeSlipItem(\''+b.key+'\')">X</button></div></div>';
  }).join('');
  updateSlipSummary();
}
function removeSlipItem(key){
  betSlip=betSlip.filter(function(b){return b.key!==key;});
  renderSlip(); updateBadge();
}
function addManualLeg(){
  var desc=(document.getElementById('manual-leg-desc').value||'').trim();
  var oddsVal=parseInt(document.getElementById('manual-leg-odds').value||'0');
  if(!desc){showToast('Enter a description for this leg');return;}
  if(!oddsVal||oddsVal===0||oddsVal===-1){showToast('Enter valid odds e.g. -110 or +150');return;}
  var key='manual-'+Date.now();
  betSlip.push({key:key,label:desc,odds:oddsVal});
  document.getElementById('manual-leg-desc').value='';
  document.getElementById('manual-leg-odds').value='';
  renderSlip(); updateBadge();
  showToast(desc+' added to slip');
}
function updateSlipSummary(){
  if(!betSlip.length) return;
  var w=parseFloat(document.getElementById('slip-wager').value)||0;
  var p=calcParlay(betSlip);
  document.getElementById('s-legs').textContent=betSlip.length+'-team parlay';
  document.getElementById('s-combined').textContent=fmt(p.american);
  document.getElementById('s-prob').textContent=p.prob+'%';
  document.getElementById('s-payout').textContent='$'+(w*p.dec).toFixed(2);
  document.getElementById('s-profit').textContent='+$'+(w*p.dec-w).toFixed(2);
}
function saveSlipAsBet(){
  if(!betSlip.length){showToast('Add legs to the slip first');return;}
  var p=calcParlay(betSlip);
  var desc=betSlip.map(function(b){return b.label;}).join(' + ');
  quickAddBet({type:'parlay',parlayDesc:desc,odds:p.american});
  showToast('Slip saved - add wager in BETS tab');
}
function clearSlip(){
  betSlip=[];
  renderSlip(); updateBadge();
  document.querySelectorAll('.odds-btn.active,.sub-btn.active').forEach(function(b){b.classList.remove('active');});
}

// ============================================================
// CALCULATOR
// ============================================================
function updateSingle(){
  var odds=parseInt(document.getElementById('single-odds').value)||0;
  var wager=parseFloat(document.getElementById('single-wager').value)||0;
  if(!odds) return;
  var dec=aToDec(odds);
  document.getElementById('single-payout').textContent='$'+(wager*dec).toFixed(2);
  document.getElementById('single-profit').textContent='+$'+(wager*dec-wager).toFixed(2);
  document.getElementById('single-implied').textContent=implied(odds)+'%';
}
function renderParlayLegs(){
  document.getElementById('parlay-legs').innerHTML=parlayLegs.map(function(l,i){
    return '<div class="parlay-leg-row"><div class="leg-num">L'+(i+1)+'</div>'
      +'<input class="leg-input" type="number" value="'+l.odds+'" oninput="updateParlayLeg('+l.id+',this.value)" style="color:'+(l.odds>0?'#38bdf8':'#c084fc')+'"/>'
      +'<div class="leg-pct">'+implied(l.odds)+'%</div>'
      +'<button class="remove-leg" onclick="removeParlayLeg('+l.id+')">X</button></div>';
  }).join('');
}
function addParlayLeg(){parlayLegs.push({id:parlayLegId++,odds:-110});renderParlayLegs();updateParlay();}
function removeParlayLeg(id){if(parlayLegs.length<=1)return;parlayLegs=parlayLegs.filter(function(l){return l.id!==id;});renderParlayLegs();updateParlay();}
function updateParlayLeg(id,val){
  var leg=parlayLegs.find(function(l){return l.id===id;});
  if(leg) leg.odds=parseInt(val)||0;
  renderParlayLegs(); updateParlay();
}
function updateParlay(){
  var w=parseFloat(document.getElementById('parlay-wager').value)||0;
  var p=calcParlay(parlayLegs);
  document.getElementById('parlay-leg-count').textContent=parlayLegs.length+'-Leg Parlay';
  document.getElementById('parlay-combined').textContent=fmt(p.american);
  document.getElementById('parlay-prob').textContent=p.prob+'%';
  document.getElementById('parlay-payout').textContent='$'+(w*p.dec).toFixed(2);
  document.getElementById('parlay-profit').textContent='+$'+(w*p.dec-w).toFixed(2);
}

// ============================================================
// BANKROLL / KELLY
// ============================================================
function saveBankroll(){
  var val=parseFloat(document.getElementById('bankroll-input').value)||0;
  if(!val||val<1){alert('Please enter a valid bankroll amount.');return;}
  BANKROLL=val; localStorage.setItem('bankroll',val);
  var msg=document.getElementById('bankroll-saved-msg');
  msg.style.display='block';
  setTimeout(function(){msg.style.display='none';},3000);
}
function savePreferredBook(){
  var sel=document.getElementById('preferred-book-select');
  if(!sel) return;
  var val=sel.value;
  localStorage.setItem('preferredBook',val);
  selectedBookmaker=val;
  var msg=document.getElementById('preferred-book-msg');
  if(msg){msg.style.display='block'; setTimeout(function(){msg.style.display='none';},3000);}
}
function initPreferredBook(){
  var sel=document.getElementById('preferred-book-select');
  if(!sel) return;
  var saved=localStorage.getItem('preferredBook')||'all';
  sel.value=saved;
}
function halfKelly(edgePct,odds){
  if(!BANKROLL||!edgePct) return null;
  var edge=parseFloat(edgePct)/100;
  var dec=aToDec(odds);
  var b=dec-1;
  var p=Math.min(Math.max(edge+(1/dec),0.01),0.99);
  var q=1-p;
  var kelly=(b*p-q)/b;
  if(kelly<=0) return null;
  var half=kelly/2;
  return {pct:(half*100).toFixed(1),amt:Math.max(1,Math.round(BANKROLL*half))};
}

// ============================================================
// TEAM STATS DATABASE
// ============================================================
// Fields: ppg, ortg, drtg, efg, tov, orb, ftr, pace
// New fields (Selection Sunday update): exp, ats_w, ats_l, tpr (3pt attempt rate)
// exp = experience rating 0-4 (Barttorvik)
// tpr = three-point attempt rate (% of FGA that are 3s)
// ats_w/ats_l = against the spread record (manual from SportsReference)
