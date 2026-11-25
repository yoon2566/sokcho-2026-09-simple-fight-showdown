(()=>{'use strict';
const {THREE,cloneSkinned,loadEmbeddedGLB}=Game3D;
const $=id=>document.getElementById(id);
const TAU=Math.PI*2;
const ARENA=11;
const BEST_KEY='sfs_arena_best';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

const HEROES=[
 {key:'crimson',name:'청록 장갑형',desc:'연타가 빠르고 가드가 단단함',color:0x43e6d1,hp:120,speed:5.0,damage:9,dashCd:.8},
 {key:'ember',name:'주황 중무기형',desc:'느리지만 묵직한 강타',color:0xff9353,hp:150,speed:4.1,damage:13,dashCd:1.0},
 {key:'duelist',name:'쌍검 민첩형',desc:'가장 빠르고 회피가 좋음',color:0xffd374,hp:100,speed:5.8,damage:8,dashCd:.6},
];

const ENEMY_TYPES={
 grunt:{name:'잡병',model:'duelist',scale:.85,color:0xff7a6b,hp:46,speed:3.1,damage:12,score:10,meter:10,cool:.45,strafe:true,
   atk:{wind:.5,active:.14,recover:.5,range:1.7,arc:1.5,anim:'BasicAttack',lunge:.25}},
 brute:{name:'중장갑',model:'ember',scale:1.12,color:0xff4b4b,hp:150,speed:2.3,damage:26,score:35,meter:28,cool:1.0,armor:true,
   atk:{wind:.95,active:.22,recover:.9,range:2.4,arc:2.1,anim:'Skill_01',heavy:true}},
 dasher:{name:'돌격병',model:'cyan',scale:.95,color:0xbf7bff,hp:58,speed:3.6,damage:16,score:20,meter:16,cool:.8,dash:true,
   atk:{wind:.55,active:.32,recover:.6,range:1.5,arc:1.2,anim:'Skill_02',dash:true,lunge:1.1}},
};

const COMBO=[
 {wind:.1,active:.12,recover:.18,range:2.0,arc:1.8,mult:1,lunge:.3,anim:'BasicAttack'},
 {wind:.08,active:.12,recover:.2,range:2.1,arc:1.8,mult:1.1,lunge:.3,anim:'Attack2'},
 {wind:.16,active:.16,recover:.4,range:2.5,arc:2.3,mult:1.8,lunge:.8,anim:'Skill_01',knock:true},
];
const HEAVY={wind:.42,active:.16,recover:.5,range:2.9,arc:1.1,mult:2.6,lunge:.6,anim:'Skill_02',knock:true,heavy:true};

const UPGRADES=[
 {name:'공격력 +20%',desc:'모든 공격 피해가 늘어납니다',apply:()=>{stats.dmg*=1.2}},
 {name:'최대 체력 +25',desc:'최대 체력이 오르고 40 회복합니다',apply:()=>{hero.maxHp+=25;hero.hp=Math.min(hero.maxHp,hero.hp+40)}},
 {name:'이동 속도 +12%',desc:'더 빠르게 전장을 누빕니다',apply:()=>{stats.speed*=1.12}},
 {name:'회피 쿨 -25%',desc:'대시를 더 자주 쓸 수 있습니다',apply:()=>{stats.dashMul*=.75}},
 {name:'가드 효율 +40%',desc:'가드 에너지를 더 오래 씁니다',apply:()=>{stats.guardMul*=1.4}},
 {name:'필살 충전 +50%',desc:'필살기 게이지가 빨리 찹니다',apply:()=>{stats.meterMul*=1.5}},
];

let renderer,scene,camera,clock,ac=null;
const templates={};
let state='loading',hero=null,preview=null,enemies=[];
let selectedHero=0,stats=null,wave=0,queue=[],spawnT=0,intro=0;
let kills=0,score=0,combo=0,comboTimer=0,best=0;
let hitStop=0,shake=0,flash=0,bannerT=0,attackBuf=0,overT=0,time=0;
let camYaw=Math.PI,camPitch=.2;
const CAM_DIST=7.5;
const fxList=[],floats=[],keys=new Set(),mouse={l:false,r:false};
let partGeo,ringGeo;

function freshStats(){return {dmg:1,speed:1,dashMul:1,guardMul:1,meterMul:1}}
try{best=Number(localStorage.getItem(BEST_KEY)||0)}catch(e){}

function beep(freq,dur,type='square',vol=.04){
  if(!ac)return;
  const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.6),t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+dur);
}

function showBanner(text,dur=1.2){
  const b=$('banner');b.textContent=text;b.classList.add('show');bannerT=dur;
}

function addFx(obj,life,fn){scene.add(obj);fxList.push({obj,life,max:life,fn})}
function disposeObj(o){
  o.traverse(c=>{
    if(c.geometry&&c.geometry!==partGeo&&c.geometry!==ringGeo)c.geometry.dispose();
    if(c.material)c.material.dispose();
  });
}
function updateFx(dt){
  for(let i=fxList.length-1;i>=0;i--){
    const f=fxList[i];f.life-=dt;
    const u=clamp(1-f.life/f.max,0,1);
    if(f.fn)f.fn(f.obj,u,dt);
    if(f.life<=0){scene.remove(f.obj);disposeObj(f.obj);fxList.splice(i,1)}
  }
}
function ring(pos,color,radius,life=.4){
  const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  m.rotation.x=-Math.PI/2;m.position.set(pos.x,.05,pos.z);
  addFx(m,life,(o,u)=>{o.scale.setScalar(radius*(.25+.75*u));o.material.opacity=.9*(1-u)});
}
function burst(pos,color,n=12,speed=3.2){
  const g=new THREE.Group();g.position.copy(pos);g.position.y=Math.max(.6,pos.y);
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(partGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false}));
    m.userData.v=new THREE.Vector3(rand(-1,1),rand(.3,1),rand(-1,1)).normalize().multiplyScalar(rand(.4,1)*speed);
    g.add(m);
  }
  addFx(g,.45,(o,u,dt)=>{for(const m of o.children){m.position.addScaledVector(m.userData.v,dt);m.userData.v.y-=12*dt;m.material.opacity=1-u}});
}
function floatText(pos,text,cls){
  const el=document.createElement('div');el.className='dmg '+cls;el.textContent=text;
  $('fx').appendChild(el);
  floats.push({el,p:pos.clone(),t:0});
}
function projectTo(p){
  const v=p.clone().project(camera);
  return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,z:v.z};
}

function makeActor(opts){
  const tpl=templates[opts.key];
  const root=new THREE.Group();scene.add(root);
  const model=cloneSkinned(tpl.scene);
  model.scale.setScalar(opts.scale||1);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false}});
  root.add(model);
  const mixer=new THREE.AnimationMixer(root);
  const actions={};
  for(const clip of tpl.animations)actions[clip.name]=mixer.clipAction(clip);
  const a={isHero:!!opts.isHero,key:opts.key,color:opts.color,type:opts.type||null,root,pos:root.position,model,mixer,actions,anim:'',
    hp:opts.hp,maxHp:opts.maxHp,facing:opts.facing||0,vel:new THREE.Vector3(),kv:new THREE.Vector3(),lungeVel:new THREE.Vector3(),
    stunT:0,invuln:0,parryT:0,parryCd:0,counterT:0,cool:0,attack:null,dead:false,deadT:0,squash:0,guarding:false,guardT:0,wasGuard:false,guardEnergy:100,
    dashT:0,dashCd:0,dashDir:new THREE.Vector3(),heavyCd:0,comboIdx:0,comboT:0,meter:0,spawnT:0,removed:false,bar:null,seed:rand(0,10)};
  root.position.set(0,0,0);
  return a;
}

const CLIP_ALIAS={
  crimson:{
    Idle:{clip:'Walking',freeze:true},Hit:{clip:'Walking',freeze:true},
    Guard:{clip:'Sword_Parry'},
    Run:{clip:'Running'},Dodge:{clip:'Running',noScale:true},
    BasicAttack:{clip:'Left_Hook_from_Guard'},Skill_01:{clip:'Step_Step_Turn_Kick'},Skill_02:{clip:'Male_Head_Down_Charge'},
    Attack2:{clip:'Right_Jab_from_Guard'},Fall:{clip:'Fall3'}
  }
};
const CLIP_FALLBACK={Attack2:'BasicAttack'};

function setAction(a,name,opts={}){
  let clipName=name,alias=null;
  if(!a.actions[name]){
    alias=(CLIP_ALIAS[a.key]||{})[name]||null;
    if(alias)clipName=alias.clip;
    else if(CLIP_FALLBACK[name])clipName=CLIP_FALLBACK[name];
  }
  const act=a.actions[clipName];
  if(!act)return;
  if(a.anim===name&&!opts.restart)return;
  const prev=a.clip?a.actions[a.clip]:null;
  if(prev&&prev!==act)prev.fadeOut(.12);
  const loop=name==='Idle'||name==='Run'||name==='Guard';
  const scaled=opts.duration&&!(alias&&alias.noScale);
  act.reset().setEffectiveWeight(1);
  act.setEffectiveTimeScale(alias&&alias.freeze?0:scaled?act.getClip().duration/opts.duration:1);
  act.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,Infinity);
  act.clampWhenFinished=!loop;
  act.fadeIn(.12).play();
  a.anim=name;a.clip=clipName;
}

function driveAnim(a,moving){
  if(a.dead||a.attack||a.stunT>0||a.dashT>0)return;
  setAction(a,a.guarding?'Guard':moving?'Run':'Idle');
}

function facingVec(a){return {x:Math.sin(a.facing),z:Math.cos(a.facing)}}
function wedgeMesh(range,arc,color){
  const steps=Math.max(8,Math.ceil(arc*10));const v=[0,.04,0];
  for(let i=0;i<=steps;i++){const th=-arc/2+arc*i/steps;v.push(Math.sin(th)*range,.04,Math.cos(th)*range)}
  const idx=[];for(let i=1;i<=steps;i++)idx.push(0,i,i+1);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);
  return new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.15,side:THREE.DoubleSide,depthWrite:false}));
}

function canAct(a){
  if(a.dead||a.stunT>0||a.dashT>0||a.guarding)return false;
  return true;
}
function cancelable(at){
  const d=at.def;
  if(d.heavy)return at.t>=d.wind+d.active+d.recover;
  return at.t>=d.wind+d.active;
}
function startAttack(a,def,dmg){
  endAttack(a);
  const total=def.wind+def.active+def.recover;
  a.attack={def,t:0,hit:new Set(),dmg,started:false,tele:null};
  if(!a.isHero&&def.range){
    const tele=wedgeMesh(def.range,def.arc,a.type.color);
    a.root.add(tele);a.attack.tele=tele;
  }
  setAction(a,def.anim,{duration:total,restart:true});
}
function endAttack(a){
  if(!a.attack)return;
  if(a.attack.tele){a.root.remove(a.attack.tele);disposeObj(a.attack.tele)}
  a.attack=null;
  if(!a.isHero&&a.type)a.cool=a.type.cool;
}
function nearestEnemy(a,range){
  let best=null,bd=range;
  for(const e of enemies){
    if(e.dead||e.spawnT>0)continue;
    const d=Math.hypot(e.pos.x-a.pos.x,e.pos.z-a.pos.z);
    if(d<bd){bd=d;best=e}
  }
  return best;
}
function targetsOf(a){
  if(a.isHero)return enemies.filter(e=>!e.dead&&e.spawnT<=0);
  return hero&&!hero.dead?[hero]:[];
}
function strike(a,at){
  const d=at.def,f=a.facing;
  for(const t of targetsOf(a)){
    if(at.hit.has(t))continue;
    const dx=t.pos.x-a.pos.x,dz=t.pos.z-a.pos.z;
    if(Math.hypot(dx,dz)>d.range+.35)continue;
    if(Math.abs(wrap(Math.atan2(dx,dz)-f))>d.arc/2+.1)continue;
    at.hit.add(t);
    hurt(t,at.dmg,a,d);
  }
}
function updateAttack(a,dt){
  const at=a.attack,d=at.def;
  at.t+=dt;
  const total=d.wind+d.active+d.recover;
  if(at.t>=d.wind&&at.t<d.wind+d.active){
    if(at.tele){a.root.remove(at.tele);disposeObj(at.tele);at.tele=null}
    if(!at.started){
      at.started=true;
      if(d.lunge&&!d.dash){const f=facingVec(a);a.lungeVel.set(f.x*d.lunge*8,0,f.z*d.lunge*8)}
    }
    if(d.dash){const f=facingVec(a);a.lungeVel.set(f.x*d.lunge*8,0,f.z*d.lunge*8)}
    strike(a,at);
  }else if(at.t<d.wind&&at.tele){
    at.tele.material.opacity=.12+.32*(at.t/d.wind);
  }
  if(at.t>=total)endAttack(a);
}

function tryAttack(){
  const h=hero;
  if(!h||!canAct(h))return false;
  if(h.attack&&!cancelable(h.attack))return false;
  const aim=nearestEnemy(h,3.2);
  h.facing=aim?Math.atan2(aim.pos.x-h.pos.x,aim.pos.z-h.pos.z):camYaw;
  const idx=h.comboT>0?h.comboIdx:0;
  const def=COMBO[idx];
  h.comboIdx=(idx+1)%COMBO.length;h.comboT=1.1;
  const cm=h.counterT>0?1.6:1;h.counterT=0;
  startAttack(h,def,HEROES[selectedHero].damage*stats.dmg*def.mult*cm);
  beep(330+idx*60,.05,'triangle',.03);
  return true;
}
function tryHeavy(){
  const h=hero;
  if(!h||!canAct(h)||h.heavyCd>0)return false;
  if(h.attack&&!cancelable(h.attack))return false;
  const aim=nearestEnemy(h,3.2);
  h.facing=aim?Math.atan2(aim.pos.x-h.pos.x,aim.pos.z-h.pos.z):camYaw;
  h.heavyCd=1.3;
  const cm=h.counterT>0?1.6:1;h.counterT=0;
  startAttack(h,HEAVY,HEROES[selectedHero].damage*stats.dmg*HEAVY.mult*cm);
  beep(150,.12,'sawtooth',.04);
  return true;
}
function tryDash(){
  const h=hero;
  if(!h||h.dead||h.stunT>0||h.dashT>0||h.dashCd>0)return false;
  if(h.attack&&!cancelable(h.attack))return false;
  const m=moveInput();
  let dx=m.x,dz=m.z;
  if(!m.moving){const f=facingVec(h);dx=f.x;dz=f.z}
  endAttack(h);
  h.guarding=false;
  h.dashDir.set(dx,0,dz);
  h.facing=Math.atan2(dx,dz);
  h.dashT=.22;h.invuln=.25;
  h.dashCd=HEROES[selectedHero].dashCd*stats.dashMul;
  setAction(h,'Dodge',{duration:.22,restart:true});
  ring(h.pos,h.color,1.1,.3);
  beep(500,.08,'sine',.03);
  return true;
}
function trySpecial(){
  const h=hero;
  if(!h||!canAct(h)||h.meter<100)return false;
  h.meter=0;
  const dmg=HEROES[selectedHero].damage*stats.dmg*2.8;
  for(const e of enemies){
    if(e.dead||e.spawnT>0)continue;
    if(Math.hypot(e.pos.x-h.pos.x,e.pos.z-h.pos.z)<4.6)hurt(e,dmg,h,{heavy:true,knock:true});
  }
  ring(h.pos,0xffffff,4.6,.5);
  burst(h.pos,h.color,24,5);
  hitStop=Math.max(hitStop,.09);shake=Math.max(shake,.5);
  showBanner('필살기!',.8);beep(180,.4,'sawtooth',.05);
  setAction(h,'Skill_02',{duration:.5,restart:true});
  return true;
}

function tryParry(){
  const h=hero;
  if(!h||h.dead||h.stunT>0||h.dashT>0||h.parryCd>0||h.attack)return false;
  h.parryT=.22;h.parryCd=.8;
  ring(h.pos,0xbfefff,1.2,.25);
  beep(760,.08,'triangle',.03);
  return true;
}
function addCombo(dmg){
  combo++;comboTimer=2.2;score+=Math.round(dmg);
}
function addMeter(h,amount){
  if(!h)return;
  h.meter=Math.min(100,h.meter+amount*stats.meterMul);
}

function stagger(t,src,dur,force){
  if(dur>=.2)endAttack(t);
  t.stunT=Math.max(t.stunT,dur);
  if(dur>=.2)setAction(t,'Hit',{restart:true});
  const dx=t.pos.x-src.pos.x,dz=t.pos.z-src.pos.z,d=Math.hypot(dx,dz)||1;
  t.kv.x+=dx/d*force;t.kv.z+=dz/d*force;
  hitStop=Math.max(hitStop,.04);
}
function parry(h,e){
  stagger(e,h,1.0,0);
  addMeter(h,25);
  h.parryT=0;h.counterT=3;
  ring(e.pos,0xffffff,1.6,.35);
  burst(h.pos.clone().add(new THREE.Vector3(0,1,0)),0xffffff,14,4);
  hitStop=Math.max(hitStop,.09);shake=Math.max(shake,.2);
  showBanner('PARRY!',.6);beep(900,.12,'square',.05);
}
function hurt(t,dmg,src,def){
  if(t.dead||t.invuln>0)return false;
  const ang=wrap(Math.atan2(src.pos.x-t.pos.x,src.pos.z-t.pos.z)-t.facing);
  const front=Math.abs(ang)<1.3;
  const heavy=!!def.heavy;
  if(t.isHero&&front&&!heavy&&(t.parryT>0||(t.guarding&&t.guardT<.2))){parry(t,src);return false}
  const hitPos=t.pos.clone();hitPos.y=1.2;
  if(t.guarding&&front){
    t.guardEnergy=Math.max(0,t.guardEnergy-(heavy?40:16)/stats.guardMul);
    dmg*=.2;
    burst(hitPos,0x9bd3ff,8,3);beep(520,.06,'triangle',.03);
    if(t.guardEnergy<=0){t.guarding=false;stagger(t,src,.9,4);showBanner('가드 붕괴',.8)}
    else stagger(t,src,heavy?.2:.07,heavy?1.5:.6);
  }else if(heavy){
    stagger(t,src,.5,6);
  }else if(!(t.type&&t.type.armor)){
    stagger(t,src,.26,2.2);
  }
  t.hp-=dmg;
  floatText(hitPos,String(Math.round(dmg)),t.isHero?'hurt':'dmg');
  t.squash=.3;
  if(src.isHero){addMeter(src,4);addCombo(dmg)}
  if(t.isHero){flash=.45;shake=Math.max(shake,.3);beep(150,.12,'sawtooth',.04)}
  else beep(220,.06,'square',.02);
  if(t.hp<=0)kill(t,src);
  return true;
}
function kill(t,src){
  t.dead=true;t.hp=0;t.stunT=0;t.guarding=false;t.deadT=1.4;
  endAttack(t);
  setAction(t,'Fall',{restart:true});
  burst(t.pos.clone(),t.color,26,5);
  if(t.isHero){
    state='dying';overT=1.6;
    showBanner('쓰러졌습니다',1.6);
    beep(90,.6,'sawtooth',.05);
    return;
  }
  kills++;score+=t.type.score;
  addMeter(hero,t.type.meter);
  hitStop=Math.max(hitStop,.07);shake=Math.max(shake,.15);
  if(t.bar)t.bar.style.opacity='0';
}

function moveInput(){
  const fwd=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
  const side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const fx=Math.sin(camYaw),fz=Math.cos(camYaw);
  let x=fx*fwd-fz*side,z=fz*fwd+fx*side;
  const l=Math.hypot(x,z);
  return l?{x:x/l,z:z/l,moving:true}:{x:0,z:0,moving:false};
}

function updateHero(dt){
  const h=hero;const m=moveInput();
  h.parryT=Math.max(0,h.parryT-dt);
  h.parryCd=Math.max(0,h.parryCd-dt);
  h.counterT=Math.max(0,h.counterT-dt);
  const wantGuard=(keys.has('KeyF')||mouse.r)&&h.stunT<=0&&h.dashT<=0&&!h.attack&&!h.dead;
  h.guarding=wantGuard&&h.guardEnergy>0;
  if(h.guarding&&!h.wasGuard){h.guardT=0}
  h.wasGuard=h.guarding;
  h.guardT+=dt;
  if(!h.guarding)h.guardEnergy=Math.min(100,h.guardEnergy+22*stats.guardMul*dt);
  if(h.guarding)h.facing=camYaw;
  if(h.dashT>0){
    h.dashT-=dt;
    h.vel.set(h.dashDir.x*10.5,0,h.dashDir.z*10.5);
    if(h.dashT<=0)h.vel.set(0,0,0);
    return;
  }
  let speed=HEROES[selectedHero].speed*stats.speed;
  if(h.dead||h.stunT>0)speed=0;
  if(h.guarding)speed*=.4;
  if(h.attack)speed*=h.attack.t<h.attack.def.wind+h.attack.def.active?.2:.5;
  if(m.moving&&!h.attack&&!h.guarding&&h.stunT<=0)h.facing=Math.atan2(m.x,m.z);
  const tx=m.moving?m.x*speed:0,tz=m.moving?m.z*speed:0;
  const k=1-Math.exp(-(m.moving?16:22)*dt);
  h.vel.x+=(tx-h.vel.x)*k;h.vel.z+=(tz-h.vel.z)*k;
}

function updateEnemy(e,dt){
  if(e.spawnT>0){
    e.spawnT-=dt;
    if(e.spawnT<=0){e.root.visible=true;burst(e.pos,e.type.color,10,2)}
    return;
  }
  if(e.dead)return;
  const dx=hero.pos.x-e.pos.x,dz=hero.pos.z-e.pos.z,d=Math.hypot(dx,dz);
  let wx=0,wz=0;
  if(!hero.dead&&e.stunT<=0&&!e.attack){
    e.facing+=wrap(Math.atan2(dx,dz)-e.facing)*Math.min(1,dt*7);
    const reach=e.type.atk.range*.85+.3;
    const trigger=e.type.dash?5:reach;
    if(d>trigger){
      let ux=dx/d,uz=dz/d;
      if(e.type.strafe){
        const a=Math.sin(time*1.2+e.seed)*.6;
        const c=Math.cos(a),s=Math.sin(a);
        [ux,uz]=[ux*c-uz*s,ux*s+uz*c];
      }
      wx=ux*e.type.speed;wz=uz*e.type.speed;
    }else if(e.cool<=0){
      startAttack(e,e.type.atk,e.type.damage);
    }
  }
  const k=1-Math.exp(-8*dt);
  e.vel.x+=(wx-e.vel.x)*k;e.vel.z+=(wz-e.vel.z)*k;
}

function integrate(a,dt){
  a.pos.x+=(a.vel.x+a.lungeVel.x+a.kv.x)*dt;
  a.pos.z+=(a.vel.z+a.lungeVel.z+a.kv.z)*dt;
  const r=Math.hypot(a.pos.x,a.pos.z);
  if(r>ARENA){a.pos.x*=ARENA/r;a.pos.z*=ARENA/r}
}
function separate(list){
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
    const a=list[i],b=list[j];
    if(a.spawnT>0||b.spawnT>0||a.dead||b.dead)continue;
    const dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,d=Math.hypot(dx,dz);
    const min=.6;
    if(d>0&&d<min){
      const push=(min-d)*.5,ux=dx/d,uz=dz/d;
      a.pos.x-=ux*push;a.pos.z-=uz*push;b.pos.x+=ux*push;b.pos.z+=uz*push;
    }
  }
}
function updateCommon(a,dt,moving){
  a.invuln=Math.max(0,a.invuln-dt);
  a.stunT=Math.max(0,a.stunT-dt);
  a.cool=Math.max(0,a.cool-dt);
  a.dashCd=Math.max(0,a.dashCd-dt);
  a.heavyCd=Math.max(0,a.heavyCd-dt);
  a.squash=Math.max(0,a.squash-dt*5);
  a.kv.multiplyScalar(Math.exp(-9*dt));
  a.lungeVel.multiplyScalar(Math.exp(-14*dt));
  const breath=!a.attack&&a.anim==='Idle'&&!a.dead?Math.sin(time*2.6+a.seed)*.012:0;
  a.root.scale.set(1+a.squash*.5,1-a.squash*.4+breath,1+a.squash*.5);
  a.root.rotation.y=a.facing;
  if(!a.attack&&!a.dead&&a.isHero&&a.stunT<=0&&a.dashT<=0)a.root.rotation.x=moving?.08:0;
  a.mixer.update(dt);
}

function makeBar(type){
  const el=document.createElement('div');el.className='ebar';
  el.innerHTML='<b></b><div class="bar"><i></i></div>';
  el.querySelector('b').textContent=type.name;
  $('fx').appendChild(el);
  return el;
}
function spawnEnemy(type){
  const ang=rand(0,TAU);
  const e=makeActor({key:type.model,scale:type.scale,color:type.color,type,hp:0,maxHp:0});
  e.pos.set(Math.cos(ang)*(ARENA-.8),0,Math.sin(ang)*(ARENA-.8));
  e.maxHp=e.hp=Math.round(type.hp*(1+(wave-1)*.18));
  e.facing=Math.atan2(hero.pos.x-e.pos.x,hero.pos.z-e.pos.z);
  e.spawnT=.9;e.cool=rand(.3,.9);
  e.root.visible=false;
  e.bar=makeBar(type);
  enemies.push(e);
  ring(e.pos,type.color,1.3,.6);
}

const TYPE_WEIGHTS=[['grunt',1,1],['brute',2,.35],['dasher',3,.45]];
function beginWave(){
  wave++;
  const total=3+wave*2;
  queue=[];
  for(let i=0;i<total;i++){
    let sum=0;const pool=[];
    for(const [k,minWave,w] of TYPE_WEIGHTS){if(wave>=minWave){pool.push([k,w]);sum+=w}}
    let r=Math.random()*sum;let pick=pool[0][0];
    for(const [k,w] of pool){if(r<w){pick=k;break}r-=w}
    queue.push(ENEMY_TYPES[pick]);
  }
  spawnT=.6;intro=2;
  showBanner('WAVE '+wave,1.8);
  state='play';
}
function waveClear(){
  state='upgrade';
  if(document.pointerLockElement)document.exitPointerLock();
  score+=wave*50;
  hero.hp=Math.min(hero.maxHp,hero.hp+hero.maxHp*.15);
  const pool=UPGRADES.slice().sort(()=>Math.random()-.5).slice(0,3);
  const box=$('upgradeCards');box.innerHTML='';
  for(const u of pool){
    const b=document.createElement('button');b.className='card';
    b.innerHTML='<strong></strong><small></small>';
    b.querySelector('strong').textContent=u.name;
    b.querySelector('small').textContent=u.desc;
    b.onclick=()=>{u.apply();$('upgrade').classList.add('hidden');beginWave()};
    box.appendChild(b);
  }
  $('upgrade').classList.remove('hidden');
}
function gameOver(){
  state='over';
  if(document.pointerLockElement)document.exitPointerLock();
  if(score>best){best=score;try{localStorage.setItem(BEST_KEY,String(best))}catch(e){}}
  $('overStats').textContent='도달 웨이브 '+wave+' · 처치 '+kills+' · 점수 '+score+' · 최고 '+best;
  $('over').classList.remove('hidden');
  $('hud').classList.add('hidden');
}

function clearWorld(){
  for(const e of enemies){scene.remove(e.root);if(e.bar)e.bar.remove();e.removed=true}
  enemies=[];
  if(hero){scene.remove(hero.root);hero=null}
  if(preview){scene.remove(preview.root);preview=null}
  for(const f of fxList){scene.remove(f.obj);disposeObj(f.obj)}
  fxList.length=0;
  for(const f of floats)f.el.remove();
  floats.length=0;
  queue=[];
}

function showMenu(){
  clearWorld();
  state='menu';
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('over').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('upgrade').classList.add('hidden');
  $('bestText').textContent='최고 점수 '+best;
  $('banner').classList.remove('show');
  refreshHeroCards();
}
function refreshHeroCards(){
  document.querySelectorAll('[data-hero]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.hero)===selectedHero));
  if(state==='menu'){
    if(preview)scene.remove(preview.root);
    preview=makeActor({key:HEROES[selectedHero].key,color:HEROES[selectedHero].color,hp:1,maxHp:1,facing:0});
    setAction(preview,'Idle',{restart:true});
  }
  const h=HEROES[selectedHero];
  $('heroDesc').textContent=h.name+' · '+h.desc;
}

function startGame(){
  try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume()}catch(e){}
  clearWorld();
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  const base=HEROES[selectedHero];
  $('heroName').textContent=base.name;
  stats=freshStats();
  hero=makeActor({key:base.key,isHero:true,color:base.color,hp:base.hp,maxHp:base.hp,facing:Math.PI});
  hero.pos.set(0,0,ARENA*.45);
  setAction(hero,'Idle',{restart:true});
  wave=0;kills=0;score=0;combo=0;comboTimer=0;attackBuf=0;
  flash=0;shake=0;hitStop=0;
  beginWave();
}
function togglePause(){
  if(state==='play'){state='pause';$('pause').classList.remove('hidden');keys.clear();mouse.l=false;mouse.r=false;if(document.pointerLockElement)document.exitPointerLock()}
  else if(state==='pause'){state='play';$('pause').classList.add('hidden')}
}
function press(action){
  if(state!=='play')return;
  if(action==='attack'){if(!tryAttack())attackBuf=.15}
  else if(action==='heavy')tryHeavy();
  else if(action==='dash')tryDash();
  else if(action==='special')trySpecial();
  else if(action==='parry')tryParry();
}

const GAME_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','KeyJ','KeyK','KeyQ','KeyP','Space','ShiftLeft','ShiftRight','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',e=>{
  if(GAME_KEYS.has(e.code))e.preventDefault();
  if(e.repeat)return;
  keys.add(e.code);
  if(e.code==='KeyP'||e.code==='Escape'){togglePause();return}
  if(e.code==='KeyJ')press('attack');
  else if(e.code==='KeyK'||e.code==='Space')press('heavy');
  else if(e.code==='ShiftLeft'||e.code==='ShiftRight')press('dash');
  else if(e.code==='KeyQ')press('special');
  else if(e.code==='KeyE')press('parry');
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();mouse.l=false;mouse.r=false;if(state==='play')togglePause()});
$('view').addEventListener('mousedown',e=>{
  if(e.button===0){
    mouse.l=true;
    if(state==='play'&&document.pointerLockElement!==$('view')){try{$('view').requestPointerLock()}catch(err){}}
    press('attack');
  }
  if(e.button===2){mouse.r=true}
});
addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==$('view'))return;
  camYaw-=e.movementX*.0025;
  camPitch=clamp(camPitch+e.movementY*.002,-.1,.7);
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement!==$('view')&&state==='play')togglePause();
});
addEventListener('mouseup',e=>{if(e.button===0)mouse.l=false;if(e.button===2)mouse.r=false});
$('view').addEventListener('contextmenu',e=>e.preventDefault());

document.querySelectorAll('[data-hero]').forEach(b=>b.addEventListener('click',()=>{
  selectedHero=Number(b.dataset.hero);
  refreshHeroCards();
}));
$('startBtn').onclick=startGame;
$('retryBtn').onclick=startGame;
$('menuBtn').onclick=showMenu;
$('resumeBtn').onclick=togglePause;
$('pauseMenuBtn').onclick=showMenu;

function setupScene(){
  renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0e1822);
  scene.fog=new THREE.Fog(0x0e1822,22,42);
  camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,100);
  camera.position.set(0,10.5,12.5);
  scene.add(new THREE.HemisphereLight(0xc8e8ff,0x404850,1.3));
  const sun=new THREE.DirectionalLight(0xffead9,2.2);
  sun.position.set(-6,12,8);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;
  sun.shadow.camera.near=1;sun.shadow.camera.far=40;sun.shadow.bias=-.0005;
  scene.add(sun);

  const floor=new THREE.Mesh(new THREE.CircleGeometry(ARENA+1.5,72),new THREE.MeshStandardMaterial({color:0x2c3b47,roughness:.92}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(ARENA,.06,8,96),new THREE.MeshBasicMaterial({color:0x54ead6}));
  rim.rotation.x=Math.PI/2;rim.position.y=.02;scene.add(rim);
  const pillarMat=new THREE.MeshStandardMaterial({color:0x33434f,roughness:.8});
  for(let i=0;i<8;i++){
    const an=i/8*TAU;
    const p=new THREE.Mesh(new THREE.BoxGeometry(1.1,3.2,1.1),pillarMat);
    p.position.set(Math.cos(an)*(ARENA+2.4),1.6,Math.sin(an)*(ARENA+2.4));
    p.castShadow=true;p.receiveShadow=true;scene.add(p);
    const glow=new THREE.Mesh(new THREE.BoxGeometry(1.16,.12,1.16),new THREE.MeshBasicMaterial({color:0x54ead6}));
    glow.position.set(p.position.x,2.9,p.position.z);scene.add(glow);
  }
  partGeo=new THREE.SphereGeometry(.07,6,5);
  ringGeo=new THREE.RingGeometry(.92,1,48);
  clock=new THREE.Clock();
}

function updateCamera(dt){
  let desired,look;
  if(state==='menu'){
    desired=new THREE.Vector3(0,2.4,5.4);look=new THREE.Vector3(0,1.05,0);
  }else{
    const fx=Math.sin(camYaw),fz=Math.cos(camYaw),hz=CAM_DIST*Math.cos(camPitch),vy=CAM_DIST*Math.sin(camPitch)+1.6;
    const t=hero?hero.pos:new THREE.Vector3();
    desired=new THREE.Vector3(t.x-fx*hz,vy,t.z-fz*hz);look=new THREE.Vector3(t.x,1.1,t.z);
  }
  camera.position.lerp(desired,1-Math.exp(-dt*(state==='menu'?4:12)));
  shake=Math.max(0,shake-dt*1.6);
  if(shake>0)camera.position.add(new THREE.Vector3(rand(-1,1)*shake*.25,rand(-1,1)*shake*.2,0));
  camera.lookAt(look);
}

function updateLabels(){
  for(const e of enemies){
    if(!e.bar)continue;
    if(e.spawnT>0||e.dead){e.bar.style.display='none';continue}
    const p=projectTo(e.pos.clone().add(new THREE.Vector3(0,2.3,0)));
    if(p.z>1){e.bar.style.display='none';continue}
    e.bar.style.display='block';
    e.bar.style.left=p.x+'px';e.bar.style.top=p.y+'px';
    e.bar.querySelector('i').style.width=(100*clamp(e.hp/e.maxHp,0,1))+'%';
  }
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i];f.t+=1/60;
    const p=projectTo(f.p.clone().add(new THREE.Vector3(0,f.t*1.1,0)));
    f.el.style.left=p.x+'px';f.el.style.top=p.y+'px';
    f.el.style.opacity=String(Math.max(0,1-f.t*1.6));
    if(f.t>.7){f.el.remove();floats.splice(i,1)}
  }
}

function updateHUD(){
  const h=hero;
  if(!h)return;
  $('hpFill').style.width=(100*clamp(h.hp/h.maxHp,0,1))+'%';
  $('hpText').textContent=Math.max(0,Math.ceil(h.hp))+' / '+h.maxHp;
  $('guardFill').style.width=(100*h.guardEnergy/100)+'%';
  $('meterFill').style.width=(h.meter)+'%';
  $('meterBox').classList.toggle('ready',h.meter>=100);
  $('dashText').textContent=h.dashCd>0?h.dashCd.toFixed(1)+'s':'준비';
  $('parryText').textContent=h.parryT>0?'패리!':h.parryCd>0?h.parryCd.toFixed(1)+'s':'준비';
  $('waveText').textContent='WAVE '+wave;
  $('leftText').textContent='남은 적 '+(queue.length+enemies.filter(e=>!e.dead).length);
  $('score').textContent=score;
  $('best').textContent='최고 '+best;
  $('comboText').textContent=combo>=2?combo+' HIT':'';
  $('comboText').classList.toggle('show',combo>=2);
}

function frame(raw){
  if(state==='menu'){
    if(preview){preview.facing+=raw*.6;updateCommon(preview,raw,false)}
    updateCamera(raw);
    return;
  }
  if(state==='play'||state==='dying'){
    if(keys.has('ArrowLeft'))camYaw+=raw*2.4;
    if(keys.has('ArrowRight'))camYaw-=raw*2.4;
    if(keys.has('ArrowUp'))camPitch=clamp(camPitch-raw*1.2,-.1,.7);
    if(keys.has('ArrowDown'))camPitch=clamp(camPitch+raw*1.2,-.1,.7);
  }
  let dt=raw;
  if(hitStop>0){hitStop-=raw;dt=0}
  if(state==='pause')dt=0;
  if(state==='upgrade')dt=0;
  if(dt>0)time+=dt;

  if(bannerT>0){bannerT-=raw;if(bannerT<=0)$('banner').classList.remove('show')}
  flash=Math.max(0,flash-raw*2.5);
  $('flash').style.opacity=String(flash);
  if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0)combo=0}

  if(dt>0&&hero){
    attackBuf=Math.max(0,attackBuf-dt);
    if(attackBuf>0&&tryAttack())attackBuf=0;
    if(state==='play'||state==='dying'){
      if(state==='play')updateHero(dt);
      else{hero.guarding=false;hero.vel.multiplyScalar(Math.exp(-6*dt))}
      if(state==='play'){
        for(const e of enemies)updateEnemy(e,dt);
        if(intro>0)intro-=dt;
        else if(queue.length&&enemies.filter(e=>!e.dead).length<Math.min(7,2+wave)){
          spawnT-=dt;
          if(spawnT<=0){spawnEnemy(queue.shift());spawnT=Math.max(.45,1-wave*.07)}
        }
      }
    }
    const everyone=[hero,...enemies];
    for(const a of everyone){
      if(a.removed)continue;
      if(a.spawnT>0){updateCommon(a,dt,false);continue}
      if(a.attack)updateAttack(a,dt);
      const moving=Math.hypot(a.vel.x,a.vel.z)>.6;
      if(!a.isHero&&a.dead){a.deadT-=dt;a.root.position.y=-Math.max(0,.4-a.deadT)*2}
      if(state==='play'||state==='dying')driveAnim(a,moving);
      updateCommon(a,dt,moving);
      if(!a.dead)integrate(a,dt);
      else if(a.kv.lengthSq()>0)integrate(a,dt);
    }
    separate(everyone);
    for(const e of enemies.filter(e=>e.dead&&e.deadT<=0)){
      scene.remove(e.root);if(e.bar)e.bar.remove();e.removed=true;
    }
    enemies=enemies.filter(e=>!e.removed);
    if(state==='play'&&intro<=0&&queue.length===0&&enemies.length===0&&!hero.dead)waveClear();
    if(state==='dying'){overT-=dt;if(overT<=0)gameOver()}
    updateHUD();
  }
  if(dt>0||state==='pause'||state==='upgrade'){
    updateFx(dt>0?dt:0);
  }
  updateCamera(raw);
  updateLabels();
}

function tick(){
  requestAnimationFrame(tick);
  if(!renderer)return;
  const raw=Math.min(.05,clock.getDelta());
  frame(raw);
  renderer.render(scene,camera);
}

addEventListener('resize',()=>{
  if(!renderer)return;
  renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
});

async function init(){
  try{
    setupScene();
    for(const key of ['crimson','cyan','ember','duelist']){
      templates[key]=await loadEmbeddedGLB(window.__ASSETS__,key);
      $('loadStatus').textContent='불러오는 중 · '+key;
    }
    showMenu();
    $('startBtn').disabled=false;
    $('loadStatus').textContent='준비 완료';
    tick();
  }catch(e){
    $('loadStatus').textContent='불러오기 실패: '+(e&&e.message?e.message:e);
  }
}
window.__SFS__={snapshot:()=>({state,wave,kills,score,enemies:enemies.length,hero:hero?{hp:hero.hp,meter:hero.meter,guardEnergy:hero.guardEnergy}:null})};
init();
})();
