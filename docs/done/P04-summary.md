# P04 summary — DONE 2026-11-20

- Identity: 12-word BIP39 key (`@scure/bip39` 2.4.0, pinned) -> HKDF-SHA-256 -> AES-GCM 256 key; the words are shown once and never stored. Register, Login (wrong key gives `wrong_key`), Log out, key check `np-key-check-v1`; spec in `docs/IDENTITY.md`.
- Encrypted local store (Dexie v2): personal rows hold one encrypted `blob` with the row name as AAD; only course ids, lesson ids and dates stay plain (stated honestly in the privacy text).
- Onboarding screens (Welcome, Register, Fingerprint offer, PIN offer, Basic info, Privacy) behind a route guard; Settings cards for passphrase info, Log out, fingerprint lock and PIN lock.
- Optional locks: fingerprint (WebAuthn; PRF level wraps the key, gate level guards the screen) and 6-digit PIN (PBKDF2, 5 tries); both may be on: a good fingerprint opens the app alone, otherwise the PIN screen; the 12 words always work. Tested on the owner's phone.
- `npm run check` = 632 tests green; build JS 163.4 KB gzip; commit `5da279f` on `master`; `npm audit --omit=dev` = 0 vulnerabilities. Known gap: the fingerprint "Turn on" in onboarding does not offer the PIN (Settings does).
