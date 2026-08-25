import { notFound } from "next/navigation";

/**
 * /email-preview is an internal tool for eyeballing transactional email
 * templates. It is not a product surface: it renders sample OTPs, fake
 * verification links, and the full internal template set, and it has no auth in
 * front of it.
 *
 * Left reachable, it would ship as a public page on the launched site and get
 * crawled. This server layout 404s it in production while keeping it available
 * in local development, which is the only place it is useful.
 */
export default function EmailPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}
