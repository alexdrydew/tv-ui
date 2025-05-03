import React from 'react';

export function TvAppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-black text-white p-8 overflow-auto">
            {children}
        </div>
    );
}
