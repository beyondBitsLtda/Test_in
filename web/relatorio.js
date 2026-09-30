/* ============================================================================
   relatorio.js - o relatorio HTML da rodada, num arquivo so
   ============================================================================
   Sai como UM .html autocontido: estilos e graficos (SVG) dentro dele, sem
   nada de fora. Abre em qualquer navegador, sem internet, e pode ser anexado
   a um e-mail ou chamado do jeito que esta.

   Claro e pronto para imprimir, com a identidade do Test_in: a faixa
   laranja do cartao de embarque e as placas de situacao. As cores sao as da
   paleta; vermelho so para o que falhou.
============================================================================ */
(function (global) {
    'use strict';

    var COR = { APROVADO: '#0B861D', REPROVADO: '#CC0F10', INTERROMPIDO: '#FF6B05', NAO_EXECUTADO: '#B0B0B0' };
    var ROTULO = { APROVADO: 'Aprovado', REPROVADO: 'Reprovado', INTERROMPIDO: 'Interrompido', NAO_EXECUTADO: 'Não executado' };
    var MARCA = { OK: '✓', FALHOU: '✗', PULADO: '–' };

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function dur(ms) {
        ms = Number(ms) || 0;
        if (ms < 1000) return ms + ' ms';
        var s = Math.round(ms / 100) / 10;
        return s < 60 ? s.toString().replace('.', ',') + ' s' : Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
    }

    /* O MODELO para colar em "simulacoes": as fontes consultadas sem regra e
       as chamadas de rede que a aplicacao web fez e foram bloqueadas. As
       liberadas (simulacoes.rede.permitir) nao entram: sairam de proposito. */
    function modeloDeSimulacao(pedidos) {
        var modelo = {}, fontes = {}, http = [];
        (pedidos || []).forEach(function (p) {
            if (p.via === 'http' || p.liberada) return;
            if (p.via === 'rede') {
                var r = { nome: p.nome, metodo: p.metodo || undefined, url: (p.url || '') + '*', status: 200, json: {} };
                if (p.metodo === 'WS') { delete r.metodo; r.url = p.url; delete r.status; delete r.json; }
                http.push(r);
                return;
            }
            var q = {};
            (p.filtros || []).forEach(function (f) { q[f.campo] = f.valor; });
            fontes[p.nome] = [{ quando: q, linhas: [] }];
        });
        if (Object.keys(fontes).length) modelo.fontes = fontes;
        if (http.length) modelo.http = http;
        return modelo;
    }

    /* Rosca da situacao dos casos. */
    function rosca(contagem, total) {
        var r = 54, c = 2 * Math.PI * r, ang = 0, fatias = '';
        ['APROVADO', 'REPROVADO', 'INTERROMPIDO', 'NAO_EXECUTADO'].forEach(function (k) {
            var n = contagem[k] || 0;
            if (!n) return;
            var parte = n / total * c;
            fatias += '<circle r="' + r + '" cx="70" cy="70" fill="none" stroke="' + COR[k] + '" stroke-width="22" ' +
                'stroke-dasharray="' + parte.toFixed(2) + ' ' + (c - parte).toFixed(2) + '" stroke-dashoffset="' + (-ang).toFixed(2) + '" ' +
                'transform="rotate(-90 70 70)"><title>' + ROTULO[k] + ': ' + n + '</title></circle>';
            ang += parte;
        });
        var taxa = total ? Math.round((contagem.APROVADO || 0) / total * 100) : 0;
        return '<svg viewBox="0 0 140 140" width="160" height="160" role="img" aria-label="Situação dos casos">' +
            '<circle r="' + r + '" cx="70" cy="70" fill="none" stroke="#EAE5DF" stroke-width="22"/>' + fatias +
            '<text x="70" y="68" text-anchor="middle" class="rosca__num">' + taxa + '%</text>' +
            '<text x="70" y="86" text-anchor="middle" class="rosca__rot">aprovados</text></svg>';
    }

    /* Barras de duracao por caso, na cor da situacao. */
    function barras(casos) {
        if (!casos.length) return '';
        var max = Math.max.apply(null, casos.map(function (c) { return c.duracaoMs || 0; })) || 1;
        var alt = 26, largura = 640, rot = 170, h = casos.length * alt + 8;
        var linhas = casos.map(function (c, i) {
            var w = Math.max(2, Math.round((c.duracaoMs || 0) / max * (largura - rot - 70)));
            var y = i * alt + 4;
            return '<text x="0" y="' + (y + 16) + '" class="barra__rot">' + esc(c.codigo) + '</text>' +
                '<rect x="' + rot + '" y="' + (y + 4) + '" width="' + w + '" height="16" rx="3" fill="' + COR[c.status] + '">' +
                '<title>' + esc(c.nome) + ': ' + dur(c.duracaoMs) + '</title></rect>' +
                '<text x="' + (rot + w + 6) + '" y="' + (y + 16) + '" class="barra__val">' + dur(c.duracaoMs) + '</text>';
        }).join('');
        return '<svg viewBox="0 0 ' + largura + ' ' + h + '" width="100%" height="' + h + '" role="img" aria-label="Duração por caso">' + linhas + '</svg>';
    }

    function listaItens(titulo, itens) {
        if (!itens || !itens.length) return '';
        return '<div class="sub">' + esc(titulo) + '</div><ul class="itens">' +
            itens.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    }

    function caso(c) {
        var passos = (c.passos || []).map(function (p) {
            return '<tr class="p--' + p.status + '"><td class="p__marca">' + (MARCA[p.status] || '·') + '</td><td>' + esc(p.descricao) +
                (p.nota ? ' <span class="nota">· ' + esc(p.nota) + '</span>' : '') +
                (p.erro ? '<div class="erro">' + esc(p.erro) + '</div>' : '') + '</td><td class="num">' + (p.duracaoMs ? dur(p.duracaoMs) : '') + '</td></tr>';
        }).join('');
        var retrato = '';
        if (c.retrato && c.retrato.campos && c.retrato.campos.length) {
            retrato = '<details><summary>Campos da tela quando falhou (' + c.retrato.campos.length + ')</summary><table class="campos">' +
                c.retrato.campos.map(function (f) {
                    return '<tr><td class="mono">' + esc(f.nome) + '</td><td>' + esc(f.valor) + '</td><td class="fraco">' +
                        (f.visivel ? 'visível' : 'oculto') + (f.bloqueado ? ' · bloqueado' : '') + '</td></tr>';
                }).join('') + '</table></details>' + listaItens('Mensagens visíveis', c.retrato.mensagens);
        }
        var chamadas = (c.chamadas || []).map(function (ch) {
            return ch.dataset + (ch.filtros && ch.filtros.length ? '  (' + ch.filtros.map(function (f) { return f.campo + '=' + f.valor; }).join(', ') + ')' : '');
        });
        return '<section class="caso caso--' + c.status + '"><header><span class="selo" style="background:' + COR[c.status] + '">' +
            ROTULO[c.status] + '</span><span class="mono">' + esc(c.codigo) + '</span><h3>' + esc(c.nome) + '</h3><span class="fraco">' + dur(c.duracaoMs) +
            '</span></header><table class="passos">' + passos + '</table>' +
            listaItens('Erros de JavaScript', c.errosConsole) + listaItens('Alertas', c.alertas) +
            listaItens('Notificações', c.notificacoes) + listaItens('Chamadas de dados', chamadas) + retrato + '</section>';
    }

    function gerar(res, meta) {
        meta = meta || {};
        var casos = res.casos || [];
        var contagem = {};
        casos.forEach(function (c) { contagem[c.status] = (contagem[c.status] || 0) + 1; });
        var total = casos.length;
        var erros = casos.reduce(function (s, c) { return s + (c.errosConsole || []).length; }, 0);
        var sem = (meta.semSimulacao || []).filter(function (p) { return p.via !== 'http' && !p.liberada; });
        var app = meta.aplicacao || {};
        var taxa = total ? Math.round((contagem.APROVADO || 0) / total * 100) : 0;

        var kpis = [
            ['Casos', total, ''], ['Aprovados', contagem.APROVADO || 0, 'ok'], ['Reprovados', contagem.REPROVADO || 0, (contagem.REPROVADO ? 'erro' : '')],
            ['Não executados', (contagem.NAO_EXECUTADO || 0) + (contagem.INTERROMPIDO || 0), ''], ['Aprovação', taxa + '%', taxa === 100 ? 'ok' : ''],
            ['Duração', dur(res.duracaoMs), ''], ['Erros de JS', erros, erros ? 'alerta' : ''], ['Consultas sem simulação', sem.length, sem.length ? 'alerta' : '']
        ].map(function (k) {
            return '<div class="kpi' + (k[2] ? ' kpi--' + k[2] : '') + '"><div class="kpi__rot">' + k[0] + '</div><div class="kpi__val">' + esc(k[1]) + '</div></div>';
        }).join('');

        var legenda = ['APROVADO', 'REPROVADO', 'INTERROMPIDO', 'NAO_EXECUTADO'].filter(function (k) { return contagem[k]; })
            .map(function (k) { return '<li><span style="background:' + COR[k] + '"></span>' + ROTULO[k] + ': ' + contagem[k] + '</li>'; }).join('');

        var sims = meta.simulacoes || {};
        var fontes = Object.keys(sims.fontes || {}).concat((Array.isArray(sims.http) ? sims.http : []).map(function (r) {
            return (r && r.nome) || String((r && r.metodo) || '') + ' ' + String((r && r.url) || '');
        }));

        var css = [
            ':root{--txt:#000000;--fraco:#555555;--linha:#EAE5DF;--laranja:#FF6B05}',
            '*{box-sizing:border-box}body{margin:0;font-family:Barlow,Inter,system-ui,-apple-system,sans-serif;color:var(--txt);background:#FFFFFF}',
            '.pagina{max-width:1100px;margin:0 auto;padding:32px 24px 56px}',
            '.cab{border-bottom:4px solid var(--laranja);padding-bottom:16px;margin-bottom:24px}',
            '.marca{display:inline-block;background:#000000;color:#FFFFFF;font-weight:700;font-size:15px;padding:3px 10px;border-radius:5px;margin-bottom:10px}.marca i{color:var(--laranja);font-style:normal}',
            '.cab__rot{font-family:Consolas,monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#000000;font-weight:700}',
            'h1{margin:4px 0;font-size:28px}h2{font-size:18px;margin:28px 0 12px}h3{margin:0;font-size:15px;flex:1 1 auto}',
            '.meta{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:13px;color:var(--fraco)}.meta b{color:var(--txt)}',
            '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}@media (max-width:700px){.kpis{grid-template-columns:repeat(2,1fr)}}',
            '.kpi{border:1px solid var(--linha);border-top:4px solid #B0B0B0;border-radius:8px;padding:12px}.kpi--ok{border-top-color:#0B861D}.kpi--erro{border-top-color:#CC0F10}.kpi--alerta{border-top-color:#FF6B05}.kpi__rot{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fraco)}',
            '.kpi__val{font-size:26px;font-weight:700;margin-top:2px}.kpi--ok .kpi__val{color:#0B861D}.kpi--erro .kpi__val{color:#CC0F10}.kpi--alerta .kpi__val{color:#B34A00}',
            '.graficos{display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:center;border:1px solid var(--linha);border-radius:8px;padding:16px;margin-top:14px}',
            '.rosca__num{font-size:26px;font-weight:700;fill:#000000}.rosca__rot{font-size:11px;fill:#555555}',
            '.legenda{list-style:none;padding:0;margin:8px 0 0;font-size:13px}.legenda li{display:flex;align-items:center;gap:6px;margin:3px 0}',
            '.legenda span{width:10px;height:10px;border-radius:2px;display:inline-block}',
            '.barra__rot{font-size:11px;font-family:Consolas,monospace;fill:#000000}.barra__val{font-size:11px;fill:#555555}',
            'table.resumo,table.passos,table.campos{width:100%;border-collapse:collapse;font-size:13px}',
            'table.resumo th,table.resumo td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--linha)}',
            '.caso{border:1px solid var(--linha);border-left:5px solid #B0B0B0;border-radius:8px;padding:12px 14px;margin:12px 0;page-break-inside:avoid}',
            '.caso--APROVADO{border-left-color:#0B861D}.caso--REPROVADO{border-left-color:#CC0F10}.caso--INTERROMPIDO{border-left-color:#FF6B05}',
            '.caso header{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}',
            '.selo{color:#FFFFFF;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;text-transform:uppercase}',
            'table.passos td{padding:3px 6px;vertical-align:top;border-bottom:1px solid #F4F1EC}.p__marca{width:18px;font-weight:700}',
            '.p--OK .p__marca{color:#0B861D}.p--FALHOU{font-weight:600}.p--FALHOU .p__marca{color:#CC0F10}.p--PULADO{color:#555555}',
            '.erro{margin-top:4px;padding:6px 10px;background:rgba(204,15,16,.08);border-radius:4px;color:#A60C0D}',
            '.num{text-align:right;white-space:nowrap;color:#555555}.nota,.fraco{color:#555555;font-size:12px}',
            '.mono{font-family:Consolas,monospace;font-size:12px}.sub{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#555555;margin:10px 0 4px}',
            '.itens{margin:0;padding-left:18px;font-family:Consolas,monospace;font-size:12px}details{margin-top:8px}summary{cursor:pointer;color:#000000;text-decoration:underline;text-decoration-color:var(--laranja)}',
            'table.campos td{padding:3px 6px;border-bottom:1px solid #F4F1EC}pre{background:#F4F1EC;padding:10px;border-radius:6px;overflow:auto;font-size:12px}',
            '.rodape{margin-top:40px;font-size:11px;color:#555555;border-top:1px solid var(--linha);padding-top:10px}',
            '@media print{.pagina{padding:0}details{display:block}}'
        ].join('\n');

        var resumo = '<table class="resumo"><thead><tr><th>Caso</th><th>Nome</th><th>Situação</th><th>Passos</th><th>Duração</th></tr></thead><tbody>' +
            casos.map(function (c) {
                var ok = (c.passos || []).filter(function (p) { return p.status === 'OK'; }).length;
                return '<tr><td class="mono">' + esc(c.codigo) + '</td><td>' + esc(c.nome) + '</td><td><span class="selo" style="background:' +
                    COR[c.status] + '">' + ROTULO[c.status] + '</span></td><td>' + ok + '/' + (c.passos || []).length + '</td><td>' + dur(c.duracaoMs) + '</td></tr>';
            }).join('') + '</tbody></table>';

        var semHtml = '';
        if (sem.length) {
            semHtml = '<h2>Consultas sem simulação</h2><p class="fraco">A tela consultou estas fontes (resposta vazia) ou tentou chamadas de rede ' +
                '(bloqueadas: teste não sai para servidores de verdade). Modelo para completar em "simulacoes" no arquivo de teste:</p><pre>' +
                esc(JSON.stringify(modeloDeSimulacao(sem), null, 2)) + '</pre>';
        }

        return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Relatório de testes · ' + esc(app.titulo || '') + '</title><style>' + css + '</style></head><body><div class="pagina">' +
            '<header class="cab"><div class="marca">Test<i>_in</i></div><div class="cab__rot">Relatório de testes de tela</div><h1>' + esc(app.titulo || 'Aplicação') + '</h1>' +
            '<div class="meta"><span><b>Arquitetura:</b> ' + esc(app.tipo || '—') + '</span><span><b>Local:</b> ' + esc(app.caminho || '—') + '</span>' +
            '<span><b>Script:</b> ' + esc(meta.script || '—') + '</span><span><b>Rodada:</b> ' + esc(res.inicio || '') + '</span>' +
            '<span><b>Situação:</b> ' + (res.situacao === 'INTERROMPIDA' ? 'interrompida' : 'concluída') + '</span></div></header>' +
            '<h2>Painel</h2><div class="kpis">' + kpis + '</div>' +
            '<div class="graficos"><div>' + rosca(contagem, total || 1) + '<ul class="legenda">' + legenda + '</ul></div>' +
            '<div><div class="sub">Duração por caso</div>' + barras(casos) + '</div></div>' +
            '<h2>Resumo</h2>' + resumo + semHtml +
            '<h2>Detalhe dos casos</h2>' + casos.map(caso).join('') +
            '<div class="rodape">Gerado em ' + esc(meta.geradoEm || new Date().toLocaleString('pt-BR')) + ' pelo Test_in. ' +
            'Dados simulados: ' + esc(fontes.length ? fontes.join(', ') : 'nenhuma fonte') + '. Navegador: ' + esc(meta.navegador || '') + '.</div>' +
            '</div></body></html>';
    }

    global.TestinRelatorio = { gerar: gerar, modeloDeSimulacao: modeloDeSimulacao };
}(typeof window !== 'undefined' ? window : this));
