import { LessonSkeleton } from "@/components/learning/states/LessonSkeleton";

// Shown inside the persistent shell while the next lesson segment loads.
export default function Loading() {
  return <LessonSkeleton />;
}
