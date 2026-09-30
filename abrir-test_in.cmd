@echo off
rem ============================================================================
rem  Test_in - clique duplo para abrir
rem ============================================================================
rem  A janela preta abre, o navegador abre junto, e pronto.
rem
rem  DEIXE A JANELA ABERTA enquanto usar. Fecha-la encerra o Test_in. Nao fica
rem  nada rodando em segundo plano.
rem
rem  O "pushd" existe para funcionar tambem numa pasta de rede: o cmd nao aceita
rem  caminho \\servidor\pasta como diretorio atual, e o pushd mapeia uma letra
rem  temporaria para ele.
rem ============================================================================

setlocal
title Test_in

pushd "%~dp0"
if errorlevel 1 (
    echo.
    echo  Nao consegui abrir a pasta do Test_in:
    echo    %~dp0
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ============================================================
    echo   O Node.js nao foi encontrado neste computador.
    echo  ============================================================
    echo.
    echo   O Test_in precisa do Node.js 18 ou mais novo. Peca a
    echo   instalacao a equipe de TI - nao instale por conta propria.
    echo.
    pause
    popd
    exit /b 1
)

rem Ja esta rodando? Entao so abre o navegador nela.
netstat -ano -p tcp | findstr /r /c:"127\.0\.0\.1:7041 .*LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo  O Test_in ja esta aberto. Abrindo o navegador...
    start "" "http://127.0.0.1:7041/__testin/"
    popd
    exit /b 0
)

echo.
echo  Iniciando o Test_in...
echo  (o navegador abre sozinho - deixe esta janela aberta)
echo.

node "%~dp0app.js" %*

echo.
echo  O Test_in foi encerrado.
popd
pause
exit /b 0
