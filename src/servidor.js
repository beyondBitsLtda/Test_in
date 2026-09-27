/* ============================================================================
   servidor.js - o Test_in no ar, so para este computador
   ============================================================================
   TRES TRAVAS, as mesmas de toda aplicacao local desta estacao:

   1. ESCUTA SO EM 127.0.0.1. Ninguem na rede alcanca.
   2. TOKEN. Toda a API e as telas testadas exigem o segredo desta
      instalacao (cabecalho, cookie HttpOnly ou ?t= na primeira abertura).
      Sem ele, um site qualquer aberto no navegador poderia pedir para ler
      os repositorios pelo 127.0.0.1.
   3. Host E Origin conferidos: fecha a porta do DNS rebinding.

   UMA RESSALVA, dita com todas as letras: a tela testada roda no MESMO
   endereco da interface (e isso que deixa o motor ler e mexer nela). Um
   codigo testado mal-intencionado poderia, entao, usar a interface. Teste
   aqui o codigo dos seus repositorios - que e para o que o Test_in existe.

   AS ROTAS
     /                         a interface
     /api/...                  a interface conversando com o servidor
     /__testin/tela/<app>     a aplicacao testada (casca, modulo ou pagina)
     /__app/<app>/<arquivo>    os arquivos da aplicacao (com a emulacao)
     /__testin/dados          as consultas de dados da tela -> simulacoes
     /__testin/evento         o evento de validacao do Enviar
     /portal/..., /webdesk/... os enderecos da plataforma que as telas pedem,
                               respondidos pela emulacao
============================================================================ */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var config = require('./config');
var descobrir = require('./descobrir');
var emulacao = require('./emulacao');

var WEB = path.join(__dirname, '..', 'web');

/* O CODIGO DO SERVIDOR MUDOU DEPOIS QUE O TEST_IN ABRIU?
   A interface (web/) e lida do disco a cada pedido e pega mudancas sozinha;
   o servidor (src/, app.js) so muda reabrindo. Quem atualizava o Test_in com
   ela aberta continuava rodando o codigo velho sem saber - visto em 26/09,
   com a simulacao de erro pelo REST. A interface pergunta e avisa. */
var INICIO = Date.now();
function codigoMudou() {
    var arqs = [path.join(__dirname, '..', 'app.js')];
    try { fs.readdirSync(__dirname).forEach(function (f) { if (/.js$/.test(f)) arqs.push(path.join(__dirname, f)); }); } catch (e) { /* segue */ }
    return arqs.some(function (a) { try { return fs.statSync(a).mtimeMs > INICIO; } catch (e) { return false; } });
}
var CORPO_MAX = 2 * 1024 * 1024;

var TIPOS = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
    '.properties': 'text/plain; charset=utf-8', '.ftl': 'text/plain; charset=utf-8', '.map': 'application/json'
};

/* Bibliotecas que as telas pedem pelo endereco da plataforma. Com rede, vem
   da CDN; a pasta vendor/ (opcional) tem prioridade - e o que permite rodar
   sem internet. */
var BIBLIOTECAS = {
    '/portal/resources/js/jquery/jquery.js': ['jquery-3.7.1.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'],
    '/portal/resources/js/jquery/jquery.min.js': ['jquery-3.7.1.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'],
    '/portal/resources/js/jquery/jquery-ui.min.js': ['jquery-ui-1.13.2.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.13.2/jquery-ui.min.js'],
    /* A 2.x e a versao classica (script comum). A 4.x da CDN vem como modulo
       ES (export ...) e quebra carregada por <script> - visto no Test_in. */
    '/portal/resources/js/mustache/mustache-min.js': ['mustache-2.3.2.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/mustache.js/2.3.2/mustache.min.js']
};

var PNG_VAZIO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function criar(token) {
    var estado = { repos: [], apps: {}, contextos: {}, simulacoes: {}, pedidos: [], cfgEstilos: '' };

    function redescobrir() {
        var cfg = config.ler();
        estado.cfgEstilos = cfg.estilosBase;
        estado.repos = descobrir.repositorios(cfg.pastas);
        estado.apps = {};
        estado.contextos = {};
        estado.repos.forEach(function (r) {
            r.aplicacoes.forEach(function (a) {
                estado.apps[a.id] = a;
                if (a.tipo === 'modulo' && a.contexto) estado.contextos[a.contexto] = a;
            });
        });
        return estado.repos;
    }

    /* ---------------------------------------------------------------- respostas */
    function json(res, status, corpo) {
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        res.end(JSON.stringify(corpo));
    }
    function ok(res, dados) { json(res, 200, { ok: true, dados: dados === undefined ? null : dados }); }
    function falha(res, status, msg) { json(res, status, { ok: false, mensagem: msg }); }

    function enviarTexto(res, status, tipo, texto, extra) {
        var h = { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
        Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
        res.writeHead(status, h);
        res.end(texto);
    }

    /* A interface nao carrega script de fora e nao pode ser embutida em
       outro site. As telas testadas NAO levam esta politica: elas pedem
       bibliotecas de CDN, como fariam na plataforma. */
    var CSP_INTERFACE = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                        "font-src https://fonts.gstatic.com; frame-src 'self'; frame-ancestors 'none'";

    function servirArquivo(res, arquivo, extra) {
        fs.readFile(arquivo, function (e, dados) {
            if (e) return enviarTexto(res, 404, 'text/plain; charset=utf-8', 'não encontrado');
            enviarTexto(res, 200, TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream', dados, extra);
        });
    }

    /* ---------------------------------------------------------------- travas */
    function origemConfiavel(req) {
        var host = String(req.headers.host || '');
        if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return false;
        var origem = req.headers.origin;
        if (origem && origem !== 'null' && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origem)) return false;
        return true;
    }

    function tokenDoPedido(req, url) {
        if (req.headers['x-testin-token']) return String(req.headers['x-testin-token']);
        var m = /(?:^|;\s*)testin=([^;]+)/.exec(String(req.headers.cookie || ''));
        if (m) return decodeURIComponent(m[1]);
        return url.searchParams.get('t') || '';
    }

    function autorizado(req, url) {
        var t = tokenDoPedido(req, url);
        if (t.length !== token.length) return false;
        return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));
    }

    function plantarCookie(url, res) {
        var t = url.searchParams.get('t');
        if (!t || t.length !== token.length) return;
        try { if (!crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token))) return; } catch (e) { return; }
        res.setHeader('Set-Cookie', 'testin=' + encodeURIComponent(token) +
                      '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + (60 * 60 * 24 * 365));
    }

    function lerCorpo(req) {
        return new Promise(function (ok2, falhar) {
            var bruto = '';
            req.on('data', function (d) {
                bruto += d;
                if (bruto.length > CORPO_MAX) { req.destroy(); falhar(new Error('pedido grande demais')); }
            });
            req.on('end', function () {
                if (!bruto) return ok2({});
                try { ok2(JSON.parse(bruto)); } catch (e) { falhar(new Error('pedido malformado')); }
            });
            req.on('error', falhar);
        });
    }

    /* O arquivo pedido, DENTRO da base - "..", barra invertida e caminho
       absoluto sao recusados antes de resolver. */
    function dentroDaBase(base, rel) {
        var partes = String(rel || '').split('/').map(function (p) {
            try { return decodeURIComponent(p); } catch (e) { return '\u0000'; }
        });
        if (partes.some(function (p) { return p === '..' || p.indexOf('\\') >= 0 || p.indexOf('\u0000') >= 0 || /^[A-Za-z]:/.test(p); })) return null;
        var alvo = path.resolve(base, partes.join(path.sep));
        var b = path.resolve(base);
        if (alvo !== b && alvo.toLowerCase().indexOf(b.toLowerCase() + path.sep) !== 0) return null;
        return alvo;
    }

    function cfgNavegador(modo, app) {
        var s = estado.simulacoes || {};
        return {
            modo: modo, app: app ? app.id : '',
            simulacoes: { usuario: s.usuario || {}, atividade: s.atividade, destino: s.destino, websocket: s.websocket || {} }
        };
    }

    /* ---------------------------------------------------------------- a aplicacao testada */
    function servirTela(req, res, url, appId) {
        var app = estado.apps[appId];
        if (!app) return enviarTexto(res, 404, 'text/plain; charset=utf-8', 'aplicação não encontrada - atualize a lista no Test_in');
        var html;
        if (app.tipo === 'fluxo') {
            var cfg = cfgNavegador('casca', app);
            html = emulacao.renderizarCasca(app, url.searchParams.get('fluxo') || '', cfg);
        } else if (app.tipo === 'modulo') {
            html = emulacao.renderizarModulo(app, cfgNavegador('modulo', app), estado.cfgEstilos);
            if (html === null) return enviarTexto(res, 404, 'text/plain; charset=utf-8', 'o modelo (' + app.modelo + ') não foi encontrado');
        } else {
            res.writeHead(302, { Location: '/__app/' + app.id + '/' + encodeURI(app.principal) });
            return res.end();
        }
        enviarTexto(res, 200, 'text/html; charset=utf-8', html, { 'Content-Security-Policy': "frame-ancestors 'self'" });
    }

    function baseDoApp(app) {
        return app.tipo === 'modulo' ? path.join(app.caminho, 'src', 'main', 'webapp') : app.caminho;
    }

    function servirDoApp(req, res, app, rel) {
        var arq = dentroDaBase(baseDoApp(app), rel);
        if (!arq) return enviarTexto(res, 400, 'text/plain; charset=utf-8', 'caminho recusado');
        if (app.tipo === 'fluxo' && /\.html?$/i.test(arq)) {
            var html = emulacao.renderizarTela(app, path.relative(app.caminho, arq), estado.simulacoes, cfgNavegador('tela', app));
            if (html === null) return enviarTexto(res, 404, 'text/plain; charset=utf-8', 'não encontrado');
            return enviarTexto(res, 200, 'text/html; charset=utf-8', html, { 'Content-Security-Policy': "frame-ancestors 'self'" });
        }
        servirArquivo(res, arq, { 'Content-Security-Policy': "frame-ancestors 'self'" });
    }

    /* ---------------------------------------------------------------- os enderecos da plataforma */
    function registrarPedido(p) {
        p.hora = Date.now();
        estado.pedidos.push(p);
        if (estado.pedidos.length > 2000) estado.pedidos.splice(0, estado.pedidos.length - 2000);
    }

    function servirPlataforma(req, res, url) {
        var p = url.pathname;
        if (BIBLIOTECAS[p]) {
            servirBiblioteca(res, BIBLIOTECAS[p][0], BIBLIOTECAS[p][1]);
            return true;
        }
        if (/\/style-guide\/css\/fluig-style-guide(\.min)?\.css$/i.test(p)) {
            var original = estiloOriginal();
            servirArquivo(res, original || path.join(WEB, 'plataforma', 'estilo.css'));
            return true;
        }
        if (/\/style-guide\/css\/.+\.css$/i.test(p)) return enviarTexto(res, 200, 'text/css; charset=utf-8', '/* emulado: vazio */'), true;
        if (/\/style-guide\/js\/.+\.js$/i.test(p) || p === '/webdesk/vcXMLRPC.js') {
            /* O comportamento vem do ambiente.js (carregado antes). Estes
               enderecos respondem vazio para a tela nao receber um 404. */
            return enviarTexto(res, 200, 'application/javascript; charset=utf-8', '/* emulado pelo Test_in: ver ambiente.js */'), true;
        }
        if (/^\/social\/api\/rest\/social\/image\//.test(p)) { enviarTexto(res, 200, 'image/png', PNG_VAZIO); return true; }
        if (p === '/api/public/ecm/dataset/datasets' && req.method === 'POST') {
            lerCorpo(req).then(function (c) {
                var restricoes = (c.constraints || []).map(function (r) {
                    return { campo: r._field || r.fieldName, valor: r._initialValue, tipo: r._type === undefined ? 1 : r._type };
                });
                var r = emulacao.simularDados(estado.simulacoes, String(c.name || ''), restricoes);
                registrarPedido({ nome: String(c.name || ''), filtros: restricoes, simulado: r.simulado, motivo: r.motivo || '', via: 'rest' });
                /* A regra "erro" falha a consulta tambem por aqui, como o
                   servidor faz quando o dataset lanca erro: HTTP 500 com a
                   mensagem, e nao um 200 vazio que a tela leria como "sem dados". */
                if (r.erro) return json(res, 500, { code: 'DatasetException', message: r.erro, detailedMessage: r.erro });
                json(res, 200, { content: { columns: r.columns, values: r.values } });
            }, function (e) { falha(res, 400, e.message); });
            return true;
        }
        if (/^\/(portal|webdesk|ecm|api\/public|style-guide|social)\//.test(p)) {
            registrarPedido({ nome: p, filtros: [], simulado: false, motivo: 'endereço da plataforma sem emulação', via: 'http' });
            return enviarTexto(res, 404, 'text/plain; charset=utf-8', 'endereço da plataforma sem emulação no Test_in: ' + p), true;
        }
        return false;
    }

    /* A biblioteca sai do MESMO endereco da tela, e nao por redirecionamento
       para a CDN: script de outro endereco que falha aparece so como
       "Script error.", sem detalhe nenhum - e a pessoa fica sem saber onde
       procurar. A ordem: vendor/ (quem quiser rodar sem internet poe ali),
       depois o cache desta instalacao, depois a CDN (e grava no cache: da
       segunda vez em diante, funciona offline). Sem nada disso, redireciona. */
    function servirBiblioteca(res, nome, cdn) {
        var local = path.join(__dirname, '..', 'vendor', nome);
        if (fs.existsSync(local)) return servirArquivo(res, local);
        var cache = path.join(config.pastaDoApp(), 'cache', nome);
        if (fs.existsSync(cache)) return servirArquivo(res, cache);
        if (typeof fetch !== 'function') { res.writeHead(302, { Location: cdn }); return res.end(); }
        fetch(cdn).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }).then(function (texto) {
            try {
                fs.mkdirSync(path.dirname(cache), { recursive: true });
                fs.writeFileSync(cache, texto, 'utf8');
            } catch (e) { /* sem cache: serve assim mesmo */ }
            enviarTexto(res, 200, 'application/javascript; charset=utf-8', texto);
        }).catch(function () {
            res.writeHead(302, { Location: cdn });
            res.end();
        });
    }

    function estiloOriginal() {
        var base = estado.cfgEstilos;
        if (!base) return '';
        var candidatos = [base, path.join(base, 'fluig-style-guide.min.css'), path.join(base, 'css', 'fluig-style-guide.min.css')];
        for (var i = 0; i < candidatos.length; i++) {
            try { if (fs.statSync(candidatos[i]).isFile()) return candidatos[i]; } catch (e) { /* segue */ }
        }
        return '';
    }

    /* ---------------------------------------------------------------- API */
    var ROTAS = {
        'GET /api/estado': function () {
            var cfg = config.ler();
            return { pastas: cfg.pastas, estilosBase: cfg.estilosBase, estiloOriginalAchado: !!estiloOriginal() };
        },
        'POST /api/config': function (req, url, c) {
            var pastas = Array.isArray(c.pastas) ? c.pastas.map(String).map(function (p) { return p.trim(); }).filter(Boolean) : undefined;
            (pastas || []).forEach(function (p) {
                var recusa = config.caminhoAceitavel(p);
                if (recusa) throw new Error(p + ': ' + recusa);
                if (!fs.existsSync(p)) throw new Error(p + ': a pasta não existe (ou não está acessível).');
            });
            var estilos = c.estilosBase !== undefined ? String(c.estilosBase || '').trim() : undefined;
            if (estilos) {
                var r2 = config.caminhoAceitavel(estilos);
                if (r2) throw new Error('estilos: ' + r2);
            }
            config.gravar({ pastas: pastas, estilosBase: estilos });
            return { repositorios: redescobrir().length };
        },
        'GET /api/repositorios': function () { return redescobrir(); },
        'GET /api/versao': function () { return { desatualizada: codigoMudou() }; },
        'GET /api/script': function (req, url) {
            var repo = estado.repos.filter(function (r) { return r.id === url.searchParams.get('repositorio'); })[0];
            if (!repo) throw new Error('repositório não encontrado - atualize a lista');
            var rel = String(url.searchParams.get('rel') || '');
            if (!/\.testes\.json$/i.test(rel)) throw new Error('só arquivos .testes.json');
            var arq = dentroDaBase(repo.caminho, rel);
            if (!arq) throw new Error('caminho recusado');
            return { texto: fs.readFileSync(arq, 'utf8'), nome: path.basename(arq) };
        },
        'POST /api/simulacoes': function (req, url, c) {
            estado.simulacoes = (c.simulacoes && typeof c.simulacoes === 'object') ? c.simulacoes : {};
            return { ok: true };
        },
        'GET /api/pedidos': function (req, url) {
            var desde = Number(url.searchParams.get('desde') || 0);
            return { pedidos: estado.pedidos.filter(function (p) { return p.hora >= desde; }).slice(-500) };
        }
    };

    /* ---------------------------------------------------------------- o servidor */
    var servidor = http.createServer(function (req, res) {
        var url;
        try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { return falha(res, 400, 'endereço inválido'); }
        if (!origemConfiavel(req)) return falha(res, 403, 'pedido recusado: origem não confiável');

        var p = url.pathname;

        /* A interface. A pagina principal exige o token; os arquivos dela
           nao carregam segredo nenhum. */
        if (p === '/' || p === '/index.html') {
            plantarCookie(url, res);
            if (!autorizado(req, url)) {
                return enviarTexto(res, 401, 'text/html; charset=utf-8',
                    '<!doctype html><meta charset="utf-8"><title>Test_in</title>' +
                    '<p style="font-family:system-ui;padding:24px">Abra o Test_in pelo endereço que o terminal mostrou ' +
                    '(ele leva o token desta instalação).</p>');
            }
            return servirArquivo(res, path.join(WEB, 'index.html'), { 'Content-Security-Policy': CSP_INTERFACE });
        }
        if (/^\/(app\.js|app\.css|motor\.js|relatorio\.js|logo\.png)$/.test(p)) {
            return servirArquivo(res, path.join(WEB, p.substring(1)), { 'Content-Security-Policy': CSP_INTERFACE });
        }
        if (/^\/__testin\/plataforma\/[\w.-]+\.(js|css)$/.test(p)) {
            return servirArquivo(res, path.join(WEB, 'plataforma', path.basename(p)));
        }

        /* Os enderecos da plataforma respondem sem token: sao bibliotecas e
           respostas simuladas, e a tela as pede do jeito que foi escrita. */
        if (servirPlataforma(req, res, url)) return;

        if (!autorizado(req, url)) return falha(res, 401, 'token ausente ou inválido. Reabra pelo endereço que o Test_in imprimiu.');

        var m;
        if ((m = /^\/__testin\/tela\/([0-9a-f]{12})$/.exec(p))) return servirTela(req, res, url, m[1]);
        if ((m = /^\/__app\/([0-9a-f]{12})\/(.*)$/.exec(p))) {
            var app = estado.apps[m[1]];
            if (!app) return enviarTexto(res, 404, 'text/plain; charset=utf-8', 'aplicação não encontrada');
            return servirDoApp(req, res, app, m[2]);
        }
        if (p === '/__testin/dados' && req.method === 'POST') {
            return lerCorpo(req).then(function (c) {
                var r = emulacao.simularDados(estado.simulacoes, String(c.nome || ''), c.restricoes || []);
                registrarPedido({ nome: String(c.nome || ''), filtros: c.restricoes || [], simulado: r.simulado, motivo: r.motivo || '', via: 'tela' });
                json(res, 200, r.erro ? { erro: r.erro } : { columns: r.columns, values: r.values, simulado: r.simulado });
            }, function (e) { falha(res, 400, e.message); });
        }
        if (p === '/__testin/evento' && req.method === 'POST') {
            return lerCorpo(req).then(function (c) {
                var app2 = estado.apps[String(c.app || '')];
                if (!app2 || app2.tipo !== 'fluxo') return json(res, 200, {});
                var ev = /^(validateForm)$/.test(String(c.evento)) ? String(c.evento) : '';
                if (!ev || (app2.eventos || []).indexOf(ev) < 0) return json(res, 200, {});
                var e = emulacao.executarEvento(app2, ev, estado.simulacoes, c.valores || {});
                json(res, 200, { erro: e.erro || '', log: e.log, avisos: e.avisos });
            }, function (e) { falha(res, 400, e.message); });
        }

        /* O endereco de contexto de um modulo (/<contexto>/resources/...):
           imagens e arquivos que o modelo referencia pelo caminho absoluto. */
        var ctx = /^\/([^/]+)\/(.+)$/.exec(p);
        if (ctx && estado.contextos[ctx[1]]) return servirDoApp(req, res, estado.contextos[ctx[1]], ctx[2]);

        var acao = ROTAS[req.method + ' ' + p];
        if (!acao) return falha(res, 404, 'não existe: ' + req.method + ' ' + p);
        var corpo = req.method === 'POST' ? lerCorpo(req) : Promise.resolve({});
        corpo.then(function (c) { return acao(req, url, c); })
            .then(function (dados) { ok(res, dados); })
            .then(null, function (e) { falha(res, 400, e.message || String(e)); });
    });

    servidor.redescobrir = redescobrir;
    servidor.estado = estado;
    return servidor;
}

module.exports = { criar: criar };
