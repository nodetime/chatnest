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
import { type LoginActionState, login } from "../actions";

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

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
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
    state.status === "failed"
      ? "邮箱或密码不正确，请重试。"
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
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted-foreground">
        Sign in to your account to continue
      </p>
      <AuthForm action={handleSubmit} defaultEmail={email} error={error}>
        <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
        <p className="text-center text-[13px] text-muted-foreground">
          {"No account? "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href={authPageHref("/register", returnTo)}
          >
            Sign up
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
