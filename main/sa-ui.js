// ══════════════════════════
//  UI / TAB / PANEL FUNCTIONS
// ══════════════════════════

// ── Per-param custom defaults saved by user (persisted in localStorage) ──
let userDefaults={};
try{const d=localStorage.getItem('sa_defaults');if(d)userDefaults=JSON.parse(d);}catch(e){}
function saveUserDefault(sid,val){
  userDefaults[sid]=val;
  try{localStorage.setItem('sa_defaults',JSON.stringify(userDefaults));}catch(e){}
}
function getDefault(cfg){
  return userDefaults[cfg.s]!==undefined ? userDefaults[cfg.s] : cfg.def;
}

// ══ DUAL TOGGLES ══
function toggleSeqDrawer(){
  const d=$('seqDrawer');
  d.classList.toggle('open');
  // arrow direction handled by CSS rotation only
}

function setAlgo(a){
  const prev=G.algo;
  G.algo=a;
  $('algoTabGreedy').className='algo-tab'+(a==='greedy'?' active-front':'');
  $('algoTabBack').className='algo-tab'+(a==='back'?' active-back':'');
  $('paneGreedy').classList.toggle('active', a==='greedy');
  $('paneBack').classList.toggle('active', a==='back');
  updateGenBtn();
  if($('tbBackView')) $('tbBackView').style.display = (a==='back') ? 'flex' : 'none';
  if($('backViewSep')) $('backViewSep').style.display = (a==='back') ? 'block' : 'none';
  if($('pbViewBtn')) $('pbViewBtn').style.display = a==='back' ? 'flex' : 'none';
  if(!G.img) return;

  // Try to restore cached result for this algo
  const cached=G.cache[a];
  if(cached){
    // Restore the cached result for this algo immediately
    G.nails=cached.result;G.errPx=cached.err;G.imgPx=cached.img;
    G.nailPos=cached.nails;G.imgSz=cached.sz;G.done=true;G.score=cached.sc;G.lineCache=cached.lc;
    if($('algoTitleOverlay')){
      const lbl=a==='back'?'Back Allowed':'Front';
      const lines=a==='back'?(cached.result.length/2|0):(cached.result.length-1);
      $('algoTitleOverlay').style.display='block';
      $('algoTitleOverlay').textContent=lbl+' · '+lines+' lines';
    }
    if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
    $('ph').style.display='none';
    pbInit(); render();
    return; // Don't trigger a new generate — result is already here
  }
  // No cache for this algo — generate fresh (but only if this algo isn't already running)
  if(!(G.running && G.runningAlgo===a)){
    triggerGenerate();
  }
}

function toggleCollapse(id){
  const el=$(id), arrow=$(id+'Arrow');
  const open = el.style.display==='none';
  el.style.display = open ? 'block' : 'none';
  if(arrow) arrow.classList.toggle('open', open);
}

function setNails(v){G.showNails=v;$('nailsShow').classList.toggle('on',v);$('nailsHide').classList.toggle('on',!v);if(G.done)render();}

function setView(v){
  // Any time user is on wind tab and tries to leave — protect the winding session
  if(G.view==='wind' && v!=='wind'){
    // Wind-only mode (loaded from file): result/error have no data — block silently
    if(G.windOnly && (v==='result'||v==='error')) return;
    // All other exits: confirm
    if(!confirm('Leave wind mode?')) return;
    windPause();
    // Wind-only mode cleanup: offer save, reset state
    if(G.windOnly){
      if(confirm('Save your sequence before leaving?')) windSave();
      G.windOnly=false;
      document.body.classList.remove('wind-only');
      document.body.classList.add('no-img');
      G.nails=[]; G.nailPos=null; G.done=false; G.img=null; WD.artName=''; WD.fileName=''; WD.fileHandle=null;
      if($('windArtName')) $('windArtName').style.display='none';
    }
  }
  const prev=G.view;
  G.view=v;
  document.body.className=document.body.className.replace(/view-\S+/g,'').trim();
  document.body.classList.add('view-'+v);
  ['vmR','vmO','vmE','vmW'].forEach(id=>{if($(id))$(id).classList.remove('on');});
  ({result:'vmR',image:'vmO',error:'vmE',wind:'vmW'})[v] && $(({result:'vmR',image:'vmO',error:'vmE',wind:'vmW'})[v]).classList.add('on');

  // Always hide all canvases first, then re-show what's needed
  cvSvg.style.display='none';
  cvRaster.style.display='none';
  if($('cvWind')) $('cvWind').style.display='none';
  if($('windNailNum')) $('windNailNum').style.display='none';
  if($('windStepInfo')) $('windStepInfo').style.display='none';
  if($('windTapHint')) $('windTapHint').style.display='none';
  if($('windNav')) $('windNav').style.display='none';
  if($('windSpeedRow')) $('windSpeedRow').style.display='none';
  if($('windActions')) $('windActions').style.display='none';
  if($('windArtName')) $('windArtName').style.display='none';
  // Restore play/speed controls (hidden only in wind mode)
  if($('pbPlay')) $('pbPlay').style.visibility='visible';
  if($('pbSpeedWrap')) $('pbSpeedWrap').style.visibility='visible';

  if(v==='image'){
    if(prev==='result'||prev==='error'||prev==='wind') syncZoomToCircle();
    if($('phInner')) $('phInner').innerHTML=isMobile()?'<div class="ph-txt">Tap to upload</div><div class="ph-hint">your image</div><div class="ph-upload-btn">Upload</div>':'<div class="ph-txt">Drop an image</div><div class="ph-hint">or tap to upload</div><div class="ph-upload-btn">Upload</div>';
    applyCircleSize();
    if(G.img){
      $('ph').style.display='none';
      showImgPreview();
    } else {
      $('ph').style.display='flex';
      if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
    }
    if($('algoTitleOverlay')) $('algoTitleOverlay').style.display='none';

  } else if(v==='result'){
    if(prev==='image') syncCircleToZoom();
    if($('imgHelpText')) $('imgHelpText').textContent='';
    if(G.done && prev==='image'){
      if(G.img && $('imgPreviewWrap')){
        const maxSz=Math.min(cWrapEl.clientWidth,cWrapEl.clientHeight)-40;
        const sz=Math.round(maxSz*G.zoom);
        $('imgPreviewWrap').style.width=sz+'px';
        $('imgPreviewWrap').style.height=sz+'px';
      }
      if(!G.running) triggerGenerate();
    } else if(G.done){
      $('ph').style.display='none';
      cvSvg.style.display='block';
      render();
    } else if(G.img){
      $('phInner').innerHTML='<div class="ph-txt" style="font-size:.9rem">Generating...</div><div class="ph-hint">String Art</div>';
      $('ph').style.display='flex';
      if(!G.running) triggerGenerate();
    } else {
      $('phInner').innerHTML='<div class="ph-txt" style="font-size:.9rem">Upload an image first</div><div class="ph-hint">Switch to the Image tab</div>';
      $('ph').style.display='flex';
    }

  } else if(v==='wind'){
    if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
    $('ph').style.display='none';
    if($('pbPlay')) $('pbPlay').style.visibility='hidden';
    if($('pbSpeedWrap')) $('pbSpeedWrap').style.visibility='hidden';
    if(G.done){
      if($('cvWind')) $('cvWind').style.display='block';
      if($('windNailNum')) $('windNailNum').style.display='block';
      if($('windStepInfo')) $('windStepInfo').style.display='block';
      if($('windTapHint')) $('windTapHint').style.display='block';
      if($('windNav')) $('windNav').style.display='flex';
      if($('windSpeedRow')) $('windSpeedRow').style.display='flex';
      if($('windActions')) $('windActions').style.display='flex';
      if($('windArtName') && WD.artName){ $('windArtName').textContent=WD.artName; $('windArtName').style.display='block'; }
      pbPause();
      windInit();
    }

  } else {
    // Error map
    if(prev==='image') syncCircleToZoom();
    if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
    if(G.done){ cvRaster.style.display='block'; render(); }
  }
}

function updateHelpBar(){
  const el=$('imgHelpText');
  if(!el) return;
  if(G.img){
    el.innerHTML='<b>Scroll inside</b> to crop &nbsp;·&nbsp; <b>Scroll outside</b> to resize &nbsp;·&nbsp; <b>Drag</b> to pan &nbsp;·&nbsp; <b>Double-click</b> to change image';
  } else {
    el.innerHTML='Drop an image onto the circle, or click <b>Upload</b>';
  }
}

function applyCircleSize(){
  if(!G.circleSize){
    const cw=cWrapEl.clientWidth||window.innerWidth-310;
    const ch=cWrapEl.clientHeight||window.innerHeight-100;
    G.circleSize=Math.max(120, Math.min(cw,ch)-40);
  }
  const sz=Math.round(G.circleSize);
  const ph=$('ph');
  const wrap=$('imgPreviewWrap');
  const cv=$('imgPreviewCanvas');
  if(ph){ ph.style.width=sz+'px'; ph.style.height=sz+'px'; }
  if(wrap){ wrap.style.width=sz+'px'; wrap.style.height=sz+'px'; }
  if(cv && cv.width!==sz){ cv.width=sz; cv.height=sz; }
  if(G.img) _drawImgPreview();
}

function showSizeHint(){
  const el=$('imgZoomHint');
  if(!el) return;
  el.textContent=Math.round(G.circleSize)+'px';
  el.classList.add('visible');
  clearTimeout(_zoomHintTimer);
  _zoomHintTimer=setTimeout(()=>el.classList.remove('visible'),1200);
}

function showZoomHint(){
  const el=$('imgZoomHint');
  if(!el) return;
  el.textContent=Math.round(G.cropZoom*100)+'%';
  el.classList.add('visible');
  clearTimeout(_zoomHintTimer);
  _zoomHintTimer=setTimeout(()=>el.classList.remove('visible'),1200);
}

function showImageControls(hasImage){
  const change=$('ctrlChange'), crop=$('ctrlCrop'), reset=$('ctrlResetCrop'), hint=$('imgRotHint');
  if(change) change.style.display = hasImage ? '' : 'none';
  if(crop)   crop.style.display   = hasImage ? '' : 'none';
  if(reset)  reset.style.display  = hasImage ? '' : 'none';
  if(hint)   hint.style.display   = hasImage ? '' : 'none';
}

// ══ UNIFIED ZOOM — works on all tabs ══
function zoomIn(){
  if(G.view==='image'){
    const maxSz=Math.min(cWrapEl.clientWidth,cWrapEl.clientHeight)-40;
    G.circleSize=Math.min(maxSz, Math.round(G.circleSize*1.25));
    applyCircleSize(); showSizeHint();
  } else {
    G.zoom=Math.min(4,G.zoom*1.25); applyZoom();
  }
}
function zoomOut(){
  if(G.view==='image'){
    G.circleSize=Math.max(120, Math.round(G.circleSize/1.25));
    applyCircleSize(); showSizeHint();
  } else {
    G.zoom=Math.max(0.25,G.zoom/1.25); applyZoom();
  }
}
function zoomFit(){
  if(G.view==='image'){
    const maxSz=Math.min(cWrapEl.clientWidth,cWrapEl.clientHeight)-40;
    G.circleSize=maxSz; applyCircleSize(); showSizeHint();
  } else {
    G.zoom=1; applyZoom();
  }
}

// Sync circle size ↔ SVG zoom when switching tabs
// so the visual circle always appears the same size
function syncZoomToCircle(){
  // Called when leaving result/error tab → going to image tab
  // Read current SVG size and set G.circleSize to match
  const svgW = cvSvg.getAttribute('width');
  if(svgW) G.circleSize = parseInt(svgW);
  else {
    const maxSz=Math.min(cWrapEl.clientWidth,cWrapEl.clientHeight)-40;
    G.circleSize = Math.round(maxSz * G.zoom);
  }
}
function syncCircleToZoom(){
  // Called when leaving image tab → going to result/error tab
  // Set G.zoom so SVG renders at same size as circle was
  const maxSz=Math.min(cWrapEl.clientWidth,cWrapEl.clientHeight)-40;
  if(maxSz>0 && G.circleSize>0) G.zoom=Math.min(4,Math.max(0.1,G.circleSize/maxSz));
  else G.zoom=1;
}

// ══ SLIDERS — auto-regen on release + click-to-type ══
let autoTimer=null;
function scheduleAutoGen(){
  if(!G.img)return;
  if(G.view==='image')return; // never generate while browsing image tab
  clearTimeout(autoTimer);
  autoTimer=setTimeout(()=>triggerGenerate(),80);
}

function showResetPopup(px,py,curVal,dfltVal,isFloat,sid,slider,label,step,min,max,regen){
  // Remove any existing popup
  const old=document.querySelector('.reset-popup');
  if(old) old.remove();

  const fmt=v=>isFloat?String(parseFloat(v.toFixed(3))).replace(/\.?0+$/, ''):String(Math.round(v));
  const pop=document.createElement('div');
  pop.className='reset-popup';
  pop.innerHTML=`<p>Current: <strong>${fmt(curVal)}</strong><br>Default: <strong>${fmt(dfltVal)}</strong></p>
    <div class="reset-popup-btns">
      <button class="rp-yes" id="rpSaveDefault">💾 Save as default</button>
      <button class="rp-no" id="rpGoDefault">↩ Reset to default</button>
    </div>
    <button class="rp-cancel" style="margin-top:6px;width:100%;padding:4px;background:none;border:none;color:var(--dim);font-size:.7rem;cursor:pointer;">cancel</button>`;

  // Position near click
  pop.style.left=Math.min(px, window.innerWidth-220)+'px';
  pop.style.top=Math.min(py+8, window.innerHeight-140)+'px';
  document.body.appendChild(pop);

  const close=()=>pop.remove();
  pop.querySelector('#rpSaveDefault').onclick=()=>{
    saveUserDefault(sid, curVal);
    close();
  };
  pop.querySelector('#rpGoDefault').onclick=()=>{
    const v=Math.max(min,Math.min(max,isFloat?dfltVal:Math.round(dfltVal/step)*step));
    slider.value=v;
    label.textContent=fmt(v);
    if(regen==='full'&&G.img)scheduleAutoGen();
    if(regen==='render'&&G.done&&!G.compareMode)render();
    close();
  };
  pop.querySelector('.rp-cancel').onclick=close;
  // Close on outside click
  setTimeout(()=>document.addEventListener('click',close,{once:true}),50);
}

// Wire up PARAM_CFG sliders
PARAM_CFG.forEach(({s,v,min,max,step,float,regen})=>{
  const slider=$(s),label=$(v);
  if(!slider||!label) return; // element may not exist in this layout
  let drag=false;

  // Slider interaction
  slider.addEventListener('mousedown',()=>{drag=true;});
  slider.addEventListener('touchstart',()=>{drag=true;},{passive:true});
  slider.addEventListener('input',()=>{
    label.textContent=float?parseFloat(slider.value).toFixed(2).replace(/\.?0+$/,''):slider.value;
    if(regen==='render'&&G.done&&!G.compareMode)render();
  });
  slider.addEventListener('mouseup',()=>{drag=false;if(regen==='full'&&G.img)scheduleAutoGen();});
  slider.addEventListener('touchend',()=>{drag=false;if(regen==='full'&&G.img)scheduleAutoGen();});

  // Click label to type a value
  label.addEventListener('click',()=>{
    label.contentEditable='true';
    // Select all text
    const range=document.createRange();range.selectNodeContents(label);
    const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
    label.focus();
  });
  label.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();label.blur();}
    if(e.key==='Escape'){
      label.contentEditable='false';
      label.textContent=float?parseFloat(slider.value).toFixed(2).replace(/\.?0+$/,''):slider.value;
    }
    // Allow only numbers, dot, backspace, arrows
    if(!/[\d.\-]|Backspace|Delete|Arrow|Tab/.test(e.key)&&e.key.length===1)e.preventDefault();
  });
  label.addEventListener('blur',()=>{
    label.contentEditable='false';
    let val=parseFloat(label.textContent);
    if(isNaN(val))val=parseFloat(slider.value);
    val=Math.max(min,Math.min(max,float?val:Math.round(val/step)*step));
    slider.value=val;
    label.textContent=float?String(val).replace(/\.?0+$/,''):String(val);
    if(regen==='full'&&G.img)scheduleAutoGen();
    if(regen==='render'&&G.done&&!G.compareMode)render();
  });

  // Double-click the value label → "Set as default?" popup
  label.addEventListener('dblclick',e=>{
    e.stopPropagation();
    const curVal=float?parseFloat(slider.value):parseInt(slider.value);
    const dflt=getDefault({s,def:float?parseFloat(s):parseInt(s)});
    showResetPopup(e.clientX,e.clientY, curVal, dflt, float, s, slider, label, step, min, max, regen);
  });
});

// ── MOBILE TABS ──
// ══════════════════════════════════════════
//  MOBILE LAYOUT (≤600px)
//  Bottom sheet for settings, top bar for tabs/generate.
// ══════════════════════════════════════════
const MOB_BP = 540;
let _mobInited = false;

function isMobile(){ return window.innerWidth <= 540; }

function mobInit(){
  if(!isMobile()) return;
  if(_mobInited) return;
  _mobInited = true;
  // Move panel-left contents into the sheet
  const panelLeft = document.querySelector('.panel-left');
  const sheetInner = $('mobSheetInner');
  if(panelLeft && sheetInner){
    // Move all children
    while(panelLeft.firstChild) sheetInner.appendChild(panelLeft.firstChild);
  }
  // Set mobile-appropriate upload circle text
  if($('phInner')) $('phInner').innerHTML='<div class="ph-txt">Tap to upload</div><div class="ph-hint">your image</div><div class="ph-upload-btn">Upload</div>';
}

function mobSyncGenBtn(){
  const btn = $('mobGenBtn');
  if(!btn) return;
  const srcBtn = $('btnGenGreedy');
  if(!srcBtn) return;
  btn.disabled = srcBtn.disabled;
  btn.textContent = G.running ? '⏹ Stop' : '▶ Go';
}

function mobSetTab(tab){
  if(!isMobile()) return;
  // sync with desktop setView
  setView(tab);
  // update mobile tab button highlights
  ['Image','Result','Wind'].forEach(t=>{
    const b = $('mbt'+t);
    if(!b) return;
    const isWind = t==='Wind' && tab==='wind';
    const isActive = tab === t.toLowerCase() || (tab==='result' && t==='Result') || (tab==='image' && t==='Image');
    b.classList.toggle('active', isActive && !isWind);
    b.classList.toggle('wind-active', isWind);
  });
}

// Wind tab click on mobile — label wraps input for direct file picker access when !G.done
function _windTabClick(e){
  e.preventDefault();
  if(G.done){ mobSetTab('wind'); } else { $('windHomeInput').click(); }
}
// Wind tab click on desktop
function _windBtnClick(){
  if(!G.done){ const wfi=$('windFileInput'); if(wfi) wfi.click(); return; }
  setView('wind');
}

function mobOpenSheet(){
  $('mobSheetBackdrop').classList.add('open');
  $('mobSheet').classList.add('open');
}

function mobCloseSheet(){
  $('mobSheetBackdrop').classList.remove('open');
  $('mobSheet').classList.remove('open');
}

function mobTab(tab){ /* stub — unified */ }

function initMobile(){
  mobInit();
  mobSyncGenBtn();
}

// ── Init calls ──
setView('image');
showImageControls(false);

// Init circle size to max after layout is ready
function _initCircleSize(){
  const cw=cWrapEl.clientWidth||window.innerWidth-310;
  const ch=cWrapEl.clientHeight||window.innerHeight-100;
  const sz=Math.max(120,Math.min(cw,ch)-40);
  if(sz>G.circleSize){ G.circleSize=sz; applyCircleSize(); }
}
requestAnimationFrame(()=>requestAnimationFrame(_initCircleSize));
window.addEventListener('load',_initCircleSize);
if($('btnGen')) $('btnGen').addEventListener('click',()=>triggerGenerate());

window.addEventListener('resize',()=>{
  if(isMobile()) mobInit();
});
initMobile();
PriorPriorPriorPriorPriorPrior
