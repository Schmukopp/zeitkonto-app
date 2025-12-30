import type React from "react";
import { ui } from "./ui";

type Props = {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
};

export function Section({ title, subtitle, children }: Props) {
  return (
    <div className={`${ui.card} ${ui.cardBody}`}>
      <div className="space-y-1">
        <div className="font-semibold">{title}</div>
        {subtitle ? <div className={ui.subtitle}>{subtitle}</div> : null}
      </div>
      <div className="pt-2">{children}</div>
    </div>
  );
}
