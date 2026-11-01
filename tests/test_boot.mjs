import { install } from './domstub.mjs';
install();
/* charge le VRAI point d'entrée du jeu */
await import('../js/main.js');
console.log('  ✓ main.js s\'est chargé et exécuté sans erreur');

const state = await import('../js/state.js');
const hud = await import('../js/hud.js');
const circuit = await import('../js/circuit.js');
const drag = await import('../js/drag.js');
const avatar = await import('../js/avatar.js');
const player = await import('../js/player.js');
const net = await import('../js/net.js');
const displays = await import('../js/displays.js');

let pass = 0, fail = 0;
const chk = (l, c, x = '') => { c ? (pass++, console.log('  ✓', l, x)) : (fail++, console.log('  ✗', l, x)); };

/* ---- registres ---- */
/* 47 bornes : TP 1 (16) + TP 2 (10) + TP 3 (21)
   16 objets déplaçables : 7 appareils TP 1 + 3 TP 2 + 4 TP 3 + feuille + stylo */
chk('47 bornes enregistrées (les trois TP)', state.allTermIds.length === 47,
    state.allTermIds.length + ' : ' + state.allTermIds.join(','));
chk('objets interactifs > 60', state.interactives.length > 60, state.interactives.length);
chk('objets déplaçables = 16 (14 appareils + feuille + stylo)', state.draggables.length === 16,
    state.draggables.map(d => d.label).join(' | '));
const dustCount = state.ctx.scene.children.filter(o => o.isPoints).length;
chk('un seul système de poussière (buildDust appelé une seule fois)', dustCount === 1, dustCount + ' système(s)');
chk('générateur livré ÉTEINT et à 0 V', state.S.genOn === false && state.S.setV === 0);

/* ---- feuille de relevés (saisie manuelle) ---- */
hud.openPaper(true);
chk('la feuille s\'ouvre', hud.isPaperOpen() === true);
hud.addBlankRow(false);
chk('une ligne VIDE est ajoutée (pas de valeurs auto)',
    hud.rows.length === 1 && hud.rows[0].U === '' && hud.rows[0].I === '' && hud.rows[0].R === '',
    JSON.stringify(hud.rows[0]));
hud.renderTable();
chk('le tableau se dessine', document.getElementById('cahierBody').innerHTML.includes('cellin'));
hud.rows[0].U = '5,00'; hud.rows[0].I = '49,5'; hud.rows[0].lvl = 'A';
hud.renderTable();
chk('export CSV possible après saisie manuelle', typeof hud.exportCSV === 'function');
hud.openPaper(false);
chk('la feuille se referme', hud.isPaperOpen() === false);

/* ---- niveau B : générateur remis à zéro ---- */
state.S.genOn = true; state.S.setV = 7;
state.S.level = 'B'; circuit.resetGeneratorState();
chk('changement de niveau -> générateur éteint', state.S.genOn === false && state.S.setV === 0);

/* ---- mode de jeu : SOLO imposé (le multijoueur a été retiré) ---- */
net.initIdentity();
chk('identité locale définie', state.ME.name.length > 0 && /^#[0-9a-f]{6}$/i.test(state.ME.color),
    state.ME.name + ' ' + state.ME.color);
chk('main.js impose le mode solo', state.ME.solo === true);
chk('aucun personnage au démarrage', avatar.peers.size === 0, avatar.peers.size + ' avatar(s)');
chk('en solo, impossible de créer un personnage', avatar.addPeer('x0', 'Voisin', '#f472b6', false) === null
    && avatar.peers.size === 0);

/* le moteur d'avatars reste intact (testé hors solo) : primitives simples,
   bulle de chat façon Roblox, flash rouge à l'impact */
avatar.setSolo(false);
const a = avatar.addPeer('x1', 'Camarade', '#a3e635', false);
let meshes = 0;
a.group.traverse(o => { if (o.geometry) meshes++; });
chk('personnage composé de primitives simples (ni bras ni jambes)', meshes >= 6 && meshes <= 14, meshes + ' maillages');
avatar.say('x1', 'Bonjour le labo !');
chk('bulle de chat au-dessus de la tête', !!a.bubble);
avatar.hurtPeer('x1', 1);
chk('flash rouge possible sur impact', a.hurt === 1);
avatar.update(0.016, 1.0, 'x1');
chk('animation des avatars sans erreur', true);
avatar.setSolo(true);
chk('retour en solo : TOUS les personnages disparaissent', avatar.peers.size === 0, avatar.peers.size + ' avatar(s)');
net.connect();
chk('aucune connexion serveur en solo', state.ME.online === false && state.ME.transport === '—', state.ME.transport);

/* ---- déplacement d'objet : PLUS AUCUNE CHUTE ---- */
const rec = state.draggables.find(d => d.label === 'Générateur 0–15 V');
const home = rec.obj.position.clone();
const homeYaw = rec.obj.rotation.y;
const w0 = drag.__test.worldXYZ(rec.obj, { x: 0, y: 0, z: 0 });
const homeWorld = { x: w0.x, y: w0.y, z: w0.z };

/* saisie (appui long déjà écoulé dans le harnais : on appelle beginDrag) */
drag.__test.beginDrag(rec);
chk('l\'objet est bien « saisi »', drag.isDragging() === true);

/* la rotation libre : un cran de molette = 7,5° */
const yaw0 = rec.obj.rotation.y;
drag.__test.rotateHeld(1);
const step = rec.obj.rotation.y - yaw0;
chk('la molette fait tourner l\'appareil (7,5° par cran)',
    Math.abs(step - Math.PI / 24) < 1e-9, (step * 180 / Math.PI).toFixed(2) + '°');

/* appui long sur le bouton droit : rotation rapide (×3,7) */
drag.__test.setFastSpin(true);
const yaw1 = rec.obj.rotation.y;
drag.__test.rotateHeld(1);
const stepFast = rec.obj.rotation.y - yaw1;
chk('appui long (bouton droit) : rotation plus rapide',
    Math.abs(stepFast / step - 3.7) < 1e-9,
    (stepFast * 180 / Math.PI).toFixed(2) + '° contre ' + (step * 180 / Math.PI).toFixed(2) + '°');
drag.__test.setFastSpin(false);

/* lâché au-dessus du vide : il NE TOMBE PAS, il revient sur le mobilier */
rec.lastGood = { x: homeWorld.x, y: homeWorld.y, z: homeWorld.z, yaw: rec.obj.rotation.y };
rec.obj.position.set(4.0, 1.6, 4.0);            // très loin de toute surface
drag.__test.release(rec);
const w1 = drag.__test.worldXYZ(rec.obj, { x: 0, y: 0, z: 0 });
chk('rien ne tombe : lâché dans le vide, l\'appareil revient se poser',
    Math.hypot(w1.x - homeWorld.x, w1.z - homeWorld.z) < 1e-6
    && Math.abs(w1.y - (state.TABLE_H + rec.yOff)) < 1e-6,
    `x=${w1.x.toFixed(3)} z=${w1.z.toFixed(3)} y=${w1.y.toFixed(4)}`);
chk('aucune physique de chute ne subsiste', rec.falling === undefined && rec.spin === undefined);
chk('l\'orientation choisie à la molette est conservée',
    Math.abs(rec.obj.rotation.y - (yaw1 + stepFast)) < 1e-9,
    (rec.obj.rotation.y * 180 / Math.PI).toFixed(1) + '°');
rec.obj.position.copy(home); rec.obj.rotation.set(0, homeYaw, 0); rec.lastGood = null;

/* ---- la boucle de déplacement ne fait jamais tomber un objet ---- */
rec.obj.position.set(0.2, state.TABLE_H + rec.yOff, 0.2);
for (let i = 0; i < 240; i++) drag.update(1 / 60, i / 60, { x: 0, y: 1.62, z: 3 });
chk('la boucle de déplacement ne déclenche aucune chute',
    rec.obj.position.y >= state.TABLE_H - 1e-9, `y=${rec.obj.position.y.toFixed(4)}`);
rec.obj.position.copy(home); rec.obj.rotation.set(0, homeYaw, 0);

/* ---- evaluate + afficheurs ---- */
state.S.level = 'A'; state.S.genOn = true; state.S.setV = 5;
state.wires.push({ a: 'G+', b: 'A+', color: 0, group: null }, { a: 'A-', b: 'R1', color: 0, group: null },
                 { a: 'R2', b: 'G-', color: 0, group: null }, { a: 'V+', b: 'R1', color: 0, group: null },
                 { a: 'V-', b: 'R2', color: 0, group: null });
state.ctx.evaluate();
displays.updateDisplays();
chk('circuit évalué depuis main.js', state.S.loopOk === true && state.S.montage === 'aval',
    `I=${(state.S.IA * 1000).toFixed(2)} mA, U=${state.S.UV.toFixed(3)} V, montage=${state.S.montage}`);

/* ---- clic sur le papier : NOUVELLE feuille vierge ---- */
hud.openPaper(false);
hud.rows.push({ lvl: 'A', montage: 'AVAL', U: '5,00', I: '49,5', R: '101,01', time: '10:00', obs: '' });
hud.newSheet();
chk('clic sur le papier : une feuille vierge est ouverte',
    hud.isPaperOpen() === true && hud.rows.length === 0, hud.rows.length + ' ligne(s)');
chk('les relevés précédents sont conservés en réserve', hud.sheets.length === 1, hud.sheets.length + ' feuille(s)');
const beforePrev = hud.sheets[0].length;
hud.prevSheet();
chk('on peut revenir à la feuille précédente',
    hud.rows.length === beforePrev && hud.sheets.length === 0,
    hud.rows.length + ' relevé(s) restauré(s)');
hud.rows.length = 0; hud.renderTable();

/* ---- boîte à décades : tambours chiffrés mécaniques ---- */
state.S.digits = [1, 2, 3, 4];
displays.updateDisplays();
displays.drawDrums(state.S.digits);
chk('la boîte à décades a 4 tambours chiffrés (sans écran)',
    (state.ctx.digitWins || []).length === 4, (state.ctx.digitWins || []).length + ' fenêtres');

/* ---- éclairage réglable ---- */
const lighting = await import('../js/lighting.js');
state.L.preset = 'dim'; state.L.slider = 1; lighting.applyLighting(true);
const dimHemi = state.ctx.lights.hemi.intensity;
state.L.preset = 'daylight'; state.L.slider = 1; lighting.applyLighting(true);
const dayHemi = state.ctx.lights.hemi.intensity;
chk('les ambiances d\'éclairage changent bien la lumière', dayHemi > dimHemi * 2,
    `hémisphère ${dimHemi.toFixed(2)} -> ${dayHemi.toFixed(2)}`);
state.L.slider = 1.5; lighting.applyLighting(true);
chk('le curseur d\'intensité agit sur toutes les lumières',
    state.ctx.lights.hemi.intensity > dayHemi * 1.4,
    (state.ctx.lights.hemi.intensity).toFixed(2));
state.L.preset = 'lab'; state.L.slider = 1; lighting.applyLighting(true);
chk('l\'exposition du rendu suit le réglage',
    state.ctx.renderer.toneMappingExposure > 0, state.ctx.renderer.toneMappingExposure.toFixed(2));

/* ---- fonctions « amis » appelées alors qu'aucun camarade n'existe ---- */
avatar.say('x2', 'test'); avatar.hurtPeer('x2', 1); avatar.update(0.016, 2.0, 'x2');
chk('mode solo : les fonctions « amis » ne cassent rien', avatar.peers.size === 0);

/* ---- bascule vers le TP 3 (bouton réel de l'interface) ---- */
document.getElementById('btnTP3').onclick();
chk('le bouton « TP 3 » bascule sur le troisième laboratoire', state.S.activeTP === 3);
chk('TP 3 : son banc est affiché, les autres masqués',
    state.ctx.groupTP3.visible === true && state.ctx.groupTP2.visible === false
    && state.ctx.levelA.visible === false && state.ctx.levelB.visible === false
    && state.ctx.genGroup.visible === false);
chk('TP 3 : le voltmètre et l\'ampèremètre suivent (matériel commun)',
    state.ctx.metersGroup.visible === true);
chk('TP 3 : ses alimentations sont livrées ÉTEINTES',
    state.S.tp3.on1 === false && state.S.tp3.on2 === false);
chk('TP 3 : onglet des manipulations affiché, les autres masqués',
    document.getElementById('tabsTP3').classList.contains('hidden') === false
    && document.getElementById('tabsTP1').classList.contains('hidden') === true);
chk('TP 3 : titre du laboratoire mis à jour',
    document.getElementById('brandSub').textContent.includes('THÉORÈMES'),
    document.getElementById('brandSub').textContent);

/* ---- feuille de relevés du TP 3 : la table 9 est IMPRIMÉE ---- */
hud.openPaper(true);
hud.renderTable();
const t9 = document.getElementById('cahierBody').innerHTML;
chk('TP 3 : la table 9 s\'affiche avec ses 12 grandeurs',
    hud.TP3_ROWS.length === 12 && (t9.match(/data-k=/g) || []).length === 24,
    (t9.match(/data-k=/g) || []).length + ' cases');
chk('TP 3 : toutes les cases sont VIDES au départ (remplissage à la main)',
    hud.TP3_ROWS.every(r => !hud.measurementsTP3[r.key].valeur && !hud.measurementsTP3[r.key].incert));
hud.addBlankRow(false);
chk('TP 3 : on ne peut pas ajouter de ligne au formulaire imprimé',
    document.getElementById('cahierBody').innerHTML === t9);
hud.measurementsTP3.V0.valeur = '8,30'; hud.measurementsTP3.V0.incert = '0,28';
hud.measurementsTP3.I0.valeur = '0,0747'; hud.measurementsTP3.I0.incert = '0,0004';
hud.updateTP3ReportFlags();
chk('TP 3 : V₀ et I₀ écrits AVEC leurs incertitudes valident l\'objectif de report',
    state.S.tp3.recV0 === true && state.S.tp3.recI0 === true);
hud.measurementsTP3.VM.valeur = '4,77';
hud.updateTP3ReportFlags();
chk('TP 3 : une valeur sans incertitude ne suffit pas pour V₀/I₀, mais suffit ailleurs',
    state.S.tp3.recVM === false);
hud.measurementsTP3.VM.incert = '0,15';
hud.measurementsTP3.IRcalc.valeur = '0,0318'; hud.measurementsTP3.IR.valeur = '0,0318';
hud.updateTP3ReportFlags();
chk('TP 3 : V_M, I_R calculé et I_R mesuré reportés -> objectif validé', state.S.tp3.recVM === true);
hud.clearTP3Table();
hud.updateTP3ReportFlags();
chk('TP 3 : « Tout effacer » remet la table 9 à blanc',
    hud.TP3_ROWS.every(r => !hud.measurementsTP3[r.key].valeur) && state.S.tp3.recV0 === false);
hud.openPaper(false);

/* ================================================================== */
/*  CLAVIER / SOURIS : le jeu garde SES touches, le navigateur les      */
/*  siennes.                                                            */
/*  (1) plus aucune bascule de niveau au clavier : les touches 1 et 2    */
/*      faisaient apparaître les bancs du TP 1 PAR-DESSUS le matériel    */
/*      du TP 2 ou du TP 3 (chevauchement incompréhensible) ;            */
/*  (2) aucune combinaison utilisée par le jeu (Maj = courir, Ctrl =     */
/*      s'accroupir, E = zoom, molette = réglages) ne doit atteindre le   */
/*      navigateur : c'est ce qui déclenchait le zoom arrière et         */
/*      rétrécissait tout à l'écran.                                     */
/* ================================================================== */
const mkEv = (code, mods = {}) => ({
    code, key: code, repeat: false,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    ...mods, _pd: false, preventDefault() { this._pd = true; }, stopPropagation() { }
});
player.setStarted(true);
state.S.level = 'B';                    // on est au TP 3 : le niveau B ne doit pas bouger
chk('pré-condition : TP 3 actif, bancs du TP 1 masqués, niveau B',
    state.S.activeTP === 3 && state.S.level === 'B'
    && state.ctx.levelA.visible === false && state.ctx.levelB.visible === false);

globalThis.__fire('keydown', mkEv('Digit1'));
globalThis.__fire('keydown', mkEv('Digit2'));
chk('les touches 1 et 2 ne basculent PLUS les niveaux (fin du chevauchement des bancs)',
    state.S.level === 'B' && state.ctx.levelA.visible === false && state.ctx.levelB.visible === false,
    `niveau ${state.S.level} · banc A visible : ${state.ctx.levelA.visible}`);
try { document.getElementById('tabA').onclick(); } catch (e) { }
chk("setLevel refuse hors du TP 1 (même en cliquant l'onglet A)",
    state.S.level === 'B' && state.ctx.levelA.visible === false, `niveau ${state.S.level}`);

const kMajE = mkEv('KeyE', { shiftKey: true });
const kCtrlE = mkEv('KeyE', { ctrlKey: true });
const kCtrlW = mkEv('KeyW', { ctrlKey: true });
const kCtrlMajE = mkEv('KeyE', { ctrlKey: true, shiftKey: true });
const kTab = mkEv('Tab');
const kSpace = mkEv('Space');
[kMajE, kCtrlE, kCtrlW, kCtrlMajE, kTab, kSpace].forEach(e => globalThis.__fire('keydown', e));
chk('Maj+E, Ctrl+E, Ctrl+Maj+E, Ctrl+W, Tab et Espace sont AVALÉS par le jeu',
    kMajE._pd && kCtrlE._pd && kCtrlW._pd && kCtrlMajE._pd && kTab._pd && kSpace._pd,
    [kMajE._pd, kCtrlE._pd, kCtrlW._pd, kCtrlMajE._pd, kTab._pd, kSpace._pd].map(v => v ? 'oui' : 'NON').join('/'));

const kCtrlR = mkEv('KeyR', { ctrlKey: true });
const kF5 = mkEv('F5');
const kF12 = mkEv('F12', { ctrlKey: true, shiftKey: true });
[kCtrlR, kF5, kF12].forEach(e => globalThis.__fire('keydown', e));
chk('Ctrl+R, F5 et F12 restent au navigateur (on peut toujours recharger la page)',
    kCtrlR._pd === false && kF5._pd === false && kF12._pd === false);

/* molette : Ctrl+molette = zoom du navigateur, à bloquer au-dessus de la 3D */
const wasLocked = player.P.locked;
player.P.locked = false;
const wCanvas = { deltaY: -120, ctrlKey: true, target: state.ctx.renderer.domElement, _pd: false, preventDefault() { this._pd = true; } };
const wHud = { deltaY: -120, ctrlKey: true, target: document.getElementById('cahier'), _pd: false, preventDefault() { this._pd = true; } };
globalThis.__fireDoc('wheel', wCanvas);
globalThis.__fireDoc('wheel', wHud);
chk('Ctrl+molette au-dessus de la vue 3D est bloqué, même pointeur déverrouillé', wCanvas._pd === true);
chk("Ctrl+molette au-dessus d'un panneau de l'interface reste libre (défilement des relevés)",
    wHud._pd === false);
player.P.locked = wasLocked;

/* la saisie dans les champs du HUD ne doit JAMAIS être avalée */
const champ = document.getElementById('inpRthCalc');
champ.tagName = 'INPUT';
globalThis.document.activeElement = champ;
const kDigit = mkEv('Digit1');
globalThis.__fire('keydown', kDigit);
chk('dans un champ de saisie du HUD, les touches ne sont pas interceptées', kDigit._pd === false);
globalThis.document.activeElement = null;

/* nettoyage : vider le jeu de touches, remettre le niveau A et rendre la main */
['KeyE', 'KeyW', 'KeyR', 'Tab', 'Space', 'F5', 'F12', 'Digit1', 'Digit2'].forEach(c => globalThis.__fire('keyup', mkEv(c)));
state.S.level = 'A';
chk('le joueur peut venir au ras de la paillasse (écart ≤ 8 cm debout, 0 accroupi)',
    player.BODY_R - state.TABLE_R <= 0.08 && player.BODY_R_CROUCH <= state.TABLE_R + 1e-9,
    `debout ${(player.BODY_R - state.TABLE_R) * 100} cm du bord · accroupi ${(player.BODY_R_CROUCH - state.TABLE_R) * 100} cm`);
player.setStarted(false);

/* ---- retour au TP 1 : le matériel commun réapparaît avec le niveau A ---- */
document.getElementById('btnTP1').onclick();
chk('retour au TP 1 : banc A visible, TP 3 masqué',
    state.S.activeTP === 1 && state.ctx.levelA.visible === true
    && state.ctx.groupTP3.visible === false && state.ctx.genGroup.visible === true);
chk('retour au TP 1 : générateur livré éteint', state.S.genOn === false && state.S.setV === 0);

/* ================================================================== */
/*  Appareils à AIGUILLE : calibres, lecture, surcharge (fascicule p.2) */
/* ================================================================== */
console.log('\n  --- Voltmètre / ampèremètre à aiguille ---');
const THREE = await import('three');
const wiresB = state.wires;
const evB = () => circuit.evaluate(() => { }, () => { });
const clrB = () => { wiresB.length = 0; };
const WB = (...pairs) => {
    pairs.forEach(([a, b]) => wiresB.push({ a, b, color: 0x22d3ee, group: new THREE.Group() }));
    evB();
};
const nearB = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

chk('aiguilles : pivots, sélecteurs et voyants OL présents',
    !!state.ctx.voltPivot && !!state.ctx.ammPivot && !!state.ctx.voltSel && !!state.ctx.ammSel && !!state.ctx.voltOL && !!state.ctx.ammOL);
chk('plus aucun afficheur numérique sur les multimètres',
    state.ctx.voltLCD === undefined && state.ctx.ammLCD === undefined);
chk('livrés sur le PLUS GRAND calibre (30 V / 300 mA)',
    state.S.voltCal === state.VOLT_CALS.length - 1 && state.S.ammCal === state.AMP_CALS.length - 1);

/* sélecteur de calibre : un cran par clic, borné aux deux extrémités */
const cal0 = state.S.voltCal;
chk('calibre V : borné au maximum', player.adjustControl('calV', +1, 'click') === false && state.S.voltCal === cal0);
player.adjustControl('calV', -1, 'click');
chk('calibre V : un clic = un cran, le sélecteur suit',
    state.S.voltCal === cal0 - 1 && nearB(state.ctx.voltSel.rotation.z, (2 - state.S.voltCal) * Math.PI / 3, 1e-12),
    state.ctx.voltSel.rotation.z.toFixed(2) + ' rad');
for (let i = 0; i < 10; i++) player.adjustControl('calV', -1, 'click');
chk('calibre V : borné au minimum', state.S.voltCal === 0);
state.S.voltCal = 3; state.S.ammCal = 3; displays.updateMetersCal();   // 10 V / 100 mA

/* lecture à l'aiguille : déviation = valeur / calibre × 100 div */
state.S.genOn = true; state.S.setV = 6;
clrB(); WB(['G+', 'A+'], ['A-', 'R1'], ['R2', 'G-'], ['V+', 'A+'], ['V-', 'R2']);
displays.updateDisplays();
const divV = state.ctx.voltPivot.userData.divTarget;
const divA = state.ctx.ammPivot.userData.divTarget;
chk('aiguille V : déviation = U / calibre × 100 div',
    nearB(divV, state.S.UV / state.VOLT_CALS[state.S.voltCal] * 100, 1e-9),
    divV.toFixed(1) + ' div pour ' + state.S.UV.toFixed(3) + ' V');
chk('aiguille A : déviation = I / calibre × 100 div',
    nearB(divA, state.S.IA * 1000 / state.AMP_CALS[state.S.ammCal] * 100, 1e-9),
    divA.toFixed(1) + ' div pour ' + (state.S.IA * 1000).toFixed(2) + ' mA');

/* animation : le ressort amorti converge vers la division cible */
state.ctx.voltPivot.userData.div = 0; state.ctx.voltPivot.userData.vel = 0;
for (let i = 0; i < 240; i++) displays.animateMeters(1 / 60);
chk("l'aiguille se stabilise sur la division cible (ressort amorti)",
    nearB(state.ctx.voltPivot.userData.div, divV, 1e-3) &&
    nearB(state.ctx.voltPivot.rotation.z, 1.24 * (0.5 - divV / 100), 1e-3),
    state.ctx.voltPivot.userData.div.toFixed(2) + ' div');

/* recopie : on écrit ce que MONTRE l'aiguille (demi-division), pas la vérité du solveur */
hud.rows.length = 0;
hud.openPaper(true);
hud.addReadingFromInstruments();
hud.openPaper(false);
const rowB = hud.rows[hud.rows.length - 1];
const UB = parseFloat(rowB.U.replace(',', '.')), IB = parseFloat(rowB.I.replace(',', '.'));
const qU = state.VOLT_CALS[state.S.voltCal] / 200, qI = state.AMP_CALS[state.S.ammCal] / 200;   // ± demi-division
chk('recopie : U = lecture de l\u2019aiguille (± demi-division)', nearB(UB, state.S.UV, qU + 1e-9),
    rowB.U + ' V pour ' + state.S.UV.toFixed(3) + ' V');
chk('recopie : I = lecture de l\u2019aiguille (± demi-division)', nearB(IB, state.S.IA * 1000, qI + 1e-9),
    rowB.I + ' mA pour ' + (state.S.IA * 1000).toFixed(2) + ' mA');
chk('recopie : R = U/I calculé depuis les lectures',
    nearB(parseFloat(rowB.R.replace(',', '.')), UB / (IB / 1000), 0.02), rowB.R + ' Ω');

/* surcharge : le seuil suit le calibre choisi */
state.S.ammCal = 0;                       // 1 mA : le courant réel dépasse largement
evB();
displays.updateDisplays();
chk('surcharge détectée quand le calibre est trop petit', state.S.overload === true);
chk("l'aiguille bute en fin de course (106 div) et le voyant OL s'allume",
    nearB(state.ctx.ammPivot.userData.divTarget, 106, 1e-6) && state.ctx.ammOL.emissiveIntensity > 0,
    state.ctx.ammPivot.userData.divTarget.toFixed(1) + ' div');
hud.rows.length = 0;
hud.openPaper(true); hud.addReadingFromInstruments(); hud.openPaper(false);
chk('surcharge : la recopie est refusée', hud.rows.length === 0);
state.S.ammCal = 3; evB();
chk('remonter d\u2019un calibre supprime la surcharge', state.S.overload === false);

/* nettoyage : générateur éteint, plus de fils */
clrB(); state.S.genOn = false; state.S.setV = 0; evB();
displays.updateDisplays();

/* graphe de Bode de la feuille : jamais la courbe théorique (elle révélerait fc) */
hud.drawBodeDiagram();
const bodeCalls = JSON.stringify(document.getElementById('bodeCanvas').__calls || []);
chk('Bode : la feuille n\u2019imprime ni courbe théorique ni asymptotes',
    !bodeCalls.includes('#2563eb') && !bodeCalls.includes('#059669'));
chk('Bode : la légende rappelle la méthode de lecture', bodeCalls.includes('Vos points mesurés'));

/* ============================ OHMIE (vague 5) ============================ */
const robot = await import('../js/robot.js');
const tutor = await import('../js/tutor.js');

/* ---- présence et construction ---- */
chk('ctx.robot construit et nommé « Ohmie »',
    state.ctx.robot && state.ctx.robot.name === 'Ohmie'
    && state.ctx.scene.children.includes(state.ctx.robot));
const rpos = state.ctx.robot.position;
chk('Ohmie démarre au bord de la table, près de la hauteur des yeux',
    Math.hypot(rpos.x, rpos.z) > state.TABLE_R
    && rpos.y > state.EYE_STAND - .3 && rpos.y < state.EYE_STAND + .6,
    `r=${Math.hypot(rpos.x, rpos.z).toFixed(2)} y=${rpos.y.toFixed(2)}`);

/* ---- vol borné : 12 s de simulation, waypoints très rapprochés ---- */
let rMax = 0, yMin = 9, yMax = 0, travelled = 0;
let px = state.ctx.robot.position.x, pz = state.ctx.robot.position.z;
for (let i = 0; i < 240; i++) {
    robot.updateRobot(.05, i * .05);
    const p = state.ctx.robot.position;
    const r = Math.hypot(p.x, p.z);
    rMax = Math.max(rMax, r); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    travelled += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z;
}
chk('vol borné : jamais au-delà de l\'anneau, à hauteur du regard',
    rMax < state.TABLE_R + 1.15 && yMin > .8 && yMax < 2.45,
    `rMax=${rMax.toFixed(2)} y∈[${yMin.toFixed(2)},${yMax.toFixed(2)}]`);
chk('vol continu : Ohmie se déplace vraiment (jamais statique)', travelled > .15,
    travelled.toFixed(2) + ' m parcourus');

/* ---- parole : bulle Roblox unique, troncature, humeur, laser ---- */
robot.robotSay('Branche le voltmètre aux bornes de la résistance, puis lis la valeur.');
const sprs1 = state.ctx.robot.children.filter(o => o.isSprite).length;
robot.robotSay('x'.repeat(400));
const sprs2 = state.ctx.robot.children.filter(o => o.isSprite).length;
chk('bulle 3D : une seule à la fois, texte long accepté', sprs1 === 1 && sprs2 === 1);
chk('robotMood ne casse rien', (robot.robotMood('o_O', 500), true));
chk('laser : sait viser un appareil cité dans la réponse',
    robot.robotPointDevice('Tourne le rhéostat doucement') === true);
chk('laser : texte sans appareil -> pas de visée',
    robot.robotPointDevice('bonjour') === false);

/* ---- clé du document pédagogique selon le niveau ---- */
state.S.activeTP = 1; state.S.level = 'B';
chk('docKey TP1 B', tutor.tutorDocKey() === 'tp1_B', tutor.tutorDocKey());
state.S.level = 'A';
chk('docKey TP1 A', tutor.tutorDocKey() === 'tp1_A');
state.S.activeTP = 2; state.S.tp2Filter = 'CR';
chk('docKey TP2 CR', tutor.tutorDocKey() === 'tp2_cr');
state.S.tp2Filter = 'RC-CR';
chk('docKey TP2 bande', tutor.tutorDocKey() === 'tp2_bande');
state.S.tp2Filter = 'RC';
chk('docKey TP2 RC', tutor.tutorDocKey() === 'tp2_rc');
state.S.activeTP = 3; state.S.tp3.level = 4;
chk('docKey TP3 manip 4', tutor.tutorDocKey() === 'tp3_4');
state.S.tp3.level = 9;
chk('docKey TP3 borné à tp3_5', tutor.tutorDocKey() === 'tp3_5');
state.S.tp3.level = 1; state.S.activeTP = 1; state.S.level = 'B';

/* ---- contexte envoyé au modèle : forme attendue ---- */
const c = tutor.buildTutorContext();
chk('contexte : tp, câblage, missions, multimètres présents',
    c.tp === 1 && Array.isArray(c.cablage) && Array.isArray(c.missions)
    && c.multimetres && typeof c.multimetres.calibre_V === 'number'
    && c.feuille && typeof c.feuille.lignes === 'number',
    JSON.stringify(Object.keys(c)));
chk('contexte : les missions viennent du HUD (fait/pas fait, sans théorie)',
    c.missions.every(m => typeof m.ok === 'boolean' && typeof m.t === 'string'),
    c.missions.length + ' mission(s)');

/* ---- interface : dock, grande fenêtre, garde-fous locaux ---- */
tutor.tutorToggle(true);
chk('le dock s\'ouvre (classe hiddenx retirée)',
    !document.getElementById('tutorDock').classList.contains('hiddenx'));
tutor.tutorModal(true);
chk('la grande fenêtre s\'ouvre',
    !document.getElementById('tutorModal').classList.contains('hiddenx'));
tutor.tutorModal(false); tutor.tutorToggle(false);
chk('tout se referme',
    document.getElementById('tutorDock').classList.contains('hiddenx')
    && document.getElementById('tutorModal').classList.contains('hiddenx'));
const nBefore = document.getElementById('tdBody').children.length;
await tutor.tutorAsk('a');                       // trop court : refus LOCAL, pas de fetch
chk('question trop courte : refus amical affiché, aucune requête réseau',
    document.getElementById('tdBody').children.length === nBefore + 1);
await tutor.tutorAsk('!!! ???');                 // signes seuls : refus local aussi
chk('signes seuls : refus amical affiché',
    document.getElementById('tdBody').children.length === nBefore + 2);
chk('isTutorTypingTarget : faux quand rien n\'est saisi',
    tutor.isTutorTypingTarget() === false);

/* ---- le robot ne doit jamais figer la boucle de jeu ---- */
robot.updateRobot(.05, 99);
chk('updateRobot reste sûr après la conversation', true);

console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
