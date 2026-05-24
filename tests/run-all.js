'use strict';
// CI runner: executes every CI-safe jsdom suite in a child process and exits
// non-zero if any fail. Excludes the live-cloud utilities (they hit the network)
// and the one-off build helpers. Run locally with: npm test
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'verify', 'funcsmoke', 'verif_s1', 'buildcard', 'heatcheck', 'msvgcheck',
  'progress_spot', 'dayconfig_spot', 'daymgr_spot', 'plansync_spot', 'newday_add_spot',
  'balanced_rows_spot', 'remove_perday_spot', 'library_spot', 'durability_spot',
  'sw_spot', 'cloudarchive_spot', 'finalize_spot', 'sessgroup_spot', 'metadata_spot', 'balance_spot', 'toast_spot', 'templates_spot', 'dupscan',
  'patch3_spot', 'patch4_spot', 'patch5_spot', 'patch5_lossless', 'patch5_health',
  'patch5_repair', 'patch5_split', 'patch5_dedupe', 'patch5_pull', 'patch5_primary',
  'patch5_prefill'
];

const failed = [];
SUITES.forEach(function (s) {
  process.stdout.write(('  ' + s).padEnd(24, ' '));
  try {
    execFileSync(process.execPath, [path.join(__dirname, s + '.js')], { stdio: 'pipe' });
    console.log('PASS');
  } catch (e) {
    console.log('FAIL');
    failed.push(s);
    if (e.stdout) process.stdout.write(e.stdout.toString());
    if (e.stderr) process.stderr.write(e.stderr.toString());
  }
});

if (failed.length) {
  console.error('\n' + failed.length + ' suite(s) FAILED: ' + failed.join(', '));
  process.exit(1);
}
console.log('\nAll ' + SUITES.length + ' suites passed.');
