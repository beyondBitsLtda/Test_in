/* ============================================================================
   emulacao.js - o lado do servidor da emulacao da plataforma
   ============================================================================
   A tela testada foi escrita para rodar dentro de uma plataforma que a
   Test_in NAO tem. Em vez de mexer no codigo dela, o Test_in responde as
   mesmas perguntas que a plataforma responderia:

     - a tela pede /portal/resources/js/jquery/jquery.js? recebe o jQuery;
     - chama DatasetFactory.getDataset? recebe as linhas SIMULADAS do arquivo
       de teste (ver simularDados);
     - tem eventos de servidor (events/displayFields.js...)? eles rodam aqui,
       numa sandbox, e o efeito deles (valores, campos bloqueados, ocultos)
       chega ao HTML antes do primeiro script da tela rodar - como na
       plataforma, que renderiza o formulario ja com eles aplicados.

   O modulo de pagina tem o modelo (view.ftl) renderizado por um
   mini-interpretador do que os modelos costumam usar, com os textos dos
   .properties e os recursos na ordem do application.info.

   O arquivo de teste manda nas simulacoes; o codigo da tela nao muda.
============================================================================ */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var descobrir = require('./descobrir');

function ler(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

/* ==========================================================================
   AS SIMULACOES
   --------------------------------------------------------------------------
   {
     "usuario":   { "login", "nome", "email", "codigo" },
     "atividade": 0,            etapa em que a tela abre (e o que getValue("WKNumState") devolve)
     "destino":   20,           etapa para onde o "Enviar" manda
     "modo":      "ADD",        o que form.getFormMode() devolve
     "fontes": {
       "dsNome": [
         { "quando": { "CAMPO": "valor", "OUTRO": "*" }, "linhas": [ { ... } ] },
         { "quando": { "TIPO": ["A","B"] }, "erro": "falha simulada" },
         { "linhas": [] }                                   <- a regra sem "quando" e a padrao
       ]
     },
     "websocket": { "campoAcao": "action", "respostas": { "acao": { ...resposta... } } }
   }

   "{{CAMPO}}" dentro de uma linha vira o valor com que a tela filtrou - o
   "eco" que torna a simulacao crivel sem escrever uma linha por projeto.
   ========================================================================== */
function simularDados(sim, nome, restricoes) {
    var fontes = (sim && sim.fontes) || {};
    var regras = fontes[nome];
    if (regras && !Array.isArray(regras)) regras = [regras];

    var filtro = {};
    (restricoes || []).forEach(function (r) {
        if (!r) return;
        var tipo = Number(r.tipo !== undefined ? r.tipo : 1);
        if (tipo !== 1 && tipo !== 0) return;          /* so os obrigatorios decidem a regra */
        if (!Object.prototype.hasOwnProperty.call(filtro, r.campo)) filtro[r.campo] = String(r.valor == null ? '' : r.valor);
    });

    if (!regras) return { simulado: false, motivo: 'sem simulação para esta fonte', columns: [], values: [] };

    for (var i = 0; i < regras.length; i++) {
        var regra = regras[i] || {};
        if (!casa(regra.quando || {}, filtro)) continue;
        if (regra.erro) return { simulado: true, regra: i, erro: String(regra.erro), columns: [], values: [] };
        var linhas = (regra.linhas || []).map(function (l) { return ecoar(l, filtro); });
        var colunas = regra.colunas || (linhas.length ? Object.keys(linhas[0]) : []);
        return { simulado: true, regra: i, columns: colunas, values: linhas };
    }
    return { simulado: false, motivo: 'nenhuma regra casou com os filtros', columns: [], values: [] };
}

function casa(quando, filtro) {
    return Object.keys(quando).every(function (k) {
        var esperado = quando[k];
        if (esperado === '*') return Object.prototype.hasOwnProperty.call(filtro, k);
        if (Array.isArray(esperado)) return esperado.map(String).indexOf(filtro[k]) >= 0;
        return String(esperado) === filtro[k];
    });
}

function ecoar(linha, filtro) {
    var r = {};
    Object.keys(linha || {}).forEach(function (k) {
        var v = linha[k];
        r[k] = typeof v === 'string'
            ? v.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (m, c) { return filtro[c] !== undefined ? filtro[c] : ''; })
            : v;
    });
    return r;
}

/* ==========================================================================
   OS EVENTOS DE SERVIDOR DA TELA DE FLUXO (events/*.js)
   --------------------------------------------------------------------------
   Rodam numa sandbox com o que eles costumam usar: form, customHTML,
   getValue, log, DatasetFactory (simulado) e a API de usuario. O que eles
   usarem e o Test_in nao conhecer vira aviso no resultado - nunca quebra a
   tela: a plataforma tambem segue quando um evento falha.
   ========================================================================== */
function executarEvento(app, nome, sim, valores) {
    var efeitos = { valores: {}, bloqueados: {}, ocultosNome: {}, ocultosId: {}, html: [], log: [], avisos: [], erro: null };
    var fonte = ler(path.join(app.caminho, 'events', nome + '.js'));
    if (fonte === null) return efeitos;

    valores = valores || {};
    sim = sim || {};
    var usuario = sim.usuario || {};

    function valor(n) {
        if (Object.prototype.hasOwnProperty.call(efeitos.valores, n)) return efeitos.valores[n];
        return valores[n] !== undefined ? String(valores[n]) : '';
    }

    var form = protegido('form', {
        getValue: function (n) { return valor(String(n)); },
        setValue: function (n, v) { efeitos.valores[String(n)] = v == null ? '' : String(v); },
        setEnabled: function (n, ligado) { efeitos.bloqueados[String(n)] = !ligado; },
        setVisible: function (n, visivel) { efeitos.ocultosNome[String(n)] = !visivel; },
        setVisibleById: function (id, visivel) { efeitos.ocultosId[String(id)] = !visivel; },
        getFormMode: function () { return String(sim.modo || 'ADD'); },
        getMobile: function () { return false; },
        getChildrenIndexes: function () { return []; },
        setShowDisabledFields: function () {}, setHidePrintLink: function () {}, setHideDeleteButton: function () {},
        getDocumentId: function () { return Number(app.numero || 0); }, getVersion: function () { return 1000; },
        getCompanyId: function () { return 1; }
    }, efeitos);

    var ctx = {
        form: form,
        customHTML: { append: function (h) { efeitos.html.push(String(h)); } },
        getValue: function (n) {
            var mapa = {
                WKNumState: String(sim.atividade !== undefined ? sim.atividade : 0),
                WKNextState: String(sim.destino !== undefined ? sim.destino : ''),
                WKUser: String(usuario.login || 'usuario.teste'),
                WKCompany: '1', WKNumProces: '0', WKDef: String(sim.fluxo || ''), WKVersDef: '1',
                WKCompletTask: 'true', WKFormId: String(app.numero || '')
            };
            return mapa[n] !== undefined ? mapa[n] : null;
        },
        log: {
            info: function (m) { efeitos.log.push('INFO ' + m); }, warn: function (m) { efeitos.log.push('AVISO ' + m); },
            error: function (m) { efeitos.log.push('ERRO ' + m); }, debug: function (m) { efeitos.log.push('DEBUG ' + m); }
        },
        fluigAPI: cadeia('fluigAPI', {
            getUserService: function () {
                return { getCurrent: function () {
                    return {
                        getLogin: function () { return String(usuario.login || 'usuario.teste'); },
                        getEmail: function () { return String(usuario.email || 'usuario.teste@exemplo.com'); },
                        getFullName: function () { return String(usuario.nome || 'Usuário de Teste'); },
                        getCode: function () { return String(usuario.codigo || usuario.login || 'usuario.teste'); }
                    };
                } };
            }
        }, efeitos),
        ConstraintType: { MUST: 1, SHOULD: 2, MUST_NOT: 3 },
        DatasetFactory: {
            createConstraint: function (c, i, f, t) { return { campo: String(c), valor: i, final: f, tipo: t && t.valueOf ? Number(t) : t }; },
            getDataset: function (n, campos, restricoes) {
                var r = simularDados(sim, String(n), (restricoes || []).map(function (x) {
                    return { campo: x.campo, valor: x.valor, tipo: typeof x.tipo === 'number' ? x.tipo : 1 };
                }));
                if (!r.simulado) efeitos.avisos.push('evento ' + nome + ': fonte ' + n + ' sem simulação');
                if (r.erro) throw new Error(r.erro);
                return linhasComoDataset(r);
            }
        },
        java: cadeia('java', {}, efeitos),
        Packages: cadeia('Packages', {}, efeitos),
        String: String, Number: Number, Math: Math, Date: Date, JSON: JSON, Array: Array, Object: Object,
        parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, Error: Error
    };

    try {
        vm.createContext(ctx);
        vm.runInContext(fonte + '\n;typeof ' + nome + ' === "function" && ' + nome + '(form, customHTML);', ctx,
                        { filename: 'events/' + nome + '.js', timeout: 2000 });
    } catch (e) {
        /* O validateForm REPROVA lancando erro - e esse e o recado para a
           pessoa, nao uma falha do Test_in. */
        efeitos.erro = String(e && e.message !== undefined ? e.message : e);
    }
    return efeitos;
}

/* Um dataset de servidor: getRowsCount/getValue(linha, coluna), como o
   evento espera. */
function linhasComoDataset(r) {
    return {
        rowsCount: r.values.length, columnsCount: r.columns.length, columnsName: r.columns, values: r.values,
        getRowsCount: function () { return r.values.length; },
        getColumnsCount: function () { return r.columns.length; },
        getColumnName: function (i) { return r.columns[i]; },
        getValue: function (i, c) { return r.values[i] ? r.values[i][c] : null; }
    };
}

/* Metodo desconhecido do form vira aviso e nao faz nada - em vez de parar o
   evento inteiro por causa de um setHideDeleteButton que o Test_in nao tem. */
function protegido(nome, alvo, efeitos) {
    if (typeof Proxy === 'undefined') return alvo;
    return new Proxy(alvo, {
        get: function (o, k) {
            if (k in o) return o[k];
            if (typeof k !== 'string') return undefined;
            return function () { efeitos.avisos.push(nome + '.' + k + '() não é simulado pelo Test_in (ignorado)'); };
        }
    });
}

/* fluigAPI.getAlgumaCoisa().outra()... - uma cadeia que aceita qualquer
   chamada, registra o aviso e termina em texto vazio. */
function cadeia(nome, conhecidos, efeitos) {
    if (typeof Proxy === 'undefined') return conhecidos;
    function elo(caminho) {
        var f = function () { return elo(caminho + '()'); };
        return new Proxy(f, {
            get: function (o, k) {
                if (k === 'toString' || k === Symbol.toPrimitive || k === 'valueOf') return function () { return ''; };
                if (typeof k !== 'string') return undefined;
                efeitos.avisos.push(caminho + '.' + k + ' não é simulado pelo Test_in');
                return elo(caminho + '.' + k);
            },
            apply: function () { return elo(caminho + '()'); }
        });
    }
    return new Proxy(conhecidos, {
        get: function (o, k) { return (k in o) ? o[k] : (typeof k === 'string' ? elo(nome + '.' + k) : undefined); }
    });
}

/* ==========================================================================
   A TELA DE FLUXO SERVIDA
   ========================================================================== */
function renderizarTela(app, arquivo, sim, cfgNavegador) {
    var html = ler(path.join(app.caminho, arquivo));
    if (html === null) return null;

    var efeitos = { valores: {}, bloqueados: {}, ocultosNome: {}, ocultosId: {}, html: [], log: [], avisos: [] };
    ['displayFields', 'enableFields'].forEach(function (ev) {
        if ((app.eventos || []).indexOf(ev) < 0) return;
        var e = executarEvento(app, ev, sim, efeitos.valores);
        Object.keys(e.valores).forEach(function (k) { efeitos.valores[k] = e.valores[k]; });
        Object.keys(e.bloqueados).forEach(function (k) { efeitos.bloqueados[k] = e.bloqueados[k]; });
        Object.keys(e.ocultosNome).forEach(function (k) { efeitos.ocultosNome[k] = e.ocultosNome[k]; });
        Object.keys(e.ocultosId).forEach(function (k) { efeitos.ocultosId[k] = e.ocultosId[k]; });
        efeitos.html = efeitos.html.concat(e.html);
        efeitos.log = efeitos.log.concat(e.log.map(function (l) { return ev + ': ' + l; }));
        efeitos.avisos = efeitos.avisos.concat(e.avisos);
        if (e.erro) efeitos.avisos.push('o evento ' + ev + ' falhou: ' + e.erro);
    });

    html = aplicarEfeitos(html, efeitos);
    cfgNavegador.servidor = { log: efeitos.log.slice(0, 50), avisos: efeitos.avisos.slice(0, 50) };
    return injetarAmbiente(html, cfgNavegador);
}

/* O efeito dos eventos entra NO HTML, antes de qualquer script da tela
   rodar - o mesmo que a plataforma faz ao renderizar. */
function aplicarEfeitos(html, ef) {
    Object.keys(ef.valores).forEach(function (nome) {
        var v = ef.valores[nome];
        html = editarTags(html, 'name', nome, function (tag, tipo) {
            if (tipo === 'input') return definirAtributo(tag, 'value', v);
            return tag;
        });
        html = html.replace(new RegExp('(<textarea\\b[^>]*\\bname\\s*=\\s*["\']?' + escaparRe(nome) +
                                       '["\']?[^>]*>)[\\s\\S]*?(</textarea>)', 'i'),
                            function (m, a, b) { return a + escaparHtml(v) + b; });
    });
    Object.keys(ef.bloqueados).forEach(function (nome) {
        if (!ef.bloqueados[nome]) return;
        html = editarTags(html, 'name', nome, function (tag, tipo) {
            if (tipo === 'select' || /type\s*=\s*["']?(checkbox|radio)/i.test(tag)) return definirAtributo(tag, 'disabled', 'disabled');
            if (tipo === 'input' || tipo === 'textarea') return definirAtributo(tag, 'readonly', 'readonly');
            return tag;
        });
    });
    Object.keys(ef.ocultosNome).forEach(function (nome) {
        if (ef.ocultosNome[nome]) html = editarTags(html, 'name', nome, function (tag) { return ocultar(tag); });
    });
    Object.keys(ef.ocultosId).forEach(function (id) {
        if (ef.ocultosId[id]) html = editarTags(html, 'id', id, function (tag) { return ocultar(tag); });
    });
    if (ef.html.length) {
        var extra = ef.html.join('\n');
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, extra + '\n</body>') : html + extra;
    }
    return html;
}

function editarTags(html, atributo, valor, fn) {
    var reAttr = new RegExp('(?:^|\\s)' + atributo + '\\s*=\\s*(["\']?)' + escaparRe(valor) + '\\1(?=[\\s/>]|$)', 'i');
    return html.replace(/<([a-zA-Z][\w-]*)\b([^>]*)>/g, function (tag, nomeTag, attrs) {
        return reAttr.test(attrs) ? fn(tag, nomeTag.toLowerCase()) : tag;
    });
}

function definirAtributo(tag, attr, valor) {
    var re = new RegExp('(\\s' + attr + '\\s*=\\s*)(["\'])[^"\']*\\2', 'i');
    var novo = ' ' + attr + '="' + escaparHtml(valor) + '"';
    if (re.test(tag)) return tag.replace(re, novo);
    if (new RegExp('\\s' + attr + '(?=[\\s/>])', 'i').test(tag)) return tag;
    return tag.replace(/\s*(\/?)>$/, novo + '$1>');
}

function ocultar(tag) {
    if (/\sstyle\s*=\s*["']/i.test(tag)) return tag.replace(/(\sstyle\s*=\s*["'])/i, '$1display:none;');
    return tag.replace(/\s*(\/?)>$/, ' style="display:none"$1>');
}

/* A configuracao para o navegador vai inline, ANTES de tudo: o ambiente
   precisa existir antes do primeiro script da tela. */
function injetarAmbiente(html, cfg, script) {
    var bloco = '<script>window.__testin = ' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script>\n' +
                '<script src="' + (script || '/__testin/plataforma/ambiente.js') + '"></script>\n';
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, function (m) { return m + '\n' + bloco; });
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, function (m) { return m + '\n<head>' + bloco + '</head>'; });
    return bloco + html;
}

/* A aplicacao web: a mesma ideia, com o ambiente dela (web.js) - rede,
   armazenamento e arquivos que nao carregam. Nada da plataforma entra. */
function injetarAmbienteWeb(html, cfg) { return injetarAmbiente(html, cfg, '/__testin/plataforma/web.js'); }

/* A CASCA: o que a plataforma poe em volta da tela de fluxo - o cabecalho e
   o botao Enviar. A tela abre num quadro dentro dela, como la. */
function renderizarCasca(app, fluxo, cfg) {
    var titulo = escaparHtml(app.titulo || app.nome);
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + titulo + '</title>' +
        '<link rel="stylesheet" href="/__testin/plataforma/casca.css"></head><body class="casca">' +
        '<header class="casca__topo"><div><div class="casca__rotulo">Novo registro</div>' +
        '<h1 class="casca__titulo">' + titulo + '</h1></div>' +
        '<div class="casca__acoes"><button type="button" class="casca__enviar" data-casca-enviar disabled>Enviar</button></div></header>' +
        '<div class="casca__aviso" data-casca-aviso hidden></div>' +
        '<iframe class="casca__tela" name="casca-tela" data-casca-tela src="/__app/' + app.id + '/' +
        encodeURI(app.principal) + '"></iframe></body></html>';
    return injetarAmbiente(html, cfg);
}

/* ==========================================================================
   O MODULO DE PAGINA SERVIDO
   ========================================================================== */
function renderizarModulo(app, cfg, estilosBase) {
    var raiz = app.caminho;
    var recursos = path.join(raiz, 'src', 'main', 'resources');
    var modelo = ler(path.join(recursos, app.modelo || 'view.ftl'));
    if (modelo === null) return null;

    var textos = {};
    if (app.idiomas) {
        [app.idiomas + '.properties', app.idiomas + '_pt_BR.properties'].forEach(function (n) {
            var t = ler(path.join(recursos, n));
            if (t !== null) {
                var p = descobrir.lerPropriedades(t);
                Object.keys(p).forEach(function (k) { textos[k] = p[k]; });
            }
        });
    }
    var instancia = String(cfg.instancia || 1001);
    var corpo = renderizarModelo(modelo, { instanceId: instancia }, textos);

    var css = app.recursos.css.map(function (c) {
        return '<link rel="stylesheet" href="/__app/' + app.id + c.replace(/^\/?/, '/') + '">';
    }).join('\n');
    var js = app.recursos.js.map(function (j) {
        return '<script src="/__app/' + app.id + j.replace(/^\/?/, '/') + '"></script>';
    }).join('\n');

    cfg.modulo = { codigo: app.nome, instancia: instancia };
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + escaparHtml(app.titulo) + '</title>\n' +
        '<link rel="stylesheet" href="/portal/resources/style-guide/css/fluig-style-guide.min.css">\n' +
        '<script src="/portal/resources/js/jquery/jquery.js"></script>\n' + css + '\n</head>\n<body class="testin-modulo">\n' +
        '<div class="wcm-widget-class super-widget fluig-style-guide" id="wcm_widget_' + instancia +
        '" data-testin-modulo="' + escaparHtml(app.nome) + '">\n' + corpo + '\n</div>\n' + js + '\n' +
        '<script>window.TestinPlataforma && TestinPlataforma.iniciarModulo();</script>\n</body></html>';
    return injetarAmbiente(html, cfg);
}

/* ==========================================================================
   O MINI-INTERPRETADOR DE MODELO (o que os view.ftl costumam usar)
   --------------------------------------------------------------------------
     <#-- comentario -->                      some
     ${instanceId}  ${x!'padrao'}  ${x!}     valor, ou o padrao, ou vazio
     ${i18n.getTranslation('chave')}          o texto do .properties
     <#if x> / <#elseif y> / <#else> / </#if> condicao simples (ver avaliar)
     <#list itens as i> ... </#list>          repete para cada item
     <#assign>, <#include>, <#import>, <#setting>  ignorados
   Nada aqui usa eval: a expressao e interpretada pelos formatos acima, e o
   que nao casa vira vazio (e nao codigo executado).
   ========================================================================== */
function renderizarModelo(texto, vars, textos) {
    var t = String(texto).replace(/<#--[\s\S]*?-->/g, '')
        .replace(/<#(assign|include|import|setting|ftl)\b[^>]*\/?>/g, '');
    var tokens = t.split(/(<#(?:if|elseif|list)\b[^>]*>|<#else\s*\/?>|<\/#(?:if|list)>)/);
    return renderizarTokens(tokens, 0, tokens.length, vars, textos || {});
}

/* O fechamento que corresponde a uma abertura, contando os aninhados. */
function fimDo(tokens, i, abre, fecha) {
    var nivel = 0;
    for (var j = i; j < tokens.length; j++) {
        if (tokens[j].indexOf(abre) === 0 && tokens[j].indexOf(abre + 'if') !== 0) nivel++;
        else if (tokens[j].indexOf(fecha) === 0) { nivel--; if (nivel === 0) return j; }
    }
    return tokens.length;
}

function renderizarTokens(tokens, ini, fim, vars, textos) {
    var saida = '';
    for (var i = ini; i < fim; i++) {
        var tk = tokens[i], m;
        if ((m = /^<#if\s+([\s\S]*?)\s*>$/.exec(tk))) {
            var fecha = fimDo(tokens, i, '<#if', '</#if');
            var ramos = [], cond = m[1], inicio = i + 1, nivel = 0;
            for (var j = i + 1; j < fecha; j++) {
                var tj = tokens[j];
                if (/^<#if\b/.test(tj)) nivel++;
                else if (/^<\/#if>/.test(tj)) nivel--;
                else if (nivel === 0 && /^<#else/.test(tj)) {
                    ramos.push({ cond: cond, ini: inicio, fim: j });
                    var me = /^<#elseif\s+([\s\S]*?)\s*>$/.exec(tj);
                    cond = me ? me[1] : null;
                    inicio = j + 1;
                }
            }
            ramos.push({ cond: cond, ini: inicio, fim: fecha });
            for (var r = 0; r < ramos.length; r++) {
                if (ramos[r].cond === null || avaliar(ramos[r].cond, vars)) {
                    saida += renderizarTokens(tokens, ramos[r].ini, ramos[r].fim, vars, textos);
                    break;
                }
            }
            i = fecha;
        } else if ((m = /^<#list\s+([\w.]+)\s+as\s+(\w+)\s*>$/.exec(tk))) {
            var fechaL = fimDo(tokens, i, '<#list', '</#list');
            var itens = valorDe(m[1], vars);
            if (Array.isArray(itens)) {
                itens.forEach(function (it) {
                    var v2 = Object.create(vars);
                    v2[m[2]] = it;
                    saida += renderizarTokens(tokens, i + 1, fechaL, v2, textos);
                });
            }
            i = fechaL;
        } else if (/^<\/?#/.test(tk)) {
            /* fechamento ou else solto: nada a escrever */
        } else {
            saida += interpolar(tk, vars, textos);
        }
    }
    return saida;
}

function interpolar(texto, vars, textos) {
    return texto.replace(/\$\{\s*([^}]*?)\s*\}/g, function (m, expr) {
        var t = /^i18n\.getTranslation\(\s*['"]([^'"]+)['"]\s*\)$/.exec(expr);
        if (t) return escaparHtml(textos[t[1]] !== undefined ? textos[t[1]] : t[1]);
        var d = /^([\w.]+)\s*!\s*(?:['"]([^'"]*)['"])?$/.exec(expr);
        if (d) { var v = valorDe(d[1], vars); return escaparHtml(v !== undefined && v !== null ? v : (d[2] || '')); }
        var s = /^([\w.]+)$/.exec(expr);
        if (s) { var v2 = valorDe(s[1], vars); return v2 === undefined || v2 === null ? '' : escaparHtml(v2); }
        return '';
    });
}

function valorDe(caminho, vars) {
    var partes = caminho.split('.'), atual = vars;
    for (var i = 0; i < partes.length; i++) {
        if (atual === undefined || atual === null) return undefined;
        atual = atual[partes[i]];
    }
    return atual;
}

/* x??  !x  x == "y"  x != "y"  x  - o resto e falso. */
function avaliar(cond, vars) {
    var c = String(cond).trim(), m;
    if ((m = /^!\s*(.+)$/.exec(c))) return !avaliar(m[1], vars);
    if ((m = /^([\w.]+)\s*\?\?$/.exec(c))) { var v = valorDe(m[1], vars); return v !== undefined && v !== null; }
    if ((m = /^([\w.]+)\s*(==|!=)\s*["']([^"']*)["']$/.exec(c))) {
        var igual = String(valorDe(m[1], vars)) === m[3];
        return m[2] === '==' ? igual : !igual;
    }
    if ((m = /^([\w.]+)$/.exec(c))) return !!valorDe(m[1], vars) && valorDe(m[1], vars) !== 'false';
    if (c === 'true') return true;
    return false;
}

/* ========================================================================== */
function escaparHtml(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escaparRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = {
    simularDados: simularDados,
    executarEvento: executarEvento,
    renderizarTela: renderizarTela,
    renderizarCasca: renderizarCasca,
    injetarAmbienteWeb: injetarAmbienteWeb,
    renderizarModulo: renderizarModulo,
    renderizarModelo: renderizarModelo,
    aplicarEfeitos: aplicarEfeitos,
    injetarAmbiente: injetarAmbiente
};
