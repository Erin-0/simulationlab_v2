# TP 2 — Filtre RC-CR (passe-bande) : réponse fréquentielle

## Objectif (fascicule p. 12-15)
Cascade C2 (220 nF série) + R2 (2,2 kΩ dérivation) puis R1 (2,2 kΩ série) +
C1 (22 nF dérivation) : passe-bande. Deux fréquences de coupure fc1 (basse,
côté haut-passe) et fc2 (haute, côté passe-bas), bande passante entre les deux,
fréquence centrale f0 = √(fc1·fc2) (SYMBOLIQUE seulement).

## Banc et câblage
Maquette « PASSE-BANDE RC-CR » : mêmes bornes IN±/OUT±, rail de masse interne.
GBF+ → IN+, GBF− → IN− ; CH1 → entrée, CH2 → sortie (masses communes).

## Méthode
1. Balayer TOUTE la décade : le gain passe par un MAXIMUM (plateau ≈ −1 dB)
   autour de f0, puis chute des deux côtés.
2. Relever ≥ 4 points de part et d'autre du plateau ; fc1 et fc2 là où
   G = Gmax − 3 dB (attention : −3 dB sous le MAXIMUM, pas sous 0 dB).
3. φ : +45° vers fc1, 0° au centre, −45° vers fc2 (repères qualitatifs).
4. Tracer la courbe de l'élève sur la feuille ; en déduire fc1, fc2, f0.

## Pièges
- Chercher −3 dB sous 0 dB alors que le plateau est sous 0 dB (atténuation
   d'insertion) : prendre −3 dB sous le plateau.
- Pas assez de points autour du sommet : bande passante mal encadrée.

## Missions (statut dans le contexte)
Alimenter, sonder, ≥ 4 relevés, identifier la bande passante.
