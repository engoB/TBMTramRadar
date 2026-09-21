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
