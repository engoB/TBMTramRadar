# Journal des versions

Le numéro de version se trouve dans `version.json`. Chaque déploiement reçoit en plus
un build (empreinte du contenu) : les téléphones se mettent à jour tout seuls dès qu'il change.

## 4.0.0
- Écran unique sans défilement : la carte reste visible, une seule carte en bas avec l'essentiel.
- Station la plus proche uniquement (à pied), ou la suivante si la plus proche n'a aucun départ.
- Choix du sens par direction de terminus, en un geste ; le choix est mémorisé.
- Verdict, compte à rebours et frise tram / vous intégrés dans un même bloc coloré.
- Allure réglable directement sur l'écran principal.
- Passages complets, infos trafic, filtres de lignes et réglages regroupés dans « Détails ».
- Recherche de destination et liste des stations alentour retirées.

## 3.0.0
- Destination : « Où allez-vous ? » ; seuls les trams qui vont dans votre sens sont proposés.
- Choix automatique de la meilleure station de départ autour de vous (arrivée la plus tôt), avec correspondance si nécessaire.
- Itinéraire piéton réel (OSRM sur OpenStreetMap) et tracé sur la carte.
- Comptes à rebours à la seconde, calés sur l'horloge du serveur TBM ; actualisation toutes les 10 s quand votre tram approche.
- Frise temps réel tram / station / vous, position du tram en arrêts.
- Infos trafic (SIRI general-message), mises en avant quand elles vous concernent.
- Lignes A à F, stations lisibles aux couleurs des lignes, tracés GTFS officiels.
- Web app installable (PWA), mises à jour automatiques versionnées.

## 2.0.0
- Passage au temps réel officiel TBM (SIRI Lite).

## 1.0.0
- Première version (horaires simulés).
