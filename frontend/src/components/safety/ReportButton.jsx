import { useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportModal } from '@/components/safety/ReportModal';
import { Button } from '@/components/ui';

/**
 * A "Report" button that opens the shared report form. In ⋮ menus use a menu item that opens
 * <ReportModal> instead; both are the same form.
 */
export function ReportButton({ target, label = 'Report', variant = 'ghost', size = 'sm', className, ...props }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} leftIcon={Flag} onClick={() => setOpen(true)} className={className} aria-haspopup="dialog" {...props}>
        {label}
      </Button>
      <ReportModal target={target} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
