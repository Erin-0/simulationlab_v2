/* =====================================================================
   tests/test_scene.mjs — contrôle du graphe de scène et de la disposition
   du poste de travail :
     • tout ce qui est interactif est bien rattaché à la scène (rien
       d'« oublié » hors rendu) ;
     • les appareils sont disposés en couronne autour de la table ronde,
       face avant tournée vers le centre (sauf les cartes posées à plat) ;
     • le bureau, la feuille et le stylo sont à droite de la pièce ;
     • le générateur est bien livré éteint ;
     • le matériel des trois TP existe, et seul celui du TP actif est visible
       (le voltmètre et l'ampèremètre étant partagés par le TP 1 niveau A et
       le TP 3).
   ===================================================================== */
import { install } from './domstub.mjs';
install();
import * as THREE from 'three';
await import('../js/main.js');

const state = await import('../js/state.js');
const { S, ctx, terminals, allTermIds, draggables, interactives } = state;

let pass = 0, fail = 0;
const chk = (l, c, x = '') => { c ? (pass++, console.log('  ✓', l, x)) : (fail++, console.log('  ✗', l, x)); };

/* ---- utilitaires géométriques ---- */
function inScene(o) {
    let p = o;
    while (p) { if (p === ctx.scene) return true; p = p.parent; }
    return false;
}
function visiblePath(o) {
    let p = o;
    while (p && p !== ctx.scene) { if (p.visible === false) return false; p = p.parent; }
    return true;
}
const world = (o) => { o.updateMatrixWorld(true);
    const m = o.matrixWorld.elements || o.matrixWorld;
    return { x: m[12], y: m[13], z: m[14] }; };

/* ---- 1. graphe de scène ---- */
chk('la scène existe', !!ctx.scene);
const missingTerms = allTermIds.filter(id => !terminals[id].group || !inScene(terminals[id].group));
chk('toutes les bornes sont rattachées à la scène', missingTerms.length === 0,
    `${allTermIds.length} bornes` + (missingTerms.length ? ' · manquantes : ' + missingTerms.join(',') : ''));
const missingDrag = draggables.filter(d => !inScene(d.obj));
chk('tous les objets déplaçables sont rattachés à la scène', missingDrag.length === 0,
    `${draggables.length} objets` + (missingDrag.length ? ' · manquants : ' + missingDrag.map(d => d.label).join(',') : ''));
const missingInter = interactives.filter(o => !inScene(o));
chk('tous les objets interactifs sont dans la scène', missingInter.length === 0, missingInter.length + ' orphelin(s)');
chk('groupe niveau A visible, groupe niveau B masqué au départ',
    ctx.levelA.visible === true && ctx.levelB.visible === false);
chk('le générateur reste visible quel que soit le niveau', inScene(ctx.genGroup) && visiblePath(ctx.genGroup));

/* ---- 2. générateur livré éteint ---- */
chk('générateur ÉTEINT et à 0 V au démarrage', S.genOn === false && S.setV === 0);

/* ---- 3. couronne d'appareils autour de la table ronde ---- */
const { TABLE_R, TABLE_H, DESK } = state;
const ring = draggables.filter(d => d.label !== 'Feuille de relevés' && d.label !== 'Stylo noir');
let onTable = 0, facesCenter = 0;
for (const d of ring) {
    const w = world(d.obj);
    const r = Math.hypot(w.x, w.z);
    if (r < TABLE_R - .05 && Math.abs(w.y - TABLE_H) < .3) onTable++;
    /* la face avant (+Z local) doit pointer vers le centre : produit scalaire > 0 */
    const fx = Math.sin(d.obj.rotation.y), fz = Math.cos(d.obj.rotation.y);
    const toCenterX = -w.x / (r || 1), toCenterZ = -w.z / (r || 1);
    const dot = fx * toCenterX + fz * toCenterZ;
    /* les cartes posées À PLAT (pont de Wheatstone, maquettes du TP 2 et du
       TP 3) n'ont pas de face avant : faceCenter = false dans leur fiche    */
    if (d.faceCenter === false) facesCenter++;
    else if (dot > .99) facesCenter++;
    else console.log(`      (${d.label} : dot=${dot.toFixed(3)}, r=${r.toFixed(2)})`);
}
chk('tous les appareils sont posés sur la paillasse circulaire', onTable === ring.length, `${onTable}/${ring.length}`);
chk('face avant tournée vers le centre (sauf les cartes à plat)', facesCenter === ring.length, `${facesCenter}/${ring.length}`);

const carte = draggables.find(d => d.label.startsWith('Carte du pont'));
const cw = carte ? world(carte.obj) : { x: 9, z: 9 };
chk('la carte du pont est au centre de la table et à plat',
    !!carte && Math.abs(carte.obj.rotation.x) < 1e-9 && Math.hypot(cw.x, cw.z) < .2,
    `x=${cw.x.toFixed(2)} z=${cw.z.toFixed(2)}`);

/* ---- 4. bureau des relevés à droite ---- */
chk('le bureau est à droite de la pièce', DESK.x > 1.5, `x=${DESK.x}`);
const paper = draggables.find(d => d.label === 'Feuille de relevés');
const pen = draggables.find(d => d.label === 'Stylo noir');
chk('feuille et stylo existent et sont interactifs',
    !!(paper && pen) && ctx.paperObj.userData.kind === 'paper' && ctx.penObj.userData.kind === 'pen');
const pw = world(ctx.paperObj), nw = world(ctx.penObj);
chk('feuille posée sur le bureau', Math.abs(pw.y - DESK.h) < .05, `y=${pw.y.toFixed(3)} (bureau h=${DESK.h})`);
chk('stylo posé sur le bureau', Math.abs(nw.y - DESK.h) < .06, `y=${nw.y.toFixed(3)}`);
chk('feuille et stylo du même côté que le bureau', pw.x > 1.5 && nw.x > 1.5,
    `feuille x=${pw.x.toFixed(3)} z=${pw.z.toFixed(3)} · stylo x=${nw.x.toFixed(3)} z=${nw.z.toFixed(3)}`);

/* ---- 4 bis. taille des appareils : agrandis mais réalistes ---- */
const { INSTR_SCALE } = state;
const scaled = ring.filter(d => Math.abs(d.obj.scale.x - INSTR_SCALE) < 1e-9);
chk('tous les appareils portent le même facteur d\'agrandissement',
    scaled.length === ring.length, `${scaled.length}/${ring.length} à ×${INSTR_SCALE}`);
chk('agrandissement raisonnable (10 à 30 %) pour garder l\'échelle du réel',
    INSTR_SCALE > 1.05 && INSTR_SCALE < 1.35, '×' + INSTR_SCALE);
const dims = ring.map(d => ({ l: d.label, L: d.halfW * 2, P: d.halfD * 2 }))
    .sort((a, b) => b.L - a.L);
chk('le plus grand appareil reste plus petit que la table',
    dims[0].L < TABLE_R * 2, `${dims[0].l} : ${dims[0].L.toFixed(2)} m < ${TABLE_R * 2} m`);
chk('le plus petit appareil reste manipulable (>= 10 cm)',
    Math.min(...dims.map(d => Math.min(d.L, d.P))) >= .10,
    dims.map(d => `${d.l} ${Math.min(d.L, d.P).toFixed(2)} m`).join(' · '));

/* ---- 4 ter. chaque objet repose réellement sur son support ----
   On mesure le point le plus BAS de l'objet (tests/extents.mjs) et on le
   compare à l'altitude du plateau : un appareil ne doit ni flotter au-dessus
   de la paillasse, ni s'y enfoncer.                                     */
const { supportAt } = await import('../js/environment.js');
const { worldMinY } = await import('./extents.mjs');
let resting = 0, aligned = 0;
const gaps = [];
for (const d of draggables) {
    const w = world(d.obj);
    const onDesk = d.label === 'Feuille de relevés' || d.label === 'Stylo noir';
    const sup = onDesk ? { y: DESK.h, name: 'bureau' } : supportAt(w.x, w.z);
    if (!sup) { gaps.push(`${d.label}: sans support`); continue; }
    const ecart = worldMinY(d.obj) - sup.y;
    gaps.push(`${d.label} ${(ecart >= 0 ? '+' : '') + (ecart * 1000).toFixed(1)} mm`);
    if (Math.abs(ecart) <= .005) resting++;
    else console.log(`      (${d.label} : ${ecart >= 0 ? 'flotte de' : 'enfoncé de'} ${Math.abs(ecart * 1000).toFixed(1)} mm)`);
    if (Math.abs(w.y - (sup.y + d.yOff)) < 1e-6) aligned++;
}
chk('chaque objet repose sur son support (ni flottant, ni enfoncé, ±5 mm)',
    resting === draggables.length, `${resting}/${draggables.length}`);
console.log('      ' + gaps.join(' · '));
chk('origine des appareils cohérente avec leur hauteur de pose', aligned === draggables.length,
    `${aligned}/${draggables.length}`);

/* ---- 4 quater. boîte à décades : tambours mécaniques, pas d'écran ---- */
chk('la boîte à décades affiche 4 tambours chiffrés',
    (ctx.digitWins || []).length === 4 && (ctx.digitLCDs || []).length === 0,
    `${(ctx.digitWins || []).length} tambour(s)`);

/* ---- 4 quinquies. ÉCLAIRAGE ------------------------------------------
   Deux exigences : (a) plus de TACHE BLANCHE sur la paillasse (projecteur
   très ouvert, pénombre totale, plateau mat) ; (b) les faces avant des
   appareils — toutes tournées vers l'axe — doivent se lire (lumière de
   façade sur l'axe + sérigraphies légèrement auto-lumineuses).        ---- */
const lighting = await import('../js/lighting.js');
const li = ctx.lights;
chk('toutes les lumières sont pilotables (dont la lumière de façade)',
    !!(li && li.spot && li.hemi && li.panel && li.desk && li.fills.length === 2
        && li.lampMats.length === 2 && li.panelMats.length >= 8),
    `${li.panelMats.length} sérigraphie(s) enregistrée(s)`);
chk('projecteur très ouvert + pénombre totale + décroissance physique : plus de tache',
    li.spot.angle > 1 && li.spot.penumbra > .9 && li.spot.decay >= 2 && li.spot.intensity < 130,
    `angle ${(+li.spot.angle).toFixed(2)} rad · pénombre ${li.spot.penumbra} · decay ${li.spot.decay} · ${li.spot.intensity}`);
chk("lumière de façade SUR L'AXE, au-dessus du matériel (jamais au ras du plateau)",
    li.panel.position.y > 1.4 && Math.hypot(li.panel.position.x, li.panel.position.z) < 1e-9
    && li.panel.intensity > 0,
    `y = ${li.panel.position.y} m · intensité ${li.panel.intensity}`);

const ambiance = (n, sl = 1) => {
    state.L.preset = n; state.L.slider = sl; lighting.applyLighting(true);
    return {
        spot: li.spot.intensity, hemi: li.hemi.intensity, panel: li.panel.intensity,
        expo: ctx.renderer.toneMappingExposure, silk: li.panelMats[0].emissiveIntensity
    };
};
const aDim = ambiance('dim'), aLab = ambiance('lab'), aBr = ambiance('bright'), aDay = ambiance('daylight', 1.2);
chk('les 4 ambiances se suivent : Veillée < Atelier < Lumineux < Plein jour',
    aDim.spot < aLab.spot && aLab.spot < aBr.spot && aBr.spot < aDay.spot
    && aDim.hemi < aLab.hemi && aLab.hemi < aDay.hemi && aDay.hemi > 1 && aDay.expo > 1.5,
    `projecteur ${aDim.spot} → ${aLab.spot} → ${aBr.spot} → ${aDay.spot}`);
chk('les sérigraphies brillent d\'autant plus que la pièce est sombre (façades lisibles)',
    aDim.silk > aLab.silk && aLab.silk > aDay.silk && aLab.silk > .1 && aDay.silk > 0,
    `émissif ${aDim.silk.toFixed(2)} / ${aLab.silk.toFixed(2)} / ${aDay.silk.toFixed(2)}`);
chk('la lumière de façade suit le réglage choisi', aDim.panel < aLab.panel && aLab.panel < aDay.panel,
    `${aDim.panel.toFixed(1)} → ${aLab.panel.toFixed(1)} → ${aDay.panel.toFixed(1)}`);
ambiance('lab');

/* ---- 4 sexies. CARTES DE TP : des panneaux plats, comme en vrai --------
   Rien en relief hors les douilles : les composants sont DESSINÉS sur la
   sérigraphie (les résistances en 3D disparaissaient derrière la carte et
   donnaient un circuit illisible).                                  ---- */
const BOARDS = ['Carte du pont de Wheatstone', 'Maquette de filtres passifs', 'Maquette résistances (TP 3)'];
const isTerminal = (o) => { let p = o; while (p) { if (p.userData && p.userData.kind === 'terminal') return true; p = p.parent; } return false; };
const findB = (lbl) => draggables.find(d => d.label === lbl);
const bumps = [];
BOARDS.forEach(lbl => {
    const b = findB(lbl);
    if (!b) { bumps.push(lbl + ' (absente)'); return; }
    let panelTop = -Infinity;
    b.obj.traverse(o => {
        if (o.geometry && o.geometry.type === 'RoundedBoxGeometry') {
            panelTop = Math.max(panelTop, new THREE.Box3().setFromObject(o).max.y);
        }
    });
    b.obj.traverse(o => {
        if (!o.geometry || isTerminal(o)) return;
        if (new THREE.Box3().setFromObject(o).max.y > panelTop + 0.010) bumps.push(lbl + '→' + o.geometry.type);
    });
});
chk('cartes de TP : rien en relief hors les douilles (composants DESSINÉS)',
    bumps.length === 0, bumps.join(', ') || BOARDS.length + ' cartes plates');

/* ---- l'alignement sérigraphie / douilles (le défaut signalé) ------------
   Chaque douille de carte doit avoir son cercle imprimé EXACTEMENT à sa
   place, et le schéma doit se lire À L'ENDROIT depuis l'élève : le bord du
   FOND de la table (z < 0) est le HAUT du dessin.  On compare les appels
   `arc()` / `fillText()` du canvas aux positions monde des douilles.     ---- */
const TITRES = {
    'Carte du pont de Wheatstone': 'PONT DE WHEATSTONE',
    'Maquette de filtres passifs': 'MAQUETTE FILTRES',
    'Maquette résistances (TP 3)': 'MAQUETTE RÉSISTANCES'
};
const silkFaults = [], orientFaults = [];
const silkOf = (b) => {
    let print = null;
    b.obj.traverse(o => {
        if (o.material && o.material.emissiveMap && o.geometry && o.geometry.type === 'PlaneGeometry') print = o;
    });
    return print;
};
BOARDS.forEach(lbl => {
    const b = findB(lbl);
    if (!b) return;
    const print = silkOf(b);
    if (!print) { silkFaults.push(lbl + ' : aucune sérigraphie'); return; }
    const cvs = print.material.map && print.material.map.image;
    const calls = (cvs && cvs.__calls) || [];
    const arcs = calls.filter(c => c[0] === 'arc');
    const texts = calls.filter(c => c[0] === 'fillText');
    if (!arcs.length) { silkFaults.push(lbl + ' : aucun cercle imprimé'); return; }
    const Wp = cvs.width, Hp = cvs.height;
    const PW = print.geometry.parameters.width, PD = print.geometry.parameters.height;
    const k = b.obj.scale.x || 1, ry = b.obj.rotation.y || 0;
    const g = world(b.obj);
    let n = 0, bad = 0;
    b.obj.traverse(o => {
        if (!(o.userData && o.userData.kind === 'terminal')) return;
        n++;
        const w = world(o);
        const dx = (w.x - g.x) / k, dz = (w.z - g.z) / k;
        const lx = Math.cos(ry) * dx - Math.sin(ry) * dz;      // cotes locales de la carte
        const lz = Math.sin(ry) * dx + Math.cos(ry) * dz;
        const ex = (lx / PW + .5) * Wp, ey = (lz / PD + .5) * Hp;
        if (!arcs.some(c => Math.hypot(c[1] - ex, c[2] - ey) < 2)) bad++;
    });
    if (bad) silkFaults.push(`${lbl} : ${bad}/${n} douille(s) sans cercle à leur place`);

    /* orientation : titre en haut (= côté fond de table), légende en bas */
    const titre = texts.find(c => String(c[1]).includes(TITRES[lbl]));
    if (!titre) orientFaults.push(lbl + ' : titre introuvable');
    else if (!(titre[3] < Hp / 2)) orientFaults.push(`${lbl} : titre imprimé en BAS (schéma à l'envers)`);
    const txtY = (t) => { const c = texts.find(x => x[1] === t); return c ? c[3] : NaN; };
    if (lbl === 'Maquette résistances (TP 3)') {
        /* A1 (barrette du fond) doit être imprimé AU-DESSUS de B1 (barrette avant) */
        if (!(txtY('A1') < txtY('B1')) || !(txtY('R1a') < txtY('R1b'))) {
            orientFaults.push('TP 3 : rangées inversées (A1/B1 ou R1a/R1b dans le mauvais sens)');
        }
    }
});
chk('chaque douille a son cercle sérigraphié EXACTEMENT à sa place',
    silkFaults.length === 0, silkFaults.join(' · ') || BOARDS.length + ' cartes alignées');
chk('les schémas se lisent à l\'endroit : le fond de la table est le HAUT du dessin',
    orientFaults.length === 0, orientFaults.join(' · ') || 'titres en haut, rangée A au-dessus de B');

/* la maquette du TP 3 : une grille régulière, lisible et alignée */
const B3 = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'R1a', 'R1b', 'R2a', 'R2b', 'RLa', 'RLb'];
const b3 = B3.map(id => terminals[id]).filter(t => t && t.group);
const cols = [...new Set(b3.map(t => +world(t.group).x.toFixed(3)))].sort((u, v) => u - v);
const rows = [...new Set(b3.map(t => +world(t.group).z.toFixed(3)))].sort((u, v) => u - v);
chk('TP 3 : 14 douilles rangées en 4 colonnes × 4 rangées (sérigraphie alignée dessus)',
    b3.length === 14 && cols.length === 4 && rows.length === 4,
    `colonnes ${cols.join(' | ')} · rangées ${rows.join(' | ')}`);

/* ---- 4 septies. matériel des trois TP : présent, et masqué hors TP actif ---- */
const angle = (d) => { const w = world(d.obj); return Math.atan2(w.x, -w.z) * 180 / Math.PI; };
const find = (lbl) => draggables.find(d => d.label === lbl);

chk('les trois bancs existent dans la scène',
    !!(ctx.levelA && ctx.levelB && ctx.groupTP2 && ctx.groupTP3)
    && [ctx.levelA, ctx.levelB, ctx.groupTP2, ctx.groupTP3].every(inScene));
chk('au démarrage (TP 1 niveau A) : seul le banc A est visible',
    ctx.levelA.visible === true && ctx.levelB.visible === false
    && ctx.groupTP2.visible === false && ctx.groupTP3.visible === false);
chk('le générateur 0-15 V appartient au TP 1 (visible au démarrage)',
    inScene(ctx.genGroup) && ctx.genGroup.visible === true);

/* appareils COMMUNS : voltmètre + ampèremètre dans leur propre groupe */
const volt = find('Voltmètre'), amm = find('Ampèremètre');
chk('voltmètre et ampèremètre vivent dans un groupe partagé (pas dans le niveau A)',
    !!ctx.metersGroup && inScene(ctx.metersGroup)
    && volt && amm && volt.obj.parent === ctx.metersGroup && amm.obj.parent === ctx.metersGroup
    && volt.obj.parent !== ctx.levelA);
chk('les appareils communs sont visibles au TP 1 niveau A', ctx.metersGroup.visible === true);

/* bornes du TP 3 toutes enregistrées (2 alimentations, rhéostat, maquette) */
const TP3_TERMS = ['E1+', 'E1-', 'E2+', 'E2-', 'RHA', 'RHB', 'RHW',
    'R1a', 'R1b', 'R2a', 'R2b', 'RLa', 'RLb', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
const tp3Missing = TP3_TERMS.filter(id => !allTermIds.includes(id) || !terminals[id]);
chk('les 21 bornes du TP 3 sont enregistrées', tp3Missing.length === 0, tp3Missing.join(',') || '21/21');

/* disposition du TP 3 : E1 au fond, E2 en face, rhéostat à gauche, maquette au centre */
const e1 = find('Alimentation E1 (12 V)'), e2 = find('Alimentation E2 (6 V)');
const rheo = find('Rhéostat 230 Ω – 1,5 A'), board3 = find('Maquette résistances (TP 3)');
chk('TP 3 : les 4 matériels sont là', !!(e1 && e2 && rheo && board3));
const a1 = angle(e1), a2 = angle(e2), ar = angle(rheo);
chk('TP 3 : E1 au fond (0°), E2 en face (180°), rhéostat à gauche (270°)',
    Math.abs(a1) < 1 && Math.abs(Math.abs(a2) - 180) < 1 && Math.abs(ar + 90) < 1,
    `E1 ${a1.toFixed(0)}° · E2 ${a2.toFixed(0)}° · Rh ${ar.toFixed(0)}°`);
const bw = world(board3.obj);
chk('TP 3 : maquette posée À PLAT au centre de la table',
    board3.faceCenter === false && Math.abs(board3.obj.rotation.x) < 1e-9 && Math.hypot(bw.x, bw.z) < .1,
    `x=${bw.x.toFixed(2)} z=${bw.z.toFixed(2)}`);
chk('TP 3 : afficheurs et organes mobiles référencés',
    !!(ctx.e1LCD && ctx.e2LCD && ctx.e1Pivot && ctx.e2Pivot && ctx.rheoSlider && ctx.rheoKnob));

/* les bancs ne se mélangent pas : chaque matériel reste dans son propre groupe */
const ancestor = (o, g) => { let p = o; while (p) { if (p === g) return true; p = p.parent; } return false; };
const mixed = draggables.filter(d => ancestor(d.obj, ctx.groupTP2) && ancestor(d.obj, ctx.groupTP3));
chk('aucun appareil n\'appartient à la fois au banc TP 2 et au banc TP 3', mixed.length === 0,
    `${ctx.groupTP3.children.length} objet(s) dans le groupe TP 3`);

/* ---- 5. le joueur arrive face à la table ---- */
chk('position de départ derrière la table, à hauteur d\'yeux debout',
    Math.abs(ctx.yawObj.position.z - 3.35) < 1e-6 && Math.abs(ctx.yawObj.position.y - 1.62) < 1e-6,
    `z=${ctx.yawObj.position.z}, y=${ctx.yawObj.position.y}`);

console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
