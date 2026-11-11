/* Kraneo — ¡A piedrazo limpio! (canvas 2D, 3 niveles + final con Horus).
   Lives inside the Kraneo tab. window.KraneoGame = {show, hide}: the loop,
   keyboard and sound only run while the game is on screen. */
(function () {
'use strict';
const root = document.getElementById('kgame');
if (!root) return;
const cv = root.querySelector('.kg-canvas'), ctx = cv.getContext('2d');
const W = 960, H = 540, GY = 468, GRAV = 1400, CAN_G = 900;
const FONT = 'Teko, Impact, sans-serif';
const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
let sc = 1, dpr = 1;
function resize(){ dpr = Math.min(window.devicePixelRatio||1, 2); const r = cv.getBoundingClientRect(); if(!r.width) return; cv.width = Math.max(1,Math.round(r.width*dpr)); cv.height = Math.max(1,Math.round(r.height*dpr)); sc = cv.width / W; }
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv); else window.addEventListener('resize', resize);

const rnd=(a,b)=>a+Math.random()*(b-a), lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pick=a=>a[Math.floor(Math.random()*a.length)];

/* ---------- Sonido (sintetizado) ---------- */
let AC=null, muted=false;
function initAudio(){ if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ AC=null; } } if(AC&&AC.state==='suspended') AC.resume(); }
function tone(f1,f2,dur,type,vol){ if(!AC||muted) return; try{ const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain(); o.type=type||'square'; o.frequency.setValueAtTime(f1,t); o.frequency.exponentialRampToValueAtTime(Math.max(30,f2),t+dur); g.gain.setValueAtTime(vol||0.07,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+dur+0.02);}catch(e){} }
function noise(dur,vol,hp){ if(!AC||muted) return; try{ const n=Math.floor(AC.sampleRate*dur), b=AC.createBuffer(1,n,AC.sampleRate), d=b.getChannelData(0); for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n); const s=AC.createBufferSource(); s.buffer=b; const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp||800; const g=AC.createGain(); g.gain.value=vol||0.12; s.connect(f); f.connect(g); g.connect(AC.destination); s.start(); }catch(e){} }
const sfx = {
  throw: ()=>noise(0.18,0.1,1600),
  hit:   ()=>{ tone(320,90,0.18,'square',0.09); noise(0.12,0.14,350); },
  cube:  ()=>tone(900,180,0.12,'sawtooth',0.05),
  hurt:  ()=>tone(220,55,0.4,'sawtooth',0.1),
  glitch:()=>{ for(let i=0;i<6;i++) setTimeout(()=>tone(rnd(200,1800),rnd(100,1800),0.05,'square',0.05), i*55); },
  fire:  ()=>tone(620,300,0.08,'triangle',0.05),
  jump:  ()=>tone(300,620,0.12,'triangle',0.06),
  duck:  ()=>tone(260,140,0.08,'triangle',0.05),
  land:  ()=>noise(0.06,0.06,300),
  ko:    ()=>{ tone(440,110,0.6,'square',0.1); setTimeout(()=>tone(660,990,0.45,'square',0.08),320); },
  lose:  ()=>tone(500,80,0.9,'sawtooth',0.08),
  crate: ()=>{ noise(0.08,0.16,200); tone(150,70,0.1,'square',0.06); },
  crack: ()=>{ noise(0.25,0.2,300); tone(200,60,0.2,'sawtooth',0.06); },
  coin:  ()=>{ tone(988,988,0.08,'square',0.06); setTimeout(()=>tone(1319,1319,0.2,'square',0.06),80); },
  snatch:()=>tone(900,180,0.25,'sawtooth',0.07),
  can:   ()=>tone(500,250,0.1,'triangle',0.05),
  splash:()=>noise(0.15,0.1,900),
  win:   ()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,f,0.18,'square',0.07),i*120))
};

let best=0; try{ best = +localStorage.getItem('kraneo_piedrazos_best') || 0; }catch(e){}
function saveBest(){
  if(S.score>best){ best=S.score; S.newBest=true; try{ localStorage.setItem('kraneo_piedrazos_best', best); }catch(e){} }
  // the page saves it in the ranking when the player is signed in
  try{ window.dispatchEvent(new CustomEvent('kraneo:result', {detail:{score:S.score, level:S.level, levelWon: S.state==='win' ? S.level : null}})); }catch(e){}
}

/* ---------- Sprite pixelado de Glitchy (mira a la izquierda) ---------- */
const GW=28, GH=20, gmap=[];
for(let r=0;r<GH;r++) gmap.push(new Array(GW).fill('.'));
for(let r=0;r<GH;r++) for(let c=0;c<GW;c++){ const dx=(c-15)/9.5, dy=(r-9.5)/7.5; if(dx*dx+dy*dy<=1) gmap[r][c] = r>=14 ? 'D' : 'P'; }
for(let r=3;r<=4;r++) for(let c=18;c<=21;c++) gmap[r][c]='L';
for(let r=8;r<=12;r++) for(let c=24;c<=27;c++) gmap[r][c] = (c%2===0)?'T':'U';
for(let r=9;r<=12;r++) for(let c=0;c<=7;c++){ if(c===0&&(r===9||r===12)) continue; gmap[r][c] = r===9?'b':'B'; }
gmap[10][2]='n'; gmap[10][4]='n';
gmap[13][3]='W'; gmap[14][3]='W'; gmap[13][6]='W'; gmap[14][6]='W';
for(let r=4;r<=7;r++){ for(let c=9;c<=11;c++) gmap[r][c]='Y'; for(let c=14;c<=16;c++) gmap[r][c]='Y'; }
gmap[5][10]='K'; gmap[6][10]='K'; gmap[5][15]='K'; gmap[6][15]='K';
gmap[3][9]='K'; gmap[3][10]='K'; gmap[4][11]='K'; gmap[4][14]='K'; gmap[3][15]='K'; gmap[3][16]='K';
for(let r=17;r<=18;r++){ for(let c=9;c<=12;c++) gmap[r][c]='F'; for(let c=17;c<=20;c++) gmap[r][c]='F'; }
const GCOL={P:'#7B4DFF',D:'#5B32D6',L:'#A88BFF',B:'#3A2D9C',b:'#4D3FC4',n:'#1d1550',Y:'#FFD52A',K:'#0a0a0f',W:'#F4F0E6',T:'#5B32D6',U:'#3A2D9C',F:'#3A2D9C'};

/* ---------- Estado ---------- */
const S={state:'menu',level:1,t:0,score:0,lvlScore:0,combo:0,lives:3,hp:12,maxHp:12,shake:0,lagT:0,glitchT:0,endT:0,introT:0,snatched:false,hidden:false,newBest:false};
const K={x:150,jy:0,vy:0,onG:true,cr:0,duckKey:false,duckBtn:false,lk:false,rk:false,lb:false,rb:false,moving:false,walkPh:0,hasCtrl:true,throwing:-1,aimAng:-0.5,hurt:0,stunT:0,jaw:0,say:null,sayT:0,holdCat:false};
const G={x:760,y:250,tx:760,ty:250,hit:0,fireT:2.2,moveT:1,teleT:6,say:null,sayT:0,dead:false,rot:0,vy:0,dash:0,tauntT:4,mouth:0};
const C={x:1040,hop:0,tx:760,mode:'intro',stun:0,hit:0,throwT:2,throwAnim:0,moveT:1,say:null,sayT:0,tauntT:4,hold:false,ph:0,moving:false,target:null};
const D={x:905,say:null,sayT:0,cane:0,waveT:4};
// Horus, el gato de Kraneo (premio de Don Pig)
const HOR={x:830,y:GY,mode:'cage',ph:0,jt:0,sx:830,miauT:6,cage:0};
const E={s1:0,s2:0,s3:0,heldT:0,heartT:0,purrT:0};
const R={list:[],n:0,cur:null,opts:[],correct:0,phase:'ask',timer:15,resT:0,chosen:-1,drop:0,swing:0,amp:0.06,marks:[]};
let stones=[], cubes=[], parts=[], texts=[], crates=[], cans=[], waves=[], pickup=null, aim=null, cool=0;

/* Acertijos de Don Pig: la primera opción es la correcta (se barajan al mostrarlas) */
const RIDDLES=[
  {q:'Tengo dientes pero no muerdo, y peino sin tener pelo. ¿Qué soy?', o:['El peine','El tenedor','Kraneo']},
  {q:'Cuanto más le quitas, más grande se hace. ¿Qué es?', o:['Un hueco','Una piedra','Un globo']},
  {q:'Si me nombras, desaparezco. ¿Qué soy?', o:['El silencio','El lag','La sombra']},
  {q:'Mientras más se seca, más moja. ¿Qué es?', o:['La toalla','La esponja','Un energizante']},
  {q:'En un torneo de 8 jugadores cada partida elimina a uno. ¿Cuántas partidas hacen falta para tener campeón?', o:['7','8','4']},
  {q:'¿Qué pesa más: un kilo de piedras o un kilo de plumas?', o:['Pesan igual','Las piedras','Las plumas']},
  {q:'Kraneo es puro hueso. ¿Cuántos huesos tiene un esqueleto humano adulto?', o:['206','120','312']},
  {q:'Sube y baja, pero nunca se mueve de su sitio. ¿Qué es?', o:['La escalera','El ascensor','Una pelota']},
  {q:'El papá de Ana tiene cinco hijas: Lala, Lele, Lili y Lolo. ¿Cómo se llama la quinta?', o:['Ana','Lulú','Lala']},
  {q:'En una carrera adelantas al que va de segundo. ¿En qué puesto quedas?', o:['Segundo','Primero','Tercero']},
  {q:'Un gallo pone un huevo en la punta del techo. ¿Hacia qué lado cae?', o:['Los gallos no ponen huevos','A la izquierda','A la derecha']},
  {q:'¿Cuántos meses del año tienen 28 días?', o:['Todos','Solo febrero','Ninguno']},
  {q:'Vuelo sin alas y lloro sin ojos. ¿Qué soy?', o:['La nube','Glitchy','Un murciélago']}
];
const PLAQ_X=[370,540,710], PIV_Y=196, PLAQ_W=150, PLAQ_H=64;
const pile=[]; for(let i=0;i<9;i++) pile.push({x:rnd(30,80),y:GY-rnd(2,18)+(i<5?0:-8),rx:rnd(7,12),ry:rnd(5,8),c:pick(['#6f6f78','#85858e','#5d5d66'])});

const TAUNTS=['je je je…','¡LAG!','¿Ping de 999?','Fallaste, huesitos','Reconectando… mentira','¡Tu wifi da pena!'];
const HITWORDS=['¡TOMA!','¡PIEDRAZO!','¡ZAS!','¡CRACK!','¡EN TODO EL PICO!'];
const L2TAUNTS=['¿Dormir? Eso es para los que pierden.','¡AFK NUNCA!','je je je… ¿dónde estará?','¡Búscalo, huesitos!','¡Tómate un energizante!'];

const gsay=t=>{G.say=t;G.sayT=1.5;}, ksay=t=>{K.say=t;K.sayT=1.2;}, csay=t=>{C.say=t;C.sayT=1.6;}, dsay=t=>{D.say=t;D.sayT=2.2;};
function burst(x,y,n,cols,spd,g,size,life){ for(let i=0;i<n;i++){ const a=rnd(0,Math.PI*2), v=rnd(spd*0.3,spd); parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-spd*0.3,g,c:pick(cols),s:rnd(size*0.6,size),life:rnd(life*0.6,life),max:life}); } }
function addText(x,y,txt,c,size,life){ texts.push({x,y,txt,c,size,life,max:life}); }
const handPos=()=>({x:K.x+30+K.cr*40,y:GY+K.jy-178+K.cr*75});
function mkShape(){ const p=[]; for(let i=0;i<7;i++) p.push(rnd(0.72,1.1)); return p; }
const mkCrate=(x,y)=>({x,y,w:62,h:58,vy:0,hp:2,hit:0,has:null,broken:false});

/* ---------- Inicio de niveles ---------- */
function resetCommon(){
  parts=[]; texts=[]; stones=[]; cubes=[]; cans=[]; waves=[]; aim=null; cool=0.3; pickup=null;
  Object.assign(S,{lagT:0,glitchT:0,shake:0,endT:0,combo:0,lives:3,newBest:false});
  Object.assign(K,{x:150,jy:0,vy:0,onG:true,cr:0,throwing:-1,hurt:0,stunT:0,jaw:0,hasCtrl:true,holdCat:false,moving:false,sayT:0});
  D.sayT=0; C.sayT=0; G.sayT=0;
}
function startLevel1(){
  resetCommon(); S.level=1; S.score=0; S.hp=S.maxHp; S.state='play'; crates=[];
  Object.assign(G,{x:760,y:250,tx:760,ty:250,hit:0,fireT:2.4,moveT:1,teleT:rnd(5,7),say:null,sayT:0,dead:false,rot:0,vy:0,dash:0,tauntT:rnd(3,5),mouth:0});
  ksay('¡Ataquen la maldita guerra!'); K.sayT=1.6;
}
function startLevel2(keepScore){
  resetCommon(); S.level=2; if(!keepScore) S.score=0; S.lvlScore=S.score;
  S.state='intro2'; S.introT=0; S.snatched=false; S.hidden=false;
  crates=[430,570,710,850].map(x=>mkCrate(x,GY)); crates.push(mkCrate(570,GY-58));
  const idx=[0,1,2,3,4].sort(()=>Math.random()-0.5);
  crates[idx[0]].has='ctrl'; crates[idx[1]].has='coin'; if(Math.random()<0.5) crates[idx[2]].has='coin';
  Object.assign(C,{x:1040,hop:0,tx:760,mode:'intro',stun:0,hit:0,throwT:1.4,throwAnim:0,moveT:1,say:null,sayT:0,tauntT:3,hold:false,ph:0,moving:false,target:null});
}
function retryLevel2(){ S.score=S.lvlScore; startLevel2(true); }
function goMenu(){
  resetCommon(); S.state='menu'; S.level=1; crates=[];
  Object.assign(G,{x:760,y:250,tx:760,ty:250,dead:false,rot:0,hit:0,sayT:0,vy:0});
}
function beginL2Play(){
  S.state='play'; S.hidden=true; K.hasCtrl=false; C.hold=false; C.mode='roam'; C.throwT=1.4; C.tauntT=3;
}
function startLevel3(keepScore){
  resetCommon(); S.level=3; if(!keepScore) S.score=0; S.lvlScore=S.score; crates=[];
  S.state='intro3'; S.introT=0;
  Object.assign(D,{x:905,say:null,sayT:0,cane:0,waveT:4});
  Object.assign(HOR,{x:830,y:GY,mode:'cage',ph:0,jt:0,miauT:rnd(5,8),cage:0}); K.holdCat=false;
  const pool=RIDDLES.slice().sort(()=>Math.random()-0.5);
  Object.assign(R,{list:pool.slice(0,5),n:0,cur:null,phase:'wait',timer:15,resT:0,chosen:-1,drop:0,swing:0,marks:[]});
}
function retryLevel3(){ S.score=S.lvlScore; startLevel3(true); }
function beginL3Play(){ S.state='play'; nextRiddle(); }
function nextRiddle(){
  if(R.n>=5){ winL3(); return; }
  R.cur=R.list[R.n]; R.n++;
  const idx=[0,1,2].sort(()=>Math.random()-0.5);
  R.opts=idx.map(i=>R.cur.o[i]); R.correct=idx.indexOf(0);
  Object.assign(R,{phase:'ask',timer:15,chosen:-1,drop:0,amp:0.05+0.035*(R.n-1)});
  D.waveT=rnd(2.5,4); D.cane=0.3; sfx.coin();
  if(R.n===3) addText(W/2,PIV_Y+200,'¡DON PIG SE PONE SERIO! SALTA LAS ONDAS','#D4A83A',30,2);
}
function endTap(){
  if(S.level===1){ if(S.state==='win') startLevel2(true); else startLevel1(); }
  else if(S.level===2){ if(S.state==='win') startLevel3(true); else retryLevel2(); }
  else { if(S.state==='win') startEnding(); else retryLevel3(); }
}
/* ---------- Final: Kraneo recupera a Horus ---------- */
function startEnding(){
  S.state='ending'; S.introT=0; R.cur=null; waves=[]; stones=[]; aim=null; texts=[];
  Object.assign(K,{x:200,cr:0,jy:0,vy:0,onG:true,holdCat:false,throwing:-1,sayT:0,hurt:0});
  Object.assign(HOR,{x:830,y:GY,mode:'cage',ph:0,jt:0,cage:0});
  Object.assign(E,{s1:0,s2:0,s3:0,heldT:0,heartT:0,purrT:0});
  D.say=null; D.sayT=0;
}
function updateEnding(dt){
  S.introT+=dt; const it=S.introT;
  if(it>0.4 && !E.s1){ E.s1=1; dsay('Un trato es un trato. Aquí tiene a su gato.'); D.sayT=2.6; D.cane=0.3; sfx.land(); ksay('¡Horus!'); K.sayT=1.6; }
  if(it>2.0){ HOR.cage=Math.min(1,HOR.cage+dt*2.5); if(!E.s2){ E.s2=1; burst(HOR.x,GY-50,18,['#D4A83A','#ffe08a'],200,100,6,0.7); sfx.coin(); addText(HOR.x,GY-100,'¡MIAU!','#f2c230',30,1); } }
  if(it>2.5 && HOR.mode==='cage') HOR.mode='run';
  if(HOR.mode==='run'){ HOR.ph+=dt*18; HOR.x-=320*dt; if(HOR.x<=K.x+90){ HOR.mode='jump'; HOR.jt=0; HOR.sx=HOR.x; tone(500,900,0.15,'triangle',0.06); } }
  if(HOR.mode==='jump'){
    HOR.jt=Math.min(1,HOR.jt+dt/0.45); const p=HOR.jt;
    HOR.x=lerp(HOR.sx,K.x+16,p); HOR.y=lerp(GY,GY-122,p)-Math.sin(p*Math.PI)*70;
    if(p>=1){ HOR.mode='held'; K.holdCat=true; ksay('¡Horus! ¡Te extrañé!'); K.sayT=2.6; sfx.win(); burst(K.x+16,GY-130,20,['#f4a3b4','#f2c230','#fff'],260,200,6,0.9); }
  }
  if(HOR.mode==='held'){
    E.heldT+=dt; E.heartT-=dt; E.purrT-=dt;
    if(E.heartT<=0){ E.heartT=0.35; addText(K.x+16+rnd(-30,30),GY-160,'♥','#f4a3b4',rnd(20,30),1.4); }
    if(E.purrT<=0){ E.purrT=1.6; addText(K.x+70,GY-120,'purr~','#f8dc7a',24,1.2); }
    if(E.heldT>1.6 && !E.s3){ E.s3=1; dsay('El que gana cobra… y se lleva el gato.'); D.sayT=3.2; }
  }
}

/* ---------- Lanzamiento ---------- */
function launchVel(a){
  const dx=a.sx-a.cx, dy=a.sy-a.cy, L=Math.hypot(dx,dy), h=handPos();
  if(L<18){
    const tx=a.cx-h.x, ty=a.cy-h.y, d=Math.max(40,Math.hypot(tx,ty)), spd=1000, T=d/spd;
    return {vx:tx/d*spd, vy:ty/d*spd-0.5*GRAV*T};
  }
  let vx=dx*6.5, vy=dy*6.5, m=Math.hypot(vx,vy);
  if(m>1400){vx*=1400/m;vy*=1400/m;} if(m<260){vx*=260/m;vy*=260/m;}
  return {vx,vy};
}
function throwStone(v){
  const h=handPos();
  stones.push({x:h.x,y:h.y,vx:v.vx,vy:v.vy,r:9,rot:0,vr:rnd(-14,14),shape:mkShape(),dead:false,hitAny:false,checked:false,fade:0});
  K.throwing=0; K.aimAng=Math.atan2(v.vy,v.vx); cool=0.32; K.jaw=0.5; sfx.throw();
}
function jump(){ if(S.state!=='play'||S.lagT>0) return; if(K.onG && K.cr<0.3){ K.vy=-760; K.onG=false; sfx.jump(); } }

/* ---------- Eventos ---------- */
const BTN1={x:W/2-345,y:330,w:220,h:72}, BTN2={x:W/2-110,y:330,w:220,h:72}, BTN3={x:W/2+125,y:330,w:220,h:72};
function skipIntro(){
  if(S.state==='intro2'&&S.introT>0.8){ K.hasCtrl=false; if(C.x>900) C.x=760; beginL2Play(); }
  if(S.state==='intro3'&&S.introT>0.8) beginL3Play();
}
const inRect=(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
function pos(e){ const r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*W, y:(e.clientY-r.top)/r.height*H}; }
cv.addEventListener('pointerdown', e=>{
  e.preventDefault(); initAudio();
  try{ cv.focus({preventScroll:true}); }catch(_){}
  const p=pos(e);
  if(S.state==='menu'){ if(inRect(p,BTN3)) startLevel3(false); else if(inRect(p,BTN2)) startLevel2(false); else if(inRect(p,BTN1)) startLevel1(); return; }
  if(S.state==='intro2'||S.state==='intro3'){ skipIntro(); return; }
  if(S.state==='ending'){ if(S.introT>5.5) goMenu(); return; }
  if(S.state==='win'||S.state==='lose'){ if(S.endT>1.1) endTap(); return; }
  if(cool>0||S.lagT>0||K.stunT>0) return;
  aim={sx:p.x,sy:p.y,cx:p.x,cy:p.y};
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
});
cv.addEventListener('pointermove', e=>{ if(!aim) return; const p=pos(e); aim.cx=p.x; aim.cy=p.y; });
cv.addEventListener('pointerup', ()=>{ if(!aim) return; const v=launchVel(aim); aim=null; if(S.state==='play') throwStone(v); });
cv.addEventListener('pointercancel', ()=>{ aim=null; });
cv.addEventListener('contextmenu', e=>e.preventDefault());

/* Keys only while the game is on screen, and never while typing in a field.
   A focused page button keeps Space/Enter for itself. */
function ignoreKey(e){
  if(!active || e.ctrlKey || e.metaKey || e.altKey) return true;
  const tg=e.target;
  if(tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return true;
  if(tg && tg.tagName==='BUTTON' && (e.code==='Space'||e.code==='Enter')) return true;
  return false;
}
window.addEventListener('keydown', e=>{
  if(ignoreKey(e)) return;
  const k=e.code;
  if(['Space','ArrowUp','KeyW','ArrowDown','KeyS','ArrowLeft','ArrowRight'].includes(k)) e.preventDefault();
  if(['Space','ArrowUp','KeyW','Enter'].includes(k)){
    if(e.repeat) return;
    initAudio();
    if(S.state==='play') jump();
    else if(S.state==='menu') startLevel1();
    else if(S.state==='intro2'||S.state==='intro3') skipIntro();
    else if(S.state==='ending'){ if(S.introT>5.5) goMenu(); }
    else if(S.endT>1.1) endTap();
  }
  if(k==='Digit2'&&S.state==='menu'){ initAudio(); startLevel2(false); }
  if(k==='Digit3'&&S.state==='menu'){ initAudio(); startLevel3(false); }
  if(k==='Digit1'&&S.state==='menu'){ initAudio(); startLevel1(); }
  if(k==='Escape'){ if(isMax()) exitMax(); else if(S.state!=='menu') goMenu(); }
  if(k==='ArrowDown'||k==='KeyS') K.duckKey=true;
  if(k==='ArrowLeft'||k==='KeyA') K.lk=true;
  if(k==='ArrowRight'||k==='KeyD') K.rk=true;
});
window.addEventListener('keyup', e=>{
  const k=e.code;
  if(k==='ArrowDown'||k==='KeyS') K.duckKey=false;
  if(k==='ArrowLeft'||k==='KeyA') K.lk=false;
  if(k==='ArrowRight'||k==='KeyD') K.rk=false;
});
function releaseKeys(){ K.duckKey=K.duckBtn=K.lk=K.rk=K.lb=K.rb=false; aim=null; }
window.addEventListener('blur', releaseKeys);
function holdBtn(name,set){
  const b=root.querySelector('[data-kg="'+name+'"]');
  b.addEventListener('pointerdown', e=>{ e.preventDefault(); initAudio(); set(true); try{ b.setPointerCapture(e.pointerId); }catch(_){} });
  for(const ev of ['pointerup','pointercancel','lostpointercapture']) b.addEventListener(ev, ()=>set(false));
  b.addEventListener('contextmenu', e=>e.preventDefault());
}
holdBtn('left', v=>K.lb=v); holdBtn('right', v=>K.rb=v); holdBtn('duck', v=>K.duckBtn=v);
root.querySelector('[data-kg="jump"]').addEventListener('pointerdown', e=>{ e.preventDefault(); initAudio(); jump(); });
const muteBtn=root.querySelector('[data-kg="mute"]');
muteBtn.addEventListener('click', ()=>{ muted=!muted; muteBtn.textContent=muted?'🔇':'🔊'; muteBtn.setAttribute('aria-pressed', muted?'true':'false'); });
const menuBtn=root.querySelector('[data-kg="menu"]');
if(menuBtn) menuBtn.addEventListener('click', ()=>{ goMenu(); });

/* ---------- Maximizar: pantalla completa real o, si no existe (iPhone), ocupar la ventana ---------- */
const maxBtn=root.querySelector('[data-kg="max"]');
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
const canFS=!!(root.requestFullscreen||root.webkitRequestFullscreen);
function setMaxUI(on){
  root.classList.toggle('kg-max', on);
  document.documentElement.classList.toggle('kg-lock', on && !fsEl());
  if(maxBtn){ maxBtn.textContent=on?'✕ Salir':'⛶ Maximizar'; maxBtn.setAttribute('aria-pressed', on?'true':'false'); }
  resize();
}
function isMax(){ return root.classList.contains('kg-max'); }
function enterMax(){
  if(canFS){
    const p=(root.requestFullscreen||root.webkitRequestFullscreen).call(root);
    if(p && p.then) p.then(()=>{ try{ screen.orientation.lock('landscape').catch(()=>{}); }catch(_){} }).catch(()=>setMaxUI(true));
    else setMaxUI(true);
  } else setMaxUI(true);
  cv.focus({preventScroll:true});
}
function exitMax(){
  if(fsEl()){ try{ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }catch(_){} }
  setMaxUI(false);
}
function onFsChange(){ setMaxUI(fsEl()===root); }
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
if(maxBtn) maxBtn.addEventListener('click', ()=>{ if(isMax()) exitMax(); else enterMax(); });

/* ---------- Lógica común ---------- */
function hurtK(o){
  o.dead=true; S.lives--; K.hurt=1.3; K.jaw=1; S.shake=12; S.combo=0; sfx.hurt();
  burst(o.x,o.y,18,S.level===1?['#FF2A2A','#00E5FF','#7B4DFF']:['#B6FF3B','#FF2A2A','#fff'],300,600,6,0.6);
  addText(K.x,GY+K.jy-230,'-1','#FF2A2A',40,0.9);
  if(S.level===1) gsay('je je je…'); else csay(pick(['¡Toma lata!','¡Energizante gratis!','je je je…']));
  ksay('¡Auch!');
  if(S.lives<=0){
    S.state='lose'; S.endT=0; sfx.lose(); saveBest();
    if(S.level===1){ gsay('je je je… ¡LAG!'); G.sayT=99; } else { csay('je je… ¡ahora es mío!'); C.sayT=99; }
  }
}
function miss(){
  S.combo=0;
  if(Math.random()<0.3){ if(S.level===1) gsay(pick(['¡Ni cerca!','je je je…','¿Eso fue todo?'])); else if(S.level===2 && C.sayT<=0) csay(pick(['¡Ni cerca!','¿Apuntas con los pies?'])); }
}

function update(dt){
  S.t+=dt; if(S.shake>0) S.shake=Math.max(0,S.shake-dt*30); if(S.glitchT>0) S.glitchT-=dt;
  for(const p of parts){ p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; if(p.y>GY&&p.g>0){p.y=GY;p.vy*=-0.3;p.vx*=0.7;} }
  parts=parts.filter(p=>p.life>0);
  for(const t of texts){ t.y-=40*dt; t.life-=dt; } texts=texts.filter(t=>t.life>0);
  K.sayT-=dt; G.sayT-=dt; C.sayT-=dt; D.sayT-=dt; D.cane=Math.max(0,D.cane-dt); K.jaw=Math.max(0,K.jaw-dt*2.5);
  if(K.throwing>=0){ K.throwing+=dt; if(K.throwing>0.32) K.throwing=-1; }
  if(crates.length) updateCrates(dt);
  if(pickup) updatePickup(dt);

  if(S.state==='menu') return;
  if(S.state==='intro2'){ updateIntro(dt); return; }
  if(S.state==='ending'){ updateEnding(dt); return; }
  if(S.level===3 && S.state==='play'){ HOR.miauT-=dt; if(HOR.miauT<=0){ HOR.miauT=rnd(7,11); addText(HOR.x+30,GY-96,pick(['miau…','¡miau!','mrrr…']),'#f8dc7a',22,1.4); } }
  if(S.state==='intro3'){
    S.introT+=dt;
    if(S.introT>0.3 && !D.say){ dsay('Señores, el que gana cobra.'); ksay('¡Horus!'); K.sayT=1.8; }
    if(S.introT>2.4 && D.say==='Señores, el que gana cobra.'){ dsay('Responda bien… y le devuelvo su gato.'); D.cane=0.3; sfx.land(); addText(HOR.x,GY-100,'miau…','#f8dc7a',24,1.4); }
    if(S.introT>5) beginL3Play();
    return;
  }
  if(S.state!=='play'){
    S.endT+=dt; K.moving=false;
    if(S.level===3){ R.swing+=dt*1.6; if(S.state==='win' && Math.random()<0.3 && S.endT<2) burst(rnd(150,800),rnd(80,300),3,['#D4A83A','#ffe08a','#FF2A2A'],120,200,6,1); }
    if(S.level===1 && G.dead){ G.vy+=GRAV*dt; G.y+=G.vy*dt; G.x+=140*dt; G.rot+=7*dt; if(Math.random()<0.3&&S.endT<1.5) burst(rnd(200,800),rnd(80,300),3,['#FF2A2A','#FFD52A','#fff'],120,200,5,1); }
    if(S.level===2){
      if(C.mode==='flee'){ C.x+=320*dt; C.ph+=dt*16; C.moving=true; C.hop=-Math.abs(Math.sin(C.ph*0.5))*12; }
      if(S.state==='win' && Math.random()<0.25 && S.endT<1.5) burst(rnd(150,800),rnd(80,300),3,['#FF2A2A','#FFD52A','#B6FF3B'],120,200,5,1);
      updateCans(dt,false);
    }
    physicsStones(dt,false);
    return;
  }
  if(S.lagT>0){ S.lagT-=dt; return; }
  cool-=dt;
  updateKraneo(dt);
  if(S.level===1) updateL1(dt); else if(S.level===2) updateL2(dt); else updateL3(dt);
}

/* ---------- Nivel 3: los acertijos de Don Pig ---------- */
function plaquePos(i){
  const ang=Math.sin(R.swing+i*0.15)*R.amp, L=(R.drop*130)+PLAQ_H/2;
  return {x:PLAQ_X[i]+Math.sin(ang)*L, y:PIV_Y+Math.cos(ang)*L, ang};
}
function resolveRiddle(i){
  R.phase='result'; R.chosen=i; R.resT=2.4;
  const p=plaquePos(i<0?R.correct:i);
  if(i===R.correct){
    const pts=100+Math.ceil(R.timer)*10; S.score+=pts; R.marks.push(true);
    burst(p.x,p.y,22,['#D4A83A','#ffe08a','#3BD16F'],320,600,7,0.9);
    addText(p.x,p.y-60,'¡CORRECTO! +'+pts,'#3BD16F',38,1.6);
    dsay(pick(['Correcto, señor.','Nada mal, huesitos.','El que gana cobra.','Hmm… bien jugado.'])); ksay(pick(['¡Fácil!','¡GG!','¡Toma!']));
    sfx.coin(); setTimeout(()=>sfx.coin(),160);
  } else {
    S.lives--; K.hurt=1; K.jaw=1; R.marks.push(false); S.shake=8; sfx.hurt();
    if(i>=0) burst(p.x,p.y,14,['#FF2A2A','#555'],260,600,6,0.6);
    addText(W/2,PIV_Y+210,i<0?'¡SE ACABÓ EL TIEMPO!':'¡INCORRECTO!','#FF2A2A',42,1.6);
    dsay(i<0?'Tic, tac… se le fue el tiempo.':'Incorrecto. El que pierde… lava los platos.'); ksay('¡Rayos!');
  }
}
function winL3(){
  S.state='win'; S.endT=0; waves=[];
  const bonus=100*S.lives; S.score+=bonus;
  addText(K.x+40,GY-270,'BONUS VIDAS +'+bonus,'#FFD52A',34,1.8);
  dsay('Señores, el que gana cobra.'); D.sayT=99; ksay('¡Soy el campeón!'); K.sayT=3; D.cane=0.3;
  sfx.win(); saveBest();
}
function loseL3(){ S.state='lose'; S.endT=0; waves=[]; sfx.lose(); dsay('El que pierde… lava los platos.'); D.sayT=99; saveBest(); }
function updateL3(dt){
  K.stunT=Math.max(0,K.stunT-dt);
  R.drop=Math.min(1,R.drop+dt*2.5); R.swing+=dt*1.6;
  if(R.phase==='ask'){
    R.timer-=dt;
    if(R.timer<=0){ R.timer=0; resolveRiddle(-1); }
    else if(R.n>=3){
      D.waveT-=dt;
      if(D.waveT<=0){ waves.push({x:D.x-40,spd:320+R.n*20,hit:false}); D.cane=0.3; sfx.land(); tone(200,90,0.2,'square',0.06); D.waveT=rnd(2.6,4.2); }
    }
  } else if(R.phase==='result'){
    R.resT-=dt;
    if(R.resT<=0){ if(S.lives<=0) loseL3(); else nextRiddle(); }
  }
  for(const w of waves){
    w.x-=w.spd*dt;
    if(!w.hit && Math.abs(w.x-K.x)<24 && K.jy>-30){
      w.hit=true; K.stunT=0.8; K.hurt=0.8; aim=null; S.score=Math.max(0,S.score-50); S.shake=6; sfx.hurt();
      addText(K.x,GY-240,'¡TROPEZÓ! -50','#D4A83A',34,1.2); dsay('¡Atento, joven!');
      burst(K.x,GY-10,12,['#D4A83A','#ffe08a'],220,600,5,0.5);
    }
  }
  waves=waves.filter(w=>w.x>-40);
  physicsStones(dt,true,0);
}

function updateKraneo(dt){
  if(!K.onG){ K.vy+=1900*dt; K.jy+=K.vy*dt; if(K.jy>=0){ K.jy=0; K.vy=0; K.onG=true; sfx.land(); } }
  K.hurt=Math.max(0,K.hurt-dt);
  const wantDuck=(K.duckKey||K.duckBtn)&&K.onG ? 1 : 0;
  if(wantDuck && K.cr<0.05) sfx.duck();
  K.cr+=(wantDuck-K.cr)*Math.min(1,dt*18);
  const dir=((K.rk||K.rb)?1:0)-((K.lk||K.lb)?1:0);
  const maxX=S.level===1?420:S.level===2?900:250, spd=K.cr>0.5?90:230;
  K.moving=dir!==0 && !(K.stunT>0);
  if(dir && !(K.stunT>0)){ K.x=clamp(K.x+dir*spd*dt,40,maxX); K.walkPh+=dt*14; }
}

/* ---------- Nivel 1: Glitchy ---------- */
function hitG(s){
  s.dead=true; s.hitAny=true; s.remove=true;
  S.hp--; S.combo++; const pts=10*S.combo; S.score+=pts;
  G.hit=0.22; G.x+=20; G.tx+=30;
  burst(s.x,s.y,16,['#7B4DFF','#A88BFF','#00E5FF','#FF2A2A'],320,700,7,0.7);
  burst(s.x,s.y,6,['#85858e','#6f6f78'],220,900,5,0.6);
  addText(G.x,G.y-70,pick(HITWORDS),'#FF2A2A',42,0.9);
  addText(G.x+50,G.y-30,'+'+pts,'#ffffff',30,0.8);
  if(S.combo>=2) addText(G.x-40,G.y+10,'COMBO x'+S.combo,'#FFD52A',30,0.9);
  sfx.hit(); S.shake=7;
  if(Math.random()<0.35) ksay(pick(['¡Toma!','¡Te dije!','GG, fácil']));
  if(S.hp<=0){ S.state='win'; S.endT=0; G.dead=true; G.vy=-520; cubes=[]; sfx.ko(); ksay('¡K.O.!'); K.sayT=3; saveBest(); }
}
function updateL1(dt){
  const rage=1-S.hp/S.maxHp;
  G.hit=Math.max(0,G.hit-dt); G.dash=Math.max(0,G.dash-dt); G.mouth=Math.max(0,G.mouth-dt);
  G.moveT-=dt; if(G.moveT<=0){ G.tx=rnd(600,870); G.ty=rnd(115,375); G.moveT=rnd(1.2,2.4)*(1-rage*0.5); }
  const sp=G.dash>0?9:1.6+rage*1.8;
  G.x+=(G.tx-G.x)*Math.min(1,dt*sp); G.y+=(G.ty-G.y)*Math.min(1,dt*sp);
  G.teleT-=dt;
  if(G.teleT<=0){
    burst(G.x,G.y,14,['#7B4DFF','#00E5FF','#FF2A2A'],250,0,6,0.5);
    G.x=G.tx=rnd(600,870); G.y=G.ty=rnd(115,375); G.teleT=rnd(4.5,7.5)*(1-rage*0.4);
    S.lagT=0.45; S.glitchT=0.5; gsay('¡LAG!'); sfx.glitch(); aim=null;
  }
  G.fireT-=dt;
  if(G.fireT<=0){
    // alturas: 170 = cabeza (agacharse), 100 = pecho (saltar), 40 = pies (saltar)
    const k=Math.random(), hgt = k<0.45 ? 170 : (k<0.75 || rage<0.3 ? 100 : 40);
    const fx=G.x-72, fy=G.y+10, tx=K.x;
    const shoot=(h,m)=>{ const ty=GY-h, d=Math.hypot(tx-fx,ty-fy), spd=(250+rage*230)*m; cubes.push({x:fx,y:fy,vx:(tx-fx)/d*spd,vy:(ty-fy)/d*spd,r:12,rot:0,dead:false}); };
    shoot(hgt,1);
    if(rage>0.5 && Math.random()<0.4) shoot(hgt===170?40:170,0.72);
    G.mouth=0.2; sfx.fire(); G.fireT=rnd(1.6,2.6)*(1-rage*0.5);
  }
  G.tauntT-=dt; if(G.tauntT<=0){ gsay(pick(TAUNTS)); G.tauntT=rnd(4,7); }

  physicsStones(dt,true,rage);
  if(S.state!=='play') return;

  for(const c of cubes){
    if(c.dead) continue;
    c.x+=c.vx*dt; c.y+=c.vy*dt; c.rot+=6*dt;
    if(Math.random()<0.5) parts.push({x:c.x+rnd(-6,6),y:c.y+rnd(-6,6),vx:0,vy:0,g:0,c:pick(['#00E5FF','#FF2A2A','#7B4DFF']),s:4,life:0.25,max:0.25});
    if(K.hurt<=0 && hitsK(c)){ hurtK(c); if(S.state!=='play') break; }
    if(c.x<-40||c.y>GY+10){ if(c.y>GY+10) burst(c.x,GY,6,['#7B4DFF','#00E5FF'],150,600,4,0.4); c.dead=true; }
  }
  cubes=cubes.filter(c=>!c.dead);
}
function hitsK(o){ const top=GY+K.jy-(210-62*K.cr), bot=GY+K.jy; return o.x>K.x-28-o.r && o.x<K.x+28+o.r && o.y>top-o.r && o.y<bot+o.r; }

/* ---------- Nivel 2: Crazyman y el control escondido ---------- */
function updateCrates(dt){
  for(const c of crates){
    if(c.broken) continue;
    c.hit=Math.max(0,c.hit-dt);
    let support=GY;
    for(const o of crates){ if(o===c||o.broken) continue; if(Math.abs(o.x-c.x)<c.w*0.8){ const top=o.y-o.h; if(top>=c.y-2) support=Math.min(support,top); } }
    if(c.y<support||c.vy<0){ c.vy+=GRAV*dt; c.y+=c.vy*dt; }
    if(c.y>=support){ if(c.vy>350){ burst(c.x,support,6,['#7a4a24','#5a3416'],120,600,5,0.4); sfx.land(); } c.y=support; c.vy=0; }
  }
}
function updatePickup(dt){
  const p=pickup;
  if(!p.grounded){ p.vy+=GRAV*dt; p.y+=p.vy*dt; p.x=clamp(p.x+(p.vx||0)*dt,40,900); if(p.y>=GY-8){ p.y=GY-8; p.grounded=true; sfx.land(); } }
}
function calcHeat(){
  if(pickup) return 1;
  if(C.hold) return clamp(1-Math.abs(K.x-C.x)/500,0,1);
  const cc=crates.find(c=>c.has==='ctrl'&&!c.broken); if(!cc) return 0;
  return clamp(1-Math.abs(K.x-cc.x)/450,0,1);
}
function updateIntro(dt){
  S.introT+=dt; const it=S.introT;
  const cc=crates.find(c=>c.has==='ctrl')||crates[0];
  C.moving=false;
  if(it<0.7){ C.x=lerp(1040,K.x+75,it/0.7); C.moving=true; }
  else if(it<1.9){
    if(!S.snatched){ S.snatched=true; K.hasCtrl=false; C.hold=true; ksay('¡Oye! ¡Mi control!'); K.sayT=1.9; K.jaw=1; sfx.snatch(); burst(K.x-20,GY-110,10,['#FF2A2A','#fff'],200,500,5,0.5); }
    C.x=lerp(K.x+75,cc.x,(it-0.7)/1.2); C.moving=true;
  } else {
    if(!S.hidden){ S.hidden=true; C.hold=false; burst(cc.x,cc.y-30,22,['#ddd','#aaa','#B6FF3B'],220,100,9,0.8); crates.forEach(c=>c.hit=0.5); csay('je je je… ¡escondido!'); sfx.glitch(); }
    if(it>2.6){ C.x+=(760-C.x)*Math.min(1,dt*3); C.moving=Math.abs(760-C.x)>6; }
  }
  if(C.moving){ C.ph+=dt*16; C.hop=-Math.abs(Math.sin(C.ph*0.5))*12; } else C.hop*=0.8;
  if(it>4.6) beginL2Play();
}
function cMove(tx,spd,dt){ const dx=tx-C.x; if(Math.abs(dx)>4){ C.x=clamp(C.x+Math.sign(dx)*Math.min(spd*dt,Math.abs(dx)),380,930); C.moving=true; } }
function spawnCrates(){
  const xs=[450,640,830];
  for(const x of xs){ const c=mkCrate(x+rnd(-20,20),-40-rnd(0,80)); if(Math.random()<0.3) c.has='coin'; crates.push(c); }
  addText(W/2,150,'¡DON PIG MANDA MÁS CAJAS!','#D4A83A',38,1.8);
}
function chooseHide(){
  let intact=crates.filter(c=>!c.broken);
  if(!intact.length){ spawnCrates(); intact=crates.filter(c=>!c.broken); }
  C.target=pick(intact); C.mode='rehide';
}
function throwCan(){
  const sx=C.x-30, sy=GY+C.hop-150;
  const dir=((K.rk||K.rb)?1:0)-((K.lk||K.lb)?1:0);
  const tx=clamp(K.x+dir*rnd(50,120),30,920), ty=GY-80, T=rnd(0.85,1.15);
  cans.push({x:sx,y:sy,vx:(tx-sx)/T,vy:(ty-sy-0.5*CAN_G*T*T)/T,rot:0,vr:-rnd(8,14),r:9,dead:false});
  C.throwAnim=0.3; sfx.can();
}
function updateCans(dt,collide){
  for(const c of cans){
    if(c.dead) continue;
    c.vy+=CAN_G*dt; c.x+=c.vx*dt; c.y+=c.vy*dt; c.rot+=c.vr*dt;
    if(collide && K.hurt<=0 && hitsK(c)){ hurtK(c); if(S.state!=='play') break; continue; }
    if(c.y>GY-5){ c.dead=true; burst(c.x,GY-4,12,['#B6FF3B','#d8ff8a','#8fd11f'],200,700,5,0.5); sfx.splash(); }
  }
  cans=cans.filter(c=>!c.dead);
}
function hitC(s){
  s.dead=true; s.hitAny=true; s.remove=true;
  C.stun=1.4; C.hit=0.3; S.combo++; const pts=10*S.combo; S.score+=pts;
  burst(s.x,s.y,14,['#FF7A1A','#fff','#B6FF3B'],300,700,6,0.6);
  addText(C.x,GY-235,pick(['¡QUIETO!','¡PIEDRAZO!','¡ZAS!','¡CRACK!']),'#FF2A2A',40,0.9);
  addText(C.x+50,GY-195,'+'+pts,'#fff',30,0.8);
  if(S.combo>=2) addText(C.x-50,GY-160,'COMBO x'+S.combo,'#FFD52A',30,0.9);
  sfx.hit(); S.shake=6;
  csay(pick(['¡Auch!','¡Lag en la cabeza!','¡Eso dolió!']));
  if(C.hold){
    C.hold=false; C.target=null; C.mode='chase';
    pickup={x:C.x-20,y:GY-130,vx:-70,vy:-260,grounded:false};
    addText(C.x,GY-270,'¡LO SOLTÓ!','#FFD52A',40,1.2); ksay('¡Suelta eso!');
  }
}
function hitCrate(c,s){
  s.dead=true; s.hitAny=true; s.fade=0.6; s.vx*=-0.25; s.vy=-140;
  c.hp--; c.hit=0.15; sfx.crate(); burst(s.x,s.y,5,['#9a6230','#5a3416'],160,700,4,0.4);
  if(c.hp>0) return;
  c.broken=true; sfx.crack(); S.shake=5;
  burst(c.x,c.y-c.h/2,22,['#7a4a24','#9a6230','#5a3416','#c48a4a'],320,900,8,0.9);
  if(c.has==='ctrl'){
    pickup={x:c.x,y:c.y-30,vx:0,vy:-280,grounded:false};
    addText(c.x,c.y-90,'¡AHÍ ESTÁ!','#FF2A2A',46,1.3); ksay('¡Ahí está!');
    C.mode='chase'; C.target=null; csay('¡Nooo, es mío!');
  } else if(c.has==='coin'){
    S.score+=50; sfx.coin(); burst(c.x,c.y-30,10,['#D4A83A','#ffe08a'],200,600,6,0.7);
    addText(c.x,c.y-90,'MONEDA DE DON PIG +50','#D4A83A',32,1.3);
  } else {
    addText(c.x,c.y-80,'VACÍA','#9a9aa2',30,0.9);
    if(calcHeat()<0.5) csay('¡Frío, frío!'); else csay('je je… ¡esa no!');
  }
  crates=crates.filter(o=>!o.broken);
}
function winL2(){
  S.state='win'; S.endT=0; pickup=null; K.hasCtrl=true; cans=[];
  const bonus=50*S.lives; S.score+=bonus;
  addText(K.x+40,GY-270,'BONUS VIDAS +'+bonus,'#FFD52A',34,1.8);
  ksay('¡Mi control!'); K.sayT=3; C.mode='flee'; C.stun=0; csay('¿Revancha?'); C.sayT=99;
  burst(K.x,GY-110,24,['#FF2A2A','#FFD52A','#fff'],320,500,7,0.9);
  sfx.win(); saveBest();
}
function updateL2(dt){
  C.hit=Math.max(0,C.hit-dt); C.stun=Math.max(0,C.stun-dt); C.throwAnim=Math.max(0,C.throwAnim-dt);
  C.moving=false;
  if(C.stun<=0){
    if(C.mode==='roam'){
      C.moveT-=dt; if(C.moveT<=0){ C.tx=rnd(480,900); C.moveT=rnd(1,2.2); }
      cMove(C.tx,170,dt);
      C.throwT-=dt; if(C.throwT<=0){ throwCan(); C.throwT=rnd(1.5,2.5); }
      C.tauntT-=dt; if(C.tauntT<=0){ const h=calcHeat(); csay(h>0.75?'¡Caliente, caliente!':h<0.3?'¡Frío, frío!':pick(L2TAUNTS)); C.tauntT=rnd(4,6); }
    } else if(C.mode==='chase'){
      if(!pickup) C.mode='roam';
      else { cMove(pickup.x,250,dt); if(pickup.grounded && Math.abs(C.x-pickup.x)<16){ pickup=null; C.hold=true; sfx.snatch(); csay('¡Mío otra vez!'); chooseHide(); } }
    } else if(C.mode==='rehide'){
      if(!C.target||C.target.broken) chooseHide();
      if(C.target){
        cMove(C.target.x,230,dt);
        if(Math.abs(C.x-C.target.x)<10 && C.target.vy===0 && C.target.y>0){
          crates.forEach(o=>{ if(o.has==='ctrl') o.has=null; });
          C.target.has='ctrl'; C.target.hp=2; C.hold=false; C.mode='roam'; C.throwT=1.2;
          burst(C.target.x,C.target.y-30,18,['#ddd','#aaa','#B6FF3B'],200,100,8,0.7);
          crates.forEach(o=>o.hit=0.4); csay('¡Escondido otra vez!'); sfx.glitch(); C.target=null;
        }
      }
    }
  }
  if(C.moving){ C.ph+=dt*16; C.hop=-Math.abs(Math.sin(C.ph*0.5))*12; } else C.hop*=0.8;

  physicsStones(dt,true,0);
  if(S.state!=='play') return;
  updateCans(dt,true);
  if(S.state!=='play') return;
  if(pickup && Math.abs(K.x+12-pickup.x)<42 && K.jy>-90) winL2();
}

/* ---------- Piedras ---------- */
function physicsStones(dt,collide,rage){
  for(const s of stones){
    s.vy+=GRAV*dt; s.x+=s.vx*dt; s.y+=s.vy*dt; s.rot+=s.vr*dt;
    if(!s.dead){
      if(collide && S.level===1){
        if(!s.checked && s.vx>0 && s.x<G.x && G.x-s.x<230){ s.checked=true; if(Math.random()<0.12+rage*0.3){ G.ty=clamp(G.y+(G.y>245?-150:150),115,375); G.dash=0.3; } }
        if(Math.hypot(s.x-(G.x+5),s.y-G.y)<50+s.r){ hitG(s); if(S.state!=='play') return; continue; }
        for(const c of cubes){ if(!c.dead && Math.hypot(s.x-c.x,s.y-c.y)<s.r+c.r+6){ c.dead=true; s.hitAny=true; S.score+=5; addText(c.x,c.y-20,'+5','#00E5FF',28,0.7); burst(c.x,c.y,12,['#00E5FF','#7B4DFF','#FF2A2A'],260,500,5,0.5); sfx.cube(); } }
      }
      if(collide && S.level===3){
        if(R.phase==='ask' && R.drop>0.6){
          for(let i=0;i<3;i++){ const p=plaquePos(i); if(Math.abs(s.x-p.x)<PLAQ_W/2+s.r && Math.abs(s.y-p.y)<PLAQ_H/2+s.r){ s.dead=true; s.hitAny=true; s.fade=0.6; s.vx*=-0.2; s.vy=-120; sfx.crate(); resolveRiddle(i); break; } }
          if(s.dead) continue;
        }
        if(Math.abs(s.x-D.x)<34+s.r && s.y>GY-215 && s.y<GY){
          s.dead=true; s.hitAny=true; s.fade=0.6; s.vx*=-0.3; s.vy=-150; S.score=Math.max(0,S.score-20); sfx.crate();
          addText(D.x,GY-250,'-20','#FF2A2A',32,1); dsay('¡Más respeto, joven!'); continue;
        }
      }
      if(collide && S.level===2){
        if(C.stun<=0 && Math.abs(s.x-C.x)<30+s.r && s.y>GY+C.hop-205 && s.y<GY){ hitC(s); continue; }
        for(const c of crates){ if(c.broken) continue; if(s.x>c.x-c.w/2-s.r && s.x<c.x+c.w/2+s.r && s.y>c.y-c.h-s.r && s.y<c.y+s.r){ hitCrate(c,s); break; } }
        if(s.dead) continue;
        for(const cn of cans){ if(!cn.dead && Math.hypot(s.x-cn.x,s.y-cn.y)<s.r+cn.r+6){ cn.dead=true; s.hitAny=true; S.score+=5; addText(cn.x,cn.y-20,'+5','#B6FF3B',28,0.7); burst(cn.x,cn.y,12,['#B6FF3B','#fff'],240,600,5,0.5); sfx.cube(); } }
      }
      if(s.y>GY-s.r && s.vy>0){ if(collide&&!s.hitAny) miss(); s.dead=true; s.fade=0.9; s.y=GY-s.r; s.vy*=-0.3; s.vx*=0.4; burst(s.x,GY-2,6,['#55555c','#3a3a40'],120,600,4,0.4); }
      else if(s.x>W+40||s.x<-60){ if(collide&&!s.hitAny) miss(); s.remove=true; }
    } else {
      s.fade-=dt; if(s.y>GY-s.r){ s.y=GY-s.r; s.vy*=-0.3; s.vx*=0.6; s.vr*=0.6; } if(s.fade<=0) s.remove=true;
    }
  }
  stones=stones.filter(s=>!s.remove);
}

/* ---------- Dibujo ---------- */
function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function bone(x1,y1,x2,y2,w){ ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle='#D3121B'; ctx.lineWidth=w+4; ctx.stroke(); ctx.strokeStyle='#0c0c0e'; ctx.lineWidth=w; ctx.stroke(); }
function knob(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle='#0c0c0e'; ctx.fill(); ctx.strokeStyle='#D3121B'; ctx.lineWidth=2; ctx.stroke(); }
function thick(x1,y1,x2,y2,w,col,out){ ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=out||'#1a1a1e'; ctx.lineWidth=w+3; ctx.stroke(); ctx.strokeStyle=col; ctx.lineWidth=w; ctx.stroke(); }

function drawStone(x,y,r,rot,shape,alpha){
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.globalAlpha=alpha==null?1:alpha;
  ctx.beginPath(); shape.forEach((k,i)=>{ const a=i/shape.length*Math.PI*2; const px=Math.cos(a)*r*k, py=Math.sin(a)*r*k; i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.closePath();
  ctx.fillStyle='#8a8a92'; ctx.fill(); ctx.strokeStyle='#38383e'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-r*0.3,-r*0.3,r*0.28,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
const handShape=mkShape();
// Control de Kraneo (negro con borde rojo). ox/oy = centro
function drawCtrl(ox,oy,glow){
  ctx.save(); ctx.translate(ox,oy);
  if(glow){ ctx.shadowColor='#FF2A2A'; ctx.shadowBlur=glow; }
  ctx.fillStyle='#0c0c0e'; rr(-15,-8,30,16,6); ctx.fill(); ctx.strokeStyle='#D3121B'; ctx.lineWidth=2; ctx.stroke();
  ctx.shadowBlur=0;
  ctx.fillStyle='#FF2A2A'; ctx.beginPath(); ctx.arc(8,-2,2.5,0,7); ctx.arc(4,2,2.5,0,7); ctx.fill();
  ctx.fillStyle='#555'; ctx.fillRect(-11,-1,7,2.5); ctx.fillRect(-8.7,-3.5,2.5,7);
  ctx.restore();
}

function drawBg(){
  const L=S.level, bot=L===2?'#141a0b':L===3?'#1a140a':'#1d0b0e', tint=L===2?'#B6FF3B':L===3?'#D4A83A':'#D3121B';
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0d0d0f'); g.addColorStop(1,bot); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.globalAlpha=0.06; ctx.fillStyle=tint; ctx.font='700 '+(L===3?120:180)+'px '+FONT; ctx.textAlign='center'; ctx.fillText(L===2?'AFK NUNCA':L===3?'EL QUE GANA COBRA':'METAL ASSAULT',W/2,L===3?440:320); ctx.restore();
  for(const lx of [180,480,780]){ const lg=ctx.createRadialGradient(lx,0,0,lx,0,260); lg.addColorStop(0,L===2?'rgba(182,255,59,0.10)':L===3?'rgba(212,168,58,0.12)':'rgba(211,18,27,0.14)'); lg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=lg; ctx.fillRect(lx-260,0,520,300); }
  ctx.fillStyle='#0a0a0b'; ctx.fillRect(0,GY,W,H-GY);
  ctx.strokeStyle='rgba(211,18,27,0.22)'; ctx.lineWidth=1;
  for(let i=-12;i<=12;i++){ ctx.beginPath(); ctx.moveTo(W/2+i*40,GY); ctx.lineTo(W/2+i*130,H); ctx.stroke(); }
  for(let j=1;j<5;j++){ const y=GY+(H-GY)*Math.pow(j/5,1.6); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.save(); ctx.shadowColor='#D3121B'; ctx.shadowBlur=14; ctx.strokeStyle='#D3121B'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,GY); ctx.lineTo(W,GY); ctx.stroke(); ctx.restore();
  for(const p of pile){ ctx.beginPath(); ctx.ellipse(p.x,p.y,p.rx,p.ry,0,0,Math.PI*2); ctx.fillStyle=p.c; ctx.fill(); ctx.strokeStyle='#2c2c32'; ctx.lineWidth=1.5; ctx.stroke(); }
}

function armAngle(){
  if(K.holdCat) return 0.35+Math.sin(S.t*3)*0.05;
  if(S.state==='win') return -1.7+Math.sin(S.t*9)*0.25;
  if(K.throwing>=0){ const p=K.throwing/0.32; return p<0.35 ? lerp(-2.5,K.aimAng,p/0.35) : lerp(K.aimAng,1.3,(p-0.35)/0.65); }
  if(aim) return -2.5+Math.sin(S.t*22)*0.04;
  return 1.25+Math.sin(S.t*2)*0.08;
}

function drawKraneo(){
  const x=K.x, y=GY+K.jy, t=S.t;
  ctx.save(); ctx.globalAlpha=0.45*(1+K.jy/300); ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(x+4,GY+2,38*(1+K.jy/500),7,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x,y);
  if(K.hurt>0 && Math.floor(K.hurt*18)%2===0) ctx.globalAlpha=0.35;
  const tuck=K.onG?0:8, c=K.cr, hipY=-80+50*c;
  const wv=(K.moving&&K.onG&&c<0.3)?Math.sin(K.walkPh):0;
  const f1x=-16+wv*12, f1y=-3+tuck-Math.max(0,wv)*7, f2x=18-wv*12, f2y=-3+tuck-Math.max(0,-wv)*7;
  const k1x=lerp(-14+wv*8,20,c), k1y=lerp(-42+tuck,-30,c), k2x=lerp(15-wv*8,36,c), k2y=lerp(-42+tuck,-26,c);
  bone(-9,hipY,k1x,k1y,7); bone(k1x,k1y,f1x,f1y,6); bone(f1x,f1y+1,f1x+14,f1y+1,5); knob(k1x,k1y,4);
  bone(9,hipY,k2x,k2y,7); bone(k2x,k2y,f2x,f2y,6); bone(f2x,f2y+1,f2x+14,f2y+1,5); knob(k2x,k2y,4);
  const b=Math.sin(t*3)*2*(1-c)+(K.moving?Math.abs(wv)*-2:0); ctx.translate(0,b+50*c);
  ctx.translate(0,-82); ctx.rotate(0.8*c); ctx.translate(0,82);
  // brazo trasero (control)
  bone(-22,-150,-34,-120,6); bone(-34,-120,-22,-104,5); knob(-34,-120,4);
  // pelvis, columna, costillas
  ctx.beginPath(); ctx.ellipse(0,-82,18,8,0,0,Math.PI*2); ctx.fillStyle='#0c0c0e'; ctx.fill(); ctx.strokeStyle='#D3121B'; ctx.lineWidth=2.5; ctx.stroke();
  bone(0,-92,0,-152,6);
  for(let i=0;i<4;i++){ const yy=-146+i*11, w=24-i*2;
    ctx.beginPath(); ctx.moveTo(-3,yy); ctx.quadraticCurveTo(-w-4,yy+1,-w+4,yy+9); ctx.moveTo(3,yy); ctx.quadraticCurveTo(w+4,yy+1,w-4,yy+9);
    ctx.lineCap='round'; ctx.strokeStyle='#D3121B'; ctx.lineWidth=6; ctx.stroke(); ctx.strokeStyle='#0c0c0e'; ctx.lineWidth=3; ctx.stroke(); }
  // núcleo rojo (en el nivel 2 brilla más cerca del control)
  const heat=(S.level===2&&S.state==='play')?calcHeat():0.25;
  ctx.save(); ctx.shadowColor='#FF2A2A'; ctx.shadowBlur=10+heat*34+Math.sin(t*(4+heat*16))*(4+heat*8); ctx.fillStyle=heat>0.8?'#ff6a6a':'#FF2A2A'; ctx.beginPath(); ctx.arc(0,-126,6+heat*2.5+Math.max(0,Math.sin(t*(4+heat*16)))*heat*2,0,Math.PI*2); ctx.fill(); ctx.restore();
  // cinturón
  ctx.fillStyle='#1a1a1e'; ctx.fillRect(-23,-95,46,9); ctx.strokeStyle='#4a4a52'; ctx.lineWidth=1.5; ctx.strokeRect(-23,-95,46,9);
  const bg=ctx.createLinearGradient(-9,-97,9,-84); bg.addColorStop(0,'#f4f4f7'); bg.addColorStop(0.5,'#8d8f96'); bg.addColorStop(1,'#d9dbe0');
  ctx.fillStyle=bg; rr(-10,-98,20,14,2); ctx.fill(); ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='#111'; ctx.font='700 13px '+FONT; ctx.textAlign='center'; ctx.fillText('MA',0,-86);
  // control + cable (solo si lo tiene)
  if(K.hasCtrl){
    ctx.strokeStyle='#FF2A2A'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-30,-98); ctx.bezierCurveTo(-44,-80,-50,-104,-30,-110); ctx.stroke();
    drawCtrl(-25,-104,0);
  } else {
    ctx.strokeStyle='#FF2A2A'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-27,-108); ctx.quadraticCurveTo(-36,-96,-30,-88); ctx.stroke(); // cable colgando, sin control
  }
  bone(-24,-152,24,-152,6); bone(0,-152,2,-166,6);
  // cuernos
  ctx.fillStyle='#0c0c0e'; ctx.strokeStyle='#D3121B'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(-14,-196); ctx.quadraticCurveTo(-32,-204,-30,-232); ctx.quadraticCurveTo(-20,-212,-3,-202); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10,-200); ctx.quadraticCurveTo(22,-214,16,-236); ctx.quadraticCurveTo(32,-214,23,-194); ctx.closePath(); ctx.fill(); ctx.stroke();
  // cráneo
  ctx.beginPath(); ctx.ellipse(4,-186,21,18,0,0,Math.PI*2); ctx.fillStyle='#0c0c0e'; ctx.fill(); ctx.strokeStyle='#D3121B'; ctx.lineWidth=3; ctx.stroke();
  rr(-8,-177,30,12,4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#FF2A2A'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(3,-203); ctx.lineTo(7,-197); ctx.lineTo(2,-193); ctx.lineTo(6,-189); ctx.stroke();
  ctx.save(); ctx.shadowColor='#FF2A2A'; ctx.shadowBlur=14+Math.sin(t*6)*4; ctx.fillStyle='#FF2A2A';
  ctx.beginPath(); ctx.moveTo(-10,-191); ctx.lineTo(1,-187); ctx.lineTo(-1,-181); ctx.lineTo(-9,-182); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8,-187); ctx.lineTo(20,-192); ctx.lineTo(19,-182); ctx.lineTo(10,-181); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle='#2a0507'; ctx.beginPath(); ctx.moveTo(4,-178); ctx.lineTo(10,-178); ctx.lineTo(7,-173); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#EFE3C2'; for(let i=0;i<6;i++) ctx.fillRect(-5+i*4.5,-168,3.5,4.5);
  const jo=3+K.jaw*9+(S.state==='win'?Math.abs(Math.sin(t*10))*6:0);
  ctx.fillStyle='#0c0c0e'; ctx.strokeStyle='#D3121B'; ctx.lineWidth=2.5; rr(-6,-162+jo,28,8,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#EFE3C2'; for(let i=0;i<5;i++) ctx.fillRect(-2.5+i*4.5,-165+jo,3.5,3.5);
  // brazo de lanzar
  const th=armAngle(), sx=22, sy=-150;
  const ex=sx+Math.cos(th)*28, ey=sy+Math.sin(th)*28, hx=ex+Math.cos(th+0.35)*26, hy=ey+Math.sin(th+0.35)*26;
  bone(sx,sy,ex,ey,6); bone(ex,ey,hx,hy,5); knob(ex,ey,4);
  if(aim && S.state==='play') drawStone(hx,hy,8,0,handShape);
  knob(hx,hy,5);
  // hombrera cromada con púas
  ctx.save(); ctx.translate(22,-155);
  for(const a of [-2.4,-1.6,-0.8]){ ctx.beginPath(); ctx.moveTo(Math.cos(a-0.28)*12,Math.sin(a-0.28)*10); ctx.lineTo(Math.cos(a)*27,Math.sin(a)*24); ctx.lineTo(Math.cos(a+0.28)*12,Math.sin(a+0.28)*10); ctx.closePath(); ctx.fillStyle='#c9ccd2'; ctx.fill(); ctx.strokeStyle='#4a4a52'; ctx.lineWidth=1.5; ctx.stroke(); }
  const pg=ctx.createLinearGradient(-15,-10,15,8); pg.addColorStop(0,'#f6f6f9'); pg.addColorStop(0.5,'#8d8f96'); pg.addColorStop(1,'#dcdee3');
  ctx.beginPath(); ctx.ellipse(0,2,17,12,0,Math.PI,0); ctx.lineTo(17,6); ctx.lineTo(-17,6); ctx.closePath(); ctx.fillStyle=pg; ctx.fill(); ctx.strokeStyle='#3a3a40'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawSprite(ox,oy,p,mono,alpha,grow){
  ctx.globalAlpha=alpha; grow=grow||0;
  for(let r=0;r<GH;r++) for(let c=0;c<GW;c++){ const ch=gmap[r][c]; if(ch==='.') continue; ctx.fillStyle=mono||(G.hit>0?'#ffffff':GCOL[ch]); ctx.fillRect(ox+c*p-grow,oy+r*p-grow,p+grow*2,p+grow*2); }
  ctx.globalAlpha=1;
}
function drawGlitchy(){
  if(G.y>H+120) return;
  const p=5, ox=-GW*p/2, oy=-GH*p/2;
  if(!G.dead){ const h=(GY-G.y)/400; ctx.save(); ctx.globalAlpha=0.4*(1-h*0.6); ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(G.x+5,GY+2,50*(1-h*0.4),8,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.translate(G.x, G.y+(G.dead?0:Math.sin(S.t*4)*5));
  if(G.dead) ctx.rotate(G.rot);
  if(G.mouth>0) ctx.scale(1+G.mouth*0.6,1-G.mouth*0.6);
  const jit=(S.glitchT>0||Math.random()<0.04)?rnd(-7,7):0;
  drawSprite(ox-4+jit,oy,p,'#00E5FF',0.4); drawSprite(ox+4-jit,oy,p,'#FF2A2A',0.35);
  drawSprite(ox,oy,p,'#0a0a0f',1,1.5);
  drawSprite(ox,oy,p,null,1);
  ctx.restore();
}
function drawCube(c){
  ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(c.rot);
  ctx.fillStyle='#1a1030'; ctx.fillRect(-12,-12,24,24);
  ctx.strokeStyle='#00E5FF'; ctx.lineWidth=2; ctx.strokeRect(-12,-12,24,24);
  ctx.strokeStyle='#FF2A2A'; ctx.strokeRect(-10,-10,20,20);
  ctx.fillStyle='#7B4DFF'; ctx.fillRect(-6,-6,5,5); ctx.fillRect(2,1,5,5); ctx.fillStyle='#FFD52A'; ctx.fillRect(1,-6,4,4);
  ctx.restore();
}

/* Crazyman (mira a la izquierda). Origen: centro de los pies */
const HAIR=[14,20,12,23,16,25,13,20,15,18];
function drawCan(x,y,rot){
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot||0);
  ctx.fillStyle='#B6FF3B'; rr(-6,-11,12,22,3); ctx.fill(); ctx.strokeStyle='#2b3a0a'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#1d1d22'; ctx.fillRect(-6,-3,12,6); ctx.fillStyle='#B6FF3B'; ctx.font='700 7px '+FONT; ctx.textAlign='center'; ctx.fillText('⚡',0,2.5);
  ctx.fillStyle='#c9ccd2'; ctx.fillRect(-5,-13,10,3);
  ctx.restore();
}
function drawTapedCtrl(x,y){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle='#3a3a42'; rr(-13,-7,26,14,5); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.save(); ctx.rotate(-0.5); ctx.fillStyle='#d8d0b0'; ctx.fillRect(-3,-10,6,20); ctx.restore();
  ctx.fillStyle='#B6FF3B'; ctx.beginPath(); ctx.arc(7,-1,2,0,7); ctx.fill();
  ctx.restore();
}
function drawCrazyman(){
  if(C.x>W+80) return;
  const t=S.t;
  ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(C.x,GY+2,34,7,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(C.x,GY+C.hop);
  if(C.hit>0 && Math.floor(C.hit*20)%2===0) ctx.globalAlpha=0.45;
  const w=C.moving?Math.sin(C.ph):0;
  // piernas (pantalón carbón)
  thick(8,-72,10-w*10,-12,15,'#2b2b30','#111');
  thick(-8,-72,-10+w*10,-12,15,'#2b2b30','#111');
  // tenis disparejos: atrás lima, adelante rojo
  const shoe=(sx,col)=>{ ctx.fillStyle=col; rr(sx-17,-15,26,12,5); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1.5; ctx.stroke(); ctx.fillStyle='#f2f2f2'; ctx.fillRect(sx-17,-5,26,4); ctx.strokeRect(sx-17,-5,26,4); };
  shoe(10-w*10,'#B6FF3B'); shoe(-10+w*10,'#E0242B');
  // brazo trasero con control remendado
  thick(18,-132,28,-100,12,'#F4F4F0','#222');
  ctx.fillStyle='#F2C9A2'; ctx.beginPath(); ctx.arc(28,-98,5,0,7); ctx.fill();
  drawTapedCtrl(30,-96);
  // torso: sudadera tipo camisa de fuerza
  ctx.fillStyle='#F4F4F0'; rr(-28,-144,56,80,14); ctx.fill(); ctx.strokeStyle='#222'; ctx.lineWidth=2.5; ctx.stroke();
  ctx.fillStyle='rgba(182,255,59,0.55)'; ctx.beginPath(); ctx.ellipse(-12,-90,7,5,0.4,0,7); ctx.fill(); ctx.beginPath(); ctx.ellipse(14,-74,5,4,0,0,7); ctx.fill(); ctx.beginPath(); ctx.ellipse(10,-134,4,3,0,0,7); ctx.fill();
  ctx.fillStyle='#8d8d95'; ctx.fillRect(-28,-126,56,6); ctx.fillRect(-28,-82,56,6);
  ctx.fillStyle='#d0d2d8'; ctx.fillRect(-4,-128,8,10); ctx.fillRect(-4,-84,8,10);
  ctx.fillStyle='#111'; ctx.font='700 16px '+FONT; ctx.textAlign='center'; ctx.fillText('AFK NUNCA',0,-96);
  // cabeza
  thick(0,-144,0,-148,10,'#F2C9A2','#222');
  ctx.save(); ctx.translate(0,-168);
  // pelo naranja alborotado
  ctx.fillStyle='#FF7A1A'; ctx.strokeStyle='#8a3a00'; ctx.lineWidth=1.5;
  for(let i=0;i<HAIR.length;i++){ const a=-Math.PI*0.98+i*(Math.PI*0.96/(HAIR.length-1)), L=HAIR[i]+Math.sin(t*9+i)*2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a-0.2)*20,Math.sin(a-0.2)*20); ctx.lineTo(Math.cos(a)*(22+L),Math.sin(a)*(22+L)); ctx.lineTo(Math.cos(a+0.2)*20,Math.sin(a+0.2)*20); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle='#F2C9A2'; ctx.beginPath(); ctx.arc(0,2,23,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#222'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle='#FF7A1A'; ctx.beginPath(); ctx.arc(0,0,24,Math.PI*1.08,Math.PI*1.92); ctx.lineTo(14,-8); ctx.lineTo(4,-12); ctx.lineTo(-6,-7); ctx.lineTo(-18,-9); ctx.closePath(); ctx.fill();
  // audífonos rotos con luz lima
  ctx.strokeStyle='#2a2a30'; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(0,2,29,Math.PI*1.08,Math.PI*1.52); ctx.stroke(); ctx.beginPath(); ctx.arc(0,2,29,Math.PI*1.62,Math.PI*1.95); ctx.stroke();
  ctx.fillStyle='#d8d0b0'; ctx.save(); ctx.rotate(0.25); ctx.fillRect(-4,-31,9,6); ctx.restore();
  ctx.fillStyle='#2a2a30'; rr(19,-8,12,22,4); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.save(); ctx.shadowColor='#B6FF3B'; ctx.shadowBlur=10; ctx.fillStyle=Math.sin(t*12)>-0.3?'#B6FF3B':'#3a5a10'; ctx.beginPath(); ctx.arc(25,3,3,0,7); ctx.fill(); ctx.restore();
  // curita en la frente
  ctx.save(); ctx.translate(2,-13); ctx.rotate(-0.4); ctx.fillStyle='#E8B68A'; rr(-10,-3,20,6,2); ctx.fill(); ctx.fillStyle='#f6dcb4'; ctx.fillRect(-3,-3,6,6); ctx.restore();
  // ojo grande en espiral
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-10,0,10,0,7); ctx.fill(); ctx.strokeStyle='#222'; ctx.lineWidth=1.8; ctx.stroke();
  ctx.beginPath(); for(let a=0;a<Math.PI*5;a+=0.25){ const r=a/(Math.PI*5)*8, aa=a+t*(C.stun>0?14:6); const px=-10+Math.cos(aa)*r, py=Math.sin(aa)*r; a?ctx.lineTo(px,py):ctx.moveTo(px,py);} ctx.stroke();
  // ojo diminuto con ojeras moradas
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(7,-2,3.6,0,7); ctx.fill(); ctx.strokeStyle='#222'; ctx.lineWidth=1.2; ctx.stroke();
  ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(6.3,-2,1.4,0,7); ctx.fill();
  ctx.strokeStyle='#7B4DFF'; ctx.lineWidth=1.8; ctx.beginPath(); ctx.arc(7,1,5,0.2*Math.PI,0.8*Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(7,4,5,0.25*Math.PI,0.75*Math.PI); ctx.stroke();
  // sonrisa desquiciada
  ctx.fillStyle='#fff'; ctx.strokeStyle='#222'; ctx.lineWidth=1.8;
  ctx.beginPath(); ctx.moveTo(-21,9); ctx.quadraticCurveTo(-6,26,10,11); ctx.quadraticCurveTo(-5,15,-21,9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); for(let i=-15;i<=5;i+=5){ ctx.moveTo(i,11); ctx.lineTo(i,18); } ctx.lineWidth=1; ctx.stroke();
  ctx.restore();
  // brazo delantero: lata, o el control de Kraneo en alto
  if(C.hold){
    const wave=Math.sin(t*14)*4;
    thick(-18,-134,-24,-176,12,'#F4F4F0','#222');
    ctx.fillStyle='#F2C9A2'; ctx.beginPath(); ctx.arc(-24,-178,5,0,7); ctx.fill();
    drawCtrl(-26+wave,-190,10);
  } else {
    const up=C.throwAnim>0;
    const hx=up?-28:-34, hy=up?-178:-106;
    thick(-18,-134,hx,hy,12,'#F4F4F0','#222');
    ctx.fillStyle='#F2C9A2'; ctx.beginPath(); ctx.arc(hx,hy,5,0,7); ctx.fill();
    if(!up) drawCan(hx-2,hy-6,0);
  }
  // mareado
  if(C.stun>0){ for(let i=0;i<3;i++){ const a=t*6+i*2.1; ctx.fillStyle='#FFD52A'; ctx.font='700 18px '+FONT; ctx.textAlign='center'; ctx.fillText('★',Math.cos(a)*26,-214+Math.sin(a)*6); } }
  ctx.restore();
}
/* Don Pig (mira a la izquierda). Origen: centro de los pies */
function drawDonPig(){
  const t=S.t, x=D.x;
  ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(x+4,GY+2,44,7,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x,GY+Math.sin(t*2)*1);
  const cl=D.cane>0?-Math.sin(D.cane/0.3*Math.PI)*20:0;
  // bastón negro con calavera cromada (mano izquierda, atrás)
  ctx.strokeStyle='#0a0a0c'; ctx.lineWidth=4.5; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(36,-104+cl); ctx.lineTo(42,-3+cl); ctx.stroke();
  ctx.fillStyle='#d4a83a'; ctx.fillRect(38.5,-8+cl,6,5);
  thick(24,-142,34,-108+cl,13,'#2C2C33','#111');
  ctx.fillStyle='#F2A7A7'; ctx.beginPath(); ctx.arc(35,-105+cl,5.5,0,7); ctx.fill();
  const sk=ctx.createLinearGradient(28,-122,42,-104); sk.addColorStop(0,'#f6f6f9'); sk.addColorStop(0.5,'#8d8f96'); sk.addColorStop(1,'#dcdee3');
  ctx.fillStyle=sk; ctx.beginPath(); ctx.arc(35,-115+cl,7.5,0,7); ctx.fill(); ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillRect(31,-110+cl,8,4); ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(32.5,-116+cl,1.8,0,7); ctx.arc(37.5,-116+cl,1.8,0,7); ctx.fill();
  // piernas (pantalón carbón a rayas) y zapatos lustrados
  thick(-11,-70,-12,-12,17,'#2C2C33','#111'); thick(11,-70,12,-12,17,'#2C2C33','#111');
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1; for(const lx of [-15,-9,8,14]){ ctx.beginPath(); ctx.moveTo(lx,-68); ctx.lineTo(lx,-14); ctx.stroke(); }
  for(const sx of [-12,12]){ ctx.fillStyle='#0a0a0c'; rr(sx-19,-15,30,14,6); ctx.fill(); ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(sx-10,-11,4,1.6,0,0,7); ctx.fill(); }
  // saco de tres piezas
  rr(-35,-154,70,92,20); ctx.fillStyle='#2C2C33'; ctx.fill();
  ctx.save(); ctx.clip(); ctx.strokeStyle='rgba(255,255,255,0.09)'; ctx.lineWidth=1; for(let lx=-34;lx<36;lx+=7){ ctx.beginPath(); ctx.moveTo(lx,-154); ctx.lineTo(lx,-62); ctx.stroke(); } ctx.restore();
  rr(-35,-154,70,92,20); ctx.strokeStyle='#111'; ctx.lineWidth=2.5; ctx.stroke();
  // chaleco vino, camisa, corbata
  ctx.fillStyle='#6B1A24'; rr(-15,-152,30,82,8); ctx.fill(); ctx.strokeStyle='#3a0d13'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#fafafa'; ctx.beginPath(); ctx.moveTo(-11,-152); ctx.lineTo(11,-152); ctx.lineTo(0,-124); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#D3121B'; ctx.fillRect(-3.5,-152,7,6); ctx.beginPath(); ctx.moveTo(-3,-146); ctx.lineTo(3,-146); ctx.lineTo(5.5,-122); ctx.lineTo(0,-115); ctx.lineTo(-5.5,-122); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#dcdee3'; ctx.fillRect(-6,-133,12,2.5);
  ctx.fillStyle='#D4A83A'; for(const by of [-108,-96,-84]){ ctx.beginPath(); ctx.arc(0,by,2.6,0,7); ctx.fill(); }
  // solapas, pin dorado y pañuelo rojo
  ctx.fillStyle='#22222a'; ctx.beginPath(); ctx.moveTo(-15,-152); ctx.lineTo(-26,-146); ctx.lineTo(-11,-112); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(15,-152); ctx.lineTo(26,-146); ctx.lineTo(11,-112); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#D4A83A'; ctx.beginPath(); ctx.arc(-20,-138,2.6,0,7); ctx.fill();
  ctx.fillStyle='#D3121B'; ctx.beginPath(); ctx.moveTo(18,-134); ctx.lineTo(22,-142); ctx.lineTo(25,-135); ctx.lineTo(29,-141); ctx.lineTo(30,-132); ctx.closePath(); ctx.fill();
  // cadena del reloj
  ctx.strokeStyle='#D4A83A'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,-96); ctx.quadraticCurveTo(-18,-88,-34,-118); ctx.stroke();
  // cabeza: orejas puntiagudas
  ctx.save(); ctx.translate(0,-182);
  for(const [bx,tx] of [[-14,-22],[12,18]]){ ctx.fillStyle='#F2A7A7'; ctx.beginPath(); ctx.moveTo(bx-8,-16); ctx.lineTo(tx,-44); ctx.lineTo(bx+8,-20); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#8a4a4a'; ctx.lineWidth=1.5; ctx.stroke(); ctx.fillStyle='#e07f86'; ctx.beginPath(); ctx.moveTo(bx-4,-18); ctx.lineTo(tx,-38); ctx.lineTo(bx+4,-20); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle='#F2A7A7'; ctx.beginPath(); ctx.arc(0,0,27,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#8a4a4a'; ctx.lineWidth=2; ctx.stroke();
  // pelo gris peinado hacia atrás
  ctx.strokeStyle='#a2a2aa'; ctx.lineWidth=9; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(3,1,24,Math.PI*1.32,Math.PI*2.02); ctx.stroke();
  ctx.strokeStyle='#7d7d86'; ctx.lineWidth=1.2; for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(3,1,21+i*3,Math.PI*1.4,Math.PI*1.95); ctx.stroke(); }
  // barba castaña recortada
  ctx.fillStyle='#4A2F22'; ctx.beginPath(); ctx.moveTo(-24,8); ctx.quadraticCurveTo(-18,32,2,30); ctx.quadraticCurveTo(22,26,25,6); ctx.quadraticCurveTo(14,16,0,16); ctx.quadraticCurveTo(-14,16,-24,8); ctx.closePath(); ctx.fill();
  // cejas pobladas, ojos y monóculo dorado
  ctx.strokeStyle='#6d6d75'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(-17,-10); ctx.lineTo(-4,-8); ctx.moveTo(3,-11); ctx.lineTo(13,-12); ctx.stroke();
  ctx.fillStyle='#1a1a1a'; ctx.beginPath(); ctx.arc(-10,-2,2.6,0,7); ctx.arc(8,-3,2.3,0,7); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-10,-2,7.5,0,7); ctx.fill(); ctx.strokeStyle='#D4A83A'; ctx.lineWidth=2.5; ctx.stroke();
  ctx.strokeStyle='#D4A83A'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-10,5.5); ctx.quadraticCurveTo(-26,26,-14,40); ctx.stroke();
  // hocico y bigote de puntas enroscadas
  ctx.fillStyle='#e88f93'; ctx.beginPath(); ctx.ellipse(-25,8,10,8.5,0,0,7); ctx.fill(); ctx.strokeStyle='#8a4a4a'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#7a3a40'; ctx.beginPath(); ctx.ellipse(-29,8,1.8,3,0,0,7); ctx.ellipse(-22,8,1.8,3,0,0,7); ctx.fill();
  ctx.strokeStyle='#4A2F22'; ctx.lineWidth=4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-24,17); ctx.quadraticCurveTo(-36,22,-40,14); ctx.arc(-37,12,3,0,Math.PI*1.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-22,17); ctx.quadraticCurveTo(-10,23,-4,14); ctx.arc(-7,12,3,Math.PI,Math.PI*-0.4,true); ctx.stroke();
  ctx.restore();
  // brazo derecho con el reloj de oro en alto
  thick(-26,-142,-38,-118,13,'#2C2C33','#111');
  ctx.fillStyle='#F2A7A7'; ctx.beginPath(); ctx.arc(-39,-116,5.5,0,7); ctx.fill();
  ctx.save(); ctx.translate(-44,-126);
  ctx.fillStyle='#D4A83A'; ctx.beginPath(); ctx.arc(0,0,10,0,7); ctx.fill(); ctx.strokeStyle='#7a5a10'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#fffbe8'; ctx.beginPath(); ctx.arc(0,0,7,0,7); ctx.fill();
  ctx.strokeStyle='#111'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-5); ctx.moveTo(0,0); ctx.lineTo(Math.cos(t*2)*4.5,Math.sin(t*2)*4.5); ctx.stroke();
  ctx.fillStyle='#D4A83A'; ctx.fillRect(-2,-13,4,3);
  ctx.restore();
  ctx.restore();
}
/* Horus: gato amarillo con rayas, ojos verdes */
const HC={body:'#f2c230',belly:'#f8dc7a',stripe:'#c99512',ear:'#f4a3b4',line:'#2a2a2e',eye:'#7fd36b',nose:'#e88aa0'};
function catHead(hx,hy,happy){
  const t=S.t;
  ctx.lineWidth=2.5; ctx.strokeStyle=HC.line;
  for(const [a,b,c] of [[[hx-13,hy-5],[hx-11,hy-24],[hx-1,hy-12]],[[hx+1,hy-12],[hx+11,hy-24],[hx+13,hy-5]]]){
    ctx.fillStyle=HC.body; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle=HC.ear; ctx.beginPath(); ctx.moveTo(a[0]+(c[0]-a[0])*0.25,a[1]-2); ctx.lineTo(b[0],b[1]+6); ctx.lineTo(c[0]-(c[0]-a[0])*0.25,c[1]+1); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle=HC.body; ctx.beginPath(); ctx.arc(hx,hy,15,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle=HC.stripe; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(hx-5,hy-14); ctx.lineTo(hx-4,hy-9); ctx.moveTo(hx,hy-15); ctx.lineTo(hx,hy-9); ctx.moveTo(hx+5,hy-14); ctx.lineTo(hx+4,hy-9); ctx.stroke();
  ctx.fillStyle='rgba(244,163,180,0.55)'; ctx.beginPath(); ctx.ellipse(hx-9,hy+4,3.5,2.2,0,0,7); ctx.ellipse(hx+9,hy+4,3.5,2.2,0,0,7); ctx.fill();
  const blink=Math.sin(t*1.3)>0.97;
  if(happy||blink){ ctx.strokeStyle=HC.line; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(hx-9,hy-1); ctx.quadraticCurveTo(hx-6,hy-5,hx-3,hy-1); ctx.moveTo(hx+3,hy-1); ctx.quadraticCurveTo(hx+6,hy-5,hx+9,hy-1); ctx.stroke(); }
  else { for(const ex of [hx-6,hx+6]){ ctx.fillStyle=HC.eye; ctx.beginPath(); ctx.ellipse(ex,hy-2,3.4,4.2,0,0,7); ctx.fill(); ctx.strokeStyle=HC.line; ctx.lineWidth=1.3; ctx.stroke(); ctx.fillStyle='#121214'; ctx.beginPath(); ctx.ellipse(ex,hy-2,0.9,3.2,0,0,7); ctx.fill(); } }
  ctx.fillStyle=HC.nose; ctx.beginPath(); ctx.moveTo(hx-2.5,hy+3); ctx.lineTo(hx+2.5,hy+3); ctx.lineTo(hx,hy+6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=HC.line; ctx.lineWidth=1.3; ctx.beginPath(); ctx.moveTo(hx,hy+6); ctx.quadraticCurveTo(hx-2,hy+9,hx-5,hy+7.5); ctx.moveTo(hx,hy+6); ctx.quadraticCurveTo(hx+2,hy+9,hx+5,hy+7.5); ctx.stroke();
  ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(hx-8,hy+5); ctx.lineTo(hx-22,hy+2); ctx.moveTo(hx-8,hy+7); ctx.lineTo(hx-21,hy+9); ctx.moveTo(hx+8,hy+5); ctx.lineTo(hx+22,hy+2); ctx.moveTo(hx+8,hy+7); ctx.lineTo(hx+21,hy+9); ctx.stroke();
}
function catTail(path,w){ ctx.lineCap='round'; ctx.strokeStyle=HC.line; ctx.lineWidth=w+3; path(); ctx.stroke(); ctx.strokeStyle=HC.body; ctx.lineWidth=w; path(); ctx.stroke(); }
function drawHorus(x,y,pose){
  const t=S.t;
  ctx.save(); ctx.translate(x,y); ctx.lineJoin='round';
  if(pose==='sit'){
    catTail(()=>{ ctx.beginPath(); ctx.moveTo(12,-8); ctx.bezierCurveTo(32,-4,34,-26,28+Math.sin(t*2.5)*4,-40); },7);
    ctx.fillStyle=HC.body; ctx.strokeStyle=HC.line; ctx.lineWidth=2.5; ctx.beginPath(); ctx.ellipse(2,-22,16,20,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle=HC.belly; ctx.beginPath(); ctx.ellipse(-4,-17,8,13,0,0,7); ctx.fill();
    ctx.strokeStyle=HC.stripe; ctx.lineWidth=3; for(const sy of [-32,-22,-12]){ ctx.beginPath(); ctx.moveTo(17,sy); ctx.quadraticCurveTo(12,sy+3,13,sy+7); ctx.stroke(); }
    ctx.fillStyle=HC.body; ctx.strokeStyle=HC.line; ctx.lineWidth=2; for(const px of [-9,3]){ ctx.beginPath(); ctx.ellipse(px,-3,6,4,0,0,7); ctx.fill(); ctx.stroke(); }
    catHead(-4,-48,false);
  } else if(pose==='run'){
    const ph=HOR.ph;
    catTail(()=>{ ctx.beginPath(); ctx.moveTo(20,-22); ctx.quadraticCurveTo(36,-30,34,-46+Math.sin(ph)*4); },7);
    ctx.strokeStyle=HC.line; ctx.lineCap='round';
    for(const [lx,o] of [[-14,0],[-6,Math.PI],[10,Math.PI],[18,0]]){ const sw=Math.sin(ph+o)*8; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(lx,-16); ctx.lineTo(lx+sw,-2); ctx.stroke(); ctx.strokeStyle=HC.body; ctx.lineWidth=5; ctx.stroke(); ctx.strokeStyle=HC.line; }
    ctx.fillStyle=HC.body; ctx.lineWidth=2.5; ctx.beginPath(); ctx.ellipse(2,-20,24,12,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle=HC.belly; ctx.beginPath(); ctx.ellipse(0,-14,16,5,0,0,7); ctx.fill();
    ctx.strokeStyle=HC.stripe; ctx.lineWidth=3; for(const sx of [-2,8,18]){ ctx.beginPath(); ctx.moveTo(sx,-31); ctx.quadraticCurveTo(sx+3,-26,sx,-22); ctx.stroke(); }
    catHead(-24,-30,false);
  } else { // en brazos de Kraneo: enroscado y feliz
    catTail(()=>{ ctx.beginPath(); ctx.moveTo(22,4); ctx.quadraticCurveTo(34,10+Math.sin(t*3)*3,26,20); },7);
    ctx.fillStyle=HC.body; ctx.strokeStyle=HC.line; ctx.lineWidth=2.5; ctx.beginPath(); ctx.ellipse(4,4,26,14,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle=HC.belly; ctx.beginPath(); ctx.ellipse(2,10,18,6,0,0,7); ctx.fill();
    ctx.strokeStyle=HC.stripe; ctx.lineWidth=3; for(const sx of [6,14,22]){ ctx.beginPath(); ctx.moveTo(sx,-9); ctx.quadraticCurveTo(sx+3,-4,sx,0); ctx.stroke(); }
    ctx.fillStyle=HC.body; ctx.strokeStyle=HC.line; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(-12,16,6,4,0,0,7); ctx.fill(); ctx.stroke();
    catHead(-18,-4,true);
  }
  ctx.restore();
}
function drawCage(x,front){
  const w=70,h=62,top=GY-h, open=HOR.cage;
  ctx.save();
  if(!front){
    ctx.fillStyle='rgba(212,168,58,0.10)'; ctx.beginPath(); ctx.moveTo(x-w/2,GY-8); ctx.lineTo(x-w/2,top); ctx.arc(x,top,w/2,Math.PI,0); ctx.lineTo(x+w/2,GY-8); ctx.closePath(); ctx.fill();
    ctx.restore(); return;
  }
  ctx.strokeStyle='#D4A83A'; ctx.lineWidth=3;
  for(let bx=x-w/2;bx<=x+w/2+0.1;bx+=10){
    const door=Math.abs(bx-x)<16; if(door && open>=1) continue;
    ctx.globalAlpha=door?1-open:1; const dy=door?-open*40:0;
    ctx.beginPath(); ctx.moveTo(bx,GY-8+dy); ctx.lineTo(bx,top+dy); ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.beginPath(); ctx.arc(x,top,w/2,Math.PI,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,top-w/2); ctx.lineTo(x,top); ctx.stroke();
  ctx.beginPath(); ctx.arc(x,top-w/2-6,6,0,7); ctx.stroke();
  ctx.fillStyle='#D4A83A'; rr(x-w/2-5,GY-9,w+10,9,2); ctx.fill();
  ctx.fillStyle='#1c1c20'; rr(x-25,GY-30,50,15,3); ctx.fill(); ctx.strokeStyle='#D4A83A'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#D4A83A'; ctx.font='700 14px '+FONT; ctx.textAlign='center'; ctx.fillText('PREMIO',x,GY-18);
  ctx.restore();
}
function fitText(txt,maxW,sizes,maxLines){
  for(const s of sizes){
    ctx.font='600 '+s+'px '+FONT;
    const words=txt.split(' '), lines=[]; let cur='';
    for(const w of words){ const tst=cur?cur+' '+w:w; if(ctx.measureText(tst).width>maxW && cur){ lines.push(cur); cur=w; } else cur=tst; }
    if(cur) lines.push(cur);
    if(lines.length<=maxLines && lines.every(l=>ctx.measureText(l).width<=maxW)) return {lines,size:s};
  }
  const s=sizes[sizes.length-1]; ctx.font='600 '+s+'px '+FONT; return {lines:[txt],size:s};
}
function drawRiddlePanel(){
  if(!R.cur) return;
  const x=110,y=92,w=740,h=100;
  ctx.fillStyle='rgba(16,16,18,0.93)'; rr(x,y,w,h,10); ctx.fill(); ctx.strokeStyle='#D4A83A'; ctx.lineWidth=2.5; ctx.stroke();
  ctx.fillStyle='#D4A83A'; ctx.font='600 20px '+FONT; ctx.textAlign='left'; ctx.fillText('ACERTIJO '+R.n+'/5 · DON PIG PREGUNTA:',x+16,y+22);
  const f=fitText(R.cur.q,600,[30,27,24],2);
  ctx.font='600 '+f.size+'px '+FONT; ctx.fillStyle='#fff'; ctx.textAlign='center';
  const cy=y+(f.lines.length===1?68:54);
  f.lines.forEach((l,i)=>ctx.fillText(l,x+330,cy+i*(f.size+2)));
  // reloj de bolsillo de Don Pig = tiempo
  const wx=x+w-46, wy=y+h/2+4, frac=R.timer/15;
  ctx.fillStyle='#D4A83A'; ctx.beginPath(); ctx.arc(wx,wy,32,0,7); ctx.fill(); ctx.fillStyle='#fffbe8'; ctx.beginPath(); ctx.arc(wx,wy,26,0,7); ctx.fill();
  ctx.fillStyle='#D4A83A'; ctx.fillRect(wx-4,wy-40,8,7);
  if(R.phase==='ask'){ ctx.fillStyle=frac<0.34?'rgba(211,18,27,0.45)':'rgba(212,168,58,0.4)'; ctx.beginPath(); ctx.moveTo(wx,wy); ctx.arc(wx,wy,26,-Math.PI/2,-Math.PI/2+Math.PI*2*frac); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle=frac<0.34&&R.phase==='ask'?'#D3121B':'#2C2C33'; ctx.font='700 30px '+FONT; ctx.textAlign='center'; ctx.fillText(R.phase==='ask'?Math.ceil(R.timer):'✓',wx,wy+11);
}
function drawPlaques(){
  if(!R.cur) return;
  for(let i=0;i<3;i++){
    const p=plaquePos(i), L=R.drop*130;
    ctx.save(); ctx.translate(PLAQ_X[i],PIV_Y); ctx.rotate(-p.ang);
    ctx.strokeStyle='#8a6a1a'; ctx.lineWidth=2; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(-30,0); ctx.lineTo(-30,L); ctx.moveTo(30,0); ctx.lineTo(30,L); ctx.stroke(); ctx.setLineDash([]);
    ctx.translate(0,L+PLAQ_H/2);
    let border='#D4A83A', glow=0;
    if(R.phase==='result'){ if(i===R.correct){ border='#3BD16F'; glow=24; } else if(i===R.chosen){ border='#FF2A2A'; glow=18; } }
    ctx.save(); if(glow){ ctx.shadowColor=border; ctx.shadowBlur=glow; }
    ctx.fillStyle=(R.phase==='result'&&i!==R.correct&&i!==R.chosen)?'#141416':'#1c1c20'; rr(-PLAQ_W/2,-PLAQ_H/2,PLAQ_W,PLAQ_H,8); ctx.fill(); ctx.strokeStyle=border; ctx.lineWidth=3; ctx.stroke(); ctx.restore();
    ctx.fillStyle=border; ctx.font='700 18px '+FONT; ctx.textAlign='left'; ctx.fillText('ABC'[i],-PLAQ_W/2+8,-PLAQ_H/2+18);
    const f=fitText(R.opts[i],PLAQ_W-26,[26,22,19],2);
    ctx.font='600 '+f.size+'px '+FONT; ctx.fillStyle=(R.phase==='result'&&i!==R.correct&&i!==R.chosen)?'#666':'#fff'; ctx.textAlign='center';
    const y0=f.lines.length===1?f.size*0.35:-2;
    f.lines.forEach((l,j)=>ctx.fillText(l,4,y0+j*(f.size)));
    ctx.restore();
  }
}
function drawWaves(){
  for(const w of waves){
    ctx.save(); ctx.shadowColor='#D4A83A'; ctx.shadowBlur=16; ctx.strokeStyle='#ffd86b'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(w.x,GY,14,26,0,Math.PI,0); ctx.stroke();
    ctx.strokeStyle='rgba(212,168,58,0.5)'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(w.x+16,GY,10,18,0,Math.PI,0); ctx.stroke();
    ctx.restore();
  }
}
function drawCrate(c){
  const sx=c.hit>0?rnd(-3,3):0, x=c.x-c.w/2+sx, y=c.y-c.h;
  ctx.fillStyle='#7a4a24'; ctx.fillRect(x,y,c.w,c.h);
  ctx.strokeStyle='#5a3416'; ctx.lineWidth=2; for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(x,y+i*c.h/4); ctx.lineTo(x+c.w,y+i*c.h/4); ctx.stroke(); }
  ctx.strokeStyle='#9a6230'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(x+6,y+6); ctx.lineTo(x+c.w-6,y+c.h-6); ctx.moveTo(x+c.w-6,y+6); ctx.lineTo(x+6,y+c.h-6); ctx.stroke();
  ctx.strokeStyle='#2a170a'; ctx.lineWidth=3; ctx.strokeRect(x,y,c.w,c.h);
  ctx.strokeStyle='#9a6230'; ctx.lineWidth=2; ctx.strokeRect(x+3,y+3,c.w-6,c.h-6);
  if(c.hp<2){ ctx.strokeStyle='#120a04'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x+14,y); ctx.lineTo(x+22,y+18); ctx.lineTo(x+16,y+30); ctx.lineTo(x+28,y+44); ctx.moveTo(x+c.w-8,y+c.h); ctx.lineTo(x+c.w-18,y+c.h-16); ctx.stroke(); }
}
function drawPickup(){
  if(!pickup) return;
  const p=pickup, bob=p.grounded?Math.sin(S.t*6)*2:0;
  ctx.strokeStyle='#FF2A2A'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(p.x-15,p.y+bob); ctx.quadraticCurveTo(p.x-28,p.y+10,p.x-38,p.y+6); ctx.stroke();
  drawCtrl(p.x,p.y+bob,16+Math.sin(S.t*8)*8);
  if(p.grounded){ ctx.fillStyle='#FF2A2A'; ctx.font='700 22px '+FONT; ctx.textAlign='center'; ctx.fillText('▼',p.x,p.y-24+Math.sin(S.t*8)*4); }
}

function bubble(x,y,txt,border){
  ctx.font='600 26px '+FONT; const w=ctx.measureText(txt).width+22, h=32, tipX=x; x=clamp(x,w/2+8,W-w/2-8);
  ctx.fillStyle='rgba(16,16,18,0.94)'; ctx.strokeStyle=border; ctx.lineWidth=2; rr(x-w/2,y-h,w,h,8); ctx.fill(); ctx.stroke();
  const tx=clamp(tipX,x-w/2+14,x+w/2-14);
  ctx.beginPath(); ctx.moveTo(tx-7,y-1); ctx.lineTo(tx,y+10); ctx.lineTo(tx+7,y-1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(16,16,18,1)'; ctx.fillRect(tx-6,y-3,12,3);
  ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.fillText(txt,x,y-8);
}
function heart(x,y,full){
  ctx.beginPath(); ctx.moveTo(x,y+6); ctx.bezierCurveTo(x-14,y-4,x-7,y-14,x,y-6); ctx.bezierCurveTo(x+7,y-14,x+14,y-4,x,y+6);
  ctx.fillStyle=full?'#FF2A2A':'#2a2a30'; ctx.fill(); ctx.strokeStyle=full?'#ff8080':'#55555c'; ctx.lineWidth=1.5; ctx.stroke();
}
function drawHUD(){
  ctx.textAlign='left'; ctx.font='600 30px '+FONT; ctx.fillStyle='#fff'; ctx.fillText('KRANEO',20,38);
  for(let i=0;i<3;i++) heart(124+i*30,26,i<S.lives);
  ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.font='600 30px '+FONT; ctx.fillText('PUNTOS '+S.score,W/2,38);
  ctx.font='400 20px '+FONT; ctx.fillStyle='#777'; ctx.fillText('NIVEL '+S.level,W/2,60);
  if(S.combo>=2){ ctx.fillStyle='#FFD52A'; ctx.font='600 24px '+FONT; ctx.fillText('COMBO x'+S.combo,W/2,84); }
  ctx.textAlign='right';
  if(S.level===1){
    ctx.font='600 30px '+FONT; ctx.fillStyle='#A88BFF'; ctx.fillText('GLITCHY',W-20,38);
    const bw=240,bx=W-20-bw,by=48; ctx.fillStyle='#24242a'; ctx.fillRect(bx,by,bw,12);
    ctx.fillStyle='#7B4DFF'; ctx.fillRect(bx+bw*(1-S.hp/S.maxHp),by,bw*S.hp/S.maxHp,12);
    ctx.strokeStyle='#A88BFF'; ctx.lineWidth=1.5; ctx.strokeRect(bx,by,bw,12);
  } else if(S.level===3){
    ctx.font='600 30px '+FONT; ctx.fillStyle='#F2A7A7'; ctx.fillText('DON PIG',W-20,38);
    for(let i=0;i<5;i++){ const cx=W-118+i*22, cy=58, m=R.marks[i];
      ctx.beginPath(); ctx.arc(cx,cy,8,0,7);
      if(m===true){ ctx.fillStyle='#D4A83A'; ctx.fill(); ctx.strokeStyle='#ffe08a'; ctx.lineWidth=1.5; ctx.stroke(); }
      else if(m===false){ ctx.fillStyle='#3a0d10'; ctx.fill(); ctx.strokeStyle='#FF2A2A'; ctx.lineWidth=2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx-4,cy-4); ctx.lineTo(cx+4,cy+4); ctx.moveTo(cx+4,cy-4); ctx.lineTo(cx-4,cy+4); ctx.stroke(); }
      else { ctx.strokeStyle='#55555c'; ctx.lineWidth=1.5; ctx.stroke(); }
    }
  } else {
    ctx.font='600 30px '+FONT; ctx.fillStyle='#FF7A1A'; ctx.fillText('CRAZYMAN',W-20,38);
    if(S.state==='play'||S.state==='intro2'){
      if(C.hold && S.state==='play'){ if(Math.floor(S.t*4)%2===0){ ctx.font='600 24px '+FONT; ctx.fillStyle='#FF2A2A'; ctx.fillText('¡LO TIENE CRAZYMAN! ¡PÉGALE!',W-20,66); } }
      else if(pickup){ ctx.font='600 24px '+FONT; ctx.fillStyle='#FFD52A'; ctx.fillText('¡ESTÁ EN EL PISO! ¡CORRE!',W-20,66); }
      else {
        const heat=S.state==='play'?calcHeat():0, bars=Math.ceil(heat*5);
        ctx.font='400 22px '+FONT; ctx.fillStyle='#9a9aa2'; ctx.fillText('SEÑAL DEL CONTROL',W-120,66);
        for(let i=0;i<5;i++){ const bh=6+i*4; ctx.fillStyle=i<bars?(bars>=4?'#FF2A2A':'#B6FF3B'):'#2a2a30'; ctx.fillRect(W-105+i*17,68-bh,12,bh); }
      }
    }
  }
}
function centerText(txt,y,size,color,glow){ ctx.save(); ctx.textAlign='center'; ctx.font='700 '+size+'px '+FONT; if(glow){ctx.shadowColor=glow;ctx.shadowBlur=24;} ctx.fillStyle=color; ctx.fillText(txt,W/2,y); ctx.restore(); }
function levelBtn(r,title,sub,col){
  ctx.fillStyle='rgba(18,18,20,0.92)'; rr(r.x,r.y,r.w,r.h,8); ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.stroke();
  ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.font='700 34px '+FONT; ctx.fillText(title,r.x+r.w/2,r.y+36);
  ctx.fillStyle=col; ctx.font='400 20px '+FONT; ctx.fillText(sub,r.x+r.w/2,r.y+60);
}
function drawOverlay(){
  if(S.state==='menu'){
    ctx.fillStyle='rgba(8,8,10,0.66)'; ctx.fillRect(0,0,W,H);
    centerText('KRANEO',138,112,'#D3121B','#D3121B');
    centerText('¡A PIEDRAZO LIMPIO!',184,42,'#fff');
    ctx.font='400 23px '+FONT; ctx.fillStyle='#c8c8ce'; ctx.textAlign='center';
    ctx.fillText('Lanza: arrastra hacia atrás y suelta (o toca donde quieras tirar)',W/2,226);
    ctx.fillText('Esquiva: SALTA con ESPACIO/↑ · AGÁCHATE con ↓/S · CAMINA con ◀ ▶ / A D',W/2,254);
    centerText('Supera los 3 niveles y recupera a Horus, el gato de Kraneo',300,28,'#f2c230');
    levelBtn(BTN1,'NIVEL 1','Glitchy y sus cubos de LAG','#A88BFF');
    levelBtn(BTN2,'NIVEL 2','Crazyman escondió tu control','#FF7A1A');
    levelBtn(BTN3,'NIVEL 3','Los acertijos de Don Pig','#D4A83A');
    if(Math.floor(S.t*2.5)%2===0){ ctx.font='600 26px '+FONT; ctx.fillStyle='#FF2A2A'; ctx.textAlign='center'; ctx.fillText('ELIGE UN NIVEL',W/2,436); }
    if(best>0){ ctx.font='400 22px '+FONT; ctx.fillStyle='#888'; ctx.textAlign='center'; ctx.fillText('RÉCORD: '+best,W/2,462); }
  } else if(S.state==='intro2'){
    centerText('NIVEL 2 · ¡MI CONTROL!',120,64,'#FF7A1A','#FF7A1A');
    if(S.hidden){
      centerText('Crazyman escondió tu control en una de las cajas',160,32,'#fff');
      centerText('Rómpelas a piedrazos · tu núcleo brilla más cerca del control',192,26,'#c8c8ce');
    }
    if(S.introT>0.8){ ctx.font='400 20px '+FONT; ctx.fillStyle='#777'; ctx.textAlign='right'; ctx.fillText('toca para saltar la intro',W-16,H-14); }
  } else if(S.state==='intro3'){
    centerText('NIVEL 3 · LOS ACERTIJOS DE DON PIG',120,58,'#D4A83A','#D4A83A');
    centerText('Don Pig tiene a Horus, el gato de Kraneo: ¡gana y lo recuperas!',162,30,'#f2c230');
    centerText('Lánzale una piedra a la placa con la respuesta correcta',194,26,'#fff');
    centerText('15 s por acertijo · fallar cuesta un corazón · desde el 3, ¡salta las ondas del bastón!',224,24,'#c8c8ce');
    if(S.introT>0.8){ ctx.font='400 20px '+FONT; ctx.fillStyle='#777'; ctx.textAlign='right'; ctx.fillText('toca para empezar',W-16,H-14); }
  } else if(S.state==='ending'){
    if(E.heldT>0.8){
      const a=Math.min(1,(E.heldT-0.8)*1.5);
      ctx.save(); ctx.globalAlpha=a;
      const gr=ctx.createLinearGradient(0,0,0,250); gr.addColorStop(0,'rgba(8,8,10,0.85)'); gr.addColorStop(1,'rgba(8,8,10,0)'); ctx.fillStyle=gr; ctx.fillRect(0,0,W,250);
      centerText('¡HORUS ESTÁ DE VUELTA!',100,80,'#f2c230','#f2c230');
      centerText('KRANEO · METAL ASSAULT · FIN',146,34,'#D3121B','#D3121B');
      centerText('PUNTOS '+S.score+(S.newBest?'  ·  ¡NUEVO RÉCORD!':'  ·  RÉCORD '+best),182,28,'#FFD52A');
      ctx.restore();
    }
    if(S.introT>5.5 && Math.floor(S.t*2.5)%2===0){ ctx.font='600 26px '+FONT; ctx.fillStyle='#f2c230'; ctx.textAlign='center'; ctx.fillText('TOCA PARA VOLVER AL MENÚ',W/2,H-18); }
  } else if(S.state==='win' && S.endT>0.5 && S.level===3){
    ctx.fillStyle='rgba(8,8,10,'+Math.min(0.55,(S.endT-0.5))+')'; ctx.fillRect(0,0,W,H);
    centerText('¡CAMPEÓN DE LA ARENA!',215,92,'#D4A83A','#D4A83A');
    centerText('Don Pig: «Señores, el que gana cobra.»',268,36,'#fff');
    centerText('ACERTIJOS '+R.marks.filter(Boolean).length+'/5  ·  PUNTOS '+S.score+(S.newBest?'  ·  ¡NUEVO RÉCORD!':'  ·  RÉCORD '+best),312,32,'#FFD52A');
    if(S.endT>1.1 && Math.floor(S.t*2.5)%2===0) centerText('TOCA PARA RECUPERAR A HORUS',392,44,'#f2c230');
  } else if(S.state==='lose' && S.endT>0.3 && S.level===3){
    ctx.fillStyle='rgba(8,8,10,'+Math.min(0.6,S.endT)+')'; ctx.fillRect(0,0,W,H);
    centerText('GAME OVER',220,130,'#D4A83A','#D4A83A');
    centerText('El que pierde… lava los platos.',275,34,'#fff');
    centerText('PUNTOS '+S.score+(S.newBest?'  ·  ¡NUEVO RÉCORD!':'  ·  RÉCORD '+best),320,34,'#FFD52A');
    if(S.endT>1.1 && Math.floor(S.t*2.5)%2===0) centerText('TOCA PARA REINTENTAR EL NIVEL 3',395,44,'#FF2A2A');
  } else if(S.state==='win' && S.endT>0.5){
    ctx.fillStyle='rgba(8,8,10,'+Math.min(0.55,(S.endT-0.5))+')'; ctx.fillRect(0,0,W,H);
    const sc2=S.newBest?'  ·  ¡NUEVO RÉCORD!':'  ·  RÉCORD '+best;
    if(S.level===1){
      centerText('K.O.',230,190,'#FF2A2A','#D3121B');
      centerText('Glitchy se desconectó del servidor',285,36,'#fff');
      centerText('PUNTOS '+S.score+sc2,330,34,'#FFD52A');
      if(S.endT>1.1 && Math.floor(S.t*2.5)%2===0) centerText('TOCA PARA EL NIVEL 2',400,44,'#FF7A1A');
    } else {
      centerText('¡CONTROL RECUPERADO!',220,96,'#FF2A2A','#D3121B');
      centerText('Crazyman huyó… pero ya pide revancha',275,36,'#fff');
      centerText('PUNTOS '+S.score+sc2,320,34,'#FFD52A');
      if(S.endT>1.1 && Math.floor(S.t*2.5)%2===0) centerText('TOCA PARA EL NIVEL 3',395,44,'#D4A83A');
    }
  } else if(S.state==='lose' && S.endT>0.3){
    ctx.fillStyle='rgba(8,8,10,'+Math.min(0.6,S.endT)+')'; ctx.fillRect(0,0,W,H);
    const sc2=S.newBest?'  ·  ¡NUEVO RÉCORD!':'  ·  RÉCORD '+best;
    centerText('GAME OVER',220,130,S.level===1?'#8f66ff':'#FF7A1A',S.level===1?'#7B4DFF':'#FF7A1A');
    centerText(S.level===1?'El LAG ganó esta vez… ¡pero Kraneo no se rinde!':'Crazyman se quedó con tu control…',275,34,'#fff');
    centerText('PUNTOS '+S.score+sc2,320,34,'#FFD52A');
    if(S.endT>1.1 && Math.floor(S.t*2.5)%2===0) centerText(S.level===1?'TOCA PARA REINTENTAR':'TOCA PARA REINTENTAR EL NIVEL 2',395,44,'#FF2A2A');
  }
}
function drawAim(){
  if(!aim||S.state!=='play') return;
  const v=launchVel(aim), h=handPos();
  if(Math.hypot(aim.sx-aim.cx,aim.sy-aim.cy)>=18){ ctx.strokeStyle='rgba(211,18,27,0.5)'; ctx.lineWidth=2; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(aim.sx,aim.sy); ctx.lineTo(aim.cx,aim.cy); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(aim.sx,aim.sy,6,0,7); ctx.strokeStyle='#D3121B'; ctx.stroke(); }
  let x=h.x,y=h.y,vx=v.vx,vy=v.vy;
  for(let i=0;i<26;i++){ const dt=0.035; vy+=GRAV*dt; x+=vx*dt; y+=vy*dt; if(y>GY||x>W) break; if(i%2===0){ ctx.globalAlpha=1-i/26; ctx.fillStyle='#FF2A2A'; ctx.beginPath(); ctx.arc(x,y,3.5,0,7); ctx.fill(); } }
  ctx.globalAlpha=1;
}
function draw(){
  const calm=reduceMotion.matches;
  ctx.setTransform(sc,0,0,sc,0,0);
  ctx.save(); if(S.shake>0 && !calm) ctx.translate(rnd(-1,1)*S.shake,rnd(-1,1)*S.shake);
  drawBg();
  if(S.level===3){
    drawDonPig();
    drawCage(830,false);
    if(HOR.mode==='cage') drawHorus(HOR.x,GY-8,'sit');
    drawCage(830,true);
    if(HOR.mode==='run') drawHorus(HOR.x,GY,'run');
    if(S.state!=='intro3'&&S.state!=='ending'){ drawPlaques(); drawRiddlePanel(); }
    drawKraneo();
    if(HOR.mode==='jump') drawHorus(HOR.x,HOR.y,'held');
    if(HOR.mode==='held') drawHorus(K.x+16,GY+K.jy-122+Math.sin(S.t*3)*1.5,'held');
    drawWaves();
  } else if(S.level===2){
    for(const c of crates) if(!c.broken) drawCrate(c);
    drawPickup();
    drawCrazyman();
    drawKraneo();
    for(const c of cans) drawCan(c.x,c.y,c.rot);
  } else {
    drawKraneo();
    drawGlitchy();
    for(const c of cubes) drawCube(c);
  }
  for(const s of stones) drawStone(s.x,s.y,s.r,s.rot,s.shape,s.dead?Math.max(0,s.fade/0.9):1);
  for(const p of parts){ ctx.globalAlpha=Math.max(0,p.life/p.max); ctx.fillStyle=p.c; ctx.fillRect(p.x-p.s/2,p.y-p.s/2,p.s,p.s); } ctx.globalAlpha=1;
  drawAim();
  if(K.sayT>0 && K.say) bubble(K.x+20,GY+K.jy-250+K.cr*70,K.say,'#D3121B');
  if(S.level===1 && G.sayT>0 && !G.dead && G.say) bubble(G.x-20,G.y-62,G.say,'#7B4DFF');
  if(S.level===2 && C.sayT>0 && C.say && C.x<W+40) bubble(C.x-10,GY+C.hop-232,C.say,'#FF7A1A');
  if(S.level===3 && D.sayT>0 && D.say) bubble(D.x-20,GY-238,D.say,'#D4A83A');
  for(const t of texts){ ctx.save(); ctx.globalAlpha=Math.min(1,t.life/t.max*1.6); ctx.font='700 '+t.size+'px '+FONT; ctx.textAlign='center'; ctx.lineWidth=5; ctx.strokeStyle='#0a0a0c'; ctx.strokeText(t.txt,t.x,t.y); ctx.fillStyle=t.c; ctx.fillText(t.txt,t.x,t.y); ctx.restore(); }
  ctx.restore();
  if(S.state!=='menu'&&S.state!=='ending') drawHUD();
  drawOverlay();
  if(S.glitchT>0){
    if(!calm){
      ctx.setTransform(1,0,0,1,0,0);
      for(let i=0;i<7;i++){ const sy=Math.random()*cv.height, sh=rnd(6,40)*dpr, dx=rnd(-50,50)*dpr; try{ ctx.drawImage(cv,0,sy,cv.width,sh,dx,sy,cv.width,sh); }catch(e){} }
      ctx.setTransform(sc,0,0,sc,0,0);
    }
    ctx.fillStyle='rgba(0,229,255,0.06)'; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.textAlign='center'; ctx.font='700 64px '+FONT;
    ctx.fillStyle='#FF2A2A'; ctx.fillText('LAG 999 ms',W/2+3,H/2); ctx.fillStyle='#00E5FF'; ctx.fillText('LAG 999 ms',W/2-3,H/2);
    ctx.fillStyle='#fff'; ctx.font='600 30px '+FONT; ctx.fillText('RECONECTANDO…',W/2,H/2+38); ctx.restore();
  }
  ctx.fillStyle='rgba(0,0,0,0.12)'; for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
}

/* ---------- Bucle: solo mientras el juego está en pantalla ---------- */
let active=false, raf=0, last=0;
function frame(now){
  raf=0;
  if(!active || document.hidden) return;
  const dt=Math.min(0.033,(now-last)/1000); last=now;
  update(dt); draw();
  raf=requestAnimationFrame(frame);
}
function start(){ if(raf || !active || document.hidden) return; last=performance.now(); raf=requestAnimationFrame(frame); }
function stop(){ if(raf) cancelAnimationFrame(raf); raf=0; }
function show(){ active=true; resize(); start(); }
function hide(){
  active=false; stop(); releaseKeys();
  if(isMax()) exitMax();
  try{ if(AC && AC.state==='running') AC.suspend(); }catch(e){}
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden){ stop(); releaseKeys(); } else start(); });
window.KraneoGame = { show: show, hide: hide };
})();
