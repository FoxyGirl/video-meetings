// const { execSync } = require('child_process');
const fs = require('fs');
const { spawn } = require('child_process');

const config = JSON.parse(fs.readFileSync('.claude/ralph.config.json', 'utf8'));
console.log(`⏹️ Starting Ralph. config: ${JSON.stringify(config, null, 2)}`);

// Сбрасываем счётчик итераций
fs.writeFileSync(
  '.claude/ralph.iterations.json',
  JSON.stringify({ count: 0, phaseIndex: 0 }),
);

// Запускаем первую итерацию
const prompt = config.prompt
  .replace('{milestone}', config.phases[0].milestone)
  .replace('{branch}', config.phases[0].branch);
console.log(`🚀 Запускаем Ralph для milestone: ${config.phases[0].milestone}`);

// Silent mode that shows only the final result, without intermediate output !!!
// execSync(`claude -p "${prompt}" --max-turns ${config.maxTurns}`, {
//   stdio: 'inherit',
// });

// Spawn child process to run Ralph with streaming output allows to see the output in real-time and handle events
console.log(`⏹️ Running Ralph with spawn. prompt: ${prompt}`);
const child = spawn(
  'claude',
  [
    '-p',
    prompt,
    '--max-turns',
    String(config.maxTurns),
    '--verbose',
    '--output-format',
    'stream-json',
  ],
  { stdio: ['inherit', 'pipe', 'inherit'] },
);

let buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'assistant') {
        for (const c of ev.message?.content || []) {
          if (c.type === 'text') process.stdout.write(c.text);
          if (c.type === 'tool_use')
            console.log(
              `\n🔧 ${c.name}`,
              JSON.stringify(c.input).slice(0, 120),
            );
        }
      } else if (ev.type === 'result') {
        console.log(`\n✅ Done (${ev.num_turns} turns, ${ev.duration_ms}ms)`);
      } else if (ev.type === 'system' && ev.subtype === 'init') {
        console.log('⚙️  Session started:', ev.session_id);
      }
    } catch (err) {
      /* partial line */
      console.log('⚠️  Failed to parse line:', line);
      console.error(err);
    }
  }
});

child.on('exit', (code) => process.exit(code));
