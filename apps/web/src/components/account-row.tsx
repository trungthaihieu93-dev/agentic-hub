import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, MoreHorizontal, Trash2 } from 'lucide-react';
import type { AccountDto } from '@agentic-hub/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDeleteAccount } from '@/lib/queries';

interface AccountRowProps {
  account: AccountDto;
  onSwitch: (account: AccountDto) => void;
}

export function AccountRow({ account, onSwitch }: AccountRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const del = useDeleteAccount();
  const identity = [account.email, account.orgName].filter(Boolean).join(' · ');

  const handleDelete = () => {
    del.mutate(account.id, {
      onSuccess: () => {
        toast.success(`Deleted account "${account.label}"`);
        setConfirmOpen(false);
      },
      onError: (err) => toast.error('Could not delete the account', { description: errorMessage(err) }),
    });
  };

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{account.label}</span>
          {account.isActive && (
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" />
              Active
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {identity || 'No identity recorded'}
          <span className="sr-only">, </span>
          <span className="ml-2">captured {formatDateTime(account.capturedAt)}</span>
        </p>
      </div>
      {!account.isActive && (
        <>
          <Button size="sm" variant="secondary" onClick={() => onSwitch(account)}>
            Switch
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8" aria-label={`More actions for ${account.label}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden="true" />
                Delete account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`Delete "${account.label}"?`}
            description="The saved login for this account is removed from ah. The provider account itself is not affected; you can capture it again later."
            confirmLabel="Delete account"
            pending={del.isPending}
            onConfirm={handleDelete}
          />
        </>
      )}
    </li>
  );
}
