import { type FormEvent, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  Headphones,
  LifeBuoy,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const topics = [
  { value: "general", label: "General question" },
  { value: "sales", label: "Plans and pricing" },
  { value: "enterprise", label: "Enterprise evaluation" },
  { value: "support", label: "Product support" },
  { value: "security", label: "Security and compliance" },
  { value: "partnerships", label: "Partnerships" },
  { value: "careers", label: "Careers" },
];

const faqs = [
  ["Can I get help while I am on the Free plan?", "Yes. Free workspaces have access to documentation, community support, and email support for account and security issues. Product guidance is available to every customer."],
  ["How quickly will the team reply?", "Most sales and general questions receive a reply within one business day. Pro support targets four business hours. Enterprise severity-one incidents are handled continuously under the contracted support plan."],
  ["Can you help us evaluate a private worker?", "Yes. A customer engineer can review your network boundaries, egress requirements, secret provider, worker sizing, regional design, and phased rollout plan."],
  ["Where should I report a security vulnerability?", "Choose Security and compliance in the form or email security@orbit.run. Please do not include active credentials or sensitive customer data. We acknowledge responsible disclosures as quickly as possible."],
  ["Do you offer migration and onboarding help?", "Pro includes guided import tools and office hours. Enterprise plans can include architecture review, workspace design, connection migration, identity rollout, policy configuration, and operator training."],
];

export function ContactPage() {
  const [searchParams] = useSearchParams();
  const requestedTopic = searchParams.get("topic") ?? "general";
  const initialTopic = topics.some((topic) => topic.value === requestedTopic) ? requestedTopic : "general";
  const [topic, setTopic] = useState(initialTopic);
  const [openFaq, setOpenFaq] = useState(0);
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
    toast.success("Message sent. We will reply by email.");
    event.currentTarget.reset();
    setTopic(initialTopic);
  }

  return (
    <>
      <section className="marketing-glow border-b border-white/8 px-4 pb-16 pt-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-[9px] font-medium uppercase tracking-[0.15em] text-blue-400">Contact Orbit</p><h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Bring us the hard server problem.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-zinc-500">Talk with a product specialist, customer engineer, or support operator. You will reach a person who understands the work.</p></div></section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.72fr_1.28fr]">
          <aside>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{[
              { icon: BriefcaseBusiness, title: "Sales and enterprise", copy: "Plans, architecture, security review, procurement, and a tailored evaluation.", email: "sales@orbit.run", tone: "text-blue-300 bg-blue-400/[0.05] border-blue-400/15" },
              { icon: Headphones, title: "Customer support", copy: "Troubleshooting, workflow guidance, billing, and help with an active workspace.", email: "support@orbit.run", tone: "text-emerald-300 bg-emerald-400/[0.05] border-emerald-400/15" },
              { icon: ShieldCheck, title: "Security", copy: "Questionnaires, architecture, reports, privacy, and responsible disclosure.", email: "security@orbit.run", tone: "text-violet-300 bg-violet-400/[0.05] border-violet-400/15" },
            ].map((item) => <article key={item.title} className="rounded-xl border border-white/10 bg-[#111216] p-5"><span className={cn("grid size-9 place-items-center rounded-lg border", item.tone)}><item.icon className="size-4" /></span><h2 className="mt-5 text-base font-semibold">{item.title}</h2><p className="mt-2 text-[9px] leading-5 text-zinc-600">{item.copy}</p><a href={`mailto:${item.email}`} className="mt-4 inline-flex items-center gap-2 text-[9px] text-zinc-400 hover:text-white">{item.email}<ArrowRight className="size-3" /></a></article>)}</div>
            <div className="mt-6 rounded-xl border border-white/10 p-5"><p className="text-[8px] font-medium uppercase tracking-[0.13em] text-zinc-700">Typical response</p><div className="mt-4 space-y-3">{[[Clock3, "General and sales", "Within one business day"], [LifeBuoy, "Pro support", "Within four business hours"], [Sparkles, "Enterprise urgent", "Contracted 24/7 response"]].map(([Icon, title, copy]) => <div key={String(title)} className="flex items-center gap-3"><Icon className="size-3.5 text-zinc-600" /><div><p className="text-[9px] text-zinc-300">{String(title)}</p><p className="mt-0.5 text-[8px] text-zinc-700">{String(copy)}</p></div></div>)}</div><p className="mt-5 border-t border-white/8 pt-4 text-[8px] leading-4 text-zinc-700">Support targets vary by plan, priority, and agreement. The public <Link to="/status" className="text-zinc-400 hover:text-white">status page</Link> is the fastest source for platform incidents.</p></div>
          </aside>

          <div className="rounded-2xl border border-white/10 bg-[#111216] p-5 sm:p-7">
            {sent && <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-4"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-3.5" /></span><div><p className="text-[10px] font-medium text-emerald-200">Your message is with the right team.</p><p className="mt-1 text-[9px] leading-4 text-emerald-200/55">We sent a confirmation and will reply to the address you provided.</p></div><button type="button" className="ml-auto text-[8px] text-emerald-200/50 hover:text-emerald-200" onClick={() => setSent(false)}>Dismiss</button></div>}
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-blue-400/15 bg-blue-400/[0.05] text-blue-300"><MessageSquare className="size-4" /></span><div><h2 className="text-2xl font-semibold">Tell us what you need.</h2><p className="mt-1 text-[9px] text-zinc-600">A few useful details help us route your message without another round trip.</p></div></div>
            <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
              <Field label="First name"><Input name="firstName" required autoComplete="given-name" placeholder="Alex" /></Field>
              <Field label="Last name"><Input name="lastName" required autoComplete="family-name" placeholder="Morgan" /></Field>
              <Field label="Work email"><Input name="email" required type="email" autoComplete="email" placeholder="alex@company.com" /></Field>
              <Field label="Company"><Input name="company" autoComplete="organization" placeholder="Acme Engineering" /></Field>
              <Field label="How can we help?" className="sm:col-span-2"><Select name="topic" value={topic} onChange={(event) => setTopic(event.target.value)} className="w-full">{topics.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</Select></Field>
              {(topic === "sales" || topic === "enterprise") && <><Field label="Approximate server count"><Select name="serverCount" className="w-full" defaultValue="11-50"><option>1-10</option><option>11-50</option><option>51-250</option><option>251-1,000</option><option>1,000+</option></Select></Field><Field label="Team size"><Select name="teamSize" className="w-full" defaultValue="6-25"><option>1-5</option><option>6-25</option><option>26-100</option><option>101-500</option><option>500+</option></Select></Field></>}
              {topic === "support" && <Field label="Workspace slug or ticket ID" className="sm:col-span-2" hint="Do not include credentials, secret values, or private keys."><Input name="workspace" placeholder="acme-engineering" /></Field>}
              <Field label="Message" className="sm:col-span-2" hint="Please do not send passwords, private keys, or production data."><Textarea name="message" required minLength={20} className="min-h-36" placeholder={topic === "enterprise" ? "Tell us about your infrastructure, network boundaries, identity provider, compliance needs, and evaluation timeline..." : "A little context, what you expected, and what a good outcome looks like..."} /></Field>
              <label className="flex items-start gap-2 text-[8px] leading-4 text-zinc-600 sm:col-span-2"><input required type="checkbox" className="mt-0.5 accent-blue-500" />I agree that Orbit may use this information to respond to my request, as described in the <Link to="/privacy" className="text-zinc-300 underline underline-offset-2">Privacy Policy</Link>.</label>
              <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:col-span-2 sm:flex-row sm:items-center"><p className="text-[8px] leading-4 text-zinc-700 sm:max-w-sm">By submitting, you are contacting Orbit only. We do not add product inquiries to a marketing list.</p><Button type="submit" size="lg" className="sm:ml-auto"><Send />Send message</Button></div>
            </form>
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#0c0d10] px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-[9px] uppercase tracking-[0.14em] text-blue-400">Before you send</p><h2 className="mt-4 text-3xl font-semibold">A quick answer may already be here.</h2><p className="mt-4 text-[10px] leading-5 text-zinc-600">Browse the docs for setup and workflow guidance, or check current service health before opening an incident.</p><div className="mt-6 flex flex-wrap gap-2"><Link to="/docs"><Button variant="outline"><BookOpen />Documentation</Button></Link><Link to="/status"><Button variant="outline"><LifeBuoy />System status</Button></Link></div></div><div className="divide-y divide-white/8 border-y border-white/8">{faqs.map(([question, answer], index) => <article key={question}><button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 py-5 text-left"><span className="text-xs font-medium">{question}</span><ChevronDown className={cn("size-4 shrink-0 text-zinc-700 transition", openFaq === index && "rotate-180 text-zinc-300")} /></button>{openFaq === index && <p className="max-w-2xl pb-5 text-[10px] leading-5 text-zinc-500">{answer}</p>}</article>)}</div></div></section>

      <section className="px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-6xl flex-col items-start gap-5 rounded-xl border border-white/10 bg-[#111216] p-6 sm:flex-row sm:items-center"><span className="grid size-10 place-items-center rounded-full border border-white/10 text-zinc-500"><Users className="size-4" /></span><div><h2 className="text-lg font-semibold">Prefer to learn with other operators?</h2><p className="mt-1 text-[9px] text-zinc-600">Join the Orbit community for workflow ideas, product feedback, and practical infrastructure conversation.</p></div><Button className="sm:ml-auto" variant="outline" onClick={() => toast("Community access is included when you create a workspace.")}><Mail />Join the community</Button></div></section>
    </>
  );
}

export default ContactPage;
