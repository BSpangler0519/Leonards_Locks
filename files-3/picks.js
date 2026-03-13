async function generatePicks(){
  document.getElementById('picks-loading').style.display='block';
  document.getElementById('picks-list').innerHTML='';
  document.getElementById('picks-empty').style.display='none';
  document.getElementById('picks-parlay-box').style.display='none';

  if(!allGamesData.length){
    if(!API_KEY){renderPicksNoData();return;}
    // Use cached odds if available - avoids burning extra API credits
    if(!cacheExpired()&&oddsCache){
      var cached=oddsCache.data;
      allGamesData=cached.map(function(g){return transformGame(g,selectedBookmaker);}).filter(Boolean);
    } else {
      // Only fetch if no cache available
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
        oddsCache={data:combined,timestamp:Date.now()};
        allGamesData=combined.map(function(g){return transformGame(g,selectedBookmaker);}).filter(Boolean);
      } catch(e){renderPicksNoData();return;}
    }
  }

  document.getElementById('picks-loading').style.display='none';
  if(!allGamesData.length){renderPicksNoData();return;}
  allPicks=[];

  allGamesData.forEach(function(g){
    var s1raw=findTeamStats(g.home), s2raw=findTeamStats(g.away);
    // Apply game flags as temporary stat adjustments (does not modify database)
    var gf=gameFlags[g.id]||{};
    var s1=s1raw?Object.assign({},s1raw):null;
    var s2=s2raw?Object.assign({},s2raw):null;
    if(s1&&gf.injury_home){s1.ortg-=6;s1.tov+=2;}
    if(s1&&gf.fatigue_home){s1.ortg-=2;s1.pace-=1.5;}
    if(s2&&gf.injury_away){s2.ortg-=6;s2.tov+=2;}
    if(s2&&gf.fatigue_away){s2.ortg-=2;s2.pace-=1.5;}
    if(s1&&s2){
      var net1=s1.ortg-s1.drtg, net2=s2.ortg-s2.drtg;
      var netDiff=net1-net2;
      // Logistic curve calibrated to NCAAB: more accurate than linear at tails
      var statWinProb=Math.min(Math.max(100/(1+Math.exp(-netDiff*0.15)),5),95);
      var homeImpl=1/aToDec(g.homeML)*100, awayImpl=1/aToDec(g.awayML)*100;
      var homeEdge=statWinProb-homeImpl, awayEdge=(100-statWinProb)-awayImpl;
      var bestML=homeEdge>awayEdge?{team:g.home,odds:g.homeML,edge:homeEdge,prob:statWinProb}:{team:g.away,odds:g.awayML,edge:awayEdge,prob:100-statWinProb};
      if(Math.abs(bestML.edge)>2){
        var stars=edgeToStars(Math.abs(bestML.edge),3,6,10);
        allPicks.push({type:'ml',typeLabel:'MONEYLINE',game:g,pick:bestML.team+' ML',odds:bestML.odds,stars:stars,edge:bestML.edge.toFixed(1),reason:bestML.team+' stats imply '+bestML.prob.toFixed(0)+'% win prob vs '+homeImpl.toFixed(0)+'% market &mdash; '+Math.abs(bestML.edge).toFixed(1)+'% edge',sortScore:100+Math.abs(bestML.edge)*stars});
      }
      if(g.spread!=null){
        // *0.9 multiplier KenPom-validated for NCAAB (~1pt net diff = ~0.9pt margin)
        var expectedMargin=netDiff*0.9;
        var spreadLine=-g.spread;
        var spreadEdge=expectedMargin-spreadLine;
        var spreadPick,spreadReason;
        // Require 3pt edge -- tighter than before since margin estimates are now accurate
        if(spreadEdge>3){spreadPick=g.home+' '+fmt(g.spread);spreadReason='Projected margin '+expectedMargin.toFixed(1)+' pts vs line '+fmt(g.spread)+' &mdash; '+spreadEdge.toFixed(1)+' pt edge';}
        else if(spreadEdge<-3){spreadPick=g.away+' +'+(Math.abs(g.spread));spreadReason='Projected margin '+expectedMargin.toFixed(1)+' pts &mdash; '+g.away+' covers '+Math.abs(g.spread)+' pt spread';}
        if(spreadPick){
          var ss=edgeToStars(Math.abs(spreadEdge),3,6,10);
          allPicks.push({type:'spread',typeLabel:'SPREAD',game:g,pick:spreadPick,odds:g.spreadOdds,stars:ss,edge:spreadEdge.toFixed(1),reason:spreadReason,sortScore:100+Math.abs(spreadEdge)*ss});
        }
      }
      if(g.total!=null){
        // Use ortg/drtg per-100-possessions scaled by avg pace -- same method sportsbooks use
        // Avoids double-counting pace that plagued the old ppg * paceAdj formula
        var avgPoss = (s1.pace + s2.pace) / 2;
        var expHomeFinal = (s1.ortg + s2.drtg) / 2 / 100 * avgPoss;
        var expAwayFinal = (s2.ortg + s1.drtg) / 2 / 100 * avgPoss;
        var projTotal = expHomeFinal + expAwayFinal;
        var ouEdge = projTotal - g.total;
        // Require 5pt edge to pick O/U -- books are sharp on totals, 3pt was too loose
        var ouPick,ouReason;
        if(ouEdge>5){ouPick='Over '+g.total;ouReason='Projected total '+projTotal.toFixed(1)+' pts vs line '+g.total+' &mdash; '+ouEdge.toFixed(1)+' pt edge (ortg/drtg model)';}
        else if(ouEdge<-5){ouPick='Under '+g.total;ouReason='Projected total '+projTotal.toFixed(1)+' pts vs line '+g.total+' &mdash; '+Math.abs(ouEdge).toFixed(1)+' pt edge (defensive matchup)';}
        if(ouPick){
          var os=edgeToStars(Math.abs(ouEdge),5,8,12);
          allPicks.push({type:'ou',typeLabel:'OVER/UNDER',game:g,pick:ouPick,odds:-110,stars:os,edge:ouEdge.toFixed(1),reason:ouReason,sortScore:100+Math.abs(ouEdge)*os});
        }
      }
      var netGap=Math.abs(net1-net2);
      if(netGap>8){
        var strongTeam=net1>net2?g.home:g.away;
        var weakTeam=net1>net2?g.away:g.home;
        var ms=edgeToStars(netGap,8,12,18);
        allPicks.push({type:'mismatch',typeLabel:'MISMATCH',game:g,pick:strongTeam+' ML / Cover',odds:net1>net2?g.homeML:g.awayML,stars:ms,edge:netGap.toFixed(1),reason:strongTeam+' Net +'+Math.max(net1,net2).toFixed(1)+' vs '+weakTeam+' '+Math.min(net1,net2).toFixed(1)+' &mdash; '+netGap.toFixed(0)+' pt gap signals blowout potential',sortScore:50+netGap*ms*0.3});
      }
    } else {
      var op=oddsOnlyPick(g); if(op) allPicks.push(op);
    }
  });

  var parlayCandidates=allPicks.filter(function(p){return !p.isParlay&&p.stars>=2&&parseFloat(p.edge)>-2;}).sort(function(a,b){return b.sortScore-a.sortScore;}).slice(0,3);
  if(parlayCandidates.length>=2){
    var po=calcParlay(parlayCandidates.map(function(p){return{odds:p.odds};}));
    suggestedParlay=parlayCandidates;
    allPicks.push({type:'parlay',typeLabel:'PARLAY',game:parlayCandidates[0].game,pick:parlayCandidates.length+'-Leg Best Picks Parlay',odds:po.american,stars:Math.min(parlayCandidates[0].stars,3),edge:parlayCandidates.reduce(function(a,p){return a+parseFloat(p.edge);},0).toFixed(1),reason:parlayCandidates.map(function(p){return p.pick;}).join(' + ')+' &mdash; combined '+po.prob+'% implied prob',sortScore:999,isParlay:true,legs:parlayCandidates});
  }
  allPicks.sort(function(a,b){return b.sortScore-a.sortScore;});
  renderPicks();
  renderSuggestedParlay();
  logPicksForAccuracy(allPicks);
  renderAccuracyTab();
  // Delay summary so manual ASK CLAUDE taps don't collide on startup
  setTimeout(function(){ claudeApiCall(generateClaudeSummary); }, 1500);
}

function oddsOnlyPick(g){
  var homeImpl=1/aToDec(g.homeML)*100, awayImpl=1/aToDec(g.awayML)*100;
  var overround=homeImpl+awayImpl;
  var trueHome=(homeImpl/overround)*100, trueAway=(awayImpl/overround)*100;
  var favProb=Math.max(trueHome,trueAway);
  if(favProb<62) return null;
  var favTeam=trueHome>trueAway?g.home:g.away;
  var favOdds=trueHome>trueAway?g.homeML:g.awayML;
  var stars=edgeToStars(favProb,62,70,80);
  return {type:'ml',typeLabel:'MONEYLINE',game:g,pick:favTeam+' ML',odds:favOdds,stars:stars,edge:(favProb-(favOdds<0?Math.abs(favOdds)/(Math.abs(favOdds)+100)*100:100/(favOdds+100)*100)).toFixed(1),reason:'Market prices '+favTeam+' at '+favProb.toFixed(0)+'% true win probability &mdash; strong favorite',sortScore:30+favProb*stars*0.05};
}
function edgeToStars(val,one,two,three){
  if(val>=three) return 5;
  if(val>=two) return 4;
  if(val>=one) return 3;
  return 2;
}
function stars(n){
  var s='';
  for(var i=0;i<5;i++) s+='<span style="color:'+(i<n?'#f59e0b':'#2a3a4a')+'">&#9733;</span>';
  return s;
}
function filterPicks(filter){
  currentPickFilter=filter;
  document.querySelectorAll('.picks-filter').forEach(function(b){
    var a=b.dataset.filter===filter;
    b.style.borderColor=a?'#f59e0b':'#2a3a4a';
    b.style.background=a?'rgba(245,158,11,0.15)':'transparent';
    b.style.color=a?'#f59e0b':'#7a8fa6';
  });
  renderPicks();
}
function renderPicks(){
  var filtered=currentPickFilter==='all'?allPicks.filter(function(p){return !p.isParlay;}):allPicks.filter(function(p){return p.type===currentPickFilter;});
  var el=document.getElementById('picks-list');
  var emptyEl=document.getElementById('picks-empty');
  if(!filtered.length){el.innerHTML='';emptyEl.style.display='block';return;}
  emptyEl.style.display='none';
  var typeColors={ml:'#38bdf8',spread:'#c084fc',ou:'#34d399',mismatch:'#f97316',parlay:'#f59e0b'};
  el.innerHTML=filtered.map(function(p,i){
    var col=typeColors[p.type]||'#f59e0b';
    var edgeNum=parseFloat(p.edge);
    var edgeStr=edgeNum>0?'+'+p.edge+'%':p.edge+'%';
    var isValueBet=edgeNum>0&&p.type!=='mismatch'&&p.type!=='parlay';
    var movHtml='';
    if(p.game&&p.game.id){
      var movField=p.type==='spread'?'spread':p.type==='ou'?'total':(p.pick&&p.game&&p.pick.indexOf(p.game.home)>=0?'homeML':'awayML');
      var movVal=p.type==='spread'?p.game.spread:p.type==='ou'?p.game.total:p.odds;
      var mov=getLineMovement(p.game.id,movField,movVal);
      if(mov){ var arrow=mov.diff>0?'&#x25B2;':'&#x25BC;'; var movColor=mov.diff>0?'#34d399':'#f97316'; movHtml=' <span style="font-size:11px;color:'+movColor+'">'+arrow+' '+Math.abs(mov.diff).toFixed(1)+'</span>'; }
    }
    var kellyHtml='';
    if(BANKROLL&&isValueBet){ var k=halfKelly(p.edge,p.odds); if(k) kellyHtml='<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 10px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:8px"><span style="font-size:9px;color:#f59e0b;letter-spacing:1px;flex-shrink:0">1/2 KELLY</span><span style="font-size:14px;font-weight:700;color:#f59e0b">$'+k.amt+'</span><span style="font-size:9px;color:#556677">'+k.pct+'% of $'+BANKROLL+'</span></div>'; }
    return '<div style="background:#111825;border:1px solid #1a2a3a;border-left:3px solid '+col+';border-radius:12px;padding:14px;margin-bottom:10px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;color:#7a8fa6;font-weight:700">#'+(i+1)+'</span><span style="font-size:9px;color:'+col+';font-weight:700;letter-spacing:1px;background:'+col+'22;padding:3px 8px;border-radius:10px">'+p.typeLabel+'</span>'+(isValueBet?'<span style="font-size:9px;color:#f59e0b;font-weight:700;background:rgba(245,158,11,0.15);padding:3px 8px;border-radius:10px">VALUE</span>':'')+'</div>'
      +'<div style="font-size:13px">'+stars(p.stars)+'</div>'
      +'</div>'
      +'<div style="background:#0d1520;border-radius:8px;padding:8px 10px;margin-bottom:10px"><div style="font-size:13px;font-weight:700;color:#e0e6f0">'+(p.game&&p.game.away?p.game.away:'?')+' <span style="color:#445566;font-weight:400">@</span> '+(p.game&&p.game.home?p.game.home:'?')+'</div><div style="font-size:10px;color:#556677;margin-top:2px">'+(p.game&&p.game.date?p.game.date:'')+' '+(p.game&&p.game.time?p.game.time:'')+'</div></div>'
      +'<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px">'+p.pick+'<span style="font-size:13px;font-weight:700;color:'+(p.odds>0?'#38bdf8':'#c084fc')+';margin-left:8px">'+fmt(p.odds)+'</span>'+movHtml+'</div>'
      +'<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;line-height:1.5">'+p.reason+'</div>'
      +(isValueBet?'<div style="display:flex;align-items:center;gap:8px"><div style="font-size:9px;color:#7a8fa6;width:60px">EDGE</div><div style="flex:1;height:4px;background:#1a2a3a;border-radius:2px"><div style="height:4px;border-radius:2px;background:'+col+';width:'+Math.min(Math.abs(edgeNum)*8,100)+'%"></div></div><div style="font-size:11px;font-weight:700;color:'+col+'">'+edgeStr+'</div></div>':'')
      +kellyHtml
      +(!p.isParlay?'<div style="display:flex;gap:6px;margin-top:8px">'
        +'<button onclick="addPickToSlip(this)" data-key="pick-'+(p.game&&p.game.id?p.game.id:'x')+'-'+p.type+'" data-label="'+p.pick.replace(/"/g,'&quot;')+'" data-odds="'+p.odds+'" style="flex:1;padding:6px 8px;background:transparent;border:1px solid '+col+'44;border-radius:7px;color:'+col+';font-size:10px;font-weight:700;font-family:inherit">+ SLIP</button>'
        +'<button onclick="quickAddBet({away:\''+(p.game&&p.game.away?escQ(p.game.away):'')+'\',home:\''+(p.game&&p.game.home?escQ(p.game.home):'')+'\',commence_time:\''+(p.game&&p.game.commence_time||'')+'\',type:\''+p.type+'\',team:\''+(p.game&&p.game.away?escQ(p.game.away):'')+'\',opponent:\''+(p.game&&p.game.home?escQ(p.game.home):'')+'\',odds:'+p.odds+(p.type==='spread'&&p.game&&p.game.spread!=null?',spread:'+p.game.spread:'')+(p.type==='ou'&&p.game&&p.game.total!=null?',total:'+p.game.total+',ouSide:\''+(p.pick.toLowerCase().indexOf('over')>=0?'over':'under')+'\'':'')+'})" style="flex:1;padding:6px 8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.4);border-radius:7px;color:#f59e0b;font-size:10px;font-weight:700;font-family:inherit">+ BET</button>'
        +'</div>':'')
      +'</div>';
  }).join('');
}
function addPickToSlip(btn){
  var key=btn.getAttribute('data-key');
  var label=btn.getAttribute('data-label');
  var odds=parseInt(btn.getAttribute('data-odds'));
  if(!betSlip.find(function(b){return b.key===key;})){
    betSlip.push({key:key,label:label,odds:odds});
    updateBadge(); renderSlip();
    showToast(label+' added to slip!');
  }
}
function renderSuggestedParlay(){
  if(!suggestedParlay.length) return;
  var p=calcParlay(suggestedParlay.map(function(l){return{odds:l.odds};}));
  document.getElementById('picks-parlay-box').style.display='block';
  document.getElementById('picks-parlay-legs').innerHTML=suggestedParlay.map(function(l){
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #151f2e"><span style="font-size:12px;color:#e0e6f0">'+l.pick+'</span><span style="font-size:12px;font-weight:700;color:'+(l.odds>0?'#38bdf8':'#c084fc')+'">'+fmt(l.odds)+'</span></div>';
  }).join('');
  document.getElementById('picks-parlay-summary').innerHTML='<div style="margin-top:10px;display:flex;justify-content:space-between"><span style="font-size:11px;color:#7a8fa6">'+suggestedParlay.length+'-leg combined odds</span><span style="font-size:14px;font-weight:700;color:#f59e0b">'+fmt(p.american)+'</span></div><div style="display:flex;justify-content:space-between;margin-top:4px"><span style="font-size:11px;color:#7a8fa6">Implied probability</span><span style="font-size:12px;color:#fff">'+p.prob+'%</span></div>';
}
function addParlayToSlip(){
  suggestedParlay.forEach(function(l){
    var key='picks-parlay-'+l.game.id+'-'+l.type;
    if(!betSlip.find(function(b){return b.key===key;})) betSlip.push({key:key,label:l.pick,odds:l.odds});
  });
  updateBadge(); renderSlip();
  showToast('Parlay legs added to slip!');
  switchTab('picks'); switchPicksSub('slip-panel');
}
function addParlayToBet(){
  if(!suggestedParlay.length) return;
  var p=calcParlay(suggestedParlay.map(function(l){return{odds:l.odds};}));
  var desc=suggestedParlay.map(function(l){return l.pick;}).join(' + ');
  var ct=suggestedParlay[0].game&&suggestedParlay[0].game.commence_time?suggestedParlay[0].game.commence_time:'';
  quickAddBet({type:'parlay',commence_time:ct,parlayDesc:desc,odds:p.american});
  showToast('Parlay pre-filled in BETS tab');
}
function renderPicksNoData(){
  document.getElementById('picks-loading').style.display='none';
  document.getElementById('picks-empty').style.display='block';
}

// ============================================================
// CLAUDE AI SUMMARY
// ============================================================
// ============================================================
// CLAUDE API QUEUE -- prevents 529 Overloaded from concurrent calls
// ============================================================
var _claudeBusy = false;
var _claudeQueue = [];
function claudeApiCall(fn){
  if(!_claudeBusy){ _claudeBusy=true; fn().finally(function(){ _claudeBusy=false; var next=_claudeQueue.shift(); if(next) claudeApiCall(next); }); }
  else { _claudeQueue.push(fn); }
}
async function claudeFetchWithRetry(url, opts, maxRetries){
  maxRetries = maxRetries||3;
  var delay = 2000;
  for(var attempt=0; attempt<maxRetries; attempt++){
    var resp = await fetch(url, opts);
    if(resp.status!==529 && resp.status!==503) return resp;
    if(attempt < maxRetries-1){
      await new Promise(function(r){setTimeout(r, delay);});
      delay *= 2; // exponential backoff: 2s, 4s, 8s
    }
  }
  return await fetch(url, opts); // final attempt
}

async function generateClaudeSummary(){
  if(!allPicks.length) return;
  if(!CLAUDE_KEY){
    document.getElementById('claude-summary-box').style.display='block';
    document.getElementById('claude-summary-content').innerHTML='<span style="color:#f59e0b">No Claude API key set. Go to TOOLS &rarr; KEYS to add your key.</span>';
    return;
  }
  document.getElementById('claude-summary-box').style.display='none';
  document.getElementById('claude-summary-loading').style.display='block';
  var dotFrames=['&#9679;','&#9679; &#9679;','&#9679; &#9679; &#9679;'],dotIdx=0;
  var dotTimer=setInterval(function(){var el=document.getElementById('claude-dots');if(el){el.innerHTML=dotFrames[dotIdx%3];dotIdx++;}},500);
  var topPicks=allPicks.filter(function(p){return !p.isParlay;}).slice(0,6);
  var picksContext=topPicks.map(function(p,i){
    var gameStr=p.game?p.game.away+' @ '+p.game.home:'Unknown';
    return (i+1)+'. '+p.typeLabel+' | '+gameStr+' | Pick: '+p.pick+' ('+fmt(p.odds)+') - '+p.reason.replace(/&mdash;/g,'--').replace(/&middot;/g,'*')+' ['+p.stars+' stars, edge: '+p.edge+'%]';
  }).join('\n');
  var parlayPick=allPicks.find(function(p){return p.isParlay;});
  var parlayContext=parlayPick?'\nSuggested parlay: '+parlayPick.reason.replace(/&mdash;/g,'--'):'';
  var prompt='You are a sharp NCAA basketball betting analyst. Based on the following statistical analysis of today\'s games, write a concise betting summary for a recreational bettor. Be direct, confident, and highlight the 2-3 best opportunities. Use plain language. Keep it under 200 words. Do not add disclaimers about gambling.\n\nToday\'s picks:\n'+picksContext+parlayContext+'\n\nWrite a narrative summary covering: the single best bet of the day, any strong value spots, and a parlay recommendation if applicable.';
  try{
    var response=await claudeFetchWithRetry('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:prompt}]})});
    clearInterval(dotTimer);
    if(!response.ok){var err=await response.json().catch(function(){return{};});throw new Error(err.error&&err.error.message?err.error.message:'API error '+response.status);}
    var data=await response.json();
    var text=data.content&&data.content[0]&&data.content[0].text?data.content[0].text:'No response received.';
    document.getElementById('claude-summary-loading').style.display='none';
    document.getElementById('claude-summary-box').style.display='block';
    document.getElementById('claude-summary-content').innerHTML=text.replace(/\*\*(.*?)\*\*/g,'<strong style="color:#fff">$1</strong>').replace(/\n\n/g,'<br/><br/>').replace(/\n/g,'<br/>');
    document.getElementById('claude-summary-time').textContent='Generated '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  } catch(e){
    clearInterval(dotTimer);
    document.getElementById('claude-summary-loading').style.display='none';
    document.getElementById('claude-summary-box').style.display='block';
    var hint='';
    var msg=e.message||'Unknown error';
    if(msg.indexOf('401')>-1||msg.toLowerCase().indexOf('auth')>-1) hint='<br/><span style="font-size:11px;color:#7a8fa6">Invalid key - go to TOOLS &rarr; KEYS to re-enter.</span>';
    else if(msg.indexOf('529')>-1||msg.toLowerCase().indexOf('overload')>-1) hint='<br/><span style="font-size:11px;color:#7a8fa6">API is busy - tap ANALYZE again in a few seconds.</span>';
    else if(msg.indexOf('credit')>-1||msg.indexOf('billing')>-1) hint='<br/><span style="font-size:11px;color:#7a8fa6">Add credits at console.anthropic.com &rarr; Billing.</span>';
    document.getElementById('claude-summary-content').innerHTML='<span style="color:#f97316">Error: '+msg+'</span>'+hint;
  }
}

// ============================================================
// PICK ACCURACY
// ============================================================
function savePickAccuracy(){ localStorage.setItem('pickAccuracy',JSON.stringify(pickAccuracy)); }
function logPicksForAccuracy(picks){
  var today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
  picks.filter(function(p){return !p.isParlay;}).forEach(function(p){
    var existingId='acc-'+p.game.id+'-'+p.type;
    if(!pickAccuracy.find(function(a){return a.id===existingId;})){
      pickAccuracy.unshift({id:existingId,date:today,gameId:p.game.id,gameLabel:(p.game.away||'?')+' @ '+(p.game.home||'?'),type:p.type,typeLabel:p.typeLabel,pick:p.pick,odds:p.odds,edge:p.edge,stars:p.stars,result:null,gradedAt:null});
    }
  });
  if(pickAccuracy.length>200) pickAccuracy=pickAccuracy.slice(0,200);
  savePickAccuracy();
}
function gradePickAccuracy(id,result){
  var entry=pickAccuracy.find(function(a){return a.id===id;});
  if(!entry) return;
  entry.result=result;
  entry.gradedAt=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
  savePickAccuracy(); renderAccuracyTab();
}
function clearPickAccuracy(){
  if(!confirm('Clear all pick accuracy data?')) return;
  pickAccuracy=[]; savePickAccuracy(); renderAccuracyTab();
}
function switchAccuracyView(view){
  currentAccuracyView=view;
  var aiBtn=document.getElementById('acc-btn-ai');
  var betsBtn=document.getElementById('acc-btn-bets');
  var aiView=document.getElementById('acc-view-ai');
  var betsView=document.getElementById('acc-view-bets');
  if(view==='ai'){
    aiBtn.style.background='rgba(245,158,11,0.15)'; aiBtn.style.borderColor='#f59e0b'; aiBtn.style.color='#f59e0b';
    betsBtn.style.background='transparent'; betsBtn.style.borderColor='#2a3a4a'; betsBtn.style.color='#445566';
    aiView.style.display='block'; betsView.style.display='none';
  } else {
    betsBtn.style.background='rgba(56,189,248,0.15)'; betsBtn.style.borderColor='#38bdf8'; betsBtn.style.color='#38bdf8';
    aiBtn.style.background='transparent'; aiBtn.style.borderColor='#2a3a4a'; aiBtn.style.color='#445566';
    betsView.style.display='block'; aiView.style.display='none';
    renderBetAccuracy();
  }
}
function renderAccuracyTab(){
  // AI PICKS view
  var graded=pickAccuracy.filter(function(a){return a.result;});
  var pending=pickAccuracy.filter(function(a){return !a.result;});
  var wins=graded.filter(function(a){return a.result==='win';}).length;
  var losses=graded.filter(function(a){return a.result==='loss';}).length;
  var pushes=graded.filter(function(a){return a.result==='push';}).length;
  var total=wins+losses+pushes;
  var winPct=total?(wins/total*100).toFixed(1):'--';
  var pctColor=total&&parseFloat(winPct)>=52.4?'#34d399':'#f97316';
  var summaryEl=document.getElementById('accuracy-summary');
  if(!summaryEl) return;
  function accCard(col,val,lbl){ return '<div style="background:#111825;border:1px solid #1a2a3a;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:'+col+'">'+val+'</div><div style="font-size:9px;color:#556677;letter-spacing:1px;margin-top:3px">'+lbl+'</div></div>'; }
  summaryEl.innerHTML=accCard('#f59e0b',total||'0','GRADED')+accCard(pctColor,total?winPct+'%':'--','WIN RATE')+accCard('#34d399',wins,'WINS')+accCard('#f97316',losses,'LOSSES');
  var typeColors={ml:'#38bdf8',spread:'#c084fc',ou:'#34d399',mismatch:'#f97316'};
  var typeLabels={ml:'MONEYLINE',spread:'SPREAD',ou:'OVER/UNDER',mismatch:'MISMATCH'};
  var breakdownEl=document.getElementById('accuracy-breakdown');
  var bhtml='<div style="font-size:10px;color:#f59e0b;letter-spacing:2px;margin-bottom:12px">BY BET TYPE</div>';
  if(!graded.length){ bhtml+='<div style="font-size:12px;color:#445566;text-align:center;padding:10px">No graded picks yet.</div>'; }
  else {
    ['ml','spread','ou','mismatch'].forEach(function(t){
      var tG=graded.filter(function(a){return a.type===t;});
      if(!tG.length) return;
      var tW=tG.filter(function(a){return a.result==='win';}).length;
      var tPct=((tW/tG.length)*100).toFixed(0);
      var col=typeColors[t]||'#7a8fa6';
      bhtml+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="font-size:9px;color:'+col+';width:80px;letter-spacing:1px">'+typeLabels[t]+'</div><div style="flex:1;height:6px;background:#1a2535;border-radius:3px"><div style="height:6px;border-radius:3px;background:'+col+';width:'+tPct+'%"></div></div><div style="font-size:11px;font-weight:700;color:'+(parseFloat(tPct)>=52.4?'#34d399':'#f97316')+';width:36px;text-align:right">'+tPct+'%</div><div style="font-size:10px;color:#556677;width:28px;text-align:right">'+tW+'-'+(tG.length-tW)+'</div></div>';
    });
    bhtml+='<div style="font-size:9px;color:#334455;margin-top:4px">Breakeven at -110 = 52.4%</div>';
  }
  breakdownEl.innerHTML=bhtml;
  var recentEl=document.getElementById('accuracy-recent');
  if(!pickAccuracy.length){ recentEl.innerHTML='<div class="empty" style="font-size:12px">No picks logged yet.<br/>Picks auto-log when generated on PICKS tab.</div>'; return; }
  var sorted=pending.concat(graded.slice(0,20));
  recentEl.innerHTML=sorted.map(function(a){
    var resColor=a.result==='win'?'#34d399':a.result==='loss'?'#f97316':a.result==='push'?'#f59e0b':'#556677';
    var resLabel=a.result?a.result.toUpperCase():'PENDING';
    var col=typeColors[a.type]||'#7a8fa6';
    return '<div style="background:#111825;border:1px solid #1a2535;border-left:3px solid '+col+';border-radius:10px;padding:11px;margin-bottom:8px">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><div style="font-size:11px;color:#e0e6f0;font-weight:700">'+a.gameLabel+'</div><div style="font-size:10px;color:#556677;margin-top:2px">'+a.date+' &middot; '+a.typeLabel+'</div></div><span style="font-size:9px;font-weight:700;color:'+resColor+';background:'+resColor+'22;padding:3px 8px;border-radius:8px">'+resLabel+'</span></div>'
      +'<div style="font-size:12px;color:#c0ccd8;margin-bottom:6px">'+a.pick+' <span style="color:'+(a.odds>0?'#38bdf8':'#c084fc')+'">'+fmt(a.odds)+'</span> <span style="font-size:10px;color:#556677">&middot; Edge: '+a.edge+'% &middot; '+a.stars+'&#9733;</span></div>'
      +(!a.result?'<div style="display:flex;gap:6px"><button onclick="gradePickAccuracy(this.dataset.id,\'win\')" data-id="'+a.id+'" style="flex:1;padding:5px;background:rgba(52,211,153,0.1);border:1px solid #34d399;border-radius:6px;color:#34d399;font-size:10px;font-weight:700;font-family:inherit">WIN</button><button onclick="gradePickAccuracy(this.dataset.id,\'loss\')" data-id="'+a.id+'" style="flex:1;padding:5px;background:rgba(249,115,22,0.1);border:1px solid #f97316;border-radius:6px;color:#f97316;font-size:10px;font-weight:700;font-family:inherit">LOSS</button><button onclick="gradePickAccuracy(this.dataset.id,\'push\')" data-id="'+a.id+'" style="flex:1;padding:5px;background:rgba(245,158,11,0.1);border:1px solid #f59e0b;border-radius:6px;color:#f59e0b;font-size:10px;font-weight:700;font-family:inherit">PUSH</button></div>':'')
      +'</div>';
  }).join('');
  // If currently on MY BETS view, refresh that too
  if(currentAccuracyView==='bets') renderBetAccuracy();
}
function renderBetAccuracy(){
  var bets=historyData.filter(function(h){return h.result==='Win'||h.result==='Loss'||h.result==='Push';});
  var wins=bets.filter(function(h){return h.result==='Win';}).length;
  var losses=bets.filter(function(h){return h.result==='Loss';}).length;
  var pushes=bets.filter(function(h){return h.result==='Push';}).length;
  var total=wins+losses+pushes;
  var winPct=total?(wins/total*100).toFixed(1):'--';
  var wagered=bets.reduce(function(a,h){return a+h.wager;},0);
  var returned=bets.filter(function(h){return h.result==='Win';}).reduce(function(a,h){return a+h.payout;},0);
  var roi=wagered>0?(((returned-wagered)/wagered)*100).toFixed(1):'--';
  var pctColor=total&&parseFloat(winPct)>=52.4?'#34d399':'#f97316';
  var roiColor=roi!=='--'&&parseFloat(roi)>=0?'#34d399':'#f97316';
  function accCard(col,val,lbl){ return '<div style="background:#111825;border:1px solid #1a2a3a;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:'+col+'">'+val+'</div><div style="font-size:9px;color:#556677;letter-spacing:1px;margin-top:3px">'+lbl+'</div></div>'; }
  var summaryEl=document.getElementById('bet-accuracy-summary');
  if(summaryEl) summaryEl.innerHTML=accCard('#f59e0b',total||'0','BETS')+accCard(pctColor,total?winPct+'%':'--','WIN RATE')+accCard('#34d399',wins,'WINS')+accCard(roiColor,roi!=='--'?roi+'%':'--','ROI');
  // Breakdown by result
  var breakdownEl=document.getElementById('bet-accuracy-breakdown');
  var bhtml='<div style="font-size:10px;color:#38bdf8;letter-spacing:2px;margin-bottom:12px">SUMMARY</div>';
  if(!bets.length){ bhtml+='<div style="font-size:12px;color:#445566;text-align:center;padding:10px">No bets logged yet.</div>'; }
  else {
    var profitLoss=returned-wagered;
    bhtml+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:11px;color:#7a8fa6">Total wagered</span><span style="font-size:12px;font-weight:700;color:#fff">$'+wagered.toFixed(2)+'</span></div>';
    bhtml+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:11px;color:#7a8fa6">Total returned</span><span style="font-size:12px;font-weight:700;color:#fff">$'+returned.toFixed(2)+'</span></div>';
    bhtml+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:11px;color:#7a8fa6">Profit / Loss</span><span style="font-size:13px;font-weight:700;color:'+(profitLoss>=0?'#34d399':'#f97316')+'">'+(profitLoss>=0?'+':'')+profitLoss.toFixed(2)+'</span></div>';
    if(pushes>0) bhtml+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:11px;color:#7a8fa6">Pushes</span><span style="font-size:12px;font-weight:700;color:#f59e0b">'+pushes+'</span></div>';
    bhtml+='<div style="font-size:9px;color:#334455;margin-top:4px;margin-bottom:16px">Breakeven at -110 = 52.4%</div>';
    // BY BET TYPE bar chart -- infer type from description text
    function inferType(desc){
      var d=(desc||'').toLowerCase();
      if(d.indexOf('parlay')>=0) return 'parlay';
      if(d.indexOf(' ml')>=0||d.indexOf('moneyline')>=0) return 'ml';
      if(d.indexOf('over')>=0||d.indexOf('under')>=0||d.indexOf('o/u')>=0) return 'ou';
      // Spread: look for a number < 100 with +/- (spread lines are small; odds are 3 digits)
      if(d.indexOf('spread')>=0) return 'spread';
      var spreadMatch=d.match(/[+-](\d+(\.5)?)(?:\s|$)/);
      if(spreadMatch&&parseFloat(spreadMatch[1])<50) return 'spread';
      return 'ml'; // default
    }
    var typeColors={ml:'#38bdf8',spread:'#c084fc',ou:'#34d399',parlay:'#f59e0b'};
    var typeLabels={ml:'MONEYLINE',spread:'SPREAD',ou:'OVER/UNDER',parlay:'PARLAY'};
    var typeMap={ml:[],spread:[],ou:[],parlay:[]};
    bets.forEach(function(h){ var t=h.type||inferType(h.desc); if(!typeMap[t]) typeMap[t]=[]; typeMap[t].push(h); });
    var hasTypes=Object.keys(typeMap).some(function(t){return typeMap[t].length>0;});
    if(hasTypes){
      bhtml+='<div style="font-size:10px;color:#38bdf8;letter-spacing:2px;margin-bottom:12px">BY BET TYPE</div>';
      ['ml','spread','ou','parlay'].forEach(function(t){
        var tBets=typeMap[t]; if(!tBets||!tBets.length) return;
        var tW=tBets.filter(function(h){return h.result==="Win";}).length;
        var tPct=((tW/tBets.length)*100).toFixed(0);
        var col=typeColors[t];
        bhtml+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
          +'<div style="font-size:9px;color:'+col+';width:80px;letter-spacing:1px">'+typeLabels[t]+'</div>'
          +'<div style="flex:1;height:6px;background:#1a2535;border-radius:3px"><div style="height:6px;border-radius:3px;background:'+col+';width:'+tPct+'%"></div></div>'
          +'<div style="font-size:11px;font-weight:700;color:'+(parseFloat(tPct)>=52.4?'#34d399':'#f97316')+';width:36px;text-align:right">'+tPct+'%</div>'
          +'<div style="font-size:10px;color:#556677;width:28px;text-align:right">'+tW+'-'+(tBets.length-tW)+'</div>'
          +'</div>';
      });
    }
  }
  if(breakdownEl) breakdownEl.innerHTML=bhtml;
  var recentEl=document.getElementById('bet-accuracy-recent');
  if(!recentEl) return;
  if(!bets.length){ recentEl.innerHTML='<div class="empty" style="font-size:12px">No bets logged yet.</div>'; return; }
  recentEl.innerHTML=bets.slice(0,20).map(function(h){
    var resColor=h.result==='Win'?'#34d399':h.result==='Loss'?'#f97316':'#f59e0b';
    var profit=h.result==='Win'?'+'+(h.payout-h.wager).toFixed(2):h.result==='Push'?'0.00':'-'+h.wager.toFixed(2);
    return '<div style="background:#111825;border:1px solid #1a2535;border-left:3px solid '+resColor+';border-radius:10px;padding:11px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="flex:1"><div style="font-size:12px;font-weight:700;color:#e0e6f0">'+h.desc+'</div><div style="font-size:10px;color:#556677;margin-top:2px">'+h.date+' &middot; Wagered $'+h.wager+'</div></div>'
      +'<div style="text-align:right;margin-left:10px"><span style="font-size:9px;font-weight:700;color:'+resColor+';background:'+resColor+'22;padding:3px 8px;border-radius:8px">'+h.result.toUpperCase()+'</span><div style="font-size:13px;font-weight:700;color:'+resColor+';margin-top:4px">$'+profit+'</div></div>'
      +'</div>';
  }).join('');
}

// ============================================================
// HISTORY / LOG
// ============================================================
function saveGameFlags(){ localStorage.setItem('gameFlags',JSON.stringify(gameFlags)); }
function saveHistory(){ localStorage.setItem('betHistory',JSON.stringify(historyData)); }
function clearHistory(){ if(!confirm('Delete all bet history?')) return; historyData=[]; saveHistory(); renderHistory(); }
function deleteHistoryItem(id){ historyData=historyData.filter(function(h){return h.id!==id;}); saveHistory(); renderHistory(); }
function addHistoryPrompt(){
  var desc=prompt('Bet description (e.g. Duke ML -145):');
  if(!desc) return;
  var wager=parseFloat(prompt('Wager amount ($):'));
  if(!wager) return;
  var result=confirm('Did you WIN?\nOK = Win   Cancel = Loss');
  var payout=0;
  if(result) payout=parseFloat(prompt('Total payout received ($):')||0);
  var today=new Date().toLocaleDateString([],{month:'short',day:'numeric'});
  historyData.unshift({id:Date.now(),desc:desc,wager:wager,result:result?'Win':'Loss',payout:payout,date:today});
  saveHistory(); renderHistory();
}
function renderHistory(){
  var wins=historyData.filter(function(h){return h.result==='Win';}).length;
  var wagered=historyData.reduce(function(a,h){return a+h.wager;},0);
  var returned=historyData.filter(function(h){return h.result==='Win';}).reduce(function(a,h){return a+h.payout;},0);
  var roi=wagered>0?(((returned-wagered)/wagered)*100).toFixed(1):'0.0';
  document.getElementById('h-winrate').textContent=wins+'/'+historyData.length;
  document.getElementById('h-wagered').textContent='$'+wagered;
  var roiEl=document.getElementById('h-roi');
  roiEl.textContent=roi+'%';
  roiEl.style.color=Number(roi)>=0?'#38bdf8':'#f97316';
  if(!historyData.length){document.getElementById('history-list').innerHTML='<div class="empty">No bets logged yet.</div>';return;}
  document.getElementById('history-list').innerHTML=historyData.map(function(h){
    return '<div style="background:#111825;border-left:3px solid '+(h.result==='Win'?'#38bdf8':'#f97316')+';border-radius:10px;padding:11px 13px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="flex:1"><div style="font-size:13px;font-weight:600">'+h.desc+'</div><div style="font-size:10px;color:#667788;margin-top:2px">'+h.date+' &middot; Wagered $'+h.wager+'</div></div>'
      +'<div style="text-align:right;margin-left:10px"><div style="font-size:11px;font-weight:700;color:'+(h.result==='Win'?'#38bdf8':'#f97316')+'">'+h.result+'</div><div style="font-size:13px;font-weight:700;color:'+(h.result==='Win'?'#38bdf8':'#a0b4c8')+'">'+(h.result==='Win'?'$'+h.payout.toFixed(2):'-$'+h.wager)+'</div></div>'
      +'<button onclick="deleteHistoryItem('+h.id+')" style="margin-left:10px;background:rgba(249,115,22,0.15);border:none;border-radius:6px;color:#f97316;padding:4px 8px;font-size:11px;font-family:inherit">X</button>'
      +'</div>';
  }).join('');
}

// ============================================================
// ============================================================
// TOAST
// ============================================================
function showToast(msg){
  var t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#080c17;padding:10px 18px;border-radius:20px;font-size:12px;font-weight:700;z-index:999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
  document.body.appendChild(t);
  setTimeout(function(){t.remove();},4000);
}
// ============================================================
// GAME FLAGS + PER-GAME CLAUDE ANALYSIS
// ============================================================
var currentAnalysisGame = null;

function openGameAnalysis(gameId, away, home){
  currentAnalysisGame = {id:gameId, away:away, home:home};
  document.getElementById('game-analysis-title').textContent = away + ' @ ' + home;
  document.getElementById('game-analysis-content').innerHTML = '<span style="color:#445566">Tap ANALYZE to get Claude\'s take on this matchup.</span>';
  document.getElementById('game-analysis-loading').style.display='none';
  // Load existing flags
  var f = gameFlags[gameId] || {};
  document.getElementById('game-flag-note').value = f.note || '';
  var flagDefs = [
    {key:'injury_away', label: away + ' KEY INJURY'},
    {key:'injury_home', label: home + ' KEY INJURY'},
    {key:'fatigue_away', label: away + ' FATIGUE / B2B'},
    {key:'fatigue_home', label: home + ' FATIGUE / B2B'},
  ];
  document.getElementById('game-flag-rows').innerHTML = flagDefs.map(function(fd){
    var checked = f[fd.key] ? 'checked' : '';
    return '<label style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer">'
      +'<input type="checkbox" id="flag-'+fd.key+'" '+checked+' style="width:16px;height:16px;accent-color:#f59e0b"/>'
      +'<span style="font-size:11px;color:#e0e6f0">'+fd.label+'</span>'
      +'</label>';
  }).join('');
  document.getElementById('game-analysis-modal').style.display='block';
  document.body.style.overflow='hidden';
}

function closeGameAnalysis(){
  document.getElementById('game-analysis-modal').style.display='none';
  document.body.style.overflow='';
  currentAnalysisGame = null;
}

function saveGameFlag(){
  if(!currentAnalysisGame) return;
  var id = currentAnalysisGame.id;
  gameFlags[id] = {
    injury_away:  document.getElementById('flag-injury_away')  ? document.getElementById('flag-injury_away').checked  : false,
    injury_home:  document.getElementById('flag-injury_home')  ? document.getElementById('flag-injury_home').checked  : false,
    fatigue_away: document.getElementById('flag-fatigue_away') ? document.getElementById('flag-fatigue_away').checked : false,
    fatigue_home: document.getElementById('flag-fatigue_home') ? document.getElementById('flag-fatigue_home').checked : false,
    note: document.getElementById('game-flag-note').value.trim()
  };
  saveGameFlags();
  showToast('Flags saved');
  // Re-render games so the warning icon updates
  if(window._rawGamesData) renderFilteredGames();
}

async function runGameAnalysis(){
  // Route through queue to avoid colliding with summary generation
  return claudeApiCall(function(){ return _runGameAnalysisInner(); });
}
async function _runGameAnalysisInner(){
  if(!currentAnalysisGame) return;
  if(!CLAUDE_KEY){
    document.getElementById('game-analysis-content').innerHTML='<span style="color:#f59e0b">No Claude API key. Go to TOOLS &rarr; KEYS.</span>';
    return;
  }
  var g = allGamesData.find(function(x){return x.id===currentAnalysisGame.id;});
  if(!g){
    document.getElementById('game-analysis-content').innerHTML='<span style="color:#f97316">Game data not loaded. Refresh odds first.</span>';
    return;
  }
  var s1=findTeamStats(g.home), s2=findTeamStats(g.away);
  var flags = gameFlags[g.id] || {};
  // Build stats context
  function statLine(name, s){
    if(!s) return name+': no stats in database';
    return name+': PPG='+s.ppg+', OrtG='+s.ortg+', DrtG='+s.drtg+', Pace='+s.pace+', EFG='+s.efg+'%, TOV='+s.tov+'%, ORB='+s.orb+'%, Exp='+s.exp+', 3PR='+s.tpr+'%';
  }
  var net1=s1?s1.ortg-s1.drtg:null, net2=s2?s2.ortg-s2.drtg:null;
  var projMargin=net1&&net2?((net1-net2)*0.9).toFixed(1):null;
  var projTotal=null;
  if(s1&&s2&&g.total){
    var avgPoss=(s1.pace+s2.pace)/2;
    projTotal=((s1.ortg+s2.drtg)/2/100*avgPoss+(s2.ortg+s1.drtg)/2/100*avgPoss).toFixed(1);
  }
  // Flag context
  var flagLines=[];
  if(flags.injury_away) flagLines.push('INJURY FLAG: '+g.away+' has a key player injured or questionable');
  if(flags.injury_home) flagLines.push('INJURY FLAG: '+g.home+' has a key player injured or questionable');
  if(flags.fatigue_away) flagLines.push('FATIGUE FLAG: '+g.away+' is on a back-to-back or played heavy minutes recently');
  if(flags.fatigue_home) flagLines.push('FATIGUE FLAG: '+g.home+' is on a back-to-back or played heavy minutes recently');
  if(flags.note) flagLines.push('Note: '+flags.note);
  var flagContext = flagLines.length ? '\n\nGame flags:\n'+flagLines.join('\n') : '';
  // Odds context
  var oddsContext = 'Odds: '+g.away+' ML '+fmt(g.awayML)+' / '+g.home+' ML '+fmt(g.homeML);
  if(g.spread!=null) oddsContext += ' | Spread: '+g.home+' '+fmt(g.spread)+' ('+fmt(g.spreadOdds)+')';
  if(g.total!=null) oddsContext += ' | Total: '+g.total;
  var prompt = 'You are a sharp NCAA basketball betting analyst. Analyze this specific matchup for betting value.\n\n'
    +'Matchup: '+g.away+' @ '+g.home+'\n'
    +oddsContext+'\n\n'
    +'Team stats:\n'+statLine(g.home,s1)+'\n'+statLine(g.away,s2)+'\n'
    +(projMargin?'\nProjected margin: '+g.home+' by '+projMargin+' pts (stats model)':'')
    +(projTotal?'\nProjected total: '+projTotal+' pts (vs line '+g.total+')':'')
    +flagContext
    +'\n\nProvide a focused 5-6 sentence analysis covering: (1) which team has the statistical edge and why, (2) whether the spread offers value, (3) whether the total looks over or under, (4) any concerns from the flags above, (5) your recommended bet with confidence level. Be direct. No disclaimers.';
  document.getElementById('game-analysis-loading').style.display='block';
  document.getElementById('game-analysis-content').innerHTML='';
  var dotFrames=['&#9679;','&#9679; &#9679;','&#9679; &#9679; &#9679;'],dotIdx=0;
  var dotTimer=setInterval(function(){var el=document.getElementById('game-analysis-dots');if(el){el.innerHTML=dotFrames[dotIdx%3];dotIdx++;}},500);
  try{
    var response=await claudeFetchWithRetry('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:600,messages:[{role:'user',content:prompt}]})
    });
    clearInterval(dotTimer);
    document.getElementById('game-analysis-loading').style.display='none';
    if(!response.ok){var err=await response.json().catch(function(){return{};});throw new Error(err.error&&err.error.message?err.error.message:'API error '+response.status);}
    var data=await response.json();
    var text=data.content&&data.content[0]&&data.content[0].text?data.content[0].text:'No response.';
    document.getElementById('game-analysis-content').innerHTML=text
      .replace(/\*\*(.*?)\*\*/g,'<strong style="color:#fff">$1</strong>')
      .replace(/\n\n/g,'<br/><br/>').replace(/\n/g,'<br/>');
  } catch(e){
    clearInterval(dotTimer);
    document.getElementById('game-analysis-loading').style.display='none';
    var emsg=e.message||'Unknown error';
    var ehint='';
    if(emsg.indexOf('529')>-1||emsg.toLowerCase().indexOf('overload')>-1) ehint=' &mdash; API busy, tap ANALYZE again in a moment.';
    else if(emsg.indexOf('401')>-1||emsg.toLowerCase().indexOf('auth')>-1) ehint=' &mdash; Invalid key, check TOOLS &rarr; KEYS.';
    document.getElementById('game-analysis-content').innerHTML='<span style="color:#f97316">Error: '+emsg+ehint+'</span>';
  }
}

</script>
