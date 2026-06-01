<div align="center">

![RPAForge Logo](docs/assets/logo.png)

**Robotic Process Automation Studio**

[![CI](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml/badge.svg)](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml)
[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![Python](https://img.shields.io/pypi/pyversions/rpaforge-core)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)
[![codecov](https://codecov.io/gh/chelslava/rpaforge/branch/main/graph/badge.svg)](https://codecov.io/gh/chelslava/rpaforge)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Inicio Rápido](#inicio-rápido) · [Documentación](#documentación) · [Bibliotecas](#bibliotecas-rpa) · [Roadmap](#roadmap) · [Contribuir](#contribuir)

[🇬🇧 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇩🇪 Deutsch](README.de.md)

</div>

---

RPAForge es un estudio de **Automatización Robótica de Procesos (RPA)** moderno y de código abierto. Diseñe flujos de trabajo de automatización visualmente, depúrelos paso a paso y ejecutelos con un motor Python de grado de producción — sin bloqueo de proveedor, sin cuotas de licencia.

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

## Características

| | |
|---|---|
| **Diseñador Visual** | Constructor de flujos de trabajo de arrastrar y soltar con React Flow — nodos, bordes, subdiagramas, zoom/pan y minimapa |
| **Depurador Integrado** | Puntos de quiebre, ejecución paso a paso (saltar/entrar/salir), inspector de variables, pilas de llamadas, paradas condicionales |
| **14 Bibliotecas RPA** | 80+ actividades listas para usar que cubren Desktop, Web, Excel, DataFrames, Base de datos, OCR, HTTP, Credenciales y más |
| **Puente Python** | Servidor Asyncio JSON-RPC — Electron se comunica con Python sobre IPC con seguridad de tipos completa |
| **Generación de Código** | Diagrama → Python, con validación de topología antes de cada ejecución |
| **Seguridad Primero** | Inyección SQL, path traversal, validación `getattr` insegura y carga de IPC incorporadas (v0.3.1) |
| **Almacenamiento Persistente** | Guardado automático de IndexedDB para procesos, variables e historial de ejecución |
| **Multilingüe** | Interfaz de usuario y registro de bibliotecas en inglés (en), ruso (ru), alemán (de) y español (es) — [ayude a traducir a nuevos idiomas](HOWTO-TRANSLATE.md) |
| **Multiplataforma** | Windows, macOS, Linux — una única base de código |

---

## Arquitectura

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

### Paquetes

```
rpaforge/
├── packages/
│   ├── core/           # Motor Python — runner, debugger, bridge, codegen
│   ├── libraries/      # Módulos de bibliotecas RPA
│   ├── studio/         # Aplicación de escritorio Electron + React
│   └── orchestrator/   # Control Tower (planeado)
├── docs/               # Documentación MKDocs
├── .github/            # Flujos de trabajo CI/CD (ci, release, codeql, docs)
└── tools/              # Scripts de lanzamiento
```

---

## Inicio Rápido

### Requisitos Previos

| Herramienta | Versión |
|------|---------|
| Python | 3.10 – 3.13 |
| Node.js | 20+ |
| pnpm | 9+ (o npm 9+) |
| Git | cualquiera |
| VS Build Tools | Solo Windows, para módulos nativos |

### Instalación y Ejecución

```bash
# 1. Clonar
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# 2. Paquetes Python (modo de desarrollo)
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# 3. Studio UI
cd packages/studio
pnpm install          # o: npm ci --include=optional

# 4. Verificar
cd ../..
pytest packages/core/tests -v
cd packages/studio && pnpm test && cd ../..
```

### Iniciar el Studio

```bash
cd packages/studio
pnpm dev              # Vite dev server + Electron hot-reload
```

### Dependencias del Sistema

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
<summary><b>Soporte OCR (todas las plataformas)</b></summary>

```bash
pip install -e "packages/libraries[ocr]"

# Windows: https://github.com/UB-Mannheim/tesseract/wiki
# Linux:   sudo apt-get install tesseract-ocr
# macOS:   brew install tesseract
```
</details>

<details>
<summary><b>Automatización Web (Playwright)</b></summary>

```bash
pip install -e "packages/libraries[web]"
playwright install    # Descargar binarios del navegador
```
</details>

---

## Bibliotecas RPA

| Biblioteca | Actividades | Descripción | Dependencias Adicionales |
|---------|-----------|-------------|------------|
| **DesktopUI** | 20+ | Automatización de interfaz de usuario de Windows — Win32, WPF y Java | pywinauto, pillow |
| **WebUI** | 15+ | Automatización de navegadores (Chrome, Firefox y Safari) | playwright |
| **Excel** | 8+ | Lectura/escritura de hojas de cálculo XLSX | openpyxl |
| **DataFrames** | 28+ | Operaciones de datos tabulares — filtrar, ordenar, unir, agregar | polars |
| **Database** | 6+ | Consultas SQL a través de SQLAlchemy ORM | sqlalchemy |
| **OCR** | 5+ | Reconocimiento de texto — Tesseract + EasyOCR | pytesseract, easyocr |
| **Credentials** | 4+ | Almacén de credenciales del SO cifrado | cryptography, keyring |
| **File** | 8+ | Operaciones de archivos y carpetas | — |
| **HTTP** | 5+ | Solicitudes de API REST | requests |
| **DateTime** | 6+ | Utilidades de fecha y hora | — |
| **String** | 7+ | Manipulación de cadenas | — |
| **Variables** | 4+ | Gestión de variables y alcance | — |
| **Flow** | 4+ | Flujo de control — if, while, for | — |
| **Spy** | 3+ | Superposición de inspector de elementos de interfaz de usuario en vivo | uiautomation, pynput |

Instale solo lo que necesita:

```bash
pip install -e "packages/libraries[desktop]"    # DesktopUI
pip install -e "packages/libraries[web]"         # WebUI
pip install -e "packages/libraries[dataframes]"  # DataFrames (polars)
pip install -e "packages/libraries[all]"         # Todo
```

---

## Desarrollo

### Comandos Comunes

```bash
make test         # Ejecutar todas las pruebas de Python
make lint         # ruff + mypy
make format       # ruff format
make docs         # Compilar MKDocs
make docs-serve   # Servir documentos localmente
make studio-dev   # Studio hot-reload

cd packages/studio
pnpm test         # Vitest
pnpm build        # Compilación de producción
```

### Stack Tecnológico

**Backend (Python)**
- Puente `asyncio` JSON-RPC
- `Ruff` para linting y formateo
- `pytest` + `pytest-asyncio` para pruebas
- `mypy` para verificación de tipos

**Frontend (TypeScript)**
- React 19 + Vite 6
- React Flow 11 — editor de diagramas visual
- Zustand 5 — gestión de estado
- Monaco Editor — editor de código incrustado
- TailwindCSS 4 — estilos de utilidad
- Electron 42 — empaquetado de escritorio

---

## Estado del Proyecto

| Paquete | Descripción | Versión | Estado |
|---------|-------------|---------|--------|
| `rpaforge-core` | Motor, depurador, puente JSON-RPC | v0.3.3 | ✅ Estable |
| `rpaforge-libraries` | 14 módulos de biblioteca RPA | v0.3.3 | ✅ Estable |
| `rpaforge-studio` | Electron + React interfaz de usuario de escritorio | v0.3.3 | 🔄 Alpha |
| `rpaforge-orchestrator` | Control Tower | — | 🔜 Planeado |

---

## Roadmap

### v0.3.1 — Seguridad y Estabilidad *(lanzado)*
- ✅ Inyección SQL, path traversal, mitigaciones de `getattr` inseguro
- ✅ Validación de carga IPC con imposición estricta de esquema
- ✅ Infraestructura IndexedDB — autoguardar, variables, historial
- ✅ Validación Python en línea basada en Ruff con resaltado de errores
- ✅ Registro persistente con rotación de archivos
- ✅ Modo de congelación para superposición Spy

### v0.3.2 — Confiabilidad *(lanzado)*
- ✅ Bloqueo de ciclo de vida serializado para `_handle_run_diagram` — elimina condiciones de carrera bajo ejecución concurrente
- ✅ Resolución segura del ejecutable `ruff` a través de `shutil.which()`
- ✅ Auditoría de seguridad de dependencias — 14 alertas de Dependabot resueltas a través de anulaciones npm

### v0.3.3 — DataFrames y UX de Depuración *(Actual)*
- ✅ **Biblioteca DataFrames** — 28 actividades de datos tabulares con Polars
- ✅ **Tipo de variable DataFrame** — tipo `DataFrame` de primera clase en el diseñador visual
- ✅ **Vista previa de tabla visual en depurador** — inspeccione el contenido de DataFrame en línea cuando se detiene en un punto de quiebre
- ✅ Correcciones i18n — todas las cadenas de interfaz de usuario traducidas al inglés y ruso

### v0.4.0 — Flujo de Trabajo Mejorado *(planeado)*
- [ ] Grabador de actividades inteligente — capturar y reproducir acciones de usuario
- [ ] Extracción de selector y localizadores autorecuperables
- [ ] Mejoras en el panel Explorador de Variables
- [ ] Navegador de historial de ejecución
- [ ] Interfaz de usuario de mapeo de parámetros de subdiagrama

### v0.5.0 — Extensibilidad *(Q4 2026)*
- [ ] Sistema de complementos y SDK de desarrollo de bibliotecas
- [ ] Mercado de plantillas de proyectos
- [ ] Integración de control de versiones (proyectos conscientes de Git)

### v1.0.0 — Listo para Producción *(Q1 2027)*
- [ ] Orquestador — Control Tower para ejecución multi-máquina
- [ ] Programador y motor de activadores
- [ ] Monitoreo avanzado y alertas
- [ ] Autenticación empresarial (LDAP/SSO)

---

## Documentación

| Recurso | Descripción |
|----------|-------------|
| [Primeros Pasos](docs/getting-started/installation.md) | Instalación y configuración del sistema |
| [Inicio Rápido](docs/getting-started/quick-start.md) | Cree su primera automatización |
| [Guía del Desarrollador](AGENTS.md) | Arquitectura, patrones, convenciones de código |
| [Contribuir](CONTRIBUTING.md) | Cómo contribuir código o documentación |
| [Guía de Traducción](HOWTO-TRANSLATE.md) | Agregue traducciones para nuevos idiomas |
| [Registro de Cambios](CHANGELOG.md) | Notas de la versión |
| [Roadmap](ROADMAP.md) | Roadmap detallado de características |

---

## Contribuir

Las contribuciones son bienvenidas — informes de errores, solicitudes de características, documentación y código.

```bash
# Fork → clone → branch
git checkout -b feat/my-feature

# Realice cambios, luego
make test && make lint

# Commit (Conventional Commits)
git commit -m "feat(libraries): add PDF extraction keyword"

# Abra un PR contra main
```

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de trabajo completo, estándares de codificación y lista de verificación de PR.

---

## Reconocimientos

- Diseñador visual impulsado por [React Flow](https://reactflow.dev/) y [Electron](https://www.electronjs.org/)
- Automatización de escritorio a través de [pywinauto](https://pywinauto.readthedocs.io/)
- Automatización web a través de [Playwright](https://playwright.dev/)
- Inspirado en UiPath, Blue Prism y Automation Anywhere

---

<div align="center">

**[GitHub Discussions](https://github.com/chelslava/rpaforge/discussions) · [Rastreador de Problemas](https://github.com/chelslava/rpaforge/issues)**

Licencia Apache 2.0 — Hecho con cuidado por la comunidad de RPAForge

</div>
