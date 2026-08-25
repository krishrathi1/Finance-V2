import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/components/legal-page";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_NAME,
  LEGAL_JURISDICTION,
} from "@/shared/legal";
import { SITE_NAME, buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service - MyStockVision",
  description:
    "The terms governing your use of MyStockVision, including acceptable use, account responsibilities, disclaimers, and limitation of liability.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are an agreement between you and ${LEGAL_ENTITY_NAME} governing your use of ${SITE_NAME}. By creating an account or using the service, you accept them.`}
    >
      <LegalSection title="Eligibility">
        <p>
          You must be at least 18 years old and legally able to enter into a contract. If you use the
          service on behalf of an organisation, you confirm you are authorised to bind it to these
          terms.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <LegalList
          items={[
            <>Give accurate registration details and keep them current.</>,
            <>
              You are responsible for keeping your password secure and for everything done through
              your account. Tell us promptly if you suspect unauthorised access.
            </>,
            <>One person, one account. Do not share credentials or transfer your account.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            <>
              Scrape, crawl, bulk-download, or systematically extract data from the service, or
              redistribute or resell any data obtained from it.
            </>,
            <>
              Attempt to bypass authentication, rate limits, or access controls, or probe the service
              for vulnerabilities without our written permission.
            </>,
            <>
              Use automated tools to place load on the service beyond ordinary personal use, or
              interfere with its availability for others.
            </>,
            <>
              Reverse engineer the service, or use it to build a competing product.
            </>,
            <>Use the service for anything unlawful, including market manipulation.</>,
          ]}
        />
        <p>
          We may suspend or terminate accounts that breach these rules, with or without notice.
        </p>
      </LegalSection>

      <LegalSection title="The service is informational only">
        <p>
          {SITE_NAME} provides market data and automated analysis for informational and educational
          purposes. It is not investment advice, and {LEGAL_ENTITY_NAME} is not a SEBI-registered
          investment adviser or research analyst. Read the full{" "}
          <Link href="/disclaimer" className="text-accent underline underline-offset-2">
            Disclaimer
          </Link>
          , which forms part of these terms.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis, without
          warranties of any kind, express or implied, including any warranty of accuracy,
          merchantability, or fitness for a particular purpose. We may modify, suspend, or discontinue
          any part of it at any time, and we do not guarantee uninterrupted access or that data will
          be correct, complete, or current.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL_ENTITY_NAME} will not be liable for any
          trading or investment losses, or for any indirect, incidental, special, consequential, or
          punitive damages, or any loss of profits, revenue, data, or goodwill, arising from your use
          of or inability to use the service — whether or not we were advised such damages were
          possible.
        </p>
        <p>
          Nothing in these terms excludes liability that cannot lawfully be excluded, including
          liability for fraud.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          The service, its interface, and its original content are owned by {LEGAL_ENTITY_NAME} and
          protected by intellectual property law. Underlying market data belongs to its respective
          sources and providers. You keep ownership of the content you enter, such as your portfolio
          and watchlists, and you grant us only the permission needed to operate the service for you.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          You may stop using the service and request deletion of your account at any time. We may
          suspend or terminate your access if you breach these terms or if we are required to by law.
          The disclaimer, limitation of liability, and intellectual property sections survive
          termination.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of {LEGAL_JURISDICTION}, and the courts of{" "}
          {LEGAL_JURISDICTION} have exclusive jurisdiction over any dispute arising from them.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms; the date at the top of this page reflects the current version,
          and continuing to use the service after a change means you accept it. Questions:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
