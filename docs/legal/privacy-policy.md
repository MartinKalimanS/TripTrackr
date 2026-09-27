# TripTrackr Privacy Policy

> **Draft — review by counsel before publishing.** Placeholders are marked `[[PLACEHOLDER: …]]`.
> Publish the final text at a public URL; both app stores require that URL in the listing and
> inside the app. Keep the "Last updated" date current and keep the previous versions.

**Last updated:** [[PLACEHOLDER: date]]

TripTrackr is a private travel journal. It is built so that what you record — where you went,
what you wrote, what you spent, the documents you carry — is **private by default** and shared
only when you deliberately choose to share it, item by item. This policy explains what we
collect, why, where it goes, and how to get it back or make it disappear.

TripTrackr is operated by [[PLACEHOLDER: legal entity name and registered address]] ("we").
Questions: [[PLACEHOLDER: contact email]].

## 1. What we collect and why

| Data                                                                                                                                        | Why we need it                                                                                                                               | Where it is stored                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Account** — email address, password (hashed, never stored in clear), or the identifier returned by Google / Apple sign-in                 | To create your account, sign you in, and reach you about it                                                                                  | Our database                                                                                                                       |
| **Profile** — display name, optional biography, optional avatar, home currency, whether your profile is public                              | To show your name on your own journal and, only if you opt in, on your public profile                                                        | Our database; avatar in our object storage                                                                                         |
| **Trips and stops** — trip titles, the cities you visited and the dates                                                                     | The core of the journal and the globe. Stops are cities, not precise GPS tracks; TripTrackr does not record your movements in the background | Our database                                                                                                                       |
| **Notes** — text you write in a trip                                                                                                        | Your journal                                                                                                                                 | Our database                                                                                                                       |
| **Expenses** — amounts, currencies, categories, dates, optional description                                                                 | Your spending record                                                                                                                         | Our database. **Expenses can never be made public** — there is no setting that could                                               |
| **Photos** you add, and their embedded metadata (EXIF: capture time, camera, and GPS position if your camera stored one)                    | To place photos in the right trip and on the map. Extracted values are shown to you for confirmation before they are used                    | Our object storage (private, served only through short-lived signed links); metadata in our database                               |
| **Travel documents** — boarding passes, tickets, reservations you choose to add, and details we read from their barcodes for you to confirm | To keep your documents with the trip, available offline                                                                                      | Our object storage, **encrypted with a key held only by our server** (envelope encryption). **Documents can never be made public** |
| **Sync data** — device identifiers we generate, change timestamps, and deletion markers                                                     | To keep several of your devices in step and to make deletion propagate                                                                       | Our database                                                                                                                       |
| **Subscription status** — whether you have an active entitlement, product identifier, renewal dates                                         | To lift the free trip allowance when you subscribe. We never see or store card details; payment is processed by Apple or Google              | Our database and RevenueCat (see §3)                                                                                               |
| **Diagnostics** — crash reports and error events, including device model, OS version and app version                                        | To find and fix failures that affect travellers                                                                                              | Sentry (see §3). We do **not** record your screen, do not capture session replays, and scrub request contents before sending       |
| **Planner requests** — the text of a request for an itinerary suggestion (e.g. "two days in Rome, art and food")                            | To generate a suggested plan                                                                                                                 | Sent to our language-model provider (see §3) without your name or account identifier                                               |

We do not collect precise location in the background, advertising identifiers, contacts, or
health data, and we do not sell personal data.

### On your device

Everything above is also stored on your device in an **encrypted** local database so the app
works offline. Sign-in tokens and the database key are kept in the platform's protected storage
(iOS Keychain / Android Keystore). Deleting the app deletes the local copy.

## 2. Public versus private — how sharing actually works

- **Trips, notes and photos** each have their own, independent visibility switch. Making a trip
  public does **not** make its notes or photos public; each one must be switched separately.
- **Expenses and travel documents have no visibility switch at all.** They are only ever
  visible to you. This is enforced in the database itself, not by an app setting.
- A photo you mark public is screened automatically before anyone else can see it.
- Making something private again takes effect immediately for everyone else.
- If you block someone, they can no longer see your public profile or any of your public
  content, and you cannot see theirs.

## 3. Service providers (processors)

We use a small number of providers to run the service. Each receives only what is needed for
its job and is bound by its own terms and data-processing agreement.

| Provider                                                     | Purpose                                                             | What they receive                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [[PLACEHOLDER: hosting provider, e.g. Hetzner]]              | Servers and database                                                | Everything in §1 that is stored server-side, at rest on our servers                                                                  |
| [[PLACEHOLDER: object storage provider, e.g. Cloudflare R2]] | Photo and document files                                            | The files themselves (documents encrypted); no account details                                                                       |
| Mapbox                                                       | Maps, the globe, geocoding, walking routes                          | Map tile requests (which include the map area you view and your IP address), place names you search for. See Mapbox's privacy policy |
| Anthropic                                                    | Itinerary suggestions                                               | The text of your planner request and the destination; no name, email or account identifier                                           |
| RevenueCat                                                   | Subscription management                                             | An anonymous app-user identifier, purchase receipts and entitlement status                                                           |
| Apple App Store / Google Play                                | Payment processing, sign-in (if you choose it)                      | Governed by Apple's and Google's terms; we never receive card numbers                                                                |
| Sentry                                                       | Crash and error reporting                                           | Diagnostics described in §1, with personal identifiers removed                                                                       |
| Resend                                                       | Transactional email (verification, password reset, account notices) | Your email address and the message content                                                                                           |

We do not use advertising networks or analytics SDKs that profile you across apps.

## 4. Legal bases (EEA / UK)

Where GDPR or UK GDPR applies, we process your data on these bases: **performance of a
contract** (providing the journal you signed up for — §1 rows account, profile, trips, notes,
expenses, photos, documents, sync, subscription); **legitimate interests** (keeping the service
secure and working — diagnostics, rate limiting, abuse prevention); and **consent** where the
platform asks for it (camera, photo library access). You can withdraw platform permissions in
your device settings at any time.

## 5. Retention

- Your data is kept for as long as your account exists.
- When you delete an item, it is marked deleted and removed from every synced device. A short
  grace window ([[PLACEHOLDER: e.g. 90 days]]) exists so that a device that has not yet synced
  does not resurrect it; after that the record is permanently purged.
- When you delete your **account**, your profile and public content disappear from view
  immediately; every record and every stored file is permanently deleted within
  [[PLACEHOLDER: 30]] days. See our [account deletion page](./account-deletion.md).
- Encrypted backups of our database are kept for [[PLACEHOLDER: 14]] days for disaster
  recovery and then destroyed. Deleted data therefore leaves backups within that period.
- Diagnostics in Sentry are retained for [[PLACEHOLDER: 90]] days.

## 6. Your rights

You can, at any time and from inside the app: view and edit everything you have recorded;
**export** all of your data in a portable format; change what is public; and **delete your
account** (Profile → Account → Delete account). You can also email
[[PLACEHOLDER: contact email]] to exercise any right under applicable law — access,
rectification, erasure, restriction, portability, objection — and we will respond within
[[PLACEHOLDER: 30 days]]. If you are in the EEA or UK you may also complain to your supervisory
authority.

A lapsed or cancelled subscription never removes, hides or locks anything you recorded. Limits
apply only to creating new trips.

## 7. Children

TripTrackr is not directed at children under [[PLACEHOLDER: 13 / 16 depending on jurisdiction]]
and we do not knowingly collect their data. If you believe a child has created an account,
contact us and we will delete it.

## 8. Security

Data in transit is encrypted (TLS). Passwords are hashed with a modern algorithm. Travel
documents are encrypted at rest with a key that is separate from the database. Access to
another traveller's private data is prevented at the database layer, and we test that
adversarially as part of every release. No system is perfectly secure; if we learn of a breach
affecting you we will notify you as the law requires.

## 9. International transfers

Our servers are located in [[PLACEHOLDER: hosting region]]. Some providers in §3 process data in
other countries, including the United States, under appropriate safeguards (standard contractual
clauses or an adequacy decision).

## 10. Changes

We will post changes here and update the date above. For material changes we will notify you in
the app or by email before they take effect.

## 11. Contact

[[PLACEHOLDER: legal entity name]]
[[PLACEHOLDER: registered address]]
[[PLACEHOLDER: contact email]]
[[PLACEHOLDER: data protection officer / EU representative, if required]]

Governing jurisdiction: [[PLACEHOLDER: jurisdiction]].
