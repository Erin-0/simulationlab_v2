# TP 1 — Niveau A : loi d'Ohm, mesure d'une résistance (montage amont/aval)

## Objectif (fascicule p. 3-5, tables 4-5)
Mesurer la résistance R d'un résistor bobiné (≈ 100 Ω, valeur exacte inconnue de
l'élève) sous deux montages — **amont** et **aval** — puis comparer aux
résistances internes des appareils pour conclure sur le biais de chaque
montage. Table à remplir : U (V), I (mA), R = U/I.

## Matériel sur la paillasse (état fourni dans le contexte)
- Alimentation stabilisée 0-15 V / 2 A (bornes G+, G−) ; livrée éteinte à 0 V.
- Voltmètre analogique (V+, V−) et ampèremètre analogique (A+, A−), calibres au
  choix ; résistance bobinée (bornes R1, R2).
- Le simulateur détecte tout seul le montage : **amont** si le voltmètre voit
  (rA + R), **aval** s'il ne voit que R.

## Câblage type (boucle série)
G+ → A+ ; A− → R1 ; R2 → G− ; puis voltmètre :
- montage **aval** : V+ sur A− (ou R1) et V− sur R2 → le voltmètre ne voit que R ;
- montage **amont** : V+ sur A+ et V− sur R2 → le voltmètre voit rA + R.

## Méthode de mesure (à guider, jamais le résultat)
1. Allumer le générateur, régler une tension modérée (3-6 V).
2. Choisir le calibre voltmètre puis ampèremètre le plus grand compatible ;
   si l'aiguille dépasse 100 div / voyant OL → monter de calibre.
3. Lire N div sur chaque cadran : g = N div × C/100 ; Δg = 1,5 × C/100.
4. Reporter U et I sur la feuille ; R = U/I (I en AMPÈRES pour le calcul !).
5. Comparer les deux montages : quel montage sous-estime / surestime R, et
   pourquoi (rA = 1 Ω, RV = 10 MΩ) ?

## Pièges fréquents
- Boucle ouverte (fil manquant) : aucun courant, aiguilles à zéro.
- Calibre trop petit : surcharge OL — faire monter de calibre puis relire.
- Oublier de convertir mA → A dans R = U/I.
- Confondre « consigne » du générateur (1 décimale) et mesure au voltmètre.

## Missions du niveau (statut fourni dans le contexte)
Câbler la boucle, détecter amont puis aval, relever U et I sur la feuille,
conclure sur le biais. Renvoyer au fascicule p. 4 (schémas amont/aval).
