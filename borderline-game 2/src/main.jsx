import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './style.css';

const socket = io();

function App(){
  const [name,setName]=useState('Ahaan');
  const [code,setCode]=useState('');
  const [myId,setMyId]=useState('');
  const [room,setRoom]=useState(null);
  const [roundData,setRoundData]=useState(null);
  const [guess,setGuess]=useState(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    socket.on('joined', data=>{setMyId(data.id);setCode(data.code)});
    socket.on('room', setRoom);
    socket.on('roundData', data=>{setRoundData(data); setGuess(null);});
    socket.on('errorMsg', setError);
    return ()=>socket.off();
  },[]);

  if(!room) return <main className="center card menu">
    <h1>🌍 Borderline</h1><p>A chaotic multiplayer geography + impostor game.</p>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" />
    <button onClick={()=>socket.emit('createRoom', name)}>Create Room</button>
    <div className="join"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ROOM CODE"/><button onClick={()=>socket.emit('joinRoom',{code,name})}>Join</button></div>
    {error && <p className="error">{error}</p>}
  </main>;

  const me = room.players.find(p=>p.id===myId);
  return <main>
    <header><h1>🌍 Borderline</h1><div className="pill">Room: <b>{room.code}</b></div><div className="pill">Phase: <b>{room.phase}</b></div><div className="pill">⏱ {room.timeLeft}s</div></header>
    <section className="layout">
      <aside className="card"><h2>Players</h2>{room.players.map(p=><div className="player" key={p.id}><span>{p.name}{p.id===myId?' (you)':''}</span><b>{p.score}</b></div>)}</aside>
      <section className="card game">
        {room.phase==='lobby' && <><h2>Lobby</h2><p>Share the room code. Minimum 2 players. Everyone clicks ready.</p><button onClick={()=>socket.emit('ready')}>{me?.ready?'Ready ✅':'Ready up'}</button></>}
        {room.phase==='guess' && roundData && <Guess roundData={roundData} guess={guess} setGuess={setGuess}/>} 
        {room.phase==='vote' && <Vote players={room.players} myId={myId}/>} 
        {room.phase==='results' && <Results room={room} myId={myId}/>} 
      </section>
    </section>
  </main>;
}

function Guess({roundData,guess,setGuess}){
  const loc = roundData.location;
  const submit = () => { if(guess) socket.emit('guess', guess); };
  return <><div className="role">{roundData.isImpostor?'🕵️ You are the IMPOSTOR — bluff.':'🧭 You are a tourist — find the place.'}</div>
  <img className="photo" src={loc.img}/><p className="clue"><b>Clue:</b> {loc.clue}</p>
  <WorldPicker guess={guess} setGuess={setGuess}/><button disabled={!guess} onClick={submit}>Lock Guess</button></>;
}
function WorldPicker({guess,setGuess}){
  function click(e){ const r=e.currentTarget.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width; const y=(e.clientY-r.top)/r.height; setGuess({lng:x*360-180, lat:90-y*180}); }
  return <div className="map" onClick={click}>{guess && <span className="pin" style={{left:`${(guess.lng+180)/360*100}%`,top:`${(90-guess.lat)/180*100}%`}}>📍</span>}<span className="maplabel">Click your guess on the world map</span></div>
}
function Vote({players,myId}){ return <><h2>Vote the impostor</h2><p>Discuss with your friends, then vote who was faking.</p>{players.filter(p=>p.id!==myId).map(p=><button className="vote" key={p.id} onClick={()=>socket.emit('vote',p.id)}>Vote {p.name}</button>)}</> }
function Results({room,myId}){ const impostor=room.players.find(p=>p.id===room.impostorId); return <><h2>Results</h2><p>The location was <b>{room.actual.name}</b>.</p><p>The impostor was <b>{impostor?.name}</b>.</p><div className="map results"><span className="pin real" style={{left:`${(room.actual.lng+180)/360*100}%`,top:`${(90-room.actual.lat)/180*100}%`}}>⭐</span>{Object.entries(room.guesses).map(([id,g])=><span key={id} className="pin" title={room.players.find(p=>p.id===id)?.name} style={{left:`${(g.lng+180)/360*100}%`,top:`${(90-g.lat)/180*100}%`}}>📍</span>)}</div><button onClick={()=>socket.emit('nextRound')}>Next Round</button></> }
createRoot(document.getElementById('root')).render(<App/>);
