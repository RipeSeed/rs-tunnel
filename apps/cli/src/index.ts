#!/usr/bin/env node

import { Command } from 'commander';

import { doctorCommand } from './commands/doctor.js';
import { listCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { stopCommand } from './commands/stop.js';
import { upCommand } from './commands/up.js';
import { ensureApiBaseUrlConfigured } from './config.js';
import { getCliVersion } from './lib/version.js';

const program = new Command();
const domainOptionDescription =
  'Infisical-style domain override for this command (example: https://api.example.com). Saved for future commands.';

async function applyDomainOption(domain?: string): Promise<void> {
  await ensureApiBaseUrlConfigured(domain);
}

program
  .name('rs-tunnel')
  .description('Self-hostable Cloudflare tunnel CLI')
  .version(getCliVersion());

program
  .command('login')
  .requiredOption('--email <email>', 'Email for Slack OAuth')
  .option('--print-auth-url', 'Print the Slack auth URL instead of opening a browser')
  .option('--domain <domain-url>', domainOptionDescription)
  .action(async (options: { email: string; domain?: string; printAuthUrl?: boolean }) => {
    await applyDomainOption(options.domain);
    await loginCommand(options.email, {
      printAuthUrl: options.printAuthUrl,
    });
  });

program
  .command('up')
  .requiredOption('--port <port>', 'Local port to expose', (value) => Number.parseInt(value, 10))
  .option('--url <slug>', 'Optional URL slug (single label only)')
  .option('--domain <domain-url>', domainOptionDescription)
  .option('--verbose', 'Show raw cloudflared logs')
  .action(async (options: { port: number; url?: string; domain?: string; verbose?: boolean }) => {
    await applyDomainOption(options.domain);
    await upCommand({
      port: options.port,
      url: options.url,
      verbose: options.verbose,
    });
  });

program
  .command('list')
  .option('--domain <domain-url>', domainOptionDescription)
  .action(async (options: { domain?: string }) => {
    await applyDomainOption(options.domain);
    await listCommand();
  });

program
  .command('stop')
  .argument('<tunnel-id-or-hostname>', 'Tunnel ID or hostname')
  .option('--domain <domain-url>', domainOptionDescription)
  .action(async (tunnelIdentifier: string, options: { domain?: string }) => {
    await applyDomainOption(options.domain);
    await stopCommand(tunnelIdentifier);
  });

program
  .command('logout')
  .option('--domain <domain-url>', domainOptionDescription)
  .action(async (options: { domain?: string }) => {
    await applyDomainOption(options.domain);
    await logoutCommand();
  });

program
  .command('doctor')
  .option('--domain <domain-url>', domainOptionDescription)
  .action(async (options: { domain?: string }) => {
    await applyDomainOption(options.domain);
    await doctorCommand();
  });

program.showHelpAfterError();

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
