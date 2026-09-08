"use client";

import { useParams } from "next/navigation";

import { CustomerDetail } from "@/layout/manager/CustomerDetail";

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();

  return <CustomerDetail id={params.id} />;
}
