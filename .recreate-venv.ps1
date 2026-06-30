# Recreate virtual environment for Windows
# Run in PowerShell: .\.recreate-venv.ps1

$ErrorActionPreference = "Stop"

Write-Host "Removing existing virtual environment..." -ForegroundColor Yellow
if (Test-Path .venv) {
    Remove-Item -Recurse -Force .venv
    Write-Host "Deleted .venv" -ForegroundColor Green
} else {
    Write-Host ".venv not found, skipping deletion" -ForegroundColor Yellow
}

Write-Host "Creating new virtual environment..." -ForegroundColor Yellow
uv venv
Write-Host "Virtual environment created" -ForegroundColor Green

Write-Host "Installing core packages..." -ForegroundColor Yellow
uv pip install -e packages/core
Write-Host "Core packages installed" -ForegroundColor Green

Write-Host "Installing libraries..." -ForegroundColor Yellow
uv pip install -e packages/libraries
Write-Host "Libraries installed" -ForegroundColor Green

Write-Host "Installing studio packages..." -ForegroundColor Yellow
uv pip install -e packages/studio
Write-Host "Studio packages installed" -ForegroundColor Green

Write-Host "`nVirtual environment recreated successfully!" -ForegroundColor Green
Write-Host "Please restart your terminal/VS Code to pick up the new environment." -ForegroundColor Cyan
