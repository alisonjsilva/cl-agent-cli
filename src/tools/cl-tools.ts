import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { CLAccount } from "../config/schema.js";
import { clFetch, formatResource, formatList, buildQuery } from "./cl-api.js";

export interface ConfirmContext {
  summary: string;
  details: Array<{ label: string; value: string }>;
  command?: string;
  warning?: string;
}

export type MutationConfirmFn = (
  toolName: string,
  args: Record<string, unknown>,
  context?: ConfirmContext,
) => Promise<boolean>;

export class UserDeclinedError extends Error {
  constructor() {
    super("User declined this operation.");
    this.name = "UserDeclinedError";
  }
}

async function requireConfirm(
  confirmFn: MutationConfirmFn | undefined,
  toolName: string,
  args: Record<string, unknown>,
  context?: ConfirmContext,
): Promise<void> {
  if (!confirmFn) {
    throw new Error(
      `Mutation "${toolName}" blocked: no confirmation handler. This is a safety violation.`,
    );
  }
  const ok = await confirmFn(toolName, args, context);
  if (!ok) throw new UserDeclinedError();
}

async function fetchOrderContext(
  account: CLAccount,
  orderId: string,
): Promise<ConfirmContext | undefined> {
  try {
    const res = await clFetch(account, `orders/${orderId}`);
    const a = (res.data as Record<string, unknown>).attributes as Record<string, unknown>;
    return {
      summary: `Order #${a?.number ?? orderId}`,
      details: [
        { label: "ID", value: orderId },
        { label: "Number", value: `#${a?.number ?? "—"}` },
        { label: "Status", value: String(a?.status ?? "—") },
        { label: "Payment", value: String(a?.payment_status ?? "—") },
        { label: "Fulfillment", value: String(a?.fulfillment_status ?? "—") },
        { label: "Total", value: String(a?.formatted_total_amount_with_taxes ?? "—") },
        ...(a?.customer_email ? [{ label: "Customer", value: String(a.customer_email) }] : []),
        ...(a?.placed_at ? [{ label: "Placed", value: new Date(String(a.placed_at)).toLocaleString() }] : []),
      ],
    };
  } catch {
    return undefined;
  }
}

function formatCommand(
  method: "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): string {
  const requestLine = `${method} /${path}`;
  if (!body) return requestLine;
  return `${requestLine}\n${JSON.stringify(body, null, 2)}`;
}

function withCommand(
  context: ConfirmContext | undefined,
  command: string,
  warning?: string,
): ConfirmContext {
  return {
    summary: context?.summary ?? "Selected resource",
    details: context?.details ?? [],
    command,
    warning,
  };
}

async function fetchResourceContext(
  account: CLAccount,
  resourceType: string,
  id: string,
): Promise<ConfirmContext | undefined> {
  try {
    const res = await clFetch(account, `${resourceType}/${id}`);
    const a = (res.data as Record<string, unknown>).attributes as Record<string, unknown>;
    const details: Array<{ label: string; value: string }> = [
      { label: "ID", value: id },
    ];
    const interesting = ["number", "name", "code", "status", "email", "amount_cents", "currency_code", "formatted_amount"];
    for (const key of interesting) {
      if (a?.[key] != null) {
        details.push({ label: key.replace(/_/g, " "), value: String(a[key]) });
      }
    }
    return {
      summary: `${resourceType.replace(/_/g, " ")} ${a?.number ?? a?.name ?? a?.code ?? id}`,
      details,
    };
  } catch {
    return undefined;
  }
}

export function createCLTools(
  account: CLAccount,
  confirmFn?: MutationConfirmFn,
): ToolSet {
  const tools: ToolSet = {};

  // ── Read tools (no confirmation needed) ──

  tools.cl_list_resources = tool({
    description:
      "List Commerce Layer resources. Common types: orders, customers, skus, shipments, returns, prices, stock_items, captures, refunds, markets, promotions, gift_cards, imports, exports, line_items, addresses, payment_methods, shipping_methods.",
    inputSchema: z.object({
      resource_type: z.string().describe("Resource type (e.g. orders, customers, skus)"),
      page_size: z.number().min(1).max(25).default(10).describe("Results per page (max 25)"),
      page_number: z.number().min(1).default(1).describe("Page number"),
      sort: z.string().optional().describe("Sort field, e.g. -created_at for newest first"),
      filters: z.record(z.string()).optional().describe("Ransack filter params, e.g. { status_eq: 'placed' }"),
    }),
    execute: async ({ resource_type, page_size, page_number, sort, filters }) => {
      const qs = buildQuery({ pageSize: page_size, pageNumber: page_number, sort, filters });
      const res = await clFetch(account, `${resource_type}${qs}`);
      const data = Array.isArray(res.data) ? res.data : [res.data];
      return formatList(data, res.meta);
    },
  });

  tools.cl_get_resource = tool({
    description: "Get a single Commerce Layer resource by type and ID.",
    inputSchema: z.object({
      resource_type: z.string().describe("Resource type (e.g. orders, customers, skus)"),
      id: z.string().describe("Resource ID"),
    }),
    execute: async ({ resource_type, id }) => {
      const res = await clFetch(account, `${resource_type}/${id}`);
      return formatResource(res.data as Record<string, unknown>);
    },
  });

  tools.cl_search_orders = tool({
    description: "Search orders by number, status, payment_status, or customer email. Results are sorted newest-first.",
    inputSchema: z.object({
      number: z.string().optional().describe("Order number (exact match)"),
      status: z.string().optional().describe("Order status: draft, pending, placed, approved, cancelled"),
      payment_status: z.string().optional().describe("Payment status: unpaid, authorized, partially_authorized, paid, partially_paid, voided, partially_voided, refunded, partially_refunded, free"),
      email: z.string().optional().describe("Customer email (contains match)"),
      page_size: z.number().min(1).max(25).default(10),
    }),
    execute: async ({ number, status, payment_status, email, page_size }) => {
      const filters: Record<string, string> = {};
      if (number) filters.number_eq = number;
      if (status) filters.status_eq = status;
      if (payment_status) filters.payment_status_eq = payment_status;
      if (email) filters.customer_email_cont = email;
      const qs = buildQuery({ pageSize: page_size, sort: "-created_at", filters });
      const res = await clFetch(account, `orders${qs}`);
      const data = Array.isArray(res.data) ? res.data : [res.data];
      return formatList(data, res.meta);
    },
  });

  tools.cl_search_customers = tool({
    description: "Search customers by email.",
    inputSchema: z.object({
      email: z.string().describe("Customer email (exact or partial match)"),
      page_size: z.number().min(1).max(25).default(10),
    }),
    execute: async ({ email, page_size }) => {
      const qs = buildQuery({ pageSize: page_size, filters: { email_cont: email } });
      const res = await clFetch(account, `customers${qs}`);
      const data = Array.isArray(res.data) ? res.data : [res.data];
      return formatList(data, res.meta);
    },
  });

  tools.cl_search_skus = tool({
    description: "Search SKUs by code or name.",
    inputSchema: z.object({
      code: z.string().optional().describe("SKU code (contains match)"),
      name: z.string().optional().describe("SKU name (contains match)"),
      page_size: z.number().min(1).max(25).default(10),
    }),
    execute: async ({ code, name, page_size }) => {
      const filters: Record<string, string> = {};
      if (code) filters.code_cont = code;
      if (name) filters.name_cont = name;
      const qs = buildQuery({ pageSize: page_size, filters });
      const res = await clFetch(account, `skus${qs}`);
      const data = Array.isArray(res.data) ? res.data : [res.data];
      return formatList(data, res.meta);
    },
  });

  // ── Mutation tools (confirmation INSIDE execute) ──

  tools.cl_cancel_order = tool({
    description: "MUTABLE - Cancel an order by ID.",
    inputSchema: z.object({
      order_id: z.string().describe("Order ID to cancel"),
    }),
    execute: async ({ order_id }) => {
      const body = { data: { type: "orders", id: order_id, attributes: { _cancel: true } } };
      const ctx = withCommand(
        await fetchOrderContext(account, order_id),
        formatCommand("PATCH", `orders/${order_id}`, body),
      );
      await requireConfirm(confirmFn, "cl_cancel_order", { order_id }, ctx);
      const res = await clFetch(account, `orders/${order_id}`, {
        method: "PATCH",
        body,
      });
      const attrs = (res.data as Record<string, unknown>).attributes as Record<string, unknown>;
      return `Order ${order_id} cancelled. Status: ${attrs?.status}`;
    },
  });

  tools.cl_approve_order = tool({
    description: "MUTABLE - Approve an order by ID.",
    inputSchema: z.object({
      order_id: z.string().describe("Order ID to approve"),
    }),
    execute: async ({ order_id }) => {
      const body = { data: { type: "orders", id: order_id, attributes: { _approve: true } } };
      const ctx = withCommand(
        await fetchOrderContext(account, order_id),
        formatCommand("PATCH", `orders/${order_id}`, body),
      );
      await requireConfirm(confirmFn, "cl_approve_order", { order_id }, ctx);
      const res = await clFetch(account, `orders/${order_id}`, {
        method: "PATCH",
        body,
      });
      const attrs = (res.data as Record<string, unknown>).attributes as Record<string, unknown>;
      return `Order ${order_id} approved. Status: ${attrs?.status}`;
    },
  });

  tools.cl_place_order = tool({
    description: "MUTABLE - Place a draft order by ID.",
    inputSchema: z.object({
      order_id: z.string().describe("Order ID to place"),
    }),
    execute: async ({ order_id }) => {
      const body = { data: { type: "orders", id: order_id, attributes: { _place: true } } };
      const ctx = withCommand(
        await fetchOrderContext(account, order_id),
        formatCommand("PATCH", `orders/${order_id}`, body),
      );
      await requireConfirm(confirmFn, "cl_place_order", { order_id }, ctx);
      const res = await clFetch(account, `orders/${order_id}`, {
        method: "PATCH",
        body,
      });
      const attrs = (res.data as Record<string, unknown>).attributes as Record<string, unknown>;
      return `Order ${order_id} placed. Status: ${attrs?.status}`;
    },
  });

  tools.cl_archive_order = tool({
    description: "MUTABLE - Archive an order by ID.",
    inputSchema: z.object({
      order_id: z.string().describe("Order ID to archive"),
    }),
    execute: async ({ order_id }) => {
      const body = { data: { type: "orders", id: order_id, attributes: { _archive: true } } };
      const ctx = withCommand(
        await fetchOrderContext(account, order_id),
        formatCommand("PATCH", `orders/${order_id}`, body),
      );
      await requireConfirm(confirmFn, "cl_archive_order", { order_id }, ctx);
      await clFetch(account, `orders/${order_id}`, {
        method: "PATCH",
        body,
      });
      return `Order ${order_id} archived.`;
    },
  });

  tools.cl_capture_payment = tool({
    description: "MUTABLE - Capture an authorization (payment).",
    inputSchema: z.object({
      authorization_id: z.string().describe("Authorization ID to capture"),
    }),
    execute: async ({ authorization_id }) => {
      const body = { data: { type: "authorizations", id: authorization_id, attributes: { _capture: true } } };
      const ctx = withCommand(
        await fetchResourceContext(account, "authorizations", authorization_id),
        formatCommand("PATCH", `authorizations/${authorization_id}`, body),
      );
      await requireConfirm(confirmFn, "cl_capture_payment", { authorization_id }, ctx);
      await clFetch(account, `authorizations/${authorization_id}`, {
        method: "PATCH",
        body,
      });
      return `Authorization ${authorization_id} captured.`;
    },
  });

  tools.cl_refund_capture = tool({
    description: "MUTABLE - Refund a captured payment.",
    inputSchema: z.object({
      capture_id: z.string().describe("Capture ID to refund"),
    }),
    execute: async ({ capture_id }) => {
      const body = { data: { type: "captures", id: capture_id, attributes: { _refund: true } } };
      const ctx = withCommand(
        await fetchResourceContext(account, "captures", capture_id),
        formatCommand("PATCH", `captures/${capture_id}`, body),
      );
      await requireConfirm(confirmFn, "cl_refund_capture", { capture_id }, ctx);
      await clFetch(account, `captures/${capture_id}`, {
        method: "PATCH",
        body,
      });
      return `Capture ${capture_id} refunded.`;
    },
  });

  tools.cl_update_resource = tool({
    description: "MUTABLE - Update attributes of any Commerce Layer resource.",
    inputSchema: z.object({
      resource_type: z.string().describe("Resource type (e.g. orders, customers, skus)"),
      id: z.string().describe("Resource ID"),
      attributes: z.record(z.unknown()).describe("Attributes to update"),
    }),
    execute: async ({ resource_type, id, attributes }) => {
      const body = { data: { type: resource_type, id, attributes } };
      const ctx = withCommand(
        await fetchResourceContext(account, resource_type, id),
        formatCommand("PATCH", `${resource_type}/${id}`, body),
      );
      await requireConfirm(confirmFn, "cl_update_resource", { resource_type, id, attributes }, ctx);
      const res = await clFetch(account, `${resource_type}/${id}`, {
        method: "PATCH",
        body,
      });
      return formatResource(res.data as Record<string, unknown>);
    },
  });

  tools.cl_delete_resource = tool({
    description: "MUTABLE - Delete a Commerce Layer resource. This is irreversible.",
    inputSchema: z.object({
      resource_type: z.string().describe("Resource type"),
      id: z.string().describe("Resource ID to delete"),
    }),
    execute: async ({ resource_type, id }) => {
      const ctx = withCommand(
        await fetchResourceContext(account, resource_type, id),
        formatCommand("DELETE", `${resource_type}/${id}`),
        "This deletion is irreversible and permanently removes the resource.",
      );
      await requireConfirm(confirmFn, "cl_delete_resource", { resource_type, id }, ctx);
      await clFetch(account, `${resource_type}/${id}`, { method: "DELETE" });
      return `Deleted ${resource_type}/${id}`;
    },
  });

  return tools;
}

export const MUTATION_PREFIXES = [
  "cl_cancel_", "cl_place_", "cl_approve_", "cl_archive_",
  "cl_capture_", "cl_refund_", "cl_void_", "cl_update_", "cl_delete_",
  "cl_create_", "cl_ship_",
];

export function isMutatingTool(name: string): boolean {
  return MUTATION_PREFIXES.some((p) => name.startsWith(p));
}
