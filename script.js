const STATUS_ICONE = {
    OK: '✓',
    ATENCAO: '!',
    ERRO: '×',
    NA: '—'
};

const STATUS_CLASS = {
    OK: 'ok',
    ATENCAO: 'atencao',
    ERRO: 'erro',
    NA: 'na'
};

const ETAPAS = [
    ['vpn', '1. VPN'],
    ['ssh_wocc51', '2. SSH WOCC51'],
    ['ssh_destino', '3. SSH destino'],
    ['arquivo_original', '4. Arquivo original'],
    ['descriptografia', '5. Descriptografia'],
    ['distribuicao_wocc', '6. Distribuição WOCC'],
    ['mis', '7. Entrega MIS'],
    ['cmk', '8. Entrega CMK']
];

const SVG_NS = 'http://www.w3.org/2000/svg';
let carteiras = [];
let filtroStatusAtual = 'TODOS';
let somAtivo = true;
let atualizando = false;
let errosConhecidos = new Set();

document.addEventListener('DOMContentLoaded', () => {
    inicializarEventos();
    inicializarRelogio();
    atualizarPainel();
    window.setInterval(atualizarPainel, 15000);
});

function inicializarEventos() {
    document.getElementById('btn-sound').addEventListener('click', toggleSom);
    document.getElementById('btn-refresh').addEventListener('click', () => atualizarPainel({ manual: true }));
    document.getElementById('btn-clear-log').addEventListener('click', limparLogsTerminal);
    document.getElementById('btn-fechar-modal').addEventListener('click', fecharModal);
    document.getElementById('input-busca').addEventListener('input', renderizarCarteiras);

    document.querySelectorAll('.btn-filter').forEach((botao) => {
        botao.addEventListener('click', () => {
            filtroStatusAtual = botao.dataset.status;
            document.querySelectorAll('.btn-filter').forEach((item) => {
                const ativo = item === botao;
                item.classList.toggle('active', ativo);
                item.setAttribute('aria-pressed', String(ativo));
            });
            renderizarCarteiras();
        });
    });

    const modal = document.getElementById('modal-gaveta');
    modal.addEventListener('click', (evento) => {
        if (evento.target === modal) fecharModal();
    });
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && !modal.classList.contains('hidden')) fecharModal();
    });
}

function inicializarRelogio() {
    const horarioAtual = document.getElementById('horario-atual');
    const atualizarHorario = () => {
        horarioAtual.textContent = `🕒 ${new Date().toLocaleTimeString('pt-BR')}`;
    };
    atualizarHorario();
    window.setInterval(atualizarHorario, 1000);
}

function toggleSom() {
    somAtivo = !somAtivo;
    const botao = document.getElementById('btn-sound');
    botao.textContent = somAtivo ? '🔊 Som On' : '🔇 Som Off';
    botao.setAttribute('aria-label', somAtivo ? 'Desativar som' : 'Ativar som');
}

function tocarAlertaSonoro() {
    if (!somAtivo) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    let audioCtx;
    try {
        audioCtx = new AudioCtor();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.onended = () => audioCtx.close();
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.35);
    } catch (erro) {
        if (audioCtx) audioCtx.close();
        console.error('Erro ao reproduzir alerta sonoro:', erro);
    }
}

async function atualizarPainel({ manual = false } = {}) {
    if (atualizando) return;
    atualizando = true;
    const botao = document.getElementById('btn-refresh');
    botao.disabled = true;
    botao.textContent = '↻ Atualizando...';

    try {
        const resposta = await fetch('/api/status-geral', {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000)
        });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const dados = await resposta.json();
        if (!Array.isArray(dados.carteiras)) {
            throw new Error('Resposta da API sem a lista de carteiras.');
        }

        carteiras = dados.carteiras;
        renderizarKpis(carteiras);
        renderizarCarteiras();
        renderizarTopologia(dados.topologia);
        renderizarPainelOperacional(carteiras);
        document.getElementById('ultima-atualizacao').textContent =
            `${manual ? 'Atualização concluída' : 'Última consulta'}: ${dados.horario_consulta || new Date().toLocaleString('pt-BR')}`;

        const modoDemo = dados.modo_demonstracao === true;
        document.querySelector('.mode-badge').textContent =
            modoDemo ? 'MODO DEMONSTRAÇÃO' : 'MONITORAMENTO';
        document.querySelector('.notice-banner').hidden = !modoDemo;
        if (manual) {
            adicionarLogTerminal(modoDemo
                ? 'Consulta manual concluída. Os dados exibidos são cenários estáticos de demonstração.'
                : 'Consulta manual concluída; painel atualizado com os dados recebidos.', 'ok');
        }

        const novosErros = new Set();
        carteiras.forEach((carteira) => {
            Object.entries(carteira.etapas || {}).forEach(([etapa, detalhe]) => {
                if (detalhe?.status === 'ERRO') novosErros.add(`${carteira.id}:${etapa}`);
            });
        });
        const errosNovos = [...novosErros].filter((erro) => !errosConhecidos.has(erro));
        if (!modoDemo && errosNovos.length) {
            tocarAlertaSonoro();
            adicionarLogTerminal(`Detectadas ${errosNovos.length} nova(s) falha(s) na esteira.`, 'erro');
        }
        errosConhecidos = novosErros;
    } catch (erro) {
        console.error('Falha ao atualizar painel:', erro);
        document.getElementById('ultima-atualizacao').textContent = 'Falha na consulta; exibindo última leitura disponível.';
        adicionarLogTerminal(`Falha ao consultar a API${manual ? ' durante a atualização manual' : ''}: ${erro.message}`, 'erro');
        if (!carteiras.length) {
            document.getElementById('radar-vazio').textContent =
                'Sem dados da API. Inicie o servidor e abra o painel por http://127.0.0.1:8000/.';
            document.getElementById('radar-vazio').hidden = false;
            renderizarEstadoVazio('Não foi possível carregar os dados. Verifique se o servidor está disponível.');
        }
    } finally {
        atualizando = false;
        botao.disabled = false;
        botao.textContent = '↻ Atualizar';
    }
}

function statusGeral(carteira) {
    const status = Object.values(carteira.etapas || {}).map((etapa) => etapa?.status || 'NA');
    if (status.includes('ERRO')) return 'ERRO';
    if (status.includes('ATENCAO')) return 'ATENCAO';
    if (!status.length || status.includes('NA')) return 'NA';
    return 'OK';
}

function renderizarKpis(lista) {
    const resumo = { OK: 0, ATENCAO: 0, ERRO: 0, NA: 0 };
    lista.forEach((carteira) => { resumo[statusGeral(carteira)] += 1; });
    document.getElementById('kpi-total').textContent = String(lista.length);
    document.getElementById('kpi-demo').textContent = String(lista.filter((item) => item.demonstracao).length);
    document.getElementById('kpi-ok').textContent = String(resumo.OK);
    document.getElementById('kpi-atencao').textContent = String(resumo.ATENCAO);
    document.getElementById('kpi-erro').textContent = String(resumo.ERRO);
}

function renderizarPainelOperacional(lista) {
    renderizarOcorrencias(lista);
    renderizarArquivoSantander(lista.find((carteira) => carteira.principal || carteira.id === 'SANTANDER'));
    renderizarDuracaoHistorico(lista);
}

function renderizarTopologia(topologia) {
    const container = document.getElementById('topologia-fluxo');
    container.replaceChildren();
    const fluxos = Array.isArray(topologia?.fluxos) ? topologia.fluxos : [];

    if (!fluxos.length) {
        const vazio = document.createElement('p');
        vazio.className = 'panel-empty';
        vazio.textContent = 'Topologia ainda não configurada.';
        container.appendChild(vazio);
        return;
    }

    fluxos.forEach((fluxo) => {
        const linha = document.createElement('article');
        linha.className = 'topology-flow';

        const cabecalho = document.createElement('div');
        cabecalho.className = 'topology-flow-heading';
        const rotulo = document.createElement('span');
        rotulo.className = 'topology-flow-label';
        rotulo.textContent = fluxo.rotulo || 'FLUXO';
        const origem = document.createElement('strong');
        origem.className = 'topology-origin';
        origem.textContent = fluxo.origem || 'Origem não configurada';
        cabecalho.append(rotulo, origem);

        const caminho = document.createElement('div');
        caminho.className = 'topology-path';
        const nos = Array.isArray(fluxo.nos) ? fluxo.nos : [];
        nos.forEach((no, indice) => {
            if (indice > 0) {
                const seta = document.createElement('span');
                seta.className = 'topology-arrow';
                seta.setAttribute('aria-hidden', 'true');
                seta.textContent = '→';
                caminho.appendChild(seta);
            }
            const bloco = document.createElement('div');
            bloco.className = `topology-node${indice === nos.length - 1 ? ' topology-destination' : ''}`;
            const nome = document.createElement('strong');
            nome.textContent = no.nome || 'Ambiente não configurado';
            const detalhe = document.createElement('span');
            detalhe.textContent = no.detalhe || 'Detalhe não informado';
            bloco.append(nome, detalhe);
            caminho.appendChild(bloco);
        });
        linha.append(cabecalho, caminho);
        container.appendChild(linha);
    });
}

function renderizarOcorrencias(lista) {
    const ocorrencias = [];
    lista.forEach((carteira) => {
        ETAPAS.forEach(([chave, nomeEtapa]) => {
            const etapa = carteira.etapas?.[chave];
            if (etapa?.status === 'ERRO' || etapa?.status === 'ATENCAO') {
                ocorrencias.push({ carteira, chave, nomeEtapa, etapa });
            }
        });
    });
    ocorrencias.sort((a, b) => {
        const prioridade = { ERRO: 0, ATENCAO: 1 };
        return prioridade[a.etapa.status] - prioridade[b.etapa.status];
    });

    document.getElementById('total-ocorrencias').textContent = String(ocorrencias.length);
    const listaElemento = document.getElementById('lista-ocorrencias');
    listaElemento.replaceChildren();

    if (!ocorrencias.length) {
        const mensagem = document.createElement('p');
        mensagem.className = 'panel-empty';
        mensagem.textContent = lista.some((carteira) => Object.values(carteira.etapas || {}).some((etapa) => etapa?.status !== 'NA'))
            ? 'Nenhuma falha ou atenção identificada nesta leitura.'
            : 'Sem alertas identificados; as etapas ainda não têm dados operacionais.';
        listaElemento.appendChild(mensagem);
        return;
    }

    ocorrencias.slice(0, 8).forEach(({ carteira, chave, nomeEtapa, etapa }) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `incident-item ${STATUS_CLASS[etapa.status]}`;
        item.setAttribute('aria-label', `${etapa.status}: ${carteira.nome}, ${nomeEtapa}. Abrir detalhes.`);

        const indicador = document.createElement('span');
        indicador.className = `incident-indicator ${STATUS_CLASS[etapa.status]}`;
        indicador.textContent = STATUS_ICONE[etapa.status];

        const texto = document.createElement('span');
        texto.className = 'incident-copy';
        const titulo = document.createElement('strong');
        titulo.textContent = `${carteira.nome || 'Carteira'} · ${nomeEtapa}`;
        const descricao = document.createElement('span');
        descricao.textContent = etapa.mensagem || 'Ocorrência sem descrição.';
        texto.append(titulo, descricao);

        const estado = document.createElement('span');
        estado.className = `incident-status ${STATUS_CLASS[etapa.status]}`;
        estado.textContent = etapa.status;
        item.append(indicador, texto, estado);
        item.addEventListener('click', () => abrirModalDetalhes(carteira));
        listaElemento.appendChild(item);
    });
}

function renderizarArquivoSantander(carteira) {
    const arquivo = carteira?.arquivo_monitorado || {};
    const prazoMs = arquivo.prazo_em ? Date.parse(arquivo.prazo_em) : NaN;
    const recebidoMs = arquivo.recebido_em ? Date.parse(arquivo.recebido_em) : NaN;
    const temPrazo = Number.isFinite(prazoMs);
    const recebido = Number.isFinite(recebidoMs);
    let status = 'NA';
    let rotulo = 'SEM DADOS';

    if (recebido) {
        status = temPrazo && recebidoMs > prazoMs ? 'ATENCAO' : 'OK';
        rotulo = status === 'OK' ? 'RECEBIDO' : 'RECEBIDO COM ATRASO';
    } else if (temPrazo && prazoMs < Date.now()) {
        status = 'ERRO';
        rotulo = 'ATRASADO';
    } else if (temPrazo) {
        status = 'ATENCAO';
        rotulo = 'AGUARDANDO';
    }

    const badge = document.getElementById('status-arquivo-santander');
    badge.className = `status-badge-main ${STATUS_CLASS[status]}`;
    badge.textContent = rotulo;
    document.getElementById('arquivo-janela').textContent =
        arquivo.janela_esperada || (temPrazo ? new Date(prazoMs).toLocaleString('pt-BR') : 'Não configurada');
    document.getElementById('arquivo-nome').textContent = arquivo.nome_arquivo || 'Sem registro';
    document.getElementById('arquivo-horario').textContent =
        recebido ? new Date(recebidoMs).toLocaleString('pt-BR') : 'Sem registro';
    document.getElementById('arquivo-idade').textContent =
        recebido ? formatarDuracao(Math.max(0, Math.floor((Date.now() - recebidoMs) / 1000))) : 'Sem registro';

    const nota = document.getElementById('arquivo-nota');
    nota.textContent = carteira
        ? (carteira.demonstracao
            ? 'Acompanhamento demonstrativo. Atraso só será calculado após configurar o prazo e integrar a pasta/servidor de recebimento.'
            : 'Acompanhe o prazo configurado e o registro real de chegada do arquivo.')
        : 'Carteira Santander não encontrada na resposta da API.';
}

function formatarDuracao(segundos) {
    if (!Number.isFinite(segundos) || segundos < 0) return 'Sem dados';
    const total = Math.floor(segundos);
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const resto = total % 60;
    if (horas) return `${horas}h ${minutos}min`;
    if (minutos) return `${minutos}min ${resto}s`;
    return `${resto}s`;
}

function renderizarDuracaoHistorico(lista) {
    const duracoes = [];
    const historico = [];
    lista.forEach((carteira) => {
        Object.entries(carteira.etapas || {}).forEach(([chave, etapa]) => {
            if (Number.isFinite(etapa?.duracao_segundos) && etapa.duracao_segundos >= 0) {
                const nome = ETAPAS.find(([id]) => id === chave)?.[1] || chave;
                duracoes.push({ carteira: carteira.nome, etapa: nome, segundos: etapa.duracao_segundos });
            }
        });
        (carteira.historico_execucoes || []).forEach((execucao) => historico.push({ carteira, execucao }));
    });

    const resumo = document.getElementById('resumo-duracao');
    resumo.replaceChildren();
    if (!duracoes.length) {
        const titulo = document.createElement('strong');
        titulo.textContent = 'Sem dados de duração';
        const nota = document.createElement('span');
        nota.textContent = 'As etapas ainda não enviam horários de início/fim.';
        resumo.append(titulo, nota);
    } else {
        const valores = duracoes.map((item) => item.segundos);
        const media = valores.reduce((soma, item) => soma + item, 0) / valores.length;
        const titulo = document.createElement('strong');
        titulo.textContent = `Média por etapa: ${formatarDuracao(media)}`;
        const nota = document.createElement('span');
        nota.textContent = `${duracoes.length} etapa(s) com duração registrada`;
        resumo.append(titulo, nota);

        duracoes.sort((a, b) => b.segundos - a.segundos);
        duracoes.slice(0, 3).forEach((item) => {
            const linha = document.createElement('div');
            linha.className = 'duration-row';
            linha.textContent = `${item.carteira} · ${item.etapa}: ${formatarDuracao(item.segundos)}`;
            resumo.appendChild(linha);
        });
    }

    historico.sort((a, b) => Date.parse(b.execucao.fim || b.execucao.inicio || '') - Date.parse(a.execucao.fim || a.execucao.inicio || ''));
    const historicoElemento = document.getElementById('historico-execucoes');
    historicoElemento.replaceChildren();
    if (!historico.length) {
        const vazio = document.createElement('p');
        vazio.className = 'panel-empty';
        vazio.textContent = 'Histórico indisponível até a integração dos eventos de execução.';
        historicoElemento.appendChild(vazio);
        return;
    }

    historico.slice(0, 5).forEach(({ carteira, execucao }) => {
        const linha = document.createElement('div');
        linha.className = 'history-row';
        const info = document.createElement('span');
        const data = execucao.fim || execucao.inicio;
        info.textContent = `${carteira.nome} · ${data ? new Date(data).toLocaleString('pt-BR') : 'Horário não informado'}`;
        const duracao = document.createElement('strong');
        duracao.textContent = formatarDuracao(execucao.duracao_segundos);
        linha.append(info, duracao);
        historicoElemento.appendChild(linha);
    });
}

function renderizarCarteiras() {
    const busca = document.getElementById('input-busca').value.trim().toLocaleLowerCase('pt-BR');
    const filtradas = carteiras.filter((carteira) => {
        const texto = [carteira.nome, carteira.id, carteira.ambiente?.wocc, carteira.ambiente?.departamento]
            .join(' ').toLocaleLowerCase('pt-BR');
        return (filtroStatusAtual === 'TODOS' || statusGeral(carteira) === filtroStatusAtual)
            && (!busca || texto.includes(busca));
    });
    const container = document.getElementById('container-carteiras');
    container.replaceChildren();
    renderizarRadar(filtradas);

    if (!filtradas.length) {
        renderizarEstadoVazio('Nenhuma carteira encontrada com os filtros atuais.');
        return;
    }
    const fragmento = document.createDocumentFragment();
    filtradas.forEach((carteira) => fragmento.appendChild(criarCardCarteira(carteira)));
    container.appendChild(fragmento);
}

function renderizarRadar(lista) {
    const camada = document.getElementById('radar-pontos');
    const mensagemVazia = document.getElementById('radar-vazio');
    camada.replaceChildren();
    mensagemVazia.hidden = lista.length > 0;

    if (!lista.length) return;

    const centro = lista.find((carteira) => carteira.principal) || lista[0];
    const orbitais = lista.filter((carteira) => carteira !== centro);
    criarPontoRadar(camada, centro, 300, 250, true);

    const raio = orbitais.length <= 3 ? 145 : 160;
    orbitais.forEach((carteira, indice) => {
        const angulo = (-90 + (360 / orbitais.length) * indice) * (Math.PI / 180);
        criarPontoRadar(
            camada,
            carteira,
            300 + Math.cos(angulo) * raio,
            250 + Math.sin(angulo) * raio,
            false
        );
    });
}

function criarPontoRadar(camada, carteira, x, y, principal) {
    const status = statusGeral(carteira);
    const classe = STATUS_CLASS[status] || 'na';
    const ponto = document.createElementNS(SVG_NS, 'g');
    ponto.setAttribute('class', `radar-node ${classe}${principal ? ' is-primary' : ''}`);
    ponto.setAttribute('transform', `translate(${x} ${y})`);
    ponto.setAttribute('role', 'button');
    ponto.setAttribute('tabindex', '0');
    ponto.setAttribute('aria-label', `${carteira.nome || 'Carteira'}, status ${status}. Abrir detalhes.`);

    const titulo = document.createElementNS(SVG_NS, 'title');
    titulo.textContent = `${carteira.nome || 'Carteira'} — ${status}. Abrir detalhes`;
    ponto.appendChild(titulo);

    const circuloOrbita = document.createElementNS(SVG_NS, 'circle');
    circuloOrbita.setAttribute('class', 'radar-node-orbit');
    circuloOrbita.setAttribute('r', principal ? '24' : '19');
    ponto.appendChild(circuloOrbita);

    const pulso = document.createElementNS(SVG_NS, 'circle');
    pulso.setAttribute('class', 'radar-node-pulse');
    pulso.setAttribute('r', principal ? '11' : '9');
    ponto.appendChild(pulso);

    const marcador = document.createElementNS(SVG_NS, 'circle');
    marcador.setAttribute('class', 'radar-node-core');
    marcador.setAttribute('r', principal ? '6' : '5');
    ponto.appendChild(marcador);

    const rotulo = document.createElementNS(SVG_NS, 'text');
    rotulo.setAttribute('class', 'radar-node-label');
    rotulo.setAttribute('text-anchor', 'middle');
    rotulo.setAttribute('y', principal ? '42' : '37');
    rotulo.textContent = carteira.nome || 'Carteira';
    ponto.appendChild(rotulo);

    const statusRotulo = document.createElementNS(SVG_NS, 'text');
    statusRotulo.setAttribute('class', 'radar-node-status');
    statusRotulo.setAttribute('text-anchor', 'middle');
    statusRotulo.setAttribute('y', principal ? '57' : '51');
    statusRotulo.textContent = principal ? `PRINCIPAL · ${status}` : status;
    ponto.appendChild(statusRotulo);

    ponto.addEventListener('click', () => abrirModalDetalhes(carteira));
    ponto.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            abrirModalDetalhes(carteira);
        }
    });
    camada.appendChild(ponto);
}

function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caractere]);
}

function renderizarEstadoVazio(mensagem) {
    const container = document.getElementById('container-carteiras');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⌕</div><h3>Sem dados por aqui</h3><p>${escaparHTML(mensagem)}</p></div>`;
}

function criarCardCarteira(carteira) {
    const card = document.createElement('article');
    const status = statusGeral(carteira);
    const classe = STATUS_CLASS[status] || 'na';
    card.className = `carteira-card border-${classe}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Abrir detalhes de ${carteira.nome || 'carteira'}`);
    card.addEventListener('click', () => abrirModalDetalhes(carteira));
    card.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            abrirModalDetalhes(carteira);
        }
    });

    const etapasHTML = ETAPAS.map(([chave, titulo]) => criarStepHTML(titulo, carteira.etapas?.[chave])).join('');
    const ambiente = carteira.ambiente || {};
    card.innerHTML = `
        <div class="carteira-header">
            <div class="carteira-title-wrap">
                <h3 class="carteira-title">${escaparHTML(carteira.nome || 'Carteira sem nome')}</h3>
                <span class="badge-tag">${escaparHTML(carteira.id || 'Sem ID')}</span>
                ${carteira.principal ? '<span class="badge-tag badge-principal">Principal</span>' : ''}
            </div>
            <span class="status-badge-main ${classe}">${STATUS_ICONE[status]} ${status}</span>
        </div>
        <div class="environment-line">
            Destino: <strong>${escaparHTML(ambiente.wocc || 'WOCC não configurada')}</strong>
            <span>·</span> Departamento: <strong>${escaparHTML(ambiente.departamento || 'Não configurado')}</strong>
            <span>·</span> Frequência: <strong>${escaparHTML(carteira.frequencia || 'Não informada')}</strong>
        </div>
        <div class="pipeline-grid">${etapasHTML}</div>
    `;
    return card;
}

function criarStepHTML(titulo, etapa) {
    const dados = etapa || { status: 'NA', mensagem: 'Sem configuração ou dado recebido.' };
    const estado = STATUS_CLASS[dados.status] ? dados.status : 'NA';
    const classe = STATUS_CLASS[estado];
    return `
        <div class="step-card ${classe}">
            <div class="step-header">
                <span class="step-title">${escaparHTML(titulo)}</span>
                <span class="step-label ${classe}">${STATUS_ICONE[estado]} ${estado}</span>
            </div>
            <p class="step-msg">${escaparHTML(dados.mensagem || 'Sem mensagem')}</p>
            ${dados.atualizado_em ? `<small>Atualizado: ${escaparHTML(dados.atualizado_em)}</small>` : ''}
        </div>
    `;
}

function abrirModalDetalhes(carteira) {
    const status = statusGeral(carteira);
    const corpo = document.getElementById('modal-corpo');
    document.getElementById('modal-titulo').textContent = carteira.nome || 'Detalhes da carteira';

    const linhas = ETAPAS.map(([chave, rotulo]) => {
        const etapa = carteira.etapas?.[chave] || { status: 'NA', mensagem: 'Sem configuração ou dado recebido.' };
        const estado = STATUS_CLASS[etapa.status] ? etapa.status : 'NA';
        return `<article class="detail-row">
            <div class="detail-label"><span class="step-label ${STATUS_CLASS[estado]}">${STATUS_ICONE[estado]} ${estado}</span><strong>${escaparHTML(rotulo)}</strong></div>
            <p class="detail-value">${escaparHTML(etapa.mensagem || 'Sem mensagem')}</p>
            ${etapa.atualizado_em ? `<small>Atualizado: ${escaparHTML(etapa.atualizado_em)}</small>` : ''}
        </article>`;
    }).join('');
    const ambiente = carteira.ambiente || {};
    corpo.innerHTML = `
        <div class="modal-grid">
            <div class="modal-field"><strong>ID</strong><span>${escaparHTML(carteira.id || 'Não configurado')}</span></div>
            <div class="modal-field"><strong>Status geral</strong><span class="color-${STATUS_CLASS[status]}">${status}</span></div>
            <div class="modal-field"><strong>Arquivo esperado</strong><span>${escaparHTML(carteira.arquivo_esperado || 'Padrão não configurado')}</span></div>
            <div class="modal-field"><strong>WOCC / VM</strong><span>${escaparHTML(ambiente.wocc || 'Não configurada')}</span></div>
            <div class="modal-field"><strong>Departamento</strong><span>${escaparHTML(ambiente.departamento || 'Não configurado')}</span></div>
            <div class="modal-field"><strong>Diretório local</strong><span>${escaparHTML(ambiente.diretorio || 'Não configurado')}</span></div>
        </div>
        <div class="detail-list">${linhas}</div>
    `;
    const modal = document.getElementById('modal-gaveta');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('btn-fechar-modal').focus();
}

function fecharModal() {
    const modal = document.getElementById('modal-gaveta');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}

function adicionarLogTerminal(mensagem, tipo = 'system') {
    const body = document.getElementById('terminal-body');
    const linha = document.createElement('p');
    linha.className = `log-entry ${tipo}`;
    linha.textContent = `[${new Date().toLocaleTimeString('pt-BR')}] ${mensagem}`;
    body.appendChild(linha);
    while (body.children.length > 60) body.firstElementChild.remove();
    body.scrollTop = body.scrollHeight;
}

function limparLogsTerminal() {
    document.getElementById('terminal-body').replaceChildren();
}
