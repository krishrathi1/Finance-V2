import type { Metadata } from "next";

import { LegalList, LegalPage, LegalSection } from "@/components/legal-page";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_NAME,
  LEGAL_GRIEVANCE_EMAIL,
} from "@/shared/legal";
import { SITE_NAME, buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy - MyStockVision",
  description:
    "How MyStockVision collects, uses, stores, and shares your personal data, and the rights you have over it under India's DPDP Act, 2023.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what ${SITE_NAME} collects when you use the service, why, who it is shared with, and what you can ask us to do with it.`}
    >
      <LegalSection title="What we collect">
        <p>When you create an account, we store:</p>
        <LegalList
          items={[
            <>
              <strong>Your name and email address</strong>, so we can identify your account and send
              verification and password-reset messages.
            </>,
            <>
              <strong>A hashed password.</strong> Passwords are hashed with bcrypt before storage. We
              never store, log, or transmit your password in readable form, and we cannot recover it
              for you.
            </>,
            <>
              <strong>Your account status</strong> — tier, email-verification state, and whether the
              account is restricted.
            </>,
          ]}
        />
        <p>As you use the product, we also store the content you create:</p>
        <LegalList
          items={[
            <>
              <strong>Portfolio holdings</strong> — the symbols, quantities, and purchase prices you
              enter. This reveals your financial position, so we treat it as sensitive.
            </>,
            <>
              <strong>Watchlists and price alerts</strong> — the symbols and thresholds you track.
            </>,
            <>
              <strong>Premium access requests</strong>, including any reason you supply.
            </>,
          ]}
        />
        <p>
          We do not use advertising trackers or third-party analytics, and we do not sell personal
          data to anyone.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <LegalList
          items={[
            <>
              <strong>Authentication cookies</strong> (<code>access_token</code>,{" "}
              <code>refresh_token</code>) keep you signed in. They are <code>httpOnly</code>, so page
              scripts cannot read them, and they are transmitted over HTTPS in production. These are
              strictly necessary — the service cannot keep you signed in without them.
            </>,
            <>
              <strong>Local storage</strong> holds your display name and email so the interface can
              greet you before the server responds. Signing out clears it.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Who your data is shared with">
        <p>
          We share the minimum necessary with the processors that make the product work. Each is
          bound by its own terms, and we do not authorise any of them to sell your data.
        </p>
        <LegalList
          items={[
            <>
              <strong>Google (Gemini API)</strong> — powers the AI analysis features. When you run an
              AI feature, the relevant stock or portfolio context for that request is sent to Google
              for processing.
            </>,
            <>
              <strong>Market data providers</strong> (including Financial Modeling Prep, NewsAPI, and
              exchange sources) — these receive the symbol being looked up, not your identity.
            </>,
            <>
              <strong>Email delivery</strong> — your email address is passed to our mail provider to
              send verification, password-reset, and account messages.
            </>,
            <>
              <strong>Rate limiting and hosting infrastructure</strong> — processes request metadata
              such as IP address to protect the service from abuse.
            </>,
          ]}
        />
        <p>
          We may also disclose data where required by law, or to establish or defend a legal claim.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalList
          items={[
            <>Account data is retained while your account exists.</>,
            <>
              Session refresh tokens expire after 30 days, and expired ones are deleted
              automatically.
            </>,
            <>Password-reset tokens are short-lived and single-use.</>,
            <>
              When you ask us to delete your account, we remove your personal data except where we
              are legally required to retain it.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under the Digital Personal Data Protection Act, 2023, you may ask us to give you a copy of
          your personal data, correct anything inaccurate, delete your account and its data, or
          withdraw consent for optional processing. Write to{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          and we will respond within a reasonable period.
        </p>
        <p>
          If you are not satisfied with our response, our Grievance Officer can be reached at{" "}
          <a href={`mailto:${LEGAL_GRIEVANCE_EMAIL}`} className="text-accent underline underline-offset-2">
            {LEGAL_GRIEVANCE_EMAIL}
          </a>
          . You also have the right to complain to the Data Protection Board of India.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          We hash passwords with bcrypt, keep session tokens in <code>httpOnly</code> cookies, store
          refresh tokens only as irreversible hashes, rotate them on every use, serve the site over
          HTTPS with strict transport security, and rate-limit authentication endpoints against
          brute-force and credential-stuffing attempts.
        </p>
        <p>
          No system is perfectly secure. If you believe your account has been compromised, change
          your password and contact us immediately.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          The service is not intended for anyone under 18, and we do not knowingly collect data from
          children. If you believe a child has given us personal data, contact us and we will delete
          it.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          If we change this policy we will update the date at the top of this page, and we will
          notify you of material changes. {LEGAL_ENTITY_NAME} can be reached at{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
