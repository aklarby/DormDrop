import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Free items on DormDrop",
  description:
    "Browse free items from students on your campus. Moving-out finds, giveaways, and zero-dollar listings.",
  alternates: { canonical: "/free" },
};

export default function FreeLandingPage() {
  redirect("/browse?category=free&sort=newest");
}
