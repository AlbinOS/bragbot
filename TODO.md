# TODO

## Feedback Received Breakdown

Parse conventional comment tags from comments **received** on authored PRs (`review_comments` on authored PRs) to build an inbound feedback profile:

- `praise_received` count — how often reviewers praised your code
- `question_received`, `suggestion_received`, `issue_received`, `nit_received` counts
- **Top praises** — surface the best praise comments received. Ranking ideas:
  - Longest praise comment (more effort = more meaningful)
  - Praise from senior/frequent reviewers (weighted by reviewer seniority)
  - Praise with emoji (🐐, 🔥, 🚀) as a signal of enthusiasm
  - Praise on large/complex PRs (more impressive context)
- Dashboard chart: "Praise Wall" or "Best Compliments" — show top 5-10 praise quotes with reviewer name and PR link
- Dashboard chart: inbound feedback tag breakdown (mirror of the outbound one)
