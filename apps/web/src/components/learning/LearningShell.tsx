"use client";
import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sheet } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { Failure } from "@/features/instructor/shared";
import { CurriculumSidebar } from "./CurriculumSidebar";
import { LearningFooter } from "./LearningFooter";
import { LearningHeader } from "./LearningHeader";
import { LearningProvider, useLearning, useSyllabusQuery } from "./learning-context";
import { LearningNotFound } from "./states/LearningNotFound";
import { LessonSkeleton, SidebarSkeleton } from "./states/LessonSkeleton";

export function LearningShell({
  courseSlug,
  children,
}: {
  courseSlug: string;
  children: ReactNode;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ShellLoader courseSlug={courseSlug}>{children}</ShellLoader>
    </QueryClientProvider>
  );
}

function Frame({ header, sidebar, children, footer }: {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {header}
      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-border bg-surface lg:block">
            {sidebar}
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      {footer}
    </div>
  );
}

function ShellLoader({ courseSlug, children }: { courseSlug: string; children: ReactNode }) {
  const query = useSyllabusQuery(courseSlug);
  if (query.isPending)
    return (
      <Frame sidebar={<SidebarSkeleton />}>
        <LessonSkeleton />
      </Frame>
    );
  if (query.error) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Frame>
        {notFound ? (
          <LearningNotFound scope="course" />
        ) : (
          <div className="p-6">
            <Failure error={query.error} retry={() => void query.refetch()} />
          </div>
        )}
      </Frame>
    );
  }
  return (
    <LearningProvider courseSlug={courseSlug} syllabus={query.data}>
      <ShellContent>{children}</ShellContent>
    </LearningProvider>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const learning = useLearning();
  const { lessonSlug } = useParams<{ lessonSlug?: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = (onNavigate?: () => void) => (
    <CurriculumSidebar
      courseSlug={learning.courseSlug}
      curriculum={learning.curriculum}
      activeSlug={lessonSlug}
      completed={learning.completed}
      isLocked={learning.isLocked}
      onNavigate={onNavigate}
    />
  );
  return (
    <Frame
      header={
        <LearningHeader
          courseTitle={learning.syllabus.course.title}
          curriculum={learning.curriculum}
          completed={learning.completed}
          onOpenMenu={() => setMenuOpen(true)}
        />
      }
      sidebar={sidebar()}
      footer={
        lessonSlug ? (
          <LearningFooter
            courseSlug={learning.courseSlug}
            curriculum={learning.curriculum}
            activeSlug={lessonSlug}
            isLocked={learning.isLocked}
          />
        ) : undefined
      }
    >
      {children}
      {menuOpen && (
        <Sheet side="left" title="Giáo trình" onClose={() => setMenuOpen(false)}>
          {sidebar(() => setMenuOpen(false))}
        </Sheet>
      )}
    </Frame>
  );
}
