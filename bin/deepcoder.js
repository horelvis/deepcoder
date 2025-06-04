#!/usr/bin/env node

/**
 * DeepCoder AI Agent - Intelligent coding assistant
 * Inspired by Claude Code with advanced capabilities
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
    // Keep only the last 20 interactions to avoid very long context
    if (this.sessionHistory.length > 40) {
      this.sessionHistory = this.sessionHistory.slice(-20);
    }
  }

  getContextualHistory() {
    return this.sessionHistory
      .slice(-10) // Last 10 interactions
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
          
          // Filter excluded files
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
}

// === AI Engine ===
class AIEngine {
  static async callOllama(prompt, options = {}) {
    const { temperature = 0.7, stream = false } = options;
    
    try {
      // First, verify Ollama is accessible
      await this.verifyOllamaConnection();
      
      const fullPrompt = await this.buildContextualPrompt(prompt);
      
      // Use a simpler command format that works reliably
      const response = execSync(`ollama run ${CONFIG.model}`, {
        input: fullPrompt,
        encoding: 'utf-8',
        env: { 
          ...process.env, 
          OLLAMA_HOST: CONFIG.ollamaHost 
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000 // 30 second timeout
      });

      agentState.addToHistory('user', prompt);
      agentState.addToHistory('assistant', response);

      return response.trim();
    } catch (error) {
      // Enhanced error handling with specific suggestions
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
      // Test if Ollama service is running
      execSync('curl -s http://localhost:11434/api/version', { 
        stdio: 'ignore',
        timeout: 5000 
      });
    } catch (error) {
      throw new Error('Cannot connect to Ollama service. Make sure Ollama is running with: ollama serve');
    }

    try {
      // Test if model exists
      const modelList = execSync('ollama list', { 
        encoding: 'utf-8',
        timeout: 5000 
      });
      
      if (!modelList.includes(CONFIG.model)) {
        throw new Error(`Model "${CONFIG.model}" not found. Download it with: ollama pull ${CONFIG.model}`);
      }
    } catch (error) {
      if (error.message.includes('Model')) {
        throw error; // Re-throw model not found errors
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
    // Identify files mentioned in user input
    const mentionedFiles = await this.extractFileReferences(userInput);
    let context = '';
    
    for (const filePath of mentionedFiles) {
      if (await FileManager.exists(filePath)) {
        const content = await FileManager.readFile(filePath);
        context += `\n## ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`;
      }
    }
    
    return context;
  }

  static async extractFileReferences(text) {
    const filePattern = /(?:^|\s)([.\w/-]+\.[a-z]{1,4})(?:\s|$)/gi;
    const matches = text.match(filePattern) || [];
    return matches.map(match => match.trim());
  }
}

// === Agent Commands ===
class AgentCommands {
  static async ask(question) {
    try {
      console.log('🤔 Processing your question...\n');
      const response = await AIEngine.callOllama(question);
      
      console.log('🤖 DeepCoder AI:\n');
      console.log(response);
      console.log('\n' + '─'.repeat(50) + '\n');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  static async analyze(filePath) {
    try {
      if (!await FileManager.exists(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        return;
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
    } catch (error) {
      console.error('❌ Error during analysis:', error.message);
    }
  }

  static async edit(filePath, instruction) {
    try {
      if (!await FileManager.exists(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        return;
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
      
      // Clean response to get only the code
      const cleanCode = this.extractCodeFromResponse(modifiedCode);
      
      await FileManager.writeFile(filePath, cleanCode);
      
      console.log(`✅ File updated: ${filePath}`);
      console.log(`💾 Backup created: ${backupPath}`);
      console.log('\n📝 Changes applied:\n');
      console.log(modifiedCode);
      console.log('\n' + '─'.repeat(50) + '\n');
    } catch (error) {
      console.error('❌ Error during editing:', error.message);
    }
  }

  static async create(filePath, description) {
    try {
      if (await FileManager.exists(filePath)) {
        console.log(`⚠️ File ${filePath} already exists. Overwrite? (y/N)`);
        // In a real implementation, you would wait for user confirmation here
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
    } catch (error) {
      console.error('❌ Error during creation:', error.message);
    }
  }

  static async scan() {
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
    } catch (error) {
      console.error('❌ Error during scanning:', error.message);
    }
  }

  static extractCodeFromResponse(response) {
    // Extract code from markdown code blocks
    const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }
    
    // If no code blocks, return the complete response
    return response;
  }

  static showHelp() {
    console.log(`
🧠 DeepCoder AI - Available Commands:

📝 BASIC
  ask <question>              - Ask a question about code
  help                        - Show this help
  exit                        - Exit the program

🔍 ANALYSIS
  analyze <file>              - Analyze a code file
  scan                        - Scan project structure

✏️ EDITING
  edit <file>                 - Edit file with instructions
  create <file> <desc>        - Create new file

🛠️ EXAMPLES
  ask "How to optimize this algorithm?"
  analyze src/main.js
  edit package.json "add build script"
  create utils/helpers.js "validation utilities"

📚 TIPS
  - Place CLAUDE.md or README.md files for project context
  - Backups are created automatically when editing files
  - Use specific file names for better context
`);
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

      await this.processCommand(input);
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye! DeepCoder AI signing off.');
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n\n⚠️ Closing DeepCoder AI...');
      this.rl.close();
    });
  }

  async processCommand(input) {
    const [command, ...args] = input.split(' ');
    const argsString = args.join(' ');

    try {
      switch (command.toLowerCase()) {
        case 'ask':
          if (!argsString) {
            console.log('❓ Usage: ask <your question>');
            break;
          }
          await AgentCommands.ask(argsString);
          break;

        case 'analyze':
          if (!args[0]) {
            console.log('❓ Usage: analyze <file>');
            break;
          }
          await AgentCommands.analyze(args[0]);
          break;

        case 'edit':
          if (!args[0]) {
            console.log('❓ Usage: edit <file>');
            console.log('You will be prompted for editing instructions');
            break;
          }
          
          const instruction = await this.promptUser('✏️ What changes do you want to make?\n> ');
          await AgentCommands.edit(args[0], instruction);
          break;

        case 'create':
          if (!args[0]) {
            console.log('❓ Usage: create <file> <description>');
            break;
          }
          
          const fileName = args[0];
          const description = args.slice(1).join(' ') || 
            await this.promptUser(`📝 Describe what ${fileName} should do:\n> `);
          
          await AgentCommands.create(fileName, description);
          break;

        case 'scan':
          await AgentCommands.scan();
          break;

        case 'help':
          AgentCommands.showHelp();
          break;

        case 'exit':
        case 'quit':
          this.rl.close();
          break;

        case 'clear':
          console.clear();
          this.showWelcome();
          break;

        default:
          console.log(`❓ Unknown command: ${command}`);
          console.log('Type "help" to see available commands');
      }
    } catch (error) {
      console.error('❌ Error executing command:', error.message);
    }
  }

  async promptUser(question) {
    return new Promise((resolve) => {
      const tempRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      tempRl.question(question, (answer) => {
        tempRl.close();
        resolve(answer);
      });
    });
  }

  showWelcome() {
    console.log(`
🚀 Welcome to DeepCoder AI
   Intelligent coding agent with Ollama + ${CONFIG.model}

💡 Type "help" to see available commands
🔧 Model: ${CONFIG.model} | Host: ${CONFIG.ollamaHost}
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

  // Enhanced Ollama verification
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

  // Check if Ollama service is running
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

  // Verify that the model is available
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
          timeout: 300000 // 5 minutes timeout for download
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

  // Test the model with a simple query
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

  // Initialize project if necessary
  if (!await FileManager.exists('CLAUDE.md') && !await FileManager.exists('README.md')) {
    console.log('💡 Tip: Create a CLAUDE.md or README.md file to provide project context');
  }

  console.log('🎉 All systems ready!\n');

  // Start CLI
  const cli = new InteractiveCLI();
  cli.start();
}

// Execute only if this is the main file
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { AgentCommands, AIEngine, FileManager, AgentState };