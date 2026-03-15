// ══════════════════════════
//  GENERATION / ALGORITHMS
// ══════════════════════════

// ══ IMAGE → FLOAT ARRAY ══
function prepareImage(sz){
  off.width=sz;off.height=sz;
  const ctx=off.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,sz,sz);
  drawCropped(ctx,sz,G.bw);
  const raw=ctx.getImageData(0,0,sz,sz).data;
  const img=new Float32Array(sz*sz);
  const cx=sz/2,cy=sz/2,R=sz/2;

  // Pass 1: convert to linearised darkness [0=white,1=black], clip to circle
  for(let y=0;y<sz;y++)for(let x=0;x<sz;x++){
    const i=y*sz+x,pi=i*4;
    // sRGB perceptual luminance weights (ITU-R BT.709)
    const srgb=(0.2126*raw[pi]+0.7152*raw[pi+1]+0.0722*raw[pi+2])/255;
    // Linearise: undo gamma so greedy sees perceptual equal-steps
    // (Chris Wellons recommendation: "gamma 2.2 gives better results")
    const lin = srgb<=0.04045 ? srgb/12.92 : Math.pow((srgb+0.055)/1.055,2.4);
    const dx=x-cx,dy=y-cy;
    img[i]=(dx*dx+dy*dy<=(R-1)*(R-1))?(1-lin):0;
  }

  // Pass 2: auto-contrast stretch inside the circle
  // Forces the darkest pixel to 1.0 and brightest to 0.0 — full use of range.
  // This dramatically improves light/faint images (pencil sketches, pale faces).
  let minV=1, maxV=0;
  for(let i=0;i<sz*sz;i++){ if(img[i]>0){if(img[i]<minV)minV=img[i];if(img[i]>maxV)maxV=img[i];} }
  const span=maxV-minV;
  if(span>0.15){ // only stretch if image has real range (skip near-blank images)
    const scale=1/span;
    for(let i=0;i<sz*sz;i++) if(img[i]>0) img[i]=Math.min(1,Math.max(0,(img[i]-minV)*scale));
  }

  return img;
}

function makeNails(N,sz){
  const nails=[],cx=sz/2,cy=sz/2,nr=sz/2-2;
  for(let i=0;i<N;i++){const a=(i/N)*Math.PI*2-Math.PI/2;nails.push({x:cx+nr*Math.cos(a),y:cy+nr*Math.sin(a)});}
  return nails;
}

// ══ BRESENHAM ══
function bresenham(x0,y0,x1,y1,sz){
  const pts=[];
  let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,e=dx-dy,x=x0,y=y0;
  while(true){if(x>=0&&x<sz&&y>=0&&y<sz)pts.push(y*sz+x);if(x===x1&&y===y1)break;const e2=2*e;if(e2>-dy){e-=dy;x+=sx;}if(e2<dx){e+=dx;y+=sy;}}
  return new Int32Array(pts);
}

function buildLC(nails,N,minG,sz){
  const lc=[];for(let i=0;i<N;i++)lc.push({});
  for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
    const diff=j-i,ad=Math.min(diff,N-diff);
    if(ad<minG){lc[i][j]=null;continue;}
    lc[i][j]=bresenham(Math.round(nails[i].x),Math.round(nails[i].y),Math.round(nails[j].x),Math.round(nails[j].y),sz);
  }
  return lc;
}
function getLine(lc,i,j){return i<j?lc[i][j]:lc[j][i];}

// ══════════════════════════════════════════
//  GREEDY ALGORITHM — Research-grade improvements:
//
//  1. Importance map (Hachnochi/McDougall): auto-built from edge strength +
//     radial center-weight so faces/detail are hunted first, background last.
//  2. Weighted scoring: score = Σ(err[px] * importance[px]) / Σ(importance[px])
//     Instead of plain average — detail areas count more.
//  3. Edge-boosted scoring: Sobel edge map added to importance so outlines
//     are captured early (critical for portraits, as Birsak 2018 confirms).
//  4. Adaptive fade: when err[px] is already near 0 (saturated/over-drawn),
//     fade contribution is reduced — avoids wasting "string budget" on done areas.
//  5. Dynamic penalty window: scales with N so larger nail counts don't loop.
//  6. Adaptive stop threshold: relative to image average darkness (not hardcoded).
//  7. Score normalization: per-line length normalization so short lines don't
//     cheat by having fewer pixels to average over.
// ══════════════════════════════════════════
function buildImportanceMap(img, sz){
  // Edge strength via Sobel
  const edges = new Float32Array(sz*sz);
  for(let y=1;y<sz-1;y++) for(let x=1;x<sz-1;x++){
    const gx = img[(y-1)*sz+(x+1)] + 2*img[y*sz+(x+1)] + img[(y+1)*sz+(x+1)]
              -img[(y-1)*sz+(x-1)] - 2*img[y*sz+(x-1)] - img[(y+1)*sz+(x-1)];
    const gy = img[(y+1)*sz+(x-1)] + 2*img[(y+1)*sz+x] + img[(y+1)*sz+(x+1)]
              -img[(y-1)*sz+(x-1)] - 2*img[(y-1)*sz+x] - img[(y-1)*sz+(x+1)];
    edges[y*sz+x] = Math.min(1, Math.sqrt(gx*gx+gy*gy)*1.5);
  }
  // Soft radial center-weight: center pixels count 1.5x, edge of circle 0.7x
  // This mimics human importance weighting for portrait subjects
  const cx=sz/2, cy=sz/2, R=sz/2;
  const imp = new Float32Array(sz*sz);
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
    const i=y*sz+x;
    if(img[i]===0){imp[i]=0;continue;}
    const r = Math.sqrt((x-cx)**2+(y-cy)**2)/R; // 0=center, 1=edge
    const radialW = 0.7 + 0.8*(1-r*r); // 1.5 at center, 0.7 at rim
    // Blend: 50% raw darkness + 35% edge + 15% radial
    imp[i] = Math.min(1, img[i]*0.50 + edges[i]*0.35 + radialW*0.15);
  }
  return imp;
}

function runGreedy(img,nails,N,maxL,minG,fade,sz,cb){
  const lc=buildLC(nails,N,minG,sz);
  const err=new Float32Array(img);

  // Build importance map for weighted scoring
  const imp=buildImportanceMap(img,sz);

  const result=[0]; let cur=0;

  // PENALTY_WINDOW scales with N: for 100 nails=8, for 300=15, for 400=18
  const PENALTY_WINDOW = Math.round(Math.sqrt(N)*0.85);

  // Adaptive stop threshold: 0.3% of mean darkness so light images don't stop early
  let meanDark=0; let npx=0;
  for(let i=0;i<sz*sz;i++) if(img[i]>0){meanDark+=img[i];npx++;}
  meanDark/=Math.max(1,npx);
  const STOP_THRESH = meanDark * 0.008; // stop when best line < 0.8% of mean

  const lastVisit=new Int32Array(N).fill(-999);

  for(let iter=0;iter<maxL;iter++){
    let best=-1, bestJ=-1;

    for(let j=0;j<N;j++){
      if(j===cur) continue;
      const ad=Math.min(Math.abs(j-cur),N-Math.abs(j-cur));
      if(ad<minG) continue;
      const px=getLine(lc,cur,j);
      if(!px||!px.length) continue;

      // Weighted score: Σ(err * importance) / Σ(importance)
      // This makes the algorithm prioritise detail/edge pixels over flat areas
      let wsum=0, wt=0;
      for(let k=0;k<px.length;k++){
        const w=imp[px[k]];
        wsum+=err[px[k]]*w;
        wt+=w;
      }
      let score = wt>0 ? wsum/wt : 0;

      // Recency penalty — scaled PENALTY_WINDOW
      const age=iter-lastVisit[j];
      if(age<PENALTY_WINDOW) score*=(age/PENALTY_WINDOW);

      if(score>best){best=score;bestJ=j;}
    }

    if(bestJ<0 || best<STOP_THRESH) break;

    result.push(bestJ);
    const px=getLine(lc,cur,bestJ);
    const fadeAmt=fade/500;
    for(let k=0;k<px.length;k++){
      // Adaptive fade: pixels already near 0 contribute less fade
      // (avoids "burning" already-done areas while underdone areas wait)
      const residual=err[px[k]];
      const adaptFade = fadeAmt * (0.4 + 0.6*residual); // less fade when pixel is already dark
      err[px[k]]=Math.max(0, residual-adaptFade);
    }
    lastVisit[cur]=iter;
    cur=bestJ;
    if(iter%150===0) cb(iter,maxL);
  }
  return{result,err,lc};
}

// ══════════════════════════════════════════
//  RADON-STYLE ALGORITHM
//
//  The key insight: rather than scoring on the
//  raw error image, we score on an EDGE-ENHANCED
//  version of the error. This is the actual useful
//  connection to the Radon transform in CT — it
//  favours lines that cross strong edges (dark→light
//  transitions), which are the contour features
//  that make portraits readable. We compute a
//  simple Sobel edge map once, then weight the
//  pixel scores by edge strength during selection.
//  Subtraction still happens on the raw error image.
// ══════════════════════════════════════════
function runRadon(img,nails,N,maxL,minG,fade,sz,cb){
  const lc=buildLC(nails,N,minG,sz);

  // Build edge-enhanced scoring image: combine raw + Sobel magnitude
  const edge=new Float32Array(sz*sz);
  for(let y=1;y<sz-1;y++)for(let x=1;x<sz-1;x++){
    const gx=img[(y-1)*sz+(x+1)]+2*img[y*sz+(x+1)]+img[(y+1)*sz+(x+1)]
             -img[(y-1)*sz+(x-1)]-2*img[y*sz+(x-1)]-img[(y+1)*sz+(x-1)];
    const gy=img[(y+1)*sz+(x-1)]+2*img[(y+1)*sz+x]+img[(y+1)*sz+(x+1)]
             -img[(y-1)*sz+(x-1)]-2*img[(y-1)*sz+x]-img[(y-1)*sz+(x+1)];
    edge[y*sz+x]=Math.sqrt(gx*gx+gy*gy)/4;
  }
  // Score image = blend of raw darkness + edge
  const score=new Float32Array(sz*sz);
  for(let i=0;i<sz*sz;i++) score[i]=img[i]*0.6+edge[i]*0.4;

  const err=new Float32Array(img);     // working copy for subtraction
  const scoreW=new Float32Array(score); // working copy for scoring

  const result=[0];let cur=0;
  for(let iter=0;iter<maxL;iter++){
    let best=-1,bestJ=-1;
    for(let j=0;j<N;j++){
      if(j===cur)continue;
      const ad=Math.min(Math.abs(j-cur),N-Math.abs(j-cur));
      if(ad<minG)continue;
      const px=getLine(lc,cur,j);
      if(!px||!px.length)continue;
      let sum=0;for(let k=0;k<px.length;k++)sum+=scoreW[px[k]];
      if(sum/px.length>best){best=sum/px.length;bestJ=j;}
    }
    if(bestJ<0||best<0.0015)break;
    result.push(bestJ);
    const px=getLine(lc,cur,bestJ);
    const f=fade/500;
    for(let k=0;k<px.length;k++){
      err[px[k]]=Math.max(0,err[px[k]]-f);
      scoreW[px[k]]=Math.max(0,scoreW[px[k]]-f);
    }
    cur=bestJ;
    if(iter%150===0)cb(iter,maxL);
  }
  return{result,err,lc};
}

// ══ ACCURACY SCORE ══
// Measures how well the rendered string art matches the original.
// Renders string pattern to pixel array, compares with target image.
// Returns 0–100 (higher = better match).
function computeScore(nailList,nailPos,imgPx,sz){
  const SZ=sz;
  const rendered=new Float32Array(SZ*SZ); // starts at 0 (white)
  const thick=0.5; // fixed thin line for scoring
  // Draw lines into rendered (additive)
  for(let i=0;i<nailList.length-1;i++){
    const f=nailPos[nailList[i]],t=nailPos[nailList[i+1]];
    const px=bresenham(Math.round(f.x),Math.round(f.y),Math.round(t.x),Math.round(t.y),SZ);
    for(let k=0;k<px.length;k++) rendered[px[k]]=Math.min(1,rendered[px[k]]+0.15);
  }
  // Compare with original (both are 0=white/empty, 1=dark)
  let mse=0,count=0;
  const cx=SZ/2,cy=SZ/2,R=SZ/2;
  for(let y=0;y<SZ;y++)for(let x=0;x<SZ;x++){
    const dx=x-cx,dy=y-cy;
    if(dx*dx+dy*dy>(R-1)*(R-1))continue;
    const d=rendered[y*SZ+x]-imgPx[y*SZ+x];
    mse+=d*d;count++;
  }
  mse/=count;
  return Math.max(0,Math.round((1-Math.sqrt(mse))*100));
}

// ══ GENERATE ══

function triggerFromBtn(){
  // The unified button always triggers the currently selected algo
  if(G.algo==='back'){
    G.algo='back';
  } else {
    G.algo='greedy';
  }
  triggerGenerate();
}

function updateGenBtn(){
  const isBack=G.algo==='back';
  const btn=$('btnGenGreedy');
  const lbl=$('btnInGreedy');
  if(!btn||!lbl) return;
  if(isBack){
    btn.style.background='var(--accent2)';
    btn.style.color='#fff';
    lbl.textContent='▶ Generate';
  } else {
    btn.style.background='';
    btn.style.color='';
    lbl.textContent='▶ Generate';
  }
  mobSyncGenBtn();
}

function onBigGenerate(){
  if(!G.img) return;
  if(!G.running) triggerGenerate();
  // finishGen will switch to result tab when done
}

function triggerGenerate(){
  if(!G.img) return;
  // Allow switching to Front while Back runs in background
  // But don't allow re-triggering the same algo while it's running
  if(G.running && G.runningAlgo===G.algo) return;

  // Build a cache key from current image+params (use algo-specific sliders)
  const _ckIsBack=G.algo==='back';
  const cacheKey=[
    _ckIsBack?$('snB').value:$('sn').value,
    _ckIsBack?$('slB').value:$('sl').value,
    _ckIsBack?$('sgB').value:$('sg').value,
    _ckIsBack?$('sfB').value:$('sf').value,
    G.bw,'0',G.cropOffX.toFixed(3),G.cropOffY.toFixed(3),G.cropZoom.toFixed(3)
  ].join('|');

  // If we already computed this algo with the same params — reuse instantly
  const cached = G.cache[G.algo];
  if(cached && cached.key===cacheKey){
    prog(100,'Loaded from cache!');
    $('pw').style.display='block';
    finishGen(cached.result,cached.err,cached.img,cached.nails,
              cached.N,cached.sz,0,cached.sc,cached.lc);
    setTimeout(()=>$('pw').style.display='none',1000);
    return;
  }

  G.running=true;G.runningAlgo=G.algo;G.compareMode=false;
  // Use per-algo button and progress bar
  const _isBack = G.algo==='back';
  const _btnId = 'btnGenGreedy';
  const _btnInId = 'btnInGreedy';
  const _pwId = _isBack ? 'pwBack' : 'pwGreedy';
  $(_btnId).disabled=true;
  $(_btnInId).innerHTML='<div class="spin" style="display:inline-block"></div> Generating...';
  $(_btnId).classList.add('pulsing');
  $(_pwId).style.display='block';prog(0,'Preparing...');
  // Also disable old btn if exists
  if($('btnGen')) $('btnGen').disabled=true;
  if($('btnCompare')) $('btnCompare').disabled=true;
  const t0=performance.now();
  setTimeout(()=>{
    const isBack=G.algo==='back';
    const N=parseInt(isBack&&$('snB')?$('snB').value:$('sn').value),maxL=parseInt(isBack&&$('slB')?$('slB').value:$('sl').value);
    const sz=500,minG=parseInt(isBack&&$('sgB')?$('sgB').value:$('sg').value),fade=parseInt(isBack&&$('sfB')?$('sfB').value:$('sf').value);
    const img=prepareImage(sz),nails=makeNails(N,sz);

    G._cacheKey=cacheKey; // save so finishGen can store it
    if(G.algo==='back'){
      // Back Allowed is async/chunked — delivers result via callback
      runBackAllowed(img,nails,N,maxL,minG,fade,sz,(result,err,lc)=>{
        if($('backTabBadge')){$('backTabBadge').textContent='';$('backTabBadge').classList.remove('visible');}
        // Store result in cache regardless of which tab we're on now
        const sc=computeScore(result,nails,img,sz);
        const _key=cacheKey;
        G.cache['back']={key:_key,result,err,img,nails,N,sz,sc,lc};
        // Update Back tab button
        if($('btnGenGreedy')){$('btnGenGreedy').disabled=false;$('btnGenGreedy').classList.remove('pulsing');}
        if($('btnInGreedy')) $('btnInGreedy').innerHTML='▶ Generate';
        if($('pwBack')) setTimeout(()=>$('pwBack').style.display='none',1500);
        // Update Back stats
        if($('statSecBack')) $('statSecBack').style.display='block';
        if($('stlB')) $('stlB').textContent=result.length/2|0;
        if($('stnB')) $('stnB').textContent=N;
        if($('sttB')) $('sttB').textContent=((performance.now()-t0)/1000).toFixed(1);
        if($('scoreValB')) $('scoreValB').textContent=sc+'%';
        if($('scoreBoxB')) $('scoreBoxB').style.display='block';
        prog(100,'Back done!');
        const backTabEl=$('algoTabBack');
        if(backTabEl){backTabEl.classList.remove('back-running');backTabEl.removeAttribute('data-pct');}
        // Clear running state
        G.running=false; G.runningAlgo=null;
        // Only render/show if we're still on the Back tab
        if(G.algo==='back'){
          G.nails=result;G.errPx=err;G.imgPx=img;G.nailPos=nails;G.imgSz=sz;
          G.done=true;G.score=sc;G.lineCache=lc;
          if($('algoTitleOverlay')){$('algoTitleOverlay').style.display='block';$('algoTitleOverlay').textContent='Back Allowed · '+(result.length/2|0)+' lines';}
          if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
          $('ph').style.display='none';
          pbInit();render();
        }
      });
    } else {
      const algo=G.algo==='radon'?runRadon:runGreedy;
      const{result,err,lc}=algo(img,nails,N,maxL,minG,fade,sz,(iter,max)=>{
        const fpct=Math.round(5+(iter/max)*88);prog(fpct,'Lines: '+(iter+1)+' / '+max+' · '+fpct+'%');
      });
      prog(95,'Scoring...');
      const sc=computeScore(result,nails,img,sz);
      finishGen(result,err,img,nails,N,sz,performance.now()-t0,sc,lc);
    }
  },40);
}

function prog(p,msg){
  const _isBack=G.algo==='back';
  const pfId=_isBack?'pfBack':'pfGreedy';
  const ptId=_isBack?'ptBack':'ptGreedy';
  if($(pfId)) $(pfId).style.width=p+'%';
  if($(ptId)) $(ptId).textContent=msg;
  // Show % in the button itself while generating
  if(!_isBack && $('btnInGreedy') && G.running){
    $('btnInGreedy').innerHTML=`<div class="spin" style="display:inline-block"></div> ${p|0}%`;
  }
  if($('pf')) $('pf').style.width=p+'%';
  if($('pt')) $('pt').textContent=msg;
}

function finishGen(result,err,img,nails,N,sz,ms,sc,lc){
  G.nails=result;G.errPx=err;G.imgPx=img;G.nailPos=nails;G.imgSz=sz;
  G.done=true;G.running=false;G.runningAlgo=null;G.score=sc;G.lineCache=lc;
  // Store in cache so switching algos doesn't re-run
  if(G.cache && G._cacheKey){
    G.cache[G.algo]={key:G._cacheKey,result,err,img,nails,N,sz,sc,lc};
    G._cacheKey=null;
  }
  prog(100,'Done!');
  // ── Switch to String Art tab ──
  G.view='result';
  document.body.className=document.body.className.replace(/view-\S+/g,'').trim();
  document.body.classList.add('view-result');
  ['vmR','vmO','vmE'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on');});
  const vmR=document.getElementById('vmR'); if(vmR) vmR.classList.add('on');
  // ── Hide image-tab elements ──
  $('ph').style.display='none';
  if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
  cvRaster.style.display='none'; cvCmpSvg.style.display='none';
  $('cDiv').style.display='none'; $('cHandle').style.display='none';
  $('cLblL').style.display='none'; $('cLblR').style.display='none';
  // ── Stats ──
  $('stl').textContent=result.length-1; $('stn').textContent=N;
  $('stt').textContent=(ms/1000).toFixed(1);
  $('stm').textContent=Math.round((result.length-1)*0.64*0.3);
  $('scoreBox').style.display='block';
  $('scoreVal').textContent=sc+'%';
  $('scoreDelta').textContent='accuracy vs original';
  $('emptyMsg').style.display='none';
  if(G.showSeq){$('nw').style.display='block'; renderNailPanel(result);}
  if($('algoTitleOverlay')){$('algoTitleOverlay').style.display='block';$('algoTitleOverlay').textContent=(G.algo==='back'?'Back Allowed':'Front (Greedy)')+' · '+((G.nails?G.nails.length:0)-1)+' lines';}
  // ── RENDER first — must happen before pbInit so a crash there can't block it ──
  cvSvg.style.display='block';
  render();
  // ── Init playback bar ──
  try { pbInit(); document.body.classList.add('pb-ready'); } catch(e) { console.warn('pbInit:', e); }
  // Re-enable per-algo button
  const _isBackF=G.algo==='back';
  const _btnIdF='btnGenGreedy';
  const _btnInIdF='btnInGreedy';
  const _pwIdF=_isBackF?'pwBack':'pwGreedy';
  if($(_btnIdF)){$(_btnIdF).disabled=false;$(_btnIdF).classList.remove('pulsing');}
  if($(_btnInIdF)) $(_btnInIdF).innerHTML=_isBackF?'▶ Generate':'▶ Generate';
  setTimeout(()=>{ if($(_pwIdF)) $(_pwIdF).style.display='none'; },2000);
  // Per-algo stats
  const _statId=_isBackF?'statSecBack':'statSecGreedy';
  if($(_statId)) $(_statId).style.display='block';
  const _sfx=_isBackF?'B':'G';
  const _lines=G.nails?(_isBackF?G.nails.length/2:G.nails.length-1):0;
  if($('stl'+_sfx)) $('stl'+_sfx).textContent=_lines;
  if($('stn'+_sfx)) $('stn'+_sfx).textContent=parseInt($('sn').value);
  if($('stm'+_sfx)){const d=parseFloat($('physDiam').value)||45;let tot=0;if(G.nailPos&&G.nails){for(let i=0;i<(_isBackF?G.nails.length/2:G.nails.length-1);i++){const ai=_isBackF?G.nails[i*2]:G.nails[i],bi=_isBackF?G.nails[i*2+1]:G.nails[i+1];if(G.nailPos[ai]&&G.nailPos[bi]){const dx=G.nailPos[ai].x-G.nailPos[bi].x,dy=G.nailPos[ai].y-G.nailPos[bi].y;tot+=Math.sqrt(dx*dx+dy*dy);}}$('stm'+_sfx).textContent=Math.round(tot/G.imgSz*d/100);}};
  if(G.score!==null&&$('scoreVal'+_sfx)){$('scoreVal'+_sfx).textContent=G.score+'%';if($('scoreBox'+_sfx))$('scoreBox'+_sfx).style.display='block';}
  // Back view toolbar button
  $('tbBackView').style.display=_isBackF?'flex':'none';
  $('backViewSep').style.display=_isBackF?'block':'none';
  // refineRow removed
  if($('btnRefine')) $('btnRefine').style.display='block';
  updateProdTime();
  setTimeout(()=>{ if($('pw')) $('pw').style.display='none'; },2000);
  showWindTab();
  // On mobile: switch to result tab and sync button
  if(isMobile()){ mobSetTab('result'); mobSyncGenBtn(); }
}

// ══ ITERATIVE REFINEMENT ══
// After generation, do a second pass targeting the highest-error regions.
// This simulates "AI learning by trial and error" — measures the gap
// between rendered and original, then concentrates new lines there.
$('btnRefine').addEventListener('click',()=>{
  if(!G.done||G.running)return;
  G.running=true;
  $('btnRefine').textContent='⟳ Refining...';
  $('btnRefine').disabled=true;
  if($('btnGen'))$('btnGen').disabled=true;
  const t0=performance.now();
  setTimeout(()=>{
    const N=parseInt($('sn').value);
    const maxExtra=Math.floor(parseInt($('sl').value)*0.3); // 30% more lines
    const sz=G.imgSz,minG=parseInt($('sg').value),fade=parseInt($('sf').value);
    const nails=G.nailPos;

    // Compute residual: where is the rendered image still far from target?
    // Render current result to pixel buffer
    const rendered=new Float32Array(sz*sz);
    for(let i=0;i<G.nails.length-1;i++){
      const f=nails[G.nails[i]],t=nails[G.nails[i+1]];
      const px=G.lineCache?getLine(G.lineCache,G.nails[i],G.nails[i+1]):
                bresenham(Math.round(f.x),Math.round(f.y),Math.round(t.x),Math.round(t.y),sz);
      if(px)for(let k=0;k<px.length;k++)rendered[px[k]]=Math.min(1,rendered[px[k]]+0.12);
    }
    // Residual = target darkness minus what's rendered (clamped to >0)
    const residual=new Float32Array(sz*sz);
    for(let i=0;i<sz*sz;i++)residual[i]=Math.max(0,G.imgPx[i]-rendered[i]);

    // Run a short greedy pass on the residual
    const{result:extra,err}=runGreedy(residual,nails,N,maxExtra,minG,fade,sz,(i,m)=>{});

    // Append extra nails to existing sequence (connect from last nail)
    const lastNail=G.nails[G.nails.length-1];
    const extraConnected=[lastNail,...extra.slice(1)];
    const combined=[...G.nails,...extraConnected.slice(1)];

    // Recompute error image
    const newErr=new Float32Array(G.imgPx);
    const lc=buildLC(nails,N,minG,sz);
    for(let i=0;i<combined.length-1;i++){
      const px=getLine(lc,combined[i],combined[i+1]);
      if(px)for(let k=0;k<px.length;k++)newErr[px[k]]=Math.max(0,newErr[px[k]]-fade/500);
    }

    const sc=computeScore(combined,nails,G.imgPx,sz);
    const prev=G.score;
    G.nails=combined;G.errPx=newErr;G.score=sc;G.lineCache=lc;

    $('stl').textContent=combined.length-1;
    $('scoreVal').textContent=sc+'%';
    const delta=sc-prev;
    $('scoreDelta').textContent=(delta>=0?'+':'')+delta+'% from refinement';
    $('scoreDelta').style.color=delta>=0?'var(--accent)':'#ff6b6b';
    if(G.showSeq){renderNailPanel(combined);}
    render();
    G.running=false;
    $('btnRefine').textContent='⟳ Refine again';
    $('btnRefine').disabled=false;
    if($('btnGen'))$('btnGen').disabled=false;
    $('stt').textContent=(((performance.now()-t0)/1000)+parseFloat($('stt').textContent)).toFixed(1);
  },40);
});

// ══ SMART OPTIMIZE ══
// Analyzes the image and suggests better parameter values.
// Relationships it considers:
// - Nail count ↔ Max lines (12–16× ratio is optimal)
// - Line darkness ↔ Max lines (more lines → less fade needed)
// - Min nail skip ↔ Nail count (~8% of N)
$('btnOptimize').addEventListener('click',()=>{
  if(!G.img)return;

  // Save current params for rollback
  G.prevParams={
    sn:$('sn').value,sl:$('sl').value,sf:$('sf').value,
    sg:$('sg').value,
    vn:$('vn').textContent,vl:$('vl').textContent,
    vf:$('vf').textContent,vg:$('vg').textContent,
  };

  // Analyze image: compute average darkness to guide params
  off.width=100;off.height=100;
  const ctx=off.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,100,100);
  drawCropped(ctx,100,G.bw);
  const raw=ctx.getImageData(0,0,100,100).data;
  let darkSum=0,darkCount=0;
  for(let i=0;i<10000;i++){const g=(raw[i*4]+raw[i*4+1]+raw[i*4+2])/3/255;darkSum+=(1-g);darkCount++;}
  const avgDark=darkSum/darkCount; // 0=white image, 1=black image

  // Compute suggested params
  const suggestN=Math.round(Math.min(300,Math.max(150,200+avgDark*100))/5)*5;
  const ratioLines=avgDark>0.5?14:12; // darker images need more lines
  const suggestL=Math.round(Math.min(5000,suggestN*ratioLines)/100)*100;
  const suggestFade=Math.round(avgDark>0.5?20:30); // dark images → less fade
  const suggestG=Math.round(suggestN*0.08);

  // Apply
  $('sn').value=suggestN;$('vn').textContent=suggestN;
  $('sl').value=suggestL;$('vl').textContent=suggestL;
  $('sf').value=suggestFade;$('vf').textContent=suggestFade;
  $('sg').value=suggestG;$('vg').textContent=suggestG;

  $('optHint').textContent=`N=${suggestN} · ${suggestL} lines · fade ${suggestFade}`;
  $('rollbackRow').style.display='flex';

  triggerGenerate();
});

$('btnRollback').addEventListener('click',()=>{
  if(!G.prevParams)return;
  const p=G.prevParams;
  $('sn').value=p.sn;$('vn').textContent=p.vn;
  $('sl').value=p.sl;$('vl').textContent=p.vl;
  $('sf').value=p.sf;$('vf').textContent=p.vf;
  $('sg').value=p.sg;$('vg').textContent=p.vg;
  $('rollbackRow').style.display='none';
  triggerGenerate();
});

// ══ COMPARE ══
if($('btnCompare'))$('btnCompare').addEventListener('click',()=>{
  // If already in compare mode, toggle it off
  if(G.compareMode){
    G.compareMode=false;
    if($('btnCompare')){$('btnCompare').classList.remove('active');$('btnCompare').textContent='⇄ Compare side by side';}
    cvCmpSvg.style.display='none';
    $('cDiv').style.display='none';$('cHandle').style.display='none';
    $('cLblL').style.display='none';$('cLblR').style.display='none';
    if(G.done)render();
    return;
  }
  if(!G.img||G.running)return;
  G.running=true;G.compareMode=true;
  if($('btnCompare')){$('btnCompare').classList.add('active');$('btnCompare').textContent='⇄ Exit compare';}
  if($('btnGen'))$('btnGen').disabled=true;if($('btnCompare'))$('btnCompare').disabled=true;
  if($('btnIn'))$('btnIn').innerHTML='<div class="spin" style="display:inline-block"></div> Running both...';
  if($('btnGen'))$('btnGen').classList.add('pulsing');
  if($('pw'))$('pw').style.display='block';prog(0,'Running Greedy...');
  const t0=performance.now();
  setTimeout(()=>{
    const isBack=G.algo==='back';
    const N=parseInt(isBack&&$('snB')?$('snB').value:$('sn').value),maxL=parseInt(isBack&&$('slB')?$('slB').value:$('sl').value);
    const sz=500,minG=parseInt(isBack&&$('sgB')?$('sgB').value:$('sg').value),fade=parseInt(isBack&&$('sfB')?$('sfB').value:$('sf').value);
    const img=prepareImage(sz),nails=makeNails(N,sz);
    const gr=runGreedy(img,nails,N,maxL,minG,fade,sz,(i,m)=>prog(2+(i/m)*44,'Greedy: '+(i+1)+'/'+m));
    prog(50,'Running Radon...');
    const rd=runRadon(img,nails,N,maxL,minG,fade,sz,(i,m)=>prog(50+(i/m)*46,'Radon: '+(i+1)+'/'+m));
    prog(100,'Drag divider to compare');
    G.greedyNails=gr.result;G.radonNails=rd.result;
    G.nails=gr.result;G.errPx=gr.err;G.imgPx=img;G.nailPos=nails;G.imgSz=sz;G.done=true;G.running=false;
    // statSec/expSec inside panels now
    $('stl').textContent=(gr.result.length-1)+' / '+(rd.result.length-1);
    $('stn').textContent=N;$('stt').textContent=((performance.now()-t0)/1000).toFixed(1);
    $('stm').textContent=Math.round(((gr.result.length+rd.result.length)/2-1)*0.64*0.3);
    G.comparePct=50;
    $('ph').style.display='none';
    if($('imgPreviewWrap')) $('imgPreviewWrap').style.display='none';
    if($('algoTitleOverlay')){$('algoTitleOverlay').style.display='block';$('algoTitleOverlay').textContent=(G.algo==='back'?'Back Allowed':'Front (Greedy)')+' · '+((G.nails?G.nails.length:0)-1)+' lines';}
    renderCompare();$('emptyMsg').style.display='none';
    if(G.showSeq){$('nw').style.display='block';renderNailPanel(gr.result);}
    if($('btnGen'))$('btnGen').disabled=false;if($('btnCompare'))$('btnCompare').disabled=false;
    if($('btnIn'))$('btnIn').innerHTML='▶ Regenerate';if($('btnGen'))$('btnGen').classList.remove('pulsing');
    $('scoreBox').style.display='none';
    updateProdTime();
    setTimeout(()=>$('pw').style.display='none',2500);
    setupCompareDrag();
  },40);
});

// ══ PRODUCTION TIME ══
// Calculates machine winding time and mechanical stats from the nail sequence.
// All machine parameters are tunable — this lets you calibrate once the hardware exists.
function updateProdTime(){
  if(!G.done||!G.nails||G.nails.length<2)return;
  // prodSec inside collapse

  const N=parseInt($('sn').value);
  const diam=parseFloat($('physDiam').value)||45;      // cm
  const motorDegPerSec=parseFloat($('mSpeed').value)||60; // degrees/sec
  const feedCmPerSec=parseFloat($('mFeed').value)||5;     // cm/sec
  const dwellSec=parseFloat($('mDwell').value)||0.3;       // sec per nail

  const R=diam/2; // radius in cm
  const nailAngleDeg=360/N; // degrees between adjacent nails
  const circumference=Math.PI*diam; // cm

  const list=G.nails;
  let totalRotDeg=0,totalChordCm=0,maxRot=0;
  const lines=list.length-1;

  for(let i=0;i<lines;i++){
    const from=list[i],to=list[i+1];
    // Clockwise angular distance (always take shortest arc)
    const diff=Math.abs(to-from);
    const shortArc=Math.min(diff,N-diff);
    const rotDeg=shortArc*nailAngleDeg;
    totalRotDeg+=rotDeg;
    if(rotDeg>maxRot)maxRot=rotDeg;
    // Chord length: 2R·sin(θ/2)
    const theta=(rotDeg*Math.PI)/180;
    const chord=2*R*Math.sin(theta/2);
    totalChordCm+=chord;
  }

  const avgRotDeg=totalRotDeg/lines;
  const avgChordCm=totalChordCm/lines;

  // Time breakdown:
  // - Rotation time: total degrees / motor speed
  const rotTimeSec=totalRotDeg/motorDegPerSec;
  // - Feed time: total thread length / feed speed
  const feedTimeSec=totalChordCm/feedCmPerSec;
  // - Dwell time: one dwell per nail visit
  const dwellTimeSec=lines*dwellSec;
  // - Total
  const totalSec=rotTimeSec+feedTimeSec+dwellTimeSec;

  // Format time nicely
  function fmtTime(s){
    if(s<60)return Math.round(s)+'s';
    const m=Math.floor(s/60),sec=Math.round(s%60);
    if(m<60)return m+'m '+(sec>0?sec+'s':'');
    const h=Math.floor(m/60),min=m%60;
    return h+'h '+(min>0?min+'m':'');
  }

  function fmtCm(cm){
    return cm>=100?(cm/100).toFixed(1)+'m':Math.round(cm)+'cm';
  }

  $('pTime').textContent=fmtTime(totalSec);
  $('pThread').textContent=fmtCm(totalChordCm);
  $('pAvgDeg').textContent=avgRotDeg.toFixed(1)+'°';
  $('pMaxDeg').textContent=maxRot.toFixed(0)+'°';
  $('pAvgChord').textContent=fmtCm(avgChordCm)+' avg chord · '+fmtCm(totalChordCm)+' total';

  $('prodBreakdown').innerHTML=
    `<strong>Rotation:</strong> ${fmtTime(rotTimeSec)} &nbsp;·&nbsp; `+
    `<strong>Thread feed:</strong> ${fmtTime(feedTimeSec)} &nbsp;·&nbsp; `+
    `<strong>Nail dwell:</strong> ${fmtTime(dwellTimeSec)}<br>`+
    `Board: ⌀${diam}cm · ${N} nails · ${lines.toLocaleString()} moves`;
}

// Re-calculate when any machine param changes
['physDiam','mSpeed','mFeed','mDwell','nailDiam'].forEach(id=>{
  $(id).addEventListener('input',()=>updateProdTime());
  $(id).addEventListener('change',()=>updateProdTime());
});

// ══════════════════════════════════════════
//  BACK ALLOWED ALGORITHM
//  Chunked async — runs in small batches with setTimeout between,
//  so the browser stays responsive and shows live canvas updates.
// ══════════════════════════════════════════
function runBackAllowed(img,nails,N,maxL,minG,fade,sz,onDone){
  const lc=buildLC(nails,N,minG,sz);
  const err=new Float32Array(img);
  const maxSkipVal=parseInt($('maxSkip').value)||999;
  const routePenalty=parseFloat($('routePen').value)||0;
  const PENALTY_WINDOW=10;
  const lastVisit=new Int32Array(N).fill(-999);
  const result=[];
  const CHUNK=40; // strings per chunk before yielding to browser

  function doChunk(iter){
    const end=Math.min(iter+CHUNK,maxL);
    for(;iter<end;iter++){
      let bestScore=-1,bestA=-1,bestB=-1;
      const stride=Math.max(1,Math.floor(N/180));
      for(let a=0;a<N;a+=stride){
        const ageA=iter-lastVisit[a];
        const penA=ageA<PENALTY_WINDOW?(ageA/PENALTY_WINDOW):1;
        if(penA<0.05) continue;
        const maxJ=Math.min(N/2, maxSkipVal===999?N/2:maxSkipVal);
        for(let j=minG;j<=maxJ;j++){
          const b=(a+j)%N;
          const px=getLine(lc,a,b);
          if(!px||!px.length) continue;
          let sum=0;
          for(let k=0;k<px.length;k++) sum+=err[px[k]];
          let score=(sum/px.length)*penA;
          const ageB=iter-lastVisit[b];
          if(ageB<PENALTY_WINDOW) score*=(ageB/PENALTY_WINDOW);
          if(routePenalty>0) score*=(1-(routePenalty/100)*(j/N));
          if(score>bestScore){bestScore=score;bestA=a;bestB=b;}
        }
      }
      if(bestA<0||bestScore<0.002){iter=maxL;break;}
      result.push(bestA,bestB);
      const px=getLine(lc,bestA,bestB);
      for(let k=0;k<px.length;k++) err[px[k]]=Math.max(0,err[px[k]]-fade/500);
      lastVisit[bestA]=iter;
      lastVisit[bestB]=iter;
    }

    // Update progress bar and live preview
    const pct=Math.min(100,Math.round((iter/maxL)*88)+5);
    const backPct=Math.round(iter/maxL*100);
    prog(pct, `Back: ${result.length/2|0} strings · ${backPct}%`);
    // Update Back tab with flashing progress
    const backTab=$('algoTabBack');
    if(backTab){
      backTab.classList.add('back-running');
      backTab.setAttribute('data-pct',backPct+'%');
    }

    // Show live preview only when on Back tab (don't corrupt Front result)
    if(result.length>=2 && G.algo==='back'){
      const tempTotal=result.length/2|0;
      const saved=PB.total;
      G.nails=result; G.nailPos=nails; G.imgSz=sz; G.done=true;
      PB.total=tempTotal;
      pbRender(tempTotal,false);
      G.done=false; // still generating
      PB.total=saved;
    }

    if(!G.running){onDone(result,err,lc);return;} // cancelled
    if(iter>=maxL){onDone(result,err,lc);return;}
    setTimeout(()=>doChunk(iter),0);
  }

  doChunk(0);
  // Return null — result delivered via callback when done
  return null;
}
