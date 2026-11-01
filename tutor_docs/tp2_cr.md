# TP 2 — Filtre CR (passe-haut) : réponse fréquentielle

## Objectif (fascicule p. 11-15)
Comme le passe-bas, mais le filtre est **CR** : C1 = 22 nF en SÉRIE,
R1 = 2,2 kΩ en DÉRIVATION. Le gain monte avec f ; fc où G = −3 dB et
φ = +45° ; théorie symbolique fc = 1/(2π·R1·C1) — à calculer par l'élève.

## Banc et câblage
Identiques au passe-bas (maquette « PASSE-HAUT CR ») :
GBF+ → IN+, GBF− → IN− ; CH1 pointe IN+ / masse IN− ; CH2 pointe OUT+ /
masse OUT−. Les masses des deux voies sont communes.

## Méthode
1. Balayage de 10 Hz vers 100 kHz : aux basses fréquences Us est petit
   (passe-haut), aux hautes fréquences G → 0 dB.
2. Relevés : Ue et Us en divisions × V/DIV ; G = 20·log10(Us/Ue) ;
   φ = Δx/T × 360° (ici φ POSITIF : la sortie est en AVANCE).
3. fc à −3 dB sous le plateau haut (0 dB), vérifier φ ≈ +45°.
4. Reporter chaque point (« Recopier mesure ») ; tracer la courbe de l'élève.

## Pièges
- Attendre un comportement de passe-bas (invertir mentalement la courbe).
- Signe du déphasage : sortie en avance = φ > 0.
- À très basse fréquence, Us presque nul : monter la sensibilité V/DIV de CH2.

## Missions (statut dans le contexte)
Alimenter, sonder les deux voies, ≥ 4 relevés, fc à −3 dB.
