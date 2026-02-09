import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { getBundledBinDir } from '../config.js';

type CloudflaredAsset = {
  assetName: string;
  binaryName: string;
};

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !result.error;
}

function getCloudflaredAsset(): CloudflaredAsset {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin' && arch === 'arm64') {
    return {
      assetName: 'cloudflared-darwin-arm64',
      binaryName: 'cloudflared',
    };
  }

  if (platform === 'darwin' && arch === 'x64') {
    return {
      assetName: 'cloudflared-darwin-amd64',
      binaryName: 'cloudflared',
    };
  }

  if (platform === 'linux' && arch === 'arm64') {
    return {
      assetName: 'cloudflared-linux-arm64',
      binaryName: 'cloudflared',
    };
  }

  if (platform === 'linux' && arch === 'x64') {
    return {
      assetName: 'cloudflared-linux-amd64',
      binaryName: 'cloudflared',
    };
  }

  if (platform === 'win32' && arch === 'x64') {
    return {
      assetName: 'cloudflared-windows-amd64.exe',
      binaryName: 'cloudflared.exe',
    };
  }

  if (platform === 'win32' && arch === 'arm64') {
    return {
      assetName: 'cloudflared-windows-arm64.exe',
      binaryName: 'cloudflared.exe',
    };
  }

  throw new Error(`Unsupported OS/architecture combination: ${platform}/${arch}`);
}

export async function findCloudflaredBinary(): Promise<string | null> {
  const envOverride = process.env.RS_TUNNEL_CLOUDFLARED_PATH;
  if (envOverride) {
    return envOverride;
  }

  if (commandExists('cloudflared')) {
    return 'cloudflared';
  }

  const fallback = path.join(getBundledBinDir(), getCloudflaredAsset().binaryName);
  try {
    await fs.access(fallback, fsConstants.X_OK);
    return fallback;
  } catch {
    return null;
  }
}

async function runInstallCommand(command: string, args: string[]): Promise<boolean> {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
  });

  return result.status === 0;
}

async function tryPackageManagerInstall(): Promise<boolean> {
  const platform = os.platform();

  if (platform === 'darwin') {
    if (await runInstallCommand('brew', ['install', 'cloudflared'])) {
      return true;
    }
  }

  if (platform === 'linux') {
    const installers: Array<[string, string[]]> = [
      ['apt-get', ['install', '-y', 'cloudflared']],
      ['dnf', ['install', '-y', 'cloudflared']],
      ['pacman', ['-S', '--noconfirm', 'cloudflared']],
    ];

    for (const [command, args] of installers) {
      if (!commandExists(command)) {
        continue;
      }

      if (await runInstallCommand('sudo', [command, ...args])) {
        return true;
      }
    }
  }

  if (platform === 'win32') {
    if (await runInstallCommand('winget', ['install', '--id', 'Cloudflare.cloudflared', '--silent'])) {
      return true;
    }
  }

  return false;
}

function parseSha256Line(line: string): string {
  const first = line.trim().split(/\s+/)[0];
  if (!first) {
    throw new Error('Invalid cloudflared checksum format.');
  }
  return first;
}

async function downloadWithChecksum(assetName: string, destination: string): Promise<void> {
  const baseUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
  const binaryUrl = `${baseUrl}/${assetName}`;
  const checksumUrl = `${binaryUrl}.sha256`;

  const [binaryResponse, checksumResponse] = await Promise.all([fetch(binaryUrl), fetch(checksumUrl)]);

  if (!binaryResponse.ok) {
    throw new Error(`Failed downloading cloudflared binary: ${binaryResponse.status}`);
  }

  if (!checksumResponse.ok) {
    throw new Error(`Failed downloading cloudflared checksum: ${checksumResponse.status}`);
  }

  const [binaryBuffer, checksumText] = await Promise.all([
    binaryResponse.arrayBuffer(),
    checksumResponse.text(),
  ]);

  const expected = parseSha256Line(checksumText);
  const actual = createHash('sha256').update(Buffer.from(binaryBuffer)).digest('hex');

  if (expected.toLowerCase() !== actual.toLowerCase()) {
    throw new Error('cloudflared checksum verification failed.');
  }

  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
  await fs.writeFile(destination, Buffer.from(binaryBuffer));

  if (os.platform() !== 'win32') {
    await fs.chmod(destination, 0o755);
  }
}

async function installFromDownload(): Promise<string> {
  const asset = getCloudflaredAsset();
  const destination = path.join(getBundledBinDir(), asset.binaryName);
  await downloadWithChecksum(asset.assetName, destination);
  return destination;
}

export async function ensureCloudflaredInstalled(): Promise<string> {
  const existing = await findCloudflaredBinary();
  if (existing) {
    return existing;
  }

  const packageInstallSuccess = await tryPackageManagerInstall();
  if (packageInstallSuccess) {
    const afterInstall = await findCloudflaredBinary();
    if (afterInstall) {
      return afterInstall;
    }
  }

  return installFromDownload();
}

export function getCloudflaredVersion(binaryPath: string): string | null {
  const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || result.stderr.trim() || null;
}
