import Form from "next/form";

import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  error,
  passwordAutoComplete = "current-password",
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  error?: string;
  passwordAutoComplete?: "current-password" | "new-password";
}) {
  return (
    <Form action={action} className="flex flex-col gap-4 pt-6">
      {!!error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label className="font-normal text-muted-foreground" htmlFor="email">
          邮箱
        </Label>
        <Input
          autoComplete="email"
          className="h-10 rounded-lg border-border/50 bg-muted/50 text-sm transition-colors focus:border-foreground/20 focus:bg-muted"
          defaultValue={defaultEmail}
          id="email"
          name="email"
          placeholder="请输入邮箱"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="font-normal text-muted-foreground" htmlFor="password">
          密码
        </Label>
        <Input
          autoComplete={passwordAutoComplete}
          className="h-10 rounded-lg border-border/50 bg-muted/50 text-sm transition-colors focus:border-foreground/20 focus:bg-muted"
          id="password"
          minLength={6}
          name="password"
          placeholder={
            passwordAutoComplete === "new-password" ? "至少 6 位" : "请输入密码"
          }
          required
          type="password"
        />
      </div>

      {children}
    </Form>
  );
}
