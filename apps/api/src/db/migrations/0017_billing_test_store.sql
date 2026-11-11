-- The RevenueCat Test Store as a purchase provider (spec 014, S-13).
--
-- A sandbox purchase made with a `test_` SDK key reaches the webhook as `store: TEST_STORE`. The API
-- records it as provider 'test_store' only when BILLING_ACCEPT_TEST_STORE is on and the event says
-- SANDBOX (billing-events.service.ts); this migration only lets the three provider columns hold it.
-- It grants nothing on its own: the keyholes are unchanged and still reachable only from the webhook.

ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_provider_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IS NULL OR provider IN ('app_store', 'play_store', 'test_store'));

ALTER TABLE trip_credits DROP CONSTRAINT trip_credits_provider_check;
ALTER TABLE trip_credits ADD CONSTRAINT trip_credits_provider_check
  CHECK (provider IN ('app_store', 'play_store', 'test_store'));

ALTER TABLE subscription_periods DROP CONSTRAINT subscription_periods_provider_check;
ALTER TABLE subscription_periods ADD CONSTRAINT subscription_periods_provider_check
  CHECK (provider IN ('app_store', 'play_store', 'test_store'));
