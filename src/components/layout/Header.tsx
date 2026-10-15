import React from 'react';
import {
  LogOut
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LanguageToggle, useT } from '../../i18n';
import { getFyForDate } from '../../utils/calculations';

interface HeaderProps {
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  const { t: translate } = useT();

  return (
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 no-print">
        {/* Left: Organization context (business name + GST live in the sidebar) */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-wider">
            AL
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-mono">
              FY {getFyForDate(new Date().toISOString())}
            </p>
          </div>
        </div>

        {/* Right: Quick actions & User Switcher */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />

          {/* Logout (owner identity text + badge removed) */}
          <div className="flex items-center gap-2 pl-3 border-l border-border">
            {onLogout && (
              <Button variant="secondary" size="sm" onClick={onLogout} title={translate('header.logoutTitle')}>
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{translate('header.logout')}</span>
              </Button>
            )}
          </div>
        </div>
      </header>
  );
};
