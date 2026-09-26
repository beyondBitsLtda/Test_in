@echo off
rem ============================================================================
rem  Cria um atalho do Test_in na Area de Trabalho
rem ============================================================================
rem  Rode UMA VEZ. Depois o Test_in abre pelo atalho.
rem
rem  Nao instala nada e nao precisa de administrador: um atalho e um arquivo
rem  .lnk na sua propria Area de Trabalho, como o que o Explorer cria em
rem  "Enviar para > Area de trabalho".
rem ============================================================================

setlocal
title Test_in - criar atalho

set "ALVO=%~dp0abrir-test_in.cmd"
set "ATALHO=%USERPROFILE%\Desktop\Test_in.lnk"

if not exist "%ALVO%" (
    echo Nao achei o abrir-test_in.cmd ao lado deste arquivo.
    pause
    exit /b 1
)

rem Os caminhos vao por variavel de ambiente: pasta com espaco ou acento
rem quebraria as aspas dentro do comando.
set "TESTIN_ALVO=%ALVO%"
set "TESTIN_ATALHO=%ATALHO%"
powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:TESTIN_ATALHO);" ^
  "$s.TargetPath = $env:TESTIN_ALVO;" ^
  "$s.Description = 'Testes de tela automaticos no computador';" ^
  "$s.IconLocation = $env:SystemRoot + '\System32\shell32.dll,21';" ^
  "$s.Save()"

if exist "%ATALHO%" (
    echo.
    echo  Pronto. O atalho "Test_in" esta na sua Area de Trabalho.
    echo.
) else (
    echo.
    echo  Nao consegui criar o atalho.
    echo  Alternativa: clique com o botao DIREITO no abrir-test_in.cmd,
    echo  escolha "Enviar para" e depois "Area de trabalho (criar atalho)".
    echo.
)

pause
