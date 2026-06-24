# OpenWA Bot ES Add-on

OpenWA WhatsApp gateway with a Spanish Home Assistant bot, Groq chat, and Groq Whisper voice support.

## Services

- OpenWA API and dashboard: `2785`
- Bot helper API: `2786`

## Bot

- Only numbers in `whatsapp.allowed_senders` are processed.
- Text menu is always available.
- Groq is optional. If no API key exists, fixed menus and configured command aliases still work.
- Voice notes are transcribed with `whisper-large-v3-turbo` and `language=es`.
- Home Assistant control uses allowlisted domains/entities.
- Natural Spanish questions use Groq local tool-calling over a semantic HA catalog.
- Optional `/config/knowledge.csv` adds aliases, areas, zones, descriptions, and priorities.
- Optional `/config/commands.json` defines EVCC/V2C/SAJ or battery-mode actions.
- Critical domains require a literal `SI` confirmation.

## Groq Profiles

- `disabled`: no AI, fixed menu only.
- `free_balanced`: default, with current free organization limits per model.
- `free_quality`: uses the quality model for intent classification.
- `custom`: exact limits copied from Groq console.

When local limits are reached, the bot answers: `Limite IA alcanzado, usa menu fijo`.

## Assistant Files

`knowledge.csv` columns:

```csv
entity_id,friendly_name,area,zone,aliases,capabilities,priority,critical,description
sensor.solar_power,Potencia placas,energia,tejado,"placas;planta;solar",read,10,false,Generacion solar actual
```

`commands.json` example:

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

## Security

Groq only requests local tools. Home Assistant actions run only through configured domain/entity allowlists and a fixed service map.
