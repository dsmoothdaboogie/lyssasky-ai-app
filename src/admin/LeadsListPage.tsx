import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { fetchAllLeads } from "../firebase/api";
import type { Lead, LeadStatus } from "../domain/types";

const STATUS_FILTERS: Array<"all" | LeadStatus> = [
  "all",
  "captured",
  "paid",
  "generated",
  "rated",
  "booked",
  "failed",
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCreatedAt(ms: number): string {
  return dateFormatter.format(new Date(ms));
}

/**
 * Small colored badge per LeadStatus. `booked` reads as a positive outcome
 * (sage/secondary), `failed` needs attention (danger), everything else is
 * a neutral in-progress state (accent/terracotta-tinted).
 */
function StatusChip({ status }: { status: LeadStatus }) {
  return <span className={`status-chip status-chip-${status}`}>{status}</span>;
}

/**
 * Admin-only leads table at /admin/leads. Fetches every lead once (admin
 * claim satisfies firestore.rules), then filters client-side by status.
 */
export function LeadsListPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");

  useEffect(() => {
    let cancelled = false;
    fetchAllLeads().then((result) => {
      if (!cancelled) setLeads(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleLeads = useMemo(() => {
    if (!leads) return [];
    if (statusFilter === "all") return leads;
    return leads.filter((lead) => lead.status === statusFilter);
  }, [leads, statusFilter]);

  if (leads === null) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Loading leads…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-leads-toolbar">
        <h1>Leads</h1>
        <label htmlFor="leads-status-filter">
          Status
          <select
            id="leads-status-filter"
            value={statusFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(e.target.value as "all" | LeadStatus)
            }
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-leads-table-wrap">
        <table className="admin-leads-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Style</th>
              <th scope="col">Created</th>
              <th scope="col" aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {visibleLeads.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.email ?? "(no email yet)"}</td>
                <td>
                  <StatusChip status={lead.status} />
                </td>
                <td>{lead.answers?.styleSlug ?? "—"}</td>
                <td>{formatCreatedAt(lead.createdAt)}</td>
                <td>
                  <Link to={`/admin/leads/${lead.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleLeads.length === 0 && (
        <p className="text-muted">No leads match this filter.</p>
      )}
    </div>
  );
}
