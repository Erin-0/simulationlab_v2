/* =====================================================================
   js/avatar.js  —  personnages multijoueurs.

   Silhouette VOLONTAIREMENT SIMPLE : un corps capsule, une tête,
   deux yeux, une bouche… et c'est tout (pas de bras, pas de jambes).
   Au-dessus : la plaque de nom et la bulle de chat façon « Roblox ».
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeNameSprite, makeBubbleSprite } from './textures.js';
import { sfx } from './audio.js';

export const peers = new Map();          // id -> avatar

const BODY_H = .92;
const HEAD_R = .19;
const BUBBLE_TTL = 5200;                 // ms

const SKIN = [0xf3d9c4, 0xe8c3a3, 0xc99b76, 0x9c6b4c, 0x6f4a34, 0xf7e3d4];
const FALLBACK = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#818cf8', '#fb7185', '#34d399'];

let _scene = null;
let soloMode = false;

/* ------------------------------------------------------------------ */
/*  Mode SOLO : aucun personnage n'est créé ni affiché                  */
/* ------------------------------------------------------------------ */
export function setSolo(on) {
    soloMode = !!on;
    if (soloMode) {
        for (const id of [...peers.keys()]) removePeer(id);
    }
    return soloMode;
}
export const isSolo = () => soloMode;

/* ------------------------------------------------------------------ */
/*  Construction d'un personnage                                       */
/* ------------------------------------------------------------------ */
function buildAvatar(id, name, colorHex, isLocal = false) {
    const g = new THREE.Group();
    const c = new THREE.Color(colorHex && colorHex.startsWith('#') ? colorHex : FALLBACK[Math.abs(hash(id)) % FALLBACK.length]);

    /* ---- corps : capsule sans membres ---- */
    const bodyMat = new THREE.MeshStandardMaterial({
        color: c, roughness: .55, metalness: .12, emissive: c.clone().multiplyScalar(.16)
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.23, BODY_H - .46, 6, 20), bodyMat);
    body.position.y = BODY_H / 2;
    body.scale.set(1, 1, .8);
    body.castShadow = true;
    g.add(body);

    /* ---- tête ---- */
    const skin = SKIN[Math.abs(hash(id + 's')) % SKIN.length];
    const headMat = new THREE.MeshStandardMaterial({ color: skin, roughness: .62, metalness: .04 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 26, 20), headMat);
    head.position.y = BODY_H + HEAD_R * .72;
    head.scale.set(1, .96, .94);
    head.castShadow = true;
    g.add(head);

    /* ---- deux yeux ---- */
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: .25 });
    const eyes = new THREE.Group();
    [-1, 1].forEach(s => {
        const w = new THREE.Mesh(new THREE.SphereGeometry(.052, 16, 14), eyeWhite);
        w.position.set(s * .072, .03, HEAD_R * .84);
        w.scale.set(1, 1.15, .55);
        const p = new THREE.Mesh(new THREE.SphereGeometry(.024, 12, 10), pupilMat);
        p.position.set(s * .072, .028, HEAD_R * .95);
        p.scale.set(1, 1.1, .5);
        eyes.add(w, p);
    });
    eyes.position.y = head.position.y;
    g.add(eyes);

    /* ---- bouche : un simple arc ---- */
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 8, 20, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x59303a, roughness: .5 }));
    mouth.position.set(0, head.position.y - .075, HEAD_R * .88);
    mouth.rotation.z = Math.PI;
    mouth.scale.set(1, 1, .6);
    g.add(mouth);

    /* ---- liseré lumineux (couleur du joueur) ---- */
    const band = new THREE.Mesh(new THREE.TorusGeometry(.235, .012, 8, 30),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, roughness: .4 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = BODY_H * .62;
    band.scale.set(1, .8, 1);
    g.add(band);

    /* ---- flash rouge quand il est frappé ---- */
    const flash = new THREE.Mesh(new THREE.CapsuleGeometry(.245, BODY_H - .44, 4, 14),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.y = BODY_H / 2;
    flash.scale.set(1.02, 1, .84);
    g.add(flash);
    const flashHead = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    flashHead.position.y = head.position.y;
    g.add(flashHead);

    /* ---- plaque de nom ---- */
    const label = makeNameSprite(name || 'Élève', 'rgba(8,14,22,.82)', '#eaf7ff', '#' + c.getHexString());
    label.position.y = BODY_H + HEAD_R * 2 + .26;
    g.add(label);

    /* ---- marqueur au-dessus du joueur local ---- */
    let me = null;
    if (isLocal) {
        me = new THREE.Mesh(new THREE.ConeGeometry(.07, .16, 4),
            new THREE.MeshBasicMaterial({ color: 0xfcd34d, transparent: true, opacity: .9 }));
        me.rotation.x = Math.PI;
        me.position.y = label.position.y + .3;
        g.add(me);
    }

    /* les enfants ne déclenchent pas le ramassage d'objets ; la racine porte
       l'identifiant du joueur pour le raycast des « coups » */
    g.traverse(o => { o.userData.ignorePick = true; });
    g.userData.ignorePick = false;
    g.userData.__peerId = id;
    g.userData.interact = true;
    g.userData.kind = 'peer';

    return {
        id, name, color: c, group: g, body, head, eyes, mouth, band,
        flash, flashHead, label, me,
        target: new THREE.Vector3(0, 0, 0),
        yaw: 0, yawTarget: 0,
        crouch: 0, crouchT: 0,
        punch: 0, hurt: 0, bob: 0,
        bubble: null, bubbleUntil: 0,
        speed: 0, last: g.position.clone(),
        visible: true
    };
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */
export function init(scene) { _scene = scene; }

export function addPeer(id, name, color, local = false) {
    if (soloMode) return null;                 /* solo : aucun personnage */
    if (peers.has(id)) return peers.get(id);
    const a = buildAvatar(id, name, color, local);
    peers.set(id, a);
    if (_scene) _scene.add(a.group);
    return a;
}

export function removePeer(id) {
    const a = peers.get(id);
    if (!a) return;
    peers.delete(id);
    if (_scene) _scene.remove(a.group);
    a.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
}

export function setPeerState(id, s) {
    const a = peers.get(id);
    if (!a) return;
    if (typeof s.x === 'number' && Number.isFinite(s.x)) a.target.set(s.x, 0, s.z);
    if (typeof s.y === 'number') a.eyeY = s.y;
    if (typeof s.lvl === 'string') a.lvl = s.lvl;
    if (typeof s.yaw === 'number') a.yawTarget = s.yaw;
    a.crouchT = s.crouch ? 1 : 0;
    a.punch = s.punch || 0;
    a.bob = s.bob || 0;
}

export function setPeerName(id, name) {
    const a = peers.get(id);
    if (!a || a.name === name) return;
    a.name = name;
    a.group.remove(a.label);
    a.label.material.map.dispose(); a.label.material.dispose();
    a.label = makeNameSprite(name, 'rgba(8,14,22,.82)', '#eaf7ff', '#' + a.color.getHexString());
    a.label.position.y = BODY_H + HEAD_R * 2 + .26;
    a.group.add(a.label);
}

/** Bulle de chat au-dessus de la tête (façon Roblox), puis disparition. */
export function say(id, text) {
    const a = peers.get(id);
    if (!a) return;
    if (a.bubble) {
        a.group.remove(a.bubble);
        a.bubble.material.map.dispose(); a.bubble.material.dispose();
        a.bubble = null;
    }
    const b = makeBubbleSprite(text);
    b.position.y = BODY_H + HEAD_R * 2 + .78;
    b.material.opacity = 0;
    a.group.add(b);
    a.bubble = b;
    b.userData.sx = b.scale.x; b.userData.sy = b.scale.y;
    a.bubbleUntil = performance.now() + BUBBLE_TTL;
    sfx.msgIn();
}

/** Impact : flash rouge + recul (le recul du joueur local est géré côté player.js). */
export function hurtPeer(id, amount = 1) {
    const a = peers.get(id);
    if (!a) return;
    a.hurt = Math.max(a.hurt, amount || 1);
}

export function setLocalAvatarTransform(id, pos, yaw, crouch, punch, hurt, bob) {
    const a = peers.get(id);
    if (!a) return;
    a.group.position.set(pos.x, 0, pos.z);
    a.yaw = a.yawTarget = yaw;
    a.crouchT = crouch ? 1 : 0;
    a.punch = punch;
    a.hurt = Math.max(a.hurt, hurt);
    a.bob = bob;
}

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */
const _v = new THREE.Vector3();
export function update(dt, t, localId) {
    for (const a of peers.values()) {
        const isLocal = a.id === localId;

        /* ---- interpolation de position (distants) ---- */
        if (!isLocal) {
            const before = a.group.position.clone();
            const k = 1 - Math.pow(.0009, dt);
            a.group.position.lerp(a.target, k);
            _v.subVectors(a.group.position, before);
            a.speed = a.speed * .8 + (_v.length() / Math.max(dt, 1e-4)) * .2;
            /* rotation douce (plus court chemin angulaire) */
            let d = a.yawTarget - a.yaw;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            a.yaw += d * Math.min(1, dt * 12);
        } else {
            _v.subVectors(a.group.position, a.last);
            a.speed = a.speed * .8 + (_v.length() / Math.max(dt, 1e-4)) * .2;
            a.last.copy(a.group.position);
        }
        a.group.rotation.y = a.yaw + Math.PI;      // le visage regarde là où il va

        /* ---- accroupissement ---- */
        a.crouch += (a.crouchT - a.crouch) * Math.min(1, dt * 10);
        const sq = 1 - a.crouch * .28;
        a.body.scale.set(1 + a.crouch * .08, sq, .8 + a.crouch * .08);
        a.body.position.y = (BODY_H / 2) * sq;
        const hy = (BODY_H + HEAD_R * .72) * sq;
        a.head.position.y = hy; a.eyes.position.y = hy; a.mouth.position.y = hy - .075;
        a.band.position.y = BODY_H * .62 * sq;
        a.label.position.y = hy + HEAD_R + .3;
        if (a.me) a.me.position.y = a.label.position.y + .3;
        if (a.bubble) a.bubble.position.y = a.label.position.y + .5;

        /* ---- dodelinement de marche ---- */
        const walk = Math.min(1, a.speed / 1.6);
        a.group.position.y = Math.sin(t * 9 + a.bob) * .018 * walk;
        a.group.rotation.z = Math.sin(t * 4.5 + a.bob) * .035 * walk;

        /* ---- coup de poing : petit bond en avant ---- */
        a.punch = Math.max(0, a.punch - dt * 3.4);
        const p = a.punch;
        a.group.rotation.x = -p * .3;
        a.body.scale.z = (.8 + p * .3);
        a.mouth.scale.set(1 + p * .6, 1 + p * .9, .6);

        /* ---- impact : flash rouge ---- */
        a.hurt = Math.max(0, a.hurt - dt * 2.2);
        const h = a.hurt;
        a.flash.material.opacity = h * .85;
        a.flashHead.material.opacity = h * .8;
        a.body.material.emissiveIntensity = h * 1.4;

        /* ---- clignement des yeux ---- */
        const blink = (Math.sin(t * 1.7 + hash(a.id) % 7) > .985) ? .12 : 1;
        a.eyes.scale.y = blink;

        /* ---- bulle de chat ---- */
        if (a.bubble) {
            const left = a.bubbleUntil - performance.now();
            if (left <= 0) {
                a.group.remove(a.bubble);
                a.bubble.material.map.dispose(); a.bubble.material.dispose();
                a.bubble = null;
            } else {
                const app = Math.min(1, (BUBBLE_TTL - left) / 220);
                const dis = Math.min(1, left / 500);
                a.bubble.material.opacity = Math.min(app, dis);
                const s = .9 + app * .1;
                a.bubble.scale.set(a.bubble.userData.sx * s, a.bubble.userData.sy * s, 1);
            }
        }
    }
}

export function peerCount() { return peers.size; }

export function nearestPeer(pos, maxDist = 1.7, exceptId = null) {
    let best = null, bd = maxDist;
    for (const a of peers.values()) {
        if (a.id === exceptId) continue;
        const d = Math.hypot(a.group.position.x - pos.x, a.group.position.z - pos.z);
        if (d < bd) { bd = d; best = a; }
    }
    return best;
}
