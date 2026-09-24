# Publier Tram Radar sur l'App Store

Ce document sert de dossier de soumission : ce que fait l'app pour respecter les règles d'Apple,
et ce qu'il vous reste à faire (compte, captures, fiche).

## 1. Règle 4.2 « Minimum Functionality » : ce que l'app apporte

> **État en version 5.2** : le widget « Mon tram » et la Live Activity (écran verrouillé, Dynamic Island)
> sont les arguments natifs principaux (voir IOS_WIDGET.md). L'alerte de départ, le partage et Plans
> ont été retirés de l'interface.


Apple refuse les apps qui ne sont qu'un site web emballé. Tram Radar est construit comme une app
native à part entière, avec des fonctions qu'un site ne peut pas offrir de la même façon :

| Fonction | Technique native | Pourquoi c'est utile |
|---|---|---|
| **Alerte de départ** « Me prévenir » | Notifications locales (`@capacitor/local-notifications`), reprogrammées en direct si le tram prend du retard | L'utilisateur range son téléphone et est prévenu au bon moment, même app fermée |
| **Verdict selon la vitesse réelle** | GPS natif (`@capacitor/geolocation`), mesure continue de la vitesse de marche | Le verdict s'adapte à la façon dont vous marchez vraiment |
| **Retour haptique** | Taptic Engine (`@capacitor/haptics`) : succès, avertissement, erreur quand le verdict change ; clic léger sur les sélecteurs | Info perçue sans regarder l'écran |
| **Partage** | Feuille de partage iOS (`@capacitor/share`) | « Je prends le tram E, à quai à 11:20 » |
| **Itinéraire dans Plans** | Ouverture d'Apple Plans en mode piéton | Continuité avec les apps système |
| **Favoris** | Stockage local | Présélection de la direction habituelle à chaque station |
| **Hors ligne** | Code, carte des lignes et arrêts embarqués | L'app s'ouvre et affiche le réseau sans connexion ; le temps réel reprend dès le retour du réseau |
| **Temps réel synchronisé** | Horloge calée sur le serveur TBM, actualisation 10 s à l'approche | Compte à rebours à la seconde près |
| **Infos réseau du jour** | Présentation quotidienne + alerte en cours sur l'écran principal | Perturbations qui vous concernent, au bon moment |
| **Présentation au premier lancement** | Demande des autorisations en contexte, avec explication | Conforme aux règles 5.1.1 |
| **Accessibilité** | VoiceOver (résumé du verdict annoncé), cibles de 44 pt, réduction des animations | Utilisable par tous |

Dans les **notes pour l'équipe de validation** (App Store Connect > App Review Information), écrivez par exemple :

> Tram Radar indique en temps réel si l'utilisateur aura son tram à Bordeaux selon sa vitesse de marche
> mesurée par GPS. Fonctions natives : alertes de départ par notification locale (reprogrammées quand
> le tram prend du retard), retour haptique à chaque changement de verdict, partage iOS, ouverture
> dans Plans, favoris, fonctionnement hors ligne. Pour tester hors de Bordeaux : le bandeau « hors du
> réseau » propose « Démo : place de la Bourse », qui simule une position au centre-ville.
> Ce mode s'active en mettant `demo: true` dans assets/config.js avant de construire la version
> soumise ; il est désactivé pour les utilisateurs. Aucun compte requis.

Le bouton de simulation est essentiel : le testeur d'Apple n'est pas à Bordeaux.

## 2. Autres règles vérifiées

- **5.1.1 Confidentialité** : autorisations demandées dans la présentation, avec le texte d'usage
  (`NSLocationWhenInUseUsageDescription`) ; l'app reste utilisable sans (repère manuel). Politique de
  confidentialité : `privacy.html` (à publier, son adresse va dans App Store Connect).
- **Manifeste de confidentialité** : `ios-config/PrivacyInfo.xcprivacy` (aucun pistage, aucune donnée collectée).
- **App Privacy (étiquettes)** : répondre « Aucune donnée collectée ». La position envoyée au calcul
  d'itinéraire ne sert qu'à répondre à la requête en temps réel, ce qui ne compte pas comme collecte
  selon la définition d'Apple. Si vous préférez la prudence : « Localisation précise, non liée à
  l'identité, non utilisée pour le pistage, fonctionnalité de l'app ».
- **5.2 Propriété intellectuelle** : l'app s'appelle « Tram Radar », pas « TBM », et indique être
  indépendante et non affiliée à TBM. N'utilisez pas le logo TBM. Les couleurs des lignes sont
  des données publiques du GTFS.
- **2.1 Complétude** : aucune page vide, aucun texte provisoire, messages d'erreur explicites
  (hors ligne, temps réel indisponible).
- **Guideline 4.0 Design** : polices système (SF Pro), contrôles segmentés, feuilles avec poignée,
  zones sûres (encoche, barre d'accueil), un écran principal sans défilement.

## 3. À faire avant de soumettre

1. **Fond de carte** : la politique d'OpenStreetMap interdit d'utiliser `tile.openstreetmap.org`
   dans une app distribuée à grande échelle. Prenez un fournisseur avec clé (MapTiler, Stadia Maps,
   Thunderforest ; offres gratuites pour démarrer) et remplacez `tiles.url` dans `assets/config.js`.
2. **Itinéraires piétons** : le serveur OSRM de FOSSGIS est gratuit pour un usage modéré. Si l'app
   décolle, hébergez votre OSRM ou passez à un service payant (`router` dans `assets/config.js`).
3. **Assistance** : renseignez `support` dans `assets/config.js` (page web ou `mailto:`) ; la même
   adresse va dans App Store Connect (champ obligatoire).
4. **Identifiant** : changez `appId` dans `capacitor.config.json` (ex. `fr.votrenom.tramradar`).
5. **Captures** : iPhone 6,9" et 6,5" obligatoires. Montrez : verdict vert, sélection de direction,
   vue Carte avec suivi, alerte de départ, menu.
6. **Compte Apple Developer** (99 €/an) et un Mac avec Xcode.

## 4. Construire l'app iOS

```bash
npm install
npm run ios:add      # crée le projet Xcode, ajoute autorisations et manifeste
npm run ios:open     # ouvre Xcode
```

Dans Xcode : sélectionnez votre équipe (Signing & Capabilities), vérifiez que `PrivacyInfo.xcprivacy`
fait partie de la cible *App*, ajoutez l'icône 1024 px (`assets/icons/icon-512.png` agrandie ou votre
propre fichier) dans *Assets > AppIcon*, puis *Product > Archive* et envoi vers App Store Connect.

Après chaque modification de la web app : `npm run ios:sync`.

Dans l'app native, les appels à l'API TBM passent par le moteur HTTP natif (`CapacitorHttp`) :
pas de problème de CORS, aucun relais nécessaire.

## 5. Versions

- Web (GitHub Pages) : mise à jour automatique à chaque `git push`, comme avant.
- App Store : chaque version passe par la validation d'Apple. Augmentez `version` dans
  `version.json` et `package.json`, et le numéro de build dans Xcode.
