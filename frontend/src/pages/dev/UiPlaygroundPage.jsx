import { useState } from 'react';
import { ArrowRight, Award, Mail, Plus, Search, Sprout } from 'lucide-react';
import { ApiStatus } from '@/components/common/ApiStatus';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Loader,
  Modal,
  PasswordInput,
  Textarea,
} from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function Showcase({ title, children }) {
  return (
    <Card>
      <h2 className="mb-4 text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">{title}</h2>
      {children}
    </Card>
  );
}

/**
 * Development-only gallery of the design system (registered only when
 * import.meta.env.DEV is true). Names below are labelled samples, not users.
 */
export default function UiPlaygroundPage() {
  useDocumentTitle('UI kit');
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <PageContainer className="stack-section">
      <SectionHeader
        as="h1"
        eyebrow="Developer preview"
        title="CampusX UI kit"
        description="Every reusable component in one place. Toggle the theme to check light and dark."
        action={<ApiStatus />}
      />

      <Showcase title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button rightIcon={ArrowRight}>Primary</Button>
          <Button variant="secondary" leftIcon={Plus}>
            Secondary
          </Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Saving</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" variant="outline" aria-label="Search">
            <Search className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </Showcase>

      <div className="grid gap-6 md:grid-cols-2">
        <Showcase title="Inputs">
          <div className="flex flex-col gap-4">
            <Input label="College email" type="email" placeholder="you@college.edu" leftIcon={Mail} hint="Use your campus email." />
            <Input label="Username" defaultValue="taken-name" error="That username is already taken." />
            <Input label="Disabled" placeholder="Not editable" disabled />
          </div>
        </Showcase>

        <Showcase title="Textarea + password">
          <div className="flex flex-col gap-4">
            <Textarea label="Share an idea" placeholder="What are you building this semester?" required />
            <PasswordInput label="Password" placeholder="Try the show/hide toggle" autoComplete="off" />
          </div>
        </Showcase>
      </div>

      <Showcase title="Alerts">
        <div className="flex flex-col gap-3">
          <Alert variant="danger">Invalid email or password.</Alert>
          <Alert variant="success" title="Saved">Your changes are live.</Alert>
          <Alert variant="info">Please log in to continue.</Alert>
        </div>
      </Showcase>

      <div className="grid gap-6 md:grid-cols-2">
        <Showcase title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge variant="primary" icon={Sprout}>
              Primary
            </Badge>
            <Badge variant="accent" icon={Award}>
              Accent
            </Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Showcase>

        <Showcase title="Avatars (sample names)">
          <div className="flex flex-wrap items-end gap-3">
            <Avatar size="xs" name="Sample Student" />
            <Avatar size="sm" name="Another Sample" />
            <Avatar size="md" name="Demo Person" />
            <Avatar size="lg" name="Placeholder Name" />
            <Avatar size="xl" name="Example" />
            <Avatar size="lg" name="Broken Image" src="/missing-image.png" />
          </div>
        </Showcase>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card interactive>
          <h3 className="font-display text-lg font-bold">Interactive card</h3>
          <p className="mt-1 text-sm text-ink-muted">Lifts gently on hover.</p>
        </Card>
        <Card tone="muted">
          <h3 className="font-display text-lg font-bold">Muted card</h3>
          <p className="mt-1 text-sm text-ink-muted">For secondary groupings.</p>
        </Card>
        <Showcase title="Loader">
          <Loader size="lg" />
        </Showcase>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card padding="none">
          <EmptyState title="Nothing here yet" description="Empty states explain what will appear and how to get started." />
        </Card>
        <Card padding="none">
          <ErrorState onRetry={() => {}} />
        </Card>
      </div>

      <Showcase title="Modal">
        <Button variant="outline" onClick={() => setIsModalOpen(true)}>
          Open modal
        </Button>
        <Modal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="A CampusX dialog"
          description="Bottom sheet on phones, centred card on larger screens."
          footer={
            <>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>Got it</Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-muted">
            Press Escape, click outside, or use the buttons to close. Focus stays inside while open.
          </p>
        </Modal>
      </Showcase>
    </PageContainer>
  );
}
