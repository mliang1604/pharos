---
name: shell-multiline-messages
description: How to pass a multiline message (git commit/tag/PR body) to a command without corrupting it. Use whenever writing a multi-paragraph `git commit`, `git tag -a`, or `gh pr create` — the quoting differs by tool (Bash vs PowerShell).
---

# Passing multiline messages to shell commands

`@'...'@` is **PowerShell** here-string syntax. In the **Bash tool** it is not
recognized — the leading `@` becomes a literal first line of the message. Match
the form to the tool:

**Bash tool** → quoted heredoc piped to `-F -` / `--body-file -`:

```bash
git commit -F - <<'EOF'
Subject line

Body paragraph.
EOF
```

Same for `git tag -a <name> -F -` and `gh pr create --body-file -`.

**PowerShell tool** → `@'...'@` here-string, closing `'@` at column 0:

```powershell
git commit -m @'
Subject line

Body.
'@
```

If a message starts with a stray `@`, you used the wrong form — recreate it
(`git commit --amend -F -`, or `git tag -d <name>` then re-tag) before pushing.
