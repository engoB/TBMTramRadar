/* Configuration de TBM Tram Radar.
   Modifiable sans toucher au code de l'application. */
window.TBM_CONFIG = {
  // API temps réel officielle TBM (SIRI Lite, open data Bordeaux Métropole)
  api: {
    base: 'https://bdx.mecatran.com/utw/ws/siri/2.0/bordeaux/',
    key: 'opendata-bordeaux-metropole-flux-gtfs-rt'
  },

  // Relais CORS par défaut (vide = accès direct). Exemple : 'https://tbm-relais.monnom.workers.dev/?url={url}'
  proxy: '',

  // Calcul d'itinéraire piéton réel (OSRM, profil piéton, serveur FOSSGIS basé sur OpenStreetMap)
  router: 'https://routing.openstreetmap.de/routed-foot',

  // Lignes de tram. Les couleurs et les tracés sont remplacés au déploiement
  // par ceux du GTFS officiel TBM (data/network.json).
  lines: {
    A: { ref: 'bordeaux:Line:59:LOC', color: '#852d7e' },
    B: { ref: 'bordeaux:Line:60:LOC', color: '#00893e' },
    C: { ref: 'bordeaux:Line:61:LOC', color: '#e2007a' },
    D: { ref: 'bordeaux:Line:62:LOC', color: '#d8232a' },
    E: { ref: 'bordeaux:Line:163:LOC', color: '#1f6fb8' },
    F: { ref: 'bordeaux:Line:164:LOC', color: '#e8870e' }
  },

  // Fréquences d'actualisation (secondes)
  refresh: {
    normal: 30,     // toutes les lignes affichées
    urgent: 10,     // la ligne du tram visé, quand il arrive dans moins de 4 min
    messages: 120   // infos trafic
  },

  walk: {
    detour: 1.3,            // si l'itinéraire piéton est indisponible : vol d'oiseau x 1,3
    platformSec: 20,        // temps pour accéder au quai une fois à la station
    candidateRadius: 2000,  // rayon de recherche des stations de départ (mètres)
    maxCandidates: 8
  },

  transferSec: 120          // temps minimum de correspondance dans une même station
};
