#!/usr/bin/env bun
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { startCommand } from './commands/start';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { updateCommand } from './commands/update';

const program = new Command();

program
  .name('vibemanager')
  .description('VibeManager - Development environment manager for AI coding agents')
  .version('1.0.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(updateCommand);

program.parse();
