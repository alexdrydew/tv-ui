import React from "react";

export function TvAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <main className="max-w-[1600px] mx-auto">{children}</main>
    </div>
  );
}
