/* ============================================================================
   sincronizar-motor.js - traz o motor de testes para o Test_in
   ============================================================================
   O motor que roda os passos e UM so: o mesmo arquivo roda dentro do painel
   da plataforma e aqui. O Test_in leva uma COPIA (web/motor.js) porque ela
   precisa funcionar sozinha, numa pasta separada.

   Rode depois de mexer no motor:

       node sincronizar-motor.js

   O teste do Test_in falha se as duas copias divergirem - e a copia velha
   que aparece rodando no dia seguinte e o defeito mais dificil de achar.
============================================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var ORIGEM = path.join(__dirname, '..', '..', 'wcm', 'widget', 'devToolsKit', 'src', 'main', 'webapp', 'resources', 'js', 'motorTestes.js');
var DESTINO = path.join(__dirname, 'web', 'motor.js');

if (!fs.existsSync(ORIGEM)) {
    console.error('Não achei o motor em ' + ORIGEM + '. Rode este script dentro do repositório completo.');
    process.exit(1);
}
fs.copyFileSync(ORIGEM, DESTINO);
console.log('motor sincronizado: ' + path.relative(process.cwd(), DESTINO));
