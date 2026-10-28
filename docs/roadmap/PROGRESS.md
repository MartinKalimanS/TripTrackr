# Progress

The single place that says what is done. Tick a box **only** with a link to the merged PR or the evidence file.
Last updated: 2026-10-21 (roadmap created). Sessions end by updating this file (`P-HANDOFF`).

## Milestones

- [ ] M0 Repository governance and baseline
- [ ] M1 The look: all screens match the pictures (F1 and F2 approved; F3 awaiting approval)
- [ ] M2 The core is proven on devices (includes the offline gate T141)
- [ ] M3 Data rights and platform completeness
- [ ] M4 Monetisation (story 9)
- [ ] M5 Hardening and observability
- [ ] M6 Production backend
- [ ] M7 Mobile CI/CD
- [ ] M8 Store readiness
- [ ] M9 Beta
- [ ] M10 Release candidate and 1.0 launch
- [ ] M11 1.1 planner
- [ ] M12 1.2 social
- [ ] M13 Operate

## Steps

| Done | Step                                             | State / evidence                                                                                                   |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [ ]  | S-01 Repository governance and security baseline | not started                                                                                                        |
| [ ]  | S-02 Sunrise Passport UI F3 to F14               | F1 and F2 approved and in `main`; F3 built, awaiting approval (`feat/f3-tabbar`)                                   |
| [ ]  | S-03 Device proof of the core                    | not started                                                                                                        |
| [ ]  | S-04 Offline acceptance gate (HARD GATE)         | not started                                                                                                        |
| [ ]  | S-05 Account deletion                            | API built on `feat/account-deletion` (`DELETE /me`, sweep, residue test green); the app sheet follows the UI merge |
| [ ]  | S-06 Data export                                 | not started                                                                                                        |
| [ ]  | S-07 About, legal links, attributions            | not started                                                                                                        |
| [ ]  | S-08 Geography in production                     | not started                                                                                                        |
| [ ]  | S-09 Authentication audit and hardening          | not started                                                                                                        |
| [ ]  | S-10 Allowance and entitlement backend           | not started                                                                                                        |
| [ ]  | S-11 RevenueCat server integration               | not started                                                                                                        |
| [ ]  | S-12 Paywall and subscription management         | not started                                                                                                        |
| [ ]  | S-13 IAP products in the stores and RevenueCat   | not started                                                                                                        |
| [ ]  | S-14 Planner backend (1.1)                       | not started                                                                                                        |
| [ ]  | S-15 Planner screens (1.1)                       | not started                                                                                                        |
| [ ]  | S-16 Planner cost controls (1.1)                 | not started                                                                                                        |
| [ ]  | S-17 Photo screening provider (1.2)              | not started                                                                                                        |
| [ ]  | S-18 Social backend (1.2)                        | not started                                                                                                        |
| [ ]  | S-19 Social screens (1.2)                        | not started                                                                                                        |
| [ ]  | S-20 UGC compliance (1.2)                        | not started                                                                                                        |
| [ ]  | S-21 Performance and load                        | not started                                                                                                        |
| [ ]  | S-22 Security hardening                          | not started                                                                                                        |
| [ ]  | S-23 Accessibility pass                          | not started                                                                                                        |
| [ ]  | S-24 Observability                               | not started                                                                                                        |
| [ ]  | S-25 Production host, domain and TLS             | not started                                                                                                        |
| [ ]  | S-26 Production configuration and backups        | not started                                                                                                        |
| [ ]  | S-27 API deploy pipeline                         | not started                                                                                                        |
| [ ]  | S-28 EAS setup and first builds                  | not started                                                                                                        |
| [ ]  | S-29 Mobile PR checks                            | not started                                                                                                        |
| [ ]  | S-30 Release automation                          | not started                                                                                                        |
| [ ]  | S-31 Store accounts and app records              | not started                                                                                                        |
| [ ]  | S-32 Legal documents, support, static site       | not started                                                                                                        |
| [ ]  | S-33 Listing, assets, review notes, demo account | not started                                                                                                        |
| [ ]  | S-34 Store-readiness compliance run              | not started                                                                                                        |
| [ ]  | S-35 Internal testing                            | not started                                                                                                        |
| [ ]  | S-36 Closed beta                                 | not started                                                                                                        |
| [ ]  | S-37 Release candidate                           | not started                                                                                                        |
| [ ]  | S-38 Submission and review                       | not started                                                                                                        |
| [ ]  | S-39 Staged rollout and hotfix readiness         | not started                                                                                                        |
| [ ]  | S-40 Operate                                     | not started                                                                                                        |

## UI features (S-02 detail; each approved by the owner before the next)

- [x] F1 Map (approved 2026-10-19)
- [x] F2 Home sheet (approved 2026-10-20)
- [ ] F3 Tab bar (built; awaiting approval)
- [ ] F4 Trips cards and list
- [ ] F5 Trip screen
- [ ] F6 Forms
- [ ] F7 Photos
- [ ] F8 Spending
- [ ] F9 Notes
- [ ] F10 Documents
- [ ] F11 Offline maps
- [ ] F12 Welcome, sign in, create account
- [ ] F13 You
- [ ] F14 Sweeps, retire Atlas, release gates (the finer list is `specs/005-sunrise-passport-ui/reference/IMPLEMENTATION-PLAN.md`)

## Feature 001 open tasks (65 of 228 at 2026-10-21; the list moves to the steps above)

T088, T100, T101, T106, T120 (S-03); T140, T203, T141 (S-04); T142 to T158 (S-17 to S-19); T159 to T171 (S-14 to S-15);
T172 to T187 (S-10 to S-12); T188, T189 (S-05); T190 (S-06); T191 (S-26); T192 (S-16, S-21); T193 (S-07); T194 (S-03, S-21); T195 (S-37);
T196 (S-22); T197 (S-01, S-37); T198 (S-37).
