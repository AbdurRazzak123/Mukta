/* বাংলা সংবাদ — FINAL universal image loader
   Google Sheet -> Drive/local image -> article/category pages.
   Drive images must be shared so the public page can read them.
*/
(function(){
  'use strict';

  const VERSION = '20260913-media-universal-v3';

  function driveId(raw){
    const s = String(raw || '').trim();
    const patterns = [
      /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/uc\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.google\.com\/thumbnail\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /drive\.usercontent\.google\.com\/[^?#]*\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/i,
      /(?:^|[?&])id=([A-Za-z0-9_-]{10,})(?:[&#]|$)/i
    ];
    for(const p of patterns){ const m=s.match(p); if(m) return m[1]; }
    return '';
  }

  function driveCandidates(raw){
    const id = driveId(raw);
    if(!id) return [];
    return [
      // Primary route requested for this project.
      `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
      // Googleusercontent route is a useful secondary route when thumbnail is blocked.
      `https://lh3.googleusercontent.com/d/${id}=w2000`,
      // Drive's user-content download endpoint.
      `https://drive.usercontent.google.com/download?id=${id}&export=view&confirm=t`,
      // Older Drive routes kept only as fallbacks.
      `https://drive.google.com/uc?export=view&id=${id}`,
      `https://drive.google.com/uc?export=download&id=${id}`
    ];
  }

  function isRemote(s){ return /^(?:https?:|data:|blob:)/i.test(String(s||'')); }

  function localCandidates(raw){
    const s = String(raw || '').trim();
    if(!s || isRemote(s)) return [];
    const clean = s.replace(/^\.\//,'').replace(/^\//,'');
    if(!clean) return [];
    const encoded = clean.split('/').map(encodeURIComponent).join('/');
    const prefix = location.pathname.includes('/news/') ? '../' : './';
    return [prefix + encoded];
  }

  function candidates(img){
    const source = img.dataset.imageSource || img.getAttribute('src') || '';
    const out = [];
    // If the Sheet contains a Drive URL, try Drive first.
    out.push(...driveCandidates(source));
    // Then the exact remote URL, if it is not a Drive link.
    if(isRemote(source) && !driveCandidates(source).length) out.push(source);
    // Local repository image fallback.
    out.push(...localCandidates(source));
    // Finally resolve any relative URL exactly as the browser would.
    try{
      const abs = new URL(source, document.baseURI).href;
      if(!out.includes(abs)) out.push(abs);
    }catch(e){}
    return [...new Set(out.filter(Boolean))];
  }

  function mark(img){
    if(!img || img.dataset.mediaUniversal === '1') return;
    img.dataset.mediaUniversal = '1';
    if(!img.dataset.imageSource) img.dataset.imageSource = img.getAttribute('src') || '';

    const list = candidates(img);
    img.dataset.mediaCandidates = JSON.stringify(list);
    if(!list.length) return;

    const current = img.getAttribute('src') || '';
    let index = list.indexOf(current);
    if(index < 0) index = 0;
    img.dataset.mediaIndex = String(index);

    img.addEventListener('error', function(){
      let i = Number(img.dataset.mediaIndex || 0) + 1;
      while(i < list.length && list[i] === img.src) i++;
      if(i < list.length){
        img.dataset.mediaIndex = String(i);
        img.src = list[i];
      } else {
        img.classList.add('image-load-failed');
      }
    });

    // If the initial source is empty, start the candidate chain immediately.
    if(!current){
      img.src = list[0];
    }
  }

  function scan(root){
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img').forEach(mark);
    if(root && root.tagName === 'IMG') mark(root);
  }

  function addStyle(){
    if(document.getElementById('media-universal-style')) return;
    const style = document.createElement('style');
    style.id = 'media-universal-style';
    style.textContent = `
      .image-load-failed{background:#f1f1f1;min-height:120px;object-fit:contain!important;}
      .article-extra-image img,.article-full-image img{max-width:100%;height:auto;}
    `;
    document.head.appendChild(style);
  }

  function run(){
    addStyle();
    scan(document);
    if(document.body){
      new MutationObserver(function(mutations){
        mutations.forEach(function(m){
          m.addedNodes.forEach(function(n){ if(n.nodeType === 1) scan(n); });
        });
      }).observe(document.body,{childList:true,subtree:true});
    }
    document.documentElement.dataset.mediaLoader = VERSION;
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
