import { Suspense } from "react";

import { CustomerDirectory } from "@/layout/manager/CustomerDirectory";

export default function AdminCustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-gray-500">Loading customers...</div>
      }
    >
      <CustomerDirectory />
    </Suspense>
  );
}
