/* =====================================================================
   js/net.js  —  client réseau du laboratoire.

   Deux transports, même protocole JSON :
     1. WebSocket  ws://hôte/ws            (temps réel, utilisé en priorité)
     2. Long-polling HTTP  POST/GET /tx    (repli automatique si le WS est
                                            bloqué par un proxy/iframe)

   Le serveur est le petit `server.py` fourni : une salle = un port.
   On peut donc ouvrir http://localhost:8000 dans deux fenêtres (ou deux
   ports différents pour deux salles) et se voir bouger, parler, se frapper.
   ===================================================================== */
import { ME, S } from './state.js';
import { addPeer, removePeer, setPeerState, say, hurtPeer, peerCount, peers as PEERS } from './avatar.js';
import { toast, refreshNetChip, refreshPlayersChip, hurtFlash } from './hud.js';
import { sfx } from './audio.js';

let ws = null;
let pollTimer = null, pollId = null;
let connected = false, transport = '—';
let lastSent = 0, pingTimer = null;
const SEND_HZ = 20;
const listeners = { punch: [], hit: [] };

/* ------------------------------------------------------------------ */
/*  Identité du joueur local                                           */
/* ------------------------------------------------------------------ */
const COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#818cf8', '#fb7185', '#34d399', '#f97316'];
const NAMES = ['Alice', 'Bob', 'Camille', 'Dylan', 'Emma', 'Farid', 'Gabriel', 'Hugo', 'Inès', 'Julie'];

export function initIdentity() {
    const url = new URL(location.href);
    let name = (url.searchParams.get('nom') || url.searchParams.get('name') || '').trim();
    let color = (url.searchParams.get('couleur') || '').trim();
    try {
        if (!name) name = localStorage.getItem('labo3d_name') || '';
        if (!color) color = localStorage.getItem('labo3d_color') || '';
    } catch (e) { /* stockage indisponible */ }
    if (!name) name = NAMES[(Math.random() * NAMES.length) | 0];
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = COLORS[(Math.random() * COLORS.length) | 0];
    ME.name = name.slice(0, 14);
    ME.color = color;
    try {
        localStorage.setItem('labo3d_name', ME.name);
        localStorage.setItem('labo3d_color', ME.color);
    } catch (e) { }
    return ME;
}

/* ------------------------------------------------------------------ */
/*  Envoi                                                              */
/* ------------------------------------------------------------------ */
function rawSend(obj) {
    if (!connected) return false;
    const txt = JSON.stringify(obj);
    if (transport === 'ws') {
        if (ws && ws.readyState === 1) { ws.send(txt); return true; }
        return false;
    }
    /* long-polling : on empile, le timer POST envoie */
    outbox.push(obj);
    return true;
}
let outbox = [];

export function sendChat(text) { rawSend({ t: 'chat', m: String(text).slice(0, 220) }); }
export function sendPunch() { rawSend({ t: 'punch' }); }
export function sendHit(toId, f, dx, dz) { rawSend({ t: 'hit', to: toId, f, dx, dz }); }

export function sendState(p) {
    const now = performance.now();
    if (now - lastSent < 1000 / SEND_HZ) return;
    lastSent = now;
    rawSend({
        t: 'st', s: {
            x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
            yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
            crouch: p.crouch ? 1 : 0, zoom: p.zoom ? 1 : 0,
            punch: +p.punch.toFixed(2), bob: +p.bob.toFixed(2),
            lvl: S.level
        }
    });
}

export function on(evt, fn) { if (listeners[evt]) listeners[evt].push(fn); }

/* ------------------------------------------------------------------ */
/*  Réception                                                          */
/* ------------------------------------------------------------------ */
function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
        case 'ok':
            ME.room = msg.room || 'labo';
            remapLocal(msg.id);
            (msg.peers || []).forEach(joinPeer);
            break;
        case 'join':
            joinPeer(msg.p);
            break;
        case 'leave':
            if (msg.id && msg.id !== ME.id) {
                const a = findPeer(msg.id);
                removePeer(msg.id);
                toast(`${a ? a.name : 'Un élève'} a quitté le laboratoire.`, 'info');
            }
            break;
        case 'st':
            if (msg.id !== ME.id) setPeerState(msg.id, msg.s || {});
            break;
        case 'chat': {
            const a = findPeer(msg.id);
            say(msg.id, msg.m);
            if (msg.id !== ME.id) toast(`<b>${a ? a.name : 'Un élève'}</b> : ${escapeHtml(msg.m)}`, 'info');
            break;
        }
        case 'punch': {
            const a = findPeer(msg.id);
            if (a) { a.punch = 1; }
            break;
        }
        case 'hit': {
            const a = findPeer(msg.from);
            hurtFlash();
            hurtPeer(ME.id, 1);
            sfx.hurt();
            listeners.hit.forEach(f => f(msg.f || 3.4, msg.dx || 0, msg.dz || 0, msg.fromName || (a && a.name) || 'quelqu’un'));
            break;
        }
        case 'pong':
            break;
    }
    refreshPlayersChip(peerCount());
}

function joinPeer(p) {
    if (!p || !p.id || p.id === ME.id || ME.solo) return null;
    const a = addPeer(p.id, p.name || 'Élève', p.color || '#22d3ee', false);
    if (!a) return null;                       /* mode solo : pas de personnage */
    if (p.state) setPeerState(p.id, p.state);
    if (p.name) a.name = p.name;
    return a;
}
const findPeer = (id) => PEERS.get(id);

/** L'avatar local est créé au démarrage sous l'identifiant provisoire « me » ;
    dès que le serveur attribue un identifiant définitif, on le renomme. */
function remapLocal(id) {
    if (!id || id === ME.id) { ME.id = ME.id || 'me'; return; }
    const old = PEERS.get('me') || PEERS.get(ME.id);
    ME.id = id;
    if (old && !PEERS.has(id)) {
        PEERS.delete(old.id);
        old.id = id;
        PEERS.set(id, old);
    } else if (!old && !ME.solo) {
        addPeer(id, ME.name + ' (moi)', ME.color, true);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ------------------------------------------------------------------ */
/*  Connexion                                                          */
/* ------------------------------------------------------------------ */
function setStatus(on, tp) {
    connected = on; transport = tp;
    ME.online = on; ME.transport = tp;
    refreshNetChip();
    refreshPlayersChip(peerCount());
}

export function connect() {
    if (ME.solo) {                             /* solo : ni serveur, ni amis */
        setStatus(false, '—');
        return;
    }
    if (location.protocol === 'file:') {
        setStatus(false, '—');
        toast('Ouvert en fichier local : lancez <b>python3 server.py</b> pour jouer à deux.', 'warn');
        return;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws?nom=${encodeURIComponent(ME.name)}`;
    let opened = false;
    try {
        ws = new WebSocket(url);
    } catch (e) {
        startPolling(); return;
    }
    const to = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { } startPolling(); } }, 4000);

    ws.onopen = () => {
        opened = true; clearTimeout(to);
        setStatus(true, 'ws');
        ws.send(JSON.stringify({ t: 'hello', name: ME.name, color: ME.color }));
        sfx.join();
        toast(`Connecté au serveur local (WebSocket) — salle « ${ME.room || 'labo'} ».`, 'success');
    };
    ws.onmessage = (ev) => {
        try { handle(JSON.parse(ev.data)); } catch (e) { }
    };
    ws.onerror = () => { };
    ws.onclose = () => {
        clearTimeout(to);
        if (!opened) { startPolling(); return; }
        if (connected && transport === 'ws') {
            setStatus(false, '—');
            toast('Connexion au serveur perdue — tentative de repli…', 'warn');
            setTimeout(startPolling, 900);
        }
    };
    pingTimer = setInterval(() => { if (connected && transport === 'ws' && ws.readyState === 1) ws.send('{"t":"ping"}'); }, 3000);
}

/* ---- repli : long-polling ---- */
function startPolling() {
    if (pollTimer) return;
    pollId = pollId || ('p' + Math.random().toString(36).slice(2, 10));
    setStatus(true, 'poll');
    ME.room = 'labo';
    remapLocal(pollId);
    toast('Connecté au serveur local (mode secours HTTP).', 'success');
    outbox.push({ t: 'hello', name: ME.name, color: ME.color });
    pollTimer = setInterval(pollTick, 110);
    setTimeout(pollTick, 30);
}

async function pollTick() {
    if (!pollTimer) return;
    /* 1) on dépose notre état + nos messages */
    try {
        const body = { id: pollId, name: ME.name, color: ME.color, m: outbox.splice(0, 12) };
        await fetch('/tx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { setStatus(false, '—'); }
    /* 2) on récupère ce qui nous est destiné */
    try {
        const r = await fetch('/tx?id=' + encodeURIComponent(pollId));
        const j = await r.json();
        if (j && j.ok) {
            (j.ws || []).forEach(p => {
                const a = joinPeer({ id: p.id, name: p.name, color: p.color, state: p.state });
                if (a && p.state) setPeerState(p.id, p.state);
            });
            (j.q || []).forEach(txt => { try { handle(JSON.parse(txt)); } catch (e) { } });
            if (!connected) setStatus(true, 'poll');
        }
    } catch (e) {
        setStatus(false, '—');
    }
}

export function disconnect() {
    try { if (ws) ws.close(); } catch (e) { }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    setStatus(false, '—');
}

export const isConnected = () => connected;
