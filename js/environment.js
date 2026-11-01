/* =====================================================================
   js/environment.js  —  la pièce, l'éclairage, la paillasse CIRCULAIRE
                         centrale, le BUREAU « relevés » (feuille de papier
                         lignée + stylo noir), le tableau noir, les
                         poussières dans le faisceau.

   Nouveauté de cette mise à jour : les appareils sont disposés AUTOUR de la
   table ronde, face au centre (voir instruments.js). Le joueur doit donc
   tourner autour de la paillasse pour lire les écrans.
   ===================================================================== */
import * as THREE from 'three';
import {
    ROOM, TABLE_R, TABLE_H, DESK, DESK_ROT, ctx, Q
} from './state.js';
import {
    floorTexture, wallTexture, woodTexture, chalkTexture,
    posterTexture, paperTexture
} from './textures.js';

export let dust = null;
export let spot = null;

const DUST_MAX = 170;

/* ------------------------------------------------------------------ */
/*  Rendu, scène, caméra (rig FPS) et lumières                        */
/* ------------------------------------------------------------------ */
export function initRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    document.getElementById('app').appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(0x05070c, Q.fog);

    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .05, 80);
    const pitchObj = new THREE.Object3D();
    const yawObj = new THREE.Object3D();
    yawObj.position.set(0, 1.62, 3.35);          // arrivée face à la table ronde
    yawObj.rotation.y = Math.PI;                 // on regarde vers le centre (−z)
    yawObj.add(pitchObj); pitchObj.add(camera); scene.add(yawObj);

    ctx.renderer = renderer; ctx.scene = scene; ctx.camera = camera;
    ctx.yawObj = yawObj; ctx.pitchObj = pitchObj;

    /* ---- lumières (valeurs de base = ambiance « Atelier ») -------------
       Deux défauts corrigés ici :
       1. le projecteur étroit pointé à la verticale produisait une TACHE
          BLANCHE au centre du plateau (reflet spéculaire du bois verni) ;
          il est désormais très ouvert (cône de 132°, pénombre totale) :
          l'éclairement est quasi uniforme sur toute la paillasse, et le
          plateau est devenu mat (voir buildRoundTable) ;
       2. les faces avant des appareils — toutes tournées vers l'axe de la
          table — restaient noires.  Une source dédiée (« panel ») est
          placée sur l'axe, au-dessus du matériel : elle frappe les façades
          de plein fouet (cos ≈ 0,6) et n'ajoute qu'un léger dégradé au
          plateau.  L'hémisphère est relevé et son « sol » réchauffé pour
          déboucher les ombres sans jamais créer de point chaud.          */
    const hemi = new THREE.HemisphereLight(0xa8bade, 0x3b332a, .92);
    scene.add(hemi);
    spot = new THREE.SpotLight(0xffe6c0, 96, 18, 1.15, 1.0, 2.0);
    spot.position.set(0, 3.42, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = .5; spot.shadow.camera.far = 14;
    spot.target.position.set(0, TABLE_H, 0);
    scene.add(spot, spot.target);
    ctx.spot = spot;
    spot.userData.base = 96;

    /* lumière de façade : sur l'axe, à hauteur des appareils (jamais au ras
       du plateau, ce qui recréerait une tache) */
    const panel = new THREE.PointLight(0xfff1de, 5.5, 5.5, 2);
    panel.position.set(0, 2.05, 0); scene.add(panel);
    panel.userData.base = 5.5;

    const fill = new THREE.PointLight(0x7aa2ff, 6.5, 18, 2);
    fill.position.set(3.6, 2.7, 3.4); scene.add(fill);
    fill.userData.base = 6.5;
    const fill2 = new THREE.PointLight(0xffd9a0, 4.2, 14, 2);
    fill2.position.set(-3.4, 2.6, -2.6); scene.add(fill2);
    fill2.userData.base = 4.2;
    /* lumière dédiée au bureau des relevés (à droite) */
    const deskLight = new THREE.PointLight(0xffe0b0, 3.4, 5.5, 2);
    deskLight.position.set(DESK.x, 2.05, DESK.z); scene.add(deskLight);
    deskLight.userData.base = 3.4;

    /* tout est enregistré pour que js/lighting.js puisse tout piloter.
       `panelMats` reçoit les sérigraphies (voir textures.js) : leur légère
       auto-luminescence suit l'ambiance choisie.                        */
    ctx.lights = {
        hemi, spot, panel, fills: [fill, fill2], desk: deskLight,
        lampMats: [], panelMats: [], expo0: renderer.toneMappingExposure
    };

    return { renderer, scene, camera, yawObj, pitchObj };
}

/* ------------------------------------------------------------------ */
/*  Pièce : sol, murs, plafond, plinthes, tableau, affiche, porte      */
/* ------------------------------------------------------------------ */
export function buildRoom() {
    const scene = ctx.scene;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
        new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: .32, metalness: .18, envMapIntensity: .4 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: .9, metalness: .02 });
    const mkWall = (w, h, x, y, z, ry) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
        m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
    };
    mkWall(ROOM * 2, 3.6, 0, 1.8, -ROOM, 0);
    mkWall(ROOM * 2, 3.6, 0, 1.8, ROOM, Math.PI);
    mkWall(ROOM * 2, 3.6, -ROOM, 1.8, 0, Math.PI / 2);
    mkWall(ROOM * 2, 3.6, ROOM, 1.8, 0, -Math.PI / 2);

    /* plinthes */
    const bb = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: .6 });
    [[0, -ROOM + .02, 0], [0, ROOM - .02, 0], [-ROOM + .02, 0, 1], [ROOM - .02, 0, 1]].forEach(([x, z, ry]) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(ry ? .04 : ROOM * 2, .14, ry ? ROOM * 2 : .04), bb);
        b.position.set(x, .07, z); scene.add(b);
    });

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
        new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: .95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.6; scene.add(ceil);

    /* tableau noir (mur du fond) */
    const board = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7),
        new THREE.MeshStandardMaterial({ map: chalkTexture(), roughness: .85 }));
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: .5 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.56, 1.86, .05), frameMat);
    frame.position.z = -.031; board.add(frame, cb);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(3.4, .04, .09), frameMat);
    tray.position.set(0, -.93, .05); board.add(tray);
    board.position.set(0, 2.05, -ROOM + .035); scene.add(board);

    /* affiche de consignes */
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(.62, .84),
        new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: .9 }));
    poster.position.set(ROOM - .03, 2.0, -1.6); poster.rotation.y = -Math.PI / 2; scene.add(poster);

    /* porte (décor) */
    const door = new THREE.Mesh(new THREE.BoxGeometry(.06, 2.15, .95),
        new THREE.MeshStandardMaterial({ color: 0x191c24, roughness: .7 }));
    door.position.set(-ROOM + .03, 1.07, 2.1); scene.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03),
        new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: .8, roughness: .3 }));
    knob.position.set(-ROOM + .09, 1.05, 1.72); scene.add(knob);

    /* luminaire au-dessus de la table ronde */
    const lampG = new THREE.Group();
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: .6, roughness: .4 });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(.9, .09, .4), housingMat);
    const diffMat = new THREE.MeshStandardMaterial({ color: 0xfff3da, emissive: 0xffe9be, emissiveIntensity: 2.2 });
    const diff = new THREE.Mesh(new THREE.PlaneGeometry(.82, .32), diffMat);
    diff.rotation.x = Math.PI / 2; diff.position.y = -.048;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.06, .14, .06), housingMat); rail.position.y = .1;
    lampG.add(housing, diff, rail); lampG.position.set(0, 3.5, 0); scene.add(lampG);

    /* lampe d'appoint au-dessus du bureau des relevés */
    const diff2 = diffMat.clone();
    const lamp2 = lampG.clone(); lamp2.scale.setScalar(.62);
    lamp2.traverse(o => { if (o.material === diffMat) o.material = diff2; });
    lamp2.position.set(DESK.x, 3.35, DESK.z); scene.add(lamp2);

    if (ctx.lights) ctx.lights.lampMats = [diffMat, diff2];
}

/* ------------------------------------------------------------------ */
/*  Paillasse CIRCULAIRE centrale                                      */
/* ------------------------------------------------------------------ */
export function buildRoundTable() {
    const scene = ctx.scene;
    const g = new THREE.Group();

    /* plateau MAT : une paillasse de laboratoire est satinée, jamais vernie.
       C'est ce reflet spéculaire qui faisait la tache blanche au centre.   */
    const topMat = new THREE.MeshStandardMaterial({ map: woodTexture('#5b4a3c'), roughness: .84, metalness: .02 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, .055, 64), topMat);
    top.position.y = TABLE_H - .0275;
    top.castShadow = top.receiveShadow = true; g.add(top);

    /* liseré inox */
    const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - .004, .012, 10, 72),
        new THREE.MeshStandardMaterial({ color: 0x8d97a8, metalness: .85, roughness: .28 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_H - .006; g.add(rim);

    /* pied central + socle */
    const metal = new THREE.MeshStandardMaterial({ color: 0x363b47, metalness: .75, roughness: .35 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.085, .11, TABLE_H - .1, 24), metal);
    col.position.y = (TABLE_H - .1) / 2; col.castShadow = true; g.add(col);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.42, .48, .07, 32), metal);
    foot.position.y = .035; foot.castShadow = foot.receiveShadow = true; g.add(foot);

    /* tapis antidérapant au centre (repère visuel du pont) */
    const mat = new THREE.Mesh(new THREE.CircleGeometry(.34, 48),
        new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: .95 }));
    mat.rotation.x = -Math.PI / 2; mat.position.y = TABLE_H + .0015; mat.receiveShadow = true; g.add(mat);

    scene.add(g);
    return g;
}

/* ------------------------------------------------------------------ */
/*  BUREAU carré (à droite) : feuille « Relevés de laboratoire » + stylo
    Ces deux objets sont de simples meshes interactifs du raycast :
    un clic gauche ouvre la feuille de relevés (modal « papier »).      */
/* ------------------------------------------------------------------ */
export function buildDesk(registerDraggable) {
    const scene = ctx.scene;
    const g = new THREE.Group();
    g.position.set(DESK.x, 0, DESK.z);
    g.rotation.y = DESK_ROT;                        // légèrement tourné vers la pièce

    const topMat = new THREE.MeshStandardMaterial({ map: woodTexture('#7a6149'), roughness: .82, metalness: .02 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.w, .05, DESK.d), topMat);
    top.position.y = DESK.h - .025; top.castShadow = top.receiveShadow = true; g.add(top);

    const metal = new THREE.MeshStandardMaterial({ color: 0x2f343f, metalness: .7, roughness: .4 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, DESK.h - .05, .05), metal);
        leg.position.set(sx * (DESK.w / 2 - .06), (DESK.h - .05) / 2, sz * (DESK.d / 2 - .06));
        leg.castShadow = true; g.add(leg);
    });
    /* tiroir décoratif */
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(DESK.w * .55, .09, DESK.d - .18),
        new THREE.MeshStandardMaterial({ color: 0x242933, roughness: .6 }));
    drawer.position.set(-.12, DESK.h - .12, 0); g.add(drawer);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .16, 10),
        new THREE.MeshStandardMaterial({ color: 0xa9b2c2, metalness: .9, roughness: .25 }));
    handle.rotation.z = Math.PI / 2; handle.position.set(-.12, DESK.h - .12, DESK.d / 2 - .08); g.add(handle);

    /* ---- feuille de papier lignée ---- */
    const paper = new THREE.Group();
    /* format A4 (21 × 29,7 cm), très légèrement agrandi pour la lisibilité */
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(.30, .004, .40),
        new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: .92, metalness: 0 }));
    sheet.castShadow = sheet.receiveShadow = true;
    paper.add(sheet);
    /* petite ombre/double-feuille dessous pour l'épaisseur */
    const under = new THREE.Mesh(new THREE.BoxGeometry(.305, .003, .405),
        new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: .95 }));
    under.position.y = -.002; paper.add(under);   // la double-feuille reste au-dessus du bois
    paper.position.set(.13, DESK.h + .0035, .02);   // même cote que le yOff enregistré
    paper.rotation.y = -.22;
    paper.userData = {
        interact: true, kind: 'paper',
        tip: 'Feuille « Relevés de laboratoire » — clic gauche : NOUVELLE feuille · appui long : déplacer'
    };
    g.add(paper);
    ctx.paperObj = paper;

    /* ---- stylo noir ---- */
    const pen = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.008, .0085, .155, 14),
        new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: .35, metalness: .25 }));
    body.rotation.z = Math.PI / 2; pen.add(body);
    const tipm = new THREE.Mesh(new THREE.ConeGeometry(.008, .024, 12),
        new THREE.MeshStandardMaterial({ color: 0xb9c0cc, metalness: .8, roughness: .3 }));
    tipm.rotation.z = -Math.PI / 2; tipm.position.x = .089; pen.add(tipm);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.0094, .0094, .054, 12),
        new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: .3, metalness: .5 }));
    cap.rotation.z = Math.PI / 2; cap.position.x = -.054; pen.add(cap);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(.038, .004, .007),
        new THREE.MeshStandardMaterial({ color: 0xa9b2c2, metalness: .9, roughness: .25 }));
    clip.position.set(-.054, .0105, 0); pen.add(clip);
    pen.position.set(-.24, DESK.h + .0095, .17);   // le corps du stylo porte sur le bois
    pen.rotation.y = .5;
    pen.userData = { interact: true, kind: 'pen', tip: 'Stylo noir — clic gauche : nouvelle feuille · appui long : déplacer' };
    g.add(pen);
    ctx.penObj = pen;
    /* ---- calculatrice scientifique 3D sur le bureau ---- */
    const calc = new THREE.Group();
    const cMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.45, metalness: 0.2 });
    const cBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.014, 0.16), cMat);
    cBody.castShadow = true; cBody.receiveShadow = true;
    calc.add(cBody);

    // Écran LCD de la calculatrice
    const cScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.076, 0.032),
        new THREE.MeshStandardMaterial({ color: 0x8fa391, roughness: 0.3, emissive: 0x3d4a3e, emissiveIntensity: 0.2 })
    );
    cScreen.rotation.x = -Math.PI / 2;
    cScreen.position.set(0, 0.0072, -0.045);
    calc.add(cScreen);

    // Mini capteur solaire au-dessus de l'écran
    const cSolar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.04, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x3a2015, roughness: 0.2, metalness: 0.8 })
    );
    cSolar.rotation.x = -Math.PI / 2;
    cSolar.position.set(0, 0.0072, -0.068);
    calc.add(cSolar);

    // Grille de touches en relief
    const cKeyMat = new THREE.MeshStandardMaterial({ color: 0x2e3848, roughness: 0.5 });
    const cKeyEqMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 4; c++) {
            const isEq = (r === 4 && c === 3);
            const keyMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.014, 0.004, 0.011),
                isEq ? cKeyEqMat : cKeyMat
            );
            keyMesh.position.set(-0.027 + c * 0.018, 0.008, -0.015 + r * 0.016);
            calc.add(keyMesh);
        }
    }

    calc.position.set(-0.06, DESK.h + 0.007, -0.06);
    calc.rotation.y = 0.15;
    calc.userData = {
        interact: true,
        kind: 'calc',
        deviceLabel: 'Calculatrice scientifique',
        tip: 'Calculatrice scientifique — clic : ouvrir · appui long : déplacer'
    };
    g.add(calc);
    ctx.calcObj = calc;

    const dCalc = registerDraggable(calc, 'Calculatrice scientifique', [], 0.007);
    dCalc.halfW = 0.06; dCalc.halfD = 0.09; dCalc.faceCenter = false;

    scene.add(g);

    /* les deux objets du bureau sont déplaçables (appui long) */
    const dp = registerDraggable(paper, 'Feuille de relevés', [], .0035);
    dp.halfW = .155; dp.halfD = .205; dp.faceCenter = false;
    const dn = registerDraggable(pen, 'Stylo noir', [], .0095);
    dn.halfW = .10; dn.halfD = .022; dn.faceCenter = false;
    return g;
}

/* ------------------------------------------------------------------ */
/*  Petit geste « on tourne la page » quand on clique sur la feuille    */
/* ------------------------------------------------------------------ */
let flipT = -1;
export function flipPaper() {
    if (!ctx.paperObj) return;
    flipT = 0;
    ctx.paperObj.userData._flipBase = ctx.paperObj.userData._flipBase ?? ctx.paperObj.rotation.z;
}
export function animatePaper(dt) {
    const p = ctx.paperObj;
    if (!p || flipT < 0) return;
    flipT += dt;
    const k = Math.min(1, flipT / .42);
    const swing = Math.sin(k * Math.PI);           // 0 -> 1 -> 0
    p.rotation.z = (p.userData._flipBase || 0) + swing * .085;
    p.position.y = DESK.h + .0035 + swing * .012;
    if (k >= 1) { flipT = -1; p.rotation.z = p.userData._flipBase || 0; p.position.y = DESK.h + .0035; }
}

/* ------------------------------------------------------------------ */
/*  Poussières dans le faisceau du spot                                */
/* ------------------------------------------------------------------ */
export function buildDust() {
    const pos = new Float32Array(DUST_MAX * 3);
    for (let i = 0; i < DUST_MAX; i++) {
        pos[i * 3] = (Math.random() - .5) * 2.6;
        pos[i * 3 + 1] = 1 + Math.random() * 2.3;
        pos[i * 3 + 2] = (Math.random() - .5) * 2.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, DUST_MAX);
    dust = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffe9c4, size: .011, transparent: true, opacity: .28,
        blending: THREE.AdditiveBlending, depthWrite: false
    }));
    ctx.scene.add(dust);
    ctx.dust = dust;
    return dust;
}

export function animateDust(dt, t) {
    if (!dust || !dust.visible) return;
    const dp = dust.geometry.attributes.position;
    const n = Math.min(dust.geometry.drawRange.count, dp.count);
    for (let i = 0; i < n; i++) {
        let y = dp.getY(i) - dt * .05;
        if (y < .95) y = 3.3;
        dp.setY(i, y);
        dp.setX(i, dp.getX(i) + Math.sin(t * .6 + i) * .0004);
    }
    dp.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/*  Surfaces d'appui (utilisé par le déplacement d'objets)             */
/* ------------------------------------------------------------------ */
export function supportAt(x, z) {
    // 1. Paillasse ronde centrale
    if (Math.hypot(x, z) < TABLE_R - 0.03) return { y: TABLE_H, name: 'table' };

    // 2. Bureau rectangulaire orienté (avec bordure utile naturelle)
    const lx = x - DESK.x, lz = z - DESK.z;
    const a = -DESK_ROT; // rotation inverse
    const rx = lx * Math.cos(a) - lz * Math.sin(a);
    const rz = lx * Math.sin(a) + lz * Math.cos(a);

    if (Math.abs(rx) < (DESK.w / 2 - 0.02) && Math.abs(rz) < (DESK.d / 2 - 0.02)) {
        return { y: DESK.h, name: 'bureau' };
    }

    return null;
}
