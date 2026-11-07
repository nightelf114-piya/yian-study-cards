'use strict';
/* Minimal ZIP (STORE/uncompressed) backup format, no external CDN dependency.
   Images are already compressed PNG/JPEG/WebP so STORE avoids unnecessary work. */
(() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const table = new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  function crc32(bytes) {let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  const dosTime = () => {const d = new Date();return {time:((d.getHours()&31)<<11)|((d.getMinutes()&63)<<5)|(Math.floor(d.getSeconds()/2)&31),date:(((d.getFullYear()-1980)&127)<<9)|(((d.getMonth()+1)&15)<<5)|(d.getDate()&31)};};
  function write16(v,o,n){v.setUint16(o,n,true)}
  function write32(v,o,n){v.setUint32(o,n,true)}
  async function pack(entries) {
    const parts=[], central=[], dt=dosTime();let offset=0;
    for (const [name,source] of entries) {
      const fileName=enc.encode(name);
      const data=source instanceof Uint8Array?source:new Uint8Array(await source.arrayBuffer());
      if(fileName.length>0xffff||data.length>0xffffffff)throw Error('單一檔案太大');
      const crc=crc32(data), local=new Uint8Array(30+fileName.length),lh=new DataView(local.buffer);
      write32(lh,0,0x04034b50);write16(lh,4,20);write16(lh,6,0x800);write16(lh,8,0);
      write16(lh,10,dt.time);write16(lh,12,dt.date);write32(lh,14,crc);
      write32(lh,18,data.length);write32(lh,22,data.length);write16(lh,26,fileName.length);write16(lh,28,0);
      local.set(fileName,30);
      parts.push(local,data);
      const cd=new Uint8Array(46+fileName.length),dv=new DataView(cd.buffer);
      write32(dv,0,0x02014b50);write16(dv,4,20);write16(dv,6,20);
      write16(dv,8,0x800);write16(dv,10,0);write16(dv,12,dt.time);write16(dv,14,dt.date);
      write32(dv,16,crc);write32(dv,20,data.length);write32(dv,24,data.length);
      write16(dv,28,fileName.length);write16(dv,30,0);write16(dv,32,0);
      write16(dv,34,0);write16(dv,36,0);write32(dv,38,0);write32(dv,42,offset);
      cd.set(fileName,46);central.push(cd);offset+=local.length+data.length;
    }
    if(entries.length>65535)throw Error('太多檔案');
    const start=offset;for(const p of central){parts.push(p);offset+=p.length;}
    const end=new Uint8Array(22),e=new DataView(end.buffer);
    write32(e,0,0x06054b50);write16(e,4,0);write16(e,6,0);write16(e,8,entries.length);write16(e,10,entries.length);
    write32(e,12,offset-start);write32(e,16,start);write16(e,20,0);parts.push(end);
    return new Blob(parts,{type:'application/zip'});
  }
  async function unpack(blob) {
    if(blob.size>800*1024*1024)throw Error('備份檔過大（上限 800 MB）');
    const ab=await blob.arrayBuffer(),bytes=new Uint8Array(ab),dv=new DataView(ab);
    let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(dv.getUint32(p,true)===0x06054b50){end=p;break;}}
    if(end<0)throw Error('不是可辨識的 ZIP 備份');
    const n=dv.getUint16(end+10,true),start=dv.getUint32(end+16,true);
    if(n>10000)throw Error('備份檔案數異常');
    let p=start;const files=new Map();
    for(let i=0;i<n;i++){
      if(p+46>bytes.length||dv.getUint32(p,true)!==0x02014b50)throw Error('ZIP 目錄損毀');
      const method=dv.getUint16(p+10,true),size=dv.getUint32(p+20,true),len=dv.getUint16(p+28,true),extra=dv.getUint16(p+30,true),comment=dv.getUint16(p+32,true),offset=dv.getUint32(p+42,true);
      if(method!==0)throw Error('僅支援從本閱讀器匯出的未壓縮 ZIP 備份');
      const name=dec.decode(bytes.subarray(p+46,p+46+len));
      if(!name.startsWith('photos/')&&name!=='library.json')throw Error('備份包含非預期檔案');
      if(offset+30>bytes.length||dv.getUint32(offset,true)!==0x04034b50)throw Error('ZIP 內容損毀');
      const ln=dv.getUint16(offset+26,true),ex=dv.getUint16(offset+28,true),s=offset+30+ln+ex;
      if(s+size>bytes.length)throw Error('備份內容不完整');
      const content=bytes.subarray(s,s+size);
      if(crc32(content)!==dv.getUint32(p+16,true))throw Error(`備份圖片檢查失敗：${name}`);
      if(files.has(name))throw Error('備份檔名重複');
      files.set(name,new Uint8Array(content));p+=46+len+extra+comment;
    }
    return files;
  }
  window.AANZip = {pack,unpack};
})();
