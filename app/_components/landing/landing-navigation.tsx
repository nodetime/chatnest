"use client";

import { ArrowUpRight, Menu } from "lucide-react";
import { BrandMark } from "@/app/_components/brand-mark";
import { Button } from "@/app/_components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/_components/ui/sheet";
import { authPageHref } from "@/app/_lib/auth-navigation";

const links = [
  { href: "#product", label: "产品" },
  { href: "#scenarios", label: "使用场景" },
  { href: "#faq", label: "常见问题" },
];

export function LandingNavigation({
  basePath,
  signedIn,
}: {
  basePath: string;
  signedIn: boolean;
}) {
  const workspace = `${basePath}/chat`;

  return (
    <header className="landing-nav">
      <a
        aria-label="数知探AI 首页"
        className="landing-brand"
        href={`${basePath}/`}
      >
        <BrandMark />
        <span>数知探AI</span>
      </a>
      <nav aria-label="主导航" className="landing-nav__links">
        {links.map((link) => (
          <a href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="landing-nav__actions">
        {!signedIn && (
          <a
            className="landing-login"
            href={`${basePath}${authPageHref("/login", "/chat")}`}
          >
            登录
          </a>
        )}
        <Button asChild className="landing-pill landing-pill--small">
          <a href={workspace}>{signedIn ? "进入工作台" : "开始使用"}</a>
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              aria-label="打开导航菜单"
              className="landing-menu-trigger"
              size="icon"
              variant="ghost"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent className="landing-menu" side="right">
            <SheetHeader>
              <SheetTitle>数知探AI</SheetTitle>
              <SheetDescription>探索资料，形成答案。</SheetDescription>
            </SheetHeader>
            <nav aria-label="移动导航">
              {links.map((link) => (
                <SheetClose asChild key={link.href}>
                  <a href={link.href}>
                    {link.label}
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </a>
                </SheetClose>
              ))}
            </nav>
            <SheetClose asChild>
              <a className="landing-menu__workspace" href={workspace}>
                进入工作台
              </a>
            </SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
