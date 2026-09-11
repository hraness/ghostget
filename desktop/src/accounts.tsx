import { useState, type FormEvent } from "react";
import type { AccountView, ControlSnapshot } from "../../src/control/protocol.ts";
import { setupInstructions, setupServices } from "../../src/control/setup-model.ts";
import type { PanelModel, PanelState } from "./model.ts";
import { copyForAgent } from "./copy.ts";

type Props = { model: PanelModel; state: PanelState; snapshot: ControlSnapshot };
const shortTitle = (title: string) => title.replace(/ · browser session$/u, "");
export function connectionName(service: string, profile: string | null, accounts: readonly AccountView[]): string {
  const base = `${service.replace(/-web$/u, "")}-${profile && profile !== "Default" ? profile.toLowerCase().replaceAll(" ", "-") : "personal"}`.slice(0, 84);
  const taken = new Set(accounts.map(account => account.id));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix <= taken.size + 2; suffix++) if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  throw new Error("No connection name is available");
}

export function Accounts({ model, state, snapshot }: Props) {
  const [adding, setAdding] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [reconnect, setReconnect] = useState<AccountView | null>(null);
  const [search, setSearch] = useState("");
  const [browser, setBrowser] = useState<"chrome" | "safari">("chrome");
  const [profile, setProfile] = useState("");
  const [name, setName] = useState("");
  const [setupRequestId, setSetupRequestId] = useState<string | null>(null);
  const services = [
    ...setupServices.map(service => ({ ...service, connection: snapshot.connectionProviders.some(provider => provider.id === service.id) ? "browser" as const : "instructions" as const })),
    ...snapshot.connectionProviders.filter(provider => !setupServices.some(service => service.id === provider.id)).map(provider => ({ id: provider.id, title: shortTitle(provider.title), connection: "browser" as const })),
  ];
  const selected = services.find(service => service.id === serviceId);
  const choosing = adding || snapshot.accounts.length === 0 || reconnect !== null;
  const choose = (id: string, selectedProfile = "", account: AccountView | null = null, requestId: string | null = null) => {
    setSetupRequestId(requestId);
    setServiceId(id); setBrowser("chrome"); setProfile(selectedProfile); setReconnect(account);
    setName(account?.id ?? connectionName(id, selectedProfile, snapshot.accounts)); setAdding(true);
  };
  const reset = () => { setAdding(false); setServiceId(null); setReconnect(null); setSearch(""); setSetupRequestId(null); };
  const commit = async () => {
    const connection = state.connection; if (!connection?.subject) return;
    if (!await model.command({ action: "connection.commit", attemptId: connection.attemptId, expectedSubject: connection.subject })) return;
    reset();
    if (setupRequestId && model.getSnapshot().snapshot?.setupRequests.some(request => request.id === setupRequestId)) await model.command({ action: "setup.dismiss", id: setupRequestId });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.connection !== "browser") return;
    await model.command({ action: "connection.begin", id: name.trim(), provider: selected.id, browser, profile: browser === "chrome" ? profile.trim() || null : null, expectedRevision: reconnect?.revision ?? null });
  };
  const discovery = snapshot.discovery;
  const suggestions = discovery.enabled ? discovery.profiles.flatMap(found => found.candidates.map(id => ({ found, service: services.find(service => service.id === id) })).filter(candidate => candidate.service !== undefined)) : [];

  return <>
    {snapshot.setupRequests.length > 0 && !state.connection && <section className="setup-requests" aria-label="Agent setup requests">
      <h2>Your agent requested setup</h2>
      {snapshot.setupRequests.map(request => <div className="setup-request" key={request.id}>
        <span>{services.find(service => service.id === request.serviceId)?.title ?? request.serviceId}</span>
        <button onClick={() => choose(request.serviceId, "", null, request.id)}>Review setup</button>
        <button className="text-button" onClick={() => void model.command({ action: "setup.dismiss", id: request.id })}>Dismiss</button>
      </div>)}
      <p className="field-help">You choose the account. Nothing is connected or allowed yet.</p>
    </section>}

    {snapshot.accounts.length > 0 && !state.connection && <>
      <div className="section-heading"><h2>Connected accounts</h2>{!choosing && !state.connection && <button onClick={() => setAdding(true)}>Add account</button>}</div>
      <div className="divided-list account-list">{snapshot.accounts.map(account => <article className="account-row" key={account.id}>
        <div className="row-copy"><strong>{account.subject ?? account.id}</strong><span>{services.find(service => service.id === account.provider)?.title ?? shortTitle(account.source ?? account.kind.replaceAll("-", " "))} · {account.id}</span>
          <small className={`account-state ${account.status}`}>{account.status === "verified" ? "Verified when connected" : account.status === "reconnect-required" ? "Reconnect required" : "Configured · checked when used"}</small>
        </div>
        <details className="account-actions"><summary aria-label={`Manage ${account.id}`}>Manage</summary><div className="button-row">
          {(["cookie-source", "browser-profile"].includes(account.kind) || snapshot.connectionProviders.some(provider => provider.id === account.provider)) && <button onClick={() => { setSetupRequestId(null); setReconnect(account); setAdding(true); setName(account.id); setServiceId(account.provider && snapshot.connectionProviders.some(provider => provider.id === account.provider) ? account.provider : null); }}>Reconnect</button>}
          <button onClick={() => void model.command({ action: "connection.disconnect", id: account.id, expectedRevision: account.revision })}>Disconnect</button>
        </div></details>
      </article>)}</div>
    </>}

    {state.connection ? <section className="connection-step" aria-live="polite">
      <h2>{state.connection.status === "verified" ? "Confirm this account" : "Finish signing in"}</h2>
      <p>{state.connection.status === "verified" ? `Connect ${state.connection.subject ?? "this account"} to Ghostget?` : "Continue in the browser you opened, then check the account here."}</p>
      <div className="button-row">{state.connection.status === "verified" && state.connection.subject ? <button className="primary" onClick={() => void commit()}>Save connection</button> : <button className="primary" onClick={() => void model.command({ action: "connection.verify", attemptId: state.connection!.attemptId })}>Verify account</button>}
        <button onClick={() => void model.cancelConnection()}>Cancel connection</button>
      </div>
    </section> : choosing && <section className="account-connect" aria-label="Connect an account">
      <div className="section-heading"><h2>{reconnect ? `Reconnect ${reconnect.id}` : selected ? `Connect ${selected.title}` : "Connect a service"}</h2>{(selected || snapshot.accounts.length > 0) && <button className="text-button" onClick={selected ? () => { setSetupRequestId(null); setServiceId(null); } : reset}>{selected ? "Change service" : "Cancel"}</button>}</div>
      {!selected ? <>
        <p className="muted">Choose a service, or ask your agent to set it up.</p>
        {services.length > 8 && <input className="service-search" type="search" aria-label="Search services" placeholder="Find a service…" value={search} onChange={event => setSearch(event.target.value)} />}
        <div className="service-picker" aria-label="Services">{services.filter(service => service.title.toLowerCase().includes(search.toLowerCase())).map(service => <button key={service.id} onClick={() => choose(service.id, "", reconnect)}><span>{service.title}</span><small>{service.connection === "browser" ? "Connect in browser" : "Set up with agent"}</small></button>)}</div>
        <button className="text-button" onClick={() => model.navigate("setup")}>Set up another service with your agent</button>
      </> : selected.connection === "browser" ? <form className="connect-form" onSubmit={event => void submit(event)}>
        <label>Browser<select name="browser" value={browser} onChange={event => setBrowser(event.target.value === "safari" ? "safari" : "chrome")}><option value="chrome">Chrome</option><option value="safari">Safari</option></select></label>
        {browser === "chrome" && discovery.enabled && discovery.profiles.length > 0 && <label>Profile<select aria-label="Chrome profile" value={profile} onChange={event => { setProfile(event.target.value); if (!reconnect) setName(connectionName(selected.id, event.target.value, snapshot.accounts)); }}><option value="">Default</option>{discovery.profiles.map(found => <option key={found.id} value={found.profile}>{found.label}</option>)}</select></label>}
        <details className="connection-options"><summary>Connection options</summary><div className="form-grid">
          <label>Connection name<input name="id" required maxLength={96} autoComplete="off" value={name} readOnly={reconnect !== null} onChange={event => setName(event.target.value)} /></label>
          {browser === "chrome" && <label>Chrome profile directory<input name="profile" maxLength={128} placeholder="Default" value={profile} autoComplete="off" onChange={event => setProfile(event.target.value)} /><small className="field-help">Default or Profile 1, Profile 2…</small></label>}
        </div></details>
        <div className="button-row"><button className="primary" disabled={!name.trim()}>{reconnect ? "Reconnect account" : "Open sign-in"}</button></div>
        <p className="field-help">Already signed in? Keep the browser session and return here to verify it.</p>
      </form> : <div className="agent-connection"><p>{selected.title} uses its provider-specific setup through your agent.</p><button className="primary" onClick={() => void copyForAgent(model, setupInstructions(selected.id))}>Copy setup prompt</button><details className="compact-details"><summary>Read instructions</summary><pre className="preview-text">{setupInstructions(selected.id)}</pre></details></div>}
    </section>}

    {!state.connection && <section className="browser-discovery" aria-label="Browser discovery">
      <div className="section-heading"><div><h2>Find accounts in Chrome</h2><p className="field-help">Optional suggestions from profile and cookie names. Sign-in is verified only when you connect.</p></div>
        {discovery.enabled ? <button className="text-button" onClick={() => void model.command({ action: "discovery.configure", enabled: false, expectedRevision: discovery.revision })}>Turn off</button> : <button onClick={() => void model.command({ action: "discovery.configure", enabled: true, expectedRevision: discovery.revision })}>Enable discovery</button>}
      </div>
      {discovery.enabled && <>
        {suggestions.length > 0 ? <div className="discovery-list">{suggestions.map(({ found, service }) => <div className="discovery-row" key={`${found.id}/${service!.id}`}><div className="row-copy"><strong>{service!.title}</strong><span>{found.label} · Sign-in not verified</span></div><button onClick={() => choose(service!.id, found.profile)}>Connect</button></div>)}</div> : <p className="field-help">{discovery.status === "unavailable" ? "Chrome profiles could not be checked. You can still choose a service above." : discovery.status === "not-scanned" ? "Check Chrome to find supported accounts." : "No supported sign-in hints found. You can still connect a service above."}</p>}
        <button className="text-button" onClick={() => void model.command({ action: "discovery.refresh", expectedRevision: discovery.revision })}>Refresh discovery</button>
      </>}
    </section>}
  </>;
}
