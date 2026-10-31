import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGINT');
  setTimeout(() => process.exit(code), 500);
}

function run(name, args) {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
  });
  child.on('exit', code => {
    if (shuttingDown) return;
    console.log(`[dev:all] ${name} finished (${code ?? 0}). Shutting down the rest...`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('api', ['run', 'server']);
run('web', ['run', 'dev']);
