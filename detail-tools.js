(function(){
  'use strict';
  if(window.__BanglaSongbadDetailToolsLoaded)return;
  window.__BanglaSongbadDetailToolsLoaded=true;

  const BASE = location.pathname.includes('/news/') ? '../' : './';
  const title = (document.querySelector('h1')?.textContent || document.title || 'বাংলা সংবাদ').trim();
  const url = location.href;

  const style=document.createElement('style');
  style.id='banglasangbad-detail-tools-style';
  style.textContent=`
    .bs-detail-search-wrap{max-width:1200px;margin:10px auto;padding:0 12px;box-sizing:border-box}
    .bs-detail-search{position:relative;display:flex;gap:7px;max-width:680px;margin:0 auto;background:#fff;border:1px solid #d7dee7;border-radius:10px;padding:5px;box-shadow:0 2px 8px rgba(16,42,67,.06)}
    .bs-detail-search input{flex:1;min-width:0;border:0;outline:0;padding:9px 11px;font:600 14px/1.3 Arial,"Noto Sans Bengali",sans-serif;background:transparent;color:#17202a}
    .bs-detail-search button{border:0;border-radius:7px;background:#d71920;color:#fff;font-weight:800;padding:0 15px;cursor:pointer}
    .bs-detail-search-results{display:none;position:absolute;z-index:99999;left:0;right:0;top:52px;background:#fff;border:1px solid #d7dee7;border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.16);max-height:360px;overflow:auto}
    .bs-detail-search-results a{display:block;padding:10px 13px;border-bottom:1px solid #eef1f4;text-decoration:none;color:#17202a;font-weight:700;font-size:14px;line-height:1.45}
    .bs-detail-search-results a:hover{background:#fff5f6;color:#d71920}
    .bs-detail-search-results small{font-weight:600;color:#667085}
    .bs-share{max-width:1200px;margin:0 auto 22px;padding:0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .bs-share-label{font:800 14px/1.4 Arial,"Noto Sans Bengali",sans-serif;color:#344054;margin-right:3px}
    .bs-share a,.bs-share button{border:0;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:8px;padding:8px 11px;font:800 13px/1 Arial,"Noto Sans Bengali",sans-serif;min-height:34px;box-sizing:border-box}
    .bs-facebook{background:#1877f2;color:#fff}.bs-twitter{background:#111;color:#fff}.bs-native{background:#0b2d3a;color:#fff}.bs-youtube{background:#ff0033;color:#fff}.bs-instagram{background:#d62976;color:#fff}.bs-copy{background:#eef2f6;color:#182230}
    #live-date{display:block!important}
    @media(max-width:768px){
      .bs-detail-search-wrap{margin:8px auto;padding:0 12px}
      .bs-detail-search button{padding:0 12px;font-size:12px}
      .bs-detail-search input{font-size:13px}
      .bs-share{padding:0 12px;margin-bottom:18px;justify-content:flex-start}
      .bs-share a,.bs-share button{padding:8px 10px;font-size:12px}
    }
  `;
  document.head.appendChild(style);

  function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function normalizeId(v){const s=String(v??'').trim();return /^\d+(?:\.0+)?$/.test(s)?String(parseInt(s,10)):s;}
  function searchHref(id){return BASE+'news/'+encodeURIComponent(normalizeId(id))+'.html';}
  function copy(){
    if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>alert('নিউজের লিংক কপি হয়েছে।'));}
    else{const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();alert('নিউজের লিংক কপি হয়েছে।');}
  }
  async function nativeShare(){
    if(navigator.share){try{await navigator.share({title:title,text:title,url:url});return;}catch(e){}}
    copy();
  }
  function openSocial(type){
    const u=encodeURIComponent(url),t=encodeURIComponent(title);
    const links={facebook:'https://www.facebook.com/sharer/sharer.php?u='+u,twitter:'https://twitter.com/intent/tweet?url='+u+'&text='+t};
    if(links[type])window.open(links[type],'_blank','noopener,noreferrer,width=680,height=620');
    else if(type==='youtube'){copy();window.open('https://www.youtube.com/','_blank','noopener,noreferrer');}
    else if(type==='instagram'){copy();window.open('https://www.instagram.com/','_blank','noopener,noreferrer');}
  }

  const nav=document.querySelector('.nav');
  if(nav){
    document.querySelectorAll('.bs-detail-search-wrap').forEach(el=>el.remove());
    const wrap=document.createElement('div');
    wrap.className='bs-detail-search-wrap';
    wrap.innerHTML=`<div class="bs-detail-search" role="search"><input id="bs-detail-search-input" type="search" placeholder="নিউজ খুঁজুন..." aria-label="নিউজ খুঁজুন"><button id="bs-detail-search-btn" type="button">সার্চ</button><div id="bs-detail-search-results" class="bs-detail-search-results"></div></div>`;
    nav.insertAdjacentElement('afterend',wrap);
    const input=wrap.querySelector('#bs-detail-search-input'),btn=wrap.querySelector('#bs-detail-search-btn'),results=wrap.querySelector('#bs-detail-search-results');
    let items=[];
    fetch(BASE+'news-data.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
      const rows=data?.table?.rows||[];
      items=rows.map(r=>{const c=r.c||[];return{id:c[0]?.v,category:c[1]?.v||'',title:c[2]?.v||'',keywords:c[9]?.v||''};}).filter(x=>x.id!==undefined&&x.id!==null&&String(x.id).trim()&&x.title);
    }).catch(()=>{});
    function render(goFirst=false){
      const q=input.value.trim().toLowerCase();results.innerHTML='';
      if(!q){results.style.display='none';return;}
      const found=items.filter(x=>(x.title+' '+x.category+' '+x.keywords).toLowerCase().includes(q)).slice(0,10);
      if(!found.length){results.innerHTML='<div style="padding:14px;font-weight:700;color:#667085">কোনো সংবাদ পাওয়া যায়নি।</div>';results.style.display='block';return;}
      found.forEach(x=>{const a=document.createElement('a');a.href=searchHref(x.id);a.innerHTML='<strong>'+esc(x.title)+'</strong><br><small>'+esc(x.category)+'</small>';results.appendChild(a);});
      results.style.display='block';
      if(goFirst)results.querySelector('a')?.click();
    }
    input.addEventListener('input',()=>render(false));
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();render(true);}});
    btn.addEventListener('click',()=>render(true));
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))results.style.display='none';});
  }

  const h1=document.querySelector('h1.home-feature-title');
  if(h1 && !document.querySelector('.bs-share')){
    const share=document.createElement('div');share.className='bs-share';
    share.innerHTML=`<span class="bs-share-label">শেয়ার করুন:</span><a href="#" class="bs-facebook">Facebook</a><a href="#" class="bs-twitter">Twitter/X</a><button class="bs-native" type="button">📱 শেয়ার</button><a href="#" class="bs-youtube">YouTube</a><a href="#" class="bs-instagram">Instagram</a><button class="bs-copy" type="button">লিংক কপি</button>`;
    h1.insertAdjacentElement('afterend',share);
    share.querySelector('.bs-facebook').onclick=e=>{e.preventDefault();openSocial('facebook');};
    share.querySelector('.bs-twitter').onclick=e=>{e.preventDefault();openSocial('twitter');};
    share.querySelector('.bs-native').onclick=e=>{e.preventDefault();nativeShare();};
    share.querySelector('.bs-youtube').onclick=e=>{e.preventDefault();openSocial('youtube');};
    share.querySelector('.bs-instagram').onclick=e=>{e.preventDefault();openSocial('instagram');};
    share.querySelector('.bs-copy').onclick=copy;
  }
})();
