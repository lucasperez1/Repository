const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&formato=application/vnd.geo%2Bjson&qualidade=minima';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const upstream = await fetch(IBGE_URL, {
      headers: { accept: 'application/vnd.geo+json, application/json' }
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Falha ao consultar a malha do IBGE.', status: upstream.status });
    }
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Map-Source', 'IBGE');
    return res.status(200).send(body);
  } catch (error) {
    return res.status(502).json({ error: 'Falha de rede ao consultar a malha do IBGE.' });
  }
};
