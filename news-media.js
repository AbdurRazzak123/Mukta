/* বাংলা সংবাদ — FINAL media reliability layer
   One image pipeline for Home / Category / More / Detail pages.
   Supports Google Drive share URLs, Drive thumbnail URLs, local repository paths,
   and ordinary HTTPS image URLs.  Optional image-2/image-3 are untouched unless present.
*/
(function(){
  'use strict';
  if(window.__BanglaSongbadMediaFinalLoaded)return;
  window.__BanglaSongbadMediaFinalLoaded=true;

  const isNewsPage=/\/news\//i.test(location.pathname);
  const ROOT_BASE=isNewsPage?'../':'./';

  function driveId(raw){
    const s=String(raw||'').trim();
    const patterns=[
      /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/(?:uc|thumbnail)\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/drive\/u\/\d+\/folders\/([A-Za-z0-9_-]+)/i
    ];
    for(const p of patterns){const m=s.match(p);if(m&&m[1])return m[1];}
    return '';
  }

  // Google Drive's thumbnail endpoint is the primary web-image route.
  // The older uc?export=view/download routes are fallbacks only.
  function driveCandidates(raw){
    const id=driveId(raw); if(!id)return [];
    return [
      `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`,
      `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w2000`,
      `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`,
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
    ];
  }

  function localCandidates(raw){
    const s=String(raw||'').trim().replace(/^\.\//,'').replace(/^\/+/,'');
    if(!s||/^https?:\/\//i.test(s)||/^data:/i.test(s)||/^blob:/i.test(s))return [];
    // Do not construct a guessed raw.githubusercontent.com URL.  The previous
    // version depended on an undefined/guessed repository branch and could fail.
    return [ROOT_BASE+s];
  }

  function candidates(img){
    const source=img.dataset.imageSource||img.getAttribute('src')||'';
    const out=[];
    const did=driveId(source);
    if(did)out.push(...driveCandidates(source));
    else if(/^https?:\/\//i.test(source))out.push(source);
    out.push(...localCandidates(source));
    try{
      const absolute=new URL(source,document.baseURI).href;
      if(!out.includes(absolute))out.push(absolute);
    }catch(e){}
    return [...new Set(out.filter(Boolean))];
  }

  function attach(img){
    if(!img||img.dataset.mediaReliability==='1')return;
    img.dataset.mediaReliability='1';
    if(!img.dataset.imageSource)img.dataset.imageSource=img.getAttribute('src')||'';
    const list=candidates(img);
    img.dataset.mediaCandidates=JSON.stringify(list);
    img.dataset.mediaStep='0';

    const original=img.getAttribute('src')||'';
    const did=driveId(img.dataset.imageSource||'');
    // For Drive sources, deliberately start with thumbnail endpoint.
    if(did && list.length && original!==list[0]){
      img.src=list[0];
      img.dataset.mediaStep='1';
    }

    img.addEventListener('error',function(){
      let arr=[];
      try{arr=JSON.parse(img.dataset.mediaCandidates||'[]')}catch(e){arr=[]}
      let i=Number(img.dataset.mediaStep||0);
      const current=img.currentSrc||img.src||'';
      while(i<arr.length && arr[i]===current)i++;
      if(i<arr.length){
        img.dataset.mediaStep=String(i+1);
        img.src=arr[i];
        return;
      }
      img.classList.add('image-load-failed');
    });
  }

  function scan(root=document){
    if(!root||!root.querySelectorAll)return;
    root.querySelectorAll('img').forEach(attach);
    if(root.tagName==='IMG')attach(root);
  }

  function run(){
    const style=document.createElement('style');
    style.id='media-reliability-final-style';
    style.textContent='.image-load-failed{background:#f1f1f1;min-height:120px;object-fit:contain!important}.article-extra-image img,.article-full-image img{max-width:100%;height:auto;display:block}';
    if(!document.getElementById(style.id))document.head.appendChild(style);
    scan(document);
    if(document.body){
      new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)}))).observe(document.body,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
