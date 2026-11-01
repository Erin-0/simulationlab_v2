/* =====================================================================
   js/quality.js  —  presets graphiques appliqués à chaud (résolution,
                     ombres, poussières, brouillard, filtrage des textures,
                     cadence des écrans LCD). Choix mémorisé.
   ===================================================================== */
import * as THREE from 'three';
import { Q, QPRESETS, ctx, allTextures } from './state.js';
import { toast } from './hud.js';

export function applyQuality(level, quiet) {
    const p = QPRESETS[level];
    if (!p) return;
    Object.assign(Q, p);
    Q.level = level;

    /* résolution */
    ctx.renderer.setPixelRatio(p.pr === 0 ? Math.min(globalThis.devicePixelRatio ?? 1, 2) : p.pr);
    ctx.renderer.setSize(globalThis.innerWidth || 1280, globalThis.innerHeight || 720);

    /* ombres */
    ctx.renderer.shadowMap.enabled = p.shadows;
    ctx.renderer.shadowMap.type = (level === 'high') ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (ctx.spot) {
        ctx.spot.castShadow = p.shadows;
        if (ctx.spot.shadow.map) { ctx.spot.shadow.map.dispose(); ctx.spot.shadow.map = null; }
        ctx.spot.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    }

    /* poussières, brouillard, filtrage */
    if (ctx.dust) {
        ctx.dust.visible = p.dust;
        ctx.dust.geometry.setDrawRange(0, Math.min(p.dustN, ctx.dust.geometry.attributes.position.count));
    }
    if (ctx.scene && ctx.scene.fog) ctx.scene.fog.density = p.fog;
    allTextures.forEach(t => { t.anisotropy = p.aniso; t.needsUpdate = true; });

    /* les matériaux doivent être recompilés quand le pipeline d'ombres change */
    ctx.scene.traverse(o => {
        if (o.material) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
        }
    });

    document.querySelectorAll('.qbtn').forEach(b => b.classList.toggle('sel', b.dataset.q === level));
    try { localStorage.setItem('labo3d_quality', level); } catch (e) { }
    if (!quiet) toast(`Qualité graphique : ${p.label}`, 'info');
}

export function savedQuality() {
    let q = 'med';
    try { q = localStorage.getItem('labo3d_quality') || 'med'; } catch (e) { }
    return QPRESETS[q] ? q : 'med';
}

export function bindQualityButtons(sfxClick) {
    document.querySelectorAll('.qbtn').forEach(b => {
        b.onclick = () => { sfxClick && sfxClick(); applyQuality(b.dataset.q); };
    });
}
