// Runs the Firebase CLI (from node_modules) with a suitable Java on the PATH.
// The Firestore emulator needs JDK 21 or newer. If a private JDK exists in
// .tools/jdk (see README), it is used; otherwise whatever "java" is on the PATH.
//
// Usage: node scripts/emu.mjs <firebase arguments...>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };

const candidates = [
  path.join(root, '.tools', 'jdk', 'Library', 'bin'), // conda layout on Windows
  path.join(root, '.tools', 'jdk', 'bin'),
  env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin') : null,
].filter(Boolean);
for (const dir of candidates) {
  if (existsSync(path.join(dir, process.platform === 'win32' ? 'java.exe' : 'java'))) {
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    env[key] = dir + path.delimiter + env[key];
    break;
  }
}

const cli = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const args = process.argv.slice(2);
// Emulator commands always run against the offline demo project.
if (args[0]?.startsWith('emulators:')) args.push('--project', 'demo-econ-live');
const res = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env, cwd: root });
process.exit(res.status ?? 1);
