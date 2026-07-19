import { type FormEvent, type ReactNode, useState } from "react";
import {
  ArrowRight,
  Check,
  Cookie,
  Database,
  Download,
  EyeOff,
  FileLock2,
  Globe2,
  KeyRound,
  Mail,
  Printer,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

const sections = [
  ["scope", "1. Scope and our role"],
  ["collection", "2. Information we collect"],
  ["use", "3. How we use information"],
  ["legal-bases", "4. Legal bases"],
  ["sharing", "5. How information is shared"],
  ["transfers", "6. International transfers"],
  ["retention", "7. Retention and deletion"],
  ["security", "8. Security"],
  ["rights", "9. Your rights and choices"],
  ["cookies", "10. Cookies and telemetry"],
  ["children", "11. Children"],
  ["changes", "12. Changes and contact"],
] as const;

function PolicySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-28 border-b border-white/8 py-9 last:border-b-0"><h2 className="text-2xl font-semibold text-zinc-100">{title}</h2><div className="mt-5 space-y-4 text-[11px] leading-6 text-zinc-500">{children}</div></section>;
}

export function PrivacyPage() {
  const [requestOpen, setRequestOpen] = useState(false);

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    toast.success("Privacy request received. Check your email for verification.");
    setRequestOpen(false);
  }

  return (
    <>
      <section className="marketing-glow border-b border-white/8 px-4 pb-14 pt-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Legal · Privacy</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Privacy Policy</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-500">How Orbit Systems, Inc. collects, uses, protects, and gives you control over personal information.</p><p className="mt-3 font-mono text-[8px] text-zinc-700">Effective July 19, 2026 · Version 1.0</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><Printer />Print policy</Button><Button onClick={() => setRequestOpen(true)}><UserCheck />Make a privacy request</Button></div></div></div></section>

      <section className="px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-4">{[[EyeOff, "No data sale", "We do not sell personal information or use it for cross-context behavioral advertising."], [KeyRound, "Credentials protected", "Server credentials are encrypted and are never placed in client-side storage."], [Database, "Customer-controlled content", "Workspace content is processed to provide the service under customer instructions."], [Globe2, "Portable and deletable", "Export and deletion controls are available, subject to security and legal requirements."]].map(([Icon, title, copy]) => <article key={String(title)} className="bg-[#111216] p-5"><Icon className="size-4 text-blue-300" /><h2 className="mt-6 text-sm font-semibold">{String(title)}</h2><p className="mt-2 text-[9px] leading-5 text-zinc-600">{String(copy)}</p></article>)}</div>

        <div className="grid gap-14 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="hidden lg:block"><div className="sticky top-24"><p className="text-[8px] font-medium uppercase tracking-[0.14em] text-zinc-700">In this policy</p><nav className="mt-4 space-y-1">{sections.map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-md px-2 py-1.5 text-[9px] text-zinc-600 hover:bg-white/[0.035] hover:text-zinc-200">{label}</a>)}</nav><div className="mt-7 border-t border-white/8 pt-5"><p className="text-[8px] leading-4 text-zinc-700">Questions about this policy?</p><a href="mailto:privacy@orbit.run" className="mt-2 flex items-center gap-2 text-[9px] text-zinc-400 hover:text-white"><Mail className="size-3" />privacy@orbit.run</a></div></div></aside>
          <article className="min-w-0 max-w-4xl">
            <div className="rounded-xl border border-blue-400/15 bg-blue-400/[0.045] p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-300" /><div><h2 className="text-sm font-semibold text-blue-100">A note about server data</h2><p className="mt-2 text-[10px] leading-5 text-blue-100/55">Customers decide what servers to connect and what files, logs, terminal data, backups, and metadata Orbit may process. For that content, the customer is generally the controller or business and Orbit acts as its processor or service provider. Contact the relevant workspace owner first if your request concerns data they manage.</p></div></div></div>

            <PolicySection id="scope" title="1. Scope and our role"><p>This Privacy Policy applies to Orbit's websites, hosted application, support, sales, events, and other services that link to it (together, the “Services”). It does not apply to third-party products, websites, or integrations that have their own privacy terms.</p><p>“Orbit,” “we,” “us,” and “our” mean Orbit Systems, Inc. and its relevant affiliates. “Customer” means the person or organization that creates or controls an Orbit workspace. “Workspace content” means information a Customer or its users submit to or process through the Services, including server connection metadata, remote file content, backups, terminal transcripts, deployment plans, logs, and audit events.</p><p>Orbit is the controller of information used to administer accounts, secure and improve the Services, communicate with customers, and operate our business. Orbit processes workspace content on the Customer's instructions under the applicable agreement and, where offered, our Data Processing Addendum.</p></PolicySection>

            <PolicySection id="collection" title="2. Information we collect"><p>We collect information you provide, information generated through use of the Services, and limited information from authorized third parties.</p><div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[680px] text-left text-[9px]"><thead className="bg-white/[0.025] text-[8px] uppercase tracking-wider text-zinc-600"><tr><th className="p-3">Category</th><th className="p-3">Examples</th><th className="p-3">Primary source</th></tr></thead><tbody className="divide-y divide-white/8">{[
              ["Account and profile", "Name, email, avatar, job role, organization, locale, and authentication settings", "You, your employer, or identity provider"],
              ["Commercial", "Plan, billing contact, invoices, payment status, tax information, and purchasing history", "You and our payment processor"],
              ["Device and usage", "Browser, device type, IP address, session identifiers, feature interactions, errors, and approximate region", "Your use of the Services"],
              ["Workspace administration", "Memberships, roles, policies, connection names, host metadata, job state, and audit activity", "Customers and workspace users"],
              ["Workspace content", "Remote files, backup data, commands, output, diffs, deployment artifacts, and monitor results", "Customer-configured operations"],
              ["Communications", "Support requests, call notes, survey responses, product feedback, and correspondence", "You and our team"],
            ].map(([category, examples, source]) => <tr key={category}><td className="p-3 align-top font-medium text-zinc-300">{category}</td><td className="p-3 align-top leading-4 text-zinc-600">{examples}</td><td className="p-3 align-top leading-4 text-zinc-600">{source}</td></tr>)}</tbody></table></div><p>We do not intentionally collect sensitive personal information unless it is necessary to provide the Services, supplied by a Customer in workspace content, or required for security or legal purposes. Customers should avoid placing unnecessary personal or regulated data in connection names, support tickets, or other administrative fields.</p></PolicySection>

            <PolicySection id="use" title="3. How we use information"><p>We use personal information only where reasonably necessary for the following purposes:</p><ul className="space-y-2">{[
              "Provide, maintain, authenticate, personalize, and support the Services.",
              "Execute Customer-directed server operations, store requested backups and versions, and deliver integrations and notifications.",
              "Protect accounts, Customers, infrastructure, and the public from fraud, abuse, unauthorized access, malware, and security threats.",
              "Monitor reliability, debug errors, understand feature performance, and improve usability. Product analytics are aggregated or minimized where practical.",
              "Process subscriptions, invoices, taxes, renewals, and account administration.",
              "Respond to questions, provide service notices, and send product communications consistent with your preferences.",
              "Comply with law, enforce agreements, resolve disputes, and establish or defend legal claims.",
            ].map((item) => <li key={item} className="flex gap-2.5"><Check className="mt-1.5 size-3 shrink-0 text-emerald-400" /><span>{item}</span></li>)}</ul><p>We do not use workspace content to train shared or general-purpose generative AI models. If we offer an optional AI feature, its product notice will describe the data flow, provider, controls, and retention before a Customer enables it.</p></PolicySection>

            <PolicySection id="legal-bases" title="4. Legal bases"><p>Where law requires a legal basis, we rely on performance of a contract to create and operate your account; legitimate interests to secure, support, analyze, and improve the Services and communicate with business users; consent for optional communications or storage where required; and legal obligations for tax, compliance, and lawful requests.</p><p>Our legitimate interests include providing a reliable business service, preventing abuse, understanding product performance, supporting Customers, and managing our company. We balance those interests against the nature of the information, reasonable expectations, and available safeguards. You may object to certain processing as described below.</p></PolicySection>

            <PolicySection id="sharing" title="5. How information is shared"><p>We disclose information only as needed to operate the Services or in the circumstances below. We do not sell personal information, and we do not share it for cross-context behavioral advertising.</p><ul className="space-y-3"><li><strong className="text-zinc-300">Customer administrators and users.</strong> Workspace owners can manage membership, view activity and audit records, configure retention, and access content according to roles and policies.</li><li><strong className="text-zinc-300">Service providers.</strong> Hosting, storage, communications, support, payment, security, and analytics providers process limited information under contract and only for authorized purposes. Our current subprocessors are available on request and in the trust center.</li><li><strong className="text-zinc-300">Customer integrations.</strong> When a Customer enables an integration, we send the information necessary to perform its configured action. The Customer controls the third party and should review its terms.</li><li><strong className="text-zinc-300">Corporate transactions.</strong> Information may transfer as part of a financing, merger, acquisition, restructuring, or sale, subject to confidentiality and applicable notice requirements.</li><li><strong className="text-zinc-300">Legal and safety.</strong> We may preserve or disclose information when we reasonably believe it is necessary to comply with law, protect rights and safety, investigate abuse, or respond to valid legal process. We assess requests for scope and legal sufficiency.</li></ul><p>Orbit personnel access Customer information only when needed for support, security, reliability, or legal duties, under role controls, confidentiality obligations, and logged administrative access.</p></PolicySection>

            <PolicySection id="transfers" title="6. International transfers"><p>Orbit and its providers may process information in countries other than where you live. Where required, we use recognized transfer mechanisms such as adequacy decisions, Standard Contractual Clauses, the UK International Data Transfer Addendum, or another lawful safeguard.</p><p>Enterprise Customers may select supported data regions for designated stored content. Some account, security, billing, and support metadata may still be processed globally to operate the Services. Regional configuration and exceptions are described in the applicable order form and documentation.</p></PolicySection>

            <PolicySection id="retention" title="7. Retention and deletion"><p>We keep information for the shortest period reasonably necessary for the purpose collected, Customer configuration, security, contractual commitments, and legal obligations. Typical periods are below; an agreement or workspace setting may provide a different period.</p><div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[620px] text-left text-[9px]"><thead className="bg-white/[0.025] text-[8px] uppercase tracking-wider text-zinc-600"><tr><th className="p-3">Information</th><th className="p-3">Typical retention</th><th className="p-3">Notes</th></tr></thead><tbody className="divide-y divide-white/8">{[
              ["Account and billing records", "Account life plus 7 years", "Certain invoice and tax records may be legally required"],
              ["Workspace content", "Plan and Customer configuration", "Free 7 days; Pro commonly 90 days; Enterprise configurable"],
              ["Backups and file versions", "Configured policy and grace period", "Deletion may continue through encrypted backup rotation"],
              ["Security and audit events", "At least 12 months for hosted service", "Enterprise retention and export may differ"],
              ["Support records", "Up to 3 years after resolution", "Longer if needed for an active dispute or security case"],
              ["Product analytics", "Up to 18 months", "Aggregated metrics may no longer identify a person"],
            ].map(([type, period, note]) => <tr key={type}><td className="p-3 font-medium text-zinc-300">{type}</td><td className="p-3 text-zinc-500">{period}</td><td className="p-3 leading-4 text-zinc-600">{note}</td></tr>)}</tbody></table></div><p>After account closure, we delete or de-identify Customer content following the agreement and backup rotation. We may retain limited information if required for security, fraud prevention, legal compliance, or claims, and restrict it from other use.</p></PolicySection>

            <PolicySection id="security" title="8. Security"><p>Orbit uses administrative, technical, and physical safeguards designed for the sensitivity of the information, including encryption in transit and at rest, tenant isolation, least-privilege access, multi-factor authentication, secret redaction, secure development practices, vulnerability management, monitoring, incident response, and tested recovery procedures.</p><p>No system is completely secure. Customers also play an important role: use strong authentication, review host fingerprints, scope server accounts and root paths, maintain appropriate backups, configure roles and retention, and promptly remove access for departing users. See our <Link to="/security" className="text-zinc-300 underline underline-offset-2">Security page</Link> for architecture and control details.</p></PolicySection>

            <PolicySection id="rights" title="9. Your rights and choices"><p>Depending on where you live, you may have rights to access, correct, delete, restrict, object to, or receive a portable copy of personal information; withdraw consent; opt out of certain disclosures or marketing; and appeal a denied request. You may also complain to a relevant data protection authority.</p><p>Use workspace settings for profile and communication choices, contact the Customer administrator for workspace content, or submit a request to Orbit. We may verify identity and authority before acting. Authorized agents must provide evidence of authorization. We will not discriminate against you for exercising a privacy right.</p><div className="flex flex-wrap gap-2"><Button onClick={() => setRequestOpen(true)}><UserCheck />Submit a request</Button><a href="mailto:privacy@orbit.run"><Button variant="outline"><Mail />Email privacy</Button></a></div><p>Global Privacy Control signals are honored where legally required for applicable browser-based processing. Orbit does not currently use advertising cookies or sell or share personal information in a way that requires a sale opt-out.</p></PolicySection>

            <PolicySection id="cookies" title="10. Cookies and telemetry"><p>Orbit uses essential cookies and similar storage for sign-in, session security, preferences, load balancing, and fraud prevention. These are necessary for the hosted application to function. We may use limited first-party analytics to understand aggregate product use and reliability; where consent is required, optional analytics remain off until consent is provided.</p><p>We do not use third-party advertising cookies in the Orbit application. You can control cookies through browser settings, but blocking essential storage may prevent sign-in or other features. Server-side audit and security records are not browser cookies and may be retained as described above.</p></PolicySection>

            <PolicySection id="children" title="11. Children"><p>The Services are designed for organizations and professional users, not children. We do not knowingly collect personal information from anyone under 16. If you believe a child provided information to Orbit, contact us so we can investigate and delete it where appropriate.</p></PolicySection>

            <PolicySection id="changes" title="12. Changes and contact"><p>We may update this policy to reflect product, legal, or operational changes. The effective date and version will change when we do. If a change materially affects how we use personal information, we will provide reasonable notice through the Services, email, or another appropriate channel before it takes effect.</p><p>Questions and requests may be sent to <a className="text-zinc-300 underline underline-offset-2" href="mailto:privacy@orbit.run">privacy@orbit.run</a> or Orbit Systems, Inc., Attn: Privacy, 548 Market Street, Suite 620, San Francisco, CA 94104, United States. EEA and UK representative details, where required, are available in the trust center or by email.</p></PolicySection>

            <footer className="mt-8 flex flex-col gap-4 rounded-xl border border-white/10 bg-[#111216] p-5 sm:flex-row sm:items-center"><FileLock2 className="size-5 text-blue-300" /><div><p className="text-[10px] font-medium text-zinc-300">Keep a copy for your records</p><p className="mt-1 text-[8px] text-zinc-700">Print this page to PDF using your browser, or ask us for an accessible copy.</p></div><Button variant="outline" className="sm:ml-auto" onClick={() => window.print()}><Download />Save or print</Button></footer>
          </article>
        </div>
      </div></section>

      <section className="border-t border-white/8 bg-[#0c0d10] px-4 py-12 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center"><Cookie className="size-4 text-zinc-600" /><p className="text-[9px] leading-4 text-zinc-600">Related terms explain acceptable use and the contractual rules for an Orbit account.</p><div className="flex gap-4 sm:ml-auto"><Link to="/terms" className="flex items-center gap-1 text-[9px] text-zinc-400 hover:text-white">Terms of Service<ArrowRight className="size-3" /></Link><Link to="/acceptable-use" className="flex items-center gap-1 text-[9px] text-zinc-400 hover:text-white">Acceptable Use<ArrowRight className="size-3" /></Link></div></div></section>

      <Modal open={requestOpen} onClose={() => setRequestOpen(false)} title="Submit a privacy request" description="We will verify your email before processing the request." footer={null}>
        <form onSubmit={submitRequest} className="space-y-4"><Field label="Email associated with Orbit"><Input required type="email" placeholder="you@company.com" /></Field><Field label="Request type"><Select required className="w-full" defaultValue="Access my information"><option>Access my information</option><option>Correct my information</option><option>Delete my information</option><option>Export my information</option><option>Object or restrict processing</option><option>Appeal a prior decision</option><option>Other privacy question</option></Select></Field><Field label="Workspace or organization" hint="Optional. This helps identify customer-controlled data."><Input placeholder="Acme Engineering" /></Field><Field label="Details" hint="Do not include passwords, private keys, or sensitive server content."><Textarea required minLength={20} placeholder="Describe the information or account involved and the outcome you are requesting." /></Field><label className="flex gap-2 text-[8px] leading-4 text-zinc-600"><input required type="checkbox" className="mt-0.5 accent-blue-500" />I confirm that the information in this request is accurate and I am authorized to make it.</label><div className="flex justify-end gap-2 border-t border-white/8 pt-4"><Button type="button" variant="ghost" onClick={() => setRequestOpen(false)}>Cancel</Button><Button type="submit"><Scale />Submit request</Button></div></form>
      </Modal>
    </>
  );
}

export default PrivacyPage;
