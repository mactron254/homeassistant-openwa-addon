# OpenWA Bot ES Home Assistant Add-on

Home Assistant add-on repository for OpenWA plus a Spanish WhatsApp bot for Home Assistant, Groq chat, and Groq Whisper voice transcription.

## Overview

- OpenWA API and dashboard on port `2785`.
- Bot helper API on port `2786`.
- Text menus always work without Groq.
- Groq is optional and never executes Home Assistant actions directly.
- Groq defaults to your current free organization limits, with `custom` available for per-project overrides.
- Home Assistant control uses allowlisted domains/entities, not one script per action.
- Critical Home Assistant domains require literal `SI` confirmation.

## Install

1. Add this repository to Home Assistant Add-on Store.
2. Install **OpenWA Bot ES**.
3. Configure `whatsapp.allowed_senders`, `home_assistant`, and optional `groq.api_key`.
4. Start the add-on.
5. Open the add-on Web UI or `http://homeassistant.local:2785/` and link WhatsApp from the OpenWA dashboard.

## Helper API

Protected endpoints require `X-API-Key`.

- `GET /`
- `GET /health`
- `GET /qr`
- `POST /webhook/openwa`
- `POST /send`
- `POST /send/{alias}`

The webhook endpoint verifies `X-OpenWA-Signature`.

## Updates

This fork tracks `nomi25home/homeassistant-openwa-addon` as `upstream`.
The OpenWA base image defaults to `ghcr.io/rmyndharis/openwa:latest` because the previously documented `v0.7.2` tag is not published in GHCR. For production, pin this to a real upstream tag or digest when one is available.

Recommended update flow:

1. `git fetch upstream`
2. Merge or rebase upstream add-on changes.
3. Update OpenWA image tag in a separate commit.
4. Run bot tests and Docker smoke test before release.

## Security

Do not expose OpenWA directly to the public internet without authentication, TLS, and network controls.
Groq only classifies intent or extracts entity/value data. HA execution is allowlisted through add-on options and mapped to known Home Assistant services.

The optional `homeassistant-openwa-whatsapp` HACS integration remains compatible for HA -> WhatsApp notifications, but this add-on does not depend on it for WhatsApp -> HA control.
