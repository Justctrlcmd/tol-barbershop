import type { Metadata } from "next";

import { LegalDocument } from "@/app/(legal)/_components/LegalDocument";
import { PrivacyPolicyContent } from "@/app/(legal)/_components/PrivacyPolicyContent";

export const metadata: Metadata = {
  title: "Privacy Policy | TOL Barbershop",
  description: "How TOL Barbershop handles booking and staff-account data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="This policy explains how TOL Barbershop handles personal information submitted through public booking, feedback, and staff administration."
    >
      <PrivacyPolicyContent />
    </LegalDocument>
  );
}
