/* ============================================================================
   ambiente.js - a plataforma que a tela testada espera encontrar
   ============================================================================
   Carregado ANTES de qualquer script da tela (o servidor injeta no <head>).
   Define os objetos globais que a tela chama - com os nomes que ela espera,
   porque o codigo testado NAO muda:

     WCMAPI          usuario, empresa, endereco
     DatasetFactory  consultas de dados -> respondidas pelas SIMULACOES do
                     arquivo de teste (servidor: /__testin/dados)
     FLUIGC          a biblioteca de componentes: aviso, janela, carregando,
                     chave liga/desliga, calendario... O que nao e emulado
                     avisa no console e nao quebra a tela.
     WebSocket       simulado: conecta e responde o que o arquivo de teste
                     mandar (ou fica mudo) - sem servidor de verdade.
     SuperWidget     o ciclo de vida dos modulos de pagina.

   E dois comportamentos de tela:
     - o campo de busca com lista (input type="zoom") vira o componente de
       tags + sugestoes, alimentado pelas simulacoes;
     - a CASCA da tela de fluxo tem o botao Enviar, que chama o
       beforeSendValidate da tela e o evento de validacao no servidor.

   A configuracao chega em window.__testin (servidor, inline).
============================================================================ */
(function (global) {
    'use strict';

    var cfg = global.__testin || {};
    var sim = cfg.simulacoes || {};
    var usuario = sim.usuario || {};
    var avisados = {};

    function avisarUmaVez(chave, msg) {
        if (avisados[chave]) return;
        avisados[chave] = true;
        try { global.console.warn('[test_in] ' + msg); } catch (e) { /* sem console */ }
    }

    function naoEmulado(nome) {
        /* Membro desconhecido da biblioteca: um aviso e uma funcao que nao faz
           nada - melhor do que a tela parar num "is not a function". */
        if (typeof Proxy === 'undefined') return null;
        return function alvo(base) {
            return new Proxy(base, {
                get: function (o, k) {
                    if (k in o || typeof k !== 'string') return o[k];
                    avisarUmaVez(nome + '.' + k, nome + '.' + k + ' não é emulado no Test_in (ignorado).');
                    return function () { return undefined; };
                }
            });
        };
    }

    /* ======================================================== WCMAPI */
    var wcm = {
        userLogin: usuario.login || 'usuario.teste',
        user: usuario.nome || 'Usuário de Teste',
        userCode: usuario.codigo || usuario.login || 'usuario.teste',
        userEmail: usuario.email || 'usuario.teste@exemplo.com',
        tenantCode: '1', organizationId: '1', tenantURI: '/portal/p/1',
        serverURL: global.location ? global.location.protocol + '//' + global.location.host : '',
        getServerURL: function () { return this.serverURL; },
        getTenantCode: function () { return '1'; },
        getUserCode: function () { return this.userCode; },
        getUserLogin: function () { return this.userLogin; },
        getUser: function () { return this.user; },
        getOrganizationId: function () { return '1'; },
        isMobileAppMode: function () { return false; }
    };
    global.WCMAPI = (naoEmulado('WCMAPI') || function (b) { return b; })(wcm);
    global.WCMSpaceAPI = global.WCMSpaceAPI || { PageService: { getPageCode: function () { return 'test_in'; } } };

    /* ======================================================== dados */
    global.ConstraintType = { MUST: 1, SHOULD: 2, MUST_NOT: 3 };

    function consultarDados(nome, restricoes) {
        anotarAntes(nome, restricoes);
        var corpo = JSON.stringify({
            nome: String(nome),
            restricoes: (restricoes || []).map(function (r) {
                return {
                    campo: String(r._field !== undefined ? r._field : r.fieldName),
                    valor: r._initialValue !== undefined ? r._initialValue : r.initialValue,
                    tipo: Number(r._type !== undefined ? r._type : (r.constraintType !== undefined ? r.constraintType : 1))
                };
            })
        });
        /* SINCRONO de proposito: o getDataset da plataforma e sincrono, e a
           tela escreve o codigo contando com isso. */
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/__testin/dados', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(corpo);
        var r = {};
        try { r = JSON.parse(xhr.responseText || '{}'); } catch (e) { r = { erro: 'resposta ilegível do Test_in' }; }
        if (r.erro) throw new Error(r.erro);
        return { columns: r.columns || [], values: r.values || [] };
    }

    /* AS CONSULTAS DA ABERTURA. O motor so passa a vigiar a tela depois que
       ela carregou - e a tela costuma consultar dados logo no inicio (papeis,
       listas, parametros). Ate o motor chegar (__delpTesteCtx), as consultas
       ficam aqui, e ele as recolhe para o caso: e isso que deixa o "Conferir
       chamada" enxergar uma consulta feita na abertura. */
    var antes = global.__testeChamadasAntes = [];
    function anotarAntes(nome, restricoes) {
        if (global.__delpTesteCtx || antes.length >= 200) return;
        antes.push({ nome: String(nome), restricoes: restricoes || [] });
    }
    var REST_DADOS = /\/api\/public\/ecm\/dataset\/datasets(?:[?#]|$)/;
    function anotarCorpoRest(corpo) {
        if (typeof corpo !== 'string') return;
        try { var c = JSON.parse(corpo); if (c && c.name) anotarAntes(c.name, c.constraints); } catch (e) { /* nao era JSON */ }
    }
    (function () {
        var X = global.XMLHttpRequest && global.XMLHttpRequest.prototype;
        if (X) {
            var abrir = X.open, mandar = X.send;
            X.open = function (metodo, url) { this.__testeRest = REST_DADOS.test(String(url || '')); return abrir.apply(this, arguments); };
            X.send = function (corpo) { if (this.__testeRest) anotarCorpoRest(corpo); return mandar.apply(this, arguments); };
        }
        if (typeof global.fetch === 'function') {
            var buscar = global.fetch;
            global.fetch = function (entrada, op) {
                var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url);
                if (REST_DADOS.test(String(url || '')) && op) anotarCorpoRest(op.body);
                return buscar.apply(this, arguments);
            };
        }
    })();

    global.DatasetFactory = {
        createConstraint: function (campo, inicial, final, tipo, likeSearch) {
            return { _field: campo, _initialValue: inicial, _finalValue: final, _type: tipo, _likeSearch: !!likeSearch };
        },
        getDataset: function (nome, campos, restricoes, ordem, retorno) {
            if (retorno && typeof retorno === 'object' && (retorno.success || retorno.error)) {
                try { var d = consultarDados(nome, restricoes); setTimeout(function () { if (retorno.success) retorno.success(d); }, 0); }
                catch (e) { setTimeout(function () { if (retorno.error) retorno.error(null, 'error', e.message); }, 0); }
                return undefined;
            }
            return consultarDados(nome, restricoes);
        },
        getDatasetAsync: function (nome, campos, restricoes) {
            return new Promise(function (ok, falha) {
                try { ok(consultarDados(nome, restricoes)); } catch (e) { falha(e); }
            });
        }
    };

    /* ======================================================== WebSocket */
    var wsCfg = sim.websocket || {};
    function SocketSimulado(url) {
        var self = this;
        self.url = String(url);
        self.readyState = 0;
        self._ouvintes = {};
        setTimeout(function () { self.readyState = 1; self._emitir('open', {}); }, 30);
    }
    SocketSimulado.CONNECTING = 0; SocketSimulado.OPEN = 1; SocketSimulado.CLOSING = 2; SocketSimulado.CLOSED = 3;
    SocketSimulado.prototype.addEventListener = function (t, fn) { (this._ouvintes[t] = this._ouvintes[t] || []).push(fn); };
    SocketSimulado.prototype.removeEventListener = function (t, fn) {
        this._ouvintes[t] = (this._ouvintes[t] || []).filter(function (f) { return f !== fn; });
    };
    SocketSimulado.prototype._emitir = function (t, ev) {
        var self = this;
        (self._ouvintes[t] || []).forEach(function (fn) { try { fn.call(self, ev); } catch (e) { setTimeout(function () { throw e; }); } });
        if (typeof self['on' + t] === 'function') self['on' + t](ev);
    };
    SocketSimulado.prototype.send = function (bruto) {
        var self = this, msg = null;
        try { msg = JSON.parse(bruto); } catch (e) { msg = null; }
        var acao = msg ? msg[wsCfg.campoAcao || 'action'] : String(bruto);
        var resposta = (wsCfg.respostas || {})[acao];
        if (resposta === undefined) return;
        setTimeout(function () {
            self._emitir('message', { data: typeof resposta === 'string' ? resposta : JSON.stringify(resposta) });
        }, 10);
    };
    /* Fechar NAO dispara "close": telas costumam recarregar a pagina quando o
       socket fecha, e a propria tela fechando ao sair nao pode virar um loop. */
    SocketSimulado.prototype.close = function () { this.readyState = 3; };
    global.WebSocket = SocketSimulado;

    /* ======================================================== biblioteca de componentes */
    function el(tag, classe, texto) {
        var e = document.createElement(tag);
        if (classe) e.className = classe;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }

    function noCorpo(fn) {
        if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
    }

    var componentes = {
        toast: function (op) {
            op = op || {};
            noCorpo(function () {
                var caixa = document.querySelector('.testin-toasts');
                if (!caixa) { caixa = el('div', 'testin-toasts'); document.body.appendChild(caixa); }
                var t = el('div', 'testin-toast testin-toast--' + (op.type || 'info'));
                if (op.title) t.appendChild(el('strong', '', String(op.title) + ' '));
                t.appendChild(el('span', '', String(op.message || '').replace(/<[^>]*>/g, '')));
                caixa.appendChild(t);
                setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, Number(op.timeout) || 6000);
            });
        },
        modal: function (op) {
            op = op || {};
            var fundo = el('div', 'testin-modal');
            var janela = el('div', 'testin-modal__janela');
            janela.appendChild(el('div', 'testin-modal__titulo', String(op.title || '')));
            var corpo = el('div', 'testin-modal__corpo');
            corpo.innerHTML = String(op.content || '');
            janela.appendChild(corpo);
            var rodape = el('div', 'testin-modal__rodape');
            (op.actions || [{ label: 'Fechar', autoClose: true }]).forEach(function (a) {
                var b = el('button', 'testin-btn', String(a.label || 'OK'));
                b.type = 'button';
                if (a.bind) b.setAttribute(String(a.bind).replace(/^data-/, 'data-'), '');
                b.addEventListener('click', function () { if (a.autoClose !== false) remover(); });
                rodape.appendChild(b);
            });
            janela.appendChild(rodape);
            fundo.appendChild(janela);
            function remover() { if (fundo.parentNode) fundo.parentNode.removeChild(fundo); }
            noCorpo(function () { document.body.appendChild(fundo); });
            return { remove: remover, close: remover };
        },
        message: {
            alert: function (op, cb) {
                componentes.modal({ title: op.title || 'Aviso', content: op.message || '' });
                if (cb) setTimeout(function () { cb(true); }, 0);
            },
            confirm: function (op, cb) {
                componentes.modal({ title: op.title || 'Confirmação', content: op.message || '' });
                if (cb) setTimeout(function () { cb(true); }, 0);
            },
            error: function (op, cb) {
                componentes.modal({ title: op.title || 'Erro', content: op.message || '' });
                if (cb) setTimeout(function () { cb(true); }, 0);
            }
        },
        loading: function (alvo) {
            var camada = null;
            return {
                show: function () {
                    noCorpo(function () {
                        if (camada) return;
                        camada = el('div', 'testin-carregando', 'Carregando…');
                        document.body.appendChild(camada);
                    });
                },
                hide: function () { if (camada && camada.parentNode) camada.parentNode.removeChild(camada); camada = null; }
            };
        },
        switcher: {
            init: function () {}, destroy: function () {}, onChange: function () {},
            setTrue: function (s) { marcar(s, true); }, setFalse: function (s) { marcar(s, false); },
            getState: function (s) { var e = acharUm(s); return !!(e && e.checked); },
            isReadOnly: function () { return false; }, disable: function () {}, enable: function () {}
        },
        calendar: function (alvo) {
            return { setDate: function (d) { var e = acharUm(alvo); if (e) e.value = String(d || ''); },
                     getDate: function () { var e = acharUm(alvo); return e ? e.value : ''; },
                     setMinDate: function () {}, setMaxDate: function () {}, disable: function () {}, enable: function () {} };
        },
        autocomplete: function () {
            return { add: function () {}, remove: function () {}, removeAll: function () {}, items: function () { return []; },
                     destroy: function () {}, on: function () {} };
        },
        filter: function () { return { on: function () {}, reload: function () {}, destroy: function () {} }; },
        popover: function () {}, tooltip: function () {},
        utilities: { parseInputDate: function (v) { return v; }, randomUUID: function () { return String(Date.now()); } }
    };

    function acharUm(s) {
        if (!s) return null;
        if (s.nodeType) return s;
        if (s.jquery) return s[0];
        try { return document.querySelector(String(s)); } catch (e) { return null; }
    }
    function marcar(s, v) { var e = acharUm(s); if (e) e.checked = v; }

    global.FLUIGC = (naoEmulado('FLUIGC') || function (b) { return b; })(componentes);

    /* ======================================================== campo de busca com lista (zoom) */
    function lerConfigDoCampo(texto) {
        var t = String(texto || '').trim();
        try { return JSON.parse(t); } catch (e) { /* segue */ }
        try { return JSON.parse(t.replace(/'/g, '"')); } catch (e2) { return {}; }
    }

    function filtrosDe(valorFiltro) {
        var partes = String(valorFiltro || '').split(','), r = [];
        for (var i = 0; i + 1 < partes.length; i += 2) {
            r.push(global.DatasetFactory.createConstraint(partes[i].trim(), partes[i + 1].trim(), partes[i + 1].trim(), 1));
        }
        return r;
    }

    function montarCampoDeBusca(input) {
        var conf = lerConfigDoCampo(input.getAttribute('data-zoom'));
        var chave = conf.displayKey || 'descricao';
        var maximo = Number(conf.maximumSelectionLength || 0);
        var campos = (conf.fields || []).filter(function (f) { return f && (f.search === true || f.search === 'true'); })
            .map(function (f) { return f.field; });
        if (!campos.length) campos = [chave];

        var select = document.createElement('select');
        select.multiple = true;
        ['name', 'id', 'class', 'data-zoom', 'type'].forEach(function (a) {
            if (input.getAttribute(a) !== null) select.setAttribute(a === 'type' ? 'data-tipo' : a, input.getAttribute(a));
        });
        select.style.display = 'none';

        var caixa = el('div', 'bootstrap-tagsinput');
        var tt = el('span', 'twitter-typeahead');
        var entrada = el('input', 'tt-input');
        entrada.type = 'text';
        entrada.placeholder = conf.placeholder || '';
        entrada.setAttribute('autocomplete', 'off');
        var menu = el('div', 'tt-menu');
        menu.style.display = 'none';
        tt.appendChild(entrada);
        tt.appendChild(menu);
        caixa.appendChild(tt);

        input.parentNode.replaceChild(select, input);
        if (select.nextSibling) select.parentNode.insertBefore(caixa, select.nextSibling);
        else select.parentNode.appendChild(caixa);

        var relogio = null;
        entrada.addEventListener('input', function () {
            clearTimeout(relogio);
            relogio = setTimeout(buscar, 200);
        });
        entrada.addEventListener('keyup', function () { clearTimeout(relogio); relogio = setTimeout(buscar, 200); });

        function buscar() {
            var termo = entrada.value.trim().toLowerCase();
            menu.innerHTML = '';
            /* Como o componente da plataforma: so lista depois de digitar. */
            if (!termo) { menu.style.display = 'none'; return; }
            var linhas = [];
            try {
                linhas = global.DatasetFactory.getDataset(conf.datasetId, null, filtrosDe(conf.filterValues), null).values || [];
            } catch (e) {
                menu.appendChild(el('div', 'tt-suggestion tt-message', 'Erro ao consultar: ' + e.message));
                menu.style.display = 'block';
                return;
            }
            var achadas = linhas.filter(function (l) {
                return campos.some(function (c) { return String(l[c] == null ? '' : l[c]).toLowerCase().indexOf(termo) >= 0; });
            }).slice(0, 20);
            if (!achadas.length) menu.appendChild(el('div', 'tt-suggestion tt-message', 'Nenhum resultado'));
            achadas.forEach(function (l) {
                var s = el('div', 'tt-suggestion tt-selectable', String(l[chave] == null ? '' : l[chave]));
                s.addEventListener('click', function () { escolher(l); });
                menu.appendChild(s);
            });
            menu.style.display = 'block';
        }

        function escolher(linha) {
            if (maximo === 1) limpar(true);
            var texto = String(linha[chave] == null ? '' : linha[chave]);
            var op = document.createElement('option');
            op.value = texto; op.textContent = texto; op.selected = true;
            select.appendChild(op);
            var tag = el('span', 'tag label label-info', texto);
            var x = el('span', '', ' ×');
            x.setAttribute('data-role', 'remove');
            x.addEventListener('click', function () {
                if (op.parentNode) op.parentNode.removeChild(op);
                if (tag.parentNode) tag.parentNode.removeChild(tag);
                if (typeof global.removedZoomItem === 'function') global.removedZoomItem(item);
            });
            tag.appendChild(x);
            caixa.insertBefore(tag, tt);
            entrada.value = '';
            menu.style.display = 'none';
            var item = {};
            Object.keys(linha).forEach(function (k) { item[k] = linha[k]; });
            item.inputId = select.id; item.inputName = select.name; item.type = select.getAttribute('data-tipo') || 'zoom';
            if (typeof global.setSelectedZoomItem === 'function') global.setSelectedZoomItem(item);
        }

        function limpar(silencioso) {
            Array.prototype.slice.call(caixa.querySelectorAll('.tag')).forEach(function (t) { t.parentNode.removeChild(t); });
            select.innerHTML = '';
            if (!silencioso && typeof global.removedZoomItem === 'function') global.removedZoomItem({ inputId: select.id });
        }

        return {
            setValue: function (v) {
                limpar(true);
                if (v) { var o = {}; o[chave] = v; escolher(o); }
            },
            clear: function () { limpar(false); },
            disable: function (sim2) { entrada.disabled = sim2 !== false; },
            open: function () { entrada.focus(); },
            setFilters: function () {}, reload: function () {},
            getSelectedItems: function () { return Array.prototype.map.call(select.options, function (o) { return o.value; }); }
        };
    }

    function montarCamposDeBusca() {
        var lista = document.querySelectorAll('input[type="zoom"]');
        Array.prototype.slice.call(lista).forEach(function (input) {
            try {
                var nome = input.name || input.id;
                var api = montarCampoDeBusca(input);
                if (nome && !(nome in global)) global[nome] = api;
                else if (nome) global['__zoom_' + nome] = api;
            } catch (e) { try { global.console.error('[test_in] campo de busca: ' + e.message); } catch (x) { /* nada */ } }
        });
    }

    /* ======================================================== o ciclo de vida dos modulos */
    var baseDoModulo = {
        getInstanceId: function () { return this.instanceId; }
    };
    global.SuperWidget = {
        extend: function (proto) {
            function Modulo(op) { op = op || {}; this.instanceId = op.instanceId; }
            Modulo.prototype = Object.create(baseDoModulo);
            Object.keys(proto || {}).forEach(function (k) { Modulo.prototype[k] = proto[k]; });
            Modulo.__testinModulo = true;
            Modulo.instance = function (op) {
                var i = new Modulo(op || { instanceId: (cfg.modulo || {}).instancia });
                i.__porParams = true;
                return i;
            };
            Modulo.extend = function (mais) {
                var junto = {};
                Object.keys(proto || {}).forEach(function (k) { junto[k] = proto[k]; });
                Object.keys(mais || {}).forEach(function (k) { junto[k] = mais[k]; });
                return global.SuperWidget.extend(junto);
            };
            return Modulo;
        }
    };

    function prepararModulo(inst, raiz) {
        var instancia = (cfg.modulo || {}).instancia;
        if (inst.instanceId === undefined) inst.instanceId = instancia;
        inst.DOM = global.jQuery ? global.jQuery(raiz) : raiz;
        var $ = global.jQuery;
        var ligacoes = inst.bindings || {};
        [['local', raiz], ['global', document]].forEach(function (par) {
            var mapa = ligacoes[par[0]] || {};
            Object.keys(mapa).forEach(function (nome) {
                (mapa[nome] || []).forEach(function (ev) {
                    var m = /^([a-z]+)_(\w+)$/.exec(String(ev));
                    if (!m) return;
                    var trata = function (e) {
                        if (typeof inst[m[2]] === 'function') inst[m[2]].call(inst, this, e);
                    };
                    if ($) $(par[1]).on(m[1], '[data-' + nome + ']', trata);
                    else par[1].addEventListener(m[1], function (e) {
                        var alvo = e.target && e.target.closest ? e.target.closest('[data-' + nome + ']') : null;
                        if (alvo) trata.call(alvo, e);
                    });
                });
            });
        });
        if (typeof inst.init === 'function') inst.init();
    }

    /* ======================================================== a casca da tela de fluxo */
    function iniciarCasca() {
        var tela = document.querySelector('[data-casca-tela]');
        var enviar = document.querySelector('[data-casca-enviar]');
        var aviso = document.querySelector('[data-casca-aviso]');
        if (!tela || !enviar) return;

        function avisar(texto, tipo) {
            aviso.textContent = texto;
            aviso.className = 'casca__aviso casca__aviso--' + (tipo || 'info');
            aviso.hidden = false;
        }

        /* Como na plataforma: o Enviar so habilita quando a tela carregou. */
        tela.addEventListener('load', function () { enviar.disabled = false; });

        enviar.addEventListener('click', function () {
            aviso.hidden = true;
            var w = tela.contentWindow;
            var atividade = sim.atividade !== undefined ? sim.atividade : 0;
            var destino = sim.destino !== undefined ? sim.destino : '';
            var ok = true;
            try {
                if (w && typeof w.beforeSendValidate === 'function') ok = w.beforeSendValidate(atividade, destino);
            } catch (e) {
                avisar('A tela recusou o envio: ' + (e.message || e), 'erro');
                return;
            }
            if (ok === false) return;

            var valores = {};
            try {
                Array.prototype.forEach.call(w.document.querySelectorAll('input[name], select[name], textarea[name]'), function (c) {
                    if ((c.type === 'checkbox' || c.type === 'radio') && !c.checked) return;
                    valores[c.name] = c.value;
                });
            } catch (e2) { /* tela de outro endereço: segue sem valores */ }

            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/__testin/evento', false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({ app: cfg.app, evento: 'validateForm', valores: valores }));
            var r = {};
            try { r = JSON.parse(xhr.responseText || '{}'); } catch (e3) { r = {}; }
            if (r.erro) { avisar(r.erro, 'erro'); return; }
            avisar('Enviado com sucesso (simulação): nenhum dado foi gravado de verdade.', 'ok');
        });
    }

    /* ======================================================== de pé */
    global.TestinPlataforma = {
        iniciarModulo: function () {
            var m = cfg.modulo || {};
            var criados = [];
            Array.prototype.forEach.call(document.querySelectorAll('[data-params]'), function (raiz) {
                try {
                    var expr = String(raiz.getAttribute('data-params'));
                    if (!/^[\w$.]+\s*\(\s*\)$/.test(expr)) return;         /* so "Nome.instance()" */
                    var partes = expr.replace(/\s*\(\s*\)$/, '').split('.');
                    var f = global;
                    for (var i = 0; i < partes.length - 1; i++) f = f && f[partes[i]];
                    var inst = f && typeof f[partes[partes.length - 1]] === 'function' ? f[partes[partes.length - 1]]() : null;
                    if (inst) { prepararModulo(inst, raiz); criados.push(inst); }
                } catch (e) { global.console.error('[test_in] ' + e.message); }
            });
            var Classe = m.codigo ? global[m.codigo] : null;
            if (!criados.length && Classe && Classe.__testinModulo) {
                var raiz = document.getElementById(m.codigo + '_' + m.instancia) ||
                           document.querySelector('[id^="' + m.codigo + '_"]') ||
                           document.querySelector('[data-testin-modulo]');
                try { prepararModulo(new Classe({ instanceId: m.instancia }), raiz); }
                catch (e) { global.console.error('[test_in] ' + e.message); }
            }
        }
    };

    if (cfg.modo === 'tela') document.addEventListener('DOMContentLoaded', montarCamposDeBusca);
    if (cfg.modo === 'casca') document.addEventListener('DOMContentLoaded', iniciarCasca);

    /* O que os eventos de servidor avisaram (metodo nao simulado, fonte sem
       simulacao) vai para o console - e o motor anota como erro visivel. */
    if (cfg.servidor && cfg.servidor.avisos && cfg.servidor.avisos.length) {
        cfg.servidor.avisos.forEach(function (a) { avisarUmaVez('srv:' + a, 'servidor: ' + a); });
    }
}(window));
