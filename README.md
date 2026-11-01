# LaboPhysique 3D — trois TP d'électricité en 3D

Laboratoire de physique en 3D (Three.js), **jouable en solo**, qui reprend le
fascicule de TP *Circuits électriques* (Université Hassan II, Physique S3) :

| TP | Titre | Contenu |
| -- | ----- | ------- |
| **TP 1** | Mesure de résistances | niveau **A** : loi d'Ohm, montages **amont / aval** ; niveau **B** : **pont de Wheatstone** |
| **TP 2** | Réponse fréquentielle | filtres **RC** (passe-bas), **CR** (passe-haut) et **RC-CR** (passe-bande), relevé de Bode à l'oscilloscope bicanal |
| **TP 3** | Vérification des théorèmes électrocinétiques | **5 manipulations** : mesures initiales, **Millman**, **superposition**, **Thévenin**, **Norton** |

Le multijoueur a été **retiré** : le client démarre toujours en solo, aucun
personnage n'est créé et aucun serveur n'est contacté.

Deux postes de travail :

* une **paillasse circulaire** au centre de la pièce, avec les appareils disposés
  **en couronne**, face avant tournée vers le centre (seules les cartes plates —
  pont de Wheatstone, maquettes du TP 2 et du TP 3 — restent posées au milieu) ;
* un **bureau carré à droite** portant la **feuille de relevés** et son **stylo
  noir** : un clic gauche dessus ouvre la fenêtre « papier » (police manuscrite),
  avec le **formulaire du TP actif, vide, à remplir à la main**.

Les appareils se **déplacent** à l'appui long, se **tournent** à la molette, et
**ne tombent jamais** : lâchés au-dessus du vide, ils reviennent se poser sur le
mobilier. Tous les fils branchés sur un appareil sont débranchés quand on le saisit.

---

## 1. Démarrer

```bash
cd labo3d
python3 server.py            # sert les fichiers sur http://localhost:8000/
```

**`server.py` est recommandé** : c'est lui qui relaie les questions au robot
tuteur « Ohmie » (`POST /tutor`, clé API côté serveur — voir § 9). Un serveur
purement statique (`python3 -m http.server 8000`) fait tourner tout le jeu,
mais Ohmie restera muet.
Le relais multijoueur de `server.py` n'est plus utilisé par le client.

Dépendances côté navigateur (CDN, chargées par `index.html`) : Three.js 0.160,
Lucide (icônes), polices Space Grotesk / JetBrains Mono / Caveat.
Côté serveur : **Python 3.8+ standard, rien à installer**.

---

## 2. Les trois TP

### TP 1 — Mesure de résistances

* **Niveau A** : alimentation stabilisée 0–15 V / 2 A, **voltmètre** et
  **ampèremètre** **analogiques** (cadran 100 divisions, miroir anti-parallaxe,
  classe 1,5, sélecteur de calibre 5 positions), **résistance bobinée** ≈ 100 Ω.
  L'élève câble la boucle série, choisit le montage **amont** ou **aval**, choisit
  le **calibre** (on commence au plus grand), **lit l'aiguille**
  (g = N div × C/100, Δg = 1,5 × C/100) et reporte U et I sur sa feuille.
* **Niveau B** : **pont de Wheatstone** (maquette plate, schéma sérigraphié) + **boîte à décades**
  (tambours chiffrés mécaniques) + **galvanomètre à zéro central** avec bande de
  miroir. L'élève équilibre le pont et en déduit `Rx = (R2/R1)·Rv`.
* Le **générateur est toujours livré éteint et à 0 V**, et il est remis à zéro à
  chaque changement de niveau.

### TP 2 — Réponse fréquentielle

* **GBF** (10 Hz – 100 kHz, 0,5 – 10 V), **oscilloscope bicanal** avec écran
  vectoriel (grille, déclenchement, OSD, `AUTOSET`), **maquette de filtres**
  dont la sérigraphie change selon le filtre choisi.
* Valeurs du fascicule : `R1 = R2 = 2,2 kΩ`, `C1 = 22 nF`, `C2 = 220 nF`,
  `Ue = 6 V` ⇒ `fc(RC) = fc(CR) ≈ 3288 Hz`, passe-bande `fc1 ≈ 329 Hz`,
  `fc2 ≈ 3288 Hz`, plateau ≈ `−0,83 dB`.
* **Réalisme des sondes** (c'était le défaut signalé) : une voie n'affiche
  **rien** tant que sa **pointe et sa masse** ne sont pas raccordées. Les masses
  des deux voies sont **liées entre elles** dans l'appareil — les relier à deux
  points différents du montage crée un vrai court-circuit, signalé. Le gain
  « mesuré » n'existe que si les deux voies mesurent réellement ; sinon la
  feuille n'a rien à recopier.
* La feuille propose les **tables 6, 7 et 8** du fascicule et un **papier
  semi-logarithmique** (asymptotes, courbe théorique, points expérimentaux).

### TP 3 — Vérification des théorèmes électrocinétiques

Matériel (tout est modélisé) : **deux alimentations de paillasse** E₁ = 12 V et
E₂ = 6 V (afficheur tension/courant, voyants **CV/CC**, interrupteur à bascule,
réglage de la limitation de courant), un **rhéostat 230 Ω – 1,5 A** à curseur,
une **maquette de résistances** (panneau plat : R₁ = 290 Ω, R₂ = 180 Ω,
R = 150 Ω **dessinés** entre leurs douilles, **barrettes de jonction A₁…A₄ et
B₁…B₄**, place des générateurs repérée), plus le **voltmètre** et
l'**ampèremètre** du TP 1 (matériel commun).

Les **cinq manipulations** du fascicule sont les cinq onglets du TP 3 :

1. **Mesures initiales** — branche R retirée : `V₀` entre A et B (tension de
   Thévenin), puis `I₀` avec l'ampèremètre entre A et B (courant de Norton) ;
2. **Millman** — R remis en place : `V_M` à ses bornes, `I_R` mesuré avec
   l'ampèremètre **en série**, comparaison avec `V_M / R` ;
3. **Superposition** — un seul générateur à la fois, l'autre **éteint et
   remplacé par un fil** entre ses bornes : `I₁`, `I₂`, puis `I_total = I₁ + I₂` ;
4. **Thévenin** — `R_Th = V₀/I₀` réglé au **rhéostat**, `E_Th = V₀` réglé sur une
   alimentation, montage série `E_Th → R_Th → R`, mesure de `I_Th` ;
5. **Norton** — rhéostat sur `R_No = R_Th`, une alimentation **en mode CC**
   réglée sur `I₀`, montage **parallèle** `I_No // R_No // R`, mesure de `I_No`.

Ordres de grandeur attendus (à titre de vérification pour l'enseignant — le jeu
ne les affiche **jamais**) : `V₀ = 8,298 V`, `I₀ = 74,71 mA`,
`R_Th = R_No = 111,06 Ω`, `V_M = 4,768 V`, `I_R = 31,78 mA`, `I₁ = 17,60 mA`,
`I₂ = 14,18 mA`.

**Comment la validation est faite** : le solveur compare toujours les mesures de
l'élève **entre elles** (`I_Th` contre le `I_R` mesuré en manipulation 2,
`R_Th = V₀/I₀` avec **ses** V₀ et I₀), jamais à la théorie. Les valeurs
théoriques ne servent qu'aux incertitudes et au contrôle **à la demande**
(bouton « Contrôler » de la feuille).

La feuille donne la **table 9 imprimée** (Manip. / Grandeur mesurée / Valeur /
Incertitude) plus un **aide-mémoire** (données, Millman, superposition,
Thévenin, Norton, méthode des incertitudes `Δg = Σ|∂g/∂p|·Δp`).

---

## 3. Physique et garde-fous

* **Solveur continu générique** (analyse nodale modifiée) pour le TP 3 : il résout
  **n'importe quel câblage**, y compris fautif, à partir des bornes réellement
  reliées par des fils (`js/tp3_solver.js`).
* **Appareils non idéaux** : ampèremètre `1 Ω`, voltmètre `10 MΩ`, sortie GBF
  `50 Ω` — les écarts de mesure sont ceux qu'un élève trouve en vrai.
* **Alimentations réelles** : mode **CV** (tension imposée) et mode **CC**
  (courant imposé = source de Norton) ; dépassement de la consigne ⇒ bascule
  **automatique** en CC ; en CC à vide ⇒ **tension de conformité** dépassée
  (18 V) et alarme ; **éteinte, une alimentation est un circuit OUVERT** (relais),
  pas un court-circuit.
* **Protections et alarmes** : court-circuit aux bornes d'un générateur (coupure +
  afficheur `SC !!`), A et B reliés par un fil, **surcharge de l'ampèremètre**
  (calibre 200 mA, afficheur `O L` + bip), **rhéostat qui chauffe** au-delà de
  90 % de son courant maximal.
* **Objectifs « acquis »** : un objectif validé reste coché. Certains gestes sont
  forcément transitoires (E₁ seul puis E₂ seul, en superposition) : la liste ne
  repasse donc pas au gris.
* Rien n'est jamais « déjà prêt » : générateurs **éteints**, banc **décâblé** à
  chaque changement de TP, de niveau ou de manipulation. Les **mesures déjà
  faites sont conservées** (les manipulations 4 et 5 s'appuient sur V₀ et I₀).

---

## 4. Poste de travail : maquettes, éclairage, clavier

### Des cartes plates, comme dans un vrai laboratoire

Une carte de TP est un **panneau stratifié clair** qui ne porte **rien en relief
hors les douilles banane** : les dipôles sont **dessinés** (symboles
normalisés) là où l'élève les câblerait. La sérigraphie est calculée avec les
**mêmes cotes** que les douilles posées en 3D (`boardMapper()` de
`js/textures.js`), dans le bon sens : le bord du **fond** de la table est le
**haut** du dessin, chaque cercle imprimé tombe exactement sous sa douille.

| Carte | Sérigraphie |
| ----- | ----------- |
| **Pont de Wheatstone** (TP 1, niveau B) | losange **P⁺ / P⁻ / M1 / M2**, bras `R1`, `R2`, `Rx` dessinés ; bras **Rv** (boîte à décades) et diagonale du **galvanomètre** en pointillés = à câbler ; formule d'équilibre |
| **Maquette de filtres** (TP 2) | schéma du filtre actif (**RC**, **CR** ou **RC-CR**) avec `R1`/`R2` et `C1`/`C2` dessinés, **rail de masse commun**, valeurs et fréquences de coupure ; **redessinée** à chaque changement d'onglet |
| **Maquette résistances** (TP 3) | barrettes **A** (A1…A4) et **B** (B1…B4) = les deux nœuds, **trois branches** `R1 = 290 Ω`, `R2 = 180 Ω`, `R = 150 Ω` dessinées, place des générateurs **E₁ / E₂** marquée, **A4 / B4** réservés à la mesure de `V₀` et `I₀` |

Tout ce que l'élève doit câbler est en **pointillés** : un trait plein
signifierait une liaison interne de la carte. Les composants en 3D (résistances
bobinées, condensateur) ont **disparu** des cartes : ils masquaient la
sérigraphie et rendaient le schéma du TP 3 illisible.

### Éclairage : plus de tache blanche, des façades lisibles

* le projecteur est **très ouvert** (cône de 132°, **pénombre totale**,
  décroissance physique en `1/d²`) : l'éclairement est quasi uniforme d'un bord
  à l'autre de la paillasse, au lieu d'un disque blanc au centre ;
* le **plateau est mat** (`roughness` 0,84) : c'est son reflet spéculaire qui
  faisait la zone blanche ;
* une **lumière de façade** est placée **sur l'axe** de la table, à 2,05 m : les
  faces avant des appareils étant toutes tournées vers le centre, elle les
  éclaire de plein fouet sans créer de point chaud sur le plateau ;
* les **sérigraphies s'auto-éclairent légèrement** (`emissiveMap`) : légendes,
  graduations et repères restent lisibles même en ambiance « Veillée », et cet
  appoint **diminue tout seul** quand la pièce est plus claire ;
* les boîtiers ne sont plus d'un noir absolu (tôle **peinte**, peu métallique) :
  vis, joints, index et graduations réapparaissent.

### Le clavier du jeu ne fuit plus vers le navigateur

`Maj` (courir), `Ctrl` (s'accroupir), `E` (loupe) et la molette (réglages) sont
**consommés par le jeu**, avec ou sans modificateur : `Maj + E`, `Ctrl + E` et
surtout **`Ctrl` + molette** ne déclenchent plus le zoom du navigateur (celui qui
rétrécissait tout à l'écran). Restent libres : `Ctrl + R`, `F5`, `F12`. **Rien
n'est intercepté quand un champ de saisie du HUD a le focus** (sinon impossible
de taper `112` dans « R_Th calculé »), et `Ctrl` + molette garde son
défilement au-dessus des panneaux de l'interface.

**Il n'y a plus de raccourci clavier pour changer de niveau** : les touches
`1` / `2` affichaient les bancs du TP 1 **par-dessus** le matériel du TP 2 ou du
TP 3. Les niveaux A / B se changent **uniquement** par leurs onglets, et
`setLevel()` **refuse** d'agir quand le TP actif n'est pas le TP 1.

### On peut se serrer contre la paillasse

La marge du corps devant le bord n'est plus que de **6 cm** (au lieu de 20 cm)
et tombe à **0** quand on est accroupi : on peut se pencher au-dessus des
appareils pour lire un afficheur ou enfiler un fil sur une douille.

### Mesurer, pas lire : des écrans qui ne donnent jamais la réponse

Le fascicule demande à l'élève de **mesurer** chaque grandeur : si un écran
l'affiche à sa place, l'exercice disparaît.  Aussi :

* le **GBF** n'affiche que la **fréquence** — l'amplitude est un bouton aveugle,
  et Ue se **mesure sur CH1 de l'oscilloscope** (N div × V/DIV, tables 6–8 du
  fascicule) ;
* l'**oscilloscope** n'affiche **aucune mesure automatique** : ni Vpp par voie,
  ni fréquence, ni Δφ.  Restent la grille, les traces, les repères de masse,
  les **calibres V/DIV et TIME/DIV**, l'état du déclenchement (`TRIG'D`) et un
  rappel de la méthode (« compter les divisions ») ;
* le **voltmètre** et l'**ampèremètre** sont **analogiques** : cadran
  100 divisions, bande de miroir anti-parallaxe, classe 1,5, résistance interne
  imprimée (R_V = 10 MΩ, R_A = 1 Ω — analyse amont/aval), **sélecteur de
  calibre fonctionnel** à 5 positions (0,3/1/3/10/30 V et 1/10/30/100/300 mA) ;
  au-delà du calibre l'aiguille **bute** en fin de course et le voyant **OL**
  s'allume : il faut monter d'un calibre ;
* les **maquettes** (TP 1, 2, 3) n'impriment que les **valeurs des composants**,
  le schéma et le nom des prises : **aucune réponse précalculée** (fc, f₀…
  restent à calculer puis à mesurer) ;
* le **graphe de Bode** de la feuille ne trace que **les points de l'élève** (et
  la courbe qui les relie) — jamais la courbe théorique, qui révélerait fc ;
* le **HUD** (pastilles, ligne d'état) ne montre que des **réglages** (consigne,
  décades, calibres, états des alimentations) : jamais U, I, Vg, Ue ni le gain ;
* « Recopier mesure » recopie la **lecture de l'aiguille** (à la demi-division
  près) : l'erreur de lecture fait partie de l'exercice et alimente les
  incertitudes de la table 9.

---

## 5. Contrôles

| Action | Commande |
| ------ | -------- |
| Se déplacer autour de la paillasse | `Z Q S D` / `W A S D` / flèches |
| Regarder | souris (pointer lock) |
| Loupe (zoom ×2,6) | `E`, ou molette **quand aucun objet n'est saisi** |
| Se pencher / s'accroupir (on vient alors **au ras** du bord de la paillasse) | `Ctrl` (maintenu) |
| Câbler | clic sur une borne, puis clic sur une autre |
| Annuler un fil en cours / retirer un fil | clic droit / clic sur le fil |
| **Régler un bouton** (tension, courant, rhéostat, GBF, calibres) | **clic gauche** = un pas · **clic droit** = un pas en arrière · **molette** = pas fin · **`Maj` + clic** = pas grossier |
| Interrupteurs (générateurs, GBF) / bouton **CV–CC** | clic gauche |
| **Déplacer un appareil, la feuille ou le stylo** | **appui long (~0,3 s)** puis viser |
| **Faire tourner l'objet saisi** | **molette** (7,5° par cran) |
| **Rotation rapide de l'objet saisi** | **bouton droit maintenu** + molette (×3,7) |
| Ouvrir / reprendre une **feuille de relevés** | clic gauche sur le **papier** ou le **stylo** |
| Changer de **TP** | boutons **TP 1 / TP 2 / TP 3** en haut à gauche |
| Changer de **niveau** (TP 1) ou de **filtre** (TP 2) | **onglets uniquement** — aucun raccourci clavier (`1`/`2` mélangeaient les bancs) |
| Changer de **manipulation** (TP 3) | onglets `1 · V₀, I₀` … `5 · Norton` |
| Régler l'**éclairage** de la salle | bouton **soleil** en bas à droite |
| Ouvrir / fermer le **robot tuteur Ohmie** | `T` ou bouton **🤖 T** en bas à gauche |
| Conversation complète d'Ohmie | bouton **⤢** du dock (grande fenêtre centrée) |
| Remettre les appareils à leur place | `Maj` + `R` |
| Libérer la souris / fermer une fenêtre | `Échap` |

Le panneau « raccourcis clavier » a été **supprimé** de l'interface : les aides
contextuelles (infobulle au centre, pastilles d'état, messages) suffisent.
Toutes les combinaisons ci-dessus sont **interceptées** par le jeu (voir § 4) :
aucun raccourci du navigateur ne part pendant la partie.

---

## 6. Arborescence

```
labo3d/
├── index.html              structure + HUD (aucun style en ligne) + dock du tuteur
├── server.py               serveur statique + relais du tuteur IA (POST /tutor,
│                           quotas, clé Groq côté serveur — voir § 9)
├── tutor_docs/             contexte pédagogique envoyé au modèle (SERVEUR SEUL :
│   ├── systeme.md           jamais servi au navigateur, /tutor_docs → 404)
│   ├── labo.md              persona d'Ohmie + règles de refus (systeme.md) ;
│   ├── tp1_A.md  tp1_B.md   description permanente du laboratoire (labo.md) ;
│   ├── tp2_rc.md tp2_cr.md  une fiche par sous-niveau : objectifs, méthode,
│   ├── tp2_bande.md          pièges, missions — sans AUCUNE valeur numérique
│   └── tp3_1.md … tp3_5.md  qui dispenserait de faire les mesures
├── css/
│   └── style.css           verre dépoli, viseur, feuille « papier », tables 6 à 9,
│                           dock + grande fenêtre du tuteur
├── js/
│   ├── main.js             orchestrateur : montage des modules, bascule des TP, boucle
│   ├── state.js            état de simulation S (TP 1, TP 2, TP 3), registres, ctx
│   ├── audio.js            synthétiseur Web Audio (clics, clacs, crans, alertes)
│   ├── textures.js         textures procédurales + LCD + sprites
│   ├── environment.js      pièce, table ronde, bureau, papier, stylo, poussière
│   ├── instruments.js      TP 1 : alimentation, multimètres (COMMUNS), bloc R,
│   │                       décades, galvanomètre, pont + helpers de pose
│   ├── instruments_tp2.js  TP 2 : GBF, oscilloscope, maquette de filtres
│   ├── instruments_tp3.js  TP 3 : 2 alimentations, rhéostat, maquette résistances
│   ├── wiring.js           fils bananes (chaînette), aperçu, débranchement auto
│   ├── circuit.js          union-find, solveur MNA du TP 1, aiguillage vers les TP 2/3
│   ├── ac_solver.js        TP 2 : fonctions de transfert, câblage réel des sondes
│   ├── oscilloscope.js     TP 2 : écran vectoriel bicanal, calibres, AUTOSET
│   ├── tp3_solver.js       TP 3 : MNA continu, topologie, mesures, incertitudes, objectifs
│   ├── displays.js         afficheurs et organes mobiles des trois TP
│   ├── hud.js              toasts, pastilles, objectifs, FEUILLE DE RELEVÉS, CSV
│   ├── drag.js             appui long → déplacement + rotation, sans chute
│   ├── quality.js          presets graphiques appliqués à chaud
│   ├── lighting.js         ambiances d'éclairage + curseur d'intensité
│   ├── player.js           FPS : pointer lock, ZQSD/WASD, collisions, zoom, réglages
│   ├── robot.js            OHMIE : maillage corail, visage-écran à humeurs, vol
│   │                       aléatoire, laser, bulle Roblox (buildRobot, updateRobot,
│   │                       robotSay, robotMood, robotPointDevice)
│   ├── tutor.js            discussion avec Ohmie : dock/fenêtre, contexte du banc,
│   │                       POST /tutor, voix fr-FR, quota (initTutor, tutorAsk,
│   │                       buildTutorContext, tutorDocKey, tutorToggle, tutorModal)
│   ├── avatar.js           personnages simples (inactifs en solo)
│   └── net.js              client réseau (inactif : le mode solo est imposé)
└── tests/
    ├── run_tests.py         lance les 8 suites headless (324 assertions)
    ├── test_circuit.mjs     solveur du TP 1 (30)
    ├── test_env.mjs         surfaces d'appui : table ronde / bureau / sol (7)
    ├── test_scene.mjs       scène, couronne, aplomb, matériel des 3 TP (36)
    ├── test_boot.mjs        exécute le vrai js/main.js sur un DOM factice (103,
    │                        dont 26 pour Ohmie : vol borné, bulle, laser, docKey,
    │                        contexte, dock, garde-fous locaux)
    ├── test_ac_solver.mjs   harmoniques du TP 2 : fc, gains, phases, Bode
    ├── test_oscilloscope.mjs rendu de l'écran : sondes en l'air ⇒ aucun signal
    ├── test_tp2_probes.mjs  TP 2 câblé de bout en bout, voie par voie (28)
    ├── test_tp3_solver.mjs  TP 3 : les 5 manipulations rejouées (110)
    ├── test_server.py       serveur HTTP/WebSocket + tuteur sans clé (à part, 29)
    ├── extents.mjs          mesure l'encombrement réel d'un objet 3D (aplomb)
    ├── domstub.mjs          DOM/canvas/localStorage/WebSocket factices
    ├── lint.mjs             analyse statique (acorn) : imports/exports, identifiants
    └── three-stub/          module « three » minimal pour Node (aucun npm install)
```

---

## 7. Tests

```bash
python3 tests/run_tests.py       # 8 suites, 324 assertions, sans navigateur
python3 tests/test_server.py     # serveur + relais tuteur SANS clé (29 assertions)
node tests/lint.mjs              # 0 identifiant non déclaré, 0 import cassé
```

Les tests du tuteur n'appellent **jamais** l'API Groq : le serveur de test est
lancé sans clé (`GROQ_API_KEY` retirée, `LABO_TUTOR_DIR` dans un dossier
temporaire), ce qui vérifie au passage les réponses amicales 400 / 413 / 503.

* **solveur TP 1** (30) : loi d'Ohm, montages amont/aval, court-circuit,
  surcharge, pont équilibré/déséquilibré, générateur éteint ;
* **surfaces d'appui** (7) : table ronde, bureau tourné, sol ;
* **scène et poste de travail** (43) : tout est rattaché à la scène, couronne face
  au centre (cartes plates exceptées), **aplomb mesuré au millimètre**, tailles
  réalistes, bureau/feuille à droite, **éclairage** (projecteur ouvert + pénombre
  totale, lumière de façade sur l'axe, 4 ambiances monotones, sérigraphies
  auto-lumineuses), **cartes de TP plates** (rien en relief hors les douilles),
  **cercle sérigraphié exactement sous chaque douille** et **schéma à
  l'endroit** (le fond de la table est le haut du dessin),
  **14 douilles du TP 3 en 4 colonnes × 4 rangées**, **matériel des trois TP
  présent et masqué hors du TP actif**, bornes du TP 3 (21), voltmètre et
  ampèremètre dans un **groupe commun** ;
* **exécution du vrai `js/main.js`** (77) : registres des trois TP, feuille de
  relevés manuelle, nouvelle feuille / feuille précédente, **mode solo imposé**,
  rotation 7,5° et ×3,7, **aucune chute**, bascule vers le TP 3, table 9,
  **clavier** (touches `1`/`2` supprimées, `setLevel` refusé hors TP 1,
  `Maj`/`Ctrl` + `E` avalés, `Ctrl` + molette bloqué, `Ctrl + R`/`F5`/`F12`
  préservés, champs de saisie non interceptés, marge de 6 cm au bord),
  **appareils à aiguille** (sélecteur de calibre borné et suivi par le bouton,
  déviation = valeur/calibre × 100 div, ressort amorti, recopie à la
  demi-division, surcharge = aiguille à 106 div + voyant OL, seuil dépendant
  du calibre) ;
* **harmoniques TP 2** : `fc ≈ 3288 Hz`, `−3,01 dB` et `∓45°` à la coupure,
  passe-bande `fc1 ≈ 329 Hz`, courbe de Bode ;
* **écran de l'oscilloscope** : **sondes en l'air ⇒ « AUCUNE SONDE RACCORDÉE »,
  `NO SIG` sur les deux voies, aucune amplitude inventée** ; sondes raccordées ⇒
  grille + traces + calibres V/DIV et TIME/DIV + `TRIG'D`, et **aucune mesure
  automatique** (ni `1:Vpp`, ni `2:Vpp`, ni `f=`, ni `Δφ=`) ; **écran du GBF :
  fréquence seule** (ni `Ue =`, ni `Veff`) ;
* **TP 2 câblé** (28) : filtre alimenté mais sondes en l'air, une seule sonde,
  les deux sondes (gain mesuré = théorie à fc), GBF éteint, pointe et masse au
  même point, sortie court-circuitée, masses des voies à des potentiels
  différents, court-circuit du GBF, et les **trois filtres** du fascicule ;
* **TP 3** (110) : solveur MNA générique, **valeurs théoriques exactes**
  (V₀, I₀, R_Th, V_M, I_R, I₁, I₂, superposition, Thévenin, Norton), incertitudes
  propagées, puis les **cinq manipulations rejouées avec les vrais boutons**
  (interrupteurs, boutons de tension, mode CC, rhéostat), détection topologique,
  garde-fous (circuit ouvert, court-circuit, surcharge, conformité, rhéostat),
  afficheurs et organes mobiles, table 9 et contrôles de calcul.

Le serveur se teste à part :

```bash
python3 tests/test_server.py     # 20 assertions
```

---

## 8. Dépannage

| Symptôme | Cause / solution |
| -------- | ---------------- |
| Aucune figurine, aucune pastille réseau | Normal : le jeu est **solo** (le multijoueur a été retiré). |
| Rien ne s'affiche sur l'oscilloscope | Les **sondes** ne sont pas raccordées : pointe sur `IN+`/`OUT+`, masse sur la masse du montage. Un rappel l'explique à l'écran. |
| Le GBF ne commande pas le filtre | Sa sortie doit arriver sur **`IN+`** et sa masse sur la **masse commune** de la maquette. |
| Une alimentation du TP 3 affiche `PROT` / passe en `CC` | La limitation de courant est atteinte : c'est le comportement réel. Coupez, vérifiez le câblage (un court-circuit ?), remontez la consigne. |
| `O L` sur l'ampèremètre + bip | Calibre 200 mA dépassé : coupez vite et câblez l'ampèremètre **en série**, jamais en parallèle. |
| En superposition, éteindre un générateur ne suffit pas | Il faut aussi le **remplacer par un fil** entre ses bornes : éteint, sa sortie est **ouverte**. |
| La table 9 refuse « Ajouter ligne » | C'est un formulaire **imprimé** : complétez les cases Valeur et Incertitude. |
| Le bouton « Contrôler » ne répond pas | Il vérifie **vos** mesures : écrivez d'abord V₀ et I₀ (manipulation 1) sur la feuille. |
| La salle est trop sombre / trop claire | Bouton **soleil** en bas à droite : 4 ambiances + curseur d'intensité. Aucune ne fait de tache blanche sur la paillasse. |
| Tout est **petit** à l'écran | C'est le zoom du **navigateur** (il reste mémorisé d'une session à l'autre) : `Ctrl + 0` remet 100 %. Le jeu intercepte désormais `Ctrl` + molette et `Ctrl`/`Maj` + `E`. |
| Je suis trop loin des appareils | Avancez jusqu'au bord : il ne reste que **6 cm** de marge, et **0** en s'accroupissant (`Ctrl`). La loupe (`E`) finit le travail. |
| Les bancs d'un autre TP apparaissent sur la table | Impossible désormais : il n'y a plus de raccourci clavier de niveau, et les onglets A / B ne répondent qu'au TP 1. Revenez au TP voulu avec **TP 1 / TP 2 / TP 3**. |
| Un appareil ne reste pas où je le pose | Il dépasse du plateau : rapprochez-le du centre de la paillasse. |
| `port 8000 indisponible` | `python3 server.py --port 8002`. |
| Ohmie répond « la clé API n'est pas configurée » | Normal sans clé : voir § 9 (30 s de configuration). Le jeu, lui, tourne parfaitement sans tuteur. |
| Ohmie répond « laisse-moi respirer » / « quota atteint » | Limites du palier gratuit Groq (30 req/min, 8 000 jetons/min, 1 000 req/jour, 200 000 jetons/jour). Le compteur en bas du dock affiche le pourcentage du jour (rouge ≥ 80 %). |
| La réponse d'Ohmie met du temps / échoue | Erreur réseau ou API : un message **amical** s'affiche, jamais d'erreur technique brute. Réessayez. |
| Écran noir / rien ne se charge | Les CDN (Three.js, Lucide, polices) sont injoignables : vérifiez l'accès réseau. |
| La souris ne répond pas | Cliquez dans la vue pour reprendre le pointer lock (`Échap` le libère). |
| Images saccadées | Qualité « Basse » ou « Moyenne » en bas à droite (choix mémorisé). |

---

## 9. Robot tuteur « Ohmie » (IA)

**Ohmie** est un petit robot corail qui vole autour de la paillasse, à hauteur
du regard. Ce n'est **ni un chatbot généraliste, ni un solveur automatique, ni
un manuel à pattes** :

| Ce qu'Ohmie est | Ce qu'Ohmie n'est pas |
| --------------- | --------------------- |
| Un compagnon de paillasse **contextuel** : il connaît le câblage, les calibres, les consignes, l'état des objectifs et la feuille de relevés | Il ne répond pas aux questions **hors sujet** (recette, météo, code…) : il ramène poliment au TP |
| Un **guide** : méthode pas à pas, pièges, renvois aux pages/équations du fascicule | Il ne donne **jamais** la réponse toute faite ni une valeur qu'il faut mesurer |
| Une présence vivante : humeurs `^_^` aléatoires toutes les 3,5–8,5 s, vol par waypoints toutes les 2,2–4,8 s, regard, **laser rouge** pointé vers l'appareil dont il parle, bulle Roblox au-dessus de sa tête (tronquée à 90 caractères, disparition auto après 8 s), voix française (bouton 🔊) | Il ne remplace pas le fascicule : il **oriente** vers la bonne page, la bonne équation |

### Interface

- **`T`** ou le bouton **🤖** en bas à gauche : ouvre le **dock compact**
  (bas gauche, 372 px — il ne masque ni la paillasse ni les instruments).
- **⤢** : grande fenêtre centrée avec **toute la conversation** (relecture).
- Réponse affichée **à trois endroits** : dock (texte complet), grande fenêtre,
  bulle 3D d'Ohmie (version courte éphémère) + voix si 🔊 actif.
- Bas du dock : **compteur de quota** — `Jetons/jour` et `Requêtes/jour` en
  pourcentage, **rouge au-delà de 80 %**.
- Mémoire : **les 3 derniers échanges seulement** (ni profil, ni historique long).

### Clé API Groq — configuration (30 s)

La clé **n'est jamais envoyée au navigateur** : seul `server.py` la voit.
Ordre de recherche : `GROQ_API_KEY` (variable d'environnement) →
`GROQ_KEY_FILE` (chemin explicite) → `~/.config/labo3d/groq.key`.

**Développement local** — fichier hors du projet, permissions strictes :

```bash
mkdir -p ~/.config/labo3d
printf 'gsk_XXXXXXXX...' > ~/.config/labo3d/groq.key
chmod 600 ~/.config/labo3d/groq.key
python3 server.py --port 8123          # Ohmie est configuré ✓
```

Variante ponctuelle (une session de terminal) :

```bash
GROQ_API_KEY='gsk_XXXXXXXX...' python3 server.py
```

**Production** — ne JAMAIS committer la clé (le dossier `tutor_docs/` est servi
uniquement au modèle ; `/tutor_docs` et `/secrets` renvoient 404) :

```bash
# systemd : secrets dans l'environnement du service, pas dans le dépôt
[Service]
Environment="GROQ_API_KEY=gsk_XXXXXXXX..."     # ou EnvironmentFile=/etc/labo3d/groq.env (chmod 600, root)
ExecStart=/usr/bin/python3 /opt/labo3d/server.py --port 8000
```

Derrière un reverse-proxy (nginx/caddy) en HTTPS ; la comptabilité d'usage est
écrite dans `~/.config/labo3d/usage.json` (dossier surridable par
`LABO_TUTOR_DIR`, utilisé par les tests).

**Palier gratuit Groq** (`openai/gpt-oss-120b`) appliqué par le serveur :

| Fenêtre | Limite | Réponse si dépassée |
| ------- | ------ | ------------------- |
| minute glissante | 30 requêtes | 429 « Laisse-moi respirer quelques secondes » |
| minute glissante | 8 000 jetons | 429 « Beaucoup de texte cette minute-ci » |
| jour | 1 000 requêtes | 429 « Ohmie recharge ses batteries jusqu'à demain » |
| jour | 200 000 jetons | idem (le compteur du dock passe au rouge avant) |

### Garde-fous (côté serveur, `tutor_validate`)

- corps de requête > **32 Kio** → `413` ; message > **600 caractères** ou
  < **2 caractères** → `400` ; signes seuls (aucun mot de 2 lettres/chiffres)
  → `400` ; caractères de contrôle → `400`. Chaque refus est une phrase
  **amicale** d'Ohmie, jamais une erreur technique.
- réponse du modèle **nettoyée** (caractères de contrôle retirés) et bornée à
  4 000 caractères ; toute erreur Groq (réseau, HTTP, JSON) → `502` avec un
  message gentil ; **jetons comptés précisément** depuis `usage.total_tokens`
  (estimation `len/4` en secours).
- le client (`js/tutor.js`) applique les mêmes garde-fous pour un feedback
  immédiat, mais **le serveur fait foi**.

### Où modifier quoi (maintenance)

| Fichier | Rôle | Points d'entrée |
| ------- | ---- | --------------- |
| `server.py` § « TUTOR » (ligne ~245) | relais Groq, clé, quotas, validation, prompt | `tutor_key()`, `tutor_validate()`, `tutor_context_text()`, `tutor_system_text()`, `tutor_stats_payload()`, `Server.tutor_ask()`, `_groq_call()` |
| `tutor_docs/systeme.md` | persona d'Ohmie + règles de refus (modifiable sans toucher au code) | chargé par `tutor_system_text()` |
| `tutor_docs/labo.md` | description permanente du laboratoire | idem |
| `tutor_docs/tp1_A.md … tp3_5.md` | fiche pédagogique du sous-niveau courant | choisie par `tutorDocKey()` (client) / paramètre `doc` (serveur) |
| `js/robot.js` | apparence, vol, humeurs, laser, bulle 3D | `buildRobot()` (1× dans `main.js`), `updateRobot(dt, t)` (boucle), `robotSay()`, `robotMood()`, `robotPointDevice()` |
| `js/tutor.js` | dock, grande fenêtre, contexte du banc, voix, quota | `initTutor(hud, wires)` (1× dans `main.js`), `tutorAsk()`, `buildTutorContext()`, `tutorToggle()`, `tutorModal()` |
| `index.html` § « ROBOT TUTEUR » | balises du bouton, du dock et de la fenêtre | `#tutorFab`, `#tutorDock`, `#tutorModal` |
| `css/style.css` § « ROBOT TUTEUR OHMIE » | styles du dock/fenêtre/compteur | fin du fichier |
| `js/main.js` | câblage : `buildRobot()`, `updateRobot()`, `initTutor()`, hooks `T`/`Échap` | section hooks `H` |
| `js/player.js` | touche `T` → `hooks.toggleTutor` ; `Échap` ferme la grande fenêtre | `GAME_KEYS`, handler `keydown` |

Le contexte envoyé à chaque question (`buildTutorContext`) contient : TP actif
et sous-niveau ; générateur (état, consigne) ; calibres et positions des
aiguilles ; GBF/oscilloscope (TP 2) ; alimentations, rhéostat et topologie
détectée (TP 3) ; **liste des fils** (bornes A↔B) ; objectifs fait/pas fait ;
nombre de lignes de la feuille. **Aucune valeur théorique** n'y figure : le
modèle ne peut pas « tricher » à la place de l'élève.
