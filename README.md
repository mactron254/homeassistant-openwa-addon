# OpenWA Bot ES Home Assistant Add-on

Home Assistant add-on repository for OpenWA plus a Spanish WhatsApp bot for Home Assistant, Groq chat, and Groq Whisper voice transcription.

## Overview

- OpenWA API and dashboard on port `2785`.
- Bot helper API and simple status UI on port `2786`.
- Text menus always work without Groq.
- Groq is optional and never executes Home Assistant actions directly.
- Groq defaults to your current free organization limits, with `custom` available for per-project overrides.
- Critical Home Assistant scripts require literal `SI` confirmation.

## Install

1. Add this repository to Home Assistant Add-on Store.
2. Install **OpenWA Bot ES**.
3. Configure `allowed_senders`, `ha_sensors`, `ha_scripts`, and optional `groq_api_key`.
4. Start the add-on.
5. Open `http://homeassistant.local:2786/qr` and link WhatsApp.

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
The OpenWA base image is pinned in `openwa/Dockerfile` (`ghcr.io/rmyndharis/openwa:v0.7.2` by default), not `latest`.

Recommended update flow:

1. `git fetch upstream`
2. Merge or rebase upstream add-on changes.
3. Update OpenWA image tag in a separate commit.
4. Run bot tests and Docker smoke test before release.

## Security

Do not expose OpenWA directly to the public internet without authentication, TLS, and network controls.
Groq only classifies intent or drafts text; HA execution is allowlisted through add-on options.
