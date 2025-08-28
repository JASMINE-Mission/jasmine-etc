const { tests } = require('./core.test.js');

function runSuite() {
  const failures = [];
  let passed = 0;
  const total = tests.length;

  console.log(`Running ${total} test(s)...`);
  tests.forEach((t, i) => {
    const label = `[${i + 1}/${total}] ${t.name}`;
    try {
      t.fn();
      passed++;
      console.log(`${label}: PASS`);
    } catch (e) {
      console.error(`${label}: FAIL`);
      console.error(e && e.stack ? e.stack : e);
      failures.push({ name: t.name, error: e });
    }
  });

  console.log(`\nSummary: ${passed}/${total} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

runSuite();
