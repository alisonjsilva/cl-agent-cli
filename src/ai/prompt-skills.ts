import { debugLog } from "../utils/logger.js";

const MAX_ACTIVE_SKILLS = 2;

interface SkillDefinition {
  id: string;
  title: string;
  terms: string[];
  body: string;
}

const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    id: "orders",
    title: "Orders",
    terms: [
      "order", "orders", "pedido", "pedidos", "cart", "checkout",
      "draft", "pending", "placed", "approved", "cancel", "archive",
      "payment_status", "fulfillment_status", "encomenda", "encomendas",
    ],
    body: [
      "STATUS FIELDS — orders have three independent status fields:",
      "  - status: draft → pending → placed → approved → cancelled",
      "  - payment_status: unpaid, authorized, partially_authorized, paid, partially_paid, voided, partially_voided, refunded, partially_refunded, free",
      "  - fulfillment_status: unfulfilled, in_progress, fulfilled, not_required",
      '  "paid"/"paga" → filter by payment_status_eq=paid (NOT status).',
      "",
      "INCLUDES — fetch related data in ONE call to avoid multiple requests:",
      "  Order detail:        include=line_items,shipments,payment_source,billing_address,shipping_address",
      "  Order + customer:    include=customer,billing_address,shipping_address",
      "  Order + payments:    include=payment_source,authorizations",
      "  Order + fulfillment: include=shipments,shipments.shipping_method,shipments.stock_location",
      "  Order + line items:  include=line_items,line_items.item",
      "",
      "KEY RELATIONSHIPS on orders:",
      "  customer, market, billing_address, shipping_address, payment_method, payment_source,",
      "  line_items, shipments, authorizations, captures, voids, refunds, returns, tags, attachments",
      "",
      "STRATEGY:",
      "  - For order summary: include=line_items,billing_address (gets items + who ordered in 1 call)",
      "  - For latest order: sort=-created_at, page_size=1",
      "  - For order detail view: include=line_items,shipments,payment_source,billing_address,shipping_address",
      "  - Before mutations, always resolve the order ID from a read call if not provided.",
    ].join("\n"),
  },
  {
    id: "payments",
    title: "Payments",
    terms: [
      "payment", "payments", "pagamento", "pagamentos", "authorization",
      "authorizations", "capture", "captures", "refund", "refunds",
      "transaction", "transactions", "gateway", "payment method",
      "payment source", "paid", "unpaid", "authorized", "void", "voids",
    ],
    body: [
      "PAYMENT LIFECYCLE: authorization → capture → (optional) refund/void",
      "  - authorize: creates an authorization resource",
      "  - capture: PATCH authorization with _capture=true → creates a capture",
      "  - refund: PATCH capture with _refund=true → creates a refund",
      "  - void: PATCH authorization with _void=true → creates a void",
      "",
      "TOOLS: cl_capture_payment needs authorization_id. cl_refund_capture needs capture_id.",
      "",
      "INCLUDES for payment investigation:",
      "  Order → payment:  include=payment_source,payment_method,authorizations",
      "  Order → full payment chain: include=authorizations,captures,refunds,voids",
      "  Authorization:     include=order,captures,voids",
      "  Capture:           include=order,refunds",
      "",
      "KEY RELATIONSHIPS:",
      "  orders → payment_method, payment_source, authorizations, captures, voids, refunds",
      "  authorizations → order, captures, voids",
      "  captures → order, refunds, reference_authorization",
      "",
      "STRATEGY:",
      "  - To understand payment state: GET order include=authorizations,captures,refunds,voids",
      "  - Do NOT infer capture from order placement; verify payment resources.",
      "  - When payment failed: read order include=payment_source,authorizations to see error details.",
    ].join("\n"),
  },
  {
    id: "customers",
    title: "Customers",
    terms: [
      "customer", "customers", "cliente", "clientes", "email", "emails",
      "address", "addresses", "wallet", "subscription", "subscriptions",
      "customer group", "payment source", "endereco",
    ],
    body: [
      "INCLUDES for customer views:",
      "  Customer detail:    include=customer_addresses,customer_payment_sources,customer_subscriptions",
      "  Customer + orders:  include=orders  (careful: can be large; prefer filtering orders by email instead)",
      "  Customer + groups:  include=customer_group",
      "",
      "KEY RELATIONSHIPS on customers:",
      "  orders, customer_addresses, customer_payment_sources, customer_subscriptions, customer_group,",
      "  returns, tags, attachments",
      "",
      "STRATEGY:",
      "  - Always locate customers by email first (cl_search_customers).",
      "  - For 'customer orders': search orders filtered by customer_email_cont instead of include=orders.",
      "  - For customer addresses: include=customer_addresses on the customer, or list customer_addresses filtered by customer_id.",
      "  - Separate customer identity from billing/shipping addresses and from payment sources.",
    ].join("\n"),
  },
  {
    id: "catalog",
    title: "Catalog And Inventory",
    terms: [
      "sku", "skus", "catalog", "catalogo", "inventory", "estoque",
      "stock", "availability", "price", "prices", "price list",
      "market", "markets", "promotion", "promotions", "coupon",
      "gift card", "import", "export", "produto", "produtos",
    ],
    body: [
      "INCLUDES for catalog/inventory:",
      "  SKU detail:         include=prices,stock_items,stock_items.stock_location",
      "  SKU + availability: include=stock_items (check quantity field)",
      "  SKU + pricing:      include=prices,prices.price_list",
      "  Price detail:       include=sku,price_list,price_tiers",
      "  Market detail:      include=price_list,inventory_model,merchant,customer_group",
      "  Stock location:     include=stock_items",
      "",
      "KEY RELATIONSHIPS:",
      "  skus → prices, stock_items, sku_options, shipping_category, tags, attachments",
      "  prices → sku, price_list, price_tiers",
      "  markets → price_list, inventory_model, merchant, customer_group, tax_calculator, geocoder",
      "  stock_items → sku, stock_location, reserved_stocks",
      "",
      "STRATEGY:",
      "  - For stock check: GET skus/{id} include=stock_items (returns quantity per location)",
      "  - For price check: GET skus/{id} include=prices (returns prices across all price lists)",
      "  - For full catalog view: search SKUs then include=prices,stock_items",
      "  - Use cl_search_skus for code/name lookup. Use cl_list_resources for prices, stock, markets.",
    ].join("\n"),
  },
  {
    id: "fulfillment",
    title: "Fulfillment And Returns",
    terms: [
      "shipment", "shipments", "shipping", "delivery", "return", "returns",
      "devolucao", "devolucoes", "package", "packages", "parcel", "parcels",
      "pickup", "pickups", "fulfillment", "fulfilment", "envio", "entrega",
    ],
    body: [
      "SHIPMENT LIFECYCLE: draft → upcoming → cancelled / picking → packing → ready_to_ship → on_hold / shipped → delivered",
      "",
      "INCLUDES for fulfillment:",
      "  Order fulfillment:  include=shipments,shipments.shipping_method,shipments.stock_location",
      "  Shipment detail:    include=shipping_method,stock_location,parcels,line_items",
      "  Shipment parcels:   include=parcels,parcels.parcel_line_items",
      "  Return detail:      include=order,return_line_items,stock_location,destination_address",
      "",
      "KEY RELATIONSHIPS:",
      "  orders → shipments, returns",
      "  shipments → order, shipping_method, stock_location, parcels, line_items, stock_line_items",
      "  returns → order, return_line_items, stock_location, customer, destination_address",
      "  parcels → shipment, parcel_line_items, package",
      "",
      "STRATEGY:",
      "  - For shipping status: GET order include=shipments,shipments.shipping_method",
      "  - For return request: GET order include=returns,returns.return_line_items",
      "  - Keep shipment/return states separate from order status and payment status.",
    ].join("\n"),
  },
  {
    id: "provisioning",
    title: "Provisioning",
    terms: [
      "provisioning", "organization", "organizations", "membership",
      "memberships", "role", "roles", "permission", "permissions",
      "identity provider", "api credential", "dashboard", "organizacao",
    ],
    body: [
      "The Provisioning API is SEPARATE from the Core API. It uses a different base URL and auth flow.",
      "Resources: organizations, memberships, membership_profiles, roles, permissions, api_credentials, application_memberships, identity_providers, user.",
      "",
      "Auth: client_credentials grant against https://auth.commercelayer.io/oauth/token with a provisioning API client_id/client_secret.",
      "",
      "INCLUDES for provisioning:",
      "  Organization:       include=memberships,roles,api_credentials",
      "  Membership:         include=organization,membership_profile,role",
      "  Role:               include=organization,permissions",
      "",
      "NOTE: The current agent tools only operate against the Core API.",
      "For provisioning reference questions, suggest using the CL Dashboard or Provisioning SDK.",
    ].join("\n"),
  },
];

function normalizeInput(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(normalizedInput: string, term: string): boolean {
  if (term.includes(" ") || term.includes("_") || term.includes("-")) {
    return normalizedInput.includes(term);
  }
  const paddedInput = ` ${normalizedInput} `;
  return paddedInput.includes(` ${term} `);
}

function scoreSkill(normalizedInput: string, skill: SkillDefinition): number {
  return skill.terms.reduce(
    (score, term) => score + (containsTerm(normalizedInput, term) ? 1 : 0),
    0,
  );
}

export function buildSkillContext(userInput: string): string | undefined {
  const normalizedInput = normalizeInput(userInput);
  if (!normalizedInput) {
    return undefined;
  }

  const matches = SKILL_DEFINITIONS
    .map((skill) => ({ skill, score: scoreSkill(normalizedInput, skill) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.skill.title.localeCompare(right.skill.title);
    })
    .slice(0, MAX_ACTIVE_SKILLS)
    .map((match) => match.skill);

  if (matches.length === 0) {
    debugLog("info", "Prompt skills: none");
    return undefined;
  }

  debugLog(
    "info",
    `Prompt skills: ${matches.map((skill) => skill.id).join(", ")}`,
  );

  return [
    "═══ ACTIVE CL DOMAIN PLAYBOOKS ═══",
    "Use the playbooks below for this turn. They contain relationship maps, recommended includes, and strategies grounded in CL docs. Use `include` aggressively to avoid multiple API calls.",
    ...matches.map((skill) => `[${skill.title}]\n${skill.body}`),
  ].join("\n\n");
}
