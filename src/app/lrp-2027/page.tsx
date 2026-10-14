import { redirect } from "next/navigation";

/** 2027 Planning has no landing page; the group opens on the Capacity Plan. */
export default function Lrp2027Page() {
  redirect("/lrp-2027/capacity");
}
