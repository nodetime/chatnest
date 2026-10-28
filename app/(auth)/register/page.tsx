"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useActionState,
  useCallback,
  useEffect,
  useState,
} from "react";
import { AuthForm } from "@/app/_components/chat/auth-form";
import { SubmitButton } from "@/app/_components/chat/submit-button";
import { authPageHref, authReturnPath } from "@/app/_lib/auth-navigation";
import { type RegisterActionState, register } from "../actions";

export default function Page() {
  return (
    <Suspense>
      <AuthPage />
    </Suspense>
  );
}

function AuthPage() {
  const search = useSearchParams();
  const returnTo = authReturnPath(search.get("next"));
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  useEffect(() => {
    if (state.status === "success") {
      setIsSuccessful(true);
      // A full auth-boundary navigation clears guest/user-scoped client caches.
      // The server action has already saved the signed session cookie.
      window.location.replace(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${returnTo}`
      );
    }
  }, [returnTo, state.status]);

  const error =
    state.status === "user_exists"
      ? "这个邮箱已注册，请直接登录。"
      : state.status === "failed"
        ? "注册暂未完成，请重试。"
        : state.status === "invalid_data"
          ? "请填写有效的邮箱，密码至少 6 位。"
          : undefined;

  const handleSubmit = useCallback(
    (formData: FormData) => {
      setEmail(formData.get("email") as string);
      formAction(formData);
    },
    [formAction]
  );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="text-sm text-muted-foreground">Get started for free</p>
      <AuthForm action={handleSubmit} defaultEmail={email} error={error}>
        <SubmitButton isSuccessful={isSuccessful}>Sign up</SubmitButton>
        <p className="text-center text-[13px] text-muted-foreground">
          {"Have an account? "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href={authPageHref("/login", returnTo)}
          >
            Sign in
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
