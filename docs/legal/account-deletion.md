# Delete your TripTrackr account

> **Draft — review by counsel before publishing.** This page must be hosted at a public URL:
> Google Play requires a web page for account deletion in the Data safety section, and Apple
> requires that deletion is available **inside the app** (App Review Guideline 5.1.1(v)). Both
> paths are described here. Placeholders are marked `[[PLACEHOLDER: …]]`.

**Last updated:** [[PLACEHOLDER: date]]

You can delete your TripTrackr account, and everything in it, at any time. You do not need to
contact us, and you do not need an active subscription.

## From the app (fastest)

1. Open **Profile** (bottom tab).
2. Tap **Account**, then **Delete account**.
3. Read what will be removed, then confirm. You may be asked to sign in again first.

Your public profile and any public trips, notes and photos stop being visible to anyone
**immediately**. Permanent removal of every record and file completes within
[[PLACEHOLDER: 30]] days (see "The grace period" below).

## By email

If you cannot open the app — lost device, forgotten password with no email access — send a
request from the email address on the account to **[[PLACEHOLDER: contact email]]** with the
subject "Delete my account". We will verify that you control the address, then delete the
account. Expect confirmation within [[PLACEHOLDER: 5]] working days.

We cannot delete an account on someone else's behalf without verification.

## What is deleted

Everything. Specifically:

| Category                                          | What happens                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account — email, password hash, Google/Apple link | Deleted. You will not receive further email from us.                                                                                                                |
| Profile — display name, biography, avatar         | Deleted, including the avatar file in storage.                                                                                                                      |
| Trips and stops                                   | Deleted.                                                                                                                                                            |
| Notes                                             | Deleted.                                                                                                                                                            |
| Expenses and custom expense categories            | Deleted.                                                                                                                                                            |
| Photos and their thumbnails                       | Deleted from storage — the files themselves, not just the database entries.                                                                                         |
| Travel documents (boarding passes, tickets, …)    | Deleted from storage, and the encryption key material that protected them is discarded.                                                                             |
| Follows, blocks, reports                          | Deleted. People you followed will no longer see you in their lists.                                                                                                 |
| Sync records and sign-in sessions on every device | Deleted; every device is signed out.                                                                                                                                |
| Subscription record                               | Deleted from our systems. **Cancel any active subscription yourself** in the App Store / Google Play — deleting the account does not cancel billing with the store. |
| Planner requests and generated itineraries        | Deleted.                                                                                                                                                            |
| Crash diagnostics                                 | Not linked to your account by name; anonymised events expire on the provider's schedule ([[PLACEHOLDER: 90]] days).                                                 |

Deletion is verified by an automated check that finds no remaining records **or files**
belonging to the account — a database cascade alone would leave photos and documents behind,
and we treat that as a failure.

## The grace period

Permanent removal completes within [[PLACEHOLDER: 30]] days of your request. The delay exists
for one reason: a device that was offline when you asked (a phone in a drawer, a tablet on a
plane) must learn that the account is gone rather than push stale copies back to a server that
no longer has them. During the grace period nothing of yours is visible to anyone, and you can
cancel the deletion by signing in and choosing **Keep my account**.

After the grace period the deletion is irreversible. We cannot recover your data.

## Backups

Our encrypted disaster-recovery backups are kept for [[PLACEHOLDER: 14]] days and then
destroyed, so deleted data leaves backups within that period. Backups are never used to restore
an individual account.

## Before you delete: export first

You can take everything with you. In the app, **Profile → Account → Export my data** produces a
portable archive (JSON plus your original photos and documents). Deletion does not depend on
having exported; export is available up to the moment you confirm deletion.

## Data we may retain

If the law requires it (for example tax records of a subscription payment held by the store, or
a report of abuse under investigation), we keep the minimum necessary for the required time and
nothing else. Such records are not accessible through the app and are not used for any other
purpose.

## Contact

[[PLACEHOLDER: legal entity name]] · [[PLACEHOLDER: contact email]] · governing law:
[[PLACEHOLDER: jurisdiction]]. Our [Privacy Policy](./privacy-policy.md) has the full picture of
what we collect and why.
