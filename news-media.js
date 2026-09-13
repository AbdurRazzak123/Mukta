/* বাংলা সংবাদ — FINAL UNIVERSAL MEDIA RELIABILITY LAYER
   1) Google Drive URL -> thumbnail first
   2) GitHub/local repository image -> page-independent path
   3) GitHub RAW fallback -> protects against /news/ relative-path failures
   4) Existing relative URL + Drive fallbacks
   5) Works on home, category, more and detail pages
*/
(function(){
  'use strict';
  const VERSION='20260913-media-universal-v4';
  const TRANSPARENT='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  function repoBase(){
    const host=String(location.hostname||'').toLowerCase();
    if(host.endsWith('.github.io')){
      const parts=location.pathname.split('/').filter(Boolean);
      return parts.length ? '/'+parts[0]+'/' : '/';
    }
    if(!host) return location.pathname.includes('/news/') ? '../' : './';
    return '/';
  }
  function repoName(){
    const host=String(location.hostname||'').toLowerCase();
    if(!host.endsWith('.github.io')) return '';
    const parts=location.pathname.split('/').filter(Boolean);
    return parts[0]||'';
  }
  function githubOwner(){
    const host=String(location.hostname||'');
    return host.endsWith('.github.io') ? host.split('.')[0] : '';
  }
  function fileName(raw){
    const s=String(raw||'').trim().split(/[?#]/)[0];
    const p=s.split('/');
    return p[p.length-1]||'';
  }
  function driveId(raw){
    const s=String(raw||'').trim();
    const patterns=[
      /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/uc\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/thumbnail\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.usercontent\.google\.com\/[^?#]*\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /(?:^|[?&])id=([A-Za-z0-9_-]{10,})(?:[&#]|$)/i
    ];
    for(const p of patterns){const m=s.match(p);if(m)return m[1];}
    return '';
  }
  function driveCandidates(raw){
    const id=driveId(raw); if(!id)return [];
    return [
      `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
      `https://lh3.googleusercontent.com/d/${id}=w2000`,
      `https://drive.usercontent.google.com/download?id=${id}&export=view&confirm=t`,
      `https://drive.google.com/uc?export=view&id=${id}`,
      `https://drive.google.com/uc?export=download&id=${id}`
    ];
  }
  function isRemote(s){return /^(?:https?:|data:|blob:)/i.test(String(s||''));}
  function localCandidates(raw){
    const s=String(raw||'').trim(); if(!s||isRemote(s))return [];
    const clean=s.replace(/^\.\//,'').replace(/^\/+/,'');
    if(!clean)return [];
    const name=fileName(clean);
    const out=[];
    if(/^(?:assets\/news|news-media|news-images|images\/news)\//i.test(clean)){
      if(name){
        const rb=repoBase();
        out.push(rb+'assets/news/'+encodeURIComponent(name));
        const owner=githubOwner(), repo=repoName();
        if(owner&&repo){
          out.push(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/main/assets/news/${encodeURIComponent(name)}`);
          out.push(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/master/assets/news/${encodeURIComponent(name)}`);
        }
        // Page-relative fallbacks for local/offline copies.
        out.push(clean.startsWith('assets/') ? './'+clean : '../'+clean);
        out.push(new URL(clean,document.baseURI).href);
      }
    } else {
      out.push(new URL(clean,document.baseURI).href);
    }
    return out;
  }
  function candidates(img){
    const source=img.dataset.imageSource||img.getAttribute('src')||'';
    const out=[];
    const drives=driveCandidates(source);
    if(drives.length) out.push(...drives);
    else if(isRemote(source)) out.push(source);
    out.push(...localCandidates(source));
    return [...new Set(out.filter(Boolean))];
  }
  function mark(img){
    if(!img||img.dataset.mediaUniversal==='1')return;
    img.dataset.mediaUniversal='1';
    if(!img.dataset.imageSource){
      const current=img.getAttribute('src')||'';
      if(current && current!==TRANSPARENT) img.dataset.imageSource=current;
    }
    const source=img.dataset.imageSource||'';
    const list=candidates(img);
    img.dataset.mediaCandidates=JSON.stringify(list);
    if(!list.length)return;

    let i=0;
    const current=img.getAttribute('src')||'';
    const preferred=list[0];
    // Always normalize local/Drive sources immediately. This is important when
    // the original 404 happened before the error listener was attached.
    if(!current || current===TRANSPARENT || !current.includes('drive.google.com/thumbnail')){
      if(driveCandidates(source).length || /^(?:assets\/news|news-media|news-images|images\/news)\//i.test(source)){
        img.src=preferred;
        i=0;
      } else {
        const same=list.findIndex(x=>x===current);
        i=same>=0?same:0;
        if(same<0)img.src=preferred;
      }
    } else {
      const same=list.findIndex(x=>x===current); i=same>=0?same:0;
    }
    img.dataset.mediaIndex=String(i);

    img.addEventListener('error',function(){
      let n=Number(img.dataset.mediaIndex||0)+1;
      while(n<list.length && list[n]===img.currentSrc)n++;
      if(n<list.length){img.dataset.mediaIndex=String(n);img.src=list[n];}
      else {img.classList.add('image-load-failed');}
    });
  }
  function scan(root){
    const scope=root&&root.querySelectorAll?root:document;
    scope.querySelectorAll('img[data-image-source], img').forEach(mark);
    if(root&&root.tagName==='IMG')mark(root);
  }
  function style(){
    if(document.getElementById('media-universal-style'))return;
    const s=document.createElement('style');s.id='media-universal-style';
    s.textContent='.image-load-failed{background:#f1f1f1;object-fit:contain!important;} .article-extra-image img,.article-full-image img{max-width:100%;height:auto;}';
    document.head.appendChild(s);
  }
  function run(){
    style();scan(document);
    if(document.body)new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n);}))).observe(document.body,{childList:true,subtree:true});
    document.documentElement.dataset.mediaLoader=VERSION;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
