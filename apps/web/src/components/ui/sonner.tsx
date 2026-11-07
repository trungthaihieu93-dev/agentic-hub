import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/lib/theme';

function Toaster(props: ToasterProps) {
  const theme = useTheme();

  return (
    <Sonner
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{ classNames: { toast: 'font-sans text-sm' } }}
      {...props}
      theme={theme}
    />
  );
}

export { Toaster };
