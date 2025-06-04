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

    return `
# PROJECT CONTEXT
${projectContext}

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
`.trim();
  }

  static async loadProjectContext() {
    let context = '';
    
    for (const contextFile of CONFIG.contextFiles) {
      if (await FileManager.exists(contextFile)) {
        const content = await FileManager.readFile(contextFile);
        context += `\n## ${contextFile}\n${content}\n`;
      }
    }
    
    return context || '# Project without specific defined context';
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
          return this.showOllamaConfig();
        } else if (args[0] === 'test') {
          return this.testOllama();
        }
        return 'Available ollama commands: /ollama config, /ollama test';
      
      case 'scan':
        return await this.scanProject();
      
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
      const response = await AIEngine.callOllama(question);
      
      console.log('🤖 DeepCoder AI:\n');
      console.log(response);
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

\`\`\`
${code}
\`\`\``;

      console.log(`🔍 Analyzing ${filePath}...\n`);
      const analysis = await AIEngine.callOllama(prompt);
      
      console.log('📊 Code analysis:\n');
      console.log(analysis);
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

Respond ONLY with the modified code, without additional explanations.

\`\`\`
${originalCode}
\`\`\``;

      console.log(`✏️ Editing ${filePath}...\n`);
      const modifiedCode = await AIEngine.callOllama(prompt);
      
      const cleanCode = this.extractCodeFromResponse(modifiedCode);
      await FileManager.writeFile(filePath, cleanCode);
      
      console.log(`✅ File updated: ${filePath}`);
      console.log(`💾 Backup created: ${backupPath}`);
      console.log('\n📝 Changes applied:\n');
      console.log(modifiedCode);
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

Respond ONLY with the file code, without additional explanations.`;

      console.log(`🆕 Creating ${filePath}...\n`);
      const code = await AIEngine.callOllama(prompt);
      
      const cleanCode = this.extractCodeFromResponse(code);
      await FileManager.writeFile(filePath, cleanCode);
      
      console.log(`✅ File created: ${filePath}`);
      console.log('\n📄 Generated content:\n');
      console.log(code);
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
    console.log(`
🔧 Ollama Configuration:
  Model: ${CONFIG.model}
  Host: ${CONFIG.ollamaHost}
  Context Files: ${CONFIG.contextFiles.join(', ')}
  
📝 Environment Variables:
  DEEPCODE_MODEL=${process.env.DEEPCODE_MODEL || 'not set (using default)'}
  OLLAMA_API_URL=${process.env.OLLAMA_API_URL || 'not set (using default)'}
`);
    return 'Configuration displayed';
  }

  static async testOllama() {
    try {
      console.log('🧪 Testing Ollama connection...\n');
      
      // Test connection
      await AIEngine.verifyOllamaConnection();
      console.log('✅ Ollama service is running');
      
      // Test model
      const testResponse = await AIEngine.callOllama('Say "Hello from DeepCoder AI" and nothing else.');
      console.log('✅ Model is responding');
      console.log('📝 Test response:', testResponse);
      
      return 'Ollama test completed successfully';
    } catch (error) {
      console.log(`❌ Ollama test failed: ${error.message}`);
      return 'Ollama test failed';
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
    console.log(`
🚀 Welcome to DeepCoder AI
   Intelligent coding agent with natural language interface

💡 Just type naturally - no commands needed!
   Examples: "analyze main.js", "create a React component", "fix the bug in auth.py"

🔧 Model: ${CONFIG.model} | Host: ${CONFIG.ollamaHost}
📚 Type /help for special commands
`);
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

  if (!await FileManager.exists('CLAUDE.md') && !await FileManager.exists('README.md')) {
    console.log('💡 Tip: Create a CLAUDE.md or README.md file to provide project context');
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

export { SmartAgent, AIEngine, FileManager, AgentState };