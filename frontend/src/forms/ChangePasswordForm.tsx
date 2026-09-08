"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SubmitErrorHandler, useForm } from "react-hook-form";
import { toast } from "sonner";

import { PasswordInputWithLabel } from "@/components/common/PasswordInputWithLabel";
import { Button } from "@/components/ui/button";
import {
  changePasswordSchema,
  type ChangePasswordSchemaFormValues,
} from "@/validations/user.validation";

type ChangePasswordFormProps = {
  onSubmit?: (
    payload: ChangePasswordSchemaFormValues,
  ) => Promise<boolean | void> | boolean | void;
}

export function ChangePasswordForm({
  onSubmit,
}: ChangePasswordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ChangePasswordSchemaFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      password: "",
      password_confirmation: "",
    },
  });

  const onFormInvalid: SubmitErrorHandler<ChangePasswordSchemaFormValues> = () => {
    toast.error("All fields are required");
  };

  const onFormSubmit = async (data: ChangePasswordSchemaFormValues) => {
    const successful = await onSubmit?.(data);
    if (successful !== false) reset();
  };

  return (
    <form
      method="post"
      onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
      className="space-y-5"
    >
      <div>
        <PasswordInputWithLabel
          id="password_current_password"
          label="Current password *"
          maxLength={255}
          autoComplete="current-password"
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

      <div>
        <PasswordInputWithLabel
          id="password"
          label="New password *"
          maxLength={255}
          autoComplete="new-password"
          className="h-11"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        {errors.password && (
          <p className="mt-1 text-xs text-red-500">
            {errors.password.message}
          </p>
        )}
      </div>

      <div>
        <PasswordInputWithLabel
          id="password_confirmation"
          label="Confirm new password *"
          maxLength={255}
          autoComplete="new-password"
          className="h-11"
          aria-invalid={Boolean(errors.password_confirmation)}
          {...register("password_confirmation")}
        />
        {errors.password_confirmation && (
          <p className="mt-1 text-xs text-red-500">
            {errors.password_confirmation.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Changing..." : "Change password"}
      </Button>
    </form>
  );
}
