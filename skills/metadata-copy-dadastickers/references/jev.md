# Optional Jev statement selection

Use Jev to compare the meaning of an already filtered shortlist with the field's facts and editorial context. It can recommend the first statement or the next link of a local Catena Dada21 chain. The existing length, character, rarity, exclusion and verbatim checks still apply, and the user still approves the composed copy in workflow step 6.

```bash
bun $S/statements.ts pick --field description --facts "<page facts>" --keywords "<Italian keywords>" --jev --jev-context "<page subject, audience and tone>" --json
```

## Access and cost

`--jev` explicitly enables one paid OpenRouter Decisions request using `typesafe/jev-1.14`. Use it only when that spending is authorized. The script reads an existing `OPENROUTER_API_KEY` at runtime; it never prints or saves the key. Follow the host's credential policy to supply it. No TypeSafe account, Jev subscription or additional package is required. Never copy a key from another project or put one in the plan. When the key is absent, continue without Jev instead of asking the user to sign up.

Only the first 30 candidates from this search, the supplied facts and editorial context, and the existing chain and connector are sent to OpenRouter. The full corpus and install token are never sent. Through the CH Labs service, Jev sees only the at most 3 returned candidates; it does not unlock more statements or enable chains. Keep inputs short: requests over 24 KB fall back locally without a paid call. Calls have a 15-second timeout and are not retried automatically.

## Result and fallback

Jev chooses a candidate ID or `none`. A valid recommendation moves that original candidate to the first row, keeping every other candidate in its original order. `--json` adds a `jev` object with `status`, `model`, the recommended `statement`, and `confidence`, `probabilities` and `cost` when returned by the API. Probabilities use the submitted IDs (`s1`, `s2`, …) in the shortlist's original order; `none` means no suitable hook. Text output labels the recommendation and shows confidence and cost when available.

This is an editorial recommendation, not automatic approval. Confidence is a model signal, not a measured probability of correctness; there is no acceptance threshold claimed to be calibrated. Read the recommendation in context and keep the normal plan check and approval.

Without `--jev`, behavior and output are unchanged, with no OpenRouter call even when a key is present. With `--jev`, a missing key, fewer than two candidates, an oversized input, an unavailable model, insufficient credits, rate limits, a timeout, refusal or malformed answer leaves the original shortlist intact. The output reports `jev.status: "fallback"` and a short reason. A `none` answer also preserves the shortlist: review it yourself or revise the keywords, with no automatic extra searches or API calls.

API details: [Jev on OpenRouter](https://openrouter.ai/docs/guides/community/jev) and [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request).
