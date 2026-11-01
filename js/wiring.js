/* =====================================================================
   js/wiring.js  —  câblage « banane » : fils réels avec flèche
                    (caténaire), aperçu fantôme suivant le viseur,
                    débranchement automatique quand on déplace un appareil.

   NB : chaque vecteur utilisé pour construire un fil est alloué/cloné
   indépendamment (les objets de calcul partagés produisaient le bug du
   « fil qui tombe par terre / borne source non connectée »).
   ===================================================================== */
import * as THREE from 'three';
import { terminals, wires, interactives, wireColor, Q, TABLE_H, TABLE_R } from './state.js';
import { sfx } from './audio.js';

/* scratch dédié — jamais partagé avec l'appelant */
const _tq = new THREE.Quaternion(), _tax = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Position monde de l'embouchure de la borne (là où entre la fiche banane). */
export function tipPos(id, out) {
    const t = terminals[id];
    t.group.getWorldPosition(out);
    if (t.axis === 'z') {
        t.group.getWorldQuaternion(_tq);
        _tax.set(0, 0, 1).applyQuaternion(_tq);
        out.addScaledVector(_tax, .012);
    } else out.y += .012;
    return out;
}

/** Axe monde « vers l'extérieur » d'une borne (direction de la fiche). */
export function axisVec(id, out) {
    const t = terminals[id];
    if (t.axis === 'z') {
        t.group.getWorldQuaternion(_tq);
        out.set(0, 0, 1).applyQuaternion(_tq).normalize();
    } else out.set(0, 1, 0);
    return out;
}

/** Hachage déterministe 0..1 : un fil garde toujours exactement le même pli. */
export function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 997) / 997;
}

/**
 * Points de contrôle « chaînette » d'un fil banane.
 * Tous les vecteurs sont clonés : aucun aliasing.
 */
export function wirePoints(p0, a0, p1, a1, seed = .5) {
    const A = p0.clone(), B = p1.clone();
    const outA = A.clone().addScaledVector(a0, .085);
    const outB = B.clone().addScaledVector(a1, .085);
    const d = outA.distanceTo(outB);
    const sag = Math.min(.06 + d * .22, .42);
    const m1 = outA.clone().lerp(outB, .34), m2 = outA.clone().lerp(outB, .66);
    m1.y -= sag; m2.y -= sag;
    /* le fil reste au-dessus de la paillasse circulaire / du sol */
    const floorOf = (v) => (Math.hypot(v.x, v.z) < TABLE_R - .04) ? TABLE_H + .02 : .05;
    m1.y = Math.max(m1.y, floorOf(m1));
    m2.y = Math.max(m2.y, floorOf(m2));
    const perp = new THREE.Vector3().subVectors(outB, outA).cross(UP);
    if (perp.lengthSq() < 1e-9) perp.set(1, 0, 0); else perp.normalize();
    const j = (seed - .5) * .07;
    m1.addScaledVector(perp, j);
    m2.addScaledVector(perp, -j * .6);
    return [A, outA, m1, m2, outB, B];
}

export function buildWireMesh(a, b, color) {
    const p0 = tipPos(a, new THREE.Vector3()), p1 = tipPos(b, new THREE.Vector3());
    const a0 = axisVec(a, new THREE.Vector3()), a1 = axisVec(b, new THREE.Vector3());
    const curve = new THREE.CatmullRomCurve3(wirePoints(p0, a0, p1, a1, hash01(a + '|' + b)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Q.tubeSeg, .0058, Q.tubeRad),
        new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: .08 }));
    tube.castShadow = true;
    const group = new THREE.Group();
    group.add(tube);
    [[p0, a0], [p1, a1]].forEach(([p, ax]) => {
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.0092, .0092, .05, 12),
            new THREE.MeshStandardMaterial({ color, roughness: .35, metalness: .2 }));
        sleeve.quaternion.setFromUnitVectors(UP, ax);
        sleeve.position.copy(p).addScaledVector(ax, .018);
        sleeve.castShadow = true;
        sleeve.userData.ignore = true;      // ne bloque jamais le clic sur la borne
        group.add(sleeve);
    });
    return group;
}

export function pairExists(a, b) {
    return wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

export function addWire(a, b, onEval, onToast) {
    if (pairExists(a, b)) { sfx.err(); onToast('Ces deux bornes sont déjà reliées.', 'warn'); return null; }
    const group = buildWireMesh(a, b, wireColor.current);
    const w = { a, b, color: wireColor.current, group };
    group.userData = { interact: true, kind: 'wire', wire: w, tip: 'Fil de liaison — clic : le retirer' };
    wires.push(w);
    /* les fils sont toujours ajoutés à la SCÈNE (jamais à un appareil) :
       un appareil peut changer de parent quand on bascule de niveau. */
    sceneAdd(group);
    interactives.push(group);
    sfx.plug();
    onToast(`Fil posé : ${terminals[a].label} ↔ ${terminals[b].label}`, 'info');
    onEval && onEval();
    return w;
}

let _scene = null;
export function setScene(s) { _scene = s; }
function sceneAdd(o) { if (_scene) _scene.add(o); }

export function removeWire(w, silent = false, onEval) {
    const i = wires.indexOf(w);
    if (i < 0) return;
    wires.splice(i, 1);
    const ii = interactives.indexOf(w.group);
    if (ii >= 0) interactives.splice(ii, 1);
    /* un fil peut exister sans maillage (test headless, retrait groupé) */
    if (w.group) {
        w.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        if (_scene) _scene.remove(w.group);
    }
    if (!silent) { sfx.unplug(); onEval && onEval(); }
}

export function clearWires(silent = false, onEval, onToast) {
    [...wires].forEach(w => removeWire(w, true, onEval));
    if (!silent) {
        sfx.unplug();
        onToast && onToast('Tous les fils ont été retirés.', 'info');
        onEval && onEval();
    }
}

/** Reconstruit la géométrie d'un fil (après déplacement d'un appareil). */
export function rebuildWire(w) {
    const ng = buildWireMesh(w.a, w.b, w.color);
    ng.userData = w.group.userData;
    if (_scene) { _scene.remove(w.group); _scene.add(ng); }
    w.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    const i = interactives.indexOf(w.group);
    if (i >= 0) interactives[i] = ng;
    w.group = ng;
    ng.userData.wire = w;
}

export function rebuildAllWires() { [...wires].forEach(rebuildWire); }

/**
 * Débranche automatiquement tous les fils touchant un appareil que l'on
 * déplace (les fiches ne suivent pas : elles sautent de la borne).
 */
export function detachWiresOf(termIds, onEval, onToast) {
    const set = new Set(termIds);
    const hit = wires.filter(w => set.has(w.a) || set.has(w.b));
    if (!hit.length) return 0;
    hit.forEach(w => removeWire(w, true, null));
    sfx.unplug();
    onToast && onToast(`${hit.length} fil(s) débranché(s) automatiquement.`, 'warn');
    onEval && onEval();
    return hit.length;
}

/* ------------------------------------------------------------------ */
/*  Aperçu du fil en cours de pose (suit le viseur, s'aimante à la borne) */
/* ------------------------------------------------------------------ */
export const previewMat = new THREE.MeshBasicMaterial({
    color: 0xd93a3a, transparent: true, opacity: .6, depthWrite: false
});
export const previewTube = new THREE.Mesh(new THREE.BufferGeometry(), previewMat);
export const previewTip = new THREE.Mesh(new THREE.SphereGeometry(.013, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75, depthWrite: false }));

export function initPreview(scene) {
    previewTube.frustumCulled = false; previewTube.visible = false; previewTube.renderOrder = 2;
    previewTip.visible = false; previewTip.renderOrder = 2;
    scene.add(previewTube, previewTip);
}

export function setPreviewVisible(v) { previewTube.visible = v; previewTip.visible = v; }

export function updatePreviewGeometry(pendingTerm, endPt, endAxis) {
    const p0 = tipPos(pendingTerm, new THREE.Vector3());
    const a0 = axisVec(pendingTerm, new THREE.Vector3());
    const curve = new THREE.CatmullRomCurve3(
        wirePoints(p0, a0, endPt.clone(), endAxis.clone(), hash01(pendingTerm)));
    previewTube.geometry.dispose();
    previewTube.geometry = new THREE.TubeGeometry(curve, Math.max(14, Q.tubeSeg - 8), .005, 5);
    previewTip.position.copy(endPt);
}
