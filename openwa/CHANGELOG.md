# Changelog

## 0.5.0

- Replaced simple Groq classification with local tool-calling agent flow.
- Added semantic Home Assistant catalog from auto-discovery plus `/config/knowledge.csv`.
- Added `/config/commands.json` for predefined EVCC/V2C/SAJ and battery-mode actions.
- Added local tools for HA search, state read, history summary, safe entity control, and predefined commands.
- Stored critical pending actions as exact entity/action lists before `SI` confirmation.

## 0.4.0

- Replaced flat Groq options with grouped `groq` profile configuration.
- Replaced sensor/script-only HA config with entity/domain read and control allowlists.
- Added safe Home Assistant service mapping for switch, light, cover, climate, number, select, input helpers, and fan.
- Kept legacy option compatibility for existing installs.
- Documented optional HACS integration compatibility for HA -> WhatsApp notifications.

## 0.3.0

- Added Spanish Home Assistant WhatsApp bot helper.
- Added Groq chat and Whisper voice transcription with local free organization rate limits.
- Added `ENTRYPOINT []` and root-controlled startup for `/data/openwa` permissions.
- Defaulted WhatsApp engine to `baileys` with `whatsapp-web.js` fallback.
- Defaulted OpenWA image to `ghcr.io/rmyndharis/openwa:latest`.

## 0.2.0

- Promoted the OpenWA Home Assistant add-on to version 0.2.0.
- Added recommended pairing with the OpenWA WhatsApp HACS integration 0.2.0.
- Fixed OpenWA startup order so the native API starts before the helper server.
- Added OpenWA health checks before helper session setup.
- Improved automatic session creation and startup handling.
- Added QR setup flow guidance for first-time WhatsApp linking.
- Documented companion HACS integration setup using the native OpenWA API on port 2785.
- Improved troubleshooting guidance for QR, session ID, and persistence issues.

## 0.1.0

- Initial Home Assistant add-on release.
- Added native OpenWA API exposure on port 2785.
- Added helper API and status UI on port 2786.
- Added configurable `openwa_api_key`, `api_master_key`, `session_id`, log level, and recipient aliases.
