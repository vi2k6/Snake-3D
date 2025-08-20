import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import PointerPlane from "./PointerPlane";
import { motion } from "framer-motion";

const CONFIG = {
  arenaSize: 24,
  headSpeed: 10,
  segmentSpacing: 0.35,
  initialSegments: 14,
  growthPerFood: 6,
  headRadius: 0.35,
  bodyRadius: 0.28,
  foodRadius: 0.35,
  selfHitDistance: 0.45,
};

class SimpleSynth {
  constructor(){
    try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ this.ctx=null; }
    this.ambient = null;
  }
  playBeep(freq=440, time=0, dur=0.08, gain=0.08){
    if(!this.ctx) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type='sine'; o.frequency.value=freq; g.gain.value=gain;
    o.connect(g); g.connect(this.ctx.destination);
    o.start(this.ctx.currentTime+time);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime+time+dur);
    o.stop(this.ctx.currentTime+time+dur+0.02);
  }
  playEat(){ this.playBeep(900,0,0.06,0.09); this.playBeep(600,0.03,0.08,0.06); }
  playOver(){ this.playBeep(180,0,0.3,0.12); }
  startAmbient(){ if(!this.ctx||this.ambient) return; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='sawtooth'; o.frequency.value=110; g.gain.value=0.015; const lfo=this.ctx.createOscillator(); lfo.frequency.value=0.2; const lg=this.ctx.createGain(); lg.gain.value=0.01; lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.ctx.destination); o.start(); lfo.start(); this.ambient={o,g,lfo}; }
  stopAmbient(){ if(!this.ambient) return; this.ambient.o.stop(); this.ambient.lfo.stop(); this.ambient=null; }
}

const randFloat=(a,b)=>Math.random()*(b-a)+a;

function Food({ position }){
  const ref = useRef();
  useFrame(()=>{ if(ref.current) ref.current.rotation.y += 0.6; });
  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[CONFIG.foodRadius, 24, 24]} />
        <meshStandardMaterial emissive="#F472B6" color="#FB7185" metalness={0.6} roughness={0.2} />
      </mesh>
      <pointLight color="#F472B6" intensity={2.2} distance={6} />
    </group>
  );
}

function Particles({ bursts }){
  return (
    <group>
      {bursts.map((b,i)=>(
        <mesh key={i} position={b.pos.toArray()}>
          <sphereGeometry args={[0.08,8,8]} />
          <meshStandardMaterial emissive="#FDE68A" color="#F97316" metalness={0.2} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Snake({ target, isRunning, onGameOver, onEat, theme }){
  const headRef = useRef();
  const path = useRef([]);
  const [segmentsCount, setSegmentsCount] = useState(CONFIG.initialSegments);
  const [segmentPositions, setSegmentPositions] = useState(()=>Array.from({length:CONFIG.initialSegments}, (_,i)=>new THREE.Vector3(-i*CONFIG.segmentSpacing, CONFIG.headRadius, 0)));
  const [foodPos, setFoodPos] = useState(()=>randomFood());
  const [particles, setParticles] = useState([]);

  function randomFood(){
    const r = CONFIG.arenaSize*0.85;
    const v = new THREE.Vector3(randFloat(-r,r), CONFIG.headRadius, randFloat(-r,r));
    if(v.length()>r) v.setLength(randFloat(0,r));
    return v;
  }
  function grow(n){
    setSegmentsCount(s=>s+n);
    setSegmentPositions(prev=>{
      const tail = prev[prev.length-1]?.clone() || new THREE.Vector3();
      return prev.concat(Array.from({length:n}, ()=>tail.clone()));
    });
  }

  useFrame((_, dt)=>{
    if(!isRunning) return;
    const head = headRef.current; if(!head) return;
    const hp = head.position;
    const t = target.clone(); t.y = hp.y;
    const to = t.clone().sub(hp); const d = to.length();
    if(d > 0.0001){
      const dir = to.normalize();
      const desired = Math.atan2(dir.x, -dir.z);
      const cur = head.rotation.y;
      let delta = desired - cur;
      delta = THREE.MathUtils.euclideanModulo(delta + Math.PI, Math.PI*2) - Math.PI;
      const maxTurn = Math.PI * 1.5 * dt;
      delta = THREE.MathUtils.clamp(delta, -maxTurn, maxTurn);
      head.rotation.y = cur + delta;
      const forward = new THREE.Vector3(0,0,-1).applyEuler(head.rotation).normalize();
      const step = Math.min(d, CONFIG.headSpeed * dt);
      hp.addScaledVector(forward, step);
    }

    const r = CONFIG.arenaSize * 0.98;
    if(hp.length() > r){ onGameOver("You hit the arena wall!"); return; }

    path.current.push(hp.clone());
    if(path.current.length > 2000) path.current.shift();

    const newPos = segmentPositions.slice();
    const stepBack = Math.max(1, Math.floor((CONFIG.segmentSpacing / Math.max(0.001, CONFIG.headSpeed)) * 60));
    let idx = path.current.length - 1 - stepBack;
    for(let i=0;i<segmentsCount;i++){
      const p = path.current[idx - i*stepBack];
      if(p) newPos[i] = p.clone();
    }
    setSegmentPositions(newPos);

    for(let i=6;i<segmentsCount;i++){
      if(!newPos[i]) continue;
      if(newPos[i].distanceTo(hp) < CONFIG.selfHitDistance){ onGameOver("You hit yourself!"); return; }
    }

    if(hp.distanceTo(foodPos) < CONFIG.headRadius + CONFIG.foodRadius + 0.12){
      const burst = Array.from({length:12}, ()=>{
        const dir = new THREE.Vector3(randFloat(-1,1), randFloat(0.2,1), randFloat(-1,1)).normalize();
        const p = hp.clone().addScaledVector(dir, 0.6 + Math.random()*0.2);
        return { pos: p, t: performance.now() };
      });
      setParticles(prev=>[...prev, ...burst].slice(-60));
      setFoodPos(randomFood());
      grow(CONFIG.growthPerFood);
      onEat();
    }

    setParticles(prev=>prev.filter(p=>performance.now()-p.t < 700));
  });

  return (
    <group>
      <group ref={headRef} position={[0, CONFIG.headRadius, 6]}>
        <mesh castShadow>
          <sphereGeometry args={[CONFIG.headRadius*1.08, 24, 24]} />
          <meshStandardMaterial color={theme.head} metalness={0.6} roughness={0.25} />
        </mesh>
        <mesh position={[-0.18, 0.08, -0.24]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial emissive={theme.eye} color={theme.eye} />
        </mesh>
        <mesh position={[0.18, 0.08, -0.24]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial emissive={theme.eye} color={theme.eye} />
        </mesh>
        <pointLight color={theme.light} intensity={1.2} distance={4} />
      </group>

      {segmentPositions.map((p,i)=>(
        <mesh key={i} position={p} castShadow>
          <sphereGeometry args={[CONFIG.bodyRadius, 16, 16]} />
          <meshStandardMaterial color={theme.body} metalness={0.4} roughness={0.3} />
        </mesh>
      ))}

      <Food position={foodPos} />
      <Particles bursts={particles} />
    </group>
  );
}

function Lights(){ return (<><ambientLight intensity={0.3} /><directionalLight position={[8,16,10]} intensity={1.2} /><pointLight position={[-6,8,-8]} intensity={0.6} /></>); }

export default function App(){
  const synth = useRef(null);
  const [running, setRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [target, setTarget] = useState(new THREE.Vector3(0,0,0));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(()=>Number(localStorage.getItem('snake3d-best')||0));
  const [message, setMessage] = useState("");
  const [themeId, setThemeId] = useState(0);
  const [musicOn, setMusicOn] = useState(true);

  const themes = [
    { id:0, name:"Neon Cyan", head:"#34D399", body:"#10B981", eye:"#0EA5E9", light:"#34D399" },
    { id:1, name:"Electric Pink", head:"#FB7185", body:"#F472B6", eye:"#FDE68A", light:"#FB7185" },
    { id:2, name:"Sunset", head:"#F59E0B", body:"#F97316", eye:"#FB7185", light:"#F97316" }
  ];

  useEffect(()=>{ synth.current = new SimpleSynth(); if(musicOn) synth.current.startAmbient(); return ()=>{ synth.current?.stopAmbient(); }; },[]);
  useEffect(()=>{ localStorage.setItem('snake3d-best', String(best)); },[best]);

  function handleEat(){ setScore(s=>s+10); synth.current?.playEat(); }
  function handleGameOver(why){ setRunning(false); setMessage(why); synth.current?.playOver(); setBest(b=>Math.max(b, score)); setMenuOpen(true); }
  function startGame(){ setMenuOpen(false); setScore(0); setMessage(''); setRunning(true); if(musicOn) synth.current?.startAmbient(); }
  function restart(){ setScore(0); setMessage(''); setRunning(true); setMenuOpen(false); if(musicOn) synth.current?.startAmbient(); }

  useEffect(()=>{ if(musicOn){ synth.current?.startAmbient(); } else { synth.current?.stopAmbient(); } },[musicOn]);

  return (
    <div className="w-full h-screen relative">
      <header className="absolute left-6 top-6 z-30">
        <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl px-4 py-2 shadow">
          <div className="text-sm text-cyan-200 font-semibold">Snake 3D — Follow the Hand</div>
        </div>
      </header>

      <div className="absolute right-6 top-6 z-30 flex gap-3 items-center">
        <div className="backdrop-blur bg-white/4 px-3 py-2 rounded-xl text-white/90">
          <div className="text-xs">Score</div>
          <div className="text-lg font-semibold tabular-nums">{score}</div>
        </div>
        <div className="backdrop-blur bg-white/4 px-3 py-2 rounded-xl text-white/90">
          <div className="text-xs">Best</div>
          <div className="text-lg font-semibold tabular-nums">{best}</div>
        </div>
      </div>

      <div className="absolute left-6 bottom-6 z-30 flex gap-2">
        <button onClick={()=>setRunning(r=>!r)} className="px-4 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold">{running? 'Pause':'Resume'}</button>
        <button onClick={restart} className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white">Restart</button>
        <select value={themeId} onChange={(e)=>setThemeId(Number(e.target.value))} className="bg-white/6 text-white px-3 py-2 rounded-xl">
          {themes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <Canvas shadows dpr={[1,2]}>
        <PerspectiveCamera makeDefault position={[0,16,18]} fov={55} />
        <OrbitControls enablePan={false} enableRotate={false} enableZoom={false} />
        <color attach="background" args={["#070b14"]} />
        <Lights />
        <mesh rotation-x={-Math.PI/2}>
          <circleGeometry args={[CONFIG.arenaSize, 64]} />
          <meshStandardMaterial color="#0B1220" />
        </mesh>

        <Snake target={target} isRunning={running} onGameOver={handleGameOver} onEat={handleEat} theme={themes[themeId]} />
        <PointerPlane onMove={(p)=> setTarget(p)} />

        {!running && menuOpen && (
          <Html center>
            <motion.div initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}} className="bg-[#061018]/90 border border-white/10 rounded-3xl p-8 text-center w-96">
              <h1 className="text-3xl font-bold text-white mb-2">Snake 3D</h1>
              <p className="text-white/80 mb-4">Move your finger or mouse — the snake follows your hand. Eat orbs to grow.</p>
              <div className="flex gap-2 justify-center mb-4">
                <select value={themeId} onChange={(e)=>setThemeId(Number(e.target.value))} className="bg-white/6 text-white px-3 py-2 rounded-xl">
                  {themes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={()=>setMusicOn(m=>!m)} className="px-3 py-2 rounded-xl bg-white/10 text-white">{musicOn? 'Music: On':'Music: Off'}</button>
              </div>
              <div className="flex gap-3 justify-center">
                <button onClick={startGame} className="px-6 py-3 rounded-2xl bg-cyan-500 text-black font-semibold">Play</button>
                <button onClick={()=>{ localStorage.setItem('snake3d-best','0'); setBest(0); }} className="px-4 py-2 rounded-2xl bg-white/10 text-white">Reset Best</button>
              </div>
              <div className="text-xs text-white/60 mt-4">Controls: Touch or mouse. Press R to restart.</div>
            </motion.div>
          </Html>
        )}

        {!running && !menuOpen && (
          <Html center>
            <motion.div initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}} className="bg-[#061018]/90 border border-white/10 rounded-3xl p-6 text-center">
              <div className="text-white text-2xl font-semibold mb-2">{message || 'Paused'}</div>
              <div className="flex gap-3 justify-center">
                <button onClick={()=>{ setRunning(true); }} className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-semibold">Resume</button>
                <button onClick={()=>{ setMenuOpen(true); setRunning(false); }} className="px-4 py-2 rounded-xl bg-white/10 text-white">Menu</button>
              </div>
            </motion.div>
          </Html>
        )}
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,#000_100%)] opacity-60" />
    </div>
  );
}
