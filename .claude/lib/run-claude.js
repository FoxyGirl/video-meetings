const { spawn } = require('child_process');
const readline = require('readline');

function summarizeToolInput(name, input) {
  if (!input) return '';
  if (name === 'Bash' && input.command) return input.command;
  if (input.file_path) return input.file_path;
  if (input.pattern) return input.pattern;
  if (input.description) return input.description;
  if (input.query) return input.query;
  return '';
}

// Runs `claude -p` with streamed, human-readable progress output so a long
// unattended run never looks silently stuck — see .claude/ralph.md.
function runClaude(prompt, { maxTurns, model } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (maxTurns) args.push('--max-turns', String(maxTurns));
    if (model) args.push('--model', model);

    const child = spawn('claude', args, {
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    const rl = readline.createInterface({ input: child.stdout });
    let result = null;

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (event.type === 'system' && event.subtype === 'init') {
        console.log(`🟢 Session started (model: ${event.model})`);
        console.log(`🟢 Session started -> prompt: ${prompt}`);
      } else if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'text' && block.text.trim()) {
            console.log(`💬 ${block.text.trim()}`);
          } else if (block.type === 'tool_use') {
            const detail = summarizeToolInput(block.name, block.input);
            console.log(`🔧 ${block.name}${detail ? `: ${detail}` : ''}`);
          }
        }
      } else if (event.type === 'result') {
        result = event;
        const turns = event.num_turns ?? '?';
        const seconds = event.duration_ms
          ? `${(event.duration_ms / 1000).toFixed(1)}s`
          : '?';
        console.log(
          `✅ Session finished — ${turns} turns, ${seconds}${event.is_error ? ' (ERROR)' : ''}`,
        );
      }
    });

    child.on('close', (code) => {
      rl.close();
      if (code === 0) resolve(result);
      else reject(new Error(`claude exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

module.exports = { runClaude };
