// ══════════════════════════════════════════
//  WIND TAB
//  Tap-to-advance hand-winding guide.
//  Uses G.nails + G.nailPos from current result.
// ══════════════════════════════════════════

// Extend WD with new state (WD object declared in sa-globals.js)
WD.playing  = false;
WD.speed    = 5000;   // ms between auto-advance steps (3000–15000)
WD.playTimer= null;
WD.voice    = 'he';   // 'he' | 'en' | 'off' — Hebrew is default
WD.artName  = '';     // artwork name shown in overlay
WD.fileName = '';     // original .txt filename (used for re-save without prompt)
WD.fileHandle = null; // FileSystemFileHandle for silent overwrite (PC Chrome)
WD._keepPos = false;  // when true, windInit skips resetting pos
WD._heAudio = null;   // current Hebrew audio element

function windInit(){
  windPause();
  if(!G.nails||G.nails.length<2) return;
  if(!WD._keepPos) WD.pos=0;
  WD._keepPos=false;
  // Reset scrubber so it doesn't show old playback position
  const total = G.nails.length-1;
  if($('pbSlider')){ $('pbSlider').max=total; $('pbSlider').value=0; }
  if($('pbCount')) $('pbCount').textContent = '0 of '+total+' lines';
  // defer so display:block has taken effect before we read clientWidth
  requestAnimationFrame(()=>requestAnimationFrame(windRender));
}

function windBack(){
  windPause();
  if(WD.pos > 0) WD.pos--;
  windRender();
}

function windAdvance(){
  if(!G.nails||G.nails.length<2) return;
  const total = G.nails.length-1;
  if(WD.pos < total){ WD.pos++; windRender(); windSpeak(G.nails[WD.pos]); }
}

function windRender(){
  if(!G.nails||!G.nailPos) return;
  const cvWind = $('cvWind');
  if(!cvWind) return;

  const nails = G.nailPos, sz = G.imgSz;
  const SZ = SVG_SZ, sc = SZ/sz;
  const total = G.nails.length-1;
  const n = WD.pos;

  // Size exactly like the result SVG
  applySvgSize(cvWind, G.zoom);
  const maxSz = Math.min($('cWrap').clientWidth, $('cWrap').clientHeight)-40;
  cvWind.setAttribute('viewBox', `0 0 ${SZ} ${SZ}`);

  // Build past strings (dim)
  const thickPx = parseFloat($('st').value);
  const thickVB = Math.min(0.4, thickPx*(SZ/Math.max(200,maxSz)));
  const col = G.color;
  const [r,g,b] = hexRgb(col);
  const opacity = Math.min(0.85, Math.max(0.06, 750/Math.max(1,total))).toFixed(3);

  let pastLines = '';
  for(let i=0; i<n-1; i++){
    const ai=G.nails[i], bi=G.nails[i+1];
    if(bi===undefined) break;
    pastLines += `M${(nails[ai].x*sc).toFixed(2)},${(nails[ai].y*sc).toFixed(2)}L${(nails[bi].x*sc).toFixed(2)},${(nails[bi].y*sc).toFixed(2)}`;
  }

  // Current string = red, thicker
  let currentLine = '';
  if(n >= 1){
    const ai=G.nails[n-1], bi=G.nails[n];
    if(bi!==undefined){
      currentLine = `<path d="M${(nails[ai].x*sc).toFixed(2)},${(nails[ai].y*sc).toFixed(2)}L${(nails[bi].x*sc).toFixed(2)},${(nails[bi].y*sc).toFixed(2)}" fill="none" stroke="rgba(220,40,40,0.95)" stroke-width="${(thickVB*2.5).toFixed(3)}" stroke-linecap="round"/>`;
    }
  }

  // Nail dots
  let nailDots = '';
  nails.forEach(nail=>{
    nailDots += `<circle cx="${(nail.x*sc).toFixed(1)}" cy="${(nail.y*sc).toFixed(1)}" r="2.2" fill="rgba(0,0,0,0.25)"/>`;
  });
  // Highlight current nail and next nail
  if(n >= 1 && G.nails[n]!==undefined){
    const cur = nails[G.nails[n]];
    nailDots += `<circle cx="${(cur.x*sc).toFixed(1)}" cy="${(cur.y*sc).toFixed(1)}" r="5" fill="rgba(220,40,40,0.9)" stroke="#fff" stroke-width="1.5"/>`;
  }

  cvWind.innerHTML =
    `<defs><clipPath id="cpWind"><circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}"/></clipPath></defs>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2}" fill="#ffffff"/>`+
    `<g clip-path="url(#cpWind)">`+
      (pastLines ? `<path d="${pastLines}" fill="none" stroke="rgba(${r},${g},${b},${opacity})" stroke-width="${thickVB.toFixed(3)}" stroke-linecap="round"/>` : '')+
      currentLine+
      nailDots+
    `</g>`+
    `<circle cx="${SZ/2}" cy="${SZ/2}" r="${SZ/2-1}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1.5"/>`;

  // Update scrubber
  const slider = $('pbSlider');
  if(slider){ slider.max = total; slider.value = n; }
  if($('pbCount')) $('pbCount').textContent = n + ' of ' + total + ' lines';

  // Big nail number — show next nail to go to
  const nextNail = G.nails[n]; // next nail to wrap to
  const numEl = $('windNailNum');
  if(numEl){
    if(n < total && nextNail !== undefined){
      numEl.textContent = nextNail;
      numEl.style.display = 'block';
    } else if(n >= total){
      numEl.textContent = '✓';
      numEl.style.display = 'block';
    } else {
      numEl.textContent = G.nails[0]; // show starting nail
      numEl.style.display = 'block';
    }
  }

  // Step info
  const infoEl = $('windStepInfo');
  if(infoEl) infoEl.textContent = `Step ${n} / ${total}`;
}

// Click on step counter → prompt to jump to step
$('windStepInfo').addEventListener('click', e=>{
  e.stopPropagation();
  const total = G.nails.length - 1;
  const infoEl = $('windStepInfo');
  // Replace text with inline input
  infoEl.innerHTML = '';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.min = 0;
  inp.max = total;
  inp.value = WD.pos;
  inp.inputMode = 'numeric';
  inp.style.cssText = 'width:90px;font-size:inherit;font-family:inherit;font-weight:700;color:#fff;background:transparent;border:none;border-bottom:2px solid rgba(255,255,255,0.7);outline:none;text-align:center;letter-spacing:0.02em;';
  infoEl.appendChild(inp);
  inp.select();
  const commit = ()=>{
    const v = parseInt(inp.value);
    if(!isNaN(v)){
      WD.pos = Math.max(0, Math.min(total, v));
      windRender();
    }
    infoEl.textContent = `Step ${WD.pos} / ${total}`;
  };
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key==='Escape') commit(); });
  inp.addEventListener('blur', commit);
});

// Tap/click on wind SVG → advance (delegated from cWrap so it works regardless of display state at load)
$('cWrap').addEventListener('click', e=>{
  if(G.view!=='wind') return;
  windAdvance();
});
$('cWrap').addEventListener('touchend', e=>{
  if(G.view!=='wind') return;
  e.preventDefault();
  windAdvance();
}, {passive:false});

// Show Wind tab after generation
function showWindTab(){
  const btn = $('vmW');
  if(btn) btn.style.display = '';
  // Also show on mobile bar
  const b = $('mbtWind');
  if(b) b.style.display = '';
}

// ══ WIND: AUTO-PLAY + VOICE + LOAD/SAVE ══

function windPlayToggle(){
  if(WD.playing) windPause(); else windPlay();
}

function windPlay(){
  if(!G.nails||G.nails.length<2) return;
  const total=G.nails.length-1;
  if(WD.pos>=total) WD.pos=0; // restart if at end
  WD.playing=true;
  _windUpdatePlayBtn();
  _windScheduleNext();
}

function windPause(){
  WD.playing=false;
  clearTimeout(WD.playTimer);
  _windUpdatePlayBtn();
}

function _windScheduleNext(){
  if(!WD.playing) return;
  WD.playTimer=setTimeout(()=>{
    if(!WD.playing) return;
    const total=G.nails.length-1;
    if(WD.pos<total){
      WD.pos++;
      windRender();
      windSpeak(G.nails[WD.pos]);
      _windScheduleNext();
    } else {
      windPause(); // finished
    }
  }, WD.speed);
}

function _windUpdatePlayBtn(){
  const btn=$('windPlayBtn');
  if(btn) btn.textContent=WD.playing?'⏸':'▶';
}

// ── Speed ──
function windSetSpeed(secs){
  WD.speed=secs*1000;
  const lbl=$('windSpeedLabel');
  if(lbl) lbl.textContent=secs+'s';
  // Reschedule immediately if already playing
  if(WD.playing){ clearTimeout(WD.playTimer); _windScheduleNext(); }
}

// ── Voice ──
function windVoiceToggle(){
  const order=['he','en','off'];
  WD.voice=order[(order.indexOf(WD.voice)+1)%3];
  _windUpdateVoiceBtn();
}

function _windUpdateVoiceBtn(){
  const btn=$('windVoiceBtn');
  if(!btn) return;
  const labels={off:'🔇 Off',en:'🔊 EN',he:'🔊 HE'};
  btn.textContent=labels[WD.voice];
}

function windSpeak(num){
  if(WD.voice==='off') return;
  if(WD.voice==='he'){
    // Hebrew via Google Translate TTS — works cross-platform without any voice install
    if(WD._heAudio){ WD._heAudio.pause(); WD._heAudio.src=''; }
    WD._heAudio=new Audio('https://translate.googleapis.com/translate_tts?ie=UTF-8&q='+encodeURIComponent(String(num))+'&tl=he&client=gtx&ttsspeed=0.7');
    WD._heAudio.play().catch(()=>{});
  } else {
    // English via Web Speech API
    if(!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(String(num));
    u.lang='en-US'; u.rate=0.85;
    speechSynthesis.speak(u);
  }
}

// ── Load wind file ──
function _parseWindFile(text){
  const lines=text.split('\n');
  let N=0, artName='', savedStep=0;
  const nails=[];
  for(const line of lines){
    const l=line.trim();
    if(!l) continue;
    const mN=l.match(/^Nails:\s*(\d+)/i);
    if(mN){ N=parseInt(mN[1]); continue; }
    const mA=l.match(/^Artwork:\s*(.+)/i);
    if(mA){ artName=mA[1].trim(); continue; }
    const mS=l.match(/^Step:\s*(\d+)/i);
    if(mS){ savedStep=parseInt(mS[1]); continue; }
    const mNum=l.match(/^(\d+)/);
    if(mNum) nails.push(parseInt(mNum[1]));
  }
  if(!N&&nails.length) N=Math.max(...nails)+1;
  return {N, artName, savedStep, nails};
}

function loadWindFile(file){
  const rd=new FileReader();
  rd.onload=e=>{
    const {N, artName, savedStep, nails}=_parseWindFile(e.target.result);
    if(!nails.length){ alert('No nail sequence found in file.'); return; }
    G.nails=nails;
    G.nailPos=makeNails(N,500);
    G.imgSz=500;
    G.algo='greedy';
    G.done=true;
    G.img=null; G.bw=null; G.imgPx=null; G.errPx=null;
    G.windOnly=true;
    document.body.classList.add('no-img');
    WD.artName=artName||file.name.replace(/\.[^.]+$/,'');
    WD.fileName=file.name; // remember filename for re-save
    // Show filename at top of circle
    if($('windArtName')){ $('windArtName').textContent=WD.artName; $('windArtName').style.display='block'; }
    // Restore saved step position if present
    WD.pos=savedStep||0;
    WD._keepPos=true;
    // Mark body as wind-only (grays result/error tabs via CSS, image tab stays clickable)
    document.body.classList.add('wind-only');
    showWindTab();
    setView('wind');
    // Brief confirmation toast
    const msg=document.createElement('div');
    msg.textContent=`✓ Loaded ${nails.length-1} lines · ${N} nails · "${WD.artName}"`;
    msg.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.85);color:#fff;padding:10px 20px;border-radius:24px;font-family:Inter,sans-serif;font-size:0.85rem;z-index:9999;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(msg);
    setTimeout(()=>msg.remove(),3000);
  };
  rd.readAsText(file);
}

// ── Wind Find ──
const WF = { hits: [], idx: -1 };

function _windFindSearch(){
  const a = parseInt($('windFindA').value);
  const b = parseInt($('windFindB').value);
  if(isNaN(a) || isNaN(b)){ $('windFindStatus').textContent = 'Enter both nail numbers.'; return false; }
  const nails = G.nails;
  WF.hits = [];
  for(let i = 0; i < nails.length - 1; i++){
    if(nails[i] === a && nails[i+1] === b) WF.hits.push(i+1); // pos = step reaching nail b
  }
  WF.idx = -1;
  if(!WF.hits.length){ $('windFindStatus').textContent = `No match for ${a} → ${b}`; return false; }
  return true;
}

function windFindOpen(){
  $('windFindPanel').style.display = 'block';
  $('windFindA').focus();
  WF.hits = []; WF.idx = -1;
  $('windFindStatus').textContent = '';
  [$('windFindA'),$('windFindB')].forEach(inp=>{
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') windFindNext(); }, {once:false});
  });
}

function windFindClose(){
  $('windFindPanel').style.display = 'none';
  WF.hits = []; WF.idx = -1;
}

function windFindNext(){
  if(!_windFindSearch() && !WF.hits.length) return;
  if(!WF.hits.length) return;
  WF.idx = (WF.idx + 1) % WF.hits.length;
  WD.pos = WF.hits[WF.idx];
  windRender();
  $('windFindStatus').textContent = `Match ${WF.idx + 1} of ${WF.hits.length} (step ${WD.pos})`;
}

function windFindPrev(){
  if(!WF.hits.length && !_windFindSearch()) return;
  if(!WF.hits.length) return;
  WF.idx = (WF.idx - 1 + WF.hits.length) % WF.hits.length;
  WD.pos = WF.hits[WF.idx];
  windRender();
  $('windFindStatus').textContent = `Match ${WF.idx + 1} of ${WF.hits.length} (step ${WD.pos})`;
}
