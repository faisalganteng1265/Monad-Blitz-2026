"use client";

import React from "react";
import WalletConnectButton from "./WalletConnectButton";

export interface NavbarProps {
  title?: string;
  subtitle?: string;
  leftContent?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  showWalletButton?: boolean;
  className?: string;
  variant?: "default" | "transparent" | "gradient";
}

export default function Navbar({
  title,
  subtitle,
  leftContent,
  centerContent,
  rightContent,
  showWalletButton = true,
  className = "",
  variant = "default",
}: NavbarProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case "transparent":
        return "bg-transparent";
      case "gradient":
        return "bg-gradient-to-r from-slate-900 to-slate-800";
      case "default":
      default:
        return "bg-[#0B1017]";
    }
  };

  return (
    <nav
      className={`hidden lg:flex items-center justify-between px-4 py-3 rounded-lg ${getVariantClasses()} ${className}`}
    >
      {/* Left Section */}
      <div className="flex items-center gap-4 flex-1">
        {leftContent ? (
          leftContent
        ) : title ? (
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
          </div>
        ) : null}
      </div>

      {/* Center Section */}
      {centerContent && (
        <div className="flex items-center justify-center flex-1">
          {centerContent}
        </div>
      )}

      {/* Right Section */}
      <div className="flex items-center gap-4 flex-1 justify-end">
        {rightContent ? (
          rightContent
        ) : showWalletButton ? (
          <WalletConnectButton />
        ) : null}
      </div>
    </nav>
  );
}
