# Test_in

*Check-in dos seus testes.*

Testes de tela automáticos nas aplicações dos seus repositórios, **no seu computador**, sem servidor. Você aponta a pasta dos repositórios, escolhe a aplicação e o script de teste, e o Test_in abre a tela, executa cada passo (preencher, escolher, clicar, conferir) e devolve o resultado na tela e num **relatório HTML**.

**Para abrir:** clique duas vezes em **`abrir-test_in.cmd`**. Para ter um atalho na Área de Trabalho, rode **`criar-atalho.cmd`** uma vez. Pelo terminal, é o mesmo que:

```bash
node app.js
```

```
Test_in 1.3.0
pastas configuradas: 1

Abra no navegador:
  http://127.0.0.1:7041/__testin/?t=4f1c...
```

O navegador abre sozinho. Fechar a janela do terminal encerra o Test_in. **Atualizou o Test_in com ele aberto?** Feche e abra de novo: a interface pega as mudanças sozinha, o servidor não. Quando isso acontece, uma faixa vermelha avisa no topo da tela.

**Nenhuma instalação:** só o Node (18 ou mais novo) e um navegador. Sem `npm install`. Se faltar o Node, peça pelo GLPI: não instale por conta própria.

---

## O que mudou em relação à Bancada de Testes

O Test_in é a nova versão da Bancada de Testes (versão avulsa), com **as mesmas funções** e outra cara. A Bancada continua em `estacao/bancada-testes`, intacta.

| | Bancada de Testes | Test_in |
|---|---|---|
| Pasta | `estacao/bancada-testes` | `estacao/test_in` |
| Endereço | `127.0.0.1:7031` | `127.0.0.1:7041` — **os dois rodam ao mesmo tempo** |
| Configuração | `%APPDATA%ancada-testes` | `%APPDATA%	est_in` — na 1ª abertura, **as pastas e a folha de estilos vêm da Bancada** |
| Cookie, cabeçalho e preferências | `bancada` | `testin` — um app não derruba o acesso do outro |
| Visual | escuro com azul | check-in de aeroporto, tema claro e escuro |

## A identidade: o check-in

"Test_in" soa como check-in, e a tela segue a ideia:

- **Aplicações:** cada uma é um **cartão de embarque**. O canhoto destacável traz o código da arquitetura, como os de aeroporto: **FLX** (tela de fluxo), **MOD** (módulo de página) e **WEB** (aplicação web). O repositório aparece como **TERMINAL**.
- **Rodada:** o andamento é um **painel de partidas**, preto e com letra monoespaçada. O caso aprovado ganha a placa **EMBARCADO**, e a barra de progresso leva um ✈ na ponta.
- **Resultado:** os indicadores são placas de número, e cada caso tem a faixa e a placa da sua situação.
- **Passo a passo:** o cartão do passo é desenhado como um cartão de embarque.
- **Relatório HTML:** continua claro e pronto para imprimir, com a marca e a faixa laranja.
- **Tema:** claro ou escuro. Sem escolha, segue o sistema; o botão ◐ no topo alterna.

As cores são as da paleta corporativa. O laranja Indústria é o destaque, sempre com texto preto por cima; o vermelho fica para o que falhou e o verde para o que passou.

---

## Como ele reconhece as aplicações

O Test_in **olha a estrutura da pasta** e reconhece a arquitetura. É a arquitetura que decide como a tela é servida e testada:

| Arquitetura | Como é reconhecida | Como abre |
|---|---|---|
| **Tela de fluxo** | `forms/<número> - <nome>/` com o `.html` (e, às vezes, `events/`) | Dentro de uma **casca** com o botão **Enviar**. Os eventos de servidor (`displayFields`, `enableFields`) rodam numa sandbox e o efeito deles chega ao HTML antes do primeiro script. O Enviar chama o `beforeSendValidate` da tela e o `validateForm` |
| **Módulo de página** | `<...>/src/main/resources/application.info` + `view.ftl` | O modelo é renderizado (instância, textos do `.properties`, `if`/`list`), os recursos entram **na ordem do `application.info`** e o ciclo de vida do módulo inicia (`init`, `bindings`) |
| **Aplicação web** | pasta com `index.html` | Na **raiz** do endereço, como no servidor dela (ver [Aplicações web](#aplicações-web-react-vite-spa)) |

Os **scripts de teste** (`*.testes.json`) do repositório são achados e ligados à aplicação pelo `alvo`, mesmo que morem em outro repositório.

## Encontrar a aplicação

A tela **Aplicações** organiza tudo em três níveis: **pasta cadastrada** (a faixa preta **PASTA**, quando há mais de uma) › **repositório** (**TERMINAL**) › **aplicação** (o cartão de embarque).

- **Busca:** tecle **`/`** e digite parte do nome, do repositório ou do caminho. Acentos não importam (`relatorio` acha "Relatório"). **Enter** abre a primeira aplicação que sobrou; **Esc** limpa.
- **Filtros:** por arquitetura (**FLX**, **MOD**, **WEB**, cada um com a contagem) e **Só com script de teste**. Cada pasta e cada repositório mostram quantas das suas aplicações aparecem ("2 de 14").
- **Recolher:** clique no cabeçalho de uma pasta ou repositório, ou use **Recolher tudo**. Na busca, os grupos com resultado abrem sozinhos.
- **Vista:** **▦ cartões** ou **☰ lista compacta**, uma aplicação por linha, para quem tem muitas.

O que você recolheu, os filtros e a vista ficam guardados neste navegador.

---

## O script de teste

É o mesmo formato do painel de testes da plataforma: o **mesmo arquivo roda nos dois lugares**. O Test_in lê um bloco a mais, `simulacoes`, que o painel ignora.

```json
{
  "formato": "testes-de-tela",
  "alvo": "FORM:399466",
  "instrucoes": "texto livre, mostrado ao carregar",
  "simulacoes": { ... },
  "casos": [
    { "codigo": "c-001", "nome": "O que o caso confere",
      "dados": { "valor": "1500,00" },
      "simulacoes": { ... },
      "passos": [
        { "acao": "abrirProcesso", "processo": "codigoDoFluxo" },
        { "acao": "preencher", "campo": "valorTotal", "valor": "{{valor}}" },
        { "acao": "conferirCampo", "campo": "aprovador", "valor": "Diretoria" }
      ] }
  ]
}
```

O `simulacoes` de um caso é somado ao do arquivo; o do caso vence. Os passos disponíveis aparecem no próprio Test_in; o essencial:

- **Abrir:** `abrirProcesso` / `abrirPagina` (`"."` = a página principal da aplicação).
- **Mexer:** `preencher`, `selecionar`, `marcar`, `desmarcar`, `selecionarZoom` (o campo de busca com lista), `clicar`, `enviar`, `esperar`.
- **Conferir:** `conferirTexto`, `conferirCampo`, `conferirVisivel`, `conferirOculto`, `conferirBloqueado`, `conferirEditavel`, `conferirAlerta`, `conferirSemErroNoConsole`, `conferirDataset`, **`conferirChamada`** (confere que a tela CONSULTOU uma fonte de dados, com tal filtro — pelo `DatasetFactory` ou pelo serviço REST de dados, inclusive as consultas feitas na abertura da tela).

O `campo` é o `name` ou o `id`. Em módulo, o id com a instância (`busca_12345`) é achado só por `busca`. Sem `name` nem `id`, use `@atributo=valor` (ex.: `@data-acao=filtrar`).

---

## Os dados simulados

A tela consulta dados como faria no servidor: `DatasetFactory.getDataset`, o serviço REST de dados e os eventos de servidor. O Test_in responde pelas regras de `simulacoes.fontes`, **sem mudar o código da aplicação**:

```json
"simulacoes": {
  "usuario":   { "login": "usuario.teste", "nome": "Usuário de Teste", "email": "u@exemplo.com" },
  "atividade": 0,
  "destino":   20,
  "modo":      "ADD",
  "fontes": {
    "dsCadastro": [
      { "quando": { "OPERACAO": "consultar", "TIPO": "Projetos" }, "linhas": [ { "CODPRJ": "3.01.001" } ] },
      { "quando": { "TIPO": ["A", "B"] }, "erro": "falha simulada" },
      { "quando": { "CODPRJ": "*" }, "linhas": [ { "CODPRJ": "{{CODPRJ}}", "SITUACAO": "ATIVO" } ] },
      { "linhas": [] }
    ]
  },
  "websocket": {
    "campoAcao": "action",
    "respostas": { "initSession": { "body": { "title": "Sucesso" } } }
  }
}
```

**Como as regras são aplicadas:**
- **A primeira que casa responde.** `quando` compara com os filtros obrigatórios da consulta.
- `"*"` exige que o filtro exista, com qualquer valor. Uma lista aceita qualquer valor dela.
- A regra sem `quando` é a **padrão**.
- `"{{CAMPO}}"` numa linha devolve o valor com que a tela filtrou (o "eco").
- `"erro"` faz a consulta **falhar**, para testar como a tela lida com isso: o `DatasetFactory` lança o erro e o serviço REST responde HTTP 500 com a mensagem.

**Sem simulação, a consulta volta vazia e o Test_in avisa.** No resultado aparece "Consultas sem simulação", já com um **modelo pronto** para colar no arquivo.

**Outros campos:**
- **`atividade` / `destino`:** a etapa em que a tela abre e para onde o Enviar manda (o que `getValue("WKNumState")` e o `beforeSendValidate` recebem).
- **`websocket`:** a tela que abre um WebSocket recebe um simulado, que responde conforme `respostas` (pela ação da mensagem) ou fica mudo.

---

## Aplicações web (React, Vite, SPA)

Uma aplicação web não conversa com a plataforma, e sim com as APIs dela (um Supabase, um Worker, um backend). O Test_in a abre como o servidor dela abriria e fica no meio do caminho da rede.

**Teste o build, não a fonte.** Num projeto Vite, o `index.html` da raiz aponta para `/src/main.jsx`, e só o servidor do Vite sabe transformar isso. O Test_in mostra esse cartão **desligado**, com o aviso, e testa a pasta do build (`dist/`): rode `npm run build` antes. Se o `dist/` estiver mais velho que o `src/`, o cartão avisa.

**A aplicação fica na raiz do endereço.** Quando você abre uma aplicação web, ela passa a responder em `http://127.0.0.1:7041/`: o `/assets/...` do build é achado, e o roteador dela (`BrowserRouter`) vê `/`, `/dashboard` e `/financeiro` como no servidor de verdade. Uma rota que não é arquivo recebe a página principal, como num servidor de SPA. A interface do Test_in fica em `/__testin/`.

**Abrir uma rota:** `{ "acao": "abrirPagina", "pagina": "dashboard.financeiro" }` abre `/dashboard/financeiro`. O ponto faz as vezes da barra, porque o código da página não aceita `/`; um arquivo `.html` abre como está.

**A rede é bloqueada por padrão.** Toda chamada `fetch`, `XMLHttpRequest`, WebSocket ou `sendBeacon` para **fora deste computador** sem simulação **não sai**: falha como se não houvesse rede, e aparece no resultado com um modelo pronto. Teste não mexe em produção. As regras ficam em `simulacoes`:

```json
"simulacoes": {
  "http": [
    { "nome": "login", "metodo": "POST", "url": "/auth/v1/token*", "quando": { "grant_type": "password" },
      "status": 400, "json": { "error_code": "invalid_credentials", "msg": "Invalid login credentials" } },
    { "nome": "usuarios", "url": "/rest/v1/usuarios*", "quando": { "id": "eq.5" }, "json": [ { "id": 5, "nome": "{{id}}" } ] },
    { "url": "https://api.exemplo.com/*", "erroDeRede": true }
  ],
  "rede": { "permitir": [] },
  "armazenamento": { "local": { "chave-da-sessao": { "access_token": "simulado" } } }
}
```

- **`http`:** a primeira regra que casa responde. `url` aceita `*`: sem `://`, compara só o caminho e a busca; com, o endereço inteiro. `quando` confere os parâmetros da busca e os campos do corpo JSON (ou de formulário), com as mesmas regras das fontes (`"*"`, lista). A resposta tem `status` (padrão 200), `json` ou `texto`, `cabecalhos` e `atrasoMs`; `"{{campo}}"` devolve o valor recebido. `"erroDeRede": true` simula a falha de conexão.
- **`rede.permitir`:** endereços que podem sair de verdade (ex.: `"https://*.supabase.co/*"`). Use só com ambiente de testes, nunca com produção. As chamadas liberadas aparecem no resultado.
- **`armazenamento`:** no começo de **cada caso**, o `localStorage` e o `sessionStorage` da aplicação são limpos (um caso não herda a sessão do outro) e recebem `local` e `sessao`. É o jeito de a aplicação abrir já logada, com uma sessão simulada.
- **`websocket`:** o mesmo simulado das telas de fluxo; sem ele, o WebSocket para fora é bloqueado.
- **Conferir chamada:** cada chamada entra no caso com o `nome` da regra (ou o caminho com pontos: `/rest/v1/usuarios` vira `rest.v1.usuarios`) e os parâmetros como filtros: `{ "acao": "conferirChamada", "dataset": "login", "filtro": "email=ana@exemplo.com" }`.
- **Build quebrado:** script ou folha de estilos que não carrega vira erro de JavaScript, e o `conferirSemErroNoConsole` reprova a tela em branco.

---

## O resultado

- **Na tela:** andamento ao vivo (com a tela testada visível, também em **tela cheia**), e depois indicadores e o detalhe de cada caso. O detalhe traz o passo que falhou com o esperado e o encontrado, erros de JavaScript, alertas, notificações, chamadas de dados e os campos da tela no momento da falha.
- **Câmera lenta:** o seletor **Velocidade** (ao lado de "Rodar em tela cheia") tem *Normal*, *Câmera lenta* e *Bem devagar*. Devagar, cada passo aparece numa legenda sobre a tela testada, o elemento é destacado em vermelho antes de o motor clicar ou preencher, o texto é digitado letra a letra, o que foi conferido pisca em verde e, se um passo falhar, o motivo fica na tela por alguns segundos. **Só o ritmo muda:** os eventos e o resultado são os mesmos da velocidade normal.
- **Passo a passo:** em **Velocidade**, escolha *Passo a passo*. Antes de cada passo, um cartão sobre a tela mostra o que ele vai fazer, a **entrada** (campo, valor, texto esperado), a **saída esperada** e **onde** (o elemento fica marcado na tela com uma moldura tracejada). Nos passos que abrem a tela, mostra também os dados simulados que ela vai receber. Você clica em **Executar este passo** (ou Enter) e vê o resultado: OK ou FALHOU com o motivo, e as consultas de dados que o passo fez. **Executar o resto sem parar** segue sozinho; **Parar** encerra. O tempo lendo o cartão não conta no limite do caso.
- **Relatório HTML:** um arquivo só, autocontido (abre sem internet), com painel de indicadores, gráfico de situação, duração por caso e o detalhe completo.
- **Resultado em `.json`:** para guardar ou comparar.

---

## A emulação e os limites dela

A tela testada pede ao servidor as bibliotecas e os serviços da plataforma pelos endereços de sempre (`/portal/resources/...`, `/webdesk/vcXMLRPC.js`, `/api/public/ecm/dataset/...`). O Test_in responde nesses endereços:

| O quê | Como |
|---|---|
| jQuery, jQuery UI, Mustache | Servidos pelo mesmo endereço. A primeira vez vêm da CDN e ficam em cache; a pasta `vendor/` (opcional) tem prioridade, para rodar sem internet |
| Biblioteca de componentes | Emulada: aviso, janela, carregando, chave liga/desliga, calendário, campo de busca com lista. O que não é emulado avisa no console e não quebra a tela |
| Folha de estilos | Bootstrap 3 + os estilos dos componentes. Para ficar **idêntica** à produção, aponte a folha original em Pastas → "Folha de estilos original" |
| Eventos de servidor da tela de fluxo | Rodam numa sandbox com `form`, `customHTML`, `getValue`, `log`, a API de usuário e as fontes simuladas. Método desconhecido vira aviso |

**O que fica de fora:**
- Scripts de fluxo que rodam no servidor depois do envio (o Test_in simula o envio e para ali).
- Troca de usuário no meio do caso.
- Componentes muito específicos da biblioteca original.

---

## Segurança

- **Escuta só em `127.0.0.1`:** ninguém na rede alcança.
- **Token por instalação:** vai num cookie `HttpOnly`, e sem ele a API e os arquivos não abrem.
- **Host e Origin conferidos:** fecha a porta do DNS rebinding.
- **O Test_in só lê dentro das pastas cadastradas:** `..` é recusado, inclusive codificado.
- **A aplicação web não sai para a rede:** chamada para fora sem simulação é bloqueada, e só um endereço liberado no script (`rede.permitir`) sai de verdade.

**Uma ressalva honesta:** a tela testada roda no mesmo endereço da interface. É isso que deixa o motor ler e mexer nela, e isso significa que um código testado mal-intencionado poderia usar a interface. Use o Test_in com o código dos seus repositórios, que é para o que ele existe.

---

## O motor

O motor que executa os passos (`web/motor.js`) é **o mesmo arquivo** do painel de testes da plataforma, copiado. Depois de mexer nele no painel:

```bash
node sincronizar-motor.js
```

A Bancada de Testes (`estacao/bancada-testes`) leva outra cópia do mesmo motor: depois de mexer nele, rode o `sincronizar-motor.js` **nas duas pastas**.

O teste falha se as duas cópias divergirem.

## Testes

```bash
node teste/teste-test_in.js                 # rápido, sem navegador
node teste/e2e-navegador.js <pasta-repos> <script.testes.json> [aplicacao]   # navegador de verdade (Edge/Chrome)
```

O de ponta a ponta sobe o Test_in, abre o navegador sem janela pelo protocolo de depuração (só com o Node, sem pacote) e roda o script pela própria interface. Com `CAPTURAS=<pasta>`, ele grava telas do resultado, da tela cheia e do relatório.
