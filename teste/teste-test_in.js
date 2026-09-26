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
    conferir(x.status === 401, 'a interface sem o token não abre');
    x = await pedir('GET', '/?t=' + token);
    conferir(x.status === 200 && /HttpOnly/.test(String(x.headers['set-cookie'])) && /SameSite=Strict/.test(String(x.headers['set-cookie'])),
        'com o token, abre e planta o cookie HttpOnly');
    x = await pedir('GET', '/api/repositorios');
    conferir(x.status === 401, 'a API sem o token é recusada');
    x = await pedir('GET', '/api/repositorios', { headers: { 'x-testin-token': token, Host: 'site-malicioso.com' } });
    conferir(x.status === 403, 'Host de fora (DNS rebinding) é recusado, mesmo com o token');
    x = await pedir('GET', '/api/repositorios', comToken);
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

    await pedir('POST', '/api/simulacoes', { headers: { 'x-testin-token': token, 'Content-Type': 'application/json' }, corpo: { simulacoes: sim } });
    x = await pedir('POST', '/__testin/dados', { headers: { 'x-testin-token': token }, corpo: { nome: 'dsLimite', restricoes: [{ campo: 'TIPO', valor: 'A', tipo: 1 }] } });
    conferir(JSON.parse(x.corpo).values[0].LIMITE === '100', 'a consulta da tela recebe a simulação do caso', x.corpo);
    x = await pedir('POST', '/api/public/ecm/dataset/datasets', { headers: { 'x-testin-token': token }, corpo: { name: 'dsLimite', constraints: [{ _field: 'TIPO', _initialValue: 'A', _type: 1 }] } });
    conferir(x.status === 200 && JSON.parse(x.corpo).content.values[0].LIMITE === '100', 'o serviço REST de dados responde pela mesma simulação', x.corpo);
    x = await pedir('POST', '/api/public/ecm/dataset/datasets', { headers: { 'x-testin-token': token }, corpo: { name: 'dsX', constraints: [{ _field: 'TIPO', _initialValue: 'B', _type: 1 }] } });
    conferir(x.status === 500 && JSON.parse(x.corpo).message === 'falha simulada', 'pelo REST, a regra "erro" também FALHA a consulta (HTTP 500), e não volta vazia', x.status + ' ' + x.corpo);
    x = await pedir('POST', '/__testin/evento', { headers: { 'x-testin-token': token }, corpo: { app: idFluxo, evento: 'validateForm', valores: {} } });
    conferir(JSON.parse(x.corpo).erro === 'Informe o valor.', 'o Enviar da casca roda o validateForm no servidor', x.corpo);
    x = await pedir('GET', '/api/versao', comToken);
    conferir(x.status === 200 && JSON.parse(x.corpo).dados.desatualizada === false, 'recém-aberta, o Test_in não se diz desatualizada (o aviso só aparece se o código do servidor mudar depois)', x.corpo);
    x = await pedir('GET', '/webdesk/vcXMLRPC.js');
    conferir(x.status === 200, 'os endereços da plataforma respondem (emulados), mesmo sem token');
    x = await pedir('GET', '/portal/api/algo-desconhecido');
    var ped = await pedir('GET', '/api/pedidos', comToken);
    conferir(x.status === 404 && /algo-desconhecido/.test(ped.corpo), 'endereço da plataforma sem emulação é 404 e fica registrado para a pessoa ver');
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
