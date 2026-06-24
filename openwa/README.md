# OpenWA Bot ES Add-on

OpenWA WhatsApp gateway with a Spanish Home Assistant bot, Groq chat, and Groq Whisper voice support.

## Services

- OpenWA API and dashboard: `2785`
- Bot helper API and simple status UI: `2786`

## Bot

- Only numbers in `allowed_senders` are processed.
- Text menu is always available.
- Groq is optional. If no API key exists, fixed menus still work.
- Voice notes are transcribed with `whisper-large-v3-turbo` and `language=es`.
- Critical scripts require a literal `SI` confirmation.

## Groq Plans

- `free`: default, with your current organization limits.
- `custom`: exact limits copied from Groq console.

When local limits are reached, the bot answers: `Limite IA alcanzado, usa menu fijo`.

## Security

Groq only classifies intent or drafts text. Home Assistant actions run only through configured sensor/script allowlists.
