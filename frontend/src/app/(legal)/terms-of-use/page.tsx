import type { Metadata } from "next";

import { LegalDocument } from "@/app/(legal)/_components/LegalDocument";
import { TermsOfUseContent } from "@/app/(legal)/_components/TermsOfUseContent";

export const metadata: Metadata = {
  title: "Terms of Use | TOL Barbershop",
  description: "Terms for public booking, email updates, and feedback.",
};

export default function TermsOfUsePage() {
  return (
    <LegalDocument
      title="Terms of Use"
      summary="These terms apply to TOL Barbershop public booking, email updates, feedback, and website use."
    >
      <TermsOfUseContent />
    </LegalDocument>
  );
}
