/* =====================================================================
   js/robot.js  —  OHMIE, le robot tuteur volant du Labo 3D
   =====================================================================
   Un compagnon de paillasse, pas un aspirateur : il vole autour de la
   table ronde à la hauteur des yeux du joueur, change d'humeur tout
   seul (^_^), regarde l'élève, pointe son laser rouge vers l'appareil
   dont il parle, et affiche ses réponses dans une bulle façon Roblox
   (bulle 3D partagée avec les avatars, tronquée et éphémère).

   Rôles exposés (utilisés par js/tutor.js et js/main.js) :
     • buildRobot()              construction, une seule fois
     • updateRobot(dt, t)        vol, humeurs, laser, bulle (boucle de jeu)
     • robotSay(texte)           bulle Roblox au-dessus de sa tête
     • robotMood(m, ttl)         force une expression un instant
     • robotPointDevice(texte)   vise au laser l'appareil cité dans la réponse
   ===================================================================== */
import * as THREE from 'three';
import { S, ctx, TABLE_R, EYE_STAND, draggables } from './state.js';
import { makeBubbleSprite } from './textures.js';
import { sfx } from './audio.js';

export const ROBOT_NAME = 'Ohmie';

/* humeurs possibles du visage (kaomojis, tirées au sort très souvent) */
const MOODS = ['^_^', 'o_o', '^o^', '*_*', 'o_O', '-_-', '^w^', '=_=', '•_•'];
const BUBBLE_BASE_TTL = 16000;        // ms : durée de base rallongée pour laisser le temps de lire
const BUBBLE_MAX = 130;               // caractères dans la bulle 3D

let group = null, core = null, lensMesh = null;
let faceCtx = null, faceTex = null;
let mood = '^_^', moodUntil = 0, nextMoodAt = 0;
let wp = new THREE.Vector3(), wpTimer = 0;
let lookYaw = 0, talkUntil = 0;
let laserBeam = null, laserDot = null, deviceBeacon = null;
let laserObj = null, laserUntil = 0;
let bubble = null, bubbleUntil = 0;

const _tgt = new THREE.Vector3();
const _lensPos = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();

/* ------------------------------------------------------------------ */
/*  Visage : petit écran sombre où s'affiche l'humeur                 */
/* ------------------------------------------------------------------ */
function drawFace() {
    if (!faceCtx) return;
    const c = faceCtx, W = c.canvas.width, H = c.canvas.height;
    /* fond dégradé bleu nuit */
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07101e'); g.addColorStop(1, '#0c1828');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    /* lignes de balayage subtiles façon écran CRT */
    c.fillStyle = 'rgba(0,0,0,.13)';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2);
    /* reflet de verre en haut de l'écran */
    const shine = c.createLinearGradient(0, 0, 0, H * .4);
    shine.addColorStop(0, 'rgba(140,215,255,.08)');
    shine.addColorStop(1, 'rgba(140,215,255,0)');
    c.fillStyle = shine; c.fillRect(0, 0, W, H * .36);
    /* joues rosées : dégradés radiaux dans les coins bas de l'écran */
    for (const sx of [-1, 1]) {
        const rg = c.createRadialGradient(W / 2 + sx * 78, H * .78, 0, W / 2 + sx * 78, H * .78, 20);
        rg.addColorStop(0, 'rgba(255,120,150,.52)');
        rg.addColorStop(1, 'rgba(255,120,150,0)');
        c.fillStyle = rg; c.fillRect(0, 0, W, H);
    }
    /* expression — plus grande, lueur prononcée */
    c.fillStyle = '#7df3ff';
    c.shadowColor = '#22d3ee'; c.shadowBlur = 22;
    c.font = '700 56px "JetBrains Mono",monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(mood, W / 2, H / 2 + 2);
    c.shadowBlur = 0;
    /* indicateur d'antenne clignotant (coin bas-droit) */
    c.fillStyle = (performance.now() % 900) < 450 ? '#ffb454' : 'rgba(255,180,84,.18)';
    c.beginPath(); c.arc(W - 18, H - 15, 5, 0, Math.PI * 2); c.fill();
    if (faceTex) faceTex.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/*  Construction                                                      */
/* ------------------------------------------------------------------ */
export function buildRobot() {
    group = new THREE.Group();
    group.name = ROBOT_NAME;
    core = new THREE.Group();
    group.add(core);

    /* ── CORPS ──────────────────────────────────────────────────────────
       Sphère haute-résolution, galbe d'œuf poli, couleur corail signature.
       À y = 0.024 (centre du panneau-visage), la surface de la sphère
       en Z vaut environ z ≈ 0.133. Tout élément de face doit être > 0.133.  */
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8f68, roughness: .26, metalness: .10 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(.15, 48, 32), bodyMat);
    body.scale.set(1, .96, .90);
    body.castShadow = true;
    core.add(body);

    /* fine couture de capot */
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.148, .0022, 8, 48),
        new THREE.MeshStandardMaterial({ color: 0xe05c35, roughness: .45, metalness: .20 }));
    seam.position.y = .05; seam.scale.set(1, .94, .90);
    core.add(seam);

    /* ventre crème */
    const belly = new THREE.Mesh(new THREE.SphereGeometry(.118, 32, 24),
        new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: .42, metalness: .04 }));
    belly.position.set(0, -.040, .050); belly.scale.set(.88, .72, .48);
    core.add(belly);

    /* ── PANNEAU-VISAGE ──────────────────────────────────────────────────
       Boîtier sombre centré en z = .132  →  face avant à z = .144.
       Cela le place clairement devant la surface de la sphère (z ≈ .133).
       La partie arrière du boîtier qui plonge dans la sphère est cachée
       par le corps opaque — c'est un comportement souhaité.               */
    const housing = new THREE.Mesh(new THREE.BoxGeometry(.212, .142, .024),
        new THREE.MeshStandardMaterial({ color: 0x252d3e, roughness: .28, metalness: .52 }));
    housing.position.set(0, .024, .132);
    core.add(housing);

    /* cadre LED cyan : 4 barres encadrant l'écran, à z = .148
       (entre la face avant du boîtier z=.144 et l'écran z=.152)          */
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const ledZ = .148;
    /* top */
    const barT = new THREE.Mesh(new THREE.BoxGeometry(.193, .004, .002), ledMat);
    barT.position.set(0, .078, ledZ); core.add(barT);
    /* bottom */
    const barB = new THREE.Mesh(new THREE.BoxGeometry(.193, .004, .002), ledMat);
    barB.position.set(0, -.022, ledZ); core.add(barB);
    /* left */
    const barL = new THREE.Mesh(new THREE.BoxGeometry(.004, .095, .002), ledMat);
    barL.position.set(-.095, .028, ledZ); core.add(barL);
    /* right */
    const barR = new THREE.Mesh(new THREE.BoxGeometry(.004, .095, .002), ledMat);
    barR.position.set( .095, .028, ledZ); core.add(barR);

    /* petit voyant de statut vert dans le coin supérieur du boîtier */
    const statusLed = new THREE.Mesh(new THREE.CircleGeometry(.0055, 10),
        new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    statusLed.position.set(.094, .086, .145); core.add(statusLed);

    /* ── ÉCRAN ───────────────────────────────────────────────────────────
       PlaneGeometry simple à z = .152.
       • Devant le boîtier  (face avant z = .144)   : Δ = +0.008  ✓
       • Devant la sphère   (surface    z ≈ .133)   : Δ = +0.019  ✓
       Aucun risque d'enfouissement. Les joues rosées sont désormais
       dessinées directement sur le canvas (voir drawFace).               */
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    faceCtx = cv.getContext('2d');
    faceTex = new THREE.CanvasTexture(cv);
    const visor = new THREE.Mesh(new THREE.PlaneGeometry(.185, .095),
        new THREE.MeshBasicMaterial({ map: faceTex }));
    visor.position.set(0, .028, .152);
    core.add(visor);

    /* ── OREILLES-TURBINES ───────────────────────────────────────────────
       Cylindre + deux demi-sphères (compatible toutes versions three.js)  */
    for (const sx of [-1, 1]) {
        const earMat = new THREE.MeshStandardMaterial({ color: 0x323a4d, roughness: .32, metalness: .48 });
        const earCyl = new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, .020, 18), earMat);
        earCyl.rotation.z = Math.PI / 2;
        earCyl.position.set(sx * .154, .012, 0);
        core.add(earCyl);
        for (const cs of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(.034, 18, 12), earMat);
            cap.position.set(sx * .154 + cs * .010, .012, 0);
            core.add(cap);
        }
        /* anneau cyan + disque-cœur lumineux */
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.025, .005, 10, 24),
            new THREE.MeshStandardMaterial({ color: 0x0e7490, emissive: 0x3ce7ff, emissiveIntensity: 2.0, roughness: .25 }));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(sx * .176, .012, 0);
        core.add(ring);
        const glowDot = new THREE.Mesh(new THREE.CircleGeometry(.016, 18),
            new THREE.MeshBasicMaterial({ color: 0x8ff3ff }));
        glowDot.rotation.y = Math.PI / 2;
        glowDot.position.set(sx * .179, .012, 0);
        core.add(glowDot);
    }

    /* ── ANTENNE ── tige fuselée + orbe double couche */
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.003, .006, .088, 10),
        new THREE.MeshStandardMaterial({ color: 0x323a4d, roughness: .28, metalness: .62 }));
    ant.position.set(0, .183, 0); core.add(ant);
    const tipInner = new THREE.Mesh(new THREE.SphereGeometry(.013, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffb454, emissive: 0xffa028, emissiveIntensity: 2.0, roughness: .22 }));
    tipInner.position.set(0, .234, 0); core.add(tipInner);
    const tipOuter = new THREE.Mesh(new THREE.SphereGeometry(.020, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: .28 }));
    tipOuter.position.copy(tipInner.position); core.add(tipOuter);

    /* ── COLLERETTE DE SUSTENTATION ── anneau + halo translucide */
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.096, .009, 12, 32),
        new THREE.MeshStandardMaterial({ color: 0x0e7490, emissive: 0x22d3ee, emissiveIntensity: 1.1, roughness: .3, metalness: .3 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = -.148;
    core.add(collar);
    const collarAura = new THREE.Mesh(new THREE.TorusGeometry(.096, .018, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .16 }));
    collarAura.rotation.x = Math.PI / 2; collarAura.position.y = -.148;
    core.add(collarAura);

    /* ── ÉMETTEUR LASER ── cylindre-lentille sous le menton */
    const emit = new THREE.Mesh(new THREE.CylinderGeometry(.011, .013, .018, 14),
        new THREE.MeshStandardMaterial({ color: 0x323a4d, roughness: .28, metalness: .58 }));
    emit.rotation.x = Math.PI / 2;
    emit.position.set(0, -.075, .120); core.add(emit);

    lensMesh = new THREE.Mesh(new THREE.CircleGeometry(.0075, 14),
        new THREE.MeshBasicMaterial({ color: 0xff4432 }));
    lensMesh.position.set(0, -.075, .1295); core.add(lensMesh);

    /* IMPORTANT : Le faisceau et le point sont ajoutés à la scène directe (coordonnées monde),
       sinon ils subissent deux fois la matrice du robot et pointent de travers ! */
    laserBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(.0025, .0025, 1, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff281e, transparent: true, opacity: 0.88, depthWrite: false })
    );
    laserBeam.visible = false;
    ctx.scene.add(laserBeam);

    laserDot = new THREE.Mesh(
        new THREE.SphereGeometry(.014, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xff3322 })
    );
    laserDot.visible = false;
    ctx.scene.add(laserDot);

    /* Balise / Flèche 3D flottante au-dessus de l'appareil pointé */
    deviceBeacon = new THREE.Group();
    const beaconCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.11, 16),
        new THREE.MeshStandardMaterial({ color: 0xff281e, emissive: 0xff3322, emissiveIntensity: 0.9 })
    );
    beaconCone.rotation.x = Math.PI; // Pointe vers le bas
    deviceBeacon.add(beaconCone);

    const beaconRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.007, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.85 })
    );
    beaconRing.rotation.x = Math.PI / 2;
    beaconRing.position.y = 0.06;
    deviceBeacon.add(beaconRing);

    deviceBeacon.visible = false;
    ctx.scene.add(deviceBeacon);

    group.position.set(TABLE_R + .55, EYE_STAND + .18, .2);
    ctx.scene.add(group);
    ctx.robot = group;

    nextMoodAt = performance.now() + 3500;
    wpTimer = 0;
    drawFace();
    return group;
}

/* ------------------------------------------------------------------ */
/*  Vol : Positionnement prédictif dans le champ de vision du joueur  */
/*        (Jamais dans le dos, jamais à ras du corps)                */
/* ------------------------------------------------------------------ */
function pickWaypoint() {
    const playerPos = ctx.yawObj ? ctx.yawObj.position : null;
    const cam = ctx.camera;
    const eyeY = playerPos ? playerPos.y : EYE_STAND;

    if (!playerPos || !cam) {
        // Repli par défaut si le joueur n'est pas encore prêt
        const a = Math.PI * 0.25;
        wp.set(Math.sin(a) * 1.6, eyeY + 0.18, Math.cos(a) * 1.6);
        wpTimer = 3.5;
        return;
    }

    // Direction horizontale du regard du joueur
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    else fwd.normalize();

    // Vecteur latéral droit
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

    // Choix d'un côté (alternance gauche/droite à 35°–55° du centre visuel)
    const side = Math.random() > 0.5 ? 1 : -1;
    const lateralAngle = (0.65 + Math.random() * 0.35) * side; // ~37° à ~57°

    // Distance confortable : 1.9m à 2.6m du joueur (jamais trop près)
    const distance = 1.9 + Math.random() * 0.7;

    const offsetDir = new THREE.Vector3()
        .addScaledVector(fwd, Math.cos(lateralAngle))
        .addScaledVector(right, Math.sin(lateralAngle))
        .normalize();

    const targetPos = playerPos.clone().addScaledVector(offsetDir, distance);

    // Maintien à l'intérieur des murs de la pièce (marge de 0.9 m)
    const roomLimit = 4.1;
    targetPos.x = Math.max(-roomLimit, Math.min(roomLimit, targetPos.x));
    targetPos.z = Math.max(-roomLimit, Math.min(roomLimit, targetPos.z));

    // Éviter de s'enfoncer au centre de la paillasse s'il est bas
    const distTable = Math.hypot(targetPos.x, targetPos.z);
    if (distTable < TABLE_R + 0.15) {
        const factor = (TABLE_R + 0.25) / Math.max(0.1, distTable);
        targetPos.x *= factor;
        targetPos.z *= factor;
    }

    // Hauteur : légèrement au-dessus du regard (ne masque pas les façades)
    targetPos.y = eyeY + 0.12 + Math.random() * 0.28;

    wp.copy(targetPos);
    wpTimer = 4.0 + Math.random() * 3.0; // Reste posé plus longtemps
}

export function updateRobot(dt, t) {
    if (!group) return;
    const now = performance.now();
    const talking = now < talkUntil;

    /* Humeur aléatoire fréquente hors conversation */
    if (now >= moodUntil && now >= nextMoodAt) {
        mood = MOODS[(Math.random() * MOODS.length) | 0];
        nextMoodAt = now + 4000 + Math.random() * 5000;
        drawFace();
    } else if ((performance.now() % 900) < 30) {
        drawFace(); // clignotement antenne
    }

    /* ── DÉPLACEMENT & ARRÊT EN CONVERSATION ──
       Si Ohmie parle, il S'ARRÊTE de voler vers de nouveaux waypoints.
       Il reste en vol stationnaire doux. */
    if (!talking) {
        wpTimer -= dt;
        if (wpTimer <= 0) pickWaypoint();

        const k = 1 - Math.exp(-2.2 * dt);
        group.position.x += (wp.x - group.position.x) * k;
        group.position.z += (wp.z - group.position.z) * k;
        group.position.y += (wp.y - group.position.y) * k;
    }

    // Flottement stationnaire organique
    core.position.y = Math.sin(t * 2.2) * (talking ? 0.010 : 0.018);
    core.rotation.z = Math.sin(t * 1.4) * (talking ? 0.025 : 0.05);
    core.rotation.x = Math.sin(t * 1.9 + 1) * (talking ? 0.020 : 0.04);

    /* ── ORIENTATION DU REGARD ──
       Regarde en face du joueur s'il parle ou s'il est proche */
    const eye = ctx.yawObj ? ctx.yawObj.position : null;
    if (eye) {
        const dPlayer = Math.hypot(group.position.x - eye.x, group.position.z - eye.z);
        if (talking || dPlayer < 3.2) {
            _tgt.set(eye.x, eye.y - 0.05, eye.z);
        } else if (laserObj) {
            laserObj.getWorldPosition(_tgt);
        } else {
            _tgt.set(0, TABLE_R * 0.4, 0);
        }

        const want = Math.atan2(_tgt.x - group.position.x, _tgt.z - group.position.z);
        let d = want - lookYaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        lookYaw += d * Math.min(1, dt * 5);
        group.rotation.y = lookYaw;
    }

    /* ── FAISCEAU LASER & BALISE 3D D'APPAREIL POINTÉ ──
       Recalcul dynamique exact en coordonnées monde pour suivre
       les déplacements d'appareils par le joueur */
    if (laserObj && now < laserUntil) {
        // Centre exact de la boîte englobante de l'appareil
        _box.setFromObject(laserObj);
        _box.getCenter(_tgt);

        // Position monde réelle de la lentille d'émission
        if (lensMesh) {
            lensMesh.getWorldPosition(_lensPos);
        } else {
            _lensPos.copy(group.position);
        }

        const dir = new THREE.Vector3().subVectors(_tgt, _lensPos);
        const len = dir.length();

        if (len > 0.08) {
            laserBeam.visible = laserDot.visible = true;
            // Place le cylindre à mi-chemin entre la lentille et la cible
            laserBeam.position.copy(_lensPos).addScaledVector(dir, 0.5);
            laserBeam.scale.set(1, len, 1);
            laserBeam.quaternion.setFromUnitVectors(_Y, dir.clone().normalize());

            laserDot.position.copy(_tgt);

            // Balise flottante au-dessus de l'appareil (rebondit doucement)
            if (deviceBeacon) {
                deviceBeacon.visible = true;
                deviceBeacon.position.set(_tgt.x, _box.max.y + 0.12 + Math.sin(t * 4.5) * 0.025, _tgt.z);
                deviceBeacon.rotation.y += dt * 2.2;
            }
        }
    } else {
        if (laserBeam) laserBeam.visible = false;
        if (laserDot) laserDot.visible = false;
        if (deviceBeacon) deviceBeacon.visible = false;
        laserObj = null;
    }

    /* ── BULLE DE PAROLE ROBLOX ── */
    if (bubble) {
        const left = bubbleUntil - now;
        if (left <= 0) {
            group.remove(bubble);
            if (bubble.material.map) bubble.material.map.dispose();
            bubble.material.dispose();
            bubble = null;
        } else {
            const total = bubble.userData.ttl || BUBBLE_BASE_TTL;
            const a = Math.min(1, (total - left) / 300, left / 600);
            bubble.material.opacity = a;
            const s = 0.85 + 0.15 * Math.min(1, (total - left) / 300);
            bubble.scale.set(bubble.userData.sx * s, bubble.userData.sy * s, 1);
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Parole : bulle 3D + humeur + laser                                */
/* ------------------------------------------------------------------ */
export function robotSay(text) {
    if (!group) return;
    if (bubble) {
        group.remove(bubble);
        if (bubble.material.map) bubble.material.map.dispose();
        bubble.material.dispose();
        bubble = null;
    }
    let txt = String(text || '').trim();
    if (txt.length > BUBBLE_MAX) txt = txt.slice(0, BUBBLE_MAX - 1).trimEnd() + '…';

    const b = makeBubbleSprite(txt, 26);
    b.position.y = .46;
    b.material.opacity = 0;
    b.userData.sx = b.scale.x;
    b.userData.sy = b.scale.y;

    // Durée proportionnelle à la longueur du texte (minimum 14s, jusqu'à 24s)
    const speechDuration = Math.max(BUBLE_BASE_TTL_MS(), 5000 + txt.length * 80);
    b.userData.ttl = speechDuration;

    group.add(b);
    bubble = b;
    bubbleUntil = performance.now() + speechDuration;
    talkUntil = performance.now() + speechDuration;

    sfx.msgIn && sfx.msgIn();
}
function BUBLE_BASE_TTL_MS() { return BUBBLE_BASE_TTL; }

export function robotMood(m, ttl = 3200) {
    mood = m; moodUntil = performance.now() + ttl;
    nextMoodAt = moodUntil + 1200;
    drawFace();
}
/* ------------------------------------------------------------------ */
/*  قاموس الكلمات الدلالية الذكي (يدعم العربية والفرنسية والإنجليزية)   */
/* ------------------------------------------------------------------ */
const DEVICE_MAP = [
    {
        category: 'generator',
        keywords: [
            // العربية
            'مولد', 'تغذية', 'منبع', 'طاقة', 'e1', 'e2', 'gbf',
            // الفرنسية / الإنجليزية
            'générateur', 'generateur', 'alimentation', 'power supply', 'source', 'gbf'
        ],
        // التسميات المطابقة في draggables حسب نوع التجربة
        labels: ['générateur', 'alimentation e1', 'alimentation e2', 'générateur basses fréquences', 'gbf']
    },
    {
        category: 'voltmeter',
        keywords: [
            'فولتمتر', 'فولتميتر', 'مقياس الجهد', 'voltmètre', 'voltmetre', 'voltmeter', 'tension'
        ],
        labels: ['voltmètre', 'voltmeter']
    },
    {
        category: 'ammeter',
        keywords: [
            'أمبيرمتر', 'امبيرمتر', 'امتر', 'مقياس التيار', 'ampèremètre', 'amperemetre', 'ammeter', 'courant'
        ],
        labels: ['ampèremètre', 'ammeter']
    },
    {
        category: 'oscilloscope',
        keywords: [
            'راسم', 'اهتزاز', 'اشارة', 'إشارة', 'سكوب', 'oscilloscope', 'scope'
        ],
        labels: ['oscilloscope']
    },
    {
        category: 'rheostat',
        keywords: [
            'ريوستات', 'مقاومة متغيرة', 'rhéostat', 'rheostat'
        ],
        labels: ['rhéostat', 'rheostat']
    },
    {
        category: 'decade_box',
        keywords: [
            'عقود', 'صندوق مقاومات', 'décades', 'decades', 'boîte à décades'
        ],
        labels: ['boîte à décades', 'decades']
    },
    {
        category: 'galvanometer',
        keywords: [
            'جلفانومتر', 'غالغانومتر', 'galvanomètre', 'galvanometre', 'galvo'
        ],
        labels: ['galvanomètre']
    },
    {
        category: 'board',
        keywords: [
            'لوحة', 'ماكيت', 'قنطرة', 'جسر', 'مرشح', 'فيلتر',
            'maquette', 'pont', 'wheatstone', 'filtre', 'board'
        ],
        labels: ['carte du pont', 'maquette', 'filtres']
    },
    {
        category: 'resistor',
        keywords: [
            'مقاومة', 'résistance', 'resistor'
        ],
        labels: ['résistance r', 'résistance']
    },
    {
        category: 'paper',
        keywords: [
            'ورقة', 'دفتر', 'كراس', 'تقرير', 'جدول',
            'feuille', 'papier', 'cahier', 'table'
        ],
        labels: ['feuille de relevés', 'feuille']
    },
    {
        category: 'pen',
        keywords: [
            'قلم', 'stylo', 'pen'
        ],
        labels: ['stylo']
    }
];

/** التحقق من أن الجهاز معروض ومرئي حالياً على الطاولة وليس في تجربة أخرى مخفية */
function isDeviceVisible(obj) {
    if (!obj) return false;
    let curr = obj;
    while (curr) {
        if (curr.visible === false) return false;
        curr = curr.parent;
    }
    return true;
}

/**
 * يحدد الجهاز الأنسب للإشارة إليه بناءً على سؤال التلميذ وإجابة الروبوت
 * مع إعطاء الأولوية القصوى لما سأل عنه التلميذ مباشرة!
 */
export function robotPointDevice(text, userQuestion = '') {
    if (!group) return false;

    const botTxt = String(text || '').toLowerCase();
    const qTxt = String(userQuestion || '').toLowerCase();

    let bestMatch = null;
    let highestScore = -1;

    for (const dev of DEVICE_MAP) {
        let score = 0;

        // 1. الأولوية العظمى: إذا ذكر التلميذ هذا الجهاز في سؤاله (مثل: "أين المولد؟")
        for (const kw of dev.keywords) {
            if (qTxt.includes(kw)) {
                score += 1000;
                break;
            }
        }

        // 2. فحص موضع الكلمة في رد الروبوت: الجهاز المذكور في بداية الجملة يأخذ أولوية
        let earliestPos = 999999;
        for (const kw of dev.keywords) {
            const pos = botTxt.indexOf(kw);
            if (pos !== -1 && pos < earliestPos) {
                earliestPos = pos;
            }
        }

        if (earliestPos !== 999999) {
            score += Math.max(1, 500 - earliestPos); // كلما ذُكر مبكراً زادت أولويته
        }

        if (score <= 0) continue;

        // 3. البحث عن العنصر في قائمة draggables مع شرط أن يكون ظاهراً في مشهد الـ TP النشط
        const candidate = draggables.find(d => {
            if (!d.obj || !isDeviceVisible(d.obj)) return false;
            const lbl = (d.label || '').toLowerCase();
            return dev.labels.some(alias => lbl.includes(alias));
        });

        if (candidate && score > highestScore) {
            highestScore = score;
            bestMatch = candidate;
        }
    }

    if (bestMatch && bestMatch.obj) {
        laserObj = bestMatch.obj;
        laserUntil = talkUntil > performance.now() ? talkUntil : performance.now() + 16000;
        return true;
    }

    return false;
}