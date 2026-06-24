# OpenWA Bot ES Add-on Documentation

## Ports

| Port | Purpose | Description |
|---:|---|---|
| `2785` | OpenWA native API | Full WhatsApp API and OpenWA dashboard. |
| `2786` | Bot helper API | Spanish bot, webhook receiver, QR proxy, and send helper. |

## Options

### `api_master_key`

Optional master key for OpenWA and helper endpoints. If empty, OpenWA generates a secure key on first boot.
Protected helper requests must include this key in `X-API-Key`.

### `engine_type`

Default is `baileys`. Use `whatsapp-web.js` if Baileys has a compatibility issue.

### `allowed_senders`

List of WhatsApp JIDs or phone numbers allowed to use the bot. Audio is processed only for these senders.

### `groq_plan`

- `free`: default. Uses your current Groq free organization limits for known models.
- `custom`: exact project limits copied from Groq console.

### Groq Limits

Configure chat limits with `groq_chat_*` and quality model limits with `groq_quality_*`.
Voice limits use `groq_voice_rpm`, `groq_voice_rpd`, `groq_voice_ash`, and `groq_voice_asd`.
Observed `x-ratelimit-*` headers are stored in `/data/bot/rate-limits.json`.

Free organization chat defaults included:

| Model | RPM | RPD | TPM | TPD |
|---|---:|---:|---:|---:|
| `llama-3.1-8b-instant` | 30 | 14.4K | 6K | 500K |
| `llama-3.3-70b-versatile` | 30 | 1K | 12K | 100K |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 30 | 1K | 30K | 500K |
| `openai/gpt-oss-120b` | 30 | 1K | 8K | 200K |
| `openai/gpt-oss-20b` | 30 | 1K | 8K | 200K |
| `qwen/qwen3-32b` | 60 | 1K | 6K | 500K |

Speech-to-text free organization defaults:

| Model | RPM | RPD | ASH | ASD |
|---|---:|---:|---:|---:|
| `whisper-large-v3` | 20 | 2K | 7.2K | 28.8K |
| `whisper-large-v3-turbo` | 20 | 2K | 7.2K | 28.8K |

### Voice

`groq_voice_model` defaults to `whisper-large-v3-turbo`.
The transcription request always sends `language=es`.
`max_audio_seconds` defaults to `120`.
`chunk_audio=false` rejects longer audio.

### Home Assistant

`ha_sensors` lists readable entities.
`ha_scripts` lists executable scripts.
Scripts marked `critical` require the user to answer `SI`.

### Recipients

Named aliases used by `/send/{alias}`.
