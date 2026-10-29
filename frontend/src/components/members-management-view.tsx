"use client";

import { useState } from "react";
import { MembershipPlansView } from "@/components/membership-plans-view";
import { MembershipsView } from "@/components/memberships-view";
import { MembersView } from "@/components/members-view";

const tabs = [
  { id: "members", label: "Members" },
  { id: "memberships", label: "Memberships" },
  { id: "plans", label: "Membership plans" },
] as const;

type MemberTab = (typeof tabs)[number]["id"];

export function MembersManagementView() {
  const [activeTab, setActiveTab] = useState<MemberTab>("members");

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Member management</h2>
        <p className="mt-1 text-sm text-slate-600">Manage member records, assigned memberships, and plans in one place.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200" role="tablist" aria-label="Member management">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`member-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`member-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === tab.id
                ? "border-slate-900 text-slate-950"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`member-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`member-tab-${activeTab}`}
      >
        {activeTab === "members" ? <MembersView /> : null}
        {activeTab === "memberships" ? <MembershipsView /> : null}
        {activeTab === "plans" ? <MembershipPlansView /> : null}
      </div>
    </section>
  );
}
