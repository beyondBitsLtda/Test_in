/* ============================================================================
   teste-test_in.js - a bateria rapida do Test_in (sem navegador)
   ============================================================================
   O que ele protege:

   1. A DESCOBERTA: a arquitetura certa para cada pasta, e o script de teste
      ligado a aplicacao certa - mesmo morando em outro repositorio.
   2. A EMULACAO: os eventos de servidor aplicados no HTML antes do primeiro
      script; as simulacoes de dados respondendo pela regra certa; o modelo
      do modulo renderizado sem sobrar diretiva; o validateForm reprovando.
   3. AS TRAVAS DO SERVIDOR: token, origem, e nenhum arquivo fora da base.
   4. O RELATORIO: autocontido e sem HTML injetado pelo nome de um caso.
   5. O MOTOR e o MESMO do painel da plataforma, e a interface nao fala da
      plataforma.

   O teste de ponta a ponta, num navegador de verdade, e o e2e-navegador.js.

   Rodar:  node teste/teste-test_in.js
============================================================================ */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var vm = require('vm');

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'testin-teste-'));
process.env.TESTIN_CONFIG_DIR = path.join(TMP, 'config');

var descobrir = require('../src/descobrir');
var emulacao = require('../src/emulacao');
var config = require('../src/config');
var servidor = require('../src/servidor');

var RAIZ_APP = path.join(__dirname, '..');
var RAIZ_REPO = path.join(RAIZ_APP, '..', '..');
var EXEMPLO = path.join(RAIZ_REPO, 'exemplo de teste');

var falhas = 0;
function conferir(c, d, x) {
    if (c) console.log('ok     ' + d);
    else { console.log('FALHA  ' + d + (x ? '\n         ' + x : '')); falhas++; }
}
function gravar(p, t) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'utf8'); }

/* ================================================== um repositorio de mentira */
var REPOS = path.join(TMP, 'repos');
var APP = path.join(REPOS, 'app-cadastro');
gravar(path.join(APP, '.git', 'HEAD'), 'ref: refs/heads/main');
gravar(path.join(APP, 'forms', '5001 - Cadastro', 'cadastro.html'),
    '<html><head><title>Cadastro</title><script src="cadastro.js"></script></head><body>' +
    '<input name="ATIVIDADE" type="hidden"><input name="SOLICITANTE" type="hidden">' +
    '<input name="valor" id="valor" type="text"><textarea name="obs"></textarea>' +
    '<div id="blocoSecreto">x</div><select name="tipo"><option>A</option></select>' +
    '<script src="cadastro.app.js"></script></body></html>');
gravar(path.join(APP, 'forms', '5001 - Cadastro', 'events', 'displayFields.js'),
    'function displayFields(form, customHTML) {\n' +
    '  form.setValue("ATIVIDADE", getValue("WKNumState"));\n' +
    '  form.setValue("SOLICITANTE", fluigAPI.getUserService().getCurrent().getLogin());\n' +
    '  form.setValue("obs", "texto <b>inicial</b>");\n' +
    '  form.setEnabled("tipo", false);\n' +
    '  form.setVisibleById("blocoSecreto", false);\n' +
    '  form.metodoQueNaoExiste();\n' +
    '  customHTML.append("<script>window.__extra = 1;<\/script>");\n' +
    '  log.info("rodou");\n}');
gravar(path.join(APP, 'forms', '5001 - Cadastro', 'events', 'validateForm.js'),
    'function validateForm(form) {\n  if (!form.getValue("valor")) throw "Informe o valor.";\n' +
    '  var ds = DatasetFactory.getDataset("dsLimite", null, [DatasetFactory.createConstraint("TIPO", "A", "A", ConstraintType.MUST)], null);\n' +
    '  if (Number(form.getValue("valor")) > Number(ds.getValue(0, "LIMITE"))) throw "Acima do limite de " + ds.getValue(0, "LIMITE");\n}');
gravar(path.join(APP, 'workflow', '.resources', 'cadastro.ecm30.xml'), '<x><processId>cadastroFluxo</processId><formId>9999</formId></x>');
gravar(path.join(APP, 'wcm', 'widget', 'painelX', 'src', 'main', 'resources', 'application.info'),
    'application.type=widget\napplication.code=painelX\napplication.title=Painel X\nview.file=view.ftl\n' +
    'locale.file.base.name=painelX\napplication.resource.js.2=/resources/js/b.js\napplication.resource.js.1=/resources/js/a.js\n' +
    'application.resource.css.1=/resources/css/x.css\n');
gravar(path.join(APP, 'wcm', 'widget', 'painelX', 'src', 'main', 'resources', 'painelX_pt_BR.properties'), 'titulo=Ol\\u00e1 mundo\n');
gravar(path.join(APP, 'wcm', 'widget', 'painelX', 'src', 'main', 'resources', 'view.ftl'),
    '<#-- comentario -->\n<div id="painelX_${instanceId}" data-params="PainelX.instance()">\n<h1>${i18n.getTranslation(\'titulo\')}</h1>\n' +
    '<#if mostrar??>nao<#else>sim</#if>\n<input id="busca_${instanceId}">\n</div>');
gravar(path.join(APP, 'wcm', 'widget', 'painelX', 'src', 'main', 'webapp', 'resources', 'js', 'a.js'), 'var a = 1;');
gravar(path.join(APP, 'site', 'index.html'), '<html><head><title>Site Estatico</title></head><body>oi</body></html>');
gravar(path.join(REPOS, 'testes-central', 'cadastro.testes.json'),
    JSON.stringify({ formato: 'delp-testes-de-tela', alvo: 'FORM:5001', casos: [{ codigo: 'c1', nome: 'x', passos: [{ acao: 'abrirProcesso', processo: 'p' }] }] }));
gravar(path.join(REPOS, 'testes-central', '.git', 'HEAD'), 'x');
gravar(path.join(APP, 'segredo.txt'), 'nao pode sair');
/* um projeto Vite: a fonte (index.html -> /src/main.jsx) e o build (dist/) */
var SPA = path.join(REPOS, 'painel-spa');
gravar(path.join(SPA, '.git', 'HEAD'), 'x');
gravar(path.join(SPA, 'package.json'), JSON.stringify({ name: 'painel-spa', devDependencies: { vite: '^8.0.0' } }));
gravar(path.join(SPA, 'index.html'), '<!doctype html><html><head><title>Painel SPA</title></head><body><div id="root"></div>' +
    '<script type="module" src="/src/main.jsx"></script></body></html>');
gravar(path.join(SPA, 'src', 'main.jsx'), 'export default 1;');
gravar(path.join(SPA, 'dist', 'index.html'), '<!doctype html><html><head><title>Painel SPA</title>' +
    '<script type="module" crossorigin src="/assets/app-1.js"></script></head><body><div id="root"></div></body></html>');
gravar(path.join(SPA, 'dist', 'assets', 'app-1.js'), 'window.__spa = 1;');
var doisDiasAtras = new Date(Date.now() - 2 * 24 * 3600 * 1000);
fs.utimesSync(path.join(SPA, 'dist', 'index.html'), doisDiasAtras, doisDiasAtras);

async function principal() {
    console.log('--- 1. A DESCOBERTA ---');
    var repos = descobrir.repositorios([REPOS]);
    var app = null, apps = {};
    repos.forEach(function (r) { r.aplicacoes.forEach(function (a) { apps[a.tipo] = apps[a.tipo] || a; }); });
    conferir(apps.fluxo && apps.fluxo.numero === '5001' && apps.fluxo.principal === 'cadastro.html' &&
             apps.fluxo.eventos.indexOf('displayFields') >= 0 && apps.fluxo.fluxos[0] === 'cadastroFluxo',
        'tela de fluxo: número, .html principal, eventos e o fluxo que a usa (inclusive em .resources)', JSON.stringify(apps.fluxo));
    conferir(apps.modulo && apps.modulo.nome === 'painelX' && apps.modulo.recursos.js.join(',') === '/resources/js/a.js,/resources/js/b.js',
        'módulo de página: os recursos na ORDEM NUMÉRICA do application.info (não na do arquivo)', JSON.stringify(apps.modulo && apps.modulo.recursos));
    conferir(apps.web && apps.web.titulo === 'Site Estatico', 'aplicação web: pasta com index.html', JSON.stringify(apps.web));
    conferir(repos.length > 0 && repos.every(function (r) {
        return r.raiz === path.resolve(REPOS) && r.relRaiz === path.basename(r.caminho);
    }), 'cada repositório diz de qual pasta cadastrada veio (raiz) e o caminho relativo a ela',
        JSON.stringify(repos.map(function (r) { return r.raiz + ' | ' + r.relRaiz; })));
    var todasApps = [];
    repos.forEach(function (r) { r.aplicacoes.forEach(function (a) { todasApps.push(a); }); });
    var fonteSpa = todasApps.filter(function (a) { return a.tipo === 'web' && a.caminho === path.resolve(SPA); })[0];
    var distSpa = todasApps.filter(function (a) { return a.tipo === 'web' && a.caminho === path.resolve(SPA, 'dist'); })[0];
    conferir(fonteSpa && fonteSpa.testavel === false && /Vite/.test(fonteSpa.aviso) && /npm run build/.test(fonteSpa.aviso),
        'projeto Vite: o index.html da FONTE aparece desligado, dizendo para gerar o build', JSON.stringify(fonteSpa));
    conferir(distSpa && distSpa.testavel !== false && /mais velho que o código/.test(distSpa.aviso || ''),
        'o build (dist) é testável, e avisa quando está mais velho que o src/', JSON.stringify(distSpa));
    var fluxo = apps.fluxo;
    conferir(fluxo && fluxo.scripts.length === 1 && fluxo.scripts[0].nome === 'cadastro.testes.json',
        'o script de OUTRO repositório é ligado à tela pelo alvo (FORM:5001)', JSON.stringify(fluxo && fluxo.scripts));

    if (fs.existsSync(EXEMPLO)) {
        var reais = descobrir.repositorios([EXEMPLO, RAIZ_REPO]);
        var todas = [];
        reais.forEach(function (r) { r.aplicacoes.forEach(function (a) { todas.push(a); }); });
        var go = todas.filter(function (a) { return a.nome === 'gestaoOperacionalFS'; })[0];
        var dt = todas.filter(function (a) { return a.nome === 'devToolsKit'; })[0];
        conferir(go && go.tipo === 'fluxo' && go.scripts.length === 1 && dt && dt.tipo === 'modulo' && dt.scripts.length === 1,
            'nos repositórios REAIS: gestaoOperacionalFS (fluxo) e devToolsKit (módulo), cada um com o seu script',
            JSON.stringify(todas.map(function (a) { return a.nome + ':' + a.tipo + ':' + (a.scripts || []).length; })));
    } else {
        console.log('(pulado) a pasta "exemplo de teste" não existe aqui');
    }

    /* ====================================================================== */
    console.log('\n--- 2. A EMULAÇÃO ---');
    var sim = { usuario: { login: 'ana.teste' }, atividade: 4, fontes: {
        dsLimite: [{ quando: { TIPO: 'A' }, linhas: [{ LIMITE: '100' }] }],
        dsX: [
            { quando: { OPERACAO: 'consultar', TIPO: 'COMP' }, linhas: [{ MES: '7', CODPRJ: '{{CODPRJ}}' }] },
            { quando: { TIPO: ['B', 'C'] }, erro: 'falha simulada' },
            { quando: { CODPRJ: '*' }, linhas: [{ ALGUM: '1' }] },
            { linhas: [] }
        ] } };
    var r = emulacao.simularDados(sim, 'dsX', [{ campo: 'OPERACAO', valor: 'consultar' }, { campo: 'TIPO', valor: 'COMP' }, { campo: 'CODPRJ', valor: '3.01' }]);
    conferir(r.simulado && r.regra === 0 && r.values[0].CODPRJ === '3.01', 'a primeira regra que casa responde, e "{{CODPRJ}}" ecoa o filtro', JSON.stringify(r));
    r = emulacao.simularDados(sim, 'dsX', [{ campo: 'TIPO', valor: 'C' }]);
    conferir(r.erro === 'falha simulada', 'lista de valores casa qualquer um, e a regra pode simular uma FALHA', JSON.stringify(r));
    r = emulacao.simularDados(sim, 'dsX', [{ campo: 'CODPRJ', valor: 'qualquer' }]);
    conferir(r.regra === 2, '"*" exige que o filtro exista, com qualquer valor', JSON.stringify(r));
    r = emulacao.simularDados(sim, 'dsX', [{ campo: 'OPERACAO', valor: 'consultar', tipo: 3 }]);
    conferir(r.regra === 3, 'filtro que não é obrigatório (MUST_NOT) não decide a regra', JSON.stringify(r));
    r = emulacao.simularDados(sim, 'dsNenhum', []);
    conferir(!r.simulado && /sem simulação/.test(r.motivo), 'fonte sem simulação volta vazia e diz por quê', JSON.stringify(r));

    var html = emulacao.renderizarTela(fluxo, 'cadastro.html', sim, { modo: 'tela', app: fluxo.id, simulacoes: {} });
    var posAmbiente = html.indexOf('/__testin/plataforma/ambiente.js'), posScript = html.indexOf('cadastro.js');
    conferir(posAmbiente > 0 && posAmbiente < posScript, 'o ambiente da plataforma é injetado ANTES do primeiro script da tela');
    conferir(/name="ATIVIDADE"[^>]*value="4"/.test(html) && /name="SOLICITANTE"[^>]*value="ana\.teste"/.test(html),
        'displayFields roda no servidor e o setValue chega NO HTML (etapa e login simulados)', html.substring(0, 600));
    conferir(/<textarea name="obs">texto &lt;b&gt;inicial&lt;\/b&gt;<\/textarea>/.test(html), 'setValue em textarea, com o texto escapado');
    conferir(/<select name="tipo"[^>]*disabled/.test(html) && /id="blocoSecreto"[^>]*display:none/.test(html),
        'setEnabled(false) bloqueia e setVisibleById(false) esconde');
    conferir(/window\.__extra = 1/.test(html), 'customHTML.append entra na página');
    conferir(/form\.metodoQueNaoExiste\(\) não é simulado/.test(html),
        'método desconhecido do form vira AVISO (e não derruba o evento)');

    var ev = emulacao.executarEvento(fluxo, 'validateForm', sim, { valor: '' });
    conferir(ev.erro === 'Informe o valor.', 'validateForm reprova com a mensagem da tela (o "throw")', JSON.stringify(ev));
    ev = emulacao.executarEvento(fluxo, 'validateForm', sim, { valor: '150' });
    conferir(ev.erro === 'Acima do limite de 100', 'e consulta a fonte de dados SIMULADA de dentro do evento', JSON.stringify(ev));
    ev = emulacao.executarEvento(fluxo, 'validateForm', sim, { valor: '50' });
    conferir(!ev.erro, 'valor válido passa', JSON.stringify(ev));

    var t = emulacao.renderizarModelo('<#-- x -->A${instanceId}|${nome!"sem"}|<#if a>1<#elseif b>2<#else>3</#if>|' +
        '<#list itens as i>[${i}]</#list>|${i18n.getTranslation("t")}|${naoExiste}|<#if a><#if b>AB</#if>A</#if>|${x?y}',
        { instanceId: '7', a: true, b: false, itens: ['p', 'q'] }, { t: 'Texto' });
    conferir(t === 'A7|sem|1|[p][q]|Texto||A|', 'o mini-interpretador de modelo: valor, padrão, if/elseif/else aninhado, list e i18n', JSON.stringify(t));

    var modulo = apps.modulo;
    var pagina = emulacao.renderizarModulo(modulo, { modo: 'modulo', simulacoes: {} });
    conferir(/id="painelX_1001"/.test(pagina) && /Olá mundo/.test(pagina) && />\s*sim\s*</.test(pagina) &&
             pagina.indexOf('<#') < 0 && pagina.indexOf('${') < 0,
        'o módulo sai com o modelo renderizado: instância, textos do .properties, sem sobrar diretiva', pagina.substring(0, 400));
    conferir(pagina.indexOf('/resources/js/a.js') < pagina.indexOf('/resources/js/b.js') &&
             pagina.indexOf('jquery.js') < pagina.indexOf('/resources/js/a.js'),
        'o jQuery vem antes, e os scripts do módulo na ordem do application.info');

    /* ====================================================================== */
    console.log('\n--- 2b. O AMBIENTE WEB (web.js) ---');
    var WEBJS = fs.readFileSync(path.join(RAIZ_APP, 'web', 'plataforma', 'web.js'), 'utf8');
    function memoria() {
        var d = {};
        return {
            getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); },
            removeItem: function (k) { delete d[k]; }, key: function (i) { return Object.keys(d)[i] || null; },
            clear: function () { d = {}; }, get length() { return Object.keys(d).length; }, _d: function () { return d; }
        };
    }
    function ambienteWeb(web, local) {
        var saiu = [], avisos = [], ctxMotor = { chamadas: [] };
        var j = {
            location: new URL('http://127.0.0.1:7041/dashboard'), __testin: { web: web },
            fetch: function (e) { saiu.push(e && e.url ? e.url : String(e)); return Promise.resolve(new Response('real', { status: 200 })); },
            Request: Request, Response: Response, URL: URL, URLSearchParams: URLSearchParams, Promise: Promise, TypeError: TypeError,
            setTimeout: setTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
            localStorage: local || memoria(), sessionStorage: memoria(), navigator: {},
            console: { warn: function (m) { avisos.push(m); }, error: function () {} }, addEventListener: function () {},
            __delpTesteCtx: ctxMotor
        };
        j.window = j;
        vm.createContext(j);
        vm.runInContext(WEBJS, j);
        return { j: j, saiu: saiu, avisos: avisos, chamadas: ctxMotor.chamadas };
    }
    var aw = ambienteWeb({ caso: 1, http: [
        { nome: 'login', metodo: 'POST', url: '/auth/v1/token*', quando: { grant_type: 'password' }, status: 400,
          json: { error: 'invalid_grant', email: '{{email}}' } },
        { url: 'https://api.exemplo.com/*', erroDeRede: true }
    ], rede: { permitir: ['https://api.liberada.com/*'] } });
    var resp = await aw.j.fetch('https://abc.supabase.co/auth/v1/token?grant_type=password',
        { method: 'POST', body: JSON.stringify({ email: 'ana@exemplo.com', password: 'x' }) });
    var corpoResp = await resp.json();
    conferir(resp.status === 400 && corpoResp.error === 'invalid_grant' && corpoResp.email === 'ana@exemplo.com' &&
             aw.saiu.every(function (u) { return u.indexOf('supabase') < 0; }),
        'a regra de simulacoes.http responde (status, JSON, "{{email}}" ecoa o corpo) e a chamada NÃO sai para a rede', JSON.stringify(corpoResp));
    conferir(aw.chamadas.some(function (c) { return c.dataset === 'login' && c.filtros.some(function (f) { return f.campo === 'grant_type' && f.valor === 'password'; }); }),
        'a chamada entra no caso com o nome da regra e os filtros, para o "Conferir chamada"', JSON.stringify(aw.chamadas));
    var bloqueou = '';
    await aw.j.fetch('https://abc.supabase.co/rest/v1/usuarios?id=eq.5').catch(function (e) { bloqueou = e.message; });
    conferir(/bloqueado pelo Test_in/.test(bloqueou) && aw.saiu.indexOf('/__testin/pedido') >= 0 &&
             aw.saiu.every(function (u) { return u.indexOf('rest/v1') < 0; }),
        'chamada para FORA sem simulação é BLOQUEADA (falha como sem rede) e vai para o resultado', bloqueou + ' | ' + aw.saiu.join(', '));
    conferir(aw.chamadas.some(function (c) { return c.dataset === 'rest.v1.usuarios'; }), 'sem nome na regra, a chamada leva o caminho com pontos (rest.v1.usuarios)');
    var falhouRede = '';
    await aw.j.fetch('https://api.exemplo.com/v2/x').catch(function (e) { falhouRede = e.message; });
    conferir(/falha de rede simulada/.test(falhouRede), '"erroDeRede" simula a falha de conexão', falhouRede);
    await aw.j.fetch('https://api.liberada.com/status');
    await aw.j.fetch('http://127.0.0.1:7041/config.json');
    conferir(aw.saiu.indexOf('https://api.liberada.com/status') >= 0 && aw.saiu.indexOf('http://127.0.0.1:7041/config.json') >= 0,
        'o endereço liberado em "rede.permitir" e o do próprio Test_in seguem de verdade', aw.saiu.join(', '));

    var local = memoria();
    local.setItem('sb-sessao-velha', 'x');
    local.setItem('testin-tema', 'escuro');
    ambienteWeb({ caso: 7, armazenamento: { local: { 'sb-token': { access_token: 'simulado' } } } }, local);
    conferir(local.getItem('sb-sessao-velha') === null && local.getItem('testin-tema') === 'escuro' &&
             JSON.parse(local.getItem('sb-token')).access_token === 'simulado',
        'no começo do caso, o armazenamento da aplicação é limpo (menos o do Test_in) e recebe o simulado', JSON.stringify(local._d()));
    local.setItem('gravado-no-caso', '1');
    ambienteWeb({ caso: 7, armazenamento: {} }, local);
    conferir(local.getItem('gravado-no-caso') === '1', 'dentro do MESMO caso (outra página), o armazenamento não é limpo de novo');

    /* ====================================================================== */
    console.log('\n--- 3. AS TRAVAS DO SERVIDOR ---');
    config.gravar({ pastas: [REPOS] });
    var token = config.tokenDoUsuario();
    var srv = servidor.criar(token);
    srv.redescobrir();
    await new Promise(function (ok) { srv.listen(0, '127.0.0.1', ok); });
    var porta = srv.address().port;

    function pedir(metodo, caminho, op) {
        op = op || {};
        return new Promise(function (ok) {
            var req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho,
                headers: Object.assign({ Host: '127.0.0.1:' + porta }, op.headers || {}) }, function (res) {
                var b = '';
                res.on('data', function (d) { b += d; });
                res.on('end', function () { ok({ status: res.statusCode, corpo: b, headers: res.headers }); });
            });
            if (op.corpo) req.write(JSON.stringify(op.corpo));
            req.end();
        });
    }
    var comToken = { headers: { 'x-testin-token': token } };

    var x = await pedir('GET', '/');
    conferir(x.status === 302 && x.headers.location === '/__testin/', 'sem aplicação web aberta, a raiz leva à interface (/__testin/)', x.status + ' ' + x.headers.location);
    x = await pedir('GET', '/?t=' + token);
    conferir(x.status === 302 && x.headers.location === '/__testin/?t=' + token, 'o endereço antigo, com o token, continua chegando na interface');
    x = await pedir('GET', '/__testin/');
    conferir(x.status === 401, 'a interface sem o token não abre');
    x = await pedir('GET', '/__testin/?t=' + token);
    conferir(x.status === 200 && /HttpOnly/.test(String(x.headers['set-cookie'])) && /SameSite=Strict/.test(String(x.headers['set-cookie'])),
        'com o token, abre e planta o cookie HttpOnly');
    x = await pedir('GET', '/__testin/api/repositorios');
    conferir(x.status === 401, 'a API sem o token é recusada');
    x = await pedir('GET', '/__testin/api/repositorios', { headers: { 'x-testin-token': token, Host: 'site-malicioso.com' } });
    conferir(x.status === 403, 'Host de fora (DNS rebinding) é recusado, mesmo com o token');
    x = await pedir('GET', '/__testin/api/repositorios', comToken);
    conferir(x.status === 200 && JSON.parse(x.corpo).dados.length >= 1, 'com o token, a API responde');

    var idFluxo = srv.estado.repos.map(function (rr) { return rr.aplicacoes; })
        .reduce(function (a, b) { return a.concat(b); }, []).filter(function (a) { return a.tipo === 'fluxo'; })[0].id;
    x = await pedir('GET', '/__app/' + idFluxo + '/../../segredo.txt', comToken);
    conferir(x.status !== 200 && !/nao pode sair/.test(x.corpo), '".." no caminho da aplicação não sai da pasta dela', x.status + ' ' + x.corpo);
    x = await pedir('GET', '/__app/' + idFluxo + '/%2e%2e/%2e%2e/segredo.txt', comToken);
    conferir(x.status !== 200 && !/nao pode sair/.test(x.corpo), 'nem com o ".." codificado (%2e%2e): não sai da pasta', x.status + ' ' + x.corpo);
    x = await pedir('GET', '/__app/' + idFluxo + '/cadastro.html');
    conferir(x.status === 401, 'os arquivos das aplicações também exigem o token');
    x = await pedir('GET', '/__app/' + idFluxo + '/cadastro.html', comToken);
    conferir(x.status === 200 && /ambiente\.js/.test(x.corpo) && /frame-ancestors 'self'/.test(String(x.headers['content-security-policy'])),
        'a tela sai com a emulação e só pode ser embutida pela própria Test_in');

    await pedir('POST', '/__testin/api/simulacoes', { headers: { 'x-testin-token': token, 'Content-Type': 'application/json' }, corpo: { simulacoes: sim } });
    x = await pedir('POST', '/__testin/dados', { headers: { 'x-testin-token': token }, corpo: { nome: 'dsLimite', restricoes: [{ campo: 'TIPO', valor: 'A', tipo: 1 }] } });
    conferir(JSON.parse(x.corpo).values[0].LIMITE === '100', 'a consulta da tela recebe a simulação do caso', x.corpo);
    x = await pedir('POST', '/api/public/ecm/dataset/datasets', { headers: { 'x-testin-token': token }, corpo: { name: 'dsLimite', constraints: [{ _field: 'TIPO', _initialValue: 'A', _type: 1 }] } });
    conferir(x.status === 200 && JSON.parse(x.corpo).content.values[0].LIMITE === '100', 'o serviço REST de dados responde pela mesma simulação', x.corpo);
    x = await pedir('POST', '/api/public/ecm/dataset/datasets', { headers: { 'x-testin-token': token }, corpo: { name: 'dsX', constraints: [{ _field: 'TIPO', _initialValue: 'B', _type: 1 }] } });
    conferir(x.status === 500 && JSON.parse(x.corpo).message === 'falha simulada', 'pelo REST, a regra "erro" também FALHA a consulta (HTTP 500), e não volta vazia', x.status + ' ' + x.corpo);
    x = await pedir('POST', '/__testin/evento', { headers: { 'x-testin-token': token }, corpo: { app: idFluxo, evento: 'validateForm', valores: {} } });
    conferir(JSON.parse(x.corpo).erro === 'Informe o valor.', 'o Enviar da casca roda o validateForm no servidor', x.corpo);
    x = await pedir('GET', '/__testin/api/versao', comToken);
    conferir(x.status === 200 && JSON.parse(x.corpo).dados.desatualizada === false, 'recém-aberta, o Test_in não se diz desatualizada (o aviso só aparece se o código do servidor mudar depois)', x.corpo);
    x = await pedir('GET', '/webdesk/vcXMLRPC.js');
    conferir(x.status === 200, 'os endereços da plataforma respondem (emulados), mesmo sem token');
    x = await pedir('GET', '/portal/api/algo-desconhecido');
    var ped = await pedir('GET', '/__testin/api/pedidos', comToken);
    conferir(x.status === 404 && /algo-desconhecido/.test(ped.corpo), 'endereço da plataforma sem emulação é 404 e fica registrado para a pessoa ver');

    /* a aplicacao web na raiz */
    var distId = srv.estado.repos.map(function (rr) { return rr.aplicacoes; }).reduce(function (a, b) { return a.concat(b); }, [])
        .filter(function (a) { return a.caminho === path.resolve(SPA, 'dist'); })[0].id;
    x = await pedir('GET', '/__testin/tela/' + distId, comToken);
    conferir(x.status === 302 && x.headers.location === '/', 'abrir a aplicação web a põe na RAIZ do endereço, como no servidor dela', x.status + ' ' + x.headers.location);
    x = await pedir('GET', '/', comToken);
    var posWeb = x.corpo.indexOf('/__testin/plataforma/web.js');
    conferir(x.status === 200 && posWeb > 0 && posWeb < x.corpo.indexOf('/assets/app-1.js') && /"caso":\d+/.test(x.corpo),
        'a raiz serve a aplicação, com o ambiente web ANTES do primeiro script dela', x.corpo.substring(0, 300));
    x = await pedir('GET', '/assets/app-1.js', comToken);
    conferir(x.status === 200 && /__spa/.test(x.corpo), 'o /assets/... do build é achado (era a tela em branco)');
    x = await pedir('GET', '/assets/app-1.js');
    conferir(x.status === 401, 'os arquivos da aplicação na raiz também exigem o token');
    x = await pedir('GET', '/dashboard/financeiro', { headers: { 'x-testin-token': token, Accept: 'text/html' } });
    conferir(x.status === 200 && /Painel SPA/.test(x.corpo) && /web\.js/.test(x.corpo),
        'rota da aplicação (/dashboard/financeiro) recebe a página principal: o roteador dela decide');
    x = await pedir('GET', '/assets/nao-existe.js', comToken);
    conferir(x.status === 404, 'arquivo que falta é 404 de verdade (não a página)');
    x = await pedir('GET', '/%2e%2e/%2e%2e/app-cadastro/segredo.txt', comToken);
    conferir(x.status !== 200 && !/nao pode sair/.test(x.corpo), 'na raiz, também não se sai da pasta da aplicação', x.status + ' ' + x.corpo);
    x = await pedir('GET', '/__testin/tela/' + distId + '?pagina=' + encodeURIComponent('//site-malicioso.com/x'), comToken);
    conferir(x.status === 302 && /^\/[^/\\]/.test(x.headers.location), '"?pagina=//outro-site" não vira redirecionamento para fora', x.headers.location);
    x = await pedir('GET', '/?t=' + token);
    conferir(x.status === 302 && /^\/__testin\//.test(x.headers.location), 'com a aplicação aberta, o endereço do terminal (com ?t=) ainda leva à interface');
    await pedir('POST', '/__testin/pedido', { headers: { 'x-testin-token': token }, corpo: { nome: 'rest.v1.usuarios', metodo: 'get', url: 'https://abc.supabase.co/rest/v1/usuarios', filtros: [{ campo: 'id', valor: 'eq.5' }] } });
    ped = await pedir('GET', '/__testin/api/pedidos', comToken);
    conferir(JSON.parse(ped.corpo).dados.pedidos.some(function (p2) { return p2.via === 'rede' && p2.metodo === 'GET' && p2.nome === 'rest.v1.usuarios'; }),
        'a chamada bloqueada pela aplicação web fica registrada para o resultado');
    await pedir('GET', '/__testin/tela/' + idFluxo, comToken);
    x = await pedir('GET', '/');
    conferir(x.status === 302 && x.headers.location === '/__testin/', 'abrir uma tela de fluxo tira a aplicação web da raiz');
    srv.close();

    /* ====================================================================== */
    console.log('\n--- 4. O RELATÓRIO ---');
    var caixa = { window: {} };
    vm.createContext(caixa);
    vm.runInContext(fs.readFileSync(path.join(RAIZ_APP, 'web', 'relatorio.js'), 'utf8'), caixa);
    var rel = caixa.window.TestinRelatorio.gerar({
        inicio: '2026-09-26T10:00:00', duracaoMs: 5400, situacao: 'CONCLUIDA',
        casos: [
            { codigo: 'a1', nome: 'Caso <script>alert(1)</script>', status: 'APROVADO', duracaoMs: 1200, passos: [{ n: 1, descricao: 'x', status: 'OK' }] },
            { codigo: 'a2', nome: 'Falha', status: 'REPROVADO', duracaoMs: 4200, passos: [{ n: 1, descricao: 'y', status: 'FALHOU', erro: 'Esperado "1", encontrado "2"' }],
              errosConsole: ['TypeError: x'], chamadas: [{ dataset: 'dsX', filtros: [{ campo: 'A', valor: '1' }] }] }
        ]
    }, { aplicacao: { titulo: 'App', tipo: 'Tela de fluxo' }, script: 's.json', semSimulacao: [{ nome: 'dsY', filtros: [{ campo: 'B', valor: '2' }], via: 'tela' }] });
    conferir(/<svg/.test(rel) && /50%/.test(rel) && /Esperado &quot;1&quot;, encontrado &quot;2&quot;/.test(rel),
        'indicadores, gráficos em SVG e o detalhe da falha', rel.length + ' caracteres');
    conferir(rel.indexOf('<script') < 0, 'nome de caso com <script> sai escapado: o relatório não executa nada');
    conferir(!/(src|href)="https?:/.test(rel), 'autocontido: nada carregado de fora (abre sem internet)');
    conferir(/dsY/.test(rel) && /&quot;quando&quot;/.test(rel), 'traz o modelo de simulação para as fontes que ficaram sem');

    /* ====================================================================== */
    console.log('\n--- 5. O MOTOR E A LINGUAGEM ---');
    var MOTOR_PAINEL = path.join(RAIZ_REPO, 'wcm', 'widget', 'devToolsKit', 'src', 'main', 'webapp', 'resources', 'js', 'motorTestes.js');
    if (fs.existsSync(MOTOR_PAINEL)) {
        conferir(fs.readFileSync(MOTOR_PAINEL, 'utf8') === fs.readFileSync(path.join(RAIZ_APP, 'web', 'motor.js'), 'utf8'),
            'o motor do Test_in é IDÊNTICO ao do painel (rode "node sincronizar-motor.js" depois de mexer nele)');
    }
    var interface_ = ['web/index.html', 'web/app.js', 'web/app.css', 'web/relatorio.js'];
    var citacoes = [];
    interface_.forEach(function (arq) {
        var txt = fs.readFileSync(path.join(RAIZ_APP, arq), 'utf8');
        /* chaves de objeto (formulario:, widget:) sao identificadores do
           mapa de termos - ninguem as le na tela. */
        var re = /(fluig|delp|widget|formul[aá]rio)(?!\w*\s*:)/gi, m;
        while ((m = re.exec(txt)) !== null) citacoes.push(arq + ': "' + txt.substring(Math.max(0, m.index - 25), m.index + 25).replace(/\s+/g, ' ') + '"');
    });
    conferir(!citacoes.length, 'a interface do Test_in não cita a plataforma, a empresa, "widget" nem "formulário"', citacoes.slice(0, 5).join('\n         '));

    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* paciencia */ }
    console.log('');
    console.log(falhas ? ('===== ' + falhas + ' FALHAS =====') : '===== todos passaram =====');
    process.exit(falhas ? 1 : 0);
}

principal().catch(function (e) { console.log('FALHA  o teste quebrou: ' + (e && e.stack || e)); process.exit(1); });
