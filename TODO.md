# TODO

## Peer Recognition Export

Add a `peer-recognition.json` file to the export bundle containing praise comments given and received, for the LLM to curate into a brag sheet.

### Data structure

```json
{
  "inbound": [
    {
      "repo": "org/repo",
      "pr_number": 42,
      "pr_title": "Refactor auth module",
      "pr_url": "https://github.com/...",
      "reviewer": "alice",
      "comment_body": "praise: This is incredibly clean...",
      "tag": "praise",
      "timestamp": "2026-03-15T..."
    }
  ],
  "outbound": [...]
}
```

### Filtering (before export)

- Only merged PRs
- Only `praise:` tagged comments (via existing `TAG_RE`)
- Exclude bot authors
- Exclude very short bodies (< 20 chars after tag)
- Dedupe per PR thread (keep longest)

### Up-rank signals (metadata for the model)

- Praise that mentions *why* something was good
- Praise on high-complexity PRs (additions + deletions)
- Praise from multiple reviewers on same workstream

### Prompt guidance (in bundle README)

> Use `peer-recognition.json` as third-party recognition evidence.
> Select up to 3–5 inbound quotes that best reinforce impact, technical judgment,
> collaboration, or maintainability. Prefer quotes with concrete context over short
> reactions. Optionally include 1–2 light/funny quotes in an appendix if they add
> personality without weakening professionalism.

### Files to change

- `app/src/enrichExport.ts` — add `extractPraiseComments(repos, user)` with filtering
- `app/src/App.tsx` — add `exportAIContext(JSON.stringify(praise, null, 2), ...peer-recognition.json)` alongside other exports
- `app/src/App.tsx` — update bundle README table with `peer-recognition.json` entry
