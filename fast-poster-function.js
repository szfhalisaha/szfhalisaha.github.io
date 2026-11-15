/* SZF_FAST_POSTER_V140: Only inline match history previews use lightweight HTML.
   The existing canvas generation is preserved for explicit share/export clicks. */
function buildFastPosterHTML(id){
 const m=leagueMatches.find(x=>String(x.id)===String(id));
 const red=Number(m?.red_score),white=Number(m?.white_score);
 if(!m||m.red_score==null||m.white_score==null||!Number.isInteger(red)||!Number.isInteger(white)||red<0||white<0)return '<p class="soft">Sonuç için skor kaydı bulunamadı.</p>';
 const guests=extras.guests.filter(g=>String(g.match_id)===String(id));
 const people=weeklyPlayers.filter(p=>String(p.match_id)===String(id));
 const cards=currentCards();
 const names=new Map(cards.map(c=>[String(c.id),c.display_name||'Oyuncu']));
 const nameOf=pid=>names.get(String(pid))||'Oyuncu';
 const guestName=g=>g?.linked_player_id?nameOf(g.linked_player_id):(g?.display_name||'Misafir');
 const roster=color=>[
   ...people.filter(p=>p.team_color===color).map(p=>({name:nameOf(p.player_id),id:String(p.player_id)})),
   ...guests.filter(g=>g.team_color===color).filter(g=>!g.linked_player_id||!people.some(p=>String(p.player_id)===String(g.linked_player_id))).map(g=>({name:guestName(g),id:String(g.id)}))
 ];
 const events=extras.events.filter(e=>String(e.match_id)===String(id));
 const goals=events.filter(e=>e.kind==='goal'||e.kind==='own_goal');
 const assists=new Map(events.filter(e=>e.kind==='assist'&&e.goal_event_id).map(e=>[String(e.goal_event_id),e]));
 const byGuest=new Map(guests.map(g=>[String(g.id),g]));
 const byPlayer=new Map(people.map(p=>[String(p.player_id),p]));
 const eventName=e=>e.guest_id?guestName(byGuest.get(String(e.guest_id))):nameOf(e.player_id);
 const teamFor=e=>e.guest_id?byGuest.get(String(e.guest_id))?.team_color:byPlayer.get(String(e.player_id))?.team_color;
 const renderRoster=color=>{const list=roster(color);return `<section class="szf-fp-panel ${color}"><div class="szf-fp-head">${color==='red'?'KIRMIZI':'BEYAZ'} TAKIM <small>${list.length}/7</small></div><ol class="szf-fp-list">${list.map((p,i)=>`<li><span class="szf-fp-num">${String(i+1).padStart(2,'0')}</span><span>${esc(p.name)}</span></li>`).join('')||'<li class="szf-fp-empty">Kadro kaydı yok</li>'}</ol></section>`;};
 const renderGoals=color=>{
   const list=goals.filter(e=>{const side=teamFor(e);return e.kind==='own_goal'?side&&side!==color:side===color;});
   // Her gol ayrı satır yerine golcü bazında gruplanır; asistler korunur.
   const grouped=new Map();
   for(const e of list){
     const player=eventName(e);const own=e.kind==='own_goal';
     const key=(own?'own:':'goal:')+(e.guest_id?'guest:'+String(e.guest_id):'player:'+String(e.player_id));
     if(!grouped.has(key))grouped.set(key,{player,count:0,own,assists:[]});
     const item=grouped.get(key);item.count++;
     const a=assists.get(String(e.id));
     if(a&&!own)item.assists.push(eventName(a));
   }
   return `<section class="szf-fp-panel ${color}"><div class="szf-fp-head">⚽ GOLLER <small>${list.length} GOL</small></div><ul class="szf-fp-event-list">${[...grouped.values()].map(item=>{
      const assistText=item.assists.length?` <span class="szf-fp-assist">(${esc(item.assists.join(', '))})</span>`:'';
      return `<li><span class="szf-fp-goal-name">${esc(item.player)}${item.own?' <span class="szf-fp-own">(KK)</span>':''}</span><strong class="szf-fp-goal-count">×${item.count}</strong>${assistText}</li>`;
   }).join('')||'<li class="szf-fp-empty">Gol kaydı yok</li>'}</ul></section>`;
 };
 const winner=red>white?'KIRMIZI TAKIM KAZANDI':white>red?'BEYAZ TAKIM KAZANDI':'BERABERE';
 const name=(m.title||'Haftalık Maç').split('[Saha:')[0].trim();
 return `<article class="szf-fast-poster" aria-label="Maç sonucu ${red} - ${white}">
  <div class="szf-fp-brand">✦ SZF AIRPORT HALI SAHA ✦</div>
  <h2 class="szf-fp-title">MAÇ SONU</h2>
  <p class="szf-fp-sub">${esc(name)} · ${esc(matchDateText(m.match_date))}</p>
  <div class="szf-fp-score"><div class="szf-fp-side red">KIRMIZI</div><div class="szf-fp-scoreline"><strong>${red}</strong><span class="szf-fp-dash">–</span><strong>${white}</strong></div><div class="szf-fp-side white">BEYAZ</div></div>
  <div class="szf-fp-winner">${winner}</div>
  <div class="szf-fp-grid">${renderRoster('red')}${renderRoster('white')}</div>
  <div class="szf-fp-grid">${renderGoals('red')}${renderGoals('white')}</div>
  <div class="szf-fp-footer">SZF AIRPORT HALI SAHA · BİRLİKTE DAHA GÜÇLÜ</div>
 </article>`;
}
function fillInlineSharePreviews(){
 document.querySelectorAll('[data-inline-share-preview]').forEach(node=>{
   const details=node.closest('.match-roster');
   if(details?.classList.contains('hidden'))return;
   const id=node.dataset.inlineSharePreview;
   const m=leagueMatches.find(x=>String(x.id)===String(id));
   if(!m)return;
   const signature=inlineSharePreviewSignature(m);
   if(node.dataset.loadedSignature===signature)return;
   node.innerHTML=buildFastPosterHTML(id);
   node.dataset.loadedSignature=signature;
 });
}
