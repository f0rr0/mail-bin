CREATE TABLE `domains` (
  `id` text PRIMARY KEY NOT NULL,
  `fqdn` text NOT NULL,
  `zone_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `domains_fqdn_unique` ON `domains` (`fqdn`);

CREATE TABLE `destinations` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `label` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1,
  `verification_status` text NOT NULL DEFAULT 'pending',
  `verified_at` integer,
  `cloudflare_destination_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `destinations_email_unique` ON `destinations` (`email`);
CREATE UNIQUE INDEX `destinations_cloudflare_id_unique` ON `destinations` (`cloudflare_destination_id`);

CREATE TABLE `domain_default_destinations` (
  `domain_id` text NOT NULL,
  `destination_id` text NOT NULL,
  PRIMARY KEY (`domain_id`, `destination_id`),
  FOREIGN KEY (`domain_id`) REFERENCES `domains` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`destination_id`) REFERENCES `destinations` (`id`) ON DELETE CASCADE
);

CREATE INDEX `domain_default_destinations_domain_idx` ON `domain_default_destinations` (`domain_id`);

CREATE TABLE `aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `domain_id` text NOT NULL,
  `local_part` text NOT NULL,
  `label` text NOT NULL,
  `created_for` text,
  `active` integer NOT NULL DEFAULT 1,
  `routing_mode` text NOT NULL DEFAULT 'domain_default',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`domain_id`) REFERENCES `domains` (`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `aliases_domain_local_unique` ON `aliases` (`domain_id`, `local_part`);
CREATE INDEX `aliases_domain_idx` ON `aliases` (`domain_id`);

CREATE TABLE `alias_override_destinations` (
  `alias_id` text NOT NULL,
  `destination_id` text NOT NULL,
  PRIMARY KEY (`alias_id`, `destination_id`),
  FOREIGN KEY (`alias_id`) REFERENCES `aliases` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`destination_id`) REFERENCES `destinations` (`id`) ON DELETE CASCADE
);

CREATE INDEX `alias_override_destinations_alias_idx` ON `alias_override_destinations` (`alias_id`);

CREATE TABLE `delivery_events` (
  `id` text PRIMARY KEY NOT NULL,
  `alias_id` text,
  `domain_id` text,
  `recipient_address` text NOT NULL,
  `local_part` text NOT NULL,
  `resolved_local_part` text,
  `subaddress_tag` text,
  `from_address` text NOT NULL,
  `subject` text,
  `message_id` text,
  `status` text NOT NULL,
  `error_code` text,
  `received_at` integer NOT NULL,
  FOREIGN KEY (`alias_id`) REFERENCES `aliases` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`domain_id`) REFERENCES `domains` (`id`) ON DELETE SET NULL
);

CREATE INDEX `delivery_events_received_idx` ON `delivery_events` (`received_at`);
CREATE INDEX `delivery_events_alias_idx` ON `delivery_events` (`alias_id`);

CREATE TABLE `delivery_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `destination_id` text,
  `destination_email` text NOT NULL,
  `status` text NOT NULL,
  `error_code` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `delivery_events` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`destination_id`) REFERENCES `destinations` (`id`) ON DELETE SET NULL
);

CREATE INDEX `delivery_attempts_event_idx` ON `delivery_attempts` (`event_id`);
