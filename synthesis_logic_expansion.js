/* ===== SYNTHESIS LOGIC CORE (drop-in) =====
   Paste as a NEW <script>...</script> block at the very end of the page, just before </body>.
   It wraps the existing voice() renderer, so keyboard, sequencer, audition and atlas all use it. */
(function(){'use strict';
const DEF=()=>({on:true,unison:3,spread:30,sub:15,noise:0,keytrack:50,velCut:40,velAmp:60,drift:5,glide:0,sat:12,lfo2:4.5,
 mod:[{src:'lfo2',dst:'cutoff',amt:12},{src:'env',dst:'pitch',amt:0},{src:'vel',dst:'index',amt:0},{src:'rand',dst:'pan',amt:0}]});
const lg=()=>{const d=DEF(),s=state.logic;if(!s||typeof s!=='object')state.logic=d;else{for(const k in d)if(s[k]===undefined)s[k]=d[k];if(!Array.isArray(s.mod)||s.mod.length!==4)s.mod=d.mod}return state.logic};
lg();
const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),last=new Map(),prev=voice;
let nb=null,nbCtx=null;
const noise=c=>{if(!nb||nbCtx!==c){nbCtx=c;nb=c.createBuffer(1,c.sampleRate,c.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}return nb};
const foldCurve=a=>{const n=2048,r=new Float32Array(n);for(let i=0;i<n;i++){const x=i*2/(n-1)-1;r[i]=Math.sin(x*Math.PI*(.5+a*3.5))}return r};
const wave=(c,fn,N=32)=>{const re=new Float32Array(N+1),im=new Float32Array(N+1);for(let h=1;h<=N;h++)im[h]=fn(h);return c.createPeriodicWave(re,im)};

voice=function(type,midi,start,dur,dest,vel=1,edit=null){
 const L=lg();if(!L.on||!ctx)return prev(type,midi,start,dur,dest,vel,edit);
 const c=ctx,E=(k,d)=>edit&&edit[k]!==undefined?edit[k]:d;
 dur=Math.max(.05,dur);const end=start+dur,note=midi+E('transpose',0),f=440*2**((note-69)/12);
 const rel=.01+E('release',25)/100*3,stop=end+rel+.1;
 const nodes=[],src=[],P={pitch:[],cutoff:[],amp:[],pan:[],index:[],drive:[]},N=g=>(nodes.push(g),g);
 const mix=N(c.createGain()),filt=N(c.createBiquadFilter()),trem=N(c.createGain()),env=N(c.createGain()),pan=N(c.createStereoPanner());
 // glide: slide from the previous pitch played into this destination
 const from=last.get(dest),gt=(type===0?Math.max(.05,L.glide/100*.4):L.glide/100*.4);last.set(dest,note);
 const O=(w,hz,gain,dst=mix,cents=0)=>{const o=c.createOscillator();if(typeof w==='string')o.type=w;else o.setPeriodicWave(w);
  if(dst===mix&&from!==undefined&&gt>.005){o.frequency.setValueAtTime(Math.max(5,440*2**((from-69)/12)*(hz/f)),start);o.frequency.exponentialRampToValueAtTime(Math.max(5,hz),start+gt)}else o.frequency.setValueAtTime(Math.max(5,hz),start);
  if(dst===mix){const d=(Math.random()*2-1)*L.drift;o.detune.setValueAtTime(cents+d,start);o.detune.linearRampToValueAtTime(cents+(Math.random()*2-1)*L.drift,end);P.pitch.push(o.detune)}
  const g=N(c.createGain());g.gain.value=gain;o.connect(g);g.connect(dst);o.start(start);o.stop(stop);src.push(o);return o};
 const uni=[2,5,6].includes(type)?1:cl(Math.round(L.unison),1,7),ug=1/Math.sqrt(uni);
 const unison=(w,hz,gain,dst)=>{for(let i=0;i<uni;i++)O(w,hz,gain*ug,dst,uni>1?(i/(uni-1)-.5)*2*L.spread:0)};
 const w1=E('wave1','sawtooth'),w2=E('wave2','sine'),m2=E('mix',30)/100,ratio=E('ratio',2),idx=E('index',35)/100;
 let acid2=null;
 switch(type){
 case 0:{unison(w1,f,1-m2*.5);unison('square',f,.35*(1+m2),mix);acid2=N(c.createBiquadFilter());break}                       // 303-style: saw+square, 24 dB resonant ladder, slide
 case 1:{unison(w1,f,1);unison(w2==='sine'?'triangle':w2,f*1.003,m2);O('sine',f/2,.0,mix);break}                          // hybrid subtractive: supersaw + partner
 case 2:{const car=O('sine',f,1),r=N(c.createGain());                                                                      // 3-operator FM stack: op3 -> op2 -> carrier
  const o2=O('sine',f*ratio,0,r),g2=N(c.createGain()),o3=O('sine',f*ratio*.5,0,r),g3=N(c.createGain());
  o2.disconnect();o3.disconnect();const m1=c.createGain();g2.gain.setValueAtTime(f*ratio*idx*3,start);g2.gain.exponentialRampToValueAtTime(Math.max(1,f*.05),start+dur);
  g3.gain.value=f*ratio*idx*1.2;o3.connect(g3);g3.connect(o2.frequency);o2.connect(g2);g2.connect(car.frequency);P.index.push(g2.gain);break}
 case 3:{const pre=N(c.createGain()),sh=N(c.createWaveShaper()),a=E('pd',30)/100;sh.curve=foldCurve(a);sh.oversample='4x';                // wavefolder with envelope-driven fold depth
  pre.gain.setValueAtTime(1+a*6,start);pre.gain.exponentialRampToValueAtTime(1+a*1.5,start+Math.min(dur,1.2));pre.connect(sh);sh.connect(mix);P.drive.push(pre.gain);
  for(let i=0;i<uni;i++)O(w1==='sawtooth'?'triangle':w1,f,ug,pre,0);O('sine',f*2.01,.15,pre);break}
 case 4:{const A=E('wtEnabled','off')==='on'?wave(c,h=>h<=8?Math.max(1e-5,(E('wtH'+h,100)/100)):0):wave(c,h=>1/h),B=wave(c,h=>h%2?1/h:0);   // morphing PeriodicWave tables
  const m0=E('wtMorph',0)/100,m1=cl(m0+.55,0,1),oa=[],gb=[];for(let i=0;i<uni;i++){const cents=uni>1?(i/(uni-1)-.5)*2*L.spread:0;
   const ga=N(c.createGain()),gB=N(c.createGain());ga.gain.setValueAtTime(1-m0,start);ga.gain.linearRampToValueAtTime(1-m1,end);gB.gain.setValueAtTime(m0,start);gB.gain.linearRampToValueAtTime(m1,end);
   ga.connect(mix);gB.connect(mix);O(A,f,ug,ga,0).detune.value=cents;O(B,f,ug,gB,0).detune.value=cents}break}
 case 5:{const ex=c.createBufferSource(),eg=N(c.createGain()),dl=N(c.createDelay(.2)),damp=N(c.createBiquadFilter()),fb=N(c.createGain());     // Karplus-Strong string
  ex.buffer=noise(c);ex.loop=true;ex.connect(eg);eg.gain.setValueAtTime(vel,start);eg.gain.linearRampToValueAtTime(0,start+Math.min(.012,1/f*2));
  dl.delayTime.value=Math.min(.19,Math.max(.0005,1/f-.0003));damp.type='lowpass';damp.frequency.value=cl(f*(4+E('cutoff',85)/12),400,16000);
  fb.gain.value=Math.min(.997,.965+E('release',25)/100*.03+E('combFeedback',25)/100*.002);eg.connect(dl);dl.connect(damp);damp.connect(fb);fb.connect(dl);dl.connect(mix);
  ex.start(start);ex.stop(stop);src.push(ex);break}
 case 6:{const B=E('index',0)/20000,odd=E('wtOdd',50)/100;for(let h=1;h<=16;h++){const hz=f*h*Math.sqrt(1+B*h*h);if(hz>18000)break;       // 16-partial additive, per-partial decay + inharmonic stretch
   const pg=N(c.createGain()),a=(1/Math.pow(h,1.1))*(h%2?.5+odd:1.5-odd);pg.gain.setValueAtTime(a,start);pg.gain.exponentialRampToValueAtTime(Math.max(.0005,a*.05),start+dur*(.4+1.6/Math.sqrt(h))+.1);pg.connect(mix);O('sine',hz,1,pg)}break}
 case 7:{const a=O(w1==='sawtooth'?'sine':w1,f,.5),b=O('sine',f*ratio,0,mix),rg=N(c.createGain()),fm=N(c.createGain());                        // cross-modulation: ring mod + FM both directions
  b.disconnect();rg.gain.value=0;b.connect(rg.gain);fm.gain.value=f*idx*2;b.connect(fm);fm.connect(a.frequency);P.index.push(fm.gain);
  const o=O('sine',f,0,rg,0);const og=N(c.createGain());og.gain.value=.9;rg.connect(og);og.connect(mix);o.disconnect();o.connect(rg);break}
 }
 if(type!==5){if(L.sub>0)O('sine',f/2,L.sub/100*.5);if(L.noise>0){const n=c.createBufferSource(),g=N(c.createGain());n.buffer=noise(c);n.loop=true;g.gain.value=L.noise/100*.35;n.connect(g);g.connect(mix);n.start(start);n.stop(stop);src.push(n)}}
 // filter: base cutoff x key tracking x velocity, with filter envelope
 const base=35*Math.pow(500,E('cutoff',85)/100),fr=cl(base*2**((note-60)/12*L.keytrack/100)*2**((vel-.5)*L.velCut/100*3),35,19000);
 const ft=E('filter','lowpass');filt.type=ft==='comb'?'bandpass':ft;filt.Q.value=.15+E('resonance',12)/100*(type===0?30:22);
 const att=Math.min(Math.max(.002,dur*.6),.002+E('attack',12)/100*2),dec=.005+E('decay',25)/100*2,sus=E('sustain',65)/100,ed=type===0?Math.max(E('envDepth',0),70):E('envDepth',0);
 const fset=p=>{if(ed){p.setValueAtTime(cl(fr*2**(ed/100*4),35,19000),start);p.exponentialRampToValueAtTime(fr,start+att+dec)}else p.setValueAtTime(fr,start)};
 fset(filt.frequency);P.cutoff.push(filt.detune);mix.connect(filt);let chain=filt;
 if(acid2){acid2.type='lowpass';acid2.Q.value=6;fset(acid2.frequency);P.cutoff.push(acid2.detune);filt.connect(acid2);chain=acid2}
 const peak=Math.max(.0002,.11*((1-L.velAmp/100)+L.velAmp/100*vel));
 env.gain.setValueAtTime(.0001,start);env.gain.linearRampToValueAtTime(peak,start+att);env.gain.setTargetAtTime(peak*sus,start+att,Math.max(.003,dec/3));env.gain.setValueAtTime(peak*sus,end);env.gain.exponentialRampToValueAtTime(.0001,stop);
 trem.gain.value=1;P.amp.push(trem.gain);P.pan.push(pan.pan);chain.connect(trem);trem.connect(env);
 let out=env;if(L.sat>0){const sh=N(c.createWaveShaper());sh.curve=waveShape(L.sat/100*.6);sh.oversample='2x';env.connect(sh);out=sh}
 out.connect(pan);pan.connect(dest);
 // modulation matrix: LFO2 / envelope / velocity / key / random -> pitch / cutoff / amp / pan / FM index / fold drive
 const S={},CS=v=>{const k=c.createConstantSource();k.offset.value=v;k.start(start);k.stop(stop);src.push(k);return k};
 const srcNode=n=>S[n]||(S[n]=n==='lfo2'?(()=>{const o=c.createOscillator();o.frequency.value=L.lfo2;o.start(start);o.stop(stop);src.push(o);return o})():
  n==='env'?(()=>{const k=CS(1),g=N(c.createGain());g.gain.setValueAtTime(1,start);g.gain.exponentialRampToValueAtTime(.001,start+att+dec+.4);k.connect(g);return g})():
  n==='vel'?CS(vel):n==='key'?CS((note-60)/36):CS(Math.random()*2-1));
 const SC={pitch:1200,cutoff:2400,amp:.5,pan:1,index:Math.max(1,f*2),drive:2};
 for(const m of L.mod){if(!m.amt||!P[m.dst]||!P[m.dst].length)continue;const g=N(c.createGain());g.gain.value=m.amt/100*SC[m.dst];srcNode(m.src).connect(g);P[m.dst].forEach(p=>g.connect(p))}
 nodes.push(filt,acid2);const rec={sources:src,nodes:nodes.filter(Boolean),env,tone:filt,end:stop};voices.add(rec);
 setTimeout(()=>{src.forEach(o=>{try{o.disconnect()}catch{}});rec.nodes.forEach(n=>{try{n.disconnect()}catch{}});voices.delete(rec)},Math.max(100,(stop-c.currentTime+.2)*1000));
 return rec;
};

// ---- Control panel (persists inside state.logic, so EXPORT PATCH carries it) ----
const css=document.createElement('style');css.textContent='#slc{margin:10px 0;padding:12px;border:1px solid #aa7745;border-radius:7px;background:#fff;color:#111}#slc h3{margin:0 0 6px;color:#b05200;letter-spacing:.1em;font-size:13px}#slc .g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}#slc label{font-size:10px;color:#222;display:flex;flex-direction:column;gap:2px}#slc output{font-weight:700}#slc .m{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}#slc select{background:#fff;color:#111;border:1px solid #777;padding:4px}#slc p{font-size:10px;color:#333;margin:4px 0 8px;line-height:1.5}';document.head.append(css);
const sl=[['unison','UNISON VOICES',1,7,1],['spread','UNISON SPREAD (cents)',0,100,1],['sub','SUB OSCILLATOR',0,100,1],['noise','NOISE',0,100,1],['keytrack','FILTER KEY TRACK',0,100,1],['velCut','VELOCITY → CUTOFF',0,100,1],['velAmp','VELOCITY → LEVEL',0,100,1],['drift','ANALOG DRIFT (cents)',0,30,1],['glide','GLIDE / SLIDE',0,100,1],['sat','VOICE SATURATION',0,100,1],['lfo2','MOD LFO RATE (Hz)',.05,20,.05]];
const SRC=['lfo2','env','vel','key','rand'],DST=['pitch','cutoff','amp','pan','index','drive'];
const p=document.createElement('section');p.id='slc';p.className='panel';
p.innerHTML='<h3>SYNTHESIS LOGIC CORE · ENGINE MODELS + MODULATION MATRIX</h3><p>Each engine now follows a distinct DSP model: 0 acid ladder with slide · 1 supersaw subtractive · 2 three-operator FM · 3 envelope-driven wavefolder · 4 morphing PeriodicWave tables · 5 Karplus-Strong string · 6 16-partial additive with inharmonic stretch · 7 ring + FM cross-modulation. These controls shape every voice; per-engine DSP editors still apply on top.</p><label style="flex-direction:row;gap:6px;margin-bottom:8px"><input type="checkbox" id="slc-on"> ENABLE NEW SYNTHESIS LOGIC (off = legacy voices)</label><div class="g">'+sl.map(([k,l,a,b,s])=>`<label>${l}<input type="range" data-k="${k}" min="${a}" max="${b}" step="${s}"><output></output></label>`).join('')+'</div><div class="m">'+[0,1,2,3].map(i=>`<label>MOD ${i+1}<select data-ms="${i}">${SRC.map(x=>`<option>${x}</option>`).join('')}</select><select data-md="${i}">${DST.map(x=>`<option>${x}</option>`).join('')}</select><input type="range" data-ma="${i}" min="-100" max="100" step="1"><output></output></label>`).join('')+'</div>';
document.getElementById('banks').before(p);
function sync(){const L=lg();p.querySelector('#slc-on').checked=L.on;p.querySelectorAll('[data-k]').forEach(e=>{e.value=L[e.dataset.k];e.nextElementSibling.textContent=e.value});L.mod.forEach((m,i)=>{p.querySelector(`[data-ms="${i}"]`).value=m.src;p.querySelector(`[data-md="${i}"]`).value=m.dst;const a=p.querySelector(`[data-ma="${i}"]`);a.value=m.amt;a.nextElementSibling.textContent=m.amt+'%'})}
p.addEventListener('input',e=>{const t=e.target,L=lg();if(t.dataset.k){L[t.dataset.k]=+t.value;t.nextElementSibling.textContent=t.value}else if(t.dataset.ms!==undefined)L.mod[+t.dataset.ms].src=t.value;else if(t.dataset.md!==undefined)L.mod[+t.dataset.md].dst=t.value;else if(t.dataset.ma!==undefined){L.mod[+t.dataset.ma].amt=+t.value;t.nextElementSibling.textContent=t.value+'%'}else if(t.id==='slc-on')L.on=t.checked});
p.addEventListener('change',e=>{if(e.target.id==='slc-on')lg().on=e.target.checked});
document.getElementById('file')?.addEventListener('change',()=>setTimeout(sync,250));
sync();
})();
