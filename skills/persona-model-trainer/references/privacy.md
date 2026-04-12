# Privacy & Data Handling Guide

## What Gets Baked into the Model

Fine-tuning on personal conversation data permanently encodes patterns into the model weights. This is different from a prompt — **you cannot "delete" information from a trained model** without retraining from scratch.

What gets encoded:
- Speaking style, vocabulary, and rhythm
- Recurring topics and interests
- Emotional tone and relationship patterns
- Implicit values and worldview

What does NOT get encoded reliably:
- Specific facts (phone numbers, addresses, passwords) — these may appear verbatim if present in training data
- Rare one-off events (model learns patterns, not episodes)

## PII Risks

The `prepare_data.py` script scans for obvious PII patterns (SSN, credit cards, passwords, email addresses). However, it cannot catch:
- Names of third parties mentioned in conversations
- Location check-ins or travel patterns
- Health information discussed informally
- Financial details in casual language

**Recommendation**: manually review `training/conversations.jsonl` before training, especially if it contains sensitive conversations.

## Who Can Access the Model

| Distribution | Risk level |
|-------------|-----------|
| Local only (never shared) | Low — treat like a personal journal |
| Shared with trusted individuals | Medium — they can probe the model for patterns |
| Published to Ollama Hub / HuggingFace | High — anyone can query it; PII extraction attacks possible |
| Embedded in a commercial product | High — legal review required for data provenance |

## For Models of Other People

If you are training a model of someone else (with their data):
- You **must** have their explicit consent
- They should review `training/conversations.jsonl` before training
- Do not publish the model without their approval
- Consider: does the model capture things they would not want others to know?

## Recommended Practice

1. Run `prepare_data.py` — check the PII flags in `stats.json`
2. Open `training/conversations.jsonl` in a text editor and skim for sensitive content
3. Delete or redact lines with sensitive information (it's plain JSONL, one line = one turn)
4. Re-run `prepare_data.py` after cleanup
5. Keep trained model weights in a private directory, not a public repo

## Model Deletion

To fully destroy a fine-tuned model:
```bash
rm -rf models/{slug}/
```

The base model (Gemma-4) is unaffected. Only the adapter weights contain persona-specific information.
