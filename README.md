# Mapa da Apuração 2026 • Lula x Flávio Bolsonaro

Painel web responsivo para acompanhar o 2º turno presidencial das Eleições 2026 com dados oficiais publicados pelo TSE.

## O que a versão mobile faz

- mapa do Brasil em destaque no celular;
- cada UF recebe a cor do candidato que está liderando naquele momento;
- contador de UFs lideradas por Lula (13) e Flávio Bolsonaro (22);
- toque em um estado para ver votos, percentual e totalização local;
- resultado nacional;
- botão Compartilhar usando o compartilhamento nativo do celular;
- botão direto para WhatsApp;
- atualização automática a cada 60 segundos;
- atalho instalável na tela inicial quando hospedado em HTTPS;
- sem projeções ou estimativas próprias.

## Fonte oficial

- Configuração: `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`
- Brasil: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json`
- UF: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/{uf}/{uf}-c0001-e006258-u.json`

## Publicação recomendada: Vercel

O projeto inclui `api/tse.js`, uma função serverless que consulta apenas os endpoints eleitorais permitidos do TSE. Isso evita depender de CORS no navegador.

Configuração de deploy:

- Framework Preset: `Other` / sem framework;
- Root Directory: raiz deste projeto;
- Build Command: vazio;
- Output Directory: vazio;
- HTTPS: automático pela Vercel.

Após publicar, a URL terá formato semelhante a `https://nome-do-projeto.vercel.app` e poderá ser aberta e compartilhada normalmente no iPhone e Android.

## Arquivos principais

- `index.html`: interface;
- `styles.css`: layout desktop/mobile;
- `app.js`: mapa, atualização e compartilhamento;
- `api/tse.js`: proxy serverless para Vercel;
- `manifest.webmanifest`, `sw.js`, `icon.svg`: experiência mobile/PWA;
- `vercel.json`: cabeçalhos de segurança básicos.

## Aviso

Painel independente, sem vínculo institucional com o Tribunal Superior Eleitoral. A cor do mapa representa apenas quem está liderando no dado mais recente disponível para aquela UF; não significa resultado final até a conclusão da totalização.


## Correção do mapa v3
- O mapa agora usa a malha oficial do IBGE via `/api/map`.
- A renderização SVG é feita em JavaScript puro, sem dependência do D3.
- Há fallbacks para o IBGE direto e para o GeoJSON anterior.
- O service worker passou para network-first e o cache foi versionado como v3.
