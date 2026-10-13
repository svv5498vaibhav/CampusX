import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui';
import { conversationPath } from '@/constants/routes';
import { useMessageStore } from '@/store/messageStore';
import { toast } from '@/store/toastStore';

/**
 * Opens the one conversation the signed-in student has with this student (the server creates it the first
 * time, and checks blocks and account status) and goes to it. Messaging never follows anyone.
 */
export function MessageButton({ userId, name = 'this student', size = 'md', variant = 'outline', className }) {
  const navigate = useNavigate();
  const openWithStudent = useMessageStore((state) => state.openWithStudent);
  const [opening, setOpening] = useState(false);

  const onClick = async () => {
    if (opening) return;
    setOpening(true);
    try {
      navigate(conversationPath(await openWithStudent(userId)));
    } catch (error) {
      toast.error(error?.message || `We couldn't open your conversation with ${name}. Please try again.`);
      setOpening(false);
    }
  };

  return (
    <Button variant={variant} size={size} leftIcon={MessageCircle} loading={opening} onClick={onClick} className={className}>
      Message
      <span className="sr-only"> {name}</span>
    </Button>
  );
}
