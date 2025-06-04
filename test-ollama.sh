#!/bin/bash

# DeepCode AI Diagnostic Script
echo "🔧 DeepCode AI Diagnostic Tool"
echo "=============================="
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_fix() {
    echo -e "${BLUE}[FIX]${NC} $1"
}

# Check 1: Node.js
print_check "Node.js installation..."
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    MAJOR_VERSION=$(echo $NODE_VERSION | sed 's/v//' | cut -d. -f1)
    
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        print_ok "Node.js $NODE_VERSION (compatible)"
    else
        print_error "Node.js $NODE_VERSION (requires v18+)"
        print_fix "Update Node.js: https://nodejs.org/"
    fi
else
    print_error "Node.js not found"
    print_fix "Install Node.js: https://nodejs.org/"
fi

echo

# Check 2: Ollama installation
print_check "Ollama installation..."
if command -v ollama >/dev/null 2>&1; then
    OLLAMA_VERSION=$(ollama --version 2>/dev/null || echo "unknown")
    print_ok "Ollama installed ($OLLAMA_VERSION)"
else
    print_error "Ollama not found"
    print_fix "Install: curl -fsSL https://ollama.ai/install.sh | sh"
fi

echo

# Check 3: Ollama service
print_check "Ollama service status..."
if curl -s http://localhost:11434/api/version >/dev/null 2>&1; then
    API_VERSION=$(curl -s http://localhost:11434/api/version | grep -o '"version":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "unknown")
    print_ok "Ollama service running (API: $API_VERSION)"
else
    print_error "Ollama service not running"
    print_fix "Start service: ollama serve"
    print_fix "Run in background: nohup ollama serve > /dev/null 2>&1 &"
fi

echo

# Check 4: Available models
print_check "Available models..."
if command -v ollama >/dev/null 2>&1; then
    if ollama list >/dev/null 2>&1; then
        MODELS=$(ollama list 2>/dev/null | grep -v "NAME" | wc -l)
        if [ "$MODELS" -gt 0 ]; then
            print_ok "$MODELS models available:"
            ollama list | grep -v "NAME" | while read line; do
                MODEL_NAME=$(echo $line | awk '{print $1}')
                echo "  • $MODEL_NAME"
            done
        else
            print_warning "No models installed"
            print_fix "Install DeepSeek: ollama pull deepseek-coder"
        fi
    else
        print_error "Cannot list models"
    fi
fi

echo

# Check 5: DeepSeek model specifically
print_check "DeepSeek Coder model..."
if command -v ollama >/dev/null 2>&1 && ollama list 2>/dev/null | grep -q "deepseek-coder"; then
    print_ok "DeepSeek Coder model available"
    
    # Test the model
    print_check "Testing model response..."
    if timeout 10s ollama run deepseek-coder "Say 'test'" >/dev/null 2>&1; then
        print_ok "Model responds correctly"
    else
        print_warning "Model test failed or timed out"
        print_fix "Try: ollama run deepseek-coder 'hello'"
    fi
else
    print_error "DeepSeek Coder model not found"
    print_fix "Download: ollama pull deepseek-coder"
fi

echo

# Check 6: Project files
print_check "Project structure..."
if [ -f "bin/deepcode" ]; then
    if [ -x "bin/deepcode" ]; then
        print_ok "DeepCode executable found and executable"
    else
        print_warning "DeepCode file found but not executable"
        print_fix "Fix permissions: chmod +x bin/deepcode"
    fi
else
    print_error "bin/deepcode not found"
    print_fix "Ensure you're in the correct directory"
fi

if [ -f "package.json" ]; then
    if grep -q '"type": "module"' package.json; then
        print_ok "package.json configured for ES modules"
    else
        print_warning "package.json missing ES module configuration"
        print_fix "Add: \"type\": \"module\" to package.json"
    fi
else
    print_warning "package.json not found"
    print_fix "Create package.json with ES module support"
fi

echo

# Check 7: Environment
print_check "Environment variables..."
if [ -n "$OLLAMA_HOST" ]; then
    print_ok "OLLAMA_HOST: $OLLAMA_HOST"
else
    print_ok "OLLAMA_HOST: default (localhost:11434)"
fi

if [ -n "$DEEPCODE_MODEL" ]; then
    print_ok "DEEPCODE_MODEL: $DEEPCODE_MODEL"
else
    print_ok "DEEPCODE_MODEL: default (deepseek-coder)"
fi

echo

# Final recommendations
echo "🎯 RECOMMENDATIONS:"
echo "==================="

# Check for context files
if [ -f "CLAUDE.md" ] || [ -f "README.md" ]; then
    print_ok "Project context files found"
else
    print_warning "No context files found"
    echo "  Create CLAUDE.md with project information for better AI responses"
fi

# System resources
AVAILABLE_MEMORY=$(free -h 2>/dev/null | grep "Mem:" | awk '{print $7}' || echo "unknown")
if [ "$AVAILABLE_MEMORY" != "unknown" ]; then
    print_ok "Available memory: $AVAILABLE_MEMORY"
else
    print_warning "Cannot determine available memory"
    echo "  Ensure you have at least 4GB RAM for optimal performance"
fi

echo
echo "🚀 QUICK FIXES:"
echo "==============="
echo "1. Start Ollama: ollama serve"
echo "2. Download model: ollama pull deepseek-coder" 
echo "3. Test model: ollama run deepseek-coder 'hello'"
echo "4. Run DeepCode: ./bin/deepcode"
echo
echo "📋 Full test command:"
echo "curl -s http://localhost:11434/api/version && ollama run deepseek-coder 'test' && ./bin/deepcode"