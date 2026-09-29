import { mkdir, readFile, rm, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'public');
const destination = join(root, 'worker-public');
const files = [
  'offline.html', 'styles.css', 'intake.css', 'supabase.css',
  'supabase-app.js', 'passkeys.js', 'kvk-intake.js', 'customer-profile.js', 'profile-fields.js', 'client-workspace.js', 'intake-fields.js', 'intake-form.js', 'sw.js', 'manifest.webmanifest',
  'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png',
];

await rm(destination, { recursive: true, force: true });
for (const file of files) {
  const target = join(destination, file);
  await mkdir(join(target, '..'), { recursive: true });
  await copyFile(join(source, file), target);
}
const html = await readFile(join(source, 'index.html'), 'utf8');
const start = html.indexOf('  <div id="login"');
const end = html.indexOf('  <div id="app"');
const scripts = '<script src="/portal.js" defer></script><script src="/app.js" defer></script>';
if (start < 0 || end <= start || !html.includes(scripts)) throw new Error('Office index.html is gewijzigd; controleer de veilige Worker-shell.');
const safe = html.slice(0, start) + '  <div id="login" class="login-shell" hidden></div>\n  <div id="lock" class="login-shell" hidden></div>\n' + html.slice(end);
await writeFile(join(destination, 'index.html'), safe.replace(scripts, '<script src="/supabase-app.js" defer></script>').replace('</head>', '<link rel="stylesheet" href="/supabase.css"></head>'));
