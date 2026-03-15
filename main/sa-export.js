// ══════════════════════════
//  EXPORT / DOWNLOAD
// ══════════════════════════

$('ePNG').addEventListener('click',()=>{
  if(!G.nails||G.nails.length<2)return;
  // Render to a fresh canvas at high res for export
  const SZ=1200,sz=G.imgSz,sc=SZ/sz;
  const ec=document.createElement('canvas');ec.width=SZ;ec.height=SZ;
  const ctx=ec.getContext('2d');
  const thick=parseFloat($('st').value)*2; // scale thickness for 2× size
  const[r,g,b]=hexRgb(G.color);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,SZ,SZ);
  ctx.save();ctx.beginPath();ctx.arc(SZ/2,SZ/2,SZ/2-1,0,Math.PI*2);ctx.clip();
  const exportOpacity=Math.min(0.9,Math.max(0.04,550/Math.max(1,G.nails.length-1)));
  ctx.strokeStyle=`rgba(${r},${g},${b},${exportOpacity.toFixed(3)})`;ctx.lineWidth=thick;ctx.beginPath();
  const np=G.nailPos,list=G.nails;
  for(let i=0;i<list.length-1;i++){const f=np[list[i]],t=np[list[i+1]];ctx.moveTo(f.x*sc,f.y*sc);ctx.lineTo(t.x*sc,t.y*sc);}
  ctx.stroke();ctx.restore();
  ctx.beginPath();ctx.arc(SZ/2,SZ/2,SZ/2-1,0,Math.PI*2);
  ctx.strokeStyle='rgba(0,0,0,.1)';ctx.lineWidth=2;ctx.stroke();
  const a=document.createElement('a');a.download='shweka-string-art.png';a.href=ec.toDataURL();a.click();
});

$('eSVG').addEventListener('click',()=>{
  if(!G.nails||G.nails.length<2)return;
  const np=G.nailPos,list=G.nails,SZ=SVG_SZ,sc=SZ/G.imgSz;
  const thick=parseFloat($('st').value),col=G.color;
  const d=buildSvgLines(list,np,G.imgSz);
  const[r,g,b]=hexRgb(col);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${SZ}" height="${SZ}" viewBox="0 0 ${SZ} ${SZ}">`+
    `<defs><clipPath id="c"><circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}"/></clipPath></defs>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2}" fill="#ffffff"/>`+
    `<g clip-path="url(#c)"><path d="${d}" fill="none" stroke="rgba(${r},${g},${b},${(Math.min(0.9,Math.max(0.04,550/Math.max(1,G.nails.length-1)))).toFixed(3)})" stroke-width="${thick}" stroke-linecap="round"/></g>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1.5"/>`+
    `</svg>`;
  const a=document.createElement('a');a.download='shweka-string-art.svg';
  a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));a.click();
});

$('eTXT').addEventListener('click',()=>{
  if(!G.nails||G.nails.length<2)return;
  const N=parseInt($('sn').value);
  const isBack = G.algo==='back';
  const seqStr = isBack
    ? G.nails.map((n,i)=>n+(i%2===0?'F':'B')).join('\n')
    : G.nails.join('\n');
  const artName = G.imgName||'string-art';
  const _diam=parseFloat($('physDiam')?.value)||45;
  const _nailT=document.getElementById('ntSun')?.classList.contains('on')?'Sun':'Nail';
  const _nailD=_nailT==='Nail'?(parseFloat($('nailDiam')?.value)||1.63)+' mm':'—';
  const t=`Shweka Studio - String Art Nail Sequence\n==========================================\nArtwork: ${artName}\nAlgorithm: ${isBack?'Back Allowed':'Greedy'}\nNails: ${N}, CCW from top (0 to ${N-1})\nLines: ${G.nails.length-1}\nStep: ${WD.pos}\nCircle: ${_diam} cm diameter\nNail type: ${_nailT}  Nail diameter: ${_nailD}\n\nSEQUENCE:\n`+seqStr;
  const a=document.createElement('a');a.download=artName+'-nails.txt';a.href=URL.createObjectURL(new Blob([t],{type:'text/plain'}));a.click();
});

// ── Save from wind overlay ──
function _windBuildText(artName){
  const N=G.nailPos?G.nailPos.length:parseInt($('sn').value);
  const isBack=G.algo==='back';
  const seqStr=isBack
    ?G.nails.map((n,i)=>n+(i%2===0?'F':'B')).join('\n')
    :G.nails.join('\n');
  const _diam=parseFloat($('physDiam')?.value)||45;
  const _nailT=document.getElementById('ntSun')?.classList.contains('on')?'Sun':'Nail';
  const _nailD=_nailT==='Nail'?(parseFloat($('nailDiam')?.value)||1.63)+' mm':'—';
  return `Shweka Studio - String Art Nail Sequence\n==========================================\nArtwork: ${artName}\nAlgorithm: ${isBack?'Back Allowed':'Greedy'}\nNails: ${N}, CCW from top (0 to ${N-1})\nLines: ${G.nails.length-1}\nStep: ${WD.pos}\nCircle: ${_diam} cm diameter\nNail type: ${_nailT}  Nail diameter: ${_nailD}\n\nSEQUENCE:\n`+seqStr;
}

async function windSave(){
  if(!G.nails||G.nails.length<2) return;

  const artName = WD.artName || G.imgName || 'string-art';
  const suggestedName = WD.fileName || artName+'-nails.txt';

  // Update overlay
  if($('windArtName')&&artName){ $('windArtName').textContent=artName; $('windArtName').style.display='block'; }

  const text = _windBuildText(artName);

  // ── File System Access API (PC Chrome) — silent overwrite after first pick ──
  if('showSaveFilePicker' in window){
    try{
      if(!WD.fileHandle){
        // First save — show picker once
        WD.fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types:[{description:'Text file',accept:{'text/plain':['.txt']}}]
        });
        // Derive names from what user picked
        WD.fileName = WD.fileHandle.name;
        WD.artName = WD.artName || WD.fileName.replace(/-nails\.txt$/,'').replace(/\.[^.]+$/,'');
      }
      // Write silently (no dialog)
      const writable = await WD.fileHandle.createWritable();
      await writable.write(text);
      await writable.close();
      _windSaveToast('✓ Saved — '+WD.fileName);
      return;
    } catch(e){
      if(e.name==='AbortError') return; // user cancelled picker
      // fall through to download fallback
      WD.fileHandle=null;
    }
  }

  // ── Fallback: standard download (non-Chrome or API unavailable) ──
  const a=document.createElement('a');
  a.download=suggestedName;
  a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));
  a.click();
  WD.fileName=suggestedName;
}

function _windSaveToast(msg){
  const d=document.createElement('div');
  d.textContent=msg;
  d.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.88);color:#fff;padding:9px 20px;border-radius:22px;font-family:Inter,sans-serif;font-size:0.82rem;z-index:9999;pointer-events:none;white-space:nowrap;';
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),2500);
}
