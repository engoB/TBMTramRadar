# Journal des versions

Le numéro de version se trouve dans `version.json`. Chaque déploiement reçoit en plus
un build (empreinte du contenu) : les téléphones se mettent à jour tout seuls dès qu'il change.

## 5.9.0
- Localisation immédiate : la dernière position connue (moins de 30 min) s'affiche dès l'ouverture, signalée comme telle, puis un point GPS rapide, puis le suivi haute précision.
- App ajoutée à l'écran d'accueil : aide adaptée (iOS redemande l'autorisation à chaque ouverture ; fermer puis rouvrir l'app suffit en général).
- « Actualiser » directement dans la ligne de position quand elle date.
- App native : bouton « Ouvrir les réglages de l'iPhone » quand la localisation est refusée (impossible depuis une PWA).

## 5.8.0
- Position simulée et repère posé à la main retirés de l'usage courant : l'app fonctionne sur votre vraie position.
- Ces deux options restent disponibles pour les tests via l'adresse ?demo=1, ou `demo: true` dans assets/config.js (nécessaire pour la validation App Store).
- Écran « Localisation bloquée » : un seul bouton, « Réessayer la localisation », avec la marche à suivre selon l'appareil.

## 5.7.2
- Localisation refusée : écran dédié avec « Réessayer la localisation » (nouvelle demande au navigateur), marche à suivre selon l'appareil, et repli « me placer à la main » ou position simulée.
- L'app détecte l'autorisation donnée après coup dans les réglages du navigateur et redémarre le GPS toute seule.
- Message explicite si la page n'est pas en HTTPS (les navigateurs y interdisent la localisation).

## 5.7.1
- Rames : déplacement lissé ; plus de sauts à chaque actualisation du temps réel ni au passage à la vue Carte.
- Vue Tram : la carte masquée n'est plus recalculée à chaque image (moins de batterie).
- Meilleure solution plus fiable : plus de proposition de marcher vers une station située plus loin sur la même ligne ; une proposition retenue n'est pas remplacée pour quelques secondes gagnées.
- La direction choisie reste sélectionnée quand la station la plus proche change.
- En position simulée ou manuelle, l'app indique que le calcul se fait sur l'allure choisie.

## 5.7.0
- Premier lancement : invitation à ajouter l'app à l'écran d'accueil. iPhone : les trois gestes illustrés, avec une flèche vers le bouton Partager. Android : bouton « Installer l'app ».
- Présentée une seule fois, jamais si l'app est déjà installée ; toujours accessible depuis le menu (« Ajouter à l'écran d'accueil »).

## 5.6.0
- Situation instantanée : plus de « Partez à… ». Le tram qui arrive (ligne, destination, où il en est) est mis en avant.
- « À 2 arrêts » en grand ; retard et passages suivants retirés.
- Messages plus humains : « Tout roule », « C'est bon pour vous », « Ça va se jouer de peu », « Celui-ci vous file sous le nez ».
- Libellés explicites : « Vous êtes près de », « Vous allez vers », « Le plus rapide, maintenant ».
- La meilleure solution est cherchée même quand la direction est desservie : marcher jusqu'à une autre station, une autre ligne ou une correspondance, si cela fait gagner au moins 2 min.
- Nom de station jamais tronqué ; panneau de décision compact et centré.

## 5.5.0
- Trois panneaux aux rôles distincts : trajet (depuis / vers) en blanc, décision teintée selon le verdict, alerte en ambre seulement si elle vous concerne.
- Itinéraire : compte à rebours et verdict en tête, puis les étapes, une par ligne, avec l'heure à droite.
- Numéros d'étapes teintés : monter (couleur pleine de la ligne), descendre (couleur claire), marcher (gris).
- Nom de direction lisible en entier, statut sous le nom (« 2 sur 4 directions », « avec correspondance »).
- Allure : plus de légende superflue ; la vitesse réelle s'affiche seulement quand elle est mesurée.
- Vérifié sans défilement jusqu'à un écran de 375 × 600.

## 5.4.0
- Correction : les terminus des autres lignes (ex. Floirac Dravemont depuis CAPC) disparaissaient de « autre direction » après quelques secondes.
- Correspondances à pied entre stations voisines (moins de 300 m), avec le temps de marche.
- Étapes numérotées bien distinctes, chacune avec sa station et son heure.
- Panneau central encadré ; aucun défilement possible.
- Station la plus proche affichée avec son libellé et le temps à pied.

## 5.3.0
- Écran Tram refait sur le modèle de la présentation : tout centré, sans cadres. Un anneau avec le compte à rebours, un grand titre, une phrase.
- « Trop tard » montre directement le tram que vous pouvez prendre (« Prenez le suivant », « Partez à 08:31 »).
- Itinéraire en 3 étapes numérotées quand la direction n'est pas desservie.
- Plus de bandeaux : absence de position et éloignement affichés au centre.
- Vue Carte : une seule pastille en bas, identique au verdict de la vue Tram.
- Réglages réduits aux lignes affichées et aux infos réseau.
- Correction : la carte pouvait se bloquer en passant à la vue Carte.

## 5.2.0
- Interface épurée dans l'esprit de la présentation : fond blanc, titres nets, sections aérées.
- Plus aucun chevauchement dans le bloc verdict ; messages d'info trafic affichés en entier.
- Itinéraire numéroté quand la direction n'est pas desservie : quel tram prendre, où descendre, quelle correspondance.
- Les directions exceptionnelles (courses de dépôt, données erronées) ne s'affichent plus : une direction doit revenir plusieurs jours.
- « Info trafic ligne X » présentée comme une information, sans l'affirmer comme cause.
- Suppression du réglage de marge : calcul au plus juste, en temps réel.
- Menu : état du temps réel (plus de faux « réglage »), dépannage de connexion seulement en cas de problème.
- Rames plus grandes sur la carte.
- App iOS : widget « Mon tram » et Live Activity (écran verrouillé, Dynamic Island).

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
