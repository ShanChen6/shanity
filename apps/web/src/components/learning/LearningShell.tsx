"use client";
import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { Failure } from "@/features/instructor/shared";
import { CurriculumSidebar } from "./CurriculumSidebar";
import { LearningHeader } from "./LearningHeader";
import {
  LearningProvider,
  useLearning,
  useSyllabusQuery,
} from "./learning-context";
import { NotFoundCard } from "./states/NotFoundCard";
import { LearningSkeletonLoader } from "./states/LearningSkeletonLoader";
import { MobileCurriculumSheet } from "./states/MobileCurriculumSheet";

export function LearningShell({
  courseSlug,
  children,
}: {
  courseSlug: string;
  children: ReactNode;
}) {
  // Uses the app-wide QueryClient so progress changes made here also refresh
  // /my-learning and the resume card without a reload.
  return <ShellLoader courseSlug={courseSlug}>{children}</ShellLoader>;
}

function Frame({
  header,
  sidebar,
  children,
}: {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {header}
      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <aside className="hidden w-80 shrink-0 overflow-y-auto overscroll-contain border-r border-border bg-surface lg:block xl:w-96">
            {sidebar}
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function ShellLoader({
  courseSlug,
  children,
}: {
  courseSlug: string;
  children: ReactNode;
}) {
  const query = useSyllabusQuery(courseSlug);
  if (query.isPending) return <LearningSkeletonLoader />;
  if (query.error) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <Frame>
        {notFound ? (
          <NotFoundCard scope="course" />
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
  const { lessonSlug, quizId } = useParams<{
    lessonSlug?: string;
    quizId?: string;
  }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = (onNavigate?: () => void) => (
    <CurriculumSidebar
      courseSlug={learning.courseSlug}
      curriculum={learning.curriculum}
      activeSlug={lessonSlug}
      statusOf={learning.statusOf}
      prerequisiteOf={learning.prerequisiteOf}
      onNavigate={onNavigate}
      quizzesOf={learning.quizzesOf}
      isQuizLocked={learning.isQuizLocked}
      activeQuizId={quizId}
      courseId={learning.syllabus.course.id}
    />
  );
  return (
    <Frame
      header={
        <LearningHeader
          courseTitle={learning.syllabus.course.title}
          courseProgress={learning.courseProgress}
          showProgress={learning.isTracking}
          onOpenMenu={() => setMenuOpen(true)}
        />
      }
      sidebar={sidebar()}
    >
      {children}
      <MobileCurriculumSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        {sidebar(() => setMenuOpen(false))}
      </MobileCurriculumSheet>
    </Frame>
  );
}
