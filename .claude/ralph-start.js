const fs = require('fs');
const { runClaude } = require('./lib/run-claude');

async function main() {
  const config = JSON.parse(
    fs.readFileSync('.claude/ralph.config.json', 'utf8'),
  );

  // Reset the counter file to start from the beginning
  fs.writeFileSync(
    '.claude/ralph.iterations.json',
    JSON.stringify({ count: 0, phaseIndex: 0 }),
  );

  // Start Ralph with the first phase
  const phase = config.phases[0];
  const prompt = config.prompt
    .replace('{milestone}', phase.milestone)
    .replace('{branch}', phase.branch);
  console.log(`🚀 Запускаем Ralph для milestone: ${phase.milestone}`);

  await runClaude(prompt, { maxTurns: config.maxTurns });
}

main().catch((err) => {
  console.error(`❌ Ralph run failed: ${err.message}`);
  process.exit(1);
});
