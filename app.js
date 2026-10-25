(() => {
  'use strict';

  const TSE_ORIGIN = 'https://resultados.tse.jus.br';
  const TSE_BASE_PATH = '/oficial';
  const CONFIG_PATH = `${TSE_BASE_PATH}/comum/config/ele-c.json`;
  const IBGE_MAP_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&formato=application/vnd.geo%2Bjson&qualidade=minima';
  const GEOJSON_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/henriquemalvar/br-geojson@main/dist/estados.geojson';
  const FALLBACK_CYCLE = 'ele2026';
  const FALLBACK_ELECTION = '6258';
  const REFRESH_SECONDS = 60;
  const UFS = ['ac','al','ap','am','ba','ce','df','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','sp','se','to'];

  const UF_NAMES = {
    AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará', DF:'Distrito Federal',
    ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais',
    PA:'Pará', PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte',
    RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima', SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins'
  };

  const IBGE_CODE_TO_UF = {
    '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
    '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
    '31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'
  };

  const FIXED_CANDIDATE_COLORS = {
    '13': '#ef4444',
    '22': '#3b82f6'
  };

  const els = {
    statusText: document.getElementById('statusText'),
    statusDetail: document.getElementById('statusDetail'),
    refreshBtn: document.getElementById('refreshBtn'),
    shareBtn: document.getElementById('shareBtn'),
    whatsappBtn: document.getElementById('whatsappBtn'),
    nationalProgress: document.getElementById('nationalProgress'),
    progressBar: document.getElementById('progressBar'),
    sectionsCount: document.getElementById('sectionsCount'),
    tseTimestamp: document.getElementById('tseTimestamp'),
    candidateCards: document.getElementById('candidateCards'),
    validVotes: document.getElementById('validVotes'),
    blankVotes: document.getElementById('blankVotes'),
    nullVotes: document.getElementById('nullVotes'),
    turnout: document.getElementById('turnout'),
    mapLegend: document.getElementById('mapLegend'),
    mapLoading: document.getElementById('mapLoading'),
    stateLeaderSummary: document.getElementById('stateLeaderSummary'),
    stateName: document.getElementById('stateName'),
    stateHint: document.getElementById('stateHint'),
    stateResults: document.getElementById('stateResults'),
    statesTableBody: document.getElementById('statesTableBody'),
    stateSearch: document.getElementById('stateSearch'),
    countdown: document.getElementById('countdown'),
    errorBox: document.getElementById('errorBox'),
    errorMessage: document.getElementById('errorMessage'),
    toast: document.getElementById('toast')
  };

  let cycle = FALLBACK_CYCLE;
  let election = FALLBACK_ELECTION;
  let national = null;
  let stateData = new Map();
  let geojson = null;
  let candidateColors = new Map();
  let selectedUF = null;
  let secondsLeft = REFRESH_SECONDS;
  let refreshInFlight = false;
  let toastTimer = null;

  const num = (value) => Number(String(value ?? '0').replaceAll('.', '').replace(',', '.')) || 0;
  const intNum = (value) => Number(String(value ?? '0').replace(/\D/g, '')) || 0;
  const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (value) => `${percentFormatter.format(num(value))}%`;
  const formatInt = (value) => new Intl.NumberFormat('pt-BR').format(intNum(value));

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showToast(message) {
    if (!els.toast) return;
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function electionPad(cd) { return String(cd).padStart(6, '0'); }

  function resultUrl(uf) {
    const cargo = '0001';
    return `${TSE_BASE_PATH}/${cycle}/${election}/dados/${uf}/${uf}-c${cargo}-e${electionPad(election)}-u.json`;
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  async function fetchTSEJSON(path) {
    const proxyUrl = `/api/tse?path=${encodeURIComponent(path)}`;
    try {
      const viaProxy = await fetch(proxyUrl, { cache: 'no-store' });
      if (viaProxy.ok) return viaProxy.json();
      if (viaProxy.status !== 404) throw new Error(`Proxy ${viaProxy.status}`);
    } catch (error) {
      console.warn('Proxy do site indisponível; tentando TSE diretamente.', error);
    }

    const direct = await fetch(`${TSE_ORIGIN}${path}`, { cache: 'no-store' });
    if (!direct.ok) throw new Error(`${direct.status} ${direct.statusText}`);
    return direct.json();
  }

  async function discoverElection() {
    try {
      const config = await fetchTSEJSON(CONFIG_PATH);
      const pleitos = Array.isArray(config.pl) ? config.pl : [];
      for (const pleito of pleitos) {
        if (pleito.c !== 'ele2026') continue;
        for (const ele of (pleito.e || [])) {
          const isFederalSecondRound = String(ele.t) === '2' && String(ele.tp) === '8' && /Federal/i.test(ele.nm || '');
          if (isFederalSecondRound) {
            cycle = pleito.c || FALLBACK_CYCLE;
            election = ele.cd || FALLBACK_ELECTION;
            return;
          }
        }
      }
    } catch (error) {
      console.warn('Falha ao descobrir eleição automaticamente; usando fallback oficial 6258.', error);
    }
  }

  function candidateDisplayName(number, sourceName) {
    if (String(number) === '13') return 'Lula';
    if (String(number) === '22') return 'Flávio Bolsonaro';
    return String(sourceName || 'Candidato').toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  }

  function getCandidates(data) {
    const cargo = data?.carg?.find?.(c => String(c.cd) === '1') || data?.carg?.[0];
    const rows = [];
    for (const agr of (cargo?.agr || [])) {
      for (const party of (agr.par || [])) {
        for (const cand of (party.cand || [])) {
          const number = cand.n || party.n || '';
          rows.push({
            name: candidateDisplayName(number, cand.nmu || cand.nm),
            sourceName: cand.nmu || cand.nm || 'Candidato',
            fullName: cand.nm || cand.nmu || 'Candidato',
            number,
            party: party.sg || '',
            votes: intNum(cand.vap),
            percent: num(cand.pvapn || cand.pvap),
            elected: cand.e === 's'
          });
        }
      }
    }
    return rows.sort((a, b) => b.votes - a.votes);
  }

  function assignCandidateColors(candidates) {
    const palette = ['#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899'];
    candidateColors = new Map();
    let paletteIndex = 0;
    candidates.forEach((c) => {
      const fixed = FIXED_CANDIDATE_COLORS[String(c.number)];
      candidateColors.set(c.number || c.name, fixed || palette[paletteIndex++ % palette.length]);
    });
  }

  function colorFor(candidate) {
    if (!candidate) return '#34455d';
    return candidateColors.get(candidate.number || candidate.name) || FIXED_CANDIDATE_COLORS[String(candidate.number)] || '#34455d';
  }

  function renderNational() {
    if (!national) return;
    const candidates = getCandidates(national);
    assignCandidateColors(candidates);

    const progress = num(national?.s?.pstn || national?.s?.pst);
    els.nationalProgress.textContent = pct(progress);
    els.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    els.sectionsCount.textContent = `${formatInt(national?.s?.st)} de ${formatInt(national?.s?.ts)} seções`;
    els.tseTimestamp.textContent = `TSE: ${national?.dt || '—'} ${national?.ht || ''}`.trim();

    els.candidateCards.innerHTML = candidates.map((c) => `
      <article class="candidate-card" style="--candidate-color:${colorFor(c)}">
        <div class="candidate-top">
          <div>
            <div class="candidate-name">${escapeHTML(c.name)}</div>
            <div class="candidate-party">${escapeHTML(c.number)} • ${escapeHTML(c.party)}</div>
          </div>
          <div class="candidate-pct">${pct(c.percent)}</div>
        </div>
        <div class="candidate-votes">${new Intl.NumberFormat('pt-BR').format(c.votes)} votos</div>
        <div class="candidate-mini-track"><div class="candidate-mini-bar" style="width:${Math.max(0, Math.min(100, c.percent))}%"></div></div>
      </article>
    `).join('');

    els.validVotes.textContent = formatInt(national?.v?.vvc || national?.v?.vv);
    els.blankVotes.textContent = formatInt(national?.v?.vb);
    els.nullVotes.textContent = formatInt(national?.v?.tvn || national?.v?.vn);
    els.turnout.textContent = `${pct(national?.e?.pcn || national?.e?.pc)} • ${formatInt(national?.e?.c)} eleitores`;

    renderLegend(candidates);
  }

  function renderLegend(candidates) {
    els.mapLegend.innerHTML = candidates.map(c => `
      <span class="legend-item"><span class="legend-dot" style="background:${colorFor(c)}"></span>${escapeHTML(c.name)} (${escapeHTML(c.number)})</span>
    `).join('') + `<span class="legend-item"><span class="legend-dot" style="background:#34455d"></span>Sem dados</span>`;
  }

  function leaderOf(data) {
    const candidates = getCandidates(data);
    return candidates[0] || null;
  }

  function renderStateLeaderSummary() {
    const counts = { '13': 0, '22': 0, other: 0, missing: Math.max(0, 27 - stateData.size) };
    for (const data of stateData.values()) {
      const leader = leaderOf(data);
      if (!leader) { counts.missing += 1; continue; }
      if (leader.number === '13') counts['13'] += 1;
      else if (leader.number === '22') counts['22'] += 1;
      else counts.other += 1;
    }

    const lulaColor = FIXED_CANDIDATE_COLORS['13'];
    const bolsonaroColor = FIXED_CANDIDATE_COLORS['22'];
    els.stateLeaderSummary.innerHTML = `
      <div class="leader-counter" style="--counter-color:${lulaColor}">
        <span>Lula</span><strong>${counts['13']} UFs</strong>
      </div>
      <div class="leader-counter" style="--counter-color:${bolsonaroColor}">
        <span>Flávio Bolsonaro</span><strong>${counts['22']} UFs</strong>
      </div>
      ${counts.missing ? `<div class="leader-counter muted-counter"><span>Sem dados</span><strong>${counts.missing}</strong></div>` : ''}
    `;
  }

  function stateSummary(uf) {
    const data = stateData.get(uf.toLowerCase());
    if (!data) return null;
    return {
      uf: uf.toUpperCase(),
      name: UF_NAMES[uf.toUpperCase()] || uf.toUpperCase(),
      leader: leaderOf(data),
      candidates: getCandidates(data),
      progress: num(data?.s?.pstn || data?.s?.pst),
      st: intNum(data?.s?.st),
      ts: intNum(data?.s?.ts),
      dt: data?.dt || '',
      ht: data?.ht || ''
    };
  }

  function renderStatePanel(uf) {
    const summary = stateSummary(uf);
    if (!summary) {
      els.stateName.textContent = UF_NAMES[uf] || uf;
      els.stateHint.textContent = 'Resultado ainda indisponível para esta UF.';
      els.stateResults.innerHTML = '';
      return;
    }

    selectedUF = summary.uf;
    els.stateName.textContent = `${summary.name} (${summary.uf})`;
    els.stateHint.textContent = `${pct(summary.progress)} das seções totalizadas • TSE ${summary.dt} ${summary.ht}`;
    els.stateResults.innerHTML = summary.candidates.map(c => `
      <div class="state-candidate">
        <div class="state-candidate-row">
          <strong>${escapeHTML(c.name)} <span class="candidate-number">${escapeHTML(c.number)}</span></strong>
          <b style="color:${colorFor(c)}">${pct(c.percent)}</b>
        </div>
        <small>${new Intl.NumberFormat('pt-BR').format(c.votes)} votos • ${escapeHTML(c.party)}</small>
      </div>
    `).join('') + `
      <div class="state-meta">${new Intl.NumberFormat('pt-BR').format(summary.st)} de ${new Intl.NumberFormat('pt-BR').format(summary.ts)} seções totalizadas.</div>
    `;

    document.querySelectorAll('.uf-path').forEach(path => {
      path.classList.toggle('selected', path.dataset.uf === summary.uf);
    });
  }

  function renderTable() {
    const query = (els.stateSearch.value || '').trim().toLowerCase();
    const summaries = UFS.map(uf => stateSummary(uf)).filter(Boolean)
      .filter(s => !query || s.uf.toLowerCase().includes(query) || s.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    els.statesTableBody.innerHTML = summaries.map(s => `
      <tr>
        <td><strong>${s.uf}</strong> <span class="muted-text">${escapeHTML(s.name)}</span></td>
        <td><span class="leader-chip" style="--chip-color:${colorFor(s.leader)}">${escapeHTML(s.leader?.name || '—')}</span></td>
        <td>${s.leader ? pct(s.leader.percent) : '—'}</td>
        <td>${s.leader ? new Intl.NumberFormat('pt-BR').format(s.leader.votes) : '—'}</td>
        <td>${pct(s.progress)}</td>
      </tr>
    `).join('');
  }

  async function ensureGeoJSON() {
    if (geojson) return geojson;
    const sources = [
      '/api/map',
      IBGE_MAP_URL,
      GEOJSON_FALLBACK_URL
    ];
    let lastError = null;
    for (const url of sources) {
      try {
        const data = await fetchJSON(url);
        if (data?.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length >= 27) {
          geojson = data;
          return geojson;
        }
        throw new Error('GeoJSON incompleto');
      } catch (error) {
        lastError = error;
        console.warn('Fonte de mapa indisponível:', url, error);
      }
    }
    throw lastError || new Error('Não foi possível carregar o mapa.');
  }

  function featureUF(feature) {
    const p = feature?.properties || {};
    const direct = p.sigla || p.SIGLA || p.uf || p.UF || p.sigla_uf || p.SIGLA_UF;
    if (direct && /^[A-Z]{2}$/i.test(String(direct))) return String(direct).toUpperCase();
    const code = String(p.codarea || p.cd_geocuf || p.CD_UF || p.code || feature?.id || '').padStart(2, '0');
    return IBGE_CODE_TO_UF[code] || '';
  }

  function walkCoordinates(geometry, callback) {
    if (!geometry) return;
    const visit = (node) => {
      if (!Array.isArray(node)) return;
      if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        callback(node[0], node[1]);
        return;
      }
      node.forEach(visit);
    };
    visit(geometry.coordinates);
  }

  function mapProjector(features, width = 620, height = 600, pad = 24) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    features.forEach(feature => walkCoordinates(feature.geometry, (lon, lat) => {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }));
    if (![minLon,maxLon,minLat,maxLat].every(Number.isFinite)) throw new Error('Geometria inválida.');
    const lonSpan = Math.max(0.0001, maxLon - minLon);
    const latSpan = Math.max(0.0001, maxLat - minLat);
    const scale = Math.min((width - pad * 2) / lonSpan, (height - pad * 2) / latSpan);
    const drawW = lonSpan * scale;
    const drawH = latSpan * scale;
    const offsetX = (width - drawW) / 2;
    const offsetY = (height - drawH) / 2;
    return (lon, lat) => [offsetX + (lon - minLon) * scale, offsetY + (maxLat - lat) * scale];
  }

  function geometryPath(geometry, project) {
    if (!geometry) return '';
    const ringPath = (ring) => ring.map((pt, i) => {
      const [x, y] = project(pt[0], pt[1]);
      return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ') + ' Z';
    if (geometry.type === 'Polygon') return (geometry.coordinates || []).map(ringPath).join(' ');
    if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flatMap(poly => poly.map(ringPath)).join(' ');
    return '';
  }

  function geometryLabelPoint(geometry, project) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    walkCoordinates(geometry, (lon, lat) => {
      const [x, y] = project(lon, lat);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  function renderMap() {
    if (!geojson?.features?.length) return;
    const svg = document.getElementById('brazilMap');
    svg.replaceChildren();
    const features = geojson.features.filter(feature => featureUF(feature));
    const project = mapProjector(features);
    const ns = 'http://www.w3.org/2000/svg';
    const pathsGroup = document.createElementNS(ns, 'g');
    const labelsGroup = document.createElementNS(ns, 'g');

    features.forEach(feature => {
      const uf = featureUF(feature);
      const pathEl = document.createElementNS(ns, 'path');
      pathEl.setAttribute('class', 'uf-path');
      pathEl.setAttribute('tabindex', '0');
      pathEl.setAttribute('role', 'button');
      pathEl.setAttribute('aria-label', `Ver resultado de ${UF_NAMES[uf] || uf}`);
      pathEl.dataset.uf = uf;
      pathEl.setAttribute('d', geometryPath(feature.geometry, project));
      pathEl.setAttribute('fill', colorFor(leaderOf(stateData.get(uf.toLowerCase()))));
      pathEl.addEventListener('click', () => renderStatePanel(uf));
      pathEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          renderStatePanel(uf);
        }
      });
      pathsGroup.appendChild(pathEl);

      const [x, y] = geometryLabelPoint(feature.geometry, project);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('class', 'uf-label');
        text.setAttribute('x', x.toFixed(2));
        text.setAttribute('y', y.toFixed(2));
        text.textContent = uf;
        labelsGroup.appendChild(text);
      }
    });

    svg.append(pathsGroup, labelsGroup);
    els.mapLoading.hidden = true;
    if (selectedUF) renderStatePanel(selectedUF);
  }

  async function refreshAll({ manual = false } = {}) {
    if (refreshInFlight) return;
    refreshInFlight = true;
    els.refreshBtn.disabled = true;
    els.statusText.textContent = manual ? 'Atualizando agora…' : 'Atualizando dados…';
    els.errorBox.hidden = true;

    try {
      await discoverElection();
      national = await fetchTSEJSON(resultUrl('br'));
      renderNational();

      try {
        geojson = await ensureGeoJSON();
      } catch (mapError) {
        console.error('Falha ao carregar mapa:', mapError);
        els.mapLoading.hidden = false;
        els.mapLoading.textContent = 'Mapa temporariamente indisponível. Os resultados abaixo continuam atualizando.';
      }

      const results = await Promise.allSettled(UFS.map(async uf => [uf, await fetchTSEJSON(resultUrl(uf))]));
      const nextStateData = new Map();
      for (const result of results) {
        if (result.status === 'fulfilled') nextStateData.set(result.value[0], result.value[1]);
      }
      stateData = nextStateData;

      renderStateLeaderSummary();
      if (geojson) renderMap();
      renderTable();

      const successful = stateData.size;
      const localTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
      els.statusText.textContent = 'Dados oficiais atualizados';
      els.statusDetail.textContent = `Atualizado às ${localTime} • ${successful}/27 UFs carregadas`;
      secondsLeft = REFRESH_SECONDS;
    } catch (error) {
      console.error(error);
      els.statusText.textContent = 'Falha temporária na atualização';
      els.statusDetail.textContent = 'Nova tentativa automática em até 60 segundos';
      els.errorMessage.textContent = `Detalhe técnico: ${error.message}. O painel tentará novamente automaticamente.`;
      els.errorBox.hidden = false;
    } finally {
      refreshInFlight = false;
      els.refreshBtn.disabled = false;
    }
  }

  function tickCountdown() {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      secondsLeft = REFRESH_SECONDS;
      refreshAll();
    }
    els.countdown.textContent = `Próxima atualização: ${secondsLeft}s`;
  }

  function shareText() {
    return 'Acompanhe a apuração presidencial de 2026 ao vivo por estado: Lula x Flávio Bolsonaro, com dados oficiais do TSE.';
  }

  async function nativeShare() {
    const data = { title: document.title, text: shareText(), url: window.location.href };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    const value = `${data.text} ${data.url}`;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
    textarea.remove();
    showToast(copied ? 'Link copiado para compartilhar.' : 'Use o endereço do navegador para compartilhar.');
  }

  function shareWhatsApp() {
    const message = encodeURIComponent(`${shareText()} ${window.location.href}`);
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  els.refreshBtn.addEventListener('click', () => refreshAll({ manual: true }));
  els.stateSearch.addEventListener('input', renderTable);
  els.shareBtn.addEventListener('click', nativeShare);
  els.whatsappBtn.addEventListener('click', shareWhatsApp);

  refreshAll();
  setInterval(tickCountdown, 1000);
})();
