/* =====================================================================
   tests/extents.mjs — mesure de l'encombrement RÉEL d'un objet 3D.

   Le stub `three` des tests ne calcule pas les boîtes englobantes ; on
   déduit donc les demi-largeurs de chaque primitive depuis ses
   `parameters` (contrat identique à celui de Three.js), puis on les
   projette à travers la matrice monde. Cela permet de vérifier qu'un
   appareil repose exactement sur son support, au millimètre.
   ===================================================================== */
const HALF = {
    BoxGeometry: p => [p.width / 2, p.height / 2, p.depth / 2],
    RoundedBoxGeometry: p => [p.width / 2, p.height / 2, p.depth / 2],
    PlaneGeometry: p => [p.width / 2, p.height / 2, 0],
    CircleGeometry: p => [p.radius, p.radius, 0],
    RingGeometry: p => [p.outerRadius, p.outerRadius, 0],
    SphereGeometry: p => [p.radius, p.radius, p.radius],
    CylinderGeometry: p => {
        const r = Math.max(p.radiusTop || 0, p.radiusBottom || 0);
        return [r, (p.height || 0) / 2, r];
    },
    ConeGeometry: p => [p.radius || 0, (p.height || 0) / 2, p.radius || 0],
    TorusGeometry: p => [p.radius + p.tube, p.tube, p.radius + p.tube],
    CapsuleGeometry: p => [p.radius, p.length / 2 + p.radius, p.radius]
};

/** Demi-largeurs locales d'un maillage (null si primitive inconnue). */
export function halfExtents(mesh) {
    const g = mesh && mesh.geometry;
    if (!g) return null;
    const f = HALF[g.type];
    if (!f) return null;
    return f(g.parameters || {});
}

/** Altitude monde du point le plus bas de l'objet (Infinity si rien de connu). */
export function worldMinY(root) {
    let minY = Infinity;
    root.traverse(o => {
        const h = halfExtents(o);
        if (!h) return;
        o.updateMatrixWorld(true);
        const e = o.matrixWorld.elements || o.matrixWorld;
        const dy = Math.abs(e[1]) * h[0] + Math.abs(e[5]) * h[1] + Math.abs(e[9]) * h[2];
        if (e[13] - dy < minY) minY = e[13] - dy;
    });
    return minY;
}
