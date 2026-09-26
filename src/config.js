/* ============================================================================
   config.js - as pastas de repositorios desta pessoa, e o token dela
   ============================================================================
   Fica em %APPDATA%\test_in\config.json - por USUARIO, na maquina
   dele. Cada um tem as proprias pastas; uma configuracao compartilhada faria a
   lista de um aparecer para o outro, com caminhos que o outro nem alcanca.

     pastas        onde procurar repositorios (a pessoa cola do Explorer)
     token         o segredo da interface (ver servidor.js)
     estilosBase   OPCIONAL: pasta com a folha de estilos original da
                   plataforma das telas testadas. Com ela, a tela sai
                   visualmente identica; sem ela, vale a emulacao.
============================================================================ */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');

/* A variavel de ambiente existe para os testes automaticos: eles apontam a
   configuracao para uma pasta temporaria e nao tocam na do usuario. */
function pastaDoApp() {
    if (process.env.TESTIN_CONFIG_DIR) return process.env.TESTIN_CONFIG_DIR;
    var base = process.env.APPDATA || process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(base, 'test_in');
}

function arquivo() { return path.join(pastaDoApp(), 'config.json'); }

/* O ANTECESSOR. Quem ja usava a Bancada de Testes tem as pastas (e a folha de
   estilos original) cadastradas la. Na PRIMEIRA abertura do Test_in, sem
   config.json proprio, elas vem de la - o token nao: e de cada app, e os dois
   rodam lado a lado. Nos testes automaticos (TESTIN_CONFIG_DIR) nao ha
   heranca: eles nunca podem ler a configuracao de verdade da pessoa. */
function arquivoDoAntecessor() {
    var base = process.env.APPDATA || process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(base, 'bancada-testes', 'config.json');
}

function herdarDoAntecessor() {
    if (process.env.TESTIN_CONFIG_DIR || fs.existsSync(arquivo())) return null;
    try {
        var c = JSON.parse(fs.readFileSync(arquivoDoAntecessor(), 'utf8'));
        var pastas = Array.isArray(c.pastas) ? c.pastas.map(String) : [];
        if (!pastas.length) return null;
        return { pastas: pastas, token: '', estilosBase: String(c.estilosBase || ''), herdadas: true };
    } catch (e) { return null; }
}

function ler() {
    try {
        var c = JSON.parse(fs.readFileSync(arquivo(), 'utf8'));
        return {
            pastas: Array.isArray(c.pastas) ? c.pastas.map(String) : [],
            token: String(c.token || ''),
            estilosBase: String(c.estilosBase || '')
        };
    } catch (e) {
        /* Sem arquivo e o caso normal (primeira execucao). Arquivo corrompido
           tambem cai aqui: volta a pedir as pastas, que e recuperavel. */
        return herdarDoAntecessor() || { pastas: [], token: '', estilosBase: '' };
    }
}

function gravar(cfg) {
    var atual = ler();
    var dados = {
        pastas: (cfg.pastas !== undefined ? cfg.pastas : atual.pastas).map(String),
        token: String(cfg.token !== undefined ? cfg.token : atual.token || ''),
        estilosBase: String(cfg.estilosBase !== undefined ? cfg.estilosBase : atual.estilosBase || '')
    };
    try { fs.mkdirSync(pastaDoApp(), { recursive: true }); } catch (e) { /* ja existe */ }
    /* Temporario + renomear: se a energia cair no meio, o arquivo antigo
       continua inteiro em vez de virar meio arquivo. */
    var tmp = arquivo() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
    fs.renameSync(tmp, arquivo());
    return dados;
}

/* O token e POR INSTALACAO: nasce na primeira abertura e fica. Trocar e
   apagar a linha do config.json. */
function tokenDoUsuario() {
    var cfg = ler();
    if (cfg.token && cfg.token.length >= 32) return cfg.token;
    var novo = crypto.randomBytes(24).toString('hex');
    gravar({ token: novo });
    return novo;
}

/* ==========================================================================
   A CERCA: o Test_in so le dentro das pastas que a pessoa cadastrou. Nao e
   trava contra ela (ela alcanca o disco pelo Explorer); e trava contra o app
   agir onde ninguem pediu - um ".." vindo da tela, um caminho digitado errado.
   ========================================================================== */
function dentroDasPastas(alvo, pastas) {
    var a = path.resolve(String(alvo)).toLowerCase();
    for (var i = 0; i < (pastas || []).length; i++) {
        var raiz = path.resolve(String(pastas[i])).toLowerCase();
        if (a === raiz) return true;
        if (a.indexOf(raiz + path.sep) === 0) return true;
    }
    return false;
}

function caminhoAceitavel(alvo) {
    var s = String(alvo || '');
    if (!s.trim()) return 'caminho vazio';
    if (s.indexOf('..') >= 0) return 'caminho com ".." não é aceito';
    if (s.indexOf('\u0000') >= 0) return 'caminho inválido';
    if (!path.isAbsolute(s)) return 'informe o caminho completo (ex.: C:\\repositorios)';
    return null;
}

module.exports = {
    arquivo: arquivo, arquivoDoAntecessor: arquivoDoAntecessor, pastaDoApp: pastaDoApp, ler: ler, gravar: gravar,
    tokenDoUsuario: tokenDoUsuario, dentroDasPastas: dentroDasPastas, caminhoAceitavel: caminhoAceitavel
};
