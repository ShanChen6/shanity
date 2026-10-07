import { redirect } from "next/navigation";

// Short alias for the order history.
export default function OrdersAliasPage() {
  redirect("/account/orders");
}
