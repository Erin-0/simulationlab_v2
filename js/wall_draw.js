/* =====================================================================
   js/wall_draw.js  —  LE MUR DESSIN PARTAGÉ (« mur des croquis »)
   Avec Pupitre/Console 3D Conférence et Écran Intelligent Interactif.
   ===================================================================== */
import * as THREE from 'three';
import { ROOM, ctx, interactives } from './state.js';
import { paperOpen, toast } from './hud.js';
import { queueStroke, onRemoteStroke, onSyncStatus, initWallSync, flushNow, setDrawingActive } from './wall_sync.js';

/* ---- Réglages généraux du mur --------------------------------------- */
const WALL = {
    w: 4.2, h: 2.1,
    x: 0, y: 1.75,
    ry: Math.PI,
    texW: 2048, texH: 1024,
    bg: '#000000',
    lineWidth: 8,
    eraseWidth: 26,
    maxDist: 4.2
};
export const PALETTE = ['#ffffff', '#f87171', '#60a5fa', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6'];

let panel = null, tex = null, g = null;
let drawing = false, cur = null, lastPx = null;
let _texDirty = false, _lastTexUpdate = 0;
const TEX_MIN_MS = 1000 / 30;

function scheduleTexUpdate() {
    if (_texDirty) return;
    const now = performance.now();
    const wait = Math.max(0, TEX_MIN_MS - (now - _lastTexUpdate));
    if (wait === 0) {
        _lastTexUpdate = now;
        if (tex) tex.needsUpdate = true;
        return;
    }
    _texDirty = true;
    setTimeout(() => {
        _texDirty = false;
        _lastTexUpdate = performance.now();
        if (tex) tex.needsUpdate = true;
    }, wait);
}

let currentColor = PALETTE[0], isErasing = false, hover = false;
let hintAt = 0, lastSyncState = null;
let isModalOpen = false;

/* ---- Point d'entrée ------------------------------------------------- */
export function initDrawWall() {
    buildDrawWall();
    build3DConsoleTable();
    initModalEvents();
    initWallSync();
}

/* ------------------------------------------------------------------ */
/*  Panneau + cadre + éclairage dédié                                  */
/* ------------------------------------------------------------------ */
function buildDrawWall() {
    const scene = ctx.scene;
    const zP = ROOM - 0.045;
    const zF = ROOM - 0.018;

    const cv = document.createElement('canvas');
    cv.width = WALL.texW; cv.height = WALL.texH;
    g = cv.getContext('2d');
    g.fillStyle = WALL.bg;
    g.fillRect(0, 0, cv.width, cv.height);
    g.lineCap = g.lineJoin = 'round';

    tex = new THREE.CanvasTexture(cv);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy?.() ?? 4);

    panel = new THREE.Mesh(
        new THREE.PlaneGeometry(WALL.w, WALL.h),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    panel.position.set(WALL.x, WALL.y, zP);
    panel.rotation.y = WALL.ry;
    panel.receiveShadow = true;
    panel.userData = { kind: 'drawwall' };
    scene.add(panel);
    ctx.drawWall = panel;

    // Cadre en bois
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.5 });
    const bw = 0.08, bd = 0.05;
    const mkBar = (w, h, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, bd), frameMat);
        m.position.set(x, y, zF);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
    };
    mkBar(WALL.w + 2 * bw, bw, WALL.x, WALL.y + WALL.h / 2 + bw / 2);
    mkBar(WALL.w + 2 * bw, bw, WALL.x, WALL.y - WALL.h / 2 - bw / 2);
    mkBar(bw, WALL.h, WALL.x - WALL.w / 2 - bw / 2, WALL.y);
    mkBar(bw, WALL.h, WALL.x + WALL.w / 2 + bw / 2, WALL.y);

    // Luminaire
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.6, roughness: 0.4 });
    const diffMat = new THREE.MeshStandardMaterial({ color: 0xfff3da, emissive: 0xffe9be, emissiveIntensity: 2.2 });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.34), housingMat);
    const diff = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.26), diffMat);
    diff.rotation.x = Math.PI / 2; diff.position.y = -0.045;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), housingMat);
    rail.position.y = 0.09;
    const lamp = new THREE.Group();
    lamp.add(housing, diff, rail);
    lamp.position.set(WALL.x, WALL.y + WALL.h / 2 + 0.17, ROOM - 0.12);
    scene.add(lamp);
    if (ctx.lights) ctx.lights.lampMats.push(diffMat);

    const spot = new THREE.SpotLight(0xfff0d8, 14, 9, 0.78, 0.55, 2);
    spot.position.set(WALL.x, WALL.y + WALL.h / 2 + 0.34, ROOM - 0.5);
    spot.target.position.set(WALL.x, WALL.y - 0.05, ROOM);
    scene.add(spot, spot.target);
    spot.userData.base = 14;
    if (ctx.lights) ctx.lights.fills.push(spot);

    bindPointer();
    onRemoteStroke(applyRemoteStroke);
    onSyncStatus(st => {
        lastSyncState = st;
        updateModalSyncUI();
    });
}

/* ------------------------------------------------------------------ */
/*  3D Console / Pupitre d'Atelier avec Écran Intelligent             */
/* ------------------------------------------------------------------ */
function build3DConsoleTable() {
    const scene = ctx.scene;
    const consoleG = new THREE.Group();
    // Positionné sur le côté droit du mur pour ne pas bloquer les croquis
    consoleG.position.set(2.45, 0, ROOM - 0.75);
    consoleG.rotation.y = Math.PI * 0.95;

    // Matériaux
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.4, metalness: 0.7 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.9 });
    const tableTopMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.3, metalness: 0.4 });

    // 1. Socle lourd
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.04, 24), metalMat);
    base.position.y = 0.02;
    base.castShadow = true;
    consoleG.add(base);

    // 2. Colonne montante profilée
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.92, 16), chromeMat);
    pillar.position.y = 0.48;
    pillar.castShadow = true;
    consoleG.add(pillar);

    // 3. Plateau pupitre incliné (style studio / conférence)
    const deskG = new THREE.Group();
    deskG.position.set(0, 0.96, 0);
    deskG.rotation.x = 0.35; // Incliné vers le joueur

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.028, 0.38), tableTopMat);
    deskTop.castShadow = true;
    deskG.add(deskTop);

    // 4. Écran Tablette Intelligent (Interactif)
    const tabletFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.016, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 })
    );
    tabletFrame.position.set(0, 0.018, 0.01);
    deskG.add(tabletFrame);

    // Surface de l'écran avec lueur cyan
    const screenMat = new THREE.MeshStandardMaterial({
        color: 0x0369a1,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        roughness: 0.2
    });
    const tabletScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), screenMat);
    tabletScreen.rotation.x = -Math.PI / 2;
    tabletScreen.position.set(0, 0.028, 0.01);

    // Enregistrement comme objet interactif pour le joueur
    tabletScreen.userData = {
        interact: true,
        kind: 'wall_console',
        deviceLabel: 'Console du Mur des Croquis',
        tip: 'Console du Mur — clic : Palette de couleurs, Gomme & Signature'
    };
    deskG.add(tabletScreen);
    interactives.push(tabletScreen);

    // Liseré LED d'état autour du pupitre
    const ledRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.005, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    ledRim.rotation.x = Math.PI / 2;
    ledRim.position.set(0, 0.02, 0.01);
    deskG.add(ledRim);

    consoleG.add(deskG);
    scene.add(consoleG);
}

/* ------------------------------------------------------------------ */
/*  Modal HTML : Choix des Couleurs, Gomme, Pseudo & Synchro          */
/* ------------------------------------------------------------------ */
export function openWallModal(open) {
    isModalOpen = (open !== undefined) ? open : !isModalOpen;
    const modal = document.getElementById('wallModal');
    if (!modal) return;

    modal.classList.toggle('hiddenx', !isModalOpen);

    if (isModalOpen) {
        if (document.exitPointerLock) document.exitPointerLock();
        updateModalSyncUI();
    } else {
        if (ctx.player && ctx.player.isStarted && ctx.player.isStarted()) {
            const cahier = document.getElementById('cahier');
            const chat = document.getElementById('chatbar');
            if ((!cahier || cahier.classList.contains('hiddenx')) &&
                (!chat || chat.classList.contains('hidden'))) {
                const dom = ctx.renderer ? ctx.renderer.domElement : document.body;
                dom.requestPointerLock();
            }
        }
    }
}

function initModalEvents() {
    const modal = document.getElementById('wallModal');
    if (!modal) return;

    // Fermeture
    const btnClose = document.getElementById('btnWallClose');
    if (btnClose) btnClose.onclick = () => openWallModal(false);

    // Palette
    const palWrap = document.getElementById('wmPalette');
    if (palWrap) {
        palWrap.innerHTML = PALETTE.map((c, i) =>
            `<div class="wm-swatch${i === 0 ? ' sel' : ''}" data-c="${c}" style="background:${c}"></div>`
        ).join('');

        palWrap.querySelectorAll('.wm-swatch').forEach(sw => {
            sw.onclick = () => {
                isErasing = false;
                currentColor = sw.dataset.c;
                palWrap.querySelectorAll('.wm-swatch').forEach(s => s.classList.remove('sel'));
                sw.classList.add('sel');
                updateToolStatusText();
            };
        });
    }

    // Mode Gomme
    const btnEraser = document.getElementById('wmBtnEraser');
    if (btnEraser) {
        btnEraser.onclick = () => {
            isErasing = true;
            if (palWrap) palWrap.querySelectorAll('.wm-swatch').forEach(s => s.classList.remove('sel'));
            updateToolStatusText();
        };
    }

    // Pseudo
    const inpPseudo = document.getElementById('wmInputPseudo');
    if (inpPseudo) {
        const saved = localStorage.getItem('labo3d_pseudo');
        if (saved) inpPseudo.value = saved;
        inpPseudo.addEventListener('input', (e) => {
            localStorage.setItem('labo3d_pseudo', e.target.value.trim());
        });
    }
}

function updateToolStatusText() {
    const el = document.getElementById('wmToolStatus');
    if (!el) return;
    if (isErasing) {
        el.textContent = 'Outil : Gomme active';
        el.style.color = '#f87171';
    } else {
        el.textContent = `Outil : Craie (${currentColor})`;
        el.style.color = currentColor;
    }
}

function updateModalSyncUI() {
    const el = document.getElementById('wmSyncStatus');
    if (!el || !lastSyncState) return;
    if (!lastSyncState.online) {
        el.textContent = '○ Hors ligne (en attente)';
        el.style.color = '#f59e0b';
        return;
    }
    if (lastSyncState.error) {
        el.textContent = '⚠ Erreur de synchronisation';
        el.style.color = '#f87171';
        return;
    }
    if (lastSyncState.pending) {
        el.textContent = `● ${lastSyncState.pending} trait(s) en attente`;
        el.style.color = '#38bdf8';
        return;
    }
    const s = lastSyncState.lastSyncAt ? Math.round((Date.now() - lastSyncState.lastSyncAt) / 1000) : null;
    el.textContent = (s == null) ? '● Connexion...' : (s < 3 ? '● Synchronisé' : `● Synchro il y a ${s} s`);
    el.style.color = '#34d399';
}

/* ------------------------------------------------------------------ */
/*  Tracé sur le Mur                                                  */
/* ------------------------------------------------------------------ */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function hitWall(clientX, clientY) {
    if (!panel) return null;
    if (document.pointerLockElement) {
        ndc.set(0, 0);
    } else {
        const r = ctx.renderer.domElement.getBoundingClientRect();
        ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    }
    ray.setFromCamera(ndc, ctx.camera);
    return ray.intersectObject(panel, false)[0] || null;
}

export function pointerOnDrawWall(e) {
    return !!hitWall(e.clientX, e.clientY);
}

function bindPointer() {
    const dom = ctx.renderer.domElement;

    dom.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || paperOpen || isModalOpen) return;
        const h = hitWall(e.clientX, e.clientY);
        if (!h || tooFar()) return;
        drawing = true;
        setDrawingActive(true);
        addPoint(h);
    });

    dom.addEventListener('pointermove', (e) => {
        if (drawing) return;
        const on = !!hitWall(e.clientX, e.clientY);
        if (on) { dom.style.cursor = 'crosshair'; hover = true; }
        else if (hover) { dom.style.cursor = ''; hover = false; }
    });

    window.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length)
            ? e.getCoalescedEvents() : [e];
        for (const ev of evs) {
            const h = hitWall(ev.clientX, ev.clientY);
            if (h) addPoint(h);
            else if (cur) endCurrent();
        }
    });

    const stop = () => {
        if (!drawing) return;
        drawing = false;
        endCurrent();
        setDrawingActive(false);
        flushNow();
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
}

function tooFar() {
    if (!ctx.yawObj || WALL.maxDist === Infinity) return false;
    const d = ctx.yawObj.position.distanceTo(panel.position);
    if (d <= WALL.maxDist) return false;
    const now = performance.now();
    if (now - hintAt > 4000) {
        hintAt = now;
        toast('Approchez-vous du mur des croquis pour dessiner.', 'warn');
    }
    return true;
}

function addPoint(h) {
    if (cur && cur.pts.length >= 1600) endCurrent();
    const p = uvToPx(h.uv);
    if (cur && lastPx && Math.hypot(p.x - lastPx.x, p.y - lastPx.y) < 2) return;
    if (!cur) {
        cur = {
            color: isErasing ? WALL.bg : currentColor,
            size: isErasing ? WALL.eraseWidth : WALL.lineWidth,
            pts: [r4(h.uv.x), r4(h.uv.y)]
        };
        dotAt(p, cur.color, cur.size);
    } else {
        seg(lastPx, p, cur.color, cur.size);
        cur.pts.push(r4(h.uv.x), r4(h.uv.y));
    }
    lastPx = p;
    scheduleTexUpdate();
}

function endCurrent() {
    if (cur && cur.pts.length >= 2) queueStroke(cur);
    cur = null; lastPx = null;
}

const r4 = n => Math.round(n * 10000) / 10000;
const uvToPx = uv => ({ x: uv.x * WALL.texW, y: (1 - uv.y) * WALL.texH });

function seg(a, b, c, w) {
    g.strokeStyle = c; g.lineWidth = w;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
}
function dotAt(p, c, w) {
    g.fillStyle = c;
    g.beginPath(); g.arc(p.x, p.y, w / 2, 0, Math.PI * 2); g.fill();
}

function applyRemoteStroke(r) {
    const pts = r.points || [];
    let prev = null;
    for (let i = 0; i + 1 < pts.length; i += 2) {
        const p = { x: pts[i] * WALL.texW, y: (1 - pts[i + 1]) * WALL.texH };
        if (!prev) dotAt(p, r.color, r.size);
        else seg(prev, p, r.color, r.size);
        prev = p;
    }
    if (pts.length) scheduleTexUpdate();
}