/* ============================================================================
   web.js - o ambiente das aplicacoes web em teste
   ============================================================================
   Carregado ANTES de qualquer script da aplicacao (o servidor injeta no
   <head>). Uma aplicacao web nao conversa com a plataforma, e sim com as
   APIs dela - um Supabase, um Worker, um backend qualquer. Este arquivo fica
   no meio do caminho, com o arquivo de teste mandando:

     fetch, XMLHttpRequest  a chamada que casa com uma regra de
                            simulacoes.http e respondida pela regra. A que vai
                            para FORA deste computador sem regra e BLOQUEADA,
                            a menos que simulacoes.rede.permitir libere o
                            endereco: teste nao mexe em producao. A chamada ao
                            proprio Test_in (arquivos da aplicacao) segue.
     WebSocket              simulado por simulacoes.websocket; para fora, sem
                            ele, bloqueado (erro e fechamento, como sem rede).
     navigator.sendBeacon   para fora, bloqueado (responde "enviado").
     armazenamento          no comeco de cada caso, o localStorage e o
                            sessionStorage da aplicacao sao limpos e recebem
                            simulacoes.armazenamento - ex.: a sessao de login
                            que a aplicacao procura ao abrir. As chaves
                            "testin-" sao do Test_in e ficam.
     arquivo que nao carrega  script ou folha de estilos com erro vira erro
                            no console: o "Conferir sem erro" pega a tela em
                            branco de um build quebrado.

   Toda chamada de dados fica anotada no caso (o "Conferir chamada" confere
   por ela) e a que ficou sem simulacao vai para o resultado, com o modelo.

   A REGRA (simulacoes.http e uma lista; a primeira que casa responde):
     { "nome": "login",                  o nome no "Conferir chamada"
       "metodo": "POST",                 opcional: qualquer um
       "url": "/auth/v1/token*",         * vale qualquer trecho. Sem "://",
                                         compara so o caminho e a busca;
                                         com, o endereco inteiro
                                         ("https://api.exemplo.com/v2/*")
       "quando": { "grant_type": "password" },  filtros da busca e campos do
                                         corpo JSON; "*" exige o campo, uma
                                         lista aceita qualquer valor dela
       "status": 400,                    padrao 200
       "json": { ... } | "texto": "...", "{{campo}}" devolve o valor recebido
       "cabecalhos": { ... }, "atrasoMs": 300,
       "erroDeRede": true }              falha como sem rede

   A configuracao chega em window.__testin.web (servidor, inline).
============================================================================ */
(function (global) {
    'use strict';

    var cfg = (global.__testin && global.__testin.web) || {};
    var regras = Array.isArray(cfg.http) ? cfg.http : [];
    var permitir = cfg.rede && Array.isArray(cfg.rede.permitir) ? cfg.rede.permitir : [];
    var origem = global.location.origin;
    var fetchOriginal = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;
    var avisados = {};

    function avisarUmaVez(chave, msg) {
        if (avisados[chave]) return;
        avisados[chave] = true;
        try { global.console.warn('[test_in] ' + msg); } catch (e) { /* sem console */ }
    }

    /* ======================================================== armazenamento */
    (function prepararArmazenamento() {
        if (!cfg.caso) return; /* sem rodada (so abrindo a aplicacao): nada muda */
        try {
            var local = global.localStorage;
            if (local.getItem('testin-caso-web') === String(cfg.caso)) return;
            for (var i = local.length - 1; i >= 0; i--) {
                var k = local.key(i);
                if (k && k.indexOf('testin-') !== 0) local.removeItem(k);
            }
            try { global.sessionStorage.clear(); } catch (e) { /* sem sessionStorage */ }
            var arm = cfg.armazenamento || {};
            gravar(local, arm.local);
            try { gravar(global.sessionStorage, arm.sessao); } catch (e) { /* sem sessionStorage */ }
            local.setItem('testin-caso-web', String(cfg.caso));
        } catch (e) {
            avisarUmaVez('armazenamento', 'não consegui preparar o armazenamento da aplicação: ' + e.message);
        }
        function gravar(onde, valores) {
            Object.keys(valores || {}).forEach(function (k) {
                var v = valores[k];
                onde.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            });
        }
    }());

    /* ======================================================== as regras */
    function escRe(t) { return String(t).replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }
    function casaPadrao(padrao, texto) {
        return new RegExp('^' + String(padrao).split('*').map(escRe).join('.*') + '$', 'i').test(texto);
    }
    /* Com "://" (ou comecando por *), o padrao vale para o endereco inteiro;
       sem, so para o caminho e a busca - "/rest/v1/usuarios*". */
    function casaUrl(padrao, u) {
        padrao = String(padrao || '');
        if (!padrao) return false;
        if (padrao.indexOf('://') > 0 || padrao.charAt(0) === '*') return casaPadrao(padrao, u.href);
        return casaPadrao(padrao, u.pathname + u.search);
    }
    function liberado(u) {
        return permitir.some(function (p) { return p === '*' || casaUrl(p, u); });
    }
    function mesmaOrigem(u) { return u.origin === origem; }
    function doTestin(u) { return mesmaOrigem(u) && /^\/__(testin|app)\//.test(u.pathname); }

    /* Os "filtros" da chamada: a busca da URL e os campos simples do corpo
       (JSON ou formulario). E o que o "quando", o eco e o "Conferir chamada"
       enxergam. */
    function parametros(u, corpo) {
        var p = {};
        u.searchParams.forEach(function (v, k) { if (!(k in p)) p[k] = v; });
        if (typeof corpo === 'string' && corpo) {
            var j = null;
            try { j = JSON.parse(corpo); } catch (e) { j = null; }
            if (j && typeof j === 'object' && !Array.isArray(j)) {
                Object.keys(j).forEach(function (k) {
                    var v = j[k];
                    if (v === null || typeof v !== 'object') p[k] = String(v);
                });
            } else if (j === null && corpo.indexOf('=') > 0) {
                try { new URLSearchParams(corpo).forEach(function (v, k) { if (!(k in p)) p[k] = v; }); } catch (e) { /* nao era formulario */ }
            }
        }
        return p;
    }

    function casaQuando(quando, params) {
        return Object.keys(quando || {}).every(function (k) {
            var esperado = quando[k];
            if (!(k in params)) return false;
            if (esperado === '*') return true;
            if (Array.isArray(esperado)) return esperado.map(String).indexOf(params[k]) >= 0;
            return String(esperado) === params[k];
        });
    }

    function acharRegra(metodo, u, params) {
        for (var i = 0; i < regras.length; i++) {
            var r = regras[i];
            if (!r || typeof r !== 'object') continue;
            if (r.metodo && String(r.metodo).toUpperCase() !== metodo) continue;
            if (!casaUrl(r.url, u)) continue;
            if (r.quando && !casaQuando(r.quando, params)) continue;
            return r;
        }
        return null;
    }

    /* O nome da chamada no "Conferir chamada": o da regra, ou o caminho com
       pontos (/rest/v1/usuarios -> rest.v1.usuarios). */
    function nomeDe(regra, u) {
        if (regra && /^[A-Za-z0-9_.\-]{1,80}$/.test(String(regra.nome || ''))) return String(regra.nome);
        var n = u.pathname.split('/').filter(Boolean).join('.').replace(/[^A-Za-z0-9_.\-]/g, '_');
        return (n || u.hostname.replace(/[^A-Za-z0-9_.\-]/g, '_') || 'raiz').slice(-80);
    }

    function ecoar(v, params) {
        if (typeof v === 'string') {
            return v.replace(/\{\{([^}]+)\}\}/g, function (m, k) { return k in params ? params[k] : m; });
        }
        if (Array.isArray(v)) return v.map(function (x) { return ecoar(x, params); });
        if (v && typeof v === 'object') {
            var o = {};
            Object.keys(v).forEach(function (k) { o[k] = ecoar(v[k], params); });
            return o;
        }
        return v;
    }

    var TEXTO_STATUS = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized',
                         403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity',
                         429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };

    function respostaDa(regra, params) {
        var status = Math.min(599, Math.max(200, Number(regra.status) || 200));
        var corpo = '', tipo = 'text/plain; charset=utf-8';
        if (regra.json !== undefined) { corpo = JSON.stringify(ecoar(regra.json, params)); tipo = 'application/json'; }
        else if (regra.texto !== undefined) corpo = String(ecoar(regra.texto, params));
        var cab = { 'content-type': tipo };
        Object.keys(regra.cabecalhos || {}).forEach(function (k) { cab[k.toLowerCase()] = String(regra.cabecalhos[k]); });
        return { status: status, statusText: TEXTO_STATUS[status] || '', corpo: corpo, cabecalhos: cab };
    }

    /* ======================================================== o registro */
    function anotar(nome, params) {
        var filtros = Object.keys(params).map(function (k) { return { campo: k, valor: params[k] }; });
        /* Com a rodada vigiando esta janela, a chamada entra direto no caso;
           antes disso (a abertura da pagina), espera na fila que o motor le. */
        var c = global.__delpTesteCtx;
        if (c && Array.isArray(c.chamadas)) {
            if (c.chamadas.length < 200) c.chamadas.push({ dataset: nome, filtros: filtros });
            return;
        }
        var fila = global.__testeChamadasAntes = global.__testeChamadasAntes || [];
        if (fila.length < 200) fila.push({ nome: nome, restricoes: filtros.map(function (f) { return { _field: f.campo, _initialValue: f.valor }; }) });
    }

    function reportar(nome, metodo, u, params, liberada) {
        if (!fetchOriginal) return;
        var filtros = Object.keys(params).slice(0, 30).map(function (k) { return { campo: k, valor: params[k] }; });
        fetchOriginal('/__testin/pedido', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome, metodo: metodo, url: u.origin + u.pathname, filtros: filtros, liberada: !!liberada,
                                   motivo: liberada ? 'rede liberada (simulacoes.rede.permitir)' : 'bloqueada: sem simulação' })
        }).catch(function () { /* o registro nao pode derrubar a tela */ });
    }

    function bloqueio(metodo, u) {
        var onde = u.origin + u.pathname;
        avisarUmaVez('bloq:' + metodo + onde, 'chamada BLOQUEADA (sem simulação): ' + metodo + ' ' + onde +
            ' - simule em "simulacoes.http" ou libere em "simulacoes.rede.permitir"');
        return 'Failed to fetch (bloqueado pelo Test_in: ' + metodo + ' ' + onde + ' não tem simulação)';
    }

    /* A decisao, igual para fetch e XHR: "simular" (com a regra), "seguir"
       (o proprio endereco, ou liberado) ou "bloquear". */
    function decidir(metodo, u, corpo) {
        var params = parametros(u, corpo);
        var regra = acharRegra(metodo, u, params);
        var d = { params: params, regra: regra, nome: nomeDe(regra, u) };
        if (doTestin(u)) { d.acao = 'seguir'; return d; }
        anotar(d.nome, params);
        if (regra) d.acao = 'simular';
        else if (mesmaOrigem(u)) d.acao = 'seguir';
        else if (liberado(u)) { d.acao = 'seguir'; reportar(d.nome, metodo, u, params, true); }
        else { d.acao = 'bloquear'; reportar(d.nome, metodo, u, params, false); }
        return d;
    }

    function depois(ms) { return new Promise(function (ok) { setTimeout(ok, Math.max(0, Number(ms) || 0)); }); }

    /* ======================================================== fetch */
    if (fetchOriginal) {
        var fetchSimulado = function (entrada, init) {
            var req;
            try { req = new global.Request(entrada, init); } catch (e) { return fetchOriginal(entrada, init); }
            var u = new URL(req.url, global.location.href);
            var metodo = String(req.method || 'GET').toUpperCase();
            var corpo = (metodo === 'GET' || metodo === 'HEAD') ? Promise.resolve('')
                : req.clone().text().catch(function () { return ''; });
            return corpo.then(function (texto) {
                var d = decidir(metodo, u, texto);
                if (d.acao === 'seguir') return fetchOriginal(req);
                if (d.acao === 'bloquear') throw new TypeError(bloqueio(metodo, u));
                return depois(d.regra.atrasoMs).then(function () {
                    if (d.regra.erroDeRede) throw new TypeError('Failed to fetch (falha de rede simulada pelo Test_in)');
                    var r = respostaDa(d.regra, d.params);
                    var semCorpo = r.status === 204 || r.status === 205 || r.status === 304 || metodo === 'HEAD';
                    var resp = new global.Response(semCorpo ? null : r.corpo, { status: r.status, statusText: r.statusText, headers: r.cabecalhos });
                    try { Object.defineProperty(resp, 'url', { value: u.href }); } catch (e) { /* segue sem */ }
                    return resp;
                });
            });
        };
        global.fetch = fetchSimulado;
    }

    /* ======================================================== XMLHttpRequest */
    var XHR = global.XMLHttpRequest;
    if (XHR && XHR.prototype) {
        var P = XHR.prototype, abrirOriginal = P.open, mandarOriginal = P.send;
        P.open = function (metodo, url) {
            try { this.__testinReq = { metodo: String(metodo || 'GET').toUpperCase(), u: new URL(String(url), global.location.href) }; }
            catch (e) { this.__testinReq = null; }
            return abrirOriginal.apply(this, arguments);
        };
        P.send = function (corpo) {
            var t = this.__testinReq;
            if (!t) return mandarOriginal.apply(this, arguments);
            var d = decidir(t.metodo, t.u, typeof corpo === 'string' ? corpo : '');
            if (d.acao === 'seguir') return mandarOriginal.apply(this, arguments);
            var xhr = this;
            if (d.acao === 'bloquear') {
                var msg = bloqueio(t.metodo, t.u);
                setTimeout(function () { falharXhr(xhr, msg); }, 0);
                return undefined;
            }
            depois(d.regra.atrasoMs).then(function () {
                if (d.regra.erroDeRede) return falharXhr(xhr, 'falha de rede simulada pelo Test_in');
                responderXhr(xhr, respostaDa(d.regra, d.params), t.u);
            });
            return undefined;
        };
    }

    function fixar(xhr, nome, valor) {
        try { Object.defineProperty(xhr, nome, { configurable: true, get: function () { return valor; } }); } catch (e) { /* segue */ }
    }
    function disparar(alvo, tipo) {
        var ev;
        try { ev = new global.ProgressEvent(tipo); } catch (e) { ev = new global.Event(tipo); }
        alvo.dispatchEvent(ev);
    }
    function responderXhr(xhr, r, u) {
        var resposta = r.corpo;
        if (xhr.responseType === 'json') { try { resposta = r.corpo ? JSON.parse(r.corpo) : null; } catch (e) { resposta = null; } }
        fixar(xhr, 'readyState', 4);
        fixar(xhr, 'status', r.status);
        fixar(xhr, 'statusText', r.statusText);
        fixar(xhr, 'responseURL', u.href);
        fixar(xhr, 'responseText', r.corpo);
        fixar(xhr, 'response', resposta);
        xhr.getResponseHeader = function (nome) { var v = r.cabecalhos[String(nome).toLowerCase()]; return v === undefined ? null : v; };
        xhr.getAllResponseHeaders = function () {
            return Object.keys(r.cabecalhos).map(function (k) { return k + ': ' + r.cabecalhos[k]; }).join('\r\n');
        };
        ['readystatechange', 'load', 'loadend'].forEach(function (t) { disparar(xhr, t); });
    }
    function falharXhr(xhr, motivo) {
        fixar(xhr, 'readyState', 4);
        fixar(xhr, 'status', 0);
        fixar(xhr, 'responseText', '');
        fixar(xhr, 'response', '');
        avisarUmaVez('xhr:' + motivo, motivo);
        ['readystatechange', 'error', 'loadend'].forEach(function (t) { disparar(xhr, t); });
    }

    /* ======================================================== WebSocket */
    var SocketOriginal = global.WebSocket;
    function SocketFalso(url, simulado) {
        var self = this;
        self.url = String(url);
        self.readyState = 0;
        self.protocol = '';
        self._ouvintes = {};
        self._simulado = simulado;
        setTimeout(function () {
            if (simulado) { self.readyState = 1; self._emitir('open', {}); return; }
            self.readyState = 3;
            self._emitir('error', {});
            self._emitir('close', { code: 1006, reason: 'bloqueado pelo Test_in', wasClean: false });
        }, 30);
    }
    SocketFalso.prototype.addEventListener = function (t, fn) { (this._ouvintes[t] = this._ouvintes[t] || []).push(fn); };
    SocketFalso.prototype.removeEventListener = function (t, fn) {
        this._ouvintes[t] = (this._ouvintes[t] || []).filter(function (f) { return f !== fn; });
    };
    SocketFalso.prototype._emitir = function (t, ev) {
        var self = this;
        (self._ouvintes[t] || []).forEach(function (fn) { try { fn.call(self, ev); } catch (e) { setTimeout(function () { throw e; }); } });
        if (typeof self['on' + t] === 'function') self['on' + t](ev);
    };
    SocketFalso.prototype.send = function (bruto) {
        if (!this._simulado) return;
        var self = this, ws = cfg.websocket || {}, msg = null;
        try { msg = JSON.parse(bruto); } catch (e) { msg = null; }
        var acao = msg ? msg[ws.campoAcao || 'action'] : String(bruto);
        var resposta = (ws.respostas || {})[acao];
        if (resposta === undefined) return;
        setTimeout(function () {
            self._emitir('message', { data: typeof resposta === 'string' ? resposta : JSON.stringify(resposta) });
        }, 10);
    };
    SocketFalso.prototype.close = function () { this.readyState = 3; };

    if (SocketOriginal) {
        var SocketTestin = function (url, protocolos) {
            var u;
            try { u = new URL(String(url), global.location.href); } catch (e) { return new SocketOriginal(url, protocolos); }
            if (u.host === global.location.host || liberado(u)) return new SocketOriginal(url, protocolos);
            var nome = 'websocket.' + u.hostname.replace(/[^A-Za-z0-9_.\-]/g, '_');
            anotar(nome, {});
            if (cfg.websocket) return new SocketFalso(url, true);
            avisarUmaVez('ws:' + u.host, 'WebSocket BLOQUEADO (sem simulação): ' + u.origin + u.pathname +
                ' - simule em "simulacoes.websocket" ou libere em "simulacoes.rede.permitir"');
            reportar(nome, 'WS', u, {}, false);
            return new SocketFalso(url, false);
        };
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { SocketTestin[k] = i; SocketFalso[k] = i; });
        SocketTestin.prototype = SocketOriginal.prototype;
        global.WebSocket = SocketTestin;
    }

    /* ======================================================== sendBeacon */
    var nav = global.navigator;
    if (nav && typeof nav.sendBeacon === 'function') {
        var beaconOriginal = nav.sendBeacon.bind(nav);
        try {
            nav.sendBeacon = function (url, dados) {
                var u;
                try { u = new URL(String(url), global.location.href); } catch (e) { return beaconOriginal(url, dados); }
                if (mesmaOrigem(u) || liberado(u)) return beaconOriginal(url, dados);
                var nome = nomeDe(null, u);
                anotar(nome, parametros(u, ''));
                reportar(nome, 'BEACON', u, parametros(u, ''), false);
                return true;
            };
        } catch (e) { /* navegador que nao deixa trocar: segue */ }
    }

    /* ======================================================== o que nao carregou
       O script do build que volta 404 nao e "erro de JavaScript" para o
       navegador - a tela so fica em branco. Aqui ele vira erro no console.
       Antes de a rodada vigiar a janela, a mensagem espera; depois, o motor
       anota. */
    var naoCarregou = [];
    function relatarNaoCarregou(msg) {
        if (global.__delpTesteVigia) { try { global.console.error(msg); } catch (e) { /* sem console */ } return; }
        naoCarregou.push(msg);
    }
    global.addEventListener('error', function (ev) {
        var t = ev && ev.target;
        if (!t || t === global || !t.tagName) return;
        var tag = t.tagName.toLowerCase();
        var endereco = tag === 'script' ? t.src : (tag === 'link' && /stylesheet/i.test(t.rel || '') ? t.href : '');
        if (!endereco) return;
        relatarNaoCarregou('Não carregou: ' + String(endereco).replace(origem, '') +
            (tag === 'script' ? ' (script)' : ' (folha de estilos)') + ' - confira se o build está completo e os caminhos batem');
    }, true);
    var tentativas = 0;
    var repassar = setInterval(function () {
        if (!global.__delpTesteVigia && ++tentativas < 200) return;
        clearInterval(repassar);
        naoCarregou.splice(0).forEach(function (m) { try { global.console.error(m); } catch (e) { /* sem console */ } });
    }, 50);
}(window));
