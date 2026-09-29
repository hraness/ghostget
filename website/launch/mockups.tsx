/**
 * Code-built illustrations of GhostGet for the homepage, the launch post, and
 * the launch film. Each one is server-safe React on the shared design-kit
 * mockup frames, rendered to static HTML at build time, so the site stays
 * dependency-free in the browser.
 *
 * Commands and output follow the shipped CLI (README.md and a real
 * `ghostget read` capture). Numbers come from `facts.ts` or from the provider
 * directory the build derives from the release. Accounts, names, and message
 * text are made up, and third-party apps are drawn as unbranded frames.
 */
import {
  AgentSession,
  BrowserWindow,
  MockupRoot,
  TerminalFrame,
  type AgentTurn,
  type MockupTheme,
  type TerminalLine,
} from "@hraness/design-kit/mockups";
import type { ReactNode } from "react";
import { LAUNCH_CLAIMS_NOT_VERIFIED, LAUNCH_RELEASE_VERSION, LAUNCH_MEASURED_ON, LAUNCH_MEASURED_READS, launchFacts } from "./facts.ts";

export type LaunchService = Readonly<{ name: string; actions: number }>;

export type MockupProps = Readonly<{ theme?: MockupTheme }>;

const themed = (theme: MockupTheme | undefined) => (theme === undefined ? {} : { theme });

/** The frontmatter a real `ghostget read` prints before the Markdown body. */
const READ_FRONTMATTER = [
  "---",
  'title: "Wget"',
  'source: "https://en.wikipedia.org/wiki/Wget"',
  'capture_status: "complete"',
  'capture_scope: "page"',
  "---",
  "# Wget",
  "GNU Wget is a computer program that retrieves content from web servers...",
] as const;

/** Beat what: a coding agent asks for a page and gets Markdown back. */
export function AgentReadMockup({ theme }: MockupProps) {
  const turns: AgentTurn[] = [
    { role: "user", text: "What does the Wikipedia article on wget say about where it came from?" },
    { role: "tool", tool: "ghostget read", status: "ok", text: `ghostget read https://en.wikipedia.org/wiki/Wget\n${READ_FRONTMATTER.join("\n")}`, beat: "read" },
    { role: "agent", text: `Got the article as Markdown (${launchFacts.wikiMarkdownBytes.value}). Wget started in the mid-1990s as a small command-line tool for fetching pages without a browser.` },
  ];
  return (
    <AgentSession
      {...themed(theme)}
      agent="generic-cli"
      describe="Illustration: a coding agent calls ghostget read on a Wikipedia article and gets clean Markdown with its source attached."
      turns={turns}
    />
  );
}

/** Beat does: bars from the homepage Measured table. */
export function MeasuredMockup({ theme }: MockupProps) {
  const max = Math.max(...LAUNCH_MEASURED_READS.map((row) => row.htmlBytes));
  const width = (value: number) => `${Math.max(1.5, (value / max) * 100).toFixed(2)}%`;
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe={`Illustration: bars comparing ghostget read Markdown with the raw HTML of four pages, measured ${LAUNCH_MEASURED_ON}.`} kind="ghostget-measured">
      <div className="ggm-card">
        <p className="ggm-card-title">What your agent reads</p>
        <ul className="ggm-bars">
          {LAUNCH_MEASURED_READS.map((row) => (
            <li className="ggm-bar-row" key={row.page}>
              <span className="ggm-bar-label">{row.page}</span>
              <span className="ggm-bar" data-ggm-kind="html" style={{ inlineSize: width(row.htmlBytes) }}>
                <span>{row.htmlBytes.toLocaleString("en-US")} bytes of HTML</span>
              </span>
              <span className="ggm-bar" data-ggm-kind="markdown" style={{ inlineSize: width(row.markdownBytes) }}>
                <span>{row.markdownBytes.toLocaleString("en-US")} bytes of Markdown</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="ggm-card-foot">Read over HTTP without a browser on {LAUNCH_MEASURED_ON}.</p>
      </div>
    </MockupRoot>
  );
}

export type NamedActionMode = "browser" | "ghostget";

/** One side of the named-action comparison. */
function BrowserSide() {
  return (
    <div className="ggm-side" data-ggm-side="browser">
      <p className="ggm-side-label">A signed-in browser</p>
      <BrowserWindow url="https://mail.example/inbox">
        <div className="ggm-mail">
          <div className="ggm-mail-nav">
            <span>Inbox</span><span>Contacts</span><span>Settings</span><span>Forwarding</span>
          </div>
          <ul className="ggm-mail-list">
            <li><b>Sam Rivera</b> Dinner on Friday?</li>
            <li><b>Bank alerts</b> Your statement is ready</li>
            <li><b>Priya N.</b> Draft for the newsletter</li>
          </ul>
          <span className="ggm-cursor" aria-hidden="true" />
          <p className="ggm-mail-note">The agent can click anything you can: settings, forwarding, send.</p>
        </div>
      </BrowserWindow>
    </div>
  );
}

function GhostgetSide() {
  const lines: TerminalLine[] = [
    { kind: "input", text: "ghostget gmail contacts.list --auth gmail-main --json" },
    { kind: "output", text: '{ "contacts": [ { "name": "Sam Rivera" }, { "name": "Priya N." } ] }', tone: "ok" },
    { kind: "comment", text: "one named action, one account, no cookie or token handed over" },
  ];
  return (
    <div className="ggm-side" data-ggm-side="ghostget">
      <p className="ggm-side-label">A named GhostGet action</p>
      <TerminalFrame describe="Terminal running one named GhostGet action." lines={lines} title="Agent terminal" />
    </div>
  );
}

/** Beat does: a signed-in browser next to one named action. `mode` picks which side leads. */
export function NamedActionMockup({ mode = "ghostget", theme }: MockupProps & Readonly<{ mode?: NamedActionMode }>) {
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe="Illustration: an agent steering a signed-in browser next to an agent calling one named GhostGet action." kind="ghostget-named">
      <div className="ggm-compare" data-ggm-mode={mode}>
        <BrowserSide />
        <GhostgetSide />
      </div>
    </MockupRoot>
  );
}

/** Beat does: the services with actions in this release, from the provider directory. */
export function ServicesMockup({ services, theme }: MockupProps & Readonly<{ services: readonly LaunchService[] }>) {
  if (services.length === 0) throw new RangeError("ServicesMockup needs the provider directory.");
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe={`Illustration: the ${services.length} services GhostGet has actions for, each with its action count.`} kind="ghostget-services">
      <div className="ggm-card">
        <p className="ggm-card-title">ghostget capabilities</p>
        <ul className="ggm-services">
          {services.map((service) => (
            <li key={service.name}>
              <span className="ggm-service-name">{service.name}</span>
              <span className="ggm-service-count">{service.actions} {service.actions === 1 ? "action" : "actions"}</span>
            </li>
          ))}
        </ul>
      </div>
    </MockupRoot>
  );
}

const NO_RESEND_STEPS = [
  { id: "record", label: "Send written down", detail: "Before anything leaves your machine", tone: "ok" },
  { id: "send", label: "Post goes out", detail: "linkedin-web posts.publish", tone: "ok" },
  { id: "lost", label: "The answer never comes back", detail: "Did it post? Unknown", tone: "warn" },
  { id: "hold", label: "Held, not sent again", detail: "Waits until it knows what happened", tone: "ok" },
] as const;

/** Beat does: a lost reply is held instead of re-sent. `step` highlights one stage for the film. */
export function NoResendMockup({ step, theme }: MockupProps & Readonly<{ step?: (typeof NO_RESEND_STEPS)[number]["id"] }>) {
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe="Illustration: a send is written down, goes out, loses its answer, and is held instead of sent twice." kind="ghostget-no-resend">
      <ol className="ggm-steps">
        {NO_RESEND_STEPS.map((item, index) => (
          <li data-ggm-current={step === item.id ? "" : undefined} data-ggm-step={item.id} data-ggm-tone={item.tone} key={item.id}>
            <span className="ggm-step-index">{index + 1}</span>
            <span className="ggm-step-text"><b>{item.label}</b><span>{item.detail}</span></span>
          </li>
        ))}
      </ol>
    </MockupRoot>
  );
}

/** Beat how: an exact preview waiting for confirmation. */
export function PreviewMockup({ confirmed = false, theme }: MockupProps & Readonly<{ confirmed?: boolean }>) {
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe="Illustration: a preview of one post with its account and exact text, waiting for someone to confirm it." kind="ghostget-preview">
      <div className="ggm-card ggm-preview" data-ggm-confirmed={confirmed ? "" : undefined}>
        <p className="ggm-card-title">Preview · nothing sent yet</p>
        <dl className="ggm-preview-fields">
          <div><dt>Action</dt><dd>linkedin-web posts.publish</dd></div>
          <div><dt>Account</dt><dd>linkedin-main (Alex Moreno)</dd></div>
          <div><dt>Visible to</dt><dd>Anyone on LinkedIn</dd></div>
          <div><dt>Exact text</dt><dd className="ggm-preview-text">We just shipped the spring schedule. Link in the comments.</dd></div>
        </dl>
        <p className="ggm-preview-command"><code>ghostget confirm 7f3c…a91e</code></p>
        <p className="ggm-preview-state">{confirmed ? "Confirmed. Sent once." : "Waiting for you to confirm this exact preview."}</p>
      </div>
    </MockupRoot>
  );
}

/** Beat who: a person asks their own agent; the agent calls one read action. */
export function AgentSessionMockup({ theme }: MockupProps) {
  const turns: AgentTurn[] = [
    { role: "user", text: "Did Sam reply about Friday?" },
    { role: "tool", tool: "ghostget gmail messaging.list", status: "ok", text: "ghostget gmail messaging.list --auth gmail-main --json\n1 thread from Sam Rivera · Dinner on Friday?" },
    { role: "agent", text: "Yes. Sam says Friday at seven works and asked if you want to book the table." },
  ];
  return (
    <AgentSession
      {...themed(theme)}
      agent="generic-chat"
      describe="Illustration: a person asks their agent about an email, and the agent calls one read-only GhostGet action."
      title="Your agent"
      turns={turns}
    />
  );
}

/** Beat vision: the agent on top, reviewed actions in the middle, accounts underneath. */
export function LayersMockup({ theme }: MockupProps) {
  const layers: { id: string; title: string; detail: ReactNode }[] = [
    { id: "agent", title: "Your agent", detail: "Plans, thinks, and asks" },
    { id: "ghostget", title: "GhostGet", detail: "Reviewed, named actions with previews" },
    { id: "accounts", title: "Your accounts", detail: "Stay signed in on your machine" },
  ];
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe="Illustration: your agent on top, GhostGet's reviewed actions in the middle, and your accounts underneath." kind="ghostget-layers">
      <ol className="ggm-layers">
        {layers.map((layer) => (
          <li data-ggm-layer={layer.id} key={layer.id}>
            <b>{layer.title}</b>
            <span>{layer.detail}</span>
          </li>
        ))}
      </ol>
    </MockupRoot>
  );
}

/** Beat limits: what GhostGet does not do. */
export function LimitsMockup({ theme }: MockupProps) {
  const limits = [
    "Get past a sign-in, payment, or access control",
    "Download DRM media, playlists, or live streams",
    "Click through a site it has no reviewed action for",
    "Send again when it does not know what happened",
  ];
  return (
    <MockupRoot {...themed(theme)} className="ggm" describe="Illustration: a short list of what GhostGet does not do, with its count of claims that have no automated check." kind="ghostget-limits">
      <div className="ggm-card">
        <p className="ggm-card-title">GhostGet will not</p>
        <ul className="ggm-limits">
          {limits.map((limit) => <li key={limit}>{limit}</li>)}
        </ul>
        <p className="ggm-card-foot">{LAUNCH_CLAIMS_NOT_VERIFIED} claims in its register have no automated check yet.</p>
      </div>
    </MockupRoot>
  );
}

/** Beat status: `ghostget status` with two made-up connected accounts and one approval waiting. */
export function ControlsMockup({ theme }: MockupProps) {
  const lines: TerminalLine[] = [
    { kind: "input", text: "ghostget status" },
    { kind: "output", text: "== Ghostget ==" },
    { kind: "output", text: `Ready · 2 accounts · ${LAUNCH_RELEASE_VERSION}`, tone: "ok" },
    { kind: "output", text: "== Approvals ==" },
    { kind: "output", text: "1 waiting · linkedin-web posts.publish preview", tone: "warn" },
    { kind: "output", text: "== Accounts ==" },
    { kind: "output", text: "- gmail-main · gmail · configured" },
    { kind: "output", text: "- linkedin-main · browser-profile · configured" },
  ];
  return (
    <TerminalFrame
      {...themed(theme)}
      describe="Illustration: ghostget status in a terminal, with two connected accounts and one approval waiting."
      lines={lines}
      title="Terminal"
    />
  );
}

/** The mockup ids the beats name, in the order the post shows them. */
export const LAUNCH_MOCKUP_IDS = [
  "agent-read",
  "measured",
  "named-action",
  "services",
  "no-resend",
  "preview",
  "agent-session",
  "layers",
  "limits",
  "controls",
] as const;
export type LaunchMockupId = (typeof LAUNCH_MOCKUP_IDS)[number];

/** Render one beat's mockup by id and state. */
export function LaunchMockup({
  id,
  services,
  state = {},
  theme,
}: MockupProps & Readonly<{ id: string; state?: Readonly<Record<string, string>>; services: readonly LaunchService[] }>) {
  const t = themed(theme);
  switch (id as LaunchMockupId) {
    case "agent-read":
      return <AgentReadMockup {...t} />;
    case "measured":
      return <MeasuredMockup {...t} />;
    case "named-action":
      return <NamedActionMockup {...t} mode={state["mode"] === "browser" ? "browser" : "ghostget"} />;
    case "services":
      return <ServicesMockup {...t} services={services} />;
    case "no-resend":
      return <NoResendMockup {...t} />;
    case "preview":
      return <PreviewMockup {...t} confirmed={state["confirmed"] === "true"} />;
    case "agent-session":
      return <AgentSessionMockup {...t} />;
    case "layers":
      return <LayersMockup {...t} />;
    case "limits":
      return <LimitsMockup {...t} />;
    case "controls":
      return <ControlsMockup {...t} />;
    default:
      throw new RangeError(`Unknown GhostGet launch mockup ${JSON.stringify(id)}.`);
  }
}
