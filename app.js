'use strict';
(() => {
const BUILTIN = window.CARDS || [];
const BASE_COUNT = BUILTIN.length;
const KEY='aan-study-progress-v1', STORE=window.AANLibrary, ZIP=window.AANZip;
const $=id=>document.getElementById(id);
const read=new Set(), favs=new Set();
const state={last:1};
try {
  const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(Array.isArray(saved.read))saved.read.filter(Number.isInteger).forEach(id=>read.add(id));
  if(Array.isArray(saved.favorites))saved.favorites.filter(Number.isInteger).forEach(id=>favs.add(id));
  if(Number.isInteger(saved.last)&&saved.last>0)state.last=saved.last;
}catch(_error){}
let photoRows=[], hidden=new Set(), nextId=BASE_COUNT+1;
let catalog=[...BUILTIN], visible=[...BUILTIN], byId=new Map(catalog.map(c=>[c.id,c]));
let objectUrls=[], current=0, term='', range='all', filter='all', zoom=1, toastTimer=null;
let libraryAvailable=false, busy=false, deferredPrompt=null, replaceTarget=null;

function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4300);}
function make(tag,cl,txt){const e=document.createElement(tag);if(cl)e.className=cl;if(txt!=null)e.textContent=txt;return e;}
function saveProgress(){try{localStorage.setItem(KEY,JSON.stringify({read:[...read],favorites:[...favs],last:state.last,updated:new Date().toISOString()}));}catch(e){notify('進度儲存失敗，手機儲存空間可能不足。');}}
function pad(id){return String(id).padStart(3,'0');}
function currentFallback(){return visible.some(c=>c.id===state.last)?state.last:visible[0]?.id||0;}
function currentCard(){return byId.get(current);}
function isLocal(c){return c?.kind==='custom';}
function isReplaced(id){return photoRows.some(p=>p.id===id&&p.kind==='replacement');}
function isHidden(id){return hidden.has(id);}
function activeFilter(cards){
  return cards.filter(c=>{
    if(range!=='all'&&range!=='custom') {const [a,b]=range.split('-').map(Number);if(c.id<a||c.id>b)return false;}
    if(range==='custom'&&!isLocal(c))return false;
    if(filter==='custom'&&!isLocal(c))return false;
    if(filter==='read'&&!read.has(c.id))return false;
    if(filter==='unread'&&read.has(c.id))return false;
    if(filter==='favorite'&&!favs.has(c.id))return false;
    const q=term.trim().toLocaleLowerCase('zh-Hant-TW');
    return !q||c.title.toLocaleLowerCase('zh-Hant-TW').includes(q)||String(c.id).includes(q)||pad(c.id).includes(q);
  });
}
function rebuildCatalog(){
  objectUrls.forEach(u=>URL.revokeObjectURL(u));objectUrls=[];
  const maps=new Map();
  for(const record of photoRows){
    const src=URL.createObjectURL(record.blob), thumb=record.thumb?URL.createObjectURL(record.thumb):src;
    objectUrls.push(src);if(src!==thumb)objectUrls.push(thumb);
    maps.set(record.id,{...record,img:src,thumbUrl:thumb});
  }
  catalog=BUILTIN.map(c=>{
    const row=maps.get(c.id);
    return row?{...c,img:row.img,thumb:row.thumbUrl,version:'本機替換',replaced:true,kind:'builtin'}:{...c,kind:'builtin'};
  });
  for(const row of photoRows.filter(r=>r.kind==='custom'&&r.id>BASE_COUNT)){
    const withUrls=maps.get(row.id);
    catalog.push({id:row.id,title:row.title||`自訂圖卡 ${row.id}`,img:withUrls.img,thumb:withUrls.thumbUrl,kind:'custom',version:'本機新增'});
  }
  catalog.sort((a,b)=>a.id-b.id);
  byId=new Map(catalog.map(c=>[c.id,c]));
  visible=catalog.filter(c=>!hidden.has(c.id));
  $('brandSub').textContent=`${BASE_COUNT} 張內建・${catalog.length-BASE_COUNT} 張新增`;
  $('libraryHint').textContent=libraryAvailable?'新增或替換的圖片儲存在此裝置；換手機請先到「設定」匯出完整備份 ZIP。':'圖片資料庫無法使用；目前仍可閱讀原有圖卡。';
  rebuildRanges();render();
}
function rebuildRanges(){
  const e=$('rangeSelect'),old=e.value||range;e.replaceChildren();
  const option=(value,label)=>{const el=make('option',null,label);el.value=value;e.append(el);};
  option('all','全部圖卡');
  for(let a=1;a<=BASE_COUNT;a+=20)option(`${a}-${Math.min(a+19,BASE_COUNT)}`,`${a}～${Math.min(a+19,BASE_COUNT)} 張`);
  option('custom','我新增的圖卡');
  if(![...e.options].some(o=>o.value===old))range='all';else range=old;
  e.value=range;
}
function updateStats(){
  const n=visible.length,done=visible.filter(c=>read.has(c.id)).length,pct=n?Math.round(done/n*1000)/10:0;
  $('doneCount').textContent=`${done} / ${n} 已讀`;$('percent').textContent=`${pct}%`;
  $('progressFill').style.width=pct+'%';
  const id=currentFallback();
  $('resumeLabel').textContent=id?`繼續第 ${id} 張`:'目前沒有可閱讀的圖卡';$('resume').disabled=!id;$('homeJumpBtn')?.toggleAttribute('disabled',!id);
}
function render(){
  updateStats();const list=activeFilter(visible);
  $('resultCount').textContent=`${list.length} 張`;$('empty').hidden=!!list.length;
  const frag=document.createDocumentFragment();
  for(const c of list){
    const tile=make('button','tile');tile.type='button';tile.setAttribute('aria-label',`第 ${c.id} 張 ${c.title}`);
    const img=make('img','cover');img.src=c.thumb;img.alt='';img.loading='lazy';img.decoding='async';tile.append(img);
    const meta=make('div','tile-meta');meta.append(make('span','tile-no',`# ${pad(c.id)}`));
    if(isLocal(c))meta.append(make('span','tile-tag','新增'));
    else if(c.replaced)meta.append(make('span','tile-tag','已替換'));
    tile.append(meta,make('div','tile-title',c.title));
    const st=make('div','tile-status');st.append(make('span',read.has(c.id)?'status-done':'',read.has(c.id)?'✓ 已完成':'○ 未完成'));
    st.append(make('span','tile-fav',favs.has(c.id)?'★':''));tile.append(st);
    tile.addEventListener('click',()=>openCard(c.id));frag.append(tile);
  }
  $('cards').replaceChildren(frag);
}
function setZoom(z){
  zoom=Math.max(1,Math.min(3,Math.round(z*10)/10));
  const wrap=$('readerImageWrap'),img=$('readerImage');wrap.classList.toggle('zoomed',zoom>1);
  img.style.width=zoom===1?'':`${Math.round(zoom*100)}%`;
  img.style.maxWidth=zoom===1?'':'none';$('zoomLabel').textContent=Math.round(zoom*100)+'%';
}
function openCard(id){
  const c=byId.get(id);if(!c||hidden.has(id))return;
  current=id;state.last=id;saveProgress();
  const index=visible.findIndex(x=>x.id===id);
  $('readerNumber').textContent=`第 ${id} 號｜${index+1} / ${visible.length}`;
  $('readerTitle').textContent=c.title;
  $('readerImage').src=c.img;$('readerImage').alt=`第 ${id} 張：${c.title}`;
  $('readerFav').textContent=favs.has(id)?'★':'☆';
  $('readerFav').setAttribute('aria-label',favs.has(id)?'取消收藏':'加入收藏');
  $('doneBtn').textContent=read.has(id)?'✓ 已讀完成｜點此取消':'✓ 標記已讀完成';
  $('doneBtn').classList.toggle('is-done',read.has(id));
  $('prevBtn').disabled=index<=0;$('nextBtn').disabled=index===visible.length-1;
  $('reader').hidden=false;document.body.style.overflow='hidden';setZoom(1);
  $('readerScroll').scrollTop=0;$('readerScroll').scrollLeft=0;
  try{history.replaceState(null,'',`#card-${id}`);}catch(_e){}
  const next=visible[index+1];if(next){const preload=new Image();preload.src=next.img;}
}
function closeCard(){
  current=0;$('reader').hidden=true;document.body.style.overflow='';
  try{history.replaceState(null,'',location.pathname+location.search);}catch(_e){}
  render();
}
function moveReader(delta){
  const index=visible.findIndex(c=>c.id===current),next=visible[index+delta];
  if(index<0||!next)return;openCard(next.id);
}
function markRead(){if(!current)return;if(read.has(current))read.delete(current);else{read.add(current);notify('已標記完成！');}saveProgress();openCard(current);}
function toggleFav(){if(!current)return;if(favs.has(current)){favs.delete(current);notify('已取消收藏');}else{favs.add(current);notify('已加入收藏');}saveProgress();openCard(current);}
function openSettings(){$('settings').hidden=false;$('offlineStatus').textContent='';}
function closeSettings(){$('settings').hidden=true;}
function openManager(focusId){
  if(!libraryAvailable){notify('瀏覽器圖片資料庫尚未可用。');return;}
  if(current)closeCard();closeSettings();
  $('libraryManager').hidden=false;
  $('managerSearch').value=focusId?String(focusId):'';
  $('managerFilter').value='all';$('managerStatus').textContent='';renderManager();
}
function closeManager(){$('libraryManager').hidden=true;}
function renderManager(){
  const q=$('managerSearch').value.trim().toLowerCase(),f=$('managerFilter').value;
  const list=catalog.filter(c=>{
    const matches=!q||String(c.id).includes(q)||c.title.toLowerCase().includes(q);
    return matches&&(f==='all'||(f==='custom'&&isLocal(c))||(f==='replaced'&&c.replaced)||(f==='hidden'&&isHidden(c.id))||(f==='builtins'&&!isLocal(c)));
  });
  $('managerCounts').textContent=`${catalog.length} 張記錄（內建 ${BASE_COUNT}、新增 ${catalog.length-BASE_COUNT}、已替換 ${photoRows.filter(p=>p.kind==='replacement').length}、已隱藏 ${hidden.size}）；目前顯示 ${list.length} 張`;
  const fragment=document.createDocumentFragment();
  for(const c of list){
    const row=make('div','manager-item'+(isHidden(c.id)?' hidden-image':''));
    const image=make('img','manager-cover');image.src=c.thumb;image.alt='';image.loading='lazy';row.append(image);
    const info=make('div','manager-info');info.append(make('div','manager-name',`#${pad(c.id)}  ${c.title}`));
    const label=isLocal(c)?'自己新增':c.replaced?'內建（已替換圖片）':'內建原圖';
    info.append(make('div','manager-meta',label+(isHidden(c.id)?'｜已從目錄隱藏':'')));
    const actions=make('div','manager-item-actions');
    function action(title,fn,className){const b=make('button',className||'',title);b.type='button';b.addEventListener('click',fn);actions.append(b);}
    if(isLocal(c)){
      action('更改名稱',()=>renameCard(c.id));
      action('替換圖片',()=>startReplace(c.id));
      action('刪除圖片',()=>deleteCustom(c.id),'danger-mini');
    }else{
      action(c.replaced?'更新圖片':'替換圖片',()=>startReplace(c.id));
      if(c.replaced)action('還原原圖',()=>restoreOriginal(c.id),'restore-mini');
      action(isHidden(c.id)?'顯示回目錄':'隱藏圖卡',()=>toggleHidden(c.id),isHidden(c.id)?'restore-mini':'danger-mini');
    }
    info.append(actions);row.append(info);fragment.append(row);
  }
  if(!list.length)fragment.append(make('p','manager-empty','這個範圍還沒有圖卡。'));
  $('managerRows').replaceChildren(fragment);
}
function setManagerStatus(text){$('managerStatus').textContent=text;}
function imageTitle(name){return name.replace(/\.[^.]+$/,'').replace(/^\d{1,4}[\s_.-]*/,'').replace(/[_]+/g,' ').trim().slice(0,100)||'我的故事記憶圖';}
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif']);
async function thumbnail(file){
  const src=URL.createObjectURL(file);
  try {
    const img=new Image();img.src=src;
    if(img.decode)await img.decode();else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
    const maxWidth=270,maxHeight=380,scale=Math.min(maxWidth/img.naturalWidth,maxHeight/img.naturalHeight,1);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('手機無法產生縮圖');ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.78));
    if(blob)return blob;
    const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
    if(!jpeg)throw Error('無法製作圖片縮圖');return jpeg;
  } finally {URL.revokeObjectURL(src);}
}
function checkImage(file){
  if(!file)throw Error('沒有選取圖片');
  const ext=file.name.split('.').pop().toLowerCase();
  const inferred={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif'}[ext];
  if(!inferred||(file.type&&!IMAGE_TYPES.has(file.type)))throw Error('僅支援 PNG、JPG、WebP、GIF、AVIF 圖片');
  if(file.size>60*1024*1024)throw Error('單張圖片超過 60 MB，請先壓縮');
  if(file.size===0)throw Error('檔案是空的');
  return file.type||inferred;
}
async function addImages(event){
  const files=[...(event.target.files||[])];event.target.value='';
  if(!files.length||busy)return;
  busy=true;$('addImagesBtn').disabled=true;$('managerAddBtn').disabled=true;
  let added=0,fail=[];
  for(let i=0;i<files.length;i++){
    const file=files[i];
    setManagerStatus(`正在匯入 ${i+1}/${files.length}：${file.name}`);
    try {
      const mime=checkImage(file);
      const thumb=await thumbnail(file),id=nextId;
      await STORE.putPhoto({id,kind:'custom',title:imageTitle(file.name),name:file.name,mime,blob:file,thumb,added:new Date().toISOString()});
      nextId=id+1;await STORE.putSetting('nextId',nextId);
      added++;
    }catch(err){fail.push(`${file.name}：${err.message}`);}
  }
  try{photoRows=await STORE.allPhotos();rebuildCatalog();}catch(e){notify(`已匯入，但更新圖卡目錄失敗：${e.message}`);}
  busy=false;$('addImagesBtn').disabled=false;$('managerAddBtn').disabled=false;
  setManagerStatus(`已新增 ${added} 張${fail.length?`，${fail.length} 張失敗：${fail.slice(0,2).join('；')}`:''}`);
  notify(added?`新增完成：${added} 張圖卡，可直接開始閱讀。`:'沒有新增任何圖片，請檢查檔案。');
  if(!$('libraryManager').hidden)renderManager();
}
function startReplace(id){
  if(busy)return;replaceTarget=id;$('replaceImageInput').value='';$('replaceImageInput').click();
}
async function replaceImage(event){
  const file=event.target.files?.[0],id=replaceTarget;
  event.target.value='';replaceTarget=null;if(!file||!id||busy)return;
  const c=byId.get(id);if(!c)return;
  if(!confirm(`確認將第 ${id} 張「${c.title}」的圖片換成「${file.name}」？\n\n原有內建圖卡可以之後按「還原原圖」。`))return;
  busy=true;setManagerStatus(`正在替換第 ${id} 張…`);
  try {
    const mime=checkImage(file);const thumb=await thumbnail(file);
    const kind=id<=BASE_COUNT?'replacement':'custom';
    const original=photoRows.find(p=>p.id===id);
    await STORE.putPhoto({id,kind,title:original?.title||c.title,name:file.name,mime,blob:file,thumb,added:new Date().toISOString()});
    photoRows=await STORE.allPhotos();rebuildCatalog();renderManager();
    setManagerStatus(`第 ${id} 張已替換，原有的已讀及收藏紀錄保持不變。`);notify(`第 ${id} 張已替換圖片`);
  }catch(err){setManagerStatus(`替換失敗：${err.message}`);notify(`替換失敗：${err.message}`);}finally{busy=false;}
}
async function renameCard(id){
  const c=byId.get(id);if(!c||!isLocal(c))return;
  const newTitle=prompt('請輸入這張圖卡的新名稱：',c.title);
  if(newTitle===null)return;
  const title=newTitle.trim().slice(0,100);if(!title){notify('圖卡名稱不可空白');return;}
  try{
    const record=photoRows.find(p=>p.id===id);if(!record)return;
    await STORE.putPhoto({...record,title});photoRows=await STORE.allPhotos();rebuildCatalog();renderManager();notify('已更新圖卡名稱');
  }catch(e){notify(`更名失敗：${e.message}`);}
}
async function deleteCustom(id){
  const c=byId.get(id);if(!c||!isLocal(c))return;
  if(!confirm(`確定「永久刪除」第 ${id} 張「${c.title}」？\n\n這張自訂圖片會從這支手機的本機資料庫移除，無法復原（除非你曾匯出完整 ZIP 備份）。`))return;
  try{
    if(current===id)closeCard();await STORE.deletePhoto(id);
    read.delete(id);favs.delete(id);saveProgress();
    photoRows=await STORE.allPhotos();rebuildCatalog();renderManager();notify(`已刪除第 ${id} 張自訂圖片`);
  }catch(e){notify(`刪除失敗：${e.message}`);}
}
async function toggleHidden(id){
  if(id>BASE_COUNT)return;
  if(hidden.has(id))hidden.delete(id);
  else if(confirm(`確定隱藏第 ${id} 張？\n\n只是從目錄隱藏，不會刪除內建圖片；可以隨時從管理頁還原。`))hidden.add(id);
  else return;
  try{await STORE.putSetting('hidden',[...hidden]);rebuildCatalog();renderManager();notify(hidden.has(id)?'圖卡已從目錄隱藏':'圖卡已重新顯示');}
  catch(e){notify(`儲存設定失敗：${e.message}`);}
}
async function restoreOriginal(id){
  if(id>BASE_COUNT||!isReplaced(id))return;
  if(!confirm(`將第 ${id} 張還原成網站原有的圖片？\n\n目前替換的圖片將從本機刪除，無法復原（除非已有完整 ZIP 備份）。`))return;
  try{await STORE.deletePhoto(id);photoRows=await STORE.allPhotos();rebuildCatalog();renderManager();notify(`第 ${id} 張已還原原圖`);}
  catch(e){notify(`還原原圖失敗：${e.message}`);}
}
function download(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),120000);}
function progressData(){return {read:[...read],favorites:[...favs],last:state.last};}
function exportProgress(){download(new Blob([JSON.stringify({type:'aan-progress',version:1,...progressData()},null,2)],{type:'application/json'}),'乙安閱讀進度.json');notify('已匯出閱讀進度 JSON');}
async function importProgress(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
    const data=JSON.parse(await file.text());if(data.type!=='aan-progress'||!Array.isArray(data.read)||!Array.isArray(data.favorites))throw Error('備份格式不符');
    if(!confirm('確定以這份 JSON 覆蓋目前的閱讀進度與收藏嗎？'))return;
    read.clear();favs.clear();const known=new Set(catalog.map(c=>c.id));
    data.read.forEach(id=>{if(known.has(id))read.add(id);});data.favorites.forEach(id=>{if(known.has(id))favs.add(id);});
    state.last=known.has(data.last)?data.last:currentFallback();saveProgress();render();notify('進度已還原');
  }catch(e){notify(`匯入失敗：${e.message}`);}
}
function extFor(type){return {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','image/gif':'gif'}[type]||'png';}
async function backupLibrary(){
  if(!libraryAvailable||busy)return;
  busy=true;$('backupLibraryBtn').disabled=true;
  const status=$('backupStatus');status.textContent='準備完整備份中（可能需要一些手機記憶體）…';
  try {
    const entries=[],meta=[];
    for(const p of photoRows){
      const image=`photos/${p.id}.${extFor(p.mime)}`,thumb=`photos/${p.id}-thumb.${extFor(p.thumb?.type||'image/webp')}`;
      meta.push({id:p.id,kind:p.kind,title:p.title,name:p.name,mime:p.mime,image,thumb,thumbMime:p.thumb?.type||'image/webp',added:p.added});
      entries.push([image,p.blob],[thumb,p.thumb||p.blob]);
    }
    const manifest={type:'aan-local-library-backup',version:2,exportedAt:new Date().toISOString(),baseCount:BASE_COUNT,photos:meta,hidden:[...hidden],nextId,progress:progressData()};
    entries.unshift(['library.json',new TextEncoder().encode(JSON.stringify(manifest,null,2))]);
    const blob=await ZIP.pack(entries);
    download(blob,`乙安圖卡_完整備份_${new Date().toISOString().slice(0,10)}.zip`);
    status.textContent=`已匯出 ${photoRows.length} 筆本機圖片、${hidden.size} 個隱藏設定與學習進度；ZIP 約 ${(blob.size/1024/1024).toFixed(1)} MB。`;
    notify('完整備份 ZIP 已匯出，請保存到檔案或雲端硬碟。');
  }catch(e){status.textContent=`匯出失敗：${e.message}`;notify('完整備份匯出失敗');}
  finally{busy=false;$('backupLibraryBtn').disabled=false;}
}
async function restoreLibrary(event){
  const file=event.target.files?.[0];event.target.value='';if(!file||busy)return;
  busy=true;$('backupStatus').textContent='正在檢查備份 ZIP…';
  try{
    const files=await ZIP.unpack(file);
    const json=files.get('library.json');if(!json)throw Error('備份缺少 library.json');
    const backup=JSON.parse(new TextDecoder().decode(json));
    if(backup.type!=='aan-local-library-backup'||backup.version!==2||!Array.isArray(backup.photos)||!Array.isArray(backup.hidden))throw Error('備份格式不符');
    if(backup.baseCount!==BASE_COUNT)throw Error('內建圖卡版本不一致，請使用對應的閱讀器版本還原');
    if(backup.photos.length>5000)throw Error('備份圖片數量異常');
    const ids=new Set(),rows=[];
    for(const p of backup.photos){
      if(!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id))throw Error('圖片編號不正確或重複');
      if((p.id<=BASE_COUNT&&p.kind!=='replacement')||(p.id>BASE_COUNT&&p.kind!=='custom'))throw Error('圖片來源資料不正確');
      ids.add(p.id);
      if(!IMAGE_TYPES.has(p.mime)||typeof p.title!=='string'||p.title.length>100)throw Error('圖片格式或名稱錯誤');
      const image=files.get(p.image),thumb=files.get(p.thumb);if(!image||!thumb||image.length>60*1024*1024)throw Error('缺少圖片或檔案過大');
      rows.push({id:p.id,kind:p.kind,title:p.title,name:p.name||'',mime:p.mime,blob:new Blob([image],{type:p.mime}),thumb:new Blob([thumb],{type:p.thumbMime||'image/webp'}),added:p.added||''});
    }
    const hiddenIds=backup.hidden.filter(id=>Number.isInteger(id)&&id>=1&&id<=BASE_COUNT);
    const maxId=Math.max(BASE_COUNT,...rows.map(r=>r.id));
    const newNext=Math.max(maxId+1,Number.isInteger(backup.nextId)?backup.nextId:BASE_COUNT+1);
    if(!confirm(`這份備份包含 ${rows.length} 筆本機圖片、${hiddenIds.length} 個隱藏設定。\n\n還原會「取代」本裝置目前所有自行新增／替換的圖片及閱讀進度，確定繼續？`))return;
    $('backupStatus').textContent='正在還原圖片；請勿關閉頁面…';
    await STORE.restore(rows,hiddenIds,newNext);
    photoRows=await STORE.allPhotos();hidden=new Set(hiddenIds);nextId=newNext;
    if(backup.progress&&Array.isArray(backup.progress.read)&&Array.isArray(backup.progress.favorites)){
      read.clear();favs.clear();
      const ids=new Set([...BUILTIN.map(c=>c.id),...rows.filter(p=>p.kind==='custom').map(p=>p.id)]);
      backup.progress.read.forEach(id=>{if(ids.has(id))read.add(id);});
      backup.progress.favorites.forEach(id=>{if(ids.has(id))favs.add(id);});
      state.last=ids.has(backup.progress.last)?backup.progress.last:1;saveProgress();
    }
    rebuildCatalog();$('backupStatus').textContent=`完成：已還原 ${rows.length} 筆本機圖片與學習進度。`;
    notify('完整圖片備份已還原');
  }catch(err){$('backupStatus').textContent=`還原失敗：${err.message}`;notify(`無法還原：${err.message}`);}
  finally{busy=false;}
}
async function downloadOffline(){
  if(!('caches'in window)||!(location.protocol==='https:'||location.hostname==='localhost')){notify('下載內建圖卡快取需要 HTTPS 或 localhost 網站環境。');return;}
  const b=$('offlineBtn'),s=$('offlineStatus');b.disabled=true;
  const resources=BUILTIN.filter(c=>!hidden.has(c.id)&&!isReplaced(c.id)).flatMap(c=>[c.thumb,c.img]);
  let count=0,failed=0;
  try{
    const cache=await caches.open('aan-media-2026-11');
    for(const path of resources){
      const url=new URL(path,location.href).href;
      try{if(!(await cache.match(url))){const response=await fetch(url);if(!response.ok)throw Error(response.status);await cache.put(url,response);}count++;}catch(e){failed++;}
      if((count+failed)%5===0||count+failed===resources.length){s.textContent=`內建圖片離線儲存：${count}/${resources.length}${failed?'，失敗 '+failed:''}`;await new Promise(r=>setTimeout(r,0));}
    }
    notify(failed?'部分內建圖卡未儲存成功':'內建圖卡快取完成；新增圖片本來就保存在本機。');
  }catch(e){notify('離線儲存失敗，可能是手機空間不足');}finally{b.disabled=false;}
}
async function loadLibrary(){
  try{
    await STORE.open();photoRows=await STORE.allPhotos();
    hidden=new Set((await STORE.getSettings('hidden',[])).filter(id=>Number.isInteger(id)&&id<=BASE_COUNT&&id>=1));
    const storedNext=await STORE.getSettings('nextId',BASE_COUNT+1);
    nextId=Math.max(BASE_COUNT+1,Number.isInteger(storedNext)?storedNext:BASE_COUNT+1,...photoRows.map(p=>p.id+1));
    libraryAvailable=true;rebuildCatalog();
  }catch(e){
    libraryAvailable=false;rebuildCatalog();
    $('addImagesBtn').disabled=true;$('manageImagesBtn').disabled=true;
    notify(`無法使用圖片管理：${e.message}。原有圖卡仍可閱讀。`);
  }
}
function setupCardJump(){
  const dialog=$('jumpDialog'), input=$('jumpInput'), error=$('jumpError');
  if(!dialog)return;
  const clearError=()=>{
    error.textContent='';
    input.removeAttribute('aria-invalid');
  };
  const openJump=()=>{
    input.value='';
    clearError();
    dialog.showModal();
  };
  $('homeJumpBtn').onclick=openJump;
  $('readerJumpBtn').onclick=openJump;
  $('closeJump').onclick=()=>dialog.close();
  input.oninput=clearError;
  $('jumpForm').onsubmit=event=>{
    event.preventDefault();
    const value=input.value.trim().normalize('NFKC');
    const id=Number(value);
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(id)||id<1||!byId.has(id)||hidden.has(id)){
      error.textContent=hidden.has(id)?'這張圖卡已隱藏。請到圖片管理重新顯示。':'找不到這個圖卡編號，請重新輸入。';
      input.setAttribute('aria-invalid','true');
      input.focus();
      return;
    }
    dialog.close();
    openCard(id);
    $('readerJumpBtn').focus();
  };
}
function setup(){
  setupCardJump();
  $('resume').onclick=()=>{const id=currentFallback();if(id)openCard(id);};
  $('searchInput').oninput=e=>{term=e.target.value;render();};
  $('clearSearch').onclick=()=>{$('searchInput').value='';term='';render();};
  $('rangeSelect').onchange=e=>{range=e.target.value;render();};
  $('filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(node=>node.classList.toggle('active',node===b));render();});
  $('randomBtn').onclick=()=>{if(visible.length)openCard(visible[Math.floor(Math.random()*visible.length)].id);};
  $('readerBack').onclick=closeCard;$('prevBtn').onclick=()=>moveReader(-1);$('nextBtn').onclick=()=>moveReader(1);
  $('readerFav').onclick=toggleFav;$('doneBtn').onclick=markRead;
  $('zoomIn').onclick=()=>setZoom(zoom+.5);$('zoomOut').onclick=()=>setZoom(zoom-.5);
  $('readerImage').ondblclick=()=>setZoom(zoom===1?2:1);
  $('readerManage').onclick=()=>{const id=current;openManager(id);};
  $('settingsBtn').onclick=openSettings;$('settingsMask').onclick=closeSettings;$('closeSettings').onclick=closeSettings;
  $('offlineBtn').onclick=downloadOffline;$('exportBtn').onclick=exportProgress;$('importInput').onchange=importProgress;
  $('backupLibraryBtn').onclick=backupLibrary;$('restoreLibraryInput').onchange=restoreLibrary;
  $('resetBtn').onclick=()=>{if(!confirm('確定清除這支手機所有已讀與收藏紀錄？圖片不會刪除。'))return;read.clear();favs.clear();state.last=1;saveProgress();closeSettings();render();notify('學習進度已清除');};
  $('addImagesBtn').onclick=()=>$('addImagesInput').click();
  $('managerAddBtn').onclick=()=>$('addImagesInput').click();
  $('manageImagesBtn').onclick=()=>openManager();
  $('libraryMask').onclick=closeManager;$('closeLibrary').onclick=closeManager;
  $('managerSearch').oninput=renderManager;$('managerFilter').onchange=renderManager;
  $('addImagesInput').onchange=addImages;$('replaceImageInput').onchange=replaceImage;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
  $('installBtn').onclick=async()=>{if(deferredPrompt){await deferredPrompt.prompt();deferredPrompt=null;}else notify('iPhone：Safari 分享 → 加入主畫面；Android：Chrome 選單 → 安裝 App／新增至主畫面');};
  let tx=0,ty=0;
  $('readerScroll').addEventListener('touchstart',e=>{if(e.touches.length!==1)return;tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
  $('readerScroll').addEventListener('touchend',e=>{if(zoom>1||!tx||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.5)moveReader(dx<0?1:-1);tx=0;},{passive:true});
  window.addEventListener('keydown',e=>{if($('jumpDialog')?.open||!$('libraryManager').hidden||!$('settings').hidden)return;if(current){if(e.key==='Escape')closeCard();else if(e.key==='ArrowLeft')moveReader(-1);else if(e.key==='ArrowRight')moveReader(1);}});
  window.addEventListener('hashchange',()=>{const match=location.hash.match(/card-(\d+)/);if(match&&!current)openCard(Number(match[1]));});
  rebuildCatalog();loadLibrary().then(()=>{const match=location.hash.match(/card-(\d+)/);if(match)openCard(Number(match[1]));});
  if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
setup();
})();
