import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setTheme, useTheme } from '@/lib/theme';

export function ThemeToggle() {
  const theme = useTheme();

  return (
    <div role="group" aria-label="Appearance" className="flex gap-1">
      <Button
        type="button"
        variant={theme === 'light' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-11"
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
      >
        <Sun aria-hidden="true" />
        Light
      </Button>
      <Button
        type="button"
        variant={theme === 'dark' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-11"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
      >
        <Moon aria-hidden="true" />
        Dark
      </Button>
    </div>
  );
}
