# Journal des versions

Le numéro de version se trouve dans `version.json`. Chaque déploiement reçoit en plus
un build (empreinte du contenu) : les téléphones se mettent à jour tout seuls dès qu'il change.

## 5.1.0
- Toutes les directions du réseau : si votre station ne dessert pas celle voulue, l'app indique le tram le plus rapide (à pied jusqu'à une autre station, ou avec une correspondance) et les étapes.
- « Autre direction » : liste de tous les terminus, par ligne.
- Fin de service et travaux : « Dernier tram annoncé », et quand il n'y a plus rien, « Plus de tram vers… » avec la raison publiée par TBM et une autre solution si elle existe.
- Directions mémorisées par station, visibles même quand aucun tram n'y circule.
- Habitudes : la direction que vous prenez d'habitude à cette heure-ci est présélectionnée.
- Rames dessinées en capsules orientées dans le sens de la marche, plus discrètes.
- Retrait de « Me prévenir », « Partager » et « Plans » en attendant une soumission App Store.

## 5.0.0
- Conçue comme une app iOS : barre de navigation, contrôle segmenté « Tram | Carte », feuilles avec poignée, polices système.
- Vue Tram plein écran sans défilement ; vue Carte plein écran avec suivi du trajet activable et résumé du verdict.
- Direction choisie avec des flèches gauche / droite (ou un glissement) parmi les terminus desservis par la station.
- Verdict en grand sur fond vert / orange / rouge, compte à rebours très lisible, prochains passages.
- Alerte de départ « Me prévenir » (notification locale reprogrammée si le tram prend du retard).
- Favoris, partage, ouverture dans Plans, retour haptique, présentation au premier lancement.
- Enveloppe iOS Capacitor, textes d'autorisation, manifeste de confidentialité, politique de confidentialité.
- Leaflet embarqué (plus de CDN tiers), polices système (plus de Google Fonts).

## 4.1.0
- Le panneau passe au premier plan ; la carte devient un bandeau secondaire, agrandissable (« Suivre à pied »).
- Fond de carte OpenStreetMap (le fond CARTO exige désormais une clé et affichait « APIKEY REQUIRED »).
- Directions en tuiles : terminus, prochain passage, couleur du verdict.
- Verdict calculé sur votre vitesse réelle dès que vous marchez, sinon sur l'allure réglée.
- Course tram / vous redessinée : plus épaisse, plus lisible.
- Info trafic : alerte dans le verdict seulement si votre ligne ou votre station est touchée ; résumé « Infos réseau du jour » une fois par jour.

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
