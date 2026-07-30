// Ambient module shims for packages that ship without bundled TypeScript types.
// nodemailer is used only server-side in lib/email.ts; the runtime package works,
// this just satisfies the type checker for a clean production build.
declare module "nodemailer";
