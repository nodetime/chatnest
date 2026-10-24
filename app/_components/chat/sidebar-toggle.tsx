import type { ComponentProps } from "react";
import { SidebarLeftIcon } from "@/app/_components/chat/icons";
import { Button } from "@/app/_components/ui/button";
import { type SidebarTrigger, useSidebar } from "@/app/_components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/_components/ui/tooltip";

export function SidebarToggle({
  className,
}: ComponentProps<typeof SidebarTrigger>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={className}
          data-testid="sidebar-toggle-button"
          onClick={toggleSidebar}
          size="icon-sm"
          variant="outline"
        >
          <SidebarLeftIcon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" className="hidden md:block">
        Toggle Sidebar
      </TooltipContent>
    </Tooltip>
  );
}
