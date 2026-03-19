// ══════════════════════════
//  UPLOAD / IMAGE / CROP
// ══════════════════════════

// ── File inputs ──
$('fi').addEventListener('change',()=>{if($('fi').files[0])loadFile($('fi').files[0]);});
if($('fi2'))$('fi2').addEventListener('change',()=>{if($('fi2').files[0])loadFile($('fi2').files[0]);});

// ── Canvas drop zone (image tab) ──
cWrapEl.addEventListener('dragover',e=>{
  if(G.view!=='image') return;
  e.preventDefault();
  $('ph').classList.add('drag-over');
});
cWrapEl.addEventListener('dragleave',()=>{
  $('ph').classList.remove('drag-over');
});
cWrapEl.addEventListener('drop',e=>{
  if(G.view!=='image') return;
  e.preventDefault();
  $('ph').classList.remove('drag-over');
  if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

// Upload handled natively by <label for="fi"> wrapping the circle

// ── Scroll to zoom — image tab: crop/resize; result/error: zoom SVG ──
let _zoomHintTimer=null;
cWrapEl.addEventListener('wheel',e=>{
  e.preventDefault();
  if(G.view==='image'){
    const wrap=$('imgPreviewWrap');
    const ph=$('ph');
    const circleEl = (G.img && wrap && wrap.style.display!=='none') ? wrap : ph;
    const rect = circleEl.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const dist=Math.sqrt((e.clientX-cx)**2+(e.clientY-cy)**2);
    const radius=rect.width/2;
    if(dist<=radius && G.img){
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      G.cropZoom = Math.max(0.5, Math.min(5, G.cropZoom + delta));
      if($('cropZoom')) $('cropZoom').value = G.cropZoom;
      showZoomHint();
      showImgPreview();
    } else {
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const maxSz = Math.min(cWrapEl.clientWidth, cWrapEl.clientHeight) - 40;
      G.circleSize = Math.max(120, Math.min(maxSz, G.circleSize * factor));
      applyCircleSize();
      showSizeHint();
    }
  } else if(G.done){
    // Result / error tab: scroll zooms the SVG
    const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    const newZ = Math.max(0.25, Math.min(4, G.zoom * factor));
    if(newZ !== G.zoom){ G.zoom = newZ; applyZoom(); }
  }
},{passive:false});

// ── Pinch to zoom + two-finger twist to rotate (image tab) ──
let _pinchDist=null, _pinchAngle=null, _pinchRotBase=0;
cWrapEl.addEventListener('touchstart',e=>{
  if(G.view!=='image'||!G.img||e.touches.length!==2) return;
  const dx=e.touches[1].clientX-e.touches[0].clientX, dy=e.touches[1].clientY-e.touches[0].clientY;
  _pinchDist = Math.hypot(dx,dy);
  _pinchAngle = Math.atan2(dy,dx)*180/Math.PI;
  _pinchRotBase = G.cropRot||0;
},{passive:true});
cWrapEl.addEventListener('touchmove',e=>{
  if(G.view!=='image'||!G.img||e.touches.length!==2||!_pinchDist) return;
  const dx=e.touches[1].clientX-e.touches[0].clientX, dy=e.touches[1].clientY-e.touches[0].clientY;
  const d = Math.hypot(dx,dy);
  G.cropZoom = Math.max(0.5, Math.min(5, G.cropZoom * d/_pinchDist));
  _pinchDist = d;
  G.cropRot = _pinchRotBase + (Math.atan2(dy,dx)*180/Math.PI - _pinchAngle);
  showZoomHint();
  showImgPreview();
},{passive:true});

// ── Drag to pan on image tab ──
let _panActive=false, _panSX=0, _panSY=0, _panOX=0, _panOY=0;
const imgWrap=$('imgPreviewWrap');
if(imgWrap){
  imgWrap.addEventListener('mousedown',e=>{
    if(e.button!==0||G.view!=='image'||!G.img) return;
    _panActive=true; _panSX=e.clientX; _panSY=e.clientY;
    _panOX=G.cropOffX; _panOY=G.cropOffY;
    imgWrap.style.cursor='grabbing';
    document.body.style.cursor='grabbing';
    e.preventDefault();
  });
}
window.addEventListener('mousemove',e=>{
  if(!_panActive) return;
  if(!G.img) return;
  const previewSz = Math.min($('cWrap').clientWidth,$('cWrap').clientHeight)-40 || 300;
  // Rotate screen-space delta into image space so panning always feels
  // right-is-right on screen regardless of how much the image is rotated
  const rot=(G.cropRot||0)*Math.PI/180;
  const scrDx=(e.clientX-_panSX)/previewSz;
  const scrDy=(e.clientY-_panSY)/previewSz;
  G.cropOffX=_panOX+scrDx*Math.cos(rot)+scrDy*Math.sin(rot);
  G.cropOffY=_panOY-scrDx*Math.sin(rot)+scrDy*Math.cos(rot);
  showImgPreview();
});
window.addEventListener('mouseup',()=>{
  if(!_panActive) return;
  _panActive=false;
  if(imgWrap) imgWrap.style.cursor='';
  document.body.style.cursor='';
  // Don't auto-gen on pan end — user controls when to generate
});

function loadFile(f){
  if(!f.type.startsWith('image/'))return;
  G.imgName = f.name.replace(/\.[^.]+$/,'');
  G.windOnly = false;
  document.body.classList.remove('wind-only');
  // Restore tabs that were visible before wind-only mode
  if($('vmO')) $('vmO').style.display='';
  if($('vmR')) $('vmR').style.display='';
  if($('vmE')) $('vmE').style.display='';
    document.body.classList.add('has-image');
    updateHelpBar();
  const rd=new FileReader();
  rd.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      G.img=img;G.bw=true;G.cropOffX=0;G.cropOffY=0;G.cropZoom=1;G.cropRot=0;
      document.body.classList.remove('no-img');
      // Enable generate button
      $('btnGenGreedy').disabled=false;
      mobSyncGenBtn();
      if($('btnCompare'))$('btnCompare').disabled=false;
      if($('btnOptimize')) $('btnOptimize').disabled=false;
      // Show floating image controls
      showImageControls(true);
      updateHelpBar();
      // Stay on image tab
      if(G.view!=='image') setView('image');
      else showImgPreview(); // already on image tab, just show
      resetResult();
    };
    img.src=e.target.result;
  };
  rd.readAsDataURL(f);
}

function resetResult(){
  G.done=false;G.compareMode=false;G.zoom=1;
  G.cache={greedy:null,back:null};
  document.body.classList.remove('pb-ready'); document.body.classList.remove('has-image');
  cvSvg.style.display='none';cvRaster.style.display='none';cvCmpSvg.style.display='none';
  $('cDiv').style.display='none';$('cHandle').style.display='none';
  $('cLblL').style.display='none';$('cLblR').style.display='none';
  if(G.img && G.view==='image'){showImgPreview();}
  else if(!G.img){$('ph').style.display='flex';if($('imgPreviewWrap'))$('imgPreviewWrap').style.display='none';}
  if($('statSec'))$('statSec').style.display='none';
  $('emptyMsg').style.display='block';$('nw').style.display='none';
  $('btnRefine').style.display='none';
  $('rollbackRow').style.display='none';
  if($('btnCompare')){$('btnCompare').classList.remove('active');$('btnCompare').textContent='⇄ Compare side by side';}
  // prodSec is inside collapse now
}

// ══ THUMBNAILS ══
function updateBothThumbs(){if(!G.img)return;if($('origImg'))updateOrigThumb();if($('cropPrevImg'))updateCropThumb();}

function updateOrigThumb(){
  const c=off;c.width=200;c.height=200;const ctx=c.getContext('2d');
  const s=Math.min(G.img.width,G.img.height);
  if(G.bw)ctx.filter='grayscale(1)';
  ctx.drawImage(G.img,(G.img.width-s)/2,(G.img.height-s)/2,s,s,0,0,200,200);
  $('origImg').src=c.toDataURL('image/jpeg',.85);
}

function updateCropThumb(){
  const c=off;c.width=200;c.height=200;const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,200,200);
  drawCropped(ctx,200,G.bw);
  const img=$('cropPrevImg');
  if(img){img.src=c.toDataURL('image/jpeg',.9);img.style.display='block';}
}

function drawCropped(ctx,sz,gray,forcedRaw){
  // forcedRaw=true: always draw original image (used by crop modal, bg-preview)
  if(!G.img)return;
  ctx.save();if(gray)ctx.filter='grayscale(1)';
  const img=G.img,base=Math.min(img.width,img.height),view=base/G.cropZoom;
  // cropOffX/Y are normalized fractions of view size (stored independently of canvas size)
  const srcX=(img.width-view)/2 - G.cropOffX*view;
  const srcY=(img.height-view)/2 - G.cropOffY*view;
  if(G.cropRot){ctx.translate(sz/2,sz/2);ctx.rotate(G.cropRot*Math.PI/180);ctx.translate(-sz/2,-sz/2);}
  ctx.drawImage(img,srcX,srcY,view,view,0,0,sz,sz);ctx.restore();
}

// ══ CROP MODAL ══
let cDrag=false,cSX=0,cSY=0,cOX=0,cOY=0;
const cropCont=$('cropCont');
if($('cropPrevWrap'))$('cropPrevWrap').addEventListener('click',()=>{if(G.img)openCrop();});
function openCrop(){renderCropCanvas();$('cropZoom').value=G.cropZoom;$('cropZV').textContent=G.cropZoom.toFixed(1)+'×';$('cropModal').classList.add('open');}
$('btnCC').addEventListener('click',()=>$('cropModal').classList.remove('open'));
$('btnCA').addEventListener('click',()=>{$('cropModal').classList.remove('open');updateBothThumbs();showImgPreview();resetResult();scheduleAutoGen();});
$('cropZoom').addEventListener('input',()=>{G.cropZoom=parseFloat($('cropZoom').value);$('cropZV').textContent=G.cropZoom.toFixed(1)+'×';renderCropCanvas();});
cropCont.addEventListener('mousedown',e=>{cDrag=true;cSX=e.clientX;cSY=e.clientY;cOX=G.cropOffX;cOY=G.cropOffY;cropCont.style.cursor='grabbing';});
window.addEventListener('mousemove',e=>{if(!cDrag)return;const csz=380;G.cropOffX=cOX+(e.clientX-cSX)/csz;G.cropOffY=cOY+(e.clientY-cSY)/csz;renderCropCanvas();});
window.addEventListener('mouseup',()=>{cDrag=false;cropCont.style.cursor='grab';});
cropCont.addEventListener('wheel',e=>{e.preventDefault();G.cropZoom=Math.max(.5,Math.min(5,G.cropZoom-e.deltaY*.003));$('cropZoom').value=G.cropZoom;$('cropZV').textContent=G.cropZoom.toFixed(1)+'×';renderCropCanvas();},{passive:false});
function renderCropCanvas(){const c=$('cropCanvas'),ctx=c.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,380,380);drawCropped(ctx,380,G.bw,true);}

function resetCropInline(){
  G.cropOffX=0;G.cropOffY=0;G.cropZoom=1;G.cropRot=0;
  if($('cropZoom'))$('cropZoom').value=1;
  showZoomHint();
  showImgPreview();
}

// ── Right-click drag to rotate freely (image tab, any angle) ──
let _rotActive=false,_rotSA=0,_rotSR=0;
cWrapEl.addEventListener('contextmenu',e=>{
  if(G.view==='image'&&G.img){e.preventDefault();}
});
// Helper: screen-space center of the circle canvas (= rendering pivot)
function _circleCenter(){
  const cv=$('imgPreviewCanvas');
  if(!cv) return null;
  const r=cv.getBoundingClientRect();
  return {cx:r.left+r.width/2, cy:r.top+r.height/2};
}
cWrapEl.addEventListener('mousedown',e=>{
  if(e.button!==2||G.view!=='image'||!G.img) return;
  const c=_circleCenter(); if(!c) return;
  _rotActive=true;
  _rotSA=Math.atan2(e.clientY-c.cy,e.clientX-c.cx)*180/Math.PI;
  _rotSR=G.cropRot||0;
  document.body.style.cursor='url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><path fill=\'%23333\' d=\'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z\'/></svg>") 12 12, grab';
  e.preventDefault();
});
window.addEventListener('mousemove',e=>{
  if(!_rotActive||!G.img) return;
  const c=_circleCenter(); if(!c) return;
  const a=Math.atan2(e.clientY-c.cy,e.clientX-c.cx)*180/Math.PI;
  G.cropRot=_rotSR+(a-_rotSA);
  showImgPreview();
  if($('cropCanvas')) renderCropCanvas();
});
window.addEventListener('mouseup',e=>{
  if(e.button===2){_rotActive=false; document.body.style.cursor='';}
});

function _drawImgPreview(){
  if(!G.img) return;
  const wrap=$('imgPreviewWrap');
  const cv=$('imgPreviewCanvas');
  if(!wrap||!cv) return;
  // Use G.circleSize (user-controlled) or fit to cWrap
  const cWrap=$('cWrap');
  const cw=cWrap?cWrap.clientWidth:0, ch=cWrap?cWrap.clientHeight:0;
  const maxSz=Math.min(cw||400, ch||400)-40;
  if(!G.circleSize) G.circleSize=maxSz;
  const sz=Math.max(120, Math.min(G.circleSize, maxSz));
  if(cv.width!==sz){ cv.width=sz; cv.height=sz; }
  wrap.style.width=sz+'px'; wrap.style.height=sz+'px';
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,sz,sz);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,sz,sz);
  ctx.save();
  ctx.beginPath();
  ctx.arc(sz/2, sz/2, sz/2-1, 0, Math.PI*2);
  ctx.clip();
  if(G.cropRot){ctx.translate(sz/2,sz/2);ctx.rotate(G.cropRot*Math.PI/180);ctx.translate(-sz/2,-sz/2);}
  const img=G.img;
  const base=Math.min(img.width,img.height);
  const view=base/Math.max(0.1,G.cropZoom);
  const srcX=(img.width-view)/2 - G.cropOffX*view;
  const srcY=(img.height-view)/2 - G.cropOffY*view;
  // Try with filter, fallback without (some browsers ignore filter inside save/clip)
  try{ ctx.filter='grayscale(1)'; } catch(e){}
  ctx.drawImage(img, srcX, srcY, view, view, 0, 0, sz, sz);
  try{ ctx.filter='none'; } catch(e){}
  ctx.restore();
  // Grayscale fallback via getImageData if filter didn't work
  try{
    const id=ctx.getImageData(0,0,sz,sz);
    const d=id.data;
    let hasColor=false;
    for(let i=0;i<d.length;i+=4){
      if(d[i]!==d[i+1]||d[i]!==d[i+2]){hasColor=true;break;}
    }
    if(hasColor){ // image has colour — apply manual grayscale
      for(let i=0;i<d.length;i+=4){
        const g=Math.round(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]);
        d[i]=d[i+1]=d[i+2]=g;
      }
      ctx.putImageData(id,0,0);
    }
  } catch(e){}
}

function showImgPreview(){
  if(!G.img) return;
  const wrap=$('imgPreviewWrap');
  if(!wrap) return;
  if(G.view!=='image') return; // only show preview on image tab
  $('ph').style.display='none';
  wrap.style.display='block';
  // Try immediately, then retry after layout settles
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      _drawImgPreview();
      // Extra retry in case cWrap was still 0
      setTimeout(_drawImgPreview, 120);
    });
  });
}

// ── CAMERA / FILE PICKER ──
function openCamera(){
  // Create a temporary input that asks for camera specifically
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/*';
  input.capture='user'; // front camera (selfie); change to 'environment' for back
  input.onchange=e=>{
    if(e.target.files&&e.target.files[0]){
      loadFile(e.target.files[0]);
    }
  };
  input.click();
}
