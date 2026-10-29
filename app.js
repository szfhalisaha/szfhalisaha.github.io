/* SZF Airport Halı Saha — Supabase bağlantılı istemci */
(() => {
'use strict';
const C = window.SZF_CONFIG || {};
const configured = Boolean(C.supabaseUrl && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(C.supabaseUrl) && C.supabasePublishableKey && !C.supabasePublishableKey.startsWith('BURAYA_'));
let openMatchRosters=new Set(), manualRed=new Set(), leagueMatches=[], leagueWallet=null, leagueBets=[], leagueStandings=[], weeklyPlayers=[], matchDeclines=[], assessments=[], teamMode='auto', adminInfo=false, canDeleteMatch=false, weeklyIndex=0, selectedStakes=100, currentResult='red';
let extras={guests:[],waitlist:[],events:[],mvp:[]}, extraReady=true;
let mvpStates={}, mvpEnabled=false;
let playerSort='rating_desc', rankingSort='rating_desc', rosterPickerMatch=null, rosterSearch='';
let assessmentFlash=null;
let v70Ready=false;
let publicProfiles = [], db = null, user = null, profile = null, cards = [], myVotes = [], view = 'home', search = '', selectedPlayer = null, signup = false, teamSelections = new Set(), teamData = null, loading = false;
const demoCards = [
  {id:'d1',display_name:'ÖRNEK FORVET',position:'FOR',overall_rating:68,hiz:76,sut:74,pas:64,dripling:70,defans:57,dayaniklilik:67,voter_count:9},
  {id:'d2',display_name:'ÖRNEK ORTA SAHA',position:'ORT',overall_rating:65,hiz:64,sut:60,pas:73,dripling:68,defans:62,dayaniklilik:63,voter_count:6},
  {id:'d3',display_name:'ÖRNEK DEFANS',position:'DEF',overall_rating:62,hiz:59,sut:52,pas:63,dripling:57,defans:75,dayaniklilik:66,voter_count:4},
  {id:'d4',display_name:'ÖRNEK KALECİ',position:'KL',overall_rating:60,hiz:60,sut:60,pas:60,dripling:60,defans:60,dayaniklilik:60,voter_count:0}
];
const $ = (id)=>document.getElementById(id);
// Turkish-aware title casing for every name, including existing records.
function formatPersonName(value){
 return String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR')
  .replace(/(^|[\s'-])([a-zçğıöşü])/giu,(_,sep,letter)=>sep+letter.toLocaleUpperCase('tr-TR'));
}
const esc = (s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attrs = (s)=>esc(s);
const features = [ ['hiz','HIZ','Hız'], ['sut','ŞUT','Şut'], ['pas','PAS','Pas'], ['dripling','DRİ','Dripling'], ['defans','DEF','Defans'], ['dayaniklilik','KON','Kondisyon'] ];
const keeperFeatures=[['gk_diving','ATL','Atlama'],['gk_handling','KON','Top kontrolü'],['gk_kicking','VUR','Vuruş'],['gk_reflexes','REF','Refleks'],['gk_speed','HIZ','Hız'],['gk_positioning','POZ','Pozisyon']];
const getFeatures=c=>c.position==='KL'?keeperFeatures:features;
const ability=(c,k)=>Number(c[k]??({gk_diving:c.defans,gk_handling:c.dayaniklilik,gk_kicking:c.pas,gk_reflexes:c.hiz,gk_speed:c.hiz,gk_positioning:c.defans}[k])??60);
const score=(c)=>{const f=getFeatures(c);return Math.round(f.reduce((s,[k])=>s+ability(c,k),0)/6)};
const publicRating=c=>configured && !c.is_guest && (!v70Ready || Number(c.v70_count||0)<10)?'?':Number(c.overall_rating||score(c));
const publicAbility=(c,k)=>configured && !c.is_guest && (!v70Ready || Number(c.v70_count||0)<10)?'?':ability(c,k);
const rankTier=c=>{if(configured&&!c.is_guest&&(!v70Ready||Number(c.v70_count||0)<10))return 'bronze';const n=Number(c.overall_rating||score(c));return n>=85?'icon':n>=75?'gold':n>=65?'silver':'bronze'};
const posName = {KL:'Kaleci',DEF:'Defans',ORT:'Orta saha',FOR:'Forvet'};
const roleQuota = {KL:1,DEF:3,ORT:2,FOR:1};
const toast=(message,error=false)=>{const x=$('toast');if(!x)return;clearTimeout(toast.timer);x.textContent=message;x.className='show'+(error?' error':'');toast.timer=setTimeout(()=>{x.className='';x.textContent='';},3000)};
const avatarUrl=(path)=>path&&db?db.storage.from('avatars').getPublicUrl(path).data.publicUrl:null;
const isDemo=()=>!configured || !user;
const currentCards=()=>configured?(user?cards:[]):demoCards;
// player_cards view contains distinct voter count, not the individual number of votes.
function myStatsFromCards(){return cards.reduce((n,c)=>n+Number(c.voter_count||0),0)+' kişi';}
function displayMode(){
 const badge=$('badgeMode');badge.textContent=!configured?'ÖNİZLEME':'CANLI';badge.classList.toggle('hidden',!!user);
 const profileBtn=$('topProfileBtn');profileBtn.classList.toggle('hidden',!user);
 $('topCreditBalance').classList.toggle('hidden',!user);
 $('topCreditAmount').textContent=leagueWallet && Number.isFinite(Number(leagueWallet.balance)) ? Number(leagueWallet.balance).toLocaleString('tr-TR') : '—';
 if(user){
   const displayName=formatPersonName(profile?.display_name) || user.email?.split('@')[0] || 'Hesabım';
   $('topProfileName').textContent=displayName;
   const avatar=$('topProfileAvatar');avatar.replaceChildren();
   const url=profile?.avatar_path?avatarUrl(profile.avatar_path):null;
   if(url){const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';avatar.appendChild(img)}
   else{avatar.textContent=displayName.trim().charAt(0).toLocaleUpperCase('tr')||'👤'}
 }

 $('topAuthBtn').textContent=user?'Çıkış yap':'Giriş yap';
 $('configAlert').classList.toggle('hidden',configured);
 if(!configured){$('configAlert').innerHTML='⚙️ <strong>Kurulum gerekli:</strong> Bu bir önizleme. Gerçek hesap ve oy sistemini açmak için <code>config.js</code> dosyasına Supabase <strong>publishable/anon</strong> anahtarını ekle. Gizli <code>service_role</code> anahtarını asla kullanma.';}
}
function cardHTML(c){
 const f=getFeatures(c),photo=publicProfiles.find(p=>p.id===c.id)?.avatar_path;
 const initials=String(c.display_name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase('tr');
 const values=f.map(([k,l])=>`<div class="fut-attr"><span>${l}</span><b>${publicAbility(c,k)}</b></div>`).join('');
 return `<button type="button" class="card-face fut-card tier-${rankTier(c)}" data-player="${attrs(c.id)}" aria-label="${attrs(formatPersonName(c.display_name))} oyuncu kartı">
 <div class="fut-head"><div class="fut-overall">${publicRating(c)}</div><div class="fut-pos">${esc(c.position==='ORT'?'OS':c.position)}</div></div>
 <div class="fut-photo">${photo?`<img src="${attrs(avatarUrl(photo))}" alt="" loading="lazy">`:`<span>${esc(initials)}</span>`}</div>
 <div class="fut-name">${esc(formatPersonName(c.display_name))}</div><div class="fut-stats">${values}</div><div class="fut-emblems"><img class="fut-flag-img" src="turkiye-bayragi.svg" alt="Türkiye"></div></button>`;
}
function getAvatarInitials(name){
 const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
 if(!parts.length)return '?';
 const first=(parts[0]||'').charAt(0);
 const last=parts.length>1?(parts[parts.length-1]||'').charAt(0):(parts[0]||'').slice(1,2);
 return `${first}${last}`.trim().toLocaleUpperCase('tr')||'?';
}
function assessmentVoteFor(targetId,category){
 return myVotes.find(v=>String(v.target_id)===String(targetId)&&v.category===category) || null;
}
function assessmentDeltaHTML(delta){
 if(delta===null||delta===undefined)return '';
 const n=Number(delta)||0;
 const cls=n>0?'pos':n<0?'neg':'neu';
 const label=n>0?`+${n}`:String(n);
 return `<em class="assessment-delta ${cls}">${label}</em>`;
}
function assessmentCardHTML(c){
 const f=getFeatures(c),photo=publicProfiles.find(p=>p.id===c.id)?.avatar_path;
 const initials=String(c.display_name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase('tr');
 const values=f.map(([k,l])=>{
  const vote=null,delta=null;
  const flash=assessmentFlash?.target===String(c.id)&&assessmentFlash?.category===k?assessmentFlash:null;
  return `<div class="fut-attr assessment-fut-attr ${delta>0?'boosted':delta<0?'reduced':delta===0?'neutral':''} ${flash?'assessment-flash '+flash.tone:''}"><span>${l}</span><div class="assessment-fut-stat"><b>${publicAbility(c,k)}</b>${assessmentDeltaHTML(delta)}</div></div>`;
 }).join('');
 return `<div class="assessment-card-box"><div class="card-face fut-card assessment-static-card tier-${rankTier(c)}">
 <div class="fut-head"><div class="fut-overall">${publicRating(c)}</div><div class="fut-pos">${esc(c.position==='ORT'?'OS':c.position)}</div></div>
 <div class="fut-photo">${photo?`<img src="${attrs(avatarUrl(photo))}" alt="" loading="lazy">`:`<span>${esc(initials)}</span>`}</div>
 <div class="fut-name">${esc(formatPersonName(c.display_name))}</div><div class="fut-stats assessment-fut-stats">${values}</div><div class="fut-emblems"><img class="fut-flag-img" src="turkiye-bayragi.svg" alt="Türkiye"></div></div></div>`;
}
function optimisticVotePatch(target,category,newDelta){
 const existing=myVotes.find(v=>String(v.target_id)===String(target)&&v.category===category);
 const oldDelta=existing?Number(existing.delta)||0:0;
 if(existing)existing.delta=newDelta;
 else myVotes.push({id:`temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,voter_id:user?.id,target_id:target,category,delta:newDelta});
 if(oldDelta===newDelta)return;
 cards=cards.map(c=>{
  if(String(c.id)!==String(target))return c;
  const clone={...c};
  clone[category]=Math.max(1,Math.min(99,ability(c,category)+(newDelta-oldDelta)));
  clone.overall_rating=score(clone);
  return clone;
 });
}
function sectionHead(title,desc,right=''){return `<div class="section-head"><div><h2>${title}</h2><p>${desc}</p></div>${right}</div>`}
function sortPlayerCards(list){
 const k=playerSort;
 const order={KL:0,DEF:1,ORT:2,FOR:3};
 return [...list].sort((a,b)=>k==='name_asc'
  ?String(a.display_name).localeCompare(String(b.display_name),'tr')
  :(k==='position'
    ? (((order[a.position]??99)-(order[b.position]??99)) || Number(b.overall_rating||0)-Number(a.overall_rating||0) || String(a.display_name).localeCompare(String(b.display_name),'tr'))
    : ((k==='rating_desc'?Number(b.overall_rating||0)-Number(a.overall_rating||0):ability(b,k)-ability(a,k))||String(a.display_name).localeCompare(String(b.display_name),'tr'))));
}
function renderHome(){
 const playerCount=currentCards().length;
 const future=leagueMatches.filter(m=>m.status!=='completed'&&m.status!=='cancelled').sort((a,b)=>new Date(a.match_date)-new Date(b.match_date));
 const next=future[0];
 return `<section class="home-landing"><div class="home-welcome"><div class="welcome-copy"><small>SZF AIRPORT HALI SAHA</small><h1>Sahamıza hoş geldin!</h1><p>Maçlarını takip et, oyuncu kartlarını incele ve takımını kur.</p></div>
<div class="szf-kick-scene" role="img" aria-label="Futbolcu siyah beyaz topa vuruyor, top yeşil bir uçağa dönüşüp sağa uçuyor ve hareket tekrarlanıyor.">
<svg class="szf-scene-svg" viewBox="0 0 630 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
 <linearGradient id="szf-air" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dbffbf"/><stop offset="1" stop-color="#9cf456"/></linearGradient>
</defs>
<path d="M8 218 H620" stroke="#a7f15b" stroke-width="2" opacity=".18"/>
<path d="M20 228 H610" stroke="#a7f15b" stroke-width="1" opacity=".09"/>
<g class="szf-player" fill="none" stroke="#e6ffdb" stroke-linecap="round" stroke-linejoin="round">
 <!-- Orantılı futbolcu: kısa gövde, anatomik dirsek/diz ve dengeli adım -->
 <circle cx="79" cy="63" r="15" fill="#e6ffdb" stroke="none"/>
 <path d="M80 83 L87 111 L97 145" stroke-width="11"/>
 <path d="M85 99 L115 116 L134 97" stroke-width="8"/>
 <path d="M85 99 L61 121 L48 138" stroke-width="8"/>
 <path d="M97 145 L76 181 L53 208" stroke-width="10"/>
 <path d="M53 208 L45 214" stroke-width="8"/>
 <g class="szf-kicking-leg"><path d="M97 145 L130 172 L155 204" stroke-width="10"/><path d="M155 204 L170 207" stroke-width="8"/></g>
</g>
<g class="szf-transit-ball">
 <circle r="21" fill="#f4fff0" stroke="#0a1c13" stroke-width="1.5"/>
 <path d="M0-12L12-4L8 10H-8L-12-4Z" fill="#0b1f15"/>
 <path d="M0-21L0-12M19-8L12-4M12 17L8 10M-12 17L-8 10M-19-8L-12-4" stroke="#0b1f15" stroke-width="3.5"/>
 </g>
<g class="szf-transit-plane" aria-hidden="true">
 <!-- Üstten görünüş, burnu sağa bakan belirgin uçak silueti -->
 <path d="M-79 -6 L-57 -9 L-66 -36 L-50 -36 L-22 -12 L10 -11 L-8 -60 L11 -60 L39 -11 L68 -9 Q87 -7 91 0 Q87 7 68 9 L39 11 L11 60 L-8 60 L10 11 L-22 12 L-50 36 L-66 36 L-57 9 L-79 6 Z" fill="url(#szf-air)" stroke="#e4ffd6" stroke-width="2.5" stroke-linejoin="round"/>
 <path d="M-70 0 H72" stroke="#4c9244" stroke-width="2" opacity=".5"/>
 </g>
</svg></div></div>
 ${next?`<div class="home-next"><small>SIRADAKİ MAÇ</small><h2>${esc(next.title||'Haftalık Maç')}</h2><p>${new Date(next.match_date).toLocaleString('tr-TR',{dateStyle:'full',timeStyle:'short'})}</p><button type="button" class="btn lime" data-home-nav="matches">Maçlara git →</button></div>`:''}
 <h2 class="home-shortcuts-title">Hızlı erişim</h2><div class="home-shortcuts"><button data-home-nav="players">◈ <strong>Oyuncu Kartları</strong><span>Tüm oyuncuları gör</span></button><button data-home-nav="matches">⚽ <strong>Maçlar</strong><span>Katıl veya oyuncu ekle</span></button><button data-home-nav="teams">⚑ <strong>Takım Kur</strong><span>7'ye 7 takımları hazırla</span></button><button data-home-nav="ranking">▥ <strong>Sıralama</strong><span>Oyuncu puanlarını incele</span></button></div>
 <div class="home-summary" aria-label="Genel sayılar"><div><small>OYUNCU KARTLARI</small><strong>${playerCount}</strong><span>Kayıtlı oyuncu</span></div><div><small>MAÇLAR</small><strong>${leagueMatches.length}</strong><span>Toplam maç</span></div></div></section>`;
}
function renderPlayers(){
 const arr=sortPlayerCards(currentCards().filter(c=>c.display_name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')) || (posName[c.position]||'').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))));
 return sectionHead('Oyuncu kartları','EA FC tarzı kartlar · Bronz / Gümüş / Altın / ICON',`<div class="control-row"><input id="playerSearch" placeholder="Oyuncu ara..." value="${attrs(search)}" autocomplete="off"/>${sortMenu("player",playerSort)}</div>`)
 + (!configured?`<p class="soft">Bunlar sadece tasarımı göstermek için hazırlanmış <b>örnek kartlardır</b>. Supabase bağlanınca gerçek oyuncular listelenir.</p>`:'')
 + (configured&&!user?`<div class="empty"><b>Oyuncu kartlarını görmek için giriş yap.</b><br>E-posta adresin ve şifrenle giriş yap.<p><button class="btn lime" data-login="1">Giriş yap / Kayıt ol</button></p></div>`:
 arr.length?`<div class="players-grid">${arr.map(c=>`<div class="player-tile">${cardHTML(c)}<div class="tile-under"><strong>${esc(formatPersonName(c.display_name))}</strong><button data-player="${attrs(c.id)}">Kartı aç →</button></div></div>`).join('')}</div>`:
 `<div class="empty"><b>Henüz onaylı oyuncu bulunamadı.</b><br>Oyuncular profillerini tamamladığında burada görünecek.</div>`);
}
const sortOptions={player:[['rating_desc','Genel puan'],['name_asc','İsim'],['position','Mevki'],['hiz','Hız'],['sut','Şut'],['pas','Pas'],['dripling','Dribling'],['defans','Savunma'],['dayaniklilik','Kondisyon']],ranking:[['rating_desc','Genel puan'],['name_asc','İsim'],['position','Mevki'],['hiz','Hız'],['sut','Şut'],['pas','Pas'],['dripling','Dribling'],['defans','Savunma'],['dayaniklilik','Kondisyon']]};
function sortMenu(kind,value){
 const opts=sortOptions[kind];const active=opts.find(x=>x[0]===value)||opts[0];
 return `<details class="szf-sort-dropdown"><summary aria-label="Sıralama seçeneklerini aç">${esc(active[1])} <span>▾</span></summary><div class="szf-sort-menu" role="group" aria-label="Sıralama seçenekleri"><div class="szf-sort-title">Sıralama ölçütü</div>${opts.map(([key,label])=>`<button type="button" data-sort-kind="${kind}" data-sort-value="${key}" class="${value===key?'selected':''}">${esc(label)}${value===key?' ✓':''}</button>`).join('')}</div></details>`;
}
// Bir hesaba bağlanmış misafir, eski maçta da aynı oyuncudur.
// Maç başına tek kayıt sayılır; normal katılım ve misafir kaydı çakışabilir.
// Birleştirilmiş oyuncu kimliği: kayıtlı hesabı olan eski misafir hiçbir ekranda misafir değildir.
function linkedPlayerId(g){return g?.linked_user_id||g?.linked_player_id||null;}
function linkedCard(g){const id=linkedPlayerId(g);return id?currentCards().find(c=>String(c.id)===String(id)):null;}
function guestDisplayName(g){return linkedCard(g)?.display_name||g.display_name;}
function playerIdentityKey(p){return p.is_guest?String(linkedPlayerId(p)||'guest:'+p.id):String(p.player_id||p.id);}
function playerMatchEntries(playerId){
 const id=String(playerId),entries=new Map();
 for(const p of weeklyPlayers){
  if(String(p.player_id)!==id)continue;
  entries.set(String(p.match_id),{match_id:p.match_id,team_color:p.team_color});
 }
 for(const g of extras.guests){
  if(String(linkedPlayerId(g)||'')!==id)continue;
  const key=String(g.match_id),prior=entries.get(key);
  // Geçmişteki misafir takımını koru; aynı maç iki kere sayılmasın.
  if(!prior||!['red','white'].includes(prior.team_color))
   entries.set(key,{match_id:g.match_id,team_color:g.team_color});
 }
 return [...entries.values()];
}
function playerWinStats(playerId){
 const finished=new Map(leagueMatches.filter(m=>m.status==='completed').map(m=>[String(m.id),m]));
 let wins=0,played=0;
 for(const entry of playerMatchEntries(playerId)){
  const match=finished.get(String(entry.match_id));if(!match)continue;
  const red=match.red_score,white=match.white_score;
  const validScores=red!==null&&red!==undefined&&red!==''&&white!==null&&white!==undefined&&white!==''&&Number.isFinite(Number(red))&&Number.isFinite(Number(white));
  const actualResult=validScores?(Number(red)>Number(white)?'red':Number(red)<Number(white)?'white':'draw'):match.result;
  // Katılım takım rengi eksik de olsa maç sayılır; galibiyet yalnızca belli takıma yazılır.
  played++;if(['red','white'].includes(entry.team_color)&&actualResult===entry.team_color)wins++;
 }
 return {wins,played,pct:played?100*wins/played:0};
}
function renderRanking(){
 const order={KL:0,DEF:1,ORT:2,FOR:3};
 const arr=[...currentCards()].sort((a,b)=>{
  if(rankingSort==='position'){
   const delta=(order[a.position]??99)-(order[b.position]??99);
   if(delta)return delta;
  }
  const byName=String(a.display_name).localeCompare(String(b.display_name),'tr');
  if(rankingSort==='name_asc')return byName;
  if(['sut','pas','dripling','defans','dayaniklilik','hiz'].includes(rankingSort))return ability(b,rankingSort)-ability(a,rankingSort) || Number(b.overall_rating||0)-Number(a.overall_rating||0) || byName;
  return Number(b.overall_rating||0)-Number(a.overall_rating||0) || byName;
 });
 const picker=`<div class="ranking-picker">${sortMenu("ranking",rankingSort)}</div>`;

 const activeCol = rankingSort==='rating_desc' ? 'rating' : rankingSort==='name_asc' ? 'name' : rankingSort==='position' ? 'position' : rankingSort;
 const h = (label,key='') => `<th class="${activeCol===key?'active-col':''}">${label}</th>`;
 return sectionHead('Oyuncu sıralaması','Genel puan, mevki ve özelliklere göre sıralama',picker)

 + (rankingSort==='position'?'<p class="soft">Mevki önceliği: Kaleci → Defans → Orta saha → Forvet. Her mevkide yüksek rating önce gelir; eşitlikte isim A–Z sıralanır. Asıl mevki esas alınır.</p>':'')
 +(!configured?'<p class="soft">Örnek veriler gösteriliyor.</p>':'')
 +(arr.length?`<div class="table-wrap"><table><thead><tr><th>#</th>${h('OYUNCU','name')}${h('MEVKİ','position')}${h('RATING','rating')}${h('HIZ','hiz')}${h('ŞUT','sut')}${h('PAS','pas')}${h('DRİ','dripling')}${h('DEF','defans')}${h('KON','dayaniklilik')}</tr></thead><tbody>${arr.map((p,i)=>`<tr><td class="rank">${i+1}</td><td class="${activeCol==='name'?'active-col':''}">${esc(formatPersonName(p.display_name))}</td><td class="${activeCol==='position'?'active-col':''}">${esc(posName[p.position]||p.position)}</td><td class="${activeCol==='rating'?'active-col accent':'accent'}">${publicRating(p)}</td>${features.map(([key])=>`<td class="${activeCol===key?'active-col':''}">${publicAbility(p,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">Henüz onaylı oyuncu yok.</div>');
}
let selectedStatsTab='wins';
function renderStatistics(){
 const stats=currentCards().map(p=>({player:p,...playerWinStats(p.id)})).sort((a,b)=>(b.played?b.pct:-1)-(a.played?a.pct:-1)||b.played-a.played||String(a.player.display_name).localeCompare(String(b.player.display_name),'tr'));
 const tallyFor=kind=>{
  const tally=new Map();
  extras.events.filter(x=>x.kind===kind).forEach(e=>{
   const id=e.player_id||extras.guests.find(g=>String(g.id)===String(e.guest_id))?.linked_user_id;
   if(id)tally.set(id,(tally.get(id)||0)+1);
  });
  return [...tally.entries()].sort((a,b)=>b[1]-a[1]);
 };
 const board=(kind,label)=>{const entries=tallyFor(kind);
  return `<div class="szf-leader-list">${entries.map(([id,n],i)=>`<div class="szf-leader-row"><span class="szf-leader-rank">${i+1}</span><span class="szf-leader-name">${esc(formatPersonName(currentCards().find(p=>p.id===id)?.display_name||'Oyuncu'))}</span><strong>${n} ${label}</strong></div>`).join('')||`<div class="szf-stats-empty">Henüz ${label} kaydı yok.</div>`}</div>`;
 };
 const tabs=[['wins','🏆 Galibiyet Yüzdesi'],['goals','⚽ Gol Krallığı'],['assists','🎯 Asist Krallığı']];
 const active=tabs.some(t=>t[0]===selectedStatsTab)?selectedStatsTab:'wins';
 const content=active==='wins'
 ? `<p class="soft">Yalnızca tamamlanmış ve oyuncunun takımı kaydedilmiş maçlar hesaplanır.</p><div class="table-wrap szf-win-table"><table><thead><tr><th>#</th><th>OYUNCU</th><th>MAÇ</th><th>GALİBİYET</th><th>ORAN</th></tr></thead><tbody>${stats.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(formatPersonName(x.player.display_name))}</td><td>${x.played}</td><td>${x.wins}</td><td class="accent">${x.played?x.pct.toLocaleString('tr-TR',{maximumFractionDigits:1})+'%':'—'}</td></tr>`).join('')}</tbody></table></div>`
 :active==='goals'?`<p class="soft">Maçlarda yönetici tarafından girilen goller. Eşleştirilmemiş misafirler listelenmez.</p>${board('goal','gol')}`
 :`<p class="soft">Maçlarda kaydedilen asistler. Eşleştirilmemiş misafirler listelenmez.</p>${board('assist','asist')}`;
 return sectionHead('İstatistikler','Tüm zamanların oyuncu performansları')
 + `<section class="szf-stats-single"><div class="szf-stats-tabs" role="tablist" aria-label="İstatistik türü">${tabs.map(([key,label])=>`<button type="button" role="tab" aria-selected="${active===key}" class="szf-stats-tab ${active===key?'active':''}" data-stats-tab="${key}">${label}</button>`).join('')}</div><div class="szf-stats-body" role="tabpanel">${content}</div></section>`;
}
function achievementData(c){
 const id=String(c.id), stat=playerWinStats(c.id);
 const eventCount=kind=>extras.events.reduce((n,e)=>{
   if(e.kind!==kind)return n;
   const linked=extras.guests.find(g=>String(g.id)===String(e.guest_id))?.linked_user_id;
   return n+(String(e.player_id||linked)===id?1:0);
 },0);
 const goals=eventCount('goal'),assists=eventCount('assist');
 // Panter: kalecinin oynadığı, doğrulanmış skorlu ve 5'ten az gol yediği 5 ayrı maç gerekir.
 // Eski maçlarda skor bilinmiyorsa sayılmaz.
 const pantherMatches=leagueMatches.filter(m=>{
  if(m.status!=='completed')return false;
  const entry=playerMatchEntries(id).find(p=>String(p.match_id)===String(m.id));
  if(!entry||!['red','white'].includes(entry.team_color)||c.position!=='KL')return false;
  const against=entry.team_color==='red'?m.white_score:m.red_score;
  return against!==null&&against!==undefined&&against!==''&&Number.isInteger(Number(against))&&Number(against)>=0&&Number(against)<5;
 }).length;
 const mvp=Object.values(mvpStates).filter(v=>v&&!v.open&&Array.isArray(v.winners)&&v.winners.some(w=>String(typeof w==='object'?(w.player_id||w.id||w.target_id):w)===id)).length;
 return [
  {emoji:'⚽',name:'İlk Maç',value:stat.played,target:1,unit:'maç',description:'En az 1 tamamlanmış maçta oyna.'},
  {emoji:'🏅',name:'Deneyimli',value:stat.played,target:10,unit:'maç',description:'En az 10 tamamlanmış maçta oyna.'},
  {emoji:'🎖️',name:'Saha Müdavimi',value:stat.played,target:25,unit:'maç',description:'En az 25 tamamlanmış maçta oyna.'},
  {emoji:'🔥',name:'Golcü',value:goals,target:10,unit:'gol',description:'Maçlarda toplam en az 10 normal gol at. Kendi kalene attığın goller sayılmaz.'},
  {emoji:'🎯',name:'Asist Ustası',value:assists,target:10,unit:'asist',description:'Maçlarda toplam en az 10 asist yap.'},
  {emoji:'🏆',name:'Kazanan',value:stat.wins,target:10,unit:'galibiyet',description:'Son kaydedilen maç sonuçlarına göre en az 10 galibiyet kazan.'},
  {emoji:'👑',name:'Maçın Adamı',value:mvp,target:1,unit:'ödül',description:'Tamamlanmış Maçın Adamı oylamasında en az 1 kez seçil.'},
  ...(c.position==='KL'?[{emoji:'🐆',name:'Panter',value:pantherMatches,target:5,unit:'maç',description:'Kaleci olarak oynadığın 5 ayrı tamamlanmış maçın her birinde 5’ten az (en fazla 4) gol ye. Skoru kayıtlı olmayan maçlar sayılmaz.'}]:[])
 ];
}
function detail(c){
 if(!c)return renderPlayers();
 const badges=achievementData(c);
 return `<div class="section-head"><button class="btn small ghost" data-back="1">← Oyunculara dön</button></div><div class="detail-layout"><div class="detail-sidebar">${cardHTML(c)}</div><div class="szf-achievements"><h2>${esc(formatPersonName(c.display_name))}</h2><p class="soft">${esc(posName[c.position]||c.position)} · ${rankTier(c).toLocaleUpperCase('tr')} kart</p><div class="szf-achievements-heading"><h3>🏅 Başarı Rozetleri</h3><span>${badges.filter(b=>b.value>=b.target).length} / ${badges.length} rozet</span></div><div class="szf-achievements-grid">${badges.map(b=>{const unlocked=b.value>=b.target;return `<div class="szf-achievement ${unlocked?'unlocked':'locked'}" title="${attrs(b.name+': '+b.description)}" aria-label="${attrs(b.name+': '+b.description)}" tabindex="0"><div class="szf-achievement-icon">${unlocked?b.emoji:'🔒'}</div><div class="szf-achievement-name">${esc(b.name)}</div><div class="szf-achievement-progress">${Math.min(b.value,b.target)} / ${b.target} ${esc(b.unit)}</div></div>`}).join('')}</div><p class="micro">Rozetler kaydedilmiş maç, gol, asist ve sonuçlandırılmış Maçın Adamı verilerinden otomatik hesaplanır.</p></div></div>`;
}

function vestStats(playerId){
 let played=0,worn=0;
 const byMatch=new Map(leagueMatches.filter(m=>m.status==='completed'&&['red','white'].includes(m.vest_team)).map(m=>[String(m.id),m]));
 for(const entry of weeklyPlayers){
  if(String(entry.player_id)!==String(playerId))continue;
  const match=byMatch.get(String(entry.match_id));
  if(!match || !['red','white'].includes(entry.team_color))continue;
  played++;if(entry.team_color===match.vest_team)worn++;
 }
 return {played,worn,rate:played?worn/played:0};
}
function vestSuggestion(teams){
 const detail=teams.map(team=>{
  const members=team.map(p=>({player:p,stat:vestStats(p.id)}));
  const known=members.filter(x=>x.stat.played>0);
  return {members,total:members.reduce((n,x)=>n+x.stat.worn,0),known:known.length,rate:known.length?known.reduce((n,x)=>n+x.stat.rate,0)/known.length:0};
 });
 const [a,b]=detail;
 let chosen;
 if(a.rate!==b.rate)chosen=a.rate<b.rate?0:1;
 else if(a.total!==b.total)chosen=a.total<b.total?0:1;
 else chosen=null;
 const info=d=>`${d.total} kez · ${d.known}/7 oyuncunun geçmiş kaydı var · geçmişte giyme ortalaması %${Math.round(d.rate*100)}`;
 return `<section class="vest-recommendation"><h3>🎽 Bu maç yeleği kim giysin?</h3><p>🔴 Kırmızı: ${info(a)}</p><p>⚪ Beyaz: ${info(b)}</p><strong>${chosen===null?'Geçmiş eşit: bu hafta kura çekin.':'Bu hafta '+(chosen===0?'Kırmızı':'Beyaz')+' takım yelek giysin.'}</strong><p class="soft">Her oyuncunun yelek giydiği maç sayısı, oynadığı ve yelek kaydı bulunan maçlarla karşılaştırılır. İlk kez gelen oyuncular 0 geçmiş maçla taraf tutmaz. Tavsiye, maçın resmî kaydı değildir.</p></section>`;
}
// Misafirlerin 70 puani yalnizca takim dengeleme icindir; kalici rating degildir.
function nextTeamMatch(){
 const pending=leagueMatches.filter(m=>m.status!=='completed'&&Number.isFinite(new Date(m.match_date).getTime()));
 const future=pending.filter(m=>new Date(m.match_date).getTime()>=Date.now());
 return future.sort((a,b)=>new Date(a.match_date)-new Date(b.match_date))[0]||null;
}
function teamBuilderCandidates(){
 const m=nextTeamMatch();
 if(!m)return [];
 const attendees=weeklyPlayers.filter(p=>String(p.match_id)===String(m.id));
 const registered=currentCards();
 const ids=new Set();
 const result=[];
 attendees.forEach(a=>{
  const card=registered.find(p=>String(p.id)===String(a.player_id));
  if(card&&!ids.has(String(card.id))){result.push(card);ids.add(String(card.id))}
 });
 extras.guests.filter(g=>String(g.match_id)===String(m.id)).forEach(g=>{
  // Aynı kullanıcı misafir olarak eşleştirilmişse iki kez gösterme
  if(linkedPlayerId(g)&&ids.has(String(linkedPlayerId(g))))return;
  const card=linkedCard(g);
  result.push(card?{...card,id:'guest:'+g.id,is_guest:false,linked_user_id:linkedPlayerId(g)}:{id:'guest:'+g.id,display_name:g.display_name,position:g.position||'ORT',secondary_position:null,overall_rating:70,is_guest:true});
  if(card)ids.add(String(linkedPlayerId(g)));
 });
 return result;
}
function syncTeamSelection(){
 const arr=teamBuilderCandidates(),key=String(nextTeamMatch()?.id||'');
 if(window._teamMatchKey!==key){
  window._teamMatchKey=key;
  manualRed.clear();teamData=null;
 }
 teamSelections=new Set(arr.map(p=>p.id));
 for(const id of [...manualRed])if(!teamSelections.has(id))manualRed.delete(id);
}
function renderTeams(){
 syncTeamSelection();
 const m=nextTeamMatch(),arr=teamBuilderCandidates();
 const ready=arr.length===14;
 const selection=teamMode==='manual'?`<div class="szf-team-hint">🔴 <b>${manualRed.size}/7 kırmızı</b> · Kalan oyuncular otomatik beyaz. Oyuncuya dokunarak takımını değiştir.</div><div class="szf-simple-players">${arr.map(p=>`<button type="button" class="szf-simple-person ${manualRed.has(p.id)?'red':'white'}" data-toggle-red="${attrs(p.id)}" aria-pressed="${manualRed.has(p.id)}"><span>${manualRed.has(p.id)?'🔴':'⚪'}</span><span class="szf-simple-name">${esc(formatPersonName(p.display_name))}</span><small>${esc(p.position||'—')}${p.is_guest?' · Misafir':''}</small></button>`).join('')}</div>`:`<div class="szf-simple-players">${arr.map(p=>`<div class="szf-simple-person"><span>⚽</span><span class="szf-simple-name">${esc(formatPersonName(p.display_name))}</span><small>${esc(p.position||'—')}${p.is_guest?' · Misafir':''}</small></div>`).join('')}</div>`;
 return sectionHead('7’ye 7 takım kur',m?'📅 Sıradaki maç: '+matchDateText(m.match_date):'Yaklaşan maç bulunamadı.',`<button id="buildTeams" class="btn lime" ${!ready||(teamMode==='manual'&&manualRed.size!==7)?'disabled':''}>${teamMode==='manual'?'Takımları onayla ve maça kaydet':'Takımları oluştur ve maça kaydet'} (${arr.length}/14)</button>`)
 + `<div class="mode-buttons"><button class="btn small ${teamMode==='auto'?'lime':'ghost'}" data-mode="auto">⚖ Otomatik dengeli</button><button class="btn small ${teamMode==='manual'?'lime':'ghost'}" data-mode="manual">✋ Elle dağıt</button></div>`
 + (!ready?`<p class="notice">Sıradaki maçın kadrosunda ${arr.length} kişi var. Takım kurmak için 14 katılımcı gerekli.</p>`:'')
 + selection
 + (teamData&&adminInfo?`<button class="btn lime" id="saveTeamsToMatch">💾 Bu kadroları sıradaki maça kaydet</button>`:teamData?`<p class="soft">Maça kaydetme işlemini yönetici yapabilir.</p>`:'')
 + (teamData?vestSuggestion(teamData):'')
 + (teamData?`<div class="team-cols">${teamData.map((t,i)=>`<div class="team-result"><h3>${i===0?'🔴 Kırmızı takım':'⚪ Beyaz takım'}</h3><p>Toplam rating: ${t.reduce((n,x)=>n+x.overall_rating,0)} · Ortalama: ${(t.reduce((n,x)=>n+x.overall_rating,0)/7).toFixed(1)}</p><ol>${t.map(p=>`<li><b>${esc(p.assigned_role||p.position)}</b> · ${esc(formatPersonName(p.display_name))} <span>${p.overall_rating}</span></li>`).join('')}</ol></div>`).join('')}</div>`:'');
}
function renderAccount(){
 if(!user)return sectionHead('Hesabım','E-posta adresin ve şifrenle giriş yap.')+'<div class="empty"><b>Henüz giriş yapmadın.</b><p><button class="btn lime" data-login="1">Giriş yap / Kayıt ol</button></p></div>';
 const used=new Set(publicProfiles.filter(x=>x.jersey_number&&x.id!==user.id).map(x=>Number(x.jersey_number)));
 const numberOptions='<option value="">Forma numarası seç</option>'+Array.from({length:99},(_,i)=>i+1).map(n=>`<option value="${n}" ${used.has(n)?'disabled':''} ${Number(profile?.jersey_number)===n?'selected':''}>${n}${used.has(n)?' — dolu':''}</option>`).join('');
 const positions=(selected,empty=false)=>`${empty?'<option value="">Yok</option>':''}`+Object.entries(posName).map(([k,v])=>`<option value="${k}" ${selected===k?'selected':''}>${v}</option>`).join('');
 const avatar=profile?.avatar_path?`<img class="profile-photo" src="${attrs(avatarUrl(profile.avatar_path))}" alt="Profil fotoğrafın">`:'<span class="profile-photo-placeholder">📷</span>';
 return sectionHead('Hesabım','Profilini tamamla ve dilediğin zaman güncelle.')+`<section class="profile-panel"><div class="profile-info">${profile?.display_name&&profile?.jersey_number?'✅ Profilin hazır.':'📝 Profilini tamamla.'} ${!profile?.display_name||!profile?.jersey_number?'Profilini aşağıdan tamamla.':''}</div><label>E-posta<input class="text-input" disabled value="${attrs(user.email||'')}" /></label><form id="profileForm"><div class="photo-row">${avatar}<div><label>Oyuncu fotoğrafı (kart için yakınlaştır / kadrajla · en fazla 5 MB)<input type="file" id="editPhoto" accept="image/jpeg,image/png,image/webp" /></label>${profile?.avatar_path?'<button type="button" id="editCurrentPhoto" class="btn small ghost" style="margin-top:12px">✎ Mevcut fotoğrafı düzenle</button><button type="button" id="removeCurrentPhoto" class="btn small ghost photo-remove-btn" style="margin-top:10px">🗑 Fotoğrafı kaldır</button>':''}</div></div><div id="cropPreview" class="crop-edit hidden"><b>FC kartı fotoğraf önizlemesi</b><p class="micro">Bu önizlemede ayarladığın 4:5 kadraj kartta ikinci kez kırpılmadan gösterilir. Arka plan otomatik silinmez.</p><canvas id="cropCanvas" width="400" height="500"></canvas><label>Yakınlaştır <input id="cropZoom" type="range" min="100" max="280" value="175" step="5"></label><label>Sağa / sola <input id="cropHorizontal" type="range" min="0" max="100" value="50"></label><label>Yukarı / aşağı <input id="cropVertical" type="range" min="0" max="100" value="32"></label></div><label>Ad soyad<input class="text-input" id="editName" required minlength="2" maxlength="60" value="${attrs(profile?.display_name||'')}" /></label><label>Forma numarası (1–99)<select id="editJersey" required class="text-input">${numberOptions}</select></label><label>Asıl mevki<select id="editPos" class="text-input">${positions(profile?.position)}</select></label><label>Alternatif mevki (isteğe bağlı)<select id="editPos2" class="text-input">${positions(profile?.secondary_position,true)}</select></label><div class="profile-actions"><button class="btn lime" type="submit" id="saveProfileBtn">Profili kaydet</button><button type="button" id="signoutAccount" class="btn ghost">Çıkış yap</button></div></form><p class="micro">Her forma numarası tek kişiye aittir. Alternatif mevki asıl mevkiyle aynı olamaz.</p></section>`;
}


function renderAssessment(){
 if(!user)return sectionHead('Oyuncu Değerlendir','Puan vermek için giriş yapmalısın.');
 if(!profile?.approved)return sectionHead('Oyuncu Değerlendir','Değerlendirme için onaylı hesap gerekiyor.');
 if(!v70Ready)return sectionHead('Oyuncu Değerlendir','v70 SQL kurulumu gerekiyor.','')+'<p class="notice">Yeni puanlama sistemi henüz veritabanında hazır değil. SUPABASE_V70_RATING.sql dosyasını çalıştır.</p>';
 const everyone=currentCards().filter(c=>String(c.id)!==String(user.id)).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),'tr'));
 if(!everyone.length)return sectionHead('Oyuncu Değerlendir','Değerlendirilecek oyuncu bulunmuyor.');
 weeklyIndex=Math.max(0,Math.min(weeklyIndex,everyone.length-1));
 const c=everyone[weeklyIndex],f=getFeatures(c),vote=myVotes.find(v=>String(v.target_id)===String(c.id));
 const fields=f.map(([key,short,label],i)=>`<label class="v70-rating-field"><span>${esc(label)}</span><input type="number" class="text-input" data-v70-score="${key}" min="1" max="99" step="1" required placeholder="1–99" value="${vote?.scores?.[i]??''}"></label>`).join('');
 const picker=`<select id="v70Target" class="text-input">${everyone.map((c,i)=>`<option value="${i}" ${i===weeklyIndex?'selected':''}>${esc(formatPersonName(c.display_name))}</option>`).join('')}</select>`;
 return sectionHead('Oyuncu Değerlendir','Her oyuncuya 6 özellik için 1–99 puan ver. 10 farklı kişinin değerlendirmesi tamamlanınca kart görünür.',picker)
 +`<div class="assessment-layout"><div class="assessment-preview"><p class="soft">${Number(c.v70_count||0)}/10 değerlendirme tamamlandı</p>${assessmentCardHTML(c)}</div><div class="assessment-panel"><h3>${esc(formatPersonName(c.display_name))}</h3><p class="soft">Altı puanın tamamını gir. Kendini değerlendiremezsin. Daha önceki puanlarını değiştirebilirsin.</p><form id="v70VoteForm" data-target="${attrs(c.id)}"><div class="v70-rating-fields">${fields}</div><div id="szf-live-rating" class="szf-live-rating" aria-live="polite">Verdiğin genel rating: <strong>—</strong></div><button class="btn lime" type="submit" id="v70SubmitBtn" ${vote?'disabled aria-disabled="true"':''}>${vote?'Puanlarımı güncelle':'Değerlendirmeyi kaydet'}</button></form><div class="mode-buttons"><button type="button" class="btn ghost" data-assess-prev ${weeklyIndex===0?'disabled aria-disabled="true" title="İlk oyuncudasın"':''}>← Önceki</button><button type="button" class="btn lime" data-assess-next ${weeklyIndex===everyone.length-1?'disabled aria-disabled="true" title="Son oyuncudasın"':''}>Sonraki →</button></div></div></div>`;
}
async function submitV70Vote(e){
 e.preventDefault();const form=e.currentTarget,target=form.dataset.target;
 const inputs=[...form.querySelectorAll('[data-v70-score]')];const scores=inputs.map(x=>Number(x.value));
 if(scores.length!==6||inputs.some(x=>x.value.trim()==='')||scores.some(n=>!Number.isInteger(n)||n<1||n>99))return toast('Altı özelliğe de 1–99 arasında tam sayı gir.',true);
 const btn=form.querySelector('[type=submit]');if(btn){btn.disabled=true;btn.setAttribute('aria-disabled','true');}
 const {error}=await db.rpc('szf_submit_rating_v70',{p_target:target,p_scores:scores});
 if(error){if(btn){btn.disabled=false;btn.setAttribute('aria-disabled','false');}return toast('Puan kaydedilemedi: '+formatError(error),true);}
 await loadProfileAndCards();render();toast('6 özellik puanın kaydedildi.');
}

function matchTitleInfo(raw){
 const val=String(raw||'');
 const i=val.lastIndexOf(' [Saha: ');
 return i>=0 && val.endsWith(']')?{title:val.slice(0,i),venue:val.slice(i+8,-1)}:{title:val,venue:''};
}
function matchDateText(date){
 return new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(date));
}
function matchDay(date){
 const d=new Date(date);
 return {day:new Intl.DateTimeFormat('tr-TR',{day:'2-digit',timeZone:'Europe/Istanbul'}).format(d),
 month:new Intl.DateTimeFormat('tr-TR',{month:'short',timeZone:'Europe/Istanbul'}).format(d),
 weekday:new Intl.DateTimeFormat('tr-TR',{weekday:'short',timeZone:'Europe/Istanbul'}).format(d)};
}
function pitchFormation(entries){
 const slots=['KL','DEF','DEF','DEF','ORT','ORT','FOR'];
 const roleCost=(p,role)=>{
  const primary=String(p.position||'ORT').toUpperCase();
  const secondary=String(p.secondary_position||'').toUpperCase();
  if(primary===role)return 0;
  if(secondary===role)return 1;
  if(primary==='KL')return role==='KL'?0:10000;
  if(role==='KL')return 700;
  if((primary==='DEF'&&role==='FOR')||(primary==='FOR'&&role==='DEF'))return 10000;
  if(primary==='DEF'&&role==='ORT'||primary==='FOR'&&role==='ORT'||primary==='ORT'&&(role==='DEF'||role==='FOR'))return 20;
  return 400;
 };
 // 7 kisilik en dusuk toplam mevki maliyeti, esitlikte ilk oyuncu sirasini koru.
 let best=null,bestCost=Infinity;
 const solve=(idx,used,team,cost)=>{
  if(cost>=bestCost)return;
  if(idx===slots.length){best=[...team];bestCost=cost;return;}
  for(let i=0;i<entries.length;i++){
   if(used.has(i))continue;
   used.add(i);team.push({...entries[i],assigned_role:slots[idx]});
   solve(idx+1,used,team,cost+roleCost(entries[i],slots[idx]));
   team.pop();used.delete(i);
  }
 };
 if(entries.length===7)solve(0,new Set(),[],0);
 return best||entries.map((p,i)=>({...p,assigned_role:slots[i]||p.position}));
}
function matchBlock(m){
 const people=weeklyPlayers.filter(x=>x.match_id===m.id);
 const guests=extras.guests.filter(x=>x.match_id===m.id&&!((x.linked_user_id)&&weeklyPlayers.some(p=>String(p.match_id)===String(m.id)&&String(p.player_id)===String(linkedPlayerId(x)))));
 const queue=extras.waitlist.filter(x=>x.match_id===m.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
 const myQueue=queue.find(x=>x.player_id===user.id);
 const mine=people.some(x=>x.player_id===user.id);
 const declined=matchDeclines.some(x=>String(x.match_id)===String(m.id)&&String(x.player_id)===String(user.id));
 const selfConfirmed=!declined&&people.some(x=>String(x.player_id)===String(user.id)&&x.self_confirmed===true);
 const completed=m.status==='completed'||new Date(m.match_date).getTime()<=Date.now(),d=matchDay(m.match_date),t=matchTitleInfo(m.title);
 const creator=publicProfiles.find(p=>String(p.id)===String(m.created_by))||currentCards().find(p=>String(p.id)===String(m.created_by))||(String(profile?.id)===String(m.created_by)?profile:null);
 const creatorName=formatPersonName(creator?.display_name||'');
 const mayEditMatch=adminInfo||canDeleteMatch||String(m.created_by)===String(user?.id);
 const players=people.map(x=>currentCards().find(p=>p.id===x.player_id)).filter(Boolean);
 const roster=players.length?players.map(c=>{const entry=people.find(p=>p.player_id===c.id);const locked=entry?.self_confirmed===true;return `<div class="roster-person"><span>${esc(formatPersonName(c.display_name))} ${locked?'<small>✓ Kendi onayı</small>':'<small>Oyuncu Ekle</small>'}</span>${entry?.team_color==='red'?' 🔴 Kırmızı':entry?.team_color==='white'?' ⚪ Beyaz':''}${!completed&&(c.id===user.id||!locked||adminInfo||canDeleteMatch)?`<button class="btn small ghost" data-remove-roster="${attrs(m.id)}" data-playerid="${attrs(c.id)}">Çıkar</button>`:''}</div>`}).join(''):'Henüz katılımcı yok.';
 const guestRoster=guests.map(g=>`<div class="roster-person"><span>${esc(formatPersonName(guestDisplayName(g)))} <small>${linkedPlayerId(g)?'Kayıtlı oyuncu':'Misafir · takım dengesi: 70'}</small></span>${!completed?`<div class="guest-roster-actions">${g.team_color?`<span class="guest-team-badge">${esc(g.team_color==='red'?'🔴 Kırmızı':'⚪ Beyaz')}</span>`:''}<button class="btn small ghost" data-remove-guest="${attrs(g.id)}">Çıkar</button>${adminInfo?`<select data-link-guest="${attrs(g.id)}"><option value="">${linkedPlayerId(g)?'Eşleşti · değiştir':'Hesapla eşleştir'}</option>${currentCards().map(c=>`<option value="${attrs(c.id)}" ${g.linked_user_id===c.id?'selected':''}>${esc(formatPersonName(c.display_name))}</option>`).join('')}</select>`:''}</div>`:`${esc(g.team_color==='red'?'🔴':g.team_color==='white'?'⚪':'')}${adminInfo?`<select data-link-guest="${attrs(g.id)}"><option value="">${linkedPlayerId(g)?'Eşleşti · değiştir':'Hesapla eşleştir'}</option>${currentCards().map(c=>`<option value="${attrs(c.id)}" ${g.linked_user_id===c.id?'selected':''}>${esc(formatPersonName(c.display_name))}</option>`).join('')}</select>`:''}`}</div>`).join('');
 const historyEntries=[...people.map(x=>({id:x.player_id,guest:false,name:currentCards().find(c=>String(c.id)===String(x.player_id))?.display_name||'Oyuncu',team:x.team_color,linked:true})),...guests.map(g=>({id:g.id,guest:true,name:guestDisplayName(g),team:g.team_color,linked:!!linkedPlayerId(g)}))];
 const historyRow=x=>`<div class="szf-history-player"><span>${esc(formatPersonName(x.name))}${x.guest&&!x.linked?' <small>(Misafir)</small>':''}</span><div class="szf-history-actions">${x.guest&&!x.linked?`<button type="button" class="btn small lime" data-open-guest-link="${attrs(x.id)}">Eşleştir</button>`:''}<select aria-label="Takım değiştir" data-history-team="${attrs(x.id)}" data-history-guest="${x.guest?'1':'0'}" data-history-match="${attrs(m.id)}"><option value="" ${!x.team?'selected':''}>Takımsız</option><option value="red" ${x.team==='red'?'selected':''}>🔴 Kırmızı</option><option value="white" ${x.team==='white'?'selected':''}>⚪ Beyaz</option></select></div></div>`;
 const historicAssign=adminInfo&&completed?`<section class="szf-historic-assign"><h4>🛠 Geçmiş Maç Takımlarını Düzenle</h4><div class="szf-history-columns"><div class="szf-history-red"><h4>🔴 Kırmızı (${historyEntries.filter(x=>x.team==='red').length}/7)</h4>${historyEntries.filter(x=>x.team==='red').map(historyRow).join('')}</div><div class="szf-history-white"><h4>⚪ Beyaz (${historyEntries.filter(x=>x.team==='white').length}/7)</h4>${historyEntries.filter(x=>x.team==='white').map(historyRow).join('')}</div></div>${historyEntries.some(x=>!x.team)?`<details><summary>Takımı belirlenmemiş oyuncular (${historyEntries.filter(x=>!x.team).length})</summary>${historyEntries.filter(x=>!x.team).map(historyRow).join('')}</details>`:''}</section>`:'';
 const teamsReady=people.filter(x=>x.team_color==='red').length+guests.filter(x=>x.team_color==='red').length===7 && people.filter(x=>x.team_color==='white').length+guests.filter(x=>x.team_color==='white').length===7;
 const positionHTML=(color)=>{
 const rosterEntries=[...people.filter(x=>x.team_color===color).map(x=>{const p=currentCards().find(c=>String(c.id)===String(x.player_id));return {id:x.player_id,name:p?.display_name||'Oyuncu',position:p?.position||'ORT',secondary_position:p?.secondary_position||''}}),...guests.filter(x=>x.team_color===color).map(x=>({id:x.id,name:guestDisplayName(x),position:x.position||'ORT',secondary_position:x.secondary_position||''}))];
 const formed=pitchFormation(rosterEntries);
 const rows=[['FOR'],['ORT'],['DEF'],['KL']].map((types,idx)=>{
  const players=formed.filter(x=>types.includes(x.assigned_role));
  return `<div class="szf-formation-line szf-formation-line-${idx}">${players.map(x=>`<div class="szf-pitch-player"><span>${esc(x.assigned_role)}</span><strong>${esc(formatPersonName(x.name))}</strong></div>`).join('')}</div>`;
 }).join('');
 return `<div class="szf-pitch-side"><b>${color==='red'?'🔴 Kırmızı':'⚪ Beyaz'} · 1-3-2-1</b><div class="szf-pitch szf-formation">${rosterEntries.length===7?rows:'<small>Takım henüz oluşturulmadı</small>'}</div></div>`;
};
 const events=extras.events.filter(x=>x.match_id===m.id);const goals=events.filter(x=>x.kind==='goal');const assists=events.filter(x=>x.kind==='assist');const ownGoals=events.filter(x=>x.kind==='own_goal');
 const playerName=(id,guest)=>guest?(guests.find(x=>String(x.id)===String(id))?.linked_user_id?currentCards().find(c=>String(c.id)===String(guests.find(x=>String(x.id)===String(id)).linked_user_id))?.display_name:guests.find(x=>String(x.id)===String(id))?.display_name)||'Misafir':currentCards().find(x=>x.id===id)?.display_name||'Oyuncu';
 const eventHTML=(arr)=>arr.map(x=>`<div class="szf-event-line">${esc(playerName(x.player_id||x.guest_id,!!x.guest_id))} ${adminInfo?`<button class="btn small ghost" data-delete-event="${attrs(x.id)}">Sil</button>`:''}</div>`).join('')||'<p class="soft">Henüz kayıt yok.</p>';
 const mv=mvpStates[String(m.id)]||{};
 const mvpOpen=completed&&mv.open===true;
 const mvpVoted=mv.voted===true;
 const mvpEligible=mv.eligible===true;
 const mvpCount=Number(mv.vote_count||0);
 const mvpDeadline=mv.deadline?matchDateText(mv.deadline):'';
 const mvpWinnerNames=(mv.winners||[]).map(x=>String(x).startsWith('g:')?playerName(String(x).slice(2),true):playerName(String(x).replace(/^p:/,''),false));
 const mvpCandidates=[...people.map(x=>({key:'p:'+x.player_id,name:playerName(x.player_id,false)})),...guests.filter(g=>!linkedPlayerId(g)||!people.some(p=>String(p.player_id)===String(linkedPlayerId(g)))).map(g=>({key:'g:'+g.id,name:playerName(g.id,true),guest:!linkedPlayerId(g)}))];
 const mvpMarkup=m.status==='completed'?`<section class="szf-mvp-panel"><h4>🏆 Maçın Adamı</h4>${!mvpEnabled?`<p class="soft">Maçın Adamı oyları okunamadı. Supabase v53 oy tablosunun okuma izinlerini kontrol et.</p>`:mvpOpen?`<p class="soft">Oy kullanabilenler: maçın kayıtlı oyuncuları. Kullanılan oy: ${mvpCount}</p>${mvpVoted?'<p class="soft">Oyun kaydedildi.</p>':mvpEligible?`<div class="szf-mvp-options">${mvpCandidates.filter(x=>x.key!=='p:'+user.id && !guests.some(g=>x.key==='g:'+g.id&&String(linkedPlayerId(g))===String(user.id))).map(x=>`<label class="szf-mvp-option"><input type="radio" name="mvp-${attrs(m.id)}" value="${attrs(x.key)}"><span>${esc(formatPersonName(x.name))}${x.guest?' (Misafir)':''}</span></label>`).join('')}</div><button class="btn lime" data-mvp="${attrs(m.id)}">Oyumu Onayla</button>`:`<p class="soft">Oy vermek için bu maçın kayıtlı oyuncusu olmalısın.</p>`}`:`<p>${mvpCount===0?'Oylama sona erdi; oy kullanılmadı.':mvpWinnerNames.length>1?'Beraberlik: '+esc(mvpWinnerNames.join(', '))+' · '+mv.winning_votes+' oy':'🏆 '+esc(mvpWinnerNames[0]||'Sonuç bekleniyor')+' · '+mv.winning_votes+' oy'}</p><p class="soft">Toplam ${mvpCount} oy kullanıldı.</p>`}</section>`:'';
 const detailHTML=`<div class="szf-extra-details">${teamsReady?'':`<h4>👥 Takım Kadroları</h4><div class="team-cols szf-saved-rosters">${['red','white'].map(color=>{const arr=[...people.filter(x=>x.team_color===color).map(x=>({name:currentCards().find(c=>String(c.id)===String(x.player_id))?.display_name||'Oyuncu',pos:currentCards().find(c=>String(c.id)===String(x.player_id))?.position||'—'})),...guests.filter(x=>x.team_color===color).map(x=>({name:guestDisplayName(x),pos:linkedCard(x)?.position||x.position||'—'}))];return `<div class="team-result"><h3>${color==='red'?'🔴 Kırmızı takım':'⚪ Beyaz takım'} (${arr.length}/7)</h3><ol>${arr.map(p=>`<li><b>${esc(p.pos)}</b> · ${esc(formatPersonName(p.name))}</li>`).join('')||'<li>Henüz oyuncu atanmadı.</li>'}</ol></div>`}).join('')}</div>`}<h4>Maç Sonucu</h4>${adminInfo&&m.status!=='completed'?`<p class="soft">Skoru kaydettiğinde maç otomatik sonuçlandırılır; gol ve asistleri aynı ekrandan düzenleyebilirsin.</p>`:''}${adminInfo?`<div class="szf-inline-forms"><label>🔴 Kırmızı <input type="number" min="0" max="99" id="score-red-${attrs(m.id)}" value="${m.red_score??''}" placeholder="Gol"></label><label>⚪ Beyaz <input type="number" min="0" max="99" id="score-white-${attrs(m.id)}" value="${m.white_score??''}" placeholder="Gol"></label><button class="btn small lime" data-save-score="${attrs(m.id)}">Sonucu Kaydet</button></div>`:`<p>🔴 ${m.red_score??'—'} – ${m.white_score??'—'} ⚪</p>`}<h4>Gol ve asistler</h4><div class="szf-stats-columns"><div><b>⚽ Goller (${goals.length})</b>${goals.map(g=>{const a=assists.find(a=>String(a.goal_event_id||'')===String(g.id));return `<div class="szf-event-line">${esc(playerName(g.player_id||g.guest_id,!!g.guest_id))}${a?' ('+esc(playerName(a.player_id||a.guest_id,!!a.guest_id))+')':''} ${adminInfo?`<button class="btn small ghost" data-delete-event="${attrs(g.id)}">Sil</button>`:''}</div>`;}).join('')||'<p class="soft">Henüz kayıt yok.</p>'}</div><div><b>🎯 Asistler (${assists.length})</b>${eventHTML(assists)}</div><div><b>🥅 Kendi Kalesine (${ownGoals.length})</b>${ownGoals.map(x=>`<div class="szf-event-line">${esc(playerName(x.player_id||x.guest_id,!!x.guest_id))} (KK) ${adminInfo?`<button class="btn small ghost" data-delete-event="${attrs(x.id)}">Sil</button>`:''}</div>`).join('')||'<p class="soft">Henüz kayıt yok.</p>'}</div></div>${adminInfo?`<div class="szf-inline-forms"><select id="event-person-${attrs(m.id)}"><option value="">Oyuncu seç</option>${[...people.map(x=>({value:'p:'+x.player_id,name:playerName(x.player_id,false)})),...guests.filter(x=>!!linkedPlayerId(x)).map(x=>({value:'g:'+x.id,name:guestDisplayName(x)+' (misafir)'}))].concat(guests.filter(x=>!linkedPlayerId(x)).map(x=>({value:'g:'+x.id,name:x.display_name+' (misafir)'}))).map(x=>`<option value="${attrs(x.value)}">${esc(formatPersonName(x.name))}</option>`).join('')}</select><select id="event-kind-${attrs(m.id)}"><option value="goal">Gol</option><option value="own_goal">Kendi Kalesine Gol (KK)</option></select><select id="event-assist-${attrs(m.id)}"><option value="">Asist yok</option>${[...people.map(x=>({value:'p:'+x.player_id,name:playerName(x.player_id,false)})),...guests.map(x=>({value:'g:'+x.id,name:guestDisplayName(x)}))].map(x=>`<option value="${attrs(x.value)}">${esc(formatPersonName(x.name))}</option>`).join('')}</select><button class="btn small lime" data-add-event="${attrs(m.id)}">Golü kaydet</button></div>`:''}${mvpMarkup}</div>`;
 const result=completed?({red:'🔴 Kırmızı takım kazandı',draw:'🤝 Beraberlik',white:'⚪ Beyaz takım kazandı'}[m.result]||'Maç tamamlandı'):'';
 return `<article class="match-new-card ${selectedMatchTab==='history'?'szf-history-compact':''}">${selectedMatchTab==='history'?`<button type="button" class="szf-history-toggle" data-roster="${attrs(m.id)}" aria-label="Maç ayrıntılarını aç veya kapat"><span>${esc(d.day)} ${esc(d.month)} · ${esc(t.title)}</span><strong>🔴 ${m.red_score??'—'} - ${m.white_score??'—'} ⚪</strong><span>Detaylar ▾</span></button>`:''}<div class="match-date-box"><small>${esc(d.weekday)}</small><strong>${esc(d.day)}</strong><span>${esc(d.month)}</span></div>
 <div class="match-new-body"><div class="match-badges"><span class="match-status ${completed?'ended':''}">${completed?'TAMAMLANDI':m.status==='open'?'KAYIT AÇIK':'KAYIT KAPALI'}</span><span>${esc(matchDateText(m.match_date).split(' ').slice(-1)[0])}</span></div>
 <h3>${esc(t.title)}</h3>${t.venue?`<p class="match-venue">⌖ ${esc(t.venue)}</p>`:''}<p class="match-creator">Maçı oluşturan: <span>${esc(creatorName||'Bilinmiyor')}</span></p>${completed?`<strong class="match-result">${result}</strong>`:''}
 <p class="match-count">${people.length+guests.length} / 14 katılımcı ${mine?'· Sen kayıtlısın':myQueue?'· Yedek sırası: '+(queue.indexOf(myQueue)+1):declined?'· Katılamayacağını bildirdin':''}</p>
 <div class="match-new-actions">${!completed&&m.status==='open'?`<button class="btn small ${selfConfirmed?'lime':'ghost'}" data-join="${attrs(m.id)}" aria-pressed="${selfConfirmed}">${selfConfirmed?'Katılıyorum ✓':'Katılıyorum'}</button><button class="btn small ${declined?'lime':'ghost'}" data-decline="${attrs(m.id)}" aria-pressed="${declined}">${declined?'Katılamıyorum ✓':'Katılamıyorum'}</button>`:''}
 ${!completed&&m.status==='open'&&myQueue?`<button class="btn small ghost" data-leave-queue="${attrs(m.id)}">Yedekten çık</button>`:''}<button class="btn small ghost" data-roster="${attrs(m.id)}">⚽ Kadroyu gör</button>
 ${!completed&&m.status==='open'?`<button class="btn small ghost" data-open-roster-picker="${attrs(m.id)}">＋ Oyuncu Ekle</button>`:''}

 ${completed&&adminInfo?`<button class="btn small lime" data-score-editor="${attrs(m.id)}">⚽ Sonuç, Gol ve Asist Düzenle</button>`:''}${completed?`<button class="btn small lime" data-share-match="${attrs(m.id)}">↗ Sonucu paylaş</button>`:''}
 ${mayEditMatch?`<button class="btn small ghost" data-edit-match="${attrs(m.id)}">✎ Düzenle</button>`:''}
 ${canDeleteMatch?`<button class="btn small ghost" data-delete-match="${attrs(m.id)}">Maçı Sil</button>`:''}
 ${adminInfo?`<button class="btn small ghost" data-open-link="${attrs(m.id)}">🔗 Oyuncu Eşleştir</button>`:''}${completed&&adminInfo?`<label class="vest-record">🎽 Yelek giyen takım <select data-vest-match="${attrs(m.id)}"><option value="" ${!m.vest_team?'selected':''}>Henüz girilmedi</option><option value="red" ${m.vest_team==='red'?'selected':''}>🔴 Kırmızı</option><option value="white" ${m.vest_team==='white'?'selected':''}>⚪ Beyaz</option></select></label>`:completed&&m.vest_team?`<span class="vest-record">🎽 Yelek: ${m.vest_team==='red'?'Kırmızı':'Beyaz'}</span>`:''}
 </div><div id="roster-${attrs(m.id)}" class="match-roster hidden">
 ${teamsReady?`<div class="szf-team-ready"><strong>⚽ Saha Dizilişi</strong><p class="soft">Kırmızı ve beyaz takımlar · 7’ye 7</p><div class="szf-pitches">${positionHTML('red')}${positionHTML('white')}</div></div>`:`<div class="szf-team-missing">Takımlar henüz belirlenmedi.</div>`}
 ${adminInfo?`${historicAssign}${!completed?`<div class="szf-inline-forms"><input id="guest-name-${attrs(m.id)}" placeholder="Anonim oyuncunun adı" maxlength="70"><select id="guest-position-${attrs(m.id)}"><option value="KL">Kaleci</option><option value="DEF">Defans</option><option value="ORT">Orta saha</option><option value="FOR">Forvet</option></select><button class="btn small lime" data-guest-add="${attrs(m.id)}">Anonim oyuncuyu ekle</button></div>`:''}`:''}
 ${teamsReady?`<div class="szf-postmatch">${completed?detailHTML:''}</div>`:adminInfo?detailHTML:''}
 </div></div></article>`;
}
async function shareMatchCard(id){
 const m=leagueMatches.find(x=>String(x.id)===String(id));
 const red=Number(m?.red_score), white=Number(m?.white_score);
 if(!m||m.red_score==null||m.white_score==null||!Number.isInteger(red)||!Number.isInteger(white)||red<0||white<0)return toast('Önce maç skorunu kaydet.',true);
 const guests=extras.guests.filter(g=>String(g.match_id)===String(id));
 const people=weeklyPlayers.filter(p=>String(p.match_id)===String(id));
 const cards=currentCards();
 const nameOf=id=>cards.find(c=>String(c.id)===String(id))?.display_name||'Oyuncu';
 const guestName=g=>g?.linked_player_id?nameOf(g.linked_player_id):(g?.display_name||'Misafir');
 const roster=color=>[...people.filter(x=>x.team_color===color).map(x=>({name:nameOf(x.player_id),id:String(x.player_id)})),...guests.filter(x=>x.team_color===color).filter(x=>!x.linked_player_id||!people.some(p=>String(p.player_id)===String(x.linked_player_id))).map(x=>({name:guestName(x),id:String(x.id)}))];
 const teams=[roster('red'),roster('white')];
 const events=extras.events.filter(e=>String(e.match_id)===String(id));
 const eventName=e=>e.guest_id?guestName(guests.find(g=>String(g.id)===String(e.guest_id))):nameOf(e.player_id);
 const stats=kind=>{const map=new Map();for(const e of events.filter(e=>e.kind===kind)){const n=eventName(e);map.set(n,(map.get(n)||0)+1);}return [...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'tr'));};
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1480;
 const c=canvas.getContext('2d');if(!c)return toast('Görsel oluşturulamadı.',true);
 const W=1080,H=1480;
 const round=(x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}};
 const text=(str,x,y,size=26,color='#fff',weight=600,align='left',max=0)=>{c.font=`${weight} ${size}px Arial, sans-serif`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';let t=String(str??'');if(max){while(t.length>1&&c.measureText(t).width>max)t=t.slice(0,-2);if(t!==String(str??''))t+='…';}c.fillText(t,x,y);};
 const rule=(x,y,w,color='#385844')=>round(x,y,w,2,1,color);
 const bg=c.createLinearGradient(0,0,1080,1480);bg.addColorStop(0,'#132f23');bg.addColorStop(.5,'#081c16');bg.addColorStop(1,'#071510');c.fillStyle=bg;c.fillRect(0,0,W,H);
 // Stadium lighting and faint pitch lines
 const glow=c.createRadialGradient(540,220,20,540,260,690);glow.addColorStop(0,'rgba(174,245,99,.14)');glow.addColorStop(1,'rgba(174,245,99,0)');c.fillStyle=glow;c.fillRect(0,0,W,1000);
 c.globalAlpha=.12;c.strokeStyle='#a7d3a2';c.lineWidth=2;c.strokeRect(35,35,1010,1280);c.strokeRect(55,56,970,1240);c.globalAlpha=1;
 round(74,80,932,58,12,'#b6f36c');text('SZF  AIRPORT  HALI SAHA',540,110,23,'#10231a',900,'center');
 text('MAÇ GÜNÜ  /  FİNAL SKORU',540,183,19,'#b8d49f',800,'center');
 text((m.title||'Haftalık Maç').split('[Saha:')[0].trim().toLocaleUpperCase('tr-TR'),540,233,40,'#f4f9ef',900,'center',860);
 text(matchDateText(m.match_date),540,280,22,'#aac0ab',500,'center',820);
 // Hero scoreboard
 round(74,325,932,313,30,'#112b20','#496d4c');
 round(93,346,273,270,22,'#632c36','#9e4654');round(714,346,273,270,22,'#dce4de','#ffffff');
 text('KIRMIZI',230,389,26,'#ffd8d9',900,'center');text('BEYAZ',850,389,26,'#1f3728',900,'center');
 text('TAKIM',230,421,18,'#ffc1c1',650,'center');text('TAKIM',850,421,18,'#4a5a4f',650,'center');
 text(red,445,478,122,'#ffffff',900,'center');text('–',540,474,64,'#b9f66d',700,'center');text(white,635,478,122,'#ffffff',900,'center');
 const winner=red>white?'KIRMIZI TAKIM KAZANDI':white>red?'BEYAZ TAKIM KAZANDI':'BERABERE';
 round(376,554,328,49,25,'#20422c');text(winner,540,579,17,'#c2f784',900,'center',306);
 // Squad panels
 const drawTeam=(list,x,label,accent)=>{
  round(x,662,451,366,25,'#123126','#3b624b');round(x+20,684,8,30,4,accent);
  text(label,x+42,701,24,'#f3f8f0',900);text(`${list.length}/7`,x+418,701,20,'#b9cfb7',800,'right');rule(x+24,738,403);
  list.slice(0,7).forEach((p,i)=>{const yy=766+i*35;text(String(i+1).padStart(2,'0'),x+30,yy,18,'#8aa996',800);text(p.name,x+74,yy,22,'#f3f9f0',650,'left',336);});
  if(!list.length)text('Kadro kaydı bulunamadı',x+26,795,20,'#a6b8aa',500);
 };
 drawTeam(teams[0],74,'KIRMIZI','#fa6474');drawTeam(teams[1],555,'BEYAZ','#e8f0ed');
 // Each goal belongs to the scoring side. Own goals count for the opposing side.
 const goalEvents=events.filter(e=>e.kind==='goal'||e.kind==='own_goal');
 const assists=events.filter(e=>e.kind==='assist');
 const teamFor=e=>{if(e.guest_id)return guests.find(g=>String(g.id)===String(e.guest_id))?.team_color;return people.find(p=>String(p.player_id)===String(e.player_id))?.team_color;};
 const goalLines=color=>goalEvents.filter(e=>{const side=teamFor(e);return e.kind==='own_goal'?(side&&side!==color):side===color;}).map(e=>{const a=assists.find(a=>String(a.goal_event_id||'')===String(e.id));return `${eventName(e)}${e.kind==='own_goal'?' (KK)':a?' ('+eventName(a)+')':''}`;});
 const drawGoalPanel=(color,x,accent)=>{const lines=goalLines(color);round(x,1052,451,315,25,'#112b21','#41634a');round(x+20,1072,8,29,4,accent);text('GOLLER',x+43,1088,23,'#d0f88d',900);if(!lines.length)text('Gol kaydı bulunamadı',x+25,1135,19,'#9bb5a4',500);lines.slice(0,8).forEach((line,i)=>text(line,x+24,1130+i*29,19,'#eef8ec',600,'left',405));if(lines.length>8)text(`+${lines.length-8} gol daha`,x+24,1340,17,'#b8d49f');};
 drawGoalPanel('red',74,'#fa6474');drawGoalPanel('white',555,'#e8f0ed');
 text('SZF AIRPORT HALI SAHA  •  BİRLİKTE DAHA GÜÇLÜ',540,1422,17,'#9db9a1',800,'center');
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)return toast('Afiş oluşturulamadı.',true);
 const url=URL.createObjectURL(blob);
 document.getElementById('szf-share-preview')?.remove();
 const layer=document.createElement('div');layer.id='szf-share-preview';layer.className='szf-share-overlay';
 layer.innerHTML=`<section class="szf-share-dialog" role="dialog" aria-modal="true" aria-label="Maç sonucu afişi"><div class="szf-share-toolbar"><strong>Maç sonucu · Paylaşım önizlemesi</strong><button type="button" class="szf-share-close" aria-label="Kapat">✕</button></div><img class="szf-share-image" alt="Maç sonucu afişi"/><div class="szf-share-actions"><button type="button" class="btn lime" data-share-export>Görseli kaydet / paylaş</button><button type="button" class="btn" data-share-dismiss>Kapat</button></div></section>`;
 document.body.appendChild(layer);layer.querySelector('img').src=url;
 const close=()=>{layer.remove();URL.revokeObjectURL(url);};
 layer.querySelector('.szf-share-close').onclick=close;layer.querySelector('[data-share-dismiss]').onclick=close;
 layer.onclick=e=>{if(e.target===layer)close();};
 layer.querySelector('[data-share-export]').onclick=async()=>{
  const filename=`SZF-Mac-Sonucu-${String(id).slice(0,8)}.png`;
  const file=new File([blob],filename,{type:'image/png'});
  try{if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'SZF Airport Halı Saha'});return;}}catch(e){if(e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();toast('Maç afişi PNG olarak kaydedildi.');
 };
}

function rosterPickerItems(){
 const m=rosterPickerMatch,people=weeklyPlayers.filter(x=>x.match_id===m);
 const arr=sortPlayerCards(currentCards().filter(c=>c.display_name.toLocaleLowerCase('tr').includes(rosterSearch.toLocaleLowerCase('tr'))));
 return arr.map(c=>{
  const joined=people.some(x=>x.player_id===c.id),declined=matchDeclines.some(x=>x.match_id===m&&x.player_id===c.id);
  const photo=publicProfiles.find(p=>p.id===c.id)?.avatar_path;
  const avatar=photo
   ? `<img src="${attrs(avatarUrl(photo))}" alt="" loading="lazy">`
   : `<span>${esc(getAvatarInitials(c.display_name))}</span>`;
  return `<div class="roster-pick-item"><div class="roster-pick-photo">${avatar}</div><div class="roster-pick-info"><b>${esc(formatPersonName(c.display_name))}</b><span>${esc(c.position)} · Genel ${publicRating(c)}</span></div><button class="btn small ${joined?'ghost':'lime'}" ${joined||declined||people.length>=14?'disabled':''} data-add-roster="${attrs(m)}" data-playerid="${attrs(c.id)}">${joined?'Kadrodaki oyuncu':declined?'Katılamıyor':people.length>=14?'Kadro dolu':'＋ Ekle'}</button></div>`
 }).join('')||'<p>Oyuncu bulunamadı.</p>';
}
function bindRosterPickerActions(){
 document.querySelectorAll('[data-add-roster]').forEach(el=>el.addEventListener('click',()=>addRosterPlayer(el.dataset.addRoster,el.dataset.playerid)));
 document.querySelectorAll('[data-remove-roster]').forEach(el=>el.addEventListener('click',()=>removeRosterPlayer(el.dataset.removeRoster,el.dataset.playerid)));
}
async function addRosterPlayer(match,player){
 if(!user)return toast('Giriş yapmalısın.',true);
 const {error}=await db.rpc('szf_add_match_player_v23',{p_match:match,p_player:player});
 if(error)return toast('Oyuncu eklenemedi: '+formatError(error),true);
 rosterPickerMatch=null;await loadLeagueData();render();toast('Oyuncu kadroya eklendi.');
}
async function removeRosterPlayer(match,player){
 if(!user)return toast('Giriş yapmalısın.',true);
 const {error}=await db.rpc('szf_remove_match_player_v23',{p_match:match,p_player:player});
 if(error)return toast('Oyuncu çıkarılamadı: '+formatError(error),true);
 await loadLeagueData();render();toast('Oyuncu kadrodan çıkarıldı.');
}
let selectedMatchTab='upcoming';
let rivalryLeft='',rivalryRight='',rivalryCompared=false;
function matchRivalry(){
 const cards=currentCards().filter(p=>p.id&&p.display_name).sort((a,b)=>formatPersonName(a.display_name).localeCompare(formatPersonName(b.display_name),'tr'));
 const names=new Map(cards.map(p=>[String(p.id),formatPersonName(p.display_name)]));
 const choices=cards.map(p=>`<option value="${attrs(p.id)}">${esc(formatPersonName(p.display_name))}</option>`).join('');
 const picker=`<div class="szf-rival-picker"><label>Birinci oyuncu<select class="text-input" id="rivalryLeft"><option value="">Oyuncu seç</option>${choices}</select></label><span class="szf-rival-versus">VS</span><label>İkinci oyuncu<select class="text-input" id="rivalryRight"><option value="">Oyuncu seç</option>${choices}</select></label><button type="button" class="btn lime" id="rivalryCompare" ${!rivalryLeft||!rivalryRight||rivalryLeft===rivalryRight?'disabled':''}>Karşılaştır</button></div>`;
 if(!rivalryCompared||!rivalryLeft||!rivalryRight||rivalryLeft===rivalryRight)return picker;
 // Hesapla eşleştirilmiş eski misafir maçlarını da dahil et.
 // playerMatchEntries, normal ve misafir katılımları tek maç olarak birleştirir.
 const leftEntries=new Map(playerMatchEntries(rivalryLeft).filter(x=>['red','white'].includes(x.team_color)).map(x=>[String(x.match_id),x.team_color]));
 const rightEntries=new Map(playerMatchEntries(rivalryRight).filter(x=>['red','white'].includes(x.team_color)).map(x=>[String(x.match_id),x.team_color]));
 let played=0,leftWins=0,rightWins=0,draws=0;
 for(const m of leagueMatches){
  if(m.status!=='completed')continue;
  const mid=String(m.id),leftTeam=leftEntries.get(mid),rightTeam=rightEntries.get(mid);
  if(!leftTeam||!rightTeam||leftTeam===rightTeam)continue;
  const red=m.red_score,white=m.white_score;
  const scored=red!==null&&red!==undefined&&red!==''&&white!==null&&white!==undefined&&white!==''&&Number.isFinite(Number(red))&&Number.isFinite(Number(white));
  const outcome=scored?(Number(red)>Number(white)?'red':Number(white)>Number(red)?'white':'draw'):m.result;
  if(!['red','white','draw'].includes(outcome))continue;
  played++;
  if(outcome==='draw')draws++;else if(outcome===leftTeam)leftWins++;else if(outcome===rightTeam)rightWins++;
 }
 const result=played?`<div class="szf-rivals-grid"><div class="szf-rival-card"><div class="szf-rival-people"><strong>${esc(names.get(rivalryLeft)||'Oyuncu')}</strong><span>VS</span><strong>${esc(names.get(rivalryRight)||'Oyuncu')}</strong></div><div class="szf-rival-score"><b>${leftWins}</b><span>${draws} beraberlik · ${played} maç</span><b>${rightWins}</b></div></div></div>`:'<p class="match-empty">Bu iki oyuncu tamamlanmış maçlarda rakip olarak karşılaşmamış.</p>';
 return picker+result;
}
function renderMatches(){
 if(!user)return sectionHead('Maçlar','Planlanan ve tamamlanan maçlar')+'<p class="empty">Maçları görmek için giriş yap.</p>';
 const future=leagueMatches.filter(m=>m.status!=='completed'&&new Date(m.match_date).getTime()>Date.now()).sort((a,b)=>new Date(a.match_date)-new Date(b.match_date));
 const past=leagueMatches.filter(m=>m.status==='completed'||new Date(m.match_date).getTime()<=Date.now()).sort((a,b)=>new Date(b.match_date)-new Date(a.match_date));
 const linkGuests=extras.guests.filter(g=>!linkedPlayerId(g));
 const linkPanel='';
 const header=`<div class="match-page-heading"><div><p class="match-overline">MAÇ TAKVİMİ</p><h2>Maç günü tamam.</h2><p>Kaydol, ekibi topla ve dengeli takımlarını kur.</p></div><button id="openMatchDialog" class="btn lime">+ Maç Oluştur</button></div>`;
 const tabs=[['upcoming','📅 Yaklaşan Maçlar'],['history','🕘 Maç Geçmişi'],['rivalry','⚔️ Rekabet']];
 const content=`<div class="szf-match-tabs" role="tablist" aria-label="Maçlar alt bölümleri">${tabs.map(([key,title])=>`<button class="szf-match-tab ${selectedMatchTab===key?'active':''}" type="button" role="tab" aria-selected="${selectedMatchTab===key}" data-match-tab="${key}">${title}</button>`).join('')}</div><div class="szf-match-tab-body" role="tabpanel">${selectedMatchTab==='history'?`${linkPanel}<div class="match-section-title">MAÇ GEÇMİŞİ · ${past.length} MAÇ</div>${past.length?past.map(matchBlock).join(''):'<p class="match-empty">Henüz tamamlanan maç yok.</p>'}`:selectedMatchTab==='rivalry'?`<div class="match-section-title">OYUNCULAR ARASI REKABET</div><p class="soft">Karşılıklı galibiyetler, beraberlikler ve toplam rakip karşılaşmalar.</p>${matchRivalry()}`:`<div class="match-section-title">SIRADAKİ MAÇLAR · ${future.length} KAYIT</div>${future.length?future.map(matchBlock).join(''):'<p class="match-empty">Planlanan maç yok.</p>'}`}</div>`;
 const dialog=`<dialog id="matchCreateDialog" class="match-create-dialog"><form id="newMatchForm"><div class="match-dialog-head"><div><small>HAFTAYI PLANLA</small><h2 id="matchDialogHeading">Yeni maçı ayarla</h2><p>Gün ve saha seç; oyuncular maça kaydolabilsin.</p></div><button type="button" id="closeMatchDialog" class="btn small ghost" aria-label="Kapat">✕</button></div>
 <label>MAÇ ADI<input class="text-input" id="matchTitle" required maxlength="55" value="Haftalık Maç"></label>
 <label>SAHA<input class="text-input" id="matchVenue" maxlength="35" placeholder="Saha adı veya adres" /></label>
 <label>TARİH VE SAAT<input class="text-input" type="datetime-local" id="matchDate" required></label>
 <p>Maç bilgileri değiştirildiğinde mevcut katılımcılar korunur.</p><div class="match-dialog-buttons"><button type="button" class="btn ghost" id="cancelMatchDialog">Vazgeç</button><button type="submit" id="matchSubmitButton" class="btn lime">Maçı oluştur ↗</button></div></form></dialog>`;
 return `<section class="matches-page">${header}${content}</section>${dialog}${rosterPickerMatch?`<dialog id="rosterPickerDialog" class="match-create-dialog roster-picker-dialog"><div class="match-dialog-head"><div><small>KADROYU TAMAMLA</small><h2>Oyuncu Ekle</h2><p>Oyuncu kartlarından seçerek maça ekle.</p></div><button class="btn small ghost" id="closeRosterPicker">✕</button></div><input id="rosterSearch" class="text-input" placeholder="Oyuncu ismi ara..." value="${attrs(rosterSearch)}"><div class="roster-picker-list">${rosterPickerItems()}</div><div class="guest-picker-section"><button type="button" class="btn ghost" id="toggleGuestPicker">＋ Anonim Oyuncu Ekle</button><div id="guestPickerFields" class="hidden"><p class="soft">Hesabı olmayan oyuncuyu maça ekle.</p><input id="pickerGuestName" class="text-input" maxlength="70" placeholder="Anonim oyuncunun adı"><select id="pickerGuestPosition" class="text-input"><option value="KL">Kaleci</option><option value="DEF">Defans</option><option value="ORT">Orta saha</option><option value="FOR">Forvet</option></select><button type="button" class="btn lime" id="submitPickerGuest">Anonim oyuncuyu ekle</button></div></div></dialog>`:''}`;
}
function renderLeague(){
 const b=leagueWallet?.balance??0;
 const rows=leagueStandings.map((w,i)=>`<div class="league-rank"><span>${i+1}.</span><strong>${esc(formatPersonName(w.display_name||'Oyuncu'))}</strong><span>${i===0?'👑 Bahis Baronu':i===1?'🐺 Kupon Kurdu':i===2?'🎯 Tahmin Avcısı':''}</span><b>${Number(w.balance).toLocaleString('tr-TR')} kredi</b></div>`).join('');
 const bets=leagueMatches.filter(m=>m.status==='open').map(m=>`<div class="match-panel"><div><b>${esc(m.title)}</b><p class="soft">${esc(new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}).format(new Date(m.match_date)))}<br><span class="bet-odds"><strong>Oranlar:</strong> 🔴 Kırmızı 2.00 <span class="bet-odds-sep">·</span> 🤝 Beraberlik 5.00 <span class="bet-odds-sep">·</span> ⚪ Beyaz 2.00</span></p></div><div class="bet-options"><select data-bet-result="${m.id}"><option value="red">🔴 Kırmızı kazanır</option><option value="draw">🤝 Beraberlik</option><option value="white">⚪ Beyaz kazanır</option></select><input type="number" id="stake-${m.id}" min="1" max="${b}" value="${Math.min(100,b)}" placeholder="Kredi"><button class="btn small ghost" data-allin="${m.id}">🔥 ALL-IN</button><button class="btn small lime" data-bet="${m.id}" ${b<1?'disabled':''}>Tahmin yap</button></div></div>`).join('');
 return sectionHead('🏆 Bahis Ligi','Gerçek para olmayan, sadece eğlencelik sanal kredi tahminleri')+`<div class="league-wallet"><small>TOPLAM SANAL KREDİ</small><h2>${Number(b).toLocaleString('tr-TR')} kredi</h2><p>İlk kayıt: 1.000 · Her hafta +1.000 · Kalan krediler birikir</p></div><h3>Açık maçlar</h3>${bets||'<p class="empty">Tahmine açık maç yok.</p>'}<h3>🏆 Kredi sıralaması</h3>${rows||'<p class="empty">Henüz sıralama yok.</p>'}`;
}

function render(){
 displayMode();
 const headings={home:'ANA SAYFA',players:'OYUNCULAR',ranking:'SIRALAMA',statistics:'İSTATİSTİKLER',teams:'TAKIM KUR',matches:'MAÇLAR',assessment:'OYUNCU DEĞERLENDİR',league:'BAHİS LİGİ',account:'HESABIM'};
 $('crumbPage').textContent=selectedPlayer?'OYUNCU DETAY':headings[view];
 document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
 $('content').innerHTML=selectedPlayer?detail(currentCards().find(c=>c.id===selectedPlayer)):view==='home'?renderHome():view==='players'?renderPlayers():view==='ranking'?renderRanking():view==='statistics'?renderStatistics():view==='teams'?renderTeams():view==='matches'?renderMatches():view==='assessment'?renderAssessment():view==='league'?renderLeague():renderAccount();
 if(view==='matches')for(const id of openMatchRosters){$('roster-'+id)?.classList.remove('hidden');$('roster-'+id)?.closest('.szf-history-compact')?.classList.add('szf-history-open');}
 bindContent();
}
function bindContent(){
 document.querySelectorAll('[data-match-tab]').forEach(btn=>btn.addEventListener('click',()=>{selectedMatchTab=btn.dataset.matchTab;render()}));
 const rivalryA=$('rivalryLeft'),rivalryB=$('rivalryRight');
 if(rivalryA&&rivalryB){
  rivalryA.value=rivalryLeft;rivalryB.value=rivalryRight;
  const onChoice=()=>{rivalryLeft=rivalryA.value;rivalryRight=rivalryB.value;rivalryCompared=false;render()};
  rivalryA.addEventListener('change',onChoice);rivalryB.addEventListener('change',onChoice);
  $('rivalryCompare')?.addEventListener('click',()=>{if(!rivalryLeft||!rivalryRight||rivalryLeft===rivalryRight)return;rivalryCompared=true;render()});
 }

 document.querySelectorAll('[data-stats-tab]').forEach(btn=>btn.addEventListener('click',()=>{selectedStatsTab=btn.dataset.statsTab;render()}));
 document.querySelectorAll('[data-home-nav]').forEach(el=>el.addEventListener('click',()=>{view=el.dataset.homeNav;selectedPlayer=null;render();window.scrollTo({top:0,behavior:'smooth'});}));
 document.querySelectorAll('[data-player]').forEach(el=>el.addEventListener('click',()=>{selectedPlayer=el.dataset.player;render();document.querySelector('#content').scrollIntoView({behavior:'smooth',block:'start'});}));
 document.querySelectorAll('[data-back]').forEach(el=>el.addEventListener('click',()=>{selectedPlayer=null;render()}));
 document.querySelectorAll('[data-login]').forEach(el=>el.addEventListener('click',()=>openAuth()));
 $('v70VoteForm')?.addEventListener('submit',submitV70Vote);
 const ratingForm=$('v70VoteForm');
 if(ratingForm){
  const target=ratingForm.dataset.target;
  const existing=myVotes.find(v=>String(v.target_id)===String(target));
  const saved=Array.isArray(existing?.scores)?existing.scores.map(Number):null;
  const updateAverage=()=>{
   const inputs=[...ratingForm.querySelectorAll('[data-v70-score]')];
   const complete=inputs.length===6&&inputs.every(el=>el.value.trim()!==''&&Number.isInteger(Number(el.value))&&Number(el.value)>=1&&Number(el.value)<=99);
   const scores=inputs.map(el=>Number(el.value));
   const out=$('szf-live-rating')?.querySelector('strong');
   if(out)out.textContent=complete?String(Math.round(scores.reduce((sum,v)=>sum+v,0)/6)):'—';
   const btn=$('v70SubmitBtn');
   if(btn){const changed=!saved||saved.length!==6||scores.some((v,i)=>v!==saved[i]);btn.disabled=!complete||!changed;btn.setAttribute('aria-disabled',String(btn.disabled));}
  };
  ratingForm.addEventListener('input',updateAverage);ratingForm.addEventListener('change',updateAverage);updateAverage();
 }

 $('v70Target')?.addEventListener('change',e=>{weeklyIndex=Number(e.target.value);render()});
 
 document.querySelectorAll('[data-team]').forEach(el=>el.addEventListener('change',()=>{teamData=null;el.checked?teamSelections.add(el.dataset.team):teamSelections.delete(el.dataset.team);render()}));
 document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',async()=>{
  const requestedMode=el.dataset.mode;
  teamMode=requestedMode;teamData=null;render();
  // Otomatik Dengeli tek tiklamada takimi kurar; yalnizca mod secmez.
  if(requestedMode==='auto')await buildTeams();
 }));
 document.querySelectorAll('[data-toggle-red]').forEach(el=>el.addEventListener('click',()=>{
 const id=el.dataset.toggleRed;
 if(manualRed.has(id))manualRed.delete(id);
 else if(manualRed.size>=7)return toast('Kırmızı takımda en fazla 7 oyuncu olabilir.',true);
 else manualRed.add(id);
 teamData=null;render();
}));
 document.querySelectorAll('[data-red]').forEach(el=>el.addEventListener('change',()=>{el.checked?manualRed.add(el.dataset.red):manualRed.delete(el.dataset.red);render()}));
 document.querySelector('[data-assess-prev]')?.addEventListener('click',()=>{weeklyIndex=Math.max(0,weeklyIndex-1);render()});
 document.querySelector('[data-assess-next]')?.addEventListener('click',()=>{weeklyIndex=Math.min(weeklyIndex+1,currentCards().filter(c=>String(c.id)!==String(user.id)).length-1);render()});
 document.querySelectorAll('[data-assessment-select]').forEach(el=>el.addEventListener('click',()=>{weeklyIndex=Number(el.dataset.assessmentSelect);render()}));
 document.querySelectorAll('[data-assess]').forEach(el=>el.addEventListener('click',()=>submitAssessment(el.dataset.match,el.dataset.player,el.dataset.assess,Number(el.dataset.delta))));
 document.querySelectorAll('[data-bet]').forEach(el=>el.addEventListener('click',()=>submitBet(el.dataset.bet)));
 document.querySelectorAll('[data-allin]').forEach(el=>el.addEventListener('click',()=>{const field=$('stake-'+el.dataset.allin);if(field)field.value=leagueWallet?.balance||0}));
 document.querySelectorAll('[data-open-guest-form]').forEach(el=>el.addEventListener('click',()=>{if(!adminInfo)return toast('Anonim oyuncu eklemek için yönetici yetkisi gerekiyor. Yönetici hesabının Supabase yetkisini kontrol et.',true);const id=el.dataset.openGuestForm;const panel=$('roster-'+id);if(panel){panel.classList.remove('hidden');panel.scrollIntoView({behavior:'smooth',block:'nearest'});$('guest-name-'+id)?.focus();}}));
 document.querySelectorAll('[data-guest-add]').forEach(el=>el.addEventListener('click',()=>addGuest(el.dataset.guestAdd)));
 $('adminLinkNow')?.addEventListener('click',async()=>{const guest=$('adminGuestLink')?.value,player=$('adminUserLink')?.value;if(!guest||!player)return toast('Anonim ve kayıtlı oyuncuyu seç.',true);const gn=extras.guests.find(g=>g.id===guest)?.display_name||'Anonim oyuncu';const pn=currentCards().find(c=>c.id===player)?.display_name||'Kayıtlı oyuncu';if(!confirm(`${gn} kaydını ${pn} hesabıyla eşleştir?`))return;await guestAction(guest,'link',player);});
 document.querySelectorAll('[data-open-guest-link]').forEach(el=>el.addEventListener('click',async()=>{if(!adminInfo)return;const guest=extras.guests.find(g=>String(g.id)===String(el.dataset.openGuestLink));if(!guest)return;const cards=currentCards();const name=prompt(`${guest.display_name} (Misafir) hesabını eşleştir. Kayıtlı oyuncu adını yaz:\n${cards.map(c=>formatPersonName(c.display_name)).join('\n')}`);if(!name)return;const match=cards.filter(c=>formatPersonName(c.display_name).toLocaleLowerCase('tr')===formatPersonName(name).toLocaleLowerCase('tr'));if(match.length!==1)return toast('Tek bir kayıtlı oyuncunun tam adını yaz.',true);if(!confirm(`${guest.display_name} → ${match[0].display_name} eşleştirilsin mi?`))return;await guestAction(guest.id,'link',match[0].id);}));
 document.querySelectorAll('[data-history-team]').forEach(el=>el.addEventListener('change',async()=>{if(!adminInfo)return;const match=el.dataset.historyMatch,id=el.dataset.historyTeam;const fn=el.dataset.historyGuest==='1'?'szf_history_guest_team_v97':'szf_history_player_team_v97';const args=el.dataset.historyGuest==='1'?{p_guest:id,p_team:el.value||null}:{p_match:match,p_player:id,p_team:el.value||null};const {error}=await db.rpc(fn,args);if(error)return toast('Geçmiş takım kaydı için v97 SQL kurulumunu kontrol et: '+formatError(error),true);openMatchRosters.add(match);await loadLeagueData();render();toast('Takım kaydedildi.');}));
 document.querySelectorAll('[data-link-guest]').forEach(el=>el.addEventListener('change',()=>{if(el.value&&confirm('Bu misafir kaydını seçilen kullanıcıyla eşleştir?'))guestAction(el.dataset.linkGuest,'link',el.value)}));
 document.querySelectorAll('[data-guest-team]').forEach(el=>el.addEventListener('change',()=>guestAction(el.dataset.guestTeam,'team',el.value)));
 document.querySelectorAll('[data-remove-guest]').forEach(el=>el.addEventListener('click',()=>{if(confirm('Misafiri bu maçtan çıkar?'))guestAction(el.dataset.removeGuest,'remove')}));
 document.querySelectorAll('[data-leave-queue]').forEach(el=>el.addEventListener('click',()=>leaveQueue(el.dataset.leaveQueue)));
 document.querySelectorAll('[data-open-link]').forEach(el=>el.addEventListener('click',()=>{const panel=document.querySelector('.szf-admin-link');if(panel){panel.scrollIntoView({behavior:'smooth',block:'center'});panel.querySelector('#adminGuestLink')?.focus();}else toast('Eşleştirme paneli yalnızca yöneticilere açıktır.',true);}));
 document.querySelectorAll('[data-score-editor]').forEach(el=>el.addEventListener('click',()=>{const panel=$('roster-'+el.dataset.scoreEditor);if(panel){openMatchRosters.add(el.dataset.scoreEditor);panel.classList.remove('hidden');panel.scrollIntoView({behavior:'smooth',block:'center'});}}));
 document.querySelectorAll('[data-save-score]').forEach(el=>el.addEventListener('click',async()=>{if(!adminInfo)return;const id=el.dataset.saveScore;const r=$('score-red-'+id)?.value,w=$('score-white-'+id)?.value;if(r===''||w==='')return toast('İki takımın skorunu da gir.',true);const red=Number(r),white=Number(w);if(!Number.isInteger(red)||!Number.isInteger(white)||red<0||white<0||red>99||white>99)return toast('Skor 0-99 arası olmalı.',true);const {error}=await db.rpc('szf_save_match_score_v94',{p_match:id,p_red:red,p_white:white});if(error)return toast('SQL v94 kurulumunu kontrol et: '+formatError(error),true);
 const result=red>white?'red':red<white?'white':'draw';
 const existing=leagueMatches.find(m=>String(m.id)===String(id));
 if(existing?.status==='completed'){
  const changed=await db.from('szf_matches').update({result}).eq('id',id).select('id');
  if(changed.error||!changed.data?.length){await loadLeagueData();openMatchRosters.add(id);render();return toast('Skor kaydedildi, kazanan güncellenemedi: '+formatError(changed.error||{message:'Güncelleme yetkisini kontrol edin'}),true);}
 }else{
  const settled=await db.rpc('szf_settle_match',{p_match:id,p_result:result});
  if(settled.error){await loadLeagueData();openMatchRosters.add(id);render();return toast('Skor kaydedildi, ancak maç sonuçlandırılamadı: '+formatError(settled.error),true);}
 }
 await loadLeagueData();openMatchRosters.add(id);render();toast('Maç sonucu kaydedildi.');}));
 document.querySelectorAll('[data-add-event]').forEach(el=>el.addEventListener('click',()=>addEvent(el.dataset.addEvent)));
 document.querySelectorAll('[data-mvp]').forEach(el=>el.addEventListener('click',()=>voteMvp(el.dataset.mvp)));
 document.querySelectorAll('[data-share-match]').forEach(el=>el.addEventListener('click',()=>shareMatchCard(el.dataset.shareMatch)));
 document.querySelectorAll('[data-delete-event]').forEach(el=>el.addEventListener('click',async()=>{if(!confirm('Gol/asist kaydını sil?'))return;const {error}=await db.rpc('szf_delete_event_v53',{p_event:el.dataset.deleteEvent});if(error)return toast(formatError(error),true);await loadLeagueData();render()}));
 document.querySelectorAll('[data-join]').forEach(el=>el.addEventListener('click',()=>toggleParticipant(el.dataset.join,user.id)));
 document.querySelectorAll('[data-decline]').forEach(el=>el.addEventListener('click',()=>toggleDecline(el.dataset.decline)));
 document.querySelectorAll('[data-participants]').forEach(el=>el.addEventListener('click',()=>manageParticipants(el.dataset.participants)));
 document.querySelectorAll('[data-edit-match]').forEach(el=>el.addEventListener('click',()=>openMatchEditor(el.dataset.editMatch)));
 document.querySelectorAll('[data-delete-match]').forEach(el=>el.addEventListener('click',()=>deleteMatch(el.dataset.deleteMatch)));
 document.querySelectorAll('[data-match-complete]').forEach(el=>el.addEventListener('click',()=>completeMatch(el.dataset.matchComplete)));
 $('newMatchForm')?.addEventListener('submit',createMatch);
 $('openMatchDialog')?.addEventListener('click',()=>{editingMatchId=null; $('newMatchForm')?.reset();$('matchTitle').value='Haftalık Maç';$('matchDialogHeading').textContent='Yeni maçı ayarla';$('matchSubmitButton').textContent='Maçı oluştur ↗';$('matchCreateDialog')?.showModal()});
 ['closeMatchDialog','cancelMatchDialog'].forEach(id=>$(id)?.addEventListener('click',()=>$('matchCreateDialog')?.close()));
 document.querySelectorAll('[data-roster]').forEach(el=>el.addEventListener('click',()=>{const id=el.dataset.roster;if(openMatchRosters.has(id))openMatchRosters.delete(id);else openMatchRosters.add(id);$('roster-'+id)?.classList.toggle('hidden');$('roster-'+id)?.closest('.szf-history-compact')?.classList.toggle('szf-history-open',openMatchRosters.has(id))}));
 document.querySelectorAll('[data-team-match]').forEach(el=>el.addEventListener('change',()=>assignMatchTeam(el.dataset.teamMatch,el.dataset.teamPlayer,el.value)));
 document.querySelectorAll('[data-vest-match]').forEach(el=>el.addEventListener('change',()=>saveVest(el.dataset.vestMatch,el.value)));
 
 $('buildTeams')?.addEventListener('click',buildTeams);
 $('saveTeamsToMatch')?.addEventListener('click',saveTeamsToNextMatch);
 $('profileForm')?.addEventListener('submit',saveProfile);
 $('editPhoto')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(file)prepareCrop(file);else if(!editingCurrentPhoto)$('cropPreview')?.classList.add('hidden')});
 $('editCurrentPhoto')?.addEventListener('click',editSavedPhoto);
 $('removeCurrentPhoto')?.addEventListener('click',removeSavedPhoto);
 ['cropZoom','cropVertical','cropHorizontal'].forEach(id=>$(id)?.addEventListener('input',showCropPreview));
 $('signoutAccount')?.addEventListener('click',signOut);
 $('playerSearch')?.addEventListener('input', e=>{const pos=e.target.selectionStart;search=e.target.value;const active=document.activeElement;render();if(active?.id==='playerSearch'){$('playerSearch')?.focus();$('playerSearch')?.setSelectionRange(pos,pos)}});
 document.querySelectorAll('[data-sort-kind]').forEach(btn=>btn.addEventListener('click',()=>{
  if(btn.dataset.sortKind==='player')playerSort=btn.dataset.sortValue;
  else rankingSort=btn.dataset.sortValue;
  render();
 }));
 document.querySelectorAll('[data-open-roster-picker]').forEach(el=>el.addEventListener('click',()=>{rosterPickerMatch=el.dataset.openRosterPicker;rosterSearch='';render();$('rosterPickerDialog')?.showModal()}));
 $('closeRosterPicker')?.addEventListener('click',()=>{rosterPickerMatch=null;render()});
 $('toggleGuestPicker')?.addEventListener('click',()=>{const el=$('guestPickerFields');el?.classList.toggle('hidden');if(el&&!el.classList.contains('hidden'))$('pickerGuestName')?.focus();});
 $('submitPickerGuest')?.addEventListener('click',async()=>{await addGuest(rosterPickerMatch,true);});
 $('rosterSearch')?.addEventListener('input',e=>{rosterSearch=e.target.value;const d=$('rosterPickerDialog');d.querySelector('.roster-picker-list').innerHTML=rosterPickerItems();bindRosterPickerActions()});
 bindRosterPickerActions();
}
function balancedRoleTeams(picked,manualIds=null){
 const positions=['KL','DEF','ORT','FOR'];
 const eligible=(p,role)=>p.position===role || p.secondary_position===role;
 const slots=[0,1].flatMap(team=>positions.flatMap(role=>Array.from({length:roleQuota[role]},()=>({team,role}))));
 const used=new Set(),t=[[],[]],sum=[0,0];
 let best=null,bestDiff=Infinity,nodes=0;
 // Önce mevki seçenekleri en az olan slotu doldur.
 function solve(remaining){
  if(++nodes>160000)return;
  if(!remaining.length){
   const difference=Math.abs(sum[0]-sum[1]);
   if(difference<bestDiff){bestDiff=difference;best=t.map(side=>side.map(p=>({...p})))}
   return;
  }
  let slotIndex=-1,choices=null;
  for(let i=0;i<remaining.length;i++){
   const slot=remaining[i];
   const pool=picked.filter(p=>!used.has(p.id)&&eligible(p,slot.role)&&(!manualIds || (slot.team===0)===manualIds.has(p.id)));
   if(!pool.length)return;
   if(!choices || pool.length<choices.length){choices=pool;slotIndex=i;if(pool.length===1)break;}
  }
  const slot=remaining[slotIndex],rest=remaining.filter((_,i)=>i!==slotIndex);
  const ordered=[...choices].sort((a,b)=>Math.abs(sum[slot.team]+Number(a.overall_rating||60)-sum[1-slot.team])-Math.abs(sum[slot.team]+Number(b.overall_rating||60)-sum[1-slot.team]));
  for(const p of ordered){
   used.add(p.id);const entry={...p,assigned_role:slot.role};t[slot.team].push(entry);sum[slot.team]+=Number(p.overall_rating||60);
   solve(rest);
   sum[slot.team]-=Number(p.overall_rating||60);t[slot.team].pop();used.delete(p.id);
   if(bestDiff===0||nodes>160000)return;
  }
 }
 solve(slots);
 return best;
}
async function saveTeamsToNextMatch({automatic=false}={}){
 if(!adminInfo||!db)return toast('Takımları yalnızca yönetici kaydedebilir.',true);
 const m=nextTeamMatch();
 if(!m||m.status==='completed'||!teamData||teamData.length!==2||teamData.some(t=>t.length!==7))return toast('Önce sıradaki maç için 7 kişilik iki takım oluştur.',true);
 const attendees=weeklyPlayers.filter(x=>String(x.match_id)===String(m.id));
 const guests=extras.guests.filter(x=>String(x.match_id)===String(m.id));
 const desired=teamData.flatMap((team,index)=>team.map(p=>({p,color:index===0?'red':'white'})));
 if(desired.length!==14)return toast('Kadroda tam 14 kişi olmalı.',true);
 const changes=[];
 for(const {p,color} of desired){
  if(p.is_guest||String(p.id).startsWith('guest:')){
   const gid=String(p.id).replace(/^guest:/,'');
   const item=guests.find(g=>String(g.id)===gid);
   if(!item)return toast('Misafir kadrodan çıkarılmış. Sayfayı yenile.',true);
   changes.push({type:'guest',id:gid,color});
  }else{
   const item=attendees.find(x=>String(x.player_id)===String(p.id));
   if(!item)return toast('Oyuncu artık bu maçta değil. Sayfayı yenile.',true);
   changes.push({type:'registered',id:p.id,color});
  }
 }
 if(!automatic&&!confirm('Kırmızı ve Beyaz takım kadroları sıradaki maça kaydedilsin mi?'))return;
 const button=$('saveTeamsToMatch');if(button)button.disabled=true;
 try{
  for(const x of changes){
   const result=x.type==='guest'
    ?await db.rpc('szf_guest_team_v53',{p_guest:x.id,p_team:x.color})
    :await db.rpc('szf_assign_match_team_v32',{p_match:m.id,p_player:x.id,p_team:x.color});
   if(result.error)throw result.error;
  }
  await loadLeagueData();
  const savedPeople=weeklyPlayers.filter(x=>String(x.match_id)===String(m.id));
  const savedGuests=extras.guests.filter(x=>String(x.match_id)===String(m.id));
  const counts={red:0,white:0};
  for(const item of [...savedPeople,...savedGuests])if(item.team_color==='red'||item.team_color==='white')counts[item.team_color]++;
  render();
  if(counts.red!==7||counts.white!==7)throw new Error(`Kayıt doğrulanamadı: Kırmızı ${counts.red}/7, Beyaz ${counts.white}/7. Supabase yetkilerini kontrol et.`);
  toast('Kadrolar kaydedildi! Maçlar → Kadroyu gör bölümünde sahada görüntülenebilir.');
 }catch(err){await loadLeagueData();render();toast('Bazı takım kayıtları kaydedilemedi: '+formatError(err),true);}
}
async function buildTeams(){
 const picked=teamBuilderCandidates().filter(p=>teamSelections.has(p.id));
 if(picked.length!==14)return toast('Otomatik takım kurmak için gelecek maçta 14 katılımcı gerekli. Şu an '+picked.length+'/14 oyuncu var.',true);
 let manualIds=null;
 if(teamMode==='manual'){
  manualIds=new Set(picked.filter(p=>manualRed.has(p.id)).map(p=>p.id));
  if(manualIds.size!==7)return toast('Kırmızı takım için tam 7 oyuncu seç.',true);
 }
 let teams;
 if(teamMode==='manual'){
  // Elle dağıt: mevki kontrolü yok. 7 kırmızı, kalan 7 beyaz.
  teams=[picked.filter(p=>manualIds.has(p.id)),picked.filter(p=>!manualIds.has(p.id))];
 }else{
  // Mevki kontenjanları yalnızca Otomatik Dengeli modunda geçerli.
  teams=balancedRoleTeams(picked);
  if(!teams)return toast('Mevkilere uygun iki takım kurulamıyor. 2 kaleci, 6 defans, 4 orta saha ve 2 forvet gereklidir. İkinci mevkiler de sayılır.',true);
 }
 teamData=teams;
 render();
 if(adminInfo&&db){
  await saveTeamsToNextMatch({automatic:true});
 }else{
  toast('Takımlar hazır, ancak maça kaydedilemedi: yönetici hesabıyla giriş yapılmalı.',true);
 }
}
function openAuth(register=false){if(user)return toast('Zaten giriş yaptın.');if(!configured)return toast('Önce config.js dosyasına Supabase publishable anahtarını girmelisin.',true);signup=register;$('authDialog').showModal();drawAuth()}
function drawAuth(){ $('authTitle').textContent=signup?'Yeni oyuncu kaydı':'Oyuncu girişi';$('authDesc').textContent=signup?'Gerçek e-posta adresinle kayıt ol.':'E-posta adresin ve şifrenle giriş yap.';$('signupConfirm').classList.toggle('hidden',!signup);$('confirmPassword').required=signup;$('authSubmit').textContent=signup?'Hesap oluştur':'Giriş yap';$('switchAuth').textContent=signup?'Zaten hesabın var mı? Giriş yap':'Hesabın yok mu? Kayıt ol';$('password').autocomplete=signup?'new-password':'current-password';$('forgotPassword').classList.toggle('hidden',signup);$('authError').classList.add('hidden')}
function authError(message){$('authError').textContent=message;$('authError').classList.remove('hidden')}
async function submitAuth(event){
 event.preventDefault();if(loading)return;
 const email=$('username').value.trim().toLowerCase();const pwd=$('password').value;
 if(!db){authError('Supabase bağlantısı kurulamamış. Sayfayı yenile ve tekrar dene.');return}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){authError('Geçerli bir e-posta adresi yaz.');return}
 if(pwd.length<8){authError('Şifre en az 8 karakter olmalı.');return}
 loading=true;$('authSubmit').disabled=true;$('authSubmit').textContent='İşleniyor…';$('authError').classList.add('hidden');
 try{
  let result;
  if(signup){if(pwd!==$('confirmPassword').value)throw new Error('Şifreler eşleşmiyor.');result=await db.auth.signUp({email,password:pwd,options:{data:{full_name:'Yeni Oyuncu'}}});}
  else result=await Promise.race([db.auth.signInWithPassword({email,password:pwd}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Giriş isteği 15 saniye içinde yanıt vermedi. İnternet bağlantını ve Supabase ayarlarını kontrol et.')),15000))]);
  if(result.error)throw result.error;
  if(signup && !result.data?.session)throw new Error('Hesap oluşturuldu ama oturum açılamadı. Supabase → Authentication → Sign In / Providers bölümünden Confirm email ayarını kapat.');
  user=result.data.user || result.data?.session?.user || null;
  try{await loadProfileAndCards()}catch(profileErr){console.warn('Profil verileri yüklenemedi:',profileErr)}
  $('authDialog').close();$('authForm').reset();selectedPlayer=null;view=signup?'account':'players';render();toast(signup?'Hesabın açıldı! Profilini tamamlayabilirsin.':'Giriş başarılı!');
 }catch(err){authError(formatError(err))}finally{loading=false;$('authSubmit').disabled=false;$('authSubmit').textContent=signup?'Hesap oluştur':'Giriş yap'}
}
function formatError(error){const x=String(error?.message||error||'İşlem başarısız.');if(/invalid login/i.test(x))return'E-posta adresi veya şifre yanlış.';if(/already registered|already been registered/i.test(x))return'Bu e-posta adresi zaten kayıtlı.';if(/invalid email/i.test(x))return'Geçerli bir e-posta adresi gir.';if(/email rate limit/i.test(x))return'Çok fazla kayıt denemesi yapıldı. Bir süre sonra tekrar dene.';return x}
async function loadProfileAndCards(){if(!db||!user)return;const [p,c,v,all]=await Promise.all([
 db.from('profiles').select('id,display_name,position,secondary_position,jersey_number,avatar_path,approved').eq('id',user.id).maybeSingle(),
 db.from('player_cards').select('*').order('overall_rating',{ascending:false}),
 db.from('szf_ratings_v70').select('target_id,scores').eq('voter_id',user.id),
 db.from('profiles').select('id,display_name,position,approved,jersey_number,avatar_path').not('jersey_number','is',null)
]);if(p.error)toast('Profil alınamadı: '+formatError(p.error),true);if(c.error)toast('Oyuncular alınamadı: '+formatError(c.error),true);if(v.error)toast('Oylar alınamadı: '+formatError(v.error),true);profile=p.data?{...p.data,display_name:formatPersonName(p.data.display_name)}:null;cards=(c.data||[]).map(c=>({...c,display_name:formatPersonName(c.display_name), overall_rating:Number(c.overall_rating)||60}));myVotes=v.data||[];publicProfiles=(all.data||[]).map(p=>({...p,display_name:formatPersonName(p.display_name)}));
 // A new player may have no old vote-derived player_cards row yet.
 // Show a genuine baseline card from the saved profile, without altering previous scores.
 const existing=new Set(cards.map(x=>x.id));
 for(const person of publicProfiles){
  if(person.approved===true && person.display_name && person.position && !existing.has(person.id)){
   const baseline={id:person.id,display_name:person.display_name,position:person.position,overall_rating:60,
    hiz:60,sut:60,pas:60,dripling:60,defans:60,dayaniklilik:60,
    gk_diving:60,gk_handling:60,gk_kicking:60,gk_reflexes:60,gk_speed:60,gk_positioning:60,voter_count:0};
   cards.push(baseline);existing.add(person.id);
  }
 }
 cards.sort((a,b)=>Number(b.overall_rating||60)-Number(a.overall_rating||60));if(all.error)toast('Forma listesi yüklenemedi: '+formatError(all.error),true);await loadLeagueData();
 const ratings=await db.rpc('szf_rating_summary_v70');
 v70Ready=!ratings.error;
 if(v70Ready){
  const summary=ratings.data||[];
  const byId=new Map(summary.map(r=>[String(r.target_id),r]));
  cards=cards.map(c=>{const r=byId.get(String(c.id));if(!r)return {...c,v70_count:0,overall_rating:70};const n=Number(r.voter_count)||0;const clone={...c,v70_count:n};if(n>=10){getFeatures(c).forEach(([k],i)=>clone[k]=Number(r.scores[i]));clone.overall_rating=Math.round(r.scores.reduce((a,b)=>a+Number(b),0)/6)}else{clone.overall_rating=70}return clone;});
 }
}
async function refresh(){if(!db){render();return}try{const{data:{user:u},error}=await db.auth.getUser();if(error&&!/session missing/i.test(error.message||''))throw error;user=u||null;if(user)await loadProfileAndCards();else{profile=null;cards=[];myVotes=[]}render();toast(user?'Güncel veriler yüklendi.':'Giriş yaparak başlayabilirsin.')}catch(err){toast(formatError(err),true)}}
async function castVote(target,category,delta){
 if(!db||!user||!profile?.approved)return toast('Değerlendirmek için onaylı bir hesap gerekli.',true);
 if(target===user.id)return toast('Kendine oy veremezsin.',true);
 if(!features.some(([f])=>f===category)||![-2,0,2].includes(delta))return;
 const existing=myVotes.find(v=>String(v.target_id)===String(target)&&v.category===category);
 if(existing?.delta===delta){
  return;
  return;
 }
 const snapshotVotes=myVotes.map(v=>({...v}));
 const snapshotCards=cards.map(c=>({...c}));
 optimisticVotePatch(target,category,delta);
 assessmentFlash={target:String(target),category,tone:delta>0?'pos':delta<0?'neg':'neu'};
 render();
 try{
  const result=existing?await db.from('player_votes').update({delta}).eq('id',existing.id).eq('voter_id',user.id):await db.from('player_votes').insert({voter_id:user.id,target_id:target,category,delta});
  if(result.error)throw result.error;
  await loadProfileAndCards();assessmentFlash=null;render();toast('Oyun kaydedildi. Kart puanı güncellendi.');
 }catch(err){assessmentFlash=null;myVotes=snapshotVotes;cards=snapshotCards;render();toast('Oy kaydedilemedi: '+formatError(err),true)}
}

// Hafif, çevrimdışı çalışan fotoğraf kadrajı: harici AI modeli yok.
let cropImage=null,cropBitmap=null,editingCurrentPhoto=false;
function showCropPreview(){
 const preview=$('cropPreview');if(!preview||!cropBitmap)return;
 const canvas=$('cropCanvas'),ctx=canvas.getContext('2d');
 const zoom=Number($('cropZoom').value)/100,offsetY=Number($('cropVertical').value)/100,offsetX=Number($('cropHorizontal').value)/100;
 const w=canvas.width,h=canvas.height,iw=cropBitmap.width,ih=cropBitmap.height;
 // Kart portresi için dikey 4:5 kırpma, kaydırma ve yakınlaştırma.
 let sw=Math.min(iw,ih*.8)/zoom,sh=sw*1.25;
 if(sh>ih){sh=ih/zoom;sw=sh*.8}
 const x=Math.max(0,Math.min(iw-sw,(iw-sw)*offsetX));
 const y=Math.max(0,Math.min(ih-sh,(ih-sh)*offsetY));
 ctx.clearRect(0,0,w,h);ctx.drawImage(cropBitmap,x,y,sw,sh,0,0,w,h);
}
async function removeSavedPhoto(){
 if(!db||!user||!profile?.avatar_path)return toast('Silinecek fotoğraf bulunamadı.',true);
 if(!confirm('Profil fotoğrafını kaldırmak istiyor musun? Oyuncu bilgilerin korunacak.'))return;
 const btn=$('removeCurrentPhoto');if(btn){btn.disabled=true;btn.textContent='Fotoğraf kaldırılıyor…'}
 const previous=profile.avatar_path;
 try{
  const {data,error}=await db.from('profiles').update({avatar_path:null}).eq('id',user.id).select('id,avatar_path').single();
  if(error)throw error;
  if(data.avatar_path!==null)throw new Error('Fotoğraf kaldırma işlemi doğrulanamadı.');
  // Storage silme başarısız olsa bile kimse profil fotoğrafını görmeyecek.
  const deletion=await db.storage.from('avatars').remove([previous]);
  if(deletion.error)console.warn('Eski dosya Storage üzerinden silinemedi:',deletion.error);
  editingCurrentPhoto=false;cropBitmap?.close?.();cropBitmap=null;
  await loadProfileAndCards();view='account';render();
  toast('Profil fotoğrafı kaldırıldı. Oyuncu bilgilerin korundu.');
 }catch(err){toast('Fotoğraf kaldırılamadı: '+formatError(err),true);if(btn){btn.disabled=false;btn.textContent='🗑 Fotoğrafı kaldır'}}
}
async function editSavedPhoto(){
 if(!profile?.avatar_path||!db)return toast('Kayıtlı fotoğraf bulunamadı.',true);
 const btn=$('editCurrentPhoto');if(btn){btn.disabled=true;btn.textContent='Fotoğraf açılıyor…'}
 try{
  const {data,error}=await db.storage.from('avatars').download(profile.avatar_path);
  if(error)throw error;
  editingCurrentPhoto=true;
  await prepareCrop(data,true);
  if(!cropBitmap)throw new Error('Fotoğraf okunamadı.');
  toast('Mevcut fotoğraf açıldı. Yakınlaştırıp kaydedebilirsin.');
 }catch(err){editingCurrentPhoto=false;toast('Fotoğraf açılamadı: '+formatError(err),true)}
 finally{if(btn){btn.disabled=false;btn.textContent='✎ Mevcut fotoğrafı düzenle'}}
}
async function prepareCrop(file,existing=false){
 const area=$('cropPreview');if(!area)return;
 area.classList.remove('hidden');
 if(!existing)editingCurrentPhoto=false;
 try{if(cropBitmap?.close)cropBitmap.close();cropBitmap=await createImageBitmap(file);showCropPreview()}
 catch(err){cropBitmap=null;area.classList.add('hidden');toast('Fotoğraf önizlemesi açılamadı: '+formatError(err),true)}
}
async function makeCardPhoto(){
 if(!cropBitmap)throw Error('Önce fotoğraf seçmelisin.');
 showCropPreview();const canvas=$('cropCanvas');
 let quality=.86,blob;
 do{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=.1}
 while(blob&&blob.size>2*1024*1024&&quality>.4);
 if(!blob)throw Error('Fotoğraf hazırlanamadı.');
 return new File([blob],'oyuncu-portresi.jpg',{type:'image/jpeg'});
}

async function saveProfile(event){
 event.preventDefault();if(!db||!user)return;
 const display_name=formatPersonName($('editName').value), position=$('editPos').value, secondary_position=$('editPos2').value||null, jersey_number=Number($('editJersey').value);
 if(display_name.length<2)return toast('Ad soyad en az 2 karakter olmalı.',true);
 if(!Number.isInteger(jersey_number)||jersey_number<1||jersey_number>99)return toast('1–99 arasında forma numarası seç.',true);
 if(position===secondary_position)return toast('İki mevki birbirinden farklı olmalı.',true);
 const photo=$('editPhoto')?.files?.[0];
 if(photo&&(!['image/jpeg','image/png','image/webp'].includes(photo.type)||photo.size>5*1024*1024))return toast('JPG, PNG veya WebP ve en fazla 5 MB olmalı.',true);
 $('saveProfileBtn').disabled=true;
 try{
  let avatar_path=profile?.avatar_path||null;
  if(photo||editingCurrentPhoto){
   $('saveProfileBtn').textContent='Fotoğrafın kadrajı hazırlanıyor…';
   const portrait=await makeCardPhoto();
   $('saveProfileBtn').textContent='Profil kaydediliyor…';
   const path=`${user.id}/avatar-${Date.now()}.jpg`;
   const uploaded=await db.storage.from('avatars').upload(path,portrait,{contentType:'image/jpeg',upsert:false});
   if(uploaded.error)throw uploaded.error;
   avatar_path=path;
  }
  const patch={display_name,position,secondary_position,jersey_number,avatar_path};
  const {error}=await db.from('profiles').update(patch).eq('id',user.id);
  if(error){if(error.code==='23505')throw new Error('Bu forma numarasını başka oyuncu aldı. Başka numara seç.');throw error;}
  if((photo||editingCurrentPhoto)&&profile?.avatar_path&&profile.avatar_path!==avatar_path)await db.storage.from('avatars').remove([profile.avatar_path]);
  editingCurrentPhoto=false;await loadProfileAndCards();view='home';selectedPlayer=null;render();window.scrollTo({top:0,behavior:'smooth'});toast('Profilin kaydedildi. Ana sayfaya yönlendirildin.');
 }catch(err){toast('Kaydedilemedi: '+formatError(err),true);$('saveProfileBtn').disabled=false;$('saveProfileBtn').textContent='Profili kaydet';}
}


function applyWeeklyScores(){
 const grouped={};for(const a of assessments){const id=a.player_id;grouped[id]??={};grouped[id][a.category]=(grouped[id][a.category]||0)+Number(a.delta)};
 cards=cards.map(c=>{const adjust=grouped[c.id]||{},clone={...c};for(const[k,d]of Object.entries(adjust)){if(k.startsWith('gk_'))clone[k]=Math.max(1,Math.min(99,ability(c,k)+d));else clone[k]=Math.max(1,Math.min(99,ability(c,k)+d))}clone.overall_rating=score(clone);return clone});
}
async function saveVest(match,team){
 if(!adminInfo)return toast('Yelek bilgisini sadece yönetici kaydedebilir.',true);
 const result=await db.rpc('szf_set_vest_team_v33',{p_match:match,p_team:team||null});
 if(result.error){render();return toast('Yelek kaydı başarısız: '+formatError(result.error),true)}
 await loadLeagueData();render();toast('Yelek kaydı güncellendi.');
}
async function loadLeagueData(){
 if(!db||!user)return;
 const calls=await Promise.all([db.from('szf_admins').select('user_id').eq('user_id',user.id).maybeSingle(),db.from('szf_matches').select('*').order('match_date',{ascending:false}),db.from('szf_participants').select('*'),db.from('szf_match_declines').select('*'),db.from('szf_assessments').select('*'),db.rpc('szf_claim_weekly_credits'),db.from('szf_wallets').select('balance').eq('user_id',user.id).maybeSingle(),db.from('szf_leaderboard').select('*').order('balance',{ascending:false}),db.from('szf_match_deleters').select('user_id').eq('user_id',user.id).maybeSingle()]);
 adminInfo=!!calls[0].data;canDeleteMatch=!!calls[8]?.data;leagueMatches=calls[1].data||[];weeklyPlayers=calls[2].data||[];matchDeclines=calls[3].data||[];assessments=calls[4].data||[];leagueWallet=calls[6].data||null;leagueStandings=calls[7].data||[];
 const extraCalls=await Promise.all(['szf_guest_players_v53','szf_waitlist_v53','szf_match_events_v53'].map(t=>db.from(t).select('*')));
 extraReady=extraCalls.every(r=>!r.error);
 extras={guests:extraCalls[0].data||[],waitlist:extraCalls[1].data||[],events:extraCalls[2].data||[],mvp:[]};
 const completedMatches=leagueMatches.filter(m=>m.status==='completed');
 // MVP v53: mevcut tabloyu kullan; v84 fonksiyonlarına bağımlı değil.
 const [mvRead,guestMvRead]=await Promise.all([db.from('szf_mvp_votes_v53').select('match_id,voter_id,target_id'),db.from('szf_mvp_guest_votes_v109').select('match_id,voter_id,guest_id')]);
 mvpEnabled=true;
 mvpStates={};
 {
  const allVotes=[...(mvRead.data||[]),...(guestMvRead.data||[]).map(x=>({...x,target_id:'g:'+x.guest_id}))];
  for(const m of completedMatches){
   const entries=allVotes.filter(v=>String(v.match_id)===String(m.id));
   const participants=weeklyPlayers.filter(p=>String(p.match_id)===String(m.id)).map(p=>String(p.player_id));
   const counts={};for(const v of entries)counts[v.target_id]=(counts[v.target_id]||0)+1;
   const best=Math.max(0,...Object.values(counts));
   mvpStates[String(m.id)]={open:true,eligible:participants.includes(String(user.id)),voted:entries.some(v=>String(v.voter_id)===String(user.id)),vote_count:entries.length,winners:best?Object.keys(counts).filter(id=>counts[id]===best):[],winning_votes:best};
  }
 } if(guestMvRead.error)console.warn('Misafir MVP oylaması için v109 SQL kurulumu gerekli:',guestMvRead.error); if(mvRead.error)console.warn('MVP v53 oy listesi okunamadı; oy verme yine denenebilir:',mvRead.error);

 if(!extraReady)console.warn('Bazı v53 ek özellikleri okunamadı (katılım yine denenebilir):',extraCalls.filter(r=>r.error).map(r=>r.error));
 if(calls[5].error)console.warn('Kredi tanımlama:',calls[4].error.message);
}
async function submitAssessment(match,player,category,delta){
 if(!adminInfo)return toast('Bu işlem sadece yöneticiye açık.',true);
 const {error}=await db.rpc('szf_rate_player',{p_match:match,p_player:player,p_category:category,p_delta:delta});
 if(error)return toast('Değerlendirme kaydedilemedi: '+formatError(error),true);
 await loadProfileAndCards();render();toast('Değerlendirme kaydedildi.');
}
async function submitBet(match){
 const field=$('stake-'+match),stake=Number(field?.value),result=document.querySelector(`[data-bet-result="${match}"]`)?.value;
 if(!Number.isSafeInteger(stake)||stake<1||stake>Number(leagueWallet?.balance||0))return toast('Geçerli kredi tutarı gir.',true);
 if(!confirm(`${stake} sanal krediyi bu maça yatırmak istiyor musun?`))return;
 const {error}=await db.rpc('szf_place_bet',{p_match:match,p_pick:result,p_stake:stake});
 if(error)return toast('Tahmin kaydedilemedi: '+formatError(error),true);
 await loadLeagueData();render();toast('Tahmin kaydedildi.');
}
let editingMatchId=null;
function openMatchEditor(id){
 const m=leagueMatches.find(x=>String(x.id)===String(id));
 if(!m||!(adminInfo||canDeleteMatch||String(m.created_by)===String(user?.id)))return toast('Bu maçı düzenleme yetkin yok.',true);
 editingMatchId=m.id;
 const info=matchTitleInfo(m.title);
 $('matchTitle').value=info.title||'';
 $('matchVenue').value=info.venue||'';
 // datetime-local girdisine kullanıcının yerel saatini taşı.
 const date=new Date(m.match_date);
 const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
 $('matchDate').value=local.toISOString().slice(0,16);
 $('matchDialogHeading').textContent='Maç bilgilerini düzenle';
 $('matchSubmitButton').textContent='Değişiklikleri kaydet';
 $('matchCreateDialog')?.showModal();
}
async function createMatch(e){
 e.preventDefault();if(!user)return toast('Giriş yapmalısın.',true);
 const venue=$('matchVenue')?.value.trim()||'';
 const label=$('matchTitle').value.trim();
 if(!label||!$('matchDate').value)return toast('Maç adı ve tarih zorunlu.',true);
 const title=venue?(label.slice(0,Math.max(2,61-venue.length))+' [Saha: '+venue+']'):label;
 const payload={title,match_date:new Date($('matchDate').value).toISOString()};
 let result;
 if(editingMatchId){
  const m=leagueMatches.find(x=>String(x.id)===String(editingMatchId));
  if(!m||!(adminInfo||canDeleteMatch||String(m.created_by)===String(user.id)))return toast('Düzenleme yetkin yok.',true);
  result=await db.from('szf_matches').update(payload).eq('id',editingMatchId).select('id');
  if(!result.error&&!result.data?.length)return toast('Değişiklik kaydedilemedi. Supabase güncelleme yetkisi (RLS) gerekiyor.',true);
 }else result=await db.from('szf_matches').insert({...payload,created_by:user.id});
 if(result.error)return toast('Maç kaydedilemedi: '+formatError(result.error),true);
 editingMatchId=null;$('matchCreateDialog')?.close();
 await loadLeagueData();render();toast('Maç bilgileri kaydedildi.');
}
async function deleteMatch(match){
 if(!user||!adminInfo)return toast('Maç silme yetkisi yalnızca yöneticilere ait.',true);
 const m=leagueMatches.find(x=>String(x.id)===String(match));
 if(!m)return toast('Maç bulunamadı.',true);
 if(!confirm(`“${m.title}” maçını silmek istiyor musun? Bu işlem geri alınamaz.`))return;
 if(!confirm('SON ONAY: Maç, gol ve asist kayıtları silinecek. Devam edilsin mi?'))return;
 const {error}=await db.from('szf_matches').delete().eq('id',match);
 if(error)return toast('Maç silinemedi: '+formatError(error),true);
 await loadLeagueData();render();toast('Maç silindi.');
}
// Katılım tercihi tek seçeneklidir: iki düğme aynı anda seçili olamaz.
let matchPreferenceBusy=false;
async function toggleParticipant(match,player){
 if(!user||matchPreferenceBusy)return;
 if(String(player)!==String(user.id))return toast('Yalnızca kendin için katılabilirsin.',true);
 matchPreferenceBusy=true;
 try{
  // Katılım, gol/asist ve MVP tablolarının okunmasına bağlı değildir.
  let {data,error}=await db.rpc('szf_join_or_queue_v53',{p_match:match});
  if(error && (error.code==='PGRST202'||error.code==='42883')){
   // Eski kurulumlarda mevcut, doğrulanmış v23 fonksiyonuna dön.
   const fallback=await db.rpc('szf_confirm_match_player_v23',{p_match:match});
   error=fallback.error;
   data='joined';
  }
  if(error)throw error;
  await loadLeagueData();render();
  toast(data==='queued'?'Kadro dolu. Yedek listesine alındın.':'Katılımın onaylandı.');
 }catch(e){
  console.error('SZF katılım hatası:',e);
  toast('Katılım kaydedilemedi: '+formatError(e)+(e?.code?' (Kod: '+e.code+')':''),true);
 }finally{matchPreferenceBusy=false}
}
async function toggleDecline(match){
 if(!user||matchPreferenceBusy)return;
 const attending=weeklyPlayers.some(x=>String(x.match_id)===String(match)&&String(x.player_id)===String(user.id));
 const queued=extras.waitlist.some(x=>String(x.match_id)===String(match)&&String(x.player_id)===String(user.id));
 const declined=matchDeclines.some(x=>String(x.match_id)===String(match)&&String(x.player_id)===String(user.id));
 if(declined&&!attending&&!queued)return;
 if(attending&&!confirm('Katılımını iptal etmek istediğine emin misin? Onaylarsan ilk yedek otomatik olarak senin yerine geçecek.'))return;
 matchPreferenceBusy=true;
 try{const {error}=await db.rpc('szf_decline_and_promote_v53',{p_match:match});if(error)throw error;
 await loadLeagueData();render();toast('Katılamıyorum tercihin kaydedildi.');
 }catch(e){console.error('SZF katılamıyorum hatası:',e);toast(e?.code==='PGRST202'||e?.code==='42883'?'Supabase katılım fonksiyonu eksik. Yönetici, ZIP içindeki SUPABASE_YENI_OZELLIKLER_v53.sql dosyasını SQL Editor üzerinden kurmalı.':'Tercih kaydedilemedi: '+formatError(e)+(e?.code?' (Kod: '+e.code+')':''),true)}finally{matchPreferenceBusy=false}
}
async function leaveQueue(match){if(!user)return;const {error}=await db.rpc('szf_leave_queue_v53',{p_match:match});if(error)return toast(formatError(error),true);await loadLeagueData();render();toast('Yedek listesinden çıktın.');}
async function addGuest(match,fromPicker=false){const name=formatPersonName((fromPicker?$('pickerGuestName'):$('guest-name-'+match))?.value),position=(fromPicker?$('pickerGuestPosition'):$('guest-position-'+match))?.value;if(!name)return toast('Misafir adı gerekli.',true);const {error}=await db.rpc('szf_add_guest_v53',{p_match:match,p_name:name,p_position:position});if(error)return toast(formatError(error),true);if(fromPicker)rosterPickerMatch=null;await loadLeagueData();render();$('roster-'+match)?.classList.remove('hidden');toast('Anonim oyuncu kadroya eklendi.');}
async function guestAction(id,action,value){let call=action==='remove'?db.rpc('szf_remove_guest_v53',{p_guest:id}):action==='team'?db.rpc('szf_guest_team_v53',{p_guest:id,p_team:value||null}):db.rpc('szf_link_guest_v53',{p_guest:id,p_player:value});const {error}=await call;if(error)return toast(formatError(error),true);await loadLeagueData();render();toast('Misafir kaydı güncellendi.');}
async function addEvent(match){const val=$('event-person-'+match)?.value,kind=$('event-kind-'+match)?.value;if(!val)return toast('Gol atan oyuncuyu seç.',true);const [type,id]=val.split(':');const aid=kind==='goal'?($('event-assist-'+match)?.value||''):'';if(aid&&aid===val)return toast('Oyuncu kendi golüne asist yapamaz.',true);const [at,ap]=aid?aid.split(':'):[null,null];const {error}=kind==='own_goal'?await db.rpc('szf_add_own_goal_v109',{p_match:match,p_person:id,p_is_guest:type==='g'}):await db.rpc('szf_add_goal_assist_v115',{p_match:match,p_person:id,p_is_guest:type==='g',p_assist:ap||null,p_assist_is_guest:at==='g'});if(error)return toast(formatError(error),true);await loadLeagueData();render();toast('Gol ve varsa asisti birlikte kaydedildi.');}
async function voteMvp(match){
 const target=document.querySelector(`input[name="mvp-${CSS.escape(match)}"]:checked`)?.value;
 if(!target)return toast('Bir oyuncu seç.',true);if(mvpStates[String(match)]?.voted)return toast('Bu maçta zaten oy kullandın.',true);
 if(!confirm('Oyun kaydedilsin mi? Daha sonra oyunu değiştirebilirsin.'))return;
 const {error}=target.startsWith('g:')?await db.rpc('szf_vote_mvp_guest_v109',{p_match:match,p_guest:target.slice(2)}):await db.rpc('szf_vote_mvp_v53',{p_match:match,p_target:target.replace(/^p:/,'')});
 if(error)return toast(formatError(error),true);
 await loadLeagueData();render();toast('Oyun güvenle kaydedildi.');
}
function manageParticipants(match){
 const ids=cards.map(p=>`${p.display_name} ${weeklyPlayers.some(w=>w.player_id===p.id&&w.match_id===match)?'✓':''}`).join('\n');
 const name=prompt('Oynayan oyuncunun tam adını yaz (tekrar seçilirse katılımı kaldırır):\n'+ids);
 if(!name)return;const card=cards.find(c=>c.display_name.toLocaleLowerCase('tr')===name.trim().toLocaleLowerCase('tr'));
 if(!card)return toast('Oyuncu bulunamadı.',true);toggleParticipant(match,card.id);
}
async function assignMatchTeam(match,player,color){
 if(!adminInfo)return toast('Yalnızca yönetici takım belirleyebilir.',true);
 const {error}=await db.rpc('szf_assign_match_team_v32',{p_match:match,p_player:player,p_team:color||null});
 if(error)return toast('Takım kaydedilemedi: '+formatError(error),true);
 await loadLeagueData();render();$('roster-'+match)?.classList.remove('hidden');toast('Takım bilgisi kaydedildi.');
}
async function completeMatch(match){
 if(!adminInfo)return;
 const m=leagueMatches.find(x=>String(x.id)===String(match));if(!m)return toast('Maç bulunamadı.',true);
 const people=weeklyPlayers.filter(p=>String(p.match_id)===String(match));
 const guests=extras.guests.filter(g=>String(g.match_id)===String(match));
 const all=[...people,...guests];
 if(all.length!==14||all.filter(x=>x.team_color==='red').length!==7||all.filter(x=>x.team_color==='white').length!==7)return toast('Önce takımları 7 kırmızı ve 7 beyaz olarak kaydet.',true);
 if(!Number.isInteger(m.red_score)||!Number.isInteger(m.white_score))return toast('Önce kırmızı ve beyaz takım skorlarını kaydet.',true);
 const val=m.red_score>m.white_score?'red':m.red_score<m.white_score?'white':'draw';
 if(!confirm(`Maç ${m.red_score}-${m.white_score} olarak sonuçlandırılsın mı? Sanal kredi ödülleri dağıtılabilir.`))return;
 const {error}=await db.rpc('szf_settle_match',{p_match:match,p_result:val});if(error)return toast('Maç sonuçlandırılamadı: '+formatError(error),true);
 openMatchRosters.add(match);await loadLeagueData();render();toast('Maç sonuçlandırıldı.');
}

async function signOut(){if(!db)return;const{error}=await db.auth.signOut();if(error){toast(formatError(error),true);return}user=null;profile=null;cards=[];myVotes=[];view='home';selectedPlayer=null;teamData=null;teamSelections.clear();leagueMatches=[];leagueWallet=null;render();toast('Çıkış yapıldı.')}
async function initialize(){
 setInterval(()=>{if(user&&view==='matches')render();},15000);

 // Render public shell before any external authentication/network requests.
 try{render()}catch(e){console.error('Initial render failed',e)}
 $('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;view=b.dataset.view;selectedPlayer=null;render()});
 $('refreshBtn').addEventListener('click',refresh);
  $('topProfileBtn').addEventListener('click',()=>{if(!user)return;view='account';selectedPlayer=null;render();window.scrollTo({top:0,behavior:'smooth'})});
 $('topAuthBtn').addEventListener('click',()=>user?signOut():openAuth());
 $('closeAuth').addEventListener('click',()=>$('authDialog').close());
 $('switchAuth').addEventListener('click',()=>{signup=!signup;drawAuth()});
 $('forgotPassword').addEventListener('click',async()=>{
  if(!db)return authError('Supabase bağlantısı kurulamadı.');
  const email=$('username').value.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return authError('Önce e-posta adresini yaz.');
  $('forgotPassword').disabled=true;
  try{
   const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
   if(error)throw error;
   authError('E-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Spam klasörüne de bak.');
  }catch(err){authError(formatError(err))}finally{$('forgotPassword').disabled=false}
 });
 $('closeReset').addEventListener('click',()=>$('resetDialog').close());
 $('resetForm').addEventListener('submit',async(e)=>{
  e.preventDefault();const pwd=$('newPassword').value;
  if(pwd.length<8)return;
  $('resetSubmit').disabled=true;$('resetError').classList.add('hidden');
  try{const {data:sessionData}=await db.auth.getSession();if(!sessionData?.session)throw new Error('Şifre sıfırlama oturumu bulunamadı. Yeni bir sıfırlama e-postası iste ve e-postadaki en son bağlantıyı aynı tarayıcıda aç.');const {error}=await db.auth.updateUser({password:pwd});if(error)throw error;
   $('resetDialog').close();$('resetForm').reset();toast('Şifren değiştirildi.');
   history.replaceState({},'',location.pathname);
  }catch(err){$('resetError').textContent=formatError(err);$('resetError').classList.remove('hidden')}
  finally{$('resetSubmit').disabled=false}
 });
 $('authForm').addEventListener('submit',submitAuth);
 $('authDialog').addEventListener('click',e=>{if(e.target===$('authDialog'))$('authDialog').close()});
 if(!configured){render();return}
 if(!window.supabase?.createClient){
  // External CDN is asynchronous: never block the site's first paint.
  await Promise.race([new Promise(resolve=>{
   const script=$('supabaseLibrary');
   if(!script)return resolve();
   script.addEventListener('load',resolve,{once:true});
   script.addEventListener('error',resolve,{once:true});
  }),new Promise(resolve=>setTimeout(resolve,5000))]);
 }
 if(!window.supabase?.createClient){$('configAlert').classList.remove('hidden');$('configAlert').textContent='Veri servisi yüklenemedi. Ana sayfa açıldı; giriş için Yenile düğmesini kullanabilirsin.';render();return} 
 try{
  db=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const url=new URL(location.href);
  const hashParams=new URLSearchParams(url.hash.replace(/^#/,''));
  const isRecovery=hashParams.get('type')==='recovery'||url.searchParams.get('type')==='recovery';
  let callbackError=null;
  // Recover the actual Supabase session before displaying the new-password form.
  // Supabase supports implicit hash tokens, PKCE code URLs and token_hash links.
  if(isRecovery){
   const access=hashParams.get('access_token'),refresh=hashParams.get('refresh_token');
   const code=url.searchParams.get('code'),tokenHash=url.searchParams.get('token_hash');
   let exchange;
   if(access&&refresh)exchange=await db.auth.setSession({access_token:access,refresh_token:refresh});
   else if(code)exchange=await db.auth.exchangeCodeForSession(code);
   else if(tokenHash)exchange=await db.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
   if(exchange?.error)callbackError=exchange.error.message;
  }
  // Mobile networks may stall auth indefinitely. Do not block first paint.
  const authResult=await Promise.race([
   db.auth.getUser().then(value=>({value})).catch(error=>({error})),
   new Promise(resolve=>setTimeout(()=>resolve({timedOut:true}),8000))
  ]);
  if(authResult.timedOut){
   user=null;
   $('configAlert').classList.remove('hidden');
   $('configAlert').textContent='Oturum bağlantısı uzun sürdü. Sayfa açıldı; bağlantı düzelince Yenile düğmesini kullanabilirsin.';
  }else if(authResult.error){
   console.warn('Oturum kontrolü başarısız:',authResult.error);
   user=null;
  }else{user=authResult.value?.data?.user||null;}

  if(isRecovery){
   const {data:active}=await db.auth.getSession();
   if(active?.session){$('resetDialog').showModal();history.replaceState({},'',location.pathname);}
   else{toast('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Giriş ekranındaki Şifremi unuttum ile yeni bağlantı iste.'+(callbackError?' ('+callbackError+')':''),true);}
  }
  if(user){
   try{
    await Promise.race([
     loadProfileAndCards(),
     new Promise((_,reject)=>setTimeout(()=>reject(new Error('Profil yükleme zaman aşımı')),12000))
    ]);
   }catch(err){console.warn('Profil yüklenemedi:',err);toast('Bağlantı yavaş. Profil verileri yüklenemedi, Yenile ile tekrar deneyebilirsin.',true)}
  }
  db.auth.onAuthStateChange((_event,session)=>{
   if(_event==='PASSWORD_RECOVERY'&&session&&!$('resetDialog').open)$('resetDialog').showModal();
   if(session?.user?.id!==user?.id){user=session?.user||null;if(user){setTimeout(async()=>{try{await loadProfileAndCards()}catch(err){console.warn(err)}render()},0)}else{profile=null;cards=[];myVotes=[];selectedPlayer=null;render()}}
  });
 }catch(err){toast('Supabase bağlantı hatası: '+formatError(err),true)}
 render();
}
window.addEventListener('DOMContentLoaded',initialize);
})();
