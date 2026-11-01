/* =====================================================================
   js/instruments_tp3.js  —  Matériel 3D du TP 3
   « Vérification des théorèmes électrocinétiques » (fascicule p. 7 à 9)

   Matériel du fascicule :
     • Générateur × 2          → deux alimentations stabilisées 0–15 V / 1,5 A
                                 avec mode TENSION (CV) et COURANT (CC) :
                                 le mode CC permet de réaliser le générateur
                                 de courant du théorème de Norton ;
     • Rhéostat 230 Ω – 1,5 A  → piste bobinée + curseur, pour matérialiser
                                 R_Th = R_No = V₀ / I₀ ;
     • Maquette résistances    → R₁ = 290 Ω, R₂ = 180 Ω, R = 150 Ω et les
                                 barrettes de jonction A et B du schéma ;
     • Voltmètre + ampèremètre → les multimètres du TP 1 (partagés) ;
     • Fils 6 à 9              → le câblage de l'élève.

   Tous les appareils sont posés par placeDevice()/placeFlat() : aplomb
   MESURÉ (jamais deviné), même facteur d'agrandissement que le reste du
   laboratoire, face avant tournée vers le centre de la paillasse.
   ===================================================================== */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { S, ctx, interactives } from './state.js';
import {
    panelPlane, makeLCD, rr, laminateMat, boardMapper, SILK,
    silkPanel, silkSocket, silkText, silkWire, silkDipole, silkGenerator
} from './textures.js';
import {
    makeTerminal, makeShell, addFeet, addHandle, addTicks, makeKnob, MAT,
    placeDevice, placeFlat
} from './instruments.js';

const addAt = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

/* ================================================================== */
/*  1. ALIMENTATION STABILISÉE 0–15 V / 1,5 A  (E1 et E2)              */
/* ================================================================== */

/**
 * Construit une alimentation de paillasse.
 * @param {object} cfg {tag:'1'|'2', label, termP, termM, vDefault}
 */
export function buildSupply(cfg) {
    const g = new THREE.Group();
    const w = 0.30, h = 0.165, d = 0.24;
    g.add(makeShell(w, h, d, 0.012));
    addFeet(g, w, d, 0.014, -h / 2, 0.012);
    addHandle(g, w, h / 2, -d / 2 + 0.035, 0.85);

    /* ---- face avant sérigraphiée ---- */
    const panel = panelPlane(0.285, 0.15, 620, 330, (c2, W, H) => {
        c2.fillStyle = '#151a22'; c2.fillRect(0, 0, W, H);
        const gr = c2.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(0,0,0,.2)');
        c2.fillStyle = gr; c2.fillRect(0, 0, W, H);

        c2.textAlign = 'center';
        c2.fillStyle = '#a8bbd2'; c2.font = '700 25px "Space Grotesk",sans-serif';
        c2.fillText('ALIMENTATION STABILISÉE', W / 2, 30);
        c2.fillStyle = '#5f7089'; c2.font = '500 15px "Space Grotesk",sans-serif';
        c2.fillText(`0 – 15 V ⎓   ·   0 – 1,5 A   ·   GÉNÉRATEUR E${cfg.tag}`, W / 2, 52);

        /* deux fenêtres d'afficheur : tension et courant (comme en vrai) */
        [[W / 2 - 158, 'TENSION (V)'], [W / 2 + 34, 'COURANT (A)']].forEach(([x, titre]) => {
            c2.fillStyle = '#04080b'; rr(c2, x, 62, 124, 62, 7); c2.fill();
            c2.strokeStyle = 'rgba(125,255,216,.22)'; c2.lineWidth = 2;
            rr(c2, x, 62, 124, 62, 7); c2.stroke();
            c2.fillStyle = '#7d8ea6'; c2.font = '600 11px "Space Grotesk",sans-serif';
            c2.textAlign = 'left'; c2.fillText(titre, x + 4, 58); c2.textAlign = 'center';
        });

        /* voyants CV / CC */
        c2.font = '700 13px "Space Grotesk",sans-serif';
        c2.fillStyle = '#4ade80'; c2.fillText('CV', W / 2 - 96, 152);
        c2.fillStyle = '#f87171'; c2.fillText('CC', W / 2 - 56, 152);
        c2.fillStyle = '#8ea2bb'; c2.font = '600 12px "Space Grotesk",sans-serif';
        c2.fillText('MODE', W / 2 - 76, 172);

        /* sérigraphie des boutons */
        c2.fillStyle = '#8ea2bb'; c2.font = '600 13px "Space Grotesk",sans-serif';
        c2.fillText('RÉGLAGE TENSION', W / 2 - 108, 268);
        c2.fillText('LIMITATION COURANT', W / 2 + 108, 268);
        c2.fillStyle = '#f2a65a'; c2.font = '600 12px "Space Grotesk",sans-serif';
        c2.fillText('livrée hors tension — à allumer par l\'élève', W / 2, 300);

        c2.fillStyle = '#c3cad6'; c2.font = '700 14px "Space Grotesk",sans-serif';
        c2.fillText('M/A', W / 2 + 176, 150);
        c2.fillStyle = '#ef6461'; c2.font = '700 24px "Space Grotesk",sans-serif';
        c2.fillText('+', W / 2 + 104, 214);
        c2.fillStyle = '#c3cad6'; c2.fillText('−', W / 2 + 34, 214);
        c2.fillStyle = '#4ade80'; c2.font = '700 15px "Space Grotesk",sans-serif';
        c2.fillText('⏚', W / 2 - 24, 214);

        c2.fillStyle = '#0b0d11';
        [[10, 10], [W - 10, 10], [10, H - 10], [W - 10, H - 10]].forEach(([x, y]) => {
            c2.beginPath(); c2.arc(x, y, 4, 0, 7); c2.fill();
        });
    });
    panel.mesh.position.z = d / 2 + 0.001; g.add(panel.mesh);

    /* ---- afficheur double (tension + courant), aligné sur les deux fenêtres
           sérigraphiées de la face avant ---- */
    const lcd = makeLCD(512, 100);
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.155, 0.036, 0.006, 3, 0.003), MAT.dark());
    bezel.position.set(0, 0.0327, d / 2 + 0.003); g.add(bezel);
    const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.0283),
        new THREE.MeshBasicMaterial({ map: lcd.tex }));
    lcdMesh.position.set(0, 0.0327, d / 2 + 0.007); g.add(lcdMesh);

    /* ---- voyants CV (vert) et CC (rouge) ---- */
    const matCV = new THREE.MeshStandardMaterial({ color: 0x16241c, emissive: 0x35d46f, emissiveIntensity: 0 });
    const matCC = new THREE.MeshStandardMaterial({ color: 0x2a1618, emissive: 0xff6b6b, emissiveIntensity: 0 });
    [[-0.046, matCV], [-0.026, matCC]].forEach(([x, m]) => {
        const bz = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 14), MAT.dark());
        bz.rotation.x = Math.PI / 2; bz.position.set(x, 0.0005, d / 2 + 0.002); g.add(bz);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 12), m);
        led.position.set(x, 0.0005, d / 2 + 0.005); g.add(led);
    });

    /* ---- bouton MODE CV/CC (poussoir) ---- */
    const btnMode = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.009, 16), MAT.steel());
    btnMode.rotation.x = Math.PI / 2;
    btnMode.position.set(-0.036, -0.026, d / 2 + 0.005);
    btnMode.userData = {
        interact: true, kind: 'btnE' + cfg.tag + 'Mode',
        tip: `Mode de E${cfg.tag} — clic : basculer TENSION (CV) ⇄ COURANT (CC). `
            + `Le mode CC fournit un courant constant : c'est le générateur de Norton.`
    };
    g.add(btnMode); interactives.push(btnMode);

    /* ---- interrupteur marche / arrêt à bascule ---- */
    const swBase = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.042, 0.011), MAT.dark());
    swBase.position.set(0.086, -0.026, d / 2 + 0.005); g.add(swBase);
    const pivot = new THREE.Group();
    pivot.position.set(0.086, -0.026, d / 2 + 0.011);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.032, 0.015),
        new THREE.MeshStandardMaterial({ color: 0xd7dde8, roughness: 0.3, metalness: 0.5 }));
    lever.position.y = 0.013; pivot.add(lever);
    pivot.rotation.x = -0.45;                                    // position ARRÊT
    swBase.userData = pivot.userData = {
        interact: true, kind: 'switchE' + cfg.tag,
        tip: `Interrupteur M/A de E${cfg.tag} — à l'arrêt, la sortie est OUVERTE (pas un court-circuit)`
    };
    g.add(pivot); interactives.push(pivot); interactives.push(swBase);

    /* ---- bouton de réglage de tension ---- */
    const kV = makeKnob(0.024, 0.016, 0xffd166);
    kV.position.set(-0.104, -0.046, d / 2 + 0.004);
    kV.userData = {
        interact: true, kind: 'knobE' + cfg.tag + 'V',
        tip: `Tension E${cfg.tag} — clic : +0,5 V · clic droit : −0,5 V · molette : ±0,1 V · Maj+clic : ±2 V`
    };
    addTicks(g, -0.104, -0.046, d / 2 + 0.003, 0.031, 0.037, 11, 280, 0x6f7f97);
    g.add(kV); interactives.push(kV);

    /* ---- bouton de limitation de courant ---- */
    const kI = makeKnob(0.02, 0.014, 0xf87171);
    kI.position.set(0.104, -0.046, d / 2 + 0.004);
    kI.userData = {
        interact: true, kind: 'knobE' + cfg.tag + 'I',
        tip: `Limitation de courant E${cfg.tag} — clic : +5 mA · molette : ±1 mA · Maj+clic : ±20 mA. `
            + `En mode CC, c'est le courant délivré.`
    };
    addTicks(g, 0.104, -0.046, d / 2 + 0.003, 0.026, 0.031, 9, 240, 0x6f7f97);
    g.add(kI); interactives.push(kI);

    /* ---- bornes de sortie 4 mm ---- */
    g.add(addAt(makeTerminal(cfg.termP, `E${cfg.tag} + (sortie positive)`, 0xd93a3a, 'z', g), 0.05, -0.062, d / 2));
    g.add(addAt(makeTerminal(cfg.termM, `E${cfg.tag} − (sortie négative)`, 0x1c1f27, 'z', g), 0.017, -0.062, d / 2));
    const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 18), MAT.brass());
    earth.rotation.x = Math.PI / 2; earth.position.set(-0.012, -0.062, d / 2 + 0.004); g.add(earth);

    /* ---- aération arrière ---- */
    const vent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.5, 0.006),
        new THREE.MeshStandardMaterial({ color: 0x191d25, roughness: 0.8 }));
    vent.position.set(0, 0, -d / 2 - 0.002); g.add(vent);

    return { group: g, w, h, d, lcd, pivot, matCV, matCC, kV, kI };
}

/* ================================================================== */
/*  2. RHÉOSTAT 230 Ω – 1,5 A                                          */
/* ================================================================== */
export function buildRheostat() {
    const g = new THREE.Group();
    const w = 0.36, h = 0.115, d = 0.16;

    /* socle en fonte */
    const base = new THREE.Mesh(new RoundedBoxGeometry(w, 0.018, d, 3, 0.004), MAT.dark());
    base.castShadow = base.receiveShadow = true;
    base.position.y = -h / 2 + 0.009;
    g.add(base);
    addFeet(g, w * 0.92, d * 0.8, 0.012, -h / 2, 0.01);

    /* plaque signalétique gravée */
    const plate = panelPlane(0.34, 0.05, 700, 110, (c2, W, H) => {
        c2.fillStyle = '#d9d2c2'; c2.fillRect(0, 0, W, H);
        c2.strokeStyle = 'rgba(0,0,0,.25)'; c2.lineWidth = 3; c2.strokeRect(4, 4, W - 8, H - 8);
        c2.textAlign = 'center';
        c2.fillStyle = '#2b2118'; c2.font = '700 30px "Space Grotesk",sans-serif';
        c2.fillText('RHÉOSTAT  230 Ω  —  1,5 A', W / 2, 42);
        c2.fillStyle = '#5b4a35'; c2.font = '600 20px "Space Grotesk",sans-serif';
        c2.fillText('résistance variable bobinée  ·  curseur W  ·  bornes A et B', W / 2, 76);
    });
    plate.mesh.position.set(0, -h / 2 + 0.02, d / 2 - 0.018);
    plate.mesh.rotation.x = -0.22;
    g.add(plate.mesh);

    /* tube céramique + fil bobiné (texture cannelée réutilisée) */
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.26, 26), MAT.ceramic());
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, -h / 2 + 0.052, 0.012);
    tube.castShadow = true;
    g.add(tube);
    /* spires : tore aplati répété — un seul maillage strié suffit visuellement */
    const winding = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.25, 26, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.85, roughness: 0.35, wireframe: false }));
    winding.rotation.z = Math.PI / 2;
    winding.position.copy(tube.position);
    g.add(winding);

    /* supports d'extrémité */
    [-0.135, 0.135].forEach(x => {
        const sup = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.07, 0.05), MAT.steel());
        sup.position.set(x, -h / 2 + 0.045, 0.012);
        sup.castShadow = true;
        g.add(sup);
    });

    /* rail du curseur (au-dessus du tube) */
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.008, 0.014), MAT.steel());
    rail.position.set(0, -h / 2 + 0.092, 0.012);
    rail.castShadow = true;
    g.add(rail);

    /* curseur coulissant (sa position suit la valeur réglée) */
    const slider = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.026), MAT.brass());
    block.castShadow = true;
    slider.add(block);
    const contact = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.026, 0.008), MAT.steel());
    contact.position.y = -0.02;
    slider.add(contact);
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.016, 12),
        new THREE.MeshStandardMaterial({ color: 0xd93a3a, roughness: 0.4 }));
    pointer.rotation.x = Math.PI; pointer.position.y = 0.02;
    slider.add(pointer);
    slider.position.set(-0.13, -h / 2 + 0.092, 0.012);
    g.add(slider);

    /* vis de commande + bouton moleté en façade */
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.28, 12), MAT.steel());
    screw.rotation.z = Math.PI / 2;
    screw.position.set(0, -h / 2 + 0.092, -0.02);
    g.add(screw);
    const knob = makeKnob(0.026, 0.018, 0xe8eef8);
    knob.rotation.y = Math.PI / 2;
    knob.position.set(w / 2 - 0.012, -h / 2 + 0.092, -0.02);
    knob.userData = {
        interact: true, kind: 'knobRheo',
        tip: 'Curseur du rhéostat — clic : +1 Ω · clic droit : −1 Ω · molette : ±0,5 Ω · Maj+clic : ±10 Ω. '
            + 'La résistance utile est prise entre A et W.'
    };
    g.add(knob); interactives.push(knob);

    /* règle graduée (lecture de la valeur, comme sur l'appareil réel) */
    const scale = panelPlane(0.28, 0.022, 900, 70, (c2, W, H) => {
        c2.fillStyle = '#e8e0cc'; c2.fillRect(0, 0, W, H);
        c2.strokeStyle = '#2b2118'; c2.lineWidth = 2;
        c2.font = '600 22px "JetBrains Mono",monospace'; c2.textAlign = 'center';
        for (let i = 0; i <= 10; i++) {
            const x = 20 + (i / 10) * (W - 40);
            c2.beginPath(); c2.moveTo(x, H - 4); c2.lineTo(x, H - (i % 5 === 0 ? 30 : 18)); c2.stroke();
            if (i % 5 === 0 || i === 2 || i === 4 || i === 6 || i === 8) c2.fillText(String(i * 23), x, 30);
        }
        c2.fillStyle = '#5b4a35'; c2.font = '600 20px "Space Grotesk",sans-serif';
        c2.fillText('Ω', W - 12, 30);
    });
    scale.mesh.position.set(0, -h / 2 + 0.062, d / 2 - 0.006);
    scale.mesh.rotation.x = -0.35;
    g.add(scale.mesh);

    /* bornes : A (extrémité), B (autre extrémité), W (curseur) */
    g.add(addAt(makeTerminal('RHA', 'Rhéostat borne A (extrémité de la piste)', 0xd93a3a, 'y', g), -0.145, -h / 2 + 0.014, -0.055));
    g.add(addAt(makeTerminal('RHB', 'Rhéostat borne B (extrémité de la piste, 230 Ω de A)', 0x1c1f27, 'y', g), 0.145, -h / 2 + 0.014, -0.055));
    g.add(addAt(makeTerminal('RHW', 'Rhéostat curseur W (résistance réglable entre A et W)', 0xe8c258, 'y', g), 0.0, -h / 2 + 0.014, -0.055));

    g.userData.rheoSlider = slider;
    return { group: g, w, h, d, slider, knob };
}

/* ================================================================== */
/*  3. MAQUETTE « RÉSISTANCES » DU TP 3 (barrettes A et B)             */
/* ================================================================== */
export function buildResistorBoardTP3() {
    const g = new THREE.Group();
    const W = 0.50, D = 0.40, H = 0.016;

    /* ---- COTES UNIQUES --------------------------------------------------
       Une vraie maquette de laboratoire est un PANNEAU PLAT : uniquement des
       points de connexion (douilles banane) et le schéma SÉRIGRAPHIÉ à leur
       place exacte.  Aucun composant en relief : les résistances sont
       DESSINÉES (symbole normalisé), comme sur les cartes du fascicule.
       Douilles 3D et dessin sortent de la MÊME table de cotes : chaque
       cercle imprimé tombe exactement sous sa douille.                  ---- */
    const COL = [-0.160, -0.054, 0.054, 0.160];   // 4 colonnes : 3 branches + mesure
    const ZA = -0.125, ZB = 0.125;                // barrette A (fond) / B (côté élève)
    const ZR1 = -0.045, ZR2 = 0.045;              // douilles des résistances
    const ZE = 0.093;                             // place des générateurs E₁ / E₂
    const BR = [
        { a: 'R1a', b: 'R1b', nom: 'R₁', val: '290 Ω', css: '#d93a3a', hex: 0xd93a3a, lbl: 'R1 = 290 Ω', gen: 'E₁' },
        { a: 'R2a', b: 'R2b', nom: 'R₂', val: '180 Ω', css: '#2f7de1', hex: 0x2f7de1, lbl: 'R2 = 180 Ω', gen: 'E₂' },
        { a: 'RLa', b: 'RLb', nom: 'R',  val: '150 Ω', css: '#2fbf71', hex: 0x2fbf71, lbl: 'R = 150 Ω',  gen: '' }
    ];

    /* ---- panneau stratifié clair (mat : aucun reflet parasite) ---- */
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 3, 0.004), laminateMat());
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    addFeet(g, W * 0.9, D * 0.88, 0.011, -H / 2, 0.01);

    /* ---- barrettes laiton : les 4 douilles d'une barrette = même nœud ---- */
    [ZA, ZB].forEach(z => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(COL[3] - COL[0] + 0.044, 0.006, 0.024), MAT.brass());
        strip.position.set(0, H / 2 + 0.003, z);
        strip.castShadow = strip.receiveShadow = true;
        g.add(strip);
    });

    /* ---- les douilles : SEULS éléments en relief de la carte ----
       `lx` / `lz` = décalage du repère sérigraphié (en mètres, cotes carte). */
    const sockets = [];
    COL.forEach((x, i) => {
        sockets.push({ id: `A${i + 1}`, x, z: ZA, css: '#f2c14e', hex: 0xf2c14e, lz: 0.028, align: 'center',
            label: `Barrette A — borne A${i + 1} (toutes au même nœud A)` });
        sockets.push({ id: `B${i + 1}`, x, z: ZB, css: '#9fd8ff', hex: 0x9fd8ff, lz: 0.028, align: 'center',
            label: `Barrette B — borne B${i + 1} (toutes au même nœud B)` });
    });
    BR.forEach((b, i) => {
        sockets.push({ id: b.a, x: COL[i], z: ZR1, css: b.css, hex: b.hex, lx: -0.024, align: 'right',
            label: `${b.lbl} — extrémité côté A` });
        sockets.push({ id: b.b, x: COL[i], z: ZR2, css: b.css, hex: b.hex, lx: -0.024, align: 'right',
            label: `${b.lbl} — extrémité côté B` });
    });
    sockets.forEach(s => g.add(addAt(makeTerminal(s.id, s.label, s.hex, 'y', g), s.x, H / 2, s.z)));

    /* ---- sérigraphie : schéma simplifié, à l'échelle, sous les douilles ---- */
    const PW = W * 0.94, PD = D * 0.94;                  // 0,47 × 0,376 m
    const print = panelPlane(PW, PD, 760, 608, (c2, Wp, Hp) => {
        const M = boardMapper(PW, PD, Wp, Hp);            // 1 m ≈ 1617 px
        const R = M.sx(0.0135);                           // rayon des douilles dessinées
        silkPanel(c2, Wp, Hp);

        /* bandeau du haut (côté fond de table) : le schéma se lit depuis l'élève */
        silkText(c2, 'MAQUETTE RÉSISTANCES — TP 3', Wp / 2, M.py(-0.174),
            { font: '700 28px "Space Grotesk",sans-serif' });
        silkText(c2, 'trois branches en dérivation entre A et B — figure 4 du fascicule',
            Wp / 2, M.py(-0.148), { font: '500 18px "Space Grotesk",sans-serif', color: SILK.soft });

        /* barrettes A et B (mêmes cotes que les réglettes laiton) */
        [[ZA, 'A'], [ZB, 'B']].forEach(([z, nom]) => {
            silkWire(c2, M.px(COL[0] - 0.022), M.py(z), M.px(COL[3] + 0.022), M.py(z),
                { color: SILK.copper, lw: 10 });
            silkText(c2, nom, M.px(COL[0] - 0.045), M.py(z),
                { font: '700 32px "Space Grotesk",sans-serif', color: '#7d5f28' });
        });

        /* les trois branches */
        BR.forEach((b, i) => {
            const x = COL[i], px = M.px(x);
            /* pointillés = cordons à poser par l'élève (jamais un trait plein,
               qui laisserait croire à une liaison interne de la carte) */
            silkWire(c2, px, M.py(ZA), px, M.py(ZR1), { color: '#9aa1ad', lw: 3, dash: [8, 8] });
            silkWire(c2, px, M.py(ZR2), px, M.py(b.gen ? ZE - 0.019 : ZB),
                { color: '#9aa1ad', lw: 3, dash: [8, 8] });
            if (b.gen) {
                silkWire(c2, px, M.py(ZE + 0.019), px, M.py(ZB), { color: '#9aa1ad', lw: 3, dash: [8, 8] });
                silkGenerator(c2, px, M.py(ZE), { r: 16, ink: '#2f4f7a' });
                silkText(c2, b.gen, M.px(x + 0.017), M.py(ZE),
                    { align: 'left', font: '700 19px "Space Grotesk",sans-serif', color: '#2f4f7a' });
            }
            /* résistance DESSINÉE (symbole normalisé) entre ses deux douilles */
            silkDipole(c2, px, M.py(ZR1), px, M.py(ZR2), 'R',
                { ink: '#8c3a12', width: M.sx(0.019), body: M.sy(0.044) });
            silkText(c2, b.nom, px, M.py(0), { font: '700 17px "Space Grotesk",sans-serif', color: '#8c3a12' });
            silkText(c2, b.val, M.px(x + 0.019), M.py(0),
                { align: 'left', font: '700 18px "JetBrains Mono",monospace', color: '#8c3a12' });
        });

        /* douilles + repères (dessinés APRÈS les pistes : ils passent dessus) */
        sockets.forEach(s => {
            silkSocket(c2, M.px(s.x), M.py(s.z), s.css, R);
            silkText(c2, s.id, M.px(s.x + (s.lx || 0)), M.py(s.z + (s.lz || 0)),
                { align: s.align, font: '700 19px "JetBrains Mono",monospace' });
        });

        /* légende, côté élève */
        silkText(c2, 'A1…A4 : même nœud A   ·   B1…B4 : même nœud B   ·   A4 / B4 : mesure de V₀ et I₀   ·   pointillés = cordons à poser',
            Wp / 2, M.py(0.178), { font: '600 17px "Space Grotesk",sans-serif', color: SILK.soft });
    });
    print.mesh.rotation.x = -Math.PI / 2;
    print.mesh.position.y = H / 2 + 0.001;
    g.add(print.mesh);

    return { group: g, w: W, h: H, d: D };
}

/* ================================================================== */
/*  4. Assemblage du poste TP 3                                        */
/* ================================================================== */
export function buildTP3Group() {
    const groupTP3 = new THREE.Group();
    groupTP3.visible = false;
    ctx.scene.add(groupTP3);
    ctx.groupTP3 = groupTP3;

    /* E1 = 12 V : au fond, écran lisible depuis la position de départ */
    const e1 = buildSupply({ tag: '1', termP: 'E1+', termM: 'E1-' });
    groupTP3.add(e1.group);
    placeDevice(e1.group, {
        angDeg: 0, w: e1.w, h: e1.h, d: e1.d,
        label: 'Alimentation E1 (12 V)', termIds: ['E1+', 'E1-']
    });

    /* E2 = 6 V : côté opposé */
    const e2 = buildSupply({ tag: '2', termP: 'E2+', termM: 'E2-' });
    groupTP3.add(e2.group);
    placeDevice(e2.group, {
        angDeg: 180, w: e2.w, h: e2.h, d: e2.d,
        label: 'Alimentation E2 (6 V)', termIds: ['E2+', 'E2-']
    });

    /* rhéostat 230 Ω – 1,5 A : à gauche */
    const rh = buildRheostat();
    groupTP3.add(rh.group);
    placeDevice(rh.group, {
        angDeg: 270, w: rh.w, h: rh.h, d: rh.d,
        label: 'Rhéostat 230 Ω – 1,5 A', termIds: ['RHA', 'RHB', 'RHW']
    });

    /* maquette résistances + barrettes A/B : à plat au centre */
    const board = buildResistorBoardTP3();
    groupTP3.add(board.group);
    placeFlat(board.group, {
        x: 0, z: 0.01, w: board.w, h: board.h, d: board.d,
        label: 'Maquette résistances (TP 3)',
        termIds: ['R1a', 'R1b', 'R2a', 'R2b', 'RLa', 'RLb', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']
    });

    /* afficheurs et organes mobiles, pour js/displays.js */
    ctx.e1LCD = e1.lcd; ctx.e2LCD = e2.lcd;
    ctx.e1Pivot = e1.pivot; ctx.e2Pivot = e2.pivot;
    ctx.e1CV = e1.matCV; ctx.e1CC = e1.matCC;
    ctx.e2CV = e2.matCV; ctx.e2CC = e2.matCC;
    ctx.e1Knob = e1.kV; ctx.e2Knob = e2.kV;
    ctx.rheoSlider = rh.slider; ctx.rheoKnob = rh.knob;

    return groupTP3;
}
