// ══════════════════════════
//  GLOBALS — defined before all other scripts
// ══════════════════════════

// Playback state — declared first so pbInit() can always access it
var PB={
  playing:false,
  frame:null,
  pos:0,
  total:0,
  backView:false, // updated per-algo in pbInit
  lastTime:0,
  speed:1,          // current speed multiplier (1–200)
};

const G={
  img:null,bw:false,cropOffX:0,cropOffY:0,cropZoom:1,cropRot:0,circleSize:0,
  nails:[],imgPx:null,errPx:null,imgSz:0,nailPos:null,
  color:'#111111',algo:'greedy',showNails:true,
  view:'image',zoom:1,done:false,running:false,showSeq:true,
  imgName:'',windOnly:false,
  compareMode:false,comparePct:50,greedyCv:null,radonCv:null,
  // Result cache — keyed by algo+image+params so switching algo reuses stored result
  cache:{greedy:null,back:null},
  // For rollback
  prevParams:null,prevNails:null,prevErr:null,
  // Accuracy score
  score:null,prevScore:null,
  // White background
};

const $=id=>document.getElementById(id);
const cvSvg=$('cvSvg'),cvRaster=$('cvRaster'),off=$('off'),cvCmpSvg=$('cvCmpSvg');
const BG='#f7f5f0';
const SVG_SZ=600; // internal coordinate space for SVG viewBox

// Wind state — referenced by sa-wind.js and sa-export.js
const WD = { pos: 0 }; // current step (0 = no strings drawn yet)

// Placeholder nails
(()=>{const r=$('phr');if(!r)return;for(let i=0;i<40;i++){const a=(i/40)*Math.PI*2-Math.PI/2,d=document.createElement('div');d.className='ph-nail';d.style.left=(50+49*Math.cos(a))+'%';d.style.top=(50+49*Math.sin(a))+'%';d.style.animationDelay=(i*63)+'ms';r.appendChild(d);}})();

// Config for each param: slider id, display id, min, max, step, isFloat, regenType
const PARAM_CFG=[
  {s:'sn',v:'vn',min:50,max:400,step:5,float:false,regen:'full',def:320},
  {s:'sl',v:'vl',min:500,max:8000,step:100,float:false,regen:'full',def:5600},
  {s:'sf',v:'vf',min:5,max:80,step:1,float:false,regen:'full',def:35},
  {s:'sg',v:'vg',min:3,max:80,step:1,float:false,regen:'full',def:20},
  {s:'st',v:'vt',min:0.05,max:0.7,step:0.05,float:true,regen:'render',def:0.4},
  {s:'snB',v:'vnB',min:50,max:400,step:5,float:false,regen:'full',def:320},
  {s:'slB',v:'vlB',min:500,max:8000,step:100,float:false,regen:'full',def:5600},
  {s:'sfB',v:'vfB',min:5,max:80,step:1,float:false,regen:'full',def:35},
  {s:'sgB',v:'vgB',min:3,max:80,step:1,float:false,regen:'full',def:20},
  {s:'stB',v:'vtB',min:0.05,max:0.7,step:0.05,float:true,regen:'render',def:0.4},
];

// cWrapEl used across multiple files
const cWrapEl=$('cWrap');
