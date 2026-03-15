// ══════════════════════════
//  RENDER / PLAYBACK / COMPARE
// ══════════════════════════

function hexRgb(h){const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return r?[parseInt(r[1],16),parseInt(r[2],16),parseInt(r[3],16)]:[0,0,0];}

// ══ SWATCHES ══
document.querySelectorAll('.swatch').forEach(sw=>{
  sw.addEventListener('click',()=>{
    document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('on'));
    sw.classList.add('on');G.color=sw.dataset.c;
    if(G.done&&!G.compareMode)render();
  });
});

// ══ NAIL PANEL ══
function renderNailPanel(list){
  const isBack=G.algo==='back';
  let h='';const rec=Math.max(0,list.length-8);
  for(let i=0;i<list.length;i++){
    const label=isBack?list[i]+(i%2===0?'F':'B'):list[i];
    h+=`<span${i>=rec?' class="hi"':''}>${label}</span>`;
    if(i<list.length-1)h+=isBack&&i%2===0?'<span style="color:var(--accent)">→</span>':'→';
    if(i>0&&i%8===0)h+='<br>';
  }
  $('nl').innerHTML=h;setTimeout(()=>$('nw').scrollTop=$('nw').scrollHeight,50);
}
if($('btnHide'))$('btnHide').addEventListener('click',()=>{
  G.showSeq=!G.showSeq;$('btnHide').textContent=G.showSeq?'hide':'show';
  $('nw').style.display=(G.showSeq&&G.done)?'block':'none';
});

// ══ SVG HELPERS ══
// Build an SVG path string from a nail sequence
function buildSvgLines(list, nailPos, imgSz){
  const SZ=SVG_SZ, sc=SZ/imgSz;
  const parts=[];
  for(let i=0;i<list.length-1;i++){
    const f=nailPos[list[i]],t=nailPos[list[i+1]];
    parts.push(`M${(f.x*sc).toFixed(2)},${(f.y*sc).toFixed(2)}L${(t.x*sc).toFixed(2)},${(t.y*sc).toFixed(2)}`);
  }
  return parts.join('');
}

// Write the result SVG (lines only — no pixel scaling possible)
function setSvgContent(svgEl, list, nailPos, imgSz, showNails){
  const SZ=SVG_SZ, sc=SZ/imgSz;
  // thick = "target screen pixels per stroke" (user-facing value)
  // We must convert to viewBox units: viewBox_stroke = thick_px * (SZ / displaySz)
  // Get actual display size of the SVG element
  const thickPx=parseFloat($('st').value);
  // Use BASE (zoom=1) display size for thickness — keeps lines same visual weight at all zoom levels
  const baseSz=Math.min($('cWrap').clientWidth, $('cWrap').clientHeight)-40;
  const thickVB=Math.min(0.4, thickPx*(SZ/Math.max(200,baseSz)));

  const col=G.color;
  const [r,g,b]=hexRgb(col);
  const d=buildSvgLines(list,nailPos,imgSz);
  let nailDots='';
  if(showNails){
    nailPos.forEach(n=>{
      nailDots+=`<circle cx="${(n.x*sc).toFixed(1)}" cy="${(n.y*sc).toFixed(1)}" r="1.8" fill="rgba(0,0,0,0.3)"/>`;
    });
  }
  const bgFill='#ffffff';

  // Opacity scales with line count so darkness is consistent
  const lineCount=Math.max(1, list.length-1);
  const baseOpacity=Math.min(0.85, Math.max(0.06, 750/lineCount));
  const opacity=baseOpacity.toFixed(3);

  svgEl.innerHTML=
    `<defs>`+
      `<clipPath id="cp${svgEl.id}"><circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}"/></clipPath>`+
    `</defs>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2}" fill="${bgFill}"/>`+
    `<g clip-path="url(#cp${svgEl.id})">`+
      `<path d="${d}" fill="none" stroke="rgba(${r},${g},${b},${opacity})" stroke-width="${thickVB.toFixed(3)}" stroke-linecap="round"/>`+
      nailDots+
    `</g>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1.5"/>`;
}

function applySvgSize(svgEl, zoom){
  const wrap=$('cWrap');
  const maxSz=Math.min(wrap.clientWidth, wrap.clientHeight)-40;
  const sz=Math.min(maxSz, Math.round(maxSz*zoom)); // never exceed fit size
  svgEl.setAttribute('width',sz);
  svgEl.setAttribute('height',sz);
  svgEl.style.width=sz+'px';
  svgEl.style.height=sz+'px';
  svgEl.setAttribute('viewBox',`0 0 ${SVG_SZ} ${SVG_SZ}`);
}

// ══ RENDER ══
// Single unified render path: always SVG for result (infinitely sharp),
// always canvas for original/error. The SVG viewBox stays fixed at SVG_SZ,
// only the element's pixel size changes with zoom.
function render(){
  if(!G.done||G.compareMode)return;
  const sz=G.imgSz;
  const baseDisplaySz=Math.round(Math.min($('cWrap').clientWidth,$('cWrap').clientHeight)-40);
  const displaySz=Math.round(baseDisplaySz*G.zoom);

  if(G.view==='result'){
    // SVG — infinitely sharp vector at any zoom level
    cvRaster.style.display='none';
    cvSvg.style.display='block';
    applySvgSize(cvSvg, G.zoom); // set width FIRST so setSvgContent can read it
    setSvgContent(cvSvg, G.nails, G.nailPos, sz, G.showNails);
  } else {
    // Raster views: original photo or error map
    cvSvg.style.display='none';
    const wrap=$('cWrap');
    const maxSz=Math.min(wrap.clientWidth,wrap.clientHeight)-40;
    const displaySz=Math.min(maxSz, Math.round(maxSz*G.zoom));
    const rasterSz=Math.min(4000,displaySz);
    cvRaster.width=rasterSz;cvRaster.height=rasterSz;
    cvRaster.style.width=displaySz+'px';cvRaster.style.height=displaySz+'px';
    cvRaster.style.display='block';
    const ctx=cvRaster.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,rasterSz,rasterSz);
    ctx.save();ctx.beginPath();ctx.arc(rasterSz/2,rasterSz/2,rasterSz/2-1,0,Math.PI*2);ctx.clip();
    if(G.view==='original'){
      // Draw cropped image
      off.width=rasterSz;off.height=rasterSz;
      const tc=off.getContext('2d');tc.fillStyle='#fff';tc.fillRect(0,0,rasterSz,rasterSz);
      drawCropped(tc,rasterSz,G.bw);
      ctx.drawImage(off,0,0,rasterSz,rasterSz);
    } else { // error map — scale from algorithm's pixel buffer
      const scE=sz/rasterSz;
      const id=ctx.createImageData(rasterSz,rasterSz);
      for(let y=0;y<rasterSz;y++)for(let x=0;x<rasterSz;x++){
        const v=Math.min(1,G.errPx[Math.min(sz-1,Math.floor(y*scE))*sz+Math.min(sz-1,Math.floor(x*scE))]);
        const c2=Math.floor(v*255),i=(y*rasterSz+x)*4;
        id.data[i]=c2;id.data[i+1]=Math.floor(c2*.3);id.data[i+2]=0;id.data[i+3]=255;
      }
      ctx.putImageData(id,0,0);
    }
    ctx.restore();
    ctx.beginPath();ctx.arc(displaySz/2,displaySz/2,displaySz/2-1,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,0,0,.1)';ctx.lineWidth=1.5;ctx.stroke();
  }
}

// ══ COMPARE (SVG-based, clipped with CSS) ══
function renderCompare(){
  // Left SVG = Greedy
  cvRaster.style.display='none';
  cvSvg.style.display='block';
  applySvgSize(cvSvg, G.zoom);
  setSvgContent(cvSvg, G.greedyNails||G.nails, G.nailPos, G.imgSz, G.showNails);

  // Right SVG = Radon, positioned exactly over left, clipped to right portion
  cvCmpSvg.style.display='block';
  applySvgSize(cvCmpSvg, G.zoom);
  setSvgContent(cvCmpSvg, G.radonNails||G.nails, G.nailPos, G.imgSz, G.showNails);

  // Position overlay SVG on top of main SVG
  requestAnimationFrame(()=>{
    const cwr=$('cWrap'),cvR=cvSvg.getBoundingClientRect(),wR=cwr.getBoundingClientRect();
    const oL=cvR.left-wR.left,oT=cvR.top-wR.top,dw=cvR.width,dh=cvR.height;
    const clipX=dw*(G.comparePct/100);
    cvCmpSvg.style.cssText=
      `display:block;position:absolute;left:${oL}px;top:${oT}px;`+
      `width:${dw}px;height:${dh}px;border-radius:50%;`+
      `clip-path:inset(0 0 0 ${clipX}px);pointer-events:none;`;
    const div=$('cDiv');div.style.cssText=`display:block;left:${oL+clipX}px;top:${oT}px;height:${dh}px;`;
    const h=$('cHandle');h.style.cssText=`display:block;left:${oL+clipX}px;top:${oT+dh/2}px;`;
    $('cLblL').style.cssText=`display:block;left:${oL+10}px;top:${oT+10}px;`;
    $('cLblR').style.cssText=`display:block;left:${oL+dw-56}px;top:${oT+10}px;`;
  });
}

function setupCompareDrag(){
  $('cHandle').onmousedown=e=>{
    e.preventDefault();
    const move=ev=>{
      const cvR=cvSvg.getBoundingClientRect();
      G.comparePct=Math.max(5,Math.min(95,((ev.clientX-cvR.left)/cvR.width)*100));
      renderCompare();
    };
    const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  };
}

function applyZoom(){
  if(!G.done)return;
  if(G.view==='image'){applyCircleSize();return;}
  if(G.view==='wind'){windRender();return;}
  if(G.compareMode){renderCompare();return;}
  render();
}

// Redraw on window resize (e.g. maximizing the window)
let _resizeTimer;
window.addEventListener('resize',()=>{
  clearTimeout(_resizeTimer);
  _resizeTimer=setTimeout(()=>{
    if(G.view==='image'){applyCircleSize();return;}
    if(G.done){
      if(G.view==='wind') windRender();
      else if(G.compareMode)renderCompare();
      else render();
    }
  },150);
});

// Mouse scroll zoom on the display area
const displayArea=document.querySelector('.canvas-wrap');
if(displayArea){
  displayArea.addEventListener('wheel',e=>{
    if(!G.done)return;
    e.preventDefault();
    const delta=e.deltaY>0?-1:1;
    const factor=1+(delta*0.12);
    const newZoom=Math.max(0.25,Math.min(1,G.zoom*factor));
    if(newZoom===G.zoom)return;
    G.zoom=newZoom;
    applyZoom();
  },{passive:false});

  // ── TOUCH: pinch-to-zoom + pan ──
  let _touches={};
  let _lastPinchDist=null;
  let _panStart=null;
  let _scrollStart=null;

  function getTouchDist(t1,t2){
    const dx=t1.clientX-t2.clientX, dy=t1.clientY-t2.clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }

  displayArea.addEventListener('touchstart',e=>{
    if(!G.done)return;
    if(e.touches.length===2){
      // Pinch start
      _lastPinchDist=getTouchDist(e.touches[0],e.touches[1]);
      _panStart=null;
    } else if(e.touches.length===1){
      // Pan start
      _panStart={x:e.touches[0].clientX, y:e.touches[0].clientY};
      _scrollStart={left:displayArea.scrollLeft, top:displayArea.scrollTop};
      _lastPinchDist=null;
    }
  },{passive:true});

  displayArea.addEventListener('touchmove',e=>{
    if(!G.done)return;
    if(e.touches.length===2 && _lastPinchDist!==null){
      // Pinch zoom
      e.preventDefault();
      const dist=getTouchDist(e.touches[0],e.touches[1]);
      const factor=dist/_lastPinchDist;
      _lastPinchDist=dist;
      const newZoom=Math.max(0.25,Math.min(1,G.zoom*factor));
      if(newZoom!==G.zoom){G.zoom=newZoom;applyZoom();}
    } else if(e.touches.length===1 && _panStart && _scrollStart){
      // Pan (only useful when zoomed in, i.e. overflow is scrollable)
      e.preventDefault();
      const dx=e.touches[0].clientX-_panStart.x;
      const dy=e.touches[0].clientY-_panStart.y;
      displayArea.scrollLeft=_scrollStart.left-dx;
      displayArea.scrollTop=_scrollStart.top-dy;
    }
  },{passive:false});

  displayArea.addEventListener('touchend',e=>{
    if(e.touches.length<2) _lastPinchDist=null;
    if(e.touches.length===0){_panStart=null;_scrollStart=null;}
  },{passive:true});
}

// ══════════════════════════════════════════
//  PLAYBACK BAR
// ══════════════════════════════════════════

function pbToggleSpeedPopup(){
  $('pbSpeedPopup').classList.toggle('open');
}

// slider value = strings per second directly (1–1000)
function pbSetSpeed(v){
  PB.speed = Math.max(1, Math.min(5000, Math.round(v)));
  const label = PB.speed >= 1000 ? '5000/s' : PB.speed + '/s';
  $('pbSpeedBtn').textContent = label;
  $('pbSpeedLbl').textContent = label;
}

// Close popup when clicking outside
document.addEventListener('click', e=>{
  const wrap = $('pbSpeedWrap');
  if(wrap && !wrap.contains(e.target)) $('pbSpeedPopup').classList.remove('open');
});

function pbInit(){
  if(!G.nails||G.nails.length<2) return;
  // For greedy: total = nails.length-1 strings
  // For back: total = nails.length/2 chords
  PB.total = G.algo==='back'
    ? Math.floor(G.nails.length/2)
    : G.nails.length-1;
  PB.pos = PB.total; // start fully drawn
  $('pbSlider').max = PB.total;
  $('pbSlider').value = PB.total;
  $('pbCount').textContent = PB.total+' of '+PB.total+' lines';
  $('playBar').style.display='flex';
  document.body.classList.add('pb-ready');
  // Show back view button only for back algo
  $('pbViewBtn').style.display = G.algo==='back'?'flex':'none';
  PB.backView=(G.algo==='back'); // Back algo defaults to flipped (back-of-board view)
  document.body.classList.toggle('pb-back-view', PB.backView);
  $('pbViewBtn').textContent=PB.backView?'↺ Front':'↺ Flip Plate';
  if($('tbBackView')) $('tbBackView').textContent=PB.backView?'↺ Front':'↺ Flip Plate';
  // Reset speed to default 500/s
  PB.speed=2500;
  $('pbSpeedBtn').textContent='2500/s';
  $('pbSpeedLbl').textContent='2500/s';
  if($('pbSpeedSlider')) $('pbSpeedSlider').value=500;
}

function pbScrub(val){
  if(G.view==='wind'){ WD.pos=+val; windRender(); return; }
  if(PB.playing) pbPause();
  PB.pos=val;
  $('pbCount').textContent=val+' of '+PB.total+' lines';
  pbRender(val);
}

function pbTogglePlay(){
  if(PB.playing) pbPause();
  else pbPlay();
}

function pbPlay(){
  if(PB.pos>=PB.total) PB.pos=0; // restart from beginning
  PB.playing=true;
  $('pbPlay').textContent='⏸';
  $('pbPlay').classList.add('playing');
  // Lock zoom during playback
  $('bZI').disabled=true;$('bZO').disabled=true;$('bZR').disabled=true;
  PB.lastTime=performance.now();
  PB.frame=requestAnimationFrame(pbTick);
}

function pbPause(){
  PB.playing=false;
  if(PB.frame){cancelAnimationFrame(PB.frame);PB.frame=null;}
  $('pbPlay').textContent='▶';
  $('pbPlay').classList.remove('playing');
  $('bZI').disabled=false;$('bZO').disabled=false;$('bZR').disabled=false;
}

function pbTick(now){
  if(!PB.playing) return;
  const speed=PB.speed||500;
  const interval=1000/speed; // ms per string (speed = strings/sec)
  if(now-PB.lastTime >= interval){
    PB.pos++;
    $('pbSlider').value=PB.pos;
    $('pbCount').textContent=PB.pos+' of '+PB.total+' lines';
    pbRender(PB.pos, true); // true = animate
    PB.lastTime=now;
    if(PB.pos>=PB.total){pbPause();return;}
  }
  PB.frame=requestAnimationFrame(pbTick);
}

function pbToggleView(){
  PB.backView=!PB.backView;
  document.body.classList.toggle('pb-back-view',PB.backView);
  $('pbViewBtn').textContent=PB.backView?'↺ View Front':'↺ Flip Plate';
  if($('tbBackView')) $('tbBackView').textContent=PB.backView?'↺ View Front':'↺ Flip Plate';
  // Update algo title
  if($('algoTitleOverlay') && G.algo==='back'){
    const lines=G.nails?G.nails.length/2|0:0;
    $('algoTitleOverlay').textContent=PB.backView
      ? 'Back Routing · '+lines+' lines (back of board)'
      : 'Back Allowed · '+lines+' lines (front)';
  }
  pbRender(PB.pos);
}

function pbRender(n, animate){
  if(G.view==='wind') return;
  if(!G.done||!G.nails||!G.nailPos) return;
  const nails=G.nailPos, sz=G.imgSz;
  const SZ=SVG_SZ, sc=SZ/sz;
  const thickPx=parseFloat($('st').value);
  const baseSz=Math.min($('cWrap').clientWidth,$('cWrap').clientHeight)-40;
  const thickVB=Math.min(0.4, thickPx*(SZ/Math.max(200,baseSz)));
  const col=G.color;
  const [r,g,b]=hexRgb(col);
  const isBack=G.algo==='back';

  // Build lines up to index n
  // Opacity is fixed to TOTAL strings — not current position.
  // This ensures strings don't change darkness as you scrub.
  let frontLines='', backLines='', lastLine=null;
  const lineCount = Math.max(1, PB.total || n);
  const opacity=Math.min(0.85,Math.max(0.06,750/lineCount)).toFixed(3);

  if(isBack){
    const N=G.nailPos.length;
    const cx=SZ/2, cy=SZ/2, R=SZ/2-2;
    if(PB.backView){
      // ── BACK-OF-BOARD VIEW ──
      // The thread goes: front chord a→b, then routes STRAIGHT across the back b→a[next]
      // Mirror x coords (SZ - x) because you're looking from behind.
      // These are plain straight lines — the thread stretched across the back face.
      for(let i=0;i<n;i++){
        const bi=G.nails[i*2+1];       // end of front chord i
        const na=G.nails[(i+1)*2];     // start of front chord i+1
        if(bi===undefined||na===undefined) break;
        // Mirror x: SZ - x
        const bxm=(SZ - nails[bi].x*sc).toFixed(2), bym=(nails[bi].y*sc).toFixed(2);
        const nxm=(SZ - nails[na].x*sc).toFixed(2), nym=(nails[na].y*sc).toFixed(2);
        if(i===n-1 && animate){
          lastLine={ax:bxm,ay:bym,bx:nxm,by:nym};
        } else {
          backLines+=`M${bxm},${bym}L${nxm},${nym}`;
        }
      }
    } else {
      // ── FRONT VIEW: draw the actual chords ──
      for(let i=0;i<n;i++){
        const ai=G.nails[i*2], bi=G.nails[i*2+1];
        if(ai===undefined||bi===undefined) break;
        const ax=(nails[ai].x*sc).toFixed(2), ay=(nails[ai].y*sc).toFixed(2);
        const bx=(nails[bi].x*sc).toFixed(2), by=(nails[bi].y*sc).toFixed(2);
        if(i===n-1 && animate){
          lastLine={ax,ay,bx,by,type:'front'};
        } else {
          frontLines+=`M${ax},${ay}L${bx},${by}`;
        }
      }
    }
  } else {
    // Greedy: nails = [n0,n1,n2,...]
    for(let i=0;i<n;i++){
      const ai=G.nails[i], bi=G.nails[i+1];
      if(bi===undefined) break;
      const ax=(nails[ai].x*sc).toFixed(2), ay=(nails[ai].y*sc).toFixed(2);
      const bx=(nails[bi].x*sc).toFixed(2), by=(nails[bi].y*sc).toFixed(2);
      if(i===n-1 && animate){
        lastLine={ax,ay,bx,by};
      } else {
        frontLines+=`M${ax},${ay}L${bx},${by}`;
      }
    }
  }

  // Show nails
  let nailDots='';
  if(G.showNails){
    nails.forEach(nail=>{
      nailDots+=`<circle cx="${(nail.x*sc).toFixed(1)}" cy="${(nail.y*sc).toFixed(1)}" r="1.8" fill="rgba(0,0,0,0.3)"/>`;
    });
  }

  const animLine = lastLine
    ? `<path d="M${lastLine.ax},${lastLine.ay}L${lastLine.bx},${lastLine.by}" fill="none" stroke="rgba(${r},${g},${b},${opacity})" stroke-width="${thickVB}" stroke-linecap="round" class="pb-drawing-line"/>`
    : '';

  // Back routing arcs (shown in Flip Plate view) or front chords
  const backLinesHtml = (isBack && PB.backView && backLines)
    ? `<path d="${backLines}" fill="none" stroke="rgba(${r},${g},${b},${opacity})" stroke-width="${thickVB}" stroke-linecap="round"/>`
    : '';

  const svgEl=cvSvg;
  svgEl.style.display='block';
  applySvgSize(svgEl, G.zoom);
  svgEl.innerHTML=
    `<defs><clipPath id="cpcvSvg"><circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}"/></clipPath></defs>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2}" fill="#ffffff"/>`+
    `<g clip-path="url(#cpcvSvg)">`+
      (frontLines?`<path d="${frontLines}" fill="none" stroke="rgba(${r},${g},${b},${opacity})" stroke-width="${thickVB}" stroke-linecap="round"/>`:'') +
      backLinesHtml +
      animLine +
      nailDots+
    `</g>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1.5"/>`;
}
