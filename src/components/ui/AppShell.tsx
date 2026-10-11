import React from 'react';

export const AppShell: React.FC<{ sidebar: React.ReactNode; header: React.ReactNode; children: React.ReactNode }> = ({
  sidebar,
  header,
  children,
}) => (
  <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
    {sidebar}
    <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
      {header}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  </div>
);
