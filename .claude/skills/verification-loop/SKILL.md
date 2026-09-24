---
name: verification-loop
description: "A comprehensive verification system for Claude Code sessions. Use when verifying a Claude Code session's work before claiming it is complete."
license: MIT
metadata:
  origin: ECC
---

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

### Phase 1: Build Verification
```bash
# Check if project builds
npm run build 2>&1 | tail -20
# OR
pnpm build 2>&1 | tail -20
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
set -o pipefail
# TypeScript projects
npx --no-install tsc --noEmit 2>&1 | head -30

# Python projects
pyright . 2>&1 | head -30
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check
```bash
# JavaScript/TypeScript
npm run lint 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30
```

### Phase 4: Test Suite
```bash
# Run tests with coverage
npm run test -- --coverage 2>&1 | tail -50

# Check coverage threshold
# Target: 80% minimum
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan
```bash
# Check for secrets
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# Check for console.log
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

### Phase 7: Render smoke test (NEW for Next.js / SSR apps)

`tsc --noEmit` + `eslint` + `next build` all returning EXIT=0 does NOT mean
the route renders without error. Next 16 + Turbopack has at least two
runtime-only failure modes (server→client function props, framer-motion
SSR variants) that are invisible to the type checker and the build.

**Before declaring a new Next.js route ready to deploy, do an actual
HTTP GET against the running standalone:**

```bash
# Build + run standalone locally
npm run build 2>&1 | tail -10
mkdir -p .next/standalone/db
npx prisma db push --url file:/tmp/ld-bd/test.db
cp /tmp/ld-bd/test.db .next/standalone/db/dev.db

# Start standalone (cwd MUST be .next/standalone; .env.local absolute path)
cd .next/standalone && \
  ADMIN_JWT_SECRET=$(grep ^ADMIN_JWT_SECRET= /home/lex/<repo>/.env.local | cut -d= -f2) \
  ... \
  DATABASE_URL=file:/tmp/ld-bd/test.db PORT=3011 NODE_ENV=production \
  node server.js &

# Sign JWT and curl
node --input-type=module -e "..." > /tmp/jwt.txt
curl -s -o /tmp/page.html -w "status=%{http_code}\n" \
  -b "ld-admin-token=$(cat /tmp/jwt.txt)" \
  http://127.0.0.1:3011/<route>

# MANDATORY grep: 500 is always a bug, regardless of HTML content
if grep -q "__next_error__\|TypeError\|Functions cannot" /tmp/page.html; then
  echo "RUNTIME ERROR IN RESPONSE — fix before deploy"
  exit 1
fi
```

For Next.js apps this is the gate. For other stacks (REST APIs, CLI
tools, scripts) Phase 7 is unnecessary — Phase 5 (test suite) covers it.

When the verification fails: capture the unminified stack from the local
server (the dev / standalone server prints non-minified), fix the root
cause, repeat the cycle. See `nextjs-best-practices` §"The trap inside
the trap" for the pattern of two sequential runtime bugs after a
"Functions cannot" fix.

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run: /verify
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
