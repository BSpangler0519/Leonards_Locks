function getTeamStats(name){ return teamStats[name] || TEAM_STATS_DEFAULT[name] || null; }
function getAllTeamNames(){
  var names=Object.keys(TEAM_STATS_DEFAULT);
  Object.keys(teamStats).forEach(function(k){if(names.indexOf(k)<0) names.push(k);});
  return names.sort();
}
function saveTeamStats(){ localStorage.setItem('teamStatsCustom',JSON.stringify(teamStats)); }

function findTeamStats(fullName){
  if(!fullName) return null;
  var exact=getTeamStats(fullName);
  if(exact) return exact;
  var names=getAllTeamNames();
  var lc=fullName.toLowerCase().trim();

  // 1. Exact case-insensitive
  var m=names.find(function(n){return n.toLowerCase()===lc;});
  if(m) return getTeamStats(m);

  // 2. Safe alias map -- explicit mappings only, avoids false substring matches
  var aliases={
    'unc':'North Carolina','uconn':'Connecticut',
    'ohio st':'Ohio State','ohio st.':'Ohio State',
    'michigan st':'Michigan State','michigan st.':'Michigan State',
    'kansas st':'Kansas State','kansas st.':'Kansas State',
    'iowa st':'Iowa State','iowa st.':'Iowa State',
    'florida st':'Florida State','florida st.':'Florida State',
    'penn st':'Penn State','penn st.':'Penn State',
    'mississippi state':'Mississippi State','miss state':'Mississippi State',
    'ole miss':'Ole Miss','lsu':'LSU','tcu':'TCU','smu':'SMU','vcu':'VCU',
    'fau':'Florida Atlantic','wku':'Western Kentucky',
    'utep':'UTEP','utsa':'UTSA','uab':'UAB',
    'nc state':'NC State','n.c. state':'NC State',
    'mount st. mary\'s':'Mount St. Mary\'s','mount st mary\'s':'Mount St. Mary\'s',
    'northern iowa':'Northern Iowa','n iowa':'Northern Iowa',
    'mcneese':'McNeese State','mcneese st':'McNeese State',
    'morehead st':'Morehead State','morehead state':'Morehead State',
    'grambling':'Grambling State','grambling st':'Grambling State',
    'long beach st':'Long Beach State','long beach state':'Long Beach State',
    'grand canyon':'Grand Canyon',
    'saint mary\'s':'Saint Mary\'s','st. mary\'s':'Saint Mary\'s',
    'loyola chicago':'Loyola Chicago','loyola-chicago':'Loyola Chicago',
    'saint peter\'s':'Saint Peter\'s','st peter\'s':'Saint Peter\'s',
    'samford':'Samford','high point':'High Point',
    'abilene christian':'Abilene Christian',
    'csun':'Cal State Northridge','csuf':'Cal State Fullerton',
    'n.c. state':'NC State'
  };
  var aliasMatch=aliases[lc];
  if(aliasMatch) return getTeamStats(aliasMatch);

  // 3. Whole-word containment -- DB name must be the ENTIRE query (no extra words)
  // "Arizona" will NOT match "Arizona State" because "state" is an extra word
  m=names.find(function(n){
    var nl=n.toLowerCase();
    if(nl===lc) return true;
    // DB entry is contained in query but query has no extra words beyond it
    var escaped=nl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re=new RegExp('^'+escaped+'$');
    return re.test(lc);
  });
  if(m) return getTeamStats(m);

  // 4. Safe unique first-word match for programs with globally unique names
  var safeFirstWords=['gonzaga','villanova','marquette','creighton','xavier','purdue',
    'vanderbilt','northwestern','stanford','georgetown','providence','butler',
    'belmont','furman','lipscomb','colgate','siena','iona','winthrop','campbell',
    'merrimack','longwood','stetson','radford','norfolk','coppin','bethune'];
  var firstWord=lc.split(' ')[0];
  if(firstWord.length>=5 && safeFirstWords.indexOf(firstWord)>-1){
    var fw=names.find(function(n){return n.toLowerCase().split(' ')[0]===firstWord;});
    if(fw) return getTeamStats(fw);
  }

  return null;
}

// ============================================================
// STATS MODE
// ============================================================
function setStatsMode(mode){
  statsMode=mode;
  document.getElementById('stats-team-panel').style.display=mode==='team'?'block':'none';
  document.getElementById('stats-matchup-panel').style.display=mode==='matchup'?'block':'none';
  document.getElementById('stats-mode-team').style.background=mode==='team'?'rgba(245,158,11,0.2)':'transparent';
  document.getElementById('stats-mode-team').style.borderColor=mode==='team'?'#f59e0b':'#2a3a4a';
  document.getElementById('stats-mode-team').style.color=mode==='team'?'#f59e0b':'#667788';
  document.getElementById('stats-mode-matchup').style.background=mode==='matchup'?'rgba(245,158,11,0.2)':'transparent';
  document.getElementById('stats-mode-matchup').style.borderColor=mode==='matchup'?'#f59e0b':'#2a3a4a';
  document.getElementById('stats-mode-matchup').style.color=mode==='matchup'?'#f59e0b':'#667788';
}
function searchTeam(val){
  var res=document.getElementById('team-search-results');
  document.getElementById('team-stats-card').innerHTML='';
  if(val.length<2){res.innerHTML='';return;}
  var matches=getAllTeamNames().filter(function(n){return n.toLowerCase().indexOf(val.toLowerCase())>-1;}).slice(0,12);
  if(!matches.length){res.innerHTML='<div style="font-size:12px;color:#8aa0b8;padding:8px">No teams found</div>';return;}
  res.innerHTML='<div class="search-dropdown">'+matches.map(function(n){return'<div class="search-item" onclick="showTeamStats(\''+escQ(n)+'\')">'+n+'</div>';}).join('')+'</div>';
}
function showTeamStats(name){
  document.getElementById('team-search').value=name;
  document.getElementById('team-search-results').innerHTML='';
  var s=getTeamStats(name);
  if(!s){document.getElementById('team-stats-card').innerHTML='<div class="alert-red">No stats found for '+name+'</div>';return;}
  var netRtg=(s.ortg-s.drtg).toFixed(1);
  var netColor=Number(netRtg)>=0?'#38bdf8':'#f97316';
  var expLabel=s.exp!=null?(['Raw','Soph','Jr','Sr','Grad'][Math.min(Math.round(s.exp),4)]||s.exp.toFixed(1)):'--';
  var expColor=s.exp>=2.5?'#38bdf8':s.exp>=1.5?'#f59e0b':'#f97316';
  var tprLabel=s.tpr!=null?s.tpr+'%':'--';
  var tprColor=s.tpr>=40?'#f97316':s.tpr>=35?'#f59e0b':'#38bdf8';
  var atsLabel=s.ats_w!=null&&s.ats_l!=null?s.ats_w+'-'+s.ats_l:'--';
  var atsPct=s.ats_w!=null&&s.ats_l!=null&&(s.ats_w+s.ats_l)>0?(s.ats_w/(s.ats_w+s.ats_l)*100).toFixed(0)+'%':'';
  var atsColor=s.ats_w!=null&&s.ats_l!=null&&s.ats_w>s.ats_l?'#38bdf8':'#f97316';
  document.getElementById('team-stats-card').innerHTML=
    '<div class="card"><div class="card-header"><span class="book">'+name.toUpperCase()+'</span><span class="time">2025-26 Season</span></div>'
    +'<div class="card-body">'
    +'<div style="display:flex;gap:8px;margin-bottom:12px">'
    +statPill('PPG',s.ppg.toFixed(1),'#60a5fa')
    +statPill('ORTG',s.ortg.toFixed(1),'#38bdf8')
    +statPill('DRTG',s.drtg.toFixed(1),'#c084fc')
    +statPill('NET',(Number(netRtg)>0?'+':'')+netRtg,netColor)
    +'</div>'
    +'<div style="font-size:9px;color:#f59e0b;letter-spacing:2px;margin-bottom:8px">FOUR FACTORS</div>'
    +factorRow('Eff. FG%',s.efg.toFixed(1)+'%','Higher = better shooting efficiency')
    +factorRow('Turnover Rate',s.tov.toFixed(1)+'%','Lower = fewer turnovers')
    +factorRow('Off. Reb. Rate',s.orb.toFixed(1)+'%','Higher = more second chances')
    +factorRow('FT Rate',s.ftr.toFixed(1)+'%','Higher = gets to the line more')
    +factorRow('Pace',s.pace.toFixed(1),'Possessions per 40 min')
    +'<div style="font-size:9px;color:#f59e0b;letter-spacing:2px;margin-top:12px;margin-bottom:8px">BETTING FACTORS</div>'
    +'<div style="display:flex;gap:8px;margin-bottom:4px">'
    +'<div style="flex:1;background:#080c17;border-radius:8px;padding:9px 7px;text-align:center"><div style="font-size:8px;color:#7a8fa6;margin-bottom:3px">EXPERIENCE</div><div style="font-size:14px;font-weight:700;color:'+expColor+'">'+expLabel+'</div><div style="font-size:9px;color:#556677">'+s.exp.toFixed(1)+'/4.0</div></div>'
    +'<div style="flex:1;background:#080c17;border-radius:8px;padding:9px 7px;text-align:center"><div style="font-size:8px;color:#7a8fa6;margin-bottom:3px">3PT RATE</div><div style="font-size:14px;font-weight:700;color:'+tprColor+'">'+tprLabel+'</div><div style="font-size:9px;color:#556677">'+(s.tpr>=40?'high variance':s.tpr>=35?'moderate':'low variance')+'</div></div>'
    +'<div style="flex:1;background:#080c17;border-radius:8px;padding:9px 7px;text-align:center"><div style="font-size:8px;color:#7a8fa6;margin-bottom:3px">ATS RECORD</div><div style="font-size:14px;font-weight:700;color:'+atsColor+'">'+atsLabel+'</div><div style="font-size:9px;color:#556677">'+atsPct+'</div></div>'
    +'</div>'
    +'</div></div>';
}
function statPill(label,val,color){
  return '<div style="flex:1;background:#080c17;border-radius:8px;padding:8px 4px;text-align:center">'
    +'<div style="font-size:8px;color:#7a8fa6;letter-spacing:1px;margin-bottom:2px">'+label+'</div>'
    +'<div style="font-size:14px;font-weight:700;color:'+color+'">'+val+'</div></div>';
}
function factorRow(label,val,desc){
  return '<div class="stat-row"><div><div class="stat-name">'+label+'</div><div style="font-size:9px;color:#64748b;margin-top:2px">'+desc+'</div></div><div class="stat-val-box">'+val+'</div></div>';
}

// ============================================================
// MATCHUP ANALYZER
// ============================================================
function searchMatchupTeam(num,val){
  var res=document.getElementById('matchup-results'+num);
  if(val.length<2){res.innerHTML='';return;}
  var matches=getAllTeamNames().filter(function(n){return n.toLowerCase().indexOf(val.toLowerCase())>-1;}).slice(0,15);
  res.innerHTML='<div class="search-dropdown">'+matches.map(function(n){return'<div class="search-item" onclick="selectMatchupTeam('+num+',\''+escQ(n)+'\')">'+n+'</div>';}).join('')+'</div>';
}
function selectMatchupTeam(num,name){
  if(num===1){matchupTeam1=name;document.getElementById('matchup-team1').value=name;document.getElementById('odds-label1').textContent=name.split(' ').pop()+' ML';}
  else{matchupTeam2=name;document.getElementById('matchup-team2').value=name;document.getElementById('odds-label2').textContent=name.split(' ').pop()+' ML';}
  document.getElementById('matchup-results'+num).innerHTML='';
}
function runMatchup(){
  var t1=document.getElementById('matchup-team1').value.trim();
  var t2=document.getElementById('matchup-team2').value.trim();
  if(t1){var f1=getAllTeamNames().find(function(n){return n.toLowerCase()===t1.toLowerCase();});matchupTeam1=f1||t1;}
  if(t2){var f2=getAllTeamNames().find(function(n){return n.toLowerCase()===t2.toLowerCase();});matchupTeam2=f2||t2;}
  if(!matchupTeam1||!matchupTeam2){alert('Please enter both team names.');return;}
  var s1=getTeamStats(matchupTeam1),s2=getTeamStats(matchupTeam2);
  if(!s1||!s2){alert('Stats not found for one or both teams.');return;}
  var odds1=parseInt(document.getElementById('matchup-odds1').value)||null;
  var odds2=parseInt(document.getElementById('matchup-odds2').value)||null;
  var net1=s1.ortg-s1.drtg,net2=s2.ortg-s2.drtg;
  var netDiff=net1-net2;
  var winProb1=Math.min(Math.max(50+netDiff*3,5),95);
  var winProb2=100-winProb1;
  var statFav=winProb1>=winProb2?matchupTeam1:matchupTeam2;
  var statFavProb=Math.max(winProb1,winProb2).toFixed(0);

  var metrics=[
    {label:'PPG',key:'ppg',t1:s1.ppg,t2:s2.ppg,higherBetter:true,desc:'Points scored per game'},
    {label:'OFF RATING',key:'ortg',t1:s1.ortg,t2:s2.ortg,higherBetter:true,desc:'Points per 100 possessions'},
    {label:'DEF RATING',key:'drtg',t1:s1.drtg,t2:s2.drtg,higherBetter:false,desc:'Points allowed per 100'},
    {label:'NET RATING',key:'net',t1:net1,t2:net2,higherBetter:true,desc:'Off minus Def rating'},
    {label:'EFF FG%',key:'efg',t1:s1.efg,t2:s2.efg,higherBetter:true,desc:'Shooting efficiency'},
    {label:'TURNOVER RATE',key:'tov',t1:s1.tov,t2:s2.tov,higherBetter:false,desc:'Lower = takes care of ball'},
    {label:'OFF REB RATE',key:'orb',t1:s1.orb,t2:s2.orb,higherBetter:true,desc:'Second chance opportunities'},
    {label:'FT RATE',key:'ftr',t1:s1.ftr,t2:s2.ftr,higherBetter:true,desc:'Free throw attempts per FGA'},
    {label:'PACE',key:'pace',t1:s1.pace,t2:s2.pace,higherBetter:true,desc:'Possessions per 40 min'},
    {label:'EXPERIENCE',key:'exp',t1:s1.exp||0,t2:s2.exp||0,higherBetter:true,desc:'Roster continuity (0-4)'},
    {label:'3PT RATE',key:'tpr',t1:s1.tpr||35,t2:s2.tpr||35,higherBetter:false,desc:'High 3pt rate = more variance'},
  ];
  var t1Edge=0,t2Edge=0;
  metrics.forEach(function(m){var t1B=m.higherBetter?m.t1>m.t2:m.t1<m.t2;if(t1B)t1Edge++;else t2Edge++;});

  var valueHTML='';
  if(odds1&&odds2){
    var ip1=1/aToDec(odds1)*100,ip2=1/aToDec(odds2)*100;
    var v1=winProb1-ip1,v2=winProb2-ip2;
    var vpick=v1>v2?matchupTeam1:matchupTeam2;
    var vedge=Math.max(v1,v2).toFixed(1);
    var vodds=v1>v2?fmt(odds1):fmt(odds2);
    var hasValue=Math.abs(v1)>3||Math.abs(v2)>3;
    valueHTML='<div style="background:'+(hasValue?'rgba(56,189,248,0.08)':'rgba(245,158,11,0.08)')+';border:1px solid '+(hasValue?'#38bdf8':'#f59e0b')+';border-radius:10px;padding:12px;margin-top:10px">'
      +'<div style="font-size:9px;color:'+(hasValue?'#38bdf8':'#f59e0b')+';letter-spacing:2px;margin-bottom:8px">VALUE ANALYSIS</div>'
      +'<div style="font-size:11px;color:#a0b4c8;margin-bottom:4px">'+matchupTeam1+' stats: <strong style="color:#fff">'+winProb1.toFixed(0)+'%</strong> &middot; Market: <strong>'+ip1.toFixed(0)+'%</strong></div>'
      +'<div style="font-size:11px;color:#a0b4c8;margin-bottom:8px">'+matchupTeam2+' stats: <strong style="color:#fff">'+winProb2.toFixed(0)+'%</strong> &middot; Market: <strong>'+ip2.toFixed(0)+'%</strong></div>'
      +(hasValue?'<div style="font-size:13px;font-weight:700;color:#38bdf8">&#x26A1; VALUE: '+vpick+' '+vodds+' (+'+vedge+'% edge)</div>':'<div style="font-size:12px;color:#a0b4c8">No significant value - odds match stats.</div>')
      +'</div>';
  }

  // ATS summary box
  var atsHTML='';
  if((s1.ats_w!=null&&s1.ats_l!=null)||(s2.ats_w!=null&&s2.ats_l!=null)){
    var a1=s1.ats_w!=null?s1.ats_w+'-'+s1.ats_l:'--';
    var a2=s2.ats_w!=null?s2.ats_w+'-'+s2.ats_l:'--';
    var p1=s1.ats_w!=null&&(s1.ats_w+s1.ats_l)>0?(s1.ats_w/(s1.ats_w+s1.ats_l)*100).toFixed(0)+'%':'';
    var p2=s2.ats_w!=null&&(s2.ats_w+s2.ats_l)>0?(s2.ats_w/(s2.ats_w+s2.ats_l)*100).toFixed(0)+'%':'';
    atsHTML='<div style="background:#080c17;border-radius:10px;padding:10px;margin-top:10px;display:flex;gap:10px">'
      +'<div style="flex:1;text-align:center"><div style="font-size:9px;color:#7a8fa6;margin-bottom:4px">'+matchupTeam1.split(' ').pop().toUpperCase()+' ATS</div><div style="font-size:14px;font-weight:700;color:'+(s1.ats_w>s1.ats_l?'#38bdf8':'#f97316')+'">'+a1+'</div><div style="font-size:10px;color:#556677">'+p1+'</div></div>'
      +'<div style="flex:1;text-align:center"><div style="font-size:9px;color:#7a8fa6;margin-bottom:4px">'+matchupTeam2.split(' ').pop().toUpperCase()+' ATS</div><div style="font-size:14px;font-weight:700;color:'+(s2.ats_w>s2.ats_l?'#38bdf8':'#f97316')+'">'+a2+'</div><div style="font-size:10px;color:#556677">'+p2+'</div></div>'
      +'</div>';
  }

  var html='<div class="card">'
    +'<div class="card-header"><span class="book">MATCHUP</span><span class="time">'+matchupTeam1+' vs '+matchupTeam2+'</span></div>'
    +'<div class="card-body">'
    +'<div style="display:grid;grid-template-columns:1fr 80px 1fr;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #151f2e">'
    +'<div style="font-size:14px;font-weight:700;color:#fff">'+matchupTeam1+'</div>'
    +'<div style="font-size:9px;color:#8aa0b8;text-align:center;padding-top:4px">STAT</div>'
    +'<div style="font-size:14px;font-weight:700;color:#fff;text-align:right">'+matchupTeam2+'</div>'
    +'</div>'
    +metrics.map(function(m){
      var t1B=m.higherBetter?m.t1>m.t2:m.t1<m.t2;
      var v1=m.key==='net'?(m.t1>=0?'+':'')+m.t1.toFixed(1):m.t1.toFixed(1)+(m.key==='efg'||m.key==='tov'||m.key==='orb'||m.key==='tpr'?'%':'');
      var v2=m.key==='net'?(m.t2>=0?'+':'')+m.t2.toFixed(1):m.t2.toFixed(1)+(m.key==='efg'||m.key==='tov'||m.key==='orb'||m.key==='tpr'?'%':'');
      return '<div style="display:grid;grid-template-columns:1fr 80px 1fr;gap:6px;padding:7px 0;border-bottom:1px solid #151f2e;align-items:center">'
        +'<div style="font-size:13px;font-weight:700;color:'+(t1B?'#38bdf8':'#a0b4c8')+'">'+v1+(t1B?' &#10003;':'')+'</div>'
        +'<div style="text-align:center"><div style="font-size:8px;color:#7a8fa6;letter-spacing:0.5px">'+m.label+'</div><div style="font-size:9px;color:#64748b;margin-top:1px">'+m.desc+'</div></div>'
        +'<div style="font-size:13px;font-weight:700;color:'+(!t1B?'#38bdf8':'#a0b4c8')+';text-align:right">'+(!t1B?'&#10003; ':'')+v2+'</div>'
        +'</div>';
    }).join('')
    +'<div style="margin-top:12px;padding:12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px">'
    +'<div style="font-size:9px;color:#f59e0b;letter-spacing:2px;margin-bottom:8px">STATISTICAL EDGE</div>'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;color:#fff">'+matchupTeam1+'</span><span style="font-size:13px;font-weight:700;color:'+(t1Edge>=t2Edge?'#38bdf8':'#a0b4c8')+'">'+t1Edge+'/'+metrics.length+' metrics</span></div>'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:10px"><span style="font-size:13px;color:#fff">'+matchupTeam2+'</span><span style="font-size:13px;font-weight:700;color:'+(t2Edge>t1Edge?'#38bdf8':'#a0b4c8')+'">'+t2Edge+'/'+metrics.length+' metrics</span></div>'
    +'<div style="font-size:12px;color:#a0b4c8;margin-bottom:4px">Projected win prob (Net Rating):</div>'
    +'<div style="font-size:15px;font-weight:700;color:#38bdf8">'+statFav+' '+statFavProb+'%</div>'
    +'</div>'
    +atsHTML+valueHTML
    +'</div></div>';
  document.getElementById('matchup-result').innerHTML=html;
}

// ============================================================
// EDIT TEAM / BULK IMPORT
// ============================================================
function toggleEditPanel(){
  editPanelOpen=!editPanelOpen;
  document.getElementById('edit-panel').style.display=editPanelOpen?'block':'none';
}
function searchEditTeam(val){
  var res=document.getElementById('edit-results');
  if(val.length<2){res.innerHTML='';return;}
  var matches=getAllTeamNames().filter(function(n){return n.toLowerCase().indexOf(val.toLowerCase())>-1;}).slice(0,15);
  res.innerHTML='<div class="search-dropdown">'+matches.map(function(n){return'<div class="search-item" onclick="showEditForm(\''+escQ(n)+'\')">'+n+'</div>';}).join('')+'</div>';
}
function showEditForm(name){
  document.getElementById('edit-search').value=name;
  document.getElementById('edit-results').innerHTML='';
  var s=getTeamStats(name)||{ppg:0,ortg:0,drtg:0,efg:0,tov:0,orb:0,ftr:0,pace:0,exp:0,tpr:35,ats_w:null,ats_l:null};
  var fields=[['ppg','PPG'],['ortg','Off Rating'],['drtg','Def Rating'],['efg','eFG%'],['tov','TOV%'],['orb','OReb%'],['ftr','FT Rate'],['pace','Pace'],['exp','Experience'],['tpr','3PT Rate']];
  document.getElementById('edit-form').innerHTML=
    '<div style="background:#111825;border:1px solid #1a2a3a;border-radius:12px;padding:14px;margin-top:8px">'
    +'<div style="font-size:10px;color:#f59e0b;letter-spacing:2px;margin-bottom:12px">EDITING: '+name.toUpperCase()+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
    +fields.map(function(f){return'<div><label style="font-size:9px;color:#8aa0b8;display:block;margin-bottom:4px;letter-spacing:1px">'+f[1]+'</label><input id="edit-'+f[0]+'" type="number" step="0.1" value="'+(s[f[0]]||0)+'" style="width:100%;background:#080c17;border:1px solid #1e2e40;border-radius:6px;color:#fff;padding:7px 8px;font-size:13px;font-family:inherit"/></div>';}).join('')
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-bottom:12px">'
    +'<div style="flex:1"><label style="font-size:9px;color:#8aa0b8;display:block;margin-bottom:4px">ATS WINS</label><input id="edit-ats_w" type="number" value="'+(s.ats_w||'')+'" placeholder="--" style="width:100%;background:#080c17;border:1px solid #1e2e40;border-radius:6px;color:#fff;padding:7px 8px;font-size:13px;font-family:inherit"/></div>'
    +'<div style="flex:1"><label style="font-size:9px;color:#8aa0b8;display:block;margin-bottom:4px">ATS LOSSES</label><input id="edit-ats_l" type="number" value="'+(s.ats_l||'')+'" placeholder="--" style="width:100%;background:#080c17;border:1px solid #1e2e40;border-radius:6px;color:#fff;padding:7px 8px;font-size:13px;font-family:inherit"/></div>'
    +'</div>'
    +'<button onclick="saveEditForm(\''+escQ(name)+'\')" style="width:100%;padding:10px;background:#f59e0b;border:none;border-radius:8px;color:#080c17;font-size:13px;font-weight:700;font-family:inherit">SAVE STATS</button>'
    +'<button onclick="resetTeamStats(\''+escQ(name)+'\')" style="width:100%;padding:8px;background:transparent;border:1px solid #2a3a4a;border-radius:8px;color:#667788;font-size:11px;margin-top:6px;font-family:inherit">Reset to Default</button>'
    +'</div>';
}
function saveEditForm(name){
  var fields=['ppg','ortg','drtg','efg','tov','orb','ftr','pace','exp','tpr'];
  var updated={};
  fields.forEach(function(f){updated[f]=parseFloat(document.getElementById('edit-'+f).value)||0;});
  var aw=document.getElementById('edit-ats_w').value;
  var al=document.getElementById('edit-ats_l').value;
  updated.ats_w=aw!==''?parseInt(aw):null;
  updated.ats_l=al!==''?parseInt(al):null;
  teamStats[name]=updated;
  saveTeamStats();
  document.getElementById('edit-form').innerHTML='<div style="color:#38bdf8;padding:10px;font-size:13px">&#10003; Stats saved for '+name+'</div>';
}
function resetTeamStats(name){
  delete teamStats[name];
  saveTeamStats();
  document.getElementById('edit-form').innerHTML='<div style="color:#f59e0b;padding:10px;font-size:13px">&#10003; Reset to default for '+name+'</div>';
}
function toggleBulkImport(){
  var p=document.getElementById('bulk-import-panel');
  p.style.display=p.style.display==='none'?'block':'none';
}
function quickAddTeam(){
  var name=document.getElementById('bulk-name').value.trim();
  var ortg=parseFloat(document.getElementById('bulk-ortg').value)||0;
  var drtg=parseFloat(document.getElementById('bulk-drtg').value)||0;
  var tempo=parseFloat(document.getElementById('bulk-tempo').value)||0;
  if(!name||!ortg||!drtg){alert('Please enter team name, OrtG and DrtG at minimum.');return;}
  var result=importSingleTeam(name,ortg,drtg,tempo||69.0,null,null,null,null);
  document.getElementById('bulk-import-result').innerHTML='<div style="color:#38bdf8;padding:8px;font-size:12px">&#10003; '+result+'</div>';
  document.getElementById('bulk-name').value='';
  document.getElementById('bulk-ortg').value='';
  document.getElementById('bulk-drtg').value='';
  document.getElementById('bulk-tempo').value='';
}
function importSingleTeam(name,ortg,drtg,tempo,exp,ats_w,ats_l,tpr){
  var ppg=Math.round((ortg/100)*tempo*0.93*10)/10;
  var efg=Math.round((ortg/2.2)*10)/10;
  var tov=Math.round((ortg<110?16.0:ortg<115?14.5:13.5)*10)/10;
  var orb=Math.round((drtg<98?33.0:drtg<102?30.5:28.5)*10)/10;
  var ftr=Math.round((ortg/3.4)*10)/10;
  teamStats[name]={
    ppg:ppg,ortg:ortg,drtg:drtg,efg:efg,tov:tov,orb:orb,ftr:ftr,pace:tempo,
    exp:exp!=null?exp:2.0,
    tpr:tpr!=null?tpr:35,
    ats_w:ats_w!=null?ats_w:null,
    ats_l:ats_l!=null?ats_l:null
  };
  saveTeamStats();
  return name+' added (ORtg:'+ortg+' DRtg:'+drtg+' Pace:'+tempo+')';
}
function parseBulkImport(){
  var raw=document.getElementById('bulk-paste-area').value.trim();
  if(!raw){alert('Please paste some team data first.');return;}
  var lines=raw.split('\n').map(function(l){return l.trim();}).filter(Boolean);
  var imported=[],errors=[];
  lines.forEach(function(line){
    var parts=line.split(/[\t,]+/).map(function(p){return p.trim();});
    if(parts.length<3){errors.push(line);return;}
    var name=parts[0];
    var ortg=parseFloat(parts[1]);
    var drtg=parseFloat(parts[2]);
    var tempo=parseFloat(parts[3])||69.0;
    var exp=parts[4]!=null&&parts[4]!==''?parseFloat(parts[4]):null;
    var ats_w=parts[5]!=null&&parts[5]!==''?parseInt(parts[5]):null;
    var ats_l=parts[6]!=null&&parts[6]!==''?parseInt(parts[6]):null;
    var tpr=parts[7]!=null&&parts[7]!==''?parseFloat(parts[7]):null;
    if(!name||isNaN(ortg)||isNaN(drtg)){errors.push(line);return;}
    importSingleTeam(name,ortg,drtg,tempo,exp,ats_w,ats_l,tpr);
    imported.push(name);
  });
  var html='';
  if(imported.length) html+='<div style="background:#0a1a0a;border:1px solid #38bdf833;border-radius:8px;padding:10px;margin-bottom:8px"><div style="font-size:10px;color:#38bdf8;letter-spacing:1px;margin-bottom:6px">&#10003; IMPORTED '+imported.length+' TEAMS</div><div style="font-size:11px;color:#7a8fa6;line-height:1.8">'+imported.join(', ')+'</div></div>';
  if(errors.length) html+='<div style="background:#1a0a0a;border:1px solid #f9731633;border-radius:8px;padding:10px"><div style="font-size:10px;color:#f97316;letter-spacing:1px;margin-bottom:6px">&#x26A0; COULD NOT PARSE '+errors.length+' LINE'+(errors.length>1?'S':'')+'</div><div style="font-size:11px;color:#7a8fa6">'+errors.join('<br/>')+'</div><div style="font-size:10px;color:#445566;margin-top:4px">Format: Team, OrtG, DrtG, Tempo, Exp, ATS_W, ATS_L, 3PR</div></div>';
  document.getElementById('bulk-import-result').innerHTML=html;
  if(imported.length) document.getElementById('bulk-paste-area').value='';
}
function clearBulkCustomStats(){
  if(!confirm('Reset ALL custom stats to defaults?')) return;
  localStorage.removeItem('teamStatsCustom');
  teamStats={};
  document.getElementById('bulk-import-result').innerHTML='<div style="color:#f97316;padding:8px;font-size:12px">&#10003; All custom stats cleared.</div>';
}

// ============================================================
// REFRESH ALL
// ============================================================
