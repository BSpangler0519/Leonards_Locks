async function refreshAll(){
  var btn=document.getElementById('refresh-btn');
  btn.disabled=true; btn.innerHTML='...';
  await fetchOdds();
  await checkPendingBets();
  await generatePicks();
  btn.disabled=false; btn.innerHTML='&#8635;';
}

// ============================================================
// PENDING BETS
// ============================================================
function savePendingBetsStore(){ localStorage.setItem('pendingBets',JSON.stringify(pendingBets)); }
function updateBetsBadge(){
  var b=document.getElementById('bets-badge');
  if(pendingBets.length){b.style.display='block';b.textContent=pendingBets.length;}
  else b.style.display='none';
}
function showAddBetForm(){
  document.getElementById('add-bet-form').style.display='block';
  document.getElementById('add-bet-btn').style.display='none';
  var now=new Date(); now.setMinutes(0,0,0);
  document.getElementById('bet-gametime').value=now.toISOString().slice(0,16);
  document.getElementById('bet-odds').oninput=updateToWin;
  document.getElementById('bet-wager').oninput=updateToWin;
}
function hideAddBetForm(){
  document.getElementById('add-bet-form').style.display='none';
  document.getElementById('add-bet-btn').style.display='block';
  clearBetForm();
}
function quickAddBet(data){
  switchTab('bets');
  // Make sure we're on pending sub-tab
  switchBetsSub('pending-panel');
  document.getElementById('add-bet-form').style.display='block';
  document.getElementById('add-bet-btn').style.display='none';
  document.getElementById('bet-odds').oninput=updateToWin;
  document.getElementById('bet-wager').oninput=updateToWin;
  clearBetForm();
  selectBetType(data.type||'ml');
  if(data.type!=='parlay'){
    var tEl=document.getElementById('bet-team'); if(tEl) tEl.value=data.team||data.away||'';
    var oEl=document.getElementById('bet-opponent'); if(oEl) oEl.value=data.opponent||data.home||'';
  }
  if(data.type==='parlay'&&data.parlayDesc){ var pdEl=document.getElementById('bet-parlay-desc'); if(pdEl) pdEl.value=data.parlayDesc; }
  if(data.type==='spread'){ var spEl=document.getElementById('bet-spread'); if(spEl&&data.spread!=null) spEl.value=data.spread; }
  if(data.type==='ou'){
    var totEl=document.getElementById('bet-total'); if(totEl&&data.total!=null) totEl.value=data.total;
    var sideEl=document.getElementById('bet-ou-side'); if(sideEl&&data.ouSide) sideEl.value=data.ouSide;
  }
  if(data.odds){ var odsEl=document.getElementById('bet-odds'); if(odsEl) odsEl.value=data.odds; updateToWin(); }
  var dtEl=document.getElementById('bet-gametime');
  if(dtEl){
    if(data.commence_time){
      try{
        var ct=new Date(data.commence_time);
        if(!isNaN(ct.getTime())){
          var pad=function(n){return n<10?'0'+n:n;};
          dtEl.value=ct.getFullYear()+'-'+pad(ct.getMonth()+1)+'-'+pad(ct.getDate())+'T'+pad(ct.getHours())+':'+pad(ct.getMinutes());
        }
      } catch(e){ var now2=new Date(); now2.setMinutes(0,0,0); dtEl.value=now2.toISOString().slice(0,16); }
    } else { var now3=new Date(); now3.setMinutes(0,0,0); dtEl.value=now3.toISOString().slice(0,16); }
  }
  setTimeout(function(){ var f=document.getElementById('add-bet-form'); if(f) f.scrollIntoView({behavior:'smooth',block:'start'}); },150);
}
function clearBetForm(){
  ['bet-team','bet-opponent','bet-spread','bet-total','bet-parlay-desc','bet-odds','bet-wager'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('bet-to-win').textContent='-';
  selectBetType('ml');
}
function selectBetType(type){
  currentBetType=type;
  document.querySelectorAll('.bet-type-btn').forEach(function(b){
    var a=b.dataset.type===type;
    b.style.border=a?'1px solid #f59e0b':'1px solid #2a3a4a';
    b.style.background=a?'rgba(245,158,11,0.2)':'transparent';
    b.style.color=a?'#f59e0b':'#7a8fa6';
  });
  document.getElementById('bet-teams-fields').style.display=type==='parlay'?'none':'block';
  document.getElementById('parlay-desc-field').style.display=type==='parlay'?'block':'none';
  document.getElementById('spread-field').style.display=type==='spread'?'block':'none';
  document.getElementById('ou-fields').style.display=type==='ou'?'block':'none';
}
function updateToWin(){
  var odds=parseInt(document.getElementById('bet-odds').value)||0;
  var wager=parseFloat(document.getElementById('bet-wager').value)||0;
  if(!odds||!wager){document.getElementById('bet-to-win').textContent='-';return;}
  document.getElementById('bet-to-win').textContent='+$'+(wager*(aToDec(odds)-1)).toFixed(2);
}
function savePendingBet(){
  var oddsRaw=document.getElementById('bet-odds').value.trim();
  var wagerRaw=document.getElementById('bet-wager').value.trim();
  var gametime=document.getElementById('bet-gametime').value.trim();
  var odds=parseInt(oddsRaw)||0;
  var wager=parseFloat(wagerRaw)||0;
  if(!oddsRaw||!wagerRaw||!gametime){alert('Please fill in odds, wager, and game time.');return;}
  if(!odds){alert('Please enter valid odds (e.g. -110 or +150)');return;}
  if(!wager){alert('Please enter a valid wager amount');return;}
  var bet={id:Date.now(),type:currentBetType,odds:odds,wager:wager,gametime:gametime,status:'pending',created:new Date().toISOString()};
  if(currentBetType==='parlay'){
    var desc=document.getElementById('bet-parlay-desc').value.trim();
    if(!desc){alert('Please enter a parlay description.');return;}
    bet.desc=desc;
    var legCount=desc.split(' + ').length;
    var shortLegs=desc.split(' + ').map(function(l){return l.split(' ')[0];});
    bet.label=legCount+'-Leg Parlay &middot; '+shortLegs.join(' &middot; ');
  } else {
    var team=document.getElementById('bet-team').value.trim();
    var opp=document.getElementById('bet-opponent').value.trim();
    if(!team||!opp){alert('Please enter both teams.');return;}
    bet.team=team; bet.opponent=opp;
    if(currentBetType==='ml') bet.label=team+' ML vs '+opp;
    else if(currentBetType==='spread'){var sp=parseFloat(document.getElementById('bet-spread').value)||0;bet.spread=sp;bet.label=team+' '+fmt(sp)+' vs '+opp;}
    else if(currentBetType==='ou'){var tot=parseFloat(document.getElementById('bet-total').value)||0;var side=document.getElementById('bet-ou-side').value;bet.total=tot;bet.ouSide=side;bet.label=(side==='over'?'Over ':'Under ')+tot+' ('+team+' vs '+opp+')';}
  }
  pendingBets.unshift(bet);
  savePendingBetsStore(); updateBetsBadge(); renderPendingBets(); hideAddBetForm();
}
function deletePendingBet(id){
  pendingBets=pendingBets.filter(function(b){return b.id!==id;});
  savePendingBetsStore(); updateBetsBadge(); renderPendingBets();
}
function editPendingBet(id){
  var b=pendingBets.find(function(x){return x.id===id;});
  if(!b) return;
  pendingBets=pendingBets.filter(function(x){return x.id!==id;});
  savePendingBetsStore(); updateBetsBadge(); renderPendingBets();
  document.getElementById('add-bet-form').style.display='block';
  document.getElementById('add-bet-btn').style.display='none';
  document.getElementById('bet-odds').oninput=updateToWin;
  document.getElementById('bet-wager').oninput=updateToWin;
  clearBetForm();
  selectBetType(b.type||'ml');
  var pad=function(n){return n<10?'0'+n:''+n;};
  if(b.type==='parlay'){ var pdEl=document.getElementById('bet-parlay-desc'); if(pdEl) pdEl.value=b.desc||''; }
  else {
    var tEl=document.getElementById('bet-team'); if(tEl) tEl.value=b.team||'';
    var oEl=document.getElementById('bet-opponent'); if(oEl) oEl.value=b.opponent||'';
    if(b.type==='spread'){ var spEl=document.getElementById('bet-spread'); if(spEl&&b.spread!=null) spEl.value=b.spread; }
    if(b.type==='ou'){
      var totEl=document.getElementById('bet-total'); if(totEl&&b.total!=null) totEl.value=b.total;
      var sideEl=document.getElementById('bet-ou-side'); if(sideEl&&b.ouSide) sideEl.value=b.ouSide;
    }
  }
  var odsEl=document.getElementById('bet-odds'); if(odsEl) odsEl.value=b.odds||'';
  var wagEl=document.getElementById('bet-wager'); if(wagEl) wagEl.value=b.wager||'';
  var dtEl=document.getElementById('bet-gametime');
  if(dtEl&&b.gametime){
    var gt=new Date(b.gametime);
    if(!isNaN(gt.getTime())) dtEl.value=gt.getFullYear()+'-'+pad(gt.getMonth()+1)+'-'+pad(gt.getDate())+'T'+pad(gt.getHours())+':'+pad(gt.getMinutes());
  }
  updateToWin();
  setTimeout(function(){ var f=document.getElementById('add-bet-form'); if(f) f.scrollIntoView({behavior:'smooth',block:'start'}); },150);
  showToast('Bet loaded for editing');
}
function manualResolveBet(id,result){
  var bet=pendingBets.find(function(b){return b.id===id;});
  if(bet) resolveBet(bet,result);
}
function resolveBet(bet,result){
  var payout=result==='Win'?parseFloat((bet.wager*aToDec(bet.odds)).toFixed(2)):result==='Push'?bet.wager:0;
  var gameDate=new Date(bet.gametime).toLocaleDateString([],{month:'short',day:'numeric'});
  historyData.unshift({id:Date.now(),desc:bet.label+' ('+fmt(bet.odds)+')',type:bet.type||'ml',wager:bet.wager,result:result,payout:payout,date:gameDate});
  saveHistory();
  // Grade matching accuracy entry by type + team name
  var accResult=result==='Win'?'win':result==='Loss'?'loss':result==='Push'?'push':null;
  if(accResult && bet.type && bet.team){
    var teamLower=(bet.team||'').toLowerCase();
    var matched=pickAccuracy.find(function(a){
      return !a.result && a.type===bet.type && a.pick && a.pick.toLowerCase().indexOf(teamLower)>=0;
    });
    if(matched){ matched.result=accResult; matched.gradedAt=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}); savePickAccuracy(); }
  }
  pendingBets=pendingBets.filter(function(b){return b.id!==bet.id;});
  savePendingBetsStore(); updateBetsBadge(); renderPendingBets(); renderHistory();
}
function renderPendingBets(){
  var listEl=document.getElementById('pending-bets-list');
  var emptyEl=document.getElementById('pending-empty');
  if(!listEl) return;
  if(!pendingBets.length){listEl.innerHTML='';emptyEl.style.display='block';return;}
  emptyEl.style.display='none';
  var now=new Date();
  var sortedPending=pendingBets.slice().sort(function(a,b){return new Date(a.gametime)-new Date(b.gametime);});
  listEl.innerHTML=sortedPending.map(function(b){
    var gameTime=new Date(b.gametime);
    var isPast=gameTime<now;
    var timeStr=gameTime.toLocaleDateString([],{month:'short',day:'numeric'})+' '+gameTime.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    var profit=(b.wager*(aToDec(b.odds)-1)).toFixed(2);
    var statusColor=isPast?'#f59e0b':'#38bdf8';
    var statusLabel=isPast?'&#x23F1; AWAITING RESULT':'&#x1F550; UPCOMING';
    return '<div style="background:#111825;border:1px solid '+(isPast?'#f59e0b33':'#1a2a3a')+';border-left:3px solid '+(isPast?'#f59e0b':'#38bdf8')+';border-radius:12px;padding:14px;margin-bottom:10px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:9px;color:'+statusColor+';font-weight:700;letter-spacing:1px">'+statusLabel+'</span><span style="font-size:10px;color:#7a8fa6">'+timeStr+'</span></div>'
      +'<div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px">'+b.label+'</div>'
      +(b.type==='parlay'&&b.desc?'<div style="font-size:10px;color:#556677;margin-bottom:6px;line-height:1.5">'+b.desc+'</div>':'')
      +'<div style="font-size:11px;color:#7a8fa6;margin-bottom:10px">Odds: <span style="color:'+(b.odds>0?'#38bdf8':'#c084fc')+';font-weight:700">'+fmt(b.odds)+'</span> &middot; Wager: <span style="color:#fff;font-weight:600">$'+b.wager+'</span> &middot; To Win: <span style="color:#38bdf8;font-weight:700">+$'+profit+'</span></div>'
      +(isPast
        ?'<div style="display:flex;gap:6px"><button onclick="manualResolveBet('+b.id+',\'Win\')" style="flex:1;padding:8px;background:rgba(56,189,248,0.15);border:1px solid #38bdf8;border-radius:8px;color:#38bdf8;font-size:11px;font-weight:700;font-family:inherit">WIN</button><button onclick="manualResolveBet('+b.id+',\'Loss\')" style="flex:1;padding:8px;background:rgba(249,115,22,0.15);border:1px solid #f97316;border-radius:8px;color:#f97316;font-size:11px;font-weight:700;font-family:inherit">LOSS</button><button onclick="manualResolveBet('+b.id+',\'Push\')" style="flex:1;padding:8px;background:rgba(161,161,170,0.1);border:1px solid #52525b;border-radius:8px;color:#a1a1aa;font-size:11px;font-weight:700;font-family:inherit">PUSH</button><button onclick="deletePendingBet('+b.id+')" style="padding:8px 10px;background:transparent;border:1px solid #2a3a4a;border-radius:8px;color:#52525b;font-size:11px;font-family:inherit">&#128465;</button></div>'
        :'<div style="display:flex;gap:6px"><button onclick="editPendingBet('+b.id+')" style="flex:1;padding:8px;background:rgba(245,158,11,0.1);border:1px solid #f59e0b;border-radius:8px;color:#f59e0b;font-size:11px;font-weight:700;font-family:inherit">EDIT</button><button onclick="deletePendingBet('+b.id+')" style="padding:8px 14px;background:transparent;border:1px solid #2a3a4a;border-radius:8px;color:#52525b;font-size:11px;font-family:inherit">REMOVE</button></div>'
      )+'</div>';
  }).join('');
}

// ============================================================
// AUTO-RESOLVE BETS (fixed: checks both NCAAB and tournament)
// ============================================================
async function checkPendingBets(){
  if(!API_KEY) return;
  if(!pendingBets.length && !pickAccuracy.some(function(a){return !a.result;})) return;
  try{
    var scoreParams='scores?daysFrom=3&apiKey='+API_KEY;
    var base='https://api.the-odds-api.com/v4/sports/';
    var results=await Promise.allSettled([
      fetch(base+'basketball_ncaab/'+scoreParams).then(function(r){return r.ok?r.json():[];}),
      fetch(base+'basketball_ncaab_championship/'+scoreParams).then(function(r){return r.ok?r.json():[];})
    ]);
    var s1=(results[0].status==='fulfilled'&&Array.isArray(results[0].value))?results[0].value:[];
    var s2=(results[1].status==='fulfilled'&&Array.isArray(results[1].value))?results[1].value:[];
    var scores=s1.concat(s2);
    var resolved=0;
    pendingBets.slice().forEach(function(bet){
      if(bet.type==='parlay') return;
      var game=scores.find(function(g){
        if(!g.completed) return false;
        var h=g.home_team.toLowerCase(), a=g.away_team.toLowerCase();
        var bt=bet.team.toLowerCase(), bo=(bet.opponent||'').toLowerCase();
        return (fuzzyTeamMatch(bt,h)||fuzzyTeamMatch(bt,a))&&(fuzzyTeamMatch(bo,h)||fuzzyTeamMatch(bo,a));
      });
      if(!game||!game.scores) return;
      var getScore=function(name){var s=game.scores.find(function(s){return s.name===name;});return s?parseInt(s.score):0;};
      var homeScore=getScore(game.home_team),awayScore=getScore(game.away_team);
      var isHome=fuzzyTeamMatch(bet.team.toLowerCase(),game.home_team.toLowerCase());
      var betScore=isHome?homeScore:awayScore, oppScore=isHome?awayScore:homeScore;
      var total=homeScore+awayScore;
      var result=null;
      if(bet.type==='ml') result=betScore>oppScore?'Win':'Loss';
      else if(bet.type==='spread'){
        // bet.spread is the line from bet.team's perspective (e.g. -13 means bet.team is a 13-pt favorite)
        // Win if: betScore - oppScore + bet.spread > 0
        // Push if: betScore - oppScore + bet.spread === 0
        var covered = (betScore - oppScore) + bet.spread;
        result = covered > 0 ? 'Win' : covered === 0 ? 'Push' : 'Loss';
      }
      else if(bet.type==='ou'){if(bet.ouSide==='over') result=total>bet.total?'Win':total===bet.total?'Push':'Loss';else result=total<bet.total?'Win':total===bet.total?'Push':'Loss';}
      if(result){resolveBet(bet,result);resolved++;}
    });
    if(resolved>0) showToast(resolved+' bet'+(resolved>1?'s':'')+' auto-resolved! Check LOG tab.');
    // Grade AI picks independently of bets
    gradePicksFromScores(scores);
  } catch(e){ console.log('Score check:',e); }
}

// Grade unresolved AI pick accuracy entries against completed game scores
function gradePicksFromScores(scores){
  try{
    var ungraded=pickAccuracy.filter(function(a){return !a.result;});
    if(!ungraded.length) return;
    var newlyGraded=0;
    ungraded.forEach(function(entry){
      // Match by gameId first (most reliable), fall back to fuzzy team name
      var game=scores.find(function(g){ return g.id===entry.gameId && g.completed && g.scores; });
      if(!game){
        // Fallback: fuzzy match on gameLabel "Away @ Home"
        var parts=(entry.gameLabel||'').toLowerCase().split(' @ ');
        if(parts.length>=2){
          var awayPart=parts[0].trim(), homePart=parts[1].trim();
          game=scores.find(function(g){
            if(!g.completed||!g.scores) return false;
            var h=g.home_team.toLowerCase(), a=g.away_team.toLowerCase();
            return (fuzzyTeamMatch(awayPart,a)||fuzzyTeamMatch(awayPart,h))
                && (fuzzyTeamMatch(homePart,h)||fuzzyTeamMatch(homePart,a));
          });
        }
      }
      if(!game||!game.scores) return;
      var getScore=function(name){var s=game.scores.find(function(s){return s.name===name;});return s?parseInt(s.score):0;};
      var homeScore=getScore(game.home_team), awayScore=getScore(game.away_team);
      var total=homeScore+awayScore;
      var pick=(entry.pick||'').toLowerCase();
      var result=null;
      if(entry.type==='ml'){
        var pickTeam=pick.replace(' ml','').trim();
        var pickIsHome=fuzzyTeamMatch(pickTeam,game.home_team.toLowerCase());
        var pickScore=pickIsHome?homeScore:awayScore;
        var oppScore=pickIsHome?awayScore:homeScore;
        if(pickScore!==oppScore) result=pickScore>oppScore?'win':'loss';
      } else if(entry.type==='spread'){
        var spreadMatch=pick.match(/([+-]?\d+\.?\d*)\s*$/);
        if(spreadMatch){
          var line=parseFloat(spreadMatch[1]);
          var spreadTeam=pick.replace(spreadMatch[0],'').trim();
          var stIsHome=fuzzyTeamMatch(spreadTeam,game.home_team.toLowerCase());
          var stScore=stIsHome?homeScore:awayScore;
          var stOpp=stIsHome?awayScore:homeScore;
          var margin=stScore-stOpp+line;
          result=margin>0?'win':margin===0?'push':'loss';
        }
      } else if(entry.type==='ou'){
        var ouLine=parseFloat((entry.pick||'').replace(/[^0-9.]/g,''));
        if(!isNaN(ouLine)&&ouLine>0){
          var isOver=pick.indexOf('over')>=0;
          if(total!==ouLine) result=isOver?(total>ouLine?'win':'loss'):(total<ouLine?'win':'loss');
          else result='push';
        }
      }
      if(result){
        entry.result=result;
        entry.gradedAt=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
        newlyGraded++;
      }
    });
    if(newlyGraded>0){ savePickAccuracy(); renderAccuracyTab(); }
  } catch(e){ console.log('gradePicksFromScores error:',e); }
}

// Fuzzy team match - safe word-boundary matching, prevents Arizona/Arizona State false positives
function fuzzyTeamMatch(query, candidate){
  if(!query||!candidate) return false;
  var q=query.toLowerCase().trim(), c=candidate.toLowerCase().trim();
  if(q===c) return true;
  var qWords=q.split(/\s+/), cWords=c.split(/\s+/);
  var shorter=qWords.length<=cWords.length?qWords:cWords;
  var longer=qWords.length<=cWords.length?cWords:qWords;
  // Only allow match if word counts differ by at most 1 (e.g. nickname suffix like "Jayhawks")
  if(longer.length - shorter.length > 1) return false;
  // Shorter must be a contiguous prefix of longer
  var isPrefix=shorter.every(function(w,i){return w===longer[i];});
  if(isPrefix) return true;
  // Safe explicit alias pairs
  var aliasPairs=[
    ['north carolina','unc'],['connecticut','uconn'],['ohio state','ohio st'],
    ['michigan state','michigan st'],['kansas state','kansas st'],
    ['iowa state','iowa st'],['florida state','florida st'],['penn state','penn st'],
    ['lsu','louisiana state'],['ole miss','mississippi'],['nc state','north carolina state'],
    ['saint mary\'s','st. mary\'s'],['saint peter\'s','st. peter\'s'],['loyola chicago','loyola (il)']
  ];
  for(var i=0;i<aliasPairs.length;i++){
    if((q===aliasPairs[i][0]&&c===aliasPairs[i][1])||(q===aliasPairs[i][1]&&c===aliasPairs[i][0])) return true;
  }
  return false;
}

// ============================================================
// PICKS GENERATION
// ============================================================
