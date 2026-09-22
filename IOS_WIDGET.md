# Widget et Live Activity (app iOS)

Le widget affiche le prochain tram de votre direction avec un compte à rebours, sur l'écran
d'accueil et l'écran verrouillé. Il relit lui-même le temps réel TBM (environ toutes les 10 minutes,
selon le budget qu'iOS accorde aux widgets) ; entre deux lectures, le compte à rebours avance seul.

La Live Activity affiche le tram que vous suivez sur l'écran verrouillé et dans la Dynamic Island :
verdict en couleur, compte à rebours à la seconde, retard. On la lance avec le bouton
« Suivre sur l'écran verrouillé » ; elle se met à jour tant que l'app tourne et se termine seule
après le passage du tram.

Code : `ios-native/` (Swift). Ces fonctions n'existent que dans l'app iOS, pas sur la version web.

## Mise en place dans Xcode (une seule fois, environ 10 minutes)

1. `npm run ios:add` (ou `npm run ios:sync`) puis `npm run ios:open`.
2. **Plugin de l'app** : glissez `ios/App/App/TramActivityPlugin.swift`, `MainViewController.swift`
   et `TramShared.swift` dans le groupe *App* du navigateur Xcode (cible *App* cochée).
3. **Contrôleur** : ouvrez `Main.storyboard`, sélectionnez le *Bridge View Controller*, onglet
   *Identity*, classe : `MainViewController`, module : `App`.
4. **Extension** : *File > New > Target > Widget Extension*, nom `TramRadarWidget`,
   cochez *Include Live Activity*, décochez *Include Configuration App Intent*. Cible minimale : iOS 16.2.
5. Remplacez le contenu généré par `ios-native/Widget/TramRadarWidget.swift` (supprimez les autres
   fichiers Swift générés dans ce dossier) et ajoutez `TramShared.swift` à la cible
   *TramRadarWidgetExtension* aussi (inspecteur de fichier > *Target Membership* : App + extension).
6. **App Group** : dans *Signing & Capabilities* des deux cibles, ajoutez *App Groups* avec
   `group.fr.tramradar.bordeaux` (changez-le partout si vous changez l'identifiant de l'app,
   y compris dans `TramShared.swift`).
7. `Info.plist` de l'app : `NSSupportsLiveActivities` est déjà ajouté par `patch-ios.js`.
8. Lancez sur un iPhone. Ajoutez le widget « Mon tram » depuis l'écran d'accueil.

## Limites à connaître

- **Widget** : iOS limite le nombre de rafraîchissements (quelques dizaines par jour). Le widget
  indique « Temps réel TBM » ou « Dernières données connues ».
- **Live Activity** : sans serveur d'envoi (notifications push ActivityKit), elle n'est mise à jour
  que lorsque l'app est active. Le compte à rebours continue quoi qu'il arrive ; un retard annoncé
  après la mise en veille n'apparaît qu'à la réouverture. Pour des mises à jour app fermée, il faudra
  un petit serveur qui interroge TBM et pousse les changements.
