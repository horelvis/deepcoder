#!/bin/bash

# DeepCoder AI Installation Script
set -e

echo "🚀 Installing DeepCoder AI..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Check if Node.js is installed
check_nodejs() {
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
        
        # Check if version is >= 18
        MAJOR_VERSION=$(echo $NODE_VERSION | sed 's/v//' | cut -d. -f1)
        if [ "$MAJOR_VERSION" -lt 18 ]; then
            print_error "Node.js version 18 or higher is required"
            print_status "Please update Node.js: https://nodejs.org/"
            exit 1
        fi
    else
        print_error "Node.js is not installed"
        print_status "Please install Node.js: https://nodejs.org/"
        exit 1
    fi
}

# Check if Ollama is installed
check_ollama() {
    if command -v ollama >/dev/null 2>&1; then
        OLLAMA_VERSION=$(ollama --version)
        print_success "Ollama found: $OLLAMA_VERSION"
    else
        print_warning "Ollama is not installed"
        print_status "Installing Ollama..."
        
        # Install Ollama
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL https://ollama.ai/install.sh | sh
            print_success "Ollama installed successfully"
        else
            print_error "curl is required to install Ollama"
            print_status "Please install Ollama manually: https://ollama.ai"
            exit 1
        fi
    fi
}

# Download and setup DeepSeek model
setup_model() {
    print_status "Setting up DeepSeek Coder model..."
    
    # Check if model exists
    if ollama list | grep -q "deepseek-coder"; then
        print_success "DeepSeek Coder model already exists"
    else
        print_status "Downloading DeepSeek Coder model (this may take a while)..."
        ollama pull deepseek-coder
        print_success "DeepSeek Coder model downloaded successfully"
    fi
}

# Make the script executable
setup_executable() {
    print_status "Setting up executable permissions..."
    
    if [ -f "bin/deepcoder" ]; then
        chmod +x bin/deepcoder
        print_success "Made bin/deepcoder executable"
    else
        print_error "bin/deepcoder file not found"
        exit 1
    fi
}

# Create symbolic link for global access (optional)
setup_global_link() {
    read -p "Do you want to install DeepCoder AI globally? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        INSTALL_DIR="/usr/local/bin"
        CURRENT_DIR=$(pwd)
        
        if [ -w "$INSTALL_DIR" ]; then
            ln -sf "$CURRENT_DIR/bin/deepcoder" "$INSTALL_DIR/deepcoder"
            print_success "DeepCoder AI installed globally"
            print_status "You can now run 'deepcoder' from anywhere"
        else
            print_status "Creating global link requires sudo permissions..."
            sudo ln -sf "$CURRENT_DIR/bin/deepcoder" "$INSTALL_DIR/deepcoder"
            print_success "DeepCoder AI installed globally with sudo"
            print_status "You can now run 'deepcoder' from anywhere"
        fi
    else
        print_status "Skipping global installation"
        print_status "You can run DeepCoder AI with: ./bin/deepcoder"
    fi
}

# Create initial project context file
create_context_file() {
    if [ ! -f "CLAUDE.md" ] && [ ! -f "README.md" ]; then
        print_status "Creating initial context file..."
        
        cat > CLAUDE.md << 'EOF'
# DeepCoder AI Project Context

## Project Overview
This is a new project using DeepCoder AI for intelligent coding assistance.

## Architecture
- Language: [Specify your primary language]
- Framework: [Specify your framework]
- Database: [Specify your database if applicable]

## Current Focus
- [Describe what you're currently working on]
- [Any specific goals or challenges]

## Code Style & Preferences
- [Any coding standards or preferences]
- [Testing frameworks used]
- [Deployment preferences]

## Notes
- Add project-specific context here to help DeepCoder AI understand your codebase better
- Update this file as your project evolves
EOF
        
        print_success "Created CLAUDE.md context file"
        print_status "Edit CLAUDE.md to provide project-specific context"
    fi
}

# Main installation process
main() {
    echo "🧠 DeepCoder AI Installation"
    echo "============================"
    echo
    
    print_status "Checking prerequisites..."
    check_nodejs
    check_ollama
    
    print_status "Setting up DeepCoder AI..."
    setup_executable
    setup_model
    create_context_file
    
    echo
    print_success "Installation completed successfully!"
    echo
    echo "🎯 Next steps:"
    echo "1. Edit CLAUDE.md to provide project context"
    echo "2. Run DeepCoder AI with: ./bin/deepcoder"
    echo "3. Type 'help' to see available commands"
    echo
    
    setup_global_link
    
    echo
    print_success "🚀 DeepCoder AI is ready to use!"
    echo "💡 Run './bin/deepcoder' or 'deepcoder' (if installed globally) to start"
}

# Run main function
main