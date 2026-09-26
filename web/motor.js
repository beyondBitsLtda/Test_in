/* ============================================================================
 * motorTestes.js - DevTools Kit DELP
 * ============================================================================
 * O MOTOR DOS TESTES DE TELA.
 *
 * Roda um caso de teste DENTRO DO NAVEGADOR de quem clicou: abre a tela do
 * Fluig num quadro (iframe) da propria aba, preenche, clica e confere - como
 * uma pessoa faria, so que sem esquecer nenhum passo.
 *
 * -----------------------------------------------------------------------------
 * POR QUE NO NAVEGADOR, E NAO NO SERVIDOR
 *
 * O caminho classico (Playwright, Selenium) roda no servidor e pede duas
 * coisas que aqui custam caro: instalar pacote novo no servidor e guardar a
 * senha de um usuario de teste la. Este motor nao precisa de nenhuma das duas:
 *
 *   - a widget e a tela testada estao no MESMO endereco do Fluig, entao o
 *     navegador deixa a widget ler e mexer na tela do quadro;
 *   - a sessao e a de quem clicou. Nao ha senha guardada em lugar nenhum.
 *
 * O preco, dito com todas as letras: so roda com alguem com a aba aberta, nao
 * troca de usuario no meio (aprovacao em cadeia fica de fora) e as
 * solicitacoes criadas ficam no nome de quem testou. Por isso: HOMOLOGACAO.
 *
 * -----------------------------------------------------------------------------
 * O CASO NAO E CODIGO
 *
 * Um caso e uma lista de passos de um VOCABULARIO FECHADO (abaixo). Nao existe
 * passo "rodar este JavaScript", e isso e a decisao mais importante do
 * arquivo: a rodada age no Fluig com a sessao de quem clicou, e um caso que
 * carregasse codigo seria um jeito de agir em nome de QUALQUER pessoa que
 * abrisse a aba. O dataset recusa acao desconhecida ao gravar; o motor recusa
 * de novo ao rodar.
 *
 * O vocabulario existe em DOIS lugares - aqui e no dsDevToolsTestes - e o
 * teste de mesa confere que os dois dizem a mesma coisa.
 *
 * Namespace: devtools.testes
 * ============================================================================ */
(function (global) {
    'use strict';

    var devtools = global.devtools = global.devtools || {};
    var testes = devtools.testes = devtools.testes || {};

    /* ========================================================================
       OS AJUSTES
       Os seletores do zoom e das mensagens sao do estilo do Fluig e podem
       mudar entre versoes - por isso estao aqui, com nome, e nao espalhados
       pelo codigo. Se o zoom parar de funcionar depois de uma atualizacao do
       Fluig, e aqui que se olha primeiro.
       ====================================================================== */
    var PADRAO = {
        esperaMs: 10000,            /* quanto um passo espera a tela responder */
        esperaZoomMs: 15000,        /* o zoom consulta dataset: e mais lento */
        carregarMs: 45000,          /* abrir uma pagina do portal */
        casoMs: 180000,             /* teto de um caso inteiro */
        intervaloMs: 100,
        pausaEntrePassosMs: 200,    /* um respiro para os eventos do formulario */
        /* ENTRE UM CASO E OUTRO a tela sai para uma pagina em branco e espera.
           Formulario com sessao colaborativa (WebSocket, como o
           gestaoOperacionalFS) se desconecta no beforeunload, e o servidor de
           sessao leva um instante para liberar o usuario. Reabrir na hora
           fazia a nova conexao ser recusada ("action informado nao e valido",
           "Sessao fechada...") e o formulario recarregar no meio do teste.
           Visto na rodada real de 25/09. */
        pausaEntreCasosMs: 3000,
        /* Depois que o formulario carrega, um respiro para os scripts dele
           montarem a tela (o zoom, por exemplo, troca o campo original). */
        assentarMs: 800,
        /* CAMERA LENTA: 0 = normal. Com um valor (ms), cada passo aparece
           numa legenda na tela testada, o elemento e destacado antes de o
           motor mexer nele, o texto e digitado letra a letra e o que foi
           conferido pisca em verde. So o RITMO muda: os eventos disparados
           e o resultado sao os mesmos da velocidade normal. */
        cameraLentaMs: 0,
        /* PASSO A PASSO: para antes de cada passo e espera op.antesDoPasso. */
        passoAPasso: false,
        textoEnviar: 'Enviar',
        seletores: {
            /* O zoom do Fluig muda de componente conforme a versao: o de
               formulario e o bootstrap-tagsinput + typeahead (o campo vira um
               <select> com as tags ao lado); em outras telas aparece o
               select2. O motor reconhece os dois - qualquer classe da lista. */
            zoomContainer: 'bootstrap-tagsinput twitter-typeahead select2',
            zoomSelecao: '.select2-selection',
            zoomBusca: 'input.tt-input, .select2-search__field',
            zoomOpcao: '.tt-suggestion, .select2-results__option',
            zoomEscolhido: '.tag, .select2-selection__choice',
            clicaveis: 'button, a, input[type=button], input[type=submit], [role=button], .btn',
            raizWidget: '.super-widget, .wcm-widget-class, [data-params]',
            camposNomeados: 'input[name], select[name], textarea[name]',
            mensagens: '.alert, .toast, .fluig-toast, .help-block, .text-danger, .modal-body'
        }
    };

    /* ========================================================================
       OS TERMOS
       O motor roda em dois lugares: dentro do DevTools Kit (no Fluig) e na
       Bancada de Testes, avulsa, que nao fala da plataforma. Tudo o que a
       pessoa LE - rotulo, ajuda, descricao do passo, mensagem de erro - passa
       por aqui, com {termo} no lugar da palavra. Quem roda o motor troca os
       termos por definirTermos(), e o resto do codigo nem fica sabendo.
       ====================================================================== */
    var TERMOS_PADRAO = {
        plataforma: 'Fluig',
        formulario: 'formulário',
        oFormulario: 'o formulário',
        doFormulario: 'do formulário',
        processo: 'processo',
        solicitacao: 'solicitação',
        widget: 'widget',
        painel: 'DevTools Kit',
        portal: 'portal',
        zoom: 'zoom',
        dataset: 'dataset'
    };
    var termos = mesclarRaso(TERMOS_PADRAO, {});

    function mesclarRaso(a, b) {
        var r = {}, k;
        for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) r[k] = a[k];
        for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) r[k] = String(b[k]);
        return r;
    }

    function T(texto) {
        return String(texto).replace(/\{(\w+)\}/g, function (m, k) {
            return Object.prototype.hasOwnProperty.call(termos, k) ? termos[k] : m;
        });
    }

    /* ========================================================================
       O VOCABULARIO
       ====================================================================== */
    var TIPOS = {
        /* O campo e o name ou o id. Para tela sem name nem id (comum em
           widget), "@atributo=valor" acha pelo atributo - ex.:
           @data-devtools-busca=aplicacoes. */
        campo: function (v) {
            return RE_CAMPO.test(v) ? '' :
                'use o name ou o id do campo (letras, números e _ . - : [ ]), ou @atributo=valor';
        },
        id: function (v) {
            return /^[A-Za-z0-9_.\-]{1,80}$/.test(v) ? '' : 'use só letras, números e _ . -';
        },
        texto: function (v) {
            if (v.length > 500) return 'até 500 caracteres';
            return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v) ? 'sem caracteres de controle' : '';
        },
        numero: function (v) {
            return (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 60) ? '' : 'um número inteiro de 1 a 60';
        }
    };

    var RE_CAMPO = /^(@[A-Za-z_][A-Za-z0-9_-]{0,59}(=[A-Za-z0-9_.\-: ]{0,60})?|[A-Za-z0-9_.\-:\[\]]{1,80})$/;

    function C(nome, rotulo, tipo, opcional) {
        return { nome: nome, rotulo: rotulo, tipo: tipo, obrigatorio: !opcional };
    }
    var CAMPO = C('campo', 'Campo (name)', 'campo');

    var VOCABULARIO = [
        { acao: 'abrirProcesso', rotulo: 'Abrir {processo}', campos: [C('processo', 'Código do {processo}', 'id')],
          ajuda: 'Abre a tela que inicia o {processo}. Todo caso começa abrindo alguma coisa.',
          descrever: function (p) { return T('Abrir o {processo} ') + p.processo; },
          executar: function (ctx, p) {
              var t0 = Date.now();
              return navegar(ctx, ctx.rodada.endereco('processo', p.processo))
                  .then(function () { return esperarFormulario(ctx); })
                  .then(function () {
                      return 'carregou em ' + (Math.round((Date.now() - t0) / 100) / 10) + ' s';
                  });
          } },

        { acao: 'abrirPagina', rotulo: 'Abrir página', campos: [C('pagina', 'Código da página', 'id')],
          ajuda: 'Abre uma página do {portal} pelo código dela. ' +
                 'Use "." para a página principal do que está sendo testado.',
          descrever: function (p) {
              return p.pagina === '.' ? T('Abrir a página principal') : 'Abrir a página ' + p.pagina;
          },
          executar: function (ctx, p) {
              /* "." = a pagina principal: no DevTools Kit, a propria pagina
                 onde ele esta aberto; na Bancada, a pagina da aplicacao
                 testada. E o que deixa o mesmo arquivo rodar em qualquer
                 ambiente, sem saber de antemao o codigo da pagina. */
              var url = ctx.rodada.endereco('pagina', p.pagina);
              if (!url) throw new Error('Não consegui descobrir qual é a página principal.');
              return navegar(ctx, url)
                  .then(function () { return p.pagina === '.' ? 'página ' + url.split('?')[0].split('/').pop() : ''; });
          } },

        { acao: 'preencher', rotulo: 'Preencher campo', campos: [CAMPO, C('valor', 'Valor', 'texto', true)],
          ajuda: 'Digita o valor no campo e dispara os eventos (input, change, blur), como uma pessoa faria.',
          descrever: function (p) { return 'Preencher ' + p.campo + ' ← "' + (p.valor || '') + '"'; },
          executar: function (ctx, p) {
              return acharCampoEditavel(ctx, p.campo).then(function (el) {
                  if (el.tagName.toUpperCase() === 'SELECT') {
                      throw new Error('"' + p.campo + '" é uma lista de opções — use o passo "Selecionar opção".');
                  }
                  return destacar(ctx, el);
              }).then(function (el) {
                  return digitarParaVer(ctx, el, p.valor || '').then(function () { return el; });
              }).then(function (el) {
                  try { el.focus(); } catch (e) { /* segue */ }
                  var focou = el.ownerDocument.activeElement === el;
                  definirValor(el, p.valor || '');
                  disparar(el, 'input');
                  disparar(el, 'change');
                  /* UM blur, como uma pessoa. Se o foco foi mesmo para o campo,
                     sair dele com blur() gera o blur/focusout verdadeiros; um
                     sintetico A MAIS faria o campo "sair" duas vezes - e
                     mascara que formata ao sair formatava duas vezes
                     ("1000" -> "1.000,00" -> "1,00"). Visto na Bancada, 26/09.
                     O sintetico so entra quando o navegador nao deixou focar. */
                  if (focou) { try { el.blur(); } catch (e2) { /* segue */ } }
                  if (!focou || el.ownerDocument.activeElement === el) {
                      disparar(el, 'blur', false);
                      disparar(el, 'focusout');
                  }
              });
          } },

        { acao: 'selecionar', rotulo: 'Selecionar opção', campos: [CAMPO, C('valor', 'Opção (valor ou texto)', 'texto')],
          ajuda: 'Escolhe uma opção de uma lista (select), pelo valor ou pelo texto que aparece.',
          descrever: function (p) { return 'Selecionar "' + p.valor + '" em ' + p.campo; },
          executar: function (ctx, p) {
              return acharCampoEditavel(ctx, p.campo).then(function (el) {
                  if (el.tagName.toUpperCase() !== 'SELECT') {
                      throw new Error('"' + p.campo + '" não é uma lista de opções.');
                  }
                  return destacar(ctx, el);
              }).then(function (el) {
                  var alvo = normalizar(p.valor), achado = -1, vistas = [];
                  for (var i = 0; i < el.options.length; i++) {
                      var o = el.options[i];
                      vistas.push(textoDe(o) || o.value);
                      if (o.value === p.valor || normalizar(textoDe(o)) === alvo) { achado = i; break; }
                  }
                  if (achado < 0) {
                      throw new Error('Não há a opção "' + p.valor + '" em ' + p.campo +
                                      '. Opções: ' + vistas.slice(0, 12).join(' | '));
                  }
                  el.selectedIndex = achado;
                  disparar(el, 'change');
              });
          } },

        { acao: 'marcar', rotulo: 'Marcar', campos: [CAMPO, C('valor', 'Valor da opção (rádio)', 'texto', true)],
          ajuda: 'Marca uma caixa de seleção. Para botão de rádio, informe o valor da opção.',
          descrever: function (p) { return 'Marcar ' + p.campo + (p.valor ? ' = ' + p.valor : ''); },
          executar: function (ctx, p) { return alternar(ctx, p, true); } },

        { acao: 'desmarcar', rotulo: 'Desmarcar', campos: [CAMPO],
          ajuda: 'Desmarca uma caixa de seleção.',
          descrever: function (p) { return 'Desmarcar ' + p.campo; },
          executar: function (ctx, p) { return alternar(ctx, p, false); } },

        { acao: 'selecionarZoom', rotulo: 'Escolher no {zoom}', campos: [CAMPO, C('busca', 'Texto a buscar', 'texto')],
          ajuda: 'Abre o {zoom} do campo, busca o texto e escolhe a primeira opção que o contém.',
          descrever: function (p) { return 'Buscar "' + p.busca + T('" no {zoom} ') + p.campo; },
          executar: function (ctx, p) { return escolherNoZoom(ctx, p); } },

        { acao: 'clicar', rotulo: 'Clicar', campos: [C('alvo', 'Texto do botão (ou campo:nome)', 'texto')],
          ajuda: 'Clica no botão ou link com este texto. Para clicar num campo, use "campo:nomeDoCampo".',
          descrever: function (p) { return 'Clicar em "' + p.alvo + '"'; },
          executar: function (ctx, p) { return clicar(ctx, p.alvo); } },

        { acao: 'enviar', rotulo: 'Enviar {solicitacao}', campos: [],
          ajuda: 'Clica no botão Enviar.',
          descrever: function () { return T('Enviar {solicitacao}'); },
          executar: function (ctx) { return clicar(ctx, ctx.cfg.textoEnviar); } },

        { acao: 'esperar', rotulo: 'Esperar', campos: [C('segundos', 'Segundos', 'numero')],
          ajuda: 'Pausa fixa. Prefira um passo "Conferir": ele espera só o necessário.',
          descrever: function (p) { return 'Esperar ' + p.segundos + ' s'; },
          executar: function (ctx, p) { return dormirVigiando(ctx, Number(p.segundos) * 1000); } },

        { acao: 'conferirTexto', rotulo: 'Conferir texto na tela', campos: [C('texto', 'Texto esperado', 'texto')],
          ajuda: 'Espera o texto aparecer em qualquer parte visível da tela.',
          descrever: function (p) { return 'Conferir que a tela mostra "' + p.texto + '"'; },
          executar: function (ctx, p) {
              var alvo = normalizar(p.texto);
              var ondeAchou = '';
              return esperarAte(ctx, function () {
                  if (ctx.notificacoes.some(function (n) { return normalizar(n).indexOf(alvo) >= 0; })) {
                      ondeAchou = 'numa notificação da tela';
                      return true;
                  }
                  return janelas(ctx).some(function (w) {
                      return normalizar(textoVisivel(w.document.body)).indexOf(alvo) >= 0;
                  });
              }, function () {
                  return 'O texto "' + p.texto + '" não apareceu na tela.' +
                      (ctx.notificacoes.length ? ' Notificações vistas: ' + ctx.notificacoes.slice(-3).join(' | ') : '');
              }).then(function () { return ondeAchou; });
          } },

        { acao: 'conferirCampo', rotulo: 'Conferir valor do campo', campos: [CAMPO, C('valor', 'Valor esperado', 'texto', true)],
          ajuda: 'Confere o valor do campo. Em lista, vale o valor ou o texto da opção; em caixa, "sim" ou "não".',
          descrever: function (p) { return 'Conferir ' + p.campo + ' = "' + (p.valor || '') + '"'; },
          executar: function (ctx, p) {
              var esperado = String(p.valor || '').replace(/^\s+|\s+$/g, '');
              var visto = null;
              return esperarAte(ctx, function () {
                  var el = acharCampo(ctx, p.campo);
                  if (!el) return false;
                  var candidatos = valoresDe(el);
                  visto = candidatos[0];
                  return candidatos.some(function (c) { return String(c).replace(/^\s+|\s+$/g, '') === esperado; });
              }, function () {
                  return visto === null
                      ? 'Não achei o campo "' + p.campo + '" na tela.'
                      : 'Esperado "' + esperado + '", encontrado "' + visto + '" em ' + p.campo + '.';
              }).then(nada);
          } },

        { acao: 'conferirVisivel', rotulo: 'Conferir que aparece', campos: [CAMPO],
          ajuda: 'Confere que o campo está visível (regras de exibição {doFormulario}).',
          descrever: function (p) { return 'Conferir que ' + p.campo + ' aparece'; },
          executar: function (ctx, p) {
              return esperarAte(ctx, function () { return visivel(acharCampo(ctx, p.campo)); },
                  'O campo "' + p.campo + '" não está visível.').then(nada);
          } },

        { acao: 'conferirOculto', rotulo: 'Conferir que está oculto', campos: [CAMPO],
          ajuda: 'Confere que o campo NÃO aparece (ou não existe na tela).',
          descrever: function (p) { return 'Conferir que ' + p.campo + ' está oculto'; },
          executar: function (ctx, p) {
              return esperarAte(ctx, function () { return !visivel(acharCampo(ctx, p.campo)); },
                  'O campo "' + p.campo + '" continua visível.').then(nada);
          } },

        { acao: 'conferirBloqueado', rotulo: 'Conferir que está bloqueado', campos: [CAMPO],
          ajuda: 'Confere que o campo não pode ser editado (desabilitado ou somente leitura).',
          descrever: function (p) { return 'Conferir que ' + p.campo + ' está bloqueado'; },
          executar: function (ctx, p) {
              return esperarAte(ctx, function () {
                  var el = acharCampo(ctx, p.campo);
                  return el && bloqueado(el);
              }, 'O campo "' + p.campo + '" está editável (ou não existe).').then(nada);
          } },

        { acao: 'conferirEditavel', rotulo: 'Conferir que está editável', campos: [CAMPO],
          ajuda: 'Confere que o campo pode ser editado.',
          descrever: function (p) { return 'Conferir que ' + p.campo + ' está editável'; },
          executar: function (ctx, p) {
              return esperarAte(ctx, function () {
                  var el = acharCampo(ctx, p.campo);
                  return el && !bloqueado(el);
              }, 'O campo "' + p.campo + '" está bloqueado (ou não existe).').then(nada);
          } },

        { acao: 'conferirAlerta', rotulo: 'Conferir alerta', campos: [C('texto', 'Texto do alerta', 'texto')],
          ajuda: 'Confere que a tela mostrou um alerta do navegador (alert/confirm) com este texto. Os alertas são aceitos sozinhos.',
          descrever: function (p) { return 'Conferir alerta com "' + p.texto + '"'; },
          executar: function (ctx, p) {
              var alvo = normalizar(p.texto);
              return esperarAte(ctx, function () {
                  return ctx.alertas.some(function (a) { return normalizar(a).indexOf(alvo) >= 0; });
              }, function () {
                  return 'Nenhum alerta com "' + p.texto + '".' +
                      (ctx.alertas.length ? ' Alertas vistos: ' + ctx.alertas.slice(-3).join(' | ') : '');
              }).then(nada);
          } },

        { acao: 'conferirSemErroNoConsole', rotulo: 'Conferir sem erro de JavaScript', campos: [],
          ajuda: 'Falha se a tela registrou algum erro de JavaScript até aqui.',
          descrever: function () { return 'Conferir que a tela não teve erro de JavaScript'; },
          executar: function (ctx) {
              if (ctx.errosConsole.length) {
                  throw new Error(ctx.errosConsole.length + ' erro(s) de JavaScript. Primeiro: ' + ctx.errosConsole[0]);
              }
          } },

        { acao: 'conferirDataset', rotulo: 'Conferir {dataset}',
          campos: [C('dataset', '{dataset}', 'id'), C('coluna', 'Coluna', 'id'),
                   C('valor', 'Valor esperado', 'texto'), C('filtro', 'Filtro (coluna=valor)', 'texto', true)],
          ajuda: 'Faz a consulta e confere que alguma linha tem a coluna com o valor esperado.',
          descrever: function (p) {
              return 'Conferir ' + p.dataset + '.' + p.coluna + ' = "' + p.valor + '"' +
                     (p.filtro ? ' (filtro ' + p.filtro + ')' : '');
          },
          executar: function (ctx, p) { return conferirDataset(ctx, p); } },

        { acao: 'conferirChamada', rotulo: 'Conferir chamada de {dataset}',
          campos: [C('dataset', '{dataset}', 'id'), C('filtro', 'Filtro (campo=valor)', 'texto', true)],
          ajuda: 'Confere que a tela FEZ a consulta ({dataset}), com o filtro se informado, desde o começo do caso. ' +
                 'É o jeito de testar "gravou?" e "buscou?" sem olhar o banco.',
          descrever: function (p) {
              return 'Conferir que a tela consultou ' + p.dataset + (p.filtro ? ' com ' + p.filtro : '');
          },
          executar: function (ctx, p) { return conferirChamada(ctx, p); } }
    ];

    var POR_ACAO = {};
    VOCABULARIO.forEach(function (d) { POR_ACAO[d.acao] = d; });

    var ABERTURAS = ['abrirProcesso', 'abrirPagina'];

    /* ========================================================================
       VALIDAR E NORMALIZAR UM CASO
       Devolve { caso, erros }. O caso volta LIMPO: so as chaves que o
       vocabulario conhece, em texto. Chave estranha nao chega ao banco.
       ====================================================================== */
    function normalizarCaso(bruto) {
        var erros = [];
        var b = bruto || {};
        var caso = {
            codigo: String(b.codigo || '').replace(/^\s+|\s+$/g, ''),
            nome: String(b.nome || '').replace(/^\s+|\s+$/g, ''),
            dados: {},
            passos: []
        };

        if (!/^[A-Za-z0-9_.\-]{1,60}$/.test(caso.codigo)) {
            erros.push('Código: use de 1 a 60 caracteres entre letras, números e _ . -');
        }
        if (!caso.nome || caso.nome.length > 200) erros.push('Nome: obrigatório, até 200 caracteres.');

        var dados = (b.dados && typeof b.dados === 'object') ? b.dados : {};
        var chaves = Object.keys(dados);
        if (chaves.length > 50) erros.push('Dados: no máximo 50.');
        chaves.forEach(function (k) {
            var v = String(dados[k] == null ? '' : dados[k]);
            if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) erros.push('Dado "' + k + '": nome só com letras, números e _.');
            else if (v.length > 500) erros.push('Dado "' + k + '": até 500 caracteres.');
            else caso.dados[k] = v;
        });

        var passos = Object.prototype.toString.call(b.passos) === '[object Array]' ? b.passos : [];
        if (!passos.length) erros.push('O caso precisa de pelo menos um passo.');
        if (passos.length > 80) erros.push('No máximo 80 passos por caso.');

        passos.slice(0, 80).forEach(function (bp, i) {
            var n = i + 1;
            var def = POR_ACAO[bp && bp.acao];
            if (!def) { erros.push('Passo ' + n + ': ação desconhecida "' + (bp && bp.acao) + '".'); return; }
            var p = { acao: def.acao };
            def.campos.forEach(function (c) {
                var v = bp[c.nome] == null ? '' : String(bp[c.nome]);
                if (!v) {
                    if (c.obrigatorio) erros.push('Passo ' + n + ' (' + def.rotulo + '): informe "' + c.rotulo + '".');
                    return;
                }
                var problema = TIPOS[c.tipo](v);
                if (problema) { erros.push('Passo ' + n + ' (' + c.rotulo + '): ' + problema + '.'); return; }
                if (c.tipo === 'texto') {
                    var faltando = chavesUsadas(v).filter(function (k) {
                        return !caso.dados.hasOwnProperty(k) && !EMBUTIDOS.hasOwnProperty(k);
                    });
                    if (faltando.length) {
                        erros.push('Passo ' + n + ': {{' + faltando[0] + '}} não está nos dados do caso.');
                    }
                }
                p[c.nome] = v;
            });
            caso.passos.push(p);
        });

        /* Todo caso comeca abrindo alguma coisa. Sem isso, ele rodaria em cima
           da tela que o caso ANTERIOR deixou - e passaria ou falharia por
           causa do vizinho, que e o teste mais dificil de entender que existe. */
        if (caso.passos.length && ABERTURAS.indexOf(caso.passos[0].acao) < 0) {
            erros.push('O primeiro passo precisa ser "' + T(POR_ACAO.abrirProcesso.rotulo) + '" ou "' +
                       T(POR_ACAO.abrirPagina.rotulo) + '".');
        }

        return { caso: caso, erros: erros };
    }

    /* ========================================================================
       OS DADOS DO CASO: {{chave}}
       ====================================================================== */
    var EMBUTIDOS = { hoje: 1, agora: 1, marca: 1 };

    function chavesUsadas(texto) {
        var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, m, lista = [];
        while ((m = re.exec(texto)) !== null) lista.push(m[1]);
        return lista;
    }

    function valoresEmbutidos(agora) {
        function p(n) { return (n < 10 ? '0' : '') + n; }
        var d = agora || new Date();
        var hoje = p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
        var hora = hoje + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        /* A "marca" existe para achar depois as solicitacoes que o teste
           criou: ponha {{marca}} num campo de observacao. */
        return { hoje: hoje, agora: hora, marca: '[TESTE ' + hora + ']' };
    }

    function interpolar(texto, dados, embutidos) {
        return String(texto).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (m, k) {
            if (dados && Object.prototype.hasOwnProperty.call(dados, k)) return String(dados[k]);
            if (embutidos && Object.prototype.hasOwnProperty.call(embutidos, k)) return String(embutidos[k]);
            throw new Error('{{' + k + '}} não está nos dados do caso.');
        });
    }

    function interpolarPasso(passo, dados, embutidos) {
        var def = POR_ACAO[passo.acao];
        var p = { acao: passo.acao };
        def.campos.forEach(function (c) {
            if (passo[c.nome] == null) return;
            p[c.nome] = c.tipo === 'texto' ? interpolar(passo[c.nome], dados, embutidos) : String(passo[c.nome]);
        });
        return p;
    }

    function descrever(passo) {
        var def = POR_ACAO[passo && passo.acao];
        if (!def) return String(passo && passo.acao);
        try { return def.descrever(passo); } catch (e) { return def.rotulo; }
    }

    /* O QUE O PASSO DEVE PRODUZIR, em palavras - para o modo passo a passo
       mostrar, ANTES de executar, a entrada e a saida esperada. */
    function segundos(ms) { return Math.round(ms / 1000) + ' s'; }
    var ESPERADO = {
        abrirProcesso: function () { return T('A tela do {processo} abre e termina de carregar.'); },
        abrirPagina: function () { return 'A página abre e termina de carregar.'; },
        preencher: function (p) { return 'O campo fica com "' + (p.valor || '') + '" (uma máscara pode formatar) e a tela reage à digitação.'; },
        selecionar: function (p) { return 'A opção "' + p.valor + '" fica escolhida e a tela reage à troca.'; },
        marcar: function () { return 'A caixa fica marcada.'; },
        desmarcar: function () { return 'A caixa fica desmarcada.'; },
        selecionarZoom: function (p) { return 'Uma opção que contém "' + p.busca + '" fica escolhida no campo.'; },
        clicar: function () { return 'A tela reage ao clique (abre, filtra, navega...). O efeito é conferido nos passos seguintes.'; },
        enviar: function () { return 'O botão Enviar é acionado e a tela valida o envio.'; },
        esperar: function (p) { return 'Nada muda: só uma pausa de ' + p.segundos + ' s.'; },
        conferirTexto: function (p, cfg) { return 'O texto "' + p.texto + '" aparece na tela (o motor espera até ' + segundos(cfg.esperaMs) + '). Se não aparecer, o passo falha.'; },
        conferirCampo: function (p, cfg) { return 'O campo ' + p.campo + ' está com "' + (p.valor || '') + '" (espera até ' + segundos(cfg.esperaMs) + ').'; },
        conferirVisivel: function (p) { return 'O campo ' + p.campo + ' aparece na tela.'; },
        conferirOculto: function (p) { return 'O campo ' + p.campo + ' NÃO aparece (ou não existe na tela).'; },
        conferirBloqueado: function (p) { return 'O campo ' + p.campo + ' não pode ser editado.'; },
        conferirEditavel: function (p) { return 'O campo ' + p.campo + ' pode ser editado.'; },
        conferirAlerta: function (p) { return 'A tela mostrou um alerta com "' + p.texto + '".'; },
        conferirSemErroNoConsole: function () { return 'Nenhum erro de JavaScript desde o começo do caso.'; },
        conferirDataset: function (p) { return 'Alguma linha de ' + p.dataset + ' tem ' + p.coluna + ' = "' + p.valor + '"' + (p.filtro ? ' (filtro ' + p.filtro + ')' : '') + '.'; },
        conferirChamada: function (p) { return 'A tela consultou ' + p.dataset + (p.filtro ? ' com o filtro ' + p.filtro : '') + ' desde o começo do caso.'; }
    };
    function explicar(passo, cfg) {
        var def = POR_ACAO[passo && passo.acao];
        if (!def) return { acao: String(passo && passo.acao), tipo: 'acao', oQue: '', entradas: [], esperado: '' };
        var entradas = (def.campos || []).filter(function (c) {
            return passo[c.nome] != null && String(passo[c.nome]) !== '';
        }).map(function (c) { return { rotulo: T(c.rotulo), valor: String(passo[c.nome]) }; });
        var esperado = '';
        try { esperado = ESPERADO[def.acao] ? ESPERADO[def.acao](passo, cfg || PADRAO) : ''; } catch (e) { esperado = ''; }
        return { acao: T(def.rotulo), tipo: /^conferir/.test(def.acao) ? 'conferencia' : 'acao',
                 oQue: T(def.ajuda || ''), entradas: entradas, esperado: esperado };
    }

    /* ========================================================================
       A RODADA
       ====================================================================== */
    /**
     * @param {Object} op
     *   palco        o <iframe> onde a tela abre
     *   portal       prefixo do portal, ex.: "/portal/p/1"
     *   paginaAtual  o codigo da pagina onde o DevTools Kit esta (para o "." do abrirPagina)
     *   alvo         { id, nome }
     *   casos        casos JA normalizados (normalizarCaso)
     *   aoEvento     function (tipo, dados) - a tela acompanha por aqui
     *   consultarDataset  function (nome, colunaFiltro, valorFiltro) -> Promise<Array>
     *   antesDoPasso function (info) -> Promise<'executar'|'resto'|'parar'> - so com cfg.passoAPasso
     *   cfg          ajustes por cima do PADRAO
     */
    function Rodada(op) {
        this.cfg = mesclar(PADRAO, op.cfg || {});
        this.palco = op.palco;
        this.portal = String(op.portal || '/portal/p/1').replace(/\/+$/, '');
        this.paginaAtual = String(op.paginaAtual || '');
        /* A ARQUITETURA do que esta sendo testado muda onde o motor procura:
             formulario  o formulario abre num quadro DENTRO da tela do
                         processo; campos e botoes do formulario primeiro,
                         o Enviar fica na tela de fora.
             widget      a widget vive dentro de um conteiner na pagina; os
                         ids costumam levar a instancia (busca_123), e os
                         botoes sao procurados primeiro dentro dela.
             web         uma pagina comum: procura na pagina inteira. */
        /* Os nomes neutros (fluxo, modulo) sao sinonimos - e como a Bancada,
           que nao fala da plataforma, chama as mesmas arquiteturas. */
        var arq = { fluxo: 'formulario', modulo: 'widget' }[op.arquitetura] || op.arquitetura;
        this.arquitetura = /^(formulario|widget|web)$/.test(arq) ? arq : 'formulario';
        this.enderecos = op.enderecos || null;
        this.antesDoCaso = typeof op.antesDoCaso === 'function' ? op.antesDoCaso : null;
        this.alvo = op.alvo || { id: '', nome: '' };
        this.casos = op.casos || [];
        this.aoEvento = op.aoEvento || function () {};
        this.antesDoPasso = typeof op.antesDoPasso === 'function' ? op.antesDoPasso : null;
        this.consultarDataset = op.consultarDataset;
        this._parar = false;
        this._pausado = false;
    }

    Rodada.prototype.parar = function () { this._parar = true; };

    /* O endereco de cada abertura. O padrao e o do Fluig; a Bancada passa os
       dela (op.enderecos), que servem a mesma tela sem a plataforma. */
    Rodada.prototype.endereco = function (tipo, valor) {
        if (this.enderecos && typeof this.enderecos[tipo] === 'function') return this.enderecos[tipo](valor);
        if (tipo === 'processo') return this.portal + '/pageworkflowview?processID=' + encodeURIComponent(valor);
        var pagina = valor === '.' ? this.paginaAtual : valor;
        return pagina ? this.portal + '/' + encodeURIComponent(pagina) : '';
    };

    Rodada.prototype.rodar = function () {
        var self = this;
        var inicio = Date.now();
        var embutidos = valoresEmbutidos(new Date(inicio));
        var res = {
            versao: 1,
            alvo: self.alvo.id, alvoNome: self.alvo.nome,
            inicio: isoLocal(new Date(inicio)),
            duracaoMs: 0,
            situacao: 'CONCLUIDA',
            resumo: { aprovados: 0, reprovados: 0, naoExecutados: 0, total: self.casos.length },
            casos: []
        };
        var total = self.casos.length;
        self.aoEvento('rodada:inicio', { total: total });

        var cadeia = Promise.resolve();
        self.casos.forEach(function (caso, i) {
            cadeia = cadeia.then(function () {
                if (self._parar) {
                    res.casos.push(casoNaoRodado(caso, 'NAO_EXECUTADO'));
                    return null;
                }
                var antes = (i === 0 ? Promise.resolve() : self._intervaloEntreCasos()).then(function () {
                    /* Quem roda o motor pode preparar o ambiente de cada caso
                       - a Bancada troca as simulacoes de dados aqui. */
                    return self.antesDoCaso ? self.antesDoCaso(caso, i) : null;
                });
                return antes.then(function () {
                    self.aoEvento('caso:inicio', { indice: i, total: total, caso: caso });
                    return self._rodarCaso(caso, embutidos);
                }).then(function (r) {
                    res.casos.push(r);
                    self.aoEvento('caso:fim', { indice: i, total: total, resultado: r });
                });
            });
        });

        return cadeia.then(function () {
            res.casos.forEach(function (c) {
                if (c.status === 'APROVADO') res.resumo.aprovados++;
                else if (c.status === 'REPROVADO') res.resumo.reprovados++;
                else res.resumo.naoExecutados++;
            });
            if (self._parar) res.situacao = 'INTERROMPIDA';
            res.duracaoMs = Date.now() - inicio;
            self.aoEvento('rodada:fim', res);
            return res;
        });
    };

    /* A tela anterior sai (o quadro vai para about:blank, e o formulario
       dispara o beforeunload dele) e a rodada espera antes de abrir a
       proxima. Ver pausaEntreCasosMs. */
    Rodada.prototype._intervaloEntreCasos = function () {
        var self = this, palco = self.palco;
        self.aoEvento('intervalo', { ms: self.cfg.pausaEntreCasosMs });
        return new Promise(function (ok) {
            var feito = false;
            function fim() { if (feito) return; feito = true; palco.onload = null; ok(); }
            try {
                palco.onload = fim;
                palco.src = 'about:blank';
            } catch (e) { fim(); }
            setTimeout(fim, 2000);
        }).then(function () { return dormir(self.cfg.pausaEntreCasosMs); });
    };

    Rodada.prototype._rodarCaso = function (caso, embutidos) {
        var self = this;
        var ctx = {
            rodada: self, cfg: self.cfg,
            errosConsole: [], alertas: [], notificacoes: [], chamadas: [],
            /* Em camera lenta cada passo ganha ate quatro compassos a mais
               (legenda, destaque, conferido, respiro): o teto do caso cresce
               junto, senao um caso longo reprovaria so por estar devagar. */
            prazoCaso: Date.now() + self.cfg.casoMs +
                       Math.max(0, Number(self.cfg.cameraLentaMs) || 0) * 4 * caso.passos.length
        };
        var r = {
            codigo: caso.codigo, nome: caso.nome, status: 'APROVADO', duracaoMs: 0,
            passos: [], erro: null, retrato: null, errosConsole: [], alertas: [], notificacoes: [], chamadas: []
        };
        /* A propria pagina do DevTools Kit tambem e vigiada, SO para
           notificacao: o Fluig pode desenhar o toast na janela de cima. */
        global.__delpTesteCtx = ctx;
        var t0 = Date.now();
        var falhou = false;

        var cadeia = Promise.resolve();
        caso.passos.forEach(function (passo, i) {
            cadeia = cadeia.then(function () {
                var n = i + 1;
                var registro = { n: n, acao: passo.acao, descricao: descrever(passo), status: 'PULADO', duracaoMs: 0 };
                r.passos.push(registro);
                if (falhou || self._parar) return null;

                var ts = Date.now();
                self.aoEvento('passo:inicio', { caso: caso, passo: registro });

                var p = null, nAntes = ctx.chamadas.length;
                var titulo = 'Passo ' + n + '/' + caso.passos.length;
                return Promise.resolve()
                    .then(function () {
                        p = interpolarPasso(passo, caso.dados, embutidos);
                        registro.descricao = descrever(p);
                        vigiar(ctx);
                        legendar(ctx, { titulo: titulo, corpo: registro.descricao });
                        return perguntar(self, ctx, caso, n, p);
                    })
                    .then(function () {
                        /* a duracao do passo nao inclui o tempo em que a pessoa leu */
                        ts = Date.now();
                        nAntes = ctx.chamadas.length;
                        if (self._parar) throw new Error('rodada interrompida');
                        return POR_ACAO[p.acao].executar(ctx, p);
                    })
                    .then(function (nota) {
                        if (!emCameraLenta(ctx)) return nota;
                        /* Depois do passo, um compasso para ver o efeito: a
                           pagina que abriu, o que o clique mudou. Conferencia
                           mostra em verde onde achou o que procurava. A
                           moldura da acao sai JA: a tela costuma se redesenhar
                           com o clique, e ela ficaria apontando para o vazio. */
                        apagarMolduras(ctx);
                        legendar(ctx, { titulo: titulo + ' ✓', corpo: registro.descricao }, 'ok');
                        var ver = /^conferir/.test(p.acao) ? mostrarConferido(ctx, p) : dormir(ctx.cfg.cameraLentaMs);
                        return ver.then(function () { apagarMolduras(ctx); return nota; });
                    })
                    .then(function (nota) {
                        if (typeof nota === 'string' && nota) registro.nota = nota;
                        registro.status = 'OK';
                        registro.duracaoMs = Date.now() - ts;
                        self.aoEvento('passo:fim', { caso: caso, passo: registro, consultas: ctx.chamadas.slice(nAntes) });
                        return dormir(self.cfg.pausaEntrePassosMs);
                    }, function (e) {
                        registro.duracaoMs = Date.now() - ts;
                        if (self._parar) { registro.status = 'PULADO'; return; }
                        falhou = true;
                        registro.status = 'FALHOU';
                        registro.erro = mensagemDe(e);
                        r.erro = { passo: n, mensagem: registro.erro };
                        r.retrato = retratar(ctx);
                        self.aoEvento('passo:fim', { caso: caso, passo: registro, consultas: ctx.chamadas.slice(nAntes) });
                        /* Em camera lenta a falha fica na tela por um tempo:
                           ver ONDE parou e o motivo e o ponto de rodar devagar. */
                        if (emCameraLenta(ctx)) {
                            legendar(ctx, { titulo: titulo + ' ✗', corpo: registro.erro }, 'falha');
                            return dormir(Math.max(2500, ctx.cfg.cameraLentaMs * 3));
                        }
                    });
            });
        });

        return cadeia.then(function () {
            if (falhou) r.status = 'REPROVADO';
            else if (r.passos.some(function (p) { return p.status === 'PULADO'; })) r.status = 'INTERROMPIDO';
            r.errosConsole = ctx.errosConsole.slice(0, 20);
            r.alertas = ctx.alertas.slice(0, 20);
            r.notificacoes = ctx.notificacoes.slice(0, 20);
            r.chamadas = ctx.chamadas.slice(0, 60);
            r.duracaoMs = Date.now() - t0;
            /* O proximo caso nao pode herdar a vigilancia deste. */
            janelas(ctx).forEach(function (w) { if (w.__delpTesteCtx === ctx) w.__delpTesteCtx = null; });
            if (global.__delpTesteCtx === ctx) global.__delpTesteCtx = null;
            return r;
        });
    };

    function casoNaoRodado(caso, status) {
        return {
            codigo: caso.codigo, nome: caso.nome, status: status, duracaoMs: 0,
            passos: caso.passos.map(function (p, i) {
                return { n: i + 1, acao: p.acao, descricao: descrever(p), status: 'PULADO', duracaoMs: 0 };
            }),
            erro: null, retrato: null, errosConsole: [], alertas: [], notificacoes: [], chamadas: []
        };
    }

    /* ========================================================================
       NAVEGAR
       ====================================================================== */
    function navegar(ctx, url) {
        var palco = ctx.rodada.palco;
        return new Promise(function (ok, falha) {
            var feito = false;
            /* Enquanto a pagina carrega, a vigilancia e reinstalada a cada
               instante: e o jeito de pegar os erros de JavaScript do proprio
               carregamento, que aconteceriam antes do evento "load". */
            var vigia = setInterval(function () { vigiar(ctx); }, 25);
            function fim(erro) {
                if (feito) return;
                feito = true;
                clearInterval(vigia);
                clearTimeout(relogio);
                palco.onload = null;
                if (erro) falha(erro); else ok();
            }
            var relogio = setTimeout(function () {
                fim(new Error('A página não terminou de carregar em ' +
                              Math.round(ctx.cfg.carregarMs / 1000) + ' s: ' + url));
            }, ctx.cfg.carregarMs);
            palco.onload = function () { fim(null); };
            palco.src = url;
        }).then(function () {
            var w = janelaSegura(palco.contentWindow);
            if (!w) {
                throw new Error('A página abriu, mas o navegador não deixa o teste ler a tela. ' +
                                T('Ela precisa estar no mesmo endereço do {plataforma}.'));
            }
            vigiar(ctx);
        });
    }

    /* A pagina do processo carrega ANTES do formulario: o formulario entra
       depois, num quadro dentro dela. Sem esperar por ele, o primeiro passo
       ja encontrava so o portal - e um "Iniciar" do portal foi clicado no
       lugar do botao do formulario (rodada real de 25/09). */
    function esperarFormulario(ctx) {
        return esperarAte(ctx, function () {
            var ws = janelas(ctx);
            for (var i = 1; i < ws.length; i++) {
                var d = ws[i].document;
                if (d.readyState === 'complete' && d.getElementsByTagName('input').length) return true;
            }
            return false;
        }, T('A tela do {processo} abriu, mas {oFormulario} não carregou dentro dela em ') +
           Math.round(ctx.cfg.carregarMs / 1000) + ' s.', ctx.cfg.carregarMs)
            .then(function () { return dormir(ctx.cfg.assentarMs); });
    }

    /* ========================================================================
       AS JANELAS: o palco e os quadros dentro dele
       O formulario do processo abre num iframe DENTRO da pagina do portal.
       Todo passo procura em todas as janelas do mesmo endereco, na ordem em
       que aparecem - o teste nao precisa saber em qual quadro o campo esta.
       ====================================================================== */
    function janelaSegura(w) {
        try { if (w && w.document && w.document.body) return w; } catch (e) { /* outro endereco */ }
        return null;
    }

    function janelas(ctx) {
        var lista = [], fila = [];
        var w0 = janelaSegura(ctx.rodada.palco && ctx.rodada.palco.contentWindow);
        if (w0) fila.push(w0);
        while (fila.length && lista.length < 20) {
            var w = fila.shift();
            lista.push(w);
            var quadros = w.document.getElementsByTagName('iframe');
            for (var i = 0; i < quadros.length; i++) {
                var cw = null;
                try { cw = janelaSegura(quadros[i].contentWindow); } catch (e) { cw = null; }
                if (cw) fila.push(cw);
            }
        }
        return lista;
    }

    /* ========================================================================
       A VIGILANCIA: erros de JavaScript e alertas
       Instalada uma vez por janela; aponta para o caso da vez por
       __delpTesteCtx, para que o erro de um caso nao seja contado no outro.
       alert/confirm/prompt sao respondidos sozinhos: um alert nativo travaria
       a rodada inteira esperando alguem clicar em OK.
       ====================================================================== */
    function vigiar(ctx) {
        envolverNotificacoes(global);
        janelas(ctx).forEach(function (w) {
            w.__delpTesteCtx = ctx;
            /* O FLUIGC e o Swal podem chegar DEPOIS do load: a embalagem das
               notificacoes e conferida a cada passo, nao so na primeira vez. */
            envolverNotificacoes(w);
            envolverDados(w);
            if (w.__delpTesteVigia) return;
            w.__delpTesteVigia = true;
            function registrar(lista, msg) {
                var c = w.__delpTesteCtx;
                if (c && c[lista].length < 50) c[lista].push(String(msg).substring(0, 500));
            }
            try {
                var original = w.console && w.console.error;
                if (original) {
                    w.console.error = function () {
                        registrar('errosConsole', juntar(arguments));
                        return original.apply(w.console, arguments);
                    };
                }
                w.addEventListener('error', function (ev) {
                    /* "Script error." e o que o navegador diz quando o erro
                       acontece num script de OUTRO endereco (uma CDN): ele
                       esconde o detalhe de proposito. Dizer isso poupa a
                       pessoa de procurar o defeito no codigo dela. */
                    if (ev.message === 'Script error.' && !ev.filename) {
                        registrar('errosConsole', 'Script error. (um script carregado de outro endereço falhou; ' +
                                  'o navegador esconde o detalhe - veja o console do navegador)');
                        return;
                    }
                    registrar('errosConsole', (ev.message || 'erro de script') +
                        (ev.filename ? ' (' + String(ev.filename).split('/').pop() + ':' + ev.lineno + ')' : ''));
                });
                w.addEventListener('unhandledrejection', function (ev) {
                    registrar('errosConsole', 'Promise rejeitada: ' + mensagemDe(ev.reason));
                });
                w.alert = function (m) { registrar('alertas', m); };
                w.confirm = function (m) { registrar('alertas', m); return true; };
                w.prompt = function (m, padrao) { registrar('alertas', m); return padrao == null ? '' : padrao; };
            } catch (e) { /* janela que nao deixa: segue sem vigiar */ }
        });
    }

    /* NOTIFICACOES: FLUIGC.toast e Swal.fire.
       O toast do Fluig nem sempre e desenhado no quadro que chamou - pode ir
       para a janela de cima. Em vez de procurar o desenho, o motor anota a
       CHAMADA: o texto fica registrado no caso, e o "Conferir texto" confere
       tambem as notificacoes. A chamada original segue normalmente. */
    function envolverNotificacoes(w) {
        try {
            var F = w.FLUIGC;
            if (F && typeof F.toast === 'function' && !F.toast.__delpTeste) {
                var toastOriginal = F.toast;
                var toast = function (op) {
                    anotar(w, textoDaNotificacao(op));
                    return toastOriginal.apply(this, arguments);
                };
                toast.__delpTeste = true;
                F.toast = toast;
            }
            var S = w.Swal;
            if (S && typeof S.fire === 'function' && !S.fire.__delpTeste) {
                var fireOriginal = S.fire;
                var fire = function (op) {
                    anotar(w, (op && typeof op === 'object') ? textoDaNotificacao(op)
                                                             : Array.prototype.slice.call(arguments, 0, 2).join(' '));
                    return fireOriginal.apply(this, arguments);
                };
                fire.__delpTeste = true;
                S.fire = fire;
            }
        } catch (e) { /* janela que nao deixa: segue */ }
    }

    /* AS CHAMADAS DE DADOS: DatasetFactory.getDataset e o servico REST
       (/api/public/ecm/dataset/datasets, por XHR/$.ajax ou fetch).
       Cada consulta da tela fica anotada no caso - com o nome e os filtros.
       E o que o passo "Conferir chamada" confere, e o que o resultado mostra
       em "Chamadas de dados". A chamada original segue normalmente. */
    var REST_DADOS = /\/api\/public\/ecm\/dataset\/datasets(?:[?#]|$)/;

    function anotarChamada(w, nome, restricoes) {
        var c = w.__delpTesteCtx;
        if (!c || c.chamadas.length >= 200) return;
        c.chamadas.push({ dataset: String(nome), filtros: (restricoes || []).map(function (r) {
            return {
                campo: String(r && (r._field !== undefined ? r._field : r.fieldName)),
                valor: String(r && (r._initialValue !== undefined ? r._initialValue : r.initialValue))
            };
        }) });
    }

    /* O corpo do POST REST: { name, constraints: [{ _field, _initialValue }] }.
       Corpo que nao e JSON (ou nao tem name) nao e consulta: nao anota. */
    function anotarCorpoRest(w, corpo) {
        if (typeof corpo !== 'string') return;
        try {
            var c = JSON.parse(corpo);
            if (c && c.name) anotarChamada(w, c.name, c.constraints);
        } catch (e) { /* nao era JSON */ }
    }

    function envolverDados(w) {
        /* A pagina pode ter guardado as consultas feitas ANTES da vigilancia
           (a abertura da tela) em __testeChamadasAntes; elas entram no caso. */
        try {
            var antes = w.__testeChamadasAntes;
            if (antes && antes.length && w.__delpTesteCtx) {
                w.__testeChamadasAntes = [];
                antes.forEach(function (a) { anotarChamada(w, a.nome, a.restricoes); });
            }
        } catch (e) { /* janela que nao deixa: segue */ }
        try {
            var D = w.DatasetFactory;
            if (D && typeof D.getDataset === 'function' && !D.getDataset.__delpTeste) {
                var original = D.getDataset;
                var embalado = function (nome, campos, restricoes) {
                    anotarChamada(w, nome, restricoes);
                    return original.apply(this, arguments);
                };
                embalado.__delpTeste = true;
                D.getDataset = embalado;
            }
        } catch (e) { /* janela que nao deixa: segue */ }
        try {
            var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
            if (X && !X.send.__delpTeste) {
                var abrir = X.open, mandar = X.send;
                X.open = function (metodo, url) {
                    this.__delpTesteRest = REST_DADOS.test(String(url || ''));
                    return abrir.apply(this, arguments);
                };
                X.send = function (corpo) {
                    if (this.__delpTesteRest) anotarCorpoRest(w, corpo);
                    return mandar.apply(this, arguments);
                };
                X.send.__delpTeste = true;
            }
        } catch (e) { /* janela que nao deixa: segue */ }
        try {
            if (typeof w.fetch === 'function' && !w.fetch.__delpTeste) {
                var buscar = w.fetch;
                var fetchEmbalado = function (entrada, op) {
                    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url);
                    if (REST_DADOS.test(String(url || '')) && op) anotarCorpoRest(w, op.body);
                    return buscar.apply(this, arguments);
                };
                fetchEmbalado.__delpTeste = true;
                w.fetch = fetchEmbalado;
            }
        } catch (e) { /* janela que nao deixa: segue */ }
    }

    function anotar(w, texto) {
        var c = w.__delpTesteCtx;
        if (c && texto && c.notificacoes.length < 50) c.notificacoes.push(String(texto).substring(0, 500));
    }

    function textoDaNotificacao(op) {
        if (op == null) return '';
        if (typeof op !== 'object') return String(op);
        return [op.title, op.message, op.text, op.html]
            .filter(function (t) { return t != null && String(t) !== ''; })
            .map(function (t) { return String(t).replace(/<[^>]*>/g, ' '); })
            .join(' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function juntar(args) {
        var partes = [];
        for (var i = 0; i < args.length; i++) partes.push(mensagemDe(args[i]));
        return partes.join(' ');
    }

    /* ========================================================================
       ESPERAR
       Nenhum passo falha de primeira: ele tenta de novo ate o prazo. A tela do
       Fluig monta o formulario aos poucos, e um teste que nao espera vira um
       teste que falha "as vezes" - o pior tipo, porque ensina a ignorar.
       ====================================================================== */
    function esperarAte(ctx, fn, falha, ms) {
        var rodada = ctx.rodada;
        var limite = Date.now() + (ms || ctx.cfg.esperaMs);
        return new Promise(function (ok, erro) {
            (function tentar() {
                if (rodada._parar) return erro(new Error('rodada interrompida'));
                if (Date.now() > ctx.prazoCaso) {
                    return erro(new Error('O caso passou do tempo limite de ' +
                                          Math.round(ctx.cfg.casoMs / 1000) + ' s.'));
                }
                /* Com a aba escondida, nada no quadro tem tamanho - e todo
                   "esta visivel?" responderia que nao. A espera PAUSA ate a
                   aba voltar, em vez de reprovar a tela por causa do menu. */
                if (!palcoVisivel(rodada)) {
                    limite += ctx.cfg.intervaloMs;
                    ctx.prazoCaso += ctx.cfg.intervaloMs;
                    if (!rodada._pausado) { rodada._pausado = true; rodada.aoEvento('pausa', {}); }
                    return setTimeout(tentar, ctx.cfg.intervaloMs);
                }
                if (rodada._pausado) { rodada._pausado = false; rodada.aoEvento('retomada', {}); }

                var v, ultimoErro = null;
                try { vigiar(ctx); v = fn(); } catch (e) { ultimoErro = e; }
                if (v) return ok(v);
                if (Date.now() >= limite) {
                    return erro(new Error(typeof falha === 'function' ? falha(ultimoErro) : falha));
                }
                setTimeout(tentar, ctx.cfg.intervaloMs);
            })();
        });
    }

    function palcoVisivel(rodada) {
        var p = rodada.palco;
        try { return !!(p && p.getClientRects && p.getClientRects().length); } catch (e) { return true; }
    }

    function dormir(ms) {
        return new Promise(function (ok) { setTimeout(ok, ms); });
    }

    function dormirVigiando(ctx, ms) {
        var fim = Date.now() + ms;
        return esperarAte(ctx, function () { return Date.now() >= fim; }, 'espera interrompida', ms + 1000)
            .then(nada);
    }

    function nada() { return undefined; }

    /* ========================================================================
       CAMERA LENTA
       A legenda e a moldura moram num Shadow DOM FECHADO, dentro de um host
       fixo e sem tamanho: innerText e querySelector da pagina nao o
       atravessam. Sem isso, a legenda 'Conferir que a tela mostra "X"' faria
       o proprio passo passar, e a moldura poderia virar alvo de clique.
       Sem attachShadow (navegador antigo), nao ha efeito visual - so o ritmo.
       ====================================================================== */
    function emCameraLenta(ctx) { return Number(ctx.cfg.cameraLentaMs) > 0; }

    var CENA_CSS =
        ':host{all:initial}' +
        '.moldura{position:fixed;display:none;box-sizing:border-box;border:3px solid #CC0F10;border-radius:6px;' +
        'box-shadow:0 0 0 4px rgba(204,15,16,.25);transition:all .18s ease-out;pointer-events:none}' +
        '.moldura.ok{border-color:#0B861D;box-shadow:0 0 0 4px rgba(11,134,29,.25)}' +
        '.moldura.previa{border-style:dashed;box-shadow:0 0 0 4px rgba(204,15,16,.15)}' +
        '.legenda{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:none;max-width:min(860px,92vw);' +
        'box-sizing:border-box;padding:10px 16px;border-radius:8px;background:#000;color:#FFF;border-left:5px solid #CC0F10;' +
        'font:500 15px/1.4 Barlow,Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none}' +
        '.legenda.ok{border-left-color:#0B861D}.legenda.falha{border-left-color:#CC0F10;background:#3a0000}' +
        '.legenda b{color:#EAE5DF;font-weight:600;margin-right:6px}';

    function raizDaCena(doc) {
        try {
            if (!doc || !doc.body) return null;
            var host = doc.__testeCena;
            if (host && host.isConnected && host.__raiz) return host.__raiz;
            if (typeof doc.body.attachShadow !== 'function') return null;
            host = doc.createElement('div');
            host.setAttribute('style', 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;' +
                                       'z-index:2147483647;pointer-events:none');
            var raiz = host.attachShadow({ mode: 'closed' });
            raiz.innerHTML = '<style>' + CENA_CSS + '</style><div class="moldura"></div><div class="legenda"></div>';
            host.__raiz = raiz;
            doc.__testeCena = host;
            doc.body.appendChild(host);
            return raiz;
        } catch (e) { return null; }
    }

    function legendar(ctx, texto, tipo) {
        if (!emCameraLenta(ctx)) return;
        var w = janelaSegura(ctx.rodada.palco && ctx.rodada.palco.contentWindow);
        var raiz = w && raizDaCena(w.document);
        if (!raiz) return;
        var l = raiz.querySelector('.legenda');
        l.className = 'legenda' + (tipo ? ' ' + tipo : '');
        l.innerHTML = '';
        var b = w.document.createElement('b');
        b.textContent = texto.titulo;
        l.appendChild(b);
        l.appendChild(w.document.createTextNode(texto.corpo));
        l.style.display = 'block';
    }

    function apagarMolduras(ctx) {
        janelas(ctx).forEach(function (w) {
            try {
                var host = w.document.__testeCena;
                if (host && host.__raiz) host.__raiz.querySelector('.moldura').style.display = 'none';
            } catch (e) { /* segue */ }
        });
    }

    /* Rola ate o elemento, emoldura e espera o compasso. Devolve o proprio
       elemento, para encaixar numa cadeia .then sem mudar o que vem depois. */
    function destacar(ctx, el, tipo) {
        if (!emCameraLenta(ctx) || !el || !el.ownerDocument) return Promise.resolve(el);
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* segue */ }
        return dormir(200).then(function () {
            emoldurar(el, tipo);
            return dormir(ctx.cfg.cameraLentaMs);
        }).then(function () { return el; });
    }

    function emoldurar(el, tipo) {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* segue */ }
        var raiz = raizDaCena(el.ownerDocument);
        if (!raiz || !el.getBoundingClientRect) return;
        var r = el.getBoundingClientRect();
        var m = raiz.querySelector('.moldura');
        m.className = 'moldura' + (tipo ? ' ' + tipo : '');
        m.style.top = (r.top - 5) + 'px';
        m.style.left = (r.left - 5) + 'px';
        m.style.width = (r.width + 10) + 'px';
        m.style.height = (r.height + 10) + 'px';
        m.style.display = 'block';
    }

    /* Digitacao so para os olhos: o valor aparece letra a letra, SEM evento,
       e volta ao que era. Quem digita "de verdade" continua sendo o passo
       preencher, igual a velocidade normal - uma mascara que reagisse a
       cada letra daria, em camera lenta, um resultado diferente. */
    function digitarParaVer(ctx, el, valor) {
        if (!emCameraLenta(ctx) || !valor) return Promise.resolve();
        var antes = el.value, i = 0;
        var passo = Math.max(25, Math.min(90, Math.round(1500 / valor.length)));
        return new Promise(function (ok) {
            (function letra() {
                i += 1;
                try { definirValor(el, valor.substring(0, i)); } catch (e) { i = valor.length; }
                if (i >= valor.length) return setTimeout(ok, passo);
                setTimeout(letra, passo);
            })();
        }).then(function () { try { definirValor(el, antes); } catch (e) { /* segue */ } });
    }

    /* O menor elemento visivel que contem o texto - para mostrar ONDE o
       "Conferir texto" achou o que procurava. So roda em camera lenta. */
    function elementoComTexto(ctx, texto) {
        var alvo = normalizar(texto), melhor = null, tamanho = Infinity;
        janelas(ctx).forEach(function (w) {
            var todos = w.document.body ? w.document.body.getElementsByTagName('*') : [];
            for (var i = 0; i < todos.length && i < 8000; i++) {
                var el = todos[i];
                var t = el.textContent || '';
                if (t.length >= tamanho || t.length < alvo.length) continue;
                if (/^(SCRIPT|STYLE|TEMPLATE)$/i.test(el.tagName)) continue;
                if (normalizar(t).indexOf(alvo) < 0 || !visivel(el)) continue;
                melhor = el; tamanho = t.length;
            }
        });
        return melhor;
    }

    /* PASSO A PASSO: antes de cada passo o motor para e entrega a explicacao
       a quem esta olhando (op.antesDoPasso), com o alvo ja marcado na tela.
       A resposta: 'executar' (este passo), 'resto' (roda o resto sem parar)
       ou 'parar'. O tempo parado nao conta no teto do caso. */
    function alvoDoPasso(ctx, p) {
        try {
            if (p.acao === 'clicar' || p.acao === 'enviar') {
                var texto = p.acao === 'enviar' ? ctx.cfg.textoEnviar : String(p.alvo || '');
                var m = /^campo:(.+)$/.exec(texto);
                if (m) return acharCampo(ctx, m[1]);
                var achado = acharClicavel(ctx, texto);
                return achado ? achado.el : null;
            }
            if (p.campo && p.acao !== 'conferirOculto') return acharCampo(ctx, p.campo);
        } catch (e) { /* a tela ainda nao tem o alvo */ }
        return null;
    }

    function perguntar(rodada, ctx, caso, n, p) {
        if (!rodada.cfg.passoAPasso || typeof rodada.antesDoPasso !== 'function') return Promise.resolve();
        var t0 = Date.now();
        var alvo = alvoDoPasso(ctx, p);
        if (alvo) emoldurar(alvo, 'previa');
        var precisaAlvo = !!(p.campo && p.acao !== 'conferirOculto') || p.acao === 'clicar' || p.acao === 'enviar';
        return Promise.resolve(rodada.antesDoPasso({
            caso: caso, n: n, total: caso.passos.length, passo: p, descricao: descrever(p),
            explicacao: explicar(p, ctx.cfg), alvo: precisaAlvo ? (alvo ? 'marcado' : 'ausente') : 'nenhum'
        })).then(function (decisao) {
            ctx.prazoCaso += Date.now() - t0;
            apagarMolduras(ctx);
            if (decisao === 'resto') rodada.cfg.passoAPasso = false;
            else if (decisao === 'parar') rodada.parar();
        });
    }

    function mostrarConferido(ctx, p) {
        if (!emCameraLenta(ctx)) return Promise.resolve();
        var el = null;
        try {
            if (p.campo && p.acao !== 'conferirOculto') el = acharCampo(ctx, p.campo);
            else if (p.texto && p.acao === 'conferirTexto') el = elementoComTexto(ctx, p.texto);
        } catch (e) { el = null; }
        return el ? destacar(ctx, el, 'ok').then(nada) : dormir(ctx.cfg.cameraLentaMs);
    }

    /* ========================================================================
       ACHAR NA TELA
       ====================================================================== */
    function acharCampo(ctx, nome) {
        if (String(nome).charAt(0) === '@') return acharPorAtributo(ctx, nome);
        var achado = acharPorNomeOuId(ctx, nome);
        if (achado) return achado;
        /* Widget: o id quase sempre leva a instancia ("busca_12345"), porque a
           mesma widget pode estar duas vezes na pagina. O caso fala "busca". */
        return acharPorInstancia(ctx, nome);
    }

    function acharPorAtributo(ctx, expr) {
        var m = /^@([A-Za-z_][A-Za-z0-9_-]{0,59})(?:=(.*))?$/.exec(expr);
        if (!m) return null;
        var reserva = null, ws = janelas(ctx);
        for (var i = 0; i < ws.length; i++) {
            var lista;
            try { lista = ws[i].document.querySelectorAll('[' + m[1] + ']'); } catch (e) { lista = []; }
            for (var j = 0; j < lista.length; j++) {
                if (m[2] !== undefined && String(lista[j].getAttribute(m[1])) !== m[2]) continue;
                if (visivel(lista[j])) return lista[j];
                if (!reserva) reserva = lista[j];
            }
        }
        return reserva;
    }

    function acharPorInstancia(ctx, nome) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(nome)) return null;
        var re = new RegExp('^' + nome + '_+\\d+$');
        var reserva = null, ws = janelas(ctx);
        for (var i = 0; i < ws.length; i++) {
            var todos = ws[i].document.getElementsByTagName('*');
            for (var j = 0; j < todos.length; j++) {
                var id = todos[j].id;
                if (!id || !re.test(id)) continue;
                if (visivel(todos[j])) return todos[j];
                if (!reserva) reserva = todos[j];
            }
        }
        return reserva;
    }

    function acharPorNomeOuId(ctx, nome) {
        var reserva = null;
        var ws = janelas(ctx);
        for (var i = 0; i < ws.length; i++) {
            var doc = ws[i].document;
            var lista = doc.getElementsByName(nome);
            for (var j = 0; j < lista.length; j++) {
                if (visivel(lista[j])) return lista[j];
                if (!reserva) reserva = lista[j];
            }
            if (!reserva) {
                var porId = doc.getElementById(nome);
                if (porId) reserva = porId;
            }
        }
        return reserva;
    }

    function acharCampoEditavel(ctx, nome) {
        return esperarAte(ctx, function () { return acharCampo(ctx, nome); },
            'Não achei o campo "' + nome + '" na tela.')
            .then(function (el) {
                if (bloqueado(el)) {
                    throw new Error('O campo "' + nome + '" está bloqueado (desabilitado ou somente leitura) — ' +
                                    'uma pessoa também não conseguiria preenchê-lo.');
                }
                return el;
            });
    }

    function visivel(el) {
        if (!el || !el.ownerDocument) return false;
        try {
            var w = el.ownerDocument.defaultView;
            var cs = w && w.getComputedStyle ? w.getComputedStyle(el) : null;
            if (cs && (cs.visibility === 'hidden' || cs.display === 'none')) return false;
        } catch (e) { /* segue pelo tamanho */ }
        if (String(el.type || '').toLowerCase() === 'hidden') return false;
        return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
    }

    function bloqueado(el) {
        return !!(el.disabled || el.readOnly ||
                  (el.getAttribute && (el.getAttribute('readonly') !== null ||
                                       el.getAttribute('aria-disabled') === 'true')));
    }

    function textoDe(el) {
        return String((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function textoVisivel(body) {
        if (!body) return '';
        /* innerText so traz o que esta visivel; textContent traria o texto
           dos modais escondidos e das opcoes de todos os selects. */
        return String(body.innerText != null ? body.innerText : body.textContent || '');
    }

    function normalizar(s) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').toLowerCase();
    }

    function valoresDe(el) {
        var tag = String(el.tagName).toUpperCase();
        var tipo = String(el.type || '').toLowerCase();
        if (tag === 'SELECT') {
            var o = el.options[el.selectedIndex];
            return o ? [o.value, textoDe(o)] : [''];
        }
        if (tag === 'INPUT' && (tipo === 'checkbox' || tipo === 'radio')) {
            var grupo = el.name ? el.ownerDocument.getElementsByName(el.name) : [el];
            var marcados = [];
            for (var i = 0; i < grupo.length; i++) if (grupo[i].checked) marcados.push(grupo[i].value);
            if (tipo === 'checkbox' && grupo.length === 1) {
                return el.checked ? ['sim', 'marcado', el.value] : ['não', 'nao', 'desmarcado', ''];
            }
            return [marcados.join(',')];
        }
        if (tag === 'INPUT' || tag === 'TEXTAREA') return [String(el.value == null ? '' : el.value)];
        return [textoDe(el)];
    }

    /* ========================================================================
       MEXER NA TELA
       ====================================================================== */
    /* O valor e gravado pelo setter NATIVO do elemento. Atribuir el.value
       direto passa por cima do que alguns componentes interceptam, e o
       formulario "ve" o campo vazio mesmo com o texto na tela. */
    function definirValor(el, v) {
        var w = el.ownerDocument && el.ownerDocument.defaultView;
        var proto = null;
        try {
            proto = String(el.tagName).toUpperCase() === 'TEXTAREA'
                ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
        } catch (e) { proto = null; }
        var desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
        if (desc && desc.set) desc.set.call(el, v);
        else el.value = v;
    }

    function disparar(el, tipo, borbulha) {
        var doc = el.ownerDocument, w = doc && doc.defaultView, ev;
        var sobe = borbulha !== false;
        try { ev = new w.Event(tipo, { bubbles: sobe, cancelable: true }); }
        catch (e) { ev = doc.createEvent('Event'); ev.initEvent(tipo, sobe, true); }
        el.dispatchEvent(ev);
    }

    function dispararMouse(el, tipo) {
        var doc = el.ownerDocument, w = doc && doc.defaultView, ev;
        try { ev = new w.MouseEvent(tipo, { bubbles: true, cancelable: true, view: w }); }
        catch (e) {
            try { ev = new w.Event(tipo, { bubbles: true, cancelable: true }); }
            catch (e2) { ev = doc.createEvent('Event'); ev.initEvent(tipo, true, true); }
        }
        el.dispatchEvent(ev);
    }

    function alternar(ctx, p, ligar) {
        return esperarAte(ctx, function () {
            var el = acharCampo(ctx, p.campo);
            if (!el) return null;
            if (p.valor) {
                var grupo = el.ownerDocument.getElementsByName(p.campo);
                for (var i = 0; i < grupo.length; i++) if (grupo[i].value === p.valor) return grupo[i];
                return null;
            }
            return el;
        }, 'Não achei "' + p.campo + '"' + (p.valor ? ' com o valor "' + p.valor + '"' : '') + ' na tela.')
            .then(function (el) { return destacar(ctx, el); })
            .then(function (el) {
                if (bloqueado(el)) throw new Error('O campo "' + p.campo + '" está bloqueado.');
                if (!!el.checked !== ligar) {
                    el.click();
                    /* Um clique que um handler cancelou deixa o estado como
                       estava; a caixa precisa ficar como o passo pediu. */
                    if (!!el.checked !== ligar) {
                        el.checked = ligar;
                        disparar(el, 'change');
                    }
                }
            });
    }

    /* Procura do quadro mais FUNDO para o mais raso: o formulario (dentro)
       antes da pagina do portal (fora). Um "Iniciar" do formulario ganha de
       um "Iniciar" que exista no menu do portal. */
    function acharClicavel(ctx, texto) {
        var alvo = normalizar(texto);
        var ws = janelas(ctx).slice().reverse();

        function procurar(nomeDe) {
            var exato = null, parecido = null;
            for (var i = 0; i < ws.length && !exato; i++) {
                var lista = candidatosClicaveis(ctx, ws[i].document);
                for (var j = 0; j < lista.length; j++) {
                    var el = lista[j];
                    if (!visivel(el)) continue;
                    var t = normalizar(nomeDe(el));
                    if (!t) continue;
                    /* Ícone no começo ou no fim ("▣ Aplicações", "Enviar →") não
                       faz parte do nome do botão: sem tirá-lo, o texto exato nunca
                       casa, e o parcial pode pegar OUTRO item que contenha a
                       mesma palavra. */
                    var semIcone = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '');
                    if (t === alvo || semIcone === alvo) { exato = { el: el, raso: i === ws.length - 1, quadros: ws.length }; break; }
                    if (!parecido && t.indexOf(alvo) >= 0) parecido = { el: el, raso: i === ws.length - 1, quadros: ws.length };
                }
            }
            return exato || parecido;
        }

        var achado = procurar(function (el) {
            return textoDe(el) || el.value || (el.getAttribute && el.getAttribute('title')) || '';
        });
        if (achado) return achado;
        /* Nenhum botao com o texto VISIVEL. Tela estreita costuma esconder o
           rotulo e deixar so o icone (o proprio painel faz isso abaixo de
           1100 px) - o botao continua la, com o nome escondido. A segunda
           volta procura pelo nome acessivel: o texto oculto do elemento
           visivel e o aria-label. Assim o teste nao depende da largura da
           tela em que foi escrito. */
        achado = procurar(function (el) {
            return (el.getAttribute && el.getAttribute('aria-label')) ||
                   String(el.textContent || '').replace(/\s+/g, ' ');
        });
        if (achado) achado.porNomeOculto = true;
        return achado;
    }

    /* Na widget, os botoes DE DENTRO dela vem primeiro: a pagina em volta tem
       menu, cabecalho e outras widgets, e um "Salvar" de fora nao e o que o
       caso quis dizer. */
    function candidatosClicaveis(ctx, doc) {
        var sel = ctx.cfg.seletores, lista = [], vistos = [];
        function juntar(nos) {
            for (var k = 0; k < nos.length; k++) {
                if (vistos.indexOf(nos[k]) < 0) { vistos.push(nos[k]); lista.push(nos[k]); }
            }
        }
        try {
            if (ctx.rodada.arquitetura === 'widget') {
                var raizes = doc.querySelectorAll(sel.raizWidget);
                for (var r = 0; r < raizes.length; r++) juntar(raizes[r].querySelectorAll(sel.clicaveis));
            }
            juntar(doc.querySelectorAll(sel.clicaveis));
        } catch (e) { /* segue com o que tiver */ }
        return lista;
    }

    function ondeFoi(achado) {
        if (achado.quadros < 2) return 'na página';
        return achado.raso ? T('na tela de fora (fora {doFormulario})') : T('dentro {doFormulario}');
    }

    function clicar(ctx, alvo) {
        var m = /^campo:(.+)$/.exec(alvo);
        if (m) {
            return esperarAte(ctx, function () { return acharCampo(ctx, m[1]); },
                'Não achei o campo "' + m[1] + '" para clicar.')
                .then(function (el) { return destacar(ctx, el); })
                .then(function (el) { el.click(); });
        }
        /* O botao pode existir e ainda estar desabilitado - o Enviar do Fluig
           fica assim enquanto a tela carrega. A espera e ate ele HABILITAR. */
        var visto = null;
        return esperarAte(ctx, function () {
            visto = acharClicavel(ctx, alvo);
            return visto && !visto.el.disabled ? visto : null;
        }, function () {
            return visto ? 'O botão "' + alvo + '" apareceu, mas continuou desabilitado.'
                         : 'Não achei botão ou link visível com o texto "' + alvo + '".';
        }).then(function (achado) {
            return destacar(ctx, achado.el).then(function () { return achado; });
        }).then(function (achado) {
            achado.el.click();
            return 'clicou ' + ondeFoi(achado) + (achado.porNomeOculto ? ' (pelo nome oculto: só o ícone estava visível)' : '');
        });
    }

    /* O zoom: acha o componente ao lado do campo, digita na caixa de busca,
       espera a opcao que contem o texto e clica nela. Funciona com os dois
       componentes que o Fluig usa (ver PADRAO.seletores):

         tagsinput + typeahead   a caixa de busca ja esta DENTRO do componente
         select2                 a caixa aparece depois de clicar nele

       Quando nao acha o componente, o erro diz O QUE esta ao lado do campo -
       e o que se precisa para ajustar os seletores sem adivinhar. */
    function escolherNoZoom(ctx, p) {
        var sel = ctx.cfg.seletores;
        var campo = null, componente = null;
        return esperarAte(ctx, function () { return acharCampo(ctx, p.campo); },
            T('Não achei o {zoom} "') + p.campo + '" na tela.')
            .then(function (el) { return destacar(ctx, el); })
            .then(function (el) {
                /* O campo e procurado DE NOVO a cada tentativa: o Fluig troca o
                   <input type="zoom"> original pelo componente depois de
                   carregar, e o elemento guardado antes vira um orfao fora da
                   pagina - foi o "dentro de ." da rodada real de 25/09. */
                campo = el;
                return esperarAte(ctx, function () {
                    campo = acharCampo(ctx, p.campo) || campo;
                    return componenteDoZoom(campo, sel);
                }, function () {
                    return T('Não achei o componente do {zoom} "') + p.campo + '" (procurei as classes "' +
                           sel.zoomContainer + '"). Ao lado do campo há: ' + vizinhanca(campo) + '.';
                });
            })
            .then(function (comp) {
                componente = comp;
                var dentro = primeiroVisivel(comp.querySelectorAll ? comp.querySelectorAll(sel.zoomBusca) : []);
                if (dentro) return dentro;
                /* A caixa do select2 aparece solta no <body> ao abrir. Com mais
                   de um zoom na tela, "a caixa visivel" pode ser a de OUTRO
                   zoom - entao so vale a que APARECEU com este clique. */
                var doc = campo.ownerDocument;
                var antes = visiveisDe(doc.querySelectorAll(sel.zoomBusca));
                var abridor = (comp.querySelector && comp.querySelector(sel.zoomSelecao)) || comp;
                dispararMouse(abridor, 'mousedown');
                dispararMouse(abridor, 'mouseup');
                abridor.click();
                return esperarAte(ctx, function () {
                    var agora = visiveisDe(doc.querySelectorAll(sel.zoomBusca));
                    for (var i = agora.length - 1; i >= 0; i--) if (antes.indexOf(agora[i]) < 0) return agora[i];
                    return null;
                }, T('A caixa de busca do {zoom} "') + p.campo + '" não abriu.');
            })
            .then(function (caixa) {
                try { caixa.focus(); } catch (e) { /* segue */ }
                disparar(caixa, 'focus', false);
                definirValor(caixa, p.busca);
                disparar(caixa, 'input');
                disparar(caixa, 'keyup');
                var alvo = normalizar(p.busca);
                var vistas = [];
                return esperarAte(ctx, function () {
                    var ops = campo.ownerDocument.querySelectorAll(sel.zoomOpcao);
                    vistas = [];
                    for (var i = 0; i < ops.length; i++) {
                        if (!visivel(ops[i])) continue;
                        var t = textoDe(ops[i]);
                        vistas.push(t);
                        /* "Buscando…", "Digite ao menos 3 caracteres" e
                           "Nenhum resultado" tambem sao itens da lista do
                           select2 - com a classe de mensagem. Nao sao opcao. */
                        var cls = String(ops[i].className || '');
                        if (cls.indexOf('loading') >= 0 || cls.indexOf('message') >= 0 ||
                            (ops[i].getAttribute && ops[i].getAttribute('aria-disabled') === 'true')) continue;
                        if (normalizar(t).indexOf(alvo) >= 0) return ops[i];
                    }
                    return null;
                }, function () {
                    if (vistas.length) {
                        return T('Nenhuma opção do {zoom} com "') + p.busca + '". Opções vistas: ' + vistas.slice(0, 5).join(' | ');
                    }
                    return T('O {zoom} não mostrou opções para "') + p.busca + '".' +
                           (p.busca ? ' Confira o texto buscado.'
                                    : T(' Informe um texto de busca: este {zoom} só lista depois de digitar.'));
                }, ctx.cfg.esperaZoomMs);
            })
            .then(function (opcao) {
                var escolhida = textoDe(opcao);
                dispararMouse(opcao, 'mouseenter');
                dispararMouse(opcao, 'mouseover');
                dispararMouse(opcao, 'mousedown');
                dispararMouse(opcao, 'mouseup');
                opcao.click();
                return esperarAte(ctx, function () {
                    campo = acharCampo(ctx, p.campo) || campo;
                    return !!valoresDe(campo)[0] ||
                           !!(componente.querySelectorAll && primeiroVisivel(componente.querySelectorAll(sel.zoomEscolhido)));
                }, 'Escolhi "' + escolhida + '", mas o campo "' + p.campo + '" continuou vazio.')
                    .then(function () { return 'escolheu "' + escolhida + '"'; });
            });
    }

    function temClasse(el, lista) {
        var cls = ' ' + String((el && el.className) || '') + ' ';
        return String(lista).split(/\s+/).some(function (c) { return c && cls.indexOf(' ' + c + ' ') >= 0; });
    }

    function componenteDoZoom(el, sel) {
        var irmao = el.nextElementSibling;
        for (var i = 0; irmao && i < 4; i++, irmao = irmao.nextElementSibling) {
            if (temClasse(irmao, sel.zoomContainer)) return irmao;
        }
        var pai = el.parentNode;
        if (pai && pai.querySelectorAll) {
            var todos = pai.querySelectorAll('*');
            for (var j = 0; j < todos.length; j++) {
                if (todos[j] !== el && temClasse(todos[j], sel.zoomContainer)) return todos[j];
            }
        }
        return null;
    }

    function vizinhanca(el) {
        function descrever(e) {
            if (!e || !e.tagName) return '';
            var cls = String(e.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
            return '<' + String(e.tagName).toLowerCase() + (cls ? '.' + cls : '') + '>';
        }
        if (!el.parentNode || el.isConnected === false) {
            return 'nada - o campo SAIU da página (ela foi recarregada ou o campo foi trocado por script)';
        }
        var partes = [], irmao = el.nextElementSibling;
        for (var i = 0; irmao && i < 3; i++, irmao = irmao.nextElementSibling) partes.push(descrever(irmao));
        return (partes.length ? partes.join(' ') : 'nada') + '; o campo é ' + descrever(el) +
               ' dentro de ' + descrever(el.parentNode);
    }

    function visiveisDe(lista) {
        var r = [];
        for (var i = 0; i < lista.length; i++) if (visivel(lista[i])) r.push(lista[i]);
        return r;
    }

    function primeiroVisivel(lista) {
        for (var i = 0; i < lista.length; i++) if (visivel(lista[i])) return lista[i];
        return null;
    }

    function conferirChamada(ctx, p) {
        var fCampo = '', fValor = null;
        if (p.filtro) {
            var m = /^([A-Za-z0-9_.\-]{1,80})=(.{0,200})$/.exec(p.filtro);
            if (!m) throw new Error('Filtro "' + p.filtro + '" fora do formato campo=valor.');
            fCampo = m[1]; fValor = m[2];
        }
        function casa(ch) {
            if (ch.dataset !== p.dataset) return false;
            if (!fCampo) return true;
            return ch.filtros.some(function (f) { return f.campo === fCampo && f.valor === fValor; });
        }
        return esperarAte(ctx, function () { return ctx.chamadas.some(casa); }, function () {
            var doDataset = ctx.chamadas.filter(function (ch) { return ch.dataset === p.dataset; });
            if (!ctx.chamadas.length) return 'A tela não fez nenhuma consulta de dados neste caso.';
            if (!doDataset.length) {
                return 'A tela não consultou ' + p.dataset + '. Consultou: ' +
                    ctx.chamadas.slice(-5).map(function (ch) { return ch.dataset; }).join(', ') + '.';
            }
            return p.dataset + ' foi consultado ' + doDataset.length + ' vez(es), mas nunca com ' +
                p.filtro + '. Filtros vistos: ' + doDataset.slice(-3).map(function (ch) {
                    return ch.filtros.map(function (f) { return f.campo + '=' + f.valor; }).join('&') || '(sem filtro)';
                }).join(' | ');
        }).then(function () { return ''; });
    }

    function conferirDataset(ctx, p) {
        if (typeof ctx.rodada.consultarDataset !== 'function') {
            throw new Error(T('Consulta de {dataset} indisponível nesta tela.'));
        }
        var fCol = '', fVal = '';
        if (p.filtro) {
            var m = /^([A-Za-z0-9_.\-]{1,80})=(.{0,200})$/.exec(p.filtro);
            if (!m) throw new Error('Filtro "' + p.filtro + '" fora do formato coluna=valor.');
            fCol = m[1]; fVal = m[2];
        }
        return Promise.resolve(ctx.rodada.consultarDataset(p.dataset, fCol, fVal)).then(function (linhas) {
            linhas = linhas || [];
            var achou = linhas.some(function (l) { return String(l[p.coluna] == null ? '' : l[p.coluna]) === p.valor; });
            if (!achou) {
                var vistos = linhas.slice(0, 5).map(function (l) { return String(l[p.coluna]); });
                throw new Error('Nenhuma linha de ' + p.dataset + ' com ' + p.coluna + ' = "' + p.valor + '" (' +
                                linhas.length + ' linha(s)' + (vistos.length ? ': ' + vistos.join(' | ') : '') + ').');
            }
        });
    }

    /* ========================================================================
       O RETRATO: como a tela estava quando o passo falhou
       Os valores dos campos e as mensagens visiveis. Campo de senha NUNCA
       entra - o retrato vai para o banco e fica no historico.
       ====================================================================== */
    function retratar(ctx) {
        var r = { url: '', campos: [], camposOmitidos: 0, mensagens: [] };
        try {
            var w0 = ctx.rodada.palco.contentWindow;
            r.url = String(w0.location.pathname + w0.location.search);
        } catch (e) { /* segue sem url */ }

        var vistos = {};
        janelas(ctx).forEach(function (w) {
            var els = [];
            try { els = w.document.querySelectorAll(ctx.cfg.seletores.camposNomeados); } catch (e) { els = []; }
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                var tipo = String(el.type || '').toLowerCase();
                if (tipo === 'password' || !el.name) continue;
                if ((tipo === 'radio' || tipo === 'checkbox') && vistos[el.name]) continue;
                vistos[el.name] = true;
                if (r.campos.length >= 150) { r.camposOmitidos++; continue; }
                r.campos.push({
                    nome: String(el.name),
                    valor: String(valoresDe(el)[0]).substring(0, 200),
                    visivel: visivel(el),
                    bloqueado: bloqueado(el)
                });
            }
            var msgs = [];
            try { msgs = w.document.querySelectorAll(ctx.cfg.seletores.mensagens); } catch (e2) { msgs = []; }
            for (var j = 0; j < msgs.length && r.mensagens.length < 8; j++) {
                if (!visivel(msgs[j])) continue;
                var t = textoDe(msgs[j]);
                if (t) r.mensagens.push(t.substring(0, 300));
            }
        });
        return r;
    }

    /* ========================================================================
       LER O FORMULARIO
       Tira do HTML publicado o que o editor oferece para escolher: os campos
       (nome, rotulo, tipo, opcoes, zoom), os botoes e os titulos.

       E feito com expressoes regulares, e nao com DOMParser, para rodar igual
       no navegador e no teste de mesa (Node). O preco e conhecido: campo que
       o JavaScript do formulario cria em tempo de execucao nao aparece - so o
       que esta escrito no HTML. O editor continua aceitando qualquer nome.
       ====================================================================== */
    var TIPO_POR_TYPE = {
        '': 'texto', text: 'texto', email: 'texto', tel: 'texto', search: 'texto', url: 'texto',
        hidden: 'oculto', checkbox: 'caixa', radio: 'radio', date: 'data', 'datetime-local': 'data',
        number: 'numero', zoom: 'zoom', password: 'senha'
    };

    function lerFormulario(html) {
        var fonte = String(html || '')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
        var campos = [], porNome = {}, botoes = [], titulos = [];
        var rotulosPorId = {}, rotulosLivres = [];
        var m;

        var reLabel = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
        while ((m = reLabel.exec(fonte)) !== null) {
            var al = atributos(m[1]), tl = textoHtml(m[2]);
            if (!tl) continue;
            if (al['for']) rotulosPorId[al['for']] = tl;
            else rotulosLivres.push({ inicio: m.index, fim: reLabel.lastIndex, texto: tl, usado: false });
        }

        var reTit = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
        while ((m = reTit.exec(fonte)) !== null) acrescentar(titulos, textoHtml(m[2]));

        var reBtn = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
        while ((m = reBtn.exec(fonte)) !== null) {
            var ab = atributos(m[1]);
            acrescentar(botoes, textoHtml(m[2]) || ab['aria-label'] || ab.title || '');
        }

        var reCampo = /<(input|select|textarea)\b([^>]*)>/gi;
        while ((m = reCampo.exec(fonte)) !== null) {
            var tag = m[1].toLowerCase(), at = atributos(m[2]);
            var typ = String(at.type || '').toLowerCase();
            if (tag === 'input' && /^(button|submit|reset|image)$/.test(typ)) {
                acrescentar(botoes, at.value || '');
                continue;
            }
            var nome = at.name || at.id, instancia = false;
            /* Widget: "busca_${instanceId}" vira "busca" - o motor acha o id
               com a instancia sozinho (acharPorInstancia). Outro ${...} e de
               FreeMarker e muda a cada render: nao serve de referencia. */
            var mi = nome ? /^([A-Za-z0-9_.\-:]+?)_*\$\{\s*instanceId\s*\}$/.exec(nome) : null;
            if (mi) { nome = mi[1]; instancia = true; }
            /* Sem name nem id: o primeiro atributo data-* com valor simples
               vira a referencia "@atributo=valor". */
            if (!nome) {
                for (var k in at) {
                    if (/^data-[a-z0-9_-]+$/.test(k) && /^[A-Za-z0-9_.\-: ]{1,60}$/.test(at[k])) {
                        nome = '@' + k + '=' + at[k];
                        break;
                    }
                }
            }
            if (!nome || !RE_CAMPO.test(nome)) continue;

            var tipo = tag === 'select' ? 'lista' : tag === 'textarea' ? 'area'
                     : (TIPO_POR_TYPE.hasOwnProperty(typ) ? TIPO_POR_TYPE[typ] : typ);
            if (at['data-zoom'] !== undefined && tipo !== 'oculto') tipo = 'zoom';

            var existente = porNome[nome];
            if (existente) {
                if ((tipo === 'radio' || tipo === 'caixa') && at.value) existente.opcoes.push({ valor: at.value, texto: at.value });
                continue;
            }

            var campo = {
                nome: nome,
                porId: !at.name && nome.charAt(0) !== '@',
                instancia: instancia,
                porAtributo: nome.charAt(0) === '@',
                rotulo: (at.id && rotulosPorId[at.id]) || at['aria-label'] || rotuloLivre(rotulosLivres, m.index) ||
                        at.placeholder || at.title || '',
                tipo: tipo,
                somenteLeitura: at.readonly !== undefined || at.disabled !== undefined,
                opcoes: []
            };
            if ((tipo === 'radio' || tipo === 'caixa') && at.value) campo.opcoes.push({ valor: at.value, texto: at.value });
            if (tipo === 'zoom') campo.zoom = lerZoom(at['data-zoom'] || '');
            if (tag === 'select') {
                var fim = fonte.indexOf('</select', reCampo.lastIndex);
                var miolo = fim < 0 ? '' : fonte.substring(reCampo.lastIndex, fim);
                var reOp = /<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/option>|$)/gi, mo;
                while ((mo = reOp.exec(miolo)) !== null) {
                    var ao = atributos(mo[1]), to = textoHtml(mo[2]);
                    var vo = ao.value !== undefined ? ao.value : to;
                    if (vo === '' && to === '') continue;
                    campo.opcoes.push({ valor: vo, texto: to || vo });
                }
            }
            porNome[nome] = campo;
            campos.push(campo);
        }
        return { campos: campos, botoes: botoes, titulos: titulos };
    }

    /* O rotulo sem "for": o <label> que ENVOLVE o campo, ou o que vem logo
       antes dele. Cada rotulo livre serve a um campo so. */
    function rotuloLivre(lista, pos) {
        for (var i = lista.length - 1; i >= 0; i--) {
            var r = lista[i];
            if (r.usado || r.inicio > pos) continue;
            if (pos < r.fim || pos - r.fim < 400) { r.usado = true; return r.texto; }
            return '';
        }
        return '';
    }

    function lerZoom(texto) {
        function chave(k) {
            var m = new RegExp('[\'"]?' + k + '[\'"]?\\s*:\\s*[\'"]([^\'"]+)').exec(texto);
            return m ? m[1] : '';
        }
        return { dataset: chave('datasetId'), exibe: chave('displayKey') };
    }

    function atributos(s) {
        var a = {}, re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, m;
        while ((m = re.exec(String(s))) !== null) {
            var v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
            a[m[1].toLowerCase()] = decodificar(v);
        }
        return a;
    }

    function textoHtml(s) {
        return decodificar(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function decodificar(s) {
        return String(s)
            .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
            .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
            .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    function acrescentar(lista, texto) {
        var t = String(texto || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        if (t && t.length <= 120 && lista.indexOf(t) < 0) lista.push(t);
    }

    /* ========================================================================
       O ARQUIVO DE TESTES (importar / exportar)
       Um .json com os casos de um alvo - para versionar no Git junto do
       formulario, levar de um ambiente para outro, ou escrever num editor.

         { "formato": "delp-testes-de-tela", "versao": 1,
           "alvo": "FORM:399466", "alvoNome": "...", "instrucoes": "...",
           "casos": [ { "codigo", "nome", "dados": {}, "passos": [] } ] }

       O arquivo e DADO: cada caso passa pelo normalizarCaso (o vocabulario
       fechado), e o dataset confere de novo ao gravar. Um .json com uma acao
       "rodarScript" nao entra - do mesmo jeito que nao entraria pelo editor.
       ====================================================================== */
    var FORMATO_ARQUIVO = 'delp-testes-de-tela';

    function montarArquivo(alvo, casos) {
        return {
            formato: FORMATO_ARQUIVO,
            versao: 1,
            alvo: alvo.id,
            alvoNome: alvo.nome,
            exportadoEm: isoLocal(new Date()),
            casos: (casos || []).map(function (c) {
                return { codigo: c.codigo, nome: c.nome, dados: c.dados || {}, passos: c.passos || [] };
            })
        };
    }

    function lerArquivo(texto) {
        var dado;
        try { dado = JSON.parse(String(texto || '')); }
        catch (e) { return { erro: 'O arquivo não é um JSON válido: ' + mensagemDe(e) }; }

        var meta = {}, lista;
        if (Object.prototype.toString.call(dado) === '[object Array]') {
            lista = dado;
        } else if (dado && Object.prototype.toString.call(dado.casos) === '[object Array]') {
            /* 'testes-de-tela' e o nome neutro do mesmo formato (o que a
               Bancada, avulsa, usa); os dois sao aceitos. */
            if (dado.formato && dado.formato !== FORMATO_ARQUIVO && dado.formato !== 'testes-de-tela') {
                return { erro: 'Formato "' + dado.formato + '" não reconhecido. Esperado: ' + FORMATO_ARQUIVO + '.' };
            }
            meta = dado;
            lista = dado.casos;
        } else if (dado && dado.passos) {
            lista = [dado];
        } else {
            return { erro: 'Não achei casos neste arquivo (esperava "casos": [ ... ]).' };
        }
        if (lista.length > 200) return { erro: 'São ' + lista.length + ' casos; o limite por arquivo é 200.' };

        var vistos = {};
        return {
            alvo: String(meta.alvo || ''),
            alvoNome: String(meta.alvoNome || ''),
            instrucoes: String(meta.instrucoes || '').substring(0, 3000),
            /* As simulacoes de dados sao da Bancada (avulsa). O DevTools Kit
               roda contra o Fluig de verdade e as ignora. */
            simulacoes: (meta.simulacoes && typeof meta.simulacoes === 'object') ? meta.simulacoes : null,
            casos: lista.map(function (bruto) {
                var r = normalizarCaso(bruto);
                if (r.caso.codigo && vistos[r.caso.codigo]) r.erros.unshift('Código repetido no arquivo.');
                vistos[r.caso.codigo] = true;
                return { caso: r.caso, erros: r.erros,
                         simulacoes: (bruto && bruto.simulacoes && typeof bruto.simulacoes === 'object') ? bruto.simulacoes : null };
            })
        };
    }

    /* ========================================================================
       MIUDEZAS
       ====================================================================== */
    function mensagemDe(e) {
        if (e == null) return '';
        if (typeof e === 'string') return e;
        return String(e.mensagem || e.message || e);
    }

    /* A hora LOCAL, no formato ISO sem fuso. O toISOString() daria a hora
       em UTC - tres horas adiantada na tela, e no historico. */
    function isoLocal(d) {
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
               p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    function mesclar(base, extra) {
        var r = {};
        Object.keys(base).forEach(function (k) {
            r[k] = (base[k] && typeof base[k] === 'object')
                ? mesclar(base[k], (extra && extra[k]) || {})
                : (extra && extra[k] !== undefined ? extra[k] : base[k]);
        });
        return r;
    }

    /* ========================================================================
       O QUE SAI DAQUI
       ====================================================================== */
    testes.PADRAO = PADRAO;
    /* A tela monta o editor a partir disto: rotulo, ajuda e campos. As funcoes
       executar/descrever ficam fora da copia, para ninguem chamar sem o motor. */
    function vocabularioComTermos() {
        return VOCABULARIO.map(function (d) {
            return { acao: d.acao, rotulo: T(d.rotulo), ajuda: T(d.ajuda),
                     campos: d.campos.map(function (c) {
                         return { nome: c.nome, rotulo: T(c.rotulo), tipo: c.tipo, obrigatorio: c.obrigatorio };
                     }) };
        });
    }
    testes.VOCABULARIO = vocabularioComTermos();

    /* Troca as palavras que a pessoa le (ver OS TERMOS). */
    testes.definirTermos = function (novos) {
        termos = mesclarRaso(TERMOS_PADRAO, novos || {});
        testes.VOCABULARIO = vocabularioComTermos();
    };
    testes.T = T;
    testes.normalizarCaso = normalizarCaso;
    testes.lerFormulario = lerFormulario;
    testes.lerArquivo = lerArquivo;
    testes.montarArquivo = montarArquivo;
    testes.interpolar = interpolar;
    testes.descrever = descrever;
    testes.explicar = explicar;
    testes.Rodada = Rodada;

}(window));
