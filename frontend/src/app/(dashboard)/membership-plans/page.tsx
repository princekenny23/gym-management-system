import { redirect } from "next/navigation";

export const instant = false;

export default function MembershipPlansPage() {
  redirect("/members");
}
