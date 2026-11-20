# Identity, keys and app locks (P04)

Source of truth for how a person is "logged in", what is encrypted and what is not. The privacy text shown in the app must match this file.

## The idea in one paragraph
There is no server and no account. At Register the app makes 12 words (BIP39, English). The words ARE the key. Everything personal on the device is
encrypted with a key made from them. The words are shown once, never saved, and nobody (including the developer) can recover them.

## Flow in words
1. Register: 12 words are made and shown. The person copies them and confirms. Optional name, email, phone.
2. Optional offers, right after Register: fingerprint lock (turn on or skip); if the fingerprint was skipped, a PIN lock is offered.
   The fingerprint "Turn on" does not offer the PIN. To have both, set the second lock later in Settings (it asks for the 12 words once).
3. Short info screen, honest privacy screen, then Home.
4. Every normal open afterwards does NOT ask for the 12 words. With no lock the app opens straight in. With a lock see "Locks" below.
5. New device or cleared browser: Login. The person pastes the 12 words. Data comes back later through the encrypted backup file (P12), not by itself.
6. Log out is explicit. It deletes the saved key, the wrapped keys and the lock records. The encrypted data stays on the device; logging in again with the same words opens it.

## Keys (all in `src/core/identity/`)
- Words to entropy: 16 bytes, checksum validated. Wrong count, unknown word or bad checksum gives a reason code, never a crash.
- Entropy to key: HKDF-SHA-256, fixed salt `np/salt/v1`, info `np/store/v1` (local store) or `np/backup/v1` (backup). Result: AES-GCM 256 key, not extractable.
- Cipher: every value is `{ v, iv, ct }` with a NEW random 12-byte IV; the row name is bound as additional data, so a ciphertext cannot be moved to another row.
  Wrong key, wrong row or tampering gives a typed `DecryptError`.
- Key check: the text `np-key-check-v1` is encrypted and saved. Login on a device that has it must decrypt it, otherwise "wrong key".
- The 12 words exist only in memory while they are on screen or being typed. Never in the database, localStorage, console, URL or error text.

## What is encrypted and what is not
- Encrypted: profile (name, email, phone), progress details, test attempts and scores (one encrypted blob per row).
- NOT hidden: course names, which lessons were opened, test dates, the onboarding flag and the key check. Updates and course downloads contact GitHub.

## Locks (optional, from the owner's requests)
- Fingerprint lock (WebAuthn, platform authenticator; no biometric data reaches the app). Two honest levels, chosen at runtime:
  PRF level: the key is wrapped with a key from the passkey's PRF output and the plain saved key is removed, so opening really needs the fingerprint.
  Gate level (PRF missing): the fingerprint only guards the app opening; the plain key stays saved. The screen says "protects the app screen, not the files".
- PIN lock: exactly 6 digits, no straight runs. The key is wrapped with a key from PBKDF2-SHA-256 (600 000 rounds, random salt). Five wrong PINs in a row remove the PIN lock.
- Both together (owner decision 2026-11-19): fingerprint first. A good fingerprint opens the app and no PIN is asked. If the fingerprint is cancelled or fails, the PIN screen opens.
- The 12 words ALWAYS work, from Login or from the PIN screen, whatever happens to a lock. A 12-word login never brings the plain key back while a PRF fingerprint or a PIN lock exists.
- Turning one lock off keeps the other. With a gate-level fingerprint plus PIN, turning the fingerprint off removes the plain key so the PIN guards the data again.

## Honest limits (never hide these in the UI)
- Someone who copies the data files can try all 10^6 PINs offline: a PIN stops casual access only. The 12 words are the real key.
- Gate-level fingerprint, and the PIN while a gate-level fingerprint is also on, protect the app screen, not the files.
- The passkey is tied to the site address. A changed address means: use the 12 words once, then set the fingerprint up again.
  The passkey stays in the phone's list after the lock is turned off (a website cannot delete it).
- Inside the later Android wrapper (P13) WebAuthn may not work; a native biometric plugin will be decided there.
- Lost 12 words and no unlocked device: the data cannot be recovered by anyone. A saved backup file is still encrypted with a key from the same words.

## If the words are lost
- Still unlocked on a device: the app keeps working, but the words cannot be shown again (they are never stored). A new Register makes NEW words that cannot open the old data.
- Locked out everywhere: start again with Register. Old encrypted data is unreadable.

## Privacy wording (shown in the app)
"This app has no server and no account. Your name, email, phone, progress and scores stay on this device, encrypted with a key made from your 12 words.
The developer cannot read them and nobody can recover them if you lose the 12 words. The app does not back up anything by itself; you can save an encrypted backup file wherever you like.
Course names, which lessons you opened and the dates of your tests are not hidden. Checking for updates and downloading courses contacts GitHub."
Never write "military grade".
