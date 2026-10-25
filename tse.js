const TSE_ORIGIN = 'https://resultados.tse.jus.br';

function isAllowedPath(path) {
  if (path === '/oficial/comum/config/ele-c.json') return true;
  return /^\/oficial\/ele2026\/\d+\/dados\/(?:br|[a-z]{2})\/(?:br|[a-z]{2})-c0001-e\d{6}-u\.json$/i.test(path);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!isAllowedPath(path)) {
    return res.status(400).json({ error: 'Caminho não permitido.' });
  }

  try {
    const upstream = await fetch(`${TSE_ORIGIN}${path}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'PainelResultados2026/2.0 (+independent dashboard)'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Falha ao consultar o TSE.', status: upstream.status });
    }

    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
    res.setHeader('X-Data-Source', 'Tribunal Superior Eleitoral');
    return res.status(200).send(body);
  } catch (error) {
    return res.status(502).json({ error: 'Falha de rede ao consultar o TSE.' });
  }
};
