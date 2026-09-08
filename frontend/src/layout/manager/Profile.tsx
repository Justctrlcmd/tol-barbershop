"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { InputWithLabel } from "@/components/common/InputWithLabel";
import { PasswordInputWithLabel } from "@/components/common/PasswordInputWithLabel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordForm } from "@/forms/ChangePasswordForm";
import { useRateLimit } from "@/hooks/useRateLimit";
import {
  normalizeEmail,
  sanitizeString,
} from "@/lib/sanitizer";
import {
  changePasswordRequest,
  updateAccountInformationRequest,
} from "@/services/shared/auth.api";
import {
  accountInformationSchema,
  type AccountInformationSchemaFormValues,
  type ChangePasswordSchemaFormValues,
} from "@/validations/user.validation";

export function Profile() {
  const { user, refreshUser } = useAuth();
  const profileRateLimit = useRateLimit({
    maxAttempts: 5,
    cooldownMinutes: 1,
    storageKey: "staff_profile_update_rate_limit",
  });
  const passwordRateLimit = useRateLimit({
    maxAttempts: 5,
    cooldownMinutes: 1,
    storageKey: "staff_password_update_rate_limit",
  });
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AccountInformationSchemaFormValues>({
    resolver: zodResolver(accountInformationSchema),
    defaultValues: {
      fullname: "",
      email: "",
      contact_number: "",
      current_password: "",
    },
  });
  const email = useWatch({ control, name: "email", defaultValue: "" });
  const emailChanged =
    user !== null && normalizeEmail(email) !== normalizeEmail(user.email);

  useEffect(() => {
    if (!user) return;

    reset({
      fullname: sanitizeString(user.fullname),
      email: normalizeEmail(user.email),
      contact_number: user.contact_number ?? "",
      current_password: "",
    });
  }, [reset, user]);

  const updateInformation = async (
    data: AccountInformationSchemaFormValues,
  ) => {
    if (emailChanged && !data.current_password) {
      setError("current_password", {
        message: "Current password is required to change your email",
      });
      return;
    }

    if (!profileRateLimit.attempt()) return;

    try {
      const response = await updateAccountInformationRequest({
        fullname: sanitizeString(data.fullname),
        email: normalizeEmail(data.email),
        ...(user?.role === "manager"
          ? {}
          : { contact_number: data.contact_number }),
        ...(emailChanged
          ? { current_password: data.current_password }
          : {}),
      });

      await refreshUser();
      reset({
        fullname: sanitizeString(response.data.fullname),
        email: normalizeEmail(response.data.email),
        contact_number: response.data.contact_number ?? "",
        current_password: "",
      });
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update profile",
      );
    }
  };

  const updatePassword = async (data: ChangePasswordSchemaFormValues) => {
    if (!passwordRateLimit.attempt()) return false;

    try {
      await changePasswordRequest(data);
      toast.success("Password updated successfully");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update password",
      );
      return false;
    }
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 font-sans sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Profile
          </h1>
          <p className="mt-1 text-gray-500">
            Manage your account details and password.
          </p>
        </div>

        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          <form
            onSubmit={handleSubmit(updateInformation)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Account details
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Changing your email requires your current password.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <InputWithLabel
                  id="fullname"
                  label="Name *"
                  autoComplete="name"
                  maxLength={255}
                  className="h-11"
                  aria-invalid={Boolean(errors.fullname)}
                  {...register("fullname")}
                />
                {errors.fullname && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.fullname.message}
                  </p>
                )}
              </div>

              <div>
                <InputWithLabel
                  id="email"
                  label="Email *"
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  className="h-11"
                  aria-invalid={Boolean(errors.email)}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {user?.role !== "manager" && (
                <div>
                  <InputWithLabel
                    id="contact_number"
                    label="Contact number"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={11}
                    placeholder="09XXXXXXXXX"
                    className="h-11"
                    aria-invalid={Boolean(errors.contact_number)}
                    {...register("contact_number")}
                  />
                  {errors.contact_number && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.contact_number.message}
                    </p>
                  )}
                </div>
              )}

              {emailChanged && (
                <div>
                  <PasswordInputWithLabel
                    id="current_password"
                    label="Current password *"
                    placeholder="Required to change your email"
                    autoComplete="current-password"
                    maxLength={255}
                    className="h-11"
                    aria-invalid={Boolean(errors.current_password)}
                    {...register("current_password")}
                  />
                  {errors.current_password && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.current_password.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-7">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">Password</h2>
              <p className="mt-1 text-sm text-gray-500">
                Use a unique password you do not use elsewhere.
              </p>
            </div>
            <ChangePasswordForm onSubmit={updatePassword} />
          </section>
        </div>
      </div>
    </div>
  );
}
