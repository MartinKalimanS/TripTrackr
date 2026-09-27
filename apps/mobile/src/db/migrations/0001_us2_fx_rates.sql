CREATE TABLE `fx_rates` (
	`quote_currency` text PRIMARY KEY NOT NULL,
	`rate` text NOT NULL,
	`as_of` text NOT NULL,
	`source` text NOT NULL
);
