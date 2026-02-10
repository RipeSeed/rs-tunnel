#!/usr/bin/env node

import { Command } from 'commander';

import { doctorCommand } from './commands/doctor.js';
import { listCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { stopCommand } from './commands/stop.js';
import { upCommand } from './commands/up.js';

const program = new Command();

program
  .name('rs-tunnel')
  .description('Ripeseed internal Cloudflare tunnel CLI')
  .version('0.1.0');

program
  .command('login')
  .requiredOption('--email <email>', 'Ripeseed email for Slack OAuth')
  .action(async (options: { email: string }) => {
    await loginCommand(options.email);
  });

program
  .command('up')
  .requiredOption('--port <port>', 'Local port to expose', (value) => Number.parseInt(value, 10))
  .option('--url <slug>', 'Optional URL slug (single label only)')
  .option('--verbose', 'Show raw cloudflared logs')
  .action(async (options: { port: number; url?: string; verbose?: boolean }) => {
    await upCommand({
      port: options.port,
      url: options.url,
      verbose: options.verbose,
    });
  });

program.command('list').action(async () => {
  await listCommand();
});

program
  .command('stop')
  .argument('<tunnel-id-or-hostname>', 'Tunnel ID or hostname')
  .action(async (tunnelIdentifier: string) => {
    await stopCommand(tunnelIdentifier);
  });

program.command('logout').action(async () => {
  await logoutCommand();
});

program.command('doctor').action(async () => {
  await doctorCommand();
});

program.showHelpAfterError();

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
