/* Relais CORS pour l'API TBM, à déployer gratuitement sur Cloudflare Workers.
   1. dash.cloudflare.com > Workers & Pages > Créer > Worker > coller ce fichier > Déployer
   2. Dans l'app : Réglages > Relais CORS > https://VOTRE-WORKER.workers.dev/?url={url}
   Il ne relaie que bdx.mecatran.com (API TBM) : impossible de l'utiliser pour autre chose. */
export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target || !target.startsWith('https://bdx.mecatran.com/')) {
      return new Response('URL non autorisée', { status: 400 });
    }
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
