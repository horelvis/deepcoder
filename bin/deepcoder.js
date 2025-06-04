#!/usr/bin/env node

/**
 * DeepCoder AI Agent - Intelligent coding assistant
 * Enhanced version with intelligent interface without explicit commands
 */

import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

// === Configuration ===
const CONFIG = {
  model: process.env.DEEPCODE_MODEL || 'deepseek-coder',
  ollamaHost: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  maxHistoryTokens: 8000,
  contextFiles: ['CLAUDE.md', 'README.md', '.deepcode.md'],
  excludePatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '*.log',
    '.env*',
    '*.min.js'
  ]
};

// === Global State ===
class AgentState {
  constructor() {
    this.sessionHistory = [];
    this.currentProject = null;
    this.activeFiles = new Map();
    this.lastCommand = null;
  }

  addToHistory(role, content, metadata = {}) {
    this.sessionHistory.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    this.trimHistory();
  }

  trimHistory() {
    if (this.sessionHistory.length > 40) {
      this.sessionHistory = this.sessionHistory.slice(-20);
    }
  }

  getContextualHistory() {
    return this.sessionHistory
      .slice(-10)
      .map(({ role, content }) => `### ${role.toUpperCase()}\n${content}`)
      .join('\n\n');
  }
}

const agentState = new AgentState();

// === System Utilities ===
class FileManager {
  static async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async readFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Could not read file ${filePath}: ${error.message}`);
    }
  }

  static async writeFile(filePath, content) {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Could not write file ${filePath}: ${error.message}`);
    }
  }

  static async createBackup(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    
    if (await this.exists(filePath)) {
      const content = await this.readFile(filePath);
      await this.writeFile(backupPath, content);
      return backupPath;
    }
    return null;
  }

  static async scanProject(rootPath = '.') {
    const files = [];
    
    async function scanDir(dirPath) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(rootPath, fullPath);
          
          if (CONFIG.excludePatterns.some(pattern => 
            relativePath.includes(pattern) || entry.name.match(pattern))) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            files.push({
              path: relativePath,
              fullPath,
              name: entry.name,
              ext: path.extname(entry.name)
            });
          }
        }
      } catch (error) {
        // Ignore directories without permissions
      }
    }
    
    await scanDir(rootPath);
    return files;
  }

  static async getProjectFiles() {
    const files = await this.scanProject();
    return files.filter(file => {
      const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.cs', '.swift', '.kt'];
      return codeExtensions.includes(file.ext);
    });
  }
}

// === Intelligence Engine ===
class IntelligenceEngine {
  static async analyzeInput(input) {
    // Detect special commands
    if (input.startsWith('/')) {
      return { type: 'command', command: input.slice(1) };
    }

    // Detect mentioned files
    const mentionedFiles = await this.extractFileReferences(input);
    
    // Detect intent patterns
    const patterns = {
      edit: /(?:edit|modify|change|update|fix)\s+(.+)/i,
      create: /(?:create|generate|make|build)\s+(.+)/i,
      analyze: /(?:analyze|review|check|examine|look at)\s+(.+)/i,
      scan: /(?:scan|list|show)\s+(?:project|files|structure)/i,
      explain: /(?:explain|what|how|why|tell me about)/i
    };

    for (const [intent, pattern] of Object.entries(patterns)) {
      const match = input.match(pattern);
      if (match) {
        return {
          type: 'intent',
          intent,
          target: match[1]?.trim(),
          mentionedFiles,
          originalInput: input
        };
      }
    }

    // Default to question/conversation
    return {
      type: 'conversation',
      mentionedFiles,
      originalInput: input
    };
  }

  static async extractFileReferences(text) {
    const filePattern = /(?:^|\s)([.\w/-]+\.[a-z]{1,4})(?:\s|$)/gi;
    const matches = text.match(filePattern) || [];
    const foundFiles = [];
    
    for (const match of matches) {
      const filePath = match.trim();
      if (await FileManager.exists(filePath)) {
        foundFiles.push(filePath);
      }
    }
    
    return foundFiles;
  }
}

// === AI Engine ===
class AIEngine {
  static async callOllama(prompt, options = {}) {
    const { temperature = 0.7, stream = false } = options;
    
    try {
      await this.verifyOllamaConnection();
      const fullPrompt = await this.buildContextualPrompt(prompt);
      
      const response = execSync(`ollama run ${CONFIG.model}`, {
        input: fullPrompt,
        encoding: 'utf-8',
        env: { 
          ...process.env, 
          OLLAMA_HOST: CONFIG.ollamaHost 
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000
      });

      agentState.addToHistory('user', prompt);
      agentState.addToHistory('assistant', response);

      return response.trim();
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error('Ollama service is not running. Start it with: ollama serve');
      } else if (error.message.includes('model') && error.message.includes('not found')) {
        throw new Error(`Model "${CONFIG.model}" not found. Download it with: ollama pull ${CONFIG.model}`);
      } else if (error.message.includes('timeout')) {
        throw new Error('Ollama request timed out. The model might be loading or the query is too complex.');
      } else {
        throw new Error(`Error communicating with Ollama: ${error.message}\n\nTroubleshooting:\n1. Check if Ollama is running: ollama list\n2. Verify model exists: ollama pull ${CONFIG.model}\n3. Test manually: ollama run ${CONFIG.model} "test"`);
      }
    }
  }

  static async verifyOllamaConnection() {
    try {
      execSync('curl -s http://localhost:11434/api/version', { 
        stdio: 'ignore',
        timeout: 5000 
      });
    } catch (error) {
      throw new Error('Cannot connect to Ollama service. Make sure Ollama is running with: ollama serve');
    }

    try {
      const modelList = execSync('ollama list', { 
        encoding: 'utf-8',
        timeout: 5000 
      });
      
      if (!modelList.includes(CONFIG.model)) {
        throw new Error(`Model "${CONFIG.model}" not found. Download it with: ollama pull ${CONFIG.model}`);
      }
    } catch (error) {
      if (error.message.includes('Model')) {
        throw error;
      }
      throw new Error('Cannot verify Ollama models. Make sure Ollama is properly installed.');
    }
  }

  static async buildContextualPrompt(userInput) {
    const projectContext = await this.loadProjectContext();
    const fileContext = await this.getRelevantFileContext(userInput);
    const history = agentState.getContextualHistory();
    const projectStructure = await this.getProjectOverview();

    return `
# PROJECT CONTEXT
${projectContext}

# PROJECT STRUCTURE
${projectStructure}

# RELEVANT FILES
${fileContext}

# CONVERSATION HISTORY
${history}

# USER INSTRUCTION
${userInput}

# INSTRUCTIONS FOR ASSISTANT
You are an expert AI coding agent. Respond concisely and practically.
- Provide functional and well-commented code
- Explain your technical decisions
- Suggest best practices when relevant
- If modifying files, clearly explain the changes
- Use the project context and structure to provide relevant answers
`.trim();
  }

  static async getProjectOverview() {
    try {
      const files = await FileManager.scanProject();
      const codeFiles = files.filter(file => {
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.cs', '.swift', '.kt', '.html', '.css', '.scss', '.vue', '.svelte'];
        return codeExtensions.includes(file.ext);
      });

      const techStack = this.detectTechStack(files);
      
      let packageInfo = '';
      if (await FileManager.exists('package.json')) {
        try {
          const pkg = JSON.parse(await FileManager.readFile('package.json'));
          packageInfo = `
Project: ${pkg.name || 'Unknown'}
Version: ${pkg.version || 'Unknown'}
Description: ${pkg.description || 'No description'}`;
        } catch (error) {
          packageInfo = '\nProject: package.json found but could not be parsed';
        }
      }

      return `
Files: ${files.length} total, ${codeFiles.length} code files
Tech Stack: ${techStack.join(', ')}${packageInfo}

Key Directories:
${this.getKeyDirectories(files)}

Main Files:
${this.getMainFiles(codeFiles)}`.trim();
    } catch (error) {
      return 'Project structure analysis unavailable';
    }
  }

  static detectTechStack(files) {
    const stack = new Set();
    
    // Check for common files and patterns
    const indicators = {
      'JavaScript/Node.js': files.some(f => f.name === 'package.json'),
      'TypeScript': files.some(f => f.ext === '.ts' || f.name === 'tsconfig.json'),
      'React': files.some(f => f.ext === '.jsx' || f.ext === '.tsx'),
      'Vue.js': files.some(f => f.ext === '.vue'),
      'Python': files.some(f => f.ext === '.py' || f.name === 'requirements.txt'),
      'Go': files.some(f => f.ext === '.go' || f.name === 'go.mod'),
      'Rust': files.some(f => f.ext === '.rs' || f.name === 'Cargo.toml'),
      'Java': files.some(f => f.ext === '.java' || f.name === 'pom.xml'),
      'C/C++': files.some(f => f.ext === '.c' || f.ext === '.cpp' || f.ext === '.h'),
      'PHP': files.some(f => f.ext === '.php'),
      'Ruby': files.some(f => f.ext === '.rb' || f.name === 'Gemfile'),
      'C#': files.some(f => f.ext === '.cs'),
      'Swift': files.some(f => f.ext === '.swift'),
      'Kotlin': files.some(f => f.ext === '.kt'),
      'HTML/CSS': files.some(f => f.ext === '.html' || f.ext === '.css'),
      'Docker': files.some(f => f.name === 'Dockerfile' || f.name === 'docker-compose.yml')
    };

    Object.entries(indicators).forEach(([tech, detected]) => {
      if (detected) stack.add(tech);
    });

    return stack.size > 0 ? Array.from(stack) : ['Unknown'];
  }

  static getKeyDirectories(files) {
    const dirs = new Set();
    files.forEach(file => {
      const parts = file.path.split('/');
      if (parts.length > 1) {
        dirs.add(parts[0]);
      }
    });
    
    const dirList = Array.from(dirs).slice(0, 8);
    return dirList.length > 0 ? dirList.map(dir => `  - ${dir}/`).join('\n') : '  - (root level files only)';
  }

  static getMainFiles(codeFiles) {
    const importantFiles = codeFiles.filter(file => {
      const important = [
        'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
        'server.js', 'server.ts', 'index.html', 'main.py', '__init__.py',
        'main.go', 'main.rs', 'App.jsx', 'App.tsx'
      ];
      return important.includes(file.name) || file.path.includes('src/');
    });

    const filesToShow = importantFiles.length > 0 ? importantFiles.slice(0, 8) : codeFiles.slice(0, 5);
    return filesToShow.length > 0 ? filesToShow.map(file => `  - ${file.path}`).join('\n') : '  - (no main files detected)';
  }

  static async loadProjectContext() {
    let context = '';
    
    for (const contextFile of CONFIG.contextFiles) {
      if (await FileManager.exists(contextFile)) {
        const content = await FileManager.readFile(contextFile);
        context += `\n## ${contextFile}\n${content}\n`;
      }
    }
    
    return context || '# Project without specific context files';
  }

  static async getRelevantFileContext(userInput) {
    const mentionedFiles = await IntelligenceEngine.extractFileReferences(userInput);
    let context = '';
    
    for (const filePath of mentionedFiles) {
      if (await FileManager.exists(filePath)) {
        const content = await FileManager.readFile(filePath);
        context += `\n## ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`;
      }
    }
    
    return context;
  }
}

// === AI Tools ===
class AITools {
  static async executeCommand(command, args = []) {
    try {
      const result = execSync(`${command} ${args.join(' ')}`, {
        encoding: 'utf-8',
        timeout: 10000,
        cwd: process.cwd()
      });
      return { success: true, output: result.trim() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async runTests() {
    const testCommands = ['npm test', 'yarn test', 'pytest', 'go test', 'cargo test'];
    
    for (const cmd of testCommands) {
      const [command, ...args] = cmd.split(' ');
      try {
        execSync(`which ${command}`, { stdio: 'ignore' });
        const result = await this.executeCommand(command, args);
        if (result.success || result.error.includes('test')) {
          return { command: cmd, ...result };
        }
      } catch {
        continue;
      }
    }
    
    return { success: false, error: 'No test runner found' };
  }

  static async lintCode(filePath = '.') {
    const linters = [
      { cmd: 'eslint', args: [filePath, '--format', 'compact'] },
      { cmd: 'pylint', args: [filePath] },
      { cmd: 'golint', args: [filePath] },
      { cmd: 'rustfmt', args: ['--check', filePath] }
    ];

    for (const { cmd, args } of linters) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return await this.executeCommand(cmd, args);
      } catch {
        continue;
      }
    }

    return { success: false, error: 'No linter found' };
  }

  static async formatCode(filePath) {
    const formatters = [
      { cmd: 'prettier', args: ['--write', filePath] },
      { cmd: 'black', args: [filePath] },
      { cmd: 'gofmt', args: ['-w', filePath] },
      { cmd: 'rustfmt', args: [filePath] }
    ];

    for (const { cmd, args } of formatters) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return await this.executeCommand(cmd, args);
      } catch {
        continue;
      }
    }

    return { success: false, error: 'No formatter found' };
  }

  static async getGitStatus() {
    try {
      const status = await this.executeCommand('git', ['status', '--porcelain']);
      const branch = await this.executeCommand('git', ['branch', '--show-current']);
      const lastCommit = await this.executeCommand('git', ['log', '-1', '--oneline']);
      
      return {
        success: true,
        status: status.output,
        branch: branch.output,
        lastCommit: lastCommit.output
      };
    } catch {
      return { success: false, error: 'Not a git repository' };
    }
  }

  static async getDependencies() {
    const packageFiles = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml'];
    const dependencies = {};

    for (const file of packageFiles) {
      if (await FileManager.exists(file)) {
        try {
          const content = await FileManager.readFile(file);
          
          if (file === 'package.json') {
            const pkg = JSON.parse(content);
            dependencies.npm = {
              dependencies: pkg.dependencies || {},
              devDependencies: pkg.devDependencies || {}
            };
          } else {
            dependencies[file] = content;
          }
        } catch (error) {
          dependencies[file] = `Error reading: ${error.message}`;
        }
      }
    }

    return dependencies;
  }

  static async searchInProject(query, filePattern = '*') {
    try {
      const result = await this.executeCommand('grep', ['-r', '--include=' + filePattern, query, '.']);
      return {
        success: true,
        matches: result.output.split('\n').filter(line => line.trim())
      };
    } catch {
      try {
        const result = await this.executeCommand('findstr', ['/S', '/I', query, filePattern]);
        return {
          success: true,
          matches: result.output.split('\n').filter(line => line.trim())
        };
      } catch {
        return { success: false, error: 'Search command not available' };
      }
    }
  }

  static async getProjectStructure() {
    try {
      const result = await this.executeCommand('tree', ['-I', 'node_modules|.git|dist|build']);
      return { success: true, structure: result.output };
    } catch {
      // Fallback to manual tree
      const files = await FileManager.scanProject();
      const structure = this.buildTreeStructure(files);
      return { success: true, structure };
    }
  }

  static buildTreeStructure(files) {
    const tree = {};
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current[part] = 'file';
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });

    return this.formatTree(tree);
  }

  static formatTree(obj, prefix = '', isLast = true) {
    let result = '';
    const entries = Object.entries(obj);
    
    entries.forEach(([key, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? '└── ' : '├── ';
      result += prefix + connector + key + '\n';
      
      if (typeof value === 'object') {
        const newPrefix = prefix + (isLastEntry ? '    ' : '│   ');
        result += this.formatTree(value, newPrefix, isLastEntry);
      }
    });
    
    return result;
  }

  static async installDependency(packageName, isDev = false) {
    const managers = [
      { cmd: 'npm', installArgs: ['install', isDev ? '--save-dev' : '--save'] },
      { cmd: 'yarn', installArgs: ['add', isDev ? '--dev' : ''] },
      { cmd: 'pnpm', installArgs: ['add', isDev ? '--save-dev' : ''] }
    ];

    for (const { cmd, installArgs } of managers) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        const args = [...installArgs.filter(arg => arg), packageName];
        return await this.executeCommand(cmd, args);
      } catch {
        continue;
      }
    }

    return { success: false, error: 'No package manager found' };
  }
}

// === Enhanced AI Engine ===
class EnhancedAIEngine extends AIEngine {
  static async buildEnhancedPrompt(userInput) {
    const basePrompt = await super.buildContextualPrompt(userInput);
    const tools = await this.gatherToolContext(userInput);
    
    return `${basePrompt}

# AVAILABLE TOOLS
${tools}

# TOOL USAGE INSTRUCTIONS
You can use tools by responding with JSON in this format:
{
  "action": "tool_name",
  "parameters": {...},
  "explanation": "Why you're using this tool"
}

Available tools:
- execute_command: Run shell commands
- run_tests: Execute project tests
- lint_code: Check code quality
- format_code: Format code files
- git_status: Get git repository status
- search_project: Search for text in project
- get_dependencies: List project dependencies
- install_dependency: Install new packages
- get_structure: Show project structure

If you don't need tools, respond normally with text.`;
  }

  static async callOllama(prompt, options = {}) {
    const { temperature = 0.7, stream = false } = options;
    
    try {
      await this.verifyOllamaConnection();
      const fullPrompt = await this.buildEnhancedPrompt(prompt);
      
      const response = execSync(`ollama run ${CONFIG.model}`, {
        input: fullPrompt,
        encoding: 'utf-8',
        env: { 
          ...process.env, 
          OLLAMA_HOST: CONFIG.ollamaHost 
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000
      });

      agentState.addToHistory('user', prompt);
      agentState.addToHistory('assistant', response);

      return response.trim();
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error('Ollama service is not running. Start it with: ollama serve');
      } else if (error.message.includes('model') && error.message.includes('not found')) {
        throw new Error(`Model "${CONFIG.model}" not found. Download it with: ollama pull ${CONFIG.model}`);
      } else if (error.message.includes('timeout')) {
        throw new Error('Ollama request timed out. The model might be loading or the query is too complex.');
      } else {
        throw new Error(`Error communicating with Ollama: ${error.message}\n\nTroubleshooting:\n1. Check if Ollama is running: ollama list\n2. Verify model exists: ollama pull ${CONFIG.model}\n3. Test manually: ollama run ${CONFIG.model} "test"`);
      }
    }
  }

  static async gatherToolContext(userInput) {
    let context = '';
    
    // Add git context if available
    const gitStatus = await AITools.getGitStatus();
    if (gitStatus.success) {
      context += `\n## Git Status\nBranch: ${gitStatus.branch}\nLast commit: ${gitStatus.lastCommit}\n`;
    }

    // Add dependency context
    const deps = await AITools.getDependencies();
    if (Object.keys(deps).length > 0) {
      context += `\n## Dependencies\n${JSON.stringify(deps, null, 2)}\n`;
    }

    return context;
  }

  static async processToolResponse(response) {
    try {
      const parsed = JSON.parse(response);
      if (parsed.action) {
        return await this.executeTool(parsed);
      }
    } catch {
      // Not a tool response, return as normal text
      return { type: 'text', content: response };
    }
    
    return { type: 'text', content: response };
  }

  static async executeTool(toolCall) {
    const { action, parameters, explanation } = toolCall;
    
    console.log(`🔧 Using tool: ${action}`);
    if (explanation) console.log(`💭 ${explanation}`);
    
    let result;
    
    switch (action) {
      case 'execute_command':
        result = await AITools.executeCommand(parameters.command, parameters.args || []);
        break;
      
      case 'run_tests':
        result = await AITools.runTests();
        break;
      
      case 'lint_code':
        result = await AITools.lintCode(parameters.path);
        break;
      
      case 'format_code':
        result = await AITools.formatCode(parameters.path);
        break;
      
      case 'git_status':
        result = await AITools.getGitStatus();
        break;
      
      case 'search_project':
        result = await AITools.searchInProject(parameters.query, parameters.pattern);
        break;
      
      case 'get_dependencies':
        result = await AITools.getDependencies();
        break;
      
      case 'install_dependency':
        result = await AITools.installDependency(parameters.package, parameters.isDev);
        break;
      
      case 'get_structure':
        result = await AITools.getProjectStructure();
        break;
      
      default:
        result = { success: false, error: `Unknown tool: ${action}` };
    }
    
    return { type: 'tool', action, result };
  }
}

// === Smart Agent Commands ===
class SmartAgent {
  static async processInput(input) {
    const analysis = await IntelligenceEngine.analyzeInput(input);
    
    switch (analysis.type) {
      case 'command':
        return await this.handleCommand(analysis.command);
      
      case 'intent':
        return await this.handleIntent(analysis);
      
      case 'conversation':
        return await this.handleConversation(analysis);
      
      default:
        return await this.handleConversation(analysis);
    }
  }

  static async handleCommand(command) {
    const [cmd, ...args] = command.split(' ');
    
    switch (cmd.toLowerCase()) {
      case 'help':
        return this.showHelp();
      
      case 'ollama':
        if (args[0] === 'config') {
          return SmartAgent.showOllamaConfig();
        } else if (args[0] === 'test') {
          return await SmartAgent.testOllama();
        }
        return 'Available ollama commands: /ollama config, /ollama test';
      
      case 'model':
        if (!args[0]) {
          return SmartAgent.showAvailableModels();
        } else if (args[0] === 'list') {
          return await SmartAgent.listOllamaModels();
        } else {
          return await SmartAgent.changeModel(args[0]);
        }
        break;
      
      case 'scan':
        return await this.scanProject();
      
      case 'test':
        return await this.runTests();
      
      case 'lint':
        const lintPath = args[0] || '.';
        return await this.lintCode(lintPath);
      
      case 'format':
        if (!args[0]) {
          return 'Usage: /format <file>';
        }
        return await this.formatCode(args[0]);
      
      case 'git':
        return await this.showGitStatus();
      
      case 'deps':
        return await this.showDependencies();
      
      case 'install':
        if (!args[0]) {
          return 'Usage: /install <package> [--dev]';
        }
        const isDev = args.includes('--dev');
        return await this.installPackage(args[0], isDev);
      
      case 'search':
        if (!args[0]) {
          return 'Usage: /search <query> [pattern]';
        }
        return await this.searchProject(args[0], args[1]);
      
      case 'clear':
        console.clear();
        return 'Screen cleared';
      
      default:
        return `Unknown command: /${cmd}. Type /help for available commands.`;
    }
  }

  static async handleIntent(analysis) {
    const { intent, target, mentionedFiles, originalInput } = analysis;
    
    switch (intent) {
      case 'edit':
        if (mentionedFiles.length > 0) {
          return await this.editFile(mentionedFiles[0], originalInput);
        }
        return 'Please specify a file to edit.';
      
      case 'create':
        const createMatch = originalInput.match(/create\s+(\S+)(?:\s+(.+))?/i);
        if (createMatch) {
          const fileName = createMatch[1];
          const description = createMatch[2] || 'new file';
          return await this.createFile(fileName, description);
        }
        return 'Please specify a file name and description.';
      
      case 'analyze':
        if (mentionedFiles.length > 0) {
          return await this.analyzeFile(mentionedFiles[0]);
        }
        return 'Please specify a file to analyze.';
      
      case 'scan':
        return await this.scanProject();
      
      default:
        return await this.askQuestion(originalInput);
    }
  }

  static async handleConversation(analysis) {
    return await this.askQuestion(analysis.originalInput);
  }

  static async askQuestion(question) {
    try {
      console.log('🤔 Processing your question...\n');
      
      // Use enhanced AI engine with tools
      const response = await EnhancedAIEngine.callOllama(question);
      const processedResponse = await EnhancedAIEngine.processToolResponse(response);
      
      if (processedResponse.type === 'tool') {
        console.log(`✅ Tool execution completed: ${processedResponse.action}`);
        console.log('📋 Result:');
        console.log(JSON.stringify(processedResponse.result, null, 2));
      } else {
        console.log('🤖 DeepCoder AI:\n');
        console.log(processedResponse.content);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Response provided above';
    } catch (error) {
      return `❌ Error: ${error.message}`;
    }
  }

  static async analyzeFile(filePath) {
    try {
      if (!await FileManager.exists(filePath)) {
        return `❌ File not found: ${filePath}`;
      }

      const code = await FileManager.readFile(filePath);
      const prompt = `Analyze this code and provide:
1. Functionality summary
2. Possible improvements
3. Security or performance issues
4. Refactoring suggestions

You can also use tools to get additional context like running tests, checking git status, or linting.

\`\`\`
${code}
\`\`\``;

      console.log(`🔍 Analyzing ${filePath}...\n`);
      const analysis = await EnhancedAIEngine.callOllama(prompt);
      const processedResponse = await EnhancedAIEngine.processToolResponse(analysis);
      
      if (processedResponse.type === 'tool') {
        console.log(`✅ Tool execution completed: ${processedResponse.action}`);
        console.log('📋 Tool Result:');
        console.log(JSON.stringify(processedResponse.result, null, 2));
      } else {
        console.log('📊 Code analysis:\n');
        console.log(processedResponse.content);
      }
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Analysis completed';
    } catch (error) {
      return `❌ Error during analysis: ${error.message}`;
    }
  }

  static async editFile(filePath, instruction) {
    try {
      if (!await FileManager.exists(filePath)) {
        return `❌ File not found: ${filePath}`;
      }

      const originalCode = await FileManager.readFile(filePath);
      const backupPath = await FileManager.createBackup(filePath);
      
      const prompt = `Modify the following code according to this instruction: "${instruction}"

You can use tools like running tests, linting, or formatting after making changes.

Respond ONLY with the modified code, without additional explanations.

\`\`\`
${originalCode}
\`\`\``;

      console.log(`✏️ Editing ${filePath}...\n`);
      const modifiedCode = await EnhancedAIEngine.callOllama(prompt);
      const processedResponse = await EnhancedAIEngine.processToolResponse(modifiedCode);
      
      let finalCode = modifiedCode;
      if (processedResponse.type === 'tool') {
        console.log(`✅ Tool execution completed: ${processedResponse.action}`);
        finalCode = originalCode; // Keep original if tool execution
      } else {
        finalCode = processedResponse.content;
      }
      
      const cleanCode = this.extractCodeFromResponse(finalCode);
      await FileManager.writeFile(filePath, cleanCode);
      
      console.log(`✅ File updated: ${filePath}`);
      console.log(`💾 Backup created: ${backupPath}`);
      console.log('\n📝 Changes applied:\n');
      console.log(finalCode);
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'File edited successfully';
    } catch (error) {
      return `❌ Error during editing: ${error.message}`;
    }
  }

  static async createFile(filePath, description) {
    try {
      if (await FileManager.exists(filePath)) {
        console.log(`⚠️ File ${filePath} already exists. Overwriting...`);
      }

      const prompt = `Create a file ${filePath} that ${description}

You can use tools to check dependencies, project structure, or similar files for reference.

Respond ONLY with the file code, without additional explanations.`;

      console.log(`🆕 Creating ${filePath}...\n`);
      const code = await EnhancedAIEngine.callOllama(prompt);
      const processedResponse = await EnhancedAIEngine.processToolResponse(code);
      
      let finalCode = code;
      if (processedResponse.type === 'tool') {
        console.log(`✅ Tool execution completed: ${processedResponse.action}`);
        // For creation, we might want to ask for the code after tool execution
        finalCode = await EnhancedAIEngine.callOllama(`Now create the ${filePath} file with the context gathered.`);
      } else {
        finalCode = processedResponse.content;
      }
      
      const cleanCode = this.extractCodeFromResponse(finalCode);
      await FileManager.writeFile(filePath, cleanCode);
      
      console.log(`✅ File created: ${filePath}`);
      console.log('\n📄 Generated content:\n');
      console.log(finalCode);
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'File created successfully';
    } catch (error) {
      return `❌ Error during creation: ${error.message}`;
    }
  }

  static async scanProject() {
    try {
      console.log('🔎 Scanning project...\n');
      const files = await FileManager.scanProject();
      
      const filesByType = files.reduce((acc, file) => {
        const ext = file.ext || 'no extension';
        if (!acc[ext]) acc[ext] = [];
        acc[ext].push(file.path);
        return acc;
      }, {});

      console.log('📁 Project structure:\n');
      Object.entries(filesByType).forEach(([ext, filePaths]) => {
        console.log(`${ext}: ${filePaths.length} files`);
        filePaths.slice(0, 5).forEach(filePath => {
          console.log(`  - ${filePath}`);
        });
        if (filePaths.length > 5) {
          console.log(`  ... and ${filePaths.length - 5} more`);
        }
      });
      
      console.log(`\n📊 Total: ${files.length} files found`);
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Project scan completed';
    } catch (error) {
      return `❌ Error during scanning: ${error.message}`;
    }
  }

  static async runTests() {
    try {
      console.log('🧪 Running tests...\n');
      const result = await AITools.runTests();
      
      if (result.success) {
        console.log(`✅ Tests executed with: ${result.command}`);
        console.log('📋 Output:');
        console.log(result.output);
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Test execution completed';
    } catch (error) {
      return `❌ Error running tests: ${error.message}`;
    }
  }

  static async lintCode(path) {
    try {
      console.log(`🔍 Linting code at: ${path}...\n`);
      const result = await AITools.lintCode(path);
      
      if (result.success) {
        console.log('✅ Linting completed');
        console.log('📋 Output:');
        console.log(result.output);
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Linting completed';
    } catch (error) {
      return `❌ Error linting code: ${error.message}`;
    }
  }

  static async formatCode(filePath) {
    try {
      console.log(`✨ Formatting code: ${filePath}...\n`);
      const result = await AITools.formatCode(filePath);
      
      if (result.success) {
        console.log('✅ Code formatted successfully');
        if (result.output) {
          console.log('📋 Output:');
          console.log(result.output);
        }
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Formatting completed';
    } catch (error) {
      return `❌ Error formatting code: ${error.message}`;
    }
  }

  static async showGitStatus() {
    try {
      console.log('📊 Git status...\n');
      const result = await AITools.getGitStatus();
      
      if (result.success) {
        console.log(`📍 Branch: ${result.branch}`);
        console.log(`📝 Last commit: ${result.lastCommit}`);
        console.log('📋 Status:');
        console.log(result.status || 'Working tree clean');
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Git status displayed';
    } catch (error) {
      return `❌ Error getting git status: ${error.message}`;
    }
  }

  static async showDependencies() {
    try {
      console.log('📦 Project dependencies...\n');
      const deps = await AITools.getDependencies();
      
      Object.entries(deps).forEach(([file, content]) => {
        console.log(`📄 ${file}:`);
        if (typeof content === 'object') {
          console.log(JSON.stringify(content, null, 2));
        } else {
          console.log(content);
        }
        console.log('');
      });
      
      console.log('─'.repeat(50) + '\n');
      return 'Dependencies displayed';
    } catch (error) {
      return `❌ Error getting dependencies: ${error.message}`;
    }
  }

  static async installPackage(packageName, isDev = false) {
    try {
      const devFlag = isDev ? ' (dev)' : '';
      console.log(`📥 Installing ${packageName}${devFlag}...\n`);
      const result = await AITools.installDependency(packageName, isDev);
      
      if (result.success) {
        console.log('✅ Package installed successfully');
        console.log('📋 Output:');
        console.log(result.output);
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Package installation completed';
    } catch (error) {
      return `❌ Error installing package: ${error.message}`;
    }
  }

  static async searchProject(query, pattern = '*') {
    try {
      console.log(`🔍 Searching for "${query}" in project...\n`);
      const result = await AITools.searchInProject(query, pattern);
      
      if (result.success) {
        console.log(`✅ Found ${result.matches.length} matches:`);
        result.matches.slice(0, 20).forEach(match => {
          console.log(`  ${match}`);
        });
        
        if (result.matches.length > 20) {
          console.log(`  ... and ${result.matches.length - 20} more matches`);
        }
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Search completed';
    } catch (error) {
      return `❌ Error searching: ${error.message}`;
    }
  }

  static extractCodeFromResponse(response) {
    const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }
    return response;
  }

  static showHelp() {
    console.log(`
🧠 DeepCoder AI - Smart Interface

💬 NATURAL INTERACTION
Just type naturally! Examples:
  "How can I optimize this React component?"
  "Analyze src/main.js"
  "Edit package.json to add a build script"
  "Create utils/helpers.js for validation"
  "Show me the project structure"

🔧 SPECIAL COMMANDS
  /help                    - Show this help
  /model [name]           - Change AI model (e.g., codeqwen:14b)
  /model list             - List available models
  /ollama config          - Show Ollama configuration
  /ollama test           - Test Ollama connection
  /scan                  - Scan project structure
  /clear                 - Clear screen

💡 TIPS
  - Mention file names directly in your questions
  - Use natural language for any coding task
  - Context is automatically loaded from CLAUDE.md, README.md
  - Backups are created automatically when editing files

🚀 EXAMPLES
  "What's wrong with my authentication function?"
  "Make the login form more secure"
  "Generate a React component for user profiles"
  "Review the database connection code"
`);
    return 'Help displayed';
  }

  static showOllamaConfig() {
    const configText = [
      '🔧 Ollama Configuration:',
      `  Model: ${CONFIG.model}`,
      `  Host: ${CONFIG.ollamaHost}`,
      `  Context Files: ${CONFIG.contextFiles.join(', ')}`,
      '',
      '📝 Environment Variables:',
      `  DEEPCODE_MODEL=${process.env.DEEPCODE_MODEL || 'not set (using default)'}`,
      `  OLLAMA_API_URL=${process.env.OLLAMA_API_URL || 'not set (using default)'}`
    ];

    console.log('\n' + configText.join('\n') + '\n');
    return 'Configuration displayed';
  }

  static async testOllama() {
    try {
      console.log('🧪 Testing Ollama connection...\n');
      
      await EnhancedAIEngine.verifyOllamaConnection();
      console.log('✅ Ollama service is running');
      
      const testResponse = await EnhancedAIEngine.callOllama('Say "Hello from DeepCoder AI" and nothing else.');
      console.log('✅ Model is responding');
      console.log('📝 Test response:', testResponse);
      
      return 'Ollama test completed successfully';
    } catch (error) {
      console.log(`❌ Ollama test failed: ${error.message}`);
      return 'Ollama test failed';
    }
  }

  static showAvailableModels() {
    console.log('🤖 Available Model Commands:\n');
    console.log('  /model                   - Show current model and available commands');
    console.log('  /model list             - List all installed Ollama models');
    console.log('  /model <name>           - Change to a specific model');
    console.log('\n💡 Popular coding models:');
    console.log('  • deepseek-coder        - Current default (good balance)');
    console.log('  • codeqwen:14b          - Larger model for complex tasks');
    console.log('  • codellama:7b          - Lightweight option');
    console.log('  • codellama:13b         - Good performance');
    console.log('  • phi3:mini             - Very lightweight');
    console.log('\n🔧 Current model: ' + CONFIG.model);
    console.log('📥 To install a new model: ollama pull <model-name>');
    console.log('\n' + '─'.repeat(50) + '\n');
    return 'Model commands displayed';
  }

  static async listOllamaModels() {
    try {
      console.log('🔍 Listing installed Ollama models...\n');
      const result = await AITools.executeCommand('ollama', ['list']);
      
      if (result.success) {
        console.log('📋 Installed models:');
        console.log(result.output);
        console.log(`\n🔧 Current model: ${CONFIG.model}`);
        console.log('\n💡 Use "/model <name>" to switch models');
      } else {
        console.log(`❌ ${result.error}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Model list displayed';
    } catch (error) {
      return `❌ Error listing models: ${error.message}`;
    }
  }

  static async changeModel(modelName) {
    try {
      console.log(`🔄 Changing model to: ${modelName}...\n`);
      
      // Check if model exists
      const listResult = await AITools.executeCommand('ollama', ['list']);
      if (listResult.success && !listResult.output.includes(modelName)) {
        console.log(`⚠️ Model "${modelName}" not found locally.`);
        console.log(`📥 Attempting to download model...`);
        
        const pullResult = await AITools.executeCommand('ollama', ['pull', modelName]);
        if (!pullResult.success) {
          console.log(`❌ Failed to download model: ${pullResult.error}`);
          console.log(`💡 Try manually: ollama pull ${modelName}`);
          return 'Model change failed';
        }
        console.log(`✅ Model ${modelName} downloaded successfully`);
      }
      
      // Test the model
      console.log(`🧪 Testing model ${modelName}...`);
      const oldModel = CONFIG.model;
      CONFIG.model = modelName;
      
      try {
        const testResponse = await EnhancedAIEngine.callOllama('Say "Hello" and nothing else.');
        console.log(`✅ Model ${modelName} is working correctly`);
        console.log(`📝 Test response: ${testResponse}`);
        console.log(`\n🔧 Model changed from "${oldModel}" to "${modelName}"`);
        console.log(`💾 Note: This change is temporary for this session only`);
        console.log(`🔧 To make it permanent, set: export DEEPCODE_MODEL="${modelName}"`);
      } catch (error) {
        CONFIG.model = oldModel;
        throw new Error(`Model test failed: ${error.message}`);
      }
      
      console.log('\n' + '─'.repeat(50) + '\n');
      return 'Model changed successfully';
    } catch (error) {
      return `❌ Error changing model: ${error.message}`;
    }
  }
}

// === Interactive CLI ===
class InteractiveCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🧠 deepcoder > '
    });
    
    this.setupHandlers();
  }

  setupHandlers() {
    this.rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        this.rl.prompt();
        return;
      }

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        this.rl.close();
        return;
      }

      try {
        await SmartAgent.processInput(input);
      } catch (error) {
        console.error('❌ Error:', error.message);
      }
      
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye! DeepCoder AI signing off.');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('\n\n⚠️ Closing DeepCoder AI...');
      this.rl.close();
    });
  }

  showWelcome() {
    const welcomeText = [
      '🧠 DeepCoder AI - Smart Interface with Tools',
      '',
      '💬 NATURAL INTERACTION',
      'Just type naturally! Examples:',
      '  "How can I optimize this React component?"',
      '  "Analyze src/main.js"',
      '  "Edit package.json to add a build script"',
      '  "Create utils/helpers.js for validation"',
      '  "Show me the project structure"',
      '  "Run the tests"',
      '  "What\'s the git status?"',
      '',
      '🔧 SPECIAL COMMANDS',
      '  /help                    - Show this help',
      '  /model [name]           - Change AI model (e.g., codeqwen:14b)',
      '  /model list             - List available models',
      '  /ollama config          - Show Ollama configuration',
      '  /ollama test           - Test Ollama connection',
      '  /scan                  - Scan project structure',
      '  /test                  - Run project tests',
      '  /lint [path]           - Lint code (default: .)',
      '  /format <file>         - Format code file',
      '  /git                   - Show git status',
      '  /deps                  - Show dependencies',
      '  /install <pkg> [--dev] - Install package',
      '  /search <query> [pattern] - Search in project',
      '  /clear                 - Clear screen',
      '',
      '🛠️ AI TOOLS',
      'The AI can automatically use these tools:',
      '  • Execute shell commands',
      '  • Run tests (npm, yarn, pytest, etc.)',
      '  • Lint code (eslint, pylint, etc.)',
      '  • Format code (prettier, black, etc.)',
      '  • Check git status and history',
      '  • Search through project files',
      '  • Analyze project dependencies',
      '  • Install new packages',
      '  • Get project structure',
      '',
      '💡 TOOL EXAMPLES',
      '  "Run the tests and analyze the results"',
      '  "Check if there are any linting errors in src/"',
      '  "Install lodash as a dependency"',
      '  "Search for all TODO comments"',
      '  "Format all JavaScript files"',
      '  "What\'s the current git branch and status?"',
      '',
      '📚 TIPS',
      '  - Mention file names directly in your questions',
      '  - Ask the AI to use tools when needed',
      '  - Context is automatically loaded from project',
      '  - Backups are created automatically when editing files',
      '  - The AI can chain multiple tools for complex tasks',
      '',
      `🔧 Model: ${CONFIG.model} | Host: ${CONFIG.ollamaHost}`,
      '',
      '🔍 Analyzing your project...'
    ];

    console.log('\n' + welcomeText.join('\n'));
    this.showInitialProjectContext();
  }

  async showInitialProjectContext() {
    try {
      const files = await FileManager.scanProject();
      const codeFiles = files.filter(file => {
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.cs', '.swift', '.kt'];
        return codeExtensions.includes(file.ext);
      });

      console.log(`📁 Project detected: ${files.length} files (${codeFiles.length} code files)`);
      
      // Show tech stack
      const techStack = this.detectBasicTechStack(files);
      if (techStack.length > 0) {
        console.log(`💻 Tech stack: ${techStack.join(', ')}`);
      }

      // Show main directories
      const dirs = new Set();
      files.forEach(file => {
        const parts = file.path.split('/');
        if (parts.length > 1) dirs.add(parts[0]);
      });
      
      if (dirs.size > 0) {
        console.log(`📂 Main directories: ${Array.from(dirs).slice(0, 5).join(', ')}`);
      }

      console.log('✅ Project context loaded - ready for questions!\n');
    } catch (error) {
      console.log('⚠️ Could not analyze project structure\n');
    }
  }

  detectBasicTechStack(files) {
    const stack = [];
    
    if (files.some(f => f.name === 'package.json')) stack.push('Node.js');
    if (files.some(f => f.ext === '.ts' || f.name === 'tsconfig.json')) stack.push('TypeScript');
    if (files.some(f => f.ext === '.jsx' || f.ext === '.tsx')) stack.push('React');
    if (files.some(f => f.ext === '.vue')) stack.push('Vue.js');
    if (files.some(f => f.ext === '.py')) stack.push('Python');
    if (files.some(f => f.ext === '.go')) stack.push('Go');
    if (files.some(f => f.ext === '.rs')) stack.push('Rust');
    if (files.some(f => f.ext === '.java')) stack.push('Java');
    if (files.some(f => f.ext === '.php')) stack.push('PHP');
    
    return stack;
  }

  start() {
    console.clear();
    this.showWelcome();
    this.rl.prompt();
  }
}

// === Initialization ===
async function main() {
  console.log('🧠 Starting DeepCoder AI...\n');

  try {
    console.log('🔍 Checking Ollama installation...');
    execSync('ollama --version', { stdio: 'ignore' });
    console.log('✅ Ollama is installed');
  } catch {
    console.error('❌ Ollama is not installed or not in PATH');
    console.error('📥 Install Ollama from: https://ollama.ai');
    console.error('🔧 Or run: curl -fsSL https://ollama.ai/install.sh | sh');
    process.exit(1);
  }

  try {
    console.log('🔍 Checking Ollama service...');
    execSync('curl -s http://localhost:11434/api/version', { 
      stdio: 'ignore',
      timeout: 5000 
    });
    console.log('✅ Ollama service is running');
  } catch {
    console.error('❌ Ollama service is not running');
    console.error('🚀 Start Ollama with: ollama serve');
    console.error('💡 Run it in another terminal and try again');
    process.exit(1);
  }

  try {
    console.log(`🔍 Checking model: ${CONFIG.model}...`);
    const modelList = execSync('ollama list', { encoding: 'utf-8', timeout: 10000 });
    
    if (modelList.includes(CONFIG.model)) {
      console.log(`✅ Model ${CONFIG.model} is available`);
    } else {
      console.log(`📥 Model ${CONFIG.model} not found, downloading...`);
      console.log('⏳ This may take several minutes...');
      
      try {
        execSync(`ollama pull ${CONFIG.model}`, { 
          stdio: 'inherit',
          timeout: 300000
        });
        console.log(`✅ Model ${CONFIG.model} downloaded successfully`);
      } catch (downloadError) {
        console.error(`❌ Failed to download model ${CONFIG.model}`);
        console.error('🔄 Alternative options:');
        console.error('   • Try a smaller model: export DEEPCODE_MODEL="codellama:7b"');
        console.error('   • Check your internet connection');
        console.error('   • Manually run: ollama pull deepseek-coder');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ Error checking models:', error.message);
    console.error('🔧 Try running: ollama list');
    process.exit(1);
  }

  try {
    console.log('🧪 Testing model response...');
    const testResponse = execSync(`ollama run ${CONFIG.model}`, {
      input: 'Say "Hello from DeepCoder AI" and nothing else.',
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    if (testResponse.trim()) {
      console.log('✅ Model is responding correctly');
    } else {
      throw new Error('Model returned empty response');
    }
  } catch (error) {
    console.error('❌ Model test failed:', error.message);
    console.error('🔧 Try manually: ollama run ' + CONFIG.model);
    process.exit(1);
  }

  console.log('🎉 All systems ready!\n');

  const cli = new InteractiveCLI();
  cli.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { SmartAgent, EnhancedAIEngine, AITools, FileManager, AgentState };