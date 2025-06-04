# DeepCode AI 🧠

> **Intelligent coding agent powered by Ollama + DeepSeek with advanced contextual capabilities**

DeepCode AI is a sophisticated command-line coding assistant that transforms your development workflow. Inspired by Claude Code, it provides intelligent code analysis, editing, and generation capabilities while maintaining full project context awareness.

## ✨ Features

### 🚀 **Core Capabilities**
- **Intelligent Q&A**: Ask complex coding questions with project-aware responses
- **Deep Code Analysis**: Comprehensive code review with security and performance insights
- **Smart File Editing**: AI-powered code modifications with automatic backups
- **File Generation**: Create new files from natural language descriptions
- **Project Scanning**: Intelligent project structure analysis and visualization

### 🧠 **Advanced AI Features**
- **Contextual Memory**: Maintains conversation history for coherent long-form discussions
- **Project Context Loading**: Automatically reads CLAUDE.md, README.md, and other context files
- **File Reference Detection**: Smart detection and inclusion of relevant files in prompts
- **Multi-source Context**: Combines project docs, file contents, and conversation history

### 🛡️ **Safety & Reliability**
- **Automatic Backups**: Creates timestamped backups before any file modifications
- **Error Handling**: Robust error management with clear, actionable messages
- **File Validation**: Comprehensive file existence and permission checks
- **Graceful Degradation**: Continues operation even when some features are unavailable

## 🚀 Quick Start

### Prerequisites

1. **Install Ollama**
   ```bash
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

2. **Install Node.js** (v18 or higher)
   ```bash
   # Using nvm (recommended)
   nvm install 18
   nvm use 18
   ```

### Installation

1. **Clone or download** the DeepCode AI script
2. **Make it executable**:
   ```bash
   chmod +x bin/deepcode
   ```
3. **Run the agent**:
   ```bash
   ./bin/deepcode
   ```

The agent will automatically download the `deepseek-coder` model on first run.

## 📖 Usage Guide

### Interactive Mode

Start DeepCode AI and use natural language commands:

```bash
🧠 deepcode > ask "How can I optimize this React component?"
🧠 deepcode > analyze src/components/Header.jsx  
🧠 deepcode > edit package.json
🧠 deepcode > create utils/validation.js "input validation utilities"
```

### Available Commands

#### 📝 **Basic Commands**
```bash
ask <question>              # Ask coding questions with project context
help                        # Show detailed command help
exit                        # Exit the application
```

#### 🔍 **Analysis Commands**
```bash
analyze <file>              # Deep analysis of code files
scan                        # Scan and analyze project structure
```

#### ✏️ **Editing Commands**
```bash
edit <file>                 # Edit files with AI assistance
create <file> <description> # Generate new files from descriptions
```

### Command Examples

#### Ask Complex Questions
```bash
ask "What design patterns should I use for this microservices architecture?"
ask "How to implement JWT authentication securely in Node.js?"
ask "Best practices for React state management in large applications?"
```

#### Analyze Code Quality
```bash
analyze src/auth/login.js
analyze components/UserDashboard.tsx
analyze utils/database.py
```

#### Smart File Creation
```bash
create middleware/auth.js "JWT authentication middleware for Express"
create types/user.ts "TypeScript interfaces for user management"
create tests/api.test.js "comprehensive API testing suite"
```

## 🏗️ Architecture

### Modular Design

```
DeepCode AI
├── 🎛️ AgentState          # Session management & history
├── 📁 FileManager         # Async file operations & scanning
├── 🤖 AIEngine             # Ollama integration & prompt building
├── ⚡ AgentCommands        # Specialized command handlers
└── 💬 InteractiveCLI       # User interface & interaction
```

### Context Building System

1. **Project Context**: Automatically loads documentation files
2. **File Context**: Intelligently includes relevant source files
3. **Conversation History**: Maintains contextual memory
4. **Dynamic Prompting**: Builds optimal prompts for each query

## ⚙️ Configuration

### Environment Variables

```bash
# Ollama configuration
export OLLAMA_API_URL="http://localhost:11434"
export DEEPCODE_MODEL="deepseek-coder"

# Optional: Custom context files
export DEEPCODE_CONTEXT_FILES="CLAUDE.md,README.md,DOCS.md"
```

### Project Context Files

Create any of these files in your project root for enhanced context:

- `CLAUDE.md` - Primary project context and instructions
- `README.md` - Project overview and documentation  
- `.deepcode.md` - DeepCode-specific configuration and context

### Model Options

DeepCode AI supports multiple Ollama models:

```bash
# Code-specialized models (recommended)
deepseek-coder          # Default: Best balance of capability and speed
codellama              # Meta's code model
starcoder              # Hugging Face's code model

# General models
llama2                 # General purpose
mistral                # Fast and capable
```

## 🎯 Best Practices

### Optimizing Context

1. **Maintain Documentation**
   ```markdown
   # CLAUDE.md
   ## Project Overview
   This is a React/Node.js e-commerce platform...
   
   ## Architecture
   - Frontend: React with TypeScript
   - Backend: Node.js with Express
   - Database: PostgreSQL with Prisma ORM
   
   ## Current Focus
   - Implementing payment processing
   - Optimizing database queries
   ```

2. **Use Descriptive File Names**
   ```bash
   # Good
   analyze components/ProductCard.tsx
   create utils/paymentValidation.js
   
   # Less optimal
   analyze file.js
   create helper.js
   ```

3. **Provide Clear Instructions**
   ```bash
   # Detailed context helps
   edit src/api/users.js "add input validation and error handling for user registration"
   
   # vs basic instruction
   edit src/api/users.js "fix bugs"
   ```

### File Organization

```
your-project/
├── CLAUDE.md              # Project context for DeepCode
├── src/
│   ├── components/
│   ├── utils/
│   └── api/
├── tests/
└── docs/
```

## 🗺️ Roadmap

### 🎯 **v1.1 - Enhanced Intelligence** (Q2 2024)
- [ ] **Multi-file Operations**: Edit multiple related files simultaneously
- [ ] **Dependency Analysis**: Understand and suggest imports/dependencies
- [ ] **Test Generation**: Automatic test file creation for existing code
- [ ] **Code Refactoring**: Advanced refactoring suggestions and implementations
- [ ] **Performance Profiling**: Built-in performance analysis and optimization

### 🚀 **v1.2 - Developer Experience** (Q3 2024)
- [ ] **IDE Integration**: VS Code extension for seamless workflow
- [ ] **Git Integration**: Commit message generation and code review assistance
- [ ] **Documentation Generator**: Automatic README and API docs generation
- [ ] **Code Formatting**: Integration with Prettier, ESLint, and other tools
- [ ] **Language Server**: LSP implementation for real-time assistance

### 🌐 **v1.3 - Collaboration & Deployment** (Q4 2024)
- [ ] **Team Features**: Shared context and collaborative coding sessions
- [ ] **Remote Models**: Support for cloud-based and custom model endpoints
- [ ] **CI/CD Integration**: GitHub Actions, GitLab CI pipeline generation
- [ ] **Deployment Automation**: Docker, Kubernetes, and cloud deployment assistance
- [ ] **Security Scanning**: Built-in security vulnerability detection

### 🔮 **v2.0 - Advanced Capabilities** (2025)
- [ ] **Visual Interface**: Web-based GUI for complex operations
- [ ] **Plugin System**: Extensible architecture for custom commands
- [ ] **Multi-language Support**: Enhanced support for Python, Go, Rust, etc.
- [ ] **AI Model Training**: Fine-tune models on your specific codebase
- [ ] **Enterprise Features**: SSO, audit logs, compliance reporting

### 🎨 **Community & Ecosystem**
- [ ] **Plugin Marketplace**: Community-driven extensions and integrations
- [ ] **Template Library**: Reusable project templates and boilerplates
- [ ] **Learning Mode**: Interactive coding tutorials and best practices
- [ ] **Code Review Bot**: Automated PR reviews and suggestions
- [ ] **Metrics Dashboard**: Code quality and productivity analytics

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### 🐛 **Bug Reports**
- Use GitHub Issues with detailed reproduction steps
- Include environment details (OS, Node.js version, Ollama version)
- Provide relevant code snippets and error messages

### 💡 **Feature Requests**
- Check the roadmap to avoid duplicates
- Provide clear use cases and benefits
- Consider implementation complexity and user impact

### 🔧 **Development**
```bash
# Fork the repository
git clone https://github.com/yourusername/deepcode-ai
cd deepcode-ai

# Install dependencies
npm install

# Run tests
npm test

# Submit a pull request
```

### 📝 **Documentation**
- Improve README, code comments, or examples
- Create tutorials and best practice guides
- Translate documentation to other languages

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ollama Team** - For the excellent local AI model runtime
- **DeepSeek** - For the powerful coding model
- **Claude Code** - For inspiration and architectural patterns
- **Open Source Community** - For continuous feedback and contributions

---

## 📞 Support

- 📚 **Documentation**: [GitHub Wiki](https://github.com/horelvis/deepcoder/wiki)
- 💬 **Community**: [GitHub Discussions](https://github.com/horelvis/deepcoder/discussions)
- 🐛 **Issues**: [GitHub Issues](https://github.com/horelvis/deepcoder/issues)
- 🐦 **Updates**: Follow [@DeepCodeAI](https://twitter.com/deepcodeai)

---

**Made with ❤️ by the DeepCode AI team**

*Transform your coding workflow with AI-powered intelligence.*
