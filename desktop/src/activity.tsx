import { useEffect, useRef, useState } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { ActivityOutcome, ActivityQuery, ActivityRow } from "../../src/control/protocol.ts";
import type { ActivityState, PanelModel } from "./model.ts";

function duration(value: number | null): string { return value === null ? "—" : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`; }
export function Activity({ model, state }: { model: PanelModel; state: ActivityState }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState(state.query.search);
  const [origin, setOrigin] = useState(state.query.origin ?? "");
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const focusedIndex = focused ? state.rows.findIndex(row => row.id === focused) : -1;
  const virtualizer = useVirtualizer({ count: state.rows.length, getScrollElement: () => viewport.current, estimateSize: () => 46, overscan: 6, initialRect: { width: 800, height: 414 }, getItemKey: index => state.rows[index]?.id ?? index, rangeExtractor: range => { const indices = defaultRangeExtractor(range); return focusedIndex >= 0 && !indices.includes(focusedIndex) ? [...indices, focusedIndex].sort((a, b) => a - b) : indices; } });
  const virtualRows = virtualizer.getVirtualItems();
  const last = virtualRows.at(-1)?.index ?? -1;
  useEffect(() => { if (state.loaded && last >= state.rows.length - 12 && state.nextCursor && !state.loading && !state.error) void model.loadActivity(); }, [last, model, state.loaded, state.rows.length, state.nextCursor, state.loading, state.error]);
  const change = (patch: Partial<ActivityQuery>) => { setSelected(null); setFocused(null); viewport.current?.scrollTo({ top: 0 }); model.setQuery({ ...state.query, ...patch }); };
  const moveFocus = (index: number) => { const row = state.rows[index]; if (!row) return; setFocused(row.id); virtualizer.scrollToIndex(index); requestAnimationFrame(() => document.getElementById(`activity-${row.id}`)?.focus()); };
  return <div className="activity-view">
    <form className="toolbar activity-filters" onSubmit={event => { event.preventDefault(); change({ search, origin: origin.trim() || null }); }}>
      <label className="search-field"><span className="sr-only">Search activity</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search endpoints, domains, outcomes…" maxLength={128} /></label>
      <label><span className="sr-only">Domain filter</span><input type="text" value={origin} onChange={event => setOrigin(event.target.value)} placeholder="https://example.com" aria-label="Domain filter" maxLength={256} /></label>
      <button type="submit">Search</button>
      <label><span className="sr-only">Method</span><select aria-label="Method" value={state.query.method} onChange={event => change({ method: event.target.value as ActivityQuery["method"] })}><option value="all">All methods</option><option>GET</option><option>HEAD</option></select></label>
      <label><span className="sr-only">Outcome</span><select aria-label="Outcome" value={state.query.outcome} onChange={event => change({ outcome: event.target.value as "all" | ActivityOutcome })}>{["all", "succeeded", "denied", "failed", "cancelled", "interrupted", "started"].map(value => <option key={value} value={value}>{value === "all" ? "All outcomes" : value}</option>)}</select></label>
      <label><span className="sr-only">Time range</span><select aria-label="Time range" onChange={event => change({ since: event.target.value ? new Date(model.now() - Number(event.target.value)).toISOString() : null })}><option value="">Any time</option><option value="86400000">Last 24 hours</option><option value="604800000">Last 7 days</option></select></label>
      <label><span className="sr-only">Sort order</span><select aria-label="Sort order" value={state.query.order} onChange={event => change({ order: event.target.value as "newest" | "oldest" })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </form>
    <div className="activity-summary"><span>{state.loaded ? `${model.formatCount(state.matchingCount)} matching requests` : "Loading activity…"}</span><button className="text-button" onClick={() => { setSelected(null); model.refreshActivity(); }} disabled={state.loading}>{state.newerCount ? `${state.newerCount} new · Refresh` : "Refresh activity"}</button></div>
    <div className="activity-scroll" ref={viewport} data-testid="activity-scroll" aria-busy={state.loading}>
      <table className="activity-table" aria-label="Web gateway activity" aria-rowcount={state.matchingCount + 1}>
        <thead><tr><th scope="col">Request</th><th scope="col">Outcome</th><th scope="col">Time</th><th scope="col" className="numeric">Duration</th></tr></thead>
        <tbody style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualRows.map(item => { const row = state.rows[item.index]; if (!row) return null; return <tr key={row.id} id={`activity-${row.id}`} data-activity-row="true" aria-rowindex={item.index + 2} aria-selected={selected?.id === row.id} tabIndex={focused ? focused === row.id ? 0 : -1 : item.index === 0 ? 0 : -1} style={{ transform: `translateY(${item.start}px)`, height: `${item.size}px` }} onFocus={() => setFocused(row.id)} onClick={() => setSelected(row)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(row); } else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveFocus(item.index + (event.key === "ArrowDown" ? 1 : -1)); } }}>
            <td><span className="method">{row.method}</span><span className="request-target"><strong>{row.origin ?? "Blocked destination"}</strong><small>{row.endpoint ?? "No endpoint retained"}</small></span></td><td><span className={`status ${row.outcome}`}>{row.outcome}</span></td><td><time dateTime={row.startedAt}>{model.formatTime(row.startedAt)}</time></td><td className="numeric">{duration(row.durationMs)}</td>
          </tr>; })}
        </tbody>
      </table>
      {state.loaded && state.rows.length === 0 && <div className="empty-inline"><strong>No matching requests</strong><p>Try a different search or clear the filters.</p></div>}
      {state.loading && <p className="table-progress" role="status">Loading requests…</p>}
      {state.error && <div className="table-progress" role="alert">{state.error} <button onClick={() => void model.loadActivity(state.rows.length > 0)}>Retry</button></div>}
      {state.loaded && state.nextCursor === null && state.rows.length > 0 && <p className="table-progress">End of retained activity</p>}
    </div>
    {selected && <section className="activity-detail" aria-label="Request details"><div className="row-heading"><h2>Request details</h2><button onClick={() => setSelected(null)}>Close details</button></div><dl><div><dt>Endpoint</dt><dd>{selected.origin}{selected.endpoint}</dd></div><div><dt>Rule</dt><dd>{selected.ruleId ?? "No matching rule"}</dd></div><div><dt>Decision</dt><dd>{selected.decision}</dd></div><div><dt>HTTP status</dt><dd>{selected.httpStatus ?? "No response"}</dd></div><div><dt>Response size</dt><dd>{model.formatCount(selected.responseBytes)} bytes</dd></div><div><dt>Failure code</dt><dd>{selected.errorCode ?? "None"}</dd></div></dl></section>}
    <p className="footnote">Gateway metadata only. Request bodies, query values, credentials and response content are never shown here.</p>
  </div>;
}
