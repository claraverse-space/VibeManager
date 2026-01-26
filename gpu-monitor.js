/**
 * GPU Monitor
 *
 * Cross-platform GPU monitoring supporting:
 * - NVIDIA (nvidia-smi)
 * - AMD (rocm-smi, radeontop)
 * - Intel Arc (xpu-smi, intel_gpu_top)
 * - macOS Metal (system_profiler, powermetrics)
 *
 * Note: All execSync commands use hardcoded system monitoring tools with no user input
 */

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');

class GPUMonitor {
  constructor() {
    this.platform = os.platform();
    this.gpuType = null;
    this.availableMonitors = [];
    this.detectGPUs();
  }

  // Detect available GPU monitoring tools
  detectGPUs() {
    this.availableMonitors = [];

    // NVIDIA
    if (this.commandExists('nvidia-smi')) {
      this.availableMonitors.push('nvidia');
    }

    // AMD
    if (this.commandExists('rocm-smi')) {
      this.availableMonitors.push('amd-rocm');
    } else if (this.commandExists('radeontop')) {
      this.availableMonitors.push('amd-radeontop');
    }

    // Intel Arc
    if (this.commandExists('xpu-smi')) {
      this.availableMonitors.push('intel-xpu');
    } else if (this.commandExists('intel_gpu_top')) {
      this.availableMonitors.push('intel-gpu-top');
    }

    // macOS Metal
    if (this.platform === 'darwin') {
      this.availableMonitors.push('macos-metal');
    }

    // Linux sysfs fallback
    if (this.platform === 'linux' && fs.existsSync('/sys/class/drm')) {
      this.availableMonitors.push('linux-sysfs');
    }
  }

  commandExists(cmd) {
    try {
      execSync(`command -v ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // Get stats from all available GPUs
  getAllGPUStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      platform: this.platform,
      gpus: []
    };

    for (const monitor of this.availableMonitors) {
      try {
        let gpuStats = null;

        switch (monitor) {
          case 'nvidia':
            gpuStats = this.getNVIDIAStats();
            break;
          case 'amd-rocm':
            gpuStats = this.getAMDROCmStats();
            break;
          case 'amd-radeontop':
            gpuStats = this.getAMDRadeontopStats();
            break;
          case 'intel-xpu':
            gpuStats = this.getIntelXPUStats();
            break;
          case 'intel-gpu-top':
            gpuStats = this.getIntelGPUTopStats();
            break;
          case 'macos-metal':
            gpuStats = this.getMacOSMetalStats();
            break;
          case 'linux-sysfs':
            gpuStats = this.getLinuxSysfsStats();
            break;
        }

        if (gpuStats && gpuStats.length > 0) {
          stats.gpus.push(...gpuStats);
        }
      } catch (err) {
        console.error(`[GPU Monitor] Error getting stats for ${monitor}:`, err.message);
      }
    }

    return stats;
  }

  // NVIDIA GPU stats using nvidia-smi
  getNVIDIAStats() {
    const output = execSync(
      'nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,power.limit --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 2000 }
    );

    const gpus = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const [index, name, temp, utilGPU, utilMem, memUsed, memTotal, powerDraw, powerLimit] = line.split(',').map(s => s.trim());

      gpus.push({
        index: parseInt(index),
        vendor: 'NVIDIA',
        name: name,
        temperature: parseFloat(temp) || 0,
        utilization: {
          gpu: parseFloat(utilGPU) || 0,
          memory: parseFloat(utilMem) || 0
        },
        memory: {
          used: parseFloat(memUsed) || 0,
          total: parseFloat(memTotal) || 0,
          unit: 'MiB'
        },
        power: {
          draw: parseFloat(powerDraw) || 0,
          limit: parseFloat(powerLimit) || 0,
          unit: 'W'
        }
      });
    }

    return gpus;
  }

  // AMD GPU stats using rocm-smi
  getAMDROCmStats() {
    const output = execSync('rocm-smi --showuse --showmeminfo vram --showtemp --showpower --json', {
      encoding: 'utf-8',
      timeout: 2000
    });

    const data = JSON.parse(output);
    const gpus = [];

    for (const [key, gpu] of Object.entries(data)) {
      if (key.startsWith('card')) {
        const index = parseInt(key.replace('card', ''));
        gpus.push({
          index: index,
          vendor: 'AMD',
          name: gpu['Card series'] || 'AMD GPU',
          temperature: parseFloat(gpu['Temperature (Sensor edge) (C)']) || 0,
          utilization: {
            gpu: parseFloat(gpu['GPU use (%)']) || 0,
            memory: 0
          },
          memory: {
            used: parseFloat(gpu['VRAM Total Used Memory (B)']) / (1024 * 1024) || 0,
            total: parseFloat(gpu['VRAM Total Memory (B)']) / (1024 * 1024) || 0,
            unit: 'MiB'
          },
          power: {
            draw: parseFloat(gpu['Average Graphics Package Power (W)']) || 0,
            limit: parseFloat(gpu['Max Graphics Package Power (W)']) || 0,
            unit: 'W'
          }
        });
      }
    }

    return gpus;
  }

  // AMD GPU stats using radeontop (fallback)
  getAMDRadeontopStats() {
    const gpus = [{
      index: 0,
      vendor: 'AMD',
      name: 'AMD GPU (radeontop)',
      temperature: 0,
      utilization: { gpu: 0, memory: 0 },
      memory: { used: 0, total: 0, unit: 'MiB' },
      power: { draw: 0, limit: 0, unit: 'W' },
      note: 'Limited stats - install rocm-smi for detailed monitoring'
    }];

    return gpus;
  }

  // Intel Arc GPU stats using xpu-smi
  getIntelXPUStats() {
    const output = execSync('xpu-smi dump -m 0,1,2,5,18 -j', {
      encoding: 'utf-8',
      timeout: 2000
    });

    const data = JSON.parse(output);
    const gpus = [];

    if (data.device_list) {
      for (const device of data.device_list) {
        gpus.push({
          index: device.device_id || 0,
          vendor: 'Intel',
          name: device.device_name || 'Intel Arc GPU',
          temperature: parseFloat(device.temperature) || 0,
          utilization: {
            gpu: parseFloat(device.gpu_utilization) || 0,
            memory: parseFloat(device.memory_utilization) || 0
          },
          memory: {
            used: parseFloat(device.memory_used) || 0,
            total: parseFloat(device.memory_total) || 0,
            unit: 'MiB'
          },
          power: {
            draw: parseFloat(device.power) || 0,
            limit: parseFloat(device.power_limit) || 0,
            unit: 'W'
          }
        });
      }
    }

    return gpus;
  }

  // Intel GPU stats using intel_gpu_top (fallback)
  getIntelGPUTopStats() {
    const gpus = [{
      index: 0,
      vendor: 'Intel',
      name: 'Intel GPU',
      temperature: 0,
      utilization: { gpu: 0, memory: 0 },
      memory: { used: 0, total: 0, unit: 'MiB' },
      power: { draw: 0, limit: 0, unit: 'W' },
      note: 'Limited stats - run as root for detailed monitoring'
    }];

    return gpus;
  }

  // macOS Metal GPU stats
  getMacOSMetalStats() {
    const gpus = [];

    try {
      const output = execSync('system_profiler SPDisplaysDataType -json', {
        encoding: 'utf-8',
        timeout: 3000
      });

      const data = JSON.parse(output);
      let index = 0;

      if (data.SPDisplaysDataType) {
        for (const display of data.SPDisplaysDataType) {
          if (display.sppci_model) {
            const gpuName = display.sppci_model;
            const vram = display.sppci_vram || display._spdisplays_vram || '0 MB';
            const vramMB = parseInt(vram.replace(/[^0-9]/g, ''));

            gpus.push({
              index: index++,
              vendor: this.detectMacGPUVendor(gpuName),
              name: gpuName,
              temperature: 0,
              utilization: {
                gpu: 0,
                memory: 0
              },
              memory: {
                used: 0,
                total: vramMB,
                unit: 'MB'
              },
              power: {
                draw: 0,
                limit: 0,
                unit: 'W'
              },
              note: 'macOS Metal - limited stats available'
            });
          }
        }
      }
    } catch (err) {
      gpus.push({
        index: 0,
        vendor: 'Apple',
        name: 'Apple Silicon GPU',
        temperature: 0,
        utilization: { gpu: 0, memory: 0 },
        memory: { used: 0, total: 0, unit: 'MB' },
        power: { draw: 0, limit: 0, unit: 'W' },
        note: 'Apple Silicon - unified memory architecture'
      });
    }

    return gpus;
  }

  detectMacGPUVendor(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('nvidia')) return 'NVIDIA';
    if (nameLower.includes('amd') || nameLower.includes('radeon')) return 'AMD';
    if (nameLower.includes('intel')) return 'Intel';
    if (nameLower.includes('apple')) return 'Apple';
    return 'Unknown';
  }

  // Linux sysfs fallback for basic GPU detection
  getLinuxSysfsStats() {
    const gpus = [];

    try {
      const drmPath = '/sys/class/drm';
      const cards = fs.readdirSync(drmPath).filter(f => f.startsWith('card') && !f.includes('-'));

      for (const card of cards) {
        const cardPath = `${drmPath}/${card}`;
        const devicePath = `${cardPath}/device`;

        let name = 'Unknown GPU';
        let vendor = 'Unknown';

        try {
          if (fs.existsSync(`${devicePath}/uevent`)) {
            const uevent = fs.readFileSync(`${devicePath}/uevent`, 'utf-8');
            const pciId = uevent.match(/PCI_ID=([0-9A-Fa-f:]+)/);
            if (pciId) {
              const vendorId = pciId[1].split(':')[0].toUpperCase();
              if (vendorId === '10DE') vendor = 'NVIDIA';
              else if (vendorId === '1002') vendor = 'AMD';
              else if (vendorId === '8086') vendor = 'Intel';
            }
          }
        } catch {}

        gpus.push({
          index: parseInt(card.replace('card', '')),
          vendor: vendor,
          name: name,
          temperature: 0,
          utilization: { gpu: 0, memory: 0 },
          memory: { used: 0, total: 0, unit: 'MiB' },
          power: { draw: 0, limit: 0, unit: 'W' },
          note: 'sysfs detection - install vendor tools for detailed stats'
        });
      }
    } catch (err) {
      console.error('[GPU Monitor] sysfs error:', err.message);
    }

    return gpus;
  }

  // Get formatted summary
  getSummary() {
    const stats = this.getAllGPUStats();

    const summary = {
      count: stats.gpus.length,
      vendors: [...new Set(stats.gpus.map(g => g.vendor))],
      totalMemory: stats.gpus.reduce((sum, g) => sum + (g.memory.total || 0), 0),
      avgUtilization: stats.gpus.length > 0
        ? stats.gpus.reduce((sum, g) => sum + (g.utilization.gpu || 0), 0) / stats.gpus.length
        : 0,
      totalPower: stats.gpus.reduce((sum, g) => sum + (g.power.draw || 0), 0)
    };

    return { ...stats, summary };
  }
}

module.exports = GPUMonitor;
