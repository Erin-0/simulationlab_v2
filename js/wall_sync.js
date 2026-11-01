/* =====================================================================
   js/wall_sync.js  —  Synchronisation via Cloudflare Pages Function
   (Zéro clé exposée au navigateur)
   ===================================================================== */

const SYNC_MS = 10_000;
const MAX_OUTBOX = 300;

let myId = null;
let cursor = 0;
let outbox = [];
let busy = false;
let lastSyncAt = 0, lastError = null;

let applyRemote = null, statusCb = null;
let drawingActive = false;

export function setDrawingActive(b) { drawingActive = !!b; }
export function onRemoteStroke(fn) { applyRemote = fn; }
export function onSyncStatus(fn) { statusCb = fn; }

const r4 = n => Math.round(n * 10000) / 10000;

export function queueStroke(stroke) {
    outbox.push({
        player_id: myId,
        player_name: playerName(),
        color: stroke.color,
        size: stroke.size,
        points: stroke.pts.map(r4)
    });
    if (outbox.length > MAX_OUTBOX) outbox.splice(0, outbox.length - MAX_OUTBOX);
    emitStatus();
}

function playerName() {
    const el = document.getElementById('wmInputPseudo') || document.getElementById('drawPseudo');
    return ((el && el.value) || localStorage.getItem('labo3d_pseudo') || 'Anonyme').slice(0, 24);
}

function localUuid() {
    let id = localStorage.getItem('labo3d_player_uuid_v1');
    if (!id) {
        id = (crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        localStorage.setItem('labo3d_player_uuid_v1', id);
    }
    return id;
}

async function preloadWall() {
    try {
        const res = await fetch(`/api/wall?after=0&limit=3000`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (Array.isArray(data)) {
            for (const r of data) {
                if (r.id > cursor) cursor = r.id;
                if (applyRemote) applyRemote(r);
            }
        }
        lastSyncAt = Date.now();
        lastError = null;
    } catch (err) {
        lastError = err.message;
    }
    emitStatus();
}

export async function flushNow() {
    if (busy || drawingActive) return;
    busy = true;

    try {
        // 1. Envoyer les traits locaux
        const mine = outbox.splice(0, outbox.length);
        if (mine.length) {
            const postRes = await fetch('/api/wall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mine)
            });
            if (!postRes.ok) {
                outbox = mine.concat(outbox);
                throw new Error(`Erreur envoi: HTTP ${postRes.status}`);
            }
        }

        // 2. Récupérer les nouveaux traits des autres joueurs
        const getRes = await fetch(`/api/wall?after=${cursor}`);
        if (!getRes.ok) throw new Error(`Erreur réception: HTTP ${getRes.status}`);
        const data = await getRes.json();

        if (Array.isArray(data)) {
            for (const r of data) {
                if (r.id > cursor) cursor = r.id;
                if (r.player_id === myId) continue;
                if (applyRemote) applyRemote(r);
            }
        }

        lastSyncAt = Date.now();
        lastError = null;
    } catch (err) {
        lastError = err.message;
    }

    busy = false;
    emitStatus();
}

export async function initWallSync() {
    myId = localUuid();
    emitStatus();
    await preloadWall();
    setInterval(flushNow, SYNC_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushNow();
    });
}

function emitStatus() {
    if (statusCb) statusCb({
        online: !lastError,
        pending: outbox.length,
        lastSyncAt,
        error: lastError,
        me: myId
    });
}