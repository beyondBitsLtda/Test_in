/* ============================================================================
   e2e-navegador.js - o Test_in inteira, num navegador de verdade
   ============================================================================
   Sobe o Test_in numa porta livre, abre o Edge (ou o Chrome) sem janela pelo
   protocolo de depuracao do navegador - so com o Node, sem pacote nenhum -,
   carrega um script de teste pela propria interface, roda e confere o
   resultado. No fim, grava o relatorio HTML gerado.

   Uso (Node >= 22, que ja traz WebSocket):

       node teste/e2e-navegador.js <pasta-de-repositorios> <script.testes.json> [nome-da-aplicacao]

   Nao faz parte da bateria rapida (teste-test_in.js): precisa de navegador
   instalado e de internet para as bibliotecas que a tela testada pede.
============================================================================ */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var net = require('net');
var child = require('child_process');

var PASTA = process.argv[2];
var SCRIPT = process.argv[3];
var NOME_APP = process.argv[4] || '';
if (!PASTA || !SCRIPT) {
    console.log('uso: node teste/e2e-navegador.js <pasta-de-repositorios> <script.testes.json> [nome-da-aplicacao]');
    process.exit(2);
}

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'testin-e2e-'));
process.env.TESTIN_CONFIG_DIR = path.join(TMP, 'config');
var config = require('../src/config');
var servidor = require('../src/servidor');

function portaLivre() {
    return new Promise(function (ok) {
        var s = net.createServer();
        s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { ok(p); }); });
    });
}
function dormir(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

function acharNavegador() {
    var candidatos = [process.env.NAVEGADOR,
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe'];
    return candidatos.filter(function (c) { return c && fs.existsSync(c); })[0];
}

/* O minimo do protocolo: mandar comando e esperar a resposta pelo id. */
function Aba(ws) {
    var self = this;
    self.ws = ws; self.seq = 0; self.pendentes = {}; self.console = [];
    ws.onmessage = function (ev) {
        var m = JSON.parse(ev.data);
        if (m.id && self.pendentes[m.id]) {
            var p = self.pendentes[m.id]; delete self.pendentes[m.id];
            if (m.error) p.falha(new Error(m.error.message)); else p.ok(m.result);
        } else if (m.method === 'Runtime.consoleAPICalled') {
            self.console.push(m.params.type + ': ' + m.params.args.map(function (a) { return a.value !== undefined ? a.value : a.description; }).join(' '));
        } else if (m.method === 'Runtime.exceptionThrown') {
            var d = m.params.exceptionDetails;
            self.console.push('EXCECAO: ' + ((d.exception && d.exception.description) || d.text));
        }
    };
}
Aba.prototype.enviar = function (metodo, params) {
    var self = this, id = ++self.seq;
    return new Promise(function (ok, falha) {
        self.pendentes[id] = { ok: ok, falha: falha };
        self.ws.send(JSON.stringify({ id: id, method: metodo, params: params || {} }));
    });
};
Aba.prototype.avaliar = function (expr) {
    return this.enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(function (r) {
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
        return r.result.value;
    });
};

async function principal() {
    config.gravar({ pastas: [path.resolve(PASTA)] });
    var token = config.tokenDoUsuario();
    var srv = servidor.criar(token);
    srv.redescobrir();
    var porta = await portaLivre();
    await new Promise(function (ok) { srv.listen(porta, '127.0.0.1', ok); });

    var exe = acharNavegador();
    if (!exe) { console.log('(pulado) nenhum navegador encontrado'); process.exit(0); }
    var portaDepuracao = await portaLivre();
    var nav = child.spawn(exe, ['--headless=new', '--remote-debugging-port=' + portaDepuracao, '--user-data-dir=' + path.join(TMP, 'perfil'),
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });

    var alvo = null;
    for (var i = 0; i < 80 && !alvo; i++) {
        try {
            var lista = await (await fetch('http://127.0.0.1:' + portaDepuracao + '/json/list')).json();
            alvo = lista.filter(function (t) { return t.type === 'page'; })[0];
        } catch (e) { /* ainda subindo */ }
        if (!alvo) await dormir(250);
    }
    if (!alvo) throw new Error('o navegador não abriu a porta de depuração');

    var ws = new WebSocket(alvo.webSocketDebuggerUrl);
    await new Promise(function (ok, falha) { ws.onopen = ok; ws.onerror = falha; });
    var aba = new Aba(ws);
    await aba.enviar('Runtime.enable');
    await aba.enviar('Page.enable');
    await aba.enviar('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(function () {});
    await aba.enviar('Page.navigate', { url: 'http://127.0.0.1:' + porta + '/__testin/?t=' + token });

    for (var k = 0; k < 60; k++) {
        var pronto = await aba.avaliar('!!(window.testin && window.testin.estado.repos.length)').catch(function () { return false; });
        if (pronto) break;
        await dormir(250);
    }

    var repos = srv.estado.repos;
    var apps = [];
    repos.forEach(function (r) { r.aplicacoes.forEach(function (a) { apps.push(a); }); });
    var app = apps.filter(function (a) { return !NOME_APP || a.nome === NOME_APP; })[0];
    if (!app) throw new Error('aplicação não encontrada: ' + NOME_APP + ' (achei: ' + apps.map(function (a) { return a.nome; }).join(', ') + ')');
    console.log('aplicação: ' + app.nome + ' (' + app.tipo + ')');

    var texto = fs.readFileSync(SCRIPT, 'utf8');
    var carregou = await aba.avaliar('window.testin.abrirApp(' + JSON.stringify(app.id) + ') && window.testin.carregarTexto(' +
                                     JSON.stringify(texto) + ', ' + JSON.stringify(path.basename(SCRIPT)) + ')');
    if (!carregou) throw new Error('a interface não carregou o script');

    var t0 = Date.now();
    /* CAMERA=<ms>: roda em camera lenta; com CAPTURAS, grava quadros no meio
       da rodada (a legenda e o destaque so existem enquanto ela anda). */
    var camera = Number(process.env.CAMERA) || 0;
    /* PASSO=<n>: modo passo a passo - clica "Executar" nos n primeiros passos
       (com CAPTURAS, fotografa o cartao de cada um) e depois "Executar o resto". */
    var passos = Number(process.env.PASSO) || 0;
    var opRodar = {};
    if (camera) opRodar.cameraLentaMs = camera;
    if (passos) opRodar.passoAPasso = true;
    await aba.avaliar('window.__fim = false; window.__rodada = window.testin.rodar(' + JSON.stringify(opRodar) + ').then(function (r) { window.__fim = true; return r; }); true');
    if (passos) {
        var feitos = 0;
        while (!(await aba.avaliar('window.__fim'))) {
            if (await aba.avaliar('window.testin.passo.pendente()')) {
                feitos++;
                if (process.env.CAPTURAS && feitos <= 6) {
                    fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
                    await dormir(300);
                    var foto = await aba.enviar('Page.captureScreenshot', { format: 'png' });
                    fs.writeFileSync(path.join(process.env.CAPTURAS, 'passo-' + feitos + '.png'), Buffer.from(foto.data, 'base64'));
                }
                await aba.avaliar('window.testin.passo.decidir(' + JSON.stringify(feitos < passos ? 'executar' : 'resto') + ')');
            }
            await dormir(150);
        }
        console.log('passo a passo: ' + Math.min(feitos, passos) + ' passo(s) executado(s) um a um, o resto sem parar');
    }
    if (camera && process.env.CAPTURAS) {
        fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
        for (var q = 1; q <= 8; q++) {
            await dormir(camera * 1.3);
            var quadro = await aba.enviar('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(process.env.CAPTURAS, 'camera-' + q + '.png'), Buffer.from(quadro.data, 'base64'));
        }
    }
    var res = await aba.avaliar('window.__rodada.then(function (r) { return r; })');
    console.log('rodada em ' + Math.round((Date.now() - t0) / 1000) + ' s: ' + JSON.stringify(res.resumo));
    res.casos.forEach(function (c) {
        console.log('  ' + (c.status === 'APROVADO' ? 'ok    ' : 'FALHA ') + c.codigo + ' - ' + c.nome);
        c.passos.forEach(function (p) {
            if (p.status === 'FALHOU') console.log('          passo ' + p.n + ' (' + p.descricao + '): ' + p.erro);
        });
        if (c.status !== 'APROVADO' && c.errosConsole.length) console.log('          erros de JS: ' + c.errosConsole.slice(0, 3).join(' | '));
    });

    /* PEDIDOS=1: lista cada consulta distinta que a tela fez (fonte + filtros)
       e se ela foi simulada - o mapa para escrever as simulacoes. */
    if (process.env.PEDIDOS) {
        var vistos = {};
        srv.estado.pedidos.forEach(function (p) {
            var chave = p.nome + ' ' + (p.filtros || []).map(function (f) { return f.campo + '=' + f.valor; }).join(' ');
            if (vistos[chave]) return;
            vistos[chave] = true;
            console.log('  consulta ' + (p.simulado ? '[sim] ' : '[---] ') + chave);
        });
    }

    var html = await aba.avaliar('window.testin.relatorio()');
    var saidaRel = path.join(TMP, 'relatorio.html');
    fs.writeFileSync(saidaRel, html, 'utf8');

    var sem = await aba.avaliar('JSON.stringify(window.testin.estado.semSimulacao.map(function (p) { return p.nome; }))');
    console.log('fontes sem simulação: ' + sem);

    /* CAPTURAS=<pasta>: grava a tela do Test_in com o resultado, a tela
       cheia e o relatorio - para conferir o visual de olho. */
    if (process.env.CAPTURAS) {
        var dir = process.env.CAPTURAS;
        fs.mkdirSync(dir, { recursive: true });
        var capturar = async function (nome, inteira) {
            var r = await aba.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!inteira });
            fs.writeFileSync(path.join(dir, nome), Buffer.from(r.data, 'base64'));
        };
        await aba.avaliar('document.querySelector("[data-resultado]").scrollIntoView(); true');
        await dormir(400);
        await capturar('1-resultado.png');
        await aba.avaliar('window.scrollTo(0, 0); document.querySelector("[data-palco]").classList.add("palco--cheio"); true');
        await dormir(600);
        await capturar('2-tela-cheia.png');
        await aba.avaliar('document.querySelector("[data-palco]").classList.remove("palco--cheio"); true');
        await aba.enviar('Page.navigate', { url: 'file:///' + saidaRel.split(path.sep).join('/') });
        await dormir(1200);
        await capturar('3-relatorio.png', true);
        console.log('capturas em ' + dir);
    }
    console.log('relatório: ' + saidaRel + ' (' + Math.round(html.length / 1024) + ' KB)');

    try { ws.close(); } catch (e) { /* ja foi */ }
    try { nav.kill(); } catch (e) { /* ja foi */ }
    srv.close();
    process.exit(res.resumo.reprovados || res.resumo.naoExecutados ? 1 : 0);
}

principal().catch(function (e) { console.log('FALHA: ' + (e && e.stack || e)); process.exit(1); });
