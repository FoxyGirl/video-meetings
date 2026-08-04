const { execSync } = require('child_process');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('.claude/ralph.config.json', 'utf8'));

if (!config.active) {
  process.exit(0);
}

const counterFile = '.claude/ralph.iterations.json';
let counter = { count: 0, phaseIndex: 0 };
console.log(
  `⏹️ Stopping Ralph for milestone: ${config.phases[counter.phaseIndex].milestone}`,
);
console.log(
  `⏹️ Stopping Ralph. 1. Counter: ${counter.count}/${config.maxIterations}`,
);
if (fs.existsSync(counterFile)) {
  counter = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
  console.log(
    `⏹️ Stopping Ralph. 2. Counter: ${counter.count}/${config.maxIterations}`,
  );
}

const phase = config.phases
  ? config.phases[counter.phaseIndex]
  : { milestone: config.milestone, branch: config.branch };
console.log(`⏹️ Stopping Ralph. phase: ${phase}`);

if (!phase) {
  console.log('🎉 All phases are completed.');
  process.exit(0);
}

if (counter.count >= config.maxIterations) {
  console.log(`⛔ Limit of iterations (${config.maxIterations}) reached.`);
  fs.writeFileSync(
    counterFile,
    JSON.stringify({ count: 0, phaseIndex: counter.phaseIndex }),
  );
  process.exit(0);
}

const issues = JSON.parse(
  execSync(
    `gh issue list --milestone "${phase.milestone}" --state open --json number,title`,
  ).toString(),
);

console.log(`⏹️ Stopping Ralph. Issues: ${issues}/${issues.length}`);

if (issues.length > 0) {
  counter.count++;
  fs.writeFileSync(counterFile, JSON.stringify(counter));
  console.log(`⏹️ Stopping Ralph. 3. Counter: ${counter.count}`);

  const next = issues[0];
  console.log(
    `🔄 Phase ${counter.phaseIndex + 1} — Iteration ${counter.count}/${config.maxIterations} — Issue #${next.number}: ${next.title}`,
  );
  console.log(`📋 Remaining: ${issues.length}`);

  const prompt = config.prompt
    .replace('{milestone}', phase.milestone)
    .replace('{branch}', phase.branch);

  console.log(`🚀 Запускаем Ralph для milestone: ${phase.milestone}`);
  console.log(`⏹️ Stopping Ralph. prompt: ${prompt}`);
  console.log(`⏹️ Stopping Ralph. maxTurns: ${config.maxTurns}`);

  execSync(`claude -p "${prompt}" --max-turns ${config.maxTurns}`, {
    stdio: 'inherit',
  });
} else {
  console.log(`✅ Phase ${counter.phaseIndex + 1} completed. Creating PR...`);
  execSync(
    // `claude -p "Create a PR from branch ${phase.branch} to main with the title 'feat: ${phase.milestone}'." --model claude-opus-4-7 --max-turns 10`,
    `claude -p "Create a PR from branch ${phase.branch} to master branch with the skill 'create-pr'." --model claude-opus-4-7 --max-turns 10`,
    { stdio: 'inherit' },
  );

  console.log('🔍 Review Opus 4.7...');
  execSync(
    `claude -p "Find the latest open PR and conduct a detailed code review. Check the architecture, security, performance, and compliance with the PRD. Leave comments in the PR via the gh cli." --model claude-opus-4-7 --max-turns ${config.maxTurns}`,
    { stdio: 'inherit' },
  );

  counter.phaseIndex++;
  counter.count = 0;
  fs.writeFileSync(counterFile, JSON.stringify(counter));

  const nextPhase = config.phases ? config.phases[counter.phaseIndex] : null;
  console.log(`⏹️ Stopping Ralph. Next phase: ${nextPhase}`);
  if (!nextPhase) {
    console.log('🎉 All phases are completed!');
    process.exit(0);
  }

  console.log(`➡️ Phase ${counter.phaseIndex + 1}: ${nextPhase.milestone}`);
  const prompt = config.prompt
    .replace('{milestone}', nextPhase.milestone)
    .replace('{branch}', nextPhase.branch);

  execSync(`claude -p "${prompt}" --max-turns ${config.maxTurns}`, {
    stdio: 'inherit',
  });
}
