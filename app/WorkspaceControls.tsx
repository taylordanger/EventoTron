"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FolderOpen } from "lucide-react";

export function WorkspaceButton({ icon: Icon, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon }) {
  return <button type="button" {...props} className={`workspace-command ${className}`}><Icon size={16} aria-hidden="true" /><span>{children}</span></button>;
}

export function WorkspaceFiles({ children }: { children: ReactNode }) {
  return <details className="workspace-files"><summary><FolderOpen size={16} aria-hidden="true" />Files</summary><div className="workspace-files-menu">{children}</div></details>;
}
