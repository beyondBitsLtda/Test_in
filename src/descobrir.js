/* ============================================================================
   descobrir.js - o que existe dentro das pastas de repositorios
   ============================================================================
   O Test_in nao pede para a pessoa dizer "isto e uma tela de fluxo". Ela
   OLHA a estrutura da pasta e reconhece a arquitetura - e e a arquitetura que
   decide como a tela vai ser servida e testada:

     fluxo    tela de fluxo: forms/<numero> - <nome>/ com o .html da tela,
              os .js e .css dela, e (as vezes) events/ com os eventos que
              rodam no servidor. Abre dentro de uma "casca" com o botao Enviar.

     modulo   modulo de pagina: <...>/src/main/resources/application.info +
              view.ftl, e o front em src/main/webapp/resources. O modelo
              (view.ftl) e renderizado e os recursos carregados na ordem que o
              application.info declara.

     web      aplicacao web comum: uma pasta com index.html. Servida como
              esta, sem nada a mais.

   Tambem acha os SCRIPTS DE TESTE do repositorio (*.testes.json) e liga cada
   um a aplicacao que ele declara como alvo.

   So leitura: nada aqui escreve no disco.
============================================================================ */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var IGNORAR = { '.git': 1, 'node_modules': 1, 'target': 1, '.vscode': 1, '.idea': 1, '.settings': 1, 'bin': 1 };

function listar(pasta) {
    try { return fs.readdirSync(pasta, { withFileTypes: true }); } catch (e) { return []; }
}
function existe(p) { try { return fs.existsSync(p); } catch (e) { return false; } }
function ler(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

function idDe(caminho) {
    return crypto.createHash('sha1').update(path.resolve(caminho).toLowerCase()).digest('hex').substring(0, 12);
}

/* ==========================================================================
   OS REPOSITORIOS
   Uma pasta cadastrada pode ser o proprio repositorio ou a pasta que junta
   varios. Repositorio e o que tem .git - ou, sem .git, o que tem alguma
   aplicacao reconhecivel dentro.
   ========================================================================== */
function repositorios(pastas) {
    var achados = [], vistos = {};
    (pastas || []).forEach(function (raiz) {
        if (!existe(raiz)) return;
        var candidatos = [raiz];
        /* Pasta que JA E um repositorio nao tem as subpastas tratadas como
           repositorios - "wcm" e "estacao" sao partes dele, nao vizinhos. */
        if (!existe(path.join(raiz, '.git'))) {
            listar(raiz).forEach(function (d) {
                if (d.isDirectory() && !IGNORAR[d.name] && d.name.charAt(0) !== '.') candidatos.push(path.join(raiz, d.name));
            });
        }
        /* A pasta que so AGRUPA repositorios (sem .git, com repositorios ou
           aplicacoes nas subpastas) nao e repositorio ela mesma - senao cada
           aplicacao apareceria duas vezes, uma em cada. */
        var agrupa = candidatos.length > 1 && candidatos.slice(1).some(function (c) {
            return existe(path.join(c, '.git')) || aplicacoes(c).length > 0;
        });
        if (agrupa) candidatos = candidatos.slice(1);

        candidatos.forEach(function (c) {
            var k = path.resolve(c).toLowerCase();
            if (vistos[k]) return;
            var apps = aplicacoes(c);
            var ehRepo = existe(path.join(c, '.git'));
            /* A pasta que so agrupa repositorios nao entra como repositorio
               ela mesma - a nao ser que tenha aplicacao na raiz dela. */
            if (!apps.length && !(ehRepo && c !== raiz)) return;
            if (c === raiz && !ehRepo && !apps.some(function (a) { return a.rel.split('/').length <= 3; })) return;
            vistos[k] = true;
            /* raiz: a pasta CADASTRADA de onde o repositorio veio - a
               interface agrupa por ela quando ha mais de uma. */
            achados.push({
                id: idDe(c), nome: path.basename(c), caminho: path.resolve(c),
                raiz: path.resolve(raiz), relRaiz: path.relative(raiz, c).split(path.sep).join('/') || '.',
                versionado: ehRepo, aplicacoes: apps, scripts: scriptsDeTeste(c, apps)
            });
        });
    });
    ligarScripts(achados);
    return achados.sort(function (a, b) { return a.nome.toLowerCase() < b.nome.toLowerCase() ? -1 : 1; });
}

/* Um script pode morar num repositorio e testar a aplicacao de OUTRO (os
   testes guardados junto da ferramenta, a tela no repositorio dela). A
   ligacao pelo alvo vale entre todos os repositorios encontrados. */
function ligarScripts(repos) {
    var apps = [];
    repos.forEach(function (r) { r.aplicacoes.forEach(function (a) { apps.push(a); }); });
    repos.forEach(function (r) {
        r.scripts.forEach(function (s) {
            s.repositorio = r.id;
            s.caminho = path.join(r.caminho, s.rel);
            if (!s.aplicacao) s.aplicacao = aplicacaoDoAlvo(s.alvo, apps);
        });
    });
    apps.forEach(function (a) {
        a.scripts = [];
        repos.forEach(function (r) {
            r.scripts.forEach(function (s) { if (s.aplicacao === a.id) a.scripts.push({ repositorio: r.id, rel: s.rel, nome: s.nome, casos: s.casos }); });
        });
    });
}

/* ==========================================================================
   AS APLICACOES DE UM REPOSITORIO
   ========================================================================== */
function aplicacoes(repo) {
    var apps = [];
    telasDeFluxo(repo).forEach(function (a) { apps.push(a); });
    modulosDePagina(repo).forEach(function (a) { apps.push(a); });
    aplicacoesWeb(repo, apps).forEach(function (a) { apps.push(a); });
    return apps;
}

/* forms/<numero> - <nome>/  ou  forms/<nome>/ */
function telasDeFluxo(repo) {
    var achados = [];
    var base = path.join(repo, 'forms');
    listar(base).forEach(function (d) {
        if (!d.isDirectory()) return;
        var pasta = path.join(base, d.name);
        var arquivos = listar(pasta).filter(function (a) { return a.isFile(); }).map(function (a) { return a.name; });
        var htmls = arquivos.filter(function (n) { return /\.html?$/i.test(n); });
        if (!htmls.length) return;

        var m = /^(\d+)\s*-\s*(.+)$/.exec(d.name);
        var numero = m ? m[1] : '';
        /* O .html principal e o que tem o nome de um .js irmao ou o maior -
           a pasta as vezes guarda um .html de rascunho junto. */
        var principal = htmls.slice().sort(function (a, b) {
            var ta = (ler(path.join(pasta, a)) || '').length, tb = (ler(path.join(pasta, b)) || '').length;
            return tb - ta;
        })[0];
        var eventos = listar(path.join(pasta, 'events')).filter(function (a) {
            return a.isFile() && /\.js$/i.test(a.name);
        }).map(function (a) { return a.name.replace(/\.js$/i, ''); });

        achados.push({
            id: idDe(pasta), tipo: 'fluxo',
            nome: principal.replace(/\.html?$/i, ''),
            titulo: m ? m[2].trim() : d.name,
            numero: numero,
            caminho: path.resolve(pasta), rel: path.relative(repo, pasta).split(path.sep).join('/'),
            principal: principal, eventos: eventos,
            fluxos: fluxosQueUsam(repo)
        });
    });
    return achados;
}

/* Os codigos de fluxo definidos no repositorio (workflow/**\/*.ecm30.xml).
   Servem so para SUGERIR o codigo no passo "abrir": o Test_in abre a tela
   escolhida de qualquer jeito.

   Nao filtra pelo numero da tela de proposito: o numero muda de um ambiente
   para outro (o exemplo tem 378524 no fluxo e 399466 na pasta), e filtrar
   esconderia justamente o fluxo certo. */
function fluxosQueUsam(repo) {
    var achados = [];
    varrer(path.join(repo, 'workflow'), 0, 4, function (arq) {
        if (!/\.ecm30\.xml$/i.test(arq)) return;
        var id = /<processId>\s*([A-Za-z0-9_.\-]+)\s*<\/processId>/.exec(ler(arq) || '');
        if (id && achados.indexOf(id[1]) < 0) achados.push(id[1]);
    });
    return achados;
}

/* <...>/src/main/resources/application.info */
function modulosDePagina(repo) {
    var achados = [];
    varrer(repo, 0, 7, function (arq) {
        if (path.basename(arq) !== 'application.info') return;
        var resources = path.dirname(arq);
        if (path.basename(resources) !== 'resources' || path.basename(path.dirname(resources)) !== 'main') return;
        var raiz = path.dirname(path.dirname(path.dirname(resources)));
        var info = lerPropriedades(ler(arq) || '');
        if (String(info['application.type'] || 'widget').toLowerCase() === 'layout') return;
        achados.push({
            id: idDe(raiz), tipo: 'modulo',
            nome: info['application.code'] || path.basename(raiz),
            titulo: info['application.title'] || path.basename(raiz),
            versao: info['application.version'] || '',
            caminho: path.resolve(raiz), rel: path.relative(repo, raiz).split(path.sep).join('/'),
            contexto: contextoDo(raiz) || info['application.code'] || path.basename(raiz),
            modelo: info['view.file'] || 'view.ftl',
            idiomas: info['locale.file.base.name'] || '',
            recursos: recursosDe(info)
        });
    }, function (nome) { return nome === 'forms'; });
    return achados;
}

function contextoDo(raiz) {
    var xml = ler(path.join(raiz, 'src', 'main', 'webapp', 'WEB-INF', 'jboss-web.xml'));
    var m = xml && /<context-root>\s*([^<]+?)\s*<\/context-root>/i.exec(xml);
    return m ? m[1].replace(/^\/+|\/+$/g, '') : '';
}

/* application.resource.js.N / .css.N, na ORDEM NUMERICA - e dependencia
   declarada, nao arrumacao. */
function recursosDe(info) {
    function lista(tipo) {
        return Object.keys(info).map(function (k) {
            var m = new RegExp('^application\\.resource\\.' + tipo + '\\.(\\d+)$').exec(k);
            return m ? { n: Number(m[1]), arquivo: String(info[k]).trim() } : null;
        }).filter(Boolean).sort(function (a, b) { return a.n - b.n; }).map(function (x) { return x.arquivo; });
    }
    return { js: lista('js'), css: lista('css') };
}

/* Pastas com index.html que nao sao parte das outras arquiteturas. */
function aplicacoesWeb(repo, jaAchadas) {
    var achados = [];
    var dentroDeOutra = jaAchadas.map(function (a) { return a.caminho.toLowerCase(); });
    varrer(repo, 0, 3, function (arq) {
        if (path.basename(arq).toLowerCase() !== 'index.html') return;
        var pasta = path.dirname(arq);
        var k = path.resolve(pasta).toLowerCase();
        if (dentroDeOutra.some(function (d) { return k === d || k.indexOf(d + path.sep) === 0; })) return;
        var html = ler(arq);
        var app = {
            id: idDe(pasta), tipo: 'web',
            nome: pasta === repo ? path.basename(repo) : path.basename(pasta),
            titulo: tituloDoHtml(html) || path.basename(pasta),
            caminho: path.resolve(pasta), rel: path.relative(repo, pasta).split(path.sep).join('/') || '.',
            principal: 'index.html'
        };
        avisarDoBuild(app, pasta, html);
        achados.push(app);
    }, function (nome) { return nome === 'forms' || nome === 'wcm'; });
    return achados;
}

/* PROJETO COM BUILD (Vite, e parecidos). O index.html da FONTE aponta para
   /src/main.jsx: so o servidor do Vite sabe transformar isso, servido como
   arquivo a tela fica em branco. Ele aparece na lista, mas desligado, com o
   caminho: gerar o build e testar a pasta dele. O build (dist/, build/)
   mais velho que o codigo em src/ ganha um aviso - testar o build velho e
   testar outra versao da aplicacao. */
var FONTE_DE_BUILD = /<script\b[^>]*\bsrc=["']\/?src\/[^"']+\.(jsx|tsx|ts|vue|svelte)["']/i;

function avisarDoBuild(app, pasta, html) {
    if (FONTE_DE_BUILD.test(html || '')) {
        var vite = usaVite(pasta);
        app.testavel = false;
        app.aviso = (vite ? 'Projeto Vite: e' : 'E') + 'ste index.html é o de desenvolvimento e só roda com o servidor ' +
            (vite ? 'do Vite' : 'do projeto') + '. Gere o build (npm run build) e teste a pasta dele (dist).';
        return;
    }
    if (!/^(dist|build)$/i.test(path.basename(pasta))) return;
    var projeto = path.dirname(pasta);
    if (!existe(path.join(projeto, 'package.json')) || !existe(path.join(projeto, 'src'))) return;
    var doBuild = 0;
    try { doBuild = fs.statSync(path.join(pasta, 'index.html')).mtimeMs; } catch (e) { return; }
    var doCodigo = maisNovo(path.join(projeto, 'src'));
    if (doCodigo > doBuild + 1000) {
        app.aviso = 'O build é mais velho que o código em src/ (' + new Date(doCodigo).toLocaleDateString('pt-BR') +
            '): rode npm run build antes de testar.';
    }
}

function usaVite(pasta) {
    if (['vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.ts', 'vite.config.mts'].some(function (n) {
        return existe(path.join(pasta, n));
    })) return true;
    return /"vite"\s*:/.test(ler(path.join(pasta, 'package.json')) || '');
}

/* O arquivo mais novo da pasta, com limite: src/ enorme nao trava a lista. */
function maisNovo(pasta) {
    var max = 0, vistos = 0;
    (function andar(p, fundo) {
        if (fundo > 8 || vistos > 5000) return;
        listar(p).forEach(function (d) {
            if (vistos++ > 5000 || IGNORAR[d.name]) return;
            var c = path.join(p, d.name);
            if (d.isDirectory()) return andar(c, fundo + 1);
            try { max = Math.max(max, fs.statSync(c).mtimeMs); } catch (e) { /* sumiu */ }
        });
    }(pasta, 0));
    return max;
}

function tituloDoHtml(html) {
    var m = html && /<title>\s*([^<]{1,120}?)\s*<\/title>/i.exec(html);
    return m ? m[1] : '';
}

/* ==========================================================================
   OS SCRIPTS DE TESTE (*.testes.json)
   ========================================================================== */
function scriptsDeTeste(repo, apps) {
    var achados = [];
    varrer(repo, 0, 5, function (arq) {
        if (!/\.testes\.json$/i.test(arq)) return;
        var txt = ler(arq);
        var alvo = '', casos = 0, nome = path.basename(arq);
        try {
            var j = JSON.parse(txt || '{}');
            alvo = String(j.alvo || '');
            casos = Array.isArray(j.casos) ? j.casos.length : 0;
        } catch (e) { return; }
        achados.push({
            rel: path.relative(repo, arq).split(path.sep).join('/'),
            nome: nome, casos: casos, alvo: alvo,
            aplicacao: aplicacaoDoAlvo(alvo, apps)
        });
    });
    return achados;
}

/* O alvo do arquivo ("FORM:399466", "WIDGET:codigo") liga o script a uma
   aplicacao do repositorio. Sem casar, ele continua disponivel para
   qualquer uma. */
function aplicacaoDoAlvo(alvo, apps) {
    var m = /^(\w+):(.+)$/.exec(String(alvo || ''));
    if (!m) return '';
    var achada = apps.filter(function (a) {
        if (m[1] === 'FORM') return a.tipo === 'fluxo' && (a.numero === m[2] || a.nome === m[2]);
        if (m[1] === 'WIDGET') return a.tipo === 'modulo' && a.nome === m[2];
        return a.nome === m[2];
    })[0];
    return achada ? achada.id : '';
}

/* ========================================================================== */
function varrer(pasta, fundo, max, aoAchar, pular) {
    if (fundo > max) return;
    listar(pasta).forEach(function (d) {
        var p = path.join(pasta, d.name);
        if (d.isDirectory()) {
            /* Pastas ocultas ficam de fora - menos a .resources, onde a
               ferramenta de desenho de fluxos guarda as definicoes. */
            if (IGNORAR[d.name] || (d.name.charAt(0) === '.' && d.name !== '.resources')) return;
            if (pular && pular(d.name)) return;
            varrer(p, fundo + 1, max, aoAchar, pular);
        } else if (d.isFile()) {
            aoAchar(p);
        }
    });
}

function lerPropriedades(texto) {
    var props = {};
    String(texto).split(/\r?\n/).forEach(function (linha) {
        var l = linha.replace(/^\s+/, '');
        if (!l || l.charAt(0) === '#' || l.charAt(0) === '!') return;
        var i = l.indexOf('=');
        if (i <= 0) return;
        props[l.substring(0, i).replace(/\s+$/, '')] = decodificarUnicode(l.substring(i + 1).replace(/^\s+|\s+$/g, ''));
    });
    return props;
}

function decodificarUnicode(s) {
    return String(s).replace(/\\u([0-9a-fA-F]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
}

module.exports = {
    repositorios: repositorios, aplicacoes: aplicacoes, lerPropriedades: lerPropriedades, idDe: idDe
};
