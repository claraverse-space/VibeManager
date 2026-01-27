/**
 * Tests for GPUMonitor module
 *
 * Note: Testing GPUMonitor is complex due to its reliance on system commands.
 * These tests focus on the parsing logic and method behaviors rather than
 * actual command execution.
 */

describe('GPUMonitor', () => {
  let GPUMonitor;
  let monitor;

  beforeEach(() => {
    jest.resetModules();
    // Import fresh module for each test
    GPUMonitor = require('../gpu-monitor');
  });

  describe('constructor', () => {
    it('should set platform property', () => {
      monitor = new GPUMonitor();

      expect(monitor.platform).toBeDefined();
      expect(typeof monitor.platform).toBe('string');
    });

    it('should initialize availableMonitors as an array', () => {
      monitor = new GPUMonitor();

      expect(Array.isArray(monitor.availableMonitors)).toBe(true);
    });
  });

  describe('commandExists()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should return true for commands that exist', () => {
      // Test with common commands that exist on most Unix systems
      const resultLs = monitor.commandExists('ls');
      const resultEcho = monitor.commandExists('echo');

      // At least one of these should exist
      expect(resultLs || resultEcho).toBe(true);
    });

    it('should return false for nonexistent commands', () => {
      const result = monitor.commandExists('thiscommandprobablydoesnotexist12345');

      expect(result).toBe(false);
    });
  });

  describe('detectGPUs()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should detect NVIDIA GPU when nvidia-smi exists', () => {
      monitor.commandExists = jest.fn((cmd) => cmd === 'nvidia-smi');

      monitor.detectGPUs();

      expect(monitor.availableMonitors).toContain('nvidia');
    });

    it('should detect AMD GPU with rocm-smi', () => {
      monitor.commandExists = jest.fn((cmd) => cmd === 'rocm-smi');

      monitor.detectGPUs();

      expect(monitor.availableMonitors).toContain('amd-rocm');
    });

    it('should detect AMD GPU with radeontop as fallback', () => {
      monitor.commandExists = jest.fn((cmd) => cmd === 'radeontop');

      monitor.detectGPUs();

      expect(monitor.availableMonitors).toContain('amd-radeontop');
    });

    it('should detect Intel GPU with xpu-smi', () => {
      monitor.commandExists = jest.fn((cmd) => cmd === 'xpu-smi');

      monitor.detectGPUs();

      expect(monitor.availableMonitors).toContain('intel-xpu');
    });

    it('should detect Intel GPU with intel_gpu_top as fallback', () => {
      monitor.commandExists = jest.fn((cmd) => cmd === 'intel_gpu_top');

      monitor.detectGPUs();

      expect(monitor.availableMonitors).toContain('intel-gpu-top');
    });

    it('should detect macOS Metal on darwin platform', () => {
      monitor.platform = 'darwin';
      monitor.commandExists = jest.fn(() => false);

      monitor.detectGPUs();

      expect(monitor.availableMonitors).toContain('macos-metal');
    });
  });

  describe('getAMDRadeontopStats()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should return limited stats placeholder', () => {
      const result = monitor.getAMDRadeontopStats();

      expect(result).toHaveLength(1);
      expect(result[0].vendor).toBe('AMD');
      expect(result[0].name).toContain('radeontop');
      expect(result[0].note).toContain('Limited stats');
    });
  });

  describe('getIntelGPUTopStats()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should return limited stats placeholder', () => {
      const result = monitor.getIntelGPUTopStats();

      expect(result).toHaveLength(1);
      expect(result[0].vendor).toBe('Intel');
      expect(result[0].note).toContain('Limited stats');
    });
  });

  describe('detectMacGPUVendor()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should detect NVIDIA', () => {
      expect(monitor.detectMacGPUVendor('NVIDIA GeForce GTX')).toBe('NVIDIA');
    });

    it('should detect AMD', () => {
      expect(monitor.detectMacGPUVendor('AMD Radeon Pro')).toBe('AMD');
      expect(monitor.detectMacGPUVendor('Radeon RX 5700')).toBe('AMD');
    });

    it('should detect Intel', () => {
      expect(monitor.detectMacGPUVendor('Intel HD Graphics')).toBe('Intel');
    });

    it('should detect Apple', () => {
      expect(monitor.detectMacGPUVendor('Apple M1')).toBe('Apple');
    });

    it('should return Unknown for unrecognized', () => {
      expect(monitor.detectMacGPUVendor('Some GPU')).toBe('Unknown');
    });
  });

  describe('getAllGPUStats()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should return stats with timestamp and platform', () => {
      monitor.availableMonitors = [];

      const result = monitor.getAllGPUStats();

      expect(result.timestamp).toBeDefined();
      expect(result.platform).toBeDefined();
      expect(result.gpus).toEqual([]);
    });

    it('should aggregate stats from multiple monitors', () => {
      monitor.availableMonitors = ['nvidia'];
      monitor.getNVIDIAStats = jest.fn().mockReturnValue([
        { index: 0, vendor: 'NVIDIA', name: 'RTX 4090' }
      ]);

      const result = monitor.getAllGPUStats();

      expect(result.gpus).toHaveLength(1);
      expect(result.gpus[0].vendor).toBe('NVIDIA');
    });

    it('should handle errors from individual monitors', () => {
      monitor.availableMonitors = ['nvidia', 'amd-rocm'];
      monitor.getNVIDIAStats = jest.fn().mockImplementation(() => {
        throw new Error('nvidia-smi failed');
      });
      monitor.getAMDROCmStats = jest.fn().mockReturnValue([
        { index: 0, vendor: 'AMD', name: 'RX 7900' }
      ]);

      const result = monitor.getAllGPUStats();

      // Should still return AMD stats despite NVIDIA error
      expect(result.gpus).toHaveLength(1);
      expect(result.gpus[0].vendor).toBe('AMD');
    });
  });

  describe('getSummary()', () => {
    beforeEach(() => {
      monitor = new GPUMonitor();
    });

    it('should return summary with aggregated data', () => {
      monitor.getAllGPUStats = jest.fn().mockReturnValue({
        timestamp: new Date().toISOString(),
        platform: 'linux',
        gpus: [
          {
            index: 0,
            vendor: 'NVIDIA',
            name: 'RTX 4090',
            utilization: { gpu: 80, memory: 60 },
            memory: { total: 24576 },
            power: { draw: 350 }
          },
          {
            index: 1,
            vendor: 'NVIDIA',
            name: 'RTX 3090',
            utilization: { gpu: 60, memory: 40 },
            memory: { total: 24576 },
            power: { draw: 200 }
          }
        ]
      });

      const result = monitor.getSummary();

      expect(result.summary.count).toBe(2);
      expect(result.summary.vendors).toEqual(['NVIDIA']);
      expect(result.summary.totalMemory).toBe(49152);
      expect(result.summary.avgUtilization).toBe(70);
      expect(result.summary.totalPower).toBe(550);
    });

    it('should handle empty GPU list', () => {
      monitor.getAllGPUStats = jest.fn().mockReturnValue({
        timestamp: new Date().toISOString(),
        platform: 'linux',
        gpus: []
      });

      const result = monitor.getSummary();

      expect(result.summary.count).toBe(0);
      expect(result.summary.avgUtilization).toBe(0);
    });
  });
});
