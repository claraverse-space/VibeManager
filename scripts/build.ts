#!/usr/bin/env bun
/**
 * Build script for VibeManager
 * Creates standalone binaries for different platforms
 */

import { $ } from 'bun';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join } from 'path';

const DIST_DIR = 'dist';
const TARGETS = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-darwin-x64',
  'bun-darwin-arm64',
] as const;

async function build() {
  console.log('🔨 Building VibeManager...\n');

  // Clean dist directory
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true });
  }
  mkdirSync(DIST_DIR, { recursive: true });

  // Build frontend first
  console.log('📦 Building frontend...');
  await $`bun run --filter @vibemanager/web build`;

  // Copy frontend to server public directory
  const webDist = 'apps/web/dist';
  const serverPublic = 'apps/server/public';
  if (existsSync(webDist)) {
    if (existsSync(serverPublic)) {
      rmSync(serverPublic, { recursive: true });
    }
    mkdirSync(serverPublic, { recursive: true });
    cpSync(webDist, serverPublic, { recursive: true });
    console.log('✓ Frontend copied to server/public\n');
  }

  // Build for each target
  for (const target of TARGETS) {
    const [, os, arch] = target.split('-');
    const outputName = `vibemanager-${os}-${arch}`;
    const outputPath = join(DIST_DIR, outputName);

    console.log(`🎯 Building for ${os}-${arch}...`);

    try {
      await $`bun build apps/server/src/index.ts --compile --target=${target} --outfile=${outputPath}`;
      console.log(`✓ Built ${outputName}\n`);
    } catch (error) {
      console.error(`✗ Failed to build for ${target}:`, error);
    }
  }

  console.log('✅ Build complete! Binaries in dist/');
}

build().catch(console.error);
