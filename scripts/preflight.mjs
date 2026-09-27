import fs from 'node:fs';

const fail = (message) => { console.error(`✗ ${message}`); process.exitCode = 1; };
const ok = (message) => console.log(`✓ ${message}`);

for (const file of ['app.json', 'eas.json', 'package.json']) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); ok(`${file} valide`); }
  catch { fail(`${file} invalide`); }
}

for (const file of [
  'assets/images/icon-ios.png',
  'assets/images/intro-wheelers.png',
  'assets/images/safety-wheelers.png',
  'src/app/_layout.tsx',
  'src/lib/supabase.ts',
  'src/app/admin.tsx',
  'src/app/search.tsx',
  'supabase/migrations/202609110001_user_data.sql',
  'supabase/migrations/202609110002_community_rides.sql',
  'supabase/migrations/202609110003_direct_messages.sql',
  'supabase/migrations/202609120004_admin_dashboard.sql',
]) {
  fs.existsSync(file) ? ok(file) : fail(`${file} manquant`);
}

const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
if (app.ios?.bundleIdentifier) ok(`bundle iOS: ${app.ios.bundleIdentifier}`); else fail('bundleIdentifier iOS manquant');
if (app.ios?.buildNumber) ok(`build iOS: ${app.ios.buildNumber}`); else fail('buildNumber iOS manquant');
if (app.android?.package) ok(`package Android: ${app.android.package}`); else fail('package Android manquant');

const layout = fs.readFileSync('src/app/_layout.tsx', 'utf8');
layout.includes('5000') && layout.includes('3000') ? ok('séquence 5 s + 3 s présente') : fail('séquence intro/sécurité incorrecte');

if (!process.exitCode) console.log('\nPréflight local réussi. Lance ensuite: npm ci && npm run typecheck && npm run doctor');
