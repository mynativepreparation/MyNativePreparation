@echo off
rem Usage (from this folder):   run check-env.ps1     or     .\run.cmd check-env.ps1
rem Runs a script from the scripts folder and saves everything it prints to logs\last-run.txt
rem so Claude can read the result directly (no copy-paste needed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" %*
