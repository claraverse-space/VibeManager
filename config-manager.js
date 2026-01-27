const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE || '/home';

// Configuration file location
const CONFIG_DIR = path.join(HOME, '.vibemanager');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Binary search paths for different platforms
const BINARY_SEARCH_PATHS = {
  tmux: [
    '/opt/homebrew/bin/tmux',     // macOS Apple Silicon
    '/usr/local/bin/tmux',        // macOS Intel
    '/usr/bin/tmux',              // Linux standard
    '/bin/tmux',                  // Linux alternative
  ],
  docker: [
    '/opt/homebrew/bin/docker',   // macOS Apple Silicon
    '/usr/local/bin/docker',      // macOS Intel / Docker Desktop
    '/usr/bin/docker',            // Linux standard
    '/snap/bin/docker',           // Ubuntu Snap
  ],
  'code-server': [
    path.join(HOME, '.local/bin/code-server'),
    path.join(HOME, '.local/lib/code-server/bin/code-server'),
    '/opt/homebrew/bin/code-server',
    '/usr/local/bin/code-server',
    '/usr/bin/code-server',
  ],
  opencode: [
    path.join(HOME, '.opencode/bin/opencode'),
    path.join(HOME, '.local/bin/opencode'),
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
    '/usr/bin/opencode',
    '/snap/bin/opencode',
  ],
  claude: [
    path.join(HOME, '.claude/bin/claude'),
    path.join(HOME, '.local/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ],
  git: [
    '/opt/homebrew/bin/git',
    '/usr/local/bin/git',
    '/usr/bin/git',
    '/bin/git',
  ],
  node: [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
    '/bin/node',
  ],
};

// Binary metadata: critical vs optional
const BINARY_METADATA = {
  tmux: { critical: true, name: 'tmux', description: 'Terminal multiplexer for session management', installCmd: { macos: 'brew install tmux', linux: 'sudo apt-get install tmux' } },
  docker: { critical: false, name: 'Docker', description: 'Container platform', installCmd: { macos: 'Install Docker Desktop from docker.com', linux: 'curl -fsSL https://get.docker.com | sudo sh' } },
  'code-server': { critical: false, name: 'code-server', description: 'VS Code in the browser', installCmd: { macos: 'brew install code-server', linux: 'curl -fsSL https://code-server.dev/install.sh | sh' } },
  opencode: { critical: false, name: 'OpenCode', description: 'AI coding assistant', installCmd: { macos: 'curl -fsSL https://opencode.ai/install | bash', linux: 'curl -fsSL https://opencode.ai/install | bash' } },
  claude: { critical: false, name: 'Claude Code', description: 'AI coding assistant', installCmd: { macos: 'curl -fsSL https://claude.ai/install.sh | bash', linux: 'curl -fsSL https://claude.ai/install.sh | bash' } },
  git: { critical: true, name: 'git', description: 'Version control system', installCmd: { macos: 'brew install git', linux: 'sudo apt-get install git' } },
  node: { critical: true, name: 'Node.js', description: 'JavaScript runtime', installCmd: { macos: 'brew install node', linux: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs' } },
};

class ConfigManager {
  constructor() {
    this.config = null;
    this.platform = process.platform === 'darwin' ? 'macos' : 'linux';
  }

  /**
   * Initialize the config manager
   * Loads existing config or creates new one
   */
  async initialize() {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }

      // Try to load existing config
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          const data = fs.readFileSync(CONFIG_FILE, 'utf8');
          this.config = JSON.parse(data);
          
          // Validate all cached paths on startup
          await this.validateConfig();
        } catch (err) {
          console.warn('[ConfigManager] Invalid config file, regenerating:', err.message);
          this.config = null;
        }
      }

      // If no config or validation failed, discover all binaries
      if (!this.config || !this.config.binaries) {
        console.log('[ConfigManager] Discovering binary locations...');
        await this.discoverAllBinaries();
      }

      return this;
    } catch (err) {
      console.error('[ConfigManager] Initialization error:', err.message);
      throw err;
    }
  }

  /**
   * Discover a single binary location
   */
  discoverBinary(binaryName) {
    const searchPaths = BINARY_SEARCH_PATHS[binaryName] || [];
    
    // Strategy 1: Try 'which' command first (respects user's PATH)
    try {
      const whichResult = execSync(`which ${binaryName} 2>/dev/null || command -v ${binaryName} 2>/dev/null`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      if (whichResult && fs.existsSync(whichResult)) {
        try {
          fs.accessSync(whichResult, fs.constants.X_OK);
          return whichResult;
        } catch (err) {
          // Not executable, continue searching
        }
      }
    } catch (err) {
      // 'which' failed, continue to manual search
    }

    // Strategy 2: Search common paths
    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        try {
          fs.accessSync(searchPath, fs.constants.X_OK);
          return searchPath;
        } catch (err) {
          // Not executable, continue
        }
      }
    }

    return null;
  }

  /**
   * Get version of a binary
   */
  getBinaryVersion(binaryPath, binaryName) {
    try {
      let versionCmd = `${binaryPath} --version 2>&1 | head -1`;
      
      // Special cases for version commands
      if (binaryName === 'node') {
        versionCmd = `${binaryPath} --version 2>&1`;
      } else if (binaryName === 'docker') {
        versionCmd = `${binaryPath} --version 2>&1 | head -1`;
      }

      const version = execSync(versionCmd, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000
      }).trim();
      
      return version.split('\n')[0].substring(0, 100); // First line, max 100 chars
    } catch (err) {
      return 'unknown';
    }
  }

  /**
   * Discover all binaries and save to config
   */
  async discoverAllBinaries() {
    const binaries = {};
    const missing = { critical: [], optional: [] };

    for (const [binaryName, metadata] of Object.entries(BINARY_METADATA)) {
      const binaryPath = this.discoverBinary(binaryName);
      
      if (binaryPath) {
        binaries[binaryName] = {
          path: binaryPath,
          verified: new Date().toISOString(),
          version: this.getBinaryVersion(binaryPath, binaryName),
          optional: !metadata.critical
        };
        console.log(`[ConfigManager] ✓ Found ${metadata.name}: ${binaryPath}`);
      } else {
        const list = metadata.critical ? missing.critical : missing.optional;
        list.push({ name: binaryName, metadata });
        console.warn(`[ConfigManager] ✗ ${metadata.name} not found ${metadata.critical ? '(CRITICAL)' : '(optional)'}`);
      }
    }

    // Save config
    this.config = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      platform: this.platform,
      binaries
    };

    this.saveConfig();

    // Handle missing binaries
    if (missing.critical.length > 0) {
      this.printMissingBinariesError(missing.critical);
      throw new Error(`Critical binaries missing: ${missing.critical.map(m => m.name).join(', ')}`);
    }

    if (missing.optional.length > 0) {
      this.printMissingBinariesWarning(missing.optional);
    }

    return binaries;
  }

  /**
   * Validate all cached binary paths
   */
  async validateConfig() {
    if (!this.config || !this.config.binaries) {
      return false;
    }

    let needsRediscovery = false;

    for (const [binaryName, binaryInfo] of Object.entries(this.config.binaries)) {
      if (!fs.existsSync(binaryInfo.path)) {
        console.warn(`[ConfigManager] Binary moved or deleted: ${binaryName} at ${binaryInfo.path}`);
        needsRediscovery = true;
        break;
      }

      try {
        fs.accessSync(binaryInfo.path, fs.constants.X_OK);
      } catch (err) {
        console.warn(`[ConfigManager] Binary not executable: ${binaryName} at ${binaryInfo.path}`);
        needsRediscovery = true;
        break;
      }
    }

    if (needsRediscovery) {
      console.log('[ConfigManager] Re-discovering binary locations...');
      await this.discoverAllBinaries();
    }

    return !needsRediscovery;
  }

  /**
   * Get path to a binary
   */
  getBinary(binaryName) {
    if (!this.config || !this.config.binaries || !this.config.binaries[binaryName]) {
      // Try to discover on-the-fly
      const path = this.discoverBinary(binaryName);
      if (path) {
        console.log(`[ConfigManager] Discovered ${binaryName} on-the-fly: ${path}`);
        return path;
      }
      
      const metadata = BINARY_METADATA[binaryName];
      if (metadata && metadata.critical) {
        throw new Error(`Critical binary not found: ${binaryName}. Run 'node server.js --check-config' for details.`);
      }
      
      return null;
    }

    return this.config.binaries[binaryName].path;
  }

  /**
   * Get all binary info (for API endpoint)
   */
  getAllBinaries() {
    if (!this.config || !this.config.binaries) {
      return {};
    }

    const result = {};
    for (const [name, info] of Object.entries(this.config.binaries)) {
      const metadata = BINARY_METADATA[name] || {};
      result[name] = {
        ...info,
        ...metadata,
        found: true
      };
    }

    // Add missing binaries
    for (const [name, metadata] of Object.entries(BINARY_METADATA)) {
      if (!result[name]) {
        result[name] = {
          ...metadata,
          found: false,
          path: null
        };
      }
    }

    return result;
  }

  /**
   * Save config to disk
   */
  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      console.log(`[ConfigManager] Config saved to ${CONFIG_FILE}`);
    } catch (err) {
      console.error('[ConfigManager] Failed to save config:', err.message);
    }
  }

  /**
   * Print error for missing critical binaries
   */
  printMissingBinariesError(missing) {
    console.error('\n' + '='.repeat(70));
    console.error('ERROR: Critical binaries not found!');
    console.error('='.repeat(70));
    console.error('\nVibeManager requires the following binaries:\n');

    for (const { name, metadata } of missing) {
      console.error(`  ✗ ${metadata.name} - ${metadata.description}`);
      console.error(`    Install: ${metadata.installCmd[this.platform]}`);
      console.error('');
    }

    console.error('After installing, restart VibeManager.');
    console.error('='.repeat(70) + '\n');
  }

  /**
   * Print warning for missing optional binaries
   */
  printMissingBinariesWarning(missing) {
    console.warn('\n' + '-'.repeat(70));
    console.warn('WARNING: Optional binaries not found');
    console.warn('-'.repeat(70));
    console.warn('\nThe following optional features are disabled:\n');

    for (const { name, metadata } of missing) {
      console.warn(`  ⚠ ${metadata.name} - ${metadata.description}`);
      console.warn(`    Install: ${metadata.installCmd[this.platform]}`);
      console.warn('');
    }

    console.warn('VibeManager will continue without these features.');
    console.warn('-'.repeat(70) + '\n');
  }

  /**
   * Force re-discovery of all binaries
   */
  async refresh() {
    console.log('[ConfigManager] Force refreshing binary locations...');
    this.config = null;
    await this.discoverAllBinaries();
  }
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get or create singleton instance
   */
  async getInstance() {
    if (!instance) {
      instance = new ConfigManager();
      await instance.initialize();
    }
    return instance;
  },

  /**
   * Initialize and return singleton
   */
  async initialize() {
    return await this.getInstance();
  }
};
