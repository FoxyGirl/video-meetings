---
name: read-file
description: Read a file or part of a file efficiently without unnecessary tokens.
---

# Read File

Read $ARGUMENTS efficiently, without spending tokens on more than what's needed. Prefer the dedicated `Read` and `Grep` tools over shelling out — only fall back to Bash where there's no tool equivalent (structured JSON queries, brace-bounded extraction).

1. If you don't already know where the part you need lives, use `Grep` (`-n`, `output_mode: "content"`) with a pattern like `function|class|export|interface` to locate section/function/class boundaries without reading the file yet.

2. Call `Read` with `offset`/`limit` set to just the range you need (from the grep match's line number). Don't call `Read` on an entire file once you know it's large and you only need one part of it.

3. For JSON, if you only need one key, use Bash `jq` instead of Read — there's no structured-query option in the Read tool:
   `jq '.key' {file}`

4. For Prisma schema files, extract a single model with Bash `sed` — it cleanly bounds the block at the closing brace, which grep/Read line ranges can't do without knowing the model's length upfront:
   `sed -n '/model {Name}/,/^}/p' {file}`

5. Read a file in full (no offset/limit) only when it's short or you genuinely need the whole thing — e.g. reviewing a complete config file.

Never read a file entirely if you only need one function, section, or model.
