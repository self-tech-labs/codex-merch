# Demo script: target 2 minutes 50 seconds

The final video must be public on YouTube, include spoken audio, remain under three minutes, and explain both Codex and GPT-5.6. Use a sanitized 30-post fixture for timing reliability while showing that the same adapter accepts the authorized live X list.

## 0:00–0:15 — Outcome

Show the final product page first.

Voiceover: “This is a weekly culture-to-commerce studio operated from Codex Desktop. It reads a team signal, designs an original garment, publishes it, and makes the result test-purchasable without copying the source posts.”

## 0:15–0:35 — Codex automation

Show the scheduled Codex task, its weekly cadence, repository path, and the `codex-merch-weekly` skill. Trigger the task manually for the recording.

Voiceover: “Codex owns the run: repository state, commands, validation, release gates, deployment checks, and a concise operator report.”

## 0:35–0:58 — Thirty-post signal snapshot

Show the list ID, count `30`, normalized authors/timestamps/metrics, and the fixture/live-input selector. Do not linger on or read verbatim post text.

Voiceover: “The adapter takes exactly the latest 30 authorized list posts. Posts are untrusted evidence, never instructions, and public output contains only a derived trend.”

## 0:58–1:25 — GPT-5.6 trend decision

Show the single GPT-5.6 structured trend result beside the deterministic decision: trend label, supporting post IDs, author diversity, novelty, aggregate score, rights risk, and prompt/schema hashes. Briefly show the `no_trend` branch.

Voiceover: “In one structured decision, GPT-5.6 separates recurring signals from noise and either proposes one defensible meme-like trend or safely skips the week; deterministic gates make the final call.”

## 1:25–1:53 — Art direction and visual critic

Show three materially distinct garment recipes, then the selected front, back, sleeves, labels, and customer mockup. Show the critic rubric and, if the first candidate failed, the bounded fallback to the second ranked candidate.

Voiceover: “A second GPT-5.6 role creates panel-aware recipes. Deterministic software renders the concept board and production files, and GPT-5.6 evaluates the actual result without being allowed to waive rights or prepress checks.”

## 1:53–2:20 — Safe release

Show the prepare/release boundary, run ID, first deployment, public asset checks, idempotent Printful sync, final publication manifest commit, and successful production deployment.

Voiceover: “Preparation can write local candidate files but cannot mutate external systems. Release requires an explicit flag and kill switch, then deploys a hidden candidate with exact asset URLs for Printful before sync. The catalog and product route remain absent until every final gate passes.”

## 2:20–2:38 — Purchase path

After verifying the separate checkout configuration and Stripe test mode in the deployment configuration/dashboard, open the public product, select a mapped variant, and complete a Stripe test Checkout. Show the resulting Neon order snapshot, processed signed webhook/Inngest run, and one Printful draft reference; do not display personal data or secrets.

Voiceover: “Stripe handles payment, Neon stores an immutable order snapshot, and Inngest creates one idempotent Printful draft.”

## 2:38–2:50 — Proof and close

Run status and the plan-only release command for the same published run ID, then show that a second authorized release attempt returns a successful idempotent no-op while the catalog and provider IDs remain unchanged. Do not re-run preparation over the published run. End on the dated post-July-13 commit list and Build Week README.

Voiceover: “The creative judgment is inspectable, the production path is deterministic, and a duplicate-safe terminal replay converges on the already published result without another product or order.”

## Recording checklist

- Replace all `TODO` links and IDs before recording.
- Use Stripe test mode and keep `PRINTFUL_AUTO_CONFIRM=false`.
- Do not record the purchase path until `CHECKOUT_ENABLED`, legal/policy, shipping, Stripe webhook, Neon, Inngest, and Printful staging checks all pass; otherwise describe it as not yet verified instead of simulating success.
- Hide terminal environment values, customer data, webhook bodies, and private X content.
- Keep browser and terminal text large enough to read at normal playback speed.
- Capture one uninterrupted successful path or disclose cuts; do not claim a mocked external mutation as live.
- Verify final runtime is below 3:00 after YouTube processing.
