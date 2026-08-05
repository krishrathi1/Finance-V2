/**
 * Single source of truth for the legal pages (/disclaimer, /privacy, /terms).
 *
 * These values appear in binding text, so they live here rather than being
 * retyped per page — a contact address that is right on /privacy and stale on
 * /terms is worse than one that is merely wrong, because it looks maintained.
 *
 * ACTION REQUIRED BEFORE LAUNCH: the mailboxes below must actually exist and
 * be monitored. India's DPDP Act, 2023 requires a reachable grievance contact,
 * and an unrouted address is a compliance gap, not a cosmetic one.
 */

export const LEGAL_CONTACT_EMAIL = "support@mystockvision.com";
export const LEGAL_GRIEVANCE_EMAIL = "grievance@mystockvision.com";

/**
 * The legal entity that operates the service. If the site is run by a
 * registered company, this must be its registered name — a trading name alone
 * leaves it unclear who the counterparty to these terms actually is.
 */
export const LEGAL_ENTITY_NAME = "MyStockVision";

/** Governing law / jurisdiction for the Terms. */
export const LEGAL_JURISDICTION = "India";

/**
 * Shown as "Last updated" on every legal page. Bump this whenever the wording
 * of any of them changes — users rely on it to tell revisions apart.
 */
export const LEGAL_LAST_UPDATED = "6 August 2026";
