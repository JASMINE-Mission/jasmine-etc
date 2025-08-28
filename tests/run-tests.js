const { run } = require('./core.test.js');

function main() {
  const failures = [];
  try {
    run();
    console.log('core.test.js: PASS');
  } catch (e) {
    console.error('core.test.js: FAIL');
    console.error(e && e.stack ? e.stack : e);
    failures.push(e);
  }

  if (failures.length) process.exit(1);
  console.log('All tests passed.');
}

main();

