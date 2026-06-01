<div align="center">

![RPAForge Logo](docs/assets/logo.png)

**Robotic Process Automation Studio**

[![CI](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml/badge.svg)](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml)
[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![Python](https://img.shields.io/pypi/pyversions/rpaforge-core)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)
[![codecov](https://codecov.io/gh/chelslava/rpaforge/branch/main/graph/badge.svg)](https://codecov.io/gh/chelslava/rpaforge)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Schnellstart](#schnellstart) · [Dokumentation](#dokumentation) · [Bibliotheken](#rpa-bibliotheken) · [Roadmap](#roadmap) · [Beitragen](#beitragen)

[🇬🇧 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇪🇸 Español](README.es.md)

</div>

---

RPAForge ist ein modernes, quelloffenes **Robotic Process Automation**-Studio. Entwerfen Sie Automatisierungs-Workflows visuell, debuggen Sie sie Schritt für Schritt und führen Sie sie mit einer produktionsreifen Python-Engine aus — ohne Vendor-Lock-in, ohne Lizenzgebühren.

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

builder = engine.create_process("Notepad Automation")
builder.add_task("Open and Type", [
    ("DesktopUI.Open Application",  {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window",   {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text",        {"text": "Hello from RPAForge!"}),
    ("DesktopUI.Close Window",      {}),
])

result = engine.run(builder.build())
print(f"Status: {result.status}")
```

---

## Funktionen

| | |
|---|---|
| **Visueller Designer** | Drag-and-Drop-Workflow-Builder mit React Flow — Knoten, Kanten, Unterdiagramme, Zoom/Pan und Mini-Map |
| **Integrierter Debugger** | Haltepunkte, Einzelschritte (Überspringen/Betreten/Verlassen), Variableninspektor, Call Stacks, bedingte Stopps |
| **14 RPA-Bibliotheken** | 80+ vorgefertigte Aktivitäten für Desktop, Web, Excel, DataFrames, Datenbank, OCR, HTTP, Anmeldedaten und mehr |
| **Python-Bridge** | Asyncio JSON-RPC-Server — Electron kommuniziert mit Python über IPC mit vollständiger Typsicherheit |
| **Code-Generierung** | Diagramm → Python, mit Topologie-Validierung vor jedem Lauf |
| **Security First** | SQL-Injection, Path Traversal, unsicherer `getattr` und IPC-Payload-Validierung eingebaut (v0.3.1) |
| **Persistenter Speicher** | IndexedDB-Autospeichern für Prozesse, Variablen und Ausführungsverlauf |
| **Mehrsprachigkeit** | UI und Bibliotheks-Logging auf Englisch (en), Russisch (ru), Deutsch (de), Spanisch (es) — [helfen Sie beim Übersetzen](HOWTO-TRANSLATE.md) |
| **Plattformübergreifend** | Windows, macOS, Linux — eine Codebasis |

---

## Architektur

```
┌──────────────────────────────────────────────────────────────────┐
│  RPAForge Studio  (Electron 42 + React 19 + TailwindCSS 4)      │
│                                                                  │
│   Designer │ Debugger │ Console │ Recorder                      │
│   React Flow · Monaco Editor · Zustand · Vite 6                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │  JSON-RPC over IPC / Stdio
┌────────────────────────────┴─────────────────────────────────────┐
│  Python Bridge Server  (asyncio JSON-RPC)                        │
│                                                                  │
│   StudioEngine · ProcessRunner · Debugger · Recorder             │
│   CodeGenerator · Topology Validator                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│  RPA Libraries  (14 modules · 55+ activities)                    │
│                                                                  │
│  DesktopUI  WebUI   Excel    Database  OCR   Credentials         │
│  File       HTTP    DateTime String    Flow  Variables  Spy …    │
└──────────────────────────────────────────────────────────────────┘
```

### Pakete

```
rpaforge/
├── packages/
│   ├── core/           # Python-Engine — runner, debugger, bridge, codegen
│   ├── libraries/      # RPA-Bibliotheksmodule
│   ├── studio/         # Electron + React Desktop-Anwendung
│   └── orchestrator/   # Control Tower (geplant)
├── docs/               # MKDocs-Dokumentation
├── .github/            # CI/CD-Workflows (ci, release, codeql, docs)
└── tools/              # Release-Skripte
```

---

## Schnellstart

### Voraussetzungen

| Werkzeug | Version |
|------|---------|
| Python | 3.10 – 3.13 |
| Node.js | 20+ |
| pnpm | 9+ (oder npm 9+) |
| Git | beliebig |
| VS Build Tools | Nur Windows, für native Module |

### Installation und Ausführung

```bash
# 1. Klonen
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# 2. Python-Pakete (Entwicklungsmodus)
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# 3. Studio UI
cd packages/studio
pnpm install          # oder: npm ci --include=optional

# 4. Überprüfung
cd ../..
pytest packages/core/tests -v
cd packages/studio && pnpm test && cd ../..
```

### Studio starten

```bash
cd packages/studio
pnpm dev              # Vite dev server + Electron hot-reload
```

### Systemabhängigkeiten

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
sudo apt-get install -y libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1
```
</details>

<details>
<summary><b>macOS</b></summary>

```bash
xcode-select --install
```
</details>

<details>
<summary><b>OCR-Unterstützung (alle Plattformen)</b></summary>

```bash
pip install -e "packages/libraries[ocr]"

# Windows: https://github.com/UB-Mannheim/tesseract/wiki
# Linux:   sudo apt-get install tesseract-ocr
# macOS:   brew install tesseract
```
</details>

<details>
<summary><b>Web-Automatisierung (Playwright)</b></summary>

```bash
pip install -e "packages/libraries[web]"
playwright install    # Laden Sie Browser-Binärdateien herunter
```
</details>

---

## RPA-Bibliotheken

| Bibliothek | Aktivitäten | Beschreibung | Zusätzliche Abhängigkeiten |
|---------|-----------|-------------|------------|
| **DesktopUI** | 20+ | Windows-UI-Automatisierung — Win32, WPF und Java | pywinauto, pillow |
| **WebUI** | 15+ | Browser-Automatisierung (Chrome, Firefox und Safari) | playwright |
| **Excel** | 8+ | XLSX-Tabellenkalkulationen lesen/schreiben | openpyxl |
| **DataFrames** | 28+ | Tabellendatenoperationen — filtern, sortieren, verbinden, aggregieren | polars |
| **Database** | 6+ | SQL-Abfragen über SQLAlchemy ORM | sqlalchemy |
| **OCR** | 5+ | Texterkennung — Tesseract + EasyOCR | pytesseract, easyocr |
| **Credentials** | 4+ | Verschlüsselter OS-Anmeldedatenspeicher | cryptography, keyring |
| **File** | 8+ | Datei- und Ordneroperationen | — |
| **HTTP** | 5+ | REST API-Anfragen | requests |
| **DateTime** | 6+ | Datums-/Zeitprogramme | — |
| **String** | 7+ | Stringbearbeitung | — |
| **Variables** | 4+ | Variablenverwaltung und Scoping | — |
| **Flow** | 4+ | Kontrollfluss — if, while, for | — |
| **Spy** | 3+ | Live-UI-Element-Inspektions-Overlay | uiautomation, pynput |

Installieren Sie nur das, was Sie benötigen:

```bash
pip install -e "packages/libraries[desktop]"    # DesktopUI
pip install -e "packages/libraries[web]"         # WebUI
pip install -e "packages/libraries[dataframes]"  # DataFrames (polars)
pip install -e "packages/libraries[all]"         # Alles
```

---

## Entwicklung

### Häufige Befehle

```bash
make test         # Alle Python-Tests ausführen
make lint         # ruff + mypy
make format       # ruff format
make docs         # MKDocs bauen
make docs-serve   # Docs lokal bereitstellen
make studio-dev   # Studio hot-reload

cd packages/studio
pnpm test         # Vitest
pnpm build        # Produktions-Build
```

### Tech Stack

**Backend (Python)**
- `asyncio` JSON-RPC-Bridge
- `Ruff` zum Linting und Formatieren
- `pytest` + `pytest-asyncio` zum Testen
- `mypy` zur Typprüfung

**Frontend (TypeScript)**
- React 19 + Vite 6
- React Flow 11 — visueller Diagramm-Editor
- Zustand 5 — Zustandsverwaltung
- Monaco Editor — eingebetteter Code-Editor
- TailwindCSS 4 — Utility-Styling
- Electron 42 — Desktop-Verpackung

---

## Projektstatus

| Paket | Beschreibung | Version | Status |
|---------|-------------|---------|--------|
| `rpaforge-core` | Engine, Debugger, JSON-RPC-Bridge | v0.3.3 | ✅ Stabil |
| `rpaforge-libraries` | 14 RPA-Bibliotheksmodule | v0.3.3 | ✅ Stabil |
| `rpaforge-studio` | Electron + React Desktop-UI | v0.3.3 | 🔄 Alpha |
| `rpaforge-orchestrator` | Control Tower | — | 🔜 Geplant |

---

## Roadmap

### v0.3.1 — Sicherheit & Stabilität *(veröffentlicht)*
- ✅ SQL-Injection, Path Traversal, unsicherer `getattr` Mitigationen
- ✅ IPC-Payload-Validierung mit strenger Schema-Erzwingung
- ✅ IndexedDB-Infrastruktur — Autospeichern, Variablen, Verlauf
- ✅ Ruff-basierte Python-Inline-Validierung mit Fehlerhervorhebung
- ✅ Persistentes Logging mit Dateirotation
- ✅ Freeze-Modus für Spy-Overlay

### v0.3.2 — Zuverlässigkeit *(veröffentlicht)*
- ✅ Serialisierte Lifecycle-Sperre für `_handle_run_diagram` — eliminiert Race Conditions unter gleichzeitiger Ausführung
- ✅ Sichere `ruff`-Ausführungsauflösung über `shutil.which()`
- ✅ Abhängigkeitssicherheitsaudit — 14 Dependabot-Warnungen über npm overrides behoben

### v0.3.3 — DataFrames & Debug UX *(aktuell)*
- ✅ **DataFrames-Bibliothek** — 28 Tabellendatenaktivitäten mit Polars
- ✅ **DataFrame-Variablentyp** — First-Class `DataFrame` Typ im visuellen Designer
- ✅ **Visuelle Tabellenvorschau im Debugger** — Inspizieren Sie DataFrame-Inhalte inline bei Haltepunkt
- ✅ i18n-Fixes — alle UI-Strings auf Englisch und Russisch übersetzt

### v0.4.0 — Enhanced Workflow *(geplant)*
- [ ] Smart Activity Recorder — Erfassen und Wiedergeben von Benutzeraktionen
- [ ] Selector-Extraktion und selbstheilende Locators
- [ ] Variable Explorer Panel-Verbesserungen
- [ ] Ausführungsverlauf-Browser
- [ ] Sub-Diagramm Parameter Mapping UI

### v0.5.0 — Erweiterbarkeit *(Q4 2026)*
- [ ] Plugin-System und Library Development SDK
- [ ] Project Templates Marketplace
- [ ] Version Control Integration (Git-aware projects)

### v1.0.0 — Production Ready *(Q1 2027)*
- [ ] Orchestrator — Control Tower für Multi-Machine Execution
- [ ] Scheduler und Trigger Engine
- [ ] Advanced Monitoring und Alerting
- [ ] Enterprise Authentication (LDAP/SSO)

---

## Dokumentation

| Ressource | Beschreibung |
|----------|-------------|
| [Erste Schritte](docs/getting-started/installation.md) | Installation und Systemsetup |
| [Schnellstart](docs/getting-started/quick-start.md) | Erstellen Sie Ihre erste Automatisierung |
| [Entwicklerhandbuch](AGENTS.md) | Architektur, Muster, Code-Konventionen |
| [Beitragen](CONTRIBUTING.md) | Wie man Code oder Docs beiträgt |
| [Übersetzungsanleitung](HOWTO-TRANSLATE.md) | Fügen Sie Übersetzungen in neue Sprachen hinzu |
| [Änderungsprotokoll](CHANGELOG.md) | Versionshinweise |
| [Roadmap](ROADMAP.md) | Detaillierte Feature-Roadmap |

---

## Beitragen

Beiträge sind willkommen — Fehlerberichte, Feature-Anfragen, Dokumentation und Code.

```bash
# Fork → clone → branch
git checkout -b feat/my-feature

# Machen Sie Änderungen, dann
make test && make lint

# Commit (Conventional Commits)
git commit -m "feat(libraries): add PDF extraction keyword"

# Öffnen Sie einen PR gegen main
```

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für den vollständigen Workflow, Codierungsstandards und PR-Checkliste.

---

## Danksagungen

- Visueller Designer mit [React Flow](https://reactflow.dev/) und [Electron](https://www.electronjs.org/)
- Desktop-Automatisierung via [pywinauto](https://pywinauto.readthedocs.io/)
- Web-Automatisierung via [Playwright](https://playwright.dev/)
- Inspiriert von UiPath, Blue Prism und Automation Anywhere

---

<div align="center">

**[GitHub Discussions](https://github.com/chelslava/rpaforge/discussions) · [Issue Tracker](https://github.com/chelslava/rpaforge/issues)**

Apache License 2.0 — Gemacht mit Sorgfalt von der RPAForge-Gemeinschaft

</div>
