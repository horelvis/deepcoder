#!/bin/bash

# Script para preparar DeepCoder AI para publicación en npm
echo "📦 Preparando DeepCoder AI para publicación en npm..."
echo

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Paso 1: Verificar estructura actual
print_step "Verificando estructura actual..."

if [ ! -f "bin/deepcoder" ]; then
    print_error "No se encontró bin/deepcoder"
    exit 1
fi

if [ ! -f "package.json" ]; then
    print_error "No se encontró package.json"
    exit 1
fi

print_success "Archivos base encontrados"

# Paso 2: Renombrar archivo principal
print_step "Renombrando archivo principal..."

if [ -f "bin/deepcoder" ] && [ ! -f "bin/deepcoder.js" ]; then
    mv bin/deepcoder bin/deepcoder.js
    print_success "Archivo renombrado a bin/deepcoder.js"
elif [ -f "bin/deepcoder.js" ]; then
    print_warning "bin/deepcoder.js ya existe"
else
    print_error "Error en el renombrado"
    exit 1
fi

# Paso 3: Hacer ejecutable
print_step "Configurando permisos..."
chmod +x bin/deepcoder.js
print_success "Archivo hecho ejecutable"

# Paso 4: Crear LICENSE
print_step "Creando archivo LICENSE..."

cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2024 DeepCoder AI Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

print_success "LICENSE creado"

# Paso 5: Crear .npmignore
print_step "Creando .npmignore..."

cat > .npmignore << 'EOF'
# Development files
.git
.gitignore
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Test files
test/
tests/
__tests__/
*.test.js
*.spec.js

# Scripts not needed in package
install-global.sh
debug-npm-link.sh
fix-deepcoder.sh
diagnose.sh
prepare-for-npm.sh

# Local configuration
.env
.env.local
.env.*.local

# Temporary files
tmp/
temp/
*.tmp
EOF

print_success ".npmignore creado"

# Paso 6: Crear CHANGELOG.md
print_step "Creando CHANGELOG.md..."

cat > CHANGELOG.md << 'EOF'
# Changelog

All notable changes to DeepCoder AI will be documented in this file.

## [1.0.0] - 2024-12-XX

### Added
- Initial release of DeepCoder AI
- Intelligent code analysis and generation
- Interactive CLI with contextual memory
- Project context awareness via CLAUDE.md
- Automatic backup system for file edits
- Multi-file project scanning
- Integration with Ollama + DeepSeek model
- Commands: ask, analyze, edit, create, scan
- ES6 module support
- Cross-platform compatibility

### Features
- **Smart Context Loading**: Automatically reads project documentation
- **File Reference Detection**: Intelligently includes relevant files in prompts
- **Conversation Memory**: Maintains context across interactions
- **Safe Editing**: Creates backups before modifying files
- **Project Scanning**: Analyzes project structure intelligently

### Requirements
- Node.js >= 18.0.0
- Ollama installed and running
- DeepSeek Coder model (auto-downloaded)
EOF

print_success "CHANGELOG.md creado"

# Paso 7: Verificar package.json
print_step "Verificando package.json..."

if grep -q '"main": "bin/deepcoder.js"' package.json; then
    print_success "package.json tiene la ruta correcta"
else
    print_warning "Actualiza package.json manualmente"
    echo "  Cambia 'main' y 'bin' a usar bin/deepcoder.js"
fi

# Paso 8: Probar el paquete
print_step "Probando el paquete..."

echo "🧪 Verificando sintaxis..."
if node --check bin/deepcoder.js; then
    print_success "Sintaxis correcta"
else
    print_error "Error de sintaxis en bin/deepcoder.js"
    exit 1
fi

echo "🧪 Simulando empaquetado..."
if npm pack --dry-run > /dev/null 2>&1; then
    print_success "Empaquetado simulado exitoso"
else
    print_warning "Problemas en empaquetado simulado"
fi

# Paso 9: Verificar disponibilidad del nombre
print_step "Verificando disponibilidad del nombre en npm..."

PACKAGE_NAME=$(grep '"name"' package.json | cut -d'"' -f4)
echo "📦 Nombre del paquete: $PACKAGE_NAME"

if npm view "$PACKAGE_NAME" > /dev/null 2>&1; then
    print_error "❌ El nombre '$PACKAGE_NAME' ya está tomado en npm"
    echo
    echo "🔄 Nombres alternativos sugeridos:"
    echo "   - @tuorg/deepcoder"
    echo "   - deepcoder-cli"
    echo "   - ai-deepcoder"
    echo "   - deepcoder-agent"
    echo "   - ollama-deepcoder"
    echo
    echo "💡 Actualiza el 'name' en package.json antes de publicar"
else
    print_success "✅ El nombre '$PACKAGE_NAME' está disponible"
fi

# Paso 10: Mostrar resumen
echo
echo "📋 RESUMEN DE PREPARACIÓN"
echo "========================="
echo

echo "✅ Archivos creados/modificados:"
echo "   - bin/deepcoder.js (ejecutable principal)"
echo "   - LICENSE (licencia MIT)"
echo "   - .npmignore (archivos excluidos)"
echo "   - CHANGELOG.md (historial de versiones)"
echo

echo "📦 Estructura del paquete:"
find . -maxdepth 2 -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "LICENSE" | grep -v node_modules | sort

echo
echo "🚀 PRÓXIMOS PASOS PARA PUBLICAR:"
echo "================================"
echo

echo "1️⃣ Verificar que package.json esté actualizado:"
echo "   - 'main': 'bin/deepcoder.js'"
echo "   - 'bin': {'deepcoder': './bin/deepcoder.js'}"
echo

echo "2️⃣ Iniciar sesión en npm:"
echo "   npm login"
echo

echo "3️⃣ Verificar el empaquetado:"
echo "   npm pack"
echo "   tar -tzf deepcoder-ai-1.0.0.tgz"
echo

echo "4️⃣ Publicar:"
echo "   npm publish"
echo

echo "5️⃣ Verificar publicación:"
echo "   npm view deepcoder-ai"
echo

echo "6️⃣ Probar instalación:"
echo "   npm install -g deepcoder-ai"
echo "   deepcoder"
echo

print_success "🎉 ¡Preparación completada!"
echo "📚 Consulta NPM_PUBLISH.md para más detalles"