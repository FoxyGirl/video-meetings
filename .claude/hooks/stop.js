const { execSync } = require('child_process');
const fs = require('fs');
const { runClaude } = require('../lib/run-claude');

const counterFile = '.claude/ralph.iterations.json';

function gitIsDirty() {
  return execSync('git status --porcelain').toString().trim().length > 0;
}

function warnIfDirty(issueNumber) {
  if (gitIsDirty()) {
    console.log(
      `⚠️ Working tree still has uncommitted changes after working on issue #${issueNumber}. ` +
        `The session likely ran out of turns or got stuck before committing — see .claude/ralph.md's "If You Get Stuck" section.`,
    );
  }
}

function isIssueClosed(issueNumber) {
  const { state } = JSON.parse(
    execSync(`gh issue view ${issueNumber} --json state`).toString(),
  );
  console.log(
    `⏹️ Stopping Ralph isIssueClosed. Issue #${issueNumber} state: ${state}`,
  );
  return state === 'CLOSED';
}

async function main() {
  const config = JSON.parse(
    fs.readFileSync('.claude/ralph.config.json', 'utf8'),
  );
  console.log(`⏹️ Stopping Ralph. Config: ${JSON.stringify(config, null, 2)}`);

  if (!config.active) {
    process.exit(0);
  }

  let counter = { count: 0, phaseIndex: 0 };
  console.log(
    `⏹️ Stopping Ralph. 1. Counter: ${counter.count}/${counter.phaseIndex}`,
  );
  console.log(`⏹️ Stopping Ralph. Counter PHASEINDEX: ${counter.phaseIndex}`);
  if (fs.existsSync(counterFile)) {
    counter = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
    console.log(
      `⏹️ Stopping Ralph. 2. Counter: ${counter.count}/${counter.phaseIndex}`,
    );
  }

  const phase = config.phases
    ? config.phases[counter.phaseIndex]
    : { milestone: config.milestone, branch: config.branch };
  console.log(`⏹️ Stopping Ralph. phase: ${JSON.stringify(phase, null, 2)}`);

  if (!phase) {
    console.log('🎉 All phases are completed.');
    process.exit(0);
  }

  console.log(
    `⏹️ Stop hook: milestone "${phase.milestone}", iteration ${counter.count}/${config.maxIterations}`,
  );

  const issues = JSON.parse(
    execSync(
      `gh issue list --milestone "${phase.milestone}" --state open --json number,title`,
    ).toString(),
  ).sort((a, b) => a.number - b.number);

  if (counter.count >= config.maxIterations) {
    console.log(`⛔ Limit of iterations (${config.maxIterations}) reached.`);
    if (issues.length > 0) {
      const stuck = issues[0];
      console.log(
        `⚠️ Issue #${stuck.number} is still open after ${config.maxIterations} attempts — leaving a comment for a human.`,
      );
      execSync(
        `gh issue comment ${stuck.number} --body "🤖 Ralph loop hit its iteration limit (${config.maxIterations}) on this issue without closing it. Stopping automated attempts — needs human attention."`,
      );
    }
    fs.writeFileSync(
      counterFile,
      JSON.stringify({ count: 0, phaseIndex: counter.phaseIndex }),
    );
    process.exit(0);
  }
  console.log(
    `⏹️ Stopping Ralph. Issues: ${JSON.stringify(issues, null, 2)}/${issues.length}`,
  );

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

    await runClaude(prompt, { maxTurns: config.maxTurns });

    warnIfDirty(next.number);
    console.log(
      isIssueClosed(next.number)
        ? `✅ Issue #${next.number} is closed.`
        : `⚠️ Issue #${next.number} is still open — the session ended without finishing it.`,
    );
  } else {
    console.log(`✅ Phase ${counter.phaseIndex + 1} completed. Creating PR...`);
    await runClaude(
      `Create a PR from branch ${phase.branch} to master branch with the skill 'create-pr'.`,
      {
        model: 'claude-opus-4-7',
        maxTurns: 10,
      },
    );

    console.log('🔍 Review Opus 4.7...');
    await runClaude(
      'Find the latest open PR and conduct a detailed code review. Check the architecture, security, performance, and compliance with the PRD. Leave comments in the PR via the gh cli.',
      { model: 'claude-opus-4-7', maxTurns: config.maxTurns },
    );

    counter.phaseIndex++;
    counter.count = 0;
    fs.writeFileSync(counterFile, JSON.stringify(counter));

    const nextPhase = config.phases ? config.phases[counter.phaseIndex] : null;
    console.log(
      `⏹️ Stopping Ralph. Next phase: ${JSON.stringify(nextPhase, null, 2)}`,
    );
    if (!nextPhase) {
      console.log('🎉 All phases are completed!');
      process.exit(0);
    }

    console.log(`➡️ Phase ${counter.phaseIndex + 1}: ${nextPhase.milestone}`);
    const prompt = config.prompt
      .replace('{milestone}', nextPhase.milestone)
      .replace('{branch}', nextPhase.branch);

    await runClaude(prompt, { maxTurns: config.maxTurns });
  }
}

main().catch((err) => {
  console.error(`❌ Ralph stop hook failed: ${err.message}`);
  process.exit(1);
});
