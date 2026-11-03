import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{ classNames: { toast: 'font-sans text-sm' } }}
      {...props}
    />
  );
}

export { Toaster };
