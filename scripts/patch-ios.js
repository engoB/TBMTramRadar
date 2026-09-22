/* Ajoute au projet iOS généré par Capacitor les réglages Apple indispensables :
   textes d'autorisation (Info.plist) et manifeste de confidentialité (PrivacyInfo.xcprivacy). */
const fs = require('fs');
const path = require('path');
const app = path.join(__dirname, '..', 'ios', 'App', 'App');
const plistPath = path.join(app, 'Info.plist');
if (!fs.existsSync(plistPath)) { console.error('Projet iOS introuvable : lancez d\'abord « npm run ios:add ».'); process.exit(1); }
let plist = fs.readFileSync(plistPath, 'utf8');
const additions = fs.readFileSync(path.join(__dirname, '..', 'ios-config', 'Info.plist.additions.xml'), 'utf8');
const keys = [...additions.matchAll(/<key>([^<]+)<\/key>/g)].map(m => m[1]);
if (!keys.every(k => plist.includes(`<key>${k}</key>`))) {
  plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, additions.trim() + '\n</dict>\n</plist>\n');
  fs.writeFileSync(plistPath, plist);
  console.log('Info.plist : autorisations ajoutées');
}
fs.copyFileSync(path.join(__dirname, '..', 'ios-config', 'PrivacyInfo.xcprivacy'), path.join(app, 'PrivacyInfo.xcprivacy'));
console.log('PrivacyInfo.xcprivacy copié (à ajouter à la cible App dans Xcode s\'il n\'apparaît pas)');
// Code natif du widget et de la Live Activity (voir IOS_WIDGET.md pour l'ajout aux cibles Xcode)
const src = path.join(__dirname, '..', 'ios-native');
for (const f of ['App/TramActivityPlugin.swift', 'App/MainViewController.swift', 'Shared/TramShared.swift']) {
  fs.copyFileSync(path.join(src, f), path.join(app, path.basename(f)));
}
console.log('Plugin TramActivity copié dans ios/App/App');
