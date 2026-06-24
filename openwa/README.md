# OpenWA Bot ES Add-on

OpenWA WhatsApp gateway with a Spanish Home Assistant bot, Groq chat, and Groq Whisper voice support.

## Services

- OpenWA API and dashboard: `2785`
- Bot helper API: `2786`

## Bot

- Only numbers in `whatsapp.allowed_senders` are processed.
- Text menu is always available.
- Groq is optional. If no API key exists, fixed menus still work.
- Voice notes are transcribed with `whisper-large-v3-turbo` and `language=es`.
- Home Assistant control uses allowlisted domains/entities.
- Critical domains require a literal `SI` confirmation.

## Groq Profiles

- `disabled`: no AI, fixed menu only.
- `free_balanced`: default, with current free organization limits per model.
- `free_quality`: uses the quality model for intent classification.
- `custom`: exact limits copied from Groq console.

When local limits are reached, the bot answers: `Limite IA alcanzado, usa menu fijo`.

## Security

Groq only classifies intent and extracts entity/value data. Home Assistant actions run only through configured domain/entity allowlists and a fixed service map.
