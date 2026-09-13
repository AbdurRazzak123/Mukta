/* বাংলা সংবাদ — শক্তিশালী সব-পেজ Media Reliability Layer.
   Google Sheet -> Drive URL/local image -> browser-safe image candidates. */
(function(){
 'use strict';
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
 function driveCandidates(raw){
   const id=driveId(raw);if(!id)return [];
   return [
     `https://lh3.googleusercontent.com/d/${id}=w2000`,
     `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
     `https://drive.google.com/uc?export=view&id=${id}`,
     `https://drive.google.com/uc?export=download&id=${id}`
   ];
 }
 function githubRaw(path){
   const host=location.hostname;
   const parts=location.pathname.split('/').filter(Boolean);
   if(host.endsWith('github.io')&&parts.length){
     return `https://raw.githubusercontent.com/${host.split('.')[0]}/${parts[0]}/main/${path}`;
   }
   return '';
 }
 function localCandidates(raw){
   const s=String(raw||'').trim().replace(/^\.\//,'').replace(/^\/+/, '');
   if(!s||/^https?:\/\//i.test(s)||s.startsWith('data:'))return [];
   const out=[];
   if(isNewsPage)out.push('../'+s);
   else out.push('./'+s);
   const rp=githubRaw(s);if(rp)out.push(rp);
   return out;
 }
 function candidates(img){
   const source=img.dataset.imageSource||img.getAttribute('src')||'';
   const out=[...driveCandidates(source)];
   if(/^https?:\/\//i.test(source)&&!driveId(source))out.push(source);
   out.push(...localCandidates(source));
   try{out.push(new URL(source,document.baseURI).href);}catch(e){}
   return [...new Set(out.filter(Boolean))];
 }
 function attach(img){
   if(!img||img.dataset.mediaReliability==='1')return;
   img.dataset.mediaReliability='1';
   if(!img.dataset.imageSource)img.dataset.imageSource=img.getAttribute('src')||'';
   const list=candidates(img);img.dataset.mediaCandidates=JSON.stringify(list);
   if(list.length && img.src!==list[0] && driveId(img.dataset.imageSource||''))img.src=list[0];
   img.addEventListener('error',function(){
     const arr=JSON.parse(img.dataset.mediaCandidates||'[]');
     let i=Number(img.dataset.mediaStep||0);
     while(i<arr.length && arr[i]===img.src)i++;
     if(i<arr.length){img.dataset.mediaStep=String(i+1);img.src=arr[i];return;}
     img.classList.add('image-load-failed');
   });
 }
 function scan(root=document){if(!root.querySelectorAll)return;root.querySelectorAll('img').forEach(attach);if(root.tagName==='IMG')attach(root);}
 function run(){
   const s=document.createElement('style');s.id='media-reliability-style';s.textContent='.image-load-failed{background:#f1f1f1;min-height:120px;object-fit:contain!important}.article-extra-image img,.article-full-image img{max-width:100%;height:auto;display:block}';if(!document.getElementById(s.id))document.head.appendChild(s);
   scan();
   new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)}))).observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
