#!/usr/bin/env node
/* ============================================================================
   Test_in - testes de tela automaticos, no seu computador
   ============================================================================
   Uso:

       node app.js                 abre na porta 7041 e abre o navegador
       node app.js --porta 7050    em outra porta
       node app.js --sem-navegador nao abre o navegador sozinho

   Voce aponta as pastas onde ficam os seus repositorios. O Test_in reconhece
   as aplicacoes (tela de fluxo, modulo de pagina, aplicacao web), abre a que
   voce escolher num quadro, roda o script de teste passo a passo e devolve o
   resultado na tela e num relatorio HTML.

   Os dados que a tela consultaria num servidor sao SIMULADOS pelo proprio
   arquivo de teste. Nada e gravado em lugar nenhum.

   Fechar esta janela encerra o Test_in. Zero dependencias: so o Node.
============================================================================ */
'use strict';

var child = require('child_process');
var servidor = require('./src/servidor');
var config = require('./src/config');

var VERSAO = '1.1.0';
var PORTA_PADRAO = 7041;

function lerArgumentos(argv) {
    var op = { porta: PORTA_PADRAO, navegador: true };
    for (var i = 0; i < argv.length; i++) {
        if (argv[i] === '--porta') op.porta = parseInt(argv[++i], 10) || PORTA_PADRAO;
        else if (argv[i] === '--sem-navegador') op.navegador = false;
        else if (argv[i] === '--versao') { console.log(VERSAO); process.exit(0); }
        else if (argv[i] === '--ajuda' || argv[i] === '-h') {
            console.log('Test_in ' + VERSAO + '\n\n  node app.js [--porta N] [--sem-navegador]');
            process.exit(0);
        } else { console.error('argumento desconhecido: ' + argv[i]); process.exit(2); }
    }
    return op;
}

function abrirNavegador(url) {
    try {
        if (process.platform === 'win32') child.spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
        else if (process.platform === 'darwin') child.spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
        else child.spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) { /* sem navegador: a URL esta impressa */ }
}

function principal() {
    var op = lerArgumentos(process.argv.slice(2));
    var token = config.tokenDoUsuario();
    var srv = servidor.criar(token);
    srv.redescobrir();

    srv.on('error', function (e) {
        if (e.code === 'EADDRINUSE') {
            console.error('A porta ' + op.porta + ' está ocupada. Rode com --porta <outra>.');
        } else {
            console.error('Não consegui abrir o Test_in: ' + e.message);
        }
        process.exit(1);
    });

    /* SO 127.0.0.1: ninguem na rede alcanca o Test_in. */
    srv.listen(op.porta, '127.0.0.1', function () {
        var url = 'http://127.0.0.1:' + op.porta + '/?t=' + token;
        console.log('Test_in ' + VERSAO);
        var cfg = config.ler();
        console.log('pastas configuradas: ' + (cfg.pastas.length || 'nenhuma ainda'));
        console.log('');
        console.log('Abra no navegador:');
        console.log('  ' + url);
        console.log('');
        console.log('(deixe esta janela aberta enquanto usa - fechá-la encerra o Test_in)');
        if (op.navegador) abrirNavegador(url);
    });
}

if (require.main === module) principal();
module.exports = { VERSAO: VERSAO };
