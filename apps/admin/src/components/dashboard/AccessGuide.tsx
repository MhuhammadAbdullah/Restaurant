"use client";

import Link from "next/link";
import type { IconType } from "react-icons";
import {
  FaBurger,
  FaCashRegister,
  FaChair,
  FaChartPie,
  FaClockRotateLeft,
  FaCommentDots,
  FaEnvelopeOpenText,
  FaFileInvoiceDollar,
  FaGift,
  FaKitchenSet,
  FaMagnifyingGlassChart,
  FaMotorcycle,
  FaPalette,
  FaReceipt,
  FaStore,
  FaTags,
  FaUserShield,
  FaUsers,
} from "react-icons/fa6";
import { hasPermission, type Me } from "../../lib/useMe";

type Guide = { title: string; icon: IconType; href: string; intro: string; can: string[] };

/**
 * Plain-language instructions that follow the permissions the person was actually given: only the areas they can
 * use appear, and each one lists only the actions their permissions allow.
 */
function buildGuide(me: Me): Guide[] {
  const has = (k: string) => hasPermission(me, k);
  const list = (items: [string, string][]) => items.filter(([k]) => has(k)).map(([, text]) => text);
  const out: Guide[] = [];

  if (has("pos.access")) {
    out.push({
      title: "Take orders at the counter (POS)",
      icon: FaCashRegister,
      href: "/pos",
      intro: "Create orders for guests in the restaurant or on the phone and take their payment.",
      can: [
        "Build an order from the menu: dine-in, walk-in, takeaway or delivery",
        "Collect cash or card payment and print the receipt",
        ...list([
          ["pos.discount", "Apply coupons and manual discounts"],
          ["pos.void", "Remove items from an open order"],
          ["pos.refund", "Cancel or refund a POS order"],
        ]),
      ],
    });
  }
  if (has("kitchen.access")) {
    out.push({
      title: "Work the Kitchen Board",
      icon: FaKitchenSet,
      href: "/kitchen",
      intro: "See what needs to be cooked and keep the front desk updated.",
      can: [
        "See new orders as they come in, with items, notes and how long they have waited",
        "Print kitchen tickets",
        ...list([["kitchen.updateStatus", "Move orders along: Start Preparing, Mark Ready, then Complete"]]),
        ...(has("kitchen.updateStatus") ? [] : ["View only: ask an admin for \"Update kitchen order status\" to be able to change an order's stage"]),
      ],
    });
  }
  if (has("orders.view")) {
    out.push({
      title: "Orders",
      icon: FaReceipt,
      href: "/orders",
      intro: "Look up any order from the website or the counter.",
      can: [
        "Search and filter orders, and open one to see the items, customer and payment",
        "Print the customer receipt",
        ...list([
          ["orders.edit", "Change an order's status and edit its details"],
          ["orders.cancel", "Cancel orders"],
          ["orders.refund", "Refund orders"],
          ["orders.transfer", "Transfer an order to another branch"],
          ["orders.export", "Download orders as a spreadsheet"],
        ]),
      ],
    });
  }
  if (has("tables.view")) {
    out.push({
      title: "Tables",
      icon: FaChair,
      href: "/tables",
      intro: "Keep an eye on the dining room.",
      can: ["See which tables are free, occupied or reserved", ...list([["tables.create", "Add tables"], ["tables.edit", "Change table details and status"], ["tables.delete", "Remove tables"]])],
    });
  }
  if (has("riders.view")) {
    out.push({
      title: "Riders",
      icon: FaMotorcycle,
      href: "/riders",
      intro: "Manage delivery riders and their cash.",
      can: ["See your riders and their deliveries", ...list([["riders.assign", "Assign orders to riders"]])],
    });
  }
  if (has("customers.view")) {
    out.push({
      title: "Customers",
      icon: FaUsers,
      href: "/customers",
      intro: "Look up the people who order from you.",
      can: ["Search customers and see their orders", ...list([["customers.edit", "Add or correct a customer's email"], ["customers.block", "Block or unblock a customer"], ["customers.export", "Download the customer list"]])],
    });
  }
  if (has("complaints.view")) {
    out.push({
      title: "Complaints",
      icon: FaCommentDots,
      href: "/complaints",
      intro: "Follow up on customer feedback.",
      can: ["Read complaints, with photos and order details", ...list([["complaints.reply", "Reply to the customer (and email the reply)"], ["complaints.assign", "Assign a complaint to a team member"], ["complaints.resolve", "Change a complaint's status: resolve or close it"]])],
    });
  }
  if (has("products.view") || has("categories.view") || has("deals.view") || has("coupons.view")) {
    const menuHref = has("products.view") ? "/products" : has("categories.view") ? "/categories" : has("deals.view") ? "/deals" : "/coupons";
    out.push({
      title: "Menu & offers",
      icon: has("deals.view") && !has("products.view") ? FaTags : FaBurger,
      href: menuHref,
      intro: "Look after what customers can order.",
      can: [
        ...list([
          ["products.view", "See products"],
          ["categories.view", "See categories"],
          ["deals.view", "See deals"],
          ["coupons.view", "See coupons"],
          ["products.create", "Add products"],
          ["products.edit", "Edit products, prices and availability"],
          ["deals.edit", "Edit deals"],
          ["coupons.create", "Create coupons"],
        ]),
      ],
    });
  }
  if (has("reports.view")) {
    out.push({
      title: "Reports",
      icon: FaFileInvoiceDollar,
      href: "/reports/finance",
      intro: "Sales and money in one place.",
      can: ["See sales, tips, payments and the order statement", ...list([["reports.export", "Download reports as Excel or PDF"]])],
    });
  }
  if (has("branches.view")) {
    out.push({ title: "Branches", icon: FaStore, href: "/branches", intro: "Branch details and delivery areas.", can: ["See branch details and delivery coverage", ...list([["branches.edit", "Edit branch details, hours and delivery"], ["branches.create", "Add a new branch"]])] });
  }
  if (has("staff.view")) {
    out.push({ title: "Staff & Access", icon: FaUserShield, href: "/staff", intro: "Your team.", can: ["See team members and their roles", ...list([["staff.create", "Add team members"], ["staff.edit", "Edit team members and reset passwords"], ["permissions.manage", "Decide what each person can access"], ["staff.delete", "Remove team members"]])] });
  }
  if (has("auditLogs.view")) {
    out.push({ title: "Audit log", icon: FaClockRotateLeft, href: "/audit-logs", intro: "Who did what.", can: ["Browse the record of important actions, day by day"] });
  }
  if (has("settings.view") || has("cms.view")) {
    out.push({
      title: "Website & settings",
      icon: FaPalette,
      href: has("settings.view") ? "/settings/header" : "/settings/banners",
      intro: "How your website and receipts look.",
      can: ["See website, receipt and loyalty settings", ...list([["settings.manage", "Change them: header, footer, legal pages, receipts, loyalty and the login picture"]])],
    });
  }
  if (has("seo.view")) {
    out.push({
      title: "SEO & Marketing",
      icon: FaMagnifyingGlassChart,
      href: "/seo",
      intro: "Be found on Google.",
      can: ["See page titles, tracking pixels, robots, redirects and the SEO health check", ...list([["seo.manage", "Change them: meta tags, Google Analytics / Ads / Meta / TikTok pixels, robots.txt and redirects"]])],
    });
  }
  if (has("emails.view") || has("emails.manage") || has("emails.send")) {
    out.push({
      title: "Emails",
      icon: FaEnvelopeOpenText,
      href: has("emails.manage") ? "/emails" : has("emails.send") ? "/emails/compose" : "/emails/log",
      intro: "The emails customers receive.",
      can: [...list([["emails.manage", "Edit the email templates"], ["emails.send", "Write an email to a customer and resend failed ones"], ["emails.view", "See which emails were sent"]])],
    });
  }
  if (has("loyalty.view") || has("loyalty.adjust")) {
    out.push({ title: "Loyalty points", icon: FaGift, href: "/customers", intro: "Customer rewards.", can: [...list([["loyalty.view", "See customers' points"], ["loyalty.adjust", "Add or remove points for a customer"]])] });
  }
  return out;
}

export function AccessGuide({ me }: { me: Me }) {
  const guide = buildGuide(me);

  if (guide.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><FaChartPie size={18} /></span>
        <p className="mt-3 text-sm font-semibold text-neutral-800">Your account is ready, but nothing has been switched on for you yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-neutral-500">An admin decides what each person can use. Ask them to open <b>Staff &amp; Access</b>, choose your name and give you the permissions your job needs. This page will then show what you can do.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900">What you can do</h2>
      <p className="mt-0.5 text-xs text-neutral-500">Based on the access your admin gave you. If something you need is missing, ask them to update your permissions in Staff &amp; Access.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {guide.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.title} className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red"><Icon size={16} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{g.title}</p>
                  <p className="text-xs text-neutral-500">{g.intro}</p>
                </div>
              </div>
              <ul className="mt-3 flex-1 space-y-1.5 text-xs text-neutral-700">
                {g.can.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-red" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
              <Link href={g.href} className="mt-4 inline-flex w-fit items-center rounded-lg border border-neutral-300 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-brand-red hover:text-brand-red">
                Open
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
