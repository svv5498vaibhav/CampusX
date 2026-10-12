import { motion } from 'framer-motion';
import { ArrowRight, Award, Compass, Handshake, Lightbulb, Sprout, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { CampusMapIllustration } from '@/components/landing/CampusMapIllustration';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Badge, Button, Card } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';

// Product direction, presented as a roadmap. None of these are live in Phase 0.
const PILLARS = [
  { icon: UsersRound, title: 'Connect', text: 'Find classmates, seniors and mentors across your campus.' },
  { icon: Lightbulb, title: 'Create', text: 'Share ideas, projects and moments in posts that feel like you.' },
  { icon: Handshake, title: 'Collaborate', text: 'Team up on projects, hackathons and club initiatives.' },
  { icon: Award, title: 'Showcase', text: 'Build a student identity around your skills and achievements.' },
  { icon: Compass, title: 'Discover', text: 'Internships, events and opportunities picked for students.' },
  { icon: Sprout, title: 'Belong', text: 'Join communities for your clubs, batch and interests.' },
];

export default function LandingPage() {
  useDocumentTitle();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="campus-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
          aria-hidden="true"
        />

        <PageContainer
          width="wide"
          spacing="none"
          className="relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-24"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge variant="primary" icon={Sprout}>
              Early build · Foundation phase
            </Badge>

            <h1 className="mt-5 font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl">
              Your whole campus.{' '}
              <span className="text-primary">One digital home.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-ink-muted sm:text-lg">
              CampusX is a student-first space to connect, create, collaborate, show off what you have
              achieved and discover what is next, built around clubs, projects, ideas and the people on
              your campus.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {isAuthenticated ? (
                <Button as={Link} to={ROUTES.HOME} size="lg" rightIcon={ArrowRight}>
                  Enter your campus
                </Button>
              ) : (
                <>
                  <Button as={Link} to={ROUTES.REGISTER} size="lg" rightIcon={ArrowRight}>
                    Join CampusX
                  </Button>
                  <Button as={Link} to={ROUTES.LOGIN} size="lg" variant="outline">
                    I already have an account
                  </Button>
                </>
              )}
            </div>
          </motion.div>

          <CampusMapIllustration className="lg:max-w-lg" />
        </PageContainer>
      </section>

      <section>
        <PageContainer width="wide" spacing="none" className="pb-16 sm:pb-24">
          <SectionHeader
            eyebrow="Roadmap"
            title="What CampusX is growing into"
            description="These spaces are being built phase by phase. None of them are live yet, but the campus is taking shape."
          />

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Card interactive className="h-full">
                  <div className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </PageContainer>
      </section>
    </>
  );
}
