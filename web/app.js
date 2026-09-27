/* ============================================================================
   app.js - a interface do Test_in
   ============================================================================
   Quem RODA os passos e o motor (motor.js), o mesmo que roda dentro do
   painel da plataforma - aqui com os termos neutros, com os enderecos da
   Test_in e com a arquitetura que o descobridor reconheceu. Esta tela cuida
   do resto: pastas, aplicacoes, scripts, simulacoes, andamento, resultado e
   relatorio.
============================================================================ */
(function () {
    'use strict';

    var T = window.devtools && window.devtools.testes;
    if (!T) { document.body.textContent = 'O motor de testes não carregou (motor.js).'; return; }

    /* O Test_in nao fala da plataforma: os termos do motor sao trocados. */
    T.definirTermos({
        plataforma: 'servidor da aplicação', formulario: 'tela', oFormulario: 'a tela', doFormulario: 'da tela',
        processo: 'fluxo', solicitacao: 'registro',
        widget: 'módulo', painel: 'Test_in', portal: 'site', zoom: 'campo de busca', dataset: 'fonte de dados'
    });

    var TIPOS = { fluxo: 'Tela de fluxo', modulo: 'Módulo de página', web: 'Aplicação web' };
    /* O código de três letras do canhoto, como o de um aeroporto. */
    var CODIGO = { fluxo: 'FLX', modulo: 'MOD', web: 'WEB' };
    var MARCA = { OK: '✓', FALHOU: '✗', PULADO: '–' };
    var ROTULO = { APROVADO: 'Aprovado', REPROVADO: 'Reprovado', INTERROMPIDO: 'Interrompido', NAO_EXECUTADO: 'Não executado' };

    var estado = { repos: [], pastas: [], app: null, arquivo: null, nomeArquivo: '', marcados: {}, rodada: null, resultado: null, semSimulacao: [],
                   passo: null /* { decidir } enquanto o passo a passo espera a pessoa */, passoAnterior: null };

    /* ================================================================ utilidades */
    function $(s, raiz) { return (raiz || document).querySelector(s); }
    function $$(s, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(s)); }
    function el(tag, classe, texto) {
        var e = document.createElement(tag);
        if (classe) e.className = classe;
        if (texto !== undefined && texto !== null) e.textContent = String(texto);
        return e;
    }
    function limpar(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
    function duracao(ms) {
        ms = Number(ms) || 0;
        if (ms < 1000) return ms + ' ms';
        var s = Math.round(ms / 100) / 10;
        return s < 60 ? s + ' s' : Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
    }

    function api(metodo, caminho, corpo) {
        return fetch(caminho, {
            method: metodo, credentials: 'same-origin',
            headers: corpo ? { 'Content-Type': 'application/json' } : {},
            body: corpo ? JSON.stringify(corpo) : undefined
        }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) throw new Error(j.mensagem || 'falha');
            return j.dados;
        });
    }

    function avisar(texto, tipo) {
        var caixa = $('.avisos') || document.body.appendChild(el('div', 'avisos'));
        caixa.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2000;display:flex;flex-direction:column;gap:8px;max-width:420px';
        var a = el('div', '', texto);
        a.style.cssText = 'padding:10px 14px;border-radius:8px;font-size:13px;color:#FFFFFF;background:' +
            (tipo === 'erro' ? '#CC0F10' : tipo === 'ok' ? '#0B861D' : '#213D75');
        caixa.appendChild(a);
        setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 6000);
    }

    /* ================================================================ o tema
       Claro ou escuro. Sem escolha, segue o sistema; a escolha fica neste
       navegador (preferência de tela, não configuração do app). */
    var TEMAS = ['auto', 'claro', 'escuro'];
    function aplicarTema(tema) {
        var raiz = document.documentElement;
        if (tema === 'claro') raiz.setAttribute('data-theme', 'light');
        else if (tema === 'escuro') raiz.setAttribute('data-theme', 'dark');
        else raiz.removeAttribute('data-theme');
        var b = $('[data-acao="tema"]');
        if (b) {
            b.textContent = tema === 'claro' ? '☀' : tema === 'escuro' ? '☾' : '◐';
            b.title = 'Tema: ' + (tema === 'auto' ? 'igual ao do sistema' : tema) + ' — clique para trocar';
        }
    }
    function temaSalvo() {
        try { var v = localStorage.getItem('testin-tema'); return TEMAS.indexOf(v) >= 0 ? v : 'auto'; }
        catch (e) { return 'auto'; }
    }
    function alternarTema() {
        var prox = TEMAS[(TEMAS.indexOf(temaSalvo()) + 1) % TEMAS.length];
        try { localStorage.setItem('testin-tema', prox); } catch (e) { /* sem storage: vale só agora */ }
        aplicarTema(prox);
    }
    aplicarTema(temaSalvo());

    function ir(tela) {
        $$('[data-tela]').forEach(function (s) { s.classList.toggle('tela--ativa', s.getAttribute('data-tela') === tela); });
        $$('.topo__aba').forEach(function (b) { b.classList.toggle('topo__aba--ativa', b.getAttribute('data-ir') === tela); });
    }

    /* ================================================================ pastas */
    function carregarEstado() {
        return api('GET', '/api/estado').then(function (d) {
            estado.pastas = d.pastas || [];
            $('[data-estilos]').value = d.estilosBase || '';
            pintarPastas();
            $('[data-estado]').textContent = estado.pastas.length
                ? estado.pastas.length + (estado.pastas.length === 1 ? ' pasta' : ' pastas') + (d.estiloOriginalAchado ? ' · estilos originais' : '')
                : 'nenhuma pasta configurada';
        });
    }

    function pintarPastas() {
        var ul = limpar($('[data-lista-pastas]'));
        if (!estado.pastas.length) ul.appendChild(el('li', '', 'Nenhuma pasta ainda.'));
        estado.pastas.forEach(function (p, i) {
            var li = el('li');
            li.appendChild(el('span', '', p));
            var b = el('button', 'botao botao--mini', 'Remover');
            b.type = 'button';
            b.addEventListener('click', function () {
                salvarPastas(estado.pastas.filter(function (x, j) { return j !== i; }));
            });
            li.appendChild(b);
            ul.appendChild(li);
        });
    }

    function salvarPastas(pastas) {
        return api('POST', '/api/config', { pastas: pastas }).then(function (d) {
            avisar(d.repositorios + ' repositório(s) encontrado(s).', 'ok');
            return carregarEstado().then(carregarRepos);
        }).catch(function (e) { avisar(e.message, 'erro'); });
    }

    /* ================================================================ repositorios */
    function carregarRepos() {
        var host = limpar($('[data-lista-repos]'));
        host.appendChild(el('p', 'ajuda', 'Procurando aplicações…'));
        return api('GET', '/api/repositorios').then(function (repos) {
            estado.repos = repos;
            pintarRepos();
        }).catch(function (e) { limpar(host).appendChild(el('div', 'vazio', 'Não consegui listar: ' + e.message)); });
    }

    function pintarRepos() {
        var host = limpar($('[data-lista-repos]'));
        if (!estado.repos.length) {
            host.appendChild(el('div', 'vazio', estado.pastas.length
                ? 'Nenhuma aplicação reconhecida nas pastas configuradas.'
                : 'Comece pela aba Pastas: cole o caminho onde ficam os seus repositórios.'));
            return;
        }
        estado.repos.forEach(function (r) {
            var bloco = el('div', 'repo');
            var cab = el('div', 'repo__cab');
            cab.appendChild(el('span', 'repo__nome', r.nome));
            cab.appendChild(el('span', 'repo__caminho', r.caminho));
            bloco.appendChild(cab);
            var grade = el('div', 'apps');
            if (!r.aplicacoes.length) grade.appendChild(el('div', 'ajuda', 'Só scripts de teste neste repositório.'));
            r.aplicacoes.forEach(function (a) {
                /* O CARTÃO DE EMBARQUE: o canhoto leva o código da arquitetura
                   e quantos scripts a aplicação tem; o corpo, o resto. */
                var c = el('div', 'app app--' + a.tipo);
                var canhoto = el('div', 'app__canhoto');
                canhoto.appendChild(el('span', 'app__codigo', CODIGO[a.tipo] || '---'));
                canhoto.appendChild(el('span', 'app__portao', (a.scripts || []).length + ' script' + ((a.scripts || []).length === 1 ? '' : 's')));
                c.appendChild(canhoto);
                var corpo = el('div', 'app__corpo');
                c.appendChild(corpo);
                corpo.appendChild(el('span', 'selo selo--' + a.tipo, TIPOS[a.tipo]));
                corpo.appendChild(el('div', 'app__titulo', a.titulo || a.nome));
                corpo.appendChild(el('div', 'app__rel', a.rel));
                var rod = el('div', 'app__rodape');
                rod.appendChild(el('span', 'ajuda', (a.scripts || []).length
                    ? (a.scripts.length + (a.scripts.length === 1 ? ' script de teste' : ' scripts de teste'))
                    : 'sem script de teste ainda'));
                var b = el('button', 'botao botao--principal botao--mini', 'Testar');
                b.type = 'button';
                b.addEventListener('click', function () { abrirApp(a, r); });
                rod.appendChild(b);
                corpo.appendChild(rod);
                grade.appendChild(c);
            });
            bloco.appendChild(grade);
            host.appendChild(bloco);
        });
    }

    function acharApp(id) {
        for (var i = 0; i < estado.repos.length; i++) {
            for (var j = 0; j < estado.repos[i].aplicacoes.length; j++) {
                if (estado.repos[i].aplicacoes[j].id === id) return { app: estado.repos[i].aplicacoes[j], repo: estado.repos[i] };
            }
        }
        return null;
    }

    /* ================================================================ a bancada */
    function abrirApp(app, repo) {
        estado.app = app;
        estado.repo = repo;
        estado.arquivo = null;
        estado.resultado = null;
        $('[data-app-titulo]').textContent = app.titulo || app.nome;
        var det = TIPOS[app.tipo] + '  ·  ' + repo.nome + '/' + app.rel;
        if (app.tipo === 'fluxo' && app.eventos && app.eventos.length) det += '  ·  eventos: ' + app.eventos.join(', ');
        if (app.tipo === 'modulo') det += '  ·  ' + app.recursos.js.length + ' scripts, ' + app.recursos.css.length + ' estilos';
        $('[data-app-detalhe]').textContent = det;

        var sel = limpar($('[data-scripts]'));
        var op0 = el('option', '', (app.scripts || []).length ? 'Escolha um script…' : 'Nenhum script ligado a esta aplicação');
        op0.value = '';
        sel.appendChild(op0);
        (app.scripts || []).forEach(function (s) {
            var repoDoScript = estado.repos.filter(function (x) { return x.id === s.repositorio; })[0];
            var o = el('option', '', s.nome + ' (' + s.casos + ' casos) — ' + (repoDoScript ? repoDoScript.nome + '/' : '') + s.rel);
            o.value = s.repositorio + '|' + s.rel;
            sel.appendChild(o);
        });
        pintarCasos();
        $('[data-resultado]').hidden = true;
        limpar($('[data-log]'));
        $('[data-andamento]').textContent = 'Pronto para rodar.';
        $('[data-barra]').style.width = '0%';
        $('[data-tela-teste]').src = '/__testin/tela/' + app.id;
        try { $('[data-tela-cheia]').checked = localStorage.getItem('testin-tela-cheia') === '1'; } catch (e) { /* sem storage */ }
        try { $('[data-velocidade]').value = localStorage.getItem('testin-velocidade') || '0'; } catch (e) { /* sem storage */ }
        if (!$('[data-velocidade]').value) $('[data-velocidade]').value = '0';
        ir('testin');
        if ((app.scripts || []).length === 1) {
            sel.value = sel.options[1].value;
            carregarScriptEscolhido();
        }
    }

    function carregarScriptEscolhido() {
        var v = $('[data-scripts]').value;
        if (!v) return;
        var partes = v.split('|');
        api('GET', '/api/script?repositorio=' + encodeURIComponent(partes[0]) + '&rel=' + encodeURIComponent(partes[1]))
            .then(function (d) { carregarTexto(d.texto, d.nome); })
            .catch(function (e) { avisar(e.message, 'erro'); });
    }

    function carregarTexto(texto, nome) {
        var r = T.lerArquivo(texto);
        if (r.erro) { avisar(nome + ': ' + r.erro, 'erro'); return false; }
        estado.arquivo = r;
        estado.nomeArquivo = nome;
        estado.marcados = {};
        r.casos.forEach(function (c, i) { if (!c.erros.length) estado.marcados[i] = true; });
        pintarCasos();
        return true;
    }

    function pintarCasos() {
        var host = limpar($('[data-lista-casos]'));
        var inst = $('[data-instrucoes]');
        var simEl = limpar($('[data-simulacoes]'));
        var a = estado.arquivo;
        $('[data-qtd-casos]').textContent = a ? '(' + a.casos.length + ')' : '';
        $('[data-acao="rodar"]').disabled = !a || !Object.keys(estado.marcados).some(function (k) { return estado.marcados[k]; });
        if (!a) { inst.hidden = true; host.appendChild(el('p', 'ajuda', 'Escolha um script acima.')); return; }

        inst.hidden = !a.instrucoes;
        inst.textContent = a.instrucoes || '';

        var s = a.simulacoes || {};
        var fontes = Object.keys(s.fontes || {});
        simEl.appendChild(el('div', '', ''));
        simEl.firstChild.innerHTML = '';
        simEl.firstChild.appendChild(el('strong', '', 'Dados simulados: '));
        simEl.firstChild.appendChild(document.createTextNode(fontes.length ? fontes.join(', ') : 'nenhuma fonte (as consultas voltam vazias)'));
        if (s.usuario && s.usuario.login) simEl.appendChild(el('div', '', 'Usuário: ' + s.usuario.login));
        if (s.atividade !== undefined) simEl.appendChild(el('div', '', 'Etapa ao abrir: ' + s.atividade + (s.destino !== undefined ? ' → envio para ' + s.destino : '')));

        a.casos.forEach(function (c, i) {
            var linha = el('label', 'caso');
            var chk = el('input');
            chk.type = 'checkbox';
            chk.checked = !!estado.marcados[i];
            chk.disabled = !!c.erros.length;
            chk.addEventListener('change', function () {
                estado.marcados[i] = chk.checked;
                $('[data-acao="rodar"]').disabled = !Object.keys(estado.marcados).some(function (k) { return estado.marcados[k]; });
            });
            linha.appendChild(chk);
            var meio = el('span');
            meio.appendChild(el('div', 'caso__codigo', c.caso.codigo));
            meio.appendChild(el('div', 'caso__nome', c.caso.nome));
            if (c.erros.length) meio.appendChild(el('div', 'ajuda', 'Não pode rodar: ' + c.erros[0]));
            linha.appendChild(meio);
            host.appendChild(linha);
        });
    }

    /* ================================================================ rodar */
    function mesclarSimulacoes(base, doCaso) {
        var r = JSON.parse(JSON.stringify(base || {}));
        Object.keys(doCaso || {}).forEach(function (k) {
            if (k === 'fontes') {
                r.fontes = r.fontes || {};
                Object.keys(doCaso.fontes || {}).forEach(function (f) { r.fontes[f] = doCaso.fontes[f]; });
            } else if (k === 'usuario' || k === 'websocket') {
                r[k] = Object.assign({}, r[k] || {}, doCaso[k]);
            } else {
                r[k] = doCaso[k];
            }
        });
        return r;
    }

    /* ================================================================ passo a passo
       O motor para antes de cada passo e chama perguntarPasso: o cartao mostra
       o que vai ser feito, a entrada, a saida esperada e onde (o alvo ja vem
       marcado na tela), e a Promise so resolve quando a pessoa decide. */
    function perguntarPasso(info, sim) {
        var host = limpar($('[data-passo]'));
        var ex = info.explicacao || {};
        var conferencia = ex.tipo === 'conferencia';
        host.className = 'passo' + (conferencia ? ' passo--conferencia' : '');
        host.hidden = false;

        var topo = el('div', 'passo__topo');
        topo.appendChild(el('span', '', info.caso.codigo + ' — ' + info.caso.nome));
        topo.appendChild(el('span', '', 'Passo ' + info.n + ' de ' + info.total));
        host.appendChild(topo);
        host.appendChild(el('div', 'passo__titulo', (conferencia ? 'Vai conferir: ' : 'Vai fazer: ') + info.descricao));

        var grade = el('div', 'passo__grade');
        function bloco(titulo, conteudo) {
            var b = el('div', 'passo__bloco');
            b.appendChild(el('h4', '', titulo));
            b.appendChild(typeof conteudo === 'string' ? el('p', '', conteudo) : conteudo);
            grade.appendChild(b);
        }
        bloco('O que o passo faz', ex.oQue || '—');

        var lista = el('ul', 'passo__entradas');
        (ex.entradas || []).forEach(function (e) {
            var li = el('li');
            li.appendChild(el('span', '', e.rotulo + ':'));
            li.appendChild(el('code', '', e.valor));
            lista.appendChild(li);
        });
        if (!lista.children.length) lista.appendChild(el('li', '', 'nenhuma'));
        bloco('Entrada', lista);
        bloco(conferencia ? 'Saída esperada (o que precisa ser verdade)' : 'Saída esperada', ex.esperado || '—');

        if (info.passo.acao === 'abrirPagina' || info.passo.acao === 'abrirProcesso') {
            var dados = el('ul', 'passo__entradas');
            var fontes = Object.keys((sim && sim.fontes) || {});
            if (sim && sim.usuario && sim.usuario.login) {
                var u = el('li'); u.appendChild(el('span', '', 'usuário:')); u.appendChild(el('code', '', sim.usuario.login)); dados.appendChild(u);
            }
            fontes.forEach(function (f) {
                var regras = sim.fontes[f] || [];
                var li = el('li');
                li.appendChild(el('code', '', f));
                li.appendChild(el('span', '', regras.length + ' regra(s)' +
                    (regras.some(function (r) { return r.erro; }) ? ' · inclui FALHA simulada' : '')));
                dados.appendChild(li);
            });
            if (!dados.children.length) dados.appendChild(el('li', '', 'nenhum: toda consulta volta vazia'));
            bloco('Dados simulados que a tela vai receber', dados);
        }
        if (info.alvo !== 'nenhum') {
            bloco('Onde', info.alvo === 'marcado'
                ? 'O elemento está marcado na tela com a moldura tracejada.'
                : 'O elemento ainda não está na tela: ao executar, o motor espera por ele.');
        }
        host.appendChild(grade);

        var anterior = el('div', 'passo__anterior');
        anterior.setAttribute('data-passo-anterior', '');
        host.appendChild(anterior);
        pintarAnterior(anterior);

        var acoes = el('div', 'passo__acoes');
        var executar = el('button', 'botao botao--principal', '▶ Executar este passo');
        executar.type = 'button'; executar.setAttribute('data-acao', 'passo-executar');
        var resto = el('button', 'botao', '⏭ Executar o resto sem parar');
        resto.type = 'button'; resto.setAttribute('data-acao', 'passo-resto');
        var parar = el('button', 'botao botao--parar', '■ Parar');
        parar.type = 'button'; parar.setAttribute('data-acao', 'passo-parar');
        acoes.appendChild(executar); acoes.appendChild(resto); acoes.appendChild(parar);
        acoes.appendChild(el('span', 'passo__dica', 'Enter também executa.'));
        host.appendChild(acoes);
        try { executar.focus({ preventScroll: true }); } catch (e) { /* segue */ }

        return new Promise(function (ok) {
            estado.passo = {
                decidir: function (d) {
                    estado.passo = null;
                    $$('[data-acao^="passo-"]', host).forEach(function (b) { b.disabled = true; });
                    if (d === 'resto' || d === 'parar') host.hidden = true;
                    else executar.textContent = 'Executando…';
                    ok(d);
                }
            };
        });
    }

    function pintarAnterior(host) {
        if (!host) return;
        limpar(host);
        var a = estado.passoAnterior;
        if (!a) return;
        var ok = a.passo.status === 'OK';
        host.className = 'passo__anterior ' + (ok ? 'passo__anterior--ok' : 'passo__anterior--falha');
        host.appendChild(el('div', '', (MARCA[a.passo.status] || '·') + ' Passo ' + a.passo.n + ': ' + a.passo.descricao +
            ' — ' + (ok ? 'OK' : 'FALHOU') + ' em ' + duracao(a.passo.duracaoMs) +
            (a.passo.nota ? ' (' + a.passo.nota + ')' : '')));
        if (a.passo.erro) host.appendChild(el('div', '', 'Motivo: ' + a.passo.erro));
        if (a.consultas.length) {
            var ul = el('ul', 'passo__consultas');
            a.consultas.slice(0, 40).forEach(function (c) {
                var li = el('li');
                li.appendChild(el('code', '', c.dataset + ((c.filtros || []).length ? ' · ' + c.filtros.map(function (f) { return f.campo + '=' + f.valor; }).join(' & ') : '')));
                ul.appendChild(li);
            });
            if (a.consultas.length > 40) ul.appendChild(el('li', '', '… e mais ' + (a.consultas.length - 40)));
            /* recolhida: a abertura de uma tela faz dezenas de consultas, e a
               lista aberta empurraria a tela testada para fora da vista */
            var det = el('details');
            det.appendChild(el('summary', '', 'Consultas de dados que o passo fez (' + a.consultas.length + ') — clique para ver'));
            det.appendChild(ul);
            host.appendChild(det);
        }
    }

    function fecharPasso() {
        if (estado.passo) estado.passo.decidir('parar');
        estado.passo = null;
        $('[data-passo]').hidden = true;
    }

    function linhaLog(texto, classe) {
        var log = $('[data-log]');
        var li = el('li', classe || '', texto);
        log.appendChild(li);
        if (log.children.length > 500) log.removeChild(log.firstChild);
        log.scrollTop = log.scrollHeight;
    }

    function aoEvento(tipo, d) {
        if (tipo === 'rodada:inicio') { limpar($('[data-log]')); $('[data-barra]').style.width = '0%'; }
        else if (tipo === 'caso:inicio') {
            $('[data-andamento]').textContent = 'Caso ' + (d.indice + 1) + ' de ' + d.total + ': ' + d.caso.nome;
            linhaLog('▸ ' + d.caso.codigo + ' — ' + d.caso.nome, 'log__caso');
        } else if (tipo === 'passo:fim') {
            estado.passoAnterior = { passo: d.passo, consultas: d.consultas || [] };
            if (!$('[data-passo]').hidden) pintarAnterior($('[data-passo-anterior]'));
            linhaLog('   ' + (MARCA[d.passo.status] || '·') + ' ' + d.passo.n + '. ' + d.passo.descricao +
                     (d.passo.nota ? '  (' + d.passo.nota + ')' : '') + (d.passo.erro ? '  —  ' + d.passo.erro : ''),
                     d.passo.status === 'FALHOU' ? 'log__falha' : '');
        } else if (tipo === 'caso:fim') {
            linhaLog('   ' + ROTULO[d.resultado.status] + ' em ' + duracao(d.resultado.duracaoMs),
                     d.resultado.status === 'APROVADO' ? 'log__ok' : d.resultado.status === 'REPROVADO' ? 'log__falha' : '');
            $('[data-barra]').style.width = Math.round((d.indice + 1) / d.total * 100) + '%';
        } else if (tipo === 'intervalo') {
            linhaLog('   … fechando a tela anterior (' + Math.round(d.ms / 1000) + ' s)', 'log__intervalo');
        } else if (tipo === 'pausa') {
            $('[data-andamento]').textContent = 'Pausado: a tela de teste ficou escondida. Volte para esta aba.';
        }
    }

    /* op.cameraLentaMs: sobrepoe o seletor de velocidade (o teste de ponta a
       ponta usa, para rodar devagar sem mexer na tela). */
    function rodar(op) {
        op = op || {};
        if (estado.rodada || !estado.arquivo) return Promise.resolve(null);
        var app = estado.app;
        var itens = estado.arquivo.casos.filter(function (c, i) { return estado.marcados[i] && !c.erros.length; });
        if (!itens.length) { avisar('Marque ao menos um caso.'); return Promise.resolve(null); }

        var porCodigo = {};
        itens.forEach(function (c) { porCodigo[c.caso.codigo] = c; });
        var simArquivo = estado.arquivo.simulacoes || {};
        var inicio = Date.now();

        var velocidade = $('[data-velocidade]').value;
        var passoAPasso = op.passoAPasso != null ? !!op.passoAPasso : velocidade === 'passo';
        estado.passoAnterior = null;
        if ($('[data-tela-cheia]').checked) telaCheia(true);
        $('[data-resultado]').hidden = true;
        $('[data-acao="parar"]').hidden = false;
        $('[data-acao="rodar"]').disabled = true;

        estado.rodada = new T.Rodada({
            palco: $('[data-tela-teste]'),
            arquitetura: app.tipo,
            alvo: { id: estado.arquivo.alvo || app.id, nome: app.titulo || app.nome },
            casos: itens.map(function (c) { return c.caso; }),
            cfg: { pausaEntreCasosMs: 600,
                   cameraLentaMs: op.cameraLentaMs != null ? Number(op.cameraLentaMs) : (passoAPasso ? 600 : (Number(velocidade) || 0)),
                   passoAPasso: passoAPasso },
            antesDoPasso: function (info) {
                var c = porCodigo[info.caso.codigo];
                return perguntarPasso(info, mesclarSimulacoes(simArquivo, c && c.simulacoes));
            },
            enderecos: {
                processo: function (fluxo) { return '/__testin/tela/' + app.id + '?fluxo=' + encodeURIComponent(fluxo); },
                pagina: function (pg) {
                    if (pg === '.' || app.tipo !== 'web') return '/__testin/tela/' + app.id;
                    return '/__app/' + app.id + '/' + encodeURIComponent(pg);
                }
            },
            antesDoCaso: function (caso) {
                var s = mesclarSimulacoes(simArquivo, porCodigo[caso.codigo] && porCodigo[caso.codigo].simulacoes);
                if (app.tipo === 'fluxo' && !s.fluxo) {
                    var abre = caso.passos[0];
                    if (abre && abre.processo) s.fluxo = abre.processo;
                }
                return api('POST', '/api/simulacoes', { simulacoes: s });
            },
            consultarDataset: function (nome, coluna, valor) {
                return fetch('/__testin/dados', {
                    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: nome, restricoes: coluna ? [{ campo: coluna, valor: valor, tipo: 1 }] : [] })
                }).then(function (r) { return r.json(); }).then(function (j) {
                    if (j.erro) throw new Error(j.erro);
                    return j.values || [];
                });
            },
            aoEvento: aoEvento
        });

        return estado.rodada.rodar().then(function (res) {
            fecharPasso();
            estado.rodada = null;
            estado.resultado = res;
            $('[data-acao="parar"]').hidden = true;
            $('[data-acao="rodar"]').disabled = false;
            $('[data-andamento]').textContent = (res.situacao === 'INTERROMPIDA' ? 'Interrompida' : 'Concluída') + ' em ' + duracao(res.duracaoMs);
            return api('GET', '/api/pedidos?desde=' + inicio).then(function (d) {
                var vistos = {};
                estado.semSimulacao = (d.pedidos || []).filter(function (p) {
                    if (p.simulado || vistos[p.nome]) return false;
                    vistos[p.nome] = true;
                    return true;
                });
            }, function () { estado.semSimulacao = []; }).then(function () {
                pintarResultado(res);
                return res;
            });
        }, function (e) {
            fecharPasso();
            estado.rodada = null;
            $('[data-acao="parar"]').hidden = true;
            $('[data-acao="rodar"]').disabled = false;
            avisar('O motor parou: ' + e.message, 'erro');
            return null;
        });
    }

    /* ================================================================ tela cheia */
    function telaCheia(ligar) {
        var palco = $('[data-palco]');
        palco.classList.toggle('palco--cheio', !!ligar);
        $('[data-acao="tela-cheia"]').textContent = ligar ? '✕ Sair da tela cheia' : '⛶ Tela cheia';
        try {
            var ativo = document.fullscreenElement;
            if (ligar && !ativo && palco.requestFullscreen) palco.requestFullscreen().catch(function () { /* fica a sobreposição */ });
            else if (!ligar && ativo && document.exitFullscreen) document.exitFullscreen();
        } catch (e) { /* sem a API: fica a sobreposição */ }
    }

    /* ================================================================ o resultado */
    function pintarResultado(res) {
        var host = limpar($('[data-resultado]'));
        host.hidden = false;
        var r = res.resumo;
        var kpis = el('div', 'kpis');
        [['Aprovados', r.aprovados, 'ok'], ['Reprovados', r.reprovados, r.reprovados ? 'erro' : ''],
         ['Não executados', r.naoExecutados, ''], ['Duração', duracao(res.duracaoMs), 'azul']].forEach(function (k) {
            var d = el('div', 'kpi' + (k[2] ? ' kpi--' + k[2] : ''));
            d.appendChild(el('div', 'kpi__rotulo', k[0]));
            d.appendChild(el('div', 'kpi__valor', k[1]));
            kpis.appendChild(d);
        });
        host.appendChild(kpis);

        var barra = el('div', 'linha');
        var baixar = el('button', 'botao botao--principal', 'Baixar relatório (HTML)');
        baixar.type = 'button';
        baixar.addEventListener('click', baixarRelatorio);
        barra.appendChild(baixar);
        var js = el('button', 'botao', 'Baixar resultado (.json)');
        js.type = 'button';
        js.addEventListener('click', function () { baixar2(nomeBase() + '.json', JSON.stringify(res, null, 2), 'application/json'); });
        barra.appendChild(js);
        host.appendChild(barra);

        if (estado.semSimulacao.length) {
            var painel = el('div', 'painel sem-simulacao');
            painel.style.marginTop = '12px';
            painel.appendChild(el('div', 'painel__titulo', 'Fontes consultadas sem simulação (' + estado.semSimulacao.length + ')'));
            painel.appendChild(el('p', 'ajuda', 'A tela consultou estas fontes e recebeu resposta vazia. Um modelo para colar em "simulacoes" no arquivo de teste:'));
            var modelo = { fontes: {} };
            estado.semSimulacao.forEach(function (p) {
                if (p.via === 'http') return;
                var quando = {};
                (p.filtros || []).forEach(function (f) { quando[f.campo] = f.valor; });
                modelo.fontes[p.nome] = [{ quando: quando, linhas: [] }];
            });
            var pre = el('pre', '', JSON.stringify(modelo, null, 2));
            painel.appendChild(pre);
            var http = estado.semSimulacao.filter(function (p) { return p.via === 'http'; });
            if (http.length) painel.appendChild(el('p', 'ajuda', 'Endereços da plataforma sem emulação: ' + http.map(function (p) { return p.nome; }).join(', ')));
            host.appendChild(painel);
        }

        (res.casos || []).forEach(function (c) {
            var d = el('details', 'res');
            if (c.status === 'REPROVADO') d.open = true;
            var s = el('summary');
            s.appendChild(el('span', 'marca marca--' + c.status, ROTULO[c.status]));
            s.appendChild(el('span', 'caso__codigo', c.codigo));
            s.appendChild(el('span', 'res__nome', c.nome));
            s.appendChild(el('span', 'ajuda', duracao(c.duracaoMs)));
            d.appendChild(s);
            var ol = el('ol', 'passos');
            (c.passos || []).forEach(function (p) {
                var li = el('li', 'passo--' + p.status, (MARCA[p.status] || '·') + ' ' + p.descricao + (p.nota ? '  · ' + p.nota : ''));
                if (p.erro) li.appendChild(el('div', 'passo__erro', p.erro));
                ol.appendChild(li);
            });
            d.appendChild(ol);
            function lista(titulo, itens) {
                if (!itens || !itens.length) return;
                d.appendChild(el('div', 'sub', titulo));
                var ul = el('ul', 'itens');
                itens.forEach(function (t) { ul.appendChild(el('li', '', t)); });
                d.appendChild(ul);
            }
            lista('Erros de JavaScript', c.errosConsole);
            lista('Alertas', c.alertas);
            lista('Notificações', c.notificacoes);
            lista('Chamadas de dados', (c.chamadas || []).map(function (ch) {
                return ch.dataset + (ch.filtros.length ? '  (' + ch.filtros.map(function (f) { return f.campo + '=' + f.valor; }).join(', ') + ')' : '');
            }));
            if (c.retrato && c.retrato.campos && c.retrato.campos.length) {
                d.appendChild(el('div', 'sub', 'Campos quando falhou'));
                var t = el('table', 'campos');
                c.retrato.campos.forEach(function (f) {
                    var tr = el('tr');
                    tr.appendChild(el('td', 'caso__codigo', f.nome));
                    tr.appendChild(el('td', '', f.valor));
                    tr.appendChild(el('td', 'ajuda', (f.visivel ? 'visível' : 'oculto') + (f.bloqueado ? ' · bloqueado' : '')));
                    t.appendChild(tr);
                });
                d.appendChild(t);
            }
            host.appendChild(d);
        });
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function nomeBase() {
        var n = String((estado.app && estado.app.nome) || 'teste').replace(/[^A-Za-z0-9_.-]+/g, '_');
        var d = new Date();
        function p(x) { return (x < 10 ? '0' : '') + x; }
        return 'relatorio-' + n + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
    }

    function metaDoRelatorio() {
        var a = estado.app || {};
        return {
            aplicacao: { titulo: a.titulo || a.nome, nome: a.nome, tipo: TIPOS[a.tipo] || '', caminho: (estado.repo ? estado.repo.nome + '/' : '') + (a.rel || '') },
            script: estado.nomeArquivo,
            semSimulacao: estado.semSimulacao,
            simulacoes: estado.arquivo ? estado.arquivo.simulacoes : null,
            navegador: navigator.userAgent,
            geradoEm: new Date().toLocaleString('pt-BR')
        };
    }

    function baixar2(nome, texto, tipo) {
        var blob = new Blob([texto], { type: tipo });
        var url = URL.createObjectURL(blob);
        var a = el('a');
        a.href = url; a.download = nome; a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.parentNode.removeChild(a); }, 500);
    }

    function baixarRelatorio() {
        if (!estado.resultado) return;
        baixar2(nomeBase() + '.html', window.TestinRelatorio.gerar(estado.resultado, metaDoRelatorio()), 'text/html');
    }

    /* ================================================================ ligacoes */
    document.addEventListener('click', function (e) {
        var alvo = e.target.closest ? e.target.closest('[data-ir], [data-acao]') : null;
        if (!alvo) return;
        var irPara = alvo.getAttribute('data-ir');
        if (irPara) { ir(irPara); return; }
        var acao = alvo.getAttribute('data-acao');
        if (acao === 'atualizar') carregarRepos();
        else if (acao === 'adicionar-pasta') {
            var v = $('[data-nova-pasta]').value.trim();
            if (!v) return;
            salvarPastas(estado.pastas.concat([v])).then(function () { $('[data-nova-pasta]').value = ''; });
        } else if (acao === 'salvar-estilos') {
            api('POST', '/api/config', { estilosBase: $('[data-estilos]').value }).then(function () {
                avisar('Salvo.', 'ok');
                carregarEstado();
            }).catch(function (e2) { avisar(e2.message, 'erro'); });
        } else if (acao === 'abrir-arquivo') $('[data-arquivo]').click();
        else if (acao === 'rodar') { conferirVersao(); rodar(); }
        else if (acao === 'parar' && estado.rodada) {
            estado.rodada.parar(); alvo.textContent = 'parando…';
            if (estado.passo) estado.passo.decidir('parar');
        }
        else if (/^passo-/.test(acao) && estado.passo) estado.passo.decidir(acao.substring(6));
        else if (acao === 'tema') alternarTema();
        else if (acao === 'tela-cheia') telaCheia(!$('[data-palco]').classList.contains('palco--cheio'));
    });

    $('[data-scripts]').addEventListener('change', carregarScriptEscolhido);
    $('[data-arquivo]').addEventListener('change', function () {
        var f = this.files && this.files[0];
        if (!f) return;
        var leitor = new FileReader();
        leitor.onload = function () { carregarTexto(String(leitor.result || ''), f.name); };
        leitor.readAsText(f, 'UTF-8');
        this.value = '';
    });
    $('[data-velocidade]').addEventListener('change', function () {
        try { localStorage.setItem('testin-velocidade', this.value); } catch (e) { /* sem storage */ }
    });
    $('[data-tela-cheia]').addEventListener('change', function () {
        try { localStorage.setItem('testin-tela-cheia', this.checked ? '1' : '0'); } catch (e) { /* sem storage */ }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && $('[data-palco]').classList.contains('palco--cheio')) telaCheia(false);
        /* Enter executa o passo - quando o foco nao esta num campo do Test_in */
        if (e.key === 'Enter' && estado.passo && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(String(e.target.tagName))) {
            e.preventDefault(); estado.passo.decidir('executar');
        }
    });
    document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement && $('[data-palco]').classList.contains('palco--cheio')) {
            $('[data-palco]').classList.remove('palco--cheio');
            $('[data-acao="tela-cheia"]').textContent = '⛶ Tela cheia';
        }
    });

    /* O token fica no cookie; na barra de endereco ele so atrapalha (vai
       para o historico e aparece em print). */
    if (/[?&]t=/.test(location.search)) history.replaceState(null, '', '/');

    /* Para automacao (e para quem quiser rodar pelo console). */
    window.testin = {
        abrirApp: function (id) { var x = acharApp(id); if (x) abrirApp(x.app, x.repo); return !!x; },
        carregarTexto: carregarTexto,
        rodar: rodar,
        passo: {
            pendente: function () { return !!estado.passo; },
            decidir: function (d) { if (estado.passo) { estado.passo.decidir(d || 'executar'); return true; } return false; }
        },
        relatorio: function () { return estado.resultado ? window.TestinRelatorio.gerar(estado.resultado, metaDoRelatorio()) : ''; },
        estado: estado
    };

    /* O Test_in aberto ANTES de uma atualizacao continua com o servidor velho.
       Confere ao abrir e a cada rodada; a faixa fica ate reabrir. */
    function conferirVersao() {
        return api('GET', '/api/versao').then(function (v) {
            if (!v.desatualizada || $('.faixa-versao')) return;
            var f = el('div', 'faixa-versao', 'O Test_in foi atualizado depois de aberto. Feche a janela preta do Test_in e abra de novo: até lá, parte das correções não vale.');
            document.body.insertBefore(f, document.body.firstChild);
        }).catch(function () { /* sem resposta: segue */ });
    }

    /* A abertura sai quando as aplicacoes chegam - mas fica ao menos o tempo
       da entrada do logo, para nao piscar numa maquina rapida. */
    var ABERTURA_MIN = 1100;
    function fecharAbertura() {
        var a = $('[data-abertura]');
        if (!a) return;
        setTimeout(function () {
            a.classList.add('abertura--saindo');
            setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 700);
        }, Math.max(0, ABERTURA_MIN - performance.now()));
    }

    carregarEstado().then(carregarRepos).then(function () {
        if (!estado.pastas.length) ir('pastas');
        conferirVersao();
    }).then(fecharAbertura, fecharAbertura);
}());
