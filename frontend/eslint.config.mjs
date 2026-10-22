import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React Hooks 7.1 newly reports these diagnostics in code that passed 7.0.1.
  // Keep them visible while preserving runtime behavior for this Next.js upgrade.
  {
    files: [
      "src/app/feedback/page.tsx",
      "src/components/common/AppointmentAddOnDialog.tsx",
      "src/components/common/NotificationPrompt.tsx",
      "src/forms/NewAppointmentForm.tsx",
      "src/hooks/useAppointmentHistory.ts",
      "src/layout/manager/Admin.tsx",
      "src/layout/manager/Appointment.tsx",
      "src/layout/manager/CustomerDirectory.tsx",
      "src/layout/manager/FeedbackList.tsx",
      "src/layout/manager/Gallery.tsx",
      "src/layout/manager/Overview.tsx",
      "src/layout/manager/ReportsAnalytics.tsx",
      "src/layout/manager/Slots.tsx",
      "src/layout/manager/Walkin.tsx",
    ],
    rules: {
      // Existing data-loading, form-restoration, and state-synchronization effects.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["src/forms/NewAppointmentForm.tsx"],
    rules: {
      // Existing Date.now() initialization for the booking verification countdown.
      "react-hooks/purity": "warn",
    },
  },
  {
    files: ["src/layout/manager/Appointment.tsx"],
    rules: {
      // Existing confirmed and past-due group rendering flagged by ref analysis.
      "react-hooks/refs": "warn",
    },
  },
  {
    files: [
      "src/layout/manager/Barber.tsx",
      "src/layout/manager/Service.tsx",
    ],
    rules: {
      // Existing effects reference loaders declared later, before effects execute.
      "react-hooks/immutability": "warn",
    },
  },
  {
    files: ["src/layout/manager/CustomerDirectory.tsx"],
    rules: {
      // Existing stateless SortableHeader is declared within the directory component.
      "react-hooks/static-components": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
