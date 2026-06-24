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

### `whatsapp`

`whatsapp.allowed_senders` lists WhatsApp JIDs or phone numbers allowed to use the bot. Audio is processed only for these senders.
`whatsapp.recipients.primary` is the default named recipient for helper send APIs.

### `groq`

Profiles:

- `disabled`: no AI, fixed menu only.
- `free_balanced`: default. Uses current Groq free organization limits for known models.
- `free_quality`: uses the quality model for intent classification.
- `custom`: exact project limits copied from Groq console through `groq.custom_limits`.

### Groq Limits

Free profiles ignore custom limit overrides and select known limits by model.
Custom profile uses `groq.custom_limits.chat`, `groq.custom_limits.quality`, and `groq.custom_limits.voice`.
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

`groq.voice_model` defaults to `whisper-large-v3-turbo`.
The transcription request always sends `language=es`.
`groq.max_audio_seconds` defaults to `120`.
`groq.chunk_audio=false` rejects longer audio.

### Assistant

`assistant.knowledge_csv` defaults to `knowledge.csv` under `/config`.
`assistant.commands_json` defaults to `commands.json` under `/config`.
`assistant.max_tool_rounds` limits Groq local-tool loops.
`assistant.enable_history=true` enables `get_home_history` over the HA history API.

`knowledge.csv` augments auto-discovered Home Assistant entities:

```csv
entity_id,friendly_name,area,zone,aliases,capabilities,priority,critical,description
sensor.solar_power,Potencia placas,energia,tejado,"placas;planta;solar",read,10,false,Generacion solar actual
number.evcc_limit,Limite EVCC,coche,garaje,"cargador;evcc;amperios","read;control",8,true,Limite de carga del coche
```

`commands.json` defines safe multi-step or named actions:

```json
[
  {
    "id": "saj_battery_self_use",
    "aliases": ["modo autoconsumo bateria", "poner saj en autoconsumo"],
    "description": "Cambia SAJ AS1 a modo autoconsumo",
    "critical": true,
    "actions": [
      {"entity_id": "select.saj_work_mode", "action": "select_option", "value": "Self Use"}
    ]
  }
]
```

Groq uses local tool calling with these helper tools:

| Tool | Purpose |
|---|---|
| `search_home` | Find semantic entities and predefined commands. |
| `get_home_state` | Read current HA states. |
| `get_home_history` | Summarize HA history when enabled. |
| `control_entity` | Execute one safe entity action. |
| `run_command` | Execute a predefined command from `commands.json`. |

### Home Assistant

`home_assistant.read.domains` controls which entity domains can be queried.
`home_assistant.control.domains` controls which domains can be changed.
`home_assistant.control.entities.deny` blocks entities even when the domain is allowed.
`home_assistant.control.entities.allow` restricts control to listed entities when non-empty.

The bot maps commands to safe Home Assistant services:

| Domain | Services |
|---|---|
| `switch`, `fan` | `turn_on`, `turn_off` |
| `light` | `turn_on`, `turn_off`, optional `brightness_pct` |
| `cover` | `open_cover`, `close_cover`, `stop_cover`, `set_cover_position` |
| `climate` | `set_temperature`, `set_hvac_mode` |
| `number`, `input_number` | `set_value` |
| `select`, `input_select` | `select_option` |

Domains in `home_assistant.critical.always_confirm_domains` require the user to answer `SI`.
Legacy `ha_sensors` and `ha_scripts` remain supported in memory for existing installs.

### Recipients

Named aliases under `whatsapp.recipients` are used by `/send/{alias}`. The default alias is `primary`.

### Optional HACS Integration

`homeassistant-openwa-whatsapp` is compatible for HA -> WhatsApp notifications through `openwa_whatsapp.send_message`.
It is not required for this add-on. WhatsApp -> HA control is handled by the bot helper through the Home Assistant Supervisor API.
