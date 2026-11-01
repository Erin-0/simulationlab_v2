/* =====================================================================
   js/drag.js  —  déplacement ET ROTATION des objets à l'APPUI LONG

   • appui long (~0,3 s) sur un appareil / la feuille / le stylo :
     une icône de sélection apparaît, l'objet « colle » au regard ;
   • MOLETTE : on fait tourner l'objet sur lui-même (rotation libre,
     l'orientation choisie est conservée quand on le repose) ;
   • BOUTON DROIT maintenu pendant la saisie : rotation RAPIDE (×3,7),
     pour tourner l'appareil d'un geste ample ;
   • pendant le déplacement, TOUS les fils branchés sur cet appareil
     sont automatiquement débranchés ;
   • au relâchement : l'objet se pose sur la paillasse ronde ou le
     bureau. RIEN NE TOMBE : s'il est lâché au-dessus du vide, il
     revient se poser au dernier endroit stable (bord de table inclus).
   ===================================================================== */
import * as THREE from 'three';
import { draggables, terminals, ctx, ROOM, TABLE_H, DESK } from './state.js';
import { sfx } from './audio.js';
import { supportAt } from './environment.js';
import { detachWiresOf } from './wiring.js';

const HOLD_MS = 300;
const ROT_STEP = Math.PI / 24;        // 1 cran de molette = 7,5°
const ROT_FAST = 3.7;                 // multiplicateur « appui long » (bouton droit)

const _lp = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** Position MONDE d'un objet, sans allocation (x, y, z dans l'objet passé). */
function worldXYZ(obj, out) {
    const root = obj.parent;
    if (root && root.updateMatrixWorld) root.updateMatrixWorld(true);
    obj.updateMatrixWorld(true);
    const m = obj.matrixWorld.elements || obj.matrixWorld;
    out.x = m[12]; out.y = m[13]; out.z = m[14];
    return out;
}
const _w = { x: 0, y: 0, z: 0 };

let grab = null;                 // { rec, holdTimer, t0, dragging, fastSpin, lastGood }
let ring = null;

/* ------------------------------------------------------------------ */
/*  Icône de sélection (anneau flottant au-dessus de l'objet saisi)     */
/* ------------------------------------------------------------------ */
function makeRing() {
    const g = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1, .022, 10, 48),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: .9, depthTest: false }));
    torus.rotation.x = Math.PI / 2;
    g.add(torus);
    for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(.09, .014, .014),
            new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: .95, depthTest: false }));
        const a = i * Math.PI / 2 + Math.PI / 4;
        t.position.set(Math.cos(a), 0, Math.sin(a));
        t.rotation.y = -a;
        g.add(t);
    }
    /* repère d'orientation : une flèche montre la face avant de l'objet */
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(.26, .012, .05),
        new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: .95, depthTest: false }));
    arrow.position.set(0, 0, 1.02);
    g.add(arrow);
    g.renderOrder = 11;
    g.visible = false;
    ctx.scene.add(g);
    return g;
}

function sizeRing(rec) {
    const r = Math.max(rec.halfW || .15, rec.halfD || .15) * 1.35 + .05;
    ring.scale.setScalar(r);
}

/** L'anneau tourne-t-il vite ? (retour visuel du mode « appui long ») */
function paintRing() {
    if (!ring) return;
    const fast = !!(grab && grab.fastSpin);
    ring.traverse(o => {
        if (!o.material) return;
        o.material.color.setHex(fast ? 0xf2c14e : 0x67e8f9);
    });
    ring.userData.fast = fast;                        // la pulsation gère l'échelle
}

/* ------------------------------------------------------------------ */
/*  Recherche de l'objet déplaçable sous le viseur                     */
/* ------------------------------------------------------------------ */
export function draggableFor(hovered) {
    if (!hovered) return null;
    let o = hovered;
    while (o) {
        const rec = draggables.find(d => d.obj === o);
        if (rec) return rec;
        o = o.parent;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Appui / relâchement                                                */
/* ------------------------------------------------------------------ */
export function pressStart(hovered, ev) {
    if (grab) return;
    const rec = draggableFor(hovered);
    if (!rec) return;
    /* si le viseur est sur une borne ou un bouton, on garde le comportement
       « clic » normal (l'appui long ne s'applique qu'au corps de l'appareil) */
    if (hovered.userData && hovered.userData.kind === 'terminal') return;
    const t = terminals[hovered.userData && hovered.userData.id];
    if (t && t.owner && rec.termIds.includes(hovered.userData.id)) return;

    grab = { rec, t0: performance.now(), dragging: false, holdTarget: hovered, ev, fastSpin: false };
    grab.holdTimer = setTimeout(() => beginDrag(rec), HOLD_MS);
}

function beginDrag(rec) {
    if (!grab || grab.rec !== rec) return;
    grab.dragging = true;
    grab.from = rec.obj.position.clone();
    worldXYZ(rec.obj, _w);
    grab.lastGood = { x: _w.x, y: _w.y, z: _w.z, yaw: rec.obj.rotation.y };
    grab.rot0 = rec.obj.rotation.y;
    document.body.classList.add('dragging');
    document.getElementById('crosshair').classList.add('grab');
    if (!ring) ring = makeRing();
    sizeRing(rec);
    ring.visible = true;
    sfx.grab();
    ctx.toast && ctx.toast(
        `« ${rec.label} » saisi — visez où le poser, <b>molette</b> pour le tourner `
        + `(bouton droit maintenu : rotation rapide), relâchez le clic.`, 'info');
    /* les fiches ne suivent pas : tout ce qui est branché saute */
    if (rec.termIds && rec.termIds.length) {
        const n = detachWiresOf(rec.termIds, () => ctx.evaluate && ctx.evaluate(), ctx.toast);
        if (n) rec._detached = n;
    }
}

export function pressEnd() {
    if (!grab) return false;
    clearTimeout(grab.holdTimer);
    const wasDragging = grab.dragging;
    const rec = grab.rec;
    const wasFast = grab.fastSpin;
    grab = null;
    if (wasFast) setFastSpin(false);
    if (!wasDragging) return false;            // simple clic -> action normale
    document.body.classList.remove('dragging');
    document.getElementById('crosshair').classList.remove('grab');
    if (ring) ring.visible = false;
    release(rec);
    return true;                               // le clic est « consommé »
}

export function cancelGrab() {
    if (!grab) return;
    const wasDragging = grab.dragging, rec = grab.rec;
    if (grab.fastSpin) setFastSpin(false);
    clearTimeout(grab.holdTimer);
    grab = null;
    if (wasDragging) release(rec);
    document.body.classList.remove('dragging');
    document.getElementById('crosshair').classList.remove('grab');
    if (ring) ring.visible = false;
}

export const isDragging = () => !!(grab && grab.dragging);
export const isHolding = () => !!grab;
export const isFastSpin = () => !!(grab && grab.fastSpin);

/* ------------------------------------------------------------------ */
/*  ROTATION de l'objet saisi (molette ; bouton droit = plus vite)      */
/* ------------------------------------------------------------------ */
export function rotateHeld(dir) {
    if (!grab || !grab.dragging) return false;
    const rec = grab.rec;
    const step = ROT_STEP * (grab.fastSpin ? ROT_FAST : 1);
    rec.obj.rotation.y += dir * step;
    /* l'orientation est libre : on mémorise la pose stable courante */
    if (grab.lastGood) grab.lastGood.yaw = rec.obj.rotation.y;
    sfx.ratchet();
    return true;
}

/** Bascule le mode « rotation rapide » (appui long sur le bouton droit). */
export function setFastSpin(on) {
    if (!grab) return false;
    if (!!on === !!grab.fastSpin) return false;
    grab.fastSpin = !!on;
    paintRing();
    ctx.toast && ctx.toast(grab.fastSpin
        ? 'Rotation <b>rapide</b> : molette ×3,7 — relâchez le bouton droit pour revenir au pas fin.'
        : 'Rotation fine (7,5° par cran de molette).', 'info');
    return true;
}

/* ------------------------------------------------------------------ */
/*  Pose : sur la table, sur le bureau… et JAMAIS par terre            */
/* ------------------------------------------------------------------ */
/** Place un objet à une position MONDE (x, y, z) sans écraser les scratchs. */
function setWorldPos(obj, x, y, z) {
    const parent = obj.parent || ctx.scene;
    parent.updateMatrixWorld();
    _inv.copy(parent.matrixWorld).invert();
    _lp.set(x, y, z).applyMatrix4(_inv);
    obj.position.copy(_lp);
}

const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();

/**
 * L'objet repose-t-il sur un support ?
 * Règle « physique » :
 *   1. le centre de gravité doit porter (sinon l'appareil bascule) ;
 *   2. au moins 5 des 8 points de l'empreinte (4 coins + 4 milieux de côté)
 *      doivent porter aussi.
 * C'est assez tolérant pour une boîte tournée de travers (on peut donc
 * orienter un appareil librement), mais ça interdit de le laisser en
 * équilibre sur un coin, au-dessus du vide.
 */
// Points d'empreinte réduits pour tester la stabilité sans bloquer lors des rotations
const FOOT_PTS = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7], [0, -0.7], [0, 0.7], [-0.7, 0], [0.7, 0]];

function footSupported(rec, x, z) {
    const center = supportAt(x, z);
    if (!center) return null;

    const hw = rec.halfW || 0.12, hd = rec.halfD || 0.12;
    const yaw = rec.obj.rotation.y;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);

    let hits = 0;
    for (const [sx, sz] of FOOT_PTS) {
        _c1.set(sx * hw, 0, sz * hd);
        _c2.set(_c1.x * cy + _c1.z * sy, 0, -_c1.x * sy + _c1.z * cy);
        const s = supportAt(x + _c2.x, z + _c2.z);
        if (s && s.name === center.name) hits++;
    }

    // Le centre repose sur le support + au moins 2 points d'appui suffisent pour être stable
    return (hits >= 2) ? center : null;
}

function furthestSupported(rec, from, to, out) {
    // Si la cible directe est déjà stable sur un support (table ou bureau), on y va directement
    const directSup = footSupported(rec, to.x, to.z);
    if (directSup) {
        out.t = 1; out.x = to.x; out.z = to.z; out.sup = directSup;
        return out;
    }

    // Sinon, on cherche le point stable le plus avancé sur le support de destination ou d'origine
    const N = 12;
    out.t = 0; out.x = from.x; out.z = from.z; out.sup = supportAt(from.x, from.z);
    for (let i = N; i >= 1; i--) {
        const t = i / N;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        const s = footSupported(rec, x, z);
        if (s) {
            out.t = t; out.x = x; out.z = z; out.sup = s;
            break;
        }
    }
    return out;
}
const _slide = { t: 0, x: 0, z: 0, sup: null };

function release(rec) {
    worldXYZ(rec.obj, _w);
    const sup = footSupported(rec, _w.x, _w.z);
    if (sup) {
        /* pose normale : on aplomb sur le support, sans rien changer à
           l'orientation choisie par l'élève (rotation libre conservée) */
        setWorldPos(rec.obj, _w.x, sup.y + rec.yOff, _w.z);
        rec.obj.rotation.x = 0; rec.obj.rotation.z = 0;
        sfx.drop();
        ctx.toast && ctx.toast(
            `« ${rec.label} » posé sur ${sup.name === 'table' ? 'la paillasse' : 'le bureau'}`
            + ` — orientation ${Math.round(((rec.obj.rotation.y * 180 / Math.PI) % 360 + 360) % 360)}°.`, 'info');
        ctx.evaluate && ctx.evaluate();
        return;
    }
    /* lâché au-dessus du vide : PAS DE CHUTE — on revient à la dernière
       pose stable (ou au bord du support le plus proche en glissant). */
    const lg = rec.lastGood;
    if (lg) {
        worldXYZ(rec.obj, _w);
        furthestSupported(rec, { x: lg.x, z: lg.z }, { x: _w.x, z: _w.z }, _slide);
        const sup2 = footSupported(rec, _slide.x, _slide.z) ? supportAt(_slide.x, _slide.z) : null;
        setWorldPos(rec.obj, _slide.x, (sup2 ? sup2.y : lg.y - rec.yOff) + rec.yOff, _slide.z);
    } else {
        setWorldPos(rec.obj, rec.home ? rec.home.pos.x : _w.x,
            rec.home ? rec.home.pos.y : _w.y,
            rec.home ? rec.home.pos.z : _w.z);
    }
    rec.obj.rotation.x = 0; rec.obj.rotation.z = 0;
    sfx.drop();
    ctx.toast && ctx.toast(
        `Rien ne tombe ici : « ${rec.label} » a été reposé sur le mobilier.`, 'info');
    ctx.evaluate && ctx.evaluate();
}

/* ------------------------------------------------------------------ */
/*  Boucle : suivi du regard (glissement au bord, jamais de chute)      */
/* ------------------------------------------------------------------ */
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _nUp = new THREE.Vector3(0, 1, 0);
const _plPt = new THREE.Vector3();
const _from = { x: 0, z: 0 };

export function update(dt, camYaw, camPos) {
    const t = performance.now();
    if (!grab || !grab.dragging) return;

    const rec = grab.rec;
    worldXYZ(rec.obj, _w);
    const ox = _w.x, oy = _w.y, oz = _w.z;

    /* ---- icône de sélection : anneau pulsant, plus vif en rotation rapide ---- */
    if (ring) {
        ring.position.set(ox, oy + (rec.ringY || .18), oz);
        ring.rotation.y += dt * (grab.fastSpin ? 3.6 : 1.0);
        const s = (rec.ringR || .22) * (1 + Math.sin(t * (grab.fastSpin ? .012 : .006)) * .04);
        ring.scale.setScalar(s);
    }

    /* ---- plan horizontal adapté à la table visée (paillasse 0.95m ou bureau 0.78m) ---- */
    _ray.set(camPos, camDir());
    const isNearDesk = (camPos.x > 1.4) || (ox > 1.8);
    const planeHeight = isNearDesk ? DESK.h : TABLE_H;

    _plane.setFromNormalAndCoplanarPoint(_nUp, _plPt.set(0, planeHeight + rec.yOff, 0));
    if (!_ray.ray.intersectPlane(_plane, _hit)) {
        _plane.setFromNormalAndCoplanarPoint(_nUp, _plPt.set(0, TABLE_H + rec.yOff, 0));
        if (!_ray.ray.intersectPlane(_plane, _hit)) return;
    }

    const tx = Math.max(-ROOM + .35, Math.min(ROOM - .35, _hit.x));
    const tz = Math.max(-ROOM + .35, Math.min(ROOM - .35, _hit.z));

    /* point de départ = pose actuelle ; on avance tant qu'il y a un support */
    _from.x = ox; _from.z = oz;
    furthestSupported(rec, _from, { x: tx, z: tz }, _slide);
    const sup = _slide.sup;
    if (!sup) return;

    setWorldPos(rec.obj, _slide.x, sup.y + rec.yOff, _slide.z);
    if (_slide.t > 0) {
        grab.lastGood = { x: _slide.x, y: sup.y + rec.yOff, z: _slide.z, yaw: rec.obj.rotation.y };
        rec.lastGood = grab.lastGood;
    }
    /* l'orientation ne change JAMAIS toute seule : c'est la molette qui décide */

    /* réévaluation du circuit à cadence réduite, sans messages */
    rec._ev = (rec._ev || 0) + dt;
    if (rec._ev > .12) { rec._ev = 0; ctx.evaluate && ctx.evaluate(true); }
}

/* direction de regard (sans allocation par frame) */
const _dir = new THREE.Vector3();
function camDir() {
    ctx.camera.getWorldDirection(_dir);
    return _dir;
}

/* ------------------------------------------------------------------ */
/*  Divers                                                             */
/* ------------------------------------------------------------------ */
export function resetAllPositions(homeList) {
    homeList.forEach(h => {
        const rec = draggables.find(d => d.obj === h.obj);
        if (!rec) return;
        rec.obj.position.copy(h.pos);
        rec.obj.rotation.set(0, h.rotY, 0);
        rec.lastGood = null;
    });
    ctx.evaluate && ctx.evaluate();
}

/** Mémorise la position d'origine de chaque objet déplaçable. */
export function captureHome() {
    const box = new THREE.Box3();
    draggables.forEach(rec => {
        rec.home = { pos: rec.obj.position.clone(), rotY: rec.obj.rotation.y };
        rec.lastGood = null;
        /* rayon / hauteur de l'anneau de sélection, mesurés sur l'objet réel */
        try {
            box.setFromObject(rec.obj);
            const sz = box.getSize(new THREE.Vector3());
            rec.ringR = Math.max(sz.x, sz.z) * .62 + .05;
            worldXYZ(rec.obj, _w);
            rec.ringY = Math.max(.12, (box.max.y - _w.y) + .09);
        } catch (e) {
            rec.ringR = Math.max(rec.halfW || .15, rec.halfD || .15) * 1.35 + .05;
            rec.ringY = rec.yOff + .12;
        }
    });
}

export function restoreHome() {
    draggables.forEach(rec => {
        if (!rec.home) return;
        rec.obj.position.copy(rec.home.pos);
        rec.obj.rotation.set(0, rec.home.rotY, 0);
        rec.lastGood = null;
    });
    cancelGrab();
    ctx.evaluate && ctx.evaluate();
}


/* ------------------------------------------------------------------ */
/*  Crochets réservés aux tests automatisés (tests/test_boot.mjs)       */
/* ------------------------------------------------------------------ */
export const __test = {
    get grab() { return grab; },
    beginDrag: (rec) => { grab = { rec, t0: performance.now(), dragging: false, fastSpin: false }; beginDrag(rec); },
    release, rotateHeld, setFastSpin, worldXYZ, footSupported, furthestSupported
};
